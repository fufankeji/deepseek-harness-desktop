import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CatalogCache } from '../src/plugin-center/catalog-cache.ts'
import { NpmEcosystemCatalogRepository } from '../src/plugin-center/npm-ecosystem-catalog.ts'

const roots: string[] = []
const NOW = Date.parse('2026-08-15T08:00:00.000Z')
const PACKAGE_NAME = '@deepseek-ai/dsh-plugin-center-fixture'
const VERSION = '0.1.0-rc.5'
const TARBALL_URL = `https://registry.npmjs.org/${PACKAGE_NAME}/-/${VERSION}.tgz`
const QUERY = { catalogKind: 'plugin', scope: 'public', query: 'workspace', limit: 24 } as const

function tarField(block: Buffer, offset: number, length: number, value: string): void {
  block.write(value, offset, Math.min(length, Buffer.byteLength(value)), 'utf8')
}

function tarOctal(block: Buffer, offset: number, length: number, value: number): void {
  tarField(block, offset, length, `${value.toString(8).padStart(length - 1, '0')}\0`)
}

function aggregateTarball(dependencyVersion: string | undefined, patchOverride?: string): Buffer {
  const manifest = JSON.stringify({
    name: '@fixture/dsh-aggregate',
    version: '1.0.0',
    ...(dependencyVersion === undefined ? {} : { dependencies: { '@fixture/dsh-child': dependencyVersion } }),
    dsh: { bundle: { patch: './cordis.patch.yml' } },
  })
  const patch = patchOverride ?? `- insert:
    - id: fixture.aggregate
      name: '@fixture/dsh-aggregate'
    - id: fixture.child
      name: '@fixture/dsh-child'
`
  const chunks: Buffer[] = []
  const entries: readonly (readonly [string, string])[] = [
    ['package/package.json', manifest],
    ['package/cordis.patch.yml', patch],
  ]
  for (const [path, value] of entries) {
    const body = Buffer.from(value)
    const header = Buffer.alloc(512)
    tarField(header, 0, 100, path)
    tarOctal(header, 100, 8, 0o644)
    tarOctal(header, 108, 8, 0)
    tarOctal(header, 116, 8, 0)
    tarOctal(header, 124, 12, body.length)
    tarOctal(header, 136, 12, 0)
    header.fill(0x20, 148, 156)
    tarField(header, 156, 1, '0')
    tarField(header, 257, 6, 'ustar\0')
    tarField(header, 263, 2, '00')
    const checksum = header.reduce((sum, byte) => sum + byte, 0)
    tarField(header, 148, 8, `${checksum.toString(8).padStart(6, '0')}\0 `)
    chunks.push(header, body)
    const padding = (512 - (body.length % 512)) % 512
    if (padding > 0) chunks.push(Buffer.alloc(padding))
  }
  chunks.push(Buffer.alloc(1024))
  return gzipSync(Buffer.concat(chunks))
}

afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-npm-ecosystem-'))
  roots.push(root)
  return root
}

describe('npm DSH ecosystem catalog', () => {
  it('searches tagged Bundles, hydrates exact artifact authority, and reuses it offline', async () => {
    const root = await temporaryRoot()
    const bytes = await readFile(new URL(
      '../resources/plugin-center/fixtures/deepseek-ai-dsh-plugin-center-fixture-0.1.0-rc.5.tgz',
      import.meta.url,
    ))
    const integrity = `sha512-${createHash('sha512').update(bytes).digest('base64')}`
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
      if (url.pathname === '/-/v1/search') {
        return new Response(JSON.stringify({
          total: 571,
          objects: [{
            package: {
              name: PACKAGE_NAME,
              version: VERSION,
              date: '2026-08-15T07:00:00.000Z',
              keywords: ['dsh-plugin', 'workspace'],
              publisher: { username: 'deepseek-ai' },
            },
          }],
        }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      if (url.href === TARBALL_URL) {
        return new Response(bytes, {
          status: 200,
          headers: { 'content-length': String(bytes.byteLength) },
        })
      }
      return new Response(JSON.stringify({
        name: PACKAGE_NAME,
        version: VERSION,
        description: 'Workspace tools for DeepSeek Harness',
        keywords: ['dsh-plugin', 'workspace'],
        author: { name: 'DeepSeek Harness' },
        repository: { type: 'git', url: 'git+https://github.com/deepseek-ai/deepseek-harness.git' },
        engines: { node: '>=22.19 <25' },
        dsh: {
          bundle: { patch: './cordis.patch.yml' },
          client: { platform: 'web', inject: [] },
          pluginCenter: {
            expectedEntries: ['fixture.workspace-tools'],
            expectedClientModules: [PACKAGE_NAME],
            expectedSkillIds: [],
          },
        },
        dist: { tarball: TARBALL_URL, integrity },
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    })
    const cache = new CatalogCache(root)
    const repository = new NpmEcosystemCatalogRepository(cache, fetcher, () => NOW)

    const list = await repository.list(QUERY)
    const summary = list.sections.featured[0]
    expect(list).toMatchObject({ source: 'network', freshness: 'fresh' })
    expect(summary).toMatchObject({
      displayName: PACKAGE_NAME,
      verified: false,
      icon: {
        url: 'https://avatars.githubusercontent.com/deepseek-ai?s=128',
        alt: 'DeepSeek Harness publisher avatar',
        width: 128,
        height: 128,
      },
    })
    expect(summary?.brandColor).toMatch(/^#[0-9A-F]{6}$/u)

    const detail = await repository.detail({ pluginId: summary!.pluginId, version: VERSION })
    expect(detail.detail).toMatchObject({
      summary: { verified: true },
      expectedEntries: ['fixture.workspace-tools'],
      expectedClientModules: [PACKAGE_NAME],
      riskLevel: 'high',
    })
    const selection = await repository.resolvePreflight({
      pluginId: summary!.pluginId,
      version: VERSION,
      action: 'install',
    })
    expect(selection.candidate).toMatchObject({ packageName: PACKAGE_NAME, reviewed: true })
    expect(selection.candidate?.artifacts).toContainEqual(expect.objectContaining({
      url: TARBALL_URL,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    }))

    const offline = new NpmEcosystemCatalogRepository(cache, vi.fn<typeof fetch>(async () => {
      throw new Error('offline')
    }), () => NOW)
    await expect(offline.installedAuthority()).resolves.toMatchObject({
      freshness: 'cached',
      entries: [{
        displayName: PACKAGE_NAME,
        verified: true,
        icon: { url: 'https://avatars.githubusercontent.com/deepseek-ai?s=128' },
      }],
      preflights: [{ packageName: PACKAGE_NAME }],
    })
  })

  it('prefers bounded publisher-declared artwork over the GitHub avatar fallback', async () => {
    const root = await temporaryRoot()
    const name = '@fixture/visual-plugin'
    const version = '1.0.0'
    const integrity = `sha512-${createHash('sha512').update(name).digest('base64')}`
    const fetcher: typeof fetch = async (input) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
      if (url.pathname === '/-/v1/search') {
        return new Response(JSON.stringify({
          total: 1,
          objects: [{
            package: {
              name,
              version,
              date: '2026-08-15T07:00:00.000Z',
              keywords: ['dsh-plugin'],
              publisher: { username: 'fixture' },
            },
          }],
        }), { status: 200 })
      }
      return new Response(JSON.stringify({
        name,
        version,
        keywords: ['dsh-plugin'],
        repository: { url: 'git+https://github.com/fallback-owner/visual-plugin.git' },
        dsh: {
          bundle: { patch: './cordis.patch.yml' },
          pluginCenter: {
            icon: {
              url: 'https://raw.githubusercontent.com/fixture/visual-plugin/main/icon.png',
              alt: 'Visual plugin logo',
              width: 256,
              height: 256,
            },
            brandColor: '#123ABC',
          },
        },
        dist: {
          tarball: `https://registry.npmjs.org/${name}/-/${name}-${version}.tgz`,
          integrity,
        },
      }), { status: 200 })
    }
    const repository = new NpmEcosystemCatalogRepository(new CatalogCache(root), fetcher, () => NOW)

    const result = await repository.list({ ...QUERY, query: '' })

    expect(result.sections.featured[0]).toMatchObject({
      icon: { url: 'https://raw.githubusercontent.com/fixture/visual-plugin/main/icon.png' },
      brandColor: '#123ABC',
    })
  })

  it('excludes tagged npm packages that do not declare a DSH Bundle', async () => {
    const root = await temporaryRoot()
    const fetcher: typeof fetch = async (input) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
      if (url.pathname === '/-/v1/search') {
        return new Response(JSON.stringify({
          objects: [{
            package: {
              name: 'plain-library',
              version: '1.0.0',
              date: '2026-08-15T07:00:00.000Z',
              keywords: ['dsh-plugin'],
              publisher: { username: 'publisher' },
            },
          }],
        }), { status: 200 })
      }
      return new Response(JSON.stringify({
        name: 'plain-library',
        version: '1.0.0',
        keywords: ['dsh-plugin'],
        dist: {},
      }), { status: 200 })
    }
    const repository = new NpmEcosystemCatalogRepository(new CatalogCache(root), fetcher, () => NOW)

    await expect(repository.list({ ...QUERY, query: '' })).resolves.toMatchObject({
      source: 'network',
      sections: { featured: [], popular: [], recent: [] },
    })
  })

  it('finds an untagged Bundle by short name, full package name, and exact version', async () => {
    const root = await temporaryRoot()
    const name = '@linxin666/dsh-web-ui-all'
    const version = '0.1.19'
    const integrity = `sha512-${createHash('sha512').update(name).digest('base64')}`
    const searchQueries: string[] = []
    const fetcher: typeof fetch = async (input) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
      if (url.pathname === '/-/v1/search') {
        const text = url.searchParams.get('text') ?? ''
        searchQueries.push(text)
        return new Response(JSON.stringify(text === 'dsh-web-ui-all' ? {
          total: 764_408,
          objects: [{
            package: {
              name,
              version,
              date: '2026-08-16T07:00:00.000Z',
              description: 'DeepSeek Harness Web UI bundle',
              publisher: { username: 'linxin666' },
            },
          }],
        } : { total: 0, objects: [] }), { status: 200 })
      }
      if (!url.pathname.endsWith(`/${version}`)) {
        return new Response(JSON.stringify({
          name,
          author: { name: 'linxin666' },
          'dist-tags': { latest: version },
          time: { [version]: '2026-08-16T07:00:00.000Z' },
          versions: {
            [version]: {
              name,
              version,
              description: 'DeepSeek Harness Web UI bundle',
              author: { name: 'linxin666' },
            },
          },
        }), { status: 200 })
      }
      return new Response(JSON.stringify({
        name,
        version,
        description: 'DeepSeek Harness Web UI bundle',
        author: { name: 'linxin666' },
        dsh: { bundle: { patch: './cordis.patch.yml' }, client: { platform: 'web' } },
        dist: {
          tarball: `https://registry.npmjs.org/${name}/-/${name}-${version}.tgz`,
          integrity,
        },
      }), { status: 200 })
    }
    const repository = new NpmEcosystemCatalogRepository(new CatalogCache(root), fetcher, () => NOW, root)

    const short = await repository.list({ ...QUERY, query: 'dsh-web-ui-all' })
    const full = await repository.list({ ...QUERY, query: name })
    const pinned = await repository.list({ ...QUERY, query: `${name}@${version}` })

    for (const result of [short, full, pinned]) {
      expect(result.sections.featured[0]).toMatchObject({
        displayName: name,
        version,
        compatibility: {
          status: 'unknown',
        },
      })
      expect(result.sections.featured[0]?.compatibility.reason).toContain('发布者未声明 Node.js')
    }
    expect(searchQueries).toContain('dsh-web-ui-all')
    expect(searchQueries).not.toContain(name)
  })

  it('maps an explicit GitHub repository URL to its published npm Bundle', async () => {
    const root = await temporaryRoot()
    const name = '@linxin666/dsh-web-ui-all'
    const version = '0.1.19'
    const integrity = `sha512-${createHash('sha512').update(name).digest('base64')}`
    const fetcher: typeof fetch = async (input) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
      if (url.hostname === 'api.github.com' && url.pathname.endsWith('/dsh-web-ui')) {
        return new Response(JSON.stringify({ default_branch: 'main' }), { status: 200 })
      }
      if (url.hostname === 'api.github.com' && url.pathname.includes('/git/trees/')) {
        return new Response(JSON.stringify({
          truncated: false,
          tree: [{ path: 'packages/all/package.json', type: 'blob', size: 500 }],
        }), { status: 200 })
      }
      if (url.hostname === 'raw.githubusercontent.com') {
        return new Response(JSON.stringify({
          name,
          version,
          dsh: { bundle: { patch: './cordis.patch.yml' } },
        }), { status: 200 })
      }
      if (!url.pathname.endsWith(`/${version}`)) {
        return new Response(JSON.stringify({
          name,
          author: { name: 'linxin666' },
          'dist-tags': { latest: version },
          time: { [version]: '2026-08-16T07:00:00.000Z' },
          versions: { [version]: { name, version, author: { name: 'linxin666' } } },
        }), { status: 200 })
      }
      return new Response(JSON.stringify({
        name,
        version,
        author: { name: 'linxin666' },
        dsh: { bundle: { patch: './cordis.patch.yml' } },
        dist: {
          tarball: `https://registry.npmjs.org/${name}/-/${name}-${version}.tgz`,
          integrity,
        },
      }), { status: 200 })
    }
    const repository = new NpmEcosystemCatalogRepository(new CatalogCache(root), fetcher, () => NOW)

    const result = await repository.list({
      ...QUERY,
      query: 'https://github.com/zhu1090093659/dsh-web-ui',
    })

    expect(result).toMatchObject({
      notice: 'github-mapped',
      sections: { featured: [expect.objectContaining({ displayName: name, version })] },
    })
  })

  it('returns actionable notices for source-only GitHub repositories and unavailable network search', async () => {
    const root = await temporaryRoot()
    const sourceOnlyFetcher: typeof fetch = async (input) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
      if (url.hostname === 'api.github.com' && url.pathname.endsWith('/source-only')) {
        return new Response(JSON.stringify({ default_branch: 'main' }), { status: 200 })
      }
      if (url.hostname === 'api.github.com' && url.pathname.includes('/git/trees/')) {
        return new Response(JSON.stringify({
          truncated: false,
          tree: [{ path: 'package.json', type: 'blob', size: 500 }],
        }), { status: 200 })
      }
      if (url.hostname === 'raw.githubusercontent.com') {
        return new Response(JSON.stringify({
          name: '@fixture/source-only',
          version: '1.0.0',
          dsh: { bundle: { patch: './cordis.patch.yml' } },
        }), { status: 200 })
      }
      return new Response('not published', { status: 404 })
    }
    const sourceOnly = new NpmEcosystemCatalogRepository(
      new CatalogCache(root),
      sourceOnlyFetcher,
      () => NOW,
    )

    await expect(sourceOnly.list({
      ...QUERY,
      query: 'https://github.com/fixture/source-only',
    })).resolves.toMatchObject({
      notice: 'github-source-only',
      sections: { featured: [], popular: [], recent: [] },
    })

    const offline = new NpmEcosystemCatalogRepository(
      new CatalogCache(await temporaryRoot()),
      async () => { throw new Error('offline') },
      () => NOW,
    )
    await expect(offline.list({ ...QUERY, query: 'dsh-web-ui-all' })).resolves.toMatchObject({
      notice: 'network-unavailable',
      sections: { featured: [], popular: [], recent: [] },
    })
  })

  it('does not cache a transient exact-version metadata failure and refreshes the candidate', async () => {
    const root = await temporaryRoot()
    const name = '@fixture/dsh-transient'
    const version = '1.0.0'
    const integrity = `sha512-${createHash('sha512').update(name).digest('base64')}`
    let metadataCalls = 0
    const fetcher: typeof fetch = async (input) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
      if (url.pathname === '/-/v1/search') {
        return new Response(JSON.stringify({
          total: 1,
          objects: [{ package: {
            name,
            version,
            date: '2026-08-16T07:00:00.000Z',
            publisher: { username: 'fixture' },
          } }],
        }), { status: 200 })
      }
      metadataCalls += 1
      if (metadataCalls === 1) throw new Error('transient registry outage')
      return new Response(JSON.stringify({
        name,
        version,
        dsh: { bundle: { patch: './cordis.patch.yml' } },
        dist: {
          tarball: `https://registry.npmjs.org/${name}/-/${name}-${version}.tgz`,
          integrity,
        },
      }), { status: 200 })
    }
    const repository = new NpmEcosystemCatalogRepository(new CatalogCache(root), fetcher, () => NOW)
    const query = { ...QUERY, query: 'dsh-transient' }

    await expect(repository.list(query)).resolves.toMatchObject({
      notice: 'network-unavailable',
      sections: { featured: [], popular: [], recent: [] },
    })
    await expect(repository.refresh(query)).resolves.toMatchObject({
      source: 'network',
      freshness: 'fresh',
      sections: { featured: [expect.objectContaining({ displayName: name, version })] },
    })
    expect(metadataCalls).toBe(2)
  })

  it.each(['manifest', 'packument'] as const)(
    'does not misreport a transient GitHub %s request as an absent Bundle or unpublished package',
    async (failure) => {
      const root = await temporaryRoot()
      const name = '@fixture/dsh-github-transient'
      const version = '1.0.0'
      const fetcher: typeof fetch = async (input) => {
        const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
        if (url.hostname === 'api.github.com' && url.pathname.endsWith('/github-transient')) {
          return new Response(JSON.stringify({ default_branch: 'main' }), { status: 200 })
        }
        if (url.hostname === 'api.github.com' && url.pathname.includes('/git/trees/')) {
          return new Response(JSON.stringify({
            truncated: false,
            tree: [{ path: 'package.json', type: 'blob', size: 500 }],
          }), { status: 200 })
        }
        if (url.hostname === 'raw.githubusercontent.com') {
          if (failure === 'manifest') throw new Error('transient GitHub raw outage')
          return new Response(JSON.stringify({
            name,
            version,
            dsh: { bundle: { patch: './cordis.patch.yml' } },
          }), { status: 200 })
        }
        if (failure === 'packument') throw new Error('transient npm packument outage')
        throw new Error(`unexpected request ${url.href}`)
      }
      const repository = new NpmEcosystemCatalogRepository(new CatalogCache(root), fetcher, () => NOW)

      await expect(repository.list({
        ...QUERY,
        query: 'https://github.com/fixture/github-transient',
      })).resolves.toMatchObject({
        notice: 'network-unavailable',
        sections: { featured: [], popular: [], recent: [] },
      })
    },
  )

  it.each([
    ['an undeclared module', undefined, 'references undeclared dependency @fixture/dsh-child'],
    ['a non-exact dependency', '^1.0.0', 'dependency @fixture/dsh-child must use an exact version'],
  ])('rejects an aggregate Bundle that references %s', async (_label, dependencyVersion, message) => {
    const root = await temporaryRoot()
    const name = '@fixture/dsh-aggregate'
    const version = '1.0.0'
    const bytes = aggregateTarball(dependencyVersion)
    const integrity = `sha512-${createHash('sha512').update(bytes).digest('base64')}`
    const tarballUrl = 'https://registry.npmjs.org/@fixture/dsh-aggregate/-/dsh-aggregate-1.0.0.tgz'
    const fetcher: typeof fetch = async (input) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
      if (url.pathname === '/-/v1/search') {
        const text = url.searchParams.get('text')
        return new Response(JSON.stringify(text === 'aggregate' ? {
          total: 1,
          objects: [{ package: {
            name,
            version,
            date: '2026-08-16T07:00:00.000Z',
            publisher: { username: 'fixture' },
          } }],
        } : { total: 0, objects: [] }), { status: 200 })
      }
      if (url.href === tarballUrl) return new Response(new Uint8Array(bytes), { status: 200 })
      return new Response(JSON.stringify({
        name,
        version,
        dsh: { bundle: { patch: './cordis.patch.yml' } },
        dist: { tarball: tarballUrl, integrity },
      }), { status: 200 })
    }
    const repository = new NpmEcosystemCatalogRepository(new CatalogCache(root), fetcher, () => NOW)
    const result = await repository.list({ ...QUERY, query: 'aggregate' })
    const summary = result.sections.featured[0]!

    await expect(repository.detail({ pluginId: summary.pluginId, version })).rejects.toThrow(message)
  })

  it('accepts a Bundle reference supplied by the closed Desktop Host runtime', async () => {
    const root = await temporaryRoot()
    const name = '@fixture/dsh-aggregate'
    const version = '1.0.0'
    const hostModule = '@deepseek-ai/dsh-skill-filesystem'
    const patch = `- insert:
    - id: fixture.aggregate
      name: '@fixture/dsh-aggregate'
    - id: fixture.host-skill
      name: '${hostModule}'
`
    const bytes = aggregateTarball(undefined, patch)
    const integrity = `sha512-${createHash('sha512').update(bytes).digest('base64')}`
    const tarballUrl = 'https://registry.npmjs.org/@fixture/dsh-aggregate/-/dsh-aggregate-1.0.0.tgz'
    const fetcher: typeof fetch = async (input) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
      if (url.pathname === '/-/v1/search') {
        return new Response(JSON.stringify({
          total: 1,
          objects: [{ package: {
            name,
            version,
            date: '2026-08-16T07:00:00.000Z',
            publisher: { username: 'fixture' },
          } }],
        }), { status: 200 })
      }
      if (url.href === tarballUrl) return new Response(new Uint8Array(bytes), { status: 200 })
      return new Response(JSON.stringify({
        name,
        version,
        dsh: { bundle: { patch: './cordis.patch.yml' } },
        dist: { tarball: tarballUrl, integrity },
      }), { status: 200 })
    }
    const repository = new NpmEcosystemCatalogRepository(
      new CatalogCache(root, [hostModule]),
      fetcher,
      () => NOW,
      undefined,
      new Set([hostModule]),
    )
    const result = await repository.list({ ...QUERY, query: 'aggregate' })
    const summary = result.sections.featured[0]!

    await expect(repository.detail({ pluginId: summary.pluginId, version })).resolves.toMatchObject({
      detail: {
        expectedEntries: ['fixture.aggregate', 'fixture.host-skill'],
        expectedClientModules: [],
        eligible: true,
      },
    })

    const reopenedWithoutHostModule = new NpmEcosystemCatalogRepository(
      new CatalogCache(root, []),
      fetcher,
      () => NOW,
      undefined,
      new Set(),
    )
    const reopenedResult = await reopenedWithoutHostModule.list({ ...QUERY, query: 'aggregate' })
    const reopenedSummary = reopenedResult.sections.featured[0]!
    await expect(reopenedWithoutHostModule.detail({
      pluginId: reopenedSummary.pluginId,
      version,
    })).rejects.toThrow(`references undeclared dependency ${hostModule}`)
  })

  it('parses aggregate module ownership with the live YAML dialect and ignores nested plugin config names', async () => {
    const root = await temporaryRoot()
    const name = '@fixture/dsh-aggregate'
    const version = '1.0.0'
    const patch = JSON.stringify([{
      insert: [{
        id: 'fixture.aggregate',
        name,
        config: { name: '@fixture/not-a-loader-module' },
      }, {
        id: 'fixture.child',
        name: '@fixture/dsh-child',
      }],
    }])
    const bytes = aggregateTarball(undefined, patch)
    const integrity = `sha512-${createHash('sha512').update(bytes).digest('base64')}`
    const tarballUrl = 'https://registry.npmjs.org/@fixture/dsh-aggregate/-/dsh-aggregate-1.0.0.tgz'
    const fetcher: typeof fetch = async (input) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
      if (url.pathname === '/-/v1/search') {
        return new Response(JSON.stringify({
          total: 1,
          objects: [{ package: { name, version, date: '2026-08-16T07:00:00.000Z', publisher: { username: 'fixture' } } }],
        }), { status: 200 })
      }
      if (url.href === tarballUrl) return new Response(new Uint8Array(bytes), { status: 200 })
      return new Response(JSON.stringify({
        name,
        version,
        dsh: { bundle: { patch: './cordis.patch.yml' } },
        dist: { tarball: tarballUrl, integrity },
      }), { status: 200 })
    }
    const repository = new NpmEcosystemCatalogRepository(new CatalogCache(root), fetcher, () => NOW)
    const result = await repository.list({ ...QUERY, query: 'aggregate' })
    const summary = result.sections.featured[0]!

    await expect(repository.detail({ pluginId: summary.pluginId, version }))
      .rejects.toThrow('references undeclared dependency @fixture/dsh-child')
  })

  it('caps exact metadata hydration for broad or adversarial search results', async () => {
    const root = await temporaryRoot()
    const packages = Array.from({ length: 200 }, (_, index) => ({
      name: `dsh-invalid-${String(index).padStart(3, '0')}`,
      version: '1.0.0',
      date: '2026-08-16T07:00:00.000Z',
      keywords: ['dsh-plugin'],
      publisher: { username: 'fixture' },
    }))
    let metadataRequests = 0
    const fetcher: typeof fetch = async (input) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
      if (url.pathname === '/-/v1/search') {
        return new Response(JSON.stringify({
          total: packages.length,
          objects: packages.map(value => ({ package: value })),
        }), { status: 200 })
      }
      metadataRequests += 1
      const sourceName = decodeURIComponent(url.pathname.split('/').filter(Boolean)[0] ?? '')
      return new Response(JSON.stringify({ name: sourceName, version: '1.0.0', dist: {} }), { status: 200 })
    }
    const repository = new NpmEcosystemCatalogRepository(new CatalogCache(root), fetcher, () => NOW)

    const result = await repository.list({ ...QUERY, query: 'dsh-invalid', limit: 24 })

    expect(result.sections.featured).toEqual([])
    expect(metadataRequests).toBe(96)
  })

  it('searches the complete paginated npm keyword index before filtering by the live query', async () => {
    const root = await temporaryRoot()
    const targetName = 'deepseek-harness-openai-oauth'
    const targetVersion = '0.3.1'
    const integrity = `sha512-${createHash('sha512').update(targetName).digest('base64')}`
    const searchOffsets: string[] = []
    const metadataRequests: string[] = []
    const decoys = Array.from({ length: 250 }, (_, index) => ({
      package: {
        name: `dsh-decoy-${String(index).padStart(3, '0')}`,
        version: '1.0.0',
        date: '2026-08-15T07:00:00.000Z',
        description: 'Unrelated catalog entry',
        keywords: ['dsh-plugin'],
        publisher: { username: 'publisher' },
      },
    }))
    const fetcher: typeof fetch = async (input) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
      if (url.pathname === '/-/v1/search') {
        const from = url.searchParams.get('from') ?? '0'
        searchOffsets.push(from)
        return new Response(JSON.stringify({
          total: 251,
          objects: from === '0' ? decoys : [{
            package: {
              name: targetName,
              version: targetVersion,
              date: '2026-08-15T07:30:00.000Z',
              description: 'OpenAI OAuth provider for DeepSeek Harness',
              keywords: ['dsh-plugin', 'oauth'],
              publisher: { username: 'publisher' },
            },
          }],
        }), { status: 200 })
      }
      metadataRequests.push(url.pathname)
      return new Response(JSON.stringify({
        name: targetName,
        version: targetVersion,
        description: 'OpenAI OAuth provider for DeepSeek Harness',
        keywords: ['dsh-plugin', 'oauth'],
        author: { name: 'publisher' },
        engines: { node: '>=22.19 <25' },
        dsh: { bundle: { patch: './cordis.patch.yml' } },
        dist: {
          tarball: `https://registry.npmjs.org/${targetName}/-/${targetName}-${targetVersion}.tgz`,
          integrity,
        },
      }), { status: 200 })
    }
    const repository = new NpmEcosystemCatalogRepository(new CatalogCache(root), fetcher, () => NOW)

    const result = await repository.list({ ...QUERY, query: targetName })

    expect(result).toMatchObject({
      source: 'network',
      sections: { featured: [expect.objectContaining({ displayName: targetName })] },
    })
    expect(searchOffsets).toEqual(['0', '0', '250'])
    expect(metadataRequests).toEqual([`/${targetName}/${targetVersion}`])
  })

  it('returns a small cold-start batch and reuses its strict discovery cache on the next launch', async () => {
    const root = await temporaryRoot()
    const packages = Array.from({ length: 30 }, (_, index) => ({
      name: `dsh-cold-${String(index).padStart(2, '0')}`,
      version: '1.0.0',
      date: '2026-08-15T07:00:00.000Z',
      description: `Cold-start plugin ${String(index)}`,
      keywords: ['dsh-plugin'],
      publisher: { username: 'fixture' },
    }))
    const metadataRequests: string[] = []
    const fetcher: typeof fetch = async (input) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
      if (url.pathname === '/-/v1/search') {
        return new Response(JSON.stringify({ total: packages.length, objects: packages.map(packageValue => ({
          package: packageValue,
        })) }), { status: 200 })
      }
      metadataRequests.push(url.pathname)
      const name = url.pathname.split('/').filter(Boolean)[0] ?? ''
      const integrity = `sha512-${createHash('sha512').update(name).digest('base64')}`
      return new Response(JSON.stringify({
        name,
        version: '1.0.0',
        description: `Cold-start plugin ${name}`,
        keywords: ['dsh-plugin'],
        repository: { url: `git+https://github.com/fixture/${name}.git` },
        dsh: { bundle: { patch: './cordis.patch.yml' } },
        dist: {
          tarball: `https://registry.npmjs.org/${name}/-/${name}-1.0.0.tgz`,
          integrity,
        },
      }), { status: 200 })
    }
    const query = { ...QUERY, query: '' }
    const repository = new NpmEcosystemCatalogRepository(
      new CatalogCache(root),
      fetcher,
      () => NOW,
      root,
    )

    const cold = await repository.list(query)

    expect(Object.values(cold.sections).flat()).toHaveLength(6)
    expect(metadataRequests).toHaveLength(12)

    const offlineUrls: string[] = []
    const offlineFetch = vi.fn<typeof fetch>(async (input) => {
      offlineUrls.push(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
      throw new Error('offline')
    })
    const reopened = new NpmEcosystemCatalogRepository(
      new CatalogCache(root),
      offlineFetch,
      () => NOW + 1_000,
      root,
    )
    const cached = await reopened.list(query)

    expect(cached).toMatchObject({ source: 'cache', freshness: 'cached' })
    expect(Object.values(cached.sections).flat()).toHaveLength(12)
    expect(offlineFetch).not.toHaveBeenCalled()
    const cachedEntry = cached.sections.featured[0]!
    await expect(reopened.resolvePreflight({
      pluginId: cachedEntry.pluginId,
      version: cachedEntry.version,
      action: 'install',
    })).resolves.toMatchObject({ candidate: null })
    expect(offlineFetch).toHaveBeenCalledTimes(1)
    expect(new URL(offlineUrls[0]!).pathname).toMatch(/\/1\.0\.0$/u)
  })
})
