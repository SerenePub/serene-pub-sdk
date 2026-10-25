/**
 * 🚧 **Remember things** — `core:spec/assistant-memory`, a **routine**
 * (PLAN-layering §4, R5, R37; 2026-10-20; ★K): every few turns, ONE JSON call
 * over the conversation notes what the person told the Assistant that is
 * worth keeping, and files each note — into the lorebook the person attached
 * when they may write it (their living memory bank), else the session's own
 * notes, made on first use (the host's lore-write routing). The routine's
 * mode decides how: **Full** files them, **Review** holds each at the review
 * gate. Registered in Chat's defaults on `everyNTurns({ n: 5 })`, switched
 * **Off** (R8: listed, for the person to turn on; ★J — lore writes are never
 * on unasked).
 *
 * Was the `memory` junction at the tail of `core:spec/assistant-respond`,
 * behind the retired background tasks. It reads only the session, so it fits
 * any cadence.
 * @experimental
 */
import { compile, slot, spec, coreEvents, ITEM, type RoutineFiring } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import { CORE_LOADOUT } from '../../loadouts.js'
import {
	applyWiring,
	heldForReview,
	jsonPart,
	modelCall,
	on,
	textPart,
	wiring,
	type BranchOf,
	type NodeOn,
} from '../../shared/calls.js'
import { fileLore } from '../../shared/lore.js'
import { ASSISTANT_PROMPT_KEYS } from '../../seed/prompts.js'
import { worldLoreEntryType } from '../../registry/entries.js'

/** @experimental */
export const ASSISTANT_MEMORY_SPEC_ID = 'core:spec/assistant-memory'
/** @internal */
export const ASSISTANT_MEMORY_VERSION = '1.0.0'

/** @experimental */
export const assistantMemorySpec = () => {
	const w = wiring()
	/** The writes the declared defaults hold at the review gate — the notes on Review. */
	const review: NodeOn[] = []
	return compile(
		spec(ASSISTANT_MEMORY_SPEC_ID, {
			version: ASSISTANT_MEMORY_VERSION,
			taxonomy: { role: 'maintenance' },
		})
			/** A routine (D2): the session, where it resides, what its event carried. */
			.inlet('input', C.routine.v1(), { suits: [coreEvents.turnEnded] })
			/** The conversation, and who is in it. */
			.query('history', ($) => C.sessionHistory.v1({ scope: $.input.sessionScope, params: slot.params() }), {
				expose: { label: 'The conversation', status: 'Taking notes' },
			})
			.query('cast', ($) => C.sessionCast.v1({ scope: $.input.sessionScope }), {
				expose: { label: 'Who is here', status: 'Taking notes' },
			})
			.junction('memory', { on: ($) => $.input.routine }, (j) =>
				// Every firing (the host never fires a routine that is Off); the notes junction reads the mode.
				j.when('due', { path: (v: RoutineFiring) => v.mode, truthy: true }, (m) =>
					/**
					 * *Remember things* — `memory.due.*`: one JSON call over the conversation,
					 * then each note filed (`create-lore-entry@1`, world lore) — on Full as it
					 * is, on Review held at the review gate. The host routes the write: the
					 * attached lorebook when the session may write it, else the session's own
					 * notes, made on first use.
					 */
					modelCall(m, w, 'memory', {
						prompt: ASSISTANT_PROMPT_KEYS.memory,
						brief: () => MEMORY_BRIEF,
						cast: ($) => $.cast.cast,
						history: ($) => $.history.messages,
						schema: ASSISTANT_MEMORY_SCHEMA,
						briefTurn: true,
						expose: {
							status: 'Taking notes',
							label: 'Remember things',
							purpose: 'Every few turns, notes what you told the Assistant, so it remembers next time.',
						},
					}).junction('notes', { on: ($) => $.input.routine }, (n) => {
						const arm = (b: BranchOf<typeof n, 'full' | 'review'>, mode: 'full' | 'review') => {
							return fileLore(b, w, {
								from: ($) => $.memory.due.memoryWrite.json,
								member: 'notes',
								listLabel: 'The notes',
								each: 'note',
								noun: 'note',
								nameLabel: "The note's title",
								max: 4,
								entryType: worldLoreEntryType,
								writeLabel: mode === 'full' ? 'File the note' : 'Hold the note for review',
								review: mode === 'review' ? review : undefined,
							})
						}
						return (
							n
								// The routine's mode (R37): Full files each note, Review holds it.
								.when('full', { path: (v: RoutineFiring) => v.mode, equals: 'full' }, (b) => arm(b, 'full'))
								.when('review', { path: (v: RoutineFiring) => v.mode, equals: 'review' }, (b) => arm(b, 'review'))
						)
					}),
				),
			)
			/** On Extraction (I12); its prompt row; every Review note behind the review gate. */
			.defaults((p) =>
				heldForReview(applyWiring(p.loadout('memory.due.memoryWrite', slot.loadout(CORE_LOADOUT.extraction)), w), review),
			)
			.build(),
	)
}

/**
 * 🚧 What *Remember things* asks every few turns (★K, lane 2): what the
 * person told the Assistant that is worth keeping.
 * @experimental
 */
export const ASSISTANT_MEMORY_SCHEMA = {
	type: 'object',
	properties: {
		notes: {
			type: 'array',
			maxItems: 4,
			items: {
				type: 'object',
				properties: { name: { type: 'string' }, content: { type: 'string' } },
				required: ['name', 'content'],
				additionalProperties: false,
			},
		},
	},
	required: ['notes'],
	additionalProperties: false,
} as const

/** The memory brief: the question the call answers, last. */
const MEMORY_BRIEF =
	'Look back over this conversation and note what the person told you that is worth remembering next time: facts about them, what they prefer, what they are working on, what they asked you to remember. Each note { name: a short title, content: a sentence or two in plain words }. Only what the person said or decided — never what you said, never a guess. An empty list when there is nothing new.'
