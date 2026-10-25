/**
 * 🚧 **A ruleset's action** — `core:spec/rules-action` (PLAN-rulesets-
 * functions D6; lane A2, 2026-10-23): the one generic pipeline every
 * ruleset action runs. The host offers each **invokable** function of the
 * session's ruleset (`FunctionProps.invokable`: _Rest_, _Draw_, _Give_) as an
 * action registration of this pipeline — its label and form the function
 * header's — and a press enters through `core:inlet/rules-action@1`.
 *
 * One step does the work: the ruleset handler runs the invokable function
 * with the answer (`ruleset-resolve`, the payload on its `actions` port), and
 * the same step is the write — under the action registration's mode, Full
 * applies what the function changed, Review files each change for the
 * session's owner. The outcome block, the lines and the events the function
 * raised (emitted after the receipt) are the handler's. Functions never
 * write (R8): this pipeline is what stores.
 *
 * No genre and no lock: a session of any genre may play a ruleset with
 * actions.
 * @experimental
 */
import { compile, slot, spec } from "@serene-pub/sdk"
import * as C from "@serene-pub/contracts"

/** @experimental */
export const RULES_ACTION_SPEC_ID = "core:spec/rules-action"
/** @experimental */
export const RULES_ACTION_VERSION = "1.0.0"

/** 🚧 The rules-action pipeline, as a document. @experimental */
export const rulesActionSpec = () =>
	compile(
		spec(RULES_ACTION_SPEC_ID, {
			version: RULES_ACTION_VERSION,
			taxonomy: { role: "action" }
		})
			.inlet("input", C.rulesAction.v1(), { suits: [] })
			/**
			 * The registration's mode: Review holds every change the function
			 * asks for the owner; anything else (Full, the default) applies it.
			 */
			.junction("commit", { on: ($) => $.input.mode }, (j) =>
				j
					.when("reviewed", { equals: "review" }, (c) =>
						c.task(
							"propose",
							($) =>
								C.rulesetResolve.v1({
									params: slot.params(),
									scope: $.input.sessionScope,
									actions: $.input.main,
									mode: "propose"
								}),
							{ expose: { label: "Propose what it changes", status: "Working out the rules" } }
						)
					)
					.otherwise("applied", (c) =>
						c.task(
							"apply",
							($) =>
								C.rulesetResolve.v1({
									params: slot.params(),
									scope: $.input.sessionScope,
									actions: $.input.main,
									mode: "apply"
								}),
							{ expose: { label: "Apply what it changes", status: "Working out the rules" } }
						)
					)
			)
			.build()
	)
