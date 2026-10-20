/**
 * The plain-TypeScript half of core's Who's here widget
 * (`@serene-pub/core-catalog/attendance`, PLAN-core-widgets W10): its
 * declaration, its settings, and the view — who is here (the viewer first,
 * then the owner, then guests), as whom each writes, who is typing, and who
 * is away with when they were last here.
 */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
	EMPTY_ATTENDANCE,
	WIDGET_BASE_SECTIONS,
	widgetReads,
	type AttendanceV1,
	type AttendeeV1,
	type SessionCharactersV1,
	type ViewerV1,
} from '@serene-pub/sdk'
import {
	ATTENDANCE_DEFAULTS,
	attendanceLastHere,
	attendanceView,
	readAttendanceSettings,
} from '../core-catalog/src/shared/ui/attendance/index.js'
import { CORE_COMPONENTS, CORE_WIDGETS, coreWidgets } from '../core-catalog/src/index.js'

const en = (s: string) => s
const NOW = 1_800_000_000_000
const MIRA: ViewerV1 = { userId: 1, isAdmin: false, isGuest: false }
const MARCO: ViewerV1 = { userId: 2, isAdmin: false, isGuest: true }

const person = (over: Partial<AttendeeV1> & Pick<AttendeeV1, 'userId' | 'name'>): AttendeeV1 => ({
	role: 'guest',
	personaRefs: [],
	typing: false,
	lastSeenAt: NOW,
	here: true,
	...over,
})

const room = (people: AttendeeV1[]): AttendanceV1 => ({ v: 1, people })

const member = (id: number, name: string, face: string | null) => ({
	ref: `character:${id}` as const,
	characterId: id,
	isPersona: true,
	mine: false,
	name,
	face,
	sprite: null,
	spriteSets: [],
	spriteSet: null,
	canChangeSpriteSet: false,
})
const cast: SessionCharactersV1 = {
	members: [member(8, 'Kit', '/media/kit'), member(9, 'Sable', null)],
	sceneImages: { left: null, right: null },
}

const view = (o: Partial<Parameters<typeof attendanceView>[0]> = {}) =>
	attendanceView({
		attendance: room([]),
		characters: cast,
		viewer: MIRA,
		settings: ATTENDANCE_DEFAULTS,
		now: NOW,
		t: en,
		...o,
	})

describe('the section', () => {
	test('attendance is a base section, last in the envelope, and empty before the first push', () => {
		assert.equal(WIDGET_BASE_SECTIONS.at(-1), 'attendance')
		assert.deepEqual(widgetReads({ reads: ['attendance'] }), ['attendance'])
		assert.deepEqual(EMPTY_ATTENDANCE, { v: 1, people: [] })
		assert.ok(Object.isFrozen(EMPTY_ATTENDANCE))
	})
})

describe('the declaration', () => {
	test("attendance: Who's here, one per layout, every genre, the sections it reads and the cast it asks for", () => {
		const decl = CORE_WIDGETS.find((w) => w.id === 'attendance')!
		assert.ok(decl)
		assert.equal(coreWidgets.attendance, decl)
		assert.equal(decl.title, "Who's here")
		assert.equal(decl.icon, 'Users')
		assert.equal(decl.maxInstances, 1)
		assert.equal(decl.genres, undefined)
		assert.deepEqual(decl.scopes, ['characters'])
		assert.deepEqual(decl.reads, ['attendance', 'viewer', 'settings'])
		assert.deepEqual(decl.layout, { span: { ideal: 1 }, minInline: 220 })
		assert.ok(
			CORE_COMPONENTS.some(
				(c) =>
					c.slug === 'attendance' &&
					c.entry === 'components/shared/attendance/attendance.ts',
			),
		)
	})

	test("the declared defaults are the reader's", () => {
		const decl = CORE_WIDGETS.find((w) => w.id === 'attendance')!
		const s = decl.settings as Record<string, { default: unknown; group?: string }>
		assert.deepEqual(ATTENDANCE_DEFAULTS, {
			showAway: s.showAway!.default,
			faces: s.faces!.default,
		})
		assert.deepEqual(ATTENDANCE_DEFAULTS, { showAway: true, faces: true })
		assert.equal(s.showAway!.group, undefined, 'a section of one field is no section')
		assert.deepEqual(readAttendanceSettings(undefined), ATTENDANCE_DEFAULTS)
		assert.deepEqual(readAttendanceSettings({ showAway: false, faces: 'no' }), {
			showAway: false,
			faces: true,
		})
	})
})

describe('the view', () => {
	test('Here lists the viewer first, then the owner, then guests by name; Away the rest, most recently here first', () => {
		const v = view({
			viewer: MARCO,
			attendance: room([
				person({ userId: 1, name: 'Mira', role: 'owner' }),
				person({ userId: 4, name: 'Zed' }),
				person({ userId: 3, name: 'Ana' }),
				person({ userId: 2, name: 'Marco' }),
				person({ userId: 5, name: 'Old', here: false, lastSeenAt: NOW - 3 * 86_400_000 }),
				person({ userId: 6, name: 'Recent', here: false, lastSeenAt: NOW - 5 * 60_000 }),
				person({ userId: 7, name: 'Never', here: false, lastSeenAt: null }),
			]),
		})
		assert.deepEqual(
			v.here.map((r) => [r.name, r.you, r.roleChip]),
			[
				['Marco', true, 'Guest'],
				['Mira', false, 'Owner'],
				['Ana', false, 'Guest'],
				['Zed', false, 'Guest'],
			],
		)
		assert.deepEqual(
			v.away.map((r) => [r.name, r.lastHere]),
			[
				['Recent', 'Last here 5m ago'],
				['Old', 'Last here 3d ago'],
				['Never', 'Not seen lately'],
			],
		)
		assert.ok(v.here.every((r) => r.lastHere === null))
		assert.equal(v.alone, null)
	})

	test('each person writes as their personas, named and faced from the cast; one the cast lacks is left out', () => {
		const v = view({
			attendance: room([
				person({
					userId: 1,
					name: 'Mira',
					role: 'owner',
					personaRefs: ['character:8', 'character:77'],
				}),
				person({ userId: 2, name: 'Marco', personaRefs: ['character:9'] }),
			]),
		})
		assert.deepEqual(v.here[0]!.personas, [
			{ ref: 'character:8', characterId: 8, name: 'Kit', face: '/media/kit' },
		])
		assert.deepEqual(v.here[1]!.personas, [
			{ ref: 'character:9', characterId: 9, name: 'Sable', face: null },
		])
		// Faces off: names only.
		const off = view({
			attendance: room([person({ userId: 1, name: 'Mira', personaRefs: ['character:8'] })]),
			settings: { ...ATTENDANCE_DEFAULTS, faces: false },
		})
		assert.equal(off.here[0]!.personas[0]!.face, null)
		// No cast granted: nobody's personas, never a nameless one.
		const blind = view({
			attendance: room([person({ userId: 1, name: 'Mira', personaRefs: ['character:8'] })]),
			characters: undefined,
		})
		assert.deepEqual(blind.here[0]!.personas, [])
	})

	test('typing shows only on a Here row', () => {
		const v = view({
			attendance: room([
				person({ userId: 1, name: 'Mira', role: 'owner' }),
				person({ userId: 2, name: 'Marco', typing: true }),
				person({ userId: 3, name: 'Ana', typing: true, here: false }),
			]),
		})
		assert.equal(v.here.find((r) => r.name === 'Marco')!.typing, true)
		assert.equal(v.here.find((r) => r.name === 'Mira')!.typing, false)
		assert.equal(v.away[0]!.typing, false)
	})

	test('showAway off lists nobody away', () => {
		const v = view({
			attendance: room([
				person({ userId: 1, name: 'Mira' }),
				person({ userId: 2, name: 'Marco', here: false }),
			]),
			settings: { ...ATTENDANCE_DEFAULTS, showAway: false },
		})
		assert.deepEqual(v.away, [])
		assert.equal(v.here.length, 1)
	})

	test('Nobody else is here. — alone, or before the first push', () => {
		assert.equal(view().alone, 'Nobody else is here.')
		assert.deepEqual(view().here, [])
		const alone = view({
			attendance: room([
				person({ userId: 1, name: 'Mira', role: 'owner' }),
				person({ userId: 2, name: 'Marco', here: false }),
			]),
		})
		assert.equal(alone.alone, 'Nobody else is here.')
		assert.equal(alone.here.length, 1)
		assert.equal(alone.away.length, 1)
		assert.equal(view({ attendance: undefined }).alone, 'Nobody else is here.')
	})

	test('last here, worded', () => {
		assert.equal(attendanceLastHere(NOW - 10_000, NOW, en), 'Last here just now')
		assert.equal(attendanceLastHere(NOW - 2 * 3_600_000, NOW, en), 'Last here 2h ago')
		assert.equal(attendanceLastHere(null, NOW, en), 'Not seen lately')
		// A clock a little behind the server's never says "ago" of the future.
		assert.equal(attendanceLastHere(NOW + 5_000, NOW, en), 'Last here just now')
	})
})
