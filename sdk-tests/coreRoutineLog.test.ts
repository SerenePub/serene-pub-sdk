/**
 * 🚧 Core's *While you were away* widget (PLAN-layering A7, R23; lane 7,
 * 2026-10-21): its declaration — every genre, one per layout, in no layout
 * preset — the request it asks (`routine-log`, core's only), and its plain
 * half: the runs since anyone last played set apart, each line's outcome
 * and what it wrote in words.
 */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { WIDGET_REQUEST_ASKERS, WIDGET_REQUEST_KINDS, type RoutineLogV1 } from '@serene-pub/sdk'
import { CORE_COMPONENTS, CORE_WIDGETS, coreWidgets } from '../core-catalog/src/index.js'
import {
	ROUTINE_LOG_DEFAULTS,
	agoWords,
	readRoutineLogSettings,
	routineLogView,
	wroteWords,
} from '../core-catalog/components/shared/routine-log/routineLog.js'

const NOW = 1_800_000_000_000
const entry = (o: Partial<RoutineLogV1['entries'][number]>): RoutineLogV1['entries'][number] => ({
	runId: 'r',
	registrationKey: 'every-n-turns→story-sweep',
	pipeline: 'core:spec/story-sweep',
	name: 'Look back over the story',
	kind: 'ran',
	startedAt: NOW - 60_000,
	endedAt: NOW - 60_000,
	wrote: [],
	...o,
})

describe('the declaration', () => {
	test('While you were away: every genre, one per layout, the sections it reads, its component', () => {
		const decl = CORE_WIDGETS.find((w) => w.id === 'routine-log')!
		assert.ok(decl)
		assert.equal(coreWidgets.routineLog, decl)
		assert.equal(decl.title, 'While you were away')
		assert.equal(decl.maxInstances, 1)
		assert.equal(decl.genres, undefined)
		assert.deepEqual(decl.reads, ['viewer', 'settings', 'session'])
		assert.ok(CORE_COMPONENTS.some((c) => c.slug === 'routine-log' && c.entry === 'components/shared/routine-log/routine-log.ts'))
		const s = decl.settings as Record<string, { default: unknown }>
		assert.deepEqual(ROUTINE_LOG_DEFAULTS, { limit: s.limit!.default, skipped: s.skipped!.default })
	})

	test('it asks the page for the log — a request core\'s widgets alone make', () => {
		assert.ok(WIDGET_REQUEST_KINDS.includes('routine-log'))
		assert.equal(WIDGET_REQUEST_ASKERS['routine-log'], 'core')
	})
})

describe('the plain half', () => {
	test('settings: defaults filled, bounds held', () => {
		assert.deepEqual(readRoutineLogSettings(undefined), ROUTINE_LOG_DEFAULTS)
		assert.deepEqual(readRoutineLogSettings({ limit: 1000, skipped: false }), { limit: 100, skipped: false })
	})

	test('the runs since anyone last played, apart from the earlier ones', () => {
		const answer: RoutineLogV1 = {
			lastInteractionAt: NOW - 30 * 60_000,
			entries: [
				entry({ runId: 'a', wrote: [{ kind: 'entry', entityId: 1, action: 'insert' }, { kind: 'entry', entityId: 2, action: 'insert' }] }),
				entry({ runId: 'b', kind: 'skipped', reason: 'Skipped: already waiting' }),
				entry({ runId: 'c', startedAt: NOW - 3 * 3_600_000, endedAt: NOW - 3 * 3_600_000, kind: 'paused', reason: 'Paused after 12 runs in a row' }),
			],
		}
		const view = routineLogView(answer, ROUTINE_LOG_DEFAULTS, NOW)
		assert.deepEqual(view.away.map((l) => l.runId), ['a', 'b'])
		assert.deepEqual(view.earlier.map((l) => l.runId), ['c'])
		assert.equal(view.away[0]!.wrote, 'wrote 2 entries')
		assert.equal(view.away[1]!.outcome, 'Skipped: already waiting')
		assert.equal(view.earlier[0]!.outcome, 'Paused after 12 runs in a row')
		assert.equal(view.earlier[0]!.when, '3 hours ago')
		const quiet = routineLogView(answer, { ...ROUTINE_LOG_DEFAULTS, skipped: false }, NOW)
		assert.deepEqual(quiet.away.map((l) => l.runId), ['a'])
		assert.deepEqual(quiet.earlier, [])
	})

	test('nothing yet says so; words for what was written and when', () => {
		assert.equal(routineLogView({ lastInteractionAt: null, entries: [] }, ROUTINE_LOG_DEFAULTS, NOW).empty, 'No routine has run in this session yet.')
		assert.equal(wroteWords([{ kind: 'message', entityId: 1, action: 'insert' }]), '1 message')
		assert.equal(agoWords(NOW - 5_000, NOW), 'just now')
		assert.equal(agoWords(NOW - 5 * 60_000, NOW), '5 minutes ago')
	})
})
