/** Electron-updater lifecycle normalized for the renderer settings page. */

import type { DesktopUpdateState } from './desktop-bridge-contract.ts'

type UpdateInfo = { readonly version: string }
type ProgressInfo = { readonly percent: number }

/** Minimal electron-updater face used by the controller and its tests. */
export interface UpdaterDriver {
  autoDownload: boolean
  autoInstallOnAppQuit: boolean
  on(event: 'checking-for-update', listener: () => void): this
  on(event: 'update-available' | 'update-not-available' | 'update-downloaded', listener: (info: UpdateInfo) => void): this
  on(event: 'download-progress', listener: (info: ProgressInfo) => void): this
  on(event: 'error', listener: (error: Error) => void): this
  checkForUpdates(): Promise<unknown>
  downloadUpdate(): Promise<unknown>
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void
}

/** State owner for one packaged application update lifecycle. */
export class DesktopUpdateController {
  private state: DesktopUpdateState
  private readonly listeners = new Set<(state: DesktopUpdateState) => void>()
  private readonly updater: UpdaterDriver
  private readonly packaged: boolean

  /**
   * @param updater - electron-updater singleton or a test driver.
   * @param currentVersion - running app version.
   * @param harnessVersion - Harness core version embedded in the Host runtime.
   * @param packaged - false for source development runs, where real update installation is unavailable.
   */
  constructor(
    updater: UpdaterDriver,
    currentVersion: string,
    harnessVersion: string,
    packaged: boolean,
  ) {
    this.updater = updater
    this.packaged = packaged
    this.state = packaged
      ? { phase: 'idle', currentVersion, harnessVersion }
      : {
        phase: 'development',
        currentVersion,
        harnessVersion,
        message: '当前为开发版；正式安装包生成后即可从发布源检查更新。',
      }
    updater.autoDownload = false
    updater.autoInstallOnAppQuit = true
    updater.on('checking-for-update', () => {
      this.publish({ phase: 'checking', currentVersion, harnessVersion })
    })
    updater.on('update-available', (info) => {
      this.publish({ phase: 'available', currentVersion, harnessVersion, availableVersion: info.version })
    })
    updater.on('update-not-available', () => {
      this.publish({ phase: 'up-to-date', currentVersion, harnessVersion })
    })
    updater.on('download-progress', (info) => {
      this.publish({
        phase: 'downloading',
        currentVersion,
        harnessVersion,
        ...this.state.availableVersion === undefined ? {} : { availableVersion: this.state.availableVersion },
        progress: Math.max(0, Math.min(100, info.percent)),
      })
    })
    updater.on('update-downloaded', (info) => {
      this.publish({
        phase: 'ready',
        currentVersion,
        harnessVersion,
        availableVersion: info.version,
        progress: 100,
      })
    })
    updater.on('error', (error) => {
      this.fail(error, this.state.phase === 'downloading' ? 'download' : 'check')
    })
  }

  /** Current immutable snapshot. */
  getState(): DesktopUpdateState {
    return this.state
  }

  /** Subscribe to state changes. */
  subscribe(listener: (state: DesktopUpdateState) => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /** Check the configured release provider. Development builds remain explicit no-ops. */
  async check(): Promise<DesktopUpdateState> {
    if (!this.packaged) return this.state
    try {
      await this.updater.checkForUpdates()
    } catch (error) {
      this.fail(error, 'check')
    }
    return this.state
  }

  /** Download an update that the preceding check reported. */
  async download(): Promise<DesktopUpdateState> {
    if (!this.packaged) return this.state
    if (this.state.phase !== 'available' && this.state.phase !== 'error') return this.state
    this.publish({
      phase: 'downloading',
      currentVersion: this.state.currentVersion,
      harnessVersion: this.state.harnessVersion,
      ...this.state.availableVersion === undefined ? {} : { availableVersion: this.state.availableVersion },
      progress: 0,
    })
    try {
      await this.updater.downloadUpdate()
    } catch (error) {
      this.fail(error, 'download')
    }
    return this.state
  }

  /** Restart into the already downloaded update. */
  install(): void {
    if (this.state.phase !== 'ready') throw new Error('desktop update is not ready to install')
    this.updater.quitAndInstall(false, true)
  }

  private publish(next: DesktopUpdateState): void {
    this.state = Object.freeze({ ...next })
    for (const listener of this.listeners) {
      try {
        listener(this.state)
      } catch (error) {
        console.error('desktop update listener failed:', error)
      }
    }
  }

  private fail(error: unknown, action: 'check' | 'download'): void {
    console.error(`desktop update ${action} failed:`, error)
    this.publish({
      phase: 'error',
      currentVersion: this.state.currentVersion,
      harnessVersion: this.state.harnessVersion,
      ...this.state.availableVersion === undefined ? {} : { availableVersion: this.state.availableVersion },
      message: friendlyUpdateError(error, action),
    })
  }
}

/** Convert release-provider failures into stable learner-facing Chinese text. */
export function friendlyUpdateError(error: unknown, action: 'check' | 'download'): string {
  const message = error instanceof Error ? error.message : String(error)
  if (/Cannot find channel .* update info|\b404 Not Found\b/i.test(message)) {
    return action === 'download'
      ? '更新文件暂时不可用，请稍后再试。'
      : '更新服务正在准备中，请稍后再试。'
  }
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|ERR_INTERNET_DISCONNECTED|network|网络/i.test(message)) {
    return action === 'download'
      ? '暂时无法下载更新，请检查网络后重试。'
      : '暂时无法连接更新服务，请检查网络后重试。'
  }
  return action === 'download' ? '下载更新失败，请稍后再试。' : '检查更新失败，请稍后再试。'
}
