/**
 * 🚧 Core's *Runs* widget (lay-R, owner 2026-11-06): its declaration, the
 * two requests it asks (core's only), its plain half, and the mount — an
 * administrator's list, and nothing at all for anyone else.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import {
	WIDGET_REQUEST_ASKERS,
	WIDGET_REQUEST_KINDS,
	type SessionRunStepV1,
	type SessionRunV1,
} from '@serene-pub/sdk'
import { CORE_COMPONENTS, CORE_WIDGETS, coreWidgets } from '../core-catalog/src/index.js'
import {
	SESSION_RUNS_FIRST,
	SESSION_RUNS_MOST,
	canShowMoreRuns,
	runAgoWords,
	runDurationWords,
	runOutcomeWords,
	runStartedByParts,
	runStartedByWords,
	runStoppedAtWords,
	runTokensWords,
	sessionRunRows,
	sessionRunStepRows,
} from '../core-catalog/src/shared/ui/session-runs/index.js'
import { mountComponent } from '../cli/src/testing.js'

const CORE_CATALOG = resolve(import.meta.dirname, '..', 'core-catalog')
const NOW = 1_800_000_000_000

const run = (o: Partial<SessionRunV1>): SessionRunV1 => ({
	runId: 'r1',
	pipeline: 'story-respond',
	outcome: 'ok',
	triggerFamily: null,
	registrationKey: null,
	triggerSource: 'input',
	userId: 1,
	username: 'ada',
	startedAt: NOW - 70_000,
	endedAt: NOW - 65_000,
	elapsedMs: 4_200,
	tokens: 1234,
	haltNodeKey: null,
	haltReason: null,
	isPreview: false,
	parentRunId: null,
	depth: 0,
	promptMessageId: null,
	...o,
})

describe('the declaration', () => {
	test('Runs: one per layout, reads viewer and session, no settings, its component', () => {
		const decl = CORE_WIDGETS.find((w) => w.id === 'session-runs')!
		assert.ok(decl)
		assert.equal(coreWidgets.sessionRuns, decl)
		assert.equal(decl.title, 'Runs')
		assert.equal(decl.icon, 'Receipt')
		assert.equal(decl.maxInstances, 1)
		assert.deepEqual(decl.reads, ['viewer', 'session'])
		assert.equal(decl.settings, undefined)
		assert.ok(
			CORE_COMPONENTS.some(
				(c) =>
					c.slug === 'session-runs' &&
					c.entry === 'components/shared/session-runs/session-runs.ts',
			),
		)
	})

	test('it asks the page for the runs and their steps — requests core alone makes', () => {
		for (const k of ['session-runs', 'session-run-steps'] as const) {
			assert.ok(WIDGET_REQUEST_KINDS.includes(k))
			assert.equal(WIDGET_REQUEST_ASKERS[k], 'core')
		}
	})
})

describe('the plain half', () => {
	test('outcome words', () => {
		assert.deepEqual(['ok', 'halt', 'err', 'cancelled', 'weird'].map(runOutcomeWords), [
			'Finished',
			'Stopped',
			'Failed',
			'Cancelled',
			'weird',
		])
	})

	test('duration words', () => {
		assert.equal(runDurationWords(820), '820 ms')
		assert.equal(runDurationWords(999), '999 ms')
		assert.equal(runDurationWords(4_200), '4.2 s')
		assert.equal(runDurationWords(4_000), '4 s')
		assert.equal(runDurationWords(59_000), '59 s')
		assert.equal(runDurationWords(65_000), '1 min 5 s')
		assert.equal(runDurationWords(120_000), '2 min')
	})

	test('started by: family first, then source; you, a name, or nobody', () => {
		const w = (
			o: Partial<Parameters<typeof runStartedByWords>[0]>,
			viewer: number | null = 1,
		) =>
			runStartedByWords(
				{ triggerFamily: null, triggerSource: 'input', userId: 1, username: 'ada', ...o },
				viewer,
			)
		assert.equal(
			w({ triggerFamily: 'routine', triggerSource: 'schedule' }),
			'Started by a routine',
		)
		assert.equal(w({ triggerFamily: 'action' }), 'Started by an action')
		assert.equal(w({ triggerFamily: 'event' }), 'Started by an event')
		assert.equal(w({ triggerSource: 'schedule' }), 'Started by a schedule')
		assert.equal(w({ triggerSource: 'event' }), 'Started by an event')
		assert.equal(w({ triggerSource: 'ui' }), 'Started by you')
		assert.equal(w({ triggerSource: 'ui' }, 2), 'Started by ada')
		assert.equal(w({ triggerSource: 'ui', userId: null }, null), 'Started by ada')
		assert.equal(w({ triggerSource: 'ui', username: null }, 2), 'Started by a person')
		assert.equal(w({ triggerSource: 'input' }), 'Started by hand')
		assert.equal(w({ triggerSource: 'hook' }), 'Started by a hook')
		assert.equal(w({ triggerSource: 'odd' }), 'Started by odd')
		assert.deepEqual(
			runStartedByParts(
				{ triggerFamily: null, triggerSource: 'ui', userId: 1, username: 'ada' },
				2,
			),
			{ source: 'Started by {name}', name: 'ada' },
		)
	})

	test('stopped at', () => {
		assert.equal(runStoppedAtWords({ outcome: 'ok', haltNodeKey: 'n', haltReason: 'r' }), null)
		assert.equal(
			runStoppedAtWords({ outcome: 'halt', haltNodeKey: 'gen', haltReason: 'too long' }),
			'at gen: too long',
		)
		assert.equal(
			runStoppedAtWords({ outcome: 'err', haltNodeKey: 'gen', haltReason: null }),
			'at gen',
		)
		assert.equal(
			runStoppedAtWords({ outcome: 'err', haltNodeKey: null, haltReason: 'boom' }),
			'boom',
		)
		assert.equal(
			runStoppedAtWords({ outcome: 'err', haltNodeKey: null, haltReason: null }),
			null,
		)
	})

	test('tokens and ago', () => {
		assert.equal(runTokensWords(0), null)
		assert.equal(runTokensWords(null), null)
		assert.equal(runTokensWords(1), '1 token')
		assert.equal(runTokensWords(1234), '1234 tokens')
		assert.equal(runAgoWords(NOW - 5_000, NOW), 'just now')
		assert.equal(runAgoWords(NOW - 5 * 60_000, NOW), '5 minutes ago')
		assert.equal(runAgoWords(NOW - 3 * 3_600_000, NOW), '3 hours ago')
		assert.equal(runAgoWords(NOW - 72 * 3_600_000, NOW), '3 days ago')
	})

	test('rows keep the host order; step rows sort by seq; show more', () => {
		const rows = sessionRunRows(
			[
				run({ runId: 'b', outcome: 'halt', haltNodeKey: 'g' }),
				run({ runId: 'a', isPreview: true }),
			],
			1,
			NOW,
		)
		assert.deepEqual(
			rows.map((r) => r.runId),
			['b', 'a'],
		)
		assert.equal(rows[0]!.outcomeWords, 'Stopped')
		assert.equal(rows[0]!.stoppedAt, 'at g')
		assert.equal(rows[0]!.duration, '4.2 s')
		assert.equal(rows[1]!.preview, true)
		const step = (seq: number): SessionRunStepV1 => ({
			seq,
			key: `k${seq}`,
			kind: 'generate',
			result: 'ok',
			reason: null,
			elapsedMs: 100,
			tokens: null,
		})
		assert.deepEqual(
			sessionRunStepRows([step(2), step(1)]).map((s) => s.seq),
			[1, 2],
		)
		assert.equal(canShowMoreRuns(SESSION_RUNS_FIRST, SESSION_RUNS_FIRST), true)
		assert.equal(canShowMoreRuns(3, SESSION_RUNS_FIRST), false)
		assert.equal(canShowMoreRuns(SESSION_RUNS_MOST, SESSION_RUNS_MOST), false)
	})
})

async function mountRuns(
	isAdmin: boolean,
	requests: (kind: string, params: Record<string, unknown>) => unknown,
) {
	return mountComponent({
		root: CORE_CATALOG,
		entry: 'components/shared/session-runs/session-runs.ts',
		owner: 'core',
		timeoutMs: 60_000,
		context: {
			session: { id: 1, name: 'Proof' },
			settings: {},
			viewer: { userId: 1, isAdmin, isGuest: false },
		},
		requests: requests as never,
	})
}

test(
	'for a non-admin the Runs widget draws nothing and asks nothing',
	{ timeout: 120_000 },
	async () => {
		let asked = 0
		const view = await mountRuns(false, () => {
			asked++
			return { runs: [] }
		})
		try {
			await view.settle()
			assert.equal((view.root.textContent ?? '').trim(), '')
			assert.equal(view.query('[data-widget-part~="session-runs.root"]') === null, true)
			assert.equal(asked, 0)
			assert.equal(view.requested.length, 0)
		} finally {
			await view.unmount()
		}
	},
)

test(
	"for an administrator it lists the runs, offers Prompt where it can, and opens a run's steps",
	{ timeout: 120_000 },
	async () => {
		const view = await mountRuns(true, (kind, params) => {
			if (kind === 'session-runs')
				return {
					runs: [
						run({
							runId: 'a',
							outcome: 'halt',
							haltNodeKey: 'gen',
							promptMessageId: 7,
						}),
						run({ runId: 'b' }),
					],
				}
			if (kind === 'session-run-steps') {
				return {
					steps: [
						{
							seq: 1,
							key: 'generate',
							kind: 'generate',
							result: 'ok',
							reason: null,
							elapsedMs: 300,
							tokens: 12,
						},
					],
					runId: params.runId,
				}
			}
			return undefined
		})
		try {
			await view.settle()
			const entries = view.root.querySelectorAll('[data-widget-part~="session-runs.entry"]')
			assert.equal(entries.length, 2)
			assert.equal(entries[0]!.getAttribute('data-outcome'), 'halt')
			assert.equal(
				(
					entries[0]!.querySelector('[data-widget-part~="session-runs.outcome"]')
						?.textContent ?? ''
				).trim(),
				'Stopped',
			)
			assert.equal(
				entries[0]!.querySelector('[data-widget-part~="session-runs.prompt"]') === null,
				false,
			)
			assert.equal(
				entries[1]!.querySelector('[data-widget-part~="session-runs.prompt"]') === null,
				true,
			)
			await view.click(
				entries[0]!.querySelector('[data-widget-part~="session-runs.steps-toggle"]')!,
			)
			await view.settle()
			assert.equal(
				view.requested.some(
					(r) =>
						r.kind === 'session-run-steps' &&
						(r.params as { runId: string }).runId === 'a',
				),
				true,
			)
			assert.equal(
				view.root.querySelectorAll('[data-widget-part~="session-runs.step"]').length,
				1,
			)
		} finally {
			await view.unmount()
		}
	},
)
