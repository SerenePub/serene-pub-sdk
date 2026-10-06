/**
 * Predicates — the one shape the junction clause and an action's
 * enabled-when share (plans/29 R-15 *enabled-when*; 20 §10; plans/30 U5e,
 * 2026-09-17).
 *
 * What is pinned:
 *
 *  1. **The core.** `readPath` answers `undefined` past the document, never
 *     throws, and an empty path is the value itself; `predicateHolds` is
 *     strict on `equals`, the junction's truthiness on `truthy` (an empty
 *     list is not truthy), and holds for nothing when neither is stated.
 *  2. **The evaluator.** Every predicate must hold; the FIRST failure names
 *     the reason; a single predicate and a list read the same; absent is
 *     enabled; a bare `en` string as `reason` comes back a locale map.
 *  3. **The findings**, one sentence each: no `on`, a `$` path (taught the
 *     published-values spelling), both or neither of `equals`/`truthy`, a
 *     non-boolean `truthy`, no `reason`, a `reason` with no `en`, an unknown
 *     key, a non-object entry — and a genre's map keyed by action identity (V2).
 *  4. **Every door runs them.** An action's `enabledWhen` is refused at
 *     construction, in `validate()`, and a genre's defaults at `genre()`.
 *  5. **The junction is unchanged.** Its receipt notes read exactly as they
 *     did before the core moved (`route.test.ts` is the other guard).
 *  6. **Core's verbs carry them**: the busy rule on every verb but stop,
 *     newest-only on retry/extend/swipe, and every reason a locale map.
 *  7. **The two-port compare** (`equalsPath`, D-4a 2026-09-17): two paths in
 *     one document, strictly; either side absent holds for NOTHING; a caller
 *     with no scope answers false; the path is refused when it is not a
 *     string, is a port reference, or walks a prototype; and a document
 *     without it reads exactly as before.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
	spec,
	compile,
	validate,
	genre,
	genreEnabledWhen,
	_clearGenres,
	readPath,
	predicateHolds,
	truthy,
	evaluateEnabledWhen,
	normalizeEnabledWhen,
	partitionEnabledWhen,
	enabledWhenFindings,
	genreEnabledWhenFindings,
	ENABLED_WHEN_KEYS,
	PREDICATE_CONDITION_KEYS,
	actionsOf,
	actionDocumentFindings,
	CORE_ACTIONS,
	CORE_VERB_REASONS,
	type EnabledWhen,
	type SpecDocument,
} from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import { chatGenre, adventureGenre } from '@serene-pub/core-catalog'

const CHAT = chatGenre.id

const location: EnabledWhen = {
	on: 'state.world.location',
	truthy: true,
	reason: { en: 'Set a location first' },
}
const calm: EnabledWhen = {
	on: 'state.world.weather',
	equals: 'clear',
	reason: { en: 'Wait for the sky to clear' },
}

const actionSpec = (id: string, over: Record<string, unknown>) =>
	spec(id, {
		version: '1.0.0',
		contributes: {
			actions: [
				{
					key: 'look',
					venue: { kind: 'composer' },
					label: { en: 'Look' },
					description: { en: 'What Look does.' },
					...over,
				} as any,
			],
		},
	})
		.inlet('input', C.userMessage.v1(), {
			genre: chatGenre,
			event: 'core:event/session-action@1',
		})
		.outlet('save', ($) => C.createMessage.v1({ text: $.input.text }))

describe('the core — readPath and predicateHolds', () => {
	test('a path miss is undefined, never a throw; an empty path is the value', () => {
		const doc = { state: { world: { location: 'The Vale' } }, list: [] }
		assert.equal(readPath(doc, 'state.world.location'), 'The Vale')
		assert.equal(readPath(doc, 'state.cast.tom.hp'), undefined)
		assert.equal(readPath(doc, 'nothing.here'), undefined)
		assert.equal(readPath(null, 'a.b'), undefined)
		assert.equal(readPath(doc, ''), doc)
		assert.equal(readPath(doc), doc)
	})

	test('equals is strict; truthy is the junction truthiness; neither holds for nothing', () => {
		assert.equal(predicateHolds({ equals: 1 }, 1), true)
		assert.equal(predicateHolds({ equals: 1 }, '1'), false)
		assert.equal(predicateHolds({ equals: false }, false), true)
		assert.equal(predicateHolds({ equals: false }, undefined), false)
		assert.equal(predicateHolds({ truthy: true }, 'x'), true)
		assert.equal(predicateHolds({ truthy: true }, ''), false)
		assert.equal(predicateHolds({ truthy: true }, []), false)
		assert.equal(predicateHolds({ truthy: true }, [0]), true)
		assert.equal(predicateHolds({}, 'anything'), false)
		assert.equal(truthy([]), false)
		assert.equal(truthy({}), true)
	})
})

describe('the evaluator — evaluateEnabledWhen', () => {
	test('a single predicate and a list of one read the same; absent is enabled', () => {
		const doc = { state: { world: { location: 'Vale' } } }
		assert.deepEqual(evaluateEnabledWhen(location, doc), { enabled: true })
		assert.deepEqual(evaluateEnabledWhen([location], doc), { enabled: true })
		assert.deepEqual(evaluateEnabledWhen(undefined, doc), { enabled: true })
		assert.deepEqual(evaluateEnabledWhen([], doc), { enabled: true })
	})

	test('a list is all-must-hold, and the FIRST failure names the reason', () => {
		const empty = { state: { world: {} } }
		const v = evaluateEnabledWhen([location, calm], empty)
		assert.equal(v.enabled, false)
		if (!v.enabled) {
			assert.deepEqual(v.reason, { en: 'Set a location first' })
			// A copy in list form, never the author's object.
			assert.deepEqual(v.failed, location)
		}
		// The other order, the other sentence.
		const w = evaluateEnabledWhen([calm, location], empty)
		assert.ok(!w.enabled && w.reason.en === 'Wait for the sky to clear')
		// One holding, one not: still the one that failed.
		const half = evaluateEnabledWhen([location, calm], { state: { world: { location: 'x' } } })
		assert.ok(!half.enabled && half.reason.en === 'Wait for the sky to clear')
		assert.deepEqual(
			evaluateEnabledWhen([location, calm], {
				state: { world: { location: 'x', weather: 'clear' } },
			}),
			{ enabled: true },
		)
	})

	test('a bare en string as reason comes back a locale map, and normalisation keeps the rest', () => {
		const short = {
			on: 'session.generating',
			equals: false,
			reason: 'wait',
		} as unknown as EnabledWhen
		const v = evaluateEnabledWhen(short, { session: { generating: true } })
		assert.ok(!v.enabled && v.reason.en === 'wait')
		assert.deepEqual(normalizeEnabledWhen(short), [
			{ on: 'session.generating', equals: false, reason: { en: 'wait' } },
		])
		assert.deepEqual(normalizeEnabledWhen(undefined), [])
		assert.deepEqual(normalizeEnabledWhen(null), [])
	})

	test('an entry with no string `on` is dropped by normalisation and named by the findings — a stored pre-shape document never takes a listing down (review W6)', () => {
		const stale = [{ on: 7, truthy: true, reason: { en: 'r' } }, 'x', null, location]
		assert.deepEqual(normalizeEnabledWhen(stale), [location])
		assert.deepEqual(
			evaluateEnabledWhen(stale as any, { state: { world: { location: 'v' } } }),
			{
				enabled: true,
			},
		)
		// The host's publish reads the document through `actionDocumentFindings`.
		const doc = compile(actionSpec('core:spec/look', {}).build())
		const forged = {
			...doc,
			contributes: {
				actions: [
					{
						key: 'look',
						genre: CHAT,
						venue: [{ kind: 'composer' }],
						label: { en: 'Look' },
						description: { en: 'What Look does.' },
						enabledWhen: [{ on: 7, truthy: true, reason: { en: 'r' } }],
					},
				],
			},
		}
		const findings = actionDocumentFindings(forged as any)
		assert.equal(findings.length, 1, findings.join('\n'))
		assert.match(findings[0]!, /enabledWhen\[0\]: 'on' is required — a published-values path/)
		// …and the reader hosts list through does not throw on it.
		assert.deepEqual(actionsOf(forged as any)[0]!.enabledWhen, [
			{ on: 7, truthy: true, reason: { en: 'r' } },
		])
	})

	test('an explicit empty list is kept as declared — it is how an action opts out of a genre default', () => {
		const doc = compile(actionSpec('core:spec/look', { enabledWhen: [] }).build())
		assert.deepEqual(actionsOf(doc)[0]!.enabledWhen, [])
		const none = compile(actionSpec('core:spec/look2', {}).build())
		assert.equal(actionsOf(none)[0]!.enabledWhen, undefined)
	})

	test('a path miss reads undefined: equals: false does not hold on nothing, truthy does not either', () => {
		assert.equal(
			evaluateEnabledWhen({ ...calm, equals: undefined, truthy: true }, {}).enabled,
			false,
		)
		assert.equal(
			evaluateEnabledWhen({ on: 'item.hidden', equals: false, reason: { en: 'r' } }, {})
				.enabled,
			false,
		)
		assert.equal(
			evaluateEnabledWhen(
				{ on: 'item.hidden', equals: false, reason: { en: 'r' } },
				{ item: { hidden: false } },
			).enabled,
			true,
		)
	})

	test('partitionEnabledWhen splits the item.* predicates from the rest, by prefix', () => {
		const item = { on: 'item.hidden', equals: false, reason: { en: 'r' } }
		const itemish = { on: 'items.count', truthy: true, reason: { en: 'r' } }
		const { under, rest } = partitionEnabledWhen([location, item, itemish], 'item')
		assert.deepEqual(under, [item])
		assert.deepEqual(rest, [location, itemish])
	})
})

describe('the findings — every sentence says what to do instead', () => {
	const sound = () => assert.deepEqual(enabledWhenFindings(location), [])

	test('sound declarations, single or list, and absent, produce none', () => {
		sound()
		assert.deepEqual(enabledWhenFindings([location, calm]), [])
		assert.deepEqual(enabledWhenFindings(undefined), [])
	})

	test("no 'on'", () => {
		const f = enabledWhenFindings({ truthy: true, reason: { en: 'r' } })
		assert.equal(f.length, 1)
		assert.match(
			f[0]!,
			/'on' is required — a published-values path such as 'state.world.location'/,
		)
		assert.match(f[0]!, /never a port reference: actions live outside a run/)
	})

	test('a $ path is taught the published-values spelling', () => {
		const f = enabledWhenFindings({
			on: '$.state.inCombat',
			equals: false,
			reason: { en: 'r' },
		})
		assert.equal(f.length, 1)
		assert.match(f[0]!, /reads as a port reference/)
		assert.match(f[0]!, /a published-values path such as 'state.world.location'/)
		assert.match(f[0]!, /actions live outside a run and have no ports to read/)
	})

	test('exactly one of the three conditions, never two and never none', () => {
		const both = enabledWhenFindings({ on: 'a', equals: 1, truthy: true, reason: { en: 'r' } })
		assert.equal(both.length, 1)
		assert.match(both[0]!, /states 2 conditions — exactly one of equals \/ equalsPath \/ truthy/)
		const neither = enabledWhenFindings({ on: 'a', reason: { en: 'r' } })
		assert.equal(neither.length, 1)
		assert.match(neither[0]!, /states no conditions — exactly one of equals \/ equalsPath \/ truthy/)
		assert.match(neither[0]!, /the junction rule, 20 §10/)
		// The third condition counts like the other two (D-4a).
		const two = enabledWhenFindings({
			on: 'a',
			equals: 1,
			equalsPath: 'b',
			reason: { en: 'r' },
		})
		assert.equal(two.length, 1)
		assert.match(two[0]!, /states 2 conditions/)
	})

	test("a non-boolean 'truthy'", () => {
		const f = enabledWhenFindings({ on: 'a', truthy: 'yes', reason: { en: 'r' } })
		assert.ok(
			f.some((s) => /'truthy' is a boolean — write truthy: true/.test(s)),
			f.join('\n'),
		)
	})

	test("no 'reason', and a reason with no en", () => {
		const none = enabledWhenFindings({ on: 'a', truthy: true })
		assert.equal(none.length, 1)
		assert.match(none[0]!, /'reason' is required — why the control is grey/)
		assert.match(none[0]!, /a locale map with 'en' \(R-20\)/)
		const noEn = enabledWhenFindings({ on: 'a', truthy: true, reason: { de: 'x' } })
		assert.equal(noEn.length, 1)
		assert.match(noEn[0]!, /enabledWhen\.reason: a locale map with a required 'en' \(R-20\)/)
	})

	test('an unknown key names the ones that exist', () => {
		const f = enabledWhenFindings({ on: 'a', truthy: true, reason: { en: 'r' }, path: 'x' })
		assert.equal(f.length, 1)
		assert.match(
			f[0]!,
			/'path' is not part of an enabled-when — one of on, equals, equalsPath, truthy, reason/,
		)
	})

	test('a non-object entry, and where in a list it sat', () => {
		const f = enabledWhenFindings([location, 7])
		assert.equal(f.length, 1)
		assert.match(
			f[0]!,
			/^enabledWhen\[1\]: an enabled-when is \{ on, equals \| truthy, reason \}/,
		)
		assert.match(f[0]!, /such as \{ on: 'state\.world\.location', truthy: true/)
	})

	test("'truthy: false' states nothing; 'equals' is a primitive; an empty reason says nothing (review W5)", () => {
		const off = enabledWhenFindings({ on: 'a', truthy: false, reason: { en: 'r' } })
		assert.equal(off.length, 1)
		assert.match(
			off[0]!,
			/'truthy: false' states nothing — write truthy: true to require a value, or equals: false/,
		)
		for (const equals of [{ a: 1 }, [1], () => 1]) {
			const f = enabledWhenFindings({ on: 'a', equals, reason: { en: 'r' } })
			assert.equal(f.length, 1, JSON.stringify(f))
			assert.match(f[0]!, /'equals' is a primitive — a string, number, boolean or null/)
		}
		for (const equals of ['x', 0, false, null])
			assert.deepEqual(enabledWhenFindings({ on: 'a', equals, reason: { en: 'r' } }), [])
		// A blank reason gets R-20's one sentence, naming the field (01 §13:
		// the display-text verdict owns it; no door paraphrases it).
		for (const reason of ['', '   ', { en: '' }, { en: ' ' }]) {
			const f = enabledWhenFindings({ on: 'a', truthy: true, reason })
			assert.equal(f.length, 1, JSON.stringify(reason))
			assert.match(f[0]!, /^enabledWhen\.reason(\.en)? is empty — /)
			assert.match(f[0]!, /R-20/)
		}
	})

	test("an 'on' that walks a prototype is refused, naming the segment (review W5)", () => {
		for (const on of ['item.__proto__.x', 'constructor.prototype', 'state.prototype']) {
			const f = enabledWhenFindings({ on, truthy: true, reason: { en: 'r' } })
			assert.equal(f.length, 1, on)
			assert.match(
				f[0]!,
				/'on' walks '(__proto__|constructor|prototype)' — a published-values path names data/,
			)
		}
		assert.deepEqual(
			enabledWhenFindings({
				on: 'state.world.prototypes',
				truthy: true,
				reason: { en: 'r' },
			}),
			[],
		)
	})

	test('an item.* predicate on an action with no message venue is refused; a message or form venue admits it', () => {
		const item = { on: 'item.hidden', equals: false, reason: { en: 'unhide it first' } }
		assert.throws(
			() => actionSpec('core:spec/look', { enabledWhen: item }),
			/enabledWhen\[0\]: reads 'item\.hidden', which only a press on a message can answer — add a \{ kind: 'message' \} venue/,
		)
		for (const venue of [{ kind: 'message' }, [{ kind: 'composer' }, { kind: 'form' }]])
			assert.doesNotThrow(() => actionSpec('core:spec/look', { enabledWhen: item, venue }))
	})

	test("a genre's map: keyed by action identity (plans/31 V2), each value judged the same", () => {
		assert.deepEqual(genreEnabledWhenFindings({ 'core:spec/look#look': location, 'core:spec/rest#rest': [calm], 'core#retry': [calm] }), [])
		assert.deepEqual(genreEnabledWhenFindings(undefined), [])
		const list = genreEnabledWhenFindings([location])
		assert.match(list[0]!, /an object keyed by action identity/)
		// A bare function key — the pre-V2 spelling — is refused by name.
		const bare = genreEnabledWhenFindings({ look: location })
		assert.equal(bare.length, 1)
		assert.match(bare[0]!, /keyed by the identity of the action it applies to — '<spec slug>#<key>', or 'core#<verb>'.*got 'look'/)
		const bad = genreEnabledWhenFindings({
			'core:spec/look#look': { on: '$.x', truthy: true, reason: { en: 'r' } },
		})
		assert.equal(bad.length, 1)
		assert.match(
			bad[0]!,
			/^enabledWhen\[core:spec\/look#look\]: 'on' is '\$\.x', which reads as a port reference/,
		)
	})
})

describe('every door runs them', () => {
	test('the builder refuses an action whose enabled-when is unsound, with the sentence', () => {
		assert.throws(
			() =>
				actionSpec('core:spec/look', {
					enabledWhen: { on: '$.state.x', truthy: true, reason: { en: 'r' } },
				}),
			// Judged on the normalised (list) form, like a venue: `[0]`.
			/enabledWhen\[0\]: 'on' is '\$\.state\.x', which reads as a port reference/,
		)
		assert.throws(
			() =>
				actionSpec('core:spec/look', {
					enabledWhen: [location, { on: 'a', truthy: true }],
				}),
			/enabledWhen\[1\]: 'reason' is required/,
		)
	})

	test('a sound one compiles in list form, reason a locale map, and validate() is quiet', () => {
		const doc = compile(actionSpec('core:spec/look', { enabledWhen: location }).build())
		const [a] = actionsOf(doc)
		assert.deepEqual(a!.enabledWhen, [location])
		const short = compile(
			actionSpec('core:spec/look2', {
				enabledWhen: {
					on: 'state.world.location',
					truthy: true,
					reason: 'Set a location first',
				},
			}).build(),
		)
		assert.deepEqual(actionsOf(short)[0]!.enabledWhen, [location])
		assert.equal(validate(doc).filter((f) => f.law === 'R-15').length, 0)
	})

	test('validate() refuses a stored document the builder never saw', () => {
		const doc = compile(actionSpec('core:spec/look', {}).build())
		const forged: SpecDocument = {
			...doc,
			contributes: {
				actions: [
					{
						key: 'look',
						venue: [{ kind: 'composer' }],
						label: { en: 'Look' },
						description: { en: 'What Look does.' },
						enabledWhen: {
							on: 'state.world.location',
							equals: 'x',
							truthy: true,
							reason: { en: 'r' },
						},
					},
				],
			} as any,
		}
		const findings = validate(forged).filter((f) => f.law === 'R-15')
		assert.ok(
			findings.some((f) =>
				/states 2 conditions — exactly one of equals \/ equalsPath \/ truthy/.test(f.message),
			),
			JSON.stringify(findings),
		)
	})

	test('genre() refuses unsound defaults and stores sound ones in list form, keyed by identity', () => {
		assert.throws(
			() =>
				genre('demo:genre/bad-when', {
					name: { en: 'Bad' },
					family: 'demo',
					events: {},
					enabledWhen: { 'core:spec/look#look': { on: 'state.world.location', truthy: true } as any },
				}),
			/demo:genre\/bad-when\.enabledWhen\[core:spec\/look#look\]: 'reason' is required/,
		)
		const g = genre('demo:genre/when', {
			name: { en: 'When' },
			family: 'demo',
			events: {},
			enabledWhen: { 'core:spec/look#look': location, 'core:spec/rest#rest': [calm, location] },
		})
		assert.deepEqual(g.enabledWhen, { 'core:spec/look#look': [location], 'core:spec/rest#rest': [calm, location] })
		assert.deepEqual(genreEnabledWhen(g, 'core:spec/look#look'), [location])
		assert.deepEqual(genreEnabledWhen('demo:genre/when', 'core:spec/rest#rest'), [calm, location])
		assert.deepEqual(genreEnabledWhen(g, 'demo:spec/nothing#nothing'), [])
		assert.deepEqual(genreEnabledWhen('demo:genre/unknown', 'core:spec/look#look'), [])
		// Re-declaring identically is a no-op; a changed predicate is a changed genre.
		genre('demo:genre/when', {
			name: { en: 'When' },
			family: 'demo',
			events: {},
			enabledWhen: { 'core:spec/look#look': location, 'core:spec/rest#rest': [calm, location] },
		})
		assert.throws(
			() =>
				genre('demo:genre/when', {
					name: { en: 'When' },
					family: 'demo',
					events: {},
					enabledWhen: { 'core:spec/look#look': calm },
				}),
			/duplicate genre id/,
		)
		// Never clear the catalog's own: only the demo ids are dropped by re-registering.
		void _clearGenres
	})

	test('a genre default is declared and read back on a fixture genre; the shipped genres declare none (review W8)', () => {
		const g = genre('demo:genre/defaulted', {
			name: { en: 'Defaulted' },
			family: 'demo',
			events: {},
			enabledWhen: { 'demo:spec/survey#survey': location },
		})
		assert.deepEqual(genreEnabledWhen('demo:genre/defaulted', 'demo:spec/survey#survey'), [location])
		assert.deepEqual(genreEnabledWhen(g, 'demo:spec/other#other'), [])
		// Adventure's `look` default was withdrawn: Look is the opening
		// scene, and a fresh session must not begin with it grey.
		assert.equal(adventureGenre.enabledWhen, undefined)
		assert.deepEqual(genreEnabledWhen(adventureGenre, 'core:spec/adventure-look#look'), [])
		assert.deepEqual(genreEnabledWhen(chatGenre, 'core:spec/chat-narrate#narrate'), [])
	})
})

describe("core's verbs carry their conditions as predicates", () => {
	test('every verb but stop waits for the session; retry, extend and swipe want the newest row', () => {
		for (const a of CORE_ACTIONS) {
			const preds = a.enabledWhen ?? []
			if (a.key === 'stop') {
				assert.deepEqual(preds, [], 'stop is never grey')
				continue
			}
			assert.ok(
				preds.some((p) => p.on === 'session.generating' && p.equals === false),
				`${a.key} does not wait for the session`,
			)
			const newest = preds.some((p) => p.on === 'item.isNewest' && p.truthy === true)
			assert.equal(newest, ['retry', 'extend', 'swipe'].includes(a.key), a.key)
			for (const p of preds) {
				assert.equal(typeof (p.reason as any).en, 'string', `${a.key}: ${p.on}`)
				assert.deepEqual(enabledWhenFindings(p), [])
			}
		}
		assert.ok(
			CORE_ACTIONS.find((a) => a.key === 'edit')!.enabledWhen!.some(
				(p) => p.on === 'item.hidden' && p.equals === false,
			),
		)
		assert.ok(
			CORE_ACTIONS.find((a) => a.key === 'swipe')!.enabledWhen!.some(
				(p) => p.on === 'item.hasSwipes' && p.truthy === true,
			),
		)
	})

	test("the reasons are one vocabulary — the chips' sentences", () => {
		assert.deepEqual(CORE_VERB_REASONS.generating, { en: 'wait for the reply to finish' })
		assert.deepEqual(CORE_VERB_REASONS.notNewest, {
			en: 'only the newest reply can be regenerated',
		})
		assert.deepEqual(CORE_VERB_REASONS.hidden, { en: 'unhide it first' })
		assert.deepEqual(CORE_VERB_REASONS.noSwipe, { en: 'nothing to swipe to' })
		assert.deepEqual(CORE_VERB_REASONS.ownLine, {
			en: 'your own line is edited, not regenerated',
		})
	})

	test('a verb evaluated over the item document greys as the menu did', () => {
		const retry = CORE_ACTIONS.find((a) => a.key === 'retry')!.enabledWhen
		const doc = (item: Record<string, unknown>, generating = false) => ({
			session: { generating },
			item: {
				isNewest: true,
				hidden: false,
				generating: false,
				greeting: false,
				hasSwipes: true,
				role: 'assistant',
				...item,
			},
		})
		assert.deepEqual(evaluateEnabledWhen(retry, doc({})), { enabled: true })
		const older = evaluateEnabledWhen(retry, doc({ isNewest: false }))
		assert.ok(!older.enabled && older.reason.en === CORE_VERB_REASONS.notNewest.en)
		const hidden = evaluateEnabledWhen(retry, doc({ hidden: true }))
		assert.ok(!hidden.enabled && hidden.reason.en === CORE_VERB_REASONS.hidden.en)
		const busy = evaluateEnabledWhen(retry, doc({}, true))
		assert.ok(!busy.enabled && busy.reason.en === CORE_VERB_REASONS.generating.en)
		// The audience's sentence is not here: an older row wins over busy,
		// in the order the table lists them.
		const both = evaluateEnabledWhen(retry, doc({ isNewest: false }, true))
		assert.ok(!both.enabled && both.reason.en === CORE_VERB_REASONS.notNewest.en)
		// The author's own line is never regenerated, swiped or extended (F1):
		// in a persona-less genre it is the newest row, with no persona to
		// tell it apart — the role does.
		for (const key of ['retry', 'swipe', 'extend']) {
			const when = CORE_ACTIONS.find((a) => a.key === key)!.enabledWhen
			const mine = evaluateEnabledWhen(when, doc({ role: 'user' }))
			assert.ok(!mine.enabled && mine.reason.en === CORE_VERB_REASONS.ownLine.en, key)
			assert.deepEqual(evaluateEnabledWhen(when, doc({})), { enabled: true }, key)
		}
	})
})

/* ── the two-port compare (D-4a, 2026-09-17) ────────────────────────────── */

/**
 * `equalsPath` — the second path.
 *
 * The question it exists for is *is the accused the culprit?*, which the
 * grammar could not ask while `equals` took a literal. What is pinned:
 *
 *  · it compares the two paths **in the same document**, strictly;
 *  · **either side absent holds for nothing** — the case that would otherwise
 *    declare an unwired port equal to an unwired port and fire the branch
 *    that means *you got it right*;
 *  · a caller with no scope answers `false`, never a silent `true`;
 *  · the findings refuse a non-string path, a port reference and a prototype
 *    walk, exactly as `on`'s do;
 *  · and a document without it reads exactly as it did before.
 */
describe('equalsPath', () => {
	const doc = {
		accused: { choice: 'character:12' },
		culprit: { chosenKey: 'character:12' },
		other: { chosenKey: 'character:13' },
		nothing: null,
	}

	test('it compares two paths in the same document', () => {
		assert.equal(
			predicateHolds({ equalsPath: 'culprit.chosenKey' }, 'character:12', doc),
			true,
		)
		assert.equal(
			predicateHolds({ equalsPath: 'other.chosenKey' }, 'character:12', doc),
			false,
		)
	})

	test('either side absent holds for nothing', () => {
		// The dangerous case, and the reason this is not plain `===`: two
		// unwired ports would otherwise compare equal, and the branch that
		// fires means *the accused IS the culprit*.
		assert.equal(predicateHolds({ equalsPath: 'nowhere.at.all' }, undefined, doc), false)
		assert.equal(predicateHolds({ equalsPath: 'culprit.chosenKey' }, undefined, doc), false)
		assert.equal(predicateHolds({ equalsPath: 'nowhere' }, 'character:12', doc), false)
		// An explicit null on both sides is two values, not two absences.
		assert.equal(predicateHolds({ equalsPath: 'nothing' }, null, doc), true)
	})

	test('a malformed path does not hold, and never throws', () => {
		// A stored document from any hand may say anything. A listing that
		// threw here would go dark rather than grey one button — the rule
		// `normalizeEnabledWhen` already drops malformed entries by.
		for (const equalsPath of [3, true, null, {}, [], ''] as any[])
			assert.equal(predicateHolds({ equalsPath }, 'character:12', doc), false)
		assert.doesNotThrow(() =>
			evaluateEnabledWhen(
				[{ on: 'accused.choice', equalsPath: 3, reason: { en: 'r' } } as any],
				doc,
			),
		)
	})

	test('a caller with no scope answers false, never true', () => {
		// Both shipped doors pass one (the junction hands in the routed value,
		// the evaluator the published values), but `scope` stays optional so a
		// caller written before the two-port compare still compiles — and a
		// caller with no document to read the other side from must answer *it
		// did not hold*, never a silent true.
		assert.equal(predicateHolds({ equalsPath: 'culprit.chosenKey' }, 'character:12'), false)
		assert.equal(predicateHolds({ equalsPath: 'anything' }, undefined), false)
	})

	test('it is strict, as equals is — a key, not a document', () => {
		const structured = { a: { v: { id: 1 } }, b: { v: { id: 1 } } }
		assert.equal(predicateHolds({ equalsPath: 'b.v' }, structured.a.v, structured), false)
		// The same object on both sides is the same value, and that much is
		// identity rather than a structural comparison.
		const shared = { id: 1 }
		assert.equal(predicateHolds({ equalsPath: 'b' }, shared, { b: shared }), true)
	})

	test('the enabled-when evaluator reads it over the published values', () => {
		const sameSpeaker: EnabledWhen = {
			on: 'item.speaker',
			equalsPath: 'session.fields.culprit',
			reason: { en: 'Only the culprit may confess' },
		}
		const published = {
			item: { speaker: 'character:12' },
			session: { fields: { culprit: 'character:12' } },
		}
		assert.deepEqual(evaluateEnabledWhen(sameSpeaker, published), { enabled: true })
		const wrong = evaluateEnabledWhen(sameSpeaker, {
			item: { speaker: 'character:13' },
			session: { fields: { culprit: 'character:12' } },
		})
		assert.ok(!wrong.enabled && wrong.reason.en === 'Only the culprit may confess')
		// ⚠ The `item` predicates are partitioned off and evaluated where a
		// message is at hand (`partitionEnabledWhen`), so an `equalsPath`
		// crossing that split reads a document the other half does not carry.
		// Stated as a fact rather than defended against: the split is the
		// host's, and a predicate is judged against whatever document it is
		// handed.
		const { under } = partitionEnabledWhen([sameSpeaker], 'item')
		assert.equal(under.length, 1)
		assert.ok(!evaluateEnabledWhen(under, { item: { speaker: 'character:12' } }).enabled)
	})

	test('it is one of the conditions, and a sound one is no finding', () => {
		assert.deepEqual(
			enabledWhenFindings({
				on: 'item.speaker',
				equalsPath: 'session.fields.culprit',
				reason: { en: 'r' },
			}),
			[],
		)
		assert.ok(PREDICATE_CONDITION_KEYS.includes('equalsPath'))
		assert.ok(ENABLED_WHEN_KEYS.includes('equalsPath'))
	})

	test('a path that is not a string is refused', () => {
		for (const equalsPath of [3, true, { on: 'a' }, ['a'], '']) {
			const f = enabledWhenFindings({ on: 'a', equalsPath, reason: { en: 'r' } } as any)
			assert.ok(
				f.some((s) => /'equalsPath' is a path, not a value/.test(s)),
				`${JSON.stringify(equalsPath)}: ${f.join('\n')}`,
			)
		}
		// The empty string states a condition and fails it, so it is one
		// finding about the path and not also "states no conditions".
		const empty = enabledWhenFindings({ on: 'a', equalsPath: '', reason: { en: 'r' } })
		assert.equal(empty.length, 1, empty.join('\n'))
	})

	test('a port reference and a prototype walk are refused, as on is', () => {
		const ref = enabledWhenFindings({
			on: 'a',
			equalsPath: '$.write.json',
			reason: { en: 'r' },
		})
		assert.equal(ref.length, 1)
		assert.match(ref[0]!, /reads as a port reference/)
		assert.match(ref[0]!, /actions live outside a run/)
		const proto = enabledWhenFindings({
			on: 'a',
			equalsPath: 'session.__proto__.x',
			reason: { en: 'r' },
		})
		assert.equal(proto.length, 1)
		assert.match(proto[0]!, /'equalsPath' walks '__proto__'/)
	})

	test('a document without it reads exactly as before', () => {
		// The additive claim, asserted rather than assumed: the shapes that
		// existed before the third condition answer identically.
		assert.equal(predicateHolds({ equals: 'x' }, 'x'), true)
		assert.equal(predicateHolds({ equals: 'x' }, 'y'), false)
		assert.equal(predicateHolds({ truthy: true }, [1]), true)
		assert.equal(predicateHolds({ truthy: true }, []), false)
		assert.equal(predicateHolds({}, 'anything'), false)
		assert.deepEqual(evaluateEnabledWhen([location, calm], {
			state: { world: { location: 'the study', weather: 'clear' } },
		}), { enabled: true })
	})
})
