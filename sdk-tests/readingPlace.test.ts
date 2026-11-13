/**
 * The Dialogue box's reading place (PLAN-visual-novel-layout §1.2). Pure.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
	isReadLine,
	nextLinePlace,
	queuedSummary,
	queuedText,
	settlePlace,
	type ReadingRow,
} from '../core-catalog/src/shared/ui/conversation/readingPlace.js'

const char = (id: number, extra: Partial<ReadingRow> = {}): ReadingRow => ({
	id,
	role: 'assistant',
	characterId: id,
	...extra,
})
const own = (id: number): ReadingRow => ({ id, role: 'user', personaId: 9 })
const tableLine = (id: number): ReadingRow => ({
	id,
	role: 'assistant',
	metadata: { tableLine: true },
})
const anchored = (id: number): ReadingRow => ({
	id,
	role: 'assistant',
	metadata: { anchorMessageId: 3 },
})
const system = (id: number): ReadingRow => ({ id, role: 'system' })
const names: Record<number, string> = { 1: 'Osk', 2: 'Bren', 3: 'Osk', 4: 'Osk' }
const nameOf = (r: ReadingRow) => names[r.id] ?? null

describe('isReadLine', () => {
	const cases: [string, ReadingRow, boolean][] = [
		['character', { id: 1, characterId: 4 }, true],
		['persona', { id: 1, personaId: 4 }, true],
		['cast member', { id: 1, castMemberId: 4 }, true],
		['narrator', { id: 1, isNarratorResponse: true }, true],
		['generating', { id: 1, isGenerating: true }, true],
		['envoy', { id: 1, metadata: { speaker: 'envoy:abc' } }, true],
		['user', { id: 1, role: 'user' }, true],
		['other speaker string', { id: 1, role: 'assistant', metadata: { speaker: 'x' } }, false],
		['bare assistant', { id: 1, role: 'assistant' }, false],
		['table line', { id: 1, characterId: 4, metadata: { tableLine: true } }, false],
		['anchored', { id: 1, characterId: 4, metadata: { anchorMessageId: 2 } }, false],
		['system', { id: 1, role: 'system', characterId: 4 }, false],
		['system while generating', { id: 1, role: 'system', isGenerating: true }, false],
		['metadata not an object', { id: 1, characterId: 4, metadata: 'x' }, true],
		['metadata null', { id: 1, role: 'assistant', metadata: null }, false],
	]
	for (const [name, row, want] of cases) test(name, () => assert.equal(isReadLine(row), want))
})

describe('settlePlace', () => {
	test('empty rows are null', () => assert.equal(settlePlace([], 5, 5), null))
	test('mount starts at the newest', () =>
		assert.equal(settlePlace([char(1), char(2), char(3)], null), 3))
	test('holds after a character line while new rows queue', () => {
		assert.equal(settlePlace([char(1), char(2), char(3)], 1), 1)
	})
	test('a removed row falls to the greatest remaining id below it', () => {
		assert.equal(settlePlace([char(1), char(2), char(4)], 3), 2)
	})
	test('a removed row with none below falls to the newest', () => {
		assert.equal(settlePlace([char(5), char(6)], 3), 6)
	})
	test('a change line after the place is passed while a row follows it', () => {
		assert.equal(settlePlace([char(1), tableLine(2), anchored(3), system(4), char(5)], 2), 5)
	})
	test('a trailing change line is held', () => {
		assert.equal(settlePlace([char(1), tableLine(2)], 2), 2)
	})
	test("the viewer's own line passes", () => {
		assert.equal(settlePlace([char(1), own(2), char(3)], 2, 2), 3)
	})
	test("the viewer's own trailing line is held", () => {
		assert.equal(settlePlace([char(1), own(2)], 2, 2), 2)
	})
	test('catching up: own id beyond the place jumps then passes to the first reply', () => {
		assert.equal(settlePlace([char(1), char(2), own(3), char(4)], 1, 3), 4)
	})
	test('catching up over several held lines', () => {
		assert.equal(settlePlace([char(1), char(2), char(3), char(4), own(5)], 1, 5), 5)
		assert.equal(settlePlace([char(1), char(2), char(3), char(4), own(5), char(6)], 1, 5), 6)
	})
	test("another channel's own id never moves the place", () => {
		assert.equal(settlePlace([char(1), char(2), char(3)], 1, 7), 1)
	})
	test('own id not beyond the place does not move it', () => {
		assert.equal(settlePlace([char(1), char(2), char(3)], 3, 1), 3)
	})
	test('no own id: null and undefined', () => {
		const rows = [char(1), own(2), char(3)]
		assert.equal(settlePlace(rows, 2, null), 2)
		assert.equal(settlePlace(rows, 2, undefined), 2)
	})
})

describe('nextLinePlace', () => {
	test('shows the next line', () =>
		assert.equal(nextLinePlace([char(1), char(2), char(3)], 1), 2))
	test('stops at the newest', () => assert.equal(nextLinePlace([char(1), char(2)], 2), 2))
	test('passes change lines', () =>
		assert.equal(nextLinePlace([char(1), tableLine(2), system(3), char(4)], 1), 4))
	test('a trailing change line is held on', () =>
		assert.equal(nextLinePlace([char(1), tableLine(2)], 1), 2))
	test("passes the viewer's own line", () =>
		assert.equal(nextLinePlace([char(1), own(2), char(3)], 1, 2), 3))
	test('null place or a place not among the rows settles', () => {
		assert.equal(nextLinePlace([char(1), char(2)], null), 2)
		assert.equal(nextLinePlace([char(1), char(3)], 2), 1)
	})
	test('no catching up', () => {
		assert.equal(nextLinePlace([char(1), char(2), own(3), char(4)], 1, 3), 2)
	})
	test('empty rows', () => assert.equal(nextLinePlace([], null), null))
})

describe('queuedSummary and queuedText', () => {
	test('a null place queues nothing', () => {
		const s = queuedSummary([char(1), char(2)], null, nameOf)
		assert.deepEqual(s, { lines: 0, repliedBy: [], writing: null })
		assert.equal(queuedText(s), null)
	})
	test('nothing after the place', () => {
		assert.equal(queuedText(queuedSummary([char(1)], 1, nameOf)), null)
	})
	test('one name', () => {
		const s = queuedSummary([char(1), char(2)], 1, nameOf)
		assert.deepEqual(s, { lines: 1, repliedBy: ['Bren'], writing: null })
		assert.equal(queuedText(s), 'Bren has replied')
	})
	test('two names', () => {
		assert.equal(
			queuedText(queuedSummary([char(0), char(1), char(2)], 0, nameOf)),
			'Osk and Bren have replied',
		)
	})
	test('the same speaker twice is 2 more lines', () => {
		const s = queuedSummary([char(1), char(3), char(4)], 1, nameOf)
		assert.deepEqual(s.repliedBy, ['Osk'])
		assert.equal(queuedText(s), '2 more lines')
	})
	test('a nameless line is n more lines', () => {
		const s = queuedSummary([char(1), char(2), char(7)], 1, nameOf)
		assert.deepEqual(s.repliedBy, [])
		assert.equal(queuedText(s), '2 more lines')
		assert.equal(queuedText(queuedSummary([char(1), char(7)], 1, nameOf)), '1 more line')
	})
	test('three lines', () => {
		assert.equal(
			queuedText(queuedSummary([char(1), char(2), char(3), char(4)], 1, nameOf)),
			'3 more lines',
		)
	})
	test('change lines are not counted', () => {
		assert.equal(queuedText(queuedSummary([char(1), tableLine(2), system(3)], 1, nameOf)), null)
	})
	test('writing with a name', () => {
		const s = queuedSummary([char(1), char(2, { isGenerating: true })], 1, nameOf)
		assert.deepEqual(s, { lines: 0, repliedBy: [], writing: 'Bren' })
		assert.equal(queuedText(s), 'Bren is writing…')
	})
	test('writing without a name', () => {
		const s = queuedSummary([char(1), char(7, { isGenerating: true })], 1, nameOf)
		assert.equal(s.writing, '')
		assert.equal(queuedText(s), 'Writing…')
	})
	test('both parts joined', () => {
		const s = queuedSummary([char(1), char(2), char(3, { isGenerating: true })], 1, nameOf)
		assert.equal(queuedText(s), 'Bren has replied · Osk is writing…')
	})
})
