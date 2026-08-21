/** Validate the staged Desktop runtime and materialize its updater configuration. */

import { access, readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { AfterPackContext } from 'electron-builder'
import { dump } from 'js-yaml'
import {
  PACKAGE_MANAGER_ENTRY_SEGMENTS,
  PINNED_PACKAGE_MANAGER_VERSION,
} from '../src/plugin-center/package-manager.ts'

const REQUIRED_HOST_FILES = [
  ['@deepseek-ai', 'dsh', 'lib', 'bin.js'],
  ['@deepseek-ai', 'dsh-web-frontend', 'dist', 'index.html'],
  ['@deepseek-ai', 'dsh-web-frontend', 'dist', 'dsh-desktop', 'default-background.webp'],
  ['@deepseek-ai', 'dsh-web-frontend', 'dist', 'dsh-desktop', 'cloud-cat-background.webp'],
  ['@deepseek-ai', 'dsh-web-frontend', 'dist', 'dsh-desktop', 'jiutian-deep-space-compute-observatory.webp'],
  ['@deepseek-ai', 'dsh-web-frontend', 'dist', 'dsh-desktop', 'jiutian-quantum-glass-laboratory.webp'],
  ['@deepseek-ai', 'dsh-web-frontend', 'dist', 'dsh-desktop', 'jiutian-dawn-compute-horizon.webp'],
  ['@deepseek-ai', 'dsh-web-frontend', 'dist', 'dsh-desktop', 'beyondata-logo.png'],
] as const

const REQUIRED_WINDOWS_HOST_FILES = [
  ['@koromix', 'koffi-win32-x64', 'win32_x64', 'koffi.node'],
  ['node-addon-require-builtin-win32-x64-msvc', 'prebuilt', 'win32-x64-msvc-napi-v9.node'],
  ['node-pty', 'prebuilds', 'win32-x64', 'conpty.node'],
  ['node-pty', 'prebuilds', 'win32-x64', 'conpty_console_list.node'],
] as const

interface GenericUpdateConfiguration {
  readonly provider: 'generic'
  readonly url: string
  readonly updaterCacheDirName: string
  readonly channel: string
}

/**
 * Verify the Host files required before the application can start and write the
 * updater configuration for every target, including unpacked preview builds.
 * @param context - Electron Builder's completed application directory.
 * @returns A promise that rejects when the runtime or generic HTTPS update provider is invalid.
 */
export async function afterPack(context: AfterPackContext): Promise<void> {
  const resources = context.electronPlatformName === 'darwin'
    ? join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, 'Contents', 'Resources')
    : join(context.appOutDir, 'resources')
  for (const segments of REQUIRED_HOST_FILES) {
    await access(join(resources, 'host', 'node_modules', ...segments))
  }
  const modules = join(resources, 'host', 'node_modules')
  await access(join(modules, ...PACKAGE_MANAGER_ENTRY_SEGMENTS))
  const packageManager = JSON.parse(await readFile(join(modules, 'pnpm/package.json'), 'utf8')) as {
    readonly version?: unknown
  }
  if (packageManager.version !== PINNED_PACKAGE_MANAGER_VERSION) {
    throw new Error(`packaged pnpm version must be ${PINNED_PACKAGE_MANAGER_VERSION}`)
  }
  if (context.electronPlatformName === 'win32') {
    for (const segments of REQUIRED_WINDOWS_HOST_FILES) {
      await access(join(modules, ...segments))
    }
    const sharpFiles = await readdir(join(modules, '@img', 'sharp-win32-x64', 'lib'))
    if (!sharpFiles.some(file => /^sharp-win32-x64-.*\.node$/.test(file))) {
      throw new Error('Windows x64 Sharp native module is missing from the packaged Host runtime')
    }
  }
  if (context.electronPlatformName === 'darwin') {
    const sharpFiles = await readdir(join(modules, '@img', 'sharp-darwin-arm64', 'lib'))
    if (!sharpFiles.some(file => /^sharp-darwin-arm64-.*\.node$/.test(file))) {
      throw new Error('macOS arm64 Sharp native module is missing from the packaged Host runtime')
    }
  }
  await writeFile(
    join(resources, 'app-update.yml'),
    dump(resolveUpdateConfiguration(context), { lineWidth: -1, noRefs: true }),
  )
}

function resolveUpdateConfiguration(context: AfterPackContext): GenericUpdateConfiguration {
  const configured: unknown = context.packager.config.publish
  const candidate = Array.isArray(configured) ? configured[0] : configured
  if (!isRecord(candidate) || candidate.provider !== 'generic' || typeof candidate.url !== 'string') {
    throw new Error('packaged desktop requires one generic HTTPS update provider')
  }
  let url: URL
  try {
    url = new URL(candidate.url)
  } catch {
    throw new Error('packaged desktop update provider URL is invalid')
  }
  if (url.protocol !== 'https:') {
    throw new Error('packaged desktop update provider must use HTTPS')
  }
  const channel = candidate.channel
  if (typeof channel !== 'string' || channel.trim() === '') {
    throw new Error('packaged desktop requires an explicit update channel')
  }
  return {
    provider: 'generic',
    url: url.href.replace(/\/$/, ''),
    updaterCacheDirName: context.packager.appInfo.updaterCacheDirName,
    channel,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export default afterPack
