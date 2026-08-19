/** Strict JSON boundary for the Desktop Plugin Center catalog. */

/** Discovery kind. Skill packs remain ordinary reviewed DSH Bundles. */
export type CatalogKind = 'plugin' | 'skill-pack'
/** Catalog scope selected by the user. */
export type CatalogScope = 'public' | 'local'
/** Server-owned discovery order. */
export type CatalogSection = 'featured' | 'popular' | 'recent'
/** Evidence age attached to every renderer result. */
export type CatalogFreshness = 'fresh' | 'cached' | 'stale'
/** Trusted source of the decoded snapshot. */
export type CatalogSource = 'network' | 'cache' | 'bundled'
/** Closed capability vocabulary reviewed with one exact Bundle. */
export type CatalogCapability =
  | 'host'
  | 'client'
  | 'agent'
  | 'tool'
  | 'model-provider'
  | 'skill'
  | 'network'
  | 'filesystem'
  | 'subprocess'
/** Preflight summary available during discovery. */
export type CatalogCompatibilityStatus = 'compatible' | 'incompatible' | 'unknown'
/** Disclosure level, not a sandbox guarantee. */
export type CatalogRiskLevel = 'low' | 'medium' | 'high'

/** Bounded catalog media reference from an approved HTTPS origin. */
export interface CatalogMedia {
  readonly url: string
  readonly alt: string
  readonly width: number
  readonly height: number
}

/** Platform-level compatibility summary for a catalog card. */
export interface CatalogCompatibility {
  readonly status: CatalogCompatibilityStatus
  readonly reason: string | null
  readonly platforms: readonly string[]
}

/** One exact DSH Bundle whose registry metadata has passed catalog validation. */
export interface CatalogSummary {
  readonly pluginId: string
  readonly version: string
  readonly catalogKind: CatalogKind
  readonly scope: CatalogScope
  readonly displayName: string
  readonly summary: string
  readonly publisher: string
  readonly verified: boolean
  readonly keywords: readonly string[]
  readonly capabilities: readonly CatalogCapability[]
  readonly icon: CatalogMedia | null
  readonly brandColor: string | null
  readonly compatibility: CatalogCompatibility
  readonly updatedAt: string
  readonly installed: boolean
}

/** Exact-version detail and activation evidence bound to one validated Bundle. */
export interface CatalogDetail {
  readonly summary: CatalogSummary
  readonly description: string
  readonly screenshots: readonly CatalogMedia[]
  readonly permissions: readonly string[]
  readonly riskLevel: CatalogRiskLevel
  readonly riskSummary: string
  readonly changelog: string
  readonly publishedAt: string
  readonly expectedEntries: readonly string[]
  readonly expectedClientModules: readonly string[]
  readonly expectedSkillIds: readonly string[]
  readonly eligible: boolean
  readonly withdrawn: boolean
}

/** Immutable registry payload stored only after complete boundary decoding. */
export interface CatalogSnapshot {
  readonly schemaVersion: 1
  readonly etag: string
  readonly generatedAt: string
  readonly maxAgeSeconds: number
  readonly sections: Readonly<Record<CatalogSection, readonly string[]>>
  readonly entries: readonly CatalogSummary[]
  readonly details: readonly CatalogDetail[]
  readonly preflights: readonly CatalogVersionPreflight[]
}

/** Renderer intent for a bounded list read. */
export interface CatalogListQuery {
  readonly catalogKind: CatalogKind
  readonly scope: CatalogScope
  readonly query: string
  readonly limit: number
}

/** Actionable context attached to one bounded catalog lookup. */
export type CatalogListNotice =
  | 'github-mapped'
  | 'github-partial'
  | 'github-source-only'
  | 'github-no-dsh-bundle'
  | 'network-unavailable'

/** Renderer intent for one exact detail read. */
export interface CatalogDetailQuery {
  readonly pluginId: string
  readonly version: string
}

/** Section rows returned to the renderer after trusted filtering. */
export interface CatalogListResult {
  readonly etag: string
  readonly generatedAt: string
  readonly freshness: CatalogFreshness
  readonly source: CatalogSource
  readonly sections: Readonly<Record<CatalogSection, readonly CatalogSummary[]>>
  readonly notice?: CatalogListNotice
}

/** Exact detail returned with the freshness of its owning snapshot. */
export interface CatalogDetailResult {
  readonly etag: string
  readonly generatedAt: string
  readonly freshness: CatalogFreshness
  readonly source: CatalogSource
  readonly detail: CatalogDetail | null
}

/** Actions for which one exact compatibility decision may grant authority. */
export const COMPATIBILITY_ACTIONS = ['install', 'update', 'enable', 'disable', 'uninstall'] as const
/** One closed Plugin Center mutation intent. */
export type CompatibilityAction = typeof COMPATIBILITY_ACTIONS[number]

/** Desktop targets supported by the first curated marketplace release. */
export const SUPPORTED_PLUGIN_PLATFORMS = ['darwin-arm64', 'win32-x64'] as const
/** One supported operating-system and architecture tuple. */
export type SupportedPluginPlatform = typeof SUPPORTED_PLUGIN_PLATFORMS[number]

/** Stable product order for metadata and action denials. */
export const COMPATIBILITY_REASON_ORDER = [
  'catalog-metadata-invalid',
  'catalog-unverified',
  'version-withdrawn',
  'version-ineligible',
  'protected-package',
  'protected-entry',
  'desktop-version-unsupported',
  'dsh-version-unsupported',
  'node-version-unsupported',
  'platform-unsupported',
  'artifact-missing',
  'artifact-evidence-incomplete',
  'plugin-identity-conflict',
  'package-identity-conflict',
  'entry-identity-conflict',
  'declared-conflict',
  'operation-busy',
  'action-not-supported',
] as const
/** One stable metadata or action denial code. */
export type CompatibilityReasonCode = typeof COMPATIBILITY_REASON_ORDER[number]

/** Stable product order for non-executing archive verification failures. */
export const ARTIFACT_VERIFICATION_REASON_ORDER = [
  'packed-size-exceeded',
  'packed-size-mismatch',
  'sha256-mismatch',
  'integrity-mismatch',
  'archive-format-invalid',
  'archive-path-traversal',
  'archive-absolute-path',
  'archive-unsafe-link',
  'archive-duplicate-entry',
  'archive-file-count-exceeded',
  'archive-unpacked-size-exceeded',
  'package-manifest-missing',
  'package-manifest-invalid',
  'package-name-mismatch',
  'package-version-mismatch',
  'bundle-patch-mismatch',
  'bundle-patch-missing',
  'lifecycle-script-denied',
  'expected-evidence-missing',
] as const
/** One stable artifact-verification failure code. */
export type ArtifactVerificationReasonCode = typeof ARTIFACT_VERIFICATION_REASON_ORDER[number]

/** Trusted catalog evidence for one platform-specific immutable archive. */
export interface CatalogArtifactEvidence {
  readonly platform: SupportedPluginPlatform
  readonly url: string
  readonly sha256: string
  readonly integrity: string
  readonly packedBytes: number
  readonly unpackedBytes: number
  readonly fileCount: number
}

/** Identities an exact reviewed version declares incompatible. */
export interface CatalogVersionConflicts {
  readonly pluginIds: readonly string[]
  readonly packageNames: readonly string[]
  readonly entryIds: readonly string[]
}

/** Trusted exact-version input owned by the decoded catalog, never the renderer. */
export interface CatalogVersionPreflight {
  readonly pluginId: string
  readonly version: string
  readonly packageName: string
  readonly catalogEtag: string
  readonly reviewed: boolean
  readonly eligible: boolean
  readonly withdrawn: boolean
  readonly desktopRange: string
  readonly dshRange: string
  readonly nodeRange: string
  readonly artifacts: readonly CatalogArtifactEvidence[]
  readonly bundlePatch: string
  readonly capabilities: readonly CatalogCapability[]
  readonly riskLevel: CatalogRiskLevel
  readonly riskSummary: string
  readonly executionAuthority: 'broad-application-authority'
  readonly conflicts: CatalogVersionConflicts
  readonly expectedEntries: readonly string[]
  readonly expectedClientModules: readonly string[]
  readonly expectedSkillIds: readonly string[]
  readonly supportedActions: readonly CompatibilityAction[]
  readonly restartRequired: boolean
}

/** Renderer-owned intent for one exact preflight check. */
export interface CompatibilityRequest {
  readonly pluginId: string
  readonly version: string
  readonly action: CompatibilityAction
}

/** One plugin identity observed from the selected Profile projection. */
export interface InstalledPluginIdentity {
  readonly pluginId: string | null
  readonly version: string
  readonly packageName: string
  readonly enabled: boolean
  readonly entryIds: readonly string[]
}

/** Origin of one installed Profile package or Bundle. */
export const INSTALLED_PLUGIN_SOURCES = ['system', 'catalog', 'local'] as const
/** Origin of one installed Profile package or Bundle. */
export type InstalledPluginSource = typeof INSTALLED_PLUGIN_SOURCES[number]

/** Joined package/composition/runtime state shown in the installed manager. */
export const INSTALLED_PLUGIN_RUNTIME_STATUSES = ['running', 'inactive', 'failed', 'unknown'] as const
/** Joined package/composition/runtime state shown in the installed manager. */
export type InstalledPluginRuntimeStatus = typeof INSTALLED_PLUGIN_RUNTIME_STATUSES[number]

/** One catalog-owned newer exact version available to an installed plugin. */
export interface InstalledPluginUpdate {
  readonly version: string
  readonly changelog: string
  readonly riskLevel: CatalogRiskLevel
  readonly riskSummary: string
}

/** One relative path a plugin declares below its own Desktop storage root. */
export interface InstalledPluginOwnedData {
  readonly path: string
  readonly label: string
}

/** Runtime evidence attributable to one installed Bundle. */
export interface InstalledPluginRuntimeProjection {
  readonly entries: readonly PluginRuntimeEntryEvidence[]
  readonly clientModules: readonly string[]
  readonly skillIds: readonly string[]
}

/** Rebuildable joined view of one installed system, catalog, or local Bundle. */
export interface InstalledPluginProjection {
  readonly pluginId: string | null
  readonly packageName: string
  readonly version: string | null
  readonly displayName: string
  readonly icon: CatalogMedia | null
  readonly brandColor: string | null
  readonly catalogKind: CatalogKind | null
  readonly source: InstalledPluginSource
  readonly protected: boolean
  readonly enabled: boolean
  readonly bundleOrder: number | null
  readonly disabledOrder: number | null
  readonly runtimeStatus: InstalledPluginRuntimeStatus
  readonly runtime: InstalledPluginRuntimeProjection
  readonly expectedEntries: readonly string[]
  readonly expectedClientModules: readonly string[]
  readonly expectedSkillIds: readonly string[]
  readonly compatibility: CatalogCompatibilityStatus
  readonly compatibilityReason: string | null
  readonly update: InstalledPluginUpdate | null
  readonly pendingAction: CompatibilityAction | null
  readonly supportedActions: readonly PluginManagementAction[]
  readonly configurationEntryIds: readonly string[]
  readonly ownedData: readonly InstalledPluginOwnedData[]
}

/** Renderer-safe installed projection for the selected Desktop Profile. */
export interface InstalledPluginListResult {
  readonly profileName: 'web'
  readonly profileRevision: number
  readonly catalogFreshness: CatalogFreshness
  readonly items: readonly InstalledPluginProjection[]
}

/** Immutable environment and Profile facts that scope one compatibility decision. */
export interface CompatibilityFingerprint {
  readonly desktopVersion: string
  readonly dshVersion: string
  readonly nodeVersion: string
  readonly platform: SupportedPluginPlatform
  readonly catalogEtag: string
  readonly catalogFreshness: CatalogFreshness
  readonly profileRevision: number
  readonly installedPlugins: readonly InstalledPluginIdentity[]
  readonly protectedPackageNames: readonly string[]
  readonly protectedEntryIds: readonly string[]
  readonly activeOperation: boolean
}

/** Stable denial fact localized only at the presentation boundary. */
export interface CompatibilityReason {
  readonly code: CompatibilityReasonCode
  readonly subject: string
  readonly actual: string | null
  readonly expected: string | null
}

/** Exact-action preflight result reused by presentation and later transactions. */
export interface CompatibilityDecision {
  readonly pluginId: string
  readonly version: string
  readonly action: CompatibilityAction
  readonly allowed: boolean
  readonly fingerprint: CompatibilityFingerprint
  readonly reasons: readonly CompatibilityReason[]
  readonly restartRequired: boolean
  readonly capabilities: readonly CatalogCapability[]
  readonly riskLevel: CatalogRiskLevel
  readonly riskSummary: string
  readonly executionAuthority: 'broad-application-authority'
}

/** Stable archive-verification fact without archive content or local paths. */
export interface ArtifactVerificationReason {
  readonly code: ArtifactVerificationReasonCode
  readonly subject: string
}

/** Result of reading an archive without importing or executing plugin code. */
export interface ArtifactVerificationResult {
  readonly verified: boolean
  readonly reasons: readonly ArtifactVerificationReason[]
  readonly observedPackageName: string | null
  readonly observedVersion: string | null
  readonly observedBundlePatch: string | null
  readonly entryCount: number
  readonly unpackedBytes: number
}

/** Ordered mutation phases before commit or recovery ownership. */
export const PLUGIN_MUTATION_PHASES = [
  'preflight',
  'downloading',
  'verifying-artifact',
  'snapshotting',
  'stopping-host',
  'installing',
  'validating-profile',
  'starting-host',
  'reloading',
  'health-checking',
  'verifying-runtime',
] as const
/** One pre-commit mutation phase. */
export type PluginMutationPhase = typeof PLUGIN_MUTATION_PHASES[number]

/** Idempotent recovery phases replayed before ordinary Host startup. */
export const PLUGIN_RECOVERY_PHASES = [
  'recovery-stopping-host',
  'recovery-restoring-profile',
  'recovery-restoring-packages',
  'recovery-starting-host',
  'recovery-verifying-runtime',
] as const
/** One durable recovery phase. */
export type PluginRecoveryPhase = typeof PLUGIN_RECOVERY_PHASES[number]

/** Ordered renderer phases of one mutation and any required recovery. */
export const PLUGIN_OPERATION_PHASES = [
  ...PLUGIN_MUTATION_PHASES,
  ...PLUGIN_RECOVERY_PHASES,
  'committed',
  'failed',
  'rolled-back',
  'recovery-failed',
] as const
/** One durable mutation or recovery phase. */
export type PluginOperationPhase = typeof PLUGIN_OPERATION_PHASES[number]

/** Closed failure vocabulary exposed to the renderer. */
export const PLUGIN_OPERATION_FAILURE_CODES = [
  'preflight-denied',
  'download-failed',
  'artifact-invalid',
  'profile-busy',
  'snapshot-failed',
  'package-mutation-failed',
  'profile-invalid',
  'host-restart-failed',
  'runtime-evidence-missing',
  'internal',
] as const
/** One terminal trusted-install failure. */
export type PluginOperationFailureCode = typeof PLUGIN_OPERATION_FAILURE_CODES[number]

/** Stable recovery failure vocabulary retained in logs and diagnostics. */
export const PLUGIN_RECOVERY_REASON_CODES = [
  'unsupported-journal-version',
  'journal-invalid',
  'snapshot-missing',
  'snapshot-invalid',
  'snapshot-root-mismatch',
  'snapshot-path-invalid',
  'snapshot-hash-mismatch',
  'profile-lock-busy',
  'host-stop-failed',
  'profile-restore-failed',
  'package-restore-failed',
  'host-start-failed',
  'runtime-verification-failed',
  'diagnostic-export-failed',
] as const
/** One stable reason why recovery cannot currently complete. */
export type PluginRecoveryReasonCode = typeof PLUGIN_RECOVERY_REASON_CODES[number]

/** Durable completion states accepted by the transaction journal. */
export const PLUGIN_OPERATION_TERMINAL_RESULTS = [
  'committed',
  'rolled-back',
  'recovery-failed',
] as const
/** One durable completion result. */
export type PluginOperationTerminalResult = typeof PLUGIN_OPERATION_TERMINAL_RESULTS[number]

/** Persistence point recorded around one transaction side effect. */
export const PLUGIN_OPERATION_BOUNDARIES = [
  'before-side-effect',
  'after-side-effect',
  'observation',
] as const
/** One durable side-effect boundary. */
export type PluginOperationBoundary = typeof PLUGIN_OPERATION_BOUNDARIES[number]

/** Renderer-owned intent for one reviewed exact-version installation. */
export interface PluginInstallRequest {
  readonly pluginId: string
  readonly version: string
  readonly idempotencyKey: string
}

/** Installed-item actions accepted by the single Profile operation owner. */
export const PLUGIN_MANAGEMENT_ACTIONS = ['update', 'enable', 'disable', 'uninstall'] as const
/** Installed-item actions accepted by the single Profile operation owner. */
export type PluginManagementAction = typeof PLUGIN_MANAGEMENT_ACTIONS[number]

/** Renderer intent for one exact installed-item action. */
export interface PluginManagementRequest {
  readonly pluginId: string
  readonly version: string
  readonly action: PluginManagementAction
  readonly idempotencyKey: string
}

/** Internal normalized mutation request consumed by the shared transaction runner. */
export interface PluginMutationRequest {
  readonly pluginId: string
  readonly version: string
  readonly action: CompatibilityAction
  readonly idempotencyKey: string
}

/** Separately confirmed deletion after an uninstall has already committed. */
export interface PluginOwnedDataRemovalRequest {
  readonly operationId: string
  readonly pluginId: string
  readonly paths: readonly string[]
  readonly confirmation: 'remove-owned-data'
}

/** Bounded result of deleting only approved plugin-owned relative paths. */
export interface PluginOwnedDataRemovalResult {
  readonly operationId: string
  readonly pluginId: string
  readonly removedPaths: readonly string[]
}

/** Durable post-reload offer derived from one committed uninstall authority record. */
export interface PluginOwnedDataOffer {
  readonly operationId: string
  readonly pluginId: string
  readonly packageName: string
  readonly version: string
  readonly declarations: readonly InstalledPluginOwnedData[]
}

/** Explicit decision to retain all remaining owned data and close the uninstall offer. */
export interface PluginOwnedDataRetentionRequest {
  readonly operationId: string
  readonly pluginId: string
  readonly confirmation: 'retain-owned-data'
}

/** Renderer-safe acknowledgement that the retain decision is durable. */
export interface PluginOwnedDataRetentionResult {
  readonly operationId: string
  readonly pluginId: string
  readonly retained: true
}

/** Immutable renderer-safe view of one trusted installation. */
export interface PluginOperationSnapshot {
  readonly schemaVersion: 1
  readonly operationId: string
  readonly idempotencyKey: string
  readonly profileName: 'web'
  readonly action: CompatibilityAction
  readonly pluginId: string
  readonly version: string
  readonly phase: PluginOperationPhase
  readonly startedAt: string
  readonly updatedAt: string
  readonly hostGeneration: number | null
  readonly failureCode: PluginOperationFailureCode | null
}

/** Result of attempting to start or join the single Profile operation. */
export type PluginOperationStartResult =
  | { readonly kind: 'started' | 'joined'; readonly operation: PluginOperationSnapshot }
  | { readonly kind: 'busy'; readonly activeOperationId: string }

/** Hash-bound identity of the only Profile F005 may restore. */
export interface PluginProfileIdentity {
  readonly profileName: 'web'
  readonly rootSha256: string
}

/** One Loader entry retained as prior or target runtime evidence. */
export interface PluginRuntimeEntryEvidence {
  readonly entryId: string
  readonly enabled: boolean
  readonly fiberPhase: string | null
}

/** Exact Host, client, and Skill inventory accepted at a commit point. */
export interface PluginRuntimeEvidence {
  readonly entries: readonly PluginRuntimeEntryEvidence[]
  readonly clientModules: readonly string[]
  readonly skillIds: readonly string[]
}

/** Immutable header that owns one mutation across execution and recovery. */
export interface PluginOperationHeader {
  readonly operationId: string
  readonly idempotencyKey: string
  readonly profileIdentity: PluginProfileIdentity
  readonly action: CompatibilityAction
  readonly pluginId: string
  readonly version: string
  readonly startedAt: string
}

/** Private snapshot reference and the old runtime state it must reproduce. */
export interface PluginPriorSnapshotReference {
  readonly snapshotId: string
  readonly snapshotSha256: string
  readonly runtimeEvidence: PluginRuntimeEvidence
}

/** Append-only evidence for one persisted phase boundary. */
export interface PluginOperationPhaseEntry {
  readonly sequence: number
  readonly phase: PluginOperationPhase
  readonly boundary: PluginOperationBoundary
  readonly at: string
  readonly operationFailureCode: PluginOperationFailureCode | null
  readonly recoveryReasonCode: PluginRecoveryReasonCode | null
}

/** Explicit acceptance marker written only after target runtime verification. */
export interface PluginOperationCommitMarker {
  readonly committedAt: string
  readonly fingerprintSha256: string
  readonly runtimeEvidence: PluginRuntimeEvidence
}

/** Versioned durable mutation record; absence of a commit marker requires recovery. */
export interface PluginTransactionJournalRecord {
  readonly schemaVersion: 2
  readonly header: PluginOperationHeader
  readonly operation: PluginOperationSnapshot
  readonly priorFingerprint: CompatibilityFingerprint | null
  readonly priorSnapshot: PluginPriorSnapshotReference | null
  readonly phaseHistory: readonly PluginOperationPhaseEntry[]
  readonly commitMarker: PluginOperationCommitMarker | null
  readonly terminalResult: PluginOperationTerminalResult | null
  readonly recoveryAttempt: number
  readonly recoveryReasonCode: PluginRecoveryReasonCode | null
}

/** Renderer-safe recovery state, separate from private snapshot contents. */
export interface PluginRecoverySnapshot {
  readonly schemaVersion: 1
  readonly operationId: string
  readonly phase: 'recovering' | 'rolled-back' | 'recovery-failed'
  readonly recoveryPhase: PluginRecoveryPhase | null
  readonly operationFailureCode: PluginOperationFailureCode
  readonly recoveryReasonCode: PluginRecoveryReasonCode | null
  readonly attempt: number
  readonly updatedAt: string
  readonly canRetry: boolean
  readonly canExportDiagnostics: boolean
}

/** Idempotent renderer intent to retry the same owned recovery. */
export interface PluginRecoveryRetryRequest {
  readonly operationId: string
}

/** Idempotent renderer intent to export bounded diagnostics for one operation. */
export interface PluginDiagnosticExportRequest {
  readonly operationId: string
}

/** Renderer result for a Desktop-owned diagnostic save operation. */
export interface PluginDiagnosticExportResult {
  readonly operationId: string
  readonly status: 'saved' | 'cancelled'
  readonly filename: string | null
  readonly sha256: string | null
  readonly bytes: number | null
}

/** Whitelisted diagnostic document; unreadable journals expose no guessed operation metadata. */
export type PluginRecoveryDiagnostic =
  | {
    readonly schemaVersion: 1
    readonly journalStatus: 'readable'
    readonly operationId: string
    readonly profileName: 'web'
    readonly action: CompatibilityAction
    readonly pluginId: string
    readonly version: string
    readonly phaseHistory: readonly PluginOperationPhaseEntry[]
    readonly terminalResult: PluginOperationTerminalResult | null
    readonly recoveryAttempt: number
    readonly recoveryReasonCode: PluginRecoveryReasonCode | null
    readonly exportedAt: string
  }
  | {
    readonly schemaVersion: 1
    readonly journalStatus: 'unreadable'
    readonly operationId: string
    readonly profileName: null
    readonly action: null
    readonly pluginId: null
    readonly version: null
    readonly phaseHistory: readonly []
    readonly terminalResult: 'recovery-failed'
    readonly recoveryAttempt: 1
    readonly recoveryReasonCode: 'unsupported-journal-version' | 'journal-invalid'
    readonly exportedAt: string
  }

/** Review states owned by the production Registry for one exact immutable version. */
export const REGISTRY_MODERATION_STATES = ['pending-review', 'approved', 'rejected', 'withdrawn'] as const
/** Review state owned by the production Registry. */
export type RegistryModerationState = typeof REGISTRY_MODERATION_STATES[number]

/** Attributable decisions accepted by the internal Registry API. */
export const REGISTRY_MODERATION_ACTIONS = ['approve', 'reject', 'withdraw'] as const
/** One internal decision that may change exact-version eligibility. */
export type RegistryModerationAction = typeof REGISTRY_MODERATION_ACTIONS[number]

/** Closed result values accepted by privacy-limited installation telemetry. */
export const REGISTRY_INSTALL_RESULTS = ['success', 'rollback', 'install-failure', 'activation-failure'] as const
/** One coarse local operation result; it never grants installation authority. */
export type RegistryInstallResult = typeof REGISTRY_INSTALL_RESULTS[number]

/** Closed reasons retained with privacy-limited installation telemetry. */
export const REGISTRY_INSTALL_REASONS = [
  'none',
  'compatibility-denied',
  'artifact-invalid',
  'package-mutation-failed',
  'runtime-evidence-missing',
  'recovery-failed',
  'operator-test',
  'anomaly',
] as const
/** One coarse operation reason accepted by the Registry. */
export type RegistryInstallReason = typeof REGISTRY_INSTALL_REASONS[number]

/** Closed duration buckets retained without precise local timing. */
export const REGISTRY_DURATION_BUCKETS = ['lt-5s', '5s-30s', '30s-2m', '2m-10m', 'gte-10m'] as const
/** One coarse operation duration bucket. */
export type RegistryDurationBucket = typeof REGISTRY_DURATION_BUCKETS[number]

/** Stable exclusion facts stored with one auditable popularity row. */
export const REGISTRY_RANK_EXCLUSION_REASONS = [
  'ineligible',
  'withdrawn',
  'operator-test-only',
  'anomaly-only',
] as const
/** One reason an exact version cannot contribute a positive popularity input. */
export type RegistryRankExclusionReason = typeof REGISTRY_RANK_EXCLUSION_REASONS[number]

/** Trusted object-store identity for one platform archive supplied to internal import. */
export interface RegistryArtifactObject {
  readonly platform: SupportedPluginPlatform
  readonly objectKey: string
}

/** Authenticated intent to import one exact version into pending review. */
export interface RegistryVersionImportRequest {
  readonly schemaVersion: 1
  readonly requestId: string
  readonly operatorId: string
  readonly reason: string
  readonly evidenceRef: string
  readonly occurredAt: string
  readonly publisher: {
    readonly publisherId: string
    readonly displayName: string
  }
  readonly detail: CatalogDetail
  readonly preflight: CatalogVersionPreflight
  readonly categoryIds: readonly string[]
  readonly artifactObjects: readonly RegistryArtifactObject[]
}

/** Authenticated eligibility decision for one imported exact version. */
export interface RegistryModerationRequest {
  readonly requestId: string
  readonly operatorId: string
  readonly pluginId: string
  readonly version: string
  readonly action: RegistryModerationAction
  readonly reason: string
  readonly evidenceRef: string
  readonly occurredAt: string
}

/** Authenticated editorial placement with a deterministic position and time window. */
export interface RegistryFeaturedPlacementRequest {
  readonly requestId: string
  readonly operatorId: string
  readonly pluginId: string
  readonly version: string
  readonly section: 'featured'
  readonly position: number
  readonly startsAt: string
  readonly endsAt: string | null
  readonly reason: string
}

/** Authenticated or scheduled intent to generate one complete popularity snapshot. */
export interface RegistryRankingRequest {
  readonly requestId: string
  readonly operatorId: string
  readonly reason: string
  readonly occurredAt: string
}

/** Strict replay-safe installation event accepted by the public Registry API. */
export interface RegistryInstallEvent {
  readonly schemaVersion: 1
  readonly eventId: string
  readonly pluginId: string
  readonly version: string
  readonly installationId: string
  readonly platform: SupportedPluginPlatform
  readonly desktopVersion: string
  readonly dshVersion: string
  readonly result: RegistryInstallResult
  readonly reason: RegistryInstallReason
  readonly durationBucket: RegistryDurationBucket
  readonly occurredAt: string
  readonly operatorTest: boolean
}

/** Frozen inputs retained for the first production popularity formula. */
export interface RegistryRankInputs {
  readonly uniqueSuccess7d: number
  readonly uniqueSuccess24h: number
  readonly previousSuccess7d: number
  readonly attempt7d: number
  readonly rollbackOrActivationFailure7d: number
  readonly ageInDays: number
}

/** Immutable auditable score row stored with one popularity generation. */
export interface RegistryRankAudit {
  readonly pluginId: string
  readonly version: string
  readonly formulaVersion: 'popular-v1'
  readonly generatedAt: string
  readonly inputs: RegistryRankInputs
  readonly growth: number
  readonly failureRate: number
  readonly freshness: number
  readonly score: number
  readonly exclusionReasons: readonly RegistryRankExclusionReason[]
  readonly position: number | null
}

/** Public exact-version response without any local Desktop state. */
export interface RegistryVersionResult {
  readonly moderationState: RegistryModerationState
  readonly installable: boolean
  readonly detail: CatalogDetail
  readonly preflight: CatalogVersionPreflight
}

/** Secret-free deployment health response. */
export interface RegistryHealthResult {
  readonly status: 'ok' | 'degraded'
  readonly database: 'ready' | 'unavailable'
  readonly currentCatalog: boolean
}

/** Stable successful outcomes returned by authenticated Registry operations. */
export const REGISTRY_OPERATION_CODES = [
  'version-imported',
  'version-approved',
  'version-rejected',
  'version-withdrawn',
  'featured-placement-set',
  'ranking-generated',
] as const
/** One stable authenticated-operation outcome. */
export type RegistryOperationCode = typeof REGISTRY_OPERATION_CODES[number]

/** Bounded successful result returned by an internal Registry operation. */
export interface RegistryOperationResult {
  readonly requestId: string
  readonly code: RegistryOperationCode
  readonly pluginId: string | null
  readonly version: string | null
}

/** Stable failure codes returned without raw dependency details. */
export const REGISTRY_ERROR_CODES = [
  'invalid-request',
  'unauthorized',
  'not-found',
  'immutable-conflict',
  'artifact-invalid',
  'moderation-conflict',
  'placement-conflict',
  'dependency-unavailable',
  'internal',
] as const
/** One stable Registry failure code. */
export type RegistryErrorCode = typeof REGISTRY_ERROR_CODES[number]

/** Bounded failure response whose message contains no secret or local path. */
export interface RegistryErrorResult {
  readonly error: {
    readonly code: RegistryErrorCode
    readonly message: string
    readonly requestId: string
  }
}

/** Server-owned order for the public Preset Square. */
export const PRESET_SQUARE_SORTS = ['downloads', 'newest'] as const
/** Server-owned order for the public Preset Square. */
export type PresetSquareSort = typeof PRESET_SQUARE_SORTS[number]

/** Catalog provenance shown independently from local Preset trust. */
export const PRESET_SQUARE_SOURCES = ['fufan-official', 'community'] as const
/** Catalog provenance shown independently from local Preset trust. */
export type PresetSquareSource = typeof PRESET_SQUARE_SOURCES[number]

/** Immutable `.dshpreset` evidence published with one square entry. */
export interface PresetSquareArtifact {
  readonly downloadUrl: string
  readonly sha256: string
  readonly sizeBytes: number
  readonly formatVersion: 1
  readonly sourceDshVersion: string
}

/** One public Preset Square entry after strict boundary decoding. */
export interface PresetSquareItem {
  readonly id: string
  readonly slug: string
  readonly presetId: string
  readonly title: string
  readonly description: string
  readonly source: PresetSquareSource
  readonly publisher: { readonly username: string }
  readonly artifact: PresetSquareArtifact
  readonly detailUrl: string
  readonly downloadCount: number
  readonly visualVariant: number
  readonly createdAt: string
}

/** Closed renderer intent for a square list. Search is applied locally to the complete public list. */
export interface PresetSquareListQuery {
  readonly query: string
  readonly sort: PresetSquareSort
}

/** Strict public API list payload. */
export interface PresetSquareListResponse {
  readonly items: readonly PresetSquareItem[]
  readonly total: number
  readonly sort: PresetSquareSort
}

/** Renderer-safe square list with the Desktop fetch time. */
export interface PresetSquareListResult {
  readonly items: readonly PresetSquareItem[]
  readonly total: number
  readonly sort: PresetSquareSort
  readonly fetchedAt: string
}

/** Closed renderer intent for one public square detail. */
export interface PresetSquareDetailQuery {
  readonly slug: string
}

/** Renderer-safe detail result. */
export interface PresetSquareDetailResult {
  readonly item: PresetSquareItem | null
  readonly fetchedAt: string
}

/** Warnings found while previewing executable Preset configuration. */
export const PRESET_ARCHIVE_WARNINGS = ['absolute-paths', 'possible-secrets', 'version-mismatch'] as const
/** Warning found while previewing executable Preset configuration. */
export type PresetArchiveWarning = typeof PRESET_ARCHIVE_WARNINGS[number]

/** Closed request for an install preview; null selects the manifest id. */
export interface PresetInstallPreviewRequest {
  readonly slug: string
  readonly targetId: string | null
}

/** Validated archive preview enriched with its trusted square identity. */
export interface PresetInstallPreviewResult {
  readonly slug: string
  readonly title: string
  readonly targetId: string
  readonly sourcePresetId: string
  readonly name: string | null
  readonly description: string | null
  readonly sourceDshVersion: string | null
  readonly fileCount: number
  readonly warnings: readonly PresetArchiveWarning[]
  readonly conflict: boolean
}

/** Closed confirmation for one already-previewed square entry and target id. */
export interface PresetInstallRequest {
  readonly slug: string
  readonly targetId: string
}

/** Successful atomic installation result. */
export interface PresetInstallResult extends PresetInstallPreviewResult {
  readonly installed: true
}

/** Presets whose external runtime is installed and verified by Desktop. */
export const MANAGED_PRESET_RUNTIME_IDS = ['product-video-director', 'ai-report-analyst'] as const
/** Preset whose external runtime is installed and verified by Desktop. */
export type ManagedPresetRuntimeId = typeof MANAGED_PRESET_RUNTIME_IDS[number]

/** Stable dependency ids rendered with client-owned localized labels. */
export const PRESET_RUNTIME_DEPENDENCY_IDS = [
  'node', 'hyperframes', 'ffmpeg', 'ffprobe', 'python', 'openpyxl', 'echarts', 'playwright', 'chromium',
] as const
/** One external runtime dependency known to Desktop. */
export type PresetRuntimeDependencyId = typeof PRESET_RUNTIME_DEPENDENCY_IDS[number]

/** Lifecycle of one dependency in the Desktop-owned runtime operation. */
export type PresetRuntimeDependencyState = 'ready' | 'missing' | 'installing' | 'failed'

/** Renderer-safe evidence for one Preset runtime dependency. */
export interface PresetRuntimeDependency {
  readonly id: PresetRuntimeDependencyId
  readonly state: PresetRuntimeDependencyState
  readonly installable: boolean
  readonly version: string | null
}

/** Aggregate state of one managed Preset runtime. */
export type PresetRuntimePhase = 'checking' | 'ready' | 'missing' | 'installing' | 'failed'

/** Monotonic Desktop-owned snapshot for one managed Preset runtime. */
export interface PresetRuntimeSnapshot {
  readonly presetId: ManagedPresetRuntimeId
  readonly phase: PresetRuntimePhase
  readonly dependencies: readonly PresetRuntimeDependency[]
  readonly canInstall: boolean
  readonly revision: number
  readonly updatedAt: string
}

/** Closed renderer request for checking or installing one managed runtime. */
export interface PresetRuntimeRequest {
  readonly presetId: ManagedPresetRuntimeId
}

const ID = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/u
const VERSION = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/u
const PLATFORM = /^(?:darwin|win32)-(?:arm64|x64)$/u
const PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/u
const SHA256 = /^[0-9a-f]{64}$/u
const SHA512_INTEGRITY = /^sha512-[A-Za-z0-9+/]{86}==$/u
const COLOR = /^#[0-9a-fA-F]{6}$/u
const IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u
const MEDIA_ORIGINS = new Set([
  'https://avatars.githubusercontent.com',
  'https://cdn.deepseek.com',
  'https://raw.githubusercontent.com',
  'https://static.deepseek.com',
])
const KINDS = ['plugin', 'skill-pack'] as const
const SCOPES = ['public', 'local'] as const
const CAPABILITIES = [
  'host', 'client', 'agent', 'tool', 'model-provider', 'skill', 'network', 'filesystem', 'subprocess',
] as const
const COMPATIBILITY = ['compatible', 'incompatible', 'unknown'] as const
const FRESHNESS = ['fresh', 'cached', 'stale'] as const
const RISKS = ['low', 'medium', 'high'] as const
const SECTIONS = ['featured', 'popular', 'recent'] as const
const ARTIFACT_ORIGINS = new Set([
  'https://cdn.deepseek.com',
  'https://github.com',
  'https://objects.githubusercontent.com',
  'https://registry.npmjs.org',
  'https://static.deepseek.com',
])
const OPERATION_PHASES = PLUGIN_OPERATION_PHASES
const OPERATION_FAILURE_CODES = PLUGIN_OPERATION_FAILURE_CODES
const RECOVERY_PHASES = PLUGIN_RECOVERY_PHASES
const RECOVERY_REASON_CODES = PLUGIN_RECOVERY_REASON_CODES
const OPERATION_TERMINAL_RESULTS = PLUGIN_OPERATION_TERMINAL_RESULTS
const OPERATION_BOUNDARIES = PLUGIN_OPERATION_BOUNDARIES
const INSTALLED_SOURCES = INSTALLED_PLUGIN_SOURCES
const INSTALLED_RUNTIME_STATUSES = INSTALLED_PLUGIN_RUNTIME_STATUSES
const MANAGEMENT_ACTIONS = PLUGIN_MANAGEMENT_ACTIONS
const REGISTRY_STATES = REGISTRY_MODERATION_STATES
const REGISTRY_ACTIONS = REGISTRY_MODERATION_ACTIONS
const REGISTRY_RESULTS = REGISTRY_INSTALL_RESULTS
const REGISTRY_REASONS = REGISTRY_INSTALL_REASONS
const REGISTRY_DURATION = REGISTRY_DURATION_BUCKETS
const RANK_EXCLUSIONS = REGISTRY_RANK_EXCLUSION_REASONS
const REGISTRY_OPERATIONS = REGISTRY_OPERATION_CODES
const REGISTRY_ERRORS = REGISTRY_ERROR_CODES
const INSTALLATION_ID = /^[0-9a-f]{32,64}$/u
const OBJECT_KEY_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u
const PRESET_SQUARE_ORIGIN = 'https://www.dshdesktop.com'
const PRESET_SQUARE_PATH_PREFIX = '/preset/'
const PRESET_SORTS = PRESET_SQUARE_SORTS
const PRESET_WARNINGS = PRESET_ARCHIVE_WARNINGS

/** Error raised when untrusted catalog JSON violates the closed contract. */
export class CatalogContractError extends Error {
  override readonly name = 'CatalogContractError'
}

function fail(path: string, expectation: string): never {
  throw new CatalogContractError(`${path} ${expectation}`)
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return fail(path, 'must be an object')
  return value as Record<string, unknown>
}

function exact(value: Record<string, unknown>, path: string, keys: readonly string[]): void {
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    fail(path, `must contain exactly: ${expected.join(', ')}`)
  }
}

function string(value: unknown, path: string, max: number, allowEmpty = false): string {
  if (typeof value !== 'string' || value.length > max || (!allowEmpty && value.length === 0) || value.trim() !== value) {
    return fail(path, `must be a trimmed string of at most ${String(max)} characters`)
  }
  return value
}

function boolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') return fail(path, 'must be a boolean')
  return value
}

function integer(value: unknown, path: string, min: number, max: number): number {
  if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) {
    return fail(path, `must be an integer from ${String(min)} to ${String(max)}`)
  }
  return value as number
}

function finiteNumber(value: unknown, path: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    return fail(path, `must be a finite number from ${String(min)} to ${String(max)}`)
  }
  return value
}

function enumeration<const T extends string>(value: unknown, path: string, values: readonly T[]): T {
  if (typeof value !== 'string' || !values.includes(value as T)) return fail(path, `must be one of: ${values.join(', ')}`)
  return value as T
}

function array<T>(value: unknown, path: string, max: number, decode: (item: unknown, path: string) => T): readonly T[] {
  if (!Array.isArray(value) || value.length > max) return fail(path, `must be an array of at most ${String(max)} items`)
  return value.map((item, index) => decode(item, `${path}[${String(index)}]`))
}

function unique<T extends string>(values: readonly T[], path: string): readonly T[] {
  if (new Set(values).size !== values.length) return fail(path, 'must not contain duplicates')
  return values
}

function id(value: unknown, path: string): string {
  const decoded = string(value, path, 128)
  if (!ID.test(decoded)) return fail(path, 'must be a stable lowercase id')
  return decoded
}

function version(value: unknown, path: string): string {
  const decoded = string(value, path, 64)
  if (!VERSION.test(decoded)) return fail(path, 'must be an exact semantic version')
  return decoded
}

function sha256(value: unknown, path: string): string {
  const decoded = string(value, path, 64)
  if (!SHA256.test(decoded)) return fail(path, 'must be a lowercase SHA-256 digest')
  return decoded
}

function packageIdentity(value: unknown, path: string): string {
  const decoded = string(value, path, 214)
  if (!PACKAGE_NAME.test(decoded)) return fail(path, 'must be a lowercase npm package name')
  return decoded
}

function semanticRange(value: unknown, path: string): string {
  return string(value, path, 160)
}

function bundlePatchPath(value: unknown, path: string): string {
  const decoded = string(value, path, 256)
  if (decoded.startsWith('/') || decoded.startsWith('\\') || /^[A-Za-z]:/u.test(decoded) || decoded.includes('\\')) {
    return fail(path, 'must be a portable relative Bundle patch path')
  }
  const normalized = decoded.startsWith('./') ? decoded.slice(2) : decoded
  if (normalized === '' || normalized.split('/').some(segment => segment === '' || segment === '.' || segment === '..')) {
    return fail(path, 'must be a portable relative Bundle patch path')
  }
  return decoded
}

function ownedDataPath(value: unknown, path: string): string {
  const decoded = string(value, path, 256)
  if (decoded.startsWith('/') || decoded.startsWith('\\') || /^[A-Za-z]:/u.test(decoded) || decoded.includes('\\')) {
    return fail(path, 'must be a portable relative owned-data path')
  }
  if (decoded.split('/').some(segment => segment === '' || segment === '.' || segment === '..')) {
    return fail(path, 'must be a portable relative owned-data path')
  }
  return decoded
}

function objectKey(value: unknown, path: string): string {
  const decoded = string(value, path, 512)
  if (decoded.startsWith('/') || decoded.startsWith('.') || decoded.includes('\\')) {
    return fail(path, 'must be a portable relative object key')
  }
  if (decoded.split('/').some(segment => !OBJECT_KEY_SEGMENT.test(segment))) {
    return fail(path, 'must contain only stable object-key segments')
  }
  return decoded
}

function artifactUrl(value: unknown, path: string): string {
  const decoded = string(value, path, 2048)
  let parsed: URL
  try { parsed = new URL(decoded) } catch { return fail(path, 'must be an absolute URL') }
  if (parsed.protocol !== 'https:' || parsed.username !== '' || parsed.password !== '' || parsed.hash !== ''
    || !ARTIFACT_ORIGINS.has(parsed.origin)) {
    return fail(path, 'must use an approved HTTPS artifact origin')
  }
  return decoded
}

function presetSquareUrl(value: unknown, path: string): string {
  const decoded = string(value, path, 2048)
  let parsed: URL
  try { parsed = new URL(decoded) } catch { return fail(path, 'must be an absolute URL') }
  if (parsed.protocol !== 'https:' || parsed.username !== '' || parsed.password !== '' || parsed.hash !== ''
    || parsed.origin !== PRESET_SQUARE_ORIGIN || !parsed.pathname.startsWith(PRESET_SQUARE_PATH_PREFIX)) {
    return fail(path, 'must use the fixed Preset Square HTTPS origin')
  }
  return decoded
}

function nullableString(value: unknown, path: string, max = 256): string | null {
  return value === null ? null : string(value, path, max, true)
}

function instant(value: unknown, path: string): string {
  const decoded = string(value, path, 40)
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(decoded)
    || !Number.isFinite(Date.parse(decoded)) || new Date(decoded).toISOString() !== decoded) {
    return fail(path, 'must be a canonical RFC 3339 UTC instant')
  }
  return decoded
}

function media(value: unknown, path: string): CatalogMedia {
  const source = record(value, path)
  exact(source, path, ['url', 'alt', 'width', 'height'])
  const url = string(source['url'], `${path}.url`, 2048)
  let parsed: URL
  try { parsed = new URL(url) } catch { return fail(`${path}.url`, 'must be an absolute URL') }
  if (parsed.protocol !== 'https:' || !MEDIA_ORIGINS.has(parsed.origin)) {
    return fail(`${path}.url`, 'must use an approved HTTPS media origin')
  }
  return {
    url,
    alt: string(source['alt'], `${path}.alt`, 200, true),
    width: integer(source['width'], `${path}.width`, 1, 4096),
    height: integer(source['height'], `${path}.height`, 1, 4096),
  }
}

function compatibility(value: unknown, path: string): CatalogCompatibility {
  const source = record(value, path)
  exact(source, path, ['status', 'reason', 'platforms'])
  const reasonValue = source['reason']
  const reason = reasonValue === null ? null : string(reasonValue, `${path}.reason`, 240)
  const platforms = unique(array(source['platforms'], `${path}.platforms`, 8, (item, itemPath) => {
    const decoded = string(item, itemPath, 32)
    if (!PLATFORM.test(decoded)) return fail(itemPath, 'must be a supported platform tuple')
    return decoded
  }), `${path}.platforms`)
  return { status: enumeration(source['status'], `${path}.status`, COMPATIBILITY), reason, platforms }
}

function summary(value: unknown, path: string): CatalogSummary {
  const source = record(value, path)
  exact(source, path, [
    'pluginId', 'version', 'catalogKind', 'scope', 'displayName', 'summary', 'publisher', 'verified',
    'keywords', 'capabilities', 'icon', 'brandColor', 'compatibility', 'updatedAt', 'installed',
  ])
  const catalogKind = enumeration(source['catalogKind'], `${path}.catalogKind`, KINDS)
  const capabilities = unique(array(source['capabilities'], `${path}.capabilities`, CAPABILITIES.length,
    (item, itemPath) => enumeration(item, itemPath, CAPABILITIES)), `${path}.capabilities`)
  if (catalogKind === 'skill-pack' && !capabilities.includes('skill')) {
    fail(`${path}.capabilities`, 'must include skill for a skill-pack')
  }
  const brand = source['brandColor']
  if (brand !== null && (typeof brand !== 'string' || !COLOR.test(brand))) {
    fail(`${path}.brandColor`, 'must be null or a six-digit hex color')
  }
  return {
    pluginId: id(source['pluginId'], `${path}.pluginId`),
    version: version(source['version'], `${path}.version`),
    catalogKind,
    scope: enumeration(source['scope'], `${path}.scope`, SCOPES),
    displayName: string(source['displayName'], `${path}.displayName`, 120),
    summary: string(source['summary'], `${path}.summary`, 280),
    publisher: string(source['publisher'], `${path}.publisher`, 120),
    verified: boolean(source['verified'], `${path}.verified`),
    keywords: unique(array(source['keywords'], `${path}.keywords`, 24,
      (item, itemPath) => string(item, itemPath, 48)), `${path}.keywords`),
    capabilities,
    icon: source['icon'] === null ? null : media(source['icon'], `${path}.icon`),
    brandColor: brand,
    compatibility: compatibility(source['compatibility'], `${path}.compatibility`),
    updatedAt: instant(source['updatedAt'], `${path}.updatedAt`),
    installed: boolean(source['installed'], `${path}.installed`),
  }
}

function detail(value: unknown, path: string): CatalogDetail {
  const source = record(value, path)
  exact(source, path, [
    'summary', 'description', 'screenshots', 'permissions', 'riskLevel', 'riskSummary', 'changelog',
    'publishedAt', 'expectedEntries', 'expectedClientModules', 'expectedSkillIds', 'eligible', 'withdrawn',
  ])
  return {
    summary: summary(source['summary'], `${path}.summary`),
    description: string(source['description'], `${path}.description`, 12_000),
    screenshots: array(source['screenshots'], `${path}.screenshots`, 8, media),
    permissions: unique(array(source['permissions'], `${path}.permissions`, 32,
      (item, itemPath) => string(item, itemPath, 160)), `${path}.permissions`),
    riskLevel: enumeration(source['riskLevel'], `${path}.riskLevel`, RISKS),
    riskSummary: string(source['riskSummary'], `${path}.riskSummary`, 600),
    changelog: string(source['changelog'], `${path}.changelog`, 4_000),
    publishedAt: instant(source['publishedAt'], `${path}.publishedAt`),
    expectedEntries: unique(array(source['expectedEntries'], `${path}.expectedEntries`, 64, id), `${path}.expectedEntries`),
    expectedClientModules: unique(array(source['expectedClientModules'], `${path}.expectedClientModules`, 64,
      (item, itemPath) => string(item, itemPath, 214)), `${path}.expectedClientModules`),
    expectedSkillIds: unique(array(source['expectedSkillIds'], `${path}.expectedSkillIds`, 64, id), `${path}.expectedSkillIds`),
    eligible: boolean(source['eligible'], `${path}.eligible`),
    withdrawn: boolean(source['withdrawn'], `${path}.withdrawn`),
  }
}

function artifactEvidence(value: unknown, path: string): CatalogArtifactEvidence {
  const source = record(value, path)
  exact(source, path, ['platform', 'url', 'sha256', 'integrity', 'packedBytes', 'unpackedBytes', 'fileCount'])
  const sha256 = string(source['sha256'], `${path}.sha256`, 64)
  if (!SHA256.test(sha256)) fail(`${path}.sha256`, 'must be a lowercase SHA-256 digest')
  const integrity = string(source['integrity'], `${path}.integrity`, 96)
  if (!SHA512_INTEGRITY.test(integrity)) fail(`${path}.integrity`, 'must be a SHA-512 integrity value')
  return {
    platform: enumeration(source['platform'], `${path}.platform`, SUPPORTED_PLUGIN_PLATFORMS),
    url: artifactUrl(source['url'], `${path}.url`),
    sha256,
    integrity,
    packedBytes: integer(source['packedBytes'], `${path}.packedBytes`, 1, 536_870_912),
    unpackedBytes: integer(source['unpackedBytes'], `${path}.unpackedBytes`, 1, 2_147_483_647),
    fileCount: integer(source['fileCount'], `${path}.fileCount`, 1, 100_000),
  }
}

function versionConflicts(value: unknown, path: string): CatalogVersionConflicts {
  const source = record(value, path)
  exact(source, path, ['pluginIds', 'packageNames', 'entryIds'])
  return {
    pluginIds: unique(array(source['pluginIds'], `${path}.pluginIds`, 128, id), `${path}.pluginIds`),
    packageNames: unique(array(source['packageNames'], `${path}.packageNames`, 128, packageIdentity), `${path}.packageNames`),
    entryIds: unique(array(source['entryIds'], `${path}.entryIds`, 256, id), `${path}.entryIds`),
  }
}

function installedPlugin(value: unknown, path: string): InstalledPluginIdentity {
  const source = record(value, path)
  exact(source, path, ['pluginId', 'version', 'packageName', 'enabled', 'entryIds'])
  const pluginId = source['pluginId']
  return {
    pluginId: pluginId === null ? null : id(pluginId, `${path}.pluginId`),
    version: version(source['version'], `${path}.version`),
    packageName: packageIdentity(source['packageName'], `${path}.packageName`),
    enabled: boolean(source['enabled'], `${path}.enabled`),
    entryIds: unique(array(source['entryIds'], `${path}.entryIds`, 256, id), `${path}.entryIds`),
  }
}

function installedOwnedData(value: unknown, path: string): InstalledPluginOwnedData {
  const source = record(value, path)
  exact(source, path, ['path', 'label'])
  return {
    path: ownedDataPath(source['path'], `${path}.path`),
    label: string(source['label'], `${path}.label`, 120),
  }
}

function runtimeEntry(value: unknown, path: string): PluginRuntimeEntryEvidence {
  const source = record(value, path)
  exact(source, path, ['entryId', 'enabled', 'fiberPhase'])
  return {
    entryId: evidenceIdentity(source['entryId'], `${path}.entryId`),
    enabled: boolean(source['enabled'], `${path}.enabled`),
    fiberPhase: nullableString(source['fiberPhase'], `${path}.fiberPhase`, 80),
  }
}

function installedRuntime(value: unknown, path: string): InstalledPluginRuntimeProjection {
  const source = record(value, path)
  exact(source, path, ['entries', 'clientModules', 'skillIds'])
  return {
    entries: array(source['entries'], `${path}.entries`, 256, runtimeEntry),
    clientModules: unique(array(source['clientModules'], `${path}.clientModules`, 128, packageIdentity), `${path}.clientModules`),
    skillIds: unique(array(source['skillIds'], `${path}.skillIds`, 128, id), `${path}.skillIds`),
  }
}

function installedUpdate(value: unknown, path: string): InstalledPluginUpdate {
  const source = record(value, path)
  exact(source, path, ['version', 'changelog', 'riskLevel', 'riskSummary'])
  return {
    version: version(source['version'], `${path}.version`),
    changelog: string(source['changelog'], `${path}.changelog`, 4_000),
    riskLevel: enumeration(source['riskLevel'], `${path}.riskLevel`, RISKS),
    riskSummary: string(source['riskSummary'], `${path}.riskSummary`, 600),
  }
}

function installedProjection(value: unknown, path: string): InstalledPluginProjection {
  const source = record(value, path)
  exact(source, path, [
    'pluginId', 'packageName', 'version', 'displayName', 'icon', 'brandColor', 'catalogKind', 'source', 'protected',
    'enabled', 'bundleOrder', 'disabledOrder', 'runtimeStatus', 'runtime', 'expectedEntries',
    'expectedClientModules', 'expectedSkillIds', 'compatibility', 'compatibilityReason', 'update',
    'pendingAction', 'supportedActions', 'configurationEntryIds', 'ownedData',
  ])
  const pluginId = source['pluginId'] === null ? null : id(source['pluginId'], `${path}.pluginId`)
  const catalogKind = source['catalogKind'] === null
    ? null
    : enumeration(source['catalogKind'], `${path}.catalogKind`, KINDS)
  const bundleOrder = source['bundleOrder'] === null
    ? null
    : integer(source['bundleOrder'], `${path}.bundleOrder`, 0, 10_000)
  const disabledOrder = source['disabledOrder'] === null
    ? null
    : integer(source['disabledOrder'], `${path}.disabledOrder`, 0, 10_000)
  const pendingAction = source['pendingAction'] === null
    ? null
    : enumeration(source['pendingAction'], `${path}.pendingAction`, COMPATIBILITY_ACTIONS)
  const brand = source['brandColor']
  if (brand !== null && (typeof brand !== 'string' || !COLOR.test(brand))) {
    fail(`${path}.brandColor`, 'must be null or a six-digit hex color')
  }
  const ownedData = array(source['ownedData'], `${path}.ownedData`, 64, installedOwnedData)
  if (new Set(ownedData.map(item => item.path)).size !== ownedData.length) {
    fail(`${path}.ownedData`, 'must not contain duplicate paths')
  }
  const enabled = boolean(source['enabled'], `${path}.enabled`)
  if ((enabled && bundleOrder === null) || (enabled && disabledOrder !== null)
    || (!enabled && bundleOrder !== null)) {
    fail(path, 'must keep active and disabled Bundle membership unambiguous')
  }
  const protectedValue = boolean(source['protected'], `${path}.protected`)
  const sourceValue = enumeration(source['source'], `${path}.source`, INSTALLED_SOURCES)
  const supportedActions = unique(array(source['supportedActions'], `${path}.supportedActions`, MANAGEMENT_ACTIONS.length,
    (item, itemPath) => enumeration(item, itemPath, MANAGEMENT_ACTIONS)), `${path}.supportedActions`)
  if ((protectedValue || sourceValue !== 'catalog') && supportedActions.length !== 0) {
    fail(`${path}.supportedActions`, 'must be empty for protected, system, or local items')
  }
  return {
    pluginId,
    packageName: packageIdentity(source['packageName'], `${path}.packageName`),
    version: source['version'] === null ? null : version(source['version'], `${path}.version`),
    displayName: string(source['displayName'], `${path}.displayName`, 120),
    icon: source['icon'] === null ? null : media(source['icon'], `${path}.icon`),
    brandColor: brand,
    catalogKind,
    source: sourceValue,
    protected: protectedValue,
    enabled,
    bundleOrder,
    disabledOrder,
    runtimeStatus: enumeration(source['runtimeStatus'], `${path}.runtimeStatus`, INSTALLED_RUNTIME_STATUSES),
    runtime: installedRuntime(source['runtime'], `${path}.runtime`),
    expectedEntries: unique(array(source['expectedEntries'], `${path}.expectedEntries`, 256, id), `${path}.expectedEntries`),
    expectedClientModules: unique(array(source['expectedClientModules'], `${path}.expectedClientModules`, 128,
      packageIdentity), `${path}.expectedClientModules`),
    expectedSkillIds: unique(array(source['expectedSkillIds'], `${path}.expectedSkillIds`, 128, id), `${path}.expectedSkillIds`),
    compatibility: enumeration(source['compatibility'], `${path}.compatibility`, COMPATIBILITY),
    compatibilityReason: nullableString(source['compatibilityReason'], `${path}.compatibilityReason`, 240),
    update: source['update'] === null ? null : installedUpdate(source['update'], `${path}.update`),
    pendingAction,
    supportedActions,
    configurationEntryIds: unique(array(source['configurationEntryIds'], `${path}.configurationEntryIds`, 256, id),
      `${path}.configurationEntryIds`),
    ownedData,
  }
}

function compatibilityReason(value: unknown, path: string): CompatibilityReason {
  const source = record(value, path)
  exact(source, path, ['code', 'subject', 'actual', 'expected'])
  return {
    code: enumeration(source['code'], `${path}.code`, COMPATIBILITY_REASON_ORDER),
    subject: string(source['subject'], `${path}.subject`, 256, true),
    actual: nullableString(source['actual'], `${path}.actual`),
    expected: nullableString(source['expected'], `${path}.expected`),
  }
}

function artifactVerificationReason(value: unknown, path: string): ArtifactVerificationReason {
  const source = record(value, path)
  exact(source, path, ['code', 'subject'])
  return {
    code: enumeration(source['code'], `${path}.code`, ARTIFACT_VERIFICATION_REASON_ORDER),
    subject: string(source['subject'], `${path}.subject`, 256, true),
  }
}

function assertReasonOrder<T extends string>(
  values: readonly { readonly code: T }[], order: readonly T[], path: string,
): void {
  let previous = -1
  for (const value of values) {
    const current = order.indexOf(value.code)
    if (current < previous) fail(path, 'must follow the stable product reason order')
    previous = current
  }
}

/**
 * Decode and fully validate one registry snapshot before it can replace cache.
 * @param value - Untrusted registry payload.
 * @returns The closed catalog snapshot.
 */
export function decodeCatalogSnapshot(value: unknown): CatalogSnapshot {
  const source = record(value, '$')
  exact(source, '$', ['schemaVersion', 'etag', 'generatedAt', 'maxAgeSeconds', 'sections', 'entries', 'details', 'preflights'])
  if (source['schemaVersion'] !== 1) fail('$.schemaVersion', 'must equal 1')
  const entries = array(source['entries'], '$.entries', 100, summary)
  const identities = new Set<string>()
  for (const entry of entries) {
    const key = `${entry.pluginId}@${entry.version}`
    if (identities.has(key)) fail('$.entries', `contains duplicate ${key}`)
    identities.add(key)
  }
  const sectionsSource = record(source['sections'], '$.sections')
  exact(sectionsSource, '$.sections', SECTIONS)
  const publicIds = new Set(entries.filter(entry => entry.scope === 'public').map(entry => entry.pluginId))
  const sections = Object.fromEntries(SECTIONS.map((sectionName) => {
    const values = unique(array(sectionsSource[sectionName], `$.sections.${sectionName}`, 60, id), `$.sections.${sectionName}`)
    if (values.some(pluginId => !publicIds.has(pluginId))) {
      fail(`$.sections.${sectionName}`, 'must reference public catalog entries')
    }
    return [sectionName, values]
  })) as unknown as CatalogSnapshot['sections']
  const details = array(source['details'], '$.details', 100, detail)
  const detailIdentities = new Set<string>()
  for (const item of details) {
    const key = `${item.summary.pluginId}@${item.summary.version}`
    if (!identities.has(key)) fail('$.details', `references unknown ${key}`)
    if (detailIdentities.has(key)) fail('$.details', `contains duplicate ${key}`)
    detailIdentities.add(key)
  }
  const preflights = array(source['preflights'], '$.preflights', 100, decodeCatalogVersionPreflight)
  const preflightIdentities = new Set<string>()
  const etag = string(source['etag'], '$.etag', 256)
  for (const item of preflights) {
    const key = `${item.pluginId}@${item.version}`
    if (!identities.has(key)) fail('$.preflights', `references unknown ${key}`)
    if (preflightIdentities.has(key)) fail('$.preflights', `contains duplicate ${key}`)
    if (item.catalogEtag !== etag) fail('$.preflights', `${key} does not match the snapshot ETag`)
    const owningDetail = details.find(detail => `${detail.summary.pluginId}@${detail.summary.version}` === key)
    if (owningDetail === undefined) fail('$.preflights', `${key} has no exact detail`)
    if (item.reviewed !== owningDetail.summary.verified || item.eligible !== owningDetail.eligible
      || item.withdrawn !== owningDetail.withdrawn || item.riskLevel !== owningDetail.riskLevel
      || item.riskSummary !== owningDetail.riskSummary
      || JSON.stringify(item.capabilities) !== JSON.stringify(owningDetail.summary.capabilities)
      || JSON.stringify(item.expectedEntries) !== JSON.stringify(owningDetail.expectedEntries)
      || JSON.stringify(item.expectedClientModules) !== JSON.stringify(owningDetail.expectedClientModules)
      || JSON.stringify(item.expectedSkillIds) !== JSON.stringify(owningDetail.expectedSkillIds)) {
      fail('$.preflights', `${key} disagrees with its renderer-safe detail`)
    }
    preflightIdentities.add(key)
  }
  for (const identity of identities) {
    if (!preflightIdentities.has(identity)) fail('$.preflights', `has no exact preflight for ${identity}`)
  }
  return {
    schemaVersion: 1,
    etag,
    generatedAt: instant(source['generatedAt'], '$.generatedAt'),
    maxAgeSeconds: integer(source['maxAgeSeconds'], '$.maxAgeSeconds', 60, 86_400),
    sections,
    entries,
    details,
    preflights,
  }
}

/**
 * Decode one untrusted media reference before using it in a renderer-safe projection.
 * @param value - Candidate media metadata from a catalog publisher.
 * @returns A bounded HTTPS media reference from an approved origin.
 */
export function decodeCatalogMedia(value: unknown): CatalogMedia {
  return media(value, '$media')
}

/**
 * Decode one untrusted catalog summary before it enters a renderer-safe cache.
 * @param value - Candidate catalog-card metadata.
 * @returns The closed catalog summary.
 */
export function decodeCatalogSummary(value: unknown): CatalogSummary {
  return summary(value, '$summary')
}

/**
 * Decode renderer list intent; endpoints and package sources are never accepted.
 * @param value - Untrusted renderer value.
 * @returns The bounded list query.
 */
export function decodeCatalogListQuery(value: unknown): CatalogListQuery {
  const source = record(value, '$query')
  exact(source, '$query', ['catalogKind', 'scope', 'query', 'limit'])
  return {
    catalogKind: enumeration(source['catalogKind'], '$query.catalogKind', KINDS),
    scope: enumeration(source['scope'], '$query.scope', SCOPES),
    query: string(source['query'], '$query.query', 120, true),
    limit: integer(source['limit'], '$query.limit', 1, 60),
  }
}

/**
 * Decode renderer detail intent; only one exact reviewed identity crosses IPC.
 * @param value - Untrusted renderer value.
 * @returns The exact-version detail query.
 */
export function decodeCatalogDetailQuery(value: unknown): CatalogDetailQuery {
  const source = record(value, '$query')
  exact(source, '$query', ['pluginId', 'version'])
  return {
    pluginId: id(source['pluginId'], '$query.pluginId'),
    version: version(source['version'], '$query.version'),
  }
}

/**
 * Decode renderer compatibility intent without accepting package or evidence authority.
 * @param value - Untrusted renderer value.
 * @returns One exact action request.
 */
export function decodeCompatibilityRequest(value: unknown): CompatibilityRequest {
  const source = record(value, '$request')
  exact(source, '$request', ['pluginId', 'version', 'action'])
  return {
    pluginId: id(source['pluginId'], '$request.pluginId'),
    version: version(source['version'], '$request.version'),
    action: enumeration(source['action'], '$request.action', COMPATIBILITY_ACTIONS),
  }
}

/**
 * Decode trusted catalog-owned input for one exact compatibility evaluation.
 * @param value - Registry value after transport decoding.
 * @returns The complete exact-version preflight input.
 */
export function decodeCatalogVersionPreflight(value: unknown): CatalogVersionPreflight {
  const source = record(value, '$preflight')
  exact(source, '$preflight', [
    'pluginId', 'version', 'packageName', 'catalogEtag', 'reviewed', 'eligible', 'withdrawn',
    'desktopRange', 'dshRange', 'nodeRange', 'artifacts', 'bundlePatch', 'capabilities',
    'riskLevel', 'riskSummary', 'executionAuthority', 'conflicts', 'expectedEntries',
    'expectedClientModules', 'expectedSkillIds', 'supportedActions', 'restartRequired',
  ])
  const artifacts = array(source['artifacts'], '$preflight.artifacts', SUPPORTED_PLUGIN_PLATFORMS.length, artifactEvidence)
  if (new Set(artifacts.map(artifact => artifact.platform)).size !== artifacts.length) {
    fail('$preflight.artifacts', 'must contain at most one artifact for each platform')
  }
  if (source['executionAuthority'] !== 'broad-application-authority') {
    fail('$preflight.executionAuthority', 'must disclose broad application authority')
  }
  return {
    pluginId: id(source['pluginId'], '$preflight.pluginId'),
    version: version(source['version'], '$preflight.version'),
    packageName: packageIdentity(source['packageName'], '$preflight.packageName'),
    catalogEtag: string(source['catalogEtag'], '$preflight.catalogEtag', 256),
    reviewed: boolean(source['reviewed'], '$preflight.reviewed'),
    eligible: boolean(source['eligible'], '$preflight.eligible'),
    withdrawn: boolean(source['withdrawn'], '$preflight.withdrawn'),
    desktopRange: semanticRange(source['desktopRange'], '$preflight.desktopRange'),
    dshRange: semanticRange(source['dshRange'], '$preflight.dshRange'),
    nodeRange: semanticRange(source['nodeRange'], '$preflight.nodeRange'),
    artifacts,
    bundlePatch: bundlePatchPath(source['bundlePatch'], '$preflight.bundlePatch'),
    capabilities: unique(array(source['capabilities'], '$preflight.capabilities', CAPABILITIES.length,
      (item, itemPath) => enumeration(item, itemPath, CAPABILITIES)), '$preflight.capabilities'),
    riskLevel: enumeration(source['riskLevel'], '$preflight.riskLevel', RISKS),
    riskSummary: string(source['riskSummary'], '$preflight.riskSummary', 600),
    executionAuthority: 'broad-application-authority',
    conflicts: versionConflicts(source['conflicts'], '$preflight.conflicts'),
    expectedEntries: unique(array(source['expectedEntries'], '$preflight.expectedEntries', 256, id), '$preflight.expectedEntries'),
    expectedClientModules: unique(array(source['expectedClientModules'], '$preflight.expectedClientModules', 128,
      packageIdentity), '$preflight.expectedClientModules'),
    expectedSkillIds: unique(array(source['expectedSkillIds'], '$preflight.expectedSkillIds', 128, id), '$preflight.expectedSkillIds'),
    supportedActions: unique(array(source['supportedActions'], '$preflight.supportedActions', COMPATIBILITY_ACTIONS.length,
      (item, itemPath) => enumeration(item, itemPath, COMPATIBILITY_ACTIONS)), '$preflight.supportedActions'),
    restartRequired: boolean(source['restartRequired'], '$preflight.restartRequired'),
  }
}

/**
 * Decode Desktop-owned environment and selected-Profile facts.
 * @param value - Trusted local facts at one profile revision.
 * @returns The immutable compatibility fingerprint.
 */
export function decodeCompatibilityFingerprint(value: unknown): CompatibilityFingerprint {
  const source = record(value, '$fingerprint')
  exact(source, '$fingerprint', [
    'desktopVersion', 'dshVersion', 'nodeVersion', 'platform', 'catalogEtag', 'catalogFreshness', 'profileRevision',
    'installedPlugins', 'protectedPackageNames', 'protectedEntryIds', 'activeOperation',
  ])
  const installedPlugins = array(source['installedPlugins'], '$fingerprint.installedPlugins', 1_000, installedPlugin)
  const catalogPluginIds = installedPlugins.flatMap(plugin => plugin.pluginId === null ? [] : [plugin.pluginId])
  if (new Set(catalogPluginIds).size !== catalogPluginIds.length) {
    fail('$fingerprint.installedPlugins', 'must not contain duplicate plugin ids')
  }
  if (new Set(installedPlugins.map(plugin => plugin.packageName)).size !== installedPlugins.length) {
    fail('$fingerprint.installedPlugins', 'must not contain duplicate package names')
  }
  return {
    desktopVersion: version(source['desktopVersion'], '$fingerprint.desktopVersion'),
    dshVersion: version(source['dshVersion'], '$fingerprint.dshVersion'),
    nodeVersion: version(source['nodeVersion'], '$fingerprint.nodeVersion'),
    platform: enumeration(source['platform'], '$fingerprint.platform', SUPPORTED_PLUGIN_PLATFORMS),
    catalogEtag: string(source['catalogEtag'], '$fingerprint.catalogEtag', 256),
    catalogFreshness: enumeration(source['catalogFreshness'], '$fingerprint.catalogFreshness', FRESHNESS),
    profileRevision: integer(source['profileRevision'], '$fingerprint.profileRevision', 0, 2_147_483_647),
    installedPlugins,
    protectedPackageNames: unique(array(source['protectedPackageNames'], '$fingerprint.protectedPackageNames', 1_000,
      packageIdentity), '$fingerprint.protectedPackageNames'),
    protectedEntryIds: unique(array(source['protectedEntryIds'], '$fingerprint.protectedEntryIds', 2_000, id),
      '$fingerprint.protectedEntryIds'),
    activeOperation: boolean(source['activeOperation'], '$fingerprint.activeOperation'),
  }
}

/**
 * Decode a persisted or bridged compatibility decision and enforce reason ordering.
 * @param value - Decision-shaped value from the Desktop owning boundary.
 * @returns A deterministic exact-action decision.
 */
export function decodeCompatibilityDecision(value: unknown): CompatibilityDecision {
  const source = record(value, '$decision')
  exact(source, '$decision', [
    'pluginId', 'version', 'action', 'allowed', 'fingerprint', 'reasons', 'restartRequired',
    'capabilities', 'riskLevel', 'riskSummary', 'executionAuthority',
  ])
  const reasons = array(source['reasons'], '$decision.reasons', COMPATIBILITY_REASON_ORDER.length * 4, compatibilityReason)
  assertReasonOrder(reasons, COMPATIBILITY_REASON_ORDER, '$decision.reasons')
  const allowed = boolean(source['allowed'], '$decision.allowed')
  if (allowed !== (reasons.length === 0)) fail('$decision.allowed', 'must equal whether the reason list is empty')
  if (source['executionAuthority'] !== 'broad-application-authority') {
    fail('$decision.executionAuthority', 'must disclose broad application authority')
  }
  return {
    pluginId: id(source['pluginId'], '$decision.pluginId'),
    version: version(source['version'], '$decision.version'),
    action: enumeration(source['action'], '$decision.action', COMPATIBILITY_ACTIONS),
    allowed,
    fingerprint: decodeCompatibilityFingerprint(source['fingerprint']),
    reasons,
    restartRequired: boolean(source['restartRequired'], '$decision.restartRequired'),
    capabilities: unique(array(source['capabilities'], '$decision.capabilities', CAPABILITIES.length,
      (item, itemPath) => enumeration(item, itemPath, CAPABILITIES)), '$decision.capabilities'),
    riskLevel: enumeration(source['riskLevel'], '$decision.riskLevel', RISKS),
    riskSummary: string(source['riskSummary'], '$decision.riskSummary', 600),
    executionAuthority: 'broad-application-authority',
  }
}

/**
 * Decode an artifact-verification result and enforce stable failure ordering.
 * @param value - Verifier result-shaped value.
 * @returns A bounded result without archive bytes or local paths.
 */
export function decodeArtifactVerificationResult(value: unknown): ArtifactVerificationResult {
  const source = record(value, '$verification')
  exact(source, '$verification', [
    'verified', 'reasons', 'observedPackageName', 'observedVersion', 'observedBundlePatch',
    'entryCount', 'unpackedBytes',
  ])
  const reasons = array(source['reasons'], '$verification.reasons', ARTIFACT_VERIFICATION_REASON_ORDER.length * 4,
    artifactVerificationReason)
  assertReasonOrder(reasons, ARTIFACT_VERIFICATION_REASON_ORDER, '$verification.reasons')
  const verified = boolean(source['verified'], '$verification.verified')
  if (verified !== (reasons.length === 0)) fail('$verification.verified', 'must equal whether the reason list is empty')
  const observedPackageName = nullableString(source['observedPackageName'], '$verification.observedPackageName', 214)
  if (observedPackageName !== null && !PACKAGE_NAME.test(observedPackageName)) {
    fail('$verification.observedPackageName', 'must be null or a lowercase npm package name')
  }
  const observedVersion = nullableString(source['observedVersion'], '$verification.observedVersion', 64)
  if (observedVersion !== null && !VERSION.test(observedVersion)) {
    fail('$verification.observedVersion', 'must be null or an exact semantic version')
  }
  const observedBundlePatchValue = source['observedBundlePatch']
  return {
    verified,
    reasons,
    observedPackageName,
    observedVersion,
    observedBundlePatch: observedBundlePatchValue === null
      ? null
      : bundlePatchPath(observedBundlePatchValue, '$verification.observedBundlePatch'),
    entryCount: integer(source['entryCount'], '$verification.entryCount', 0, 100_000),
    unpackedBytes: integer(source['unpackedBytes'], '$verification.unpackedBytes', 0, 2_147_483_647),
  }
}

/**
 * Decode renderer installation intent without accepting mutation authority.
 * @param value - Untrusted renderer value.
 * @returns One exact reviewed target and idempotency key.
 */
export function decodePluginInstallRequest(value: unknown): PluginInstallRequest {
  const source = record(value, '$request')
  exact(source, '$request', ['pluginId', 'version', 'idempotencyKey'])
  const idempotencyKey = string(source['idempotencyKey'], '$request.idempotencyKey', 128)
  if (!IDEMPOTENCY_KEY.test(idempotencyKey)) {
    fail('$request.idempotencyKey', 'must contain only stable ASCII key characters')
  }
  return {
    pluginId: id(source['pluginId'], '$request.pluginId'),
    version: version(source['version'], '$request.version'),
    idempotencyKey,
  }
}

/**
 * Decode one installed-item mutation without accepting package or path authority.
 * @param value - Untrusted renderer value.
 * @returns One exact installed-item action and idempotency key.
 */
export function decodePluginManagementRequest(value: unknown): PluginManagementRequest {
  const source = record(value, '$request')
  exact(source, '$request', ['pluginId', 'version', 'action', 'idempotencyKey'])
  const idempotencyKey = string(source['idempotencyKey'], '$request.idempotencyKey', 128)
  if (!IDEMPOTENCY_KEY.test(idempotencyKey)) {
    fail('$request.idempotencyKey', 'must contain only stable ASCII key characters')
  }
  return {
    pluginId: id(source['pluginId'], '$request.pluginId'),
    version: version(source['version'], '$request.version'),
    action: enumeration(source['action'], '$request.action', MANAGEMENT_ACTIONS),
    idempotencyKey,
  }
}

/**
 * Decode the authoritative installed projection before exposing it across IPC.
 * @param value - Untrusted installed projection value.
 * @returns A bounded installed-plugin list for the selected Profile.
 */
export function decodeInstalledPluginListResult(value: unknown): InstalledPluginListResult {
  const source = record(value, '$installed')
  exact(source, '$installed', ['profileName', 'profileRevision', 'catalogFreshness', 'items'])
  if (source['profileName'] !== 'web') fail('$installed.profileName', 'must equal web')
  const items = array(source['items'], '$installed.items', 1_000, installedProjection)
  if (new Set(items.map(item => item.packageName)).size !== items.length) {
    fail('$installed.items', 'must not contain duplicate package names')
  }
  const pluginIds = items.flatMap(item => item.pluginId === null ? [] : [item.pluginId])
  if (new Set(pluginIds).size !== pluginIds.length) {
    fail('$installed.items', 'must not contain duplicate plugin ids')
  }
  return {
    profileName: 'web',
    profileRevision: integer(source['profileRevision'], '$installed.profileRevision', 0, 2_147_483_647),
    catalogFreshness: enumeration(source['catalogFreshness'], '$installed.catalogFreshness', FRESHNESS),
    items,
  }
}

/**
 * Decode a separately confirmed, post-uninstall owned-data removal request.
 * @param value - Untrusted renderer value.
 * @returns The bounded paths tied to one committed uninstall operation.
 */
export function decodePluginOwnedDataRemovalRequest(value: unknown): PluginOwnedDataRemovalRequest {
  const source = record(value, '$request')
  exact(source, '$request', ['operationId', 'pluginId', 'paths', 'confirmation'])
  if (source['confirmation'] !== 'remove-owned-data') {
    fail('$request.confirmation', 'must equal remove-owned-data')
  }
  return {
    operationId: id(source['operationId'], '$request.operationId'),
    pluginId: id(source['pluginId'], '$request.pluginId'),
    paths: unique(array(source['paths'], '$request.paths', 64, ownedDataPath), '$request.paths'),
    confirmation: 'remove-owned-data',
  }
}

/**
 * Decode a bounded result without leaking Desktop storage paths.
 * @param value - Untrusted owned-data removal result.
 * @returns The operation identity and relative paths removed.
 */
export function decodePluginOwnedDataRemovalResult(value: unknown): PluginOwnedDataRemovalResult {
  const source = record(value, '$result')
  exact(source, '$result', ['operationId', 'pluginId', 'removedPaths'])
  return {
    operationId: id(source['operationId'], '$result.operationId'),
    pluginId: id(source['pluginId'], '$result.pluginId'),
    removedPaths: unique(array(source['removedPaths'], '$result.removedPaths', 64, ownedDataPath), '$result.removedPaths'),
  }
}

/** Decode one current committed-uninstall owned-data offer across the Desktop bridge. */
export function decodePluginOwnedDataOffer(value: unknown): PluginOwnedDataOffer {
  const source = record(value, '$offer')
  exact(source, '$offer', ['operationId', 'pluginId', 'packageName', 'version', 'declarations'])
  const declarations = array(source['declarations'], '$offer.declarations', 64, installedOwnedData)
  if (new Set(declarations.map(item => item.path)).size !== declarations.length) {
    fail('$offer.declarations', 'must not repeat owned-data paths')
  }
  return {
    operationId: id(source['operationId'], '$offer.operationId'),
    pluginId: id(source['pluginId'], '$offer.pluginId'),
    packageName: packageIdentity(source['packageName'], '$offer.packageName'),
    version: version(source['version'], '$offer.version'),
    declarations,
  }
}

/** Decode the explicit retain decision that closes one committed uninstall offer. */
export function decodePluginOwnedDataRetentionRequest(value: unknown): PluginOwnedDataRetentionRequest {
  const source = record(value, '$request')
  exact(source, '$request', ['operationId', 'pluginId', 'confirmation'])
  if (source['confirmation'] !== 'retain-owned-data') {
    fail('$request.confirmation', 'must equal retain-owned-data')
  }
  return {
    operationId: id(source['operationId'], '$request.operationId'),
    pluginId: id(source['pluginId'], '$request.pluginId'),
    confirmation: 'retain-owned-data',
  }
}

/** Decode the bounded acknowledgement returned after retaining owned data. */
export function decodePluginOwnedDataRetentionResult(value: unknown): PluginOwnedDataRetentionResult {
  const source = record(value, '$result')
  exact(source, '$result', ['operationId', 'pluginId', 'retained'])
  if (source['retained'] !== true) fail('$result.retained', 'must equal true')
  return {
    operationId: id(source['operationId'], '$result.operationId'),
    pluginId: id(source['pluginId'], '$result.pluginId'),
    retained: true,
  }
}

/**
 * Decode a journal or bridge snapshot for one trusted installation.
 * @param value - Snapshot-shaped value from the Desktop owning boundary.
 * @returns A closed immutable operation projection.
 */
export function decodePluginOperationSnapshot(value: unknown): PluginOperationSnapshot {
  const source = record(value, '$operation')
  exact(source, '$operation', [
    'schemaVersion', 'operationId', 'idempotencyKey', 'profileName', 'action', 'pluginId', 'version',
    'phase', 'startedAt', 'updatedAt', 'hostGeneration', 'failureCode',
  ])
  if (source['schemaVersion'] !== 1) fail('$operation.schemaVersion', 'must equal 1')
  if (source['profileName'] !== 'web') fail('$operation.profileName', 'must equal web')
  const operationId = id(source['operationId'], '$operation.operationId')
  const idempotencyKey = string(source['idempotencyKey'], '$operation.idempotencyKey', 128)
  if (!IDEMPOTENCY_KEY.test(idempotencyKey)) {
    fail('$operation.idempotencyKey', 'must contain only stable ASCII key characters')
  }
  const phase = enumeration(source['phase'], '$operation.phase', OPERATION_PHASES)
  const failureCode = source['failureCode'] === null
    ? null
    : enumeration(source['failureCode'], '$operation.failureCode', OPERATION_FAILURE_CODES)
  const recoveryPhase = RECOVERY_PHASES.includes(phase as PluginRecoveryPhase)
  const failurePhase = phase === 'failed' || phase === 'rolled-back' || phase === 'recovery-failed' || recoveryPhase
  if (failurePhase !== (failureCode !== null)) {
    fail('$operation.failureCode', 'must be present exactly for failure or recovery phases')
  }
  const startedAt = instant(source['startedAt'], '$operation.startedAt')
  const updatedAt = instant(source['updatedAt'], '$operation.updatedAt')
  if (Date.parse(updatedAt) < Date.parse(startedAt)) {
    fail('$operation.updatedAt', 'must not be earlier than startedAt')
  }
  return {
    schemaVersion: 1,
    operationId,
    idempotencyKey,
    profileName: 'web',
    action: enumeration(source['action'], '$operation.action', COMPATIBILITY_ACTIONS),
    pluginId: id(source['pluginId'], '$operation.pluginId'),
    version: version(source['version'], '$operation.version'),
    phase,
    startedAt,
    updatedAt,
    hostGeneration: source['hostGeneration'] === null
      ? null
      : integer(source['hostGeneration'], '$operation.hostGeneration', 1, 2_147_483_647),
    failureCode,
  }
}

/**
 * Decode one start/join/busy response before it reaches presentation state.
 * @param value - Result-shaped value from the Desktop operation controller.
 * @returns The closed operation-start result.
 */
export function decodePluginOperationStartResult(value: unknown): PluginOperationStartResult {
  const source = record(value, '$result')
  const kind = enumeration(source['kind'], '$result.kind', ['started', 'joined', 'busy'] as const)
  if (kind === 'busy') {
    exact(source, '$result', ['kind', 'activeOperationId'])
    return { kind, activeOperationId: id(source['activeOperationId'], '$result.activeOperationId') }
  }
  exact(source, '$result', ['kind', 'operation'])
  return { kind, operation: decodePluginOperationSnapshot(source['operation']) }
}

function evidenceIdentity(value: unknown, path: string): string {
  const decoded = string(value, path, 256)
  if (!/^[A-Za-z0-9@][A-Za-z0-9@._:/-]*$/u.test(decoded)) {
    return fail(path, 'must be a stable runtime identity')
  }
  return decoded
}

function profileIdentity(value: unknown, path: string): PluginProfileIdentity {
  const source = record(value, path)
  exact(source, path, ['profileName', 'rootSha256'])
  if (source['profileName'] !== 'web') fail(`${path}.profileName`, 'must equal web')
  return { profileName: 'web', rootSha256: sha256(source['rootSha256'], `${path}.rootSha256`) }
}

function runtimeEntryEvidence(value: unknown, path: string): PluginRuntimeEntryEvidence {
  const source = record(value, path)
  exact(source, path, ['entryId', 'enabled', 'fiberPhase'])
  return {
    entryId: evidenceIdentity(source['entryId'], `${path}.entryId`),
    enabled: boolean(source['enabled'], `${path}.enabled`),
    fiberPhase: source['fiberPhase'] === null
      ? null
      : string(source['fiberPhase'], `${path}.fiberPhase`, 64),
  }
}

/**
 * Decode exact runtime inventory retained at a transaction commit point.
 * @param value - Runtime-evidence-shaped value from the trusted Host boundary.
 * @returns Bounded Loader, client-module, and Skill evidence.
 */
export function decodePluginRuntimeEvidence(value: unknown): PluginRuntimeEvidence {
  const source = record(value, '$runtimeEvidence')
  exact(source, '$runtimeEvidence', ['entries', 'clientModules', 'skillIds'])
  const entries = array(source['entries'], '$runtimeEvidence.entries', 512, runtimeEntryEvidence)
  const entryIds = entries.map(entry => entry.entryId)
  if (new Set(entryIds).size !== entryIds.length) fail('$runtimeEvidence.entries', 'must not repeat entryId')
  return {
    entries,
    clientModules: unique(array(source['clientModules'], '$runtimeEvidence.clientModules', 256,
      evidenceIdentity), '$runtimeEvidence.clientModules'),
    skillIds: unique(array(source['skillIds'], '$runtimeEvidence.skillIds', 512,
      evidenceIdentity), '$runtimeEvidence.skillIds'),
  }
}

function operationHeader(value: unknown, path: string): PluginOperationHeader {
  const source = record(value, path)
  exact(source, path, [
    'operationId', 'idempotencyKey', 'profileIdentity', 'action', 'pluginId', 'version', 'startedAt',
  ])
  const idempotencyKey = string(source['idempotencyKey'], `${path}.idempotencyKey`, 128)
  if (!IDEMPOTENCY_KEY.test(idempotencyKey)) {
    fail(`${path}.idempotencyKey`, 'must contain only stable ASCII key characters')
  }
  return {
    operationId: id(source['operationId'], `${path}.operationId`),
    idempotencyKey,
    profileIdentity: profileIdentity(source['profileIdentity'], `${path}.profileIdentity`),
    action: enumeration(source['action'], `${path}.action`, COMPATIBILITY_ACTIONS),
    pluginId: id(source['pluginId'], `${path}.pluginId`),
    version: version(source['version'], `${path}.version`),
    startedAt: instant(source['startedAt'], `${path}.startedAt`),
  }
}

function priorSnapshotReference(value: unknown, path: string): PluginPriorSnapshotReference {
  const source = record(value, path)
  exact(source, path, ['snapshotId', 'snapshotSha256', 'runtimeEvidence'])
  return {
    snapshotId: id(source['snapshotId'], `${path}.snapshotId`),
    snapshotSha256: sha256(source['snapshotSha256'], `${path}.snapshotSha256`),
    runtimeEvidence: decodePluginRuntimeEvidence(source['runtimeEvidence']),
  }
}

function operationPhaseEntry(value: unknown, path: string): PluginOperationPhaseEntry {
  const source = record(value, path)
  exact(source, path, [
    'sequence', 'phase', 'boundary', 'at', 'operationFailureCode', 'recoveryReasonCode',
  ])
  return {
    sequence: integer(source['sequence'], `${path}.sequence`, 0, 4_096),
    phase: enumeration(source['phase'], `${path}.phase`, OPERATION_PHASES),
    boundary: enumeration(source['boundary'], `${path}.boundary`, OPERATION_BOUNDARIES),
    at: instant(source['at'], `${path}.at`),
    operationFailureCode: source['operationFailureCode'] === null
      ? null
      : enumeration(source['operationFailureCode'], `${path}.operationFailureCode`, OPERATION_FAILURE_CODES),
    recoveryReasonCode: source['recoveryReasonCode'] === null
      ? null
      : enumeration(source['recoveryReasonCode'], `${path}.recoveryReasonCode`, RECOVERY_REASON_CODES),
  }
}

function operationCommitMarker(value: unknown, path: string): PluginOperationCommitMarker {
  const source = record(value, path)
  exact(source, path, ['committedAt', 'fingerprintSha256', 'runtimeEvidence'])
  return {
    committedAt: instant(source['committedAt'], `${path}.committedAt`),
    fingerprintSha256: sha256(source['fingerprintSha256'], `${path}.fingerprintSha256`),
    runtimeEvidence: decodePluginRuntimeEvidence(source['runtimeEvidence']),
  }
}

/**
 * Decode and validate one version-2 durable transaction journal record.
 * @param value - Journal-shaped value read from local durable storage.
 * @returns A record whose header, phase history, commit marker, and terminal result agree.
 */
export function decodePluginTransactionJournalRecord(value: unknown): PluginTransactionJournalRecord {
  const source = record(value, '$journal')
  exact(source, '$journal', [
    'schemaVersion', 'header', 'operation', 'priorFingerprint', 'priorSnapshot', 'phaseHistory',
    'commitMarker', 'terminalResult', 'recoveryAttempt', 'recoveryReasonCode',
  ])
  if (source['schemaVersion'] !== 2) fail('$journal.schemaVersion', 'must equal 2')
  const header = operationHeader(source['header'], '$journal.header')
  const operation = decodePluginOperationSnapshot(source['operation'])
  if (operation.operationId !== header.operationId || operation.idempotencyKey !== header.idempotencyKey
    || operation.action !== header.action
    || operation.pluginId !== header.pluginId || operation.version !== header.version
    || operation.startedAt !== header.startedAt) {
    fail('$journal.operation', 'must match the immutable operation header')
  }
  if (operation.phase === 'failed') {
    fail('$journal.operation.phase', 'must use rolled-back or recovery-failed in a version-2 journal')
  }
  const priorFingerprint = source['priorFingerprint'] === null
    ? null
    : decodeCompatibilityFingerprint(source['priorFingerprint'])
  const priorSnapshot = source['priorSnapshot'] === null
    ? null
    : priorSnapshotReference(source['priorSnapshot'], '$journal.priorSnapshot')
  if ((priorSnapshot === null) !== (priorFingerprint === null)) {
    fail('$journal.priorSnapshot', 'must be present together with priorFingerprint')
  }
  const phaseHistory = array(source['phaseHistory'], '$journal.phaseHistory', 256, operationPhaseEntry)
  if (phaseHistory.length === 0) fail('$journal.phaseHistory', 'must contain the current phase')
  const foundationRequiredPhases = new Set<PluginOperationPhase>([
    'stopping-host', 'installing', 'validating-profile', 'starting-host', 'reloading',
    'health-checking', 'verifying-runtime', ...RECOVERY_PHASES, 'committed',
  ])
  if (priorSnapshot === null && phaseHistory.some(entry => foundationRequiredPhases.has(entry.phase))) {
    fail('$journal.priorSnapshot', 'must exist before any mutation-owned side effect or recovery')
  }
  let previousAt = header.startedAt
  for (const [index, entry] of phaseHistory.entries()) {
    if (entry.sequence !== index) fail(`$journal.phaseHistory[${String(index)}].sequence`, 'must be contiguous from zero')
    if (Date.parse(entry.at) < Date.parse(previousAt)) {
      fail(`$journal.phaseHistory[${String(index)}].at`, 'must not move backwards')
    }
    if (entry.recoveryReasonCode !== null
      && entry.phase !== 'recovery-failed'
      && !RECOVERY_PHASES.includes(entry.phase as PluginRecoveryPhase)) {
      fail(`$journal.phaseHistory[${String(index)}].recoveryReasonCode`, 'requires a recovery phase')
    }
    previousAt = entry.at
  }
  if (phaseHistory.at(-1)?.phase !== operation.phase || phaseHistory.at(-1)?.at !== operation.updatedAt) {
    fail('$journal.phaseHistory', 'latest entry must equal the operation phase and updatedAt')
  }
  const commitMarker = source['commitMarker'] === null
    ? null
    : operationCommitMarker(source['commitMarker'], '$journal.commitMarker')
  const terminalResult = source['terminalResult'] === null
    ? null
    : enumeration(source['terminalResult'], '$journal.terminalResult', OPERATION_TERMINAL_RESULTS)
  const recoveryAttempt = integer(source['recoveryAttempt'], '$journal.recoveryAttempt', 0, 100)
  const recoveryReasonCode = source['recoveryReasonCode'] === null
    ? null
    : enumeration(source['recoveryReasonCode'], '$journal.recoveryReasonCode', RECOVERY_REASON_CODES)
  const recoveryPhase = RECOVERY_PHASES.includes(operation.phase as PluginRecoveryPhase)
  if ((recoveryPhase || operation.phase === 'recovery-failed') && (recoveryAttempt === 0 || priorSnapshot === null)) {
    fail('$journal.recoveryAttempt', 'recovery requires an attempt and prior snapshot')
  }
  if (!recoveryPhase && operation.phase !== 'rolled-back' && operation.phase !== 'recovery-failed'
    && recoveryAttempt !== 0) {
    fail('$journal.recoveryAttempt', 'must remain zero before recovery')
  }
  if (terminalResult === 'committed') {
    if (operation.phase !== 'committed' || commitMarker === null || recoveryReasonCode !== null) {
      fail('$journal.terminalResult', 'committed requires the committed phase and commit marker only')
    }
    if (Date.parse(commitMarker.committedAt) < Date.parse(operation.updatedAt)) {
      fail('$journal.commitMarker.committedAt', 'must not precede the committed operation')
    }
  } else if (terminalResult === 'rolled-back') {
    if (operation.phase !== 'rolled-back' || commitMarker !== null || recoveryReasonCode !== null) {
      fail('$journal.terminalResult', 'rolled-back requires the rolled-back phase without commit or recovery failure')
    }
  } else if (terminalResult === 'recovery-failed') {
    if (operation.phase !== 'recovery-failed' || commitMarker !== null || recoveryReasonCode === null) {
      fail('$journal.terminalResult', 'recovery-failed requires its phase and stable recovery reason')
    }
  } else if (operation.phase === 'committed' || operation.phase === 'rolled-back'
    || operation.phase === 'recovery-failed' || commitMarker !== null) {
    fail('$journal.terminalResult', 'must close every terminal phase and commit marker')
  }
  if (recoveryReasonCode !== null && phaseHistory.at(-1)?.recoveryReasonCode !== recoveryReasonCode) {
    fail('$journal.recoveryReasonCode', 'must match the latest phase entry')
  }
  return {
    schemaVersion: 2,
    header,
    operation,
    priorFingerprint,
    priorSnapshot,
    phaseHistory,
    commitMarker,
    terminalResult,
    recoveryAttempt,
    recoveryReasonCode,
  }
}

/**
 * Decode the renderer-safe state of an owned recovery.
 * @param value - Recovery projection from the Desktop bridge.
 * @returns A bounded recovery state with stable retry and export capabilities.
 */
export function decodePluginRecoverySnapshot(value: unknown): PluginRecoverySnapshot {
  const source = record(value, '$recovery')
  exact(source, '$recovery', [
    'schemaVersion', 'operationId', 'phase', 'recoveryPhase', 'operationFailureCode',
    'recoveryReasonCode', 'attempt', 'updatedAt', 'canRetry', 'canExportDiagnostics',
  ])
  if (source['schemaVersion'] !== 1) fail('$recovery.schemaVersion', 'must equal 1')
  const phase = enumeration(source['phase'], '$recovery.phase', [
    'recovering', 'rolled-back', 'recovery-failed',
  ] as const)
  const recoveryPhase = source['recoveryPhase'] === null
    ? null
    : enumeration(source['recoveryPhase'], '$recovery.recoveryPhase', RECOVERY_PHASES)
  const recoveryReasonCode = source['recoveryReasonCode'] === null
    ? null
    : enumeration(source['recoveryReasonCode'], '$recovery.recoveryReasonCode', RECOVERY_REASON_CODES)
  if ((phase === 'recovering') !== (recoveryPhase !== null)) {
    fail('$recovery.recoveryPhase', 'must be present exactly while recovering')
  }
  if ((phase === 'recovery-failed') !== (recoveryReasonCode !== null)) {
    fail('$recovery.recoveryReasonCode', 'must be present exactly for recovery-failed')
  }
  const canRetry = boolean(source['canRetry'], '$recovery.canRetry')
  if (canRetry !== (phase === 'recovery-failed')) fail('$recovery.canRetry', 'must be true only for recovery-failed')
  if (source['canExportDiagnostics'] !== true) {
    fail('$recovery.canExportDiagnostics', 'must remain available for every recovery result')
  }
  return {
    schemaVersion: 1,
    operationId: id(source['operationId'], '$recovery.operationId'),
    phase,
    recoveryPhase,
    operationFailureCode: enumeration(
      source['operationFailureCode'], '$recovery.operationFailureCode', OPERATION_FAILURE_CODES,
    ),
    recoveryReasonCode,
    attempt: integer(source['attempt'], '$recovery.attempt', 1, 100),
    updatedAt: instant(source['updatedAt'], '$recovery.updatedAt'),
    canRetry,
    canExportDiagnostics: true,
  }
}

function operationIntent(value: unknown, path: string): string {
  const source = record(value, path)
  exact(source, path, ['operationId'])
  return id(source['operationId'], `${path}.operationId`)
}

/**
 * Decode an idempotent recovery retry intent.
 * @param value - Untrusted renderer value.
 * @returns The operation selected for a recovery retry.
 */
export function decodePluginRecoveryRetryRequest(value: unknown): PluginRecoveryRetryRequest {
  return { operationId: operationIntent(value, '$retry') }
}

/**
 * Decode a diagnostic export intent without accepting a renderer path.
 * @param value - Untrusted renderer value.
 * @returns The operation selected for a Desktop-owned diagnostic export.
 */
export function decodePluginDiagnosticExportRequest(value: unknown): PluginDiagnosticExportRequest {
  return { operationId: operationIntent(value, '$diagnosticRequest') }
}

/**
 * Decode the bounded result of a Desktop-owned diagnostic save.
 * @param value - Export-result-shaped value.
 * @returns Saved metadata or an explicit user cancellation.
 */
export function decodePluginDiagnosticExportResult(value: unknown): PluginDiagnosticExportResult {
  const source = record(value, '$diagnosticResult')
  exact(source, '$diagnosticResult', ['operationId', 'status', 'filename', 'sha256', 'bytes'])
  const status = enumeration(source['status'], '$diagnosticResult.status', ['saved', 'cancelled'] as const)
  const filename = source['filename'] === null ? null : string(source['filename'], '$diagnosticResult.filename', 128)
  const digest = source['sha256'] === null ? null : sha256(source['sha256'], '$diagnosticResult.sha256')
  const bytes = source['bytes'] === null ? null : integer(source['bytes'], '$diagnosticResult.bytes', 1, 1_048_576)
  if (filename !== null && (filename.includes('/') || filename.includes('\\') || !filename.endsWith('.json'))) {
    fail('$diagnosticResult.filename', 'must be a JSON basename')
  }
  const saved = filename !== null && digest !== null && bytes !== null
  if ((status === 'saved') !== saved) {
    fail('$diagnosticResult.status', 'saved requires filename, sha256, and bytes; cancelled requires null metadata')
  }
  return {
    operationId: id(source['operationId'], '$diagnosticResult.operationId'),
    status,
    filename,
    sha256: digest,
    bytes,
  }
}

/**
 * Decode one whitelisted diagnostic document before writing or displaying it.
 * @param value - Diagnostic-shaped value assembled by Desktop.
 * @returns Bounded transaction facts without paths, file contents, or environment values.
 */
export function decodePluginRecoveryDiagnostic(value: unknown): PluginRecoveryDiagnostic {
  const source = record(value, '$diagnostic')
  exact(source, '$diagnostic', [
    'schemaVersion', 'journalStatus', 'operationId', 'profileName', 'action', 'pluginId', 'version',
    'phaseHistory', 'terminalResult', 'recoveryAttempt', 'recoveryReasonCode', 'exportedAt',
  ])
  if (source['schemaVersion'] !== 1) fail('$diagnostic.schemaVersion', 'must equal 1')
  const journalStatus = enumeration(source['journalStatus'], '$diagnostic.journalStatus', [
    'readable', 'unreadable',
  ] as const)
  const operationId = id(source['operationId'], '$diagnostic.operationId')
  const exportedAt = instant(source['exportedAt'], '$diagnostic.exportedAt')
  const terminalResult = source['terminalResult'] === null
    ? null
    : enumeration(source['terminalResult'], '$diagnostic.terminalResult', OPERATION_TERMINAL_RESULTS)
  const recoveryReasonCode = source['recoveryReasonCode'] === null
    ? null
    : enumeration(source['recoveryReasonCode'], '$diagnostic.recoveryReasonCode', RECOVERY_REASON_CODES)
  if ((terminalResult === 'recovery-failed') !== (recoveryReasonCode !== null)) {
    fail('$diagnostic.recoveryReasonCode', 'must be present exactly for recovery-failed')
  }
  const phaseHistory = array(source['phaseHistory'], '$diagnostic.phaseHistory', 256, operationPhaseEntry)
  for (const [index, entry] of phaseHistory.entries()) {
    if (entry.sequence !== index) fail(`$diagnostic.phaseHistory[${String(index)}].sequence`, 'must be contiguous from zero')
  }
  if (journalStatus === 'unreadable') {
    if (source['profileName'] !== null || source['action'] !== null || source['pluginId'] !== null
      || source['version'] !== null || phaseHistory.length !== 0 || terminalResult !== 'recovery-failed'
      || source['recoveryAttempt'] !== 1
      || (recoveryReasonCode !== 'unsupported-journal-version' && recoveryReasonCode !== 'journal-invalid')) {
      fail('$diagnostic', 'unreadable journal diagnostics must not guess operation metadata')
    }
    return {
      schemaVersion: 1,
      journalStatus,
      operationId,
      profileName: null,
      action: null,
      pluginId: null,
      version: null,
      phaseHistory: [],
      terminalResult: 'recovery-failed',
      recoveryAttempt: 1,
      recoveryReasonCode,
      exportedAt,
    }
  }
  if (source['profileName'] !== 'web') fail('$diagnostic.profileName', 'must equal web')
  return {
    schemaVersion: 1,
    journalStatus,
    operationId,
    profileName: 'web',
    action: enumeration(source['action'], '$diagnostic.action', COMPATIBILITY_ACTIONS),
    pluginId: id(source['pluginId'], '$diagnostic.pluginId'),
    version: version(source['version'], '$diagnostic.version'),
    phaseHistory,
    terminalResult,
    recoveryAttempt: integer(source['recoveryAttempt'], '$diagnostic.recoveryAttempt', 0, 100),
    recoveryReasonCode,
    exportedAt,
  }
}

function registryArtifactObject(value: unknown, path: string): RegistryArtifactObject {
  const source = record(value, path)
  exact(source, path, ['platform', 'objectKey'])
  return {
    platform: enumeration(source['platform'], `${path}.platform`, SUPPORTED_PLUGIN_PLATFORMS),
    objectKey: objectKey(source['objectKey'], `${path}.objectKey`),
  }
}

/**
 * Decode an authenticated pending-review import without accepting unknown package authority.
 * @param value - Untrusted internal API payload.
 * @returns One exact immutable version and its trusted object identities.
 */
export function decodeRegistryVersionImportRequest(value: unknown): RegistryVersionImportRequest {
  const source = record(value, '$registryImport')
  exact(source, '$registryImport', [
    'schemaVersion', 'requestId', 'operatorId', 'reason', 'evidenceRef', 'occurredAt',
    'publisher', 'detail', 'preflight', 'categoryIds', 'artifactObjects',
  ])
  if (source['schemaVersion'] !== 1) fail('$registryImport.schemaVersion', 'must equal 1')
  const publisherSource = record(source['publisher'], '$registryImport.publisher')
  exact(publisherSource, '$registryImport.publisher', ['publisherId', 'displayName'])
  const publisher = {
    publisherId: id(publisherSource['publisherId'], '$registryImport.publisher.publisherId'),
    displayName: string(publisherSource['displayName'], '$registryImport.publisher.displayName', 120),
  }
  const decodedDetail = detail(source['detail'], '$registryImport.detail')
  const preflight = decodeCatalogVersionPreflight(source['preflight'])
  if (decodedDetail.summary.pluginId !== preflight.pluginId || decodedDetail.summary.version !== preflight.version
    || decodedDetail.summary.publisher !== publisher.displayName
    || decodedDetail.summary.verified !== preflight.reviewed
    || decodedDetail.eligible !== preflight.eligible || decodedDetail.withdrawn !== preflight.withdrawn
    || decodedDetail.riskLevel !== preflight.riskLevel || decodedDetail.riskSummary !== preflight.riskSummary
    || JSON.stringify(decodedDetail.summary.capabilities) !== JSON.stringify(preflight.capabilities)
    || JSON.stringify(decodedDetail.expectedEntries) !== JSON.stringify(preflight.expectedEntries)
    || JSON.stringify(decodedDetail.expectedClientModules) !== JSON.stringify(preflight.expectedClientModules)
    || JSON.stringify(decodedDetail.expectedSkillIds) !== JSON.stringify(preflight.expectedSkillIds)) {
    fail('$registryImport', 'detail and preflight must describe the same exact reviewed version')
  }
  if (preflight.eligible || preflight.withdrawn || preflight.reviewed || decodedDetail.summary.verified) {
    fail('$registryImport', 'new imports must enter pending review without eligibility')
  }
  const artifactObjects = array(source['artifactObjects'], '$registryImport.artifactObjects',
    SUPPORTED_PLUGIN_PLATFORMS.length, registryArtifactObject)
  const artifactPlatforms = preflight.artifacts.map(item => item.platform).sort()
  const objectPlatforms = artifactObjects.map(item => item.platform).sort()
  if (new Set(objectPlatforms).size !== objectPlatforms.length
    || JSON.stringify(artifactPlatforms) !== JSON.stringify(objectPlatforms)) {
    fail('$registryImport.artifactObjects', 'must contain one object for every declared platform artifact')
  }
  return {
    schemaVersion: 1,
    requestId: id(source['requestId'], '$registryImport.requestId'),
    operatorId: id(source['operatorId'], '$registryImport.operatorId'),
    reason: string(source['reason'], '$registryImport.reason', 500),
    evidenceRef: string(source['evidenceRef'], '$registryImport.evidenceRef', 256),
    occurredAt: instant(source['occurredAt'], '$registryImport.occurredAt'),
    publisher,
    detail: decodedDetail,
    preflight,
    categoryIds: unique(array(source['categoryIds'], '$registryImport.categoryIds', 12, id), '$registryImport.categoryIds'),
    artifactObjects,
  }
}

/**
 * Decode one attributable exact-version eligibility decision.
 * @param value - Untrusted internal API payload.
 * @returns The closed moderation action and evidence identity.
 */
export function decodeRegistryModerationRequest(value: unknown): RegistryModerationRequest {
  const source = record(value, '$moderation')
  exact(source, '$moderation', [
    'requestId', 'operatorId', 'pluginId', 'version', 'action', 'reason', 'evidenceRef', 'occurredAt',
  ])
  return {
    requestId: id(source['requestId'], '$moderation.requestId'),
    operatorId: id(source['operatorId'], '$moderation.operatorId'),
    pluginId: id(source['pluginId'], '$moderation.pluginId'),
    version: version(source['version'], '$moderation.version'),
    action: enumeration(source['action'], '$moderation.action', REGISTRY_ACTIONS),
    reason: string(source['reason'], '$moderation.reason', 500),
    evidenceRef: string(source['evidenceRef'], '$moderation.evidenceRef', 256),
    occurredAt: instant(source['occurredAt'], '$moderation.occurredAt'),
  }
}

/**
 * Decode one attributable featured placement and deterministic active window.
 * @param value - Untrusted internal API payload.
 * @returns The exact version, position, and editorial window.
 */
export function decodeRegistryFeaturedPlacementRequest(value: unknown): RegistryFeaturedPlacementRequest {
  const source = record(value, '$featured')
  exact(source, '$featured', [
    'requestId', 'operatorId', 'pluginId', 'version', 'section', 'position', 'startsAt', 'endsAt', 'reason',
  ])
  if (source['section'] !== 'featured') fail('$featured.section', 'must equal featured')
  const startsAt = instant(source['startsAt'], '$featured.startsAt')
  const endsAt = source['endsAt'] === null ? null : instant(source['endsAt'], '$featured.endsAt')
  if (endsAt !== null && Date.parse(endsAt) <= Date.parse(startsAt)) {
    fail('$featured.endsAt', 'must be later than startsAt')
  }
  return {
    requestId: id(source['requestId'], '$featured.requestId'),
    operatorId: id(source['operatorId'], '$featured.operatorId'),
    pluginId: id(source['pluginId'], '$featured.pluginId'),
    version: version(source['version'], '$featured.version'),
    section: 'featured',
    position: integer(source['position'], '$featured.position', 1, 60),
    startsAt,
    endsAt,
    reason: string(source['reason'], '$featured.reason', 500),
  }
}

/**
 * Decode one attributable popularity-generation intent.
 * @param value - Untrusted internal API or scheduled-worker payload.
 * @returns Stable trigger identity, actor, reason, and time.
 */
export function decodeRegistryRankingRequest(value: unknown): RegistryRankingRequest {
  const source = record(value, '$ranking')
  exact(source, '$ranking', ['requestId', 'operatorId', 'reason', 'occurredAt'])
  return {
    requestId: id(source['requestId'], '$ranking.requestId'),
    operatorId: id(source['operatorId'], '$ranking.operatorId'),
    reason: string(source['reason'], '$ranking.reason', 500),
    occurredAt: instant(source['occurredAt'], '$ranking.occurredAt'),
  }
}

/**
 * Decode strict replay-safe installation telemetry and reject every unknown field.
 * @param value - Untrusted public API payload.
 * @returns Privacy-limited coarse operation facts.
 */
export function decodeRegistryInstallEvent(value: unknown): RegistryInstallEvent {
  const source = record(value, '$installEvent')
  exact(source, '$installEvent', [
    'schemaVersion', 'eventId', 'pluginId', 'version', 'installationId', 'platform',
    'desktopVersion', 'dshVersion', 'result', 'reason', 'durationBucket', 'occurredAt', 'operatorTest',
  ])
  if (source['schemaVersion'] !== 1) fail('$installEvent.schemaVersion', 'must equal 1')
  const installationId = string(source['installationId'], '$installEvent.installationId', 64)
  if (!INSTALLATION_ID.test(installationId)) {
    fail('$installEvent.installationId', 'must be a non-identifying lowercase hexadecimal id')
  }
  const result = enumeration(source['result'], '$installEvent.result', REGISTRY_RESULTS)
  const reason = enumeration(source['reason'], '$installEvent.reason', REGISTRY_REASONS)
  if ((result === 'success') !== (reason === 'none')) {
    fail('$installEvent.reason', 'must equal none exactly for a successful result')
  }
  return {
    schemaVersion: 1,
    eventId: id(source['eventId'], '$installEvent.eventId'),
    pluginId: id(source['pluginId'], '$installEvent.pluginId'),
    version: version(source['version'], '$installEvent.version'),
    installationId,
    platform: enumeration(source['platform'], '$installEvent.platform', SUPPORTED_PLUGIN_PLATFORMS),
    desktopVersion: version(source['desktopVersion'], '$installEvent.desktopVersion'),
    dshVersion: version(source['dshVersion'], '$installEvent.dshVersion'),
    result,
    reason,
    durationBucket: enumeration(source['durationBucket'], '$installEvent.durationBucket', REGISTRY_DURATION),
    occurredAt: instant(source['occurredAt'], '$installEvent.occurredAt'),
    operatorTest: boolean(source['operatorTest'], '$installEvent.operatorTest'),
  }
}

function registryRankInputs(value: unknown, path: string): RegistryRankInputs {
  const source = record(value, path)
  exact(source, path, [
    'uniqueSuccess7d', 'uniqueSuccess24h', 'previousSuccess7d', 'attempt7d',
    'rollbackOrActivationFailure7d', 'ageInDays',
  ])
  return {
    uniqueSuccess7d: integer(source['uniqueSuccess7d'], `${path}.uniqueSuccess7d`, 0, 2_147_483_647),
    uniqueSuccess24h: integer(source['uniqueSuccess24h'], `${path}.uniqueSuccess24h`, 0, 2_147_483_647),
    previousSuccess7d: integer(source['previousSuccess7d'], `${path}.previousSuccess7d`, 0, 2_147_483_647),
    attempt7d: integer(source['attempt7d'], `${path}.attempt7d`, 0, 2_147_483_647),
    rollbackOrActivationFailure7d: integer(
      source['rollbackOrActivationFailure7d'], `${path}.rollbackOrActivationFailure7d`, 0, 2_147_483_647,
    ),
    ageInDays: finiteNumber(source['ageInDays'], `${path}.ageInDays`, 0, 1_000_000),
  }
}

/**
 * Decode one immutable popularity audit row with bounded formula values.
 * @param value - Rank row read from durable storage or an internal result.
 * @returns Frozen formula inputs, score, exclusions, and optional position.
 */
export function decodeRegistryRankAudit(value: unknown): RegistryRankAudit {
  const source = record(value, '$rankAudit')
  exact(source, '$rankAudit', [
    'pluginId', 'version', 'formulaVersion', 'generatedAt', 'inputs', 'growth',
    'failureRate', 'freshness', 'score', 'exclusionReasons', 'position',
  ])
  if (source['formulaVersion'] !== 'popular-v1') fail('$rankAudit.formulaVersion', 'must equal popular-v1')
  const exclusionReasons = unique(array(source['exclusionReasons'], '$rankAudit.exclusionReasons',
    RANK_EXCLUSIONS.length, (item, itemPath) => enumeration(item, itemPath, RANK_EXCLUSIONS)), '$rankAudit.exclusionReasons')
  const position = source['position'] === null ? null : integer(source['position'], '$rankAudit.position', 1, 100_000)
  if ((exclusionReasons.length === 0) !== (position !== null)) {
    fail('$rankAudit.position', 'must exist exactly for a non-excluded row')
  }
  return {
    pluginId: id(source['pluginId'], '$rankAudit.pluginId'),
    version: version(source['version'], '$rankAudit.version'),
    formulaVersion: 'popular-v1',
    generatedAt: instant(source['generatedAt'], '$rankAudit.generatedAt'),
    inputs: registryRankInputs(source['inputs'], '$rankAudit.inputs'),
    growth: finiteNumber(source['growth'], '$rankAudit.growth', -1, 3),
    failureRate: finiteNumber(source['failureRate'], '$rankAudit.failureRate', 0, 1),
    freshness: finiteNumber(source['freshness'], '$rankAudit.freshness', 0, 1),
    score: finiteNumber(source['score'], '$rankAudit.score', -2, 100),
    exclusionReasons,
    position,
  }
}

/**
 * Decode one exact public Registry result and enforce eligibility semantics.
 * @param value - Public exact-version response.
 * @returns Immutable reviewed metadata and its current moderation state.
 */
export function decodeRegistryVersionResult(value: unknown): RegistryVersionResult {
  const source = record(value, '$versionResult')
  exact(source, '$versionResult', ['moderationState', 'installable', 'detail', 'preflight'])
  const moderationState = enumeration(source['moderationState'], '$versionResult.moderationState', REGISTRY_STATES)
  const decodedDetail = detail(source['detail'], '$versionResult.detail')
  const preflight = decodeCatalogVersionPreflight(source['preflight'])
  if (decodedDetail.summary.pluginId !== preflight.pluginId || decodedDetail.summary.version !== preflight.version) {
    fail('$versionResult', 'detail and preflight must identify the same exact version')
  }
  const installable = boolean(source['installable'], '$versionResult.installable')
  const expectedInstallable = moderationState === 'approved' && decodedDetail.eligible && !decodedDetail.withdrawn
    && preflight.reviewed && preflight.eligible && !preflight.withdrawn
  if (installable !== expectedInstallable) fail('$versionResult.installable', 'must reflect reviewed eligibility and withdrawal')
  return { moderationState, installable, detail: decodedDetail, preflight }
}

/**
 * Decode one bounded internal Registry success response.
 * @param value - Internal operation result.
 * @returns A stable operation code and optional exact-version identity.
 */
export function decodeRegistryOperationResult(value: unknown): RegistryOperationResult {
  const source = record(value, '$registryOperation')
  exact(source, '$registryOperation', ['requestId', 'code', 'pluginId', 'version'])
  const pluginId = source['pluginId'] === null ? null : id(source['pluginId'], '$registryOperation.pluginId')
  const exactVersion = source['version'] === null ? null : version(source['version'], '$registryOperation.version')
  if ((pluginId === null) !== (exactVersion === null)) {
    fail('$registryOperation', 'pluginId and version must be present together')
  }
  return {
    requestId: id(source['requestId'], '$registryOperation.requestId'),
    code: enumeration(source['code'], '$registryOperation.code', REGISTRY_OPERATIONS),
    pluginId,
    version: exactVersion,
  }
}

/**
 * Decode one secret-free Registry failure response.
 * @param value - Public or internal failure response.
 * @returns A stable error code, bounded product message, and request id.
 */
export function decodeRegistryErrorResult(value: unknown): RegistryErrorResult {
  const source = record(value, '$registryError')
  exact(source, '$registryError', ['error'])
  const error = record(source['error'], '$registryError.error')
  exact(error, '$registryError.error', ['code', 'message', 'requestId'])
  return {
    error: {
      code: enumeration(error['code'], '$registryError.error.code', REGISTRY_ERRORS),
      message: string(error['message'], '$registryError.error.message', 240),
      requestId: string(error['requestId'], '$registryError.error.requestId', 128),
    },
  }
}

/**
 * Decode the secret-free Registry health response.
 * @param value - Health response payload.
 * @returns Deployment health without dependency addresses or credentials.
 */
export function decodeRegistryHealthResult(value: unknown): RegistryHealthResult {
  const source = record(value, '$health')
  exact(source, '$health', ['status', 'database', 'currentCatalog'])
  return {
    status: enumeration(source['status'], '$health.status', ['ok', 'degraded'] as const),
    database: enumeration(source['database'], '$health.database', ['ready', 'unavailable'] as const),
    currentCatalog: boolean(source['currentCatalog'], '$health.currentCatalog'),
  }
}

function decodePresetSquareItemAt(value: unknown, path: string): PresetSquareItem {
  const source = record(value, path)
  const itemKeys = [
    'id', 'slug', 'presetId', 'title', 'description', 'publisher', 'artifact',
    'detailUrl', 'downloadCount', 'visualVariant', 'createdAt',
  ]
  exact(source, path, source['source'] === undefined ? itemKeys : [...itemKeys, 'source'])
  const slug = id(source['slug'], `${path}.slug`)
  const publisherSource = record(source['publisher'], `${path}.publisher`)
  exact(publisherSource, `${path}.publisher`, ['username'])
  const artifactSource = record(source['artifact'], `${path}.artifact`)
  exact(artifactSource, `${path}.artifact`, [
    'downloadUrl', 'sha256', 'sizeBytes', 'formatVersion', 'sourceDshVersion',
  ])
  if (artifactSource['formatVersion'] !== 1) fail(`${path}.artifact.formatVersion`, 'must equal 1')
  const downloadUrl = presetSquareUrl(artifactSource['downloadUrl'], `${path}.artifact.downloadUrl`)
  const detailUrl = presetSquareUrl(source['detailUrl'], `${path}.detailUrl`)
  const expectedDownloadPath = `${PRESET_SQUARE_PATH_PREFIX}api/v1/presets/${slug}/download`
  const expectedDetailPath = `${PRESET_SQUARE_PATH_PREFIX}p/${slug}`
  if (new URL(downloadUrl).pathname !== expectedDownloadPath) {
    fail(`${path}.artifact.downloadUrl`, 'must identify the owning Preset slug')
  }
  if (new URL(detailUrl).pathname !== expectedDetailPath) {
    fail(`${path}.detailUrl`, 'must identify the owning Preset slug')
  }
  return {
    id: id(source['id'], `${path}.id`),
    slug,
    presetId: id(source['presetId'], `${path}.presetId`),
    title: string(source['title'], `${path}.title`, 160),
    description: string(source['description'], `${path}.description`, 4_000),
    source: source['source'] === undefined
      ? 'community'
      : enumeration(source['source'], `${path}.source`, PRESET_SQUARE_SOURCES),
    publisher: { username: string(publisherSource['username'], `${path}.publisher.username`, 128) },
    artifact: {
      downloadUrl,
      sha256: sha256(artifactSource['sha256'], `${path}.artifact.sha256`),
      sizeBytes: integer(artifactSource['sizeBytes'], `${path}.artifact.sizeBytes`, 1, 16 * 1024 * 1024),
      formatVersion: 1,
      sourceDshVersion: version(artifactSource['sourceDshVersion'], `${path}.artifact.sourceDshVersion`),
    },
    detailUrl,
    downloadCount: integer(source['downloadCount'], `${path}.downloadCount`, 0, 2_147_483_647),
    visualVariant: integer(source['visualVariant'], `${path}.visualVariant`, 0, 10_000),
    createdAt: instant(source['createdAt'], `${path}.createdAt`),
  }
}

/**
 * Decode one strict public Preset Square item.
 * @param value - Untrusted public API payload.
 * @returns One immutable published Preset entry.
 */
export function decodePresetSquareItem(value: unknown): PresetSquareItem {
  return decodePresetSquareItemAt(value, '$preset')
}

/**
 * Decode a closed managed-runtime request.
 * @param value - Untrusted renderer payload.
 * @returns One Desktop-owned Preset runtime id.
 */
export function decodePresetRuntimeRequest(value: unknown): PresetRuntimeRequest {
  const source = record(value, '$presetRuntimeRequest')
  exact(source, '$presetRuntimeRequest', ['presetId'])
  return {
    presetId: enumeration(source['presetId'], '$presetRuntimeRequest.presetId', MANAGED_PRESET_RUNTIME_IDS),
  }
}

/**
 * Decode a bounded Preset Square list intent.
 * @param value - Untrusted renderer payload.
 * @returns Closed local search text and server order.
 */
export function decodePresetSquareListQuery(value: unknown): PresetSquareListQuery {
  const source = record(value, '$presetListQuery')
  exact(source, '$presetListQuery', ['query', 'sort'])
  return {
    query: string(source['query'], '$presetListQuery.query', 120, true),
    sort: enumeration(source['sort'], '$presetListQuery.sort', PRESET_SORTS),
  }
}

/**
 * Decode the strict public Preset Square list response.
 * @param value - Untrusted public API payload.
 * @returns Deduplicated entries and server-owned list metadata.
 */
export function decodePresetSquareListResponse(value: unknown): PresetSquareListResponse {
  const source = record(value, '$presetList')
  exact(source, '$presetList', ['items', 'total', 'sort'])
  const items = array(source['items'], '$presetList.items', 1_000, decodePresetSquareItemAt)
  if (new Set(items.map(item => item.slug)).size !== items.length) {
    fail('$presetList.items', 'must not contain duplicate slugs')
  }
  return {
    items,
    total: integer(source['total'], '$presetList.total', items.length, 1_000_000),
    sort: enumeration(source['sort'], '$presetList.sort', PRESET_SORTS),
  }
}

/**
 * Decode the renderer-safe Preset Square list result.
 * @param value - Desktop-projected list payload.
 * @returns Strict entries, list metadata, and fetch time.
 */
export function decodePresetSquareListResult(value: unknown): PresetSquareListResult {
  const source = record(value, '$presetListResult')
  exact(source, '$presetListResult', ['items', 'total', 'sort', 'fetchedAt'])
  const decoded = decodePresetSquareListResponse({
    items: source['items'],
    total: source['total'],
    sort: source['sort'],
  })
  return {
    ...decoded,
    fetchedAt: instant(source['fetchedAt'], '$presetListResult.fetchedAt'),
  }
}

/**
 * Decode one closed Preset Square detail intent.
 * @param value - Untrusted renderer payload.
 * @returns One bounded public slug.
 */
export function decodePresetSquareDetailQuery(value: unknown): PresetSquareDetailQuery {
  const source = record(value, '$presetDetailQuery')
  exact(source, '$presetDetailQuery', ['slug'])
  return { slug: id(source['slug'], '$presetDetailQuery.slug') }
}

/**
 * Decode a renderer-safe Preset Square detail result.
 * @param value - Desktop-projected detail payload.
 * @returns Optional strict entry and fetch time.
 */
export function decodePresetSquareDetailResult(value: unknown): PresetSquareDetailResult {
  const source = record(value, '$presetDetailResult')
  exact(source, '$presetDetailResult', ['item', 'fetchedAt'])
  return {
    item: source['item'] === null ? null : decodePresetSquareItemAt(source['item'], '$presetDetailResult.item'),
    fetchedAt: instant(source['fetchedAt'], '$presetDetailResult.fetchedAt'),
  }
}

/**
 * Decode a closed request for Preset archive preview.
 * @param value - Untrusted renderer payload.
 * @returns Published slug and optional local target id.
 */
export function decodePresetInstallPreviewRequest(value: unknown): PresetInstallPreviewRequest {
  const source = record(value, '$presetInstallPreview')
  exact(source, '$presetInstallPreview', ['slug', 'targetId'])
  return {
    slug: id(source['slug'], '$presetInstallPreview.slug'),
    targetId: source['targetId'] === null ? null : id(source['targetId'], '$presetInstallPreview.targetId'),
  }
}

/**
 * Decode a closed Preset install confirmation.
 * @param value - Untrusted renderer payload.
 * @returns Published slug and confirmed local target id.
 */
export function decodePresetInstallRequest(value: unknown): PresetInstallRequest {
  const source = record(value, '$presetInstall')
  exact(source, '$presetInstall', ['slug', 'targetId'])
  return {
    slug: id(source['slug'], '$presetInstall.slug'),
    targetId: id(source['targetId'], '$presetInstall.targetId'),
  }
}

function decodePresetInstallPreviewAt(value: unknown, path: string): PresetInstallPreviewResult {
  const source = record(value, path)
  exact(source, path, [
    'slug', 'title', 'targetId', 'sourcePresetId', 'name', 'description', 'sourceDshVersion',
    'fileCount', 'warnings', 'conflict',
  ])
  return {
    slug: id(source['slug'], `${path}.slug`),
    title: string(source['title'], `${path}.title`, 160),
    targetId: id(source['targetId'], `${path}.targetId`),
    sourcePresetId: id(source['sourcePresetId'], `${path}.sourcePresetId`),
    name: source['name'] === null ? null : string(source['name'], `${path}.name`, 160),
    description: source['description'] === null
      ? null
      : string(source['description'], `${path}.description`, 4_000, true),
    sourceDshVersion: source['sourceDshVersion'] === null
      ? null
      : version(source['sourceDshVersion'], `${path}.sourceDshVersion`),
    fileCount: integer(source['fileCount'], `${path}.fileCount`, 1, 512),
    warnings: unique(array(source['warnings'], `${path}.warnings`, PRESET_WARNINGS.length,
      (item, itemPath) => enumeration(item, itemPath, PRESET_WARNINGS)), `${path}.warnings`),
    conflict: boolean(source['conflict'], `${path}.conflict`),
  }
}

/**
 * Decode one normalized Preset archive preview.
 * @param value - Host or Desktop preview payload.
 * @returns Bounded installation evidence and warnings.
 */
export function decodePresetInstallPreviewResult(value: unknown): PresetInstallPreviewResult {
  return decodePresetInstallPreviewAt(value, '$presetInstallPreviewResult')
}

/**
 * Decode one normalized successful Preset install result.
 * @param value - Host or Desktop installation payload.
 * @returns Bounded evidence for one committed installation.
 */
export function decodePresetInstallResult(value: unknown): PresetInstallResult {
  const source = record(value, '$presetInstallResult')
  exact(source, '$presetInstallResult', [
    'slug', 'title', 'targetId', 'sourcePresetId', 'name', 'description', 'sourceDshVersion',
    'fileCount', 'warnings', 'conflict', 'installed',
  ])
  if (source['installed'] !== true) fail('$presetInstallResult.installed', 'must equal true')
  const preview = decodePresetInstallPreviewAt({
    slug: source['slug'],
    title: source['title'],
    targetId: source['targetId'],
    sourcePresetId: source['sourcePresetId'],
    name: source['name'],
    description: source['description'],
    sourceDshVersion: source['sourceDshVersion'],
    fileCount: source['fileCount'],
    warnings: source['warnings'],
    conflict: source['conflict'],
  }, '$presetInstallResult')
  return { ...preview, installed: true }
}
