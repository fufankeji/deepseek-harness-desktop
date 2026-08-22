/** Package-owned invariant companion for the reviewed Skill fixture. */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-plugin-center-skill-fixture'
export const name = 'plugin-center-skill-fixture-invariant'
export const inject = ['invariants']
const install: InvariantInstaller = () => {
  // No runtime invariant: this reviewed fixture exists only for Skill installation verification.
}
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
