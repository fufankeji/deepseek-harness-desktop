/** Materialize the packaged desktop Host dependency closure. */

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { cp, lstat, mkdir, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve, sep } from 'node:path'
import {
  PACKAGE_MANAGER_ENTRY_SEGMENTS,
  PINNED_PACKAGE_MANAGER_VERSION,
} from '../src/plugin-center/package-manager.ts'
import { pruneRuntimeMetadata } from './runtime-staging-pruner.ts'

const desktopRoot = resolve(import.meta.dirname, '..')
const repositoryRoot = resolve(desktopRoot, '../..')
const staging = join(desktopRoot, 'runtime-host')
const deployRoot = resolve(desktopRoot, 'runtime')
const deployPackage = '@deepseek-ai/dsh-desktop-runtime'
const deployPackageManager = join(deployRoot, 'node_modules', ...PACKAGE_MANAGER_ENTRY_SEGMENTS)
const entry = join(staging, 'node_modules/@deepseek-ai/dsh/lib/bin.js')
const frontend = join(staging, 'node_modules/@deepseek-ai/dsh-web-frontend/dist/index.html')
const packageManagerEntry = join(staging, 'node_modules', ...PACKAGE_MANAGER_ENTRY_SEGMENTS)
const packageManagerManifest = join(staging, 'node_modules/pnpm/package.json')
const modulesState = join(staging, 'node_modules/.modules.yaml')
const subprocessPostinstall = join(
  staging,
  'node_modules/@deepseek-ai/dsh-subprocess-local/scripts/ensure-spawn-helper.mjs',
)
const workspaceState = join(repositoryRoot, 'node_modules/.pnpm-workspace-state-v1.json')
const stagedTextSuffixes = ['.cjs', '.js', '.json', '.mjs'] as const
const targetPlatform = process.env.DSH_DESKTOP_TARGET_PLATFORM ?? process.platform
const targetArch = process.env.DSH_DESKTOP_TARGET_ARCH ?? process.arch

interface Manifest {
  readonly dependencies?: Readonly<Record<string, string>>
}

async function run(command: string, args: readonly string[]): Promise<void> {
  await new Promise<void>((accept, reject) => {
    // Maintained Node releases reject direct `.cmd` spawning on Windows;
    // repository-owned pnpm arguments are safe to route through cmd.exe.
    const shell = process.platform === 'win32' && command.toLowerCase().endsWith('.cmd')
    const child = spawn(command, args, { cwd: repositoryRoot, env: { ...process.env, CI: 'true' }, shell, stdio: 'inherit' })
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (code === 0) accept()
      else reject(new Error(`desktop runtime staging failed (${code === null ? `signal ${String(signal)}` : `exit ${String(code)}`}): ${command} ${args.join(' ')}`))
    })
  })
}

async function manifest(path: string): Promise<Manifest> {
  return JSON.parse(await readFile(path, 'utf8')) as Manifest
}

async function findSymlink(directory: string): Promise<string | undefined> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    const metadata = await lstat(path)
    if (metadata.isSymbolicLink()) return path
    if (metadata.isDirectory()) {
      const nested = await findSymlink(path)
      if (nested !== undefined) return nested
    }
  }
  return undefined
}

async function materializeLinks(): Promise<void> {
  const nodeModules = join(staging, 'node_modules')
  for (let link = await findSymlink(nodeModules); link !== undefined; link = await findSymlink(nodeModules)) {
    const segments = link.slice(nodeModules.length + 1).split(sep)
    const bin = segments.lastIndexOf('.bin')
    if (bin >= 0) {
      await rm(join(nodeModules, ...segments.slice(0, bin + 1)), { recursive: true, force: true })
      continue
    }
    const source = await realpath(link)
    await rm(link, { recursive: true, force: true })
    await cp(source, link, {
      recursive: true,
      dereference: true,
      filter: path => path !== join(source, 'node_modules') && !path.startsWith(join(source, 'node_modules') + sep),
    })
  }
}

async function removeBuildMachinePaths(directory: string): Promise<void> {
  for (const directoryEntry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, directoryEntry.name)
    if (directoryEntry.isDirectory()) {
      await removeBuildMachinePaths(path)
      continue
    }
    if (!directoryEntry.isFile() || !stagedTextSuffixes.some(suffix => directoryEntry.name.endsWith(suffix))) continue
    const source = await readFile(path, 'utf8')
    const sanitized = source.replaceAll(repositoryRoot, '.')
    if (sanitized !== source) await writeFile(path, sanitized)
  }
}

async function restoreLegacyHoists(): Promise<void> {
  const deployed = await manifest(join(staging, 'package.json'))
  const sourceModules = join(deployRoot, 'node_modules')
  for (const dependency of Object.keys(deployed.dependencies ?? {})) {
    const destination = join(staging, 'node_modules', dependency)
    if (existsSync(destination)) continue
    const source = join(sourceModules, dependency)
    if (!existsSync(source)) throw new Error(`desktop runtime dependency is missing after deploy: ${dependency}`)
    await mkdir(dirname(destination), { recursive: true })
    await cp(source, destination, {
      recursive: true,
      dereference: true,
      filter: path => path !== join(source, 'node_modules') && !path.startsWith(join(source, 'node_modules') + sep),
    })
  }
}

async function deploy(): Promise<void> {
  if (!existsSync(deployPackageManager)) {
    throw new Error(`desktop source package-manager entry is missing: ${deployPackageManager}`)
  }
  const savedWorkspaceState = existsSync(workspaceState) ? await readFile(workspaceState) : undefined
  try {
    await run(process.execPath, [
      deployPackageManager,
      '--config.verify-deps-before-run=false', '--filter', deployPackage, 'deploy', '--legacy', '--prod',
      '--config.node-linker=hoisted', '--config.auto-install-peers=false', '--config.link-workspace-packages=true',
      '--config.allow-unused-patches=true', '--config.strict-dep-builds=false', staging,
    ])
  } finally {
    if (savedWorkspaceState === undefined) await rm(workspaceState, { force: true })
    else await writeFile(workspaceState, savedWorkspaceState)
  }
}

async function restoreReviewedIgnoredBuild(): Promise<void> {
  const source = await readFile(modulesState, 'utf8')
  const section = /^ignoredBuilds:\n((?:  .*\n)*)/m.exec(source)?.[1] ?? ''
  const ignored = [...section.matchAll(/^\s+-\s+("(?:[^"\\]|\\.)*")\s*$/gm)]
    .map(match => JSON.parse(match[1]!) as string)
  if (ignored.length === 0) return
  if (ignored.length !== 1 || !ignored[0]?.startsWith('@deepseek-ai/dsh-subprocess-local@file:')) {
    throw new Error(`desktop runtime deploy ignored an unexpected build-script set: ${JSON.stringify(ignored)}`)
  }
  if (!existsSync(subprocessPostinstall)) {
    throw new Error(`desktop runtime reviewed postinstall is missing: ${subprocessPostinstall}`)
  }
  await run(process.execPath, [subprocessPostinstall])
}

async function main(): Promise<void> {
  if (!['darwin', 'linux', 'win32'].includes(targetPlatform)) {
    throw new Error(`desktop runtime target platform is unsupported: ${targetPlatform}`)
  }
  if (!['arm64', 'x64'].includes(targetArch)) {
    throw new Error(`desktop runtime target architecture is unsupported: ${targetArch}`)
  }
  await run(process.execPath, [
    '--import', 'tsx', 'scripts/verify-runtime-closure.ts',
    '--manifest', 'apps/desktop/runtime/package.json',
  ])
  await rm(staging, { recursive: true, force: true })
  await deploy()
  await restoreLegacyHoists()
  await materializeLinks()
  await restoreReviewedIgnoredBuild()
  const prunedMetadataFiles = await pruneRuntimeMetadata(join(staging, 'node_modules'))
  await removeBuildMachinePaths(staging)
  if (!existsSync(entry)) throw new Error(`desktop Host entry missing after staging: ${entry}`)
  if (!existsSync(frontend)) throw new Error(`desktop Web frontend missing after staging: ${frontend}`)
  if (!existsSync(packageManagerEntry)) throw new Error(`desktop package-manager entry missing after staging: ${packageManagerEntry}`)
  const packageManager = await manifest(packageManagerManifest) as Manifest & { readonly version?: unknown }
  if (packageManager.version !== PINNED_PACKAGE_MANAGER_VERSION) {
    throw new Error(`desktop package-manager version must be ${PINNED_PACKAGE_MANAGER_VERSION}`)
  }
  console.log(`desktop runtime staged for ${targetPlatform}-${targetArch} at ${staging}; removed ${String(prunedMetadataFiles)} compile-time metadata files`)
}

await main()
