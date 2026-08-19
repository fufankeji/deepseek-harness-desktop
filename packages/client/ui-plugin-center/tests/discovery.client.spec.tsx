// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  CatalogListQuery,
  CatalogListResult,
  CatalogSummary,
  InstalledPluginListResult,
} from '@deepseek-ai/dsh-plugin-center-contracts'
import { PluginDiscoveryPage, type PluginDiscoveryPageProps } from '../src/client/PluginDiscoveryPage.tsx'
import { zh, type PluginCenterLocaleKey } from '../src/client/locales.ts'
import {
  compatibilityDecision, detail, detailResult, installedListResult, operation, summary,
} from './fixtures.ts'

afterEach(cleanup)

const t = ((key: PluginCenterLocaleKey): string => zh[key]) as PluginDiscoveryPageProps['t']
const neverHook = (() => { throw new Error('test component must not read global hooks') }) as never

function entries(): {
  readonly featured: CatalogSummary
  readonly popular: CatalogSummary
  readonly recent: CatalogSummary
} {
  const featured = summary()
  return {
    featured,
    popular: {
      ...featured,
      pluginId: 'fixture.agent-flow',
      displayName: 'Agent Flow',
      summary: 'Build repeatable agent workflows.',
      capabilities: ['agent', 'tool'],
      keywords: ['agent', 'workflow'],
      brandColor: '#7657E8',
    },
    recent: {
      ...featured,
      pluginId: 'fixture.visual-kit',
      displayName: 'Visual Kit',
      summary: 'Create visual previews in the desktop client.',
      capabilities: ['client'],
      keywords: ['visual', 'media'],
      brandColor: '#E766A8',
      updatedAt: '2026-08-16T02:00:00.000Z',
    },
  }
}

function catalogResult(query: CatalogListQuery): CatalogListResult {
  const data = entries()
  const matches = (entry: CatalogSummary): boolean => {
    const needle = query.query.toLocaleLowerCase()
    return needle === ''
      || entry.displayName.toLocaleLowerCase().includes(needle)
      || entry.summary.toLocaleLowerCase().includes(needle)
  }
  return {
    etag: 'discovery-v1',
    generatedAt: '2026-08-16T02:30:00.000Z',
    freshness: 'fresh',
    source: 'network',
    sections: {
      featured: [data.featured].filter(matches),
      popular: [data.popular].filter(matches),
      recent: [data.recent].filter(matches),
    },
  }
}

function props(values: Partial<PluginDiscoveryPageProps> = {}): PluginDiscoveryPageProps {
  const list = async (query: CatalogListQuery): Promise<CatalogListResult> => catalogResult(query)
  return {
    useSessions: neverHook,
    useWorkspaces: neverHook,
    available: true,
    development: false,
    list,
    refresh: list,
    detail: async ({ pluginId }) => {
      const entry = Object.values(entries()).find(value => value.pluginId === pluginId) ?? entries().featured
      return detailResult(detail(entry))
    },
    checkCompatibility: async ({ pluginId, version }) => compatibilityDecision({ pluginId, version }),
    listInstalled: async () => ({ ...installedListResult(), items: [] }),
    mutationsEnabled: true,
    install: async () => ({ kind: 'started', operation: operation('committed') }),
    getOperation: async () => null,
    onOperationState: () => () => {},
    openPluginCenter: () => {},
    findWithAgent: async () => 'sent',
    t,
    ...values,
  }
}

describe('Plugin Discovery page', () => {
  it('shows actionable discovery context from the catalog', async () => {
    const list = async (query: CatalogListQuery): Promise<CatalogListResult> => ({
      ...catalogResult(query),
      notice: 'github-mapped',
    })
    render(<PluginDiscoveryPage {...props({ list, refresh: list })} />)

    expect(await screen.findByText(zh.githubMapped)).toBeTruthy()
  })

  it('hands a natural-language requirement to the Agent plugin finder', async () => {
    const findWithAgent = vi.fn<PluginDiscoveryPageProps['findWithAgent']>(async () => 'needs-model')
    render(<PluginDiscoveryPage {...props({ findWithAgent })} />)

    expect(await screen.findByRole('heading', { name: zh.agentFinderTitle })).toBeTruthy()
    const input = screen.getByRole('textbox', { name: zh.agentFinderPlaceholder })
    fireEvent.change(input, { target: { value: '帮我自动整理 PDF 并生成摘要' } })
    fireEvent.click(screen.getByRole('button', { name: zh.agentFinderAction }))

    await waitFor(() => {
      expect(findWithAgent).toHaveBeenCalledWith('帮我自动整理 PDF 并生成摘要')
    })
    expect(await screen.findByText(zh.agentFinderNeedsModel)).toBeTruthy()
  })

  it('arranges real catalog sections as featured, recent, popular, and capability categories', async () => {
    render(<PluginDiscoveryPage {...props()} />)

    expect(await screen.findByRole('heading', { name: zh.discoveryTitle })).toBeTruthy()
    expect(screen.getByRole('searchbox', { name: zh.discoverySearch })).toBeTruthy()
    expect(screen.getByRole('button', { name: zh.discoveryOverview }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: zh.discoveryRecent })).toBeTruthy()
    expect(screen.getByRole('button', { name: zh.discoveryPopular })).toBeTruthy()
    expect(screen.getByRole('button', { name: zh.discoveryCategoryAgent })).toBeTruthy()
    expect(screen.getByRole('button', { name: zh.discoveryCategoryUi })).toBeTruthy()
    expect(screen.getByRole('button', { name: zh.discoveryCategoryVisual })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Workspace tools' })).toBeTruthy()
    expect(screen.getByText('Agent Flow')).toBeTruthy()
    expect(screen.getByText('Visual Kit')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: zh.discoveryRecent }))
    expect(screen.getByRole('button', { name: zh.discoveryRecent }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText('Create visual previews in the desktop client.')).toBeTruthy()
  })

  it('searches through the catalog bridge and opens exact-version detail in a side drawer', async () => {
    const list = vi.fn(async (query: CatalogListQuery) => catalogResult(query))
    const readDetail = vi.fn<PluginDiscoveryPageProps['detail']>(async ({ pluginId }) => {
      const entry = Object.values(entries()).find(value => value.pluginId === pluginId) ?? entries().featured
      return detailResult(detail(entry))
    })
    const checkCompatibility = vi.fn<PluginDiscoveryPageProps['checkCompatibility']>(
      async ({ pluginId, version }) => compatibilityDecision({ pluginId, version }),
    )
    render(<PluginDiscoveryPage {...props({ list, refresh: list, detail: readDetail, checkCompatibility })} />)

    const search = await screen.findByRole('searchbox', { name: zh.discoverySearch })
    fireEvent.change(search, { target: { value: 'Visual' } })
    await waitFor(() => {
      expect(list).toHaveBeenLastCalledWith({ catalogKind: 'plugin', scope: 'public', query: 'Visual', limit: 48 })
    })
    const visual = await screen.findByText('Visual Kit')
    const opener = visual.closest('button')
    if (opener === null) throw new Error('Visual Kit detail opener is missing')
    fireEvent.click(opener)

    expect(await screen.findByRole('complementary', { name: `${zh.discoveryDetails}：Visual Kit` })).toBeTruthy()
    expect(await screen.findByText('Complete fixture detail.')).toBeTruthy()
    expect(readDetail).toHaveBeenCalledWith({ pluginId: 'fixture.visual-kit', version: '1.0.0' })
    expect(checkCompatibility).toHaveBeenCalledWith({
      pluginId: 'fixture.visual-kit', version: '1.0.0', action: 'install',
    })
  })

  it('keeps the existing compatibility acknowledgement before a trusted install', async () => {
    const install = vi.fn<PluginDiscoveryPageProps['install']>(async request => ({
      kind: 'started',
      operation: { ...operation('committed'), pluginId: request.pluginId, version: request.version },
    }))
    render(<PluginDiscoveryPage {...props({ install })} />)

    await screen.findByRole('heading', { name: zh.discoveryTitle })
    fireEvent.click(screen.getAllByRole('button', { name: zh.install })[0]!)
    expect(await screen.findByText(zh.confirmInstallIntro)).toBeTruthy()
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: zh.confirmInstall }))

    await waitFor(() => {
      expect(install).toHaveBeenCalledWith(expect.objectContaining({
        pluginId: 'fixture.workspace-tools',
        version: '1.0.0',
      }))
    })
  })

  it('sends installed entries to Plugin Center management', async () => {
    const openPluginCenter = vi.fn()
    const installed = installedListResult()
    const listInstalled = vi.fn<PluginDiscoveryPageProps['listInstalled']>(async (): Promise<InstalledPluginListResult> => installed)
    render(<PluginDiscoveryPage {...props({ listInstalled, openPluginCenter })} />)

    await screen.findByRole('heading', { name: zh.discoveryTitle })
    fireEvent.click(await screen.findByRole('button', { name: zh.discoveryManage }))
    expect(openPluginCenter).toHaveBeenCalledOnce()
  })

  it('shows installed-disabled status without running a duplicate-install preflight', async () => {
    const installed = installedListResult()
    const items = installed.items.map(item => item.pluginId === 'fixture.workspace-tools'
      ? {
        ...item,
        enabled: false,
        bundleOrder: null,
        disabledOrder: 0,
        runtimeStatus: 'inactive' as const,
        supportedActions: ['enable', 'uninstall'] as const,
      }
      : item)
    const checkCompatibility = vi.fn<PluginDiscoveryPageProps['checkCompatibility']>(
      async ({ pluginId, version }) => compatibilityDecision({ pluginId, version }),
    )
    render(<PluginDiscoveryPage {...props({
      checkCompatibility,
      listInstalled: async () => ({ ...installed, items }),
    })} />)

    const heading = await screen.findByRole('heading', { name: 'Workspace tools' })
    const opener = heading.closest('button')
    if (opener === null) throw new Error('Installed plugin detail opener is missing')
    fireEvent.click(opener)

    expect(await screen.findByText(zh.installedDetailDisabled)).toBeTruthy()
    expect(screen.queryByText(zh.installationBlocked)).toBeNull()
    expect(checkCompatibility).not.toHaveBeenCalled()
  })
})
