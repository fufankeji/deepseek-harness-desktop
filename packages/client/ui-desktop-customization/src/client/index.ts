/** Desktop-only browser features registered through existing UI slots. */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { ConnectionHandle } from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-model-selection/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-theme/client'
import { AppearanceController } from './appearance-controller.ts'
import { AppearanceSection } from './AppearanceSection.tsx'
import { BrandBadge } from './BrandBadge.tsx'
import { desktopBridge } from './bridge.ts'
import { en, zh, type DesktopCustomizationKey } from './locales.ts'
import { UpdateSection } from './UpdateSection.tsx'
import { VisionEnhancementRow } from './VisionEnhancementRow.tsx'
import { VisionEnhancementShortcut } from './VisionEnhancementShortcut.tsx'
import type {
  VisionEnhancementInjected, VisionEnhancementShortcutInjected,
} from './VisionEnhancementShortcut.tsx'
import {
  VISION_SETTINGS_NAMESPACE, VisionEnhancementController,
} from './vision-enhancement-controller.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Desktop background and update navigation copy. */
    'desktop.customization': DesktopCustomizationKey
  }
}

const NS = 'desktop.customization'

/** Services required by the Desktop customization client plugin. */
export const inject = ['slots', 'locale', 'theme', 'connection', 'remote', 'modelDirectories']

/** Register appearance, updates, and the team attribution sidebar action. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'desktop-customization: dictionaries')
  const bridge = desktopBridge()
  const connection = ctx.get('connection') as ConnectionHandle
  const vision = new VisionEnhancementController(connection.api)
  const visionInjected = (): VisionEnhancementInjected => ({
    hooks: { visionEnhancement: vision.store },
    load: () => vision.ensureLoaded(),
    disable: () => vision.disable(),
    enable: (input, signal) => vision.enable(input, signal),
  })
  ctx.effect(() => {
    const disposers = [
      ctx.remote.$on('settings/document-updated', (ns) => {
        if (ns === VISION_SETTINGS_NAMESPACE) vision.refreshIfLoaded()
      }),
      ctx.remote.$on('credentials/reference-updated', (ref) => {
        if (ref === 'DSH_VISION_BAILIAN_API_KEY'
          || ref === 'DASHSCOPE_API_KEY'
          || ref === 'DSH_VISION_OPENROUTER_API_KEY'
          || ref === 'OPENROUTER_API_KEY') vision.refreshIfLoaded()
      }),
      ctx.on('connection/reset', () => { vision.refreshIfLoaded() }),
    ]
    return () => {
      vision.dispose()
      for (const dispose of disposers) dispose()
    }
  }, 'desktop-customization: vision status invalidations')
  const appearance = new AppearanceController(bridge, ctx.theme)
  ctx.effect(() => appearance.start(), 'desktop-customization: appearance runtime')

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'desktop-background',
    order: 30,
    label: () => ctx.locale.bind(NS)('appearanceNav'),
    inject: () => ({ controller: appearance }),
  }, AppearanceSection))
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'desktop-updates',
    order: 40,
    label: () => ctx.locale.bind(NS)('updatesNav'),
    inject: () => ({ bridge }),
  }, UpdateSection))
  ctx.slots.inject('settings.general.item', () => ctx.slots.register({
    name: 'settings.general.item',
    id: 'vision-enhancement',
    order: 35,
    inject: visionInjected,
  }, VisionEnhancementRow))
  ctx.slots.inject('conversation.input.left', () => ctx.slots.register({
    name: 'conversation.input.left',
    id: 'vision-enhancement',
    order: 20,
    inject: (sessionId): VisionEnhancementShortcutInjected => {
      const shared = visionInjected()
      const directory = ctx.modelDirectories.directoryFor(sessionId)
      return {
        ...shared,
        hooks: {
          ...shared.hooks,
          visionModelDirectory: directory.store,
        },
        loadModelDirectory: () => {
          void directory.load().catch(() => { /* model selector owns the visible retry surface */ })
        },
        resolveRoute: (modelProvider, model) => vision.route(modelProvider, model),
        activateRoute: (modelProvider, model) => vision.activate(modelProvider, model),
        selectNativeVision: () => directory.select({
          provider: 'deepseek-official',
          model: 'deepseek-v4-flash-vision-exp',
        }),
      }
    },
  }, VisionEnhancementShortcut))
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'beyondata-brand',
    order: 100,
  }, BrandBadge))
}

export type { AppearanceSnapshot } from './appearance-controller.ts'
export type { AppearanceSettings, BuiltinAppearanceTheme, DesktopUpdateState } from './bridge.ts'
