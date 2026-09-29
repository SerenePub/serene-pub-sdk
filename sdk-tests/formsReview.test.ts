/**
 * The U5d review's rulings (2026-09-17; plans/30 U5d, plans/29 R-15).
 *
 * What is pinned:
 *
 *  1. **`form` is a venue no listing offers (S1).** It is a `VenueKind`, it
 *     is absent from `LISTED_VENUE_KINDS`, a `world` action may not take it
 *     (it is not in `WORLD_ACTION_VENUES`), and the Adventure genre's
 *     *Answer* declares it — so the block's fire resolves the action and no
 *     overflow lists it.
 *  2. **A form is answered once (W7).** `answered: { by, at, choice? }` is
 *     the host's stamp: a well-formed one validates, a malformed one is
 *     refused with the fix, and `isFormAnswered` is the test.
 *  3. **`validate()` is clean over the catalog (W9).** Every shipped spec
 *     validates with zero errors — the declarations were wrong, not the
 *     rule: `session-history@1` publishes rows (`messages@1`) on `main` and
 *     `messages` and the intent on `band` alone; `vector-search@1` takes a
 *     list of query vectors (`json@1`); a reference wired into a *field* of a
 *     port is not held to the whole port's shape — where the port is one a
 *     spec builds from parts (`json@1`, `template-context@1`); a field edge
 *     into any other port is held to the port's shape (S-c).
 *  4. **A transcript is not a candidates list (R-a).** `messages@1` is no
 *     longer assignable to `context-candidates@1`: the host drops rows
 *     handed as candidates rather than ranking them. The wiring is a
 *     `validate()` **warning** naming the fix — the `band` port into the
 *     merge, the rows to `process-messages` — never an error, so a document
 *     built from the older corpus still compiles; the catalog and the
 *     corpus carry zero errors and zero of the warning.
 *  5. **`answer-form@1` collects, never runs (W2).** Its timeout is a
 *     write's order of magnitude — 30 s, for the commit's own database
 *     work under contention (S-a), never a model call's — and its receipt
 *     names what it fired.
 */

import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
	assignable,
	checkMessageBlocks,
	compile,
	getDefinition,
	isFormAnswered,
	LISTED_VENUE_KINDS,
	S,
	sessionEvents,
	spec,
	validate,
	VENUE_KINDS,
	WORLD_ACTION_VENUES,
	type BuiltSpec,
	type MessageBlock,
	type SpecDocument,
} from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import {
	ADVENTURE_ANSWER_SPEC_ID,
	chatGenre,
	coreAnnouncement,
	CORE_SPECS,
} from '@serene-pub/core-catalog'

const CHAT = chatGenre.id

const actionSpec = (id: string, actions: Array<Record<string, unknown>>) =>
	spec(id, { version: '1.0.0', contributes: { actions: actions as any } })
		.inlet('input', C.userMessage.v1(), { genre: chatGenre, event: sessionEvents.sessionAction })
		.outlet('save', ($) => C.createMessage.v1({ text: $.input.text }))

describe("S1 · 'form' is a venue no listing offers", () => {
	test('it is a venue kind, absent from the listed set and from the world set', () => {
		assert.ok((VENUE_KINDS as readonly string[]).includes('form'))
		assert.ok(!(LISTED_VENUE_KINDS as readonly string[]).includes('form'))
		assert.deepEqual(
			[...LISTED_VENUE_KINDS].sort(),
			VENUE_KINDS.filter((k) => k !== 'form').sort(),
		)
		assert.ok(!WORLD_ACTION_VENUES.includes('form'))
	})

	test("a fiction action may declare it; a 'world' action may not", () => {
		const doc = compile(
			actionSpec('core:spec/answerer', [
				{ key: 'answer', venue: { kind: 'form' }, label: { en: 'Answer' }, description: { en: 'Answer the question.' } },
			]).build(),
		)
		assert.deepEqual(validate(doc).filter((f) => f.severity === 'error'), [])
		assert.throws(
			() =>
				actionSpec('core:spec/grant', [
					{
						key: 'grant',
						venue: { kind: 'form' },
						effects: 'world',
						label: { en: 'Grant' },
						description: { en: 'What Grant does.' },
					},
				]),
			/'world' action may not appear in the 'form' venue/,
		)
	})

	test("the Adventure genre's Answer declares it", () => {
		coreAnnouncement()
		const answer = CORE_SPECS.find((s) => s.slug === ADVENTURE_ANSWER_SPEC_ID)!.build()
		const [decl] = (answer.contributes as any).actions
		assert.deepEqual(decl.venue, [{ kind: 'form' }])
	})
})

describe('W7 · a form is answered once', () => {
	const asked = (over: Record<string, unknown> = {}): MessageBlock =>
		({
			kind: 'choices',
			id: 'q1',
			addressee: 'character:12',
			question: 'Will you come?',
			actions: [{ fn: 'answer', label: 'Yes', choice: 'yes' }],
			...over,
		}) as MessageBlock

	test('a well-formed answer record validates; a malformed one is refused with the fix', () => {
		const answered = { by: 'character:12', at: '2026-09-17T00:00:00.000Z', choice: 'yes' }
		assert.ok(isFormAnswered(answered))
		assert.ok(isFormAnswered({ by: 'user:3', at: '2026-09-17T00:00:00.000Z' }))
		assert.deepEqual(checkMessageBlocks([asked({ answered })]), [])
		for (const bad of [
			{ by: 'nobody-in-particular', at: '2026-09-17T00:00:00.000Z' },
			{ by: 'character:12' },
			{ by: 'character:12', at: '', choice: 'yes' },
			{ by: 'character:12', at: 'x', choice: '' },
			'yes',
		]) {
			assert.ok(!isFormAnswered(bad))
			const f = checkMessageBlocks([asked({ answered: bad })])
			assert.equal(f.length, 1)
			assert.equal(f[0]!.path, 'blocks[0].answered')
			assert.match(f[0]!.fix, /the host stamps/)
		}
		// A `form` block carries the same record.
		assert.deepEqual(
			checkMessageBlocks([
				{ kind: 'form', fn: 'rsvp', fields: {}, answered: { by: 'user:3', at: 'now' } } as any,
			]),
			[],
		)
	})
})

describe('W9 · validate() is clean over the catalog', () => {
	test('every shipped spec validates with zero errors', () => {
		coreAnnouncement()
		const errors: string[] = []
		for (const s of CORE_SPECS) {
			const doc = s.build()
			for (const f of validate(doc).filter((x) => x.severity === 'error'))
				errors.push(`${doc.id} · [${f.law}] ${f.nodeKey ?? ''}: ${f.message}`)
		}
		assert.deepEqual(errors, [])
	})

	test('session-history publishes rows; the intent rides band alone', () => {
		const d = getDefinition('core:query/session-history@1')!
		assert.equal(d.ports.out!.main, S.messages)
		assert.equal(d.ports.out!.messages, S.messages)
		assert.equal(d.ports.out!.band, S.candidates)
		assert.equal(getDefinition('core:task/prose-transcript@1')!.ports.in!.messages, S.messages)
		assert.equal(getDefinition('core:task/process-messages@1')!.ports.in!.messages, S.messages)
		assert.equal(getDefinition('core:query/vector-search@1')!.ports.in!.vectors, S.json)
	})

	test('a reference wired into a field of a port is not held to the whole port — where the port is built from parts', () => {
		// The tool loop's shape: `template-context@1` assembled from two texts.
		const doc = compile(
			spec('demo:field-wire', { version: '1.0.0' })
				.inlet('input', C.userMessage.v1())
				.task('prompt', ($: any) =>
					C.assemble.v2({ templateContext: { note: $.input.text } }),
				)
				.build(),
		)
		assert.deepEqual(validate(doc).filter((f) => f.law === '01 §3'), [])
		assert.ok(doc.edges.some((e) => e.toPort === 'templateContext.note'))
		// And the permissive sink, which takes anything whole or in parts.
		const sink = compile(
			spec('demo:field-wire-json', { version: '1.0.0' })
				.inlet('input', C.userMessage.v1())
				.task('prompt', ($: any) => C.assemble.v2({ groups: { note: $.input.text } }))
				.build(),
		)
		assert.deepEqual(validate(sink).filter((f) => f.law === '01 §3'), [])
	})

	test('a field edge into a typed port is still held to the port (S-c)', () => {
		// `messages@1` is a whole value — a list of rows — not an object a
		// spec builds field by field; a candidates list wired into a field
		// of it is the mistake 01 §3 exists to catch, dotted path or not.
		const wrong = compile(
			spec('demo:field-into-typed', { version: '1.0.0' })
				.inlet('input', C.userMessage.v1())
				.query('lore', ($) => C.lorebookTriggers.v1({ text: $.input.text }))
				.task('lines', ($: any) => C.processMessages.v1({ messages: { x: $.lore.hits } }))
				.build(),
		)
		assert.ok(wrong.edges.some((e) => e.toPort === 'messages.x'))
		const finding = validate(wrong).find((f) => f.law === '01 §3')
		assert.ok(finding, 'a field edge into a typed port must still be checked')
		assert.equal(finding!.severity, 'error')
		assert.match(finding!.message, /lines\.messages\.x/)
	})
})

describe('R-a · a transcript is not a candidates list', () => {
	/** The shape of the wiring the older corpus taught. */
	const transcriptAsCandidates = () =>
		compile(
			spec('demo:transcript-as-candidates', { version: '1.0.0' })
				.inlet('input', C.userMessage.v1())
				.query('history', ($) => C.sessionHistory.v1({ scope: $.input.sessionScope }))
				.query('lore', ($) => C.lorebookTriggers.v1({ text: $.input.text }))
				.task('merge', ($) =>
					C.concatCandidates.v1({ sources: [$.history.messages, $.lore.hits] }),
				)
				.task('prompt', ($) => C.assemble.v2({ candidates: $.history.main }))
				.build(),
		)

	test('the assignability is gone, both ways', () => {
		assert.equal(assignable(S.messages, S.candidates), false)
		assert.equal(assignable(S.candidates, S.messages), false)
		// Rows still reach the ports that take rows.
		assert.equal(assignable(S.messages, S.messages), true)
	})

	test('the wiring is a warning naming the fix, never an error', () => {
		const findings = validate(transcriptAsCandidates())
		assert.deepEqual(
			findings.filter((f) => f.severity === 'error'),
			[],
			'a document from the older corpus still compiles',
		)
		const warned = findings.filter((f) => f.law === '16 §5a')
		assert.equal(warned.length, 2, 'one warning per transcript-as-candidates edge')
		for (const w of warned) {
			assert.equal(w.severity, 'warning')
			assert.match(w.message, /transcript/)
			assert.match(w.fix, /\.band/, 'the fix names the band port')
			assert.match(w.fix, /process-messages/, 'the fix says where the rows go')
		}
		assert.deepEqual(
			warned.map((w) => w.nodeKey).sort(),
			['merge', 'prompt'],
		)
	})

	test('the reverse — a candidates list handed to a port that reads rows — stays the 01 §3 error', () => {
		const wrong = compile(
			spec('demo:lore-as-transcript', { version: '1.0.0' })
				.inlet('input', C.userMessage.v1())
				.query('lore', ($) => C.lorebookTriggers.v1({ text: $.input.text }))
				.task('lines', ($) => C.processMessages.v1({ messages: $.lore.hits }))
				.build(),
		)
		assert.ok(validate(wrong).some((f) => f.law === '01 §3' && f.severity === 'error'))
		assert.equal(validate(wrong).filter((f) => f.law === '16 §5a').length, 0)
	})

	test('the catalog carries zero errors and zero of the warning', () => {
		coreAnnouncement()
		const findings: string[] = []
		for (const s of CORE_SPECS) {
			const doc = s.build()
			for (const f of validate(doc))
				if (f.severity === 'error' || f.law === '16 §5a')
					findings.push(`${doc.id} · [${f.law}] ${f.nodeKey ?? ''}: ${f.message}`)
		}
		assert.deepEqual(findings, [])
	})

	test('the teaching corpus carries zero errors and zero of the warning', async () => {
		// The executed examples are what a reader copies; the guide's spec is
		// the same text as the echo example and is covered by it.
		const { example: echo } = await import('./examples/echo-reply.example.js')
		const { example: retrieved } = await import('./examples/retrieved-reply.example.js')
		for (const ex of [echo, retrieved]) {
			const built = ex.build()
			const doc = 'nodes' in built && 'edges' in built ? (built as SpecDocument) : compile(built as BuiltSpec)
			const findings = validate(doc).filter(
				(f) => f.severity === 'error' || f.law === '16 §5a',
			)
			assert.deepEqual(
				findings.map((f) => `${doc.id} · [${f.law}] ${f.nodeKey ?? ''}: ${f.message}`),
				[],
			)
		}
	})
})

describe('W2 · answer-form collects the fire', () => {
	test("its timeout is a write's order of magnitude, and its receipt names what it fired", () => {
		const d = getDefinition('core:outlet/answer-form@1')!
		// Thirty seconds for the commit's own database work under contention
		// (S-a) — still nowhere near a model call's ten minutes.
		assert.equal(d.timeoutMs, 30000)
		assert.ok(d.timeoutMs! < 60000, `timeoutMs ${d.timeoutMs} is a run's, not a write's`)
		assert.equal(d.ports.out!.firedAction, S.text)
		assert.equal(d.ports.out!.firedRunId, S.text)
	})
})
