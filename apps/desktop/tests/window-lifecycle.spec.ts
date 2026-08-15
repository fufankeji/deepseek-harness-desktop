import { describe, expect, it, vi } from 'vitest'
import {
  createDesktopLifecycle,
  INSTALLER_QUIT_ARGUMENT,
  isInstallerQuitRequest,
  type DesktopWindow,
} from '../src/window-lifecycle.ts'

interface FakeDesktopWindow extends DesktopWindow {
  focus: ReturnType<typeof vi.fn<() => void>>
  hide: ReturnType<typeof vi.fn<() => void>>
  show: ReturnType<typeof vi.fn<() => void>>
}

interface TestDeferred<T> {
  readonly promise: Promise<T>
  readonly resolve: (value: T) => void
}

function testDeferred<T>(): TestDeferred<T> {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((accept) => {
    resolve = accept
  })
  return { promise, resolve }
}

function fakeWindow(options: { destroyed?: boolean; visible?: boolean } = {}): FakeDesktopWindow {
  let visible = options.visible ?? true
  const show = vi.fn<() => void>(() => { visible = true })
  const hide = vi.fn<() => void>(() => { visible = false })
  return {
    isDestroyed: () => options.destroyed ?? false,
    isVisible: () => visible,
    show,
    focus: vi.fn<() => void>(),
    hide,
  }
}

const loadHost = (): Promise<void> => Promise.resolve()

describe('desktop window lifecycle', () => {
  it('recognizes only the exact private installer quit argument', () => {
    expect(isInstallerQuitRequest(['DeepSeek Harness.exe', INSTALLER_QUIT_ARGUMENT])).toBe(true)
    expect(isInstallerQuitRequest(['DeepSeek Harness.exe', `${INSTALLER_QUIT_ARGUMENT}=true`])).toBe(false)
    expect(isInstallerQuitRequest(['DeepSeek Harness.exe'])).toBe(false)
  })

  it('hides an ordinary close without disposing the Host', () => {
    const window = fakeWindow()
    const preventDefault = vi.fn()
    const disposeHost = vi.fn(() => Promise.resolve())
    const lifecycle = createDesktopLifecycle({
      getWindow: () => window,
      createWindow: () => Promise.resolve(window),
      loadHost,
      disposeHost,
      quit: vi.fn(),
    })

    lifecycle.onWindowClose({ preventDefault })

    expect(preventDefault).toHaveBeenCalledOnce()
    expect(window.hide).toHaveBeenCalledOnce()
    expect(disposeHost).not.toHaveBeenCalled()
    expect(lifecycle.isQuitting).toBe(false)
  })

  it('restores and focuses the existing hidden window', async () => {
    const window = fakeWindow({ visible: false })
    const createWindow = vi.fn(() => Promise.resolve(window))
    const lifecycle = createDesktopLifecycle({
      getWindow: () => window,
      createWindow,
      loadHost,
      disposeHost: () => Promise.resolve(),
      quit: vi.fn(),
    })

    await lifecycle.showWindow()

    expect(createWindow).not.toHaveBeenCalled()
    expect(window.show).toHaveBeenCalledOnce()
    expect(window.focus).toHaveBeenCalledOnce()
  })

  it('single-flights replacement creation for concurrent restore requests', async () => {
    const replacement = fakeWindow({ visible: false })
    const created = testDeferred<DesktopWindow>()
    const createWindow = vi.fn(() => created.promise)
    const lifecycle = createDesktopLifecycle({
      getWindow: () => undefined,
      createWindow,
      loadHost,
      disposeHost: () => Promise.resolve(),
      quit: vi.fn(),
    })

    const first = lifecycle.showWindow()
    const second = lifecycle.showWindow()
    expect(createWindow).toHaveBeenCalledOnce()

    created.resolve(replacement)
    await Promise.all([first, second])
    expect(replacement.show).toHaveBeenCalledOnce()
    expect(replacement.focus).toHaveBeenCalledTimes(2)
  })

  it('coalesces explicit quit, lets the window close, and releases quit after Host disposal', async () => {
    const window = fakeWindow()
    const disposal = testDeferred<undefined>()
    const disposeHost = vi.fn(() => disposal.promise)
    const quit = vi.fn()
    const lifecycle = createDesktopLifecycle({
      getWindow: () => window,
      createWindow: () => Promise.resolve(window),
      loadHost,
      disposeHost,
      quit,
    })

    const first = lifecycle.requestQuit()
    const second = lifecycle.requestQuit()
    expect(second).toBe(first)
    expect(lifecycle.pendingQuit).toBe(first)
    expect(lifecycle.isQuitting).toBe(true)
    expect(disposeHost).toHaveBeenCalledOnce()
    expect(quit).not.toHaveBeenCalled()

    const preventDefault = vi.fn()
    lifecycle.onWindowClose({ preventDefault })
    expect(preventDefault).not.toHaveBeenCalled()
    expect(window.hide).not.toHaveBeenCalled()

    await lifecycle.showWindow()
    expect(window.focus).not.toHaveBeenCalled()

    disposal.resolve(undefined)
    await first
    expect(quit).toHaveBeenCalledOnce()
  })

  it('reports a Host disposal failure and still releases Electron quit', async () => {
    const failure = new Error('Host disposal failed')
    const reportError = vi.fn()
    const quit = vi.fn()
    const lifecycle = createDesktopLifecycle({
      getWindow: () => undefined,
      createWindow: () => Promise.resolve(fakeWindow()),
      loadHost,
      disposeHost: () => Promise.reject(failure),
      reportError,
      quit,
    })

    await expect(lifecycle.requestQuit()).resolves.toBeUndefined()
    expect(reportError).toHaveBeenCalledOnce()
    expect(reportError).toHaveBeenCalledWith(failure)
    expect(quit).toHaveBeenCalledOnce()
  })

  it('reloads the existing window for the current host generation without changing visibility', async () => {
    const window = fakeWindow({ visible: false })
    const loadCurrentHost = vi.fn<(_window: DesktopWindow, origin: string) => Promise<void>>()
      .mockResolvedValue(undefined)
    const lifecycle = createDesktopLifecycle({
      getWindow: () => window,
      createWindow: () => Promise.resolve(window),
      loadHost: loadCurrentHost,
      disposeHost: () => Promise.resolve(),
      quit: vi.fn(),
    })

    await lifecycle.reloadHost('http://127.0.0.1:5123', 'plugin-center')

    expect(loadCurrentHost).toHaveBeenCalledWith(window, 'http://127.0.0.1:5123', 'plugin-center')
    expect(window.show).not.toHaveBeenCalled()
    expect(window.focus).not.toHaveBeenCalled()
  })

  it('does not reload a destroyed window or a window after explicit quit begins', async () => {
    const window = fakeWindow({ destroyed: true })
    const loadCurrentHost = vi.fn<(_window: DesktopWindow, origin: string) => Promise<void>>()
      .mockResolvedValue(undefined)
    const lifecycle = createDesktopLifecycle({
      getWindow: () => window,
      createWindow: () => Promise.resolve(window),
      loadHost: loadCurrentHost,
      disposeHost: () => Promise.resolve(),
      quit: vi.fn(),
    })

    await lifecycle.reloadHost('http://127.0.0.1:5123')
    void lifecycle.requestQuit()
    await lifecycle.reloadHost('http://127.0.0.1:5124')

    expect(loadCurrentHost).not.toHaveBeenCalled()
  })
})
