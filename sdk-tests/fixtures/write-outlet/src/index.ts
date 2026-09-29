/**
 * A plugin outlet that claims to commit (D-2).
 *
 * `ctx.commit` is the executor's, not the sandbox's: a plugin outlet reaches
 * `HostServices.commit` by no path at all, while the executor wraps whatever
 * it returns as `{ status: 'committed' }` — a claim nobody made, on a run
 * whose receipt then says a row was written.
 */

import { defineExtension, describeOutletDefinition, handler, ok, S } from '@serene-pub/sdk'

export const PLUGIN_SLUG = 'demo.write-outlet'

export const saveRecord = describeOutletDefinition({
	id: 'demo.write-outlet:outlet/save-record@1',
	i18n: { name: { en: 'Save the record' } },
	effects: 'write',
	review: { fields: [] },
	timeoutMs: 500,
	ports: { in: { record: S.json }, out: { main: S.json } },
})

export default defineExtension({
	slug: PLUGIN_SLUG,
	name: 'Record keeper',
	version: '1.0.0',
	description: 'Writes a row it can never reach.',
	handlers: [handler(saveRecord, async (input: { record?: unknown }) => ok({ main: input.record }))],
})
