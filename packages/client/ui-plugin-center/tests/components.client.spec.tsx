// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PluginCenterTab, type PluginCenterTabProps } from '../src/client/PluginCenterTab.tsx'
import { en, type PluginCenterLocaleKey } from '../src/client/locales.ts'
import {
  compatibilityDecision, detail, detailResult, installedListResult, listResult, operation, summary,
} from './fixtures.ts'

afterEach(cleanup)

const t = ((key: PluginCenterLocaleKey): string => en[key]) as PluginCenterTabProps['t']

function props(values: Partial<PluginCenterTabProps> = {}): PluginCenterTabProps {
  return {
    available: true,
    development: false,
    list: async query => listResult(query),
    refresh: async query => listResult(query),
    detail: async () => detailResult(detail()),
    checkCompatibility: async () => compatibilityDecision(),
    listInstalled: async () => installedListResult(),
    openPluginSettings: () => {},
    mutationsEnabled: false,
    install: async () => { throw new Error('release gated') },
    manage: async () => { throw new Error('release gated') },
    getOperation: async () => null,
    onOperationState: () => () => {},
    t,
    ...values,
  } as PluginCenterTabProps
}

function withoutInstalledPlugin(pluginId: string): ReturnType<typeof installedListResult> {
  const result = installedListResult()
  return { ...result, items: result.items.filter(item => item.pluginId !== pluginId) }
}

describe('catalog states', () => {
  it('renders browser absence without attempting a catalog read', () => {
    const list = vi.fn()
    render(<PluginCenterTab {...props({ available: false, list })} />)
    expect(screen.getByText(en.unavailable)).toBeTruthy()
    expect(screen.getByText(en.unavailableHint)).toBeTruthy()
    expect(list).not.toHaveBeenCalled()
  })

  it('shows structured first-paint skeletons before starting the background refresh', async () => {
    let resolveList!: (result: ReturnType<typeof listResult>) => void
    const firstRead = new Promise<ReturnType<typeof listResult>>((resolve) => { resolveList = resolve })
    const list = vi.fn<PluginCenterTabProps['list']>(() => firstRead)
    const refresh = vi.fn<PluginCenterTabProps['refresh']>(async query => listResult(query))
    const view = render(<PluginCenterTab {...props({ list, refresh })} />)

    expect(screen.getByRole('status', { name: en.loading })).toBeTruthy()
    expect(view.container.querySelectorAll('[data-catalog-skeleton-card]')).toHaveLength(6)
    expect(refresh).not.toHaveBeenCalled()

    await act(async () => { resolveList(listResult({ catalogKind: 'plugin', scope: 'public', query: '', limit: 24 })) })

    expect((await screen.findAllByText('Workspace tools')).length).toBeGreaterThan(0)
    await waitFor(() => { expect(refresh).toHaveBeenCalledTimes(1) })
  })

  it('shows the hierarchy, both kinds, scope, deterministic sections, search, and freshness', async () => {
    const list = vi.fn<PluginCenterTabProps['list']>(async query =>
      listResult(query, query.catalogKind === 'skill-pack' ? 'cached' : 'fresh'))
    const view = render(<PluginCenterTab {...props({ development: true, list })} />)

    expect(await screen.findByRole('heading', { name: en.title })).toBeTruthy()
    expect(view.container.firstElementChild?.getAttribute('data-development')).toBe('true')
    expect(screen.getByText(en.installedTitle)).toBeTruthy()
    expect(screen.getByRole('searchbox', { name: en.searchPlugins })).toBeTruthy()
    expect(screen.getByRole('button', { name: en.publicScope }).getAttribute('aria-pressed')).toBe('true')
    expect((await screen.findAllByText('Workspace tools')).length).toBe(3)
    const logo = view.container.querySelector<HTMLImageElement>(
      'img[src="https://avatars.githubusercontent.com/fixture?s=128"]',
    )
    expect(logo).not.toBeNull()
    fireEvent.error(logo!)
    expect(logo?.hidden).toBe(true)
    expect(logo?.parentElement?.textContent).toContain('W')
    expect(screen.getByRole('heading', { name: en.featured })).toBeTruthy()
    expect(screen.getByRole('heading', { name: en.popular })).toBeTruthy()
    expect(screen.getByRole('heading', { name: en.recent })).toBeTruthy()
    expect(screen.getByRole('button', { name: en.refresh }).getAttribute('title')).toContain(en.networkSource)
    expect(screen.getByText(new RegExp(en.networkSource))).toBeTruthy()
    const catalogActionButtons = await screen.findAllByRole('button', {
      name: `${en.pluginActions}：Workspace tools`,
    })
    expect(catalogActionButtons).toHaveLength(3)
    expect(screen.queryByRole('button', { name: en.install })).toBeNull()

    const plugins = screen.getByRole('tab', { name: en.plugins })
    const skills = screen.getByRole('tab', { name: en.skills })
    plugins.focus()
    fireEvent.keyDown(plugins, { key: 'ArrowRight' })
    expect(document.activeElement).toBe(skills)
    expect(skills.getAttribute('aria-selected')).toBe('true')
    expect(await screen.findByRole('searchbox', { name: en.searchSkills })).toBeTruthy()
    expect(screen.getByRole('heading', { name: en.skillsTitle })).toBeTruthy()
    expect((await screen.findAllByText('Harness basics')).length).toBe(3)
    expect(screen.getByText(en.skillsIntro)).toBeTruthy()
    expect(screen.getByRole('button', { name: en.refresh }).getAttribute('title')).toContain(en.cacheSource)

    const search = screen.getByRole('searchbox', { name: en.searchSkills })
    fireEvent.change(search, { target: { value: 'Harness' } })
    expect(await screen.findByRole('heading', { name: en.searchResults })).toBeTruthy()
    expect(await screen.findByText('Harness basics')).toBeTruthy()
    fireEvent.change(search, { target: { value: 'missing' } })
    expect(await screen.findByText(en.emptySearch)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: en.localScope }))
    expect(await screen.findByText(en.emptySearch)).toBeTruthy()
    fireEvent.change(screen.getByRole('searchbox', { name: en.searchSkills }), { target: { value: '' } })
    expect(await screen.findByText(en.empty)).toBeTruthy()
    expect(list).toHaveBeenCalledWith(expect.objectContaining({ catalogKind: 'skill-pack', scope: 'local' }))
  })

  it('renders actionable discovery context returned by the catalog', async () => {
    const mapped = {
      ...listResult({ catalogKind: 'plugin', scope: 'public', query: '', limit: 24 }),
      notice: 'github-mapped' as const,
    }
    render(<PluginCenterTab {...props({
      list: async () => mapped,
      refresh: async () => mapped,
    })} />)

    expect(await screen.findByText(en.githubMapped)).toBeTruthy()
  })

  it('opens installed lifecycle actions from the catalog overflow menu', async () => {
    render(<PluginCenterTab {...props({ mutationsEnabled: true })} />)

    const actionButtons = await screen.findAllByRole('button', {
      name: `${en.pluginActions}：Workspace tools`,
    })
    fireEvent.click(actionButtons[0]!)

    const menu = await screen.findByRole('menu')
    expect(within(menu).getByRole('menuitem', { name: en.updatePlugin })).toBeTruthy()
    expect(within(menu).getByRole('menuitem', { name: en.disablePlugin })).toBeTruthy()
    expect(within(menu).getByRole('menuitem', { name: en.uninstallPlugin })).toBeTruthy()
    expect(within(menu).queryByRole('menuitem', { name: en.enablePlugin })).toBeNull()

    fireEvent.click(within(menu).getByRole('menuitem', { name: en.disablePlugin }))
    expect(await screen.findByRole('heading', {
      name: `${en.confirmDisableTitle} · Workspace tools`,
    })).toBeTruthy()
  })

  it('checks an exact catalog version before confirming and starting a quick install', async () => {
    let publish: ((value: ReturnType<typeof operation>) => void) | undefined
    const checkCompatibility = vi.fn(async () => compatibilityDecision())
    const install = vi.fn<PluginCenterTabProps['install']>(async request => ({
      kind: 'started',
      operation: { ...operation(), idempotencyKey: request.idempotencyKey },
    }))
    render(<PluginCenterTab {...props({
      mutationsEnabled: true,
      listInstalled: async () => withoutInstalledPlugin('fixture.workspace-tools'),
      checkCompatibility,
      install,
      onOperationState: (listener) => {
        publish = listener
        return () => { publish = undefined }
      },
    })} />)

    const quickInstall = (await screen.findAllByRole('button', { name: en.install }))[0]!
    expect(quickInstall.hasAttribute('disabled')).toBe(false)
    fireEvent.click(quickInstall)

    expect(await screen.findByRole('heading', {
      name: `${en.confirmInstallTitle} · Workspace tools`,
    })).toBeTruthy()
    expect(checkCompatibility).toHaveBeenCalledWith({
      pluginId: 'fixture.workspace-tools', version: '1.0.0', action: 'install',
    })
    expect(screen.queryByText('Complete fixture detail.')).toBeNull()
    expect(install).not.toHaveBeenCalled()

    const confirm = screen.getByRole('button', { name: en.confirmInstall })
    expect(confirm.hasAttribute('disabled')).toBe(true)
    fireEvent.click(screen.getByRole('checkbox', { name: en.confirmInstallAcknowledge }))
    fireEvent.click(confirm)

    expect(await screen.findByRole('heading', { name: en.installationProgress })).toBeTruthy()
    expect(install).toHaveBeenCalledWith(expect.objectContaining({
      pluginId: 'fixture.workspace-tools',
      version: '1.0.0',
    }))
    await act(async () => { publish?.(operation('committed')) })
    expect(screen.getAllByRole('button', {
      name: `${en.pluginActions}：Workspace tools`,
    }).length).toBeGreaterThan(0)
  })

  it('releases catalog and detail installation after an earlier operation rolls back', async () => {
    render(<PluginCenterTab {...props({
      mutationsEnabled: true,
      listInstalled: async () => withoutInstalledPlugin('fixture.workspace-tools'),
      getOperation: async () => operation('rolled-back'),
    })} />)

    const quickInstall = (await screen.findAllByRole('button', { name: en.install }))[0]!
    expect(quickInstall.hasAttribute('disabled')).toBe(false)

    fireEvent.click((await screen.findAllByRole('button', {
      name: `${en.details}：Workspace tools`,
    }))[0]!)
    const detailPage = await screen.findByRole('main')
    expect(within(detailPage).getByRole('button', { name: en.install }).hasAttribute('disabled')).toBe(false)
  })

  it('does not present a committed uninstall as a completed install in exact details', async () => {
    render(<PluginCenterTab {...props({
      mutationsEnabled: true,
      listInstalled: async () => withoutInstalledPlugin('fixture.workspace-tools'),
      getOperation: async () => ({ ...operation('committed'), action: 'uninstall' }),
    })} />)

    fireEvent.click((await screen.findAllByRole('button', {
      name: `${en.details}：Workspace tools`,
    }))[0]!)
    const detailPage = await screen.findByRole('main')
    const installButton = within(detailPage).getByRole('button', { name: en.install })
    expect(installButton.hasAttribute('disabled')).toBe(false)
  })

  it('opens exact details when a catalog quick install is denied', async () => {
    const denied = compatibilityDecision({
      allowed: false,
      reasons: [{
        code: 'platform-unsupported',
        subject: 'darwin-arm64',
        actual: 'darwin-arm64',
        expected: 'win32-x64',
      }],
    })
    const checkCompatibility = vi.fn(async () => denied)
    const install = vi.fn<PluginCenterTabProps['install']>()
    render(<PluginCenterTab {...props({
      mutationsEnabled: true,
      listInstalled: async () => withoutInstalledPlugin('fixture.workspace-tools'),
      checkCompatibility,
      install,
    })} />)

    fireEvent.click((await screen.findAllByRole('button', { name: en.install }))[0]!)
    expect(await screen.findByText(en.installationBlocked)).toBeTruthy()
    expect(screen.getByText(en.reasonPlatformUnsupported)).toBeTruthy()
    expect(screen.getByRole('button', { name: en.cannotInstall }).hasAttribute('disabled')).toBe(true)
    expect(install).not.toHaveBeenCalled()
  })

  it('labels stale cache, contains failures, retries, and ignores a late result after unmount', async () => {
    const stale = listResult({ catalogKind: 'plugin', scope: 'public', query: '', limit: 24 }, 'stale')
    const list = vi.fn<PluginCenterTabProps['list']>().mockRejectedValue(new Error('private transport detail'))
    const refresh = vi.fn<PluginCenterTabProps['refresh']>().mockRejectedValue(new Error('offline'))
    const view = render(<PluginCenterTab {...props({ list, refresh })} />)
    expect((await screen.findByRole('alert')).textContent).toBe(en.error)
    expect(screen.queryByText('private transport detail')).toBeNull()

    refresh.mockResolvedValue(stale)
    fireEvent.click(screen.getByRole('button', { name: en.retry }))
    expect((await screen.findAllByText(new RegExp(en.stale))).length).toBeGreaterThan(0)
    expect(screen.getAllByText(new RegExp(en.cacheSource)).length).toBeGreaterThan(0)
    view.unmount()

    const deferred = Promise.withResolvers<ReturnType<typeof listResult>>()
    const pending = render(<PluginCenterTab {...props({
      list: () => deferred.promise,
      refresh: () => new Promise(() => {}),
    })} />)
    pending.unmount()
    await act(async () => { deferred.resolve(stale) })
  })
})

describe('recovery state', () => {
  it('shows honest recovery failure, exports diagnostics, and retries the same operation', async () => {
    const failed = {
      schemaVersion: 1 as const,
      operationId: 'operation-1',
      phase: 'recovery-failed' as const,
      recoveryPhase: null,
      operationFailureCode: 'package-mutation-failed' as const,
      recoveryReasonCode: 'runtime-verification-failed' as const,
      attempt: 1,
      updatedAt: '2026-08-15T05:00:02.000Z',
      canRetry: true,
      canExportDiagnostics: true,
    }
    const retryRecovery = vi.fn<NonNullable<PluginCenterTabProps['retryRecovery']>>(async request => ({
      ...failed,
      operationId: request.operationId,
      phase: 'rolled-back',
      recoveryReasonCode: null,
      attempt: 2,
      canRetry: false,
    }))
    const exportRecoveryDiagnostics = vi.fn<NonNullable<PluginCenterTabProps['exportRecoveryDiagnostics']>>(
      async request => ({
        operationId: request.operationId,
        status: 'saved',
        filename: `dsh-plugin-recovery-${request.operationId}.json`,
        sha256: 'd'.repeat(64),
        bytes: 2_048,
      }),
    )
    render(<PluginCenterTab {...props({
      getRecovery: async () => failed,
      retryRecovery,
      exportRecoveryDiagnostics,
    })} />)

    expect(await screen.findByText(en.recoveryFailedTitle)).toBeTruthy()
    expect(screen.getByText(en.recoveryReasonRuntimeVerificationFailed)).toBeTruthy()
    expect(screen.getByText(new RegExp('runtime-verification-failed'))).toBeTruthy()
    expect(screen.getByText(`${en.recoveryAttempt} 1`)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: en.exportDiagnostics }))
    expect(await screen.findByText(en.diagnosticSaved)).toBeTruthy()
    expect(exportRecoveryDiagnostics).toHaveBeenCalledWith({ operationId: 'operation-1' })

    fireEvent.click(screen.getByRole('button', { name: en.retryRecovery }))
    await waitFor(() => { expect(screen.queryByText(en.recoveryFailedTitle)).toBeNull() })
    expect(retryRecovery).toHaveBeenCalledWith({ operationId: 'operation-1' })
  })

  it('presents active recovery without exposing a completed failure reason', async () => {
    render(<PluginCenterTab {...props({
      getRecovery: async () => ({
        schemaVersion: 1,
        operationId: 'operation-2',
        phase: 'recovering',
        recoveryPhase: 'recovery-restoring-profile',
        operationFailureCode: 'package-mutation-failed',
        recoveryReasonCode: null,
        attempt: 2,
        updatedAt: '2026-08-15T05:00:03.000Z',
        canRetry: false,
        canExportDiagnostics: false,
      }),
    })} />)

    expect(await screen.findByText(en.recoveryRunningTitle)).toBeTruthy()
    expect(screen.getByText(en.recoveryReasonPending)).toBeTruthy()
    expect(screen.getByText('package-mutation-failed')).toBeTruthy()
    expect(screen.getByText(`${en.recoveryAttempt} 2`)).toBeTruthy()
    expect(screen.getByRole('button', { name: en.retryRecovery }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('button', { name: en.exportDiagnostics }).hasAttribute('disabled')).toBe(true)
  })
})

describe('exact version detail', () => {
  it('opens an in-page exact detail, keeps the real Desktop action release-gated, and restores focus on return', async () => {
    const detailRead = vi.fn(async () => detailResult(detail()))
    render(<PluginCenterTab {...props({ detail: detailRead })} />)
    const opener = (await screen.findAllByRole('button', { name: `${en.details}：Workspace tools` }))[0]!
    fireEvent.click(opener)
    expect(await screen.findByRole('heading', { name: 'Workspace tools' })).toBeTruthy()
    const detailPage = screen.getByRole('main')
    expect(within(detailPage).getByText('Complete fixture detail.')).toBeTruthy()
    expect(within(detailPage).getAllByText(en.verified).length).toBeGreaterThan(0)
    expect(within(detailPage).getByText(new RegExp(en.verifiedHelp))).toBeTruthy()
    expect(within(detailPage).getByText('Reads the selected workspace.')).toBeTruthy()
    expect(within(detailPage).getByRole('heading', { name: en.risk }).parentElement?.textContent).toContain('Reviewed but not sandboxed.')
    expect(within(detailPage).getByRole('button', { name: en.install }).hasAttribute('disabled')).toBe(true)
    expect(within(detailPage).getByText(en.allowedToInstall)).toBeTruthy()
    expect(within(detailPage).getByText(en.authorityWarning)).toBeTruthy()
    expect(detailRead).toHaveBeenCalledWith({ pluginId: 'fixture.workspace-tools', version: '1.0.0' })
    fireEvent.click(screen.getByRole('button', { name: en.backToCatalog }))
    await waitFor(() => { expect(screen.queryByText('Complete fixture detail.')).toBeNull() })
    await waitFor(() => { expect(document.activeElement).toBe(opener) })
  })

  it('confirms exact-version trust, groups streamed phases, and restores a committed operation', async () => {
    let publish: ((value: ReturnType<typeof operation>) => void) | undefined
    const install = vi.fn<PluginCenterTabProps['install']>(async request => ({
      kind: 'started',
      operation: { ...operation(), idempotencyKey: request.idempotencyKey },
    }))
    render(<PluginCenterTab {...props({
      development: true,
      mutationsEnabled: true,
      install,
      onOperationState: (listener) => {
        publish = listener
        return () => { publish = undefined }
      },
    })} />)
    const opener = (await screen.findAllByRole('button', { name: `${en.details}：Workspace tools` }))[0]!
    fireEvent.click(opener)
    const installButton = await screen.findByRole('button', { name: en.install })
    expect(installButton.hasAttribute('disabled')).toBe(false)
    fireEvent.click(installButton)

    expect(await screen.findByRole('heading', {
      name: `${en.confirmInstallTitle} · Workspace tools`,
    })).toBeTruthy()
    expect(install).not.toHaveBeenCalled()
    const confirm = screen.getByRole('button', { name: en.confirmInstall })
    expect(confirm.hasAttribute('disabled')).toBe(true)
    fireEvent.click(screen.getByRole('checkbox', { name: en.confirmInstallAcknowledge }))
    expect(confirm.hasAttribute('disabled')).toBe(false)
    fireEvent.click(confirm)

    expect(await screen.findByRole('heading', { name: en.installationProgress })).toBeTruthy()
    expect(install).toHaveBeenCalledWith(expect.objectContaining({
      pluginId: 'fixture.workspace-tools',
      version: '1.0.0',
    }))
    await act(async () => { publish?.(operation('verifying-runtime')) })
    expect(screen.getAllByText(en.phaseVerifyingRuntime).length).toBeGreaterThan(0)
    expect(screen.getByText(en.progressVerifying)).toBeTruthy()
    await act(async () => { publish?.(operation('committed')) })
    expect(screen.getByText(en.operationCommittedClient)).toBeTruthy()
    expect(screen.getByRole('button', { name: en.installed }).hasAttribute('disabled')).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: en.done }))
    expect(screen.queryByRole('heading', { name: en.installationComplete })).toBeNull()
  })

  it('restores an active trusted-install operation in the progress dialog', async () => {
    const install = vi.fn<PluginCenterTabProps['install']>()
    render(<PluginCenterTab {...props({
      development: true,
      mutationsEnabled: true,
      install,
      getOperation: async () => operation('installing'),
    })} />)

    expect(await screen.findByRole('heading', { name: en.installationProgress })).toBeTruthy()
    expect(screen.getByText(en.progressInstalling)).toBeTruthy()
    expect(screen.getByText(en.phaseInstalling)).toBeTruthy()
    expect(screen.getByText(en.operationKeepOpen)).toBeTruthy()
    expect(install).not.toHaveBeenCalled()
  })

  it('keeps a failed operation recovery-gated without exposing a retry mutation', async () => {
    render(<PluginCenterTab {...props({
      development: true,
      mutationsEnabled: true,
      getOperation: async () => operation('failed'),
    })} />)

    expect(await screen.findByRole('heading', { name: en.installationFailed })).toBeTruthy()
    expect(screen.getByText(en.operationNeedsRecovery)).toBeTruthy()
    expect(screen.getByText(new RegExp(en.operationFailureCode))).toBeTruthy()
    expect(screen.queryByRole('button', { name: en.retryRecovery })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: en.done }))

    const opener = (await screen.findAllByRole('button', { name: `${en.details}：Workspace tools` }))[0]!
    fireEvent.click(opener)
    const gated = await screen.findByRole('button', { name: en.installationFailedAction })
    expect(gated.hasAttribute('disabled')).toBe(true)
  })

  it('handles withdrawn, local, unavailable, and failed exact details without an install action', async () => {
    const withdrawn = { ...detail(), withdrawn: true }
    const detailRead = vi.fn<PluginCenterTabProps['detail']>()
      .mockResolvedValueOnce(detailResult(withdrawn))
      .mockResolvedValueOnce(detailResult(null))
      .mockRejectedValueOnce(new Error('gone'))
    render(<PluginCenterTab {...props({ detail: detailRead })} />)
    const opener = (await screen.findAllByRole('button', { name: `${en.details}：Workspace tools` }))[0]!

    fireEvent.click(opener)
    expect(await screen.findByText(en.withdrawn)).toBeTruthy()
    expect(screen.getByRole('button', { name: en.install }).hasAttribute('disabled')).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: en.backToCatalog }))
    fireEvent.click(opener)
    expect(await screen.findByText(en.detailUnavailable)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: en.backToCatalog }))
    fireEvent.click(opener)
    expect((await screen.findByRole('alert')).textContent).toBe(en.detailError)
    fireEvent.click(screen.getByRole('button', { name: en.backToCatalog }))

    const localEntry = summary('plugin', 'local')
    const localList = vi.fn<PluginCenterTabProps['list']>(async query => listResult({ ...query, scope: 'local' }))
    const localDetail = vi.fn(async () => detailResult(detail(localEntry)))
    cleanup()
    render(<PluginCenterTab {...props({ list: localList, refresh: localList, detail: localDetail })} />)
    fireEvent.click(screen.getByRole('button', { name: en.localScope }))
    const localOpener = (await screen.findAllByRole('button', { name: `${en.details}：Local developer Bundle` })).at(-1)!
    fireEvent.click(localOpener)
    expect(await screen.findByText(en.localReadOnly)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Install|Uninstall|Enable|Disable/ })).toBeNull()
    expect(screen.getByText('Local source has no catalog decision.')).toBeTruthy()
  })
})

describe('compatibility and risk', () => {
  it('renders the exact environment, restart, capabilities, broad authority, and disabled allowed action', async () => {
    const checkCompatibility = vi.fn(async () => compatibilityDecision())
    render(<PluginCenterTab {...props({ checkCompatibility })} />)
    const opener = (await screen.findAllByRole('button', { name: `${en.details}：Workspace tools` }))[0]!
    fireEvent.click(opener)

    const detailPage = await screen.findByRole('main')
    expect(within(detailPage).getByText(en.allowedToInstall)).toBeTruthy()
    expect(within(detailPage).getAllByText('0.1.0-rc.5')).toHaveLength(2)
    expect(within(detailPage).getByText('22.22.0')).toBeTruthy()
    expect(within(detailPage).getAllByText('darwin-arm64')).toHaveLength(2)
    expect(within(detailPage).getByText(en.restartYes)).toBeTruthy()
    expect(within(detailPage).getByText(en.capabilityHost)).toBeTruthy()
    expect(within(detailPage).getByText(en.capabilityClient)).toBeTruthy()
    expect(within(detailPage).getByText(en.authorityWarning)).toBeTruthy()
    const install = within(detailPage).getByRole('button', { name: en.install })
    expect(install.hasAttribute('disabled')).toBe(true)
    expect(install.closest('header')).toBeTruthy()
    expect(within(detailPage).getByText(en.preflightIntro)).toBeTruthy()
    expect(detailPage.textContent).not.toMatch(/F00[23]/)
    expect(checkCompatibility).toHaveBeenCalledWith({
      pluginId: 'fixture.workspace-tools', version: '1.0.0', action: 'install',
    })
  })

  it('renders ordered localized denials and contains compatibility errors', async () => {
    const denied = compatibilityDecision({
      allowed: false,
      reasons: [
        {
          code: 'desktop-version-unsupported', subject: 'desktopVersion', actual: '0.1.0-rc.5', expected: '>=0.2.0',
        },
        {
          code: 'platform-unsupported', subject: 'darwin-arm64', actual: 'darwin-arm64', expected: 'win32-x64',
        },
      ],
    })
    const checkCompatibility = vi.fn<PluginCenterTabProps['checkCompatibility']>()
      .mockResolvedValueOnce(denied)
      .mockRejectedValueOnce(new Error('private compatibility detail'))
    render(<PluginCenterTab {...props({ checkCompatibility })} />)
    const opener = (await screen.findAllByRole('button', { name: `${en.details}：Workspace tools` }))[0]!

    fireEvent.click(opener)
    expect(await screen.findByText(en.installationBlocked)).toBeTruthy()
    const reasons = screen.getByText(en.denialReasons).parentElement!
    expect(within(reasons).getAllByRole('listitem').map(item => item.querySelector('strong')?.textContent)).toEqual([
      en.reasonDesktopVersionUnsupported,
      en.reasonPlatformUnsupported,
    ])
    expect(screen.getByRole('button', { name: en.cannotInstall }).hasAttribute('disabled')).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: en.backToCatalog }))

    fireEvent.click(opener)
    expect((await screen.findByRole('alert')).textContent).toBe(en.compatibilityError)
    expect(screen.queryByText('private compatibility detail')).toBeNull()
    expect(screen.getByRole('button', { name: en.cannotInstall }).hasAttribute('disabled')).toBe(true)
  })
})
