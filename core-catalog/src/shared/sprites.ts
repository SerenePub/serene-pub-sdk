/**
 * Sprites in the reply road (DESIGN-sprites §5, 2026-09-24; in-pipeline
 * 2026-10-05).
 *
 * ## The step, written into each reply spec
 *
 * After `save` has committed the line, every reply spec that writes a
 * character's line writes the same two steps out itself — so choosing a face
 * never delays the reply, and a reader of the spec sees every input:
 *
 *   spritePick  (oracle pick-sprite, a session setting)   the sprite picker,
 *               handed the line's text, whose line it is, and the session
 *   spriteShow  (outlet show-sprite, `source: 'picker'`)  record it on the line
 *
 * Seven specs carry it: chat-respond, tool-loop, chat-side-character,
 * guide-respond, adventure-respond, chat-narrate, and lair-respond (in its
 * character turn, the one branch where a single delver speaks). A spec whose line has no character —
 * a narrator's — wires no speaker, and the picker picks nothing.
 *
 * ⚠ **No wrapper.** Until 2026-10-05 `withSpriteTail(builder)` appended four
 * nodes the spec sources never named — a `sprites-for` query that re-read the
 * line from its message id and embedded inside the host, a junction, a pure
 * picker task, and the outlet — and the host read the picker's `enabled` ahead
 * of the run. The owner ruled it in-pipeline ("not a wrapper"), with the
 * line's text passed in explicitly.
 *
 * ## Not free with an embedding service
 *
 * The picker embeds the line and the set's labels through the install's
 * active embedding connection. With a local model that costs nothing; with a
 * service it is a provider call — one per reply whose speaker has sprites,
 * after the save. A speaker with no sprites costs nothing, and "Choose
 * sprites" off costs nothing either: the picker returns before it embeds.
 *
 * ## Why a step on each reply spec and not a spec of its own
 *
 * The natural home — a spec answering `message-completed` — does not fit:
 * dispatch resolves ONE spec per (preset, event), and every genre already
 * binds `message-completed` to its turn-order spec. A step on each reply spec
 * keeps the choice in the reply's own run and receipt without changing the
 * dispatch rule (§5.1, option A).
 *
 * ## The picker is a session setting
 *
 * `expose: { session: true }`, so "Choose sprites", stickiness and the floor
 * are the session's to set through the existing pipeline cards — stored per
 * spec at the picker's node key, `SPRITE_PICKER_NODE_KEY`.
 */
import { compile, spec } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'

// ⚠ `core:spec/show-sprite` 1.0.0, edited in place (2026-10-05, sprites
// in-pipeline) — content-addressed; `specHashes.test.ts` records the move.
// Its outlet states `source: 'person'`, which the host decided from the spec
// id until then.
/** @internal */
export const SPRITES_VERSION = '1.0.0'

/** A person's pick from the message menu, run as an action (§6). @experimental */
export const SHOW_SPRITE_SPEC_ID = 'core:spec/show-sprite'

/**
 * The picker's node key on a reply spec's spine — the address its session
 * settings are stored at. Six of the seven specs place it here; lair-respond
 * places it inside its character turn
 * (`via.turn.channel.story.door.play.speech.each.character.turn.spritePick`).
 * @internal
 */
export const SPRITE_PICKER_NODE_KEY = 'spritePick'

/**
 * ⏳ **Migration only.** Where the picker sat inside the retired sprite tail
 * (2026-09-24 → 2026-10-05), on respond, tool-loop, narrate-character and
 * guide-respond (the first and third are `chat-respond` and
 * `chat-side-character` since 2026-10-05). Session settings stored at this key are moved to
 * `SPRITE_PICKER_NODE_KEY` once; nothing else may read it. Delete it with
 * that migration.
 * @internal
 */
export const SPRITE_PICKER_NODE_KEY_V0 = 'spriteTail.show.spritePick'

/** Core's pickers: the one all-in-one oracle. @internal */
export const SPRITE_PICKER_IDS = ['core:oracle/pick-sprite@1'] as const

/**
 * A person's pick (§6): the message menu's **Change sprite**, run as an
 * action so the write is receipted and emits `sprite-shown` like any other.
 * The spec says `source: 'person'`; the host accepts that from THIS spec and
 * no other, and checks the person may act on the line (the `item` rule), as
 * it does for an edit.
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
				C.showSprite.v1({
					target: $.input.target,
					pick: $.input.sprite,
					source: 'person',
				}),
			)
			.build(),
	)
