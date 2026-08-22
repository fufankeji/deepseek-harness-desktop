/** Desktop window and application lifetime independent from Electron imports. */

/** Private command-line signal used by the Windows installer before replacing application files. */
export const INSTALLER_QUIT_ARGUMENT = '--dsh-installer-quit'

/**
 * Identify an installer-owned request without treating partial argument matches as authority to quit.
 * @param commandLine - Arguments supplied to the first or a subsequent Electron instance.
 * @returns Whether the exact private installer argument is present.
 */
export function isInstallerQuitRequest(commandLine: readonly string[]): boolean {
  return commandLine.includes(INSTALLER_QUIT_ARGUMENT)
}

/** Minimal close event accepted by the desktop lifecycle. */
interface WindowCloseEvent {
  /** Keep the application alive while the window is hidden. */
  preventDefault(): void
}

/** Window operations owned by the desktop lifecycle. */
export interface DesktopWindow {
  /** Whether the native window has been destroyed. */
  isDestroyed(): boolean
  /** Whether the native window is visible. */
  isVisible(): boolean
  /** Reveal the existing window. */
  show(): void
  /** Give the existing window keyboard focus. */
  focus(): void
  /** Hide without tearing down its renderer or Host connection. */
  hide(): void
}

/** Dependencies supplied by the Electron main process. */
export interface DesktopLifecycleOptions {
  /** Return the current native window, when one exists. */
  readonly getWindow: () => DesktopWindow | undefined
  /** Create and load a replacement native window. */
  readonly createWindow: () => Promise<DesktopWindow>
  /** Load the current Host origin and optional first-level page into an existing native window. */
  readonly loadHost: (window: DesktopWindow, origin: string, primaryPage?: string) => Promise<void>
  /** Stop the desktop-owned Host and reach process quiescence. */
  readonly disposeHost: () => Promise<void>
  /** Retry Electron's ordinary quit after asynchronous teardown completes. */
  readonly quit: () => void
  /** Report a teardown failure before the retry is released. */
  readonly reportError?: (error: unknown) => void
}

/** Public controller for close, restore and explicit quit events. */
export interface DesktopLifecycle {
  /** True after an explicit application quit begins. */
  readonly isQuitting: boolean
  /** Current quit operation, shared by every quit source. */
  readonly pendingQuit: Promise<void> | undefined
  /** Hide an ordinary close, or let it proceed during explicit quit. */
  onWindowClose(event: WindowCloseEvent): void
  /** Show the existing window or create a replacement. */
  showWindow(): Promise<void>
  /** Reload the existing window against a replacement Host origin and optional first-level page. */
  reloadHost(origin: string, primaryPage?: string): Promise<void>
  /** Dispose the Host once, then release Electron's quit sequence. */
  requestQuit(): Promise<void>
}

/**
 * Create the desktop application lifecycle.
 * @param options - Native window access, Host teardown and quit release.
 * @returns A lifecycle whose Host outlives ordinary window closes.
 */
export function createDesktopLifecycle(options: DesktopLifecycleOptions): DesktopLifecycle {
  let quitting = false
  let pendingQuit: Promise<void> | undefined
  let creatingWindow: Promise<DesktopWindow> | undefined

  const showWindow = async (): Promise<void> => {
    if (quitting) return
    let window = options.getWindow()
    if (window === undefined || window.isDestroyed()) {
      creatingWindow ??= options.createWindow().finally(() => { creatingWindow = undefined })
      window = await creatingWindow
    }
    if (!window.isVisible()) window.show()
    window.focus()
  }

  const requestQuit = (): Promise<void> => {
    if (pendingQuit !== undefined) return pendingQuit
    quitting = true
    pendingQuit = options.disposeHost().catch((error: unknown) => {
      options.reportError?.(error)
    }).then(() => {
      options.quit()
    })
    return pendingQuit
  }

  const reloadHost = async (origin: string, primaryPage?: string): Promise<void> => {
    if (quitting) return
    const window = options.getWindow()
    if (window === undefined || window.isDestroyed()) return
    await options.loadHost(window, origin, primaryPage)
  }

  return {
    get isQuitting() { return quitting },
    get pendingQuit() { return pendingQuit },
    onWindowClose(event) {
      if (quitting) return
      event.preventDefault()
      options.getWindow()?.hide()
    },
    showWindow,
    reloadHost,
    requestQuit,
  }
}
