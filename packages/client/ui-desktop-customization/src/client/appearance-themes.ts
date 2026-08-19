/** Bundled Desktop themes and their fixed presentation defaults. */

import type { AppearancePalette, BuiltinAppearanceTheme } from './bridge.ts'

/** One named skin shipped as a static Desktop Web asset. */
export interface BundledAppearanceTheme {
  readonly id: BuiltinAppearanceTheme
  readonly imageUrl: string | null
  readonly palette: AppearancePalette
  readonly focusY: number
  readonly glassStrength: number
}

/** Theme used before a learner makes a persisted choice. */
export const DEFAULT_BUILTIN_APPEARANCE_THEME: BuiltinAppearanceTheme = 'whale-maid'

/** Fixed themes shipped with the Desktop web frontend. */
export const BUNDLED_APPEARANCE_THEMES = Object.freeze({
  official: Object.freeze({
    id: 'official',
    imageUrl: null,
    palette: Object.freeze(['#2563EB', '#1F2937', '#D1D5DB', '#60A5FA'] as const),
    focusY: 50,
    glassStrength: 72,
  }),
  'whale-maid': Object.freeze({
    id: 'whale-maid',
    imageUrl: '/dsh-desktop/default-background.webp',
    palette: Object.freeze(['#587ac2', '#253555', '#d9e5f7', '#8ba5d6'] as const),
    focusY: 50,
    glassStrength: 72,
  }),
  'cloud-cat': Object.freeze({
    id: 'cloud-cat',
    imageUrl: '/dsh-desktop/cloud-cat-background.webp',
    palette: Object.freeze(['#3b5891', '#1d2739', '#b0c7e8', '#7091cc'] as const),
    focusY: 50,
    glassStrength: 72,
  }),
  'jiutian-deep-space': Object.freeze({
    id: 'jiutian-deep-space',
    imageUrl: '/dsh-desktop/jiutian-deep-space-compute-observatory.webp',
    palette: Object.freeze(['#6767c6', '#18283e', '#b6c6df', '#7f8fe3'] as const),
    focusY: 50,
    glassStrength: 72,
  }),
  'jiutian-quantum-glass': Object.freeze({
    id: 'jiutian-quantum-glass',
    imageUrl: '/dsh-desktop/jiutian-quantum-glass-laboratory.webp',
    palette: Object.freeze(['#4f8fc1', '#2d4358', '#d6e7f4', '#83a9d4'] as const),
    focusY: 50,
    glassStrength: 72,
  }),
  'jiutian-dawn-horizon': Object.freeze({
    id: 'jiutian-dawn-horizon',
    imageUrl: '/dsh-desktop/jiutian-dawn-compute-horizon.webp',
    palette: Object.freeze(['#4f90bd', '#46566a', '#dce7f1', '#c8a968'] as const),
    focusY: 50,
    glassStrength: 72,
  }),
}) satisfies Readonly<Record<BuiltinAppearanceTheme, BundledAppearanceTheme>>

/**
 * Resolve either a custom image or one bundled theme into a renderer URL.
 * @param settings - Validated built-in identity and optional custom-image data.
 * @returns A bundled asset URL, the persisted custom-image data URL, or null for the original UI.
 */
export function resolveAppearanceBackground(
  settings: Pick<import('./bridge.ts').AppearanceSettings, 'builtinTheme' | 'imageDataUrl'>,
): string | null {
  if (settings.imageDataUrl !== null) return settings.imageDataUrl
  return BUNDLED_APPEARANCE_THEMES[
    settings.builtinTheme ?? DEFAULT_BUILTIN_APPEARANCE_THEME
  ].imageUrl
}
