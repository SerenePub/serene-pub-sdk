/**
 * 🚧 **Each round moves the clock** — `core:spec/round-tick`, an **event**
 * pipeline on `core:event/round-ended@1` (PLAN-sensible-engine §2.11, owner
 * 2026-11-11): every time a round ends, the session's story clock moves by the
 * session's round worth (`core:query/round-worth@1`; five minutes by default,
 * 0 turns it off). No model: the query reads the round worth, `core:task/clock-step@1`
 * makes it a step, and *Advance story clock* (`core:outlet/advance-story-clock@1`)
 * moves the clock behind two junctions.
 *
 * Why two: the first, on `moves`, keeps a step of nothing from reading or
 * writing anything; the second, on the story date the session reads at
 * (`core:query/cast-presences@1`'s `at`), keeps a story that has no present
 * from being handed a clock it never asked for — the host starts a clock on
 * any move, so with no present nothing moves and no ledger line is written.
 * No third gate, no empty branches: the outlet sits directly in the `at` branch.
 *
 * It owns the round's tick and nothing else: not what the round wrote, not the
 * rules' time (a turn's minutes, a rest). Story and the Lair register it, both
 * in their genre defaults; the Dungeon Crawler's clock is its turn's; genres
 * that keep real time (the Guide) register none. The reply tick is gone:
 * Story's reply no longer moves the clock.
 *
 * ⚠ Not *Time passes…* (the composer action a person presses).
 * @experimental
 */
import { compile, coreEvents, slot, spec } from '@serene-pub/sdk'
import type { FieldDecl } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'

/**
 * 🚧 The round worth's key in a genre's `fields`: how many story minutes a
 * round is worth. @experimental
 */
export const ROUND_WORTH_KEY = 'roundWorth'

/**
 * 🚧 **The round worth** — a genre field. A genre opts in by placing it under
 * `[ROUND_WORTH_KEY]` in its `fields`; `core:query/round-worth@1` reads it;
 * only the session settings form writes it (one value, one writer).
 * @experimental
 */
export const ROUND_WORTH_FIELD: FieldDecl = {
	type: 'integer',
	label: { en: 'Minutes each round moves the clock' },
	group: 'Turns',
	reach: 'owner',
	min: 0,
	max: 1440,
	default: 5,
	description: {
		en: 'When a round ends, the story clock moves on this many minutes. 0 turns it off. A story whose clock is not set is left alone.',
	},
}

/** @experimental */
export const ROUND_TICK_SPEC_ID = 'core:spec/round-tick'
/** @internal */
export const ROUND_TICK_VERSION = '1.0.0'

/** @experimental */
export const roundTickSpec = () =>
	compile(
		spec(ROUND_TICK_SPEC_ID, {
			version: ROUND_TICK_VERSION,
			taxonomy: { role: 'maintenance' },
		})
			.inlet('event', C.sessionEvent.v1(), { suits: [coreEvents.roundEnded] })
			/** The session's round worth: `{ minutes, step }`, 0 when the genre has not opted in or the session sets 0. */
			.query('worth', ($) => C.roundWorth.v1({ scope: $.event.sessionScope }))
			.task('tick', ($) => C.clockStep.v1({ step: $.worth.step, params: slot.params() }))
			.junction('clock', { on: ($) => $.tick.moves }, (j) =>
				j.when('moves', { truthy: true }, (c) =>
					/** Where the session's story stands: its own clock, else its line's; null when the story has no present. */
					c
						.query('present', ($) =>
							C.castPresences.v1({ scope: $.event.sessionScope }),
						)
						.junction('clocked', { on: ($) => $.present.at }, (k) =>
							k.when('at', { truthy: true }, (d) =>
								d.outlet('advance', ($) =>
									C.advanceStoryClock.v1({
										by: $.tick.by,
										unit: $.tick.unit,
										cause: 'tick',
										onRefusal: 'skip',
										params: slot.params(),
									}),
								),
							),
						),
				),
			)
			.build(),
	)
