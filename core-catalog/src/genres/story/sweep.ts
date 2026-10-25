/**
 * 🚧 **The sweep** — `core:spec/story-sweep`, a **routine** (PLAN-layering
 * §4, R5, R37; 2026-10-20): every few turns, ONE batched JSON call looks back
 * over the story and files what is worth keeping — a summary, new lore and
 * people, how the characters stand, the world as it now stands, the places
 * used, the goals. Each lands through the writes core already has: written
 * on **Full**, held for review on **Review** (the routine's mode).
 *
 * Was the `sweep` junction at the tail of `core:spec/story-respond`, due
 * when the host said so. Its cadence says so now — `everyNTurns({ n: 5 })`
 * in the Story genre's defaults; `afterEachScene()` is an administrator's
 * swap (R36). It reads only the session, so it fits any cadence.
 *
 * Its duties are its own settings, a switch each
 * (`core:task/sweep-duties@1`); with none on, nothing is asked. The
 * branches are `reckon.ts`'s.
 * @experimental
 */
import { compile, slot, spec, coreEvents, type ChainBuilder } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import { CORE_LOADOUT } from '../../loadouts.js'
import { applyWiring, heldForReview, wiring, type ChainNodes, type NodeOn } from '../../shared/calls.js'
import { sweepBranch } from './reckon.js'

/** @experimental */
export const STORY_SWEEP_SPEC_ID = 'core:spec/story-sweep'
/** @internal */
export const STORY_SWEEP_VERSION = '1.0.0'

/** The routine's head: its inlet, its duties, and what the sweep looks back over. */
const sweepHead = () =>
	spec(STORY_SWEEP_SPEC_ID, {
		version: STORY_SWEEP_VERSION,
		taxonomy: { role: 'maintenance' },
	})
		/** A routine (D2): the session, where it resides, what its event carried. */
		.inlet('input', C.routine.v1(), { suits: [coreEvents.turnEnded, coreEvents.sceneClosed] })
		/** Its duties — a switch each, the owner's — at the routine's mode. No model call. */
		.task('duties', ($) => C.sweepDuties.v1({ routine: $.input.routine, params: slot.params() }), {
			// The duties card is titled by the routine's name (`CORE_SPECS`, S7) — never the internal word.
			expose: { session: true, label: 'Look back over the story' },
		})
		/** What the sweep looks back over: the story, and who is seated. */
		.query('history', ($) => C.sessionHistory.v1({ scope: $.input.sessionScope, params: slot.params() }), {
			expose: { label: 'The story so far', status: 'Looking back over the story' },
		})
		.query('cast', ($) => C.sessionCast.v1({ scope: $.input.sessionScope }), {
			expose: { label: 'Who is seated', status: 'Looking back over the story' },
		})

/** The chain the sweep's branch extends — `sweep.due`, after the head (`reckon.ts`). @internal */
export type SweepDue = ChainBuilder<ChainNodes<ReturnType<typeof sweepHead>>, 'sweep.due'>

/** @experimental */
export const storySweepSpec = () => {
	const w = wiring()
	/** The writes the declared defaults hold at the review gate — the sweep's Review arms. */
	const review: NodeOn[] = []
	return compile(
		sweepHead()
			.junction('sweep', { on: ($) => $.duties.any }, (j) =>
				j.when('due', { truthy: true }, (s) => sweepBranch(s, w, review)),
			)
			/** On Extraction (I12); what its steps name; every Review write behind the review gate. */
			.defaults((p) =>
				heldForReview(applyWiring(p.loadout('sweep.due.sweepWrite', slot.loadout(CORE_LOADOUT.extraction)), w), review),
			)
			.build(),
	)
}
