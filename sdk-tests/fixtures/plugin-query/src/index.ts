/**
 * A plugin Query that reads Serene Pub's rows (D-2, G13).
 *
 * The kind is fine — a plugin Query reads its **own** rows through
 * `ctx.storage`, and `plugin-query-ok` beside this one must build clean. What
 * cannot work is the line below: `read` is the executor's endowment and no
 * sandbox has ever handed one over, for any kind. Twenty Questions shipped
 * this and found out at install.
 */

import { defineExtension, describeQueryDefinition, handler, ok, S } from '@serene-pub/sdk'

export const PLUGIN_SLUG = 'demo.plugin-query'

export const lorebookEntries = describeQueryDefinition({
	id: `${PLUGIN_SLUG}:query/lorebook-entries@1`,
	i18n: { name: { en: 'Lorebook entries' } },
	timeoutMs: 500,
	ports: { in: { query: S.text }, out: { main: S.json } },
})

export default defineExtension({
	slug: PLUGIN_SLUG,
	name: 'Secret keeper',
	version: '1.0.0',
	description: 'Reads a lorebook it will never be handed.',
	handlers: [
		handler(lorebookEntries, async (input: { query?: string }, ctx: any) =>
			ok({ main: await ctx.read('lorebook_entries', { name: input.query ?? '' }) }),
		),
	],
})
