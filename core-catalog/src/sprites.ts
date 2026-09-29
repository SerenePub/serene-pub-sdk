/**
 * Sprites in the reply road (DESIGN-sprites §5, 2026-09-24).
 *
 * ## The tail
 *
 * `withSpriteTail(builder)` appends the same few nodes to every reply spec,
 * after its `save` has committed the line — so choosing a face never delays
 * the reply, and one definition serves every genre:
 *
 *   sprites (query sprites-for)          what the speaker can show, and the
 *                                        line's and labels' vectors
 *   spriteTail (junction on `has`)       nothing to choose → stop quietly
 *     show.spritePick  (task, REBINDABLE)    the sprite picker
 *     show.spriteShow  (outlet show-sprite)  record it on the line
 *
 * The vectors come from the LOCAL embedding lane inside `sprites-for` (as
 * `entity-link` embeds names), never from a connection, so the
 * one-model-call-per-turn rule holds — and no `embed-text` node is placed,
 * which would add a connection control to every reply spec that nothing
 * reads. With no embedding model loaded the vectors are null and the default
 * picker picks nothing, which leaves the line showing the speaker's last face.
 *
 * ## Why a tail and not a spec of its own
 *
 * The natural home — a spec answering `message-completed` — does not fit:
 * dispatch resolves ONE spec per (preset, event), and every genre already
 * binds `message-completed` to its turn-order spec. A tail on each reply spec
 * keeps the choice in the reply's own run and receipt without changing the
 * dispatch rule (§5.1, option A).
 *
 * ## The picker is a rebind
 *
 * `SPRITE_PICKER_NODE_KEY` is rebound per session exactly as the Turn order
 * control rebinds a turn-order spec's strategy: every picker publishes
 * `core:shape/sprite-pick@1` on `main`, so the shape-based swap list offers
 * them — core's `pick-sprite-similarity` and any plugin's pure task
 * publishing the same shape. Turning sprites off is that picker's `enabled`
 * parameter, not a second node.
 */
import { compile, spec, slot } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'

/** @internal */
export const SPRITES_VERSION = '1.0.0'

/** A person's pick from the message menu, run as an action (§6). @experimental */
export const SHOW_SPRITE_SPEC_ID = 'core:spec/show-sprite'

/** The picker's node key inside the tail — the address a rebind names. @internal */
export const SPRITE_PICKER_NODE_KEY = 'spriteTail.show.spritePick'

/** Core's pickers. One today; a plugin's pure task publishing `sprite-pick@1` joins it. @internal */
export const SPRITE_PICKER_IDS = ['core:task/pick-sprite-similarity@1'] as const

/**
 * Append the sprite tail to a reply spec's builder. The builder must already
 * hold an inlet keyed `input` publishing `sessionScope` and an outlet keyed
 * `save` publishing `messageId` — every reply spec in the catalog does.
 * @experimental
 */
export function withSpriteTail<B>(builder: B): B {
	return (builder as any)
		.query('sprites', ($: any) =>
			C.spritesFor.v1({
				scope: $.input.sessionScope,
				message: $.save.messageId,
			}),
		)
		.junction('spriteTail', { on: ($: any) => $.sprites.main }, (r: any) =>
			r.when('show', { path: 'has', truthy: true }, (c: any) =>
				c
					.task(
						'spritePick',
						($: any) =>
							C.pickSpriteSimilarity.v1({
								choices: $.sprites.choices,
								lineVector: $.sprites.lineVector,
								labelVectors: $.sprites.labelVectors,
								params: slot.params(),
							}),
						// A declared session setting (§4.11): "Choose sprites",
						// stickiness and the floor are the session's to set, in
						// session settings beside the turn controls.
						{ expose: { session: true } },
					)
					.outlet('spriteShow', ($: any) =>
						C.showSprite.v1({
							target: $.save.messageId,
							pick: $.spriteTail.show.spritePick.main,
						}),
					),
			),
		) as B
}

/**
 * A person's pick (§6): the message menu's **Change sprite**, run as an
 * action so the write is receipted and emits `sprite-shown` like any other.
 * The host records `source: 'person'` for THIS spec and no other, and checks
 * the person may act on the line (the `item` rule), as it does for an edit.
 * @experimental
 */
export const showSpriteSpec = () =>
	compile(
		spec(SHOW_SPRITE_SPEC_ID, {
			version: SPRITES_VERSION,
			taxonomy: { role: 'action' },
		})
			.inlet('input', C.builtInRequest.v1())
			.outlet('write', ($) =>
				C.showSprite.v1({ target: $.input.target, pick: $.input.sprite }),
			)
			.build(),
	)

