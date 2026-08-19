// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppearanceController, DEFAULT_APPEARANCE } from '../src/client/appearance-controller.ts'
import { AppearanceSection } from '../src/client/AppearanceSection.tsx'
import { BUNDLED_APPEARANCE_THEMES } from '../src/client/appearance-themes.ts'
import type { AppearanceSettings, DesktopRendererBridge } from '../src/client/bridge.ts'

afterEach(() => {
  cleanup()
  document.body.removeAttribute('data-dsh-desktop-skin')
  document.body.removeAttribute('style')
})

function bench(initial: AppearanceSettings = DEFAULT_APPEARANCE) {
  let stored = initial
  const save = vi.fn(async (settings: AppearanceSettings) => {
    stored = settings
    return settings
  })
  const bridge = {
    platform: 'darwin',
    appearance: {
      get: () => Promise.resolve(stored),
      save,
      reset: () => Promise.resolve(DEFAULT_APPEARANCE),
    },
  } as unknown as DesktopRendererBridge
  const disposeTokens = vi.fn()
  const theme = { overrideTokens: vi.fn(() => disposeTokens) }
  const controller = new AppearanceController(bridge, theme as never)
  return { controller, disposeTokens, save }
}

describe('Desktop appearance themes', () => {
  it('starts with the whale-maid skin and persists one cat-theme selection', async () => {
    const fixture = bench()
    const dispose = fixture.controller.start()
    render(<AppearanceSection controller={fixture.controller} />)
    await act(async () => {})

    const whale = screen.getByRole('button', { name: /大肥鱼拟人/ })
    const cat = screen.getByRole('button', { name: /云端猫咪/ })
    expect(whale.getAttribute('aria-pressed')).toBe('true')
    expect(document.body.style.getPropertyValue('--dsh-desktop-background-image'))
      .toContain(BUNDLED_APPEARANCE_THEMES['whale-maid'].imageUrl)

    fireEvent.click(cat)
    expect(cat.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: '保存并应用' }))

    await waitFor(() => {
      expect(fixture.save).toHaveBeenCalledWith({
        builtinTheme: 'cloud-cat',
        imageDataUrl: null,
        focusY: 50,
        glassStrength: 72,
        palette: BUNDLED_APPEARANCE_THEMES['cloud-cat'].palette,
      })
    })
    expect(document.body.style.getPropertyValue('--dsh-desktop-background-image'))
      .toContain(BUNDLED_APPEARANCE_THEMES['cloud-cat'].imageUrl)

    dispose()
    expect(fixture.disposeTokens).toHaveBeenCalled()
  })

  it('persists the official original theme and removes the image skin', async () => {
    const fixture = bench()
    const dispose = fixture.controller.start()
    render(<AppearanceSection controller={fixture.controller} />)
    await act(async () => {})

    const official = screen.getByRole('button', { name: /官方原版/ })
    fireEvent.click(official)
    expect(official.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: '保存并应用' }))

    await waitFor(() => {
      expect(fixture.save).toHaveBeenCalledWith({
        builtinTheme: 'official',
        imageDataUrl: null,
        focusY: 50,
        glassStrength: 72,
        palette: BUNDLED_APPEARANCE_THEMES.official.palette,
      })
    })
    expect(document.body.hasAttribute('data-dsh-desktop-skin')).toBe(false)
    expect(document.body.style.getPropertyValue('--dsh-desktop-background-image')).toBe('')

    dispose()
  })

  it('renders and persists the Jiutian light themes', async () => {
    const fixture = bench()
    const dispose = fixture.controller.start()
    render(<AppearanceSection controller={fixture.controller} />)
    await act(async () => {})

    expect(screen.getByRole('button', { name: /九天·量子玻璃实验室/ })).toBeTruthy()
    const dawn = screen.getByRole('button', { name: /九天·晨曦算力网络/ })
    fireEvent.click(dawn)
    fireEvent.click(screen.getByRole('button', { name: '保存并应用' }))

    await waitFor(() => {
      expect(fixture.save).toHaveBeenCalledWith({
        builtinTheme: 'jiutian-dawn-horizon',
        imageDataUrl: null,
        focusY: 50,
        glassStrength: 72,
        palette: BUNDLED_APPEARANCE_THEMES['jiutian-dawn-horizon'].palette,
      })
    })
    expect(document.body.style.getPropertyValue('--dsh-desktop-background-image'))
      .toContain(BUNDLED_APPEARANCE_THEMES['jiutian-dawn-horizon'].imageUrl)

    dispose()
  })
})
