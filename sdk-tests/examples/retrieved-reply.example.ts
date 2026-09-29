/**
 * The smallest chain lets one Query hand its own items straight to assembly.
 * As soon as there are two sources, something has to happen to the raw data
 * first — deduped against each other, ordered by a computed score — and that
 * something is a Task sitting between the fetch and the render:
 *
 * ```
 * query (raw) → task (combine) → task (rank) → task (assemble) → oracle
 * ```
 *
 * Both middle steps are Tasks, so both are swappable: `rankHybrid` can be
 * replaced by a plugin's own ranker without touching anything either side of
 * it — same kind, same shape, and the tuning survives the swap.
 *
 * The run below also answers "why does mirostat do nothing here". The sampling
 * slot resolves to the `Creative` config, which carries `mirostat_tau`, and
 * this connection's adapter does not understand it. The receipt says which
 * fields were applied and which were dropped, by name — a silently-ignored
 * sampler is one of the most common confusions in this whole product category.
 */

import { SLOT_VALUE, sessionEvents, slot, spec } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import { chatGenre } from '@serene-pub/core-catalog'
import type { Example } from '@serene-pub/cli'

import { bindings, world } from '../helpers.js'

const retrievedReply = spec('example:retrieved-reply', { version: '1.0.0' })
	.inlet('input', C.userMessage.v1(), {
		genre: chatGenre,
		event: sessionEvents.messageRespond,
	})
	// What the reply may spend, read off the oracle the budget is for.
	// `downstreamOracle()` resolves to `generate` at publish, so the number
	// follows the connection instead of being typed twice.
	.task('budget', C.contextBudget.v1({ connection: slot.downstreamOracle() }))
	// Two Queries, two sources. Neither renders anything on its own.
	.query('history', ($) =>
		C.sessionHistory.v1({ scope: $.input.sessionScope, budget: $.budget.available }),
	)
	.query('lore', ($) => C.lorebookTriggers.v1({ text: $.input.text }))
	// Combine: the Task between fetching and rendering. It decides which
	// sources survive, and records the strategy it resolved.
	.task('merge', ($) => C.mergeCandidates.v1({ sources: [$.lore.hits, $.history.band] }))
	// Rank: a second pure Task, and the swappable one.
	.task('rank', ($) => C.rankHybrid.v1({ candidates: $.merge.candidates }))
	// Render: weights and minimums are declared on the blocks themselves, so
	// assembly reads them off its input rather than keeping a map in sync.
	.task('prompt', ($) =>
		C.assemble.v2({ candidates: $.rank.candidates, budget: $.budget.available }),
	)
	.oracle('generate', ($) =>
		C.generateText.v1({
			context: $.prompt.context,
			connection: slot.connection(),
			// Handed to the adapter uninterpreted. Core forwards sampling; it
			// never reads it.
			sampling: slot.sampling(),
		}),
	)
	// Commit once at settle: exactly one write (F7). Streaming is the oracle's
	// own business — the host routes its stream to the reply's live row.
	.outlet('save', ($) => C.createMessage.v1({ text: $.generate.text }))

export const example: Example = {
	slug: 'retrieved-reply',
	title: 'A Task between fetching and rendering',
	summary:
		'Two Queries, a Task that combines them and a Task that ranks the result — and a receipt that names the sampler the adapter dropped.',
	build: () => retrievedReply.build(),
	run: (ctx) =>
		ctx.run({
			input: { text: 'where is my sister', sessionScope: 'session:991' },
			// The stand-in's line, written to spend what was retrieved: the `lore`
			// Query returns `elf`, `sister` and `castle`, and the reply uses all
			// three. Retrieval that no reply ever mentions is the failure this
			// chain exists to make visible, so the page shows it landing.
			bindings: bindings({
				reply: 'Your sister left the castle with the elf envoy, and neither of them has come back down the hill.',
			}),
			// The config layer, one row of it: this instance points the
			// `generate` node's sampling slot at the `Creative` config.
			world: {
				...world,
				overrides: [
					{
						nodeKey: 'generate',
						slot: 'sampling',
						path: SLOT_VALUE,
						value: 'cfg_creative',
						scopeKind: 'config',
					},
				],
			},
			subscribers: { 'core:event/message-created@1': 1 },
		}),
}
