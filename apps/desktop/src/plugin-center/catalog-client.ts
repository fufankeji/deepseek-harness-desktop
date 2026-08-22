/** ETag catalog transport and verified snapshot projection owned by Desktop. */

import {
  decodeCatalogSnapshot,
  type CatalogDetailQuery,
  type CatalogDetailResult,
  type CatalogFreshness,
  type CatalogListQuery,
  type CatalogListResult,
  type CatalogSection,
  type CatalogSnapshot,
  type CatalogSource,
  type CatalogSummary,
  type CatalogVersionPreflight,
  type CompatibilityRequest,
} from '@deepseek-ai/dsh-plugin-center-contracts'
import { CatalogCache } from './catalog-cache.ts'

const MAX_RESPONSE_BYTES = 2 * 1024 * 1024

/** Result produced by the trusted HTTP transport. */
type CatalogTransportResult =
  | { readonly status: 304 }
  | { readonly status: 200; readonly etag: string; readonly body: unknown }

/** Injected transport seam; the URL never comes from the renderer. */
export type CatalogTransport = (etag: string | undefined) => Promise<CatalogTransportResult>

/** Construct a bounded HTTPS ETag transport for the fixed operator endpoint. */
export function createCatalogTransport(url: URL, fetcher: typeof fetch = fetch): CatalogTransport {
  if (url.protocol !== 'https:') throw new Error('plugin catalog endpoint must use HTTPS')
  return async (etag) => {
    const controller = new AbortController()
    const timer = setTimeout(() => { controller.abort() }, 5_000)
    try {
      const response = await fetcher(url, {
        headers: etag === undefined ? {} : { 'if-none-match': etag },
        redirect: 'error',
        signal: controller.signal,
      })
      if (response.status === 304) return { status: 304 }
      if (response.status !== 200) throw new Error(`plugin catalog returned HTTP ${String(response.status)}`)
      const declared = Number(response.headers.get('content-length'))
      if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) throw new Error('plugin catalog response exceeds 2 MiB')
      const text = await response.text()
      if (Buffer.byteLength(text, 'utf8') > MAX_RESPONSE_BYTES) throw new Error('plugin catalog response exceeds 2 MiB')
      const responseEtag = response.headers.get('etag')
      if (responseEtag === null || responseEtag.length === 0) throw new Error('plugin catalog response has no ETag')
      return { status: 200, etag: responseEtag, body: JSON.parse(text) as unknown }
    } finally {
      clearTimeout(timer)
    }
  }
}

interface CatalogState {
  readonly snapshot: CatalogSnapshot
  readonly source: CatalogSource
  readonly freshness: CatalogFreshness
}

/** Trusted exact-version input plus the snapshot facts needed for one compatibility decision. */
export interface CatalogPreflightSelection {
  readonly candidate: CatalogVersionPreflight | null
  readonly candidates: readonly CatalogVersionPreflight[]
  readonly etag: string
  readonly freshness: CatalogFreshness
}

/** Catalog facts used only by the Desktop installed projection. */
export interface CatalogInstalledAuthority {
  readonly etag: string
  readonly freshness: CatalogFreshness
  readonly entries: CatalogSnapshot['entries']
  readonly details: CatalogSnapshot['details']
  readonly preflights: CatalogSnapshot['preflights']
}

/** Catalog operations owned by the Desktop main process. */
export interface PluginCatalogRepository {
  list(query: CatalogListQuery): Promise<CatalogListResult>
  refresh(query: CatalogListQuery): Promise<CatalogListResult>
  detail(query: CatalogDetailQuery): Promise<CatalogDetailResult>
  resolvePreflight(request: CompatibilityRequest): Promise<CatalogPreflightSelection>
  installedAuthority(): Promise<CatalogInstalledAuthority>
}

function ageFreshness(snapshot: CatalogSnapshot, now: number): CatalogFreshness {
  return now - Date.parse(snapshot.generatedAt) <= snapshot.maxAgeSeconds * 1000 ? 'cached' : 'stale'
}

function searchMatches(entry: CatalogSummary, query: string): boolean {
  if (query.length === 0) return true
  const needle = query.toLocaleLowerCase()
  return [entry.displayName, entry.summary, entry.publisher, ...entry.keywords]
    .some(value => value.toLocaleLowerCase().includes(needle))
}

/** Verified cache plus one serialized ETag revalidation. */
export class CatalogRepository implements PluginCatalogRepository {
  private state: CatalogState | undefined
  private loading: Promise<CatalogState> | undefined
  private refreshing: Promise<CatalogState> | undefined

  constructor(
    private readonly cache: CatalogCache,
    private readonly bundled: CatalogSnapshot,
    private readonly transport: CatalogTransport,
    private readonly now: () => number = Date.now,
  ) {}

  private load(): Promise<CatalogState> {
    this.loading ??= this.cache.read().then((cached) => {
      const snapshot = cached ?? this.bundled
      const state: CatalogState = {
        snapshot,
        source: cached === undefined ? 'bundled' : 'cache',
        freshness: ageFreshness(snapshot, this.now()),
      }
      this.state = state
      return state
    })
    return this.loading
  }

  private revalidate(): Promise<CatalogState> {
    this.refreshing ??= this.current().then(async (current) => {
      try {
        const response = await this.transport(current.snapshot.etag)
        if (response.status === 304) {
          const next = { ...current, freshness: 'fresh' as const }
          this.state = next
          return next
        }
        const decoded = decodeCatalogSnapshot(response.body)
        if (decoded.etag !== response.etag) throw new Error('plugin catalog body and HTTP ETag differ')
        await this.cache.save(decoded)
        const next: CatalogState = { snapshot: decoded, source: 'network', freshness: 'fresh' }
        this.state = next
        return next
      } catch {
        const next = { ...current, freshness: 'stale' as const }
        this.state = next
        return next
      }
    }).finally(() => { this.refreshing = undefined })
    return this.refreshing
  }

  /** Revalidate once and project the requested list from the resulting state. */
  async refresh(query: CatalogListQuery): Promise<CatalogListResult> {
    await this.revalidate()
    return await this.list(query)
  }

  private async current(): Promise<CatalogState> {
    return this.state ?? this.load()
  }

  /** Project a bounded query without changing catalog or installed authority. */
  async list(query: CatalogListQuery): Promise<CatalogListResult> {
    const state = await this.current()
    const entries = state.snapshot.entries.filter(entry =>
      entry.catalogKind === query.catalogKind
      && entry.scope === query.scope
      && searchMatches(entry, query.query.trim()),
    )
    const byId = new Map(entries.map(entry => [entry.pluginId, entry]))
    const project = (section: CatalogSection): readonly CatalogSummary[] => {
      const ordered = query.scope === 'local'
        ? entries
        : state.snapshot.sections[section].flatMap((pluginId) => {
          const entry = byId.get(pluginId)
          return entry === undefined ? [] : [entry]
        })
      return ordered.slice(0, query.limit)
    }
    return {
      etag: state.snapshot.etag,
      generatedAt: state.snapshot.generatedAt,
      freshness: state.freshness,
      source: state.source,
      sections: {
        featured: project('featured'),
        popular: query.scope === 'local' ? [] : project('popular'),
        recent: query.scope === 'local' ? [] : project('recent'),
      },
    }
  }

  /** Resolve one exact detail from the same immutable snapshot. */
  async detail(query: CatalogDetailQuery): Promise<CatalogDetailResult> {
    const state = await this.current()
    const detail = state.snapshot.details.find(item =>
      item.summary.pluginId === query.pluginId && item.summary.version === query.version,
    ) ?? null
    return {
      etag: state.snapshot.etag,
      generatedAt: state.snapshot.generatedAt,
      freshness: state.freshness,
      source: state.source,
      detail,
    }
  }

  /** Resolve renderer intent back to catalog-owned metadata without exposing package authority. */
  async resolvePreflight(request: CompatibilityRequest): Promise<CatalogPreflightSelection> {
    const state = await this.current()
    return {
      candidate: state.snapshot.preflights.find(item =>
        item.pluginId === request.pluginId && item.version === request.version,
      ) ?? null,
      candidates: state.snapshot.preflights,
      etag: state.snapshot.etag,
      freshness: state.freshness,
    }
  }

  /** Read verified catalog enrichment without exposing the raw snapshot to the renderer. */
  async installedAuthority(): Promise<CatalogInstalledAuthority> {
    const state = await this.current()
    return {
      etag: state.snapshot.etag,
      freshness: state.freshness,
      entries: state.snapshot.entries,
      details: state.snapshot.details,
      preflights: state.snapshot.preflights,
    }
  }
}
