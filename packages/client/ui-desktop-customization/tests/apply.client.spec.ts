// @vitest-environment jsdom

import { Context } from '@deepseek-ai/cordis'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { createSnapshotStore, SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { resolveSlotLabel } from '@deepseek-ai/dsh-client-ui-slots'
import { describe, expect, it, vi } from 'vitest'
import { apply, inject } from '@deepseek-ai/dsh-client-ui-desktop-customization/client'
import { AppearanceSection } from '../src/client/AppearanceSection.tsx'
import { BrandBadge } from '../src/client/BrandBadge.tsx'
import { validateImageFile } from '../src/client/background-image.ts'
import { UpdateSection } from '../src/client/UpdateSection.tsx'
import { VisionEnhancementRow } from '../src/client/VisionEnhancementRow.tsx'
import {
  VisionEnhancementShortcut, type VisionEnhancementInjected,
} from '../src/client/VisionEnhancementShortcut.tsx'

async function bench() {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const locale = new LocaleRuntime(ctx)
  locale.setLocale('zh')
  ctx.provide('locale', locale)
  const disposeTokens = vi.fn()
  const overrideTokens = vi.fn(() => disposeTokens)
  ctx.provide('theme', { overrideTokens } as never)
  ctx.provide('remote', { $on: () => () => {} } as never)
  ctx.provide('modelDirectories', {
    directoryFor: () => ({
      store: createSnapshotStore({
        current: { provider: 'deepseek-official', model: 'deepseek-v4-flash' },
        routable: true,
        groups: [],
        failures: [],
        status: 'ready',
        error: null,
      }),
      load: () => Promise.resolve({}),
    }),
  } as never)
  ctx.provide('connection', {
    api: {
      vision: {
        status: () => Promise.resolve({ result: { ok: true, value: {
          enabled: false, configured: false, provider: 'bailian', model: 'qwen3.8-max',
          apiKeyUrl: 'https://help.aliyun.com/zh/model-studio/get-api-key',
          providers: [
            { id: 'bailian', name: '阿里云百炼', configured: false, defaultModel: 'qwen3.8-max', apiKeyUrl: 'https://help.aliyun.com/zh/model-studio/get-api-key', modelEditable: false },
            { id: 'openrouter', name: 'OpenRouter', configured: false, defaultModel: 'openai/gpt-4.1-mini', apiKeyUrl: 'https://openrouter.ai/settings/keys', modelEditable: true },
          ],
        } } }),
        route: ({ modelProvider, model }: { modelProvider: string; model: string }) => Promise.resolve({ result: { ok: true, value: { mode: 'off', modelProvider, model } } }),
        activate: ({ modelProvider, model }: { modelProvider: string; model: string }) => Promise.resolve({ result: { ok: true, value: { mode: 'native', modelProvider, model } } }),
        test: () => Promise.resolve({ result: { ok: true, value: { provider: 'bailian', model: 'qwen3.8-max', description: 'fixture image' } } }),
        enable: () => Promise.resolve({ result: { ok: true, value: { provider: 'bailian', model: 'qwen3.8-max', description: 'fixture image' } } }),
      },
    },
  } as never)
  const slots = ctx.get('slots') as SlotRegistry
  slots.register({
    name: 'root',
    children: {
      'settings.section': { kind: 'list', scope: 'root' },
      'settings.general.item': { kind: 'list', scope: 'root' },
      'conversation.input.left': { kind: 'list', scope: 'session' },
      'sidebar.footer.action': { kind: 'list', scope: 'root' },
    },
  } as never, () => null)
  return { ctx, slots, overrideTokens, disposeTokens }
}

describe('Desktop customization client plugin', () => {
  it('registers both settings sections, the shared vision controls, and the sidebar brand action', async () => {
    const b = await bench()
    const fiber = b.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    const sections = b.slots.entries('settings.section')
    expect(sections.map(entry => entry.component)).toEqual([AppearanceSection, UpdateSection])
    expect(sections.map(entry => resolveSlotLabel(entry.options.label))).toEqual(['背景', '软件更新'])
    expect(b.slots.entries('sidebar.footer.action')[0]?.component).toBe(BrandBadge)
    expect(b.slots.entries('settings.general.item')[0]?.component).toBe(VisionEnhancementRow)
    const shortcut = b.slots.entries('conversation.input.left')[0]
    expect(shortcut?.component).toBe(VisionEnhancementShortcut)
    expect(shortcut?.options).toMatchObject({ id: 'vision-enhancement', order: 20 })
    const rowInjected = b.slots.entries('settings.general.item')[0]?.inject?.() as unknown as VisionEnhancementInjected
    const shortcutInjected = shortcut?.inject?.('session-id' as never) as unknown as VisionEnhancementInjected
    expect(shortcutInjected.hooks.visionEnhancement).toBe(rowInjected.hooks.visionEnhancement)
    expect(document.body.getAttribute('data-dsh-desktop-skin')).toBe('active')
    expect(b.overrideTokens).toHaveBeenCalledOnce()
    await fiber.dispose()
    expect(b.slots.entries('settings.section')).toHaveLength(0)
    expect(b.slots.entries('sidebar.footer.action')).toHaveLength(0)
    expect(b.slots.entries('settings.general.item')).toHaveLength(0)
    expect(b.slots.entries('conversation.input.left')).toHaveLength(0)
    expect(document.body.hasAttribute('data-dsh-desktop-skin')).toBe(false)
    expect(b.disposeTokens).toHaveBeenCalledOnce()
  })

  it('declares only the services it uses', () => {
    expect(inject).toEqual(['slots', 'locale', 'theme', 'connection', 'remote', 'modelDirectories'])
  })

  it('accepts the three supported image formats and rejects unsafe inputs', () => {
    expect(validateImageFile(new File(['x'], 'a.png', { type: 'image/png' }))).toBeUndefined()
    expect(validateImageFile(new File(['x'], 'a.jpg', { type: 'image/jpeg' }))).toBeUndefined()
    expect(validateImageFile(new File(['x'], 'a.webp', { type: 'image/webp' }))).toBeUndefined()
    expect(validateImageFile(new File(['x'], 'a.svg', { type: 'image/svg+xml' }))).toContain('PNG')
  })
})
