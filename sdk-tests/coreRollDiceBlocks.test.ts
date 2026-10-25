/**
 * 🚧 The roll form and the dice block in core's block renderer (Lair
 * rewrite D3, lane L5, 2026-10-21): a roll form put to the person who calls
 * the rolls offers its checks and difficulties, then Roll or No check, and
 * hands the press up as `{ check, stat, band }`; answered, it shows the call
 * in words; put to somebody else, it shows no controls; superseded, one
 * quiet line. A dice block is a result: what, the total, against what, how
 * it came out, its tone from the five bands, and how it was reached. And
 * `isDiceLine` — the row the widget draws as the rules speaking.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { holdsDice, isDiceLine } from '../core-catalog/src/shared/ui/conversation/index.js'
import { mountComponent } from './harnessGuard.js'

const CORE_CATALOG = resolve(import.meta.dirname, '..', 'core-catalog')
const ENTRY = resolve(import.meta.dirname, 'fixtures', 'core-roll-blocks', 'roll-blocks-view.ts')

const roll = (over: Record<string, unknown> = {}) => ({
	kind: 'roll',
	id: 'r1',
	fn: 'answer',
	action: 'core:spec/lair-roll-answer#answer',
	addressee: 'owner',
	question: 'Brannoc: force the rusted gate. Roll for it?',
	referent: 'Brannoc',
	vantage: 'force the rusted gate',
	stat: 'str',
	stats: [
		{ key: 'str', label: 'Strength' },
		{ key: 'dex', label: 'Dexterity' },
	],
	bands: [
		{ id: 'easy', label: 'Easy', target: 10 },
		{ id: 'medium', label: 'Medium', target: 15 },
		{ id: 'hard', label: 'Hard', target: 20 },
	],
	band: 'medium',
	by: 'character:12',
	...over,
})
const dice = (over: Record<string, unknown> = {}) => ({
	kind: 'dice',
	stat: 'Strength',
	rolled: 17,
	faces: [14],
	against: 15,
	outcome: 'Success',
	five: 'success',
	explain: 'd20 14 + str 3 = 17 vs 15',
	by: 'character:12',
	...over,
})

async function mount(props: Record<string, unknown>) {
	const view = await mountComponent({
		root: CORE_CATALOG,
		entry: ENTRY,
		owner: 'core',
		timeoutMs: 60_000,
		context: { props },
	})
	assert.deepEqual(view.refused, [])
	return view
}
const firedOf = (view: Awaited<ReturnType<typeof mount>>) =>
	JSON.parse(view.query('.fired')?.textContent ?? '[]') as Array<{
		fn: string
		payload?: Record<string, unknown>
		action?: string
		blockId?: string
	}>
const buttonNamed = (view: Awaited<ReturnType<typeof mount>>, name: RegExp) =>
	view.queryAll('button').find((b) => name.test(b.textContent?.replace(/\s+/g, ' ').trim() ?? ''))

test('a roll form offers its checks and difficulties, the proposed ones chosen, then Roll and No check', { timeout: 120_000 }, async () => {
	const view = await mount({ blocks: [roll()] })
	try {
		const out = view.html()
		assert.match(out, /data-widget-part="messages\.block-roll"/)
		assert.match(out, /data-block-id="r1"/)
		assert.match(out, /Brannoc: force the rusted gate\. Roll for it\?/)
		assert.match(out, /Check/)
		assert.match(out, /Difficulty/)
		// The checks by their words; the difficulties with the number each asks for.
		assert.match(out, /Strength/)
		assert.match(out, /Dexterity/)
		assert.match(out, /Medium \(15\)/)
		assert.match(out, /Hard \(20\)/)
		assert.equal(view.queryAll('sp-combobox').length, 2)
		assert.equal(view.queryAll('sp-combobox')[0]!.getAttribute('value'), 'str')
		assert.equal(view.queryAll('sp-combobox')[1]!.getAttribute('value'), 'medium')
		assert.ok(buttonNamed(view, /^Roll$/), 'Roll')
		assert.ok(buttonNamed(view, /^No check$/), 'No check')
	} finally {
		await view.unmount()
	}
})

test('Roll hands up the check and difficulty picked, with the block\'s identity and id', { timeout: 120_000 }, async () => {
	const view = await mount({ blocks: [roll()] })
	try {
		await view.dispatch(view.queryAll('sp-combobox')[0]!, 'change', { value: 'dex' })
		await view.dispatch(view.queryAll('sp-combobox')[1]!, 'change', { value: 'hard' })
		await view.click(buttonNamed(view, /^Roll$/)!)
		await view.settle()
		const fired = firedOf(view)
		assert.equal(fired.length, 1)
		assert.equal(fired[0]!.fn, 'answer')
		assert.equal(fired[0]!.action, 'core:spec/lair-roll-answer#answer')
		assert.equal(fired[0]!.blockId, 'r1')
		assert.deepEqual(fired[0]!.payload, { check: true, stat: 'dex', band: 'hard' })
	} finally {
		await view.unmount()
	}
})

test('No check hands up check false, with what was proposed', { timeout: 120_000 }, async () => {
	const view = await mount({ blocks: [roll()] })
	try {
		await view.click(buttonNamed(view, /^No check$/)!)
		await view.settle()
		assert.deepEqual(firedOf(view)[0]!.payload, { check: false, stat: 'str', band: 'medium' })
	} finally {
		await view.unmount()
	}
})

test('one check and one difficulty are said, not offered', { timeout: 120_000 }, async () => {
	const view = await mount({
		blocks: [roll({ stats: undefined, stat: 'stealth', bands: [{ id: 'hard', label: 'Hard', target: 20 }], band: 'hard' })],
	})
	try {
		assert.equal(view.queryAll('sp-combobox').length, 0)
		const out = view.html()
		assert.match(out, /data-widget-part="messages\.block-roll-value"[^>]*>stealth</)
		assert.match(out, /Hard \(20\)/)
		await view.click(buttonNamed(view, /^Roll$/)!)
		await view.settle()
		assert.deepEqual(firedOf(view)[0]!.payload, { check: true, stat: 'stealth', band: 'hard' })
	} finally {
		await view.unmount()
	}
})

test('a roll form put to somebody else shows its question and no controls', { timeout: 120_000 }, async () => {
	const view = await mount({ blocks: [roll()], mine: false })
	try {
		const out = view.html()
		assert.match(out, /Brannoc: force the rusted gate\. Roll for it\?/)
		assert.match(out, /Awaiting an answer/)
		assert.equal(view.queryAll('button').length, 0)
		assert.equal(view.queryAll('sp-combobox').length, 0)
	} finally {
		await view.unmount()
	}
})

test('an answered roll form shows the call in words beside Answered, and no controls', { timeout: 120_000 }, async () => {
	const view = await mount({
		blocks: [
			roll({ answered: { by: 'owner', at: '2026-10-21T00:00:00Z', value: 'Dexterity — Hard' } }),
			roll({ id: 'r2', answered: { by: 'owner', at: '2026-10-21T00:00:00Z', value: 'No check' } }),
		],
	})
	try {
		const out = view.html()
		assert.equal(out.split('data-answered="true"').length, 3)
		assert.match(out, /Answered<\/span>[^·]{0,40}· Dexterity — Hard/)
		assert.match(out, /Answered<\/span>[^·]{0,40}· No check/)
		assert.equal(view.queryAll('button').length, 0)
	} finally {
		await view.unmount()
	}
})

test('a dice block is a result: what, the total, against what, how it came out, how it was reached', { timeout: 120_000 }, async () => {
	const view = await mount({ blocks: [dice(), dice({ stat: 'Stealth', rolled: 6, against: 14, outcome: 'Failure', five: 'fail', explain: undefined, faces: [4] })] })
	try {
		const out = view.html()
		assert.equal(out.split('data-widget-part="messages.block-dice"').length, 3)
		assert.match(out, /data-five="success"/)
		assert.match(out, /data-five="fail"/)
		assert.match(out, /block-dice-stat"[^>]*>Strength</)
		assert.match(out, /block-dice-total"[^>]*>17</)
		assert.match(out, /against 15/)
		assert.match(out, /Success/)
		assert.match(out, /d20 14 \+ str 3 = 17 vs 15/)
		// With no explain, the faces say what the dice showed.
		assert.match(out, /Rolled 4/)
		// The whole result as one sentence, its title.
		assert.match(out, /title="Strength: 17 against 15\. Success\."/)
		// A result, never a question: nothing to press.
		assert.equal(view.queryAll('button').length, 0)
	} finally {
		await view.unmount()
	}
})

test('🚧 an outcome block under any check method: a pool, cards, a comparison, a spend, a judgement (M2, 2026-10-22)', { timeout: 120_000 }, async () => {
	const view = await mount({
		blocks: [
			dice({ method: 'dice-pool', stat: 'Stealth', rolled: 2, faces: [6, 2, 5], pool: { size: 3, successes: 2, successOn: 5 }, against: undefined, explain: undefined }),
			dice({ method: 'card-draw', stat: 'Wits', rolled: 14, faces: undefined, cards: [{ label: 'Queen of hearts', rank: 12 }], against: 13, explain: undefined }),
			dice({ method: 'compare', stat: 'Will', rolled: 4, faces: undefined, compare: { versus: "Mara's Will" }, against: 3, explain: undefined }),
			dice({ method: 'bid', stat: 'Nerve', rolled: 2, faces: undefined, against: undefined, explain: undefined }),
			dice({ method: 'none', stat: 'Persuasion', rolled: undefined, faces: undefined, against: undefined, explain: undefined, outcome: 'Success' }),
		],
	})
	try {
		const out = view.html()
		assert.equal(out.split('data-widget-part="messages.block-dice"').length, 6)
		for (const m of ['dice-pool', 'card-draw', 'compare', 'bid', 'none']) assert.match(out, new RegExp(`data-method="${m}"`))
		assert.match(out, /title="Stealth: 2 successes \/ 3\. Success\."/)
		assert.match(out, /Rolled 6, 2, 5/)
		assert.match(out, /title="Wits: drew Queen of hearts, 14 against 13\. Success\."/)
		assert.match(out, /Drew Queen of hearts/)
		assert.match(out, /title="Will: 4 against Mara's Will \(3\)\. Success\."/)
		assert.match(out, /title="Nerve: spent 2\. Success\."/)
		// A judgement comes to no number: what was checked and how it went.
		assert.match(out, /title="Persuasion: Success\."/)
		assert.equal(view.queryAll('button').length, 0)
	} finally {
		await view.unmount()
	}
})

test('🚧 ties on the graph (T2): an outcome tells the lorebook rows that followed a tie it moved, each a line under it', { timeout: 120_000 }, async () => {
	const line = "Lorebook: Wren's side of the tie with Mara now reads close"
	const view = await mount({ blocks: [dice({ method: 'compare', stat: 'Confess', rolled: 8, faces: undefined, compare: { versus: "Mara's affection" }, against: 7, explain: undefined, follows: [line] })] })
	try {
		const rows = view.queryAll('[data-widget-part~="messages.block-dice-follows"]')
		assert.equal(rows.length, 1)
		assert.equal(rows[0]!.getAttribute('data-follows'), '')
		assert.equal(rows[0]!.textContent?.replace(/\s+/g, ' ').trim(), `${line} follows the tie`)
		// Told, never kept or undone on its own: nothing to press.
		assert.equal(view.queryAll('button').length, 0)
	} finally {
		await view.unmount()
	}
	const none = await mount({ blocks: [dice()] })
	try {
		assert.equal(none.queryAll('[data-widget-part~="messages.block-dice-follows"]').length, 0)
	} finally {
		await none.unmount()
	}
})

test('a five band the scale does not know gives no tone', { timeout: 120_000 }, async () => {
	const view = await mount({ blocks: [dice({ five: 'splendid' })] })
	try {
		assert.doesNotMatch(view.html(), /data-five=/)
	} finally {
		await view.unmount()
	}
})

test('a dice line: a row carrying a roll form or the dice, or answering a roll form', () => {
	const asked = { id: 40, parts: [{ data: { blocks: [roll()] } }] }
	const rolled = { id: 41, parts: [{ data: { blocks: [{ kind: 'group', blocks: [dice()] }] } }] }
	const noCheck = { id: 42, parts: [], metadata: { answersForm: { messageId: 40, blockId: 'r1' } } }
	const knock = { id: 43, parts: [{ data: { blocks: [{ kind: 'choices', id: 'k1', actions: [] }] } }] }
	const knockAnswer = { id: 44, metadata: { answersForm: { messageId: 43, blockId: 'k1' } } }
	const all = [asked, rolled, noCheck, knock, knockAnswer]
	assert.equal(holdsDice([roll()]), true)
	assert.equal(holdsDice([{ kind: 'md', text: 'hi' }]), false)
	assert.equal(isDiceLine(asked, all), true)
	assert.equal(isDiceLine(rolled, all), true)
	assert.equal(isDiceLine(noCheck, all), true)
	// Answering a roll form the client does not hold: not known, not marked.
	assert.equal(isDiceLine(noCheck, []), false)
	assert.equal(isDiceLine(knock, all), false)
	assert.equal(isDiceLine(knockAnswer, all), false)
	assert.equal(isDiceLine({ id: 45, parts: null }, all), false)
	assert.equal(isDiceLine(null, all), false)
})
