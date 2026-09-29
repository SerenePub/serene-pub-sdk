/**
 * The pick hash, and the two pure definitions built on it (D-4a, 2026-09-17).
 *
 * `rendezvousPick` is a **stored answer in everything but name**: nothing
 * writes the culprit down, so the function IS the record, and a change to it
 * silently moves every session in flight to a different suspect. So what is
 * pinned here is not "it returns something" but the four properties a genre
 * is relying on when it derives a fact instead of authoring one:
 *
 *  1. **Deterministic**, in both arguments and in neither's order.
 *  2. **Unbiased** over 3–5 candidates whose keys differ in their last
 *     character — the adversarial case, and the one plain FNV-1a fails at
 *     49%/33% (`sdk-tests/whodunit.test.ts` measures the same thing on the
 *     genre's own copy, which this replaces).
 *  3. **Displacement ≈ 1/n** when a candidate is added — the property an
 *     index into a shuffled list does not have.
 *  4. **The finalizer is on**: two keys one character apart do not land in
 *     neighbouring high bits.
 *
 * Plus the two definitions' shapes, which are contract: `pick-by-hash` is a
 * task with no `optional` (an empty list is the run's failure, never an `ok`
 * that reads absent downstream) and `cast-choices` publishes plain JSON.
 *
 * Both were named the same night (R3, free because neither had shipped):
 * `key` → **`scopeKey`**, `index` → **`pickIndex`**. And `cast-choices` gained
 * the question and the whole `{ question, options }` document, so it wires
 * straight into `core:task/make-choices@1` — the composition the last
 * describe here builds and validates.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
	compile,
	getDefinition,
	pickHash32,
	rendezvousPick,
	S,
	spec,
	validate,
} from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'

/** The shape a genre picks over: rows with an id. */
const rows = (ids: readonly number[]) => ids.map((id) => ({ id, name: `row ${id}` }))
const byId = (r: { id: number }) => String(r.id)

/** The culprit for a session, as `whodunit-create` will ask for it. */
const pickId = (session: number | string, ids: readonly number[]): number | null =>
	rendezvousPick(rows(ids), `session:${session}`, byId)?.item.id ?? null

describe('the pick hash', () => {
	test('the finalizer is on — the high bits avalanche', () => {
		// Two keys one character apart must not hash to neighbouring values;
		// plain FNV-1a leaves the top byte all but identical, and the pick
		// compares whole hashes, so the top byte is what decides.
		assert.notEqual(pickHash32('session:41#11') >>> 24, pickHash32('session:41#12') >>> 24)
		assert.notEqual(pickHash32('session:41#12') >>> 24, pickHash32('session:41#13') >>> 24)
	})

	test('it is a 32-bit unsigned number, the same one every time', () => {
		const h = pickHash32('session:41#11')
		assert.equal(h, pickHash32('session:41#11'))
		assert.ok(Number.isInteger(h) && h >= 0 && h <= 0xffffffff)
		assert.equal(pickHash32(''), pickHash32(''))
	})
})

describe('rendezvousPick', () => {
	test('the same key reaches the same item, whatever order the rows arrive in', () => {
		const ids = [11, 12, 13, 14]
		const first = pickId(41, ids)
		assert.ok(first != null)
		assert.equal(pickId(41, ids), first)
		// Each candidate is scored on its own, so a query that happened to
		// return its rows the other way round cannot move the answer.
		assert.equal(pickId(41, [...ids].reverse()), first)
		assert.equal(pickId(41, [13, 11, 14, 12]), first)
		// The key is a string; the session's id spelled either way is one key.
		assert.equal(pickId('41', ids), first)
	})

	test('it answers where the item sat and what it won under', () => {
		const items = rows([11, 12, 13, 14])
		const picked = rendezvousPick(items, 'session:41', byId)!
		assert.ok(picked)
		// The index is into the list AS HANDED IN — a spec wiring it back
		// is indexing its own list, not a filtered copy.
		assert.equal(items[picked.index], picked.item)
		assert.equal(picked.key, String(picked.item.id))
	})

	test('nothing identifiable is null, not a guess', () => {
		assert.equal(rendezvousPick([], 'session:1', byId), null)
		// An entry `keyOf` cannot name is skipped rather than scored under a
		// shared empty key, which would make every nameless entry one
		// candidate.
		const mixed = [{ id: 0 }, { id: 7 }] as Array<{ id: number }>
		const picked = rendezvousPick(mixed, 'session:1', (r) => (r.id ? String(r.id) : null))
		assert.equal(picked?.item.id, 7)
		assert.equal(rendezvousPick(mixed, 'session:1', () => null), null)
	})

	test('it is unbiased over three to five candidates', () => {
		// The failure this measures is real: plain FNV-1a over ids differing in
		// the last digit gave the first of three 49% of sessions instead of
		// 33%. Ids that differ only in their last character are the
		// adversarial case, so they are the case measured.
		const SESSIONS = 9000
		for (const size of [3, 4, 5]) {
			const ids = Array.from({ length: size }, (_, n) => 11 + n)
			const counts = new Map<number, number>(ids.map((id) => [id, 0]))
			for (let session = 1; session <= SESSIONS; session++) {
				const picked = pickId(session, ids)!
				counts.set(picked, counts.get(picked)! + 1)
			}
			const expected = SESSIONS / size
			for (const [id, n] of counts) {
				const drift = Math.abs(n - expected) / expected
				assert.ok(
					drift < 0.07,
					`${size} candidates: ${id} took ${n} of ${SESSIONS} (${(drift * 100).toFixed(1)}% off even)`,
				)
			}
		}
	})

	test('adding a candidate moves the answer about 1/n of the time, not always', () => {
		// The property `ids[hash % ids.length]` does not have: with four
		// seated, a fifth should take the case in roughly a fifth of sessions
		// and leave the other four fifths exactly where they were.
		const four = [11, 12, 13, 14]
		const five = [...four, 15]
		let moved = 0
		const SESSIONS = 4000
		for (let session = 1; session <= SESSIONS; session++)
			if (pickId(session, four) !== pickId(session, five)) moved++
		const share = moved / SESSIONS
		assert.ok(share > 0.14 && share < 0.26, `the fifth candidate displaced ${(share * 100).toFixed(1)}%`)
	})

	test('removing a candidate disturbs only the sessions that had picked it', () => {
		const five = [11, 12, 13, 14, 15]
		const four = [11, 12, 13, 14]
		for (let session = 1; session <= 500; session++) {
			const before = pickId(session, five)
			if (before === 15) continue
			assert.equal(pickId(session, four), before, `session ${session} moved when 15 left`)
		}
	})

	test('a plain list of strings is its own identity', () => {
		const words = ['alpha', 'beta', 'gamma']
		const picked = rendezvousPick(words, 'session:7', (w) => w)!
		assert.ok(words.includes(picked.item))
		assert.equal(picked.key, picked.item)
		assert.equal(rendezvousPick([...words].reverse(), 'session:7', (w) => w)!.item, picked.item)
	})
})

describe('the definitions', () => {
	test('pick-by-hash is a task, registered, and NOT optional', () => {
		const d = getDefinition('core:task/pick-by-hash@1') as any
		assert.ok(d, 'core:task/pick-by-hash@1 is not registered')
		assert.equal(d.kind, 'task')
		// The load-bearing one. `optional: true` would absorb an empty list as
		// an `ok` with every downstream port reading absent — which is
		// indistinguishable from a pick that genuinely chose nothing, and a
		// genre cannot be handed "nobody did it" and carry on.
		assert.ok(!d.optional)
		// R3, named before anything shipped: *key* alone is an option key, a
		// candidate's identity and a settings field, and *index* is a database
		// index and a message's position.
		assert.deepEqual(Object.keys(d.ports.in), ['items', 'scopeKey'])
		// `scopeKey` is the permissive sink on purpose: `session-scope@1` is not
		// assignable to `text@1` and nothing text-shaped carries a session's
		// identity, so a `text` port here could be wired to a literal and to
		// nothing else — every session of a genre picking the same item.
		assert.equal(d.ports.in.scopeKey, S.json)
		assert.deepEqual(Object.keys(d.ports.out), ['main', 'pickIndex', 'chosenKey'])
		assert.deepEqual(Object.keys(d.slots.params.schema), ['by'])
		assert.equal(C.pickByHash.id, 'core:task/pick-by-hash@1')
	})

	test('cast-choices publishes plain JSON, and leaves out one half at a time', () => {
		const d = getDefinition('core:task/cast-choices@1') as any
		assert.ok(d, 'core:task/cast-choices@1 is not registered')
		assert.equal(d.kind, 'task')
		assert.deepEqual(d.ports.in, { cast: S.sessionCast, question: S.text })
		// An option list is not a candidate list: nothing proposed it and it
		// carries no signals.
		assert.equal(d.ports.out.main, S.json)
		assert.equal(d.ports.out.options, S.json)
		assert.notEqual(d.ports.out.main, S.candidates)
		// And the whole document beside the list (ruled (b)) — the shape
		// `make-choices@1` reads off its own `json` port.
		assert.equal(d.ports.out.json, S.json)
		assert.deepEqual(d.slots.params.schema.exclude.of, ['none', 'personas', 'characters'])
		assert.equal(d.slots.params.schema.exclude.default, 'none')
		assert.equal(C.castChoices.id, 'core:task/cast-choices@1')
	})

	test('the two compose: an option key is what the pick wins under', () => {
		// The wiring the Whodunit follow-up depends on — `cast-choices` keys
		// its options by participant reference, `pick-by-hash` is told to
		// identify by `key`, and `chosenKey` is then a reference a junction
		// can compare an answer against with `equalsPath`.
		const options = [
			{ key: 'character:11', label: 'Vell' },
			{ key: 'character:12', label: 'Aro' },
			{ key: 'character:13', label: 'Ines' },
		]
		const picked = rendezvousPick(options, 'session:41', (o) => o.key)!
		assert.ok(options.includes(picked.item))
		assert.equal(picked.key, picked.item.key)
		assert.match(picked.key, /^character:\d+$/)
	})
})

/**
 * Ruling (b), 2026-09-17: the whole document, not a second in-port.
 *
 * `core:task/make-choices@1` reads the question and the options off **one**
 * `json` port, so a spec handed only `options` has nowhere to put the
 * question — and the obvious repair, a `question` in-port on `make-choices`,
 * would move the hash of a node already wired into three shipped specs. So
 * the shaping happens on the `cast-choices` side: the question goes in, the
 * document comes out in exactly the shape that port reads.
 *
 * What is pinned here is the composition itself — it builds, it validates,
 * and **nothing generates in between**. That is the whole saving: both
 * Whodunit pickers currently spend a `generate-json@1` call whose entire job
 * is to read the cast back out as JSON, which is a request, a schema and a
 * wait for a fact the run already held — and a model enumerating the room can
 * misspell a suspect or invent one, and what it writes is what the player may
 * press.
 */
describe('cast-choices → make-choices', () => {
	const askTheRoom = () =>
		spec('demo:ask-the-room', { version: '1.0.0' })
			.inlet('input', C.userMessage.v1())
			.query('cast', ($: any) => C.sessionCast.v1({ scope: $.input.sessionScope }))
			.task('options', ($: any) =>
				C.castChoices.v1({ cast: $.cast.cast, question: $.input.text }),
			)
			.task('ask', ($: any) =>
				C.makeChoices.v1({ json: $.options.json, fn: 'accuse', cast: $.cast.cast }),
			)
			.outlet('save', ($: any) =>
				C.createMessage.v1({ text: $.ask.text, blocks: $.ask.blocks }),
			)

	test('the room reaches the block with no model call between them', () => {
		const doc = compile(askTheRoom().build())
		const errors = validate(doc).filter((f) => f.severity === 'error')
		assert.deepEqual(errors, [], errors.map((f) => `${f.law}: ${f.message}`).join('\n'))

		// The saving, asserted rather than described.
		assert.deepEqual(
			doc.nodes.filter((n) => n.kind === 'oracle'),
			[],
		)

		// One edge carries both halves, which is the whole of ruling (b): the
		// document is shaped where the cast is read, not where it is asked.
		const wired = doc.edges.find((e) => e.to === 'ask' && e.toPort === 'json')
		assert.ok(
			wired,
			doc.edges.map((e) => `${e.from}.${e.fromPort} → ${e.to}.${e.toPort}`).join('\n'),
		)
		assert.equal(wired.from, 'options')
		assert.equal(wired.fromPort, 'json')
		assert.ok(doc.edges.some((e) => e.to === 'options' && e.toPort === 'question'))
	})
})
