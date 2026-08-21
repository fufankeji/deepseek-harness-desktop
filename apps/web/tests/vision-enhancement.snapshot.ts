/** Assembled keyless snapshot for Bailian image augmentation and restart reuse. */

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it, vi } from 'vitest'
import type { AgentHandle } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-agent-presets'
import type { Context } from '@deepseek-ai/cordis'
import { scrubRequestHeaders, normalizeSessionLog } from '@deepseek-ai/dsh-acp-snapshot'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import { RpcId } from '@deepseek-ai/dsh-host-apiproxy'
import {
  assertFixtureInventory,
  launchWebScaffold,
  seedSession,
  type WebScaffold,
} from './scaffold.ts'

const SNAPSHOT_DIR = fileURLToPath(new URL('./snapshots/vision-enhancement', import.meta.url))
const FIRST_REPLAY = join(SNAPSHOT_DIR, 'first-replay.jsonl')
const RESUME_REPLAY = join(SNAPSHOT_DIR, 'resume-replay.jsonl')
const FIRST_EXPECTED = join(SNAPSHOT_DIR, 'first.expected.jsonl')
const RESUME_EXPECTED = join(SNAPSHOT_DIR, 'resume.expected.jsonl')
const DEFAULT_IMAGE = fileURLToPath(new URL('../public/dsh-desktop/default-background.webp', import.meta.url))
const SESSION_ID = SessionId('vision-enhancement-snapshot')
const IMAGE_PROMPT = '请告诉我这张图片的主体是什么。'
const OBSERVATION = '一只拥有蓝色眼睛的白色长毛猫，背景是梦幻的蓝天、云朵和气泡。'

let harnessRoot: string | undefined
const originalDesktop = process.env.DSH_DESKTOP
const originalDashscope = process.env.DASHSCOPE_API_KEY

afterAll(async () => {
  vi.unstubAllGlobals()
  if (originalDesktop === undefined) Reflect.deleteProperty(process.env, 'DSH_DESKTOP')
  else process.env.DSH_DESKTOP = originalDesktop
  if (originalDashscope === undefined) Reflect.deleteProperty(process.env, 'DASHSCOPE_API_KEY')
  else process.env.DASHSCOPE_API_KEY = originalDashscope
  if (harnessRoot !== undefined) await rm(harnessRoot, { recursive: true, force: true })
})

function expectOk<T>(response: { result: { ok: true; value: T } | { ok: false; error: { message: string } } }): T {
  if (!response.result.ok) throw new Error(response.result.error.message)
  return response.result.value
}

async function createMinimalAgent(scaffold: WebScaffold, resume: boolean): Promise<AgentHandle> {
  const setup = (agentCtx: Context) =>
    scaffold.ctx.agentPresets.mount(agentCtx, 'minimal').then(() => undefined)
  return resume
    ? scaffold.ctx.agents.resume({
      resumeSessionId: SESSION_ID,
      agentOptions: { provider: 'deepseek-official', model: 'deepseek-v4-flash' },
      setup,
    })
    : scaffold.ctx.agents.create({
      sessionId: SESSION_ID,
      meta: { cwd: scaffold.workspaceCwd, agentPreset: 'minimal' },
      agentOptions: { provider: 'deepseek-official', model: 'deepseek-v4-flash' },
      setup,
    })
}

async function normalizedRaw(scaffold: WebScaffold): Promise<{ raw: string; normalized: string }> {
  const agent = scaffold.ctx.agents.get(SESSION_ID)
  if (agent === undefined) throw new Error('vision snapshot agent missing')
  await scaffold.ctx.sessions.flush(agent.session)
  const artifact = await scaffold.ctx.sessionPersistence.readRaw(SESSION_ID)
  if (artifact === undefined) throw new Error('vision snapshot persistence artifact missing')
  return {
    raw: artifact.content,
    normalized: scrubRequestHeaders(normalizeSessionLog(artifact.content, {
      sessionIds: [SESSION_ID], cwd: scaffold.workspaceCwd,
    })),
  }
}

async function compareOrRefresh(path: string, actual: string, mode: WebScaffold['mode']): Promise<void> {
  if (mode === 'refresh') {
    await writeFile(path, actual)
    return
  }
  expect(actual).toBe(await readFile(path, 'utf8'))
}

describe('assembled Bailian vision enhancement', () => {
  it('logs the image observation before DeepSeek and reuses it after a Host restart', async () => {
    process.env.DSH_DESKTOP = '1'
    Reflect.deleteProperty(process.env, 'DASHSCOPE_API_KEY')
    harnessRoot = await mkdtemp(join(tmpdir(), 'dsh-vision-snapshot-home-'))
    await mkdir(harnessRoot, { recursive: true })
    const image = new Uint8Array(await readFile(DEFAULT_IMAGE))
    let bailianCalls = 0
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      if (url !== 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions') {
        throw new Error(`unexpected snapshot network request: ${url}`)
      }
      bailianCalls++
      return new Response(JSON.stringify({ choices: [{ message: { content: OBSERVATION } }] }), {
        status: 200, headers: { 'content-type': 'application/json' },
      })
    }))

    const first = await launchWebScaffold({ harnessHome: harnessRoot, replayFixture: FIRST_REPLAY })
    let firstAgent: AgentHandle | undefined
    let firstRaw = ''
    let firstCompleted = false
    try {
      expect(first.ctx.attachments.imageLimits.maxImageBytes).toBe(20 * 1024 * 1024)
      expectOk(await first.ctx.apiProxy.vision.enable({
        rpcId: RpcId('vision-enable-snapshot'),
        payload: {
          apiKey: 'snapshot-bailian-key',
          mediaType: 'image/webp',
          data: Buffer.from(image).toString('base64'),
          name: 'default-cat.webp',
          question: '请识别默认验证图。',
        },
      }))
      expect(expectOk(await first.ctx.apiProxy.vision.route({
        rpcId: RpcId('vision-route-snapshot'),
        payload: { modelProvider: 'deepseek-official', model: 'deepseek-v4-flash' },
      }))).toMatchObject({ mode: 'compatible', provider: 'bailian', visionModel: 'qwen3.8-max' })
      const attachment = await first.ctx.attachments.saveImage({
        data: image, mediaType: 'image/webp', name: 'default-cat.webp',
      })
      firstAgent = await createMinimalAgent(first, false)
      firstAgent.agent.followup(createUserMessage({
        content: [{ type: 'text', text: IMAGE_PROMPT }, { type: 'image', attachment }],
        source: { kind: 'user' },
      }))
      await firstAgent.agent.whenIdle()

      const observationIndex = firstAgent.agent.session.events.findIndex(event => event.type === 'vision/observation')
      const assistantIndex = firstAgent.agent.session.events.findIndex(event => event.type === 'assistant/message')
      expect(observationIndex).toBeGreaterThan(-1)
      expect(observationIndex).toBeLessThan(assistantIndex)
      expect(firstAgent.agent.session.events[observationIndex]).toMatchObject({
        type: 'vision/observation',
        data: { question: IMAGE_PROMPT, model: 'qwen3.8-max', description: OBSERVATION },
      })
      expect(firstAgent.agent.session.events[assistantIndex]).toMatchObject({
        type: 'assistant/message',
        data: { message: { content: [{ type: 'text', text: '视觉识别完成：主体是一只蓝眼睛的白色长毛猫。' }] } },
      })
      expect(bailianCalls).toBe(2)
      const persisted = await normalizedRaw(first)
      firstRaw = persisted.raw
      await compareOrRefresh(FIRST_EXPECTED, persisted.normalized, first.mode)
      firstCompleted = true
    } finally {
      await firstAgent?.dispose()
      if (firstCompleted) await first.close()
      else {
        await first.ctx.fiber.dispose()
        await rm(first.workspaceCwd, { recursive: true, force: true })
        await rm(first.persistenceRoot, { recursive: true, force: true })
      }
    }

    const restarted = await launchWebScaffold({ harnessHome: harnessRoot, replayFixture: RESUME_REPLAY })
    let resumedAgent: AgentHandle | undefined
    let restartCompleted = false
    try {
      expect(expectOk(await restarted.ctx.apiProxy.vision.status({ rpcId: RpcId('vision-status-after-restart'), payload: {} })))
        .toMatchObject({ enabled: true, configured: true, model: 'qwen3.8-max' })
      await seedSession(restarted, firstRaw, SESSION_ID, 'minimal')
      resumedAgent = await createMinimalAgent(restarted, true)
      resumedAgent.agent.followup(createUserMessage({
        content: [{ type: 'text', text: '请基于上一轮图片观察再确认一次，不要重新识别图片。' }],
        source: { kind: 'user' },
      }))
      await resumedAgent.agent.whenIdle()

      const events = resumedAgent.agent.session.events
      expect(events.filter(event => event.type === 'vision/observation')).toHaveLength(1)
      const assistantMessages = events.filter(event => event.type === 'assistant/message')
      if (assistantMessages.length !== 2) {
        throw new Error(`resumed vision transcript did not settle: ${JSON.stringify(events.slice(-12))}`)
      }
      expect(bailianCalls).toBe(2)
      const persisted = await normalizedRaw(restarted)
      await compareOrRefresh(RESUME_EXPECTED, persisted.normalized, restarted.mode)
      await assertFixtureInventory(SNAPSHOT_DIR, [
        'first-replay.jsonl', 'first.expected.jsonl', 'resume-replay.jsonl', 'resume.expected.jsonl',
      ])
      restartCompleted = true
    } finally {
      await resumedAgent?.dispose()
      if (restartCompleted) await restarted.close()
      else {
        await restarted.ctx.fiber.dispose()
        await rm(restarted.workspaceCwd, { recursive: true, force: true })
        await rm(restarted.persistenceRoot, { recursive: true, force: true })
      }
    }
  })
})
