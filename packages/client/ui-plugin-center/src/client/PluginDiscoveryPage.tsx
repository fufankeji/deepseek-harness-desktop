import {
  useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode,
} from 'react'
import {
  Button, IconCheckOutline14, IconCloseOutline16, IconRefreshOutline16,
  IconSearchOutline16, IconSparkle16,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type {
  CatalogCapability,
  CatalogDetailResult,
  CatalogListQuery,
  CatalogListResult,
  CatalogSummary,
  CompatibilityDecision,
  InstalledPluginListResult,
  InstalledPluginProjection,
  PluginOperationSnapshot,
  PluginOperationStartResult,
} from '@deepseek-ai/dsh-plugin-center-contracts'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { compatibilityReasonKey } from './compatibility-copy.ts'
import { PluginInstallConfirmation, PluginOperationDialog } from './PluginInstallDialogs.tsx'
import type { PluginCenterLocaleKey } from './locales.ts'
import { isTerminalOperationPhase, isTrustedInstallPhase } from './operation-phases.ts'
import css from './PluginDiscoveryPage.module.css'

/** Registration-side read and trusted-install face for Plugin Discovery. */
export interface PluginDiscoveryInjected {
  readonly available: boolean
  readonly development: boolean
  readonly list: (query: CatalogListQuery) => Promise<CatalogListResult>
  readonly refresh: (query: CatalogListQuery) => Promise<CatalogListResult>
  readonly detail: (query: { readonly pluginId: string; readonly version: string }) => Promise<CatalogDetailResult>
  readonly checkCompatibility: (request: {
    readonly pluginId: string
    readonly version: string
    readonly action: 'install'
  }) => Promise<CompatibilityDecision>
  readonly listInstalled: () => Promise<InstalledPluginListResult>
  readonly mutationsEnabled: boolean
  readonly install: (request: {
    readonly pluginId: string
    readonly version: string
    readonly idempotencyKey: string
  }) => Promise<PluginOperationStartResult>
  readonly getOperation: () => Promise<PluginOperationSnapshot | null>
  readonly onOperationState: (listener: (operation: PluginOperationSnapshot) => void) => () => void
  readonly openPluginCenter: () => void
  readonly findWithAgent: (requirement: string) => Promise<AgentPluginFinderResult>
}

/** Result of handing one discovery requirement to the current Agent session. */
export type AgentPluginFinderResult = 'sent' | 'needs-model' | 'session-starting'

/** Full props assembled by the independent Plugin Discovery page renderer. */
export type PluginDiscoveryPageProps =
  PropsRuntime<'main.page'>
  & PropsLocale<'pluginCenter'>
  & InjectFace<PluginDiscoveryInjected>

type Translator = PluginDiscoveryPageProps['t']
type DiscoveryMode = 'overview' | 'recent' | 'popular'
type ViewState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly result: CatalogListResult }
type InstalledState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly result: InstalledPluginListResult }
type DetailState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly result: CatalogDetailResult }
type CompatibilityState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly result: CompatibilityDecision }

interface InstallPreparation {
  readonly entry: CatalogSummary
  readonly decision: CompatibilityDecision
}

interface DiscoveryCategory {
  readonly id: string
  readonly label: PluginCenterLocaleKey
  readonly capabilities: readonly CatalogCapability[]
  readonly keywords: readonly string[]
}

const CATEGORY_DEFINITIONS = [
  {
    id: 'agent-workflow', label: 'discoveryCategoryAgent', capabilities: ['agent'], keywords: ['agent', 'workflow'],
  },
  {
    id: 'web-ui', label: 'discoveryCategoryUi', capabilities: ['client'], keywords: ['ui', 'web', 'theme'],
  },
  {
    id: 'browser-search', label: 'discoveryCategoryBrowser', capabilities: ['network'], keywords: ['browser', 'search'],
  },
  {
    id: 'visual-media', label: 'discoveryCategoryVisual', capabilities: [], keywords: ['visual', 'vision', 'image', 'media', 'video', 'audio'],
  },
  {
    id: 'memory-context', label: 'discoveryCategoryMemory', capabilities: [], keywords: ['memory', 'context', 'rag'],
  },
  {
    id: 'model-service', label: 'discoveryCategoryModel', capabilities: ['model-provider'], keywords: ['model', 'provider'],
  },
  {
    id: 'developer-tools', label: 'discoveryCategoryDeveloper', capabilities: ['host', 'tool', 'filesystem', 'subprocess'], keywords: ['developer', 'code', 'git'],
  },
  {
    id: 'integrations', label: 'discoveryCategoryIntegration', capabilities: [], keywords: ['integration', 'notification', 'mcp'],
  },
] as const satisfies readonly DiscoveryCategory[]

const CAPABILITY_KEYS = {
  host: 'capabilityHost',
  client: 'capabilityClient',
  agent: 'capabilityAgent',
  tool: 'capabilityTool',
  'model-provider': 'capabilityModelProvider',
  skill: 'capabilitySkill',
  network: 'capabilityNetwork',
  filesystem: 'capabilityFilesystem',
  subprocess: 'capabilitySubprocess',
} as const satisfies Record<CatalogCapability, PluginCenterLocaleKey>

const FRESHNESS_KEYS = {
  fresh: 'fresh',
  cached: 'cached',
  stale: 'stale',
} as const satisfies Record<CatalogListResult['freshness'], PluginCenterLocaleKey>

const SOURCE_KEYS = {
  bundled: 'bundledSource',
  network: 'networkSource',
  cache: 'cacheSource',
} as const satisfies Record<CatalogListResult['source'], PluginCenterLocaleKey>

const NOTICE_KEYS = {
  'github-mapped': 'githubMapped',
  'github-partial': 'githubPartial',
  'github-source-only': 'githubSourceOnly',
  'github-no-dsh-bundle': 'githubNoDshBundle',
  'network-unavailable': 'catalogNetworkUnavailable',
} as const satisfies Record<NonNullable<CatalogListResult['notice']>, PluginCenterLocaleKey>

function entryKey(entry: CatalogSummary): string {
  return `${entry.pluginId}@${entry.version}`
}

function uniqueEntries(result: CatalogListResult): readonly CatalogSummary[] {
  const entries = new Map<string, CatalogSummary>()
  for (const section of Object.values(result.sections)) {
    for (const entry of section) entries.set(entryKey(entry), entry)
  }
  return [...entries.values()]
}

function matchesCategory(entry: CatalogSummary, category: DiscoveryCategory): boolean {
  if (category.capabilities.some(value => entry.capabilities.includes(value))) return true
  const keywords = entry.keywords.map(value => value.toLocaleLowerCase())
  return category.keywords.some(value => keywords.some(keyword => keyword.includes(value)))
}

function DiscoveryMark({ entry, featured = false, compact = false }: {
  readonly entry: CatalogSummary
  readonly featured?: boolean
  readonly compact?: boolean
}) {
  return (
    <span
      className={css.mark}
      style={{ background: entry.brandColor ?? undefined }}
      data-featured={featured || undefined}
      data-compact={compact || undefined}
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

function EntryBadges({ entry, t }: { readonly entry: CatalogSummary; readonly t: Translator }) {
  const compatibilityKey = entry.compatibility.status === 'compatible'
    ? 'compatible'
    : entry.compatibility.status === 'incompatible'
      ? 'incompatible'
      : 'unknown'
  return (
    <span className={css.featureMeta}>
      {entry.verified ? (
        <span className={css.badge} data-state="verified">
          <IconCheckOutline14 size={12} aria-hidden="true" />
          {t('verified')}
        </span>
      ) : null}
      <span className={css.badge} data-state={entry.compatibility.status}>{t(compatibilityKey)}</span>
      {entry.capabilities.slice(0, 2).map(value => (
        <span key={value} className={css.chip}>{t(CAPABILITY_KEYS[value])}</span>
      ))}
    </span>
  )
}

function actionState(
  entry: CatalogSummary,
  installedItem: InstalledPluginProjection | null,
  operation: PluginOperationSnapshot | null,
): { readonly installed: boolean; readonly blocked: boolean } {
  const matchingCommitted = operation?.action === 'install'
    && operation.pluginId === entry.pluginId
    && operation.version === entry.version
    && operation.phase === 'committed'
  return {
    installed: installedItem !== null || entry.installed || matchingCommitted,
    blocked: operation !== null && !isTerminalOperationPhase(operation.phase),
  }
}

function DiscoveryAction({
  entry, installedItem, mutationsEnabled, operation, checking, compact = false,
  onInstall, onManage, t,
}: {
  readonly entry: CatalogSummary
  readonly installedItem: InstalledPluginProjection | null
  readonly mutationsEnabled: boolean
  readonly operation: PluginOperationSnapshot | null
  readonly checking: boolean
  readonly compact?: boolean
  readonly onInstall: (entry: CatalogSummary, opener: HTMLButtonElement) => void
  readonly onManage: () => void
  readonly t: Translator
}) {
  const state = actionState(entry, installedItem, operation)
  const incompatible = entry.compatibility.status === 'incompatible'
  const disabled = !state.installed && (
    checking || incompatible || !mutationsEnabled || state.blocked || entry.scope !== 'public'
  )
  const label = state.installed
    ? t('discoveryManage')
    : checking
      ? t('checkingCompatibility')
      : state.blocked
        ? t('installationInProgress')
        : incompatible
          ? t('cannotInstall')
          : t('install')
  return (
    <Button
      variant={state.installed ? 'outline' : 'primary'}
      size="sm"
      className={compact ? css.rankAction : undefined}
      disabled={disabled}
      title={!state.installed && !mutationsEnabled
        ? t('installReleaseGated')
        : !state.installed && state.blocked
          ? t('operationInProgress')
          : undefined}
      onClick={(event) => {
        if (state.installed) onManage()
        else onInstall(entry, event.currentTarget)
      }}
    >
      {label}
    </Button>
  )
}

function FeatureCard({
  entry, installedItem, mutationsEnabled, operation, checking, onOpen, onInstall, onManage, t,
}: {
  readonly entry: CatalogSummary
  readonly installedItem: InstalledPluginProjection | null
  readonly mutationsEnabled: boolean
  readonly operation: PluginOperationSnapshot | null
  readonly checking: boolean
  readonly onOpen: (entry: CatalogSummary, opener: HTMLButtonElement) => void
  readonly onInstall: (entry: CatalogSummary, opener: HTMLButtonElement) => void
  readonly onManage: () => void
  readonly t: Translator
}) {
  return (
    <article className={css.featureCard} data-discovery-featured={entryKey(entry)}>
      <button type="button" className={css.featureBody} onClick={(event) => { onOpen(entry, event.currentTarget) }}>
        <DiscoveryMark entry={entry} featured />
        <span className={css.featureCopy}>
          <span className={css.eyebrow}><IconSparkle16 size={12} aria-hidden="true" />{t('discoveryFeaturedReason')}</span>
          <h2>{entry.displayName}</h2>
          <p>{entry.summary}</p>
          <EntryBadges entry={entry} t={t} />
        </span>
      </button>
      <footer className={css.featureFooter}>
        <span className={css.publisher}>{entry.publisher} · v{entry.version}</span>
        <DiscoveryAction
          entry={entry}
          installedItem={installedItem}
          mutationsEnabled={mutationsEnabled}
          operation={operation}
          checking={checking}
          onInstall={onInstall}
          onManage={onManage}
          t={t}
        />
      </footer>
    </article>
  )
}

function Ranking({
  entries, installedItems, mutationsEnabled, operation, checkingEntry,
  onOpen, onInstall, onManage, onViewAll, t,
}: {
  readonly entries: readonly CatalogSummary[]
  readonly installedItems: ReadonlyMap<string, InstalledPluginProjection>
  readonly mutationsEnabled: boolean
  readonly operation: PluginOperationSnapshot | null
  readonly checkingEntry: string | null
  readonly onOpen: (entry: CatalogSummary, opener: HTMLButtonElement) => void
  readonly onInstall: (entry: CatalogSummary, opener: HTMLButtonElement) => void
  readonly onManage: () => void
  readonly onViewAll: () => void
  readonly t: Translator
}) {
  return (
    <section className={css.ranking} aria-labelledby="discovery-popular-heading">
      <header className={css.rankingHeader}>
        <h2 id="discovery-popular-heading">{t('discoveryPopular')}</h2>
        <button type="button" onClick={onViewAll}>{t('discoveryViewAll')}</button>
      </header>
      <ol className={css.rankList}>{entries.slice(0, 5).map((entry, index) => (
        <li key={entryKey(entry)} className={css.rankRow}>
          <span className={css.rankNumber}>{String(index + 1).padStart(2, '0')}</span>
          <button type="button" className={css.rankButton} onClick={(event) => { onOpen(entry, event.currentTarget) }}>
            <DiscoveryMark entry={entry} compact />
            <span className={css.rankCopy}>
              <strong>{entry.displayName}</strong>
              <span>{entry.publisher}</span>
            </span>
          </button>
          <DiscoveryAction
            entry={entry}
            installedItem={installedItems.get(`${entry.catalogKind}:${entry.pluginId}`) ?? null}
            mutationsEnabled={mutationsEnabled}
            operation={operation}
            checking={checkingEntry === entryKey(entry)}
            compact
            onInstall={onInstall}
            onManage={onManage}
            t={t}
          />
        </li>
      ))}</ol>
    </section>
  )
}

function DiscoveryCard({
  entry, installedItem, mutationsEnabled, operation, checking, onOpen, onInstall, onManage, t,
}: {
  readonly entry: CatalogSummary
  readonly installedItem: InstalledPluginProjection | null
  readonly mutationsEnabled: boolean
  readonly operation: PluginOperationSnapshot | null
  readonly checking: boolean
  readonly onOpen: (entry: CatalogSummary, opener: HTMLButtonElement) => void
  readonly onInstall: (entry: CatalogSummary, opener: HTMLButtonElement) => void
  readonly onManage: () => void
  readonly t: Translator
}) {
  return (
    <li className={css.card} data-discovery-entry={entryKey(entry)}>
      <button type="button" className={css.cardButton} onClick={(event) => { onOpen(entry, event.currentTarget) }}>
        <span className={css.cardTitle}>
          <DiscoveryMark entry={entry} />
          <span className={css.cardCopy}>
            <strong>{entry.displayName}</strong>
            <span className={css.publisher}>{entry.publisher}</span>
          </span>
        </span>
        <span className={css.cardCopy}><p>{entry.summary}</p></span>
        <EntryBadges entry={entry} t={t} />
      </button>
      <footer className={css.cardFooter}>
        <span className={css.cardDate}>{t('discoveryUpdated')} {new Date(entry.updatedAt).toLocaleDateString()}</span>
        <DiscoveryAction
          entry={entry}
          installedItem={installedItem}
          mutationsEnabled={mutationsEnabled}
          operation={operation}
          checking={checking}
          onInstall={onInstall}
          onManage={onManage}
          t={t}
        />
      </footer>
    </li>
  )
}

function DiscoveryGrid({
  entries, installedItems, mutationsEnabled, operation, checkingEntry,
  onOpen, onInstall, onManage, t,
}: {
  readonly entries: readonly CatalogSummary[]
  readonly installedItems: ReadonlyMap<string, InstalledPluginProjection>
  readonly mutationsEnabled: boolean
  readonly operation: PluginOperationSnapshot | null
  readonly checkingEntry: string | null
  readonly onOpen: (entry: CatalogSummary, opener: HTMLButtonElement) => void
  readonly onInstall: (entry: CatalogSummary, opener: HTMLButtonElement) => void
  readonly onManage: () => void
  readonly t: Translator
}) {
  return (
    <ul className={css.cardGrid}>{entries.map(entry => (
      <DiscoveryCard
        key={entryKey(entry)}
        entry={entry}
        installedItem={installedItems.get(`${entry.catalogKind}:${entry.pluginId}`) ?? null}
        mutationsEnabled={mutationsEnabled}
        operation={operation}
        checking={checkingEntry === entryKey(entry)}
        onOpen={onOpen}
        onInstall={onInstall}
        onManage={onManage}
        t={t}
      />
    ))}</ul>
  )
}

function DetailDrawer({
  entry, detailState, compatibilityState, installedItem, mutationsEnabled, operation,
  operationRequestFailed, closeRef, onClose, onInstall, onManage, t,
}: {
  readonly entry: CatalogSummary
  readonly detailState: DetailState
  readonly compatibilityState: CompatibilityState
  readonly installedItem: InstalledPluginProjection | null
  readonly mutationsEnabled: boolean
  readonly operation: PluginOperationSnapshot | null
  readonly operationRequestFailed: boolean
  readonly closeRef: { current: HTMLButtonElement | null }
  readonly onClose: () => void
  readonly onInstall: (entry: CatalogSummary, opener: HTMLButtonElement) => void
  readonly onManage: () => void
  readonly t: Translator
}) {
  const detail = detailState.status === 'ready' ? detailState.result.detail : null
  const compatibilityLabel = compatibilityState.status === 'loading'
    ? t('checkingCompatibility')
    : compatibilityState.status === 'error'
      ? t('compatibilityError')
      : compatibilityState.result.allowed
        ? t('allowedToInstall')
        : t('installationBlocked')
  const compatibilityStatus = compatibilityState.status === 'loading'
    ? 'loading'
    : compatibilityState.status === 'error'
      ? 'error'
      : compatibilityState.result.allowed ? 'allowed' : 'blocked'
  const installedDetailKey = installedItem === null || installedItem.version !== entry.version
    ? null
    : installedItem.enabled ? 'installedDetailEnabled' : 'installedDetailDisabled'
  return (
    <div className={css.drawerBackdrop} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <aside className={css.drawer} aria-label={`${t('discoveryDetails')}：${entry.displayName}`}>
        <div className={css.drawerTopbar}>
          <button ref={closeRef} type="button" className={css.drawerClose} aria-label={t('discoveryCloseDetails')} onClick={onClose}>
            <IconCloseOutline16 size={16} />
          </button>
        </div>
        <div className={css.drawerBody}>
          <header className={css.drawerHeader}>
            <DiscoveryMark entry={entry} />
            <div>
              <h2>{entry.displayName}</h2>
              <p>{entry.publisher} · v{entry.version}</p>
            </div>
          </header>
          <div className={css.drawerBadges}><EntryBadges entry={entry} t={t} /></div>

          {detailState.status === 'loading' ? <p className={css.status}>{t('detailLoading')}</p> : null}
          {detailState.status === 'error' ? <p className={css.error} role="alert">{t('detailError')}</p> : null}
          {detailState.status === 'ready' && detail === null ? <p className={css.status}>{t('detailUnavailable')}</p> : null}
          {detail === null ? null : (
            <>
              {detail.screenshots.length === 0 ? null : (
                <div className={css.drawerScreenshots} aria-label={t('screenshots')}>
                  {detail.screenshots.slice(0, 2).map(media => (
                    <img key={media.url} src={media.url} alt={media.alt} width={media.width} height={media.height} />
                  ))}
                </div>
              )}
              <p className={css.drawerDescription}>{detail.description}</p>
              {installedDetailKey === null ? (
                <section className={`${css.drawerSection} ${css.preflight}`} data-state={compatibilityStatus}>
                  <h3>{t('preflight')}</h3>
                  <p>{compatibilityLabel}</p>
                  {compatibilityState.status !== 'ready' ? null : (
                    <>
                      <p>{compatibilityState.result.riskSummary}</p>
                      {compatibilityState.result.reasons.length === 0 ? null : (
                        <ul>{compatibilityState.result.reasons.map(reason => (
                          <li key={`${reason.code}:${reason.subject}`}>{t(compatibilityReasonKey(reason.code))} · {reason.subject}</li>
                        ))}</ul>
                      )}
                    </>
                  )}
                </section>
              ) : (
                <section className={`${css.drawerSection} ${css.preflight}`} data-state="allowed">
                  <h3>{t('installedStatus')}</h3>
                  <p>{t(installedDetailKey)}</p>
                </section>
              )}
              <section className={css.drawerSection}>
                <h3>{t('information')}</h3>
                <dl className={css.drawerFacts}>
                  <div><dt>{t('publisher')}</dt><dd>{entry.publisher}</dd></div>
                  <div><dt>{t('version')}</dt><dd>{entry.version}</dd></div>
                  <div><dt>{t('publishedAt')}</dt><dd>{new Date(detail.publishedAt).toLocaleDateString()}</dd></div>
                  <div><dt>{t('updated')}</dt><dd>{new Date(entry.updatedAt).toLocaleDateString()}</dd></div>
                </dl>
              </section>
              <section className={css.drawerSection}>
                <h3>{t('capabilities')}</h3>
                <div className={css.chips}>{entry.capabilities.map(value => (
                  <span key={value} className={css.chip}>{t(CAPABILITY_KEYS[value])}</span>
                ))}</div>
              </section>
              <section className={css.drawerSection}>
                <h3>{t('permissions')}</h3>
                {detail.permissions.length === 0
                  ? <p>{t('noPermissions')}</p>
                  : <ul>{detail.permissions.map(value => <li key={value}>{value}</li>)}</ul>}
              </section>
              <section className={css.drawerSection}>
                <h3>{t('risk')}</h3>
                <p>{detail.riskSummary}</p>
              </section>
              <section className={css.drawerSection}>
                <h3>{t('changelog')}</h3>
                <p>{detail.changelog}</p>
              </section>
            </>
          )}
          {operationRequestFailed ? <p className={css.error} role="alert">{t('operationRequestFailed')}</p> : null}
        </div>
        <footer className={css.drawerFooter}>
          <span>{entry.verified ? t('verified') : t('unreviewed')}</span>
          <DiscoveryAction
            entry={entry}
            installedItem={installedItem}
            mutationsEnabled={mutationsEnabled}
            operation={operation}
            checking={compatibilityState.status === 'loading'}
            onInstall={onInstall}
            onManage={onManage}
            t={t}
          />
        </footer>
      </aside>
    </div>
  )
}

const SKELETONS = [0, 1, 2, 3, 4, 5] as const

type AgentFinderState = 'idle' | 'submitting' | 'needs-model' | 'session-starting' | 'error'

/** Natural-language handoff into the bundled find-plugins skill. */
function AgentPluginFinder({ findWithAgent, t }: {
  readonly findWithAgent: PluginDiscoveryInjected['findWithAgent']
  readonly t: Translator
}) {
  const [requirement, setRequirement] = useState('')
  const [state, setState] = useState<AgentFinderState>('idle')
  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    const value = requirement.trim()
    if (value === '' || state === 'submitting') return
    setState('submitting')
    void findWithAgent(value).then(
      (result) => {
        setState(result === 'sent' ? 'idle' : result)
      },
      () => { setState('error') },
    )
  }
  const feedback = state === 'needs-model'
    ? t('agentFinderNeedsModel')
    : state === 'session-starting'
      ? t('agentFinderSessionStarting')
      : state === 'error'
        ? t('agentFinderError')
        : null
  return (
    <section className={css.agentFinder} aria-labelledby="agent-plugin-finder-title">
      <div className={css.agentFinderIcon} aria-hidden="true"><IconSparkle16 size={18} /></div>
      <div className={css.agentFinderBody}>
        <div className={css.agentFinderCopy}>
          <h2 id="agent-plugin-finder-title">{t('agentFinderTitle')}</h2>
          <p>{t('agentFinderDescription')}</p>
        </div>
        <form className={css.agentFinderForm} onSubmit={submit}>
          <input
            value={requirement}
            placeholder={t('agentFinderPlaceholder')}
            aria-label={t('agentFinderPlaceholder')}
            maxLength={500}
            onChange={(event) => {
              setRequirement(event.currentTarget.value)
              if (state !== 'submitting') setState('idle')
            }}
          />
          <button type="submit" disabled={requirement.trim() === '' || state === 'submitting'}>
            <IconSparkle16 size={14} aria-hidden="true" />
            {t(state === 'submitting' ? 'agentFinderSubmitting' : 'agentFinderAction')}
          </button>
        </form>
        {feedback === null ? null : <p className={css.agentFinderFeedback} role="status">{feedback}</p>}
      </div>
    </section>
  )
}

/** Searchable editorial discovery page over the existing trusted Desktop catalog. */
export function PluginDiscoveryPage({
  available, development, list, refresh, detail, checkCompatibility, listInstalled,
  mutationsEnabled, install, getOperation, onOperationState, openPluginCenter, findWithAgent, t,
}: PluginDiscoveryPageProps): ReactNode {
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState<DiscoveryMode>('overview')
  const [categoryId, setCategoryId] = useState<string>('all')
  const [revision, setRevision] = useState(0)
  const [view, setView] = useState<ViewState>({ status: 'loading' })
  const [installed, setInstalled] = useState<InstalledState>({ status: 'loading' })
  const [selectedEntry, setSelectedEntry] = useState<CatalogSummary | null>(null)
  const [detailState, setDetailState] = useState<DetailState>({ status: 'loading' })
  const [compatibilityState, setCompatibilityState] = useState<CompatibilityState>({ status: 'loading' })
  const [checkingEntry, setCheckingEntry] = useState<string | null>(null)
  const [installPreparation, setInstallPreparation] = useState<InstallPreparation | null>(null)
  const [installAcknowledged, setInstallAcknowledged] = useState(false)
  const [operation, setOperation] = useState<PluginOperationSnapshot | null>(null)
  const [operationDialogOpen, setOperationDialogOpen] = useState(false)
  const [operationRequestFailed, setOperationRequestFailed] = useState(false)
  const initialRefreshStarted = useRef(false)
  const detailRequest = useRef(0)
  const detailOpener = useRef<HTMLButtonElement | null>(null)
  const installOpener = useRef<HTMLButtonElement | null>(null)
  const drawerClose = useRef<HTMLButtonElement | null>(null)
  const observedTerminal = useRef<string | null>(null)

  const criteria = useMemo<CatalogListQuery>(() => ({
    catalogKind: 'plugin',
    scope: 'public',
    query: query.trim(),
    limit: 48,
  }), [query])

  const installedItems = useMemo(() => {
    const items = new Map<string, InstalledPluginProjection>()
    if (installed.status !== 'ready') return items
    for (const item of installed.result.items) {
      if (item.source !== 'catalog' || item.pluginId === null || item.catalogKind === null) continue
      items.set(`${item.catalogKind}:${item.pluginId}`, item)
    }
    return items
  }, [installed])

  useEffect(() => {
    if (!available) return
    let current = true
    setView({ status: 'loading' })
    void Promise.resolve().then(() => list(criteria)).then(
      (result) => {
        if (!current) return
        setView({ status: 'ready', result })
        if (criteria.query !== '' || initialRefreshStarted.current) return
        initialRefreshStarted.current = true
        if (result.source === 'network' && result.freshness === 'fresh') return
        void Promise.resolve().then(() => refresh(criteria)).then(
          (next) => { if (current) setView({ status: 'ready', result: next }) },
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
      if (next?.action === 'install' && isTrustedInstallPhase(next.phase) && next.phase !== 'committed') {
        setOperationDialogOpen(true)
      }
    }
    const stop = onOperationState(observe)
    void getOperation().then(observe, () => { if (current) setOperationRequestFailed(true) })
    return () => {
      current = false
      stop()
    }
  }, [available, getOperation, onOperationState])

  useEffect(() => {
    if (operation?.phase !== 'committed') return
    const identity = `${operation.operationId}:${operation.updatedAt}`
    if (observedTerminal.current === identity) return
    observedTerminal.current = identity
    setRevision(value => value + 1)
  }, [operation])

  useEffect(() => {
    if (selectedEntry === null) return
    queueMicrotask(() => { drawerClose.current?.focus() })
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      detailRequest.current += 1
      setSelectedEntry(null)
      setOperationRequestFailed(false)
      queueMicrotask(() => { detailOpener.current?.focus() })
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => { document.removeEventListener('keydown', closeOnEscape) }
  }, [selectedEntry])

  const retry = (): void => {
    setView({ status: 'loading' })
    void Promise.resolve().then(() => refresh(criteria)).then(
      (result) => { setView({ status: 'ready', result }) },
      () => { setView({ status: 'error' }) },
    )
  }

  const openDetail = (
    entry: CatalogSummary,
    opener: HTMLButtonElement,
    initialCompatibility?: CompatibilityState,
  ): void => {
    const request = detailRequest.current + 1
    detailRequest.current = request
    detailOpener.current = opener
    setSelectedEntry(entry)
    setDetailState({ status: 'loading' })
    setCompatibilityState(initialCompatibility ?? { status: 'loading' })
    void Promise.resolve().then(() => detail({ pluginId: entry.pluginId, version: entry.version })).then(
      (result) => { if (detailRequest.current === request) setDetailState({ status: 'ready', result }) },
      () => { if (detailRequest.current === request) setDetailState({ status: 'error' }) },
    )
    const installedItem = installedItems.get(`${entry.catalogKind}:${entry.pluginId}`) ?? null
    if (initialCompatibility !== undefined || installedItem?.version === entry.version) return
    void Promise.resolve().then(() => checkCompatibility({
      pluginId: entry.pluginId,
      version: entry.version,
      action: 'install',
    })).then(
      (result) => { if (detailRequest.current === request) setCompatibilityState({ status: 'ready', result }) },
      () => { if (detailRequest.current === request) setCompatibilityState({ status: 'error' }) },
    )
  }

  const closeDetail = (): void => {
    detailRequest.current += 1
    setSelectedEntry(null)
    setOperationRequestFailed(false)
    queueMicrotask(() => { detailOpener.current?.focus() })
  }

  const requestInstall = (entry: CatalogSummary, opener: HTMLButtonElement): void => {
    const state = actionState(
      entry,
      installedItems.get(`${entry.catalogKind}:${entry.pluginId}`) ?? null,
      operation,
    )
    if (state.installed || state.blocked || !mutationsEnabled || entry.compatibility.status === 'incompatible') return
    installOpener.current = opener
    setCheckingEntry(entryKey(entry))
    setInstallAcknowledged(false)
    setOperationRequestFailed(false)
    void Promise.resolve().then(() => checkCompatibility({
      pluginId: entry.pluginId,
      version: entry.version,
      action: 'install',
    })).then(
      (decision) => {
        setCheckingEntry(null)
        if (!decision.allowed) {
          openDetail(entry, opener, { status: 'ready', result: decision })
          return
        }
        setInstallPreparation({ entry, decision })
      },
      () => {
        setCheckingEntry(null)
        openDetail(entry, opener, { status: 'error' })
      },
    )
  }

  const closeInstallConfirmation = (): void => {
    setInstallPreparation(null)
    setInstallAcknowledged(false)
    queueMicrotask(() => { installOpener.current?.focus() })
  }

  const startInstall = (entry: CatalogSummary): void => {
    setOperationRequestFailed(false)
    void install({
      pluginId: entry.pluginId,
      version: entry.version,
      idempotencyKey: `install:${entry.pluginId}:${entry.version}:${String(Date.now())}`,
    }).then(async (result) => {
      if (result.kind === 'busy') {
        const active = await getOperation()
        setOperation(active)
        setOperationDialogOpen(active?.action === 'install' && isTrustedInstallPhase(active.phase))
        setOperationRequestFailed(active === null)
        return
      }
      setOperation(result.operation)
      setOperationDialogOpen(result.operation.action === 'install' && isTrustedInstallPhase(result.operation.phase))
    }, () => { setOperationRequestFailed(true) })
  }

  const confirmInstall = (): void => {
    if (installPreparation === null || !installAcknowledged) return
    const entry = installPreparation.entry
    setInstallPreparation(null)
    setInstallAcknowledged(false)
    startInstall(entry)
  }

  if (!available) {
    return (
      <div className={css.root}>
        <div className={css.emptyPanel}>
          <strong>{t('unavailable')}</strong>
          <p>{t('unavailableHint')}</p>
        </div>
      </div>
    )
  }

  const ready = view.status === 'ready' ? view.result : null
  const allEntries = ready === null ? [] : uniqueEntries(ready)
  const availableCategories = CATEGORY_DEFINITIONS.filter(category => (
    allEntries.some(entry => matchesCategory(entry, category))
  ))
  const activeCategory = CATEGORY_DEFINITIONS.find(category => category.id === categoryId) ?? null
  const filterEntries = (entries: readonly CatalogSummary[]): readonly CatalogSummary[] => (
    activeCategory === null ? entries : entries.filter(entry => matchesCategory(entry, activeCategory))
  )
  const featured = ready === null ? [] : filterEntries(ready.sections.featured)
  const recent = ready === null ? [] : filterEntries(ready.sections.recent)
  const popular = ready === null ? [] : filterEntries(ready.sections.popular)
  const searchEntries = filterEntries(allEntries)
  const primary = featured[0] ?? searchEntries[0] ?? null
  const freshness = ready === null
    ? t('loading')
    : `${t(FRESHNESS_KEYS[ready.freshness])} · ${t(SOURCE_KEYS[ready.source])} · ${new Date(ready.generatedAt).toLocaleString()}`
  const checkingKey = checkingEntry
  const selectedInstalledItem = selectedEntry === null
    ? null
    : installedItems.get(`${selectedEntry.catalogKind}:${selectedEntry.pluginId}`) ?? null
  const operationInstalledItem = operation === null
    ? null
    : installedItems.get(`plugin:${operation.pluginId}`) ?? null
  const fullList = mode === 'recent' ? recent : popular
  const fullHeading = mode === 'recent' ? t('discoveryRecent') : t('discoveryPopular')
  const fullDescription = mode === 'recent' ? t('discoveryRecentHint') : t('discoveryPopularHint')

  return (
    <div
      className={css.root}
      aria-busy={view.status === 'loading' || checkingEntry !== null || !isTerminalOperationPhase(operation?.phase ?? 'committed')}
      data-development={development || undefined}
      title={development ? t('developmentMode') : undefined}
    >
      <div className={css.topbar}>
        <span className={css.freshness}>{freshness}</span>
        <button type="button" className={css.refreshButton} aria-label={t('refresh')} title={t('refresh')} onClick={retry}>
          <IconRefreshOutline16 size={16} />
        </button>
      </div>
      <div className={css.scroller}>
        <main className={css.content}>
          <header className={css.header}>
            <h1>{t('discoveryTitle')}</h1>
            <p>{t('discoveryIntro')}</p>
          </header>
          <AgentPluginFinder findWithAgent={findWithAgent} t={t} />
          <label className={css.search}>
            <IconSearchOutline16 aria-hidden="true" />
            <span className={css.visuallyHidden}>{t('discoverySearch')}</span>
            <input
              type="search"
              value={query}
              placeholder={t('discoverySearch')}
              aria-label={t('discoverySearch')}
              onChange={(event) => { setQuery(event.currentTarget.value) }}
            />
          </label>
          <div className={css.controls}>
            <div className={css.viewTabs} aria-label={t('discoveryViews')}>
              {([
                ['overview', 'discoveryOverview'],
                ['recent', 'discoveryRecent'],
                ['popular', 'discoveryPopular'],
              ] as const).map(([value, label]) => (
                <button key={value} type="button" aria-pressed={mode === value} onClick={() => { setMode(value) }}>{t(label)}</button>
              ))}
            </div>
            {availableCategories.length === 0 ? null : (
              <div className={css.categories} aria-label={t('discoveryCategories')}>
                <button type="button" aria-pressed={categoryId === 'all'} onClick={() => { setCategoryId('all') }}>{t('discoveryCategoryAll')}</button>
                {availableCategories.map(category => (
                  <button
                    key={category.id}
                    type="button"
                    aria-pressed={categoryId === category.id}
                    onClick={() => { setCategoryId(category.id) }}
                  >
                    {t(category.label)}
                  </button>
                ))}
              </div>
            )}
          </div>

          {view.status === 'loading' ? (
            <div className={css.skeletonGrid} role="status" aria-label={t('loading')}>
              {SKELETONS.map(value => <span key={value} className={css.skeletonCard} />)}
            </div>
          ) : null}
          {view.status === 'error' ? (
            <div className={css.error} role="alert">
              <span>{t('error')}</span>
              <button type="button" onClick={retry}>{t('retry')}</button>
            </div>
          ) : null}
          {ready?.notice !== undefined ? (
            <div className={css.emptyPanel} role="status">
              <span>{t(NOTICE_KEYS[ready.notice])}</span>
              {ready.notice === 'network-unavailable'
                ? <button type="button" onClick={retry}>{t('retry')}</button>
                : null}
            </div>
          ) : null}
          {operationRequestFailed ? <p className={css.error} role="alert">{t('operationRequestFailed')}</p> : null}

          {ready !== null && query.trim() !== '' ? (
            <section className={css.section} aria-labelledby="discovery-search-heading">
              <header className={css.sectionHeading}>
                <div>
                  <h2 id="discovery-search-heading">{t('searchResults')}</h2>
                  <p>{searchEntries.length} {t('resultUnit')}</p>
                </div>
              </header>
              {searchEntries.length === 0
                ? <p className={css.emptyPanel}>{t('emptySearch')}</p>
                : <DiscoveryGrid
                  entries={searchEntries}
                  installedItems={installedItems}
                  mutationsEnabled={mutationsEnabled}
                  operation={operation}
                  checkingEntry={checkingKey}
                  onOpen={openDetail}
                  onInstall={requestInstall}
                  onManage={openPluginCenter}
                  t={t}
                />}
            </section>
          ) : null}

          {ready !== null && query.trim() === '' && mode === 'overview' ? (
            primary === null ? <p className={css.emptyPanel}>{t('discoveryEmpty')}</p> : (
              <>
                <div className={css.overview} data-single={popular.length === 0 || undefined}>
                  <FeatureCard
                    entry={primary}
                    installedItem={installedItems.get(`${primary.catalogKind}:${primary.pluginId}`) ?? null}
                    mutationsEnabled={mutationsEnabled}
                    operation={operation}
                    checking={checkingKey === entryKey(primary)}
                    onOpen={openDetail}
                    onInstall={requestInstall}
                    onManage={openPluginCenter}
                    t={t}
                  />
                  {popular.length === 0 ? null : (
                    <Ranking
                      entries={popular}
                      installedItems={installedItems}
                      mutationsEnabled={mutationsEnabled}
                      operation={operation}
                      checkingEntry={checkingKey}
                      onOpen={openDetail}
                      onInstall={requestInstall}
                      onManage={openPluginCenter}
                      onViewAll={() => { setMode('popular') }}
                      t={t}
                    />
                  )}
                </div>
                {recent.length === 0 ? null : (
                  <section className={css.section} aria-labelledby="discovery-recent-heading">
                    <header className={css.sectionHeading}>
                      <div>
                        <h2 id="discovery-recent-heading">{t('discoveryRecent')}</h2>
                        <p>{t('discoveryRecentHint')}</p>
                      </div>
                      <button type="button" onClick={() => { setMode('recent') }}>{t('discoveryViewAll')}</button>
                    </header>
                    <DiscoveryGrid
                      entries={recent.slice(0, 6)}
                      installedItems={installedItems}
                      mutationsEnabled={mutationsEnabled}
                      operation={operation}
                      checkingEntry={checkingKey}
                      onOpen={openDetail}
                      onInstall={requestInstall}
                      onManage={openPluginCenter}
                      t={t}
                    />
                  </section>
                )}
              </>
            )
          ) : null}

          {ready !== null && query.trim() === '' && mode !== 'overview' ? (
            <section className={css.section} aria-labelledby="discovery-full-heading">
              <header className={css.sectionHeading}>
                <div>
                  <h2 id="discovery-full-heading">{fullHeading}</h2>
                  <p>{fullDescription}</p>
                </div>
              </header>
              {fullList.length === 0
                ? <p className={css.emptyPanel}>{t('discoveryEmpty')}</p>
                : <DiscoveryGrid
                  entries={fullList}
                  installedItems={installedItems}
                  mutationsEnabled={mutationsEnabled}
                  operation={operation}
                  checkingEntry={checkingKey}
                  onOpen={openDetail}
                  onInstall={requestInstall}
                  onManage={openPluginCenter}
                  t={t}
                />}
            </section>
          ) : null}
        </main>
      </div>

      {selectedEntry === null ? null : (
        <DetailDrawer
          entry={selectedEntry}
          detailState={detailState}
          compatibilityState={compatibilityState}
          installedItem={selectedInstalledItem}
          mutationsEnabled={mutationsEnabled}
          operation={operation}
          operationRequestFailed={operationRequestFailed}
          closeRef={drawerClose}
          onClose={closeDetail}
          onInstall={requestInstall}
          onManage={openPluginCenter}
          t={t}
        />
      )}
      <PluginOperationDialog
        open={operationDialogOpen}
        operation={operation}
        installedItem={operationInstalledItem}
        onClose={() => { setOperationDialogOpen(false) }}
        t={t}
      />
      {installPreparation === null ? null : (
        <PluginInstallConfirmation
          open
          entry={installPreparation.entry}
          decision={installPreparation.decision}
          acknowledged={installAcknowledged}
          onAcknowledgedChange={setInstallAcknowledged}
          onCancel={closeInstallConfirmation}
          onConfirm={confirmInstall}
          t={t}
        />
      )}
    </div>
  )
}
