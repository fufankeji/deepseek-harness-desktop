/** Structural renderer view of the fixed Electron preload bridge. */

export type DesktopUpdatePhase =
  | 'development' | 'idle' | 'checking' | 'available' | 'downloading'
  | 'ready' | 'up-to-date' | 'error'

/** Immutable update state supplied by the Electron main process. */
export interface DesktopUpdateState {
  readonly phase: DesktopUpdatePhase
  /** Running Studio shell version. */
  readonly currentVersion: string
  /** Harness core version embedded in the packaged Host runtime. */
  readonly harnessVersion: string
  readonly availableVersion?: string
  readonly progress?: number
  readonly message?: string
}

/** Accent, deep, mist, and highlight colors derived from one background. */
export type AppearancePalette = readonly [string, string, string, string]

/** Stable identifiers for themes bundled with the Desktop frontend. */
export type BuiltinAppearanceTheme =
  | 'official'
  | 'whale-maid'
  | 'cloud-cat'
  | 'jiutian-deep-space'
  | 'jiutian-quantum-glass'
  | 'jiutian-dawn-horizon'

/** Renderer-safe persisted appearance values. */
export interface AppearanceSettings {
  readonly builtinTheme: BuiltinAppearanceTheme | null
  readonly imageDataUrl: string | null
  readonly focusY: number
  readonly glassStrength: number
  readonly palette: AppearancePalette
}

/** Closed renderer API exposed by the sandboxed Electron preload. */
export interface DesktopRendererBridge {
  readonly platform: string
  readonly appearance: {
    get(): Promise<AppearanceSettings>
    save(settings: AppearanceSettings): Promise<AppearanceSettings>
    reset(): Promise<AppearanceSettings>
  }
  readonly updates: {
    getState(): Promise<DesktopUpdateState>
    check(): Promise<DesktopUpdateState>
    download(): Promise<DesktopUpdateState>
    install(): Promise<void>
    onState(listener: (state: DesktopUpdateState) => void): () => void
  }
}

declare global {
  interface Window {
    dshDesktop?: DesktopRendererBridge
  }
}

/**
 * Read the bridge once; absent means this client package was mounted outside Electron.
 * @returns The fixed Desktop bridge, or undefined in an ordinary browser host.
 */
export function desktopBridge(): DesktopRendererBridge | undefined {
  return window.dshDesktop
}
