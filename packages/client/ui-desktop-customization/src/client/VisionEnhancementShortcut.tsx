/** Composer shortcut for the existing Desktop visual-enhancement capability. */

import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { VisionRouteView } from '@deepseek-ai/dsh-api-remotes/client'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { ModelDirectoryState } from '@deepseek-ai/dsh-client-ui-model-selection/client'
import type { InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import {
  HoverCard, IconSparkle16,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type {
  VisionEnableProbe, VisionEnhancementState,
} from './vision-enhancement-controller.ts'
import { VisionEnhancementDialog } from './VisionEnhancementDialog.tsx'
import css from './VisionEnhancementRow.module.css'

const DEEPSEEK_NATIVE_VISION_PROVIDER = 'deepseek-official'
const DEEPSEEK_NATIVE_VISION_MODEL = 'deepseek-v4-flash-vision-exp'

/** Shared registration face for the Settings row and composer shortcut. */
export interface VisionEnhancementInjected {
  hooks: {
    /** Host-backed status bound by the slot renderer as useVisionEnhancement. */
    visionEnhancement: SnapshotStore<VisionEnhancementState>
  }
  /** Load status once when either entry first mounts. */
  load: () => Promise<void>
  /** Disable the capability through its existing Settings namespace. */
  disable: () => Promise<void>
  /** Verify a real image and enable the capability atomically. */
  enable: (input: VisionEnableProbe, signal?: AbortSignal) => Promise<string>
}

/** Session-specific model and routing controls supplied only to the composer entry. */
export type VisionEnhancementShortcutInjected = VisionEnhancementInjected & {
  hooks: {
    /** Shared visual-enhancement status. */
    visionEnhancement: SnapshotStore<VisionEnhancementState>
    /** Current Host-accepted model selection for this session. */
    visionModelDirectory: SnapshotStore<ModelDirectoryState>
  }
  /** Refresh the session's model directory. */
  loadModelDirectory: () => void
  /** Resolve the exact image path for the current model. */
  resolveRoute: (modelProvider: string, model: string) => Promise<VisionRouteView>
  /** Enable automatic routing for the current model. */
  activateRoute: (modelProvider: string, model: string) => Promise<VisionRouteView>
  /** Select DeepSeek's native multimodal model for this session and future blank sessions. */
  selectNativeVision: () => Promise<void>
}

/** Full composer shortcut props. */
export type VisionEnhancementShortcutProps =
  PropsRuntime<'conversation.input.left'> & InjectFace<VisionEnhancementShortcutInjected>

function routeText(route: VisionRouteView | undefined): string | undefined {
  if (route?.mode === 'native') return '原生视觉'
  if (route?.mode === 'compatible') return `兼容 · ${route.providerName ?? route.provider ?? '视觉服务'}`
  if (route?.mode === 'unavailable') return '当前模型不可用'
  return undefined
}

function statusText(state: VisionEnhancementState, route?: VisionRouteView, modelReady = true): string {
  if (state.status === 'loading' || state.status === 'idle') return '正在读取状态'
  if (state.status === 'saving') return state.enabled ? '正在关闭' : '正在开启'
  if (state.status === 'error') return '状态异常，点击重新配置'
  if (!modelReady) return '正在读取当前模型'
  if (state.enabled) return routeText(route) === undefined ? '已开启，正在匹配路径' : `已开启 · ${routeText(route)}`
  return '已关闭，点击后切换到支持图片的模型'
}

function hoverContent(
  state: VisionEnhancementState,
  route: VisionRouteView | undefined,
  routeError: string | undefined,
  modelReady: boolean,
): ReactNode {
  const providerName = state.providers.find(provider => provider.id === state.provider)?.name ?? state.provider
  const routeDescription = !state.enabled
    ? `点击后，右侧主模型将切换为 ${DEEPSEEK_NATIVE_VISION_MODEL}。`
    : route?.mode === 'native'
      ? `当前模型 ${route.model} 原生接收图片；优先通过 DeepSeek Files API 安全上传并复用，必要时在请求上限内回退为内联图片，不会重复调用兼容视觉服务。`
      : route?.mode === 'compatible'
        ? `当前模型不原生接收图片，改由 ${route.providerName ?? route.provider ?? providerName} · ${route.visionModel ?? state.model} 读取。`
        : route?.mode === 'unavailable'
          ? '当前模型不原生接收图片，且尚无可用的兼容视觉服务。'
          : `开启后自动优先使用当前模型的原生视觉；不支持时使用 ${providerName} · ${state.model}。`
  return (
    <div className={css.shortcutHover}>
      <div className={css.shortcutHoverTitle}>
        <span>视觉增强</span>
        <span className={state.enabled ? css.shortcutHoverOn : css.shortcutHoverStatus}>
          {state.enabled ? '已开启' : '已关闭'}
        </span>
      </div>
      <p>{routeDescription}</p>
      <div className={css.shortcutHoverHint}>{routeError ?? state.error ?? statusText(state, route, modelReady)}</div>
    </div>
  )
}

/** Render an always-visible, shared-state visual-enhancement switch in the composer. */
export function VisionEnhancementShortcut({
  useVisionEnhancement, useVisionModelDirectory, load, loadModelDirectory,
  disable, enable, resolveRoute, activateRoute, selectNativeVision,
}: VisionEnhancementShortcutProps): ReactNode {
  const state = useVisionEnhancement(snapshot => snapshot)
  const currentModel = useVisionModelDirectory(snapshot => snapshot.current)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [failure, setFailure] = useState<string>()
  const [route, setRoute] = useState<VisionRouteView>()
  const [routeError, setRouteError] = useState<string>()
  const [activating, setActivating] = useState(false)

  useEffect(() => {
    void load()
    loadModelDirectory()
  }, [load, loadModelDirectory])

  useEffect(() => {
    if (!state.enabled || currentModel === null) {
      setRoute(undefined)
      setRouteError(undefined)
      return
    }
    let current = true
    void resolveRoute(currentModel.provider, currentModel.model).then((value) => {
      if (!current) return
      setRoute(value)
      setRouteError(undefined)
    }, (error: unknown) => {
      if (!current) return
      setRoute(undefined)
      setRouteError(error instanceof Error ? error.message : String(error))
    })
    return () => { current = false }
  }, [currentModel?.model, currentModel?.provider, resolveRoute, state.enabled])

  const busy = state.status === 'idle' || state.status === 'loading' || state.status === 'saving' || activating
  const activate = (): void => {
    setFailure(undefined)
    if (!state.enabled) {
      if (currentModel === null) return
      const nativeSelected = currentModel.provider === DEEPSEEK_NATIVE_VISION_PROVIDER
        && currentModel.model === DEEPSEEK_NATIVE_VISION_MODEL
      setActivating(true)
      const selection = nativeSelected ? Promise.resolve() : selectNativeVision()
      void selection
        .then(() => activateRoute(DEEPSEEK_NATIVE_VISION_PROVIDER, DEEPSEEK_NATIVE_VISION_MODEL))
        .then((value) => {
          setRoute(value)
          setRouteError(undefined)
        }, (error: unknown) => {
          const message = error instanceof Error ? error.message : String(error)
          setFailure(message)
          setRouteError(message)
          setDialogOpen(true)
        })
        .finally(() => { setActivating(false) })
      return
    }
    void disable().catch((error: unknown) => {
      setFailure(error instanceof Error ? error.message : String(error))
      setDialogOpen(true)
    })
  }

  return (
    <>
      <HoverCard
        openDelayMs={350}
        anchor={(
          <button
            type="button"
            className={state.enabled ? css.shortcutOn : css.shortcut}
            role="switch"
            aria-checked={state.enabled}
            aria-label={`视觉增强：${statusText(state, route, currentModel !== null)}`}
            disabled={busy || currentModel === null}
            onClick={activate}
          >
            <IconSparkle16 size={14} />
            <span className={css.shortcutLabel}>视觉增强</span>
          </button>
        )}
        content={hoverContent(state, route, routeError, currentModel !== null)}
      />
      <VisionEnhancementDialog
        open={dialogOpen}
        provider={state.provider}
        providers={state.providers}
        model={state.model}
        baseUrl={state.baseUrl ?? ''}
        failure={failure}
        enable={enable}
        onClose={() => { setDialogOpen(false) }}
      />
    </>
  )
}
