/**
 * A plugin Query that reads its own rows — which is what the kind is for.
 *
 * `hookCtxGrants` hands a query `storage`; a plugin keeps its state there and
 * reads it back through a node of exactly this shape. The packager refused
 * every plugin Query for an afternoon, and the two Battleship nodes that
 * answer this description became emit-class outlets that write nothing. The
 * line is the endowment, not the kind: this package must build with no
 * finding at all.
 */

import { defineExtension, describeQueryDefinition, handler, ok, S } from '@serene-pub/sdk'

export const PLUGIN_SLUG = 'demo.plugin-query-ok'

export const fleetRecords = describeQueryDefinition({
	id: 'demo.plugin-query-ok:query/fleet-records@1',
	i18n: { name: { en: 'Fleet records' } },
	timeoutMs: 500,
	ports: { in: { opponent: S.text }, out: { main: S.json } },
})

export default defineExtension({
	slug: PLUGIN_SLUG,
	name: 'Fleet records',
	version: '1.0.0',
	description: 'Reads the rows it wrote itself.',
	handlers: [
		handler(fleetRecords, async (input: { opponent?: string }, ctx: any) =>
			ok({ main: (await ctx.storage.get(`records:${input.opponent ?? 'admiral'}`)) ?? null }),
		),
	],
	permissions: { storage: { quotaBytes: 1024 * 1024 } },
})
