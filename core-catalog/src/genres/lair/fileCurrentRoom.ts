/**
 * 🚧 **File the current room** — `core:spec/lair-file-current-room`, a
 * **routine** (rewrite D7, D10, 2026-10-21): when a scene opens because the
 * party walked somewhere new (`onEvent(scene-opened)`), and the room they now
 * stand in is described only in prose — the GM's narration, a plan in the
 * Sanctum — the Castellan drafts it into the lorebook as *File as a room*
 * would: one JSON answer (`LAIR_ROOM_DRAFT_SCHEMA`), made into the write by
 * `core:script/lair-room`, its ways to rooms the book holds linked in the
 * entry's own commit. A room the book already holds, or one nothing
 * describes (the knock's), files nothing.
 *
 * **Off by default** (R3: nothing unprompted): the GM switches it on, at
 * **Review** — the draft waits at the review gate, as every room the
 * Castellan drafts does — or **Full**, written as drafted. It reads only the
 * session.
 *
 * Closes the gap the docs named: "a room described in prose isn't filed for
 * you".
 * @experimental
 */
import { compile, coreEvents, slot, spec } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import { LAIR_PROMPT_KEYS } from '../../seed/prompts.js'
import { SANCTUM_CHANNEL } from '../../registry/genres.js'
import { bareEntryTypeId, locationEntryType } from '../../registry/entries.js'
import { applyWiring, heldForReview, jsonPart, modelCall, on, scriptStep, textPart, wiring, type BranchOf, type NodeOn } from '../../shared/calls.js'
import { CASTELLAN, LAIR_ROOM_DRAFT_SCHEMA } from './names.js'
import { LAIR_ROOM_SCRIPT } from './scripts.js'

/** @experimental */
export const LAIR_FILE_CURRENT_ROOM_SPEC_ID = 'core:spec/lair-file-current-room'
/** @internal */
export const LAIR_FILE_CURRENT_ROOM_VERSION = '1.0.0'

/** How many of the newest rows, across the story and the Sanctum, the prose check reads (R9's window). */
const PROSE_ROWS = 40

/** The name check's answer — the part the junction reads. */
interface Described {
	readonly describedBy: unknown
}

/** The routine's firing — the part the junction reads. */
interface Firing {
	readonly mode: unknown
}

/** @experimental */
export const lairFileCurrentRoomSpec = () => {
	const w = wiring()
	const review: NodeOn[] = []
	const head = spec(LAIR_FILE_CURRENT_ROOM_SPEC_ID, {
		version: LAIR_FILE_CURRENT_ROOM_VERSION,
		taxonomy: { role: 'maintenance' },
	})
		.inlet('input', C.routine.v1(), { suits: [coreEvents.sceneOpened] })
		.query('state', ($) => C.sessionState.v1({ scope: $.input.sessionScope }), {
			expose: { label: 'Where the party stand', status: 'Filing the room' },
		})
		/** The dungeon's rooms — checked first, and named to the draft. */
		.query('rooms', ($) => C.lorebookEntries.v1({ scope: $.input.sessionScope, params: slot.params() }), {
			expose: { label: 'Rooms', status: 'Filing the room' },
		})
		/** The whole book, any entry type (R7). */
		.query('lorebook', ($) => C.lorebookEntries.v1({ scope: $.input.sessionScope, params: slot.params() }), {
			expose: { label: 'The lorebook', status: 'Filing the room' },
		})
		/** The prose a room may be described in (R9): the GM's and the Castellan's, on the story and the Sanctum. */
		.query('prose', ($) => C.sessionHistory.v1({ scope: $.input.sessionScope, params: slot.params() }), {
			expose: { label: 'Recent prose, every channel', status: 'Filing the room' },
		})
		/** The story's newest rows — the conversation the draft reads. */
		.query('story', ($) => C.sessionHistory.v1({ scope: $.input.sessionScope, params: slot.params() }), {
			expose: { label: 'The story so far', status: 'Filing the room' },
		})
		.query('cast', ($) => C.sessionCast.v1({ scope: $.input.sessionScope }), {
			expose: { label: 'Who is seated', status: 'Filing the room' },
		})
		/** Is the room the party stand in described, and by what: an entry, prose, or nothing. */
		.task('check', ($) =>
			C.undescribedName.v1({
				name: $.state.state,
				locationEntries: $.rooms.entries,
				entries: $.lorebook.entries,
				messages: $.prose.messages,
				params: slot.params(),
			}),
		)
	w.params.push([on(head, 'rooms'), { entryTypes: [bareEntryTypeId(locationEntryType)] }])
	w.params.push([on(head, 'prose'), { channel: '*', limit: PROSE_ROWS, talkOnly: true }])
	w.params.push([on(head, 'story'), { channel: 'main', limit: 12 }])
	w.params.push([on(head, 'check'), { path: 'world.location', channels: ['main', SANCTUM_CHANNEL] }])
	const named = textPart(
		jsonPart(head, w, 'room', ($) => $.state.state, 'world.location', 'Where the party stand'),
		w,
		'roomName',
		($) => $.room.main,
		'',
		'The room, by name',
	)
	const built = named.junction('described', { on: ($) => $.check.main }, (j) =>
		j.when('prose', { path: (v: Described) => v.describedBy, equals: 'prose' }, (b) => {
			const asked = modelCall(b, w, 'draft', {
				speaker: CASTELLAN,
				prompt: LAIR_PROMPT_KEYS.fileCurrentRoom,
				brief: ($) => $.check.passage,
				cast: ($) => $.cast.cast,
				history: ($) => $.story.messages,
				schema: LAIR_ROOM_DRAFT_SCHEMA,
				briefTurn: true,
				expose: {
					status: 'Filing the room',
					label: 'Draft the room',
					purpose: 'When the party walk into a room described only in prose, the Castellan drafts it into the lorebook for you.',
				},
			})
			const made = jsonPart(
				jsonPart(
					textPart(
						scriptStep(
							asked,
							w,
							'made',
							LAIR_ROOM_SCRIPT.seedKey,
							($) => ({ draft: $.described.prose.draftWrite.json, name: $.roomName.text, rooms: $.rooms.entries }),
							'The draft, made into the room',
						),
						w,
						'content',
						($) => $.described.prose.made.main,
						'content',
						"The room's body",
					),
					w,
					'fields',
					($) => $.described.prose.made.main,
					'fields',
					"The room's fields",
				),
				w,
				'links',
				($) => $.described.prose.made.main,
				'links',
				"The room's ways to rooms the book holds",
			)
			/** **Full** writes it as drafted; **Review** holds it at the review gate. */
			return made.junction('mode', { on: ($) => $.input.routine }, (m) => {
				/** Each arm's write, headed by what it does (two steps of one group never share a heading). */
				const save = (k: BranchOf<typeof m, 'held' | 'written'>, label: string) => {
					w.params.push([on(k, 'save'), { entryType: bareEntryTypeId(locationEntryType) }])
					return k.outlet(
						'save',
						($) =>
							C.createLoreEntry.v1({
								name: $.roomName.text,
								content: $.described.prose.content.text,
								fields: $.described.prose.fields.main,
								links: $.described.prose.links.main,
								params: slot.params(),
							}),
						{ expose: { label } },
					)
				}
				return m
					.when('held', { path: (v: Firing) => v.mode, equals: 'review' }, (k) => {
						review.push(on(k, 'save'))
						return save(k, 'File the room, for your review')
					})
					.otherwise('written', (k) => save(k, 'File the room as drafted'))
			})
		}),
	)
	return compile(built.defaults((p) => heldForReview(applyWiring(p, w), review)).build())
}
