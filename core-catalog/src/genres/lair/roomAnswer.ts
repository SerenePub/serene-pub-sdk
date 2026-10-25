/**
 * The Lair's **Answer the door**: what the knock's option fires. The genre's
 * actions are introduced in `index.ts`.
 */

import { actionIdentity, compile, slot, spec } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import { bareEntryTypeId, locationEntryType } from '../../registry/entries.js'
import { applyWiring, jsonPart, scriptStep, textPart, wiring } from '../../shared/calls.js'
import { LAIR_ROOM_DRAFT_SCHEMA } from './names.js'
import { LAIR_ROOM_SCRIPT } from './scripts.js'

/* ── The party knocks: the answer ───────────────────────────────────────── */

/** @internal */
export const LAIR_ROOM_ANSWER_SPEC_ID = 'core:spec/lair-room-answer'
/** @internal */
export const LAIR_ROOM_ANSWER_VERSION = '1.0.0'


/** The action's key — `<this spec>#room`, what the knock's block names. */
const ROOM_ACTION_KEY = 'room'

/**
 * **What the knock's option fires** — the other half of the respond spec's
 * `door.knock` branch (R-15 *Forms*), and the composer's *Answer the door*
 * (`/room`) while a knock is open.
 *
 * **The knock asks for a description** (lair re-plan R9, owner rulings 2 + 6,
 * 2026-09-28). The action collects optional text (R3's collect modal, or S2's
 * slash argument — `/room <text>`), and a junction on it decides:
 *
 *  - **typed** — the text IS the room: a location entry named after the door
 *    the party knocked at, its content **the typed text, verbatim**, and **no
 *    review gate**. It is the master's own words; a gate would ask them to
 *    approve what they just typed.
 *  - **drafted** — nothing typed: the Castellan drafts the room as *Build
 *    room* does (2026-10-21, D1/D2/D10: one JSON answer — the body, its ways
 *    out, the place entry type's own `fields` — made into the write by
 *    `core:script/lair-room`, its ways to rooms the book holds linked in the
 *    entry's own commit; the `lair-knock-build` prompt), and the master edits
 *    it at `create-lore-entry`'s **review gate** before it lands.
 *
 * Retired with the two-option knock: *I will build it* and *Let the Castellan
 * improvise it* (`KNOCK_OPTIONS`), and the improvise branch's narration
 * (its `lair-improvise` prompt row). An empty answer drafts and gates exactly
 * as either used to.
 *
 * **A rejected draft re-opens the knock** (owner F5; R9). Not this spec's
 * rule: a core one in the app's review gate — an answer rejected at review
 * that wrote nothing is no answer, so the form is not marked answered, its
 * row is re-announced and its open-form notification raised again. The room
 * is still undescribed, the story still waits, and *Describe <room>…* and
 * `/room` are offered again.
 *
 * Writing a lore entry is `effects: 'world'`, and the rule that used to stop a
 * block naming one is the effects line's one exception (L1, ruled 2026-09-17):
 * `worldBlockFunctions` refuses any block naming a world action **unless the
 * block is addressed to the owner**, and the knock's block is addressed to
 * `owner` precisely because the dungeon's master is the only person it could
 * sensibly be put to. So this action is declared `world` and lives in the
 * `composer` venue — the `form` venue stays fiction-only, because a venue is
 * declared and an addressee is decided at run time (see `sdk/src/actions.ts`).
 *
 * **The room's name travels on the block** (lair pass B12, 2026-09-27). The
 * knock's `choices` block carries the checked name as its `referent`,
 * `read-answer@1` hands it back, and it is the entry's `name`. A press that
 * carries no form never gets that far: `answer` halts (*nothing to answer*),
 * which is why the action is present only while a knock is open (W-GATE D3,
 * `presentWhen`), and a composer press while it is open is addressed to that
 * knock by the host.
 *
 * **The new room joins the room the party stand in** (places plan B6,
 * 2026-09-29). The party knocked from somewhere: the world's `location` stat,
 * else the room the knock's planner named (the block's `vantage`, plan A27).
 * `here` resolves it against the rooms the dungeon lists — the Lair's name
 * rule, `undescribed-name@1` reading the name at `world.location` inside the
 * session's state (a location set to a place entry is that entry, by id) —
 * and, once the room has landed, the `link` junction writes ONE relationship
 * from the new room to that one, `leads to` both ways
 * (`core:outlet/link-lore-entries@1`). The next turn's planner reads it under
 * the room as "From here:".
 *
 * ⚠ **Invariant: the door never fails because the party's location names no
 * room** (plan §3 #11). The location is usually words, and `create-lore-entry`'s
 * own `links` refuses a name nothing answers to inside the entry's transaction
 * — which would fail the room with it. So the link is its own write, after the
 * room's, in a junction that fires only when `here` found a room: otherwise
 * the room is saved unlinked. A rejected draft ends the run before either. The
 * link is not gated (the master judged the room; the way back to where the
 * party stand is not a second question) and the outlet is idempotent, so a
 * repeat stacks nothing.
 *
 * **Then the story goes on.** Once the room lands, the master's own line —
 * *The party go on into The Drowned Hall* — is written under their name, the
 * way a send is: the turn order prepares the Castellan's turn, auto-advance
 * fires it as it would after any send, and the planner, which now lists the
 * room, walks the party in. A rejected draft ends the run at the gate, so
 * nothing is said and the knock is open again.
 * @internal
 */
export const lairRoomAnswerSpec = () => {
	const w = wiring()
	return compile(
		spec(LAIR_ROOM_ANSWER_SPEC_ID, {
			version: LAIR_ROOM_ANSWER_VERSION,
			taxonomy: { role: 'action'},
			contributes: {
				actions: [
					{
						key: ROOM_ACTION_KEY,
						/**
						 * ⚠ **`composer`, and it was `form`** (changed
						 * 2026-09-17 with L1). This action writes a lorebook
						 * entry, which is `effects: 'world'`, and F41 refuses a
						 * world action in the `form` venue at construction —
						 * deliberately, because a venue is declared and an
						 * addressee is decided at run time, so that check can
						 * never see the one fact that makes this safe. The
						 * block still reaches it: an owner-addressed block may
						 * name a `composer`-venue world action, and the press is
						 * held to the addressee.
						 *
						 * **So it is present only while a knock is open** —
						 * `presentWhen` below, hidden rather than grey (W-GATE
						 * D3, 2026-09-27). The host publishes the session's open
						 * form as `session.openForm` (unanswered, not overtaken)
						 * with the action it is answered by; the knock's block
						 * names this one. Present is answerable: the host
						 * addresses a composer press of this action to the open
						 * knock (`fireAction`), so it walks the knock's own
						 * button road.
						 */
						venue: { kind: 'composer' },
						presentWhen: {
							on: 'session.openForm.action',
							equals: actionIdentity({ specSlug: LAIR_ROOM_ANSWER_SPEC_ID, key: ROOM_ACTION_KEY }),
							/** Said only at the door: a listing hides it instead. */
							reason: { en: 'There is no door to answer — the party have not knocked.' },
						},
						/**
						 * **The description** (R9): optional, because an empty
						 * answer has a meaning — the Castellan drafts the room
						 * for review. Typed, it is saved as written.
						 */
						collects: {
							text: {
								need: 'optional',
								label: { en: 'Describe the room' },
								ifEmpty: { en: 'The Castellan drafts it for you to review.' },
							},
						},
						/**
						 * ⚠ Lore data, so the result is outside the story
						 * (R-15 *The line*) — the same declaration *Build
						 * room* carries, for the same write.
						 */
						effects: 'world',
						/**
						 * The dungeon's master answers this and nobody else —
						 * the block is addressed to `owner`, and the audience
						 * says the same thing where a listing would ask. It is
						 * also what a `world` action is allowed to say
						 * (`WORLD_ACTION_ACTORS`).
						 */
						audience: { see: ['participant'], act: ['owner'] },
						icon: 'door-open',
						label: { en: 'Answer the door' },
						description: {
							en: 'Describe the room the party just found. What you write is saved as the room; leave it empty and the Castellan drafts it for you to edit before it is saved.',
						},
					},
				],
			},
		})
			.inlet('input', C.userMessage.v1(), { suits: [] })
			.task('answer', ($) =>
				C.readAnswer.v1({ payload: $.input.payload, form: $.input.form }),
			)
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
								params: slot.params($.gather.worldLore.read),
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
					 * The rooms the dungeon holds (location entries, the
					 * preset) — what `here` resolves the party's location
					 * against (B6), and what the draft is told already exists
					 * (plan A28).
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
					sampling: slot.samplingOf('room.drafted.write'),
					connection: slot.connectionOf('room.drafted.write'),
					params: slot.params(),
				}),
			)
			.task('lore', ($) =>
				C.concatCandidates.v1({
					sources: [
						$.gather.history.read.band,
						$.gather.worldLore.read.main,
						$.gather.historyEntries.read.main,
					] as any,
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
			 * places them for `room.drafted.write` — an image it can read rides its own
			 * turn, otherwise its name. No files, and the arm's prompt is byte for
			 * byte what it was.
			 */
			.query('attachments', ($) =>
				C.historyAttachments.v1({
					messages: $.gather.history.read.messages,
					params: slot.params(),
				}),
			)
			/**
			 * **Where the party stand** (B6): the world's `location`, read at
			 * `world.location` inside the session's state (the preset's
			 * `path`), else the knock's `vantage` — the room its planner said
			 * the party stood in (A27) — resolved against the rooms by the
			 * Lair's name rule. The world's value first and the plan's hint
			 * second is the order `{{locationEntry}}` reads them in on a play
			 * turn; the hint here is the knock turn's own, which no prompt in
			 * that turn showed. A location set to a place entry is that entry.
			 * `entryId` is the room, or null when nothing the dungeon lists
			 * answers — words naming no room, or neither a location nor a hint.
			 */
			.task('here', ($) =>
				C.undescribedName.v1({
					name: $.gather.state.read.state,
					fallbackName: $.answer.vantage,
					locationEntries: $.gather.rooms.read.entries,
					params: slot.params(),
				}),
			)
			/**
			 * **Typed, or left to the Castellan** (R9). The model call is in
			 * the branch that needs one: a typed room costs nothing. Each
			 * branch files the room itself — a location (L3), set in the
			 * preset below, exactly as *Build room* files one — named after
			 * the door the party knocked at (the block's `referent`).
			 *
			 * The typed room wires no `links`: it is the GM's own words (its
			 * *Exits:* line is the host's to read on save, D10). The drafted
			 * room's links are its ways out to rooms the book holds, made by
			 * `core:script/lair-room` — never a name nothing answers to, which
			 * would fail the room with it. The way back to where the party
			 * stand is the `link` junction below, after the room (B6).
			 */
			.junction('room', { on: ($) => $.input.text }, (r) =>
				r
					.when('typed', { truthy: true }, (c) =>
						c.outlet('save', ($) =>
							C.createLoreEntry.v1({
								name: $.answer.referent,
								// The master's own words, as they wrote them.
								content: $.input.text,
								params: slot.params(),
							}),
							{ expose: { label: 'Save the room as typed' } },
						),
					)
					/**
					 * The room drafted in the dungeon's layout for the master
					 * to finish (B12) — *Build room*'s layout, its own prompt
					 * row: the room is the one the party just knocked at,
					 * named by the last line of the conversation.
					 */
					.otherwise('drafted', (c) => {
						const drafted = c
							.task('context', ($) =>
								C.buildTemplateContext.v1({
									cast: $.gather.cast.read.cast,
									state: $.gather.state.read.state,
									locationEntries: $.gather.rooms.read.entries,
									prompts: slot.prompts(),
									variables: slot.variables(),
								}),
							)
							.task('lines', ($) =>
								C.proseTranscript.v1({
									messages: $.gather.history.read.messages,
									cast: $.gather.cast.read.cast,
									templateContext: $.context.templateContext,
								}),
							)
							.task('attached', ($) =>
								C.placeAttachments.v1({
									messages: $.lines.messages,
									attachments: $.attachments.attachments,
									connection: slot.connectionOf('room.drafted.write'),
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
									connection: slot.connectionOf('room.drafted.write'),
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
								{ expose: { status: 'The Castellan drafts the room', label: 'Draft the room' } },
							)
						/**
						 * The draft, made into the write (`core:script/lair-room`) — its
						 * ways to rooms the book holds linked in the same commit; the
						 * room the party stand in is left to `link` below, which writes
						 * that way both ways.
						 */
						const made = jsonPart(
							jsonPart(
								textPart(
									scriptStep(
										drafted,
										w,
										'made',
										LAIR_ROOM_SCRIPT.seedKey,
										($) => ({
											draft: $.room.drafted.write.json,
											name: $.answer.referent,
											rooms: $.gather.rooms.read.entries,
											here: $.here.entryId,
										}),
										'The draft, made into the room',
									),
									w,
									'content',
									($) => $.room.drafted.made.main,
									'content',
									"The room's body",
								),
								w,
								'fields',
								($) => $.room.drafted.made.main,
								'fields',
								"The room's fields",
							),
							w,
							'links',
							($) => $.room.drafted.made.main,
							'links',
							"The room's ways to rooms the book holds",
						)
						return made.outlet(
							'save',
							($) =>
								C.createLoreEntry.v1({
									name: $.answer.referent,
									content: $.room.drafted.content.text,
									fields: $.room.drafted.fields.main,
									links: $.room.drafted.links.main,
									params: slot.params(),
								}),
							{ expose: { label: 'Save the drafted room' } },
						)
					}),
			)
			/**
			 * **The way between them** (B6): one relationship from the room
			 * just written to the room the party stand in, `leads to` both
			 * ways (the preset) — only when `here` found one. The junction
			 * publishes whichever `save` ran as `room.entryId`. Nothing fires
			 * otherwise: the room stays saved, unlinked, and the story goes on.
			 */
			.junction('link', { on: ($) => $.here.entryId }, (r) =>
				r.when('resolved', { truthy: true }, (c) =>
					c.outlet('write', ($) =>
						C.linkLoreEntries.v1({
							from: $.room.entryId,
							to: $.here.entryId,
							params: slot.params(),
						}),
					),
				),
			)
			/**
			 * The master's line that sends the party on (B12) — after the
			 * room's write, so it is said only once the room exists. Written
			 * as the person who pressed (`presser`, `user:<id>`: a user row,
			 * their own line), which is what makes it a send: the turn order
			 * prepares the Castellan's turn and auto-advance takes it, as
			 * after any send.
			 */
			.task('onward', ($) =>
				C.joinText.v1({
					items: ['The party go on into', $.answer.referent] as any,
					params: slot.params(),
				}),
			)
			.outlet('resume', ($) =>
				C.createMessage.v1({
					text: $.onward.text,
					speaker: $.input.presser,
				}),
			)
			/**
			 * ⚠ **The draft's gate is the point, not a precaution.**
			 * `create-lore-entry` declares `review: { fields: ['name',
			 * 'content'] }` and `resolvePosition` defaults an undeclared
			 * position to `off`, so without this line the Castellan's draft
			 * would land unseen. On, the run parks and the master gets the
			 * *Build room* form with the draft already in it. The typed room
			 * is `off` by name: the master wrote it (R9).
			 */
			.defaults((p) =>
				applyWiring(p
					.settings('room.typed.save', { review: 'off' })
					.settings('room.drafted.save', { review: 'on' })
					// A room is a place (L3), however it was written.
					.params('room.typed.save', { entryType: bareEntryTypeId(locationEntryType) })
					.params('room.drafted.save', { entryType: bareEntryTypeId(locationEntryType) })
					// Plain names, one sentence (B12).
					.params('onward', { path: '', separator: ' ' })
					// B6: the rooms, where the party stand, and the way
					// between — one row, read the same from either end.
					.params('gather.rooms.read', { entryTypes: [bareEntryTypeId(locationEntryType)] })
					.params('here', { path: 'world.location' })
					// The room the place slot shows (the room rule) — the world's
					// location alone, where `here` also falls back to the vantage.
					.params('place', { path: 'world.location' })
					.params('link.resolved.write', { linkType: 'leads to', reverseLinkType: 'leads to' }), w),
			)
			.build(),
	)
}
