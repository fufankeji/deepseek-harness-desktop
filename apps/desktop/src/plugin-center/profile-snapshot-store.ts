/** Hash-bound private snapshot and safe restore of Plugin Center Profile authority files. */

import { createHash, randomUUID } from 'node:crypto'
import {
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rmdir,
  unlink,
} from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import type {
  PluginProfileIdentity,
  PluginRecoveryReasonCode,
} from '@deepseek-ai/dsh-plugin-center-contracts'

const AUTHORITY_FILES = [
  'package.json',
  'pnpm-lock.yaml',
  'cordis.patch.yml',
  'node_modules/.modules.yaml',
] as const
const SNAPSHOT_FILENAME = 'profile-snapshot.json'
const MAX_AUTHORITY_FILE_BYTES = 16 * 1024 * 1024
const MAX_SNAPSHOT_BYTES = 48 * 1024 * 1024
const MAX_RETAINED_SNAPSHOTS = 8
const STABLE_ID = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/u
const PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/u
const SHA256 = /^[0-9a-f]{64}$/u

type AuthorityFile = typeof AUTHORITY_FILES[number]

interface SnapshotFile {
  readonly path: AuthorityFile
  readonly contentBase64: string | null
  readonly sha256: string | null
}

interface SnapshotContent {
  readonly schemaVersion: 2
  readonly snapshotId: string
  readonly operationId: string
  readonly createdAt: string
  readonly profileIdentity: PluginProfileIdentity
  readonly packageName: string
  readonly targetPackageExisted: boolean
  readonly files: readonly SnapshotFile[]
}

/** Complete pre-mutation snapshot retained by F005 recovery. */
export interface ProfileMutationSnapshot extends SnapshotContent {
  readonly snapshotSha256: string
}

/** Journal-owned identity used to reject the wrong snapshot or Profile root. */
export interface ProfileSnapshotExpectation {
  readonly snapshotId: string
  readonly snapshotSha256: string
  readonly operationId: string
  readonly profileIdentity: PluginProfileIdentity
}

/** Stable recovery-facing classification for an unusable private snapshot. */
export class ProfileSnapshotError extends Error {
  override readonly name = 'ProfileSnapshotError'
  readonly reasonCode: Extract<
    PluginRecoveryReasonCode,
    | 'snapshot-missing'
    | 'snapshot-invalid'
    | 'snapshot-root-mismatch'
    | 'snapshot-path-invalid'
    | 'snapshot-hash-mismatch'
  >

  constructor(reasonCode: ProfileSnapshotError['reasonCode'], message: string, options?: ErrorOptions) {
    super(message, options)
    this.reasonCode = reasonCode
  }
}

function classifySnapshotReadError(error: unknown): ProfileSnapshotError {
  if (error instanceof ProfileSnapshotError) return error
  if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
    return new ProfileSnapshotError('snapshot-missing', 'profile snapshot artifact is missing', { cause: error })
  }
  const message = error instanceof Error ? error.message : String(error)
  const reasonCode = /hash/iu.test(message)
    ? 'snapshot-hash-mismatch'
    : /path|whitelist|regular file|real directory|symbolic/iu.test(message)
      ? 'snapshot-path-invalid'
      : 'snapshot-invalid'
  return new ProfileSnapshotError(reasonCode, 'profile snapshot artifact failed validation', { cause: error })
}

function digest(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex')
}

function stableId(value: unknown, label: string): string {
  if (typeof value !== 'string' || !STABLE_ID.test(value)) {
    throw new Error(`profile snapshot ${label} must be a stable id`)
  }
  return value
}

function sha256(value: unknown, label: string): string {
  if (typeof value !== 'string' || !SHA256.test(value)) {
    throw new Error(`profile snapshot ${label} must be a lowercase SHA-256 digest`)
  }
  return value
}

function canonicalInstant(value: unknown): string {
  if (typeof value !== 'string' || new Date(value).toISOString() !== value) {
    throw new Error('profile snapshot createdAt must be a canonical UTC instant')
  }
  return value
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`profile snapshot ${label} must be an object`)
  }
  return value as Record<string, unknown>
}

function exact(source: Record<string, unknown>, keys: readonly string[], label: string): void {
  const actual = Object.keys(source).sort()
  const expected = [...keys].sort()
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`profile snapshot ${label} has unknown or missing fields`)
  }
}

function decodeProfileIdentity(value: unknown): PluginProfileIdentity {
  const source = record(value, 'profileIdentity')
  exact(source, ['profileName', 'rootSha256'], 'profileIdentity')
  if (source['profileName'] !== 'web') throw new Error('profile snapshot profileName must equal web')
  return { profileName: 'web', rootSha256: sha256(source['rootSha256'], 'rootSha256') }
}

function decodeBase64(value: unknown, path: AuthorityFile): Buffer | null {
  if (value === null) return null
  if (typeof value !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value)) {
    throw new Error(`profile snapshot ${path} content must be canonical base64 or null`)
  }
  const content = Buffer.from(value, 'base64')
  if (content.length > MAX_AUTHORITY_FILE_BYTES || content.toString('base64') !== value) {
    throw new Error(`profile snapshot ${path} content exceeds its limit or is not canonical base64`)
  }
  return content
}

function decodeSnapshotFile(value: unknown, expectedPath: AuthorityFile): SnapshotFile {
  const source = record(value, expectedPath)
  exact(source, ['path', 'contentBase64', 'sha256'], expectedPath)
  if (source['path'] !== expectedPath) {
    throw new Error(`profile snapshot file path must equal whitelisted path ${expectedPath}`)
  }
  const content = decodeBase64(source['contentBase64'], expectedPath)
  const contentSha256 = source['sha256'] === null ? null : sha256(source['sha256'], `${expectedPath} sha256`)
  if ((content === null) !== (contentSha256 === null)) {
    throw new Error(`profile snapshot ${expectedPath} content and hash must be present together`)
  }
  if (content !== null && digest(content) !== contentSha256) {
    throw new Error(`profile snapshot ${expectedPath} content hash does not match`)
  }
  return {
    path: expectedPath,
    contentBase64: content?.toString('base64') ?? null,
    sha256: contentSha256,
  }
}

function snapshotDigest(content: SnapshotContent): string {
  return digest(JSON.stringify(content))
}

/** Decode every snapshot field and recheck its semantic hash. */
function decodeProfileMutationSnapshot(value: unknown): ProfileMutationSnapshot {
  const source = record(value, 'document')
  exact(source, [
    'schemaVersion', 'snapshotId', 'operationId', 'createdAt', 'profileIdentity', 'packageName',
    'targetPackageExisted', 'files', 'snapshotSha256',
  ], 'document')
  if (source['schemaVersion'] !== 2) throw new Error('profile snapshot schemaVersion must equal 2')
  const snapshotId = stableId(source['snapshotId'], 'snapshotId')
  const operationId = stableId(source['operationId'], 'operationId')
  if (snapshotId !== operationId) throw new Error('profile snapshot must be owned by its operation id')
  if (typeof source['packageName'] !== 'string' || !PACKAGE_NAME.test(source['packageName'])) {
    throw new Error('profile snapshot packageName must be a lowercase npm package name')
  }
  if (typeof source['targetPackageExisted'] !== 'boolean') {
    throw new Error('profile snapshot targetPackageExisted must be a boolean')
  }
  const filesValue = source['files']
  if (!Array.isArray(filesValue) || filesValue.length !== AUTHORITY_FILES.length) {
    throw new Error('profile snapshot files must contain the complete authority whitelist')
  }
  const content: SnapshotContent = {
    schemaVersion: 2,
    snapshotId,
    operationId,
    createdAt: canonicalInstant(source['createdAt']),
    profileIdentity: decodeProfileIdentity(source['profileIdentity']),
    packageName: source['packageName'],
    targetPackageExisted: source['targetPackageExisted'],
    files: AUTHORITY_FILES.map((path, index) => decodeSnapshotFile(filesValue[index], path)),
  }
  const snapshotSha256 = sha256(source['snapshotSha256'], 'snapshotSha256')
  if (snapshotDigest(content) !== snapshotSha256) {
    throw new Error('profile snapshot document hash does not match')
  }
  return { ...content, snapshotSha256 }
}

async function requireDirectory(path: string, label: string): Promise<void> {
  const metadata = await lstat(path)
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new Error(`profile snapshot ${label} must be a real directory`)
  }
}

async function optionalLstat(path: string): Promise<Awaited<ReturnType<typeof lstat>> | null> {
  try {
    return await lstat(path)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

async function authorityTarget(profileDirectory: string, relativePath: AuthorityFile): Promise<string> {
  await requireDirectory(profileDirectory, 'Profile root')
  const segments = relativePath.split('/')
  let parent = profileDirectory
  for (const segment of segments.slice(0, -1)) {
    parent = join(parent, segment)
    const metadata = await optionalLstat(parent)
    if (metadata === null) break
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
      throw new Error(`profile snapshot authority parent is not a real directory: ${relativePath}`)
    }
  }
  const target = join(profileDirectory, ...segments)
  const metadata = await optionalLstat(target)
  if (metadata !== null && (!metadata.isFile() || metadata.isSymbolicLink())) {
    throw new Error(`profile snapshot authority path is not a regular file: ${relativePath}`)
  }
  return target
}

async function optionalAuthorityFile(profileDirectory: string, relativePath: AuthorityFile): Promise<Buffer | null> {
  const target = await authorityTarget(profileDirectory, relativePath)
  const metadata = await optionalLstat(target)
  if (metadata === null) return null
  if (metadata.size > MAX_AUTHORITY_FILE_BYTES) {
    throw new Error(`profile snapshot authority file exceeds its limit: ${relativePath}`)
  }
  return await readFile(target)
}

async function syncDirectory(path: string): Promise<void> {
  if (process.platform === 'win32') return
  const handle = await open(path, 'r')
  try { await handle.sync() } finally { await handle.close() }
}

async function durableAtomicWrite(path: string, content: Buffer | string, mode: number): Promise<void> {
  const parent = dirname(path)
  await requireDirectory(parent, 'write parent')
  const current = await optionalLstat(path)
  if (current !== null && (!current.isFile() || current.isSymbolicLink())) {
    throw new Error(`profile snapshot refuses to replace a non-regular path: ${basename(path)}`)
  }
  const temporary = join(parent, `.${basename(path)}.${randomUUID()}.tmp`)
  const handle = await open(temporary, 'wx', mode)
  try {
    await handle.writeFile(content)
    await handle.sync()
  } catch (error) {
    await handle.close().catch(() => {})
    await unlink(temporary).catch(() => {})
    throw error
  }
  await handle.close()
  try {
    await rename(temporary, path)
    await syncDirectory(parent)
  } catch (error) {
    await unlink(temporary).catch(() => {})
    throw error
  }
}

async function durableRemove(path: string): Promise<void> {
  const metadata = await optionalLstat(path)
  if (metadata === null) return
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error(`profile snapshot refuses to remove a non-regular path: ${basename(path)}`)
  }
  await unlink(path)
  await syncDirectory(dirname(path))
}

function sameIdentity(left: PluginProfileIdentity, right: PluginProfileIdentity): boolean {
  return left.rootSha256 === right.rootSha256
}

/** Captures, validates, and restores the exact mutation-owned Profile closure. */
export class ProfileSnapshotStore {
  constructor(
    private readonly profileDirectory: string,
    private readonly snapshotDirectory: string,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** Return the canonical hash-bound identity of the selected web Profile. */
  async identity(): Promise<PluginProfileIdentity> {
    await requireDirectory(this.profileDirectory, 'Profile root')
    return { profileName: 'web', rootSha256: digest(await realpath(this.profileDirectory)) }
  }

  /** Capture a complete immutable snapshot before the first mutation phase. */
  async capture(operationIdValue: string, packageName: string): Promise<ProfileMutationSnapshot> {
    const operationId = stableId(operationIdValue, 'operationId')
    if (!PACKAGE_NAME.test(packageName)) {
      throw new Error('profile snapshot packageName must be a lowercase npm package name')
    }
    const profileIdentity = await this.identity()
    const packageSegments = packageName.split('/')
    const packageParent = join(this.profileDirectory, 'node_modules', ...packageSegments.slice(0, -1))
    const packageParentMetadata = await optionalLstat(packageParent)
    if (packageParentMetadata !== null
      && (!packageParentMetadata.isDirectory() || packageParentMetadata.isSymbolicLink())) {
      throw new Error('profile snapshot package parent must be a real directory')
    }
    const targetPackageExisted = await optionalLstat(
      join(this.profileDirectory, 'node_modules', ...packageSegments),
    ) !== null
    const files: SnapshotFile[] = []
    for (const relativePath of AUTHORITY_FILES) {
      const content = await optionalAuthorityFile(this.profileDirectory, relativePath)
      files.push({
        path: relativePath,
        contentBase64: content?.toString('base64') ?? null,
        sha256: content === null ? null : digest(content),
      })
    }
    const content: SnapshotContent = {
      schemaVersion: 2,
      snapshotId: operationId,
      operationId,
      createdAt: this.now().toISOString(),
      profileIdentity,
      packageName,
      targetPackageExisted,
      files,
    }
    const snapshot = decodeProfileMutationSnapshot({
      ...content,
      snapshotSha256: snapshotDigest(content),
    })
    await mkdir(this.snapshotDirectory, { recursive: true, mode: 0o700 })
    await requireDirectory(this.snapshotDirectory, 'storage root')
    const operationDirectory = join(this.snapshotDirectory, operationId)
    await mkdir(operationDirectory, { mode: 0o700 })
    await requireDirectory(operationDirectory, 'operation directory')
    await durableAtomicWrite(
      join(operationDirectory, SNAPSHOT_FILENAME),
      `${JSON.stringify(snapshot, null, 2)}\n`,
      0o600,
    )
    await this.pruneClosedSnapshots(operationId)
    return snapshot
  }

  /** Read and fully validate one bounded snapshot artifact. */
  async read(snapshotIdValue: string): Promise<ProfileMutationSnapshot> {
    try {
      const snapshotId = stableId(snapshotIdValue, 'snapshotId')
      await requireDirectory(this.snapshotDirectory, 'storage root')
      const operationDirectory = join(this.snapshotDirectory, snapshotId)
      await requireDirectory(operationDirectory, 'operation directory')
      const filename = join(operationDirectory, SNAPSHOT_FILENAME)
      const metadata = await lstat(filename)
      if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size > MAX_SNAPSHOT_BYTES) {
        throw new Error('profile snapshot artifact must be a bounded regular file')
      }
      return decodeProfileMutationSnapshot(JSON.parse(await readFile(filename, 'utf8')) as unknown)
    } catch (error) {
      throw classifySnapshotReadError(error)
    }
  }

  /** Idempotently restore the whitelist after matching every journal-owned identity. */
  async restore(expectation: ProfileSnapshotExpectation): Promise<ProfileMutationSnapshot> {
    const snapshot = await this.read(expectation.snapshotId)
    const currentIdentity = await this.identity()
    if (snapshot.operationId !== expectation.operationId) {
      throw new ProfileSnapshotError('snapshot-invalid', 'profile snapshot operation identity does not match')
    }
    if (snapshot.snapshotSha256 !== expectation.snapshotSha256) {
      throw new ProfileSnapshotError('snapshot-hash-mismatch', 'profile snapshot hash does not match the journal')
    }
    if (!sameIdentity(snapshot.profileIdentity, expectation.profileIdentity)
      || !sameIdentity(snapshot.profileIdentity, currentIdentity)) {
      throw new ProfileSnapshotError(
        'snapshot-root-mismatch',
        'profile snapshot identity does not match the journal or current Profile root',
      )
    }

    try {
      for (const file of snapshot.files) await authorityTarget(this.profileDirectory, file.path)
    } catch (error) {
      throw new ProfileSnapshotError('snapshot-path-invalid', 'profile snapshot restore path is unsafe', {
        cause: error,
      })
    }
    for (const file of snapshot.files) {
      const target = join(this.profileDirectory, ...file.path.split('/'))
      if (file.contentBase64 === null) {
        await durableRemove(target)
        continue
      }
      const parent = dirname(target)
      const parentMetadata = await optionalLstat(parent)
      if (parentMetadata === null) await mkdir(parent, { recursive: false, mode: 0o700 })
      await durableAtomicWrite(target, Buffer.from(file.contentBase64, 'base64'), 0o600)
    }

    for (const file of snapshot.files) {
      const restored = await optionalAuthorityFile(this.profileDirectory, file.path)
      if ((restored === null) !== (file.sha256 === null)
        || (restored !== null && digest(restored) !== file.sha256)) {
        throw new Error(`profile snapshot restore verification failed: ${file.path}`)
      }
    }
    return snapshot
  }

  /** Verify whether the old exact package link/directory presence was re-materialized. */
  async verifyTargetPackagePresence(snapshot: ProfileMutationSnapshot): Promise<void> {
    const packageSegments = snapshot.packageName.split('/')
    const packageParent = join(this.profileDirectory, 'node_modules', ...packageSegments.slice(0, -1))
    const parentMetadata = await optionalLstat(packageParent)
    if (parentMetadata !== null && (!parentMetadata.isDirectory() || parentMetadata.isSymbolicLink())) {
      throw new Error('profile snapshot restored package parent is not a real directory')
    }
    const exists = await optionalLstat(join(this.profileDirectory, 'node_modules', ...packageSegments)) !== null
    if (exists !== snapshot.targetPackageExisted) {
      throw new Error('profile snapshot restored package presence differs from the prior state')
    }
  }

  /** Keep the current snapshot plus a bounded set of older, fully valid snapshot artifacts. */
  private async pruneClosedSnapshots(currentSnapshotId: string): Promise<void> {
    const entries = await readdir(this.snapshotDirectory, { withFileTypes: true })
    const retainedCandidates: ProfileMutationSnapshot[] = []
    for (const entry of entries) {
      if (entry.name === currentSnapshotId || !entry.isDirectory() || !STABLE_ID.test(entry.name)) continue
      try {
        retainedCandidates.push(await this.read(entry.name))
      } catch {
        // Unknown, corrupt, or unsafe evidence is retained for diagnosis rather than guessed disposable.
      }
    }
    retainedCandidates.sort((left, right) => {
      const byTime = Date.parse(right.createdAt) - Date.parse(left.createdAt)
      return byTime === 0 ? right.snapshotId.localeCompare(left.snapshotId) : byTime
    })
    for (const snapshot of retainedCandidates.slice(MAX_RETAINED_SNAPSHOTS - 1)) {
      await this.removeClosedSnapshot(snapshot.snapshotId)
    }
  }

  private async removeClosedSnapshot(snapshotId: string): Promise<void> {
    const operationDirectory = join(this.snapshotDirectory, snapshotId)
    const directoryMetadata = await lstat(operationDirectory)
    if (!directoryMetadata.isDirectory() || directoryMetadata.isSymbolicLink()) return
    const entries = await readdir(operationDirectory)
    if (entries.length !== 1 || entries[0] !== SNAPSHOT_FILENAME) return
    const filename = join(operationDirectory, SNAPSHOT_FILENAME)
    const fileMetadata = await lstat(filename)
    if (!fileMetadata.isFile() || fileMetadata.isSymbolicLink()) return
    await unlink(filename)
    await rmdir(operationDirectory)
    await syncDirectory(this.snapshotDirectory)
  }
}
