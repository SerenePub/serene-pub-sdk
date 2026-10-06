/**
 * The Lair's **Build room** action. The genre's actions are introduced in
 * `index.ts`.
 */

import { compile, slot, spec, sessionEvents } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import { lairGenre } from '../../registry/genres.js'

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
 * The layout a drafted room's body takes — its `Exits:` line among it — and
 * why that line is still prose beside the graph.
 *
 * **The ways between rooms are relationships now** (places plan, 2026-09-29):
 * one `narrative_relationships` row per way, read both ways when it has a
 * reverse wording, drawn on the Places lens or in a place's own Links, and
 * written by a pipeline through `core:outlet/link-lore-entries@1`. The Lair's
 * rooms listing asks for them (`withLinks`), so `{{locationEntry}}` says a
 * room's ways out under its body as "From here:" — that, not this line, is
 * what the planner reads the ways on from. *Answer the door* links the room it
 * writes to the room the party stand in (B6).
 *
 * ⚠ **The drafted `Exits:` line stays** (plan §11; how the map should grow is
 * the owner's open Q4). A draft names ways out to rooms that may not exist
 * yet, and nothing in the bound catalogue turns a line of prose into a list
 * of names; parsing it at write time, with stub rooms for the names nothing
 * answers, would change what a knock means. So the line is the room's own
 * words — a reader still reads it, and an older room has only it — and the
 * master turns it into links by hand, or with the place editor's *Read links
 * from the Exits line* (B7). It stays a fixed line so a parser can take it
 * apart.
 * @internal
 */
export const LAIR_ROOM_CONTENT_SHAPE = [
	'Exits: <direction> → <room>, <direction> → <room>',
	'Contents: …',
	'Hazards: …',
	'Occupants: …',
].join('\n')

/**
 * **Build room**: the master writes a room into the dungeon.
 *
 * The collected text (R3) is the room's **name** — the one thing a person always
 * knows when they press this — and the model writes the body against the lore,
 * the party's position and the fixed layout above. The name reaches the draft
 * as `{{turnDirection}}`, and every room the dungeon already has as
 * `{{knownLocations}}` (the rooms listing, plan A28) — the prompt's "name only
 * rooms this dungeon already has" with the rooms in front of it. The world
 * lore it reads carries no private entries. The write then parks at the
 * review gate: `core:outlet/create-lore-entry@1` declares
 * `review: { fields: ['name', 'content'] }`, and the preset below turns the
 * gate ON — without that line `resolvePosition` defaults an undeclared position
 * to `off` and this docblock's promise would be false, which it was until
 * 2026-09-17. The gate IS the Build room form, with the name and the whole body
 * editable before anything lands.
 *
 * **The entry is a location** (L3, contracts batch 2, 2026-09-17): the preset
 * sets `entryType: 'core:entry/location'`, so a room files as a place rather
 * than as world lore whose content happens to be laid out, and "which rows are
 * the map" becomes a question a reader can ask. It is written with no links:
 * a room built ahead of the party stands nowhere yet, and its drafted `Exits:`
 * line is prose the master links by hand — see `LAIR_ROOM_CONTENT_SHAPE`.
 *
 * ⚠ **`effects: 'world'`** (R-15 *The line*): the result is lorebook data, so
 * this action is the owner's, lives in the composer, and no message block may
 * name it. That last rule is why the knock's form cannot save a room itself.
 * @internal
 */
export const lairBuildRoomSpec = () =>
	compile(
		spec(LAIR_BUILD_ROOM_SPEC_ID, {
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
							en: "Write a room into the dungeon. Name it, and edit what the narrator drafts before it's saved.",
						},
					},
				],
			},
		})
			.inlet('input', C.userMessage.v1(), {
				genre: lairGenre,
				event: sessionEvents.sessionAction,
			})
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
			.task('place', ($: any) =>
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
					prompts: slot.prompts({ node: 'context' }),
					variables: slot.variables(),
					params: slot.params(),
					connection: slot.connectionOf('write'),
				}),
			)
			.oracle('write', ($) =>
				C.generateText.v1({
					context: $.prompt.context,
					connection: slot.connection(),
					sampling: slot.sampling(),
					params: slot.params(),
				}),
				{ expose: { status: 'Building the room' } },
			)
			/**
			 * The name is what the master typed, never what the model wrote: a
			 * room the person named is a room they can find again, and the gate
			 * lets them fix it if the composer was empty.
			 */
			.outlet('save', ($) =>
				C.createLoreEntry.v1({
					name: $.input.text,
					content: $.write.text,
					// Named so the entry-kind setting is live rather than
					// rendered and unread (L3); the preset below sets it to a
					// location. `links` is left unwired: a room built ahead of
					// the party joins nothing yet, and its drafted exits are
					// prose the master links (see `LAIR_ROOM_CONTENT_SHAPE`).
					params: slot.params(),
				}),
			)
			/**
			 * ⚠ **The gate is the point, not a precaution** — and this preset is
			 * what makes it true. `resolvePosition` defaults an undeclared review
			 * position to `off`, so until this line the drafted room landed unseen
			 * while the docblock above promised a form. *Answer the door* has
			 * carried the same two lines since L1; this is the pair.
			 */
			.preset('lair', { label: 'Lair', default: true }, (p) =>
				p
					.settings('save', { review: 'on' })
					// A room is a place (L3) — bare id, the way a listing spells
					// them; the version is the row's own column.
					.params('save', { entryType: 'core:entry/location' })
					// The rooms the draft is shown: the dungeon's places.
					.params('gather.rooms.read', { entryTypes: ['core:entry/location'] })
					// The room the place slot shows (the room rule).
					.params('place', { path: 'world.location' }),
			)
			.build(),
	)
