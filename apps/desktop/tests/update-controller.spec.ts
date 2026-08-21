import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import { DesktopUpdateController, friendlyUpdateError, type UpdaterDriver } from '../src/update-controller.ts'

class FakeUpdater extends EventEmitter implements UpdaterDriver {
  autoDownload = true
  autoInstallOnAppQuit = false
  checkForUpdates = vi.fn<() => Promise<unknown>>().mockResolvedValue(undefined)
  downloadUpdate = vi.fn<() => Promise<unknown>>().mockResolvedValue(undefined)
  quitAndInstall = vi.fn()
}

describe('desktop update controller', () => {
  it('keeps source development explicit and never contacts a release provider', async () => {
    const updater = new FakeUpdater()
    const controller = new DesktopUpdateController(updater, '0.1.0-rc.5', '0.1.1-rc.2', false)
    expect(controller.getState()).toMatchObject({
      phase: 'development', currentVersion: '0.1.0-rc.5', harnessVersion: '0.1.1-rc.2',
    })
    await controller.check()
    expect(updater.checkForUpdates).not.toHaveBeenCalled()
    expect(updater.autoDownload).toBe(false)
    expect(updater.autoInstallOnAppQuit).toBe(true)
  })

  it('publishes check, availability, progress, and ready states', async () => {
    const updater = new FakeUpdater()
    const controller = new DesktopUpdateController(updater, '1.0.0', '2.0.0', true)
    const phases: string[] = []
    controller.subscribe((state) => { phases.push(state.phase) })
    updater.emit('checking-for-update')
    updater.emit('update-available', { version: '1.1.0' })
    await controller.download()
    updater.emit('download-progress', { percent: 42.5 })
    updater.emit('update-downloaded', { version: '1.1.0' })
    expect(phases).toEqual(['checking', 'available', 'downloading', 'downloading', 'ready'])
    expect(controller.getState()).toEqual({
      phase: 'ready', currentVersion: '1.0.0', harnessVersion: '2.0.0',
      availableVersion: '1.1.0', progress: 100,
    })
    controller.install()
    expect(updater.quitAndInstall).toHaveBeenCalledWith(false, true)
  })

  it('normalizes updater failures without throwing through the renderer bridge', async () => {
    const updater = new FakeUpdater()
    updater.checkForUpdates.mockRejectedValueOnce(new Error('feed unavailable'))
    const controller = new DesktopUpdateController(updater, '1.0.0', '2.0.0', true)
    await expect(controller.check()).resolves.toMatchObject({ phase: 'error', message: '检查更新失败，请稍后再试。' })
    expect(() => { controller.install() }).toThrow('not ready')
  })

  it('does not expose provider URLs or generic authentication advice when channel metadata is missing', async () => {
    const raw = 'Cannot find channel "rc-mac.yml" update info: HttpError: 404 Not Found url: https://example.invalid/rc-mac.yml Please double check that your authentication token is correct.'
    expect(friendlyUpdateError(new Error(raw), 'check')).toBe('更新服务正在准备中，请稍后再试。')
    expect(friendlyUpdateError(new Error(raw), 'download')).toBe('更新文件暂时不可用，请稍后再试。')
  })

  it('gives separate actionable network messages for checking and downloading', () => {
    const failure = new Error('connect ETIMEDOUT')
    expect(friendlyUpdateError(failure, 'check')).toBe('暂时无法连接更新服务，请检查网络后重试。')
    expect(friendlyUpdateError(failure, 'download')).toBe('暂时无法下载更新，请检查网络后重试。')
  })

  it('contains subscriber exceptions and still notifies later subscribers', () => {
    const updater = new FakeUpdater()
    const controller = new DesktopUpdateController(updater, '1.0.0', '2.0.0', true)
    const received = vi.fn()
    controller.subscribe(() => { throw new Error('listener failure') })
    controller.subscribe(received)
    updater.emit('update-not-available', { version: '1.0.0' })
    expect(received).toHaveBeenCalledWith({
      phase: 'up-to-date', currentVersion: '1.0.0', harnessVersion: '2.0.0',
    })
  })
})
