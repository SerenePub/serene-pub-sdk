/**
 * 🚧 **The scene summaries routine** — `core:spec/scene-summaries`, a
 * **routine** (owner 2026-11-12, "maybe 6 rounds deep"; every name here is
 * provisional): code only, no model of its own, run every few rounds. Core
 * genres register it every 2 rounds, with `core:query/scene-summary-due@1`'s
 * `depth` at its default, 6 rounds after a scene ends.
 *
 * It owns finding the one finished scene that is due a summary
 * (`core:query/scene-summary-due@1`, the oldest on `main`) and starting the
 * genre's own scene summarizer for it (`core:outlet/summarize-finished-scene@1`),
 * at most one scene per run. The outlet reads the routine's `routine` port, so
 * the routine's mode (Full, or Review) decides what the summary becomes.
 *
 * It does not own the summarizer's prompts and model calls, which are the
 * genre's own summarize-scene spec's; a person's *Summarize*, *Summarize all*
 * or *On close*; *Compile to Entry* and history entries; or new characters,
 * which stay off: the scene summarizer's `extractsCast` is on ice by the
 * 2026-09-08 ruling, and this routine neither thaws it nor adds a toggle. A
 * genre or preset that does not register it gets no automatic scene
 * summaries.
 *
 * ⚠ Not the scenes routine (`core:spec/scene-boundaries`, which places scene
 * boundaries). Every UI string here is 🚧 provisional.
 * @experimental
 */
import { compile, coreEvents, slot, spec } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'

/** @experimental */
export const SCENE_SUMMARIES_SPEC_ID = 'core:spec/scene-summaries'
/** @internal */
export const SCENE_SUMMARIES_VERSION = '1.0.0'

/** @experimental */
export const sceneSummariesSpec = () =>
	compile(
		spec(SCENE_SUMMARIES_SPEC_ID, {
			version: SCENE_SUMMARIES_VERSION,
			taxonomy: { role: 'maintenance' },
		})
			.inlet('input', C.routine.v1(), { suits: [coreEvents.roundEnded] })
			// The purpose is allowed here because the whole spec calls no model; the routines list prints the first one.
			.query(
				'find',
				($) => C.sceneSummaryDue.v1({ scope: $.input.sessionScope, params: slot.params() }),
				{
					expose: {
						label: 'Finished scenes',
						status: 'Looking for a finished scene to summarize',
						purpose:
							"Summarizes each scene a few rounds after it ends, with the genre's scene summarizer.",
					},
				},
			)
			// ⚠ Reads `$.input.routine`: a routine runner forces an outlet to Review when its pipeline never reads the routine port.
			.outlet(
				'summarize',
				($) =>
					C.summarizeFinishedScene.v1({ scene: $.find.main, routine: $.input.routine }),
				{ expose: { label: 'Summarize the scene' } },
			)
			.build(),
	)
