import {
  useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode,
} from 'react'
import {
  Button, IconChevronRightOutline14, IconDownloadOutline16, IconEllipsisOutline16,
  IconLoadingOutline16, IconRefreshOutline16, IconSearchOutline16, IconSettingsOutline16,
  IconWarningOutline16, Menu,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type {
  CatalogDetailQuery,
  CatalogDetailResult,
  CatalogKind,
  CatalogListQuery,
  CatalogListResult,
  CatalogScope,
  CatalogSection,
  CatalogSummary,
  CompatibilityDecision,
  CompatibilityRequest,
  InstalledPluginListResult,
  InstalledPluginOwnedData,
  InstalledPluginProjection,
  PluginInstallRequest,
  PluginManagementAction,
  PluginManagementRequest,
  PluginDiagnosticExportRequest,
  PluginDiagnosticExportResult,
  PluginOperationSnapshot,
  PluginOperationStartResult,
  PluginOwnedDataOffer,
  PluginOwnedDataRemovalRequest,
  PluginOwnedDataRemovalResult,
  PluginOwnedDataRetentionRequest,
  PluginOwnedDataRetentionResult,
  PluginRecoveryReasonCode,
  PluginRecoveryRetryRequest,
  PluginRecoverySnapshot,
} from '@deepseek-ai/dsh-plugin-center-contracts'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import {
  PluginDetailPage, type CompatibilityState, type DetailState,
} from './PluginDetailPage.tsx'
import {
  PluginInstallConfirmation,
  PluginManagementConfirmation,
  PluginOperationDialog,
  PluginOwnedDataRemovalConfirmation,
} from './PluginInstallDialogs.tsx'
import {
  InstalledIcons,
  InstalledPluginsPanel,
  type InstalledViewState,
} from './InstalledPluginsPanel.tsx'
import type { PluginCenterLocaleKey } from './locales.ts'
import {
  isMutationBlockingOperationPhase, isTerminalOperationPhase, isTrustedInstallPhase,
} from './operation-phases.ts'
import css from './PluginCenterTab.module.css'

/** Registration-side fixed Desktop read face. */
export interface PluginCenterTabInjected {
  readonly available: boolean
  readonly development: boolean
  readonly list: (query: CatalogListQuery) => Promise<CatalogListResult>
  readonly refresh: (query: CatalogListQuery) => Promise<CatalogListResult>
  readonly detail: (query: CatalogDetailQuery) => Promise<CatalogDetailResult>
  readonly checkCompatibility: (request: CompatibilityRequest) => Promise<CompatibilityDecision>
  readonly listInstalled: () => Promise<InstalledPluginListResult>
  readonly openPluginSettings: (tabId: 'configurable' | 'all') => void
  readonly mutationsEnabled: boolean
  readonly install: (request: PluginInstallRequest) => Promise<PluginOperationStartResult>
  readonly manage: (request: PluginManagementRequest) => Promise<PluginOperationStartResult>
  readonly getOwnedDataOffer?: () => Promise<PluginOwnedDataOffer | null>
  readonly removeOwnedData: (request: PluginOwnedDataRemovalRequest) => Promise<PluginOwnedDataRemovalResult>
  readonly retainOwnedData?: (request: PluginOwnedDataRetentionRequest) => Promise<PluginOwnedDataRetentionResult>
  readonly getOperation: () => Promise<PluginOperationSnapshot | null>
  readonly onOperationState: (listener: (operation: PluginOperationSnapshot) => void) => () => void
  readonly getRecovery?: () => Promise<PluginRecoverySnapshot | null>
  readonly retryRecovery?: (request: PluginRecoveryRetryRequest) => Promise<PluginRecoverySnapshot | null>
  readonly exportRecoveryDiagnostics?: (request: PluginDiagnosticExportRequest) => Promise<PluginDiagnosticExportResult>
  readonly onRecoveryState?: (listener: (snapshot: PluginRecoverySnapshot) => void) => () => void
}

/** Full props assembled by the independent main-page renderer. */
export type PluginCenterTabProps =
  PropsRuntime<'main.page'>
  & PropsLocale<'pluginCenter'>
  & InjectFace<PluginCenterTabInjected>

type ViewState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly result: CatalogListResult }

type CatalogInstallPreparation =
  | { readonly status: 'checking'; readonly entry: CatalogSummary }
  | { readonly status: 'ready'; readonly entry: CatalogSummary; readonly decision: CompatibilityDecision }

const SECTION_KEYS = {
  featured: 'featured',
  popular: 'popular',
  recent: 'recent',
} satisfies Record<CatalogSection, PluginCenterLocaleKey>

const FRESHNESS_KEYS = {
  fresh: 'fresh',
  cached: 'cached',
  stale: 'stale',
} satisfies Record<string, PluginCenterLocaleKey>

const SOURCE_KEYS = {
  bundled: 'bundledSource',
  network: 'networkSource',
  cache: 'cacheSource',
} satisfies Record<string, PluginCenterLocaleKey>

const NOTICE_KEYS = {
  'github-mapped': 'githubMapped',
  'github-partial': 'githubPartial',
  'github-source-only': 'githubSourceOnly',
  'github-no-dsh-bundle': 'githubNoDshBundle',
  'network-unavailable': 'catalogNetworkUnavailable',
} as const satisfies Record<NonNullable<CatalogListResult['notice']>, PluginCenterLocaleKey>

const MANAGEMENT_ACTION_KEYS = {
  update: 'updatePlugin',
  enable: 'enablePlugin',
  disable: 'disablePlugin',
  uninstall: 'uninstallPlugin',
} as const satisfies Record<PluginManagementAction, PluginCenterLocaleKey>

const RECOVERY_REASON_KEYS = {
  'unsupported-journal-version': 'recoveryReasonUnsupportedJournalVersion',
  'journal-invalid': 'recoveryReasonJournalInvalid',
  'snapshot-missing': 'recoveryReasonSnapshotMissing',
  'snapshot-invalid': 'recoveryReasonSnapshotInvalid',
  'snapshot-root-mismatch': 'recoveryReasonSnapshotRootMismatch',
  'snapshot-path-invalid': 'recoveryReasonSnapshotPathInvalid',
  'snapshot-hash-mismatch': 'recoveryReasonSnapshotHashMismatch',
  'profile-lock-busy': 'recoveryReasonProfileLockBusy',
  'host-stop-failed': 'recoveryReasonHostStopFailed',
  'profile-restore-failed': 'recoveryReasonProfileRestoreFailed',
  'package-restore-failed': 'recoveryReasonPackageRestoreFailed',
  'host-start-failed': 'recoveryReasonHostStartFailed',
  'runtime-verification-failed': 'recoveryReasonRuntimeVerificationFailed',
  'diagnostic-export-failed': 'recoveryReasonDiagnosticExportFailed',
} satisfies Record<PluginRecoveryReasonCode, PluginCenterLocaleKey>

const NO_RECOVERY = (): Promise<PluginRecoverySnapshot | null> => Promise.resolve(null)
const NO_RECOVERY_STATE = (): (() => void) => () => {}
const RECOVERY_UNAVAILABLE = (): Promise<never> => Promise.reject(new Error('Plugin recovery is unavailable'))
const NO_OWNED_DATA_OFFER = (): Promise<PluginOwnedDataOffer | null> => Promise.resolve(null)
const OWNED_DATA_DECISION_UNAVAILABLE = (): Promise<never> => Promise.reject(new Error('Plugin owned-data decision is unavailable'))
const PLUGIN_CENTER_VIEW_PARAMETER = 'dsh-plugin-center-view'
const PLUGIN_CENTER_INSTALLED_VIEW = 'installed'

interface OwnedDataUiOffer {
  readonly operationId: string
  readonly pluginId: string
  readonly displayName: string
  readonly declarations: readonly InstalledPluginOwnedData[]
}

function initialInstalledOpen(): boolean {
  return new URLSearchParams(window.location.search).get(PLUGIN_CENTER_VIEW_PARAMETER)
    === PLUGIN_CENTER_INSTALLED_VIEW
}

function persistInstalledOpen(open: boolean): void {
  const url = new URL(window.location.href)
  if (open) url.searchParams.set(PLUGIN_CENTER_VIEW_PARAMETER, PLUGIN_CENTER_INSTALLED_VIEW)
  else url.searchParams.delete(PLUGIN_CENTER_VIEW_PARAMETER)
  window.history.replaceState(window.history.state, '', url)
}

function uniqueEntries(results: readonly CatalogListResult[]): readonly CatalogSummary[] {
  const entries = new Map<string, CatalogSummary>()
  for (const result of results) {
    for (const section of Object.values(result.sections)) {
      for (const entry of section) entries.set(`${entry.pluginId}@${entry.version}`, entry)
    }
  }
  return [...entries.values()]
}

function CatalogMark({ entry, compact = false }: { readonly entry: CatalogSummary; readonly compact?: boolean }) {
  return (
    <span
      className={`${css.catalogMark}${compact ? ` ${css.compactMark}` : ''}`}
      style={{ background: entry.brandColor ?? undefined }}
      aria-hidden="true"
    >
      {entry.displayName.slice(0, 1).toLocaleUpperCase()}
      {entry.icon === null ? null : (
        <img
          key={entry.icon.url}
          src={entry.icon.url}
          alt=""
          width={entry.icon.width}
          height={entry.icon.height}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={(event) => { event.currentTarget.hidden = true }}
        />
      )}
    </span>
  )
}

function CatalogCard({
  entry, installedItem, mutationsEnabled, operation, checking, onOpen, onInstall, onManage, t,
}: {
  readonly entry: CatalogSummary
  readonly installedItem: InstalledPluginProjection | null
  readonly mutationsEnabled: boolean
  readonly operation: PluginOperationSnapshot | null
  readonly checking: boolean
  readonly onOpen: (entry: CatalogSummary, element: HTMLButtonElement) => void
  readonly onInstall: (entry: CatalogSummary, element: HTMLButtonElement) => void
  readonly onManage: (item: InstalledPluginProjection, action: PluginManagementAction) => void
  readonly t: PluginCenterTabProps['t']
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const matchingOperation = operation?.action === 'install'
    && operation.pluginId === entry.pluginId
    && operation.version === entry.version
    ? operation
    : null
  const installed = installedItem !== null || entry.installed || matchingOperation?.phase === 'committed'
  const failed = matchingOperation?.phase === 'failed'
    || matchingOperation?.phase === 'recovery-failed'
  const matchingOperationInProgress = matchingOperation !== null
    && isMutationBlockingOperationPhase(matchingOperation.phase)
    && !failed
  const operationBlocksAction = operation !== null && isMutationBlockingOperationPhase(operation.phase)
  const incompatible = entry.compatibility.status === 'incompatible'
  const label = installed
    ? t('installed')
    : checking
      ? t('checkingCompatibility')
      : failed
        ? t('installationFailedAction')
        : matchingOperationInProgress
          ? t('installationInProgress')
          : incompatible
            ? t('cannotInstall')
            : t('install')
  const installDisabled = checking
    || incompatible
    || entry.scope !== 'public'
    || !mutationsEnabled
    || operationBlocksAction
  const managementDisabled = !mutationsEnabled
    || (installedItem !== null && installedItem.pendingAction !== null)
    || operationBlocksAction
  const menuItems = installedItem?.supportedActions.map(action => ({
    id: action,
    label: t(MANAGEMENT_ACTION_KEYS[action]),
    disabled: managementDisabled,
    danger: action === 'uninstall',
  })) ?? []

  return (
    <li className={css.card} data-catalog-entry={`${entry.pluginId}@${entry.version}`}>
      <button
        type="button"
        className={css.cardButton}
        aria-label={`${t('details')}：${entry.displayName}`}
        onClick={(event) => { onOpen(entry, event.currentTarget) }}
      >
        <CatalogMark entry={entry} />
        <span className={css.cardCopy}>
          <strong>{entry.displayName}</strong>
          <span className={css.cardSummary}>{entry.summary}</span>
        </span>
        <IconChevronRightOutline14 className={css.cardChevron} aria-hidden="true" />
      </button>
      {installed ? (
        installedItem === null ? (
          <button
            type="button"
            className={css.cardMenuButton}
            aria-label={`${t('pluginActions')}：${entry.displayName}`}
            disabled
          >
            <IconEllipsisOutline16 aria-hidden="true" />
          </button>
        ) : (
          <Menu
            open={menuOpen}
            align="end"
            portal
            compact
            className={css.cardMenu ?? ''}
            items={menuItems}
            onClose={() => { setMenuOpen(false) }}
            onSelect={(id) => {
              setMenuOpen(false)
              const action = installedItem.supportedActions.find(value => value === id)
              if (action !== undefined) onManage(installedItem, action)
            }}
            anchor={(
              <button
                type="button"
                className={css.cardMenuButton}
                aria-label={`${t('pluginActions')}：${entry.displayName}`}
                aria-expanded={menuOpen}
                title={`${t('pluginActions')}：${entry.displayName}`}
                disabled={menuItems.length === 0}
                onClick={() => { setMenuOpen(value => !value) }}
              >
                <IconEllipsisOutline16 aria-hidden="true" />
              </button>
            )}
          />
        )
      ) : (
        <Button
          variant="outline"
          size="sm"
          className={css.cardAction}
          title={!mutationsEnabled
            ? t('installReleaseGated')
            : failed
              ? t('operationNeedsRecovery')
              : operationBlocksAction
                ? t('operationInProgress')
                : undefined}
          disabled={installDisabled}
          onClick={(event) => { onInstall(entry, event.currentTarget) }}
        >
          {label}
        </Button>
      )}
    </li>
  )
}

/** One server-owned discovery section. */
export function CatalogSectionView({
  section, entries, installedItems, mutationsEnabled, operation, checkingEntry,
  onOpen, onInstall, onManage, t,
}: {
  readonly section: CatalogSection
  readonly entries: readonly CatalogSummary[]
  readonly installedItems: ReadonlyMap<string, InstalledPluginProjection>
  readonly mutationsEnabled: boolean
  readonly operation: PluginOperationSnapshot | null
  readonly checkingEntry: string | null
  readonly onOpen: (entry: CatalogSummary, element: HTMLButtonElement) => void
  readonly onInstall: (entry: CatalogSummary, element: HTMLButtonElement) => void
  readonly onManage: (item: InstalledPluginProjection, action: PluginManagementAction) => void
  readonly t: PluginCenterTabProps['t']
}): ReactNode {
  if (entries.length === 0) return null
  return (
    <section className={css.catalogSection} data-catalog-section={section}>
      <div className={css.sectionHeading}><h2>{t(SECTION_KEYS[section])}</h2></div>
      <ul className={css.cards}>{entries.map(entry => (
        <CatalogCard
          key={`${entry.pluginId}@${entry.version}`}
          entry={entry}
          installedItem={installedItems.get(`${entry.catalogKind}:${entry.pluginId}`) ?? null}
          mutationsEnabled={mutationsEnabled}
          operation={operation}
          checking={checkingEntry === `${entry.pluginId}@${entry.version}`}
          onOpen={onOpen}
          onInstall={onInstall}
          onManage={onManage}
          t={t}
        />
      ))}</ul>
    </section>
  )
}

const SKELETON_CARDS = [0, 1, 2, 3, 4, 5] as const

function CatalogSkeleton({ t }: { readonly t: PluginCenterTabProps['t'] }) {
  return (
    <section className={css.catalogSkeleton} role="status" aria-label={t('loading')}>
      <div className={css.skeletonHeading}>{t('loading')}</div>
      <ul className={css.skeletonCards} aria-hidden="true">
        {SKELETON_CARDS.map(index => (
          <li key={index} className={css.skeletonCard} data-catalog-skeleton-card>
            <span className={css.skeletonMark} />
            <span className={css.skeletonCopy}>
              <span className={css.skeletonTitle} />
              <span className={css.skeletonSummary} />
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Searchable Desktop Plugin Center with handed-off lifecycle actions. */
export function PluginCenterTab({
  available, development, list, refresh, detail, checkCompatibility, listInstalled, openPluginSettings,
  mutationsEnabled, install, manage,
  getOwnedDataOffer = NO_OWNED_DATA_OFFER,
  removeOwnedData,
  retainOwnedData: persistOwnedDataRetention = OWNED_DATA_DECISION_UNAVAILABLE,
  getOperation, onOperationState,
  getRecovery = NO_RECOVERY,
  retryRecovery = RECOVERY_UNAVAILABLE,
  exportRecoveryDiagnostics = RECOVERY_UNAVAILABLE,
  onRecoveryState = NO_RECOVERY_STATE,
  t,
}: PluginCenterTabProps): ReactNode {
  const kindTabsId = useId()
  const kindRefs = useRef<Array<HTMLButtonElement | null>>([])
  const detailOpener = useRef<HTMLButtonElement | null>(null)
  const detailRequest = useRef(0)
  const catalogInstallOpener = useRef<HTMLButtonElement | null>(null)
  const catalogInstallRequest = useRef(0)
  const initialRefreshStarted = useRef(false)
  const observedTerminal = useRef<string | null>(null)
  const [kind, setKind] = useState<CatalogKind>('plugin')
  const [scope, setScope] = useState<CatalogScope>('public')
  const [query, setQuery] = useState('')
  const [revision, setRevision] = useState(0)
  const [view, setView] = useState<ViewState>({ status: 'loading' })
  const [installed, setInstalled] = useState<InstalledViewState>({ status: 'loading' })
  const [installedOpen, setInstalledOpen] = useState(initialInstalledOpen)
  const [managementConfirmation, setManagementConfirmation] = useState<{
    readonly item: InstalledPluginProjection
    readonly action: PluginManagementAction
  } | null>(null)
  const [managementAcknowledged, setManagementAcknowledged] = useState(false)
  const [uninstallOffer, setUninstallOffer] = useState<OwnedDataUiOffer | null>(null)
  const [ownedDataConfirmation, setOwnedDataConfirmation] = useState<typeof uninstallOffer>(null)
  const [ownedDataSelected, setOwnedDataSelected] = useState<readonly string[]>([])
  const [ownedDataAcknowledged, setOwnedDataAcknowledged] = useState(false)
  const [ownedDataStatus, setOwnedDataStatus] = useState<'idle' | 'removing' | 'removed' | 'failed'>('idle')
  const [ownedDataRetaining, setOwnedDataRetaining] = useState(false)
  const [removedOwnedDataCount, setRemovedOwnedDataCount] = useState(0)
  const [detailEntry, setDetailEntry] = useState<CatalogSummary | null>(null)
  const [detailState, setDetailState] = useState<DetailState | null>(null)
  const [compatibilityState, setCompatibilityState] = useState<CompatibilityState | null>(null)
  const [catalogInstall, setCatalogInstall] = useState<CatalogInstallPreparation | null>(null)
  const [catalogInstallAcknowledged, setCatalogInstallAcknowledged] = useState(false)
  const [operation, setOperation] = useState<PluginOperationSnapshot | null>(null)
  const [operationDialogOpen, setOperationDialogOpen] = useState(false)
  const [operationRequestFailed, setOperationRequestFailed] = useState(false)
  const [recovery, setRecovery] = useState<PluginRecoverySnapshot | null>(null)
  const [recoveryBusy, setRecoveryBusy] = useState(false)
  const [diagnosticResult, setDiagnosticResult] = useState<'saved' | 'cancelled' | 'failed' | null>(null)

  const criteria = useMemo<CatalogListQuery>(() => ({
    catalogKind: kind,
    scope,
    query: query.trim(),
    limit: 24,
  }), [kind, query, scope])

  const installedCatalogItems = useMemo(() => {
    const items = new Map<string, InstalledPluginProjection>()
    if (installed.status !== 'ready') return items
    for (const item of installed.result.items) {
      if (item.source !== 'catalog' || item.pluginId === null || item.catalogKind === null) continue
      items.set(`${item.catalogKind}:${item.pluginId}`, item)
    }
    return items
  }, [installed])

  const operationInstalledItem = useMemo(() => {
    if (operation === null || installed.status !== 'ready') return null
    return installed.result.items.find(item => item.pluginId === operation.pluginId
      && item.version === operation.version) ?? null
  }, [installed, operation])

  useEffect(() => {
    if (!available) return
    let current = true
    void Promise.resolve().then(() => list(criteria)).then(
      (result) => {
        if (current) setView({ status: 'ready', result })
        if (criteria.catalogKind !== 'plugin' || criteria.scope !== 'public' || criteria.query !== ''
          || initialRefreshStarted.current) return
        initialRefreshStarted.current = true
        if (result.source === 'network' && result.freshness === 'fresh'
          && uniqueEntries([result]).length >= criteria.limit) return
        void Promise.resolve().then(() => refresh(criteria)).then(
          () => { if (current) setRevision(value => value + 1) },
          () => {},
        )
      },
      () => { if (current) setView({ status: 'error' }) },
    )
    return () => { current = false }
  }, [available, criteria, list, refresh, revision])

  useEffect(() => {
    if (!available) return
    let current = true
    void listInstalled().then(
      (result) => { if (current) setInstalled({ status: 'ready', result }) },
      () => { if (current) setInstalled({ status: 'error' }) },
    )
    return () => { current = false }
  }, [available, listInstalled, revision])

  useEffect(() => {
    if (!available) return
    let current = true
    const observe = (next: PluginOperationSnapshot | null): void => {
      if (!current) return
      setOperation(next)
      if (next !== null && isTrustedInstallPhase(next.phase) && next.phase !== 'committed') {
        setOperationDialogOpen(true)
      }
    }
    const stop = onOperationState(observe)
    void getOperation().then(
      observe,
      () => { if (current) setOperationRequestFailed(true) },
    )
    return () => {
      current = false
      stop()
    }
  }, [available, getOperation, onOperationState])

  useEffect(() => {
    if (!available) return
    let current = true
    const observe = (next: PluginRecoverySnapshot | null): void => {
      if (current) setRecovery(next)
    }
    const stop = onRecoveryState(observe)
    void getRecovery().then(observe, () => { if (current) setRecovery(null) })
    return () => {
      current = false
      stop()
    }
  }, [available, getRecovery, onRecoveryState])

  useEffect(() => {
    if (operation?.phase !== 'committed') return
    const terminalIdentity = `${operation.operationId}:${operation.updatedAt}`
    if (observedTerminal.current === terminalIdentity) return
    observedTerminal.current = terminalIdentity
    setRevision(value => value + 1)
    if (operation.action !== 'install') return
    if (detailEntry?.pluginId !== operation.pluginId || detailEntry.version !== operation.version) return
    setCompatibilityState({ status: 'loading' })
    void checkCompatibility({
      pluginId: operation.pluginId,
      version: operation.version,
      action: 'install',
    }).then(
      (result) => { setCompatibilityState({ status: 'ready', result }) },
      () => { setCompatibilityState({ status: 'error' }) },
    )
  }, [checkCompatibility, detailEntry, operation])

  useEffect(() => {
    if (uninstallOffer === null || operation?.operationId !== uninstallOffer.operationId) return
    if (operation.phase === 'failed' || operation.phase === 'rolled-back' || operation.phase === 'recovery-failed') {
      setUninstallOffer(null)
      return
    }
    if (operation.phase !== 'committed' || uninstallOffer.declarations.length === 0) return
    setOwnedDataSelected(uninstallOffer.declarations.map(value => value.path))
    setOwnedDataAcknowledged(false)
    setOwnedDataStatus('idle')
    setOwnedDataRetaining(false)
    setRemovedOwnedDataCount(0)
    setOwnedDataConfirmation(uninstallOffer)
    setUninstallOffer(null)
  }, [operation, uninstallOffer])

  useEffect(() => {
    if (operation?.action !== 'uninstall' || operation.phase !== 'committed'
      || uninstallOffer !== null || ownedDataConfirmation !== null) return
    let current = true
    void getOwnedDataOffer().then((offer) => {
      if (!current || offer === null || offer.operationId !== operation.operationId
        || offer.pluginId !== operation.pluginId || offer.version !== operation.version
        || offer.declarations.length === 0) return
      setOwnedDataSelected(offer.declarations.map(value => value.path))
      setOwnedDataAcknowledged(false)
      setOwnedDataStatus('idle')
      setOwnedDataRetaining(false)
      setRemovedOwnedDataCount(0)
      setOwnedDataConfirmation({
        operationId: offer.operationId,
        pluginId: offer.pluginId,
        displayName: offer.packageName,
        declarations: offer.declarations,
      })
    }, () => {})
    return () => { current = false }
  }, [getOwnedDataOffer, operation, ownedDataConfirmation, uninstallOffer])

  const retry = (): void => {
    setView({ status: 'loading' })
    void Promise.resolve().then(() => refresh(criteria)).then(
      (result) => { setView({ status: 'ready', result }) },
      () => { setView({ status: 'error' }) },
    )
  }

  const openDetail = (
    entry: CatalogSummary,
    element: HTMLButtonElement,
    initialCompatibility?: CompatibilityState,
  ): void => {
    const request = detailRequest.current + 1
    detailRequest.current = request
    detailOpener.current = element
    setDetailEntry(entry)
    setDetailState({ status: 'loading' })
    setCompatibilityState(entry.scope === 'public' ? initialCompatibility ?? { status: 'loading' } : null)
    void Promise.resolve().then(() => detail({ pluginId: entry.pluginId, version: entry.version })).then(
      (result) => { if (detailRequest.current === request) setDetailState({ status: 'ready', result }) },
      () => { if (detailRequest.current === request) setDetailState({ status: 'error' }) },
    )
    if (entry.scope === 'public' && initialCompatibility === undefined) {
      void Promise.resolve().then(() => checkCompatibility({
        pluginId: entry.pluginId,
        version: entry.version,
        action: 'install',
      })).then(
        (result) => { if (detailRequest.current === request) setCompatibilityState({ status: 'ready', result }) },
        () => { if (detailRequest.current === request) setCompatibilityState({ status: 'error' }) },
      )
    }
  }

  const closeDetail = (): void => {
    detailRequest.current += 1
    setDetailEntry(null)
    setDetailState(null)
    setCompatibilityState(null)
    setOperationRequestFailed(false)
    queueMicrotask(() => { detailOpener.current?.focus() })
  }

  const startInstall = (entry: CatalogSummary): void => {
    setOperationRequestFailed(false)
    const idempotencyKey = `install:${entry.pluginId}:${entry.version}:${String(Date.now())}`
    void install({
      pluginId: entry.pluginId,
      version: entry.version,
      idempotencyKey,
    }).then(async (result) => {
      if (result.kind === 'busy') {
        const active = await getOperation()
        setOperation(active)
        setOperationDialogOpen(active !== null && isTrustedInstallPhase(active.phase))
        setOperationRequestFailed(active === null)
        return
      }
      setOperation(result.operation)
      setOperationDialogOpen(isTrustedInstallPhase(result.operation.phase))
    }, () => { setOperationRequestFailed(true) })
  }

  const requestCatalogInstall = (entry: CatalogSummary, element: HTMLButtonElement): void => {
    if (
      !mutationsEnabled
      || entry.scope !== 'public'
      || entry.installed
      || entry.compatibility.status === 'incompatible'
      || (operation !== null && isMutationBlockingOperationPhase(operation.phase))
    ) return
    const request = catalogInstallRequest.current + 1
    catalogInstallRequest.current = request
    catalogInstallOpener.current = element
    setCatalogInstallAcknowledged(false)
    setOperationRequestFailed(false)
    setCatalogInstall({ status: 'checking', entry })
    void Promise.resolve().then(() => checkCompatibility({
      pluginId: entry.pluginId,
      version: entry.version,
      action: 'install',
    })).then(
      (decision) => {
        if (catalogInstallRequest.current !== request) return
        if (!decision.allowed) {
          setCatalogInstall(null)
          openDetail(entry, element, { status: 'ready', result: decision })
          return
        }
        setCatalogInstall({ status: 'ready', entry, decision })
      },
      () => {
        if (catalogInstallRequest.current !== request) return
        setCatalogInstall(null)
        openDetail(entry, element, { status: 'error' })
      },
    )
  }

  const closeCatalogInstall = (): void => {
    catalogInstallRequest.current += 1
    setCatalogInstall(null)
    setCatalogInstallAcknowledged(false)
    queueMicrotask(() => { catalogInstallOpener.current?.focus() })
  }

  const confirmCatalogInstall = (): void => {
    if (catalogInstall?.status !== 'ready' || !catalogInstallAcknowledged) return
    const entry = catalogInstall.entry
    catalogInstallRequest.current += 1
    setCatalogInstall(null)
    setCatalogInstallAcknowledged(false)
    startInstall(entry)
  }

  const startManagement = (item: InstalledPluginProjection, action: PluginManagementAction): void => {
    if (item.pluginId === null || item.version === null) return
    const version = action === 'update' ? item.update?.version : item.version
    if (version === undefined) return
    setOperationRequestFailed(false)
    const idempotencyKey = `${action}:${item.pluginId}:${version}:${String(Date.now())}`
    const rememberOwnedDataOffer = (next: PluginOperationSnapshot | null): void => {
      if (action === 'uninstall' && next?.action === 'uninstall' && next.pluginId === item.pluginId) {
        setUninstallOffer({
          operationId: next.operationId,
          pluginId: item.pluginId,
          displayName: item.displayName,
          declarations: item.ownedData,
        })
      }
    }
    void manage({ pluginId: item.pluginId, version, action, idempotencyKey }).then(async (result) => {
      if (result.kind === 'busy') {
        const active = await getOperation()
        rememberOwnedDataOffer(active)
        setOperation(active)
        setOperationDialogOpen(active !== null && isTrustedInstallPhase(active.phase))
        setOperationRequestFailed(active === null)
        return
      }
      rememberOwnedDataOffer(result.operation)
      setOperation(result.operation)
      setOperationDialogOpen(isTrustedInstallPhase(result.operation.phase))
    }, () => { setOperationRequestFailed(true) })
  }

  const retainOwnedData = (): void => {
    if (ownedDataConfirmation === null || ownedDataRetaining) return
    setOwnedDataRetaining(true)
    void persistOwnedDataRetention({
      operationId: ownedDataConfirmation.operationId,
      pluginId: ownedDataConfirmation.pluginId,
      confirmation: 'retain-owned-data',
    }).then(() => {
      setOwnedDataConfirmation(null)
      setOwnedDataSelected([])
      setOwnedDataAcknowledged(false)
      setOwnedDataStatus('idle')
      setOwnedDataRetaining(false)
    }, () => {
      setOwnedDataStatus('failed')
      setOwnedDataRetaining(false)
    })
  }

  const removeSelectedOwnedData = (): void => {
    if (ownedDataConfirmation === null || !ownedDataAcknowledged || ownedDataSelected.length === 0) return
    const pluginId = ownedDataConfirmation.pluginId
    setOwnedDataStatus('removing')
    void removeOwnedData({
      operationId: ownedDataConfirmation.operationId,
      pluginId,
      paths: ownedDataSelected,
      confirmation: 'remove-owned-data',
    }).then(
      (result) => {
        setRemovedOwnedDataCount(result.removedPaths.length)
        setOwnedDataStatus('removed')
      },
      () => { setOwnedDataStatus('failed') },
    )
  }

  const requestManagement = (item: InstalledPluginProjection, action: PluginManagementAction): void => {
    setManagementAcknowledged(false)
    setManagementConfirmation({ item, action })
  }

  const confirmManagement = (): void => {
    if (managementConfirmation === null || !managementAcknowledged) return
    const { item, action } = managementConfirmation
    setManagementConfirmation(null)
    setManagementAcknowledged(false)
    startManagement(item, action)
  }

  const retryInstalled = (): void => {
    setInstalled({ status: 'loading' })
    void listInstalled().then(
      (result) => { setInstalled({ status: 'ready', result }) },
      () => { setInstalled({ status: 'error' }) },
    )
  }

  const showInstalled = (open: boolean): void => {
    setInstalledOpen(open)
    persistInstalledOpen(open)
  }

  const retryPluginRecovery = (): void => {
    if (recovery === null || !recovery.canRetry || recoveryBusy) return
    setRecoveryBusy(true)
    setDiagnosticResult(null)
    void retryRecovery({ operationId: recovery.operationId }).then(
      (next) => { setRecovery(next) },
      () => { setDiagnosticResult('failed') },
    ).finally(() => { setRecoveryBusy(false) })
  }

  const exportPluginRecovery = (): void => {
    if (recovery === null || !recovery.canExportDiagnostics || recoveryBusy) return
    setRecoveryBusy(true)
    setDiagnosticResult(null)
    void exportRecoveryDiagnostics({ operationId: recovery.operationId }).then(
      (result) => { setDiagnosticResult(result.status) },
      () => { setDiagnosticResult('failed') },
    ).finally(() => { setRecoveryBusy(false) })
  }

  const moveKind = (event: KeyboardEvent<HTMLButtonElement>, index: number): void => {
    let next: number
    if (event.key === 'ArrowRight') next = (index + 1) % 2
    else if (event.key === 'ArrowLeft') next = (index + 1) % 2
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = 1
    else return
    event.preventDefault()
    const nextKind: CatalogKind = next === 0 ? 'plugin' : 'skill-pack'
    setKind(nextKind)
    kindRefs.current[next]?.focus()
  }

  if (!available) {
    return (
      <div className={css.unavailable}>
        <strong>{t('unavailable')}</strong>
        <p>{t('unavailableHint')}</p>
      </div>
    )
  }

  const ready = view.status === 'ready' ? view.result : null
  const searchEntries = ready === null ? [] : uniqueEntries([ready])
  const noEntries = ready !== null && searchEntries.length === 0
  const freshness = ready === null
    ? t('loading')
    : `${t(FRESHNESS_KEYS[ready.freshness])} · ${t(SOURCE_KEYS[ready.source])} · ${new Date(ready.generatedAt).toLocaleString()}`
  const pageTitle = t(kind === 'plugin' ? 'title' : 'skillsTitle')
  const pageIntro = t(kind === 'plugin' ? 'intro' : 'skillsIntro')

  return (
    <div
      className={css.root}
      aria-busy={view.status === 'loading'
        || detailState?.status === 'loading'
        || compatibilityState?.status === 'loading'
        || catalogInstall?.status === 'checking'
        || (operation !== null && !isTerminalOperationPhase(operation.phase))
        || recoveryBusy
        || recovery?.phase === 'recovering'}
      data-development={development || undefined}
      title={development ? t('developmentMode') : undefined}
    >
      <div className={css.topbar}>
        {detailEntry === null ? (
          <>
            <div className={css.kindTabs} role="tablist" aria-label={t('title')}>
              {(['plugin', 'skill-pack'] as const).map((value, index) => {
                const selected = kind === value
                return (
                  <button
                    key={value}
                    ref={(element) => { kindRefs.current[index] = element }}
                    id={`${kindTabsId}-${value}`}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    tabIndex={selected ? 0 : -1}
                    data-active={selected || undefined}
                    onClick={() => { setKind(value) }}
                    onKeyDown={(event) => { moveKind(event, index) }}
                  >
                    {t(value === 'plugin' ? 'plugins' : 'skills')}
                  </button>
                )
              })}
            </div>
            <div className={css.topActions}>
              <button type="button" aria-label={t('refresh')} title={freshness} onClick={retry}>
                <IconRefreshOutline16 size={16} />
              </button>
            </div>
          </>
        ) : (
          <div className={css.breadcrumbs}>
            <button type="button" onClick={closeDetail} aria-label={t('backToCatalog')}>
              {t(detailEntry.catalogKind === 'plugin' ? 'plugins' : 'skills')}
            </button>
            <IconChevronRightOutline14 aria-hidden="true" />
            <span>{detailEntry.displayName}</span>
          </div>
        )}
      </div>

      <div className={css.scroller}>
        <main className={css.content} hidden={detailEntry !== null}>
          <header className={css.header}>
            <h1>{pageTitle}</h1>
            <p>{pageIntro}</p>
          </header>

          {recovery !== null && recovery.phase !== 'rolled-back' ? (
            <section
              className={css.recoveryNotice}
              data-recovery-phase={recovery.phase}
              aria-live={recovery.phase === 'recovery-failed' ? 'assertive' : 'polite'}
            >
              <div className={css.recoveryStatusIcon} aria-hidden="true">
                {recovery.phase === 'recovering'
                  ? <IconLoadingOutline16 size={18} />
                  : <IconWarningOutline16 size={18} />}
              </div>
              <div className={css.recoveryContent}>
                <strong>{t(recovery.phase === 'recovering' ? 'recoveryRunningTitle' : 'recoveryFailedTitle')}</strong>
                <p>{t(recovery.phase === 'recovering' ? 'recoveryRunning' : 'recoveryFailed')}</p>
                <div className={css.recoveryMeta}>
                  <span>{t('recoveryAttempt')} {recovery.attempt}</span>
                </div>
                <div className={css.recoveryReason}>
                  <span className={css.recoveryReasonLabel}>{t('recoveryReasonCode')}</span>
                  <span>{recovery.recoveryReasonCode === null
                    ? t('recoveryReasonPending')
                    : t(RECOVERY_REASON_KEYS[recovery.recoveryReasonCode])}</span>
                  <code>{recovery.recoveryReasonCode ?? recovery.operationFailureCode}</code>
                </div>
                {diagnosticResult !== null ? (
                  <span className={css.recoveryFeedback} role="status">{t(diagnosticResult === 'saved'
                    ? 'diagnosticSaved'
                    : diagnosticResult === 'cancelled'
                      ? 'diagnosticCancelled'
                      : 'recoveryRequestFailed')}</span>
                ) : null}
              </div>
              <div className={css.recoveryActions}>
                <Button
                  variant="primary"
                  size="sm"
                  icon={<IconRefreshOutline16 size={14} />}
                  disabled={!recovery.canRetry || recoveryBusy}
                  onClick={retryPluginRecovery}
                >
                  {t('retryRecovery')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  icon={<IconDownloadOutline16 size={14} />}
                  disabled={!recovery.canExportDiagnostics || recoveryBusy}
                  onClick={exportPluginRecovery}
                >
                  {t('exportDiagnostics')}
                </Button>
              </div>
            </section>
          ) : null}

          <label className={css.search}>
            <IconSearchOutline16 aria-hidden="true" />
            <span className={css.visuallyHidden}>{t(kind === 'plugin' ? 'searchPlugins' : 'searchSkills')}</span>
            <input
              type="search"
              value={query}
              placeholder={t(kind === 'plugin' ? 'searchPlugins' : 'searchSkills')}
              aria-label={t(kind === 'plugin' ? 'searchPlugins' : 'searchSkills')}
              onChange={(event) => { setQuery(event.currentTarget.value) }}
            />
          </label>

          <section className={css.installedSection}>
            <div className={css.installedHeading}>
              <h2>{t('installedTitle')}</h2>
              <button
                type="button"
                aria-expanded={installedOpen}
                aria-label={t('manageInstalled')}
                title={t('manageInstalled')}
                onClick={() => { showInstalled(!installedOpen) }}
              >
                <IconSettingsOutline16 size={16} />
              </button>
            </div>
            <div className={css.installedIcons}>
              <InstalledIcons state={installed} onOpen={() => { showInstalled(true) }} t={t} />
            </div>
            {installedOpen ? (
              <InstalledPluginsPanel
                state={installed}
                mutationsEnabled={mutationsEnabled}
                onRetry={retryInstalled}
                onSettings={openPluginSettings}
                onAction={requestManagement}
                t={t}
              />
            ) : null}
          </section>

          <div className={css.toolbar}>
            <div className={css.scope} aria-label={t('publicScope')}>
              <button type="button" aria-pressed={scope === 'public'} onClick={() => { setScope('public') }}>{t('publicScope')}</button>
              <button type="button" aria-pressed={scope === 'local'} onClick={() => { setScope('local') }}>{t('localScope')}</button>
            </div>
            <span className={css.catalogMeta}>{freshness}</span>
          </div>

          {ready?.freshness === 'stale' ? (
            <div className={css.catalogNotice}>
              <span>{t('stale')} · {t(SOURCE_KEYS[ready.source])}</span>
              <button type="button" onClick={retry}>{t('retry')}</button>
            </div>
          ) : null}
          {ready?.notice !== undefined ? (
            <div className={css.catalogNotice} role="status">
              <span>{t(NOTICE_KEYS[ready.notice])}</span>
              {ready.notice === 'network-unavailable'
                ? <button type="button" onClick={retry}>{t('retry')}</button>
                : null}
            </div>
          ) : null}
          {view.status === 'loading' ? <CatalogSkeleton t={t} /> : null}
          {view.status === 'error' ? (
            <div className={css.failure}>
              <p role="alert">{t('error')}</p>
              <button type="button" onClick={retry}>{t('retry')}</button>
            </div>
          ) : null}
          {operationRequestFailed ? <p className={css.operationRequestError} role="alert">{t('operationRequestFailed')}</p> : null}
          {noEntries ? <p className={css.status}>{query.trim() === '' ? t('empty') : t('emptySearch')}</p> : null}
          {ready !== null && query.trim() !== '' && searchEntries.length > 0 ? (
            <section className={css.catalogSection} data-catalog-section="search">
              <div className={css.sectionHeading}>
                <h2>{t('searchResults')}</h2>
                <span>{searchEntries.length} {t('resultUnit')}</span>
              </div>
              <ul className={css.cards}>{searchEntries.map(entry => (
                <CatalogCard
                  key={`${entry.pluginId}@${entry.version}`}
                  entry={entry}
                  installedItem={installedCatalogItems.get(`${entry.catalogKind}:${entry.pluginId}`) ?? null}
                  mutationsEnabled={mutationsEnabled}
                  operation={operation}
                  checking={catalogInstall?.status === 'checking'
                    && catalogInstall.entry.pluginId === entry.pluginId
                    && catalogInstall.entry.version === entry.version}
                  onOpen={openDetail}
                  onInstall={requestCatalogInstall}
                  onManage={requestManagement}
                  t={t}
                />
              ))}</ul>
            </section>
          ) : null}
          {ready !== null && query.trim() === '' ? (
            <div className={css.sections}>
              {(['featured', 'popular', 'recent'] as const).map(section => (
                <CatalogSectionView
                  key={section}
                  section={section}
                  entries={ready.sections[section]}
                  installedItems={installedCatalogItems}
                  mutationsEnabled={mutationsEnabled}
                  operation={operation}
                  checkingEntry={catalogInstall?.status === 'checking'
                    ? `${catalogInstall.entry.pluginId}@${catalogInstall.entry.version}`
                    : null}
                  onOpen={openDetail}
                  onInstall={requestCatalogInstall}
                  onManage={requestManagement}
                  t={t}
                />
              ))}
            </div>
          ) : null}
        </main>
        {detailEntry !== null && detailState !== null
          ? <PluginDetailPage
            entry={detailEntry}
            state={detailState}
            compatibility={compatibilityState}
            mutationsEnabled={mutationsEnabled}
            operation={operation}
            operationRequestFailed={operationRequestFailed}
            onInstall={() => { startInstall(detailEntry) }}
            t={t}
          />
          : null}
      </div>
      <PluginOperationDialog
        open={operationDialogOpen}
        operation={operation}
        installedItem={operationInstalledItem}
        onClose={() => { setOperationDialogOpen(false) }}
        t={t}
      />
      {catalogInstall?.status === 'ready' ? (
        <PluginInstallConfirmation
          open
          entry={catalogInstall.entry}
          decision={catalogInstall.decision}
          acknowledged={catalogInstallAcknowledged}
          onAcknowledgedChange={setCatalogInstallAcknowledged}
          onCancel={closeCatalogInstall}
          onConfirm={confirmCatalogInstall}
          t={t}
        />
      ) : null}
      {managementConfirmation !== null ? (
        <PluginManagementConfirmation
          open
          item={managementConfirmation.item}
          action={managementConfirmation.action}
          acknowledged={managementAcknowledged}
          onAcknowledgedChange={setManagementAcknowledged}
          onCancel={() => {
            setManagementConfirmation(null)
            setManagementAcknowledged(false)
          }}
          onConfirm={confirmManagement}
          t={t}
        />
      ) : null}
      {ownedDataConfirmation !== null ? (
        <PluginOwnedDataRemovalConfirmation
          open={!operationDialogOpen}
          displayName={ownedDataConfirmation.displayName}
          declarations={ownedDataConfirmation.declarations}
          selectedPaths={ownedDataSelected}
          acknowledged={ownedDataAcknowledged}
          status={ownedDataStatus}
          retaining={ownedDataRetaining}
          removedCount={removedOwnedDataCount}
          onSelectionChange={setOwnedDataSelected}
          onAcknowledgedChange={setOwnedDataAcknowledged}
          onRetain={retainOwnedData}
          onRemove={removeSelectedOwnedData}
          onDone={retainOwnedData}
          t={t}
        />
      ) : null}
    </div>
  )
}
