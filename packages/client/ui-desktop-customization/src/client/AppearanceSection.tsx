/** In-app background chooser over the proven Harness image-skin pipeline. */

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import type { ChangeEvent, ReactNode } from 'react'
import type { AppearanceController } from './appearance-controller.ts'
import {
  BUNDLED_APPEARANCE_THEMES,
  DEFAULT_BUILTIN_APPEARANCE_THEME,
  resolveAppearanceBackground,
} from './appearance-themes.ts'
import { extractPalette, loadImage, renderBackground, validateImageFile } from './background-image.ts'
import type { AppearanceSettings, BuiltinAppearanceTheme } from './bridge.ts'
import css from './DesktopCustomization.module.css'

export interface AppearanceSectionInjected {
  readonly controller: AppearanceController
}

export type AppearanceSectionProps = Partial<AppearanceSectionInjected>

const THEME_COPY: Readonly<Record<BuiltinAppearanceTheme, {
  readonly name: string
  readonly description: string
}>> = Object.freeze({
  official: Object.freeze({
    name: '官方原版',
    description: '不使用背景图片，恢复 DeepSeek Harness 原生界面。',
  }),
  'whale-maid': Object.freeze({
    name: '大肥鱼拟人',
    description: '蓝白鲸灵助手与明亮宫殿，中央留白适配对话区。',
  }),
  'cloud-cat': Object.freeze({
    name: '云端猫咪',
    description: '柔和蓝白猫咪背景，清爽、安静、低干扰。',
  }),
  'jiutian-deep-space': Object.freeze({
    name: '九天·深空算力穹顶',
    description: '深空环形算力场，沉稳冷峻，适合深色科技演示。',
  }),
  'jiutian-quantum-glass': Object.freeze({
    name: '九天·量子玻璃实验室',
    description: '珍珠白与冰蓝玻璃结构，纯净理性、低干扰。',
  }),
  'jiutian-dawn-horizon': Object.freeze({
    name: '九天·晨曦算力网络',
    description: '象牙白、浅蓝与香槟金光轨，明亮而有发布会气质。',
  }),
})

/** Render the background selection, crop focus, glass, save, and reset controls. */
export function AppearanceSection({ controller }: AppearanceSectionProps): ReactNode {
  if (controller === undefined) return null
  return <LoadedAppearance controller={controller} />
}

function LoadedAppearance({ controller }: AppearanceSectionInjected): ReactNode {
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
  const [previewUrl, setPreviewUrl] = useState(resolveAppearanceBackground(snapshot.settings))
  const [selectedUrl, setSelectedUrl] = useState<string | undefined>(undefined)
  const [draftTheme, setDraftTheme] = useState<BuiltinAppearanceTheme | null>(snapshot.settings.builtinTheme)
  const [draftDirty, setDraftDirty] = useState(false)
  const [focusY, setFocusY] = useState(snapshot.settings.focusY)
  const [glassStrength, setGlassStrength] = useState(snapshot.settings.glassStrength)
  const [fileLabel, setFileLabel] = useState(appearanceLabel(snapshot.settings))
  const [localMessage, setLocalMessage] = useState<string | undefined>(undefined)
  const busy = snapshot.status === 'saving'
  const originalSelected = selectedUrl === undefined && draftTheme === 'official'

  useEffect(() => {
    if (draftDirty) return
    setPreviewUrl(resolveAppearanceBackground(snapshot.settings))
    setDraftTheme(snapshot.settings.builtinTheme)
    setFocusY(snapshot.settings.focusY)
    setGlassStrength(snapshot.settings.glassStrength)
    setFileLabel(appearanceLabel(snapshot.settings))
  }, [draftDirty, snapshot.settings])

  useEffect(() => () => {
    if (selectedUrl !== undefined) URL.revokeObjectURL(selectedUrl)
  }, [selectedUrl])

  const previewStyle = useMemo(() => ({
    backgroundImage: previewUrl === null
      ? 'linear-gradient(145deg, var(--dsw-alias-bg-layer-1), var(--dsw-alias-bg-base))'
      : `linear-gradient(90deg, rgba(4, 12, 22, ${String(0.18 + glassStrength / 220)}) 0%, rgba(7, 20, 34, 0.08) 50%, rgba(4, 12, 22, 0.30) 100%), url("${previewUrl}")`,
    backgroundPosition: previewUrl === null ? 'center' : `center, center ${String(focusY)}%`,
  }), [focusY, glassStrength, previewUrl])

  const selectFile = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file === undefined) return
    const invalid = validateImageFile(file)
    if (invalid !== undefined) { setLocalMessage(invalid); return }
    if (selectedUrl !== undefined) URL.revokeObjectURL(selectedUrl)
    const url = URL.createObjectURL(file)
    setSelectedUrl(url)
    setDraftTheme(null)
    setDraftDirty(true)
    setPreviewUrl(url)
    setFocusY(50)
    setFileLabel(`${file.name} · ${(file.size / 1024 / 1024).toFixed(1)} MB`)
    setLocalMessage('图片只在本机处理，不会上传。')
  }

  const selectBuiltinTheme = (themeId: BuiltinAppearanceTheme): void => {
    const theme = BUNDLED_APPEARANCE_THEMES[themeId]
    setSelectedUrl(undefined)
    setDraftTheme(themeId)
    setDraftDirty(true)
    setPreviewUrl(theme.imageUrl)
    setFocusY(theme.focusY)
    setGlassStrength(theme.glassStrength)
    setFileLabel(`内置皮肤 · ${THEME_COPY[themeId].name}`)
    setLocalMessage('已预览这套皮肤，点击“保存并应用”完成切换。')
  }

  const save = async (): Promise<void> => {
    setLocalMessage('正在处理 1920 × 1080 WebP…')
    try {
      let imageDataUrl = snapshot.settings.imageDataUrl
      let palette = snapshot.settings.palette
      if (draftTheme !== null) {
        imageDataUrl = null
        palette = BUNDLED_APPEARANCE_THEMES[draftTheme].palette
      } else if (selectedUrl !== undefined) {
        const image = await loadImage(selectedUrl)
        const canvas = renderBackground(image, focusY)
        imageDataUrl = canvas.toDataURL('image/webp', 0.86)
        palette = extractPalette(canvas)
      }
      await controller.save({ builtinTheme: draftTheme, imageDataUrl, focusY, glassStrength, palette })
      if (selectedUrl !== undefined) URL.revokeObjectURL(selectedUrl)
      setSelectedUrl(undefined)
      setDraftDirty(false)
      setLocalMessage('背景已保存，重新启动应用后仍会保留。')
    } catch (error) {
      setLocalMessage(error instanceof Error ? error.message : String(error))
    }
  }

  const reset = async (): Promise<void> => {
    try {
      await controller.reset()
      if (selectedUrl !== undefined) URL.revokeObjectURL(selectedUrl)
      setSelectedUrl(undefined)
      setDraftTheme(DEFAULT_BUILTIN_APPEARANCE_THEME)
      setDraftDirty(false)
      const theme = BUNDLED_APPEARANCE_THEMES[DEFAULT_BUILTIN_APPEARANCE_THEME]
      setPreviewUrl(theme.imageUrl)
      setFocusY(theme.focusY)
      setGlassStrength(theme.glassStrength)
      setLocalMessage('已恢复大肥鱼拟人默认皮肤。')
    } catch (error) {
      setLocalMessage(error instanceof Error ? error.message : String(error))
    }
  }

  return (
    <section className={css.section}>
      <div>
        <h2 className={css.title}>皮肤与界面氛围</h2>
        <p className={css.intro}>切换内置皮肤，或选择自己的图片；Harness 会在本机完成裁切和配色，并自动适配浅色、深色界面。</p>
      </div>
      <div>
        <h3 className={css.themeHeading}>内置皮肤</h3>
        <div className={css.themeGrid} role="group" aria-label="内置皮肤">
          {(Object.keys(BUNDLED_APPEARANCE_THEMES) as BuiltinAppearanceTheme[]).map((themeId) => {
            const theme = BUNDLED_APPEARANCE_THEMES[themeId]
            const selected = selectedUrl === undefined && draftTheme === themeId
            return (
              <button
                key={themeId}
                type="button"
                className={css.themeCard}
                aria-pressed={selected}
                disabled={busy}
                onClick={() => { selectBuiltinTheme(themeId) }}
              >
                <span
                  className={`${css.themeThumbnail}${theme.imageUrl === null ? ` ${css.originalThemeThumbnail}` : ''}`}
                  style={{ backgroundImage: theme.imageUrl === null ? 'none' : `url("${theme.imageUrl}")` }}
                >
                  {theme.imageUrl === null && <span className={css.originalThemeLabel}>原版界面</span>}
                  {selected && <span className={css.themeSelected}>当前选择</span>}
                </span>
                <span className={css.themeDetails}>
                  <strong>{THEME_COPY[themeId].name}{themeId === DEFAULT_BUILTIN_APPEARANCE_THEME ? ' · 默认' : ''}</strong>
                  <small>{THEME_COPY[themeId].description}</small>
                </span>
              </button>
            )
          })}
        </div>
      </div>
      <div className={css.preview} style={previewStyle} role="img" aria-label="当前背景预览">
        <div className={css.previewChrome}>
          <span />
          <strong>DeepSeek Harness</strong>
        </div>
        <div className={css.previewGlass}>
          <span>背景预览</span>
          <small>1920 × 1080 WebP</small>
        </div>
      </div>
      <div className={css.fileRow}>
        <div>
          <strong>{fileLabel}</strong>
          <small>支持 PNG、JPG、WebP，原图不超过 16 MB</small>
        </div>
        <label className={css.secondaryButton}>
          选择图片
          <input type="file" accept="image/png,image/jpeg,image/webp" onChange={selectFile} />
        </label>
      </div>
      <label className={css.rangeRow}>
        <span><b>主体焦点</b><output>{focusY}%</output></span>
        <input type="range" min="0" max="100" value={focusY} disabled={busy || originalSelected} onChange={(event) => { setFocusY(Number(event.target.value)) }} />
      </label>
      <label className={css.rangeRow}>
        <span><b>界面玻璃层</b><output>{glassStrength}%</output></span>
        <input type="range" min="35" max="92" value={glassStrength} disabled={busy || originalSelected} onChange={(event) => { setGlassStrength(Number(event.target.value)) }} />
      </label>
      {(localMessage ?? snapshot.message) !== undefined && (
        <p className={snapshot.status === 'error' ? css.error : css.notice}>{localMessage ?? snapshot.message}</p>
      )}
      <div className={css.actions}>
        <button type="button" className={css.primaryButton} disabled={busy} onClick={() => { void save() }}>
          {busy ? '保存中…' : '保存并应用'}
        </button>
        <button type="button" className={css.secondaryButton} disabled={busy} onClick={() => { void reset() }}>
          恢复默认
        </button>
      </div>
    </section>
  )
}

function appearanceLabel(settings: AppearanceSettings): string {
  if (settings.builtinTheme !== null) return `内置皮肤 · ${THEME_COPY[settings.builtinTheme].name}`
  return '当前使用自定义背景'
}
