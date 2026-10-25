/**
 * 🚧 **Time passes…** — core's composer action that moves the session's story
 * clock by an amount the person picks (PROPOSAL-live-scenes §6, lane D,
 * 2026-10-13). No model: the press collects a **clock step** on the collect
 * modal's stepper (`collects.clockStep` — a number, a unit, forward or back),
 * `core:task/clock-step@1` decides it, and *Advance story clock*
 * (`core:outlet/advance-story-clock@1`) moves the clock behind a junction on
 * `moves`, so a step of nothing writes nothing. Nothing is posted in the
 * conversation: the next line carries the new time on its stamp, and a
 * session in Suggested or Automatic scene mode reads the move as a **time
 * action** at that line.
 *
 * One graph, one spec per genre that offers it: Story's is
 * `core:spec/story-advance-time` — the key `advance-time` and the slash name
 * `/advance-time`. (Adventure's own, a keeper action, retired with the genre
 * on 2026-10-19; the Lair's, `core:spec/lair-advance-time`, with its rewrite
 * on 2026-10-21.)
 *
 * ⚠ Not Chronicle's one-press *Next day* (the clock widget's own step), not
 * the reply tick (Story's *Each reply advances the clock by …*, a fixed tick no
 * one presses) and never the book's present: only the session's clock moves.
 */
import { compile, sessionEvents, slot, spec, type GenreDecl } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'

/** The action key every genre's *Time passes…* carries — and its slash name. @experimental */
export const ADVANCE_TIME_ACTION_KEY = 'advance-time'

/**
 * What a *Time passes…* press collects: the stepper, opening at one hour
 * forward. Shared by every genre's, so the modal asks
 * the same question everywhere.
 * @experimental
 */
export const TIME_PASSES_COLLECTS = Object.freeze({
	clockStep: Object.freeze({
		label: Object.freeze({ en: 'How much time passes?' }),
		default: Object.freeze({ by: 1, unit: 'hours' as const }),
	}),
})

/** @experimental */
export interface TimePassesOptions {
	id: string
	version: string
	genre: GenreDecl
}

/**
 * The *Time passes…* graph for one genre: the inlet, the clock step, and the
 * clock behind a junction on whether it moves.
 * @experimental
 */
export const timePassesGraph = ({ id, version, genre }: TimePassesOptions) =>
	compile(
		spec(id, {
			version,
			taxonomy: { role: 'action' },
			contributes: {
				actions: [
					{
						key: ADVANCE_TIME_ACTION_KEY,
						venue: { kind: 'composer' },
						quick: true,
						icon: 'clock',
						label: { en: 'Time passes…' },
						description: {
							en: 'Move the story clock on, or back, by an amount you choose. Nothing is posted in the conversation.',
						},
						collects: TIME_PASSES_COLLECTS as any,
					},
				],
			},
		})
			.inlet('input', C.userMessage.v1(), { suits: [] })
			/** The press's step, decided: `{ by, unit }` and whether it moves at all. */
			.task('step', ($) => C.clockStep.v1({ step: $.input.clockStep, params: slot.params() }))
			/**
			 * A person's press, said as one (`cause: 'action'`, live scenes
			 * §15 G4): a time action for the boundary watcher. 🚧 A story
			 * with no clock yet skips the move rather than halting the press
			 * (`onRefusal: 'skip'`, live scenes §15 G12): nothing moves, and
			 * the ledger says *not on the clock* and why, as Adventure's does.
			 * A malformed step still halts — the host's rule, not the story's.
			 */
			.junction('clock', { on: ($) => $.step.moves }, (j) =>
				j.when('moves', { truthy: true }, (c) =>
					c.outlet('advance', ($) =>
						C.advanceStoryClock.v1({
							by: $.step.by,
							unit: $.step.unit,
							cause: 'action',
							onRefusal: 'skip',
							params: slot.params(),
						}),
					),
				),
			)
			.build(),
	)
