/**
 * The Lair's **Build room** action. The genre's actions are introduced in
 * `index.ts`.
 */

import { compile, slot, spec } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import { bareEntryTypeId, locationEntryType } from '../../registry/entries.js'
import { applyWiring, jsonPart, scriptStep, textPart, wiring } from '../../shared/calls.js'
import { LAIR_ROOM_DRAFT_SCHEMA } from './names.js'
import { LAIR_ROOM_SCRIPT } from './scripts.js'

/* ── Build room ─────────────────────────────────────────────────────────── */

/** @internal */
export const LAIR_BUILD_ROOM_SPEC_ID = 'core:spec/lair-build-room'
// ⚠ Every Lair action that ranks (build room, answer the door, file as a
// room, and the Castellan's whisper/trap/reveal builder), edited in place
// (lorebooks C2, 2026-10-02): a `presences` read and an `eligible` step
// (`core:task/eligibility@1`) between `lore` and `rank`; and Build room,
// Answer the door and File as a room, which show the party's room under
// `{{locationEntry}}`, take the room rule — a `place` step wired into `rank`
// as `shownElsewhere`. Content-addressed; `specHashes.test.ts` records the
// moves.
/** @internal */
export const LAIR_BUILD_ROOM_VERSION = '1.0.0'

/**
 * **Build room**: the GM writes a room into the dungeon (rewritten 2026-10-21,
 * D1, D2, D10).
 *
 * The collected text (R3) is the room's **name**; the Castellan drafts the
 * rest as one JSON answer (`LAIR_ROOM_DRAFT_SCHEMA`): the body in words, its
 * ways out, and — under `fields` — exactly the typed fields the place entry
 * type declares (`jsonSchemaOf(locationEntryType)`), which
 * `create-lore-entry@1`'s `fields` port takes and checks at the gate and the
 * commit. `core:script/lair-room` makes it the write: the body with an
 * *Exits:* line naming every way out, the fields, and **one link per way out
 * to a room the book holds**, in the entry's own commit (`links`). A way to a
 * room nobody built yet stays words, for the knock to answer.
 *
 * The draft is told every room the dungeon has (`{{knownLocations}}`) and
 * reads world lore alone — never anyone's private lore. The write parks at the
 * **review gate** (the preset turns it on): the GM edits the name, the body
 * and the fields before anything lands.
 *
 * ⚠ **`effects: 'world'`** (R-15 *The line*): lorebook data, the owner's, in
 * the composer, and no message block may name it.
 * @internal
 */
export const lairBuildRoomSpec = () => {
	const w = wiring()
	const drafted = spec(LAIR_BUILD_ROOM_SPEC_ID, {
			version: LAIR_BUILD_ROOM_VERSION,
			taxonomy: { role: 'action'},
			contributes: {
				actions: [
					{
						key: 'build-room',
						venue: { kind: 'composer' },
						quick: true,
						icon: 'hammer',
						/** The room's name is the whole instruction (R3): nothing to do without it. */
						collects: { text: { need: 'required', label: { en: 'Room name' } } },
						effects: 'world',
						/** The owner's, and stated rather than inherited — see the note above. */
						audience: { see: ['participant'], act: ['owner'] },
						label: { en: 'Build room' },
						description: {
							en: "Write a room into the dungeon. Name it, and edit what the Castellan drafts before it's saved.",
						},
					},
				],
			},
		})
			.inlet('input', C.userMessage.v1(), { suits: [] })
			.gather('gather', { mode: 'parallel' }, (b) =>
				b
					.chain('history', (c) =>
						c.query('read', ($) =>
							C.sessionHistory.v1({
								scope: $.input.sessionScope,
								params: slot.params(),
							}),
						),
					)
					/** The world as the lore tells it, ranked against the conversation. */
					.chain('lore', (c) =>
						c.query('read', ($) =>
							C.worldLore.v1({
								scope: $.input.sessionScope,
								params: slot.params(),
							}),
						),
					)
					.chain('cast', (c) =>
						c.query('read', ($) => C.sessionCast.v1({ scope: $.input.sessionScope })),
					)
					.chain('state', (c) =>
						c.query('read', ($) => C.sessionState.v1({ scope: $.input.sessionScope })),
					)
					/**
					 * Every room the dungeon holds (location entries, the
					 * preset), by listing rather than by rank — what this room
					 * has to join onto, named to the draft whatever the
					 * ranker admitted.
					 */
					.chain('rooms', (c) =>
						c.query('read', ($) =>
							C.lorebookEntries.v1({
								scope: $.input.sessionScope,
								params: slot.params(),
							}),
						),
					),
			)
			.task('contextBudget', ($) =>
				C.contextBudget.v1({
					sampling: slot.samplingOf('write'),
					connection: slot.connectionOf('write'),
					params: slot.params(),
				}),
			)
			.task('lore', ($) =>
				C.concatCandidates.v1({
					sources: [$.gather.history.read.band, $.gather.lore.read.main] as any,
				}),
			)
			// The room `{{locationEntry}}` shows (the room rule, 2026-10-02):
			// the world's location at `world.location` (the preset's `path`),
			// by the one room rule; the ranker leaves it out of the lore.
			.task('place', ($) =>
				C.undescribedName.v1({
					name: $.gather.state.read.state,
					locationEntries: $.gather.rooms.read.entries,
					params: slot.params(),
				}),
				{ expose: { label: 'The current place' } },
			)
			// Who is in the world at the session's moment (R4), for `eligible`.
			.query('presences', ($) => C.castPresences.v1({ scope: $.input.sessionScope }))
			// The hard gates before the ranker (C2; R2, R4): selective-logic
			// exclusions from the keyword lanes, and the presence gate.
			.task('eligible', ($) =>
				C.eligibility.v1({
					candidates: $.lore.candidates,
					exclusions: $.gather.lore.read.exclusions,
					presences: $.presences.main,
					at: $.presences.at,
				}),
			)
			.task('rank', ($) =>
				C.rankHybrid.v1({
					candidates: $.eligible.candidates,
					budget: $.contextBudget.available,
					shownElsewhere: $.place.entryId,
					params: slot.params(),
				}),
			)
			.task('context', ($) =>
				C.buildTemplateContext.v1({
					cast: $.gather.cast.read.cast,
					state: $.gather.state.read.state,
					locationEntries: $.gather.rooms.read.entries,
					// The room's name, as the master typed it.
					turnDirection: $.input.text,
					prompts: slot.prompts(),
					variables: slot.variables(),
				}),
			)
			/** Prose and no seed: a room is drafted, not spoken. */
			.task('lines', ($) =>
				C.proseTranscript.v1({
					messages: $.gather.history.read.messages,
					cast: $.gather.cast.read.cast,
					templateContext: $.context.templateContext,
				}),
			)
			/**
			 * 🚧 **The transcript's files, placed** (attachments follow-ups, owner
			 * ruling 2026-10-03) — `respond`'s two steps: the files the rows show,
			 * then per line what `write` receives (an image it can read rides its
			 * own turn; otherwise its name). A transcript with no files passes
			 * through untouched, so the prompt is byte for byte what it was.
			 */
			.query('attachments', ($) =>
				C.historyAttachments.v1({
					messages: $.gather.history.read.messages,
					params: slot.params(),
				}),
			)
			.task('attached', ($) =>
				C.placeAttachments.v1({
					messages: $.lines.messages,
					attachments: $.attachments.attachments,
					connection: slot.connectionOf('write'),
					params: slot.params(),
				}),
			)
			.task('prompt', ($) =>
				C.assemble.v2({
					candidates: $.rank.candidates,
					decisions: $.rank.decisions,
					groups: $.rank.groups,
					budget: $.contextBudget.available,
					messages: $.attached.messages,
					templateContext: $.context.templateContext,
					template: slot.template(),
					prompts: slot.prompts($.context),
					variables: slot.variables(),
					params: slot.params(),
					connection: slot.connectionOf('write'),
				}),
			)
			.oracle(
				'write',
				($) =>
					C.generateJson.v1({
						context: $.prompt.context,
						schema: LAIR_ROOM_DRAFT_SCHEMA as any,
						connection: slot.connection(),
						sampling: slot.sampling(),
						params: slot.params(),
					}),
				{ expose: { status: 'Building the room', label: 'Draft the room' } },
			)
	/**
	 * The draft, made into the write (`core:script/lair-room`): the GM's own
	 * name, the body with its *Exits:* line, the typed fields, the links.
	 */
	const made = jsonPart(
		jsonPart(
			textPart(
				scriptStep(
					drafted,
					w,
					'room',
					LAIR_ROOM_SCRIPT.seedKey,
					($) => ({ draft: $.write.json, name: $.input.text, rooms: $.gather.rooms.read.entries }),
					'The draft, made into the room',
				),
				w,
				'content',
				($) => $.room.main,
				'content',
				"The room's body",
			),
			w,
			'fields',
			($) => $.room.main,
			'fields',
			"The room's fields",
		),
		w,
		'links',
		($) => $.room.main,
		'links',
		"The room's ways to rooms the book holds",
	)
	return compile(
		made
			/**
			 * The name is what the GM typed, never what the model wrote: a room
			 * the person named is a room they can find again.
			 */
			.outlet('save', ($) =>
				C.createLoreEntry.v1({
					name: $.input.text,
					content: $.content.text,
					fields: $.fields.main,
					links: $.links.main,
					params: slot.params(),
				}),
			)
			/**
			 * ⚠ **The gate is the point** — `resolvePosition` defaults an
			 * undeclared review position to `off`, so without this line the
			 * draft would land unseen.
			 */
			.defaults((p) =>
				applyWiring(
					p
						.settings('save', { review: 'on' })
						// A room is a place (L3) — bare id, the way a listing spells them.
						.params('save', { entryType: bareEntryTypeId(locationEntryType) })
						// The rooms the draft is shown: the dungeon's places.
						.params('gather.rooms.read', { entryTypes: [bareEntryTypeId(locationEntryType)] })
						// The room the place slot shows (the room rule).
						.params('place', { path: 'world.location' }),
					w,
				),
			)
			.build(),
	)
}
