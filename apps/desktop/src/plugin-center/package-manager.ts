/** Fixed package-manager runtime and process policy for trusted Desktop Profile changes. */

import { spawn } from 'node:child_process'
import { dirname, win32 } from 'node:path'

/** Package-manager version included in every supported Desktop package. */
export const PINNED_PACKAGE_MANAGER_VERSION = '11.7.0'

/** Path below the staged Host node_modules directory. */
export const PACKAGE_MANAGER_ENTRY_SEGMENTS = ['pnpm', 'bin', 'pnpm.cjs'] as const

/** Fixed dependency registry; renderer values never select it. */
export const PACKAGE_MANAGER_REGISTRY = 'https://registry.npmjs.org/'

const DEFAULT_TIMEOUT_MS = 120_000
const DEFAULT_SHUTDOWN_TIMEOUT_MS = 5_000
const MAX_OUTPUT_CHARS = 32_768

/** Trusted exact artifact selected and verified outside the renderer. */
export interface TrustedPackageTarget {
  readonly packageName: string
  readonly version: string
  readonly artifactPath: string
}

/** Catalog-owned installed package identity selected outside renderer input. */
export interface TrustedPackageRemovalTarget {
  readonly packageName: string
}

/** Complete fixed process invocation, exported for narrow authority tests. */
export interface PackageManagerInvocation {
  readonly executable: string
  readonly args: readonly string[]
  readonly cwd: string
  readonly env: Readonly<NodeJS.ProcessEnv>
  readonly shell: false
  readonly windowsHide: true
  readonly timeoutMs: number
  readonly maxOutputChars: number
}

/** Process result retained only for bounded Desktop diagnostics. */
interface PackageManagerProcessResult {
  readonly code: number | null
  readonly signal: NodeJS.Signals | null
  readonly stdout: string
  readonly stderr: string
}

/** Injectable process boundary used by package-manager authority tests. */
export interface PackageManagerProcessAdapter {
  run(invocation: PackageManagerInvocation): Promise<PackageManagerProcessResult>
}

/** Desktop-owned locations and runtime facts; none originate in renderer input. */
export interface TrustedPackageManagerOptions {
  readonly executable: string
  readonly packageManagerEntry: string
  readonly profileDirectory: string
  readonly storeDirectory: string
  readonly homeDirectory: string
  readonly electronRunAsNode: boolean
  readonly platform?: NodeJS.Platform
  readonly timeoutMs?: number
  readonly processAdapter?: PackageManagerProcessAdapter
  readonly inheritedEnvironment?: NodeJS.ProcessEnv
}

/** Failed or timed-out fixed package-manager invocation. */
class PackageManagerInvocationError extends Error {
  override readonly name = 'PackageManagerInvocationError'
}

function selectedEnvironment(
  source: NodeJS.ProcessEnv,
  options: Pick<TrustedPackageManagerOptions, 'executable' | 'homeDirectory' | 'electronRunAsNode' | 'platform'>,
): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {
    PATH: options.platform === 'win32' ? win32.dirname(options.executable) : dirname(options.executable),
    HOME: options.homeDirectory,
    USERPROFILE: options.homeDirectory,
    LANG: 'C.UTF-8',
    LC_ALL: 'C.UTF-8',
    CI: 'true',
    NO_COLOR: '1',
  }
  const allow = options.platform === 'win32'
    ? ['SystemRoot', 'WINDIR', 'COMSPEC', 'PATHEXT', 'TEMP', 'TMP']
    : ['TMPDIR']
  for (const name of allow) {
    if (source[name] !== undefined) environment[name] = source[name]
  }
  if (options.electronRunAsNode) environment.ELECTRON_RUN_AS_NODE = '1'
  return environment
}

/** Build the exact invocation consumed by the native process adapter. */
export function createPackageManagerInvocation(
  options: TrustedPackageManagerOptions,
  target: TrustedPackageTarget,
): PackageManagerInvocation {
  return {
    executable: options.executable,
    args: [
      options.packageManagerEntry,
      'add',
      '--save-exact',
      '--ignore-scripts',
      '--config.shared-workspace-lockfile=false',
      '--config.manage-package-manager-versions=false',
      '--reporter=append-only',
      '--store-dir',
      options.storeDirectory,
      '--registry',
      PACKAGE_MANAGER_REGISTRY,
      '--',
      target.artifactPath,
    ],
    cwd: options.profileDirectory,
    env: selectedEnvironment(options.inheritedEnvironment ?? process.env, options),
    shell: false,
    windowsHide: true,
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    maxOutputChars: MAX_OUTPUT_CHARS,
  }
}

/** Build the exact dependency removal invocation for one catalog-owned package. */
export function createPackageRemoveInvocation(
  options: TrustedPackageManagerOptions,
  target: TrustedPackageRemovalTarget,
): PackageManagerInvocation {
  return {
    executable: options.executable,
    args: [
      options.packageManagerEntry,
      'remove',
      '--config.ignore-scripts=true',
      '--config.shared-workspace-lockfile=false',
      '--config.manage-package-manager-versions=false',
      '--reporter=append-only',
      '--store-dir',
      options.storeDirectory,
      `--config.registry=${PACKAGE_MANAGER_REGISTRY}`,
      '--',
      target.packageName,
    ],
    cwd: options.profileDirectory,
    env: selectedEnvironment(options.inheritedEnvironment ?? process.env, options),
    shell: false,
    windowsHide: true,
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    maxOutputChars: MAX_OUTPUT_CHARS,
  }
}

/** Build the fixed old-Profile package restoration invocation used only by F005. */
function createPackageRestoreInvocation(
  options: TrustedPackageManagerOptions,
  frozenLockfile: boolean,
): PackageManagerInvocation {
  return {
    executable: options.executable,
    args: [
      options.packageManagerEntry,
      'install',
      frozenLockfile ? '--frozen-lockfile' : '--no-frozen-lockfile',
      '--ignore-scripts',
      '--config.shared-workspace-lockfile=false',
      '--config.manage-package-manager-versions=false',
      '--reporter=append-only',
      '--store-dir',
      options.storeDirectory,
      '--registry',
      PACKAGE_MANAGER_REGISTRY,
    ],
    cwd: options.profileDirectory,
    env: selectedEnvironment(options.inheritedEnvironment ?? process.env, options),
    shell: false,
    windowsHide: true,
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    maxOutputChars: MAX_OUTPUT_CHARS,
  }
}

/** Native no-shell process adapter with bounded output and joined termination. */
const nativePackageManagerProcess: PackageManagerProcessAdapter = {
  run(invocation) {
    return new Promise((resolve, reject) => {
      const child = spawn(invocation.executable, [...invocation.args], {
        cwd: invocation.cwd,
        env: { ...invocation.env },
        shell: invocation.shell,
        windowsHide: invocation.windowsHide,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      let stdout = ''
      let stderr = ''
      let failure: Error | undefined
      let terminationTimer: ReturnType<typeof setTimeout> | undefined
      const append = (current: string, chunk: string): string => {
        const next = `${current}${chunk}`
        if (next.length > invocation.maxOutputChars && failure === undefined) {
          failure = new PackageManagerInvocationError('package-manager output exceeded the diagnostic limit')
          child.kill('SIGTERM')
          terminationTimer = setTimeout(() => { child.kill('SIGKILL') }, DEFAULT_SHUTDOWN_TIMEOUT_MS)
        }
        return next.slice(-invocation.maxOutputChars)
      }
      child.stdout.on('data', (chunk: string | Buffer) => { stdout = append(stdout, chunk.toString()) })
      child.stderr.on('data', (chunk: string | Buffer) => { stderr = append(stderr, chunk.toString()) })
      child.once('error', (error) => { failure ??= error })
      const timeout = setTimeout(() => {
        failure ??= new PackageManagerInvocationError(`package-manager timed out after ${String(invocation.timeoutMs)}ms`)
        child.kill('SIGTERM')
        terminationTimer = setTimeout(() => { child.kill('SIGKILL') }, DEFAULT_SHUTDOWN_TIMEOUT_MS)
      }, invocation.timeoutMs)
      child.once('close', (code, signal) => {
        clearTimeout(timeout)
        if (terminationTimer !== undefined) clearTimeout(terminationTimer)
        if (failure !== undefined) {
          reject(failure)
          return
        }
        resolve({ code, signal, stdout, stderr })
      })
    })
  },
}

/** Run one trusted archive install through the staged exact package manager. */
export async function installTrustedPackage(
  options: TrustedPackageManagerOptions,
  target: TrustedPackageTarget,
): Promise<void> {
  const invocation = createPackageManagerInvocation(options, target)
  const result = await (options.processAdapter ?? nativePackageManagerProcess).run(invocation)
  if (result.code !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim() || `signal ${String(result.signal)}`
    throw new PackageManagerInvocationError(
      `package-manager failed for ${target.packageName}@${target.version}: ${detail}`,
    )
  }
}

/** Remove one catalog-owned dependency through the staged exact package manager. */
export async function removeTrustedPackage(
  options: TrustedPackageManagerOptions,
  target: TrustedPackageRemovalTarget,
): Promise<void> {
  const invocation = createPackageRemoveInvocation(options, target)
  const result = await (options.processAdapter ?? nativePackageManagerProcess).run(invocation)
  if (result.code !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim() || `signal ${String(result.signal)}`
    throw new PackageManagerInvocationError(`package-manager removal failed for ${target.packageName}: ${detail}`)
  }
}

/** Re-materialize the restored manifest and lockfile through the bundled exact pnpm. */
export async function restoreTrustedProfilePackages(
  options: TrustedPackageManagerOptions,
  frozenLockfile: boolean,
): Promise<void> {
  const invocation = createPackageRestoreInvocation(options, frozenLockfile)
  const result = await (options.processAdapter ?? nativePackageManagerProcess).run(invocation)
  if (result.code !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim() || `signal ${String(result.signal)}`
    throw new PackageManagerInvocationError(`package-manager Profile restore failed: ${detail}`)
  }
}
