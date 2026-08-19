/** Validated, owner-only persistence for the Desktop background. */

import { randomUUID } from 'node:crypto'
import { mkdir, open, readFile, rename, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type {
  DesktopAppearancePalette,
  DesktopAppearanceSettings,
  DesktopBuiltinAppearanceTheme,
} from './desktop-bridge-contract.ts'

const MAX_IMAGE_BYTES = 6 * 1024 * 1024
const HEX_COLOR = /^#[0-9a-f]{6}$/iu

/** Appearance shown before a learner selects a custom image. */
export const DEFAULT_APPEARANCE: DesktopAppearanceSettings = Object.freeze({
  builtinTheme: 'whale-maid',
  imageDataUrl: null,
  focusY: 50,
  glassStrength: 72,
  palette: Object.freeze(['#587ac2', '#253555', '#d9e5f7', '#8ba5d6'] as const),
})

function finiteRange(value: unknown, minimum: number, maximum: number, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`${label} must be a finite number from ${String(minimum)} to ${String(maximum)}`)
  }
  return value
}

function imageDataUrl(value: unknown): string | null {
  if (value === null) return null
  if (typeof value !== 'string' || !value.startsWith('data:image/webp;base64,')) {
    throw new Error('desktop background must be a WebP data URL')
  }
  const encoded = value.slice('data:image/webp;base64,'.length)
  if (!/^[A-Za-z0-9+/]*={0,2}$/u.test(encoded)) throw new Error('desktop background contains invalid base64 data')
  if (Buffer.byteLength(encoded, 'base64') > MAX_IMAGE_BYTES) {
    throw new Error(`desktop background exceeds ${String(MAX_IMAGE_BYTES)} bytes`)
  }
  return value
}

function builtinTheme(value: unknown, image: string | null): DesktopBuiltinAppearanceTheme | null {
  if (value === undefined) return image === null ? 'whale-maid' : null
  if (value === null) {
    if (image === null) throw new Error('custom desktop appearance must contain a WebP image')
    return null
  }
  if (
    value !== 'official'
    && value !== 'whale-maid'
    && value !== 'cloud-cat'
    && value !== 'jiutian-deep-space'
    && value !== 'jiutian-quantum-glass'
    && value !== 'jiutian-dawn-horizon'
  ) {
    throw new Error('desktop bundled theme is not supported')
  }
  if (image !== null) throw new Error('bundled desktop appearance must not contain a custom image')
  return value
}

function palette(value: unknown): DesktopAppearancePalette {
  if (!isPalette(value)) {
    throw new Error('desktop background palette must contain four six-digit hex colors')
  }
  return Object.freeze([value[0], value[1], value[2], value[3]])
}

function isPalette(value: unknown): value is [string, string, string, string] {
  return Array.isArray(value)
    && value.length === 4
    && value.every((color: unknown) => typeof color === 'string' && HEX_COLOR.test(color))
}

/** Validate data crossing the renderer-to-main or durable-file boundary. */
export function parseAppearance(value: unknown): DesktopAppearanceSettings {
  if (typeof value !== 'object' || value === null) throw new Error('desktop appearance must be an object')
  const input = value as Record<string, unknown>
  const image = imageDataUrl(input.imageDataUrl)
  return Object.freeze({
    builtinTheme: builtinTheme(input.builtinTheme, image),
    imageDataUrl: image,
    focusY: finiteRange(input.focusY, 0, 100, 'focusY'),
    glassStrength: finiteRange(input.glassStrength, 35, 92, 'glassStrength'),
    palette: palette(input.palette),
  })
}

/** One appearance document under Electron's private userData directory. */
export class AppearanceStorage {
  private readonly file: string

  /** @param userDataDirectory - Electron app.getPath('userData'). */
  constructor(userDataDirectory: string) {
    this.file = join(userDataDirectory, 'appearance.json')
  }

  /** Read and validate the saved document, or return the bundled default. */
  async read(): Promise<DesktopAppearanceSettings> {
    let source: string
    try {
      source = await readFile(this.file, 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return DEFAULT_APPEARANCE
      throw error
    }
    return parseAppearance(JSON.parse(source) as unknown)
  }

  /** Atomically replace the saved document with owner-only permissions. */
  async save(value: unknown): Promise<DesktopAppearanceSettings> {
    const parsed = parseAppearance(value)
    await mkdir(dirname(this.file), { recursive: true, mode: 0o700 })
    const temporary = `${this.file}.${randomUUID()}.tmp`
    const handle = await open(temporary, 'wx', 0o600)
    try {
      await handle.writeFile(`${JSON.stringify(parsed)}\n`, 'utf8')
      await handle.sync()
      await handle.close()
      await rename(temporary, this.file)
    } catch (error) {
      await handle.close().catch(() => {})
      await rm(temporary, { force: true })
      throw error
    }
    return parsed
  }

  /** Remove the custom document and return the bundled default. */
  async reset(): Promise<DesktopAppearanceSettings> {
    await rm(this.file, { force: true })
    return DEFAULT_APPEARANCE
  }
}
