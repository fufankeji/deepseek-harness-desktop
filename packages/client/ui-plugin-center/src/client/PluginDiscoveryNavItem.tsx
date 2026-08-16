import { IconSparkle16, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './PluginCenterNavItem.module.css'

/** Registration-side navigation action for Plugin Discovery. */
export interface PluginDiscoveryNavInjected {
  readonly pageId: string
  readonly open: () => void
}

/** Full props of the sidebar Plugin Discovery entry. */
export type PluginDiscoveryNavProps =
  PropsRuntime<'sidebar.primary.action'>
  & PropsLocale<'pluginCenter'>
  & InjectFace<PluginDiscoveryNavInjected>

/** First-level sidebar entry that opens the independent Plugin Discovery page. */
export function PluginDiscoveryNavItem({ wide, primaryPage, pageId, open, t }: PluginDiscoveryNavProps) {
  const selected = primaryPage === pageId
  return (
    <Tooltip label={t('discoveryNav')} delayMs={500} disabled={wide}>
      <button
        type="button"
        className={`${css.entry}${wide ? '' : ` ${css.rail}`}`}
        aria-current={selected ? 'page' : undefined}
        aria-label={t('discoveryNav')}
        data-selected={selected || undefined}
        onClick={open}
      >
        <IconSparkle16 size={wide ? 16 : 18} />
        {wide ? <span>{t('discoveryNav')}</span> : null}
      </button>
    </Tooltip>
  )
}
