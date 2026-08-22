/** Pre-Host application-update compatibility reconciliation for reviewed external Bundles. */

import { join } from 'node:path'
import { writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import {
  readProfileManifest,
  setProfileBundleEnabled,
} from '@deepseek-ai/dsh-app-boot'
import type {
  CatalogVersionPreflight,
  CompatibilityFingerprint,
  CompatibilityReason,
} from '@deepseek-ai/dsh-plugin-center-contracts'
import { evaluateInstalledActivationCompatibility } from './compatibility.ts'

/** One external Bundle disabled before Host composition, with reproducible reasons. */
interface StartupCompatibilityDeactivation {
  readonly pluginId: string
  readonly packageName: string
  readonly version: string
  readonly reasons: readonly CompatibilityReason[]
}

/** Result of reconciling current reviewed exact versions against the running Desktop release. */
export interface StartupCompatibilityResult {
  readonly deactivated: readonly StartupCompatibilityDeactivation[]
}

/**
 * Atomically deactivate incompatible reviewed external Bundles while retaining packages and prior disabled intent.
 * @param input - Profile path, fresh release fingerprint, and verified catalog candidates.
 * @returns Exact deactivations and their reproducible compatibility reasons.
 */
export async function reconcileApplicationUpdateCompatibility(input: {
  readonly profileDirectory: string
  readonly fingerprint: CompatibilityFingerprint
  readonly candidates: readonly CatalogVersionPreflight[]
}): Promise<StartupCompatibilityResult> {
  let manifest = readProfileManifest('desktop', input.profileDirectory)
  const deactivated: StartupCompatibilityDeactivation[] = []
  for (const installed of input.fingerprint.installedPlugins) {
    if (!installed.enabled || installed.pluginId === null) continue
    const candidate = input.candidates.find(value => value.pluginId === installed.pluginId
      && value.packageName === installed.packageName
      && value.version === installed.version)
    if (candidate === undefined) continue
    const reasons = evaluateInstalledActivationCompatibility({ candidate, fingerprint: input.fingerprint })
    if (reasons.length === 0) continue
    manifest = setProfileBundleEnabled(manifest, installed.packageName, false)
    deactivated.push({
      pluginId: installed.pluginId,
      packageName: installed.packageName,
      version: installed.version,
      reasons,
    })
  }
  if (deactivated.length > 0) {
    await writeFileAtomic(
      join(input.profileDirectory, 'package.json'),
      `${JSON.stringify(manifest, null, 2)}\n`,
      { mode: 0o600, dirMode: 0o700 },
    )
  }
  return { deactivated }
}
