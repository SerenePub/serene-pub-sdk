/**
 * The **Whodunit** genre (plans/genres-and-showcase-plugins §4, U4) — a case, a
 * room of suspects, and one detective.
 *
 * Four claims, and each is a way the genre could be wrong while still
 * compiling:
 *
 *  · the **declaration** says what the plan says — two suspects at least, one
 *    detective exactly, a required case, lore never written, and the one field
 *    (`candour`) that decides how much a suspect volunteers;
 *  · every pipeline **builds and validates**, and its document hashes to a
 *    recorded value, so an edit to a shipped graph is a deliberate change to a
 *    pin rather than a silent one;
 *  · **hidden information holds** — structurally, in what the documents wire,
 *    and in an executed turn: no lane that can carry a suspect's private lore
 *    is read by anything except the judge;
 *  · the **ending works** — a right accusation solves the case, a wrong one
 *    fails it, and the button goes quiet either way.
 *
 * ⚠ **Imported from `../core-catalog/src`, not from `@serene-pub/core-catalog`.**
 * The package's `main` is `./dist/index.js`, so the published entry point is a
 * build behind the source, and this lane may not run one. Importing the source
 * directly is what lets a new genre be tested the day it is written; every
 * other suite keeps importing the package, and `node --test` runs each file in
 * its own process, so the two never meet.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
	canonicalHash,
	evaluateEnabledWhen,
	halt,
	ok,
	pickHash32,
	rendezvousPick,
	run,
	sessionEvents,
	validate,
} from '@serene-pub/sdk'
import type { Bindings, ConfigWorld, SpecDocument } from '@serene-pub/sdk'

import { corePresets, CORE_SPECS, CORE_WIDGETS } from '../core-catalog/src/index.js'
import { whodunitGenre, WHODUNIT_GENRE_ID } from '../core-catalog/src/genres.js'
import {
	WHODUNIT_CREATE_SPEC_ID,
	WHODUNIT_PLAN_SCHEMA,
	WHODUNIT_RESPOND_SPEC_ID,
} from '../core-catalog/src/whodunit.js'
import {
	WHODUNIT_ACCUSE_SPEC_ID,
	WHODUNIT_ANSWER_SPEC_ID,
	WHODUNIT_QUESTION_SPEC_ID,
	WHODUNIT_VERDICT_SCHEMA,
	WHODUNIT_VERDICT_SPEC_ID,
} from '../core-catalog/src/whodunitActions.js'
import { caseSlot } from '../core-catalog/src/slots.js'
import { coreLayoutPreset } from '../core-catalog/src/ui/sessions/layouts.js'
import { bindings, world } from './helpers.js'

/* ── the declaration ────────────────────────────────────────────────────── */

describe('the Whodunit genre declares the mystery', () => {
	test('two suspects at least, one detective exactly, and a required case', () => {
		const shape = whodunitGenre.shape!
		assert.equal(whodunitGenre.id, WHODUNIT_GENRE_ID)
		assert.deepEqual(shape.characters, { min: 2 })
		// The only genre in core that REQUIRES a persona and caps it at one.
		assert.deepEqual(shape.personas, { min: 1, max: 1 })
		assert.equal(shape.lorebook, 'required')
		assert.equal(shape.composer, 'text')
		assert.equal(shape.voice, 'narrator')
		assert.equal('turnOrder' in shape, false, 'no Turn order control: the planner decides (R28 retired the shape key)')
		assert.equal(shape.greeting?.enabled, true)
		assert.equal(shape.greeting?.channel, 'main')
		assert.equal(whodunitGenre.family, 'adventure')
	})

	test('it writes scenes and never lore (R-B)', () => {
		// The case file is a reference: a pipeline that could write the
		// lorebook could write itself an alibi.
		assert.deepEqual(whodunitGenre.shape?.writes, { lore: false, scenes: true })
	})

	test('the narrator is `voice`, not an envoy — as Adventure and Lair declare one', () => {
		assert.equal(whodunitGenre.shape?.voice, 'narrator')
		assert.equal(whodunitGenre.envoys, undefined)
	})

	test('candour is a quick enum of two, and `open` is the default', () => {
		// `candour`, never `difficulty` (R1, 2026-09-17): Adventure owns that
		// word over `story | normal | hard`, and how forthcoming a suspect is
		// is not how hard a session is.
		const field = whodunitGenre.shape?.fields?.candour as any
		assert.equal(whodunitGenre.shape?.fields?.difficulty, undefined)
		assert.equal(field.type, 'enum')
		assert.deepEqual(field.of, ['open', 'guarded'])
		assert.equal(field.default, 'open')
		assert.equal(field.quick, true)
		// Adventure's two, carried over so the two genres behave the same.
		assert.ok(whodunitGenre.shape?.fields?.tone)
		assert.ok(whodunitGenre.shape?.fields?.trustNarrator)
	})

	test('four slots, and no bars a conversation cannot move', () => {
		const ids = (whodunitGenre.slots ?? []).map((s) => s.id)
		assert.deepEqual(ids, [
			'core:slot/suspicion@1',
			'core:slot/location@1',
			'core:slot/clues-found@1',
			'core:slot/case@1',
		])
		// A suspect has no health, a drawing room has no weather.
		for (const absent of [
			'core:slot/hp@1',
			'core:slot/stamina@1',
			'core:slot/weather@1',
			'core:slot/time-of-day@1',
		])
			assert.ok(!ids.includes(absent), absent)
		assert.deepEqual(
			(whodunitGenre.sheets ?? []).map((s) => s.id),
			['core:sheet/whodunit@1'],
		)
	})

	test('the event surface is the standard one, forms included', () => {
		assert.equal(whodunitGenre.events[sessionEvents.messageRespond]?.required, true)
		assert.equal(whodunitGenre.events[sessionEvents.sessionAction]?.open, true)
		assert.ok(sessionEvents.formAddressed in whodunitGenre.events)
	})
})

/* ── the culprit, as a rule ─────────────────────────────────────────────── */

/**
 * The genre's own copy of the rule — `pickCulprit`, `whodunitHash32`,
 * `whodunitSessionKey` — is **deleted** (D-4a, 2026-09-17). `pickHash32` and
 * `rendezvousPick` (SDK `pick.ts`) are the one implementation the app's
 * binding, this genre and a plugin's picker share, and `pick.test.ts` owns the
 * properties: deterministic, unbiased, displacement ≈ 1/n, the finalizer on.
 *
 * What is left here is the one thing that deletion had to be true for — **the
 * same numbers**. A rendezvous pick is a stored answer in everything but name,
 * so a rule that answered differently would have moved every session in flight
 * to a different suspect while looking like a tidy-up.
 */
describe('the culprit derivation', () => {
	test('the shipped rule answers what the genre’s own copy answered', () => {
		// Recorded from `pickCulprit(41, [11, 12, 13, 14])` before it was
		// deleted, over the key it built for itself: `session:41` — which
		// is the spelling `pick-by-hash@1`'s binding derives from
		// `$.input.sessionScope`.
		assert.equal(rendezvousPick(['11', '12', '13', '14'], 'session:41', (id) => id)?.item, '12')
		assert.equal(pickHash32('session:41#11'), 1973450225)
	})
})

/* ── the pipelines ──────────────────────────────────────────────────────── */

/** Every spec this genre ships, by slug — the catalog is the source of truth. */
const whodunitSpecs = () => CORE_SPECS.filter((s) => /whodunit/.test(s.slug))

/**
 * `slug` → the document's canonical hash, recorded the way the app's
 * `specHashes.test.ts` records one: a moved pin is shippable and still has to
 * be deliberate.
 */
const PUBLISHED: Record<string, string> = {
	// Moved twice on 2026-09-17. First by the `difficulty` → `candour` rename:
	// a create document carries the genre declaration itself (`spec({ genre: {
	// shape … } })`), so a field's key, label, enum and default are inside it.
	// Then by D-4a: the create run now READS THE CAST and derives the culprit
	// (`session-cast` → `cast-choices` → `pick-by-hash`), three nodes that
	// publish to nothing — the derivation is the record.
	// (was '1e3ab7a4c2af5e', then '19d5dd6ff887f0')
	// Then 2026-09-21 (PLAN-turn-order A1): `shape.speakerStrategies: []`
	// became no key — `SessionShape.turnOrder` replaces it (was 'f861e2f9a6c4f').
	// Moved 2026-09-27 (lair pass B9): the genre's events gained
	// message-deleted and message-hidden (was 'fc0acbf4d8443').
	// Moved 2026-09-28 (choice labels): the genre's enum fields gained
	// `members` — each option's display label beside its stored `of` value.
	// Proven: deleting every enum's `members` hashes back to the old pin.
	// (was '9b2d3fa3ffe43')
	'core:spec/whodunit-create': '16108807c385ec',
	// Moved 2026-09-17 (W1): the voices `each` gained a per-speaker
	// character-lore lane, its own pool and its own rank, so a suspect reads
	// their own private entries instead of nobody's — the same three nodes
	// Adventure's and Lair's voices took. (was '112b003db90fdb')
	// Moved 2026-09-27 (owner ruling): the keeper's item arm is `inventory`
	// (was `possessions`) — schema property, `required`, and the preset's
	// `path: values,inventory`. Proven: a copy of core-catalog/src with the rename (and Lair's supply wiring) reverted hashes back to the old pin. (was '1cb242cfc9bd24')
	// Moved 2026-09-27 (lair pass B3/B18): the streaming stage and the stage
	// statuses are declared on `expose` (`stream`, `status`). Proven: with those
	// two keys stripped, the document hashes back to the old pin. (was '5a1ffcfdb0d1c')
	'core:spec/whodunit-respond': '1b0072e773bf87',
	// Moved by D-4a: the picker's `contextBudget → context → lines → prompt →
	// write` chain — a whole model call whose job was to read the cast back out
	// as JSON — is one `cast-choices` task, and the history lane it fed went
	// with it. (was '80dd0b85bd53c')
	// Every action spec below moved 2026-09-17 (plans/31 V2): `contributes.actions[].function`
	// is retired — the key is the identity — so the compiled document lost one field.
	// (was, in order: 1fcd6598d98f0d · 7f7667936f52a · f88907a93acd9 · 1ee69c9e38176 · ea5efc4a07937)
	// Moved 2026-09-28 (lair re-plan R3): the action declares `collects.text`
	// ('Your question', required) — it read `$.input.text` and, since B10 handed
	// text only to a declaring action, got none — and the description says _Ask
	// the question_. Proven: the built document with `collects` deleted and the
	// old description hashes back to the old pin. (was '5832beca7487a')
	'core:spec/whodunit-question': '10aad2f952b459',
	// Moved 2026-09-27 (lair pass B3/B18): the streaming stage and the stage
	// statuses are declared on `expose` (`stream`, `status`). Proven: with those
	// two keys stripped, the document hashes back to the old pin. (was 'b606e9189f9e5')
	'core:spec/whodunit-answer': 'dfd6a38157f33',
	// Moved 2026-09-27: the same item-arm rename (schema + preset path). Proven: a copy of core-catalog/src with the rename (and Lair's supply wiring) reverted hashes back to the old pin.
	// (was 'fb753d069204')
	// Moved 2026-09-27 (lair pass B3/B18): the streaming stage and the stage
	// statuses are declared on `expose` (`stream`, `status`). Proven: with those
	// two keys stripped, the document hashes back to the old pin. (was '1526fd39df4141')
	// Moved 2026-09-28 (lair re-plan R3): the action declares `collects.text`
	// (optional, 'What are you looking for?', ifEmpty 'The scene decides what you
	// find.'). Proven: the built document with `collects` deleted hashes back to
	// the old pin. (was '5953cdf645ad2')
	'core:spec/whodunit-search': '15911a99f36e7a',
	// The same removal as `whodunit-question`. (was '1041c44a77e79')
	'core:spec/whodunit-accuse': '15fb4fa0bbffdd',
	// Moved 2026-09-17 by the verdict compare (c), on `core:task/pair@1`: the
	// spec re-derives the culprit (`cast-choices` → `pick-by-hash`, the create
	// run's two nodes), pairs it with the accusation, and a junction decides the
	// verdict — `accused`, wired to nothing since D-4a, is the first half of
	// that pair. The judge stopped judging: it is the ending's planner now, told
	// the verdict and the culprit through its context's `fields`, and its schema
	// is one property. (was '8be81c0e7bbf5')
	// Moved 2026-09-27 (lair pass B3/B18): the streaming stage and the stage
	// statuses are declared on `expose` (`stream`, `status`). Proven: with those
	// two keys stripped, the document hashes back to the old pin. (was 'ef322651da15')
	'core:spec/whodunit-verdict': '1d374c9d6eb81c',
	// The genre's answer pipeline (ruled 2026-09-17) — `answerFormSpec`'s one
	// graph, published under this genre's inlet lock. It is in this table
	// because `whodunitSpecs()` filters `CORE_SPECS` by slug, exactly as
	// `answer-form-lair` sits in `lair.test.ts`'s.
	// Moved 2026-09-27 (lair pass B3/B18): the streaming stage and the stage
	// statuses are declared on `expose` (`stream`, `status`). Proven: with those
	// two keys stripped, the document hashes back to the old pin. (was '93c213ce4323')
	'core:spec/answer-form-whodunit': '112c3e3dd021b3',
	// Its own turn order since the modder pass (R27, 2026-09-23).
	// Moved 2026-09-27 (lair pass B9): it recomputes on message-deleted and
	// message-hidden too (was '6a86fc61965f4').
	'core:spec/whodunit-turn-order': '4337e87a91f96',
}

describe('the Whodunit pipelines', () => {
	test('nine specs, and every one builds and validates clean', () => {
		const slugs = whodunitSpecs().map((s) => s.slug)
		assert.deepEqual(slugs.sort(), Object.keys(PUBLISHED).sort())
		for (const entry of whodunitSpecs()) {
			const errors = validate(entry.build()).filter((f) => f.severity === 'error')
			assert.deepEqual(
				errors.map((e) => `${e.law} ${e.nodeKey ?? ''} ${e.message}`),
				[],
				entry.slug,
			)
		}
	})

	test('each document hashes to its recorded pin', () => {
		const drifted = whodunitSpecs()
			.map((e) => [e.slug, canonicalHash(e.build())] as const)
			.filter(([slug, hash]) => PUBLISHED[slug] !== hash)
			.map(([slug, hash]) => `${slug}: recorded ${PUBLISHED[slug]}, code ${hash}`)
		assert.deepEqual(
			drifted,
			[],
			'a shipped Whodunit document changed — record the new hash in the same commit',
		)
	})

	/**
	 * The D-4a claim, as a document check: a picker that asks a model to
	 * enumerate the room is a request, a schema and a wait for a fact the run
	 * already holds — and the list the model writes is the list the player may
	 * press, so a misspelling or an invention is a suspect who cannot be
	 * questioned or one who is not in the room.
	 */
	test('neither picker calls a model — the room IS the option list', () => {
		for (const slug of [WHODUNIT_QUESTION_SPEC_ID, WHODUNIT_ACCUSE_SPEC_ID]) {
			const doc = docFor(slug)
			assert.deepEqual(
				doc.nodes.filter((n) => n.kind === 'oracle').map((n) => n.key),
				[],
				slug,
			)
			// And the block's document comes straight off the cast: one edge
			// carries the question and the options, which is ruling (b).
			const wired = doc.edges.find((e) => e.to === 'choices' && e.toPort === 'json')
			assert.equal(wired?.from, 'suspects', slug)
			assert.equal(wired?.fromPort, 'json', slug)
			assert.ok(
				doc.nodes.some(
					(n) => n.key === 'suspects' && n.definitionId === 'core:task/cast-choices',
				),
				slug,
			)
			// Nothing is left bound to the oracle that went. An author default
			// naming a node that is gone configures nothing, silently — and a
			// sampling row is the tell, because the only thing that took one
			// here was the model call this change removed.
			const keys = new Set(doc.nodes.map((n) => n.key))
			for (const preset of doc.presets ?? [])
				for (const v of preset.values ?? []) {
					assert.ok(keys.has(v.nodeKey), `${slug}: preset names '${v.nodeKey}'`)
					assert.equal(v.slot, 'params', `${slug}: ${v.nodeKey}.${v.slot}`)
				}
		}
	})

	test('every write-class outlet is on the spine (01 §4)', () => {
		for (const entry of whodunitSpecs())
			for (const node of entry.build().nodes as SpecDocument['nodes'])
				if (node.kind === 'outlet') assert.equal(node.clauseId, undefined, node.key)
	})

	test('the turn is one row, and every action writes at most one (F7)', () => {
		for (const entry of whodunitSpecs()) {
			const writes = (entry.build().nodes as SpecDocument['nodes']).filter(
				(n) => n.kind === 'outlet',
			)
			if (entry.slug === WHODUNIT_RESPOND_SPEC_ID)
				// The placeholder, and the one update that finishes it.
				assert.deepEqual(
					writes.map((n) => n.key),
					['placeholder', 'save'],
				)
			else assert.ok(writes.length <= 1, `${entry.slug} has ${writes.length} outlets`)
		}
	})

	test('the preset binds every required event and carries the five actions', () => {
		const preset = corePresets().find((p) => p.genre === WHODUNIT_GENRE_ID)!
		assert.equal(preset.slug ?? 'whodunit-default', 'whodunit-default')
		assert.ok(preset.bindings[sessionEvents.sessionCreated])
		assert.ok(preset.bindings[sessionEvents.messageRespond])
		// Declared AND bound (ruled 2026-09-17). Every form this genre puts up
		// today is the detective's to answer, and it binds an answer pipeline
		// anyway: a narrator putting a yes/no to a suspect is a form addressed
		// to somebody the AI portrays, and a form nobody can answer is a stuck
		// session. See the preset's note.
		assert.match(
			preset.bindings[sessionEvents.formAddressed]?.spec ?? '',
			/^core:spec\/answer-form-/,
		)
		assert.equal(preset.actions?.include?.length, 5)
		// The two form-venue declarations are named so a block carrying one has
		// an identity the host can hold a press to.
		assert.ok(preset.actions?.include?.includes(`${WHODUNIT_ANSWER_SPEC_ID}#answer`))
		assert.ok(preset.actions?.include?.includes(`${WHODUNIT_VERDICT_SPEC_ID}#verdict`))
		assert.equal((preset.defaults as any)?.genreFields?.candour, 'open')
	})

	test('the genre ships a layout, and it names only widgets core has', () => {
		// Core's own list, never a copy: a copy kept `inventory` after R79 removed it.
		const known = new Set(CORE_WIDGETS.map((w) => w.id))
		assert.ok(coreLayoutPreset(WHODUNIT_GENRE_ID), 'no shipped layout')
		const v2 = whodunitGenre.layouts![0]!
		const zones = (v2.preset.layout as any).zones as Record<string, any>
		const placed = Object.values(zones).flatMap((z: any) =>
			(z.units ?? []).map((u: any) => u.widget),
		)
		for (const id of placed) assert.ok(known.has(id), id)
		// Suspicion down the left, the interview in the middle, the case right.
		assert.deepEqual(placed, ['stats', 'messages', 'world-state'])
	})
})

/* ── hidden information, structurally ───────────────────────────────────── */

/** The two lanes that can carry a suspect's private, character-bound lore. */
const PRIVATE_LANES = new Set(['core:query/character-lore', 'core:query/lorebook-triggers'])

/** Every node of a document that reads one of them, by key. */
const privateLaneNodes = (slug: string) =>
	(docFor(slug).nodes as any[]).filter((n) => PRIVATE_LANES.has(String(n.definitionId)))

describe('what a prompt may know', () => {
	/**
	 * The whole case at once — every suspect's private entries in one pool — is
	 * `core:query/lorebook-triggers@1`, and it is the judge's alone. A voice's
	 * own entries are a different read (W1, below), made for one person.
	 */
	test('only the judge reads the case whole', () => {
		const readers = whodunitSpecs()
			.filter((entry) =>
				(entry.build().nodes as any[]).some(
					(n) => String(n.definitionId) === 'core:query/lorebook-triggers',
				),
			)
			.map((e) => e.slug)
		assert.deepEqual(
			readers,
			[WHODUNIT_VERDICT_SPEC_ID],
			'a Whodunit pipeline grew a lane that carries every suspect’s private entries',
		)
	})

	/**
	 * **The per-speaker read, structurally** (W1, 2026-09-17). A character-lore
	 * lane on a spine reads ONCE, on a scope that names no character, and every
	 * voice in the clause below it is handed the same pool — which is this
	 * genre's game over. So the one character-lore node in the catalog's
	 * Whodunit specs is inside a clause with a `speaker` wired to it.
	 */
	test('character lore is read per speaker, inside the clause, or not at all', () => {
		const carriers = whodunitSpecs()
			.map((e) => e.slug)
			.filter((slug) =>
				privateLaneNodes(slug).some(
					(n) => String(n.definitionId) === 'core:query/character-lore',
				),
			)
		assert.deepEqual(carriers, [WHODUNIT_RESPOND_SPEC_ID])

		const lanes = (respondDoc().nodes as any[]).filter(
			(n) => String(n.definitionId) === 'core:query/character-lore',
		)
		assert.deepEqual(
			lanes.map((n) => n.key),
			['voices.item.lore'],
		)
		for (const lane of lanes) {
			// Inside the `each`, and subject to the iteration's own speaker.
			assert.ok(lane.clauseId, 'a character-lore lane on the spine reads for everybody')
			const speaker = respondDoc().edges.find(
				(e) => e.to === lane.key && e.toPort === 'speaker',
			)
			assert.equal(speaker?.from, 'voices.item.context')
			assert.equal(speaker?.fromPort, 'speaker')
		}
	})

	test('every other pipeline reads the case as two explicit lanes', () => {
		for (const entry of whodunitSpecs()) {
			if (entry.slug === WHODUNIT_VERDICT_SPEC_ID) continue
			const nodes = (entry.build().nodes as any[]).filter(
				(n) =>
					String(n.definitionId).startsWith('core:query/') &&
					/lore|entries/.test(String(n.definitionId)),
			)
			for (const node of nodes) {
				const lane = String(node.definitionId)
				if (lane === 'core:query/character-lore') {
					// The one exception, and only in the shape above.
					assert.equal(entry.slug, WHODUNIT_RESPOND_SPEC_ID)
					assert.ok(node.clauseId, `${entry.slug}: ${node.key} reads for everybody`)
					continue
				}
				assert.ok(
					lane === 'core:query/world-lore' || lane === 'core:query/history-entries',
					`${entry.slug} reads ${lane}`,
				)
			}
		}
	})

	test('no document a model writes carries the culprit', () => {
		// `build-side-character-context@1` takes `plan`, so anything the
		// planner writes is in every suspect's prompt. The schema is the guard.
		assert.ok(!('culprit' in (WHODUNIT_PLAN_SCHEMA.properties as Record<string, unknown>)))
		assert.equal(WHODUNIT_PLAN_SCHEMA.additionalProperties, false)
		// And the judge's document no longer carries one either (contracts batch
		// 2): it is TOLD the culprit and writes only the beats, so no model in
		// this genre can name a second answer or overrule the pick.
		assert.deepEqual(Object.keys(WHODUNIT_VERDICT_SCHEMA.properties), ['beats'])
		assert.equal(WHODUNIT_VERDICT_SCHEMA.additionalProperties, false)
	})

	test('no voice is handed the genre’s fields — the surface declares none', () => {
		const voice = (respondDoc().nodes as any[]).find((n) => n.key === 'voices.item.context')
		assert.equal(voice.definitionId, 'core:task/build-side-character-context')
		assert.ok(!Object.keys(voice.config ?? {}).includes('fields'), 'a voice was wired fields')
	})
})

/* ── the turn, executed ─────────────────────────────────────────────────── */

const docFor = (slug: string): SpecDocument => CORE_SPECS.find((s) => s.slug === slug)!.build()

const respondDoc = () => docFor(WHODUNIT_RESPOND_SPEC_ID)

/**
 * The author preset, in the shape the executor reads it from.
 *
 * The host projects a document's `.preset()` into the config chain's author
 * layer; `ConfigWorld.authorDefaults` is that layer. Deriving it from the
 * document rather than restating it is what makes this an assertion as well as
 * a fixture: a preset naming a node key that does not exist would configure
 * nothing, and the `path` parameters below are what make the voices iterate and
 * the verdict find its value.
 */
function authorDefaultsOf(doc: SpecDocument): ConfigWorld['authorDefaults'] {
	const out: Record<string, Record<string, Record<string, unknown>>> = {}
	const keys = new Set(doc.nodes.map((n) => n.key))
	for (const preset of doc.presets ?? [])
		for (const v of preset.values ?? []) {
			assert.ok(keys.has(v.nodeKey), `preset names '${v.nodeKey}', which is not a node`)
			out[v.nodeKey] ??= {}
			out[v.nodeKey]![v.slot] = v.value as Record<string, unknown>
		}
	return out
}

/** The value at a dotted path — what `generate-json`'s `path` parameter selects. */
const at = (value: unknown, path?: string): unknown => {
	if (!path) return value
	let cur: any = value
	for (const seg of path.split('.')) {
		if (cur == null) return undefined
		cur = cur[seg]
	}
	return cur
}

const band = (key: string, items: string[] = []) => ({
	sourceKey: key,
	items,
	weight: 0.2,
	minInclude: 0,
	priority: 'normal',
})

/** A drawing room with three suspects in it, and the detective asking. */
const CAST = {
	sessionCharacters: [
		{ character: { id: 11, name: 'Verity' } },
		{ character: { id: 12, name: 'Auben' } },
		{ character: { id: 13, name: 'Mira' } },
	],
}

/**
 * The stand-ins this genre needs on top of `helpers.ts`.
 *
 * ⚠ **Three of them are the test.** `character-lore` and `lorebook-triggers`
 * record every call, so a pipeline that grew a private lane fails here as well
 * as in the document checks above; and `assemble@2` carries the lane keys that
 * reached it onto the context, which is the one fact a stand-in host can read
 * off a model call.
 */
const whodunitBindings = (
	plan: unknown,
	over: Bindings = {},
	seen: { privateLanes: string[] } = { privateLanes: [] },
): Bindings =>
	bindings({
		'core:query/world-lore@1': async () =>
			ok({ main: band('worldLore', ['the study', 'the timetable']), hits: band('worldLore') }),
		'core:query/history-entries@1': async () =>
			ok({ main: band('historyEntries', ['the night of']), hits: band('historyEntries') }),
		/**
		 * ⚠ Keyed on `speaker` (W1): the band is named after whoever the read
		 * was for, so a receipt says which suspect's private lore each voice was
		 * handed — and a leak shows up as another suspect's key in a prompt. The
		 * real gate is the host's; what this proves is that the GRAPH carries a
		 * different subject per iteration.
		 */
		'core:query/character-lore@1': async (i: any) => {
			seen.privateLanes.push(`character-lore:${i?.speaker ?? 'scope'}`)
			const key = `char:${i?.speaker ?? 'scope'}`
			return ok({ main: band(key, ['I did it']), hits: band(key) })
		},
		'core:query/lorebook-triggers@1': async () => {
			seen.privateLanes.push('lorebook-triggers')
			return ok({
				main: band('everything', ['the study', 'Verity did it']),
				hits: band('everything'),
			})
		},
		'core:query/session-cast@1': async () => ok({ main: CAST, cast: CAST }),
		'core:query/session-state@1': async () =>
			ok({
				main: { world: { location: 'The study', case: 'open' }, cast: {} },
				state: { world: { location: 'The study', case: 'open' }, cast: {} },
				version: 7,
			}),
		'core:task/concat-candidates@1': async (i: any) =>
			ok({ main: i.sources ?? [], candidates: i.sources ?? [] }),
		'core:task/rank-hybrid@1': async (i: any) =>
			ok({ main: i.candidates, candidates: i.candidates, decisions: [], groups: [] }),
		'core:task/build-planner-context@1': async () =>
			ok({ main: {}, templateContext: { who: 'planner' }, seedName: '' }),
		'core:task/build-scene-context@1': async (i: any) =>
			ok({
				main: {},
				templateContext: { who: 'narrator', plan: i?.plan },
				seedName: 'Narrator',
			}),
		/**
		 * ⚠ It publishes `speaker` (W1), the way the app's binding does: the name
		 * the planner wrote is matched against the cast ONCE, here, and the
		 * reference is what the voice's own lore lane is wired to — so the voice
		 * the prompt is written in and the secrets it may read are one answer. A
		 * name the cast does not hold is `null`.
		 */
		'core:task/build-side-character-context@1': async (i: any) => {
			const name = String(i?.sideCharacter?.name ?? '')
			const seat = CAST.sessionCharacters.find((c) => c.character.name === name)
			return ok({
				main: {},
				templateContext: { who: name || '?', plan: i?.plan },
				seedName: name || '?',
				speaker: seat ? `character:${seat.character.id}` : null,
			})
		},
		'core:task/build-keeper-context@1': async () =>
			ok({ main: {}, templateContext: { who: 'keeper' }, seedName: '' }),
		'core:task/build-template-context@1': async () =>
			ok({ main: {}, templateContext: { who: 'context' }, seedName: '' }),
		'core:task/build-narrator-context@1': async () =>
			ok({ main: {}, templateContext: { who: 'narrator' }, seedName: 'Narrator' }),
		'core:task/assemble@2': async (i: any) => {
			const raw = Array.isArray(i?.candidates) ? i.candidates : []
			const context = {
				who: i?.templateContext?.who ?? '?',
				plan: i?.templateContext?.plan ?? null,
				lanes: raw.filter(Boolean).map((c: any) => c?.sourceKey),
			}
			return ok({ main: context, context })
		},
		'core:task/prose-transcript@1': async () => ok({ main: [], messages: [] }),
		'core:task/process-messages@1': async (i: any) =>
			ok({ main: [], messages: [], seedName: i?.seedName }),
		'core:oracle/generate-json@1': async (i: any) => {
			const value = at(plan, i?.params?.path)
			return ok({
				main: plan,
				json: plan,
				value,
				items: Array.isArray(value) ? value : value == null ? [] : [value],
				text: JSON.stringify(plan),
			})
		},
		'core:task/join-text@1': async (i: any) => {
			const path = i?.params?.path ?? 'text'
			const sep = i?.params?.separator ?? '\n\n'
			const text = (Array.isArray(i?.items) ? i.items : [])
				.map((e: any) => (path ? e?.[path] : e))
				.filter((t: unknown) => typeof t === 'string' && t.length > 0)
				.join(sep)
			return ok({ main: text, text })
		},
		'core:task/make-choices@1': async (i: any) => {
			const options = (i?.json?.options ?? []) as Array<{ key: string; label: string }>
			const blocks = [
				{
					kind: 'choices',
					question: i?.json?.question ?? '',
					// The port wins over the document's addressee, by contract.
					addressee: i?.addressee ?? i?.json?.addressee ?? null,
					actions: options.map((o) => ({
						fn: i?.fn,
						action: i?.action,
						label: o.label,
						choice: o.key,
					})),
				},
			]
			return ok({
				main: blocks,
				blocks,
				text: i?.json?.question ?? '',
				addressee: i?.addressee ?? null,
			})
		},
		'core:task/read-answer@1': async (i: any) =>
			ok({
				main: i?.payload ?? {},
				choice: i?.payload?.choice ?? null,
				label: i?.payload?.label ?? i?.payload?.choice ?? null,
				addressee: 'owner',
				characterId: null,
				question: i?.payload?.question ?? '',
				values: i?.payload ?? {},
			}),
		/**
		 * ⚠ **An absent side is OMITTED, never null** — the property the verdict
		 * depends on. `predicateHolds` answers false when either side of an
		 * `equalsPath` is `undefined`; two nulls would compare EQUAL and solve a
		 * case nobody accused anybody in. Written out here rather than imported,
		 * because core's handler is the other implementation of the same rule
		 * (`sdk-tests/pair.test.ts` pins it against the declaration).
		 */
		'core:task/pair@1': async (i: any) => {
			const doc: Record<string, unknown> = {}
			const first = i?.params?.firstKey ?? 'first'
			const second = i?.params?.secondKey ?? 'second'
			if (i?.first !== undefined) doc[first] = i.first
			if (i?.second !== undefined) doc[second] = i.second
			return ok({ main: doc })
		},
		'core:query/resolve-state-changes@1': async (i: any) =>
			ok({ main: i?.changes ?? [], changes: i?.changes ?? [], refused: [] }),
		'core:task/set-state@1': async (i: any) =>
			ok({
				main: i?.params?.mode ?? 'propose',
				applied: i?.params?.mode === 'apply' ? i?.changes : [],
				proposed: i?.params?.mode === 'apply' ? [] : i?.changes,
				refused: [],
			}),
		'core:outlet/create-message@1': async (i: any, ctx: any) => {
			const row = await ctx.commit({ text: i.text, blocks: i.blocks })
			return ok({ main: row.id, messageId: row.id })
		},
		'core:outlet/update-message@1': async (i: any, ctx: any) => {
			const row = await ctx.commit({ text: i.text, blocks: i.blocks })
			return ok({ main: row.id, messageId: row.id })
		},
		...over,
	})

/** One ordinary plan: a beat, two suspects with something to say, no clue. */
const PLAN = {
	beats: ['The detective sets the timetable down on the desk.'],
	speakers: [
		{ name: 'Verity', intent: 'account for the hour' },
		{ name: 'Auben', intent: 'object to the question' },
	],
	clueSurfaced: '',
	worldHints: { location: 'The study' },
}

const takeTurn = async (plan: unknown = PLAN, over: Bindings = {}) => {
	const seen = { privateLanes: [] as string[] }
	const doc = respondDoc()
	const receipt = (await run(doc, {
		world: { ...world, authorDefaults: authorDefaultsOf(doc) },
		input: {
			text: 'Where were you between nine and ten?',
			messageId: 'msg:1',
			characterId: null,
			sessionScope: { sessionId: 41 },
			fields: { tone: 'grounded', candour: 'open', trustNarrator: false },
		},
		seed: 'whodunit',
		triggerSource: 'ui',
		bindings: whodunitBindings(plan, over, seen),
	})) as any
	return { receipt, seen }
}

const ran = (receipt: any, key: string) =>
	receipt.nodes.some((n: any) => n.nodeKey === key && n.result === 'ok')

describe('a Whodunit turn', () => {
	test('one voice call per suspect the planner named, joined into one reply', async () => {
		const said: string[] = []
		const { receipt } = await takeTurn(PLAN, {
			'core:oracle/generate-text@1': async (i: any) => {
				const who = i?.context?.who ?? '?'
				said.push(who)
				return ok({ main: `<${who}>`, text: `<${who}>` })
			},
		})

		assert.equal(receipt.outcome, 'ok')
		assert.deepEqual(said.sort(), ['Auben', 'Verity', 'narrator'])
		const voices = receipt.nodes.filter((n: any) => n.nodeKey === 'voices.item.say')
		assert.equal(voices.length, PLAN.speakers.length)
		const save = receipt.nodes.find((n: any) => n.nodeKey === 'save')
		assert.equal(save.result, 'ok')
		assert.equal(save.input.text, '<narrator>\n\n<Verity>\n\n<Auben>')
		// And the notes ran, because a scene was written.
		assert.ok(ran(receipt, 'keeperWrite'))
	})

	/**
	 * **Each suspect's own private lore, and nobody else's** (W1, built
	 * 2026-09-17).
	 *
	 * The gather runs once on the run's scope, so before this a lane there would
	 * have handed every suspect every other suspect's self-knowledge — which in
	 * this genre is the answer. The lane is inside the `each` and its subject is
	 * the reference the voice's own context node resolved.
	 */
	test('each voice reads their own private lore, and no other suspect’s', async () => {
		const { receipt, seen } = await takeTurn()

		assert.equal(receipt.outcome, 'ok')
		// One read per voice, each for a different person — and never a read on
		// the run's scope, which is the omniscient one.
		assert.deepEqual(seen.privateLanes.sort(), [
			'character-lore:character:11',
			'character-lore:character:12',
		])
		const lanes = receipt.nodes.filter((n: any) => n.nodeKey === 'voices.item.lore')
		assert.equal(lanes.length, PLAN.speakers.length)
		assert.deepEqual(
			lanes.map((n: any) => n.input.speaker).sort(),
			['character:11', 'character:12'],
		)

		// And what each voice's prompt WAS built from: the case as publicly
		// known, the timeline, the transcript's own band — and exactly one
		// character band, their own.
		const prompts = receipt.nodes.filter((n: any) => n.nodeKey === 'voices.item.prompt')
		assert.equal(prompts.length, PLAN.speakers.length)
		const pools = prompts.map((n: any) => [...(n.output?.context?.lanes ?? [])].sort())
		assert.deepEqual(pools.sort(), [
			['char:character:11', 'history', 'historyEntries', 'worldLore'],
			['char:character:12', 'history', 'historyEntries', 'worldLore'],
		])
		// The narrator is nobody, so the narrator reads nobody's.
		const scene = receipt.nodes.find((n: any) => n.nodeKey === 'scenePrompt')
		assert.deepEqual([...scene.output.context.lanes].sort(), [
			'history',
			'historyEntries',
			'worldLore',
		])
	})

	test('nothing but the plan and the pool reaches a voice', async () => {
		// Adversarial: a planner that wrote a `culprit` key anyway. The whole
		// document is on the `plan` port — that is what the port is for — so
		// the guard is the SCHEMA (asserted above), and what this pins is that
		// no OTHER channel into a voice exists to be widened later.
		const { receipt } = await takeTurn({ ...PLAN, culprit: 'Verity' })
		for (const node of receipt.nodes.filter((n: any) => n.nodeKey === 'voices.item.prompt'))
			assert.deepEqual(Object.keys(node.output?.context ?? {}).sort(), [
				'lanes',
				'plan',
				'who',
			])
	})
})

/* ── opening a case ─────────────────────────────────────────────────────── */

/**
 * The two pure nodes, as the app binds them.
 *
 * `rendezvousPick` is not a stand-in for the pick: it IS the function the app's
 * binding calls (SDK `pick.ts`), so what the identity rule and the key
 * spelling do here is what they do in the app. The shaping around it mirrors
 * `core:task/cast-choices@1`'s binding: live seats only, keyed by participant
 * reference, characters before personas.
 */
const pickBindings = (): Bindings => ({
	'core:task/cast-choices@1': async (i: any) => {
		const cast = i?.cast ?? {}
		const exclude = i?.params?.exclude ?? 'none'
		const seats =
			exclude === 'characters'
				? []
				: (cast.sessionCharacters ?? []).filter(
						(cc: any) => cc?.character && cc.removedAt == null && cc.enabled !== false,
					)
		const personas =
			exclude === 'personas'
				? []
				: (cast.sessionPersonas ?? []).filter((cp: any) => cp?.persona && cp.removedAt == null)
		const options = [
			...seats.map((cc: any) => ({
				key: `character:${cc.character.id}`,
				label: cc.character.name,
			})),
			...personas.map((cp: any) => ({
				key: `character:${cp.persona.id}`,
				label: cp.persona.name,
			})),
		]
		const question = typeof i?.question === 'string' ? i.question : ''
		return ok({ main: options, options, json: { question, options } })
	},
	'core:task/pick-by-hash@1': async (i: any) => {
		const key =
			typeof i?.scopeKey === 'string'
				? i.scopeKey.trim()
				: typeof i?.scopeKey?.sessionId === 'number'
					? `session:${i.scopeKey.sessionId}`
					: ''
		if (!key) return halt('there is nothing to pick under')
		const by = typeof i?.params?.by === 'string' ? i.params.by : ''
		const picked = rendezvousPick(
			Array.isArray(i?.items) ? i.items : [],
			key,
			(item: any) => {
				const raw = by && item && typeof item === 'object' ? item[by] : item
				return typeof raw === 'string' && raw ? raw : null
			},
		)
		if (!picked) return halt('there was nothing to pick from')
		return ok({ main: picked.item, pickIndex: picked.index, chosenKey: picked.key })
	},
})

/** The detective, seated beside the three suspects — a persona is a cast member too (0132). */
const CAST_WITH_DETECTIVE = {
	...CAST,
	sessionPersonas: [{ persona: { id: 21, name: 'Inspector Hale' } }],
}

const openCase = async (sessionId: number | string = 41) => {
	const doc = docFor(WHODUNIT_CREATE_SPEC_ID)
	const receipt = (await run(doc, {
		world: { ...world, authorDefaults: authorDefaultsOf(doc) },
		input: { sessionScope: { sessionId } },
		seed: 'whodunit-create',
		triggerSource: 'event',
		bindings: whodunitBindings(null, {
			...pickBindings(),
			'core:inlet/session-created@1': async (i: any) => ok(i),
			'core:query/session-cast@1': async () =>
				ok({ main: CAST_WITH_DETECTIVE, cast: CAST_WITH_DETECTIVE }),
			'core:query/session-greetings@1': async () =>
				ok({ main: [], greetings: [{ characterId: 11, text: 'You came.' }] }),
			'core:outlet/seed-greetings@1': async (i: any, ctx: any) => {
				const row = await ctx.commit({ greetings: i.greetings, channel: i.channel })
				return ok({ main: row.id, messageIds: [row.id] })
			},
		}),
	})) as any
	return receipt
}

const outputOf = (receipt: any, key: string) =>
	receipt.nodes.find((n: any) => n.nodeKey === key)?.output

describe('opening a case', () => {
	test('the create run derives a culprit from the cast, and the same one every time', async () => {
		const receipt = await openCase()
		assert.equal(receipt.outcome, 'ok')

		const chosen = outputOf(receipt, 'culprit')?.chosenKey
		// One of the suspects, by participant reference — never a name, which
		// two cast members can share and an author can edit.
		assert.ok(['character:11', 'character:12', 'character:13'].includes(chosen), String(chosen))
		// The detective is a cast member and cannot be the answer.
		assert.notEqual(chosen, 'character:21')
		assert.equal(outputOf(receipt, 'suspects')?.options.length, 3)

		// Twice is the same case — the scope is the key, never the run's seed,
		// which is a different string on every run.
		assert.equal(outputOf(await openCase(), 'culprit')?.chosenKey, chosen)
	})

	test('and writes it down nowhere — the derivation IS the record', async () => {
		const doc = docFor(WHODUNIT_CREATE_SPEC_ID)
		// Nothing READS the pick. The one edge out of it is the spine's own
		// implicit `main → main`, which every node with no explicit input from
		// the one above it gets — and it lands on the greetings READ, which
		// declares no `main` port and writes nothing. That is why the
		// derivation is declared before the greetings and not after: last, the
		// spine would hand the answer to the outlet.
		assert.deepEqual(
			doc.edges
				.filter((e) => e.from === 'culprit')
				.map((e) => `${e.to}.${e.toPort}${(e as any).implicit ? ' (spine)' : ''}`),
			['collect.main (spine)'],
		)
		const writes = doc.nodes.filter((n) => n.kind === 'outlet').map((n) => n.key)
		assert.ok(!doc.edges.some((e) => e.from === 'culprit' && writes.includes(e.to)))
		// And the create graph has no way to store one even if something did:
		// the attribute ledger is the only per-session store a spec can reach,
		// and two widgets render it.
		for (const node of doc.nodes)
			assert.ok(
				!/set-state|resolve-state-changes|create-lore-entry|create-message/.test(
					String(node.definitionId),
				),
				node.key,
			)

		const receipt = await openCase()
		const chosen = outputOf(receipt, 'culprit')!.chosenKey
		const seeded = receipt.nodes.find((n: any) => n.nodeKey === 'seed')
		assert.equal(seeded.result, 'ok')
		assert.ok(
			!JSON.stringify(seeded.input ?? {}).includes(chosen),
			'the culprit reached the row this run writes',
		)
	})
})

/* ── the accusation ─────────────────────────────────────────────────────── */

/**
 * The room as `cast-choices` shapes it, and who the hash says did it.
 *
 * Derived here the way the run derives it — `rendezvousPick` is the function
 * the app's binding calls — rather than written down, because a hard-coded
 * suspect would pass this suite while the graph reached a different one.
 */
const SUSPECT_KEYS = CAST.sessionCharacters.map((c) => `character:${c.character.id}`)
const CULPRIT = rendezvousPick(SUSPECT_KEYS, 'session:41', (k) => k)!.key
const INNOCENT = SUSPECT_KEYS.find((k) => k !== CULPRIT)!

/** What the judge writes now: the beats of the reveal, and nothing decided. */
const ENDING_PLAN = {
	beats: ['They are named in front of the room.', 'The timetable was the proof.'],
}

const accuse = async (accused?: string, over: Bindings = {}) => {
	const doc = docFor(WHODUNIT_VERDICT_SPEC_ID)
	const seen = { privateLanes: [] as string[] }
	const receipt = (await run(doc, {
		world: { ...world, authorDefaults: authorDefaultsOf(doc) },
		input: {
			text: '',
			sessionScope: { sessionId: 41 },
			characterId: null,
			fields: { tone: 'grounded', candour: 'open', trustNarrator: false },
			payload: accused === undefined ? {} : { choice: accused, label: accused },
			form: { kind: 'choices', question: 'Who do you name?' },
		},
		seed: 'whodunit-verdict',
		triggerSource: 'ui',
		bindings: whodunitBindings(
			ENDING_PLAN,
			{
				...pickBindings(),
				'core:oracle/generate-text@1': async (i: any) =>
					ok({
						main: 'the ending',
						text: `ending:${JSON.stringify(i?.context?.plan?.beats ?? [])}`,
					}),
				...over,
			},
			seen,
		),
	})) as any
	return { receipt, seen }
}

const stateChange = (receipt: any) =>
	receipt.nodes.find((n: any) => n.nodeKey === 'apply')?.input?.changes?.[0]

/** Which branch of the verdict junction actually ran. */
const branches = (receipt: any): string[] =>
	receipt.nodes
		.filter((n: any) => String(n.nodeKey).startsWith('verdict.'))
		.map((n: any) => n.nodeKey)

describe('naming somebody', () => {
	test('right ⇒ the case is solved, and the ending is written from the beats', async () => {
		const { receipt, seen } = await accuse(CULPRIT)

		assert.equal(receipt.outcome, 'ok')
		// The pick is the create run's, re-derived: same list, same scope.
		assert.equal(outputOf(receipt, 'culprit')?.chosenKey, CULPRIT)
		assert.deepEqual(branches(receipt), ['verdict.solved.word'])
		assert.deepEqual(stateChange(receipt), { owner: 'world', slot: 'case', value: 'solved' })
		// Applied, not proposed: a verdict parked at a review gate is a case
		// that never closes.
		assert.equal(receipt.nodes.find((n: any) => n.nodeKey === 'apply').output.main, 'apply')
		// The ending is the judge's beats, and the judge was TOLD.
		const save = receipt.nodes.find((n: any) => n.nodeKey === 'save')
		assert.match(save.input.text, /They are named in front of the room\./)
		// And the one pipeline that is allowed to know asked for everything.
		assert.deepEqual(seen.privateLanes, ['lorebook-triggers'])
	})

	test('wrong ⇒ the case fails, and it still ends', async () => {
		const { receipt } = await accuse(INNOCENT)

		assert.equal(receipt.outcome, 'ok')
		assert.deepEqual(branches(receipt), ['verdict.failed.word'])
		assert.deepEqual(stateChange(receipt), { owner: 'world', slot: 'case', value: 'failed' })
		const save = receipt.nodes.find((n: any) => n.nodeKey === 'save')
		assert.equal(save.result, 'ok')
		assert.match(save.input.text, /They are named in front of the room\./)
	})

	/**
	 * **An accusation that never arrived cannot solve the case.**
	 *
	 * `pair@1` omits an absent side rather than writing `null`, and
	 * `predicateHolds` answers false when either side of an `equalsPath` is
	 * absent — so a run whose `accused` published nothing falls through to
	 * `failed`. Null would have destroyed that: `null === null`, and a run where
	 * nobody accused anybody would have solved the case.
	 */
	test('no answer ⇒ the case fails — never solves', async () => {
		const { receipt } = await accuse(undefined, {
			// The press carried no choice at all: the port publishes nothing.
			'core:task/read-answer@1': async () => ok({ main: {} }),
		})

		assert.equal(receipt.outcome, 'ok')
		const paired = outputOf(receipt, 'pairing')?.main
		assert.deepEqual(Object.keys(paired), ['culprit'])
		assert.deepEqual(branches(receipt), ['verdict.failed.word'])
		assert.deepEqual(stateChange(receipt), { owner: 'world', slot: 'case', value: 'failed' })
	})

	/**
	 * The culprit is derived, and it goes to two places: the pair the junction
	 * compares, and the document the judge is told. No prompt before the judge
	 * and no row this run writes carries the reference.
	 */
	test('the culprit reaches the judge and the ending, and nothing else', async () => {
		const { receipt } = await accuse(INNOCENT)

		const carriers = receipt.nodes
			.filter((n: any) => JSON.stringify(n.input ?? {}).includes(CULPRIT))
			.map((n: any) => n.nodeKey)
			.sort()
		assert.deepEqual(carriers, ['culprit', 'judgeContext', 'pairing', 'told'])

		// What the judge is told, in the shape the prompt renders: `{{verdict}}`
		// and `{{culprit.label}}`, off the surface that publishes `fields` under
		// their own names.
		const told = receipt.nodes.find((n: any) => n.nodeKey === 'judgeContext').input.fields
		assert.deepEqual(told, {
			verdict: 'failed',
			culprit: {
				key: CULPRIT,
				label: CAST.sessionCharacters.find(
					(c) => `character:${c.character.id}` === CULPRIT,
				)!.character.name,
			},
		})
		// The ending reads the judge's beats and nothing else about them.
		const ending = receipt.nodes.find((n: any) => n.nodeKey === 'endingContext')
		assert.deepEqual(ending.input.plan, ENDING_PLAN)
		// The row this run writes is the ending's prose — never a reference.
		const save = receipt.nodes.find((n: any) => n.nodeKey === 'save')
		assert.ok(!String(save.input.text).includes(CULPRIT))
	})

	test('the two words the branches publish are the slot’s two closed states', () => {
		// `resolve-state-changes` validates a value against the slot's declared
		// enum, so a third spelling would be refused and reported to nobody.
		const doc = docFor(WHODUNIT_VERDICT_SPEC_ID)
		const words = (doc.nodes as any[])
			.filter((n) => String(n.key).startsWith('verdict.'))
			.map((n) => (n.config?.items as any[])?.[0]?.text)
		assert.deepEqual(words, ['solved', 'failed'])
		for (const word of words)
			assert.ok(
				(caseSlot.config as any).of.includes(word),
				`${word} is not a value \`core:slot/case@1\` accepts`,
			)
		// And `open`, the third, is the one no branch may write.
		assert.deepEqual((caseSlot.config as any).of, ['open', ...words])
	})

	test('Accuse is offered while the case is open and closed afterwards', () => {
		const action = (docFor(WHODUNIT_ACCUSE_SPEC_ID) as any).contributes.actions.find(
			(a: any) => a.key === 'accuse',
		)
		assert.equal(action.enabledWhen[0].on, 'state.world.case')
		assert.equal(action.enabledWhen[0].equals, 'open')

		const over = (value: string) =>
			evaluateEnabledWhen(action.enabledWhen, { state: { world: { case: value } } })
		assert.equal(over('open').enabled, true)
		assert.equal(over('solved').enabled, false)
		assert.equal(over('failed').enabled, false)
		// The refusal carries the sentence a person is shown.
		const closed = over('solved')
		assert.ok(!closed.enabled && closed.reason.en)
	})
})

/* ── putting a question to one suspect ──────────────────────────────────── */

const fire = async (slug: string, input: Record<string, unknown>) => {
	const doc = docFor(slug)
	const seen = { privateLanes: [] as string[] }
	const receipt = (await run(doc, {
		world: { ...world, authorDefaults: authorDefaultsOf(doc) },
		input: {
			text: 'Where were you between nine and ten?',
			sessionScope: { sessionId: 41 },
			characterId: null,
			fields: { tone: 'grounded', candour: 'open', trustNarrator: false },
			...input,
		},
		seed: 'whodunit-action',
		triggerSource: 'ui',
		bindings: whodunitBindings(
			null,
			{
				...pickBindings(),
				'core:oracle/generate-text@1': async (i: any) =>
					ok({ main: 'said', text: `<${i?.context?.who ?? '?'}>` }),
			},
			seen,
		),
	})) as any
	return { receipt, seen }
}

describe('Question, and the suspect who answers it', () => {
	test('the picker is a form addressed to the OWNER, one option per suspect', async () => {
		const { receipt, seen } = await fire(WHODUNIT_QUESTION_SPEC_ID, {})

		assert.equal(receipt.outcome, 'ok')
		const save = receipt.nodes.find((n: any) => n.nodeKey === 'save')
		assert.equal(save.result, 'ok')
		const block = save.input.blocks[0]
		assert.equal(block.kind, 'choices')
		// The thing this test exists for: the detective chooses, not the room.
		assert.equal(block.addressee, 'owner')
		// One option per seated suspect, keyed by participant reference and
		// labelled with the name — the cast read, shaped, with no model in
		// between (D-4a).
		assert.deepEqual(
			block.actions.map((a: any) => a.choice),
			['character:11', 'character:12', 'character:13'],
		)
		assert.deepEqual(
			block.actions.map((a: any) => a.label),
			['Verity', 'Auben', 'Mira'],
		)
		for (const action of block.actions) {
			assert.equal(action.fn, 'answer')
			assert.equal(action.action, `${WHODUNIT_ANSWER_SPEC_ID}#answer`)
		}
		// The row carries what the detective typed, which is what *Answer*'s
		// suspect reads back out of the transcript.
		assert.equal(block.question, 'Where were you between nine and ten?')
		assert.equal(save.input.text, 'Where were you between nine and ten?')
		assert.deepEqual(seen.privateLanes, [])
	})

	test('and the accusation is the same picker, with its own line above it', async () => {
		const { receipt } = await fire(WHODUNIT_ACCUSE_SPEC_ID, {})

		assert.equal(receipt.outcome, 'ok')
		const block = receipt.nodes.find((n: any) => n.nodeKey === 'save').input.blocks[0]
		assert.equal(block.addressee, 'owner')
		assert.match(block.question, /^Who do you accuse\?/)
		assert.deepEqual(
			block.actions.map((a: any) => a.choice),
			['character:11', 'character:12', 'character:13'],
		)
		for (const action of block.actions) {
			assert.equal(action.fn, 'verdict')
			assert.equal(action.action, `${WHODUNIT_VERDICT_SPEC_ID}#verdict`)
		}
	})

	test('the suspect the detective picked answers, in their own name', async () => {
		const { receipt, seen } = await fire(WHODUNIT_ANSWER_SPEC_ID, {
			// What a press off the block above actually carries now: the
			// option's participant reference, and the name as its label.
			payload: { choice: 'character:11', label: 'Verity' },
			form: { kind: 'choices', question: 'Where were you between nine and ten?' },
		})

		assert.equal(receipt.outcome, 'ok')
		// The name off the press reaches the context builder, which is what
		// resolves it against the cast and decides whose card is compiled.
		const context = receipt.nodes.find((n: any) => n.nodeKey === 'context')
		assert.deepEqual(context.input.sideCharacter, { name: 'Verity' })
		const save = receipt.nodes.find((n: any) => n.nodeKey === 'save')
		assert.equal(save.input.text, '<Verity>')
		// The row is the suspect's, not the narrator's.
		assert.deepEqual(save.input.sideCharacter, { name: 'Verity' })
		assert.equal(save.input.narration, undefined)
		// And nobody else's private lore was fetched to write it.
		assert.deepEqual(seen.privateLanes, [])
		const prompt = receipt.nodes.find((n: any) => n.nodeKey === 'prompt')
		assert.deepEqual([...prompt.output.context.lanes].sort(), [
			'history',
			'historyEntries',
			'worldLore',
		])
	})
})
