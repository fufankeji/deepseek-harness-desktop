// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { VisionEnhancementController } from '../src/client/vision-enhancement-controller.ts'
import { VisionEnhancementRow } from '../src/client/VisionEnhancementRow.tsx'
import type { VisionEnhancementRowProps } from '../src/client/VisionEnhancementRow.tsx'
import {
  VisionEnhancementShortcut, type VisionEnhancementShortcutProps,
} from '../src/client/VisionEnhancementShortcut.tsx'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

const ready = (enabled = false, configured = false) => ({
  status: 'ready' as const,
  enabled,
  configured,
  provider: 'bailian' as const,
  providers: [
    {
      id: 'bailian' as const, name: '阿里云百炼', configured, defaultModel: 'qwen3.8-max',
      apiKeyUrl: 'https://help.aliyun.com/zh/model-studio/get-api-key', modelEditable: false,
    },
    {
      id: 'openrouter' as const, name: 'OpenRouter', configured: false, defaultModel: 'openai/gpt-4.1-mini',
      apiKeyUrl: 'https://openrouter.ai/settings/keys', modelEditable: true,
    },
  ],
  model: 'qwen3.8-max',
  error: null,
})

function shortcutProps(
  state = ready(),
  overrides: Partial<VisionEnhancementShortcutProps> = {},
): VisionEnhancementShortcutProps {
  return {
    useVisionEnhancement: (select: (value: typeof state) => unknown) => select(state),
    useVisionModelDirectory: (select: (value: {
      current: { provider: string; model: string }
    }) => unknown) => select({ current: { provider: 'deepseek-official', model: 'deepseek-v4-flash-vision-exp' } }),
    load: () => Promise.resolve(),
    loadModelDirectory: () => {},
    disable: () => Promise.resolve(),
    enable: () => Promise.resolve('识别结果'),
    resolveRoute: (modelProvider: string, model: string) => Promise.resolve({ mode: 'off', modelProvider, model }),
    activateRoute: () => Promise.reject(new Error('当前模型不支持原生图片，请先配置并验证兼容视觉提供方。')),
    selectNativeVision: () => Promise.resolve(),
    ...overrides,
  } as never
}

describe('Vision enhancement controller', () => {
  it('shares authoritative status and publishes both disable and verified-enable results', async () => {
    const status = vi.fn(() => Promise.resolve({
      result: { ok: true as const, value: {
        enabled: true, configured: true, provider: 'bailian' as const, model: 'qwen3.8-max',
        apiKeyUrl: 'https://example.test', providers: ready(true, true).providers,
      } },
    }))
    const update = vi.fn(() => Promise.resolve({ result: { ok: true as const, value: {} } }))
    const enable = vi.fn(() => Promise.resolve({
      result: { ok: true as const, value: { provider: 'bailian' as const, model: 'qwen3.8-max', description: '一张界面截图。' } },
    }))
    const controller = new VisionEnhancementController({
      vision: {
        status,
        route: ({ modelProvider, model }: { modelProvider: string; model: string }) => Promise.resolve({ result: { ok: true as const, value: { mode: 'native' as const, modelProvider, model } } }),
        activate: ({ modelProvider, model }: { modelProvider: string; model: string }) => Promise.resolve({ result: { ok: true as const, value: { mode: 'native' as const, modelProvider, model } } }),
        enable,
      },
      settings: { update },
    } as never)

    await controller.ensureLoaded()
    expect(controller.store.getSnapshot()).toMatchObject({ status: 'ready', enabled: true, configured: true })
    await controller.ensureLoaded()
    expect(status).toHaveBeenCalledOnce()

    await controller.disable()
    expect(update).toHaveBeenCalledWith({ ns: 'vision-enhancement', patch: { enabled: false } })
    expect(controller.store.getSnapshot().enabled).toBe(false)

    await expect(controller.enable({ mediaType: 'image/png', data: 'aW1hZ2U=' })).resolves.toBe('一张界面截图。')
    expect(controller.store.getSnapshot()).toMatchObject({ status: 'ready', enabled: true, configured: true })

    await expect(controller.route('deepseek-official', 'deepseek-vision')).resolves.toMatchObject({ mode: 'native' })
    await expect(controller.activate('deepseek-official', 'deepseek-vision')).resolves.toMatchObject({ mode: 'native' })
    expect(controller.store.getSnapshot()).toMatchObject({ status: 'ready', enabled: true })
  })

  it('keeps the last known state and exposes a failed refresh', async () => {
    const controller = new VisionEnhancementController({
      vision: { status: () => Promise.resolve({ result: { ok: false as const, error: { code: 'offline', message: '连接失败', details: {} } } }) },
    } as never)
    await controller.load()
    expect(controller.store.getSnapshot()).toMatchObject({ status: 'error', enabled: false, error: '连接失败' })
  })

  it('defers pushed refreshes until an enable mutation has settled', async () => {
    let finishEnable: ((value: unknown) => void) | undefined
    const status = vi.fn(() => Promise.resolve({
      result: { ok: true as const, value: {
        enabled: true, configured: true, provider: 'bailian' as const, model: 'qwen3.8-max',
        apiKeyUrl: 'https://example.test', providers: ready(true, true).providers,
      } },
    }))
    const enable = vi.fn(() => new Promise((resolve) => { finishEnable = resolve }))
    const controller = new VisionEnhancementController({
      vision: { status, enable },
      settings: { update: vi.fn() },
    } as never)

    const pending = controller.enable({ mediaType: 'image/png', data: 'aW1hZ2U=' })
    controller.refreshIfLoaded()
    expect(controller.store.getSnapshot().status).toBe('saving')
    expect(status).not.toHaveBeenCalled()

    finishEnable?.({
      result: { ok: true as const, value: { provider: 'bailian' as const, model: 'qwen3.8-max', description: '识别完成' } },
    })
    await pending
    await waitFor(() => { expect(status).toHaveBeenCalledOnce() })
    await waitFor(() => {
      expect(controller.store.getSnapshot()).toMatchObject({ status: 'ready', enabled: true, configured: true })
    })
  })
})

describe('Vision enhancement composer shortcut', () => {
  it('explains automatic routing on hover and opens verification only when compatible setup is required', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: true,
      blob: () => Promise.resolve(new Blob(['image'], { type: 'image/webp' })),
    })))
    render(<VisionEnhancementShortcut {...shortcutProps()} />)
    const control = screen.getByRole('switch', { name: /视觉增强：已关闭/ })
    fireEvent.pointerEnter(control)
    await act(async () => { vi.advanceTimersByTime(350) })
    expect(screen.getByText(/deepseek-v4-flash-vision-exp/)).toBeTruthy()
    expect(control.textContent).toBe('视觉增强')

    vi.useRealTimers()
    fireEvent.click(control)
    expect(await screen.findByText('阿里云百炼 · qwen3.8-max')).toBeTruthy()
  })

  it('enables a native visual route directly without opening credential setup', async () => {
    const activateRoute = vi.fn((modelProvider: string, model: string) => Promise.resolve({
      mode: 'native' as const, modelProvider, model,
    }))
    const resolveRoute = vi.fn((modelProvider: string, model: string) => Promise.resolve({
      mode: 'native' as const, modelProvider, model,
    }))
    const { rerender } = render(
      <VisionEnhancementShortcut {...shortcutProps(ready(), { activateRoute, resolveRoute })} />,
    )
    const control = screen.getByRole('switch', { name: /已关闭/ })
    fireEvent.click(control)
    await waitFor(() => {
      expect(activateRoute).toHaveBeenCalledWith('deepseek-official', 'deepseek-v4-flash-vision-exp')
    })
    expect(screen.queryByText('阿里云百炼 · qwen3.8-max')).toBeNull()

    rerender(<VisionEnhancementShortcut {...shortcutProps(ready(true, true), { activateRoute, resolveRoute })} />)
    await waitFor(() => { expect(resolveRoute).toHaveBeenCalled() })
    vi.useFakeTimers()
    fireEvent.pointerEnter(screen.getByRole('switch', { name: /已开启/ }))
    await act(async () => { vi.advanceTimersByTime(350) })
    expect(screen.getByText(/优先通过 DeepSeek Files API 安全上传并复用/)).toBeTruthy()
    expect(screen.getByText(/不会重复调用兼容视觉服务/)).toBeTruthy()
  })

  it('switches a text-only session to the default native visual model before activation', async () => {
    const selectNativeVision = vi.fn(() => Promise.resolve())
    const activateRoute = vi.fn(() => Promise.resolve({
      mode: 'native' as const,
      modelProvider: 'deepseek-official',
      model: 'deepseek-v4-flash-vision-exp',
    }))
    const props = shortcutProps(ready(), {
      useVisionModelDirectory: select => select({
        current: { provider: 'deepseek-official', model: 'deepseek-v4-pro' },
        routable: true,
        groups: [],
        failures: [],
        status: 'ready',
        error: null,
      }),
      selectNativeVision,
      activateRoute,
    })
    render(<VisionEnhancementShortcut {...props} />)

    fireEvent.click(screen.getByRole('switch', { name: /已关闭/ }))
    await waitFor(() => { expect(selectNativeVision).toHaveBeenCalledOnce() })
    await waitFor(() => {
      expect(activateRoute).toHaveBeenCalledWith('deepseek-official', 'deepseek-v4-flash-vision-exp')
    })
  })

  it('disables directly when the shared capability is on', async () => {
    const disable = vi.fn(() => Promise.resolve())
    render(<VisionEnhancementShortcut {...shortcutProps(ready(true, true), { disable })} />)
    fireEvent.click(screen.getByRole('switch', { name: /已开启/ }))
    await waitFor(() => { expect(disable).toHaveBeenCalledOnce() })
    expect(screen.queryByText('阿里云百炼 · qwen3.8-max')).toBeNull()
  })
})

describe('Vision enhancement settings', () => {
  it('uses the atomic Bailian enable operation with an app-owned key and a real-shaped image probe', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: true,
      blob: () => Promise.resolve(new Blob(['image'], { type: 'image/webp' })),
    })))
    const enable = vi.fn(() => Promise.resolve('一只小猫站在蓝色背景前。'))
    const props = {
      useVisionEnhancement: (select: (value: ReturnType<typeof ready>) => unknown) => select(ready()),
      load: () => Promise.resolve(),
      disable: () => Promise.resolve(),
      enable,
    } as unknown as VisionEnhancementRowProps

    render(<VisionEnhancementRow {...props} />)
    fireEvent.click(screen.getByRole('switch', { name: '视觉能力增强' }))
    expect(await screen.findAllByText('阿里云百炼 · qwen3.8-max')).toHaveLength(1)
    fireEvent.change(screen.getByLabelText('阿里云百炼 API Key'), { target: { value: 'bailian-test-key' } })
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '验证并开启' }).hasAttribute('disabled')).toBe(false)
    })
    fireEvent.click(screen.getByRole('button', { name: '验证并开启' }))

    await screen.findByText('识别成功，视觉能力已开启')
    expect(enable).toHaveBeenCalledWith(expect.objectContaining({
      apiKey: 'bailian-test-key', provider: 'bailian', model: 'qwen3.8-max', mediaType: 'image/webp',
    }), expect.any(AbortSignal))
  })

  it('selects OpenRouter, accepts its model id, and submits the OpenRouter credential', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: true,
      blob: () => Promise.resolve(new Blob(['image'], { type: 'image/webp' })),
    })))
    const enable = vi.fn(() => Promise.resolve('OpenRouter 识别成功。'))
    const props = {
      useVisionEnhancement: (select: (value: ReturnType<typeof ready>) => unknown) => select(ready()),
      load: () => Promise.resolve(),
      disable: () => Promise.resolve(),
      enable,
    } as unknown as VisionEnhancementRowProps

    render(<VisionEnhancementRow {...props} />)
    fireEvent.click(screen.getByRole('switch', { name: '视觉能力增强' }))
    fireEvent.change(await screen.findByLabelText('视觉提供方'), { target: { value: 'openrouter' } })
    expect(screen.getByLabelText('视觉模型')).toHaveProperty('value', 'openai/gpt-4.1-mini')
    fireEvent.change(screen.getByLabelText('OpenRouter API Key'), { target: { value: 'openrouter-test-key' } })
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '验证并开启' }).hasAttribute('disabled')).toBe(false)
    })
    fireEvent.click(screen.getByRole('button', { name: '验证并开启' }))

    await screen.findByText('识别成功，视觉能力已开启')
    expect(enable).toHaveBeenCalledWith(expect.objectContaining({
      apiKey: 'openrouter-test-key', provider: 'openrouter', model: 'openai/gpt-4.1-mini',
      mediaType: 'image/webp',
    }), expect.any(AbortSignal))
  })
})
