/** Package-owned invariant companion for the FF - LLM Wiki launcher. */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@fufan/dsh-plugin-llm-wiki'
export const name = 'fufan-llm-wiki-invariant'
export const inject = ['invariants']
const install: InvariantInstaller = () => {
  // No runtime invariant: packaged application and launcher evidence is verified by Desktop staging and inventory.
}
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
