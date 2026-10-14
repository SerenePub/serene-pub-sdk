/**
 * 🚧 Live scenes in the conversation (PROPOSAL-live-scenes §7, §14 C): where
 * the log draws a scene divider and a day mark, what each says, and which
 * scene boundaries a line's menu may offer — the host's refusals mirrored,
 * so the menu hides what `scenes:open` / `scenes:close` would refuse.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
	boundaryOffer,
	laneOf,
	markedRun,
	runOffer,
	sceneMarks,
	sceneSwatches,
	storyDayLabel,
	type SceneMarkRow,
	type SceneMarkScene,
} from '../core-catalog/components/shared/messages/sceneMarks.js'
import { storyDayLabelIn, storyDayText } from '../core-catalog/src/shared/ui/conversation/storyDays.js'

const row = (id: number, extra: Partial<SceneMarkRow> = {}): SceneMarkRow => ({ id, channel: 'main', ...extra })
const day = (d: number) => ({ storyClockYear: 1, storyClockMonth: 3, storyClockDay: d })
const live = (id: number, opened: number, closed: number | null, extra: Partial<SceneMarkScene> = {}): SceneMarkScene => ({
	id,
	name: `Scene ${id}`,
	selectedMessageIds: [],
	channel: 'main',
	openedAtMessageId: opened,
	closedAtMessageId: closed,
	...extra,
})
const captured = (id: number, ids: number[]): SceneMarkScene => ({ id, name: `Picked ${id}`, selectedMessageIds: ids })

describe('lanes', () => {
	it('reads a bare slug as lane 1, and unset as main', () => {
		assert.equal(laneOf(undefined), 'main')
		assert.equal(laneOf(''), 'main')
		assert.equal(laneOf('main:1'), 'main')
		assert.equal(laneOf('phone:2'), 'phone:2')
	})
})

describe('scene dividers', () => {
	const rows = [row(1), row(2), row(3), row(4, { isHidden: true }), row(5), row(6), row(7)]

	it('draws a live scene from its opening message to its close, and the open one to the newest line', () => {
		const marks = sceneMarks(rows, [live(10, 2, 3, { selectedMessageIds: [2, 3] }), live(11, 5, null)])
		assert.deepEqual([...marks.dividers.keys()], [2, 5])
		assert.deepEqual(marks.dividers.get(2)!.rowIds, [2, 3])
		assert.deepEqual(marks.dividers.get(5)!.rowIds, [5, 6, 7])
		assert.equal(marks.dividers.get(5)!.open, true)
		assert.equal(marks.dividers.get(2)!.open, false)
		assert.equal(marks.sceneOf.get(1), undefined)
		assert.equal(marks.sceneOf.get(4), undefined, 'a line between two scenes is in neither')
	})

	it("counts a closed scene's recorded lines, an open scene's shown loaded lines", () => {
		const marks = sceneMarks(rows, [live(10, 1, 4, { selectedMessageIds: [1, 2, 3] }), live(11, 5, null)])
		assert.equal(marks.dividers.get(1)!.lineCount, 3)
		assert.equal(marks.dividers.get(5)!.lineCount, 3)
		const open = sceneMarks(rows, [live(12, 3, null)])
		assert.equal(open.dividers.get(3)!.lineCount, 4, 'the hidden line is drawn in the scene but not counted')
	})

	it('a captured scene keeps its ticked lines; a live range fills the rest on its own lane only', () => {
		const mixed = [row(1), row(2, { channel: 'sanctum' }), row(3), row(4)]
		const marks = sceneMarks(mixed, [captured(20, [3]), live(21, 1, null)])
		assert.equal(marks.sceneOf.get(3)!.sceneId, 20)
		assert.equal(marks.sceneOf.get(2), undefined, 'another lane is never in a main scene')
		assert.deepEqual(marks.dividers.get(1)!.rowIds, [1, 4])
		assert.equal(marks.dividers.get(3)!.live, false)
	})

	it("says the day a live scene opened on; a captured scene's date stays the history marker's", () => {
		const marks = sceneMarks(rows, [
			live(10, 1, null, { openedAt: { year: 412, month: 3, day: 5, hour: 22, minute: 30 } }),
			captured(20, [2]),
		])
		assert.equal(marks.dividers.get(1)!.dateLabel, 'Year 412, Mo. 3, Day 5')
		assert.equal(sceneMarks(rows, [captured(20, [2])]).dividers.get(2)!.dateLabel, null)
	})

	it('colours scenes by where they begin in the session, as the Chronicle does', () => {
		const swatches = sceneSwatches([live(3, 9, null), captured(1, [4, 2]), live(2, 6, 8)])
		assert.deepEqual([...swatches.entries()].sort((a, b) => a[0] - b[0]), [
			[1, 0],
			[2, 1],
			[3, 2],
		])
	})

	it('draws nothing for a scene none of whose lines are loaded', () => {
		assert.equal(sceneMarks(rows, [live(10, 40, null)]).dividers.size, 0)
	})
})

describe('day marks', () => {
	it('marks the first stamped line of each story day on the lane the log shows', () => {
		const rows = [
			row(1),
			row(2, day(5)),
			row(3, day(5)),
			row(4, { ...day(6), channel: 'sanctum' }),
			row(5, day(5)),
			row(6, day(6)),
		]
		const marks = sceneMarks(rows, [], { lane: 'main' })
		assert.deepEqual([...marks.dayMarks.keys()], [2, 6])
		assert.equal(marks.dayMarks.get(6)!.label, 'Year 1, Mo. 3, Day 6')
	})

	it('a year-only clock spells the year', () => {
		assert.equal(storyDayLabel({ year: 7, month: null, day: 3 }), 'Year 7')
	})
})

describe('🚧 dates through the book\'s calendar (§15 G9)', () => {
	const calendar = {
		months: [
			{ name: 'Deepwinter', days: 30 },
			{ name: 'Thaw', days: 30 },
			{ name: 'Bloom', days: 30 },
		],
	}

	it('the dossier\'s calendar spells a day with its month names, the time of day left off', () => {
		assert.equal(storyDayText({ year: 412, month: 3, day: 5 }, calendar), '5 Bloom, Year 412')
		assert.equal(storyDayText({ year: 412, month: 2, day: null }, calendar), 'Thaw, Year 412')
		assert.equal(storyDayText({ year: 412 }, calendar), 'Year 412')
	})

	it('no calendar, or a day it cannot place, reads free-form as before', () => {
		assert.equal(storyDayText({ year: 412, month: 3, day: 5 }, null), storyDayLabel({ year: 412, month: 3, day: 5 }))
		assert.equal(storyDayText({ year: 412, month: 9, day: 5 }, calendar), 'Year 412, Mo. 9, Day 5')
	})

	it('sceneMarks spells a divider\'s day and every day mark with the label it is handed', () => {
		const rows = [row(1, day(5)), row(2, day(5)), row(3, day(6))]
		const scenes = [live(10, 1, 2, { openedAt: { year: 1, month: 3, day: 5, hour: 22, minute: 30 } })]
		const marks = sceneMarks(rows, scenes, { lane: 'main', dayLabel: storyDayLabelIn(calendar) })
		assert.equal(marks.dividers.get(1)!.dateLabel, '5 Bloom, Year 1')
		assert.equal(marks.dayMarks.get(1)!.label, '5 Bloom, Year 1')
		assert.equal(marks.dayMarks.get(3)!.label, '6 Bloom, Year 1')
		// Handed nothing, free-form.
		assert.equal(sceneMarks(rows, scenes).dayMarks.get(3)!.label, 'Year 1, Mo. 3, Day 6')
	})
})

describe('the boundaries a line may offer', () => {
	it('with no scene, any line may start one and none may end one', () => {
		assert.deepEqual(boundaryOffer(row(3), []), { start: true, end: null })
	})

	it('inside the open scene: start (closing it before) and end; at its opening, end only', () => {
		const scenes = [live(11, 5, null)]
		assert.deepEqual(boundaryOffer(row(7), scenes), { start: true, end: 11 })
		assert.deepEqual(boundaryOffer(row(5), scenes), { start: false, end: 11 })
	})

	it('before the open scene, or inside a closed one, nothing — the host would refuse it', () => {
		const scenes = [live(10, 2, 3), live(11, 5, null)]
		assert.deepEqual(boundaryOffer(row(4), scenes), { start: false, end: null })
		assert.deepEqual(boundaryOffer(row(3), scenes), { start: false, end: null })
	})

	it('with every scene closed: only after the last one ends', () => {
		const scenes = [live(10, 2, 3), live(12, 6, 8)]
		assert.equal(boundaryOffer(row(4), scenes).start, false, 'a scene from 4 would run over 6–8')
		assert.equal(boundaryOffer(row(9), scenes).start, true)
	})

	it('a captured line starts nothing; another lane is judged by its own scenes', () => {
		assert.equal(boundaryOffer(row(4), [captured(20, [4])]).start, false)
		assert.deepEqual(boundaryOffer(row(2, { channel: 'sanctum' }), [live(11, 1, null)]), { start: true, end: null })
	})
})

describe('Mark as scene', () => {
	it('runs from the earliest pick to the latest on its lane', () => {
		const rows = [row(1), row(2), row(3, { channel: 'sanctum' }), row(4)]
		assert.deepEqual(markedRun([4, 2, 3], rows), { lane: 'main', first: 2, last: 4 })
		assert.equal(markedRun([], rows), null)
	})
})

describe('lane E: a run, a start nudged, a scene reopened', () => {
	it('a run may be marked where it overlaps no live scene on its lane, an earlier one included', () => {
		const rows = [row(1), row(2), row(3), row(4), row(5), row(6, { channel: 'sanctum' })]
		const scenes = [live(1, 2, 3), live(2, 5, null)]
		assert.equal(runOffer({ lane: 'main', first: 1, last: 1 }, scenes, rows), true, 'before every scene')
		assert.equal(runOffer({ lane: 'main', first: 4, last: 4 }, scenes, rows), true, 'between them')
		assert.equal(runOffer({ lane: 'main', first: 1, last: 2 }, scenes, rows), false, 'into a closed scene')
		assert.equal(runOffer({ lane: 'main', first: 4, last: 5 }, scenes, rows), false, "over the open scene's opening")
		assert.equal(runOffer({ lane: 'main', first: 6, last: 6 }, [live(2, 5, null)], rows), true, 'after the open scene opened: it closes first')
		assert.equal(runOffer({ lane: 'main', first: 1, last: 4 }, [captured(9, [4])], rows), false, 'a line captured by selection')
		assert.equal(runOffer({ lane: 'main', first: 1, last: 4 }, [captured(9, [6])], rows), true, "another lane's capture")
	})

	it("a live scene's start moves a shown line up into no scene, or down while it keeps a line", () => {
		const rows = [row(1), row(2), row(3, { isHidden: true }), row(4), row(5), row(6)]
		const marks = sceneMarks(rows, [live(1, 1, 2), live(2, 4, 5), live(3, 6, null)])
		const first = marks.dividers.get(1)!
		assert.deepEqual([first.startEarlier, first.startLater], [null, 2])
		// Line 3 is hidden: up skips it to 2, which is Scene 1's.
		const second = marks.dividers.get(4)!
		assert.deepEqual([second.startEarlier, second.startLater], [null, 5])
		const open = marks.dividers.get(6)!
		assert.deepEqual([open.startEarlier, open.startLater], [null, null], 'nothing after it is loaded yet')
		const alone = sceneMarks([row(1), row(2), row(3)], [live(1, 2, 2)]).dividers.get(2)!
		assert.deepEqual([alone.startEarlier, alone.startLater], [1, null], 'one line: it may not move past its end')
	})

	it('a closed live scene reopens only with no open and no later scene on its lane', () => {
		const rows = [row(1), row(2), row(3), row(4)]
		assert.equal(sceneMarks(rows, [live(1, 1, 2)]).dividers.get(1)!.reopens, true)
		assert.equal(sceneMarks(rows, [live(1, 1, 2), live(2, 3, 4)]).dividers.get(1)!.reopens, false)
		assert.equal(sceneMarks(rows, [live(1, 1, 2), live(2, 3, null)]).dividers.get(1)!.reopens, false)
		assert.equal(sceneMarks(rows, [live(1, 1, 2), live(2, 3, null)]).dividers.get(3)!.reopens, false, 'the open scene itself')
		assert.equal(
			sceneMarks([...rows, row(5, { channel: 'sanctum' })], [live(1, 1, 2), live(2, 5, null, { channel: 'sanctum' })]).dividers.get(1)!.reopens,
			true,
			"another lane's open scene is not in the way",
		)
	})
})
