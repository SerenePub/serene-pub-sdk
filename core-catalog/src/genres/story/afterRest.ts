/**
 * 🚧 **After a rest** — `core:spec/story-after-rest`, a **routine** on
 * `core:event/rest-taken@1` (GM 2026-10-23, G1 ★5; PLAN-genres-seams S3).
 * Where the session's rules offer a Rest of their own (`core:function/rest@1`,
 * an invokable function), the rules action Rest stands in for Story's
 * (`unlessRulesOffer`): it restores what the rules restore and raises
 * `rest-taken`. What is Story's after it is the time it took — the story
 * clock moves by the rest the rules raised (its minutes, read off the
 * session's rules at run time; else their longest), a keeper's move the
 * session's ledger says as Rest's own is (`cause: 'keeper'`). Nothing else:
 * what a rest restores is the rules' own. Rules that keep no rest, or a rest
 * without minutes (Wherewithal's), move no clock.
 *
 * The Dungeon Crawler's mirror, crawl-sized, is its own *After a rest*
 * (`dungeon-crawler/rest.ts`): the party healed and up, the slots back, the
 * journal's line.
 * @experimental
 */
import { compile, coreEvents, slot, spec } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import { applyWiring, scriptStep, wiring } from '../../shared/calls.js'
import { STORY_AFTER_REST_SCRIPT } from './reckon.js'

/** @experimental */
export const STORY_AFTER_REST_SPEC_ID = 'core:spec/story-after-rest'
/** @internal */
export const STORY_AFTER_REST_VERSION = '1.0.0'

/** @experimental */
export const storyAfterRestSpec = () => {
	const w = wiring()
	const head = spec(STORY_AFTER_REST_SPEC_ID, {
		version: STORY_AFTER_REST_VERSION,
		taxonomy: { role: 'maintenance' },
	})
		/** A routine (D2): the session, and the rest the rules raised (`cause`). */
		.inlet('input', C.routine.v1(), { suits: [coreEvents.restTaken] })
	const rested = scriptStep(
		head,
		w,
		'rest',
		STORY_AFTER_REST_SCRIPT.seedKey,
		($) => ({ cause: $.input.cause, ruleset: $.input.ruleset }),
		'How long the rest took',
		'Resting',
	)
		/** The clock step, decided: `{ by, unit }` and whether it moves at all. */
		.task('step', ($) => C.clockStep.v1({ step: $.rest.main, params: slot.params() }))
		/**
		 * The keeper's move (`cause: 'keeper'`, a time action the scene watcher
		 * reads, as Rest's own is). A story with no clock yet skips the move with
		 * a line in the ledger instead of halting (`onRefusal: 'skip'`).
		 */
		.junction('clock', { on: ($) => $.step.moves }, (j) =>
			j.when('moves', { truthy: true }, (c) =>
				c.outlet(
					'advance',
					($) =>
						C.advanceStoryClock.v1({
							by: $.step.by,
							unit: $.step.unit,
							cause: 'keeper',
							onRefusal: 'skip',
							params: slot.params(),
						}),
					{ expose: { label: 'Move the story clock' } },
				),
			),
		)
	return compile(rested.defaults((p) => applyWiring(p, w)).build())
}
