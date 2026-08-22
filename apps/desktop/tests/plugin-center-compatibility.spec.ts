import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  decodeCatalogVersionPreflight,
  type CatalogVersionPreflight,
  type CompatibilityFingerprint,
} from '@deepseek-ai/dsh-plugin-center-contracts'
import { evaluateCompatibility } from '../src/plugin-center/compatibility.ts'
import {
  resolveCompatibilityFingerprint,
  resolveSupportedPluginPlatform,
} from '../src/plugin-center/environment.ts'
import { deriveProtectedSystemComponents } from '../src/plugin-center/system-components.ts'

const repositoryRoot = resolve(import.meta.dirname, '../../..')
const desktopManifest = resolve(repositoryRoot, 'apps/desktop/package.json')
const dshManifest = resolve(repositoryRoot, 'apps/cli/package.json')
const shippedBundles = [
  resolve(repositoryRoot, 'packages/bundle/base/package.json'),
  resolve(repositoryRoot, 'packages/bundle/web-app/package.json'),
  resolve(repositoryRoot, 'packages/examples/ff-llm-wiki-plugin/package.json'),
] as const
const systemComponents = deriveProtectedSystemComponents(shippedBundles)
const INTEGRITY = `sha512-${Buffer.alloc(64, 7).toString('base64')}`

function manifestVersion(path: string): string {
  return (JSON.parse(readFileSync(path, 'utf8')) as { version: string }).version
}

function candidate(overrides: Partial<CatalogVersionPreflight> = {}): CatalogVersionPreflight {
  return decodeCatalogVersionPreflight({
    pluginId: 'fixture.workspace-tools',
    version: '1.2.3',
    packageName: '@fixture/dsh-workspace-tools',
    catalogEtag: 'catalog-v1',
    reviewed: true,
    eligible: true,
    withdrawn: false,
    desktopRange: '>=0.1.0-rc.1 <0.2.0',
    dshRange: '>=0.1.0-rc.1 <0.2.0',
    nodeRange: '>=22 <23',
    artifacts: [{
      platform: 'darwin-arm64',
      url: 'https://cdn.deepseek.com/plugins/fixture.workspace-tools/1.2.3.tgz',
      sha256: 'a'.repeat(64),
      integrity: INTEGRITY,
      packedBytes: 4_096,
      unpackedBytes: 16_384,
      fileCount: 12,
    }],
    bundlePatch: './cordis.patch.yml',
    capabilities: ['host', 'client'],
    riskLevel: 'medium',
    riskSummary: 'Reviewed code still runs with broad application authority.',
    executionAuthority: 'broad-application-authority',
    conflicts: { pluginIds: [], packageNames: [], entryIds: [] },
    expectedEntries: ['fixture.workspace-tools'],
    expectedClientModules: ['@fixture/dsh-client-ui-workspace-tools'],
    expectedSkillIds: [],
    supportedActions: ['install', 'update', 'enable', 'disable', 'uninstall'],
    restartRequired: true,
    ...overrides,
  })
}

function fingerprint(overrides: Partial<CompatibilityFingerprint> = {}): CompatibilityFingerprint {
  const values: CompatibilityFingerprint = {
    desktopVersion: '0.1.0-rc.5',
    dshVersion: '0.1.0-rc.5',
    nodeVersion: '22.22.0',
    platform: 'darwin-arm64',
    catalogEtag: 'catalog-v1',
    catalogFreshness: 'fresh',
    profileRevision: 7,
    installedPlugins: [],
    protectedPackageNames: systemComponents.packageNames,
    protectedEntryIds: systemComponents.entryIds,
    activeOperation: false,
    ...overrides,
  }
  return values
}

describe('plugin center release environment', () => {
  it('derives current release facts and every protected identity from shipped composition', () => {
    expect(systemComponents.packageNames).toContain('@deepseek-ai/dsh-base')
    expect(systemComponents.packageNames).toContain('@deepseek-ai/dsh-web-app')
    expect(systemComponents.packageNames).toContain('@deepseek-ai/dsh-client-ui-plugin-center')
    expect(systemComponents.packageNames).toContain('@fufan/dsh-plugin-llm-wiki')
    expect(systemComponents.entryIds).toContain('agent-loop')
    expect(systemComponents.entryIds).toContain('ui-plugin-center')
    expect(systemComponents.entryIds).toContain('fufan.llm-wiki')
    expect(systemComponents.entryIds.length).toBeGreaterThan(100)

    const policyHash = createHash('sha256').update(JSON.stringify(systemComponents)).digest('hex')
    expect(policyHash).toBe('4f78ee84e5243080258ff8f8956a7688915beb283657c52603df00fd6704d976')

    const fingerprint = resolveCompatibilityFingerprint({
      desktopVersion: manifestVersion(desktopManifest),
      dshVersion: manifestVersion(dshManifest),
      nodeVersion: '22.22.0',
      os: 'darwin',
      architecture: 'arm64',
      catalogEtag: 'catalog-v1',
      catalogFreshness: 'fresh',
      profileRevision: 7,
      installedPlugins: [],
      systemComponents,
      activeOperation: false,
    })
    expect(fingerprint).toMatchObject({
      desktopVersion: '0.1.0-rc.16',
      dshVersion: '0.1.1-rc.2',
      nodeVersion: '22.22.0',
      platform: 'darwin-arm64',
      catalogEtag: 'catalog-v1',
      catalogFreshness: 'fresh',
      profileRevision: 7,
      activeOperation: false,
    })
    expect(fingerprint.protectedEntryIds).toEqual(systemComponents.entryIds)
  })

  it('maps only the two release mutation targets', () => {
    expect(resolveSupportedPluginPlatform('darwin', 'arm64')).toBe('darwin-arm64')
    expect(resolveSupportedPluginPlatform('win32', 'x64')).toBe('win32-x64')
    expect(() => resolveSupportedPluginPlatform('linux', 'x64')).toThrow('unsupported')
    expect(() => resolveSupportedPluginPlatform('darwin', 'x64')).toThrow('unsupported')
  })

  it('returns one exact compatible action with prerelease-aware ranges', () => {
    const decision = evaluateCompatibility({ candidate: candidate(), fingerprint: fingerprint(), action: 'install' })
    expect(decision).toMatchObject({
      pluginId: 'fixture.workspace-tools',
      version: '1.2.3',
      action: 'install',
      allowed: true,
      reasons: [],
      restartRequired: true,
      executionAuthority: 'broad-application-authority',
    })
    expect(decision.fingerprint.profileRevision).toBe(7)
    const recomputed = evaluateCompatibility({
      candidate: candidate(), fingerprint: fingerprint({ profileRevision: 8 }), action: 'install',
    })
    expect(recomputed.allowed).toBe(true)
    expect(recomputed.fingerprint.profileRevision).toBe(8)
  })

  it.each([
    ['unreviewed', candidate({ reviewed: false }), fingerprint(), 'catalog-unverified'],
    ['withdrawn', candidate({ withdrawn: true }), fingerprint(), 'version-withdrawn'],
    ['ineligible', candidate({ eligible: false }), fingerprint(), 'version-ineligible'],
    ['catalog changed', candidate(), fingerprint({ catalogEtag: 'catalog-v2' }), 'catalog-metadata-invalid'],
    ['stale catalog', candidate(), fingerprint({ catalogFreshness: 'stale' }), 'version-ineligible'],
    ['desktop range', candidate({ desktopRange: '>=0.2.0' }), fingerprint(), 'desktop-version-unsupported'],
    ['DSH range', candidate({ dshRange: '>=0.2.0' }), fingerprint(), 'dsh-version-unsupported'],
    ['Node range', candidate({ nodeRange: '>=23' }), fingerprint(), 'node-version-unsupported'],
    ['missing platform artifact', candidate({ artifacts: [] }), fingerprint(), 'artifact-missing'],
    ['missing runtime evidence', candidate({ expectedEntries: [], expectedClientModules: [], expectedSkillIds: [] }),
      fingerprint(), 'artifact-evidence-incomplete'],
    ['protected package', candidate({ packageName: '@deepseek-ai/dsh-base' }), fingerprint(), 'protected-package'],
    ['protected row', candidate({ expectedEntries: ['agent-loop'] }), fingerprint(), 'protected-entry'],
    ['package collision', candidate(), fingerprint({ installedPlugins: [{
      pluginId: 'fixture.other', version: '1.0.0', packageName: '@fixture/dsh-workspace-tools', enabled: true,
      entryIds: ['fixture.other'],
    }] }), 'package-identity-conflict'],
    ['row collision', candidate(), fingerprint({ installedPlugins: [{
      pluginId: 'fixture.other', version: '1.0.0', packageName: '@fixture/other', enabled: true,
      entryIds: ['fixture.workspace-tools'],
    }] }), 'entry-identity-conflict'],
    ['declared conflict', candidate({ conflicts: {
      pluginIds: ['fixture.other'], packageNames: [], entryIds: [],
    } }), fingerprint({ installedPlugins: [{
      pluginId: 'fixture.other', version: '1.0.0', packageName: '@fixture/other', enabled: false, entryIds: [],
    }] }), 'declared-conflict'],
    ['busy operation', candidate(), fingerprint({ activeOperation: true }), 'operation-busy'],
  ])('decision matrix denies %s', (_name, exactCandidate, exactFingerprint, reason) => {
    const decision = evaluateCompatibility({ candidate: exactCandidate, fingerprint: exactFingerprint, action: 'install' })
    expect(decision.allowed).toBe(false)
    expect(decision.reasons.map(item => item.code)).toContain(reason)
  })

  it('applies installed state to each exact action', () => {
    const installed = fingerprint({ installedPlugins: [{
      pluginId: 'fixture.workspace-tools',
      version: '1.2.3',
      packageName: '@fixture/dsh-workspace-tools',
      enabled: true,
      entryIds: ['fixture.workspace-tools'],
    }] })
    expect(evaluateCompatibility({ candidate: candidate(), fingerprint: installed, action: 'install' }).reasons)
      .toContainEqual(expect.objectContaining({ code: 'plugin-identity-conflict' }))
    expect(evaluateCompatibility({ candidate: candidate(), fingerprint: installed, action: 'enable' }).reasons)
      .toContainEqual(expect.objectContaining({ code: 'action-not-supported' }))
    expect(evaluateCompatibility({ candidate: candidate(), fingerprint: installed, action: 'disable' }).allowed).toBe(true)
    expect(evaluateCompatibility({ candidate: candidate(), fingerprint: fingerprint(), action: 'update' }).reasons)
      .toContainEqual(expect.objectContaining({ code: 'action-not-supported' }))
  })
})
