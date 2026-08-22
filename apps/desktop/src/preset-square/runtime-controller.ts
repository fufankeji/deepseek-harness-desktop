/** Desktop-owned detection and confirmed installation for bundled Preset runtimes. */

import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { delimiter, join, relative, resolve } from 'node:path'
import { writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import {
  type ManagedPresetRuntimeId,
  type PresetRuntimeDependency,
  type PresetRuntimeDependencyId,
  type PresetRuntimeSnapshot,
} from '@deepseek-ai/dsh-plugin-center-contracts'
import { PACKAGE_MANAGER_REGISTRY } from '../plugin-center/package-manager.ts'

const VIDEO_ID: ManagedPresetRuntimeId = 'product-video-director'
const HYPERFRAMES_VERSION = '0.7.109'
const PLAYWRIGHT_VERSION = '1.61.1'
const ECHARTS_VERSION = '6.1.0'
const OPENPYXL_VERSION = '3.1.5'
const FFMPEG_INSTALLER_VERSION = '1.1.0'
const FFPROBE_INSTALLER_VERSION = '2.1.2'
const PROCESS_TIMEOUT_MS = 10 * 60_000
const MAX_OUTPUT_CHARS = 32_768
const PLAYWRIGHT_CHROMIUM_PROBE = [
  "const { existsSync } = require('node:fs')",
  "const { chromium } = require('playwright')",
  'const executable = chromium.executablePath()',
  'if (!existsSync(executable)) process.exit(1)',
  'process.stdout.write(executable)',
].join(';')
const TRUSTED_BUILD_PACKAGES = [
  '@ffmpeg-installer/darwin-arm64',
  '@ffmpeg-installer/win32-x64',
  '@ffprobe-installer/darwin-arm64',
  '@ffprobe-installer/win32-x64',
  '@google/genai',
  'esbuild',
  'onnxruntime-node',
  'protobufjs',
] as const

/** One bounded no-shell runtime process request. */
interface RuntimeProcessRequest {
  readonly command: string
  readonly args: readonly string[]
  readonly cwd?: string
  readonly env: Readonly<NodeJS.ProcessEnv>
  readonly timeoutMs?: number
}

/** Captured result from one bounded runtime process. */
interface RuntimeProcessResult {
  readonly code: number | null
  readonly stdout: string
  readonly stderr: string
}

/** Injectable no-shell process boundary for focused runtime tests. */
export interface PresetRuntimeProcessAdapter {
  /** Execute one no-shell process request. */
  run(request: RuntimeProcessRequest): Promise<RuntimeProcessResult>
}

/** Fixed installer owned by Desktop; renderer input never selects commands or packages. */
export interface PresetRuntimeInstaller {
  /** Repair deterministic command wrappers without changing package versions. */
  prepare(): Promise<void>
  /** Install the fixed package set for one confirmed Preset runtime. */
  install(presetId: ManagedPresetRuntimeId, missing: readonly PresetRuntimeDependencyId[]): Promise<void>
}

/** Paths shared by the installer, detector, and Host child environment. */
export interface PresetRuntimePaths {
  readonly root: string
  readonly packages: string
  readonly bin: string
  readonly browsers: string
  readonly store: string
}

/** Runtime facts required to use the Desktop-bundled Node and package manager. */
export interface PresetRuntimeControllerOptions {
  readonly homeDirectory: string
  readonly nodeExecutable: string
  readonly packageManagerEntry: string
  readonly electronRunAsNode: boolean
  readonly platform?: NodeJS.Platform
  readonly inheritedEnvironment?: NodeJS.ProcessEnv
  readonly processAdapter?: PresetRuntimeProcessAdapter
  readonly installer?: PresetRuntimeInstaller
  readonly now?: () => number
}

function boundedAppend(current: string, chunk: string): string {
  return `${current}${chunk}`.slice(-MAX_OUTPUT_CHARS)
}

const nativeRuntimeProcess: PresetRuntimeProcessAdapter = {
  run(request) {
    return new Promise((resolveResult, reject) => {
      const child = spawn(request.command, [...request.args], {
        cwd: request.cwd,
        env: { ...request.env },
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      let stdout = ''
      let stderr = ''
      let failure: Error | undefined
      child.stdout.on('data', (chunk: string | Buffer) => { stdout = boundedAppend(stdout, chunk.toString()) })
      child.stderr.on('data', (chunk: string | Buffer) => { stderr = boundedAppend(stderr, chunk.toString()) })
      child.once('error', (error) => { failure ??= error })
      const timeout = setTimeout(() => {
        failure ??= new Error('Preset runtime process timed out')
        child.kill('SIGTERM')
      }, request.timeoutMs ?? PROCESS_TIMEOUT_MS)
      child.once('close', (code) => {
        clearTimeout(timeout)
        if (failure !== undefined) {
          reject(failure)
          return
        }
        resolveResult({ code, stdout, stderr })
      })
    })
  },
}

/** Resolve the deterministic Desktop-managed runtime tree below the Harness home. */
export function presetRuntimePaths(homeDirectory: string): PresetRuntimePaths {
  const root = join(homeDirectory, 'preset-runtime')
  return {
    root,
    packages: join(root, 'packages'),
    bin: join(root, 'bin'),
    browsers: join(root, 'playwright-browsers'),
    store: join(root, 'pnpm-store'),
  }
}

function uniquePathEntries(entries: readonly (string | undefined)[]): string {
  return [...new Set(entries.flatMap(value => value?.split(delimiter) ?? []).filter(Boolean))].join(delimiter)
}

/** Build the Host environment that makes confirmed managed tools visible to model shell calls. */
export function withPresetRuntimeEnvironment(
  environment: NodeJS.ProcessEnv,
  homeDirectory: string,
  platform: NodeJS.Platform = process.platform,
): NodeJS.ProcessEnv {
  const paths = presetRuntimePaths(homeDirectory)
  const extra = platform === 'darwin'
    ? [join(homeDirectory, '.local/bin'), '/opt/homebrew/bin', '/usr/local/bin']
    : []
  return {
    ...environment,
    PATH: uniquePathEntries([paths.bin, environment.PATH, ...extra]),
    NODE_PATH: uniquePathEntries([join(paths.packages, 'node_modules'), environment.NODE_PATH]),
    PLAYWRIGHT_BROWSERS_PATH: paths.browsers,
  }
}

function quotePosix(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`
}

function quoteCmd(value: string): string {
  return `"${value.replaceAll('"', '""')}"`
}

async function writeCommandWrapper(
  paths: PresetRuntimePaths,
  platform: NodeJS.Platform,
  name: string,
  command: string,
  args: readonly string[],
  electronRunAsNode = false,
): Promise<void> {
  const target = join(paths.bin, platform === 'win32' ? `${name}.cmd` : name)
  const content = platform === 'win32'
    ? `@echo off\r\n${electronRunAsNode ? 'set "ELECTRON_RUN_AS_NODE=1"\r\n' : ''}${quoteCmd(command)}${args.map(value => ` ${quoteCmd(value)}`).join('')} %*\r\n`
    : `#!/bin/sh\n${electronRunAsNode ? "export ELECTRON_RUN_AS_NODE='1'\n" : ''}exec ${quotePosix(command)}${args.map(value => ` ${quotePosix(value)}`).join('')} "$@"\n`
  await writeFileAtomic(target, content, { mode: 0o700, dirMode: 0o700 })
}

function readPackageVersion(paths: PresetRuntimePaths, packageName: string): string | undefined {
  const manifest = join(paths.packages, 'node_modules', ...packageName.split('/'), 'package.json')
  if (!existsSync(manifest)) return undefined
  try {
    const value = JSON.parse(readFileSync(manifest, 'utf8')) as { version?: unknown }
    return typeof value.version === 'string' ? value.version : undefined
  } catch {
    // An interrupted package-manager write is reported as a missing dependency and repaired on retry.
    return undefined
  }
}

function installedBinaryPath(paths: PresetRuntimePaths, packageName: string): string | undefined {
  if (readPackageVersion(paths, packageName) === undefined) return undefined
  const require = createRequire(join(paths.packages, 'package.json'))
  const value = require(packageName) as unknown
  const binary = (value as { path?: unknown } | null)?.path
  if (typeof binary !== 'string') throw new Error(`${packageName} did not expose its installed binary`)
  const absolute = resolve(binary)
  const modules = resolve(paths.packages, 'node_modules')
  const rel = relative(modules, absolute)
  if (rel.startsWith('..') || rel === '') throw new Error(`${packageName} resolved outside the managed runtime`)
  if (!existsSync(absolute)) throw new Error(`${packageName} binary is missing`)
  return absolute
}

function availableInstalledBinary(paths: PresetRuntimePaths, packageName: string): string | undefined {
  try {
    return installedBinaryPath(paths, packageName)
  } catch {
    // A corrupt managed package is treated as missing so the confirmed installer can repair it.
    return undefined
  }
}

function managedPythonExecutable(paths: PresetRuntimePaths, platform: NodeJS.Platform): string {
  return platform === 'win32'
    ? join(paths.root, 'python', 'Scripts', 'python.exe')
    : join(paths.root, 'python', 'bin', 'python3')
}

function managedEnvironment(
  options: PresetRuntimeControllerOptions,
  paths: PresetRuntimePaths,
): NodeJS.ProcessEnv {
  const platform = options.platform ?? process.platform
  const source = withPresetRuntimeEnvironment(
    options.inheritedEnvironment ?? process.env,
    options.homeDirectory,
    platform,
  )
  const env: NodeJS.ProcessEnv = {
    PATH: source.PATH,
    NODE_PATH: source.NODE_PATH,
    PLAYWRIGHT_BROWSERS_PATH: paths.browsers,
    HOME: options.homeDirectory,
    USERPROFILE: options.homeDirectory,
    LANG: 'C.UTF-8',
    LC_ALL: 'C.UTF-8',
    NO_COLOR: '1',
  }
  for (const key of platform === 'win32'
    ? ['SystemRoot', 'WINDIR', 'COMSPEC', 'PATHEXT', 'TEMP', 'TMP']
    : ['TMPDIR']) {
    if (source[key] !== undefined) env[key] = source[key]
  }
  if (options.electronRunAsNode) env.ELECTRON_RUN_AS_NODE = '1'
  return env
}

class DesktopPresetRuntimeInstaller implements PresetRuntimeInstaller {
  private readonly paths: PresetRuntimePaths
  private readonly platform: NodeJS.Platform
  private readonly processAdapter: PresetRuntimeProcessAdapter
  private readonly env: NodeJS.ProcessEnv

  constructor(private readonly options: PresetRuntimeControllerOptions) {
    this.paths = presetRuntimePaths(options.homeDirectory)
    this.platform = options.platform ?? process.platform
    this.processAdapter = options.processAdapter ?? nativeRuntimeProcess
    this.env = managedEnvironment(options, this.paths)
  }

  async prepare(): Promise<void> {
    await writeCommandWrapper(
      this.paths,
      this.platform,
      'node',
      this.options.nodeExecutable,
      [],
      this.options.electronRunAsNode,
    )
    const hyperframes = join(this.paths.packages, 'node_modules', 'hyperframes', 'bin', 'hyperframes.mjs')
    if (existsSync(hyperframes)) {
      await writeCommandWrapper(
        this.paths,
        this.platform,
        'hyperframes',
        this.options.nodeExecutable,
        [hyperframes],
        this.options.electronRunAsNode,
      )
    }
    const ffmpeg = availableInstalledBinary(this.paths, '@ffmpeg-installer/ffmpeg')
    if (ffmpeg !== undefined) await writeCommandWrapper(this.paths, this.platform, 'ffmpeg', ffmpeg, [])
    const ffprobe = availableInstalledBinary(this.paths, '@ffprobe-installer/ffprobe')
    if (ffprobe !== undefined) await writeCommandWrapper(this.paths, this.platform, 'ffprobe', ffprobe, [])
    const python = managedPythonExecutable(this.paths, this.platform)
    if (existsSync(python)) {
      await writeCommandWrapper(this.paths, this.platform, 'python3', python, [])
      await writeCommandWrapper(this.paths, this.platform, 'python', python, [])
    }
  }

  async install(presetId: ManagedPresetRuntimeId, missing: readonly PresetRuntimeDependencyId[]): Promise<void> {
    await this.preparePackageRoot()
    if (presetId === VIDEO_ID) await this.installVideo(missing)
    else await this.installReport(missing)
    await this.prepare()
  }

  private async preparePackageRoot(): Promise<void> {
    await mkdir(this.paths.packages, { recursive: true, mode: 0o700 })
    const manifest = join(this.paths.packages, 'package.json')
    let current: Record<string, unknown> = {}
    if (existsSync(manifest)) {
      try {
        const parsed = JSON.parse(readFileSync(manifest, 'utf8')) as unknown
        if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
          current = parsed as Record<string, unknown>
        }
      } catch {
        // A corrupt managed manifest is replaced; no user-authored package lives in this directory.
      }
    }
    delete current['pnpm']
    await writeFileAtomic(manifest, `${JSON.stringify({
      ...current,
      name: '@deepseek-harness/preset-runtime',
      version: '1.0.0',
      private: true,
    }, null, 2)}\n`, { mode: 0o600, dirMode: 0o700 })
  }

  private async installVideo(missing: readonly PresetRuntimeDependencyId[]): Promise<void> {
    if (missing.some(id => id === 'hyperframes' || id === 'ffmpeg' || id === 'ffprobe')) {
      await this.installPackages([
        `hyperframes@${HYPERFRAMES_VERSION}`,
        `@ffmpeg-installer/ffmpeg@${FFMPEG_INSTALLER_VERSION}`,
        `@ffprobe-installer/ffprobe@${FFPROBE_INSTALLER_VERSION}`,
      ])
    }
  }

  private async installReport(missing: readonly PresetRuntimeDependencyId[]): Promise<void> {
    if (missing.some(id => id === 'echarts' || id === 'playwright' || id === 'chromium')) {
      await this.installPackages([`echarts@${ECHARTS_VERSION}`, `playwright@${PLAYWRIGHT_VERSION}`])
    }
    if (missing.includes('openpyxl')) {
      const python = await this.resolvePython()
      if (python === undefined) throw new Error('Python is required before openpyxl can be installed')
      const managedPython = managedPythonExecutable(this.paths, this.platform)
      if (!existsSync(managedPython)) {
        await this.runRequired(python.command, [
          ...python.prefix, '-m', 'venv', join(this.paths.root, 'python'),
        ])
      }
      await this.runRequired(managedPython, [
        '-m', 'pip', 'install', '--disable-pip-version-check', '--no-input', `openpyxl==${OPENPYXL_VERSION}`,
      ])
    }
    if (missing.includes('chromium')) {
      const cli = join(this.paths.packages, 'node_modules', 'playwright', 'cli.js')
      if (!existsSync(cli)) throw new Error('Playwright CLI is missing after package installation')
      await this.runRequired(this.options.nodeExecutable, [cli, 'install', 'chromium'])
    }
  }

  private async installPackages(specifiers: readonly string[]): Promise<void> {
    const result = await this.processAdapter.run({
      command: this.options.nodeExecutable,
      args: [
        this.options.packageManagerEntry,
        'add',
        '--save-exact',
        ...TRUSTED_BUILD_PACKAGES.map(packageName => `--allow-build=${packageName}`),
        '--config.shared-workspace-lockfile=false',
        '--config.manage-package-manager-versions=false',
        '--reporter=append-only',
        '--store-dir',
        this.paths.store,
        '--registry',
        PACKAGE_MANAGER_REGISTRY,
        '--',
        ...specifiers,
      ],
      cwd: this.paths.packages,
      env: this.env,
    })
    if (result.code !== 0) throw new Error(result.stderr.trim() || result.stdout.trim() || 'Package installation failed')
  }

  private async resolvePython(): Promise<{ command: string; prefix: readonly string[] } | undefined> {
    for (const candidate of this.platform === 'win32'
      ? [{ command: 'py', prefix: ['-3'] }, { command: 'python', prefix: [] }]
      : [{ command: 'python3', prefix: [] }, { command: 'python', prefix: [] }]) {
      try {
        const result = await this.processAdapter.run({
          command: candidate.command,
          args: [...candidate.prefix, '--version'],
          env: this.env,
          timeoutMs: 10_000,
        })
        if (result.code === 0) return candidate
      } catch {
        // A missing candidate is expected while probing the fixed fallback list.
      }
    }
    return undefined
  }

  private async runRequired(command: string, args: readonly string[]): Promise<void> {
    const result = await this.processAdapter.run({ command, args, env: this.env })
    if (result.code !== 0) throw new Error(result.stderr.trim() || result.stdout.trim() || 'Runtime installation failed')
  }
}

function initialDependencies(presetId: ManagedPresetRuntimeId): PresetRuntimeDependency[] {
  const ids: readonly PresetRuntimeDependencyId[] = presetId === VIDEO_ID
    ? ['node', 'hyperframes', 'ffmpeg', 'ffprobe']
    : ['node', 'python', 'openpyxl', 'echarts', 'playwright', 'chromium']
  return ids.map(id => ({ id, state: 'missing', installable: id !== 'python', version: null }))
}

function versionText(output: string): string | null {
  return output.trim().split(/\r?\n/u)[0]?.slice(0, 120) || null
}

/** Own one-at-a-time installation and monotonic runtime snapshots for bundled Presets. */
export class PresetRuntimeController {
  private readonly paths: PresetRuntimePaths
  private readonly platform: NodeJS.Platform
  private readonly processAdapter: PresetRuntimeProcessAdapter
  private readonly installer: PresetRuntimeInstaller
  private readonly env: NodeJS.ProcessEnv
  private readonly now: () => number
  private readonly snapshots = new Map<ManagedPresetRuntimeId, PresetRuntimeSnapshot>()
  private readonly checks = new Map<ManagedPresetRuntimeId, Promise<PresetRuntimeSnapshot>>()
  private activeInstall: {
    readonly presetId: ManagedPresetRuntimeId
    readonly promise: Promise<PresetRuntimeSnapshot>
  } | undefined
  private revision = 0

  constructor(private readonly options: PresetRuntimeControllerOptions) {
    this.paths = presetRuntimePaths(options.homeDirectory)
    this.platform = options.platform ?? process.platform
    this.processAdapter = options.processAdapter ?? nativeRuntimeProcess
    this.installer = options.installer ?? new DesktopPresetRuntimeInstaller(options)
    this.env = managedEnvironment(options, this.paths)
    this.now = options.now ?? Date.now
  }

  /** Detect every required dependency without changing package state. */
  check(presetId: ManagedPresetRuntimeId): Promise<PresetRuntimeSnapshot> {
    const existing = this.checks.get(presetId)
    if (existing !== undefined) return existing
    if (this.activeInstall?.presetId === presetId && this.snapshots.get(presetId)?.phase === 'installing') {
      return Promise.resolve(this.snapshots.get(presetId) as PresetRuntimeSnapshot)
    }
    this.publish(presetId, 'checking', this.snapshots.get(presetId)?.dependencies ?? initialDependencies(presetId))
    const operation = this.inspect(presetId).then((dependencies) => {
      return this.publish(
        presetId,
        dependencies.every(item => item.state === 'ready') ? 'ready' : 'missing',
        dependencies,
      )
    }).finally(() => { this.checks.delete(presetId) })
    this.checks.set(presetId, operation)
    return operation
  }

  /** Install the fixed missing dependency set after renderer confirmation, then verify again. */
  install(presetId: ManagedPresetRuntimeId): Promise<PresetRuntimeSnapshot> {
    if (this.activeInstall?.presetId === presetId) return this.activeInstall.promise
    if (this.activeInstall !== undefined) {
      return this.activeInstall.promise.then(() => this.install(presetId))
    }
    const operation = this.check(presetId).then(async (checked) => {
      if (checked.phase === 'ready' || !checked.canInstall) return checked
      const missing = checked.dependencies.filter(item => item.state !== 'ready' && item.installable)
      this.publish(presetId, 'installing', checked.dependencies.map(item => (
        missing.some(candidate => candidate.id === item.id) ? { ...item, state: 'installing' as const } : item
      )))
      try {
        await this.installer.install(presetId, missing.map(item => item.id))
        const dependencies = await this.inspect(presetId)
        return this.publish(
          presetId,
          dependencies.every(item => item.state === 'ready') ? 'ready' : 'missing',
          dependencies,
        )
      } catch {
        const current = this.snapshots.get(presetId)?.dependencies ?? checked.dependencies
        return this.publish(presetId, 'failed', current.map(item => (
          item.state === 'installing' ? { ...item, state: 'failed' as const } : item
        )))
      }
    }).finally(() => {
      if (this.activeInstall?.promise === operation) this.activeInstall = undefined
    })
    this.activeInstall = { presetId, promise: operation }
    return operation
  }

  private async inspect(presetId: ManagedPresetRuntimeId): Promise<PresetRuntimeDependency[]> {
    try {
      await this.installer.prepare()
    } catch {
      // Repairing optional managed wrappers must not hide usable system commands.
    }
    return presetId === VIDEO_ID ? await this.inspectVideo() : await this.inspectReport()
  }

  private async inspectVideo(): Promise<PresetRuntimeDependency[]> {
    const node = await this.probeNode()
    const hyperframesCli = join(this.paths.packages, 'node_modules', 'hyperframes', 'bin', 'hyperframes.mjs')
    const hyperframes = readPackageVersion(this.paths, 'hyperframes') === HYPERFRAMES_VERSION
      && existsSync(hyperframesCli)
      ? HYPERFRAMES_VERSION
      : undefined
    const ffmpeg = await this.probe(availableInstalledBinary(this.paths, '@ffmpeg-installer/ffmpeg') ?? 'ffmpeg', ['-version'])
    const ffprobe = await this.probe(availableInstalledBinary(this.paths, '@ffprobe-installer/ffprobe') ?? 'ffprobe', ['-version'])
    return [
      this.dependency('node', node, true),
      this.dependency('hyperframes', hyperframes, true),
      this.dependency('ffmpeg', ffmpeg, true),
      this.dependency('ffprobe', ffprobe, true),
    ]
  }

  private async inspectReport(): Promise<PresetRuntimeDependency[]> {
    const node = await this.probeNode()
    const python = await this.resolvePython()
    const openpyxl = python === undefined
      ? undefined
      : await this.probe(python.command, [...python.prefix, '-c', 'import openpyxl; print(openpyxl.__version__)'])
    const echarts = readPackageVersion(this.paths, 'echarts') === ECHARTS_VERSION ? ECHARTS_VERSION : undefined
    const playwright = readPackageVersion(this.paths, 'playwright') === PLAYWRIGHT_VERSION
      ? PLAYWRIGHT_VERSION
      : undefined
    const chromium = await this.chromiumVersion()
    return [
      this.dependency('node', node, true),
      this.dependency('python', python?.version, false),
      this.dependency('openpyxl', openpyxl, python !== undefined),
      this.dependency('echarts', echarts, true),
      this.dependency('playwright', playwright, true),
      this.dependency('chromium', chromium, true),
    ]
  }

  private async probeNode(): Promise<string | undefined> {
    return await this.probe(this.options.nodeExecutable, ['--version'])
  }

  private async resolvePython(): Promise<{
    command: string
    prefix: readonly string[]
    version: string
  } | undefined> {
    for (const candidate of this.platform === 'win32'
      ? [{ command: 'py', prefix: ['-3'] }, { command: 'python', prefix: [] }]
      : [{ command: 'python3', prefix: [] }, { command: 'python', prefix: [] }]) {
      const version = await this.probe(candidate.command, [...candidate.prefix, '--version'])
      if (version !== undefined) return { ...candidate, version }
    }
    return undefined
  }

  private async chromiumVersion(): Promise<string | undefined> {
    if (readPackageVersion(this.paths, 'playwright') !== PLAYWRIGHT_VERSION) return undefined
    const executable = await this.probe(this.options.nodeExecutable, ['-e', PLAYWRIGHT_CHROMIUM_PROBE])
    return executable === undefined ? undefined : 'installed'
  }

  private async probe(command: string, args: readonly string[]): Promise<string | undefined> {
    try {
      const result = await this.processAdapter.run({ command, args, env: this.env, timeoutMs: 15_000 })
      if (result.code !== 0) return undefined
      return versionText(result.stdout || result.stderr) ?? undefined
    } catch {
      // Missing executables are the expected negative result of a dependency probe.
      return undefined
    }
  }

  private dependency(
    id: PresetRuntimeDependencyId,
    version: string | undefined,
    installable: boolean,
  ): PresetRuntimeDependency {
    return {
      id,
      state: version === undefined ? 'missing' : 'ready',
      installable,
      version: version ?? null,
    }
  }

  private publish(
    presetId: ManagedPresetRuntimeId,
    phase: PresetRuntimeSnapshot['phase'],
    dependencies: readonly PresetRuntimeDependency[],
  ): PresetRuntimeSnapshot {
    const snapshot: PresetRuntimeSnapshot = Object.freeze({
      presetId,
      phase,
      dependencies: Object.freeze(dependencies.map(item => Object.freeze({ ...item }))),
      canInstall: dependencies.some(item => item.state !== 'ready' && item.installable),
      revision: ++this.revision,
      updatedAt: new Date(this.now()).toISOString(),
    })
    this.snapshots.set(presetId, snapshot)
    return snapshot
  }
}
