/**
 * The **Writing Room** genre (plans/genres §2; U2) — the first genre whose two
 * channels play different parts in a prompt, and the first customer for the
 * trigger's channel travelling with the turn (R-C).
 *
 * ## What is asked here, and what is asked in the app
 *
 * The *declaration* and the *documents* are this suite's: the shape, the
 * channels, the envoy, the junction's table, where each branch's reply lands,
 * and the hashes those documents resolve to. The *assembly* — the folio folded
 * into one block, the seed row that is not written, the row the reply is
 * stored on — is core's, because `processMessages` and the host live there;
 * `folioChannel.int.test.ts` is where that half is executed against real rows.
 *
 * ## ⚠ Why this file imports the catalog by PATH
 *
 * `@serene-pub/core-catalog` resolves to its **`dist`** (its package `main`
 * says so), so a test importing it that way cannot see a genre until somebody
 * rebuilds that package. This suite exists to run against the vendored
 * sources — its own package description says so — and this lane may not build.
 * The path import is the honest way to say "the source is what is under test";
 * every other consumer keeps reading `dist` and is unaffected.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { canonicalHash, channelDecls, ok, run, validate } from '@serene-pub/sdk'
import { bindings, world } from './helpers.js'
import {
	MANUSCRIPT_CHANNEL,
	WRITING_ROOM_GENRE_ID,
	WRITING_ROOM_SCRIBE_KEY,
	writingRoomGenre,
} from '../core-catalog/src/genres.js'
import {
	WRITING_ROOM_CREATE_SPEC_ID,
	WRITING_ROOM_RESPOND_SPEC_ID,
	writingRoomCreateSpec,
	writingRoomRespondSpec,
} from '../core-catalog/src/writingRoom.js'
import { WRITING_ROOM_ACTION_SPECS } from '../core-catalog/src/writingRoomActions.js'
import { corePresets } from '../core-catalog/src/presets.js'
const writingRoomDefaultPreset = corePresets().find((p) => p.slug === 'writing-room-default')!
import { answerFormWritingRoomSpec } from '../core-catalog/src/answerForm.js'

/**
 * `slug@semver` → canonical hash, on the same terms as core's own pins: a
 * moved hash is shippable and must be deliberate.
 */
const PUBLISHED: Record<string, string> = {
	// ⚠ Every spec below but `create` moved to **1.1.0** at PLAN-turn-order
	// A6 (2026-09-22): the `speaker` node left for `core:spec/turn-order`
	// and `placeholder` returned to directly after the inlet. The nine
	// action specs move with the reply because their `speaker` node was
	// `turn-manual`, whose whole job was recording the action's explicit
	// pick — and a pick never enters a strategy now (§4.4).
	// Moved 2026-09-21 (PLAN-turn-order A1): `shape.speakerStrategies: []`
	// became no key — `SessionShape.turnOrder` replaces it (was 'fad089e2e9c8e').
	// Moved 2026-09-26: the scribe is the genre's `fallback` envoy — a line
	// nobody claims is the Scribe's (everyone has a name; was 'bb48499be797a').
	// Moved 2026-09-28 (choice labels): the genre's enum fields gained
	// `members` — each option's display label beside its stored `of` value.
	// Proven: deleting every enum's `members` hashes back to the old pin.
	// (was '943a1a6c85c8e')
	'core:spec/writing-room-create@1.0.0': '8f52a9f7ab691',
	// Moved 2026-09-27 (lair pass B3/B18): the streaming stage and the stage
	// statuses are declared on `expose` (`stream`, `status`). Proven: with those
	// two keys stripped, the document hashes back to the old pin. (was '6f13ddc7e1241')
	// Moved 2026-09-27 (W2 consolidation): both branch stages declare
	// `expose.stream` (one streaming stage per execution path). Proven: with
	// `stream` stripped from those two nodes it hashes back. (was '102effcbd882e3')
	'core:spec/writing-room-respond@1.1.0': '18b3c8b9ec2e12',
	// Every action spec below moved 2026-09-17 (plans/31 V2): `contributes.actions[].function`
	// is retired — the key is the identity — so each compiled document lost one field.
	// (create and respond declare no action and stand.)
	// Moved 2026-09-27 (lair pass B3/B18): the streaming stage and the stage
	// statuses are declared on `expose` (`stream`, `status`). Proven: with those
	// two keys stripped, the document hashes back to the old pin. (was '1c840e424672ef')
	'core:spec/writing-room-continue@1.1.0': 'cf7818846114d',
	// Moved 2026-09-27 (lair pass B3/B18): the streaming stage and the stage
	// statuses are declared on `expose` (`stream`, `status`). Proven: with those
	// two keys stripped, the document hashes back to the old pin. (was 'fccbddab17e0a')
	'core:spec/writing-room-rewrite@1.1.0': '10391e65343d7d',
	// Moved 2026-09-27 (lair pass B3/B18): the streaming stage and the stage
	// statuses are declared on `expose` (`stream`, `status`). Proven: with those
	// two keys stripped, the document hashes back to the old pin. (was 'd22df61829b8a')
	'core:spec/writing-room-expand@1.1.0': 'ab1561a70f11',
	// Moved 2026-09-27 (lair pass B3/B18): the streaming stage and the stage
	// statuses are declared on `expose` (`stream`, `status`). Proven: with those
	// two keys stripped, the document hashes back to the old pin. (was '75942fb0cdc59')
	'core:spec/writing-room-tighten@1.1.0': '120227cc43d3b8',
	// Moved 2026-09-27 (lair pass B3/B18): the streaming stage and the stage
	// statuses are declared on `expose` (`stream`, `status`). Proven: with those
	// two keys stripped, the document hashes back to the old pin. (was '147a45688788ba')
	'core:spec/writing-room-brainstorm@1.1.0': '8ad18e5b812c5',
	// Moved 2026-09-27 (lair pass B3/B18): the streaming stage and the stage
	// statuses are declared on `expose` (`stream`, `status`). Proven: with those
	// two keys stripped, the document hashes back to the old pin. (was '18b10044e3c21')
	'core:spec/writing-room-critique@1.1.0': '1f41d641120480',
	// Moved (L3, contracts batch 2, 2026-09-17): `params: slot.params()` on the
	// `create-lore-entry` node, which now declares an `entryType` parameters
	// slot. A slot the spec never NAMES is not a config key, so the control
	// would render and the run would never read it. The value is unchanged —
	// the declared default is world lore, which is what these wrote before.
	// Moved 2026-09-27 (lair pass B3/B18): the streaming stage and the stage
	// statuses are declared on `expose` (`stream`, `status`). Proven: with those
	// two keys stripped, the document hashes back to the old pin. (was 'ed2170a1e7971')
	'core:spec/writing-room-add-to-bible@1.1.0': '137125cc21370c',
	'core:spec/writing-room-export@1.1.0': 'c963cdf7f631c',
	// Moved 2026-09-27 (lair pass B3/B18): the streaming stage and the stage
	// statuses are declared on `expose` (`stream`, `status`). Proven: with those
	// two keys stripped, the document hashes back to the old pin. (was '7a5c89502dd7a')
	'core:spec/answer-form-writing-room@1.0.0': 'fed841c4b39d0',
}

const ALL = [
	writingRoomCreateSpec,
	writingRoomRespondSpec,
	...WRITING_ROOM_ACTION_SPECS,
	answerFormWritingRoomSpec,
]

describe('the Writing Room genre declares two channels that read differently', () => {
	test('the manuscript is a folio with no voice and no delete; main is an ordinary conversation', () => {
		const decls = channelDecls(writingRoomGenre.shape)
		assert.deepEqual(
			decls.map((d) => d.slug),
			['main', MANUSCRIPT_CHANNEL],
		)
		// `main` first and always, and it stays a conversation: it is where the
		// session talks.
		assert.equal(decls[0]!.role, 'conversation')
		assert.equal(decls[0]!.voice, 'character')

		const manuscript = decls[1]!
		assert.equal(manuscript.role, 'folio')
		// The half that removes the seed line — a page has no speaker.
		assert.equal(manuscript.voice, 'none')
		// Losing a paragraph of the conversation costs a question; losing a
		// paragraph of the book costs the book.
		assert.equal(manuscript.messageVerbs?.delete, false)
	})

	test('one companion at most, nobody plays a person, and the bible may be written', () => {
		const shape: any = writingRoomGenre.shape
		assert.deepEqual(shape.characters, { min: 0, max: 1 })
		assert.deepEqual(shape.personas, { min: 0, max: 0 })
		assert.equal(shape.lorebook, 'optional')
		// Declared, because *Add to bible* is the genre's loop writing lore —
		// undeclared, the write site refuses it (R-B).
		assert.deepEqual(shape.writes, { lore: true, scenes: false })
		// A blank page welcomes nobody.
		assert.equal(shape.greeting?.enabled, false)
	})

	test('the scribe is seated by default, and a card may replace it', () => {
		const envoys = writingRoomGenre.envoys ?? []
		assert.equal(envoys.length, 1)
		assert.equal(envoys[0]!.key, WRITING_ROOM_SCRIBE_KEY)
		assert.equal(envoys[0]!.default, true)
		assert.equal(envoys[0]!.speaks, 'in-turn')
		// Both, deliberately: an envoy AND room for one library character. The
		// guide's `characters.max: 0` is the other posture, not the only one.
		assert.equal((writingRoomGenre.shape as any).characters.max, 1)
		assert.ok(envoys[0]!.prompts?.systemPrompt)
	})

	test('the four fields are the ones a shipped prompt interpolates', () => {
		const fields: any = (writingRoomGenre.shape as any).fields
		assert.deepEqual(Object.keys(fields).sort(), [
			'authorsNote',
			'chunkLength',
			'pov',
			'tense',
		])
		assert.equal(fields.chunkLength.type, 'integer')
		assert.equal(fields.chunkLength.default, 300)
		assert.equal(fields.authorsNote.type, 'text')
		assert.deepEqual(fields.pov.of, ['first', 'close-third', 'omniscient'])
		assert.deepEqual(fields.tense.of, ['past', 'present'])
	})
})

describe('the Writing Room pipelines', () => {
	test('every one of them builds and validates clean', () => {
		for (const build of ALL) {
			const doc = build()
			const errs = validate(doc).filter((f) => f.severity === 'error')
			assert.deepEqual(
				errs.map((e) => `${e.law} ${e.nodeKey ?? ''} ${e.message}`),
				[],
				`${doc.id} does not validate`,
			)
		}
	})

	test('each resolves to the hash recorded for it', () => {
		for (const build of ALL) {
			const doc = build()
			const pin = `${doc.id}@${doc.version}`
			assert.equal(
				canonicalHash(doc),
				PUBLISHED[pin],
				`${pin} now names a different document — record the new hash in the same commit as the edit`,
			)
		}
		// And nothing is published without a pin.
		assert.equal(ALL.length, Object.keys(PUBLISHED).length)
	})

	test('creating a session writes nothing and calls no model', () => {
		const doc: any = writingRoomCreateSpec()
		assert.equal(doc.id, WRITING_ROOM_CREATE_SPEC_ID)
		assert.deepEqual(
			doc.nodes.map((n: any) => n.kind),
			['inlet'],
		)
		// The genre's declaration rides the create spec's version row, which is
		// where the host reads "which speakers does this genre bring" from.
		assert.equal(doc.genre?.family, 'writing')
		assert.equal(doc.genre?.envoys?.[0]?.key, WRITING_ROOM_SCRIBE_KEY)
	})

	test('the reply branches on the trigger channel, and the row it writes carries it', () => {
		const doc: any = writingRoomRespondSpec()
		assert.equal(doc.id, WRITING_ROOM_RESPOND_SPEC_ID)

		const turn = doc.clauses.find((c: any) => c.id === 'turn')
		assert.equal(turn.kind, 'junction')
		// The value branched on is the inlet's channel port — a reference, so
		// the panel can render the table without running anything.
		assert.equal(turn.on.node, 'input')
		assert.equal(turn.on.port, 'channel')
		assert.deepEqual(turn.branches, {
			manuscript: { equals: MANUSCRIPT_CHANNEL },
			talk: { default: true },
		})

		// One row, created on the spine, on the channel the turn was asked for.
		const placeholder = doc.nodes.find((n: any) => n.key === 'placeholder')
		assert.equal(placeholder.config.channel.node, 'input')
		assert.equal(placeholder.config.channel.port, 'channel')

		// And the message write is on the spine too: the branches end on their
		// oracles and `join-text` folds whichever fired, so ONE update finishes
		// the row whichever arm ran. (Writes inside a clause are legal since W1,
		// R44 — the sprite tail's `show-sprite` sits in its own junction — so
		// this pins the message writes, not every outlet.)
		for (const n of doc.nodes)
			if (n.kind === 'outlet' && !n.key.startsWith('spriteTail.'))
				assert.equal(n.clauseId, undefined, `${n.key} is inside a clause`)
	})

	test('the manuscript arm reads the genre fields; the talk arm reads the scribe', () => {
		const doc: any = writingRoomRespondSpec()
		const manuscript = doc.nodes.find((n: any) => n.key === 'turn.manuscript.context')
		// The only shipped context surface that takes `fields` and declares no
		// speaker — see the module note in `writingRoom.ts`.
		assert.equal(manuscript.definitionId, 'core:task/build-planner-context')
		assert.equal(manuscript.config.fields.node, 'input')
		assert.equal(manuscript.config.fields.port, 'fields')

		const talk = doc.nodes.find((n: any) => n.key === 'turn.talk.context')
		assert.equal(talk.definitionId, 'core:task/build-template-context')
		// The envoy's instructions as configuration, at `envoy:scribe`.
		assert.equal(talk.config.prompts.ofEnvoy, WRITING_ROOM_SCRIBE_KEY)
	})

	test('the shipped preset binds the required events and brings the eight actions', () => {
		assert.equal(writingRoomDefaultPreset.genre, WRITING_ROOM_GENRE_ID)
		assert.equal(
			writingRoomDefaultPreset.bindings['core:event/session-created@1']?.spec,
			WRITING_ROOM_CREATE_SPEC_ID,
		)
		assert.equal(
			writingRoomDefaultPreset.bindings['core:event/message-respond@1']?.spec,
			WRITING_ROOM_RESPOND_SPEC_ID,
		)
		assert.equal(writingRoomDefaultPreset.actions?.include?.length, 8)
	})
})

/* ── the junction, executed ─────────────────────────────────────────────── */

/**
 * The stand-ins the fixture host does not carry, plus a recorder for the two
 * message writes. Everything here is deterministic — no clock, no randomness.
 */
const runRespond = async (channel: string) => {
	const written: Array<Record<string, unknown>> = []
	const receipt: any = await run(writingRoomRespondSpec(), {
		world,
		input: {
			text: 'make it colder',
			channel,
			sessionScope: { sessionId: 1 },
			fields: { pov: 'close-third', tense: 'past', chunkLength: 300, authorsNote: '' },
		},
		seed: 'writing-room',
		triggerSource: 'event',
		bindings: bindings({
			'core:outlet/create-message@1': async (i: any, ctx: any) => {
				written.push({ kind: 'create', channel: i.channel })
				const row = await ctx.commit({ channel: i.channel })
				return ok({ main: row.id, messageId: row.id })
			},
			'core:outlet/update-message@1': async (i: any, ctx: any) => {
				written.push({ kind: 'update', target: i.target, text: i.text })
				const row = await ctx.commit({ target: i.target, text: i.text })
				return ok({ main: row.id, messageId: row.id })
			},
			'core:query/session-cast@1': async () => ok({ main: {}, cast: {} }),
			/**
			 * The sprite tail (DESIGN-sprites §5): the speaker has no sprites,
			 * so its junction skips — recorded as an outcome, never a failure.
			 */
			'core:query/sprites-for@1': async () => {
				const none = { labels: [], text: '', has: false }
				return ok({ main: none, choices: none, labels: [], text: '', has: false, lineVector: null, labelVectors: {} })
			},
			'core:task/turn-round-robin@1': async (i: any) =>
				ok({ main: i.speaker ?? null, speaker: i.speaker ?? null, characterId: i.characterId ?? null }),
			/**
			 * Only real bands through: the suite's `lorebook-triggers`
			 * stand-in answers a bare string on `main`, and the assembly
			 * stand-in reads `.items` off whatever it is handed.
			 */
			'core:task/concat-candidates@1': async (i: any) => {
				const sources = (i.sources ?? []).filter(
					(b: any) => b && typeof b === 'object' && Array.isArray(b.items),
				)
				return ok({ main: sources, candidates: sources })
			},
			'core:task/build-planner-context@1': async () =>
				ok({ main: {}, templateContext: { char: 'the manuscript' }, seedName: '' }),
			'core:task/build-template-context@1': async () =>
				ok({ main: {}, templateContext: { char: 'Scribe' }, seedName: 'Scribe' }),
			'core:task/process-messages@1': async () => ok({ main: [], messages: [] }),
			/**
			 * Carries the template context through, so the scripted reply below
			 * can tell the two arms apart by the context each one built — which
			 * is the difference under test.
			 */
			'core:task/assemble@2': async (i: any) =>
				ok({ main: { ctx: i.templateContext }, context: { ctx: i.templateContext } }),
			'core:task/join-text@1': async (i: any) => {
				const items = Array.isArray(i.items) ? i.items : [i.items].filter(Boolean)
				const text = items
					.map((e: any) => (typeof e === 'string' ? e : (e?.[i.params?.path ?? 'text'] ?? '')))
					.filter(Boolean)
					.join(i.params?.separator ?? '\n\n')
				return ok({ main: text, text })
			},
			// Scripted so the two arms are told apart by what came back.
			reply: (i: any) => (i.context?.ctx?.char === 'the manuscript' ? 'a page' : 'a reply'),
		}),
	})
	return { receipt, written }
}

const firedBranches = (receipt: any): string[] =>
	receipt.nodes
		.map((n: any) => n.nodeKey as string)
		.filter((k: string) => k.startsWith('turn.'))
		.map((k: string) => k.split('.')[1]!)
		.filter((b: string, i: number, all: string[]) => all.indexOf(b) === i)

describe('a turn triggered on the manuscript', () => {
	test('runs the manuscript arm alone, and the row it writes is the manuscript', async () => {
		const { receipt, written } = await runRespond(MANUSCRIPT_CHANNEL)
		assert.equal(receipt.outcome, 'ok')
		assert.deepEqual(firedBranches(receipt), ['manuscript'])
		// The one row: created on the manuscript, finished by the arm that ran.
		assert.deepEqual(written[0], { kind: 'create', channel: MANUSCRIPT_CHANNEL })
		assert.equal(written[1]!.kind, 'update')
		assert.equal(written[1]!.text, 'a page')
		// The predicate's evaluation is in the receipt, fired and skipped alike.
		const notes = (receipt.notes ?? []).filter((n: string) => n.startsWith("junction 'turn'"))
		assert.ok(notes.some((n: string) => n.includes("'manuscript' fired")))
		assert.ok(notes.some((n: string) => n.includes("'talk' skipped")))
	})

	test('a lane under the manuscript is NOT the manuscript — the known edge', async () => {
		// Strict equality against the slug, which is exact because this genre
		// allocates no lanes. Recorded as a test rather than as a comment so
		// the day a pipeline opens `manuscript:2` the failure names itself.
		const { receipt } = await runRespond('manuscript:2')
		assert.deepEqual(firedBranches(receipt), ['talk'])
	})
})

describe('a turn triggered in the conversation', () => {
	test('runs the talk arm alone, and the reply lands on main', async () => {
		const { receipt, written } = await runRespond('main')
		assert.equal(receipt.outcome, 'ok')
		assert.deepEqual(firedBranches(receipt), ['talk'])
		assert.deepEqual(written[0], { kind: 'create', channel: 'main' })
		assert.equal(written[1]!.kind, 'update')
		assert.equal(written[1]!.text, 'a reply')
	})
})
