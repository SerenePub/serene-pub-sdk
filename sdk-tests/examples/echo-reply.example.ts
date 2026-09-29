/**
 * One inlet, one oracle, one outlet: a turn arrives, the model is asked, the
 * reply is written. The two nodes between them are not ceremony — the oracle's
 * `context` port takes an assembled context, not raw text, so something has to
 * read the session and something has to assemble what it read. Wire the text
 * straight in and the spec does not publish: 01 §3 names the port that produced
 * the shape and the port that could not take it, at publish time rather than at
 * 2am.
 *
 * Nothing here reaches the network. `bindings` is the suite's fixture host —
 * one hook per node definition, every one of them deterministic — so the
 * receipt below is the receipt on every machine.
 */

import { sessionEvents, slot, spec } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import { chatGenre } from '@serene-pub/core-catalog'
import type { Example } from '@serene-pub/cli'

import { bindings, world } from '../helpers.js'

/**
 * The chain. Every step names its kind, so the effect taxonomy reads straight
 * off the page: what reads, what computes, what calls out, what writes.
 */
const smallestReply = spec('example:echo-reply', { version: '1.0.0' })
	// The only method offered first, and never offered again — exactly one
	// inlet, positionally first (01 §2), as a compile error rather than a
	// validator finding.
	//
	// The third argument is the usage lock (24 §4), and it is the whole
	// subscription: this spec answers one event, for one genre. The core
	// catalog exports `chatGenre` for the same id.
	.inlet('input', C.userMessage.v1(), {
		genre: chatGenre,
		event: sessionEvents.messageRespond,
	})
	// Query: reads Serene Pub's own data, and cannot reach the network — a
	// Query's context carries no `call`.
	.query('history', ($) => C.sessionHistory.v1({ scope: $.input.sessionScope }))
	// Task: pure. It turns what was read into the context the oracle takes.
	.task('prompt', () => C.assemble.v2())
	// Oracle: the one node that crosses the boundary. `connection` is a slot —
	// which service answers is an admin's choice, not the document's.
	.oracle('generate', ($) =>
		C.generateText.v1({ context: $.prompt.context, connection: slot.connection() }),
	)
	// Outlet: the one write. Core emits `message-created` because a message was
	// created — the node declares no event of its own (01 §8).
	.outlet('save', ($) => C.createMessage.v1({ text: $.generate.text }))

export const example: Example = {
	slug: 'echo-reply',
	title: 'The smallest pipeline that answers',
	summary: 'One inlet, one oracle, one outlet — and what the receipt says about the run.',
	build: () => smallestReply.build(),
	run: (ctx) =>
		ctx.run({
			input: { text: 'where is my sister', sessionScope: 'session:991' },
			// The stand-in's line. It is scripted rather than generated for the
			// same reason everything else here is: two runs have to produce the
			// same bytes. What it buys is that the last row of the receipt below
			// is an answer to the turn above it, not a placeholder.
			bindings: bindings({
				reply: 'She rode for the eastern watchtower before first light — you can still catch her at the ford.',
			}),
			world,
			subscribers: { 'core:event/message-created@1': 1 },
		}),
}
