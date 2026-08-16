/** Desktop Plugin Center first-level navigation and independent main page. */

import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { resolveCatalogBridge } from './bridge.ts'
import { PluginCenterNavItem, type PluginCenterNavInjected } from './PluginCenterNavItem.tsx'
import { PluginCenterTab, type PluginCenterTabInjected } from './PluginCenterTab.tsx'
import { PluginDiscoveryNavItem, type PluginDiscoveryNavInjected } from './PluginDiscoveryNavItem.tsx'
import { PluginDiscoveryPage, type PluginDiscoveryInjected } from './PluginDiscoveryPage.tsx'
import { en, zh, type PluginCenterLocaleKey } from './locales.ts'

export type { DesktopCatalogBridge } from './bridge.ts'
export type { PluginCenterTabInjected, PluginCenterTabProps } from './PluginCenterTab.tsx'
export type { PluginCenterLocaleKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Desktop Plugin and Skill Bundle catalog copy. */
    pluginCenter: PluginCenterLocaleKey
  }
}

/** Dictionary namespace owned by this plugin. */
export const NS = 'pluginCenter'
/** Services used by the slot contribution. */
export const inject = ['slots', 'layout', 'locale', 'settingsNavigation']

const PLUGIN_CENTER_PAGE_ID = 'plugin-center'
const PLUGIN_DISCOVERY_PAGE_ID = 'plugin-discovery'

/** Add the Desktop-only catalog as a first-level page without replacing Settings. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-plugin-center: dictionaries')
  const resolved = resolveCatalogBridge()
  const bridge = resolved.bridge
  const unavailable = (): Promise<never> => Promise.reject(new Error('Desktop catalog bridge unavailable'))
  const injected = (): PluginCenterTabInjected => ({
    available: bridge !== undefined,
    development: resolved.development,
    list: query => bridge === undefined ? unavailable() : bridge.catalog.list(query),
    refresh: query => bridge === undefined ? unavailable() : bridge.catalog.refresh(query),
    detail: query => bridge === undefined ? unavailable() : bridge.catalog.detail(query),
    checkCompatibility: request => bridge === undefined ? unavailable() : bridge.catalog.checkCompatibility(request),
    listInstalled: () => bridge === undefined ? unavailable() : bridge.installedPlugins.list(),
    openPluginSettings: (tabId) => { ctx.settingsNavigation.open({ sectionId: 'plugins', tabId }) },
    mutationsEnabled: bridge?.pluginOperations.mutationsEnabled ?? false,
    install: request => bridge === undefined ? unavailable() : bridge.pluginOperations.install(request),
    manage: request => bridge === undefined ? unavailable() : bridge.pluginOperations.manage(request),
    getOwnedDataOffer: () => bridge === undefined ? Promise.resolve(null) : bridge.pluginOwnedData.getOffer(),
    removeOwnedData: request => bridge === undefined ? unavailable() : bridge.pluginOwnedData.remove(request),
    retainOwnedData: request => bridge === undefined ? unavailable() : bridge.pluginOwnedData.retain(request),
    getOperation: () => bridge === undefined ? Promise.resolve(null) : bridge.pluginOperations.getOperation(),
    onOperationState: listener => bridge === undefined ? () => {} : bridge.pluginOperations.onState(listener),
    getRecovery: () => bridge?.pluginRecovery?.getState() ?? Promise.resolve(null),
    retryRecovery: request => bridge?.pluginRecovery === undefined
      ? unavailable()
      : bridge.pluginRecovery.retry(request),
    exportRecoveryDiagnostics: request => bridge?.pluginRecovery === undefined
      ? unavailable()
      : bridge.pluginRecovery.exportDiagnostics(request),
    onRecoveryState: listener => bridge?.pluginRecovery?.onState(listener) ?? (() => {}),
  })

  const navInjected = (): PluginCenterNavInjected => ({
    pageId: PLUGIN_CENTER_PAGE_ID,
    open: () => { ctx.layout.openPrimaryPage(PLUGIN_CENTER_PAGE_ID) },
  })
  const discoveryNavInjected = (): PluginDiscoveryNavInjected => ({
    pageId: PLUGIN_DISCOVERY_PAGE_ID,
    open: () => { ctx.layout.openPrimaryPage(PLUGIN_DISCOVERY_PAGE_ID) },
  })
  const discoveryInjected = (): PluginDiscoveryInjected => ({
    available: bridge !== undefined,
    development: resolved.development,
    list: query => bridge === undefined ? unavailable() : bridge.catalog.list(query),
    refresh: query => bridge === undefined ? unavailable() : bridge.catalog.refresh(query),
    detail: query => bridge === undefined ? unavailable() : bridge.catalog.detail(query),
    checkCompatibility: request => bridge === undefined ? unavailable() : bridge.catalog.checkCompatibility(request),
    listInstalled: () => bridge === undefined ? unavailable() : bridge.installedPlugins.list(),
    mutationsEnabled: bridge?.pluginOperations.mutationsEnabled ?? false,
    install: request => bridge === undefined ? unavailable() : bridge.pluginOperations.install(request),
    getOperation: () => bridge === undefined ? Promise.resolve(null) : bridge.pluginOperations.getOperation(),
    onOperationState: listener => bridge === undefined ? () => {} : bridge.pluginOperations.onState(listener),
    openPluginCenter: () => { ctx.layout.openPrimaryPage(PLUGIN_CENTER_PAGE_ID) },
  })

  ctx.slots.inject('sidebar.primary.action', () => ctx.slots.register({
    name: 'sidebar.primary.action',
    id: PLUGIN_CENTER_PAGE_ID,
    order: 20,
    locale: NS,
    inject: navInjected,
  }, PluginCenterNavItem))
  ctx.slots.inject('sidebar.primary.action', () => ctx.slots.register({
    name: 'sidebar.primary.action',
    id: PLUGIN_DISCOVERY_PAGE_ID,
    order: 21,
    locale: NS,
    inject: discoveryNavInjected,
  }, PluginDiscoveryNavItem))
  ctx.slots.inject('main.page', () => ctx.slots.register({
    name: 'main.page',
    key: PLUGIN_CENTER_PAGE_ID,
    locale: NS,
    inject: injected,
  }, PluginCenterTab))
  ctx.slots.inject('main.page', () => ctx.slots.register({
    name: 'main.page',
    key: PLUGIN_DISCOVERY_PAGE_ID,
    locale: NS,
    inject: discoveryInjected,
  }, PluginDiscoveryPage))
  ctx.effect(
    () => () => {
      ctx.layout.closePrimaryPage(PLUGIN_CENTER_PAGE_ID)
      ctx.layout.closePrimaryPage(PLUGIN_DISCOVERY_PAGE_ID)
    },
    'ui-plugin-center: close selected pages on teardown',
  )
}
