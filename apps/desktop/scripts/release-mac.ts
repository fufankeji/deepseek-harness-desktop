/** Build a signed and notarized macOS DMG from validated release credentials. */

import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { adaptMacReleaseEnvironment, assertMacReleaseReady } from './release-preflight.ts'

const RELEASE_VARIABLES = [
  'APPLE_API_ISSUER', 'APPLE_API_KEY', 'APPLE_API_KEY_ID',
  'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_ID', 'APPLE_KEYCHAIN',
  'APPLE_KEYCHAIN_PROFILE', 'APPLE_TEAM_ID', 'CSC_KEY_PASSWORD',
  'CSC_LINK', 'CSC_NAME', 'MACOS_SIGN_IDENTITY', 'MAC_CERT_P12_BASE64',
] as const

/** macOS CPU architectures supported by the signed release wrapper. */
export type MacReleaseArchitecture = 'arm64' | 'x64'

/**
 * Resolve one explicit Electron Builder architecture without accepting config overrides.
 * @param argv - Command arguments passed after the release script.
 * @param hostArchitecture - Architecture used when no override is supplied.
 * @returns The macOS architecture to stage and package.
 */
export function resolveMacReleaseArchitecture(
  argv: readonly string[],
  hostArchitecture: string,
): MacReleaseArchitecture {
  if (argv.length === 0 && (hostArchitecture === 'arm64' || hostArchitecture === 'x64')) {
    return hostArchitecture
  }
  if (argv.length === 1 && (argv[0] === '--arm64' || argv[0] === '--x64')) {
    return argv[0].slice(2) as MacReleaseArchitecture
  }
  throw new Error('macOS release accepts exactly one optional architecture: --arm64 or --x64')
}

function sanitizedEnvironment(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const sanitized = { ...env }
  for (const name of RELEASE_VARIABLES) delete sanitized[name]
  return sanitized
}

function listCodeSigningIdentities(): string {
  const result = spawnSync('security', ['find-identity', '-v', '-p', 'codesigning'], { encoding: 'utf8' })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) throw new Error(`security find-identity exited with ${String(result.status)}`)
  return result.stdout
}

function run(command: string, args: readonly string[], cwd: string, env: NodeJS.ProcessEnv): void {
  const result = spawnSync(command, args, { cwd, env, stdio: 'inherit' })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} exited with ${String(result.status)}`)
}

/**
 * Build the macOS artifact while exposing release secrets only to Electron Builder.
 * @param argv - Optional target architecture argument.
 */
export function releaseMac(argv: readonly string[] = []): void {
  const architecture = resolveMacReleaseArchitecture(argv, process.arch)
  const releaseEnvironment = adaptMacReleaseEnvironment(process.env)
  const result = assertMacReleaseReady({
    env: releaseEnvironment,
    platform: process.platform,
    listCodeSigningIdentities,
  })
  console.log(
    `macOS release preflight passed: ${result.identity}; signing via ${result.signing}; notarization via ${result.notarization}`,
  )
  const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const buildEnvironment = sanitizedEnvironment({
    ...releaseEnvironment,
    DSH_DESKTOP_TARGET_PLATFORM: 'darwin',
    DSH_DESKTOP_TARGET_ARCH: architecture,
  })
  run('pnpm', [
    '--filter', '@fufan/dsh-plugin-llm-wiki', 'run', 'build:application',
  ], resolve(desktopRoot, '../..'), buildEnvironment)
  run('pnpm', ['--workspace-root', 'run', 'build'], desktopRoot, buildEnvironment)
  run('node', ['--import', 'tsx', 'scripts/stage-runtime.ts'], desktopRoot, buildEnvironment)
  run('pnpm', [
    'exec', 'electron-builder', '--mac', 'dmg', 'zip',
    `--${architecture}`,
    '--config.forceCodeSigning=true', '--config.mac.notarize=true',
  ], desktopRoot, releaseEnvironment)
}

const invokedPath = process.argv[1]
if (invokedPath !== undefined && resolve(invokedPath) === fileURLToPath(import.meta.url)) {
  try {
    releaseMac(process.argv.slice(2))
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
