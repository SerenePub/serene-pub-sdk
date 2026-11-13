/**
 * 🚧 **The scenes routine** — `core:spec/scene-boundaries`, a **routine**
 * (owner 2026-11-12; every name here is provisional): code only, no model,
 * run every few rounds. Core genres register it every 2 rounds, looking back
 * 2 rounds (`core:query/scene-boundaries@1`'s `depth`).
 *
 * It owns finding and placing scene boundaries a couple of rounds late:
 * `core:query/scene-boundaries@1` reads the session's `main` channel for where
 * the day or the place changed, or another moment chosen under Scenes, and
 * each boundary it finds goes through the existing outlet
 * (`core:outlet/propose-scene-cue@1`), one at a time in line order. The
 * session's scene mode decides what a placed scene cue becomes: a scene
 * begun, or a *New scene?* suggestion.
 *
 * It does not own a person's *Start scene* / *End scene* / *Mark as scene*,
 * which stay immediate; the judged scene check (the sweep's); scene summaries;
 * or the open scene's cast refresh. A genre or preset that does not register
 * it gets no automatic scene boundaries.
 *
 * ⚠ Not the round tick (`core:spec/round-tick`, an event pipeline, not a
 * routine).
 * @experimental
 */
import { compile, coreEvents, ITEM, slot, spec } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import { applyWiring, jsonPart, textPart, wiring } from './calls.js'

/** @experimental */
export const SCENE_BOUNDARIES_SPEC_ID = 'core:spec/scene-boundaries'
/** @internal */
export const SCENE_BOUNDARIES_VERSION = '1.0.0'

/** @experimental */
export const sceneBoundariesSpec = () => {
	const w = wiring()
	return compile(
		spec(SCENE_BOUNDARIES_SPEC_ID, {
			version: SCENE_BOUNDARIES_VERSION,
			taxonomy: { role: 'maintenance' },
		})
			.inlet('input', C.routine.v1(), { suits: [coreEvents.roundEnded] })
			// The purpose is allowed here because the whole spec calls no model.
			.query(
				'find',
				($) =>
					C.sceneBoundaries.v1({
						scope: $.input.sessionScope,
						routine: $.input.routine,
						params: slot.params(),
					}),
				{
					expose: {
						label: 'Where scenes begin',
						status: 'Looking for where scenes begin',
						purpose: 'Finds where one scene ends and the next begins. Calls no model.',
					},
				},
			)
			.each('boundary', { over: ($) => $.find.main, max: 20, mode: 'sequential' }, (m) =>
				textPart(
					textPart(
						jsonPart(m, w, 'at', ($) => $[ITEM], 'at', 'Where the scene begins'),
						w,
						'trigger',
						($) => $[ITEM],
						'trigger',
						'What began it',
					),
					w,
					'reason',
					($) => $[ITEM],
					'reason',
					'Why it began',
				).outlet(
					'place',
					($) =>
						C.proposeSceneCue.v1({
							at: $.at.main,
							channel: 'main',
							reason: $.reason.text,
							trigger: $.trigger.text,
							params: slot.params(),
						}),
					{ expose: { label: 'Mark the new scene' } },
				),
			)
			.defaults((p) => applyWiring(p, w))
			.build(),
	)
}
