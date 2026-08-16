// @vitest-environment jsdom
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { usePinnedBrowserLanguages } from '@deepseek-ai/dsh-client-test-runtime'
import { apply, inject, NS } from '../src/client/index.ts'
import { PluginCenterNavItem, type PluginCenterNavInjected } from '../src/client/PluginCenterNavItem.tsx'
import { PluginCenterTab, type PluginCenterTabInjected } from '../src/client/PluginCenterTab.tsx'
import { PluginDiscoveryNavItem, type PluginDiscoveryNavInjected } from '../src/client/PluginDiscoveryNavItem.tsx'
import { PluginDiscoveryPage, type PluginDiscoveryInjected } from '../src/client/PluginDiscoveryPage.tsx'
import { compatibilityDecision, installedListResult, listResult } from './fixtures.ts'

usePinnedBrowserLanguages('zh-CN')

afterEach(() => {
  delete (window as unknown as { dshDesktop?: unknown }).dshDesktop
  delete (window as unknown as { __DSH_PLUGIN_CENTER_DEV__?: unknown }).__DSH_PLUGIN_CENTER_DEV__
})

async function bench(withBridge: boolean) {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const locale = new LocaleRuntime(ctx)
  const layout = { openPrimaryPage: vi.fn(), closePrimaryPage: vi.fn() }
  const settingsNavigation = { open: vi.fn(), subscribe: vi.fn(() => () => {}) }
  ctx.provide('locale', locale)
  ctx.provide('layout', layout as never)
  ctx.provide('settingsNavigation', settingsNavigation as never)
  const list = vi.fn<PluginCenterTabInjected['list']>(async query => listResult(query))
  const refresh = vi.fn<PluginCenterTabInjected['refresh']>(async query => listResult(query))
  const detail = vi.fn(async () => ({
    etag: 'fixture-v1', generatedAt: '2026-08-15T04:00:00.000Z', freshness: 'fresh', source: 'network', detail: null,
  } as const))
  const checkCompatibility = vi.fn(async () => compatibilityDecision())
  const listInstalled = vi.fn(async () => installedListResult())
  const install = vi.fn(async () => { throw new Error('release gated') })
  const manage = vi.fn(async () => { throw new Error('release gated') })
  const getOperation = vi.fn(async () => null)
  const onState = vi.fn(() => () => {})
  const getOwnedDataOffer = vi.fn(async () => null)
  const removeOwnedData = vi.fn(async (request: { operationId: string; pluginId: string; paths: readonly string[] }) => ({
    operationId: request.operationId,
    pluginId: request.pluginId,
    removedPaths: request.paths,
  }))
  const retainOwnedData = vi.fn(async (request: { operationId: string; pluginId: string }) => ({
    operationId: request.operationId,
    pluginId: request.pluginId,
    retained: true as const,
  }))
  if (withBridge) {
    Object.defineProperty(window, 'dshDesktop', {
      configurable: true,
      value: {
        catalog: { list, refresh, detail, checkCompatibility },
        installedPlugins: { list: listInstalled },
        pluginOperations: { mutationsEnabled: false, install, manage, getOperation, onState },
        pluginOwnedData: { getOffer: getOwnedDataOffer, remove: removeOwnedData, retain: retainOwnedData },
      },
    })
  }
  return {
    ctx, slots: ctx.get('slots') as SlotRegistry, locale, layout, settingsNavigation,
    list, refresh, detail, checkCompatibility, listInstalled, install, manage, getOperation, onState,
    getOwnedDataOffer, removeOwnedData, retainOwnedData,
  }
}

function declare(slots: SlotRegistry): () => void {
  return slots.register({
    name: 'root',
    children: {
      'sidebar.primary.action': { kind: 'list', scope: 'root' },
      'main.page': { kind: 'keyed', scope: 'root' },
    },
  } as never, () => null)
}

describe('ui-plugin-center browser plugin', () => {
  it('registers localized Plugin Center and Plugin Discovery pages', async () => {
    const b = await bench(true)
    declare(b.slots)
    await b.ctx.plugin({ inject: [...inject], apply }).await()

    expect(inject).toEqual(['slots', 'layout', 'locale', 'settingsNavigation'])
    const navs = b.slots.entries('sidebar.primary.action')
    const pages = b.slots.entries('main.page')
    const nav = navs.find(entry => entry.options.id === 'plugin-center')!
    const discoveryNav = navs.find(entry => entry.options.id === 'plugin-discovery')!
    const page = pages.find(entry => entry.options.key === 'plugin-center')!
    const discoveryPage = pages.find(entry => entry.options.key === 'plugin-discovery')!
    expect(nav.component).toBe(PluginCenterNavItem)
    expect(nav.options).toMatchObject({ id: 'plugin-center', order: 20 })
    expect(discoveryNav.component).toBe(PluginDiscoveryNavItem)
    expect(discoveryNav.options).toMatchObject({ id: 'plugin-discovery', order: 21 })
    expect(page.component).toBe(PluginCenterTab)
    expect(page.options).toMatchObject({ key: 'plugin-center' })
    expect(discoveryPage.component).toBe(PluginDiscoveryPage)
    expect(discoveryPage.options).toMatchObject({ key: 'plugin-discovery' })
    expect(nav.locale).toBe(NS)
    expect(discoveryNav.locale).toBe(NS)
    expect(page.locale).toBe(NS)
    expect(discoveryPage.locale).toBe(NS)

    const navFace = (nav.inject as unknown as () => PluginCenterNavInjected)()
    navFace.open()
    expect(b.layout.openPrimaryPage).toHaveBeenCalledWith('plugin-center')
    const discoveryNavFace = (discoveryNav.inject as unknown as () => PluginDiscoveryNavInjected)()
    discoveryNavFace.open()
    expect(b.layout.openPrimaryPage).toHaveBeenCalledWith('plugin-discovery')

    const face = (page.inject as unknown as () => PluginCenterTabInjected)()
    expect(face.available).toBe(true)
    expect(face.development).toBe(false)
    expect(face.mutationsEnabled).toBe(false)
    const query = { catalogKind: 'plugin', scope: 'public', query: '', limit: 24 } as const
    await face.list(query)
    await face.refresh(query)
    await face.detail({ pluginId: 'fixture.workspace-tools', version: '1.0.0' })
    await face.checkCompatibility({ pluginId: 'fixture.workspace-tools', version: '1.0.0', action: 'install' })
    await face.listInstalled()
    face.openPluginSettings('all')
    await face.getOperation()
    await face.getOwnedDataOffer?.()
    await face.removeOwnedData({
      operationId: 'operation-1', pluginId: 'fixture.workspace-tools', paths: ['cache'], confirmation: 'remove-owned-data',
    })
    await face.retainOwnedData?.({
      operationId: 'operation-1', pluginId: 'fixture.workspace-tools', confirmation: 'retain-owned-data',
    })
    const stop = face.onOperationState(() => {})
    stop()
    expect(b.list).toHaveBeenCalledWith(query)
    expect(b.refresh).toHaveBeenCalledWith(query)
    expect(b.detail).toHaveBeenCalledWith({ pluginId: 'fixture.workspace-tools', version: '1.0.0' })
    expect(b.checkCompatibility).toHaveBeenCalledWith({
      pluginId: 'fixture.workspace-tools', version: '1.0.0', action: 'install',
    })
    expect(b.listInstalled).toHaveBeenCalledOnce()
    expect(b.settingsNavigation.open).toHaveBeenCalledWith({ sectionId: 'plugins', tabId: 'all' })
    expect(b.getOperation).toHaveBeenCalledOnce()
    expect(b.onState).toHaveBeenCalledOnce()
    expect(b.getOwnedDataOffer).toHaveBeenCalledOnce()
    expect(b.removeOwnedData).toHaveBeenCalledOnce()
    expect(b.retainOwnedData).toHaveBeenCalledOnce()

    const discoveryFace = (discoveryPage.inject as unknown as () => PluginDiscoveryInjected)()
    expect(discoveryFace.available).toBe(true)
    expect(discoveryFace.development).toBe(false)
    expect(discoveryFace.mutationsEnabled).toBe(false)
    await discoveryFace.list(query)
    await discoveryFace.refresh(query)
    await discoveryFace.detail({ pluginId: 'fixture.workspace-tools', version: '1.0.0' })
    await discoveryFace.checkCompatibility({
      pluginId: 'fixture.workspace-tools', version: '1.0.0', action: 'install',
    })
    await discoveryFace.listInstalled()
    await discoveryFace.getOperation()
    const stopDiscovery = discoveryFace.onOperationState(() => {})
    stopDiscovery()
    discoveryFace.openPluginCenter()
    expect(b.layout.openPrimaryPage).toHaveBeenLastCalledWith('plugin-center')
    await b.ctx.fiber.dispose()
  })

  it('survives late declaration and exposes a read-only browser absence face', async () => {
    const b = await bench(false)
    const fiber = b.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(b.slots.entries('main.page')).toHaveLength(0)
    const stop = declare(b.slots)
    await vi.waitFor(() => {
      expect(b.slots.entries('sidebar.primary.action')).toHaveLength(2)
      expect(b.slots.entries('main.page')).toHaveLength(2)
    })
    const pluginCenterPage = b.slots.entries('main.page').find(entry => entry.options.key === 'plugin-center')!
    const face = (pluginCenterPage.inject as unknown as () => PluginCenterTabInjected)()
    expect(face.available).toBe(false)
    expect(face.development).toBe(false)
    expect(face.mutationsEnabled).toBe(false)
    await expect(face.list({ catalogKind: 'plugin', scope: 'public', query: '', limit: 24 })).rejects.toThrow('unavailable')
    stop()
    expect(b.slots.entries('main.page')).toHaveLength(0)
    declare(b.slots)
    await vi.waitFor(() => { expect(b.slots.entries('main.page')).toHaveLength(2) })
    b.locale.setLocale('en')
    await fiber.dispose()
    expect(b.slots.entries('main.page')).toHaveLength(0)
    expect(b.layout.closePrimaryPage).toHaveBeenCalledWith('plugin-center')
    expect(b.layout.closePrimaryPage).toHaveBeenCalledWith('plugin-discovery')
    await b.ctx.fiber.dispose()
  })

  it('uses the explicit Web development fixture', async () => {
    Object.defineProperty(window, '__DSH_PLUGIN_CENTER_DEV__', {
      configurable: true,
      value: { version: 1 },
    })
    const b = await bench(false)
    declare(b.slots)
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    const pluginCenterPage = b.slots.entries('main.page').find(entry => entry.options.key === 'plugin-center')!
    const face = (pluginCenterPage.inject as unknown as () => PluginCenterTabInjected)()
    expect(face.available).toBe(true)
    expect(face.development).toBe(true)
    expect(face.mutationsEnabled).toBe(true)
    const result = await face.list({ catalogKind: 'plugin', scope: 'public', query: '', limit: 24 })
    expect(result.sections.featured[0]?.pluginId).toBe('fixture.workspace-tools')
    await b.ctx.fiber.dispose()
  })
})
