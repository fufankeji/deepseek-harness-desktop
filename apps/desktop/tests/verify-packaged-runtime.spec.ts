import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { load } from 'js-yaml'
import { describe, expect, it } from 'vitest'
import { afterPack } from '../scripts/verify-packaged-runtime.ts'

const UPDATE_URL = 'https://ml2022.oss-cn-hangzhou.aliyuncs.com/deepseek-harness-desktop/releases'

function context(
  appOutDir: string,
  electronPlatformName = 'darwin',
  publish: unknown = [{ provider: 'generic', url: UPDATE_URL, channel: 'rc' }],
) {
  return {
    appOutDir,
    electronPlatformName,
    packager: {
      appInfo: {
        productFilename: 'DeepSeek Harness',
        updaterCacheDirName: 'deepseek-harness-updater',
      },
      config: { publish },
    },
  } as Parameters<typeof afterPack>[0]
}

async function writeRequiredMacRuntime(appOutDir: string): Promise<void> {
  const modules = join(appOutDir, 'DeepSeek Harness.app', 'Contents', 'Resources', 'host', 'node_modules')
  const required = [
    ['@deepseek-ai', 'dsh', 'lib', 'bin.js'],
    ['@deepseek-ai', 'dsh-web-frontend', 'dist', 'index.html'],
    ['@deepseek-ai', 'dsh-web-frontend', 'dist', 'dsh-desktop', 'default-background.webp'],
    ['@deepseek-ai', 'dsh-web-frontend', 'dist', 'dsh-desktop', 'cloud-cat-background.webp'],
    ['@deepseek-ai', 'dsh-web-frontend', 'dist', 'dsh-desktop', 'jiutian-deep-space-compute-observatory.webp'],
    ['@deepseek-ai', 'dsh-web-frontend', 'dist', 'dsh-desktop', 'jiutian-quantum-glass-laboratory.webp'],
    ['@deepseek-ai', 'dsh-web-frontend', 'dist', 'dsh-desktop', 'jiutian-dawn-compute-horizon.webp'],
    ['@deepseek-ai', 'dsh-web-frontend', 'dist', 'dsh-desktop', 'beyondata-logo.png'],
    ['pnpm', 'bin', 'pnpm.cjs'],
    ['@img', 'sharp-darwin-arm64', 'lib', 'sharp-darwin-arm64-test.node'],
  ]
  for (const segments of required) {
    const file = join(modules, ...segments)
    await mkdir(join(file, '..'), { recursive: true })
    await writeFile(file, '')
  }
  await writeFile(join(modules, 'pnpm/package.json'), JSON.stringify({ version: '11.7.0' }))
}

describe('packaged desktop runtime verification', () => {
  it('accepts the packaged runtime and writes its update configuration', async () => {
    const appOutDir = await mkdtemp(join(tmpdir(), 'dsh-packaged-runtime-'))
    try {
      await writeRequiredMacRuntime(appOutDir)

      await expect(afterPack(context(appOutDir))).resolves.toBeUndefined()
      const updateConfiguration = load(await readFile(join(
        appOutDir,
        'DeepSeek Harness.app',
        'Contents',
        'Resources',
        'app-update.yml',
      ), 'utf8'))
      expect(updateConfiguration).toEqual({
        provider: 'generic',
        url: UPDATE_URL,
        updaterCacheDirName: 'deepseek-harness-updater',
        channel: 'rc',
      })
    } finally {
      await rm(appOutDir, { recursive: true, force: true })
    }
  })

  it('rejects missing or insecure update providers', async () => {
    const appOutDir = await mkdtemp(join(tmpdir(), 'dsh-packaged-runtime-update-'))
    try {
      await writeRequiredMacRuntime(appOutDir)
      await expect(afterPack(context(appOutDir, 'darwin', null)))
        .rejects.toThrow('packaged desktop requires one generic HTTPS update provider')
      await expect(afterPack(context(appOutDir, 'darwin', [{
        provider: 'generic',
        url: 'http://updates.example.test',
        channel: 'rc',
      }])))
        .rejects.toThrow('packaged desktop update provider must use HTTPS')
      await expect(afterPack(context(appOutDir, 'darwin', [{
        provider: 'generic',
        url: UPDATE_URL,
      }])))
        .rejects.toThrow('packaged desktop requires an explicit update channel')
    } finally {
      await rm(appOutDir, { recursive: true, force: true })
    }
  })

  it('requires the macOS arm64 Sharp native module in a macOS package', async () => {
    const appOutDir = await mkdtemp(join(tmpdir(), 'dsh-packaged-runtime-mac-sharp-'))
    try {
      await writeRequiredMacRuntime(appOutDir)
      const sharp = join(
        appOutDir,
        'DeepSeek Harness.app',
        'Contents',
        'Resources',
        'host',
        'node_modules',
        '@img',
        'sharp-darwin-arm64',
        'lib',
        'sharp-darwin-arm64-test.node',
      )
      await rm(sharp)
      await expect(afterPack(context(appOutDir)))
        .rejects.toThrow('macOS arm64 Sharp native module is missing from the packaged Host runtime')
    } finally {
      await rm(appOutDir, { recursive: true, force: true })
    }
  })

  it('rejects a packaged shell whose package manager is absent or not pinned', async () => {
    const appOutDir = await mkdtemp(join(tmpdir(), 'dsh-packaged-runtime-pnpm-'))
    try {
      const modules = join(appOutDir, 'DeepSeek Harness.app', 'Contents', 'Resources', 'host', 'node_modules')
      const required = [
        ['@deepseek-ai', 'dsh', 'lib', 'bin.js'],
        ['@deepseek-ai', 'dsh-web-frontend', 'dist', 'index.html'],
        ['@deepseek-ai', 'dsh-web-frontend', 'dist', 'dsh-desktop', 'default-background.webp'],
        ['@deepseek-ai', 'dsh-web-frontend', 'dist', 'dsh-desktop', 'cloud-cat-background.webp'],
        ['@deepseek-ai', 'dsh-web-frontend', 'dist', 'dsh-desktop', 'jiutian-deep-space-compute-observatory.webp'],
        ['@deepseek-ai', 'dsh-web-frontend', 'dist', 'dsh-desktop', 'jiutian-quantum-glass-laboratory.webp'],
        ['@deepseek-ai', 'dsh-web-frontend', 'dist', 'dsh-desktop', 'jiutian-dawn-compute-horizon.webp'],
        ['@deepseek-ai', 'dsh-web-frontend', 'dist', 'dsh-desktop', 'beyondata-logo.png'],
        ['pnpm', 'bin', 'pnpm.cjs'],
      ]
      for (const segments of required) {
        const file = join(modules, ...segments)
        await mkdir(join(file, '..'), { recursive: true })
        await writeFile(file, '')
      }
      await mkdir(join(modules, 'pnpm'), { recursive: true })
      await writeFile(join(modules, 'pnpm/package.json'), JSON.stringify({ version: '11.6.0' }))

      await expect(afterPack(context(appOutDir))).rejects.toThrow('packaged pnpm version must be 11.7.0')
    } finally {
      await rm(appOutDir, { recursive: true, force: true })
    }
  })

  it('rejects a shell whose Host dependency tree was filtered out', async () => {
    const appOutDir = await mkdtemp(join(tmpdir(), 'dsh-packaged-runtime-'))
    try {
      await expect(afterPack(context(appOutDir))).rejects.toMatchObject({ code: 'ENOENT' })
    } finally {
      await rm(appOutDir, { recursive: true, force: true })
    }
  })

  it('requires Windows x64 native modules in a Windows package', async () => {
    const appOutDir = await mkdtemp(join(tmpdir(), 'dsh-packaged-runtime-win-'))
    try {
      const modules = join(appOutDir, 'resources', 'host', 'node_modules')
      const required = [
        ['@deepseek-ai', 'dsh', 'lib', 'bin.js'],
        ['@deepseek-ai', 'dsh-web-frontend', 'dist', 'index.html'],
        ['@deepseek-ai', 'dsh-web-frontend', 'dist', 'dsh-desktop', 'default-background.webp'],
        ['@deepseek-ai', 'dsh-web-frontend', 'dist', 'dsh-desktop', 'cloud-cat-background.webp'],
        ['@deepseek-ai', 'dsh-web-frontend', 'dist', 'dsh-desktop', 'jiutian-deep-space-compute-observatory.webp'],
        ['@deepseek-ai', 'dsh-web-frontend', 'dist', 'dsh-desktop', 'jiutian-quantum-glass-laboratory.webp'],
        ['@deepseek-ai', 'dsh-web-frontend', 'dist', 'dsh-desktop', 'jiutian-dawn-compute-horizon.webp'],
        ['@deepseek-ai', 'dsh-web-frontend', 'dist', 'dsh-desktop', 'beyondata-logo.png'],
        ['pnpm', 'bin', 'pnpm.cjs'],
        ['@koromix', 'koffi-win32-x64', 'win32_x64', 'koffi.node'],
        ['node-addon-require-builtin-win32-x64-msvc', 'prebuilt', 'win32-x64-msvc-napi-v9.node'],
        ['node-pty', 'prebuilds', 'win32-x64', 'conpty.node'],
        ['node-pty', 'prebuilds', 'win32-x64', 'conpty_console_list.node'],
        ['@img', 'sharp-win32-x64', 'lib', 'sharp-win32-x64-test.node'],
      ]
      for (const segments of required) {
        const file = join(modules, ...segments)
        await mkdir(join(file, '..'), { recursive: true })
        await writeFile(file, '')
      }
      await writeFile(join(modules, 'pnpm/package.json'), JSON.stringify({ version: '11.7.0' }))

      await expect(afterPack(context(appOutDir, 'win32'))).resolves.toBeUndefined()
      await rm(join(modules, 'node-pty', 'prebuilds', 'win32-x64', 'conpty_console_list.node'))
      await expect(afterPack(context(appOutDir, 'win32'))).rejects.toMatchObject({ code: 'ENOENT' })
    } finally {
      await rm(appOutDir, { recursive: true, force: true })
    }
  })
})
