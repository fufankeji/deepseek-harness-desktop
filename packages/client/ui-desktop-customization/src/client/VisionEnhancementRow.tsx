/** General-settings row for the shared Desktop visual capability. */

import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { VisionEnhancementInjected } from './VisionEnhancementShortcut.tsx'
import { VisionEnhancementDialog } from './VisionEnhancementDialog.tsx'
import css from './VisionEnhancementRow.module.css'

/** Full Settings-row props. */
export type VisionEnhancementRowProps =
  PropsRuntime<'settings.general.item'> & InjectFace<VisionEnhancementInjected>

/** Render the full Settings entry while sharing status with the composer shortcut. */
export function VisionEnhancementRow({
  useVisionEnhancement, load, disable, enable,
}: VisionEnhancementRowProps): ReactNode {
  const state = useVisionEnhancement(snapshot => snapshot)
  const [open, setOpen] = useState(false)
  const [failure, setFailure] = useState<string>()

  useEffect(() => { void load() }, [load])

  const status = useMemo(() => {
    if (state.status === 'idle' || state.status === 'loading') return '读取中'
    if (state.status === 'saving') return '处理中'
    if (state.enabled) return '已开启'
    return '未开启'
  }, [state.enabled, state.status])

  const busy = state.status === 'idle' || state.status === 'loading' || state.status === 'saving'
  const providerName = state.providers.find(provider => provider.id === state.provider)?.name ?? state.provider
  const activate = (): void => {
    setFailure(undefined)
    if (!state.enabled) {
      setOpen(true)
      return
    }
    void disable().catch((error: unknown) => {
      setFailure(error instanceof Error ? error.message : String(error))
      setOpen(true)
    })
  }

  return (
    <>
      <div className={css.row} data-testid="vision-enhancement-row">
        <div className={css.rowText}>
          <div className={css.titleLine}>
            <span className={css.spark}>视</span>
            <span className={css.title}>视觉能力增强</span>
            <span className={css.model}>兼容视觉 · {providerName} · {state.model}</span>
          </div>
          <div className={css.desc} role={state.error === null ? undefined : 'alert'}>
            {state.error ?? '会话内的“视觉增强”用于切换官方图文模型；这里配置纯文本模型的兼容视觉备用服务。'}
          </div>
        </div>
        <div className={css.control}>
          <span className={state.enabled ? css.statusOn : css.status}>{status}</span>
          <button
            type="button"
            className={state.enabled ? css.toggleOn : css.toggle}
            role="switch"
            aria-checked={state.enabled}
            aria-label="视觉能力增强"
            disabled={busy}
            onClick={activate}
          ><span /></button>
        </div>
      </div>
      <VisionEnhancementDialog
        open={open}
        provider={state.provider}
        providers={state.providers}
        model={state.model}
        baseUrl={state.baseUrl ?? ''}
        failure={failure}
        enable={enable}
        onClose={() => { setOpen(false) }}
      />
    </>
  )
}
