import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import { AttachmentStore, type ImageAttachmentRef, type SaveImageAttachment, type StoredImageAttachment } from '@deepseek-ai/dsh-attachment'
import {
  CredentialProvider,
  credentialRef,
  type CredentialInfo,
  type CredentialKey,
  type CredentialRecord,
  type CredentialRecordEntry,
  type CredentialRecordInfo,
  type CredentialRef,
  type ResolvedCredential,
} from '@deepseek-ai/dsh-credentials'
import LlmRuntime, { LlmAdapter } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, LlmResolvedModelInfo, StreamChunk } from '@deepseek-ai/dsh-llm'
import SessionStore, { KNOWN_SESSION_EVENT_TYPES, SessionId } from '@deepseek-ai/dsh-session'
import { SettingsProvider, type SettingsNamespace } from '@deepseek-ai/dsh-settings'
import {
  BAILIAN_API_KEY_REF,
  ensureLoggedVisionObservation,
  installVisionEnhancement,
  OPENROUTER_API_KEY_REF,
  OPENROUTER_VISION_MODEL,
  VISION_SETTINGS_NAMESPACE,
} from '../src/vision-enhancement.ts'

const LEGACY_BAILIAN_REF = credentialRef('DASHSCOPE_API_KEY')

class MemorySettings extends SettingsProvider {
  private readonly doc: Record<string, unknown> = {}

  get writable(): boolean { return true }
  protected load(): Promise<Record<string, unknown>> { return Promise.resolve(structuredClone(this.doc)) }
  protected persist(ns: SettingsNamespace, section: Record<string, unknown>): Promise<void> {
    this.doc[ns] = structuredClone(section)
    return Promise.resolve()
  }
}

class MemoryCredentials extends CredentialProvider {
  private readonly values = new Map<string, string>()
  private readonly records = new Map<CredentialKey, CredentialRecord>()

  seed(ref: CredentialRef, value: string): void {
    this.values.set(ref, value)
  }

  resolve(ref: CredentialRef): Promise<ResolvedCredential | undefined> {
    const value = this.values.get(ref)
    return Promise.resolve(value === undefined ? undefined : { value, source: 'memory' })
  }

  describe(ref: CredentialRef): Promise<CredentialInfo> {
    const configured = this.values.has(ref)
    return Promise.resolve({ configured, ...configured ? { source: 'memory' } : {}, writable: true })
  }

  set(ref: CredentialRef, value: string): Promise<void> {
    this.values.set(ref, value)
    this.notifyUpdated(ref)
    return Promise.resolve()
  }

  unset(ref: CredentialRef): Promise<void> {
    this.values.delete(ref)
    this.notifyUpdated(ref)
    return Promise.resolve()
  }

  readRecord(key: CredentialKey): Promise<CredentialRecord | undefined> {
    return Promise.resolve(this.records.get(key))
  }

  describeRecord(key: CredentialKey): Promise<CredentialRecordInfo> {
    const record = this.records.get(key)
    return Promise.resolve(record === undefined
      ? { configured: false, writable: true }
      : { configured: true, kind: record.kind, writable: true })
  }

  listRecords(): Promise<readonly CredentialRecordEntry[]> {
    return Promise.resolve([...this.records].map(([key, record]) => ({ key, kind: record.kind })))
  }

  async modifyRecord(
    key: CredentialKey,
    mutate: (current: CredentialRecord | undefined) => Promise<CredentialRecord | undefined>,
  ): Promise<CredentialRecord | undefined> {
    const current = this.records.get(key)
    const next = await mutate(current)
    if (next === undefined) return current
    this.records.set(key, next)
    this.notifyRecordUpdated(key)
    return next
  }

  deleteRecord(key: CredentialKey): Promise<void> {
    if (this.records.delete(key)) this.notifyRecordUpdated(key)
    return Promise.resolve()
  }
}

class AmbientDashscopeCredentials extends MemoryCredentials {
  override resolve(ref: CredentialRef): Promise<ResolvedCredential | undefined> {
    if (ref === LEGACY_BAILIAN_REF) return Promise.resolve({ value: 'ambient-key', source: 'env' })
    return super.resolve(ref)
  }

  override describe(ref: CredentialRef): Promise<CredentialInfo> {
    if (ref === LEGACY_BAILIAN_REF) return Promise.resolve({ configured: true, source: 'env', writable: false })
    return super.describe(ref)
  }

  override set(ref: CredentialRef, value: string): Promise<void> {
    if (ref === LEGACY_BAILIAN_REF) {
      throw new Error('legacy launch environment must stay read-only')
    }
    return super.set(ref, value)
  }
}

class AcceptingAttachments extends AttachmentStore {
  readonly imageLimits = {
    maxImageBytes: 10 * 1024 * 1024,
    maxImagesPerMessage: 20,
    maxMessageImageBytes: 100 * 1024 * 1024,
    maxImagePixels: 40_000_000,
    maxImageDimension: 2000,
    mediaTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const,
  }

  validateImage(_input: SaveImageAttachment): Promise<void> { return Promise.resolve() }
  saveImage(_input: SaveImageAttachment): Promise<ImageAttachmentRef> { throw new Error('unused') }
  readImage(_ref: ImageAttachmentRef): Promise<StoredImageAttachment> { throw new Error('unused') }
}

class RouteAdapter extends LlmAdapter {
  readonly calls: GenerateOptions[] = []

  constructor(private readonly inputModalities: LlmResolvedModelInfo['inputModalities']) {
    super()
  }

  override resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
    return Promise.resolve({
      provider,
      id: model,
      name: model,
      ...this.inputModalities === undefined ? {} : { inputModalities: this.inputModalities },
    })
  }

  override async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.calls.push(options)
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

async function routeHarness(inputModalities: LlmResolvedModelInfo['inputModalities'], configured = false): Promise<{
  ctx: Context
  adapter: RouteAdapter
  runtime: ReturnType<typeof installVisionEnhancement>
}> {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(MemorySettings)
  await ctx.plugin(MemoryCredentials)
  await ctx.plugin(AcceptingAttachments)
  if (configured) (ctx.credentials as MemoryCredentials).seed(BAILIAN_API_KEY_REF, 'configured-key')
  const adapter = new RouteAdapter(inputModalities)
  ctx.llm.registerAdapter(['route'], adapter)
  return { ctx, adapter, runtime: installVisionEnhancement(ctx) }
}

async function drain(stream: AsyncIterable<StreamChunk>): Promise<void> {
  for await (const _chunk of stream) { /* drain */ }
}

afterEach(() => { vi.unstubAllGlobals() })

describe('automatic visual routing', () => {
  it('suppresses historical images while off, then forwards them once through a native visual model', async () => {
    const { ctx, adapter, runtime } = await routeHarness(['text', 'image'])
    const messages = [{
      role: 'user' as const,
      content: [{
        type: 'image' as const,
        attachment: { attachmentId: 'sha256:cat', mediaType: 'image/png' as const, bytes: 1, width: 1, height: 1 },
      }],
    }]

    try {
      await expect(runtime.route('route', 'vision')).resolves.toEqual({
        mode: 'off', modelProvider: 'route', model: 'vision',
      })
      await drain(ctx.llm.stream({ provider: 'route', model: 'vision', messages: messages as never }))
      expect(adapter.calls).toHaveLength(1)
      expect(adapter.calls[0]?.messages[0]?.content).toEqual([
        { type: 'text', text: '[图片未发送：视觉增强已关闭。]' },
      ])

      await expect(runtime.activate('route', 'vision')).resolves.toEqual({
        mode: 'native', modelProvider: 'route', model: 'vision',
      })
      await drain(ctx.llm.stream({ provider: 'route', model: 'vision', messages: messages as never }))
      expect(adapter.calls).toHaveLength(2)
      expect(adapter.calls[1]?.messages[0]?.content[0]).toMatchObject({ type: 'image' })
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('reports a text-only model as unavailable when no compatible provider is configured', async () => {
    const { ctx, runtime } = await routeHarness(['text'])
    try {
      await expect(runtime.activate('route', 'text')).rejects.toThrow('请先配置并验证兼容视觉提供方')
      // Exercise recovery from an older persisted enabled state that lacks a usable credential.
      await ctx.settings.update(VISION_SETTINGS_NAMESPACE, { enabled: true })
      await expect(runtime.route('route', 'text')).resolves.toEqual({
        mode: 'unavailable', modelProvider: 'route', model: 'text',
      })
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('routes a text-only model through the configured compatible provider', async () => {
    const { ctx, runtime } = await routeHarness(['text'], true)
    try {
      await expect(runtime.activate('route', 'text')).resolves.toEqual({
        mode: 'compatible',
        modelProvider: 'route',
        model: 'text',
        provider: 'bailian',
        providerName: '阿里云百炼',
        visionModel: 'qwen3.8-max',
      })
    } finally {
      await ctx.fiber.dispose()
    }
  })
})

describe('vision observation log contract', () => {
  it('records the exact observation once and reuses it during reconstruction', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    const session = ctx.sessions.create(SessionId('vision-log-test'))
    const analyze = vi.fn(() => Promise.resolve('蓝眼睛的白色小猫。'))

    await expect(ensureLoggedVisionObservation(session, {
      attachmentId: 'sha256:cat', question: '图里是什么？', model: 'qwen3.8-max',
    }, analyze)).resolves.toBe('蓝眼睛的白色小猫。')
    await expect(ensureLoggedVisionObservation(session, {
      attachmentId: 'sha256:cat', question: '图里是什么？', model: 'qwen3.8-max',
    }, () => Promise.reject(new Error('恢复时不应重新请求百炼')))).resolves.toBe('蓝眼睛的白色小猫。')

    expect(analyze).toHaveBeenCalledTimes(1)
    expect(session.events.filter(event => event.type === 'vision/observation')).toHaveLength(1)
    expect(session.events.at(-1)).toMatchObject({
      type: 'vision/observation',
      data: {
        attachmentId: 'sha256:cat',
        question: '图里是什么？',
        model: 'qwen3.8-max',
        description: '蓝眼睛的白色小猫。',
      },
    })
    expect(session.events.at(-1)).not.toHaveProperty('ignorable')
    expect(KNOWN_SESSION_EVENT_TYPES.has('vision/observation')).toBe(true)
  })

  it('serializes concurrent enable requests so a later invalid key cannot race an earlier commit', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    await ctx.plugin(AgentRegistry)
    await ctx.plugin(MemorySettings)
    await ctx.plugin(MemoryCredentials)
    await ctx.plugin(AcceptingAttachments)
    const runtime = installVisionEnhancement(ctx)
    let releaseFirst: (() => void) | undefined
    const firstBlocked = new Promise<void>((resolve) => { releaseFirst = resolve })
    let active = 0
    let maxActive = 0
    const authorizations: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      active++
      maxActive = Math.max(maxActive, active)
      authorizations.push(new Headers(init?.headers).get('authorization') ?? '')
      try {
        if (authorizations.at(-1) === 'Bearer key-a') {
          await firstBlocked
          return new Response(JSON.stringify({ choices: [{ message: { content: '第一张图' } }] }), {
            status: 200, headers: { 'content-type': 'application/json' },
          })
        }
        return new Response(JSON.stringify({ error: { message: 'invalid key' } }), {
          status: 401, headers: { 'content-type': 'application/json' },
        })
      } finally {
        active--
      }
    }))

    try {
      const input = { mediaType: 'image/png' as const, data: 'AA==' }
      const first = runtime.enable({ ...input, apiKey: 'key-a' })
      await vi.waitFor(() => { expect(authorizations).toEqual(['Bearer key-a']) })
      const second = runtime.enable({ ...input, apiKey: 'key-b' })
      await Promise.resolve()
      expect(authorizations).toEqual(['Bearer key-a'])
      releaseFirst?.()

      await expect(first).resolves.toEqual({ provider: 'bailian', model: 'qwen3.8-max', description: '第一张图' })
      await expect(second).rejects.toThrow('invalid key')
      expect(maxActive).toBe(1)
      expect(authorizations).toEqual(['Bearer key-a', 'Bearer key-b'])
      expect(await ctx.credentials.resolve(BAILIAN_API_KEY_REF)).toEqual({ value: 'key-b', source: 'memory' })
      expect(runtime.isEnabled()).toBe(false)
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('stores a Bailian UI key under an app-owned ref even when DASHSCOPE_API_KEY is ambient and read-only', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    await ctx.plugin(AgentRegistry)
    await ctx.plugin(MemorySettings)
    await ctx.plugin(AmbientDashscopeCredentials)
    await ctx.plugin(AcceptingAttachments)
    const runtime = installVisionEnhancement(ctx)
    const authorizations: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      authorizations.push(new Headers(init?.headers).get('authorization') ?? '')
      return new Response(JSON.stringify({ choices: [{ message: { content: '新密钥识别成功' } }] }), {
        status: 200, headers: { 'content-type': 'application/json' },
      })
    }))

    try {
      await expect(runtime.enable({
        mediaType: 'image/png', data: 'AA==', apiKey: 'writable-ui-key',
      })).resolves.toMatchObject({ provider: 'bailian', description: '新密钥识别成功' })
      expect(BAILIAN_API_KEY_REF).toBe('DSH_VISION_BAILIAN_API_KEY')
      expect(authorizations).toEqual(['Bearer writable-ui-key'])
      expect(await ctx.credentials.resolve(BAILIAN_API_KEY_REF))
        .toEqual({ value: 'writable-ui-key', source: 'memory' })
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('validates and persists an OpenRouter visual route with OpenAI-compatible image input', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    await ctx.plugin(AgentRegistry)
    await ctx.plugin(MemorySettings)
    await ctx.plugin(MemoryCredentials)
    await ctx.plugin(AcceptingAttachments)
    const runtime = installVisionEnhancement(ctx)
    let requestedUrl = ''
    let requestedBody: Record<string, unknown> | undefined
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      requestedUrl = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url
      if (typeof init?.body !== 'string') throw new Error('expected a JSON request body')
      requestedBody = JSON.parse(init.body) as Record<string, unknown>
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer openrouter-key')
      return new Response(JSON.stringify({ choices: [{ message: { content: 'OpenRouter 看见了一只猫。' } }] }), {
        status: 200, headers: { 'content-type': 'application/json' },
      })
    }))

    try {
      await expect(runtime.enable({
        provider: 'openrouter', model: OPENROUTER_VISION_MODEL,
        mediaType: 'image/png', data: 'AA==', apiKey: 'openrouter-key',
      })).resolves.toEqual({
        provider: 'openrouter', model: OPENROUTER_VISION_MODEL,
        description: 'OpenRouter 看见了一只猫。',
      })
      expect(requestedUrl).toBe('https://openrouter.ai/api/v1/chat/completions')
      expect(requestedBody).toMatchObject({ model: OPENROUTER_VISION_MODEL, max_tokens: 1024 })
      expect(requestedBody).not.toHaveProperty('enable_thinking')
      const messages = requestedBody?.messages as Array<{
        role: string
        content: Array<{ type: string; text?: unknown; image_url?: { url: string } }>
      }>
      expect(messages).toHaveLength(1)
      expect(messages[0]?.role).toBe('user')
      expect(messages[0]?.content[0]?.type).toBe('text')
      expect(typeof messages[0]?.content[0]?.text).toBe('string')
      expect(messages[0]?.content[1]).toEqual({
        type: 'image_url', image_url: { url: 'data:image/png;base64,AA==' },
      })
      expect(await ctx.credentials.resolve(OPENROUTER_API_KEY_REF))
        .toEqual({ value: 'openrouter-key', source: 'memory' })
      const status = await runtime.status()
      expect(status).toMatchObject({
        enabled: true, configured: true, provider: 'openrouter', model: OPENROUTER_VISION_MODEL,
      })
      expect(status.providers.find(provider => provider.id === 'openrouter')).toMatchObject({
        configured: true, modelEditable: true,
      })
    } finally {
      await ctx.fiber.dispose()
    }
  })
})
