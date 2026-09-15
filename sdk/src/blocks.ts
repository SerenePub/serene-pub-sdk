/**
 * A block's execution mode, as a setting rather than only an authoring choice.
 *
 * `async` chains are declared `parallel` or `sequential` by whoever wrote the
 * spec, and until now that was the end of it. But the right answer is not a
 * property of the pipeline — it is a property of the machine it runs on and the
 * provider it talks to. Four reads that overlap happily against a local
 * database may want to be sequential against a rate-limited remote one, and the
 * person who knows that is the administrator, not the author.
 *
 * So the author's declaration becomes the default and the user's setting wins,
 * on exactly the terms `review` already uses (see `resolvePosition`): same
 * `settings` slot, same precedence, same refusal to let an author forbid the
 * override.
 */

import type { I18n } from './descriptors.js'

export type BlockMode = 'parallel' | 'sequential'

export const BLOCK_MODES: readonly BlockMode[] = ['parallel', 'sequential'] as const

/**
 * What the panel renders for a block, declared here rather than written in the
 * client.
 *
 * A block is not a node type, so it has no descriptor to carry its wording —
 * which would leave the one string on that control invented by whichever screen
 * drew it. Naming it here keeps the rule that every label comes from the SDK,
 * and means a host and a plugin's tooling say the same thing.
 */
export const BLOCK_MODE_DECL: {
	path: 'mode'
	i18n: I18n
	description: I18n
	of: readonly BlockMode[]
} = {
	path: 'mode',
	i18n: { en: 'Run' },
	description: {
		en: 'Whether the steps in this group run at the same time or one after another. Running together is faster; one at a time is gentler on a rate-limited provider.',
	},
	of: BLOCK_MODES,
}

/** The author's declaration is the default; the user's setting wins. */
export function resolveBlockMode(
	authorDefault: string | undefined,
	userSetting: unknown,
): BlockMode {
	if (typeof userSetting === 'string' && (BLOCK_MODES as readonly string[]).includes(userSetting))
		return userSetting as BlockMode
	return authorDefault === 'sequential' ? 'sequential' : 'parallel'
}
