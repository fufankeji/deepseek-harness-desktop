/** Fixed Electron bridge shared by the Desktop main process and preload. */

import type {
  CatalogDetailQuery,
  CatalogDetailResult,
  CatalogListQuery,
  CatalogListResult,
  CompatibilityDecision,
  CompatibilityRequest,
  InstalledPluginListResult,
  PluginInstallRequest,
  PluginManagementRequest,
  PluginOperationSnapshot,
  PluginOperationStartResult,
  PluginOwnedDataOffer,
  PluginOwnedDataRemovalRequest,
  PluginOwnedDataRemovalResult,
  PluginOwnedDataRetentionRequest,
  PluginOwnedDataRetentionResult,
  PluginDiagnosticExportRequest,
  PluginDiagnosticExportResult,
  PluginRecoveryRetryRequest,
  PluginRecoverySnapshot,
  PresetInstallPreviewRequest,
  PresetInstallPreviewResult,
  PresetInstallRequest,
  PresetInstallResult,
  PresetRuntimeRequest,
  PresetRuntimeSnapshot,
  PresetSquareDetailQuery,
  PresetSquareDetailResult,
  PresetSquareListQuery,
  PresetSquareListResult,
} from '@deepseek-ai/dsh-plugin-center-contracts'

/** Update lifecycle exposed to the sandboxed renderer. */
type DesktopUpdatePhase =
  | 'development'
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'ready'
  | 'up-to-date'
  | 'error'

/** Immutable update snapshot delivered to the settings page. */
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

/** Four colors extracted from the selected background. */
export type DesktopAppearancePalette = readonly [string, string, string, string]

/** Stable identifiers for themes bundled with the Desktop frontend. */
export type DesktopBuiltinAppearanceTheme =
  | 'official'
  | 'whale-maid'
  | 'cloud-cat'
  | 'jiutian-deep-space'
  | 'jiutian-quantum-glass'
  | 'jiutian-dawn-horizon'

/** Persisted appearance settings. A null image selects one bundled theme. */
export interface DesktopAppearanceSettings {
  readonly builtinTheme: DesktopBuiltinAppearanceTheme | null
  readonly imageDataUrl: string | null
  readonly focusY: number
  readonly glassStrength: number
  readonly palette: DesktopAppearancePalette
}

/** Renderer-safe API exposed through contextBridge. */
export interface DesktopBridge {
  readonly platform: NodeJS.Platform
  readonly workspace: {
    /** Open the operating system's single-directory picker. */
    pickDirectory(): Promise<string | null>
  }
  readonly appearance: {
    get(): Promise<DesktopAppearanceSettings>
    save(settings: DesktopAppearanceSettings): Promise<DesktopAppearanceSettings>
    reset(): Promise<DesktopAppearanceSettings>
  }
  readonly updates: {
    getState(): Promise<DesktopUpdateState>
    check(): Promise<DesktopUpdateState>
    download(): Promise<DesktopUpdateState>
    install(): Promise<void>
    onState(listener: (state: DesktopUpdateState) => void): () => void
  }
  readonly catalog: {
    list(query: CatalogListQuery): Promise<CatalogListResult>
    refresh(query: CatalogListQuery): Promise<CatalogListResult>
    detail(query: CatalogDetailQuery): Promise<CatalogDetailResult>
    checkCompatibility(request: CompatibilityRequest): Promise<CompatibilityDecision>
  }
  readonly presetSquare: {
    /** Browser fixtures may browse, but only Desktop can mutate the local roster. */
    readonly mutationsEnabled: boolean
    list(query: PresetSquareListQuery): Promise<PresetSquareListResult>
    detail(query: PresetSquareDetailQuery): Promise<PresetSquareDetailResult>
    previewInstall(request: PresetInstallPreviewRequest): Promise<PresetInstallPreviewResult>
    install(request: PresetInstallRequest): Promise<PresetInstallResult>
    checkRuntime(request: PresetRuntimeRequest): Promise<PresetRuntimeSnapshot>
    installRuntime(request: PresetRuntimeRequest): Promise<PresetRuntimeSnapshot>
  }
  readonly installedPlugins: {
    list(): Promise<InstalledPluginListResult>
  }
  readonly pluginOperations: {
    /** True when the Desktop exposes the recovery-backed Profile mutation owner. */
    readonly mutationsEnabled: boolean
    install(request: PluginInstallRequest): Promise<PluginOperationStartResult>
    manage(request: PluginManagementRequest): Promise<PluginOperationStartResult>
    getOperation(): Promise<PluginOperationSnapshot | null>
    onState(listener: (operation: PluginOperationSnapshot) => void): () => void
  }
  readonly pluginOwnedData: {
    getOffer(): Promise<PluginOwnedDataOffer | null>
    remove(request: PluginOwnedDataRemovalRequest): Promise<PluginOwnedDataRemovalResult>
    retain(request: PluginOwnedDataRetentionRequest): Promise<PluginOwnedDataRetentionResult>
  }
  readonly pluginRecovery: {
    getState(): Promise<PluginRecoverySnapshot | null>
    retry(request: PluginRecoveryRetryRequest): Promise<PluginRecoverySnapshot | null>
    exportDiagnostics(request: PluginDiagnosticExportRequest): Promise<PluginDiagnosticExportResult>
    onState(listener: (snapshot: PluginRecoverySnapshot) => void): () => void
  }
}

/** Closed channel set; the preload never accepts a caller-provided channel. */
export const DESKTOP_CHANNELS = {
  workspacePickDirectory: 'dsh-desktop:workspace:pick-directory',
  appearanceGet: 'dsh-desktop:appearance:get',
  appearanceSave: 'dsh-desktop:appearance:save',
  appearanceReset: 'dsh-desktop:appearance:reset',
  updatesGet: 'dsh-desktop:updates:get',
  updatesCheck: 'dsh-desktop:updates:check',
  updatesDownload: 'dsh-desktop:updates:download',
  updatesInstall: 'dsh-desktop:updates:install',
  updatesState: 'dsh-desktop:updates:state',
  catalogList: 'dsh-desktop:catalog:list',
  catalogRefresh: 'dsh-desktop:catalog:refresh',
  catalogDetail: 'dsh-desktop:catalog:detail',
  catalogCheckCompatibility: 'dsh-desktop:catalog:check-compatibility',
  presetSquareList: 'dsh-desktop:preset-square:list',
  presetSquareDetail: 'dsh-desktop:preset-square:detail',
  presetSquarePreviewInstall: 'dsh-desktop:preset-square:preview-install',
  presetSquareInstall: 'dsh-desktop:preset-square:install',
  presetSquareRuntimeCheck: 'dsh-desktop:preset-square:runtime-check',
  presetSquareRuntimeInstall: 'dsh-desktop:preset-square:runtime-install',
  installedPluginsList: 'dsh-desktop:installed-plugins:list',
  pluginOperationStart: 'dsh-desktop:plugin-operation:start',
  pluginOperationGet: 'dsh-desktop:plugin-operation:get',
  pluginOperationState: 'dsh-desktop:plugin-operation:state',
  pluginOwnedDataGetOffer: 'dsh-desktop:plugin-owned-data:get-offer',
  pluginOwnedDataRemove: 'dsh-desktop:plugin-owned-data:remove',
  pluginOwnedDataRetain: 'dsh-desktop:plugin-owned-data:retain',
  pluginRecoveryGet: 'dsh-desktop:plugin-recovery:get',
  pluginRecoveryRetry: 'dsh-desktop:plugin-recovery:retry',
  pluginRecoveryExport: 'dsh-desktop:plugin-recovery:export',
  pluginRecoveryState: 'dsh-desktop:plugin-recovery:state',
} as const
