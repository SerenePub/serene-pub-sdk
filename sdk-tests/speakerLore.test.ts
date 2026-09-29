/**
 * **Per-speaker lore scope** (W1, ruled 2026-09-17) — the `speaker` port on the
 * two lore reads, and a spec wiring it inside a repeating clause.
 *
 * The defect it closes: character-lore visibility is decided at the host read
 * against ONE subject, the gather runs ONCE, and no node could construct a
 * scope inside a clause — so every voice of a multi-agent turn was handed
 * every character's private self-knowledge. Adventure's and Lair's `each`
 * voices read one pool; Whodunit wired no character-lore lane at all rather
 * than leak its suspects to each other. All three wire this port now
 * (Whodunit last, 2026-09-17), each inside its own voices clause.
 *
 * Three claims:
 *
 *  · `core:query/character-lore@1` and `core:query/lorebook-triggers@1` each
 *    declare a `speaker` in-port, and it is a **participant reference** — the
 *    spelling `cast-choices` keys its options with and the side-character
 *    inlet publishes;
 *  · `core:task/build-side-character-context@1` publishes the resolved
 *    reference, so the voice a prompt is written in and the secrets that voice
 *    may read are ONE answer rather than two name matches;
 *  · a spec that wires the second into the first **inside an `each`** builds
 *    and validates clean — which is the whole shape, since a scope belongs to
 *    the run and a speaker belongs to the iteration.
 *
 * ⚠ It reads the **contracts source**, as every suite here does: this
 * project's `sdk-tests/tsconfig.json` maps `@serene-pub/contracts` to
 * `../contracts/src/index.ts` and `tsx` honours it, so a declaration written
 * today is visible without a build. `@serene-pub/core-catalog` has no such
 * mapping and is a build behind — which is why the genres that wire this port
 * are asserted in `lair.test.ts` (which imports the catalog's source) and not
 * here.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { compile, isParticipantRef, slot, spec, validate } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'

/* ── the declarations ───────────────────────────────────────────────────── */

/**
 * A definition's ports, widened.
 *
 * `Descriptor` keeps the port names in the type, which is the whole point of
 * the generics — and it means asking a definition for a port it does NOT
 * declare is a compile error rather than `undefined`. These tests ask exactly
 * that question, so they read the map as a map.
 */
const portsIn = (d: { descriptor: { ports: { in?: object } } }) =>
	(d.descriptor.ports.in ?? {}) as Record<string, string | undefined>
const portsOut = (d: { descriptor: { ports: { out?: object } } }) =>
	(d.descriptor.ports.out ?? {}) as Record<string, string | undefined>

describe('the lore reads take a speaker', () => {
	test('both gated reads declare it, and neither ungated one does', () => {
		const ref = 'core:shape/participant-ref@1'
		assert.equal(portsIn(C.characterLore).speaker, ref)
		assert.equal(portsIn(C.lorebookTriggers).speaker, ref)
		// World lore and history are not gated by a binding, so a speaker port
		// on them would be a control that reads nothing (R-12).
		assert.equal(portsIn(C.worldLore).speaker, undefined)
		assert.equal(portsIn(C.historyEntries).speaker, undefined)
		// The listing stays narrator-shaped: it answers "does this exist".
		assert.equal(portsIn(C.lorebookEntries).speaker, undefined)
	})

	test('it is additive — `scope` is still there and still the same shape', () => {
		for (const d of [C.characterLore, C.lorebookTriggers])
			assert.equal(portsIn(d).scope, 'core:shape/session-scope@1', d.id)
	})

	test('the side-character context publishes the reference the query takes', () => {
		assert.equal(
			portsOut(C.buildSideCharacterContext).speaker,
			portsIn(C.characterLore).speaker,
		)
		// It still takes no `currentCharacterId`: the id is published, never
		// set — see the definition's own note.
		assert.equal(portsIn(C.buildSideCharacterContext).currentCharacterId, undefined)
	})

	test('`character:<id>` is what a spec wires — the one reference vocabulary', () => {
		assert.ok(isParticipantRef('character:12'))
		assert.ok(isParticipantRef('owner'))
		assert.ok(!isParticipantRef('Verity'))
	})
})

/* ── a spec wiring it inside a clause ───────────────────────────────────── */

/**
 * The shape the three multi-agent genres take: one gather, one plan, then a
 * voice per speaker the planner named — and, inside that clause, the voice's
 * OWN lore lane, its own pool and its own rank.
 */
const voicesSpec = () =>
	spec('demo:voices@1', { version: '1.0.0' })
		.inlet('input', C.userMessage.v1())
		.gather('gather', { mode: 'parallel' }, (b) =>
			b
				.chain('history', (c) =>
					c.query('read', ($) => C.sessionHistory.v1({ scope: $.input.sessionScope })),
				)
				.chain('worldLore', (c) =>
					c.query('read', ($) => C.worldLore.v1({ scope: $.input.sessionScope })),
				)
				.chain('cast', (c) =>
					c.query('read', ($) => C.sessionCast.v1({ scope: $.input.sessionScope })),
				),
		)
		.task('contextBudget', () => C.contextBudget.v1({ sampling: slot.samplingOf('plan') }))
		.task('lore', ($) =>
			C.concatCandidates.v1({
				sources: [$.gather.history.read.band, $.gather.worldLore.read.main] as any,
			}),
		)
		.task('rank', ($) =>
			C.rankHybrid.v1({
				candidates: $.lore.candidates,
				budget: $.contextBudget.available,
				params: slot.params(),
			}),
		)
		.task('planPrompt', ($) =>
			C.assemble.v2({ candidates: $.rank.candidates, budget: $.contextBudget.available }),
		)
		.oracle('plan', ($) =>
			C.generateJson.v1({
				context: $.planPrompt.context,
				connection: slot.connection(),
				params: slot.params(),
			}),
		)
		.each('voices', { over: ($: any) => $.plan.items, max: 4, mode: 'parallel' }, (m) =>
			m
				.task('context', ($: any) =>
					C.buildSideCharacterContext.v1({
						cast: $.gather.cast.read.cast,
						sideCharacter: $.voices.item,
					}),
				)
				// The claim: a scope is the run's and a speaker is the
				// iteration's, so the only place they can be one fact is here.
				.query('lore', ($: any) =>
					C.characterLore.v1({
						scope: $.input.sessionScope,
						speaker: $.voices.item.context.speaker,
						params: slot.params({ node: 'gather.worldLore.read' }),
					}),
				)
				.task('pool', ($: any) =>
					C.concatCandidates.v1({
						sources: [
							$.gather.history.read.band,
							$.gather.worldLore.read.main,
							$.voices.item.lore.main,
						] as any,
					}),
				)
				.task('rank', ($: any) =>
					C.rankHybrid.v1({
						candidates: $.voices.item.pool.candidates,
						budget: $.contextBudget.available,
						params: slot.params(),
					}),
				)
				.task('prompt', ($: any) =>
					C.assemble.v2({
						candidates: $.voices.item.rank.candidates,
						decisions: $.voices.item.rank.decisions,
						groups: $.voices.item.rank.groups,
						budget: $.contextBudget.available,
						templateContext: $.voices.item.context.templateContext,
					}),
				)
				.oracle('say', ($: any) =>
					C.generateText.v1({
						context: $.voices.item.prompt.context,
						connection: slot.connection(),
					}),
				),
		)
		.task('reply', ($: any) => C.joinText.v1({ items: $.voices.values }))
		.outlet('save', ($: any) => C.createMessage.v1({ text: $.reply.text }))

describe('a per-speaker lore lane inside an `each`', () => {
	test('it builds and validates clean', () => {
		const doc = compile(voicesSpec().build())
		const errors = validate(doc).filter((f) => f.severity === 'error')
		assert.deepEqual(
			errors.map((e) => `${e.law} ${e.nodeKey ?? ''} ${e.message}`),
			[],
		)
	})

	test('the lane is INSIDE the clause, and the edge is the context node’s speaker', () => {
		const doc = compile(voicesSpec().build())
		const lane = doc.nodes.find((n) => n.key === 'voices.item.lore')!
		assert.equal(lane.definitionId, 'core:query/character-lore')
		assert.ok(lane.clauseId, 'the lane is on the spine — a gather would run it once')
		const edge = doc.edges.find((e) => e.to === 'voices.item.lore' && e.toPort === 'speaker')
		assert.ok(edge, 'no speaker edge')
		assert.equal(edge!.from, 'voices.item.context')
		assert.equal(edge!.fromPort, 'speaker')
	})

	test('the shared gather still runs once — the speaker is what differs', () => {
		const doc = compile(voicesSpec().build())
		const gathered = doc.nodes.filter((n) => n.clauseId === 'gather').map((n) => n.key)
		assert.deepEqual(gathered.sort(), [
			'gather.cast.read',
			'gather.history.read',
			'gather.worldLore.read',
		])
	})
})
