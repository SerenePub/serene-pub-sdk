/**
 * The Lair's **Nudge** action. The genre's actions are introduced in `index.ts`.
 */

import { compile, slot, spec, sessionEvents } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import { lairGenre } from '../../registry/genres.js'

/* ── The two steering actions that write state ──────────────────────────── */

/** @internal */
export const LAIR_NUDGE_SPEC_ID = 'core:spec/lair-nudge'
/** @internal */
export const LAIR_NUDGE_VERSION = '1.0.0'

/**
 * **Nudge**: a directive to the Castellan's planner that produces no message.
 *
 * The shortest pipeline in the catalog that does anything: no model call, no
 * retrieval, no transcript. The collected text (R3) becomes
 * `core:slot/direction@1` on the world, the planner takes `state` on its own
 * port, and the note is in the next turn's prompt.
 *
 * ⚠ **`apply`, not `propose`** — the one place in this genre where a state
 * write skips the review the state-keeper's changes get. The argument for
 * `propose` is that a *model* is not authoritative about the fiction
 * (`set-state`'s own header). Here the writer is the person who owns the
 * session, typing into their own composer, and asking them to accept their own
 * instruction would be a dialog asking "did you mean what you just typed".
 * @internal
 */
export const lairNudgeSpec = () =>
	compile(
		spec(LAIR_NUDGE_SPEC_ID, {
			version: LAIR_NUDGE_VERSION,
			taxonomy: { role: 'action'},
			contributes: {
				actions: [
					{
						key: 'nudge',
						venue: { kind: 'composer' },
						quick: true,
						icon: 'compass',
						/** The direction is the whole instruction (R3): nothing to do without it. */
						collects: {
							text: { need: 'required', label: { en: 'Direction the party should feel' } },
						},
						label: { en: 'Nudge' },
						description: {
							en: 'Tell the Castellan what you want next. It writes no message — the next turn just follows it.',
						},
					},
				],
			},
		})
			.inlet('input', C.userMessage.v1(), {
				genre: lairGenre,
				event: sessionEvents.sessionAction,
			})
			.query('state', ($) => C.sessionState.v1({ scope: $.input.sessionScope }))
			/**
			 * A literal change with the collected text in it. A nested literal
			 * is how one port takes a reference (`concat-candidates`' `sources`
			 * is the same construction), and this node is here rather than
			 * `set-state` alone because it is what turns the word `world` into
			 * a row and `direction` into `core:slot/direction@1` — and what
			 * refuses a note longer than the slot accepts, with a sentence.
			 */
			.query('resolve', ($) =>
				C.resolveStateChanges.v1({
					changes: [
						{ owner: 'world', slot: 'direction', value: $.input.text },
					] as any,
					scope: $.input.sessionScope,
					base: $.state.version,
				}),
			)
			.task('apply', ($) =>
				C.setState.v1({
					changes: $.resolve.changes,
					scope: $.input.sessionScope,
					base: $.state.version,
					params: slot.params(),
				}),
			)
			.preset('lair', { label: 'Lair', default: true }, (p) =>
				p.params('apply', { mode: 'apply' }),
			)
			.build(),
	)
