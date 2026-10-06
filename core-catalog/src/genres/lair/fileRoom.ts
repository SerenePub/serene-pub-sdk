/**
 * The Lair's **File as a room** action, on a message's ⋮. The genre's actions
 * are introduced in `index.ts`.
 */

import { compile, slot, spec, sessionEvents } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import { LAIR_CASTELLAN_KEY, SANCTUM_CHANNEL, lairGenre } from '../../registry/genres.js'

/**
 * The Castellan's reference — who says a room is already filed.
 *
 * ⚠ **A room draft reads the book's public half and nothing else** (plan
 * A28): the world-lore and history lanes, never character lore. A room entry
 * is public lore — every delver's voice reads it, and so does every session
 * on the book. Character lore is private whoever reads it: read with no
 * speaker it is the omniscient narrator's (a background member's entries and
 * every unbound one), and read as anybody it still carries the private lore
 * of a persona someone plays in the session, which every voice of that
 * session may read. Either way a secret keyed on the conversation could be
 * drafted into a room anybody reads, so the drafts read no character lore
 * at all. *Build room* reads world lore alone.
 */
const CASTELLAN = `envoy:${LAIR_CASTELLAN_KEY}` as const

/* ── File as a room ─────────────────────────────────────────────────────── */

/** @internal */
export const LAIR_FILE_ROOM_SPEC_ID = 'core:spec/lair-file-room'
/** @internal */
export const LAIR_FILE_ROOM_VERSION = '1.0.0'

/**
 * **File as a room** — a room described in a message reaches the lorebook
 * (lair re-plan R11, 2026-09-28; owner ruling 1: the Sanctum is where the map
 * is laid out ahead of time, and a planned room reaches the lorebook only
 * through a review-gated write).
 *
 * The rooms worth filing are written in prose first: the master narrates the
 * party into one on `main` (the person is the narrator, F2), plans one with the
 * Castellan in the Sanctum, or the Castellan narrates one when it is fired. So
 * this lives on the **message** — a row's ⋮ — and acts on that row: its text is
 * read by id (`session-history@1`'s `messageId`, the inlet's), never sent by
 * the client.
 *
 * **Whose rows.** The person's and the Castellan's — any row that is not a
 * character's line (`item.characterLine equals false`, the grammar's one
 * condition: *the person's or the Castellan's* is exactly *not a delver's*). A
 * delver naming a door is not the dungeon's plan, which is the same rule the
 * room check applies to prose (`undescribed-name@1`, R7). Greyed there with
 * the sentence, and refused at the door with the same one.
 *
 * **The name is collected** (R3's collect modal): required, because it is what
 * the person can find the room by again (*Build room*'s rule), because a
 * message may describe more than one room and the name says which, and
 * because it is what the duplicate check runs on — before any model call, so
 * a room already in the book costs nothing. It stays editable at the review
 * gate, where the draft is.
 *
 * **Then, R9's drafted path.** A room already in the book by the SDK's name
 * rule (`undescribed-name@1` over the location entries, then the whole book;
 * no prose read — the row itself is prose) is not filed twice: the Castellan
 * says so on the Sanctum, and nothing is written. Otherwise the Castellan
 * drafts the entry from that one row in *Build room*'s layout
 * (`LAIR_ROOM_CONTENT_SHAPE`, `Exits:` when the message names them) and
 * `create-lore-entry`'s **review gate** holds it — even from the person's own
 * row, because the row may say more than the room. Approved, it lands as a
 * **location**; rejected, nothing is written.
 *
 * ⚠ **`effects: 'world'` in the `message` venue.** A row's ⋮ is the owner's
 * side of the effects line since this action (`WORLD_ACTION_VENUES`, R11):
 * the owner's own press, the row its subject. `act` stays `owner`; no block
 * names it; no answer pipeline presses it.
 * @internal
 */
export const lairFileRoomSpec = () =>
	compile(
		spec(LAIR_FILE_ROOM_SPEC_ID, {
			version: LAIR_FILE_ROOM_VERSION,
			taxonomy: { role: 'action' },
			contributes: {
				actions: [
					{
						key: 'file',
						venue: { kind: 'message' },
						icon: 'map',
						/** The room's name (R3): which room, what it is found by, what the duplicate check reads. */
						collects: {
							text: {
								need: 'required',
								label: { en: 'Room name' },
								placeholder: { en: 'The Sunken Vault' },
							},
						},
						enabledWhen: [
							{
								on: 'item.characterLine',
								equals: false,
								reason: {
									en: "a delver's line is theirs, not the dungeon's plan — file a room from your own lines or the Castellan's",
								},
							},
							{
								on: 'item.hidden',
								equals: false,
								reason: { en: 'unhide it first — a hidden message is left out of what the Castellan reads' },
							},
							{ on: 'item.generating', equals: false, reason: { en: 'wait for the message to finish' } },
						],
						/** Lorebook data: outside the story (R-15 *The line*), the owner's alone. */
						effects: 'world',
						audience: { see: ['participant'], act: ['owner'] },
						label: { en: 'File as a room' },
						description: {
							en: 'Save the room this message describes to the lorebook. Name it; the Castellan drafts the entry from the message, and you edit it before it is saved.',
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
					/** The message the press was made on — one row, by id. */
					.chain('row', (c) =>
						c.query('read', ($) =>
							C.sessionHistory.v1({
								scope: $.input.sessionScope,
								messageId: $.input.messageId,
								params: slot.params(),
							}),
						),
					)
					/** The book's public half — world lore and history, never character lore (see the note on `CASTELLAN`). */
					.chain('worldLore', (c) =>
						c.query('read', ($) =>
							C.worldLore.v1({
								scope: $.input.sessionScope,
								params: slot.params(),
							}),
						),
					)
					.chain('historyEntries', (c) =>
						c.query('read', ($) =>
							C.historyEntries.v1({
								scope: $.input.sessionScope,
								params: slot.params({ node: 'gather.worldLore.read' }),
							}),
						),
					)
					/** The dungeon's rooms (location entries, the preset): checked first, and named to the draft. */
					.chain('rooms', (c) =>
						c.query('read', ($) =>
							C.lorebookEntries.v1({
								scope: $.input.sessionScope,
								params: slot.params(),
							}),
							{ expose: { label: 'Rooms' } },
						),
					)
					/** The whole book, any entry type — a room is filed when ANY entry answers to its name (R7). */
					.chain('lorebook', (c) =>
						c.query('read', ($) =>
							C.lorebookEntries.v1({
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
					),
			)
			/**
			 * Is the name already in the book — the SDK's name rule, entries
			 * only (`messages` unwired: the row being filed is prose, and would
			 * describe the room it describes). `undescribed` is the name,
			 * trimmed, when nothing answers to it.
			 */
			.task('check', ($) =>
				C.undescribedName.v1({
					name: $.input.text as any,
					locationEntries: $.gather.rooms.read.entries,
					entries: $.gather.lorebook.read.entries,
					params: slot.params(),
				}),
			)
			.task('contextBudget', ($) =>
				C.contextBudget.v1({
					sampling: slot.samplingOf('room.new.write'),
					connection: slot.connectionOf('room.new.write'),
					params: slot.params(),
				}),
			)
			.task('lore', ($) =>
				C.concatCandidates.v1({
					sources: [
						$.gather.row.read.band,
						$.gather.worldLore.read.main,
						$.gather.historyEntries.read.main,
					] as any,
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
					exclusions: [$.gather.worldLore.read.exclusions, $.gather.historyEntries.read.exclusions] as any,
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
			/**
			 * 🚧 **The files those rows show** (attachments follow-ups, owner
			 * ruling 2026-10-03), read once on the spine; the drafting arm below
			 * places them for `room.new.write` — an image it can read rides its own
			 * turn, otherwise its name. No files, and the arm's prompt is byte for
			 * byte what it was.
			 */
			.query('attachments', ($) =>
				C.historyAttachments.v1({
					messages: $.gather.row.read.messages,
					params: slot.params(),
				}),
			)
			.junction('room', { on: ($: any) => $.check.undescribed }, (r) =>
				r
					/**
					 * Not in the book: the Castellan drafts it from the row, in
					 * the dungeon's layout, and the master edits it at the gate.
					 * The name is the one typed (trimmed); the other rooms are
					 * named to the draft so its exits can point at them.
					 */
					.when('new', { truthy: true }, (c) =>
						c
							.task('context', ($: any) =>
								C.buildTemplateContext.v1({
									cast: $.gather.cast.read.cast,
									state: $.gather.state.read.state,
									locationEntries: $.gather.rooms.read.entries,
									turnDirection: $.check.undescribed,
									prompts: slot.prompts(),
									variables: slot.variables(),
								}),
							)
							/** The one row, as prose: the draft is written from it and nothing else said. */
							.task('lines', ($: any) =>
								C.proseTranscript.v1({
									messages: $.gather.row.read.messages,
									cast: $.gather.cast.read.cast,
									templateContext: $.room.new.context.templateContext,
								}),
							)
							.task('attached', ($: any) =>
								C.placeAttachments.v1({
									messages: $.room.new.lines.messages,
									attachments: $.attachments.attachments,
									connection: slot.connectionOf('room.new.write'),
									params: slot.params(),
								}),
							)
							.task('prompt', ($: any) =>
								C.assemble.v2({
									candidates: $.rank.candidates,
									decisions: $.rank.decisions,
									groups: $.rank.groups,
									budget: $.contextBudget.available,
									messages: $.room.new.attached.messages,
									templateContext: $.room.new.context.templateContext,
									template: slot.template(),
									prompts: slot.prompts({ node: 'room.new.context' }),
									variables: slot.variables(),
									params: slot.params(),
									connection: slot.connectionOf('room.new.write'),
								}),
							)
							.oracle('write', ($: any) =>
								C.generateText.v1({
									context: $.room.new.prompt.context,
									connection: slot.connection(),
									sampling: slot.sampling(),
									params: slot.params(),
								}),
								{ expose: { status: 'The Castellan drafts the room' } },
							)
							.outlet('save', ($: any) =>
								C.createLoreEntry.v1({
									name: $.check.undescribed,
									content: $.room.new.write.text,
									params: slot.params(),
								}),
							),
					)
					/**
					 * Already in the book: nothing is filed twice. The Castellan
					 * says so at its own table — a plain line, no model call —
					 * so the press is answered rather than silent.
					 */
					.otherwise('exists', (c) =>
						c
							.task('note', ($: any) =>
								C.joinText.v1({
									items: [
										$.input.text,
										'is already in the lorebook, so nothing new was filed. Edit that entry to change it.',
									] as any,
									params: slot.params(),
								}),
							)
							.outlet('said', ($: any) =>
								C.createMessage.v1({
									text: $.room.exists.note.text,
									speaker: CASTELLAN,
									channel: SANCTUM_CHANNEL,
								}),
							),
					),
			)
			/**
			 * ⚠ **The gate is the point** — `resolvePosition` defaults an
			 * undeclared review position to `off`, so without this line the
			 * draft would land unseen. A room is a place (L3).
			 */
			.preset('lair', { label: 'Lair', default: true }, (p) =>
				p
					.settings('room.new.save', { review: 'on' })
					.params('room.new.save', { entryType: 'core:entry/location' })
					.params('gather.rooms.read', { entryTypes: ['core:entry/location'] })
					.params('room.exists.note', { path: '', separator: ' ' })
					// The room the place slot shows (the room rule).
					.params('place', { path: 'world.location' }),
			)
			.build(),
	)
