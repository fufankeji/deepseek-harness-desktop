/** Electron application shell for the loopback DeepSeek Harness Web Host. */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  session,
  shell,
  Tray,
  WebContentsView,
  type Event,
  type MenuItemConstructorOptions,
} from 'electron'
import electronUpdater from 'electron-updater'
import {
  healProfilesModuleFallback, initProfile, PROFILE_TEMPLATES,
} from '@deepseek-ai/dsh-app-boot'
import {
  decodeCatalogDetailQuery,
  decodeCatalogListQuery,
  decodePluginDiagnosticExportRequest,
  decodePluginRecoveryRetryRequest,
  decodePresetRuntimeRequest,
  type CompatibilityFingerprint,
} from '@deepseek-ai/dsh-plugin-center-contracts'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { AppearanceStorage } from './appearance-storage.ts'
import { reconcileBuiltInApplications } from './built-in-applications.ts'
import { DESKTOP_CHANNELS, type DesktopAppearanceSettings } from './desktop-bridge-contract.ts'
import { createHostSupervisor, spawnDshWeb, type HostSupervisor } from './host-supervisor.ts'
import { assertDesktopRequestOwner } from './plugin-center/bridge-policy.ts'
import { CatalogCache } from './plugin-center/catalog-cache.ts'
import {
  type CatalogPreflightSelection,
  type PluginCatalogRepository,
} from './plugin-center/catalog-client.ts'
import { resolveSupportedPluginPlatform } from './plugin-center/environment.ts'
import { NpmEcosystemCatalogRepository } from './plugin-center/npm-ecosystem-catalog.ts'
import { PluginArtifactDownloader } from './plugin-center/artifact-downloader.ts'
import { reconcileApplicationUpdateCompatibility } from './plugin-center/app-update-compatibility.ts'
import { migrateLegacyDshmarketRegistration } from './plugin-center/legacy-dshmarket-migration.ts'
import { PluginRecoveryDiagnosticExporter } from './plugin-center/diagnostic-export.ts'
import { PluginOperationController } from './plugin-center/operation-controller.ts'
import {
  PluginOperationJournal,
  UNREADABLE_PLUGIN_JOURNAL_OPERATION_ID,
} from './plugin-center/operation-journal.ts'
import { PluginRecoveryController } from './plugin-center/recovery-controller.ts'
import { ProfileMutationLock } from './plugin-center/profile-lock.ts'
import { ProfileSnapshotStore } from './plugin-center/profile-snapshot-store.ts'
import { PluginCompatibilityService } from './plugin-center/preflight-service.ts'
import { readProfileCompatibilityFingerprint } from './plugin-center/profile-compatibility.ts'
import { deriveInstalledPluginProjection } from './plugin-center/installed-projection.ts'
import {
  PluginOwnedDataAuthorityStore,
  PluginOwnedDataRemover,
} from './plugin-center/owned-data.ts'
import { PluginRuntimeVerifier } from './plugin-center/runtime-verifier.ts'
import {
  preparePluginCenterStartup,
  type PluginStartupRecoveryResult,
} from './plugin-center/startup-recovery.ts'
import {
  deriveProtectedSystemComponents,
  type ProtectedSystemComponents,
} from './plugin-center/system-components.ts'
import { createTrustedInstallRunner } from './plugin-center/trusted-install-executor.ts'
import { createTrustedManagementRunner } from './plugin-center/trusted-management-executor.ts'
import { desktopRendererUrl, PLUGIN_CENTER_PAGE_ID } from './renderer-navigation.ts'
import { DesktopUpdateController } from './update-controller.ts'
import {
  createDesktopLifecycle,
  isInstallerQuitRequest,
  type DesktopLifecycle,
} from './window-lifecycle.ts'
import { reloadWithHeldFrame, type HeldReloadFrame } from './window-reload-transition.ts'
import { PresetSquareClient } from './preset-square/client.ts'
import { ResourcePresetSquareCatalog } from './preset-square/bundled-catalog.ts'
import { migrateLegacyBundledContentPreset } from './preset-square/legacy-bundled-preset-migration.ts'
import {
  PresetRuntimeController,
  withPresetRuntimeEnvironment,
} from './preset-square/runtime-controller.ts'

const APP_NAME = 'DeepSeek Harness'
const WINDOW_WIDTH = 1440
const WINDOW_HEIGHT = 920
const DESKTOP_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const REPOSITORY_ROOT = resolve(DESKTOP_DIR, '../..')

let mainWindow: BrowserWindow | undefined
let tray: Tray | undefined
let host: HostSupervisor | undefined
let lifecycle: DesktopLifecycle | undefined
let bootQuitPromise: Promise<void> | undefined
let quitReleased = false
let updateController: DesktopUpdateController | undefined
let pluginOperationController: PluginOperationController | undefined
let pluginRecoveryController: PluginRecoveryController | undefined
let pluginDiagnosticExporter: PluginRecoveryDiagnosticExporter | undefined
let pluginOwnedDataRemover: PluginOwnedDataRemover | undefined
let presetRuntimeController: PresetRuntimeController | undefined
let pluginRecoveryStartupBlocked = false

interface PluginCenterBackend {
  readonly catalog: PluginCatalogRepository
  readonly transactionCompatibility: PluginCompatibilityService
  readonly readTransactionFingerprint: (selection: CatalogPreflightSelection) => CompatibilityFingerprint
  readonly systemComponents: ProtectedSystemComponents
  readonly paths: ReturnType<typeof hostPaths>
}

/** Resolve artifacts from the checkout in development and resourcesPath when packaged. */
function hostPaths(): {
  nodeExecutable: string
  cliEntry: string
  cliManifest: string
  hostManifest: string
  shippedBundleManifests: readonly string[]
  packageManagerEntry: string
  packageManagerManifest: string
  cwd: string
  electronRunAsNode: boolean
} {
  if (!app.isPackaged) {
    const packageManager = join(DESKTOP_DIR, 'runtime/node_modules/pnpm')
    return {
      nodeExecutable: process.env.DSH_DESKTOP_NODE_EXECUTABLE ?? 'node',
      cliEntry: join(REPOSITORY_ROOT, 'apps/cli/lib/bin.js'),
      cliManifest: join(REPOSITORY_ROOT, 'apps/cli/package.json'),
      hostManifest: join(DESKTOP_DIR, 'runtime/package.json'),
      shippedBundleManifests: [
        join(REPOSITORY_ROOT, 'packages/bundle/base/package.json'),
        join(REPOSITORY_ROOT, 'packages/bundle/web-app/package.json'),
        join(REPOSITORY_ROOT, 'packages/examples/ff-llm-wiki-plugin/package.json'),
      ],
      packageManagerEntry: join(packageManager, 'bin/pnpm.cjs'),
      packageManagerManifest: join(packageManager, 'package.json'),
      cwd: process.cwd(),
      electronRunAsNode: false,
    }
  }
  const hostModules = join(process.resourcesPath, 'host/node_modules')
  return {
    nodeExecutable: process.execPath,
    cliEntry: join(hostModules, '@deepseek-ai/dsh/lib/bin.js'),
    cliManifest: join(hostModules, '@deepseek-ai/dsh/package.json'),
    hostManifest: join(process.resourcesPath, 'host/package.json'),
    shippedBundleManifests: [
      join(hostModules, '@deepseek-ai/dsh-base/package.json'),
      join(hostModules, '@deepseek-ai/dsh-web-app/package.json'),
      join(hostModules, '@fufan/dsh-plugin-llm-wiki/package.json'),
    ],
    packageManagerEntry: join(hostModules, 'pnpm/bin/pnpm.cjs'),
    packageManagerManifest: join(hostModules, 'pnpm/package.json'),
    cwd: app.getPath('home'),
    electronRunAsNode: true,
  }
}

const BUILT_IN_APPLICATION_BUNDLES = ['@fufan/dsh-plugin-llm-wiki'] as const

function assertHostArtifacts(paths: ReturnType<typeof hostPaths>): void {
  if (paths.nodeExecutable.includes('/') && !existsSync(paths.nodeExecutable)) {
    throw new Error(`desktop Node runtime is missing: ${paths.nodeExecutable}`)
  }
  if (!existsSync(paths.cliEntry)) {
    throw new Error(`desktop Host entry is missing: ${paths.cliEntry}; run pnpm run build first`)
  }
  if (!existsSync(paths.packageManagerEntry)) {
    throw new Error(`desktop package-manager entry is missing: ${paths.packageManagerEntry}`)
  }
  for (const manifest of [
    paths.cliManifest,
    paths.hostManifest,
    paths.packageManagerManifest,
    ...paths.shippedBundleManifests,
  ]) {
    if (!existsSync(manifest)) throw new Error(`desktop Host manifest is missing: ${manifest}`)
  }
}

function currentHostOrigin(): string | undefined {
  return host?.current?.origin
}

function recoveryPageUrl(): string {
  const path = app.isPackaged
    ? join(process.resourcesPath, 'desktop-resources/recovery.html')
    : join(DESKTOP_DIR, 'resources/recovery.html')
  return pathToFileURL(path).href
}

function bundledPresetRoot(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'desktop-resources/preset-square/presets')
    : join(DESKTOP_DIR, 'resources/preset-square/presets')
}

function isRecoveryPageUrl(raw: string): boolean {
  try {
    const actual = new URL(raw)
    const expected = new URL(recoveryPageUrl())
    return actual.protocol === 'file:' && actual.pathname === expected.pathname
  } catch {
    return false
  }
}

async function loadWindowHost(window: BrowserWindow, origin: string, primaryPage?: string): Promise<void> {
  await window.loadURL(desktopRendererUrl({
    origin,
    platform: process.platform,
    ...(primaryPage === undefined ? {} : { primaryPage }),
    previousUrl: window.webContents.getURL(),
  }))
}

async function holdCurrentWindowFrame(window: BrowserWindow): Promise<HeldReloadFrame | undefined> {
  if (window.isDestroyed()) return undefined
  const snapshot = await window.webContents.capturePage()
  if (snapshot.isEmpty() || window.isDestroyed()) return undefined
  const { width, height } = window.getContentBounds()
  const held = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  held.setBounds({ x: 0, y: 0, width, height })
  held.setBackgroundColor('#111318')
  const document = [
    '<!doctype html><meta charset="utf-8">',
    '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data:">',
    '<style>html,body,img{width:100%;height:100%;margin:0;overflow:hidden}img{display:block}</style>',
    `<img alt="" src="${snapshot.toDataURL()}">`,
  ].join('')
  try {
    await held.webContents.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(document)}`)
    if (window.isDestroyed()) {
      held.webContents.close()
      return undefined
    }
    window.contentView.addChildView(held)
  } catch (error) {
    if (!held.webContents.isDestroyed()) held.webContents.close()
    throw error
  }
  return {
    release() {
      if (!window.isDestroyed()) window.contentView.removeChildView(held)
      if (!held.webContents.isDestroyed()) held.webContents.close()
    },
  }
}

async function reloadWindowHost(window: BrowserWindow, origin: string, primaryPage?: string): Promise<void> {
  await reloadWithHeldFrame({
    holdCurrentFrame: async () => await holdCurrentWindowFrame(window),
    navigate: async () => { await loadWindowHost(window, origin, primaryPage) },
    waitForPaint: async () => {
      await Promise.race([
        window.webContents.executeJavaScript(
          'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))',
        ),
        new Promise<void>((resolvePaint) => { setTimeout(resolvePaint, 250) }),
      ])
    },
    reportTransitionFailure: (error) => { console.warn('desktop held-frame reload transition failed:', error) },
  })
}

function manifestVersion(path: string): string {
  const manifest = JSON.parse(readFileSync(path, 'utf8')) as { version?: unknown }
  if (typeof manifest.version !== 'string') throw new Error(`${path} has no version`)
  return manifest.version
}

function manifestDependencyNames(path: string): ReadonlySet<string> {
  const manifest = JSON.parse(readFileSync(path, 'utf8')) as { dependencies?: unknown }
  if (typeof manifest.dependencies !== 'object' || manifest.dependencies === null
    || Array.isArray(manifest.dependencies)) {
    throw new Error(`${path} has no dependency map`)
  }
  const dependencies = Object.entries(manifest.dependencies)
  for (const [name, version] of dependencies) {
    if (name === '' || typeof version !== 'string') throw new Error(`${path} has an invalid dependency map`)
  }
  return new Set(dependencies.map(([name]) => name))
}

/** Load the app-local tray template, with an empty fallback for incomplete staging. */
function trayImage(): Electron.NativeImage {
  const candidates = app.isPackaged
    ? [join(process.resourcesPath, 'desktop-resources/trayTemplate.png')]
    : [join(DESKTOP_DIR, 'resources/trayTemplate.png')]
  const path = candidates.find(candidate => existsSync(candidate))
  const image = path === undefined ? nativeImage.createEmpty() : nativeImage.createFromPath(path)
  if (process.platform === 'darwin') image.setTemplateImage(true)
  return image
}

function isExternalUrl(raw: string): boolean {
  try {
    const url = new URL(raw)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function hasOrigin(raw: string, expected: string): boolean {
  try {
    return new URL(raw).origin === expected
  } catch {
    return false
  }
}

/** Install navigation and permission policy before the first renderer loads. */
function hardenSession(): void {
  const desktopSession = session.defaultSession
  desktopSession.setPermissionCheckHandler(() => false)
  desktopSession.setPermissionRequestHandler((_webContents, _permission, callback) => { callback(false) })
}

async function createMainWindow(): Promise<BrowserWindow> {
  const origin = currentHostOrigin()
  const recoveryMode = pluginRecoveryStartupBlocked
  if (!recoveryMode && origin === undefined) throw new Error('desktop Host is not ready')
  const window = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    minWidth: 960,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    frame: process.platform === 'win32',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    ...(process.platform === 'darwin' ? {} : {
      titleBarOverlay: {
        color: '#00000000',
        symbolColor: '#7f858f',
        height: 44,
      },
    }),
    ...(process.platform === 'darwin' ? {
      trafficLightPosition: { x: 16, y: 18 },
      vibrancy: 'sidebar' as const,
      visualEffectState: 'followWindow' as const,
    } : {}),
    ...(process.platform === 'win32' ? {
      backgroundMaterial: 'acrylic' as const,
      hasShadow: true,
      roundedCorners: true,
      thickFrame: true,
    } : {
      transparent: true,
      backgroundColor: '#00000000',
    }),
    title: APP_NAME,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      preload: join(DESKTOP_DIR, 'lib/preload.cjs'),
    },
  })
  mainWindow = window
  window.on('close', (event) => { lifecycle?.onWindowClose(event) })
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = undefined
  })
  window.webContents.on('will-navigate', (event, url) => {
    const currentOrigin = currentHostOrigin()
    if (isRecoveryPageUrl(url) || (currentOrigin !== undefined && hasOrigin(url, currentOrigin))) return
    event.preventDefault()
    if (isExternalUrl(url)) void shell.openExternal(url)
  })
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternalUrl(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  if (recoveryMode) await window.loadURL(recoveryPageUrl())
  else if (origin !== undefined) await loadWindowHost(window, origin)
  if (!lifecycle?.isQuitting) window.show()
  return window
}

/** Register the closed renderer bridge after Electron app paths are available. */
function registerDesktopBridge(): PluginCenterBackend {
  const userDataDirectory = app.getPath('userData')
  const appearance = new AppearanceStorage(userDataDirectory)
  const paths = hostPaths()
  const hostProvidedModules = manifestDependencyNames(paths.hostManifest)
  const catalog = new NpmEcosystemCatalogRepository(
    new CatalogCache(userDataDirectory, [...hostProvidedModules]),
    fetch,
    Date.now,
    userDataDirectory,
    hostProvidedModules,
  )
  const presetSquare = new PresetSquareClient(
    fetch,
    Date.now,
    currentHostOrigin,
    new ResourcePresetSquareCatalog(bundledPresetRoot()),
  )
  presetRuntimeController = new PresetRuntimeController({
    homeDirectory: resolveDshHome(),
    nodeExecutable: paths.nodeExecutable,
    packageManagerEntry: paths.packageManagerEntry,
    electronRunAsNode: paths.electronRunAsNode,
  })
  const systemComponents = deriveProtectedSystemComponents(paths.shippedBundleManifests)
  const readFingerprint = (
    selection: CatalogPreflightSelection,
    activeOperation: boolean,
  ): CompatibilityFingerprint => readProfileCompatibilityFingerprint({
    homeDirectory: resolveDshHome(),
    profileName: 'web',
    desktopVersion: app.getVersion(),
    dshVersion: manifestVersion(paths.cliManifest),
    nodeVersion: process.versions.node,
    os: process.platform,
    architecture: process.arch,
    catalogEtag: selection.etag,
    catalogFreshness: selection.freshness,
    candidates: selection.candidates,
    systemComponents,
    activeOperation,
  })
  const compatibility = new PluginCompatibilityService(
    catalog,
    selection => readFingerprint(selection, pluginOperationController?.active ?? false),
  )
  const transactionCompatibility = new PluginCompatibilityService(
    catalog,
    selection => readFingerprint(selection, false),
  )
  const { autoUpdater } = electronUpdater
  updateController = new DesktopUpdateController(
    autoUpdater,
    app.getVersion(),
    manifestVersion(paths.cliManifest),
    app.isPackaged,
  )
  updateController.subscribe((state) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) window.webContents.send(DESKTOP_CHANNELS.updatesState, state)
    }
  })

  ipcMain.handle(DESKTOP_CHANNELS.appearanceGet, () => appearance.read())
  ipcMain.handle(
    DESKTOP_CHANNELS.appearanceSave,
    (_event, value: DesktopAppearanceSettings) => appearance.save(value),
  )
  ipcMain.handle(DESKTOP_CHANNELS.appearanceReset, () => appearance.reset())
  ipcMain.handle(DESKTOP_CHANNELS.updatesGet, () => updateController?.getState())
  ipcMain.handle(DESKTOP_CHANNELS.updatesCheck, () => updateController?.check())
  ipcMain.handle(DESKTOP_CHANNELS.updatesDownload, () => updateController?.download())
  ipcMain.handle(DESKTOP_CHANNELS.updatesInstall, async () => {
    if (updateController?.getState().phase !== 'ready') throw new Error('desktop update is not ready to install')
    await host?.shutdown()
    quitReleased = true
    tray?.destroy()
    tray = undefined
    updateController.install()
  })
  const assertDesktopSender = (event: Electron.IpcMainInvokeEvent): void => {
    assertDesktopRequestOwner({
      senderId: event.sender.id,
      senderFrameUrl: event.senderFrame?.url,
    }, {
      webContentsId: mainWindow?.webContents.id ?? -1,
      origin: currentHostOrigin(),
    })
  }
  ipcMain.handle(DESKTOP_CHANNELS.workspacePickDirectory, async (event) => {
    assertDesktopSender(event)
    const owner = mainWindow
    if (owner === undefined || owner.isDestroyed()) throw new Error('Desktop window is unavailable')
    const result = await dialog.showOpenDialog(owner, {
      properties: ['openDirectory', 'createDirectory'],
    })
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })
  const assertRecoverySender = (event: Electron.IpcMainInvokeEvent): void => {
    const url = event.senderFrame?.url ?? ''
    const origin = currentHostOrigin()
    if (event.sender.id !== mainWindow?.webContents.id
      || (!isRecoveryPageUrl(url) && (origin === undefined || !hasOrigin(url, origin)))) {
      throw new Error('plugin recovery request did not originate from the owned Desktop window')
    }
  }
  ipcMain.handle(DESKTOP_CHANNELS.catalogList, (event, value: unknown) => {
    assertDesktopSender(event)
    return catalog.list(decodeCatalogListQuery(value))
  })
  ipcMain.handle(DESKTOP_CHANNELS.catalogRefresh, async (event, value: unknown) => {
    assertDesktopSender(event)
    const query = decodeCatalogListQuery(value)
    return await catalog.refresh(query)
  })
  ipcMain.handle(DESKTOP_CHANNELS.catalogDetail, (event, value: unknown) => {
    assertDesktopSender(event)
    return catalog.detail(decodeCatalogDetailQuery(value))
  })
  ipcMain.handle(DESKTOP_CHANNELS.catalogCheckCompatibility, (event, value: unknown) => {
    assertDesktopSender(event)
    return compatibility.check(value)
  })
  ipcMain.handle(DESKTOP_CHANNELS.presetSquareList, (event, value: unknown) => {
    assertDesktopSender(event)
    return presetSquare.list(value)
  })
  ipcMain.handle(DESKTOP_CHANNELS.presetSquareDetail, (event, value: unknown) => {
    assertDesktopSender(event)
    return presetSquare.detail(value)
  })
  ipcMain.handle(DESKTOP_CHANNELS.presetSquarePreviewInstall, (event, value: unknown) => {
    assertDesktopSender(event)
    return presetSquare.previewInstall(value)
  })
  ipcMain.handle(DESKTOP_CHANNELS.presetSquareInstall, (event, value: unknown) => {
    assertDesktopSender(event)
    return presetSquare.install(value)
  })
  ipcMain.handle(DESKTOP_CHANNELS.presetSquareRuntimeCheck, (event, value: unknown) => {
    assertDesktopSender(event)
    const request = decodePresetRuntimeRequest(value)
    if (presetRuntimeController === undefined) throw new Error('Preset runtime controller is unavailable')
    return presetRuntimeController.check(request.presetId)
  })
  ipcMain.handle(DESKTOP_CHANNELS.presetSquareRuntimeInstall, (event, value: unknown) => {
    assertDesktopSender(event)
    const request = decodePresetRuntimeRequest(value)
    if (presetRuntimeController === undefined) throw new Error('Preset runtime controller is unavailable')
    return presetRuntimeController.install(request.presetId)
  })
  ipcMain.handle(DESKTOP_CHANNELS.installedPluginsList, async (event) => {
    assertDesktopSender(event)
    const authority = await catalog.installedAuthority()
    const fingerprint = readFingerprint({
      candidate: null,
      candidates: authority.preflights,
      etag: authority.etag,
      freshness: authority.freshness,
    }, pluginOperationController?.active ?? false)
    const generation = host?.current
    const runtimeEvidence = generation === undefined
      ? null
      : await new PluginRuntimeVerifier().readEvidence(generation.origin).catch(() => null)
    return deriveInstalledPluginProjection({
      profileDirectory: join(resolveDshHome(), 'profiles', 'web'),
      installAnchor: paths.cliManifest,
      fingerprint,
      catalog: authority,
      systemComponents,
      runtimeEvidence,
      operation: pluginOperationController?.getOperation() ?? null,
    })
  })
  ipcMain.handle(DESKTOP_CHANNELS.pluginOperationGet, (event) => {
    assertDesktopSender(event)
    return pluginOperationController?.getOperation() ?? null
  })
  ipcMain.handle(DESKTOP_CHANNELS.pluginOperationStart, async (event, value: unknown) => {
    assertDesktopSender(event)
    if (pluginRecoveryStartupBlocked) throw new Error('plugin recovery must finish before another operation can start')
    const controller = pluginOperationController
    if (controller === undefined) throw new Error('plugin operation controller is unavailable')
    return typeof value === 'object' && value !== null && 'action' in value
      ? await controller.manage(value)
      : await controller.start(value)
  })
  ipcMain.handle(DESKTOP_CHANNELS.pluginOwnedDataGetOffer, async (event) => {
    assertDesktopSender(event)
    const remover = pluginOwnedDataRemover
    if (remover === undefined) throw new Error('plugin-owned data remover is unavailable')
    return await remover.currentOffer()
  })
  ipcMain.handle(DESKTOP_CHANNELS.pluginOwnedDataRemove, async (event, value: unknown) => {
    assertDesktopSender(event)
    const remover = pluginOwnedDataRemover
    if (remover === undefined) throw new Error('plugin-owned data remover is unavailable')
    return await remover.remove(value)
  })
  ipcMain.handle(DESKTOP_CHANNELS.pluginOwnedDataRetain, async (event, value: unknown) => {
    assertDesktopSender(event)
    const remover = pluginOwnedDataRemover
    if (remover === undefined) throw new Error('plugin-owned data remover is unavailable')
    return await remover.retain(value)
  })
  ipcMain.handle(DESKTOP_CHANNELS.pluginRecoveryGet, (event) => {
    assertRecoverySender(event)
    return pluginRecoveryController?.getSnapshot() ?? null
  })
  ipcMain.handle(DESKTOP_CHANNELS.pluginRecoveryRetry, async (event, value: unknown) => {
    assertRecoverySender(event)
    const request = decodePluginRecoveryRetryRequest(value)
    const recovery = pluginRecoveryController
    if (recovery === undefined) throw new Error('plugin recovery controller is unavailable')
    const result = await recovery.retry(request.operationId)
    if (result?.phase === 'rolled-back') {
      pluginRecoveryStartupBlocked = false
      const window = mainWindow
      const origin = currentHostOrigin()
      if (window !== undefined && !window.isDestroyed() && origin !== undefined) {
        await loadWindowHost(window, origin, PLUGIN_CENTER_PAGE_ID)
      }
    }
    return result
  })
  ipcMain.handle(DESKTOP_CHANNELS.pluginRecoveryExport, async (event, value: unknown) => {
    assertRecoverySender(event)
    const request = decodePluginDiagnosticExportRequest(value)
    const exporter = pluginDiagnosticExporter
    if (exporter === undefined) throw new Error('plugin recovery diagnostics are unavailable')
    return await exporter.export(request.operationId, async (defaultFilename) => {
      const options = {
        title: '导出插件恢复诊断',
        defaultPath: defaultFilename,
        filters: [{ name: 'JSON', extensions: ['json'] }],
      }
      const result = mainWindow === undefined
        ? await dialog.showSaveDialog(options)
        : await dialog.showSaveDialog(mainWindow, options)
      return result.canceled ? null : result.filePath
    })
  })
  return {
    catalog,
    transactionCompatibility,
    readTransactionFingerprint: selection => readFingerprint(selection, false),
    systemComponents,
    paths,
  }
}

/** Assemble the trusted install, management, and startup-recovery backend. */
async function initializePluginOperations(backend: PluginCenterBackend): Promise<PluginStartupRecoveryResult> {
  const currentHost = host
  const currentLifecycle = lifecycle
  if (currentHost === undefined || currentLifecycle === undefined) {
    throw new Error('plugin operation backend requires the current Host and window lifecycle')
  }
  const dshHome = resolveDshHome()
  const profileDirectory = join(dshHome, 'profiles', 'web')
  const root = join(app.getPath('userData'), 'plugin-center')
  const operationsDirectory = join(root, 'operations')
  const journal = new PluginOperationJournal(join(root, 'journal'))
  const snapshotStore = new ProfileSnapshotStore(profileDirectory, join(root, 'snapshots'))
  const ownedDataAuthorityStore = new PluginOwnedDataAuthorityStore(join(root, 'owned-data-authority'))
  const profileLock = new ProfileMutationLock(profileDirectory)
  const runtimeVerifier = new PluginRuntimeVerifier()
  const packageManager = {
    executable: backend.paths.nodeExecutable,
    packageManagerEntry: backend.paths.packageManagerEntry,
    profileDirectory,
    storeDirectory: join(app.getPath('userData'), 'plugin-store'),
    homeDirectory: app.getPath('home'),
    electronRunAsNode: backend.paths.electronRunAsNode,
    platform: process.platform,
  } as const
  const recovery = new PluginRecoveryController({
    journal,
    snapshotStore,
    profileLock,
    packageManager,
    host: currentHost,
    runtimeVerifier,
    reloadHost: origin => currentLifecycle.reloadHost(origin, PLUGIN_CENTER_PAGE_ID),
  })
  pluginRecoveryController = recovery
  pluginDiagnosticExporter = new PluginRecoveryDiagnosticExporter(journal)
  pluginOwnedDataRemover = new PluginOwnedDataRemover(
    join(app.getPath('userData'), 'plugin-data'),
    journal,
    ownedDataAuthorityStore,
  )
  recovery.subscribe((snapshot) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) window.webContents.send(DESKTOP_CHANNELS.pluginRecoveryState, snapshot)
    }
  })
  const sharedExecutorOptions = {
    compatibility: backend.transactionCompatibility,
    platform: resolveSupportedPluginPlatform(process.platform, process.arch),
    downloader: new PluginArtifactDownloader(operationsDirectory),
    profileLock,
    snapshotStore,
    ownedDataAuthorityStore,
    packageManager,
    profileDirectory,
    installAnchor: backend.paths.cliManifest,
    host: currentHost,
    reloadHost: (origin: string) => currentLifecycle.reloadHost(origin, PLUGIN_CENTER_PAGE_ID),
    runtimeVerifier,
    postFingerprint: backend.readTransactionFingerprint,
  } as const
  const installRunner = createTrustedInstallRunner(sharedExecutorOptions)
  const managementRunner = createTrustedManagementRunner(sharedExecutorOptions)
  const controller = new PluginOperationController(
    journal,
    (request, controls) => request.action === 'install'
      ? installRunner(request, controls)
      : managementRunner(request, controls),
    () => snapshotStore.identity(),
    async (failureCode) => { await recovery.recoverOpen(failureCode) },
  )
  const startup = await preparePluginCenterStartup({
    journal,
    recovery,
    startNormalHost: async () => {
      const webProfileBundles = PROFILE_TEMPLATES['web']
      if (webProfileBundles === undefined) throw new Error('web Profile template is unavailable')
      initProfile(profileDirectory, [...webProfileBundles, ...BUILT_IN_APPLICATION_BUNDLES])
      reconcileBuiltInApplications(profileDirectory, BUILT_IN_APPLICATION_BUNDLES)
      for (const manifestPath of backend.paths.shippedBundleManifests) {
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { readonly name?: string }
        if (manifest.name !== undefined && BUILT_IN_APPLICATION_BUNDLES.includes(
          manifest.name as typeof BUILT_IN_APPLICATION_BUNDLES[number],
        )) {
          healProfilesModuleFallback(manifestPath, dshHome)
        }
      }
      const dshmarketMigration = await migrateLegacyDshmarketRegistration({
        profileDirectory,
        installAnchor: backend.paths.cliManifest,
      })
      if (dshmarketMigration.removedEntries > 0) {
        console.warn(`removed ${dshmarketMigration.removedEntries} legacy dshmarket registration(s) before Host start`)
      }
      const authority = await backend.catalog.installedAuthority()
      const selection = {
        candidate: null,
        candidates: authority.preflights,
        etag: authority.etag,
        freshness: authority.freshness,
      } satisfies CatalogPreflightSelection
      const compatibility = await reconcileApplicationUpdateCompatibility({
        profileDirectory,
        fingerprint: backend.readTransactionFingerprint(selection),
        candidates: authority.preflights,
      })
      for (const item of compatibility.deactivated) {
        console.warn(`disabled incompatible plugin before Host start: ${item.pluginId}@${item.version}`)
      }
      if (await migrateLegacyBundledContentPreset({
        homeDirectory: dshHome,
        bundledPresetRoot: bundledPresetRoot(),
      })) {
        console.warn('migrated legacy bundled content Preset before Host start')
      }
      return await currentHost.start()
    },
  })
  if (startup.recovery?.operationId !== UNREADABLE_PLUGIN_JOURNAL_OPERATION_ID) {
    await controller.initialize()
    controller.subscribe((operation) => {
      for (const window of BrowserWindow.getAllWindows()) {
        if (!window.isDestroyed()) window.webContents.send(DESKTOP_CHANNELS.pluginOperationState, operation)
      }
    })
    pluginOperationController = controller
  }
  return startup
}

function createTray(): void {
  tray = new Tray(trayImage())
  tray.setToolTip(APP_NAME)
  const template: MenuItemConstructorOptions[] = [
    { label: '打开主窗口', click: () => { void lifecycle?.showWindow() } },
    { type: 'separator' },
    { label: '退出', click: () => { void requestAppQuit() } },
  ]
  tray.setContextMenu(Menu.buildFromTemplate(template))
  tray.on('click', () => { void lifecycle?.showWindow() })
}

function releaseAppQuit(): void {
  quitReleased = true
  tray?.destroy()
  tray = undefined
  app.quit()
}

/** Join explicit quit requests even while the Host or window is still starting. */
function requestAppQuit(): Promise<void> {
  if (lifecycle !== undefined) return lifecycle.requestQuit()
  bootQuitPromise ??= (host?.shutdown() ?? Promise.resolve()).catch((error: unknown) => {
    console.error('desktop shutdown failed:', error)
  }).then(() => {
    releaseAppQuit()
  })
  return bootQuitPromise
}

async function boot(): Promise<void> {
  if (bootQuitPromise !== undefined) return
  const pluginCenter = registerDesktopBridge()
  const paths = pluginCenter.paths
  assertHostArtifacts(paths)
  host = createHostSupervisor({
    spawnHost: () => spawnDshWeb({
      ...paths,
      env: withPresetRuntimeEnvironment({
        ...process.env,
        DSH_DESKTOP: '1',
      }, resolveDshHome()),
    }),
    log: chunk => process.stderr.write(chunk),
    onUnexpectedExit: ({ code, signal }) => {
      console.error(`desktop Host exited unexpectedly (code ${String(code)}, signal ${String(signal)})`)
      void requestAppQuit()
    },
  })
  hardenSession()
  lifecycle = createDesktopLifecycle({
    getWindow: () => mainWindow,
    createWindow: createMainWindow,
    loadHost: async (window, origin, primaryPage) => {
      await reloadWindowHost(window as BrowserWindow, origin, primaryPage)
    },
    disposeHost: async () => { await host?.shutdown() },
    quit: releaseAppQuit,
    reportError: (error) => { console.error('desktop shutdown failed:', error) },
  })
  const pluginStartup = await initializePluginOperations(pluginCenter)
  pluginRecoveryStartupBlocked = pluginStartup.mode === 'recovery-failed'
  createTray()
  await lifecycle.showWindow()
  if (app.isPackaged && !pluginRecoveryStartupBlocked) {
    setTimeout(() => { void updateController?.check() }, 5_000)
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else if (isInstallerQuitRequest(process.argv)) {
  app.quit()
} else {
  app.on('second-instance', (_event, commandLine) => {
    if (isInstallerQuitRequest(commandLine)) {
      void requestAppQuit()
      return
    }
    void lifecycle?.showWindow()
  })
  app.on('activate', () => { void lifecycle?.showWindow() })
  app.on('window-all-closed', () => {
    // Tray and Host own application lifetime on every platform.
  })
  app.on('before-quit', (event: Event) => {
    if (quitReleased) return
    event.preventDefault()
    void requestAppQuit()
  })
  app.whenReady().then(boot).catch(async (error: unknown) => {
    console.error('desktop startup failed:', error)
    if (bootQuitPromise === undefined) {
      await dialog.showMessageBox({
        type: 'error',
        title: `${APP_NAME} failed to start`,
        message: error instanceof Error ? error.message : String(error),
      })
    }
    await requestAppQuit()
  })
}
