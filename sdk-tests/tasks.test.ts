import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { resolveTasks, taskDue, sweepDue, tasksOn, normaliseTaskSettings, taskDeclsFindings, genre, type TaskDecl } from '@serene-pub/sdk'

const decls: TaskDecl[] = [
	{ key: 'lore-retrieval', label: 'Lore', group: 'reply', kind: 'prose', default: 'full', reviewable: false },
	{ key: 'attributes', label: 'Attributes', group: 'reckoning', kind: 'both', default: 'full' },
	{ key: 'summary', label: 'Summary', group: 'sweep', kind: 'prose', default: 'full' },
	{ key: 'lore', label: 'Lore writes', group: 'sweep', kind: 'prose', default: 'off' },
	{ key: 'side-cast', label: 'Side cast', group: 'voices', kind: 'prose', default: 'off', reviewable: false },
]

describe('resolveTasks', () => {
	test('declared defaults when nothing is stored or pinned', () => {
		const r = resolveTasks(decls, undefined)
		assert.deepEqual(r.map((t) => [t.key, t.mode, t.every, t.waitForRound]), [
			['lore-retrieval', 'full', 1, true],
			['attributes', 'full', 1, true],
			['summary', 'full', 5, true],
			['lore', 'off', 5, true],
			['side-cast', 'off', 1, true],
		])
	})
	test('stored over pinned over declared; review refused where not offered', () => {
		const pinned = { v: 1, tasks: { summary: { mode: 'off' }, lore: { mode: 'full' } }, groups: { sweep: { every: 3 } } }
		const stored = { v: 1, tasks: { lore: { mode: 'review' }, 'lore-retrieval': { mode: 'review' } } }
		const r = resolveTasks(decls, stored, pinned)
		const by = Object.fromEntries(r.map((t) => [t.key, t]))
		assert.equal(by.summary.mode, 'off')
		assert.equal(by.lore.mode, 'review')
		assert.equal(by['lore-retrieval'].mode, 'full')
		assert.equal(by.summary.every, 3)
	})
	test('a detached reckoning task carries its own frequency; a reply task never does', () => {
		const stored = { v: 1, tasks: { attributes: { mode: 'full', every: 4 }, 'lore-retrieval': { mode: 'full', every: 9 } } }
		const by = Object.fromEntries(resolveTasks(decls, stored).map((t) => [t.key, t]))
		assert.equal(by.attributes.every, 4)
		assert.equal(by['lore-retrieval'].every, 1)
	})
	test('due: every turn, every Nth, after each scene, never when off', () => {
		assert.equal(taskDue({ mode: 'full', every: 1 }, 7), true)
		assert.equal(taskDue({ mode: 'full', every: 5 }, 7), false)
		assert.equal(taskDue({ mode: 'full', every: 5 }, 10), true)
		assert.equal(taskDue({ mode: 'review', every: 'scene' }, 3, true), true)
		assert.equal(taskDue({ mode: 'review', every: 'scene' }, 3, false), false)
		assert.equal(taskDue({ mode: 'off', every: 1 }, 1), false)
		assert.equal(sweepDue(0, 5), false)
	})
	test('tasksOn filters a group to what is on', () => {
		assert.deepEqual(tasksOn(resolveTasks(decls, undefined), 'sweep').map((t) => t.key), ['summary'])
	})
	test('normalise drops junk and keeps the shape', () => {
		assert.deepEqual(normaliseTaskSettings({ tasks: { a: { mode: 'nope' }, b: { mode: 'off', every: 'scene' } }, groups: { sweep: { every: 0 } } }), {
			v: 1,
			groups: { sweep: {} },
			tasks: { b: { mode: 'off', every: 'scene' } },
		})
	})
	test('findings refuse a bad declaration and genre() throws on it', () => {
		assert.ok(taskDeclsFindings([{ key: 'Bad Key', label: 'x', group: 'nowhere', kind: 'prose', default: 'on' }]).length >= 3)
		assert.throws(() => genre('acme:genre/bad-tasks', { name: 'Bad', family: 'x', events: {}, tasks: [{ key: 'a', label: 'A', group: 'reply', kind: 'prose', default: 'maybe' as any }] }), /tasks\[0\]\.default/)
	})
})
