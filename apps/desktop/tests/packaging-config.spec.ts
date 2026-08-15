import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

interface DesktopPackage {
  readonly dependencies: Readonly<Record<string, string>>
  readonly scripts: Readonly<Record<string, string>>
  readonly build: {
    readonly afterPack: string
    readonly extraResources: readonly {
      readonly from: string
      readonly to: string
    }[]
    readonly toolsets: { readonly nsis: string }
    readonly mac: {
      readonly hardenedRuntime: boolean
      readonly icon: string
      readonly notarize: boolean
    }
    readonly win: { readonly artifactName: string; readonly icon: string; readonly target: readonly string[] }
    readonly nsis: {
      readonly oneClick: boolean
      readonly perMachine: boolean
      readonly include: string
      readonly createDesktopShortcut: string
      readonly createStartMenuShortcut: boolean
      readonly shortcutName: string
    }
  }
}

interface RootPackage {
  readonly scripts: Readonly<Record<string, string>>
}

interface RuntimePackage {
  readonly dependencies: Readonly<Record<string, string>>
}

const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repositoryRoot = resolve(desktopRoot, '../..')
const workspaceConfiguration = readFileSync(resolve(repositoryRoot, 'pnpm-workspace.yaml'), 'utf8')
const builderPatch = readFileSync(resolve(repositoryRoot, 'patches/app-builder-lib@26.15.3.patch'), 'utf8')
const macReleaseScript = readFileSync(resolve(desktopRoot, 'scripts/release-mac.ts'), 'utf8')
const windowsInstallerInclude = readFileSync(resolve(desktopRoot, 'build/installer.nsh'), 'utf8')
const desktopPackage = JSON.parse(
  readFileSync(resolve(desktopRoot, 'package.json'), 'utf8'),
) as DesktopPackage
const rootPackage = JSON.parse(
  readFileSync(resolve(repositoryRoot, 'package.json'), 'utf8'),
) as RootPackage
const runtimePackage = JSON.parse(
  readFileSync(resolve(desktopRoot, 'runtime/package.json'), 'utf8'),
) as RuntimePackage

describe('desktop packaging configuration', () => {
  it('lets electron-builder resolve the target-platform Electron distribution', () => {
    expect(desktopPackage.build).not.toHaveProperty('electronDist')
    expect(workspaceConfiguration).toContain("'app-builder-lib@26.15.3>@electron/get': '3.1.0'")
  })

  it('maps the staged Host node_modules directory as the copy root', () => {
    expect(desktopPackage.build.extraResources).toEqual(expect.arrayContaining([
      { from: 'runtime-host/package.json', to: 'host/package.json' },
      { from: 'runtime-host/node_modules', to: 'host/node_modules' },
    ]))
    expect(desktopPackage.build.afterPack).toBe('./scripts/verify-packaged-runtime.ts')
  })

  it('stages the pinned package manager with the Host dependency tree', () => {
    expect(runtimePackage.dependencies.pnpm).toBe('11.7.0')
  })

  it('owns the app-boot runtime peers that must be packaged in app.asar', () => {
    for (const packageName of [
      '@deepseek-ai/cordis',
      '@deepseek-ai/cordis-plugin-group',
      '@deepseek-ai/cordis-plugin-loader',
      '@deepseek-ai/dsh-launch-environment',
    ]) {
      expect(desktopPackage.dependencies[packageName]).toBe('workspace:^')
    }
  })

  it('unlocks the temporary signing Keychain with its own password', () => {
    expect(workspaceConfiguration).toContain(
      'app-builder-lib@26.15.3: patches/app-builder-lib@26.15.3.patch',
    )
    expect(builderPatch).toContain('cscPasswords, keychainPassword')
    expect(builderPatch).toContain('"-k", keychainPassword, keychainFile')
  })

  it('keeps the supplied image byte-for-byte and shares it across macOS and Windows', () => {
    const icon = readFileSync(resolve(desktopRoot, 'build/icon.png'))

    expect(createHash('sha256').update(icon).digest('hex'))
      .toBe('ec9cfe5ee2c931f23ba458d834a4ac75b2d50d1dcc5d94112e60c5c894455003')
    expect(desktopPackage.build.mac.icon).toBe('build/icon.png')
    expect(desktopPackage.build.win.icon).toBe('build/icon.png')
  })

  it('builds and stages the complete workspace before local packaging', () => {
    for (const name of ['package', 'dist']) {
      expect(desktopPackage.scripts[name]).toContain('pnpm --workspace-root run build')
      expect(desktopPackage.scripts[name]).toContain('scripts/stage-runtime.ts')
    }
    expect(desktopPackage.scripts.package).toContain('electron-builder --dir')
    expect(desktopPackage.scripts.package).not.toContain('release-preflight.ts')
  })

  it('routes desktop development through the fingerprinted launcher without weakening release builds', () => {
    expect(desktopPackage.scripts.dev).toBe('node --import tsx scripts/dev-desktop.ts')
    expect(desktopPackage.scripts['dev:rebuild'])
      .toBe('node --import tsx scripts/dev-desktop.ts --rebuild')
    expect(rootPackage.scripts['dev:desktop'])
      .toBe('pnpm --filter @deepseek-ai/dsh-desktop run dev')
    expect(rootPackage.scripts['dev:desktop:rebuild'])
      .toBe('pnpm --filter @deepseek-ai/dsh-desktop run dev:rebuild')
  })

  it('makes the macOS DMG and ZIP update path signed, hardened, and notarized', () => {
    const command = desktopPackage.scripts['dist:mac']

    expect(command).toBe('node --import tsx scripts/release-mac.ts')
    expect(macReleaseScript).toContain("'--mac', 'dmg', 'zip'")
    expect(desktopPackage.build.mac.hardenedRuntime).toBe(true)
    expect(desktopPackage.build.mac.notarize).toBe(true)
  })

  it('builds a per-user Windows x64 NSIS installer from a Windows-targeted runtime', () => {
    expect(desktopPackage.scripts['dist:win']).toContain('DSH_DESKTOP_TARGET_PLATFORM=win32')
    expect(desktopPackage.scripts['dist:win']).toContain('DSH_DESKTOP_TARGET_ARCH=x64')
    expect(desktopPackage.scripts['dist:win']).toContain('scripts/release-win.ts')
    expect(builderPatch).toContain('ELECTRON_BUILDER_NSIS_TEMPLATE_DIR')
    expect(desktopPackage.build.win.target).toEqual(['nsis'])
    expect(desktopPackage.build.win.artifactName)
      .toBe('DeepSeek-Harness-Desktop-Windows-x64-${version}-Setup.${ext}')
    expect(desktopPackage.build.toolsets.nsis).toBe('1.2.1')
    expect(desktopPackage.build.nsis).toMatchObject({
      oneClick: true,
      perMachine: false,
      include: 'build/installer.nsh',
      createDesktopShortcut: 'always',
      createStartMenuShortcut: true,
      shortcutName: 'DeepSeek Harness',
    })
    expect(windowsInstallerInclude).toContain('--dsh-installer-quit')
    expect(windowsInstallerInclude).toContain('!macro customCheckAppRunning')
    expect(windowsInstallerInclude).toContain('taskkill.exe')
    expect(windowsInstallerInclude).toContain('/T /F /IM "${APP_EXECUTABLE_FILENAME}"')
    expect(windowsInstallerInclude).toContain('Pop $0')
    expect(windowsInstallerInclude).toContain('Sleep 7000')
    expect(windowsInstallerInclude).toContain('$1 == "0.1.0-rc.5"')
    expect(windowsInstallerInclude).toContain(
      'DeleteRegValue SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" "UninstallString"',
    )
    expect(windowsInstallerInclude).toContain(
      'DeleteRegValue SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" "QuietUninstallString"',
    )
    expect(windowsInstallerInclude).toContain('SetOverwrite on')
    expect(windowsInstallerInclude).not.toContain('DeleteRegKey SHELL_CONTEXT')
  })

  it('exposes generic, macOS, and Windows release commands at the repository root', () => {
    expect(rootPackage.scripts['dist:desktop'])
      .toBe('pnpm --filter @deepseek-ai/dsh-desktop run dist')
    expect(rootPackage.scripts['dist:mac:desktop'])
      .toBe('pnpm --filter @deepseek-ai/dsh-desktop run dist:mac')
    expect(rootPackage.scripts['dist:win:desktop'])
      .toBe('pnpm --filter @deepseek-ai/dsh-desktop run dist:win')
    expect(rootPackage.scripts['publish:desktop-update'])
      .toBe('pnpm --filter @deepseek-ai/dsh-desktop run publish:update')
  })
})
