// @vitest-environment jsdom
/** Keyless assembled Desktop appearance journey over the built client bundles. */

import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import {
  installAssembledBootEnv,
  mountAssembledApp,
  type AssembledBootPlugin,
} from './assembled-boot.ts'

const DESKTOP_CUSTOMIZATION: AssembledBootPlugin = {
  id: '@deepseek-ai/dsh-client-ui-desktop-customization',
  bundlePath: 'packages/client/ui-desktop-customization/lib/client.js',
  url: '/plugins/ui-desktop-customization.js',
  rev: 'fx',
  inject: [
    '@deepseek-ai/dsh-client-runtime',
    '@deepseek-ai/dsh-api-remotes',
    '@deepseek-ai/dsh-client-locale',
    '@deepseek-ai/dsh-client-ui-theme',
    '@deepseek-ai/dsh-client-ui-conversation',
    '@deepseek-ai/dsh-client-ui-settings',
    '@deepseek-ai/dsh-client-ui-layout',
  ],
}

const SETTINGS_GENERAL: AssembledBootPlugin = {
  id: '@deepseek-ai/dsh-client-ui-settings-general',
  bundlePath: 'packages/client/ui-settings-general/lib/client.js',
  url: '/plugins/ui-settings-general.js',
  rev: 'fx',
  inject: [
    '@deepseek-ai/dsh-client-runtime',
    '@deepseek-ai/dsh-client-ui-settings',
    '@deepseek-ai/dsh-client-locale',
    '@deepseek-ai/dsh-client-connection',
    '@deepseek-ai/dsh-api-remotes',
    '@deepseek-ai/dsh-client-ui-sidebar',
  ],
}

const DEFAULT_APPEARANCE = {
  builtinTheme: 'whale-maid',
  imageDataUrl: null,
  focusY: 50,
  glassStrength: 72,
  palette: ['#587ac2', '#253555', '#d9e5f7', '#8ba5d6'] as const,
}

const save = vi.fn(async (settings: typeof DEFAULT_APPEARANCE) => settings)

installAssembledBootEnv({
  setup: () => {
    save.mockClear()
    Object.defineProperty(window, 'dshDesktop', {
      configurable: true,
      value: {
        platform: 'darwin',
        appearance: {
          get: async () => DEFAULT_APPEARANCE,
          save,
          reset: async () => DEFAULT_APPEARANCE,
        },
        updates: {
          getState: async () => ({ phase: 'idle', currentVersion: '0.1.0-rc.10' }),
          check: async () => ({ phase: 'up-to-date', currentVersion: '0.1.0-rc.10' }),
          download: async () => ({ phase: 'ready', currentVersion: '0.1.0-rc.10' }),
          install: async () => {},
          onState: () => () => {},
        },
      },
    })
  },
  cleanup: () => {
    delete (window as unknown as { dshDesktop?: unknown }).dshDesktop
  },
})

it('assembled Desktop settings lists and persists the three Jiutian themes', async () => {
  mountAssembledApp([SETTINGS_GENERAL, DESKTOP_CUSTOMIZATION])

  fireEvent.click(await screen.findByRole('button', { name: 'Settings' }, { timeout: 10_000 }))
  const dialog = await screen.findByRole('dialog', { name: 'Settings' })
  fireEvent.click(await within(dialog).findByRole('button', { name: 'Background' }))

  expect(await within(dialog).findByRole('button', { name: /九天·深空算力穹顶/ })).toBeTruthy()
  expect(within(dialog).getByRole('button', { name: /九天·量子玻璃实验室/ })).toBeTruthy()
  const dawn = within(dialog).getByRole('button', { name: /九天·晨曦算力网络/ })
  fireEvent.click(dawn)
  expect(dawn.getAttribute('aria-pressed')).toBe('true')
  fireEvent.click(within(dialog).getByRole('button', { name: '保存并应用' }))

  await waitFor(() => {
    expect(save).toHaveBeenCalledWith({
      builtinTheme: 'jiutian-dawn-horizon',
      imageDataUrl: null,
      focusY: 50,
      glassStrength: 72,
      palette: ['#4f90bd', '#46566a', '#dce7f1', '#c8a968'],
    })
  })
  expect(document.body.style.getPropertyValue('--dsh-desktop-background-image'))
    .toContain('/dsh-desktop/jiutian-dawn-compute-horizon.webp')
})
