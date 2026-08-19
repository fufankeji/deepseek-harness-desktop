import { mkdtemp, readFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { AppearanceStorage, DEFAULT_APPEARANCE, parseAppearance } from '../src/appearance-storage.ts'

const directories: string[] = []

afterEach(async () => {
  const { rm } = await import('node:fs/promises')
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

async function storage(): Promise<{ directory: string; storage: AppearanceStorage }> {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-desktop-appearance-'))
  directories.push(directory)
  return { directory, storage: new AppearanceStorage(directory) }
}

describe('desktop appearance storage', () => {
  it('returns the bundled default before a learner saves a background', async () => {
    const fixture = await storage()
    await expect(fixture.storage.read()).resolves.toEqual(DEFAULT_APPEARANCE)
  })

  it('atomically saves an owner-only validated WebP document', async () => {
    const fixture = await storage()
    const settings = {
      builtinTheme: null,
      imageDataUrl: `data:image/webp;base64,${Buffer.from('webp').toString('base64')}`,
      focusY: 64,
      glassStrength: 80,
      palette: ['#112233', '#223344', '#334455', '#445566'] as const,
    }
    await expect(fixture.storage.save(settings)).resolves.toEqual(settings)
    await expect(fixture.storage.read()).resolves.toEqual(settings)
    expect((await stat(join(fixture.directory, 'appearance.json'))).mode & 0o777).toBe(0o600)
    expect(JSON.parse(await readFile(join(fixture.directory, 'appearance.json'), 'utf8'))).toEqual(settings)
  })

  it('rejects non-WebP, oversized-range, and malformed palette inputs', () => {
    expect(() => parseAppearance({ ...DEFAULT_APPEARANCE, imageDataUrl: 'https://example.test/a.png' })).toThrow('WebP')
    expect(() => parseAppearance({ ...DEFAULT_APPEARANCE, focusY: 101 })).toThrow('focusY')
    expect(() => parseAppearance({ ...DEFAULT_APPEARANCE, palette: ['red'] })).toThrow('four')
    expect(() => parseAppearance({ ...DEFAULT_APPEARANCE, builtinTheme: 'unknown' })).toThrow('not supported')
    expect(() => parseAppearance({ ...DEFAULT_APPEARANCE, builtinTheme: null })).toThrow('must contain')
  })

  it('maps pre-theme documents to the matching bundled or custom selection', () => {
    const { builtinTheme: _defaultTheme, ...legacyDefault } = DEFAULT_APPEARANCE
    expect(parseAppearance(legacyDefault).builtinTheme).toBe('whale-maid')
    const legacyCustom = {
      ...legacyDefault,
      imageDataUrl: `data:image/webp;base64,${Buffer.from('legacy').toString('base64')}`,
    }
    expect(parseAppearance(legacyCustom).builtinTheme).toBeNull()
  })

  it('accepts the image-free official theme without changing the whale first-run default', () => {
    expect(parseAppearance({ ...DEFAULT_APPEARANCE, builtinTheme: 'official' })).toMatchObject({
      builtinTheme: 'official',
      imageDataUrl: null,
    })
    expect(DEFAULT_APPEARANCE.builtinTheme).toBe('whale-maid')
  })

  it('accepts every Jiutian bundled theme without a custom image', () => {
    for (const theme of ['jiutian-deep-space', 'jiutian-quantum-glass', 'jiutian-dawn-horizon'] as const) {
      expect(parseAppearance({ ...DEFAULT_APPEARANCE, builtinTheme: theme })).toMatchObject({
        builtinTheme: theme,
        imageDataUrl: null,
      })
    }
  })

  it('removes the custom document on reset', async () => {
    const fixture = await storage()
    await fixture.storage.save(DEFAULT_APPEARANCE)
    await expect(fixture.storage.reset()).resolves.toEqual(DEFAULT_APPEARANCE)
    await expect(fixture.storage.read()).resolves.toEqual(DEFAULT_APPEARANCE)
  })
})
