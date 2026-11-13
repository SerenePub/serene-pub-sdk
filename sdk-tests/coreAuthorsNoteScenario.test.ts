/**
 * The Scenario in core's Author's note (lay-B D13, 2026-11-05; owner ruling
 * R5: Left's second tab is "scenario / author's note management"): the
 * SOURCE entry, run in a worker and mirrored through the host-element
 * vocabulary as core's box. The widget asks `session-scenario` on mount and
 * saves it whole with `set-session-scenario`, explicitly, above the note and
 * whether or not the note is offered. (The built-module drivers live in
 * `coreAuthorsNoteComponent.test.ts`; this one needs no rebuild.)
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import type { AuthorsNoteV1 } from '@serene-pub/sdk'
import { mountComponent, type MountedComponent } from './harnessGuard.js'

const CORE_CATALOG = resolve(import.meta.dirname, '..', 'core-catalog')

const stored = (over: Partial<AuthorsNoteV1> = {}): AuthorsNoteV1 => ({
	offered: true,
	canEdit: true,
	note: { text: 'It is raining.', depth: 4, interval: 1, role: 'system' },
	lastReply: null,
	...over,
})

type Scenario = { scenario: string; canEdit: boolean }

async function mountNote(
	note: AuthorsNoteV1,
	scenario: () => Scenario,
	save?: (p: { scenario: string }) => Scenario,
) {
	const view = await mountComponent({
		root: CORE_CATALOG,
		entry: 'components/genres/story/authors-note/authors-note.ts',
		owner: 'core',
		timeoutMs: 60_000,
		context: {
			session: { id: 1, name: 'Proof' },
			settings: {},
			viewer: { userId: 1, isAdmin: false, isGuest: false },
		},
		requests: ((kind: string, params: Record<string, unknown>) => {
			if (kind === 'authors-note') return note
			if (kind === 'session-scenario') return scenario()
			if (kind === 'set-session-scenario' && save) return save(params as { scenario: string })
			throw new Error(`not asked: ${kind}`)
		}) as never,
	})
	await view.settle()
	return view
}

const asked = (view: MountedComponent, kind: string) =>
	view.requested.filter((r) => r.kind === kind)
const part = (name: string) => `[data-widget-part~="authors-note.${name}"]`
const scenarioText = (view: MountedComponent) =>
	view.query<HTMLTextAreaElement>(`textarea${part('scenario-text')}`)
const scenarioSave = (view: MountedComponent) =>
	view.query(`${part('scenario')} button${part('save')}`)
const valueOf = (el: Element | null) =>
	(el as HTMLTextAreaElement | null)?.value ?? el?.getAttribute('value')

test(
	'the owner edits the Scenario above the note; Save sends it once and goes clean',
	{ timeout: 120_000 },
	async () => {
		let current: Scenario = { scenario: 'A rainy harbour town.', canEdit: true }
		const view = await mountNote(
			stored(),
			() => current,
			(p) => (current = { scenario: p.scenario, canEdit: true }),
		)
		try {
			assert.deepEqual(view.refused, [])
			assert.equal(asked(view, 'session-scenario').length, 1)
			const field = scenarioText(view)!
			assert.equal(valueOf(field), 'A rainy harbour town.')
			assert.ok(!field.hasAttribute('disabled'))
			assert.match(view.query(part('scenario'))?.textContent ?? '', /Scenario/)
			assert.equal(
				field.getAttribute('placeholder'),
				'Describe the session scenario, setting, or context (optional)',
			)
			// Above the note, in markup order.
			const html = view.html()
			assert.ok(
				html.indexOf('authors-note.scenario-text') < html.indexOf('authors-note.text'),
			)
			assert.ok(scenarioSave(view)?.hasAttribute('disabled'))
			assert.doesNotMatch(view.root.textContent ?? '', /Unsaved changes/)

			await view.input(`textarea${part('scenario-text')}`, 'A lighthouse at dusk.')
			await view.settle()
			assert.ok(!scenarioSave(view)?.hasAttribute('disabled'))
			assert.match(view.root.textContent ?? '', /Unsaved changes/)

			await view.click(scenarioSave(view)!)
			await view.settle()
			assert.deepEqual(
				asked(view, 'set-session-scenario').map((r) => r.params),
				[{ scenario: 'A lighthouse at dusk.' }],
			)
			assert.equal(asked(view, 'set-authors-note').length, 0)
			assert.ok(scenarioSave(view)?.hasAttribute('disabled'))
			assert.doesNotMatch(view.root.textContent ?? '', /Unsaved changes/)
			assert.equal(valueOf(scenarioText(view)), 'A lighthouse at dusk.')
		} finally {
			await view.unmount()
		}
	},
)

test('Discard puts back what is saved', { timeout: 120_000 }, async () => {
	const view = await mountNote(stored(), () => ({ scenario: 'Saved.', canEdit: true }))
	try {
		await view.input(`textarea${part('scenario-text')}`, 'Typed.')
		await view.settle()
		await view.click(view.query(`${part('scenario')} button${part('discard')}`)!)
		await view.settle()
		assert.equal(valueOf(scenarioText(view)), 'Saved.')
		assert.equal(asked(view, 'set-session-scenario').length, 0)
		assert.doesNotMatch(view.root.textContent ?? '', /Unsaved changes/)
	} finally {
		await view.unmount()
	}
})

test(
	"a refused save is the widget's own line, and the edit stays",
	{ timeout: 120_000 },
	async () => {
		const view = await mountNote(
			stored(),
			() => ({ scenario: 'Saved.', canEdit: true }),
			() => {
				throw new Error('Nope.')
			},
		)
		try {
			await view.input(`textarea${part('scenario-text')}`, 'Typed.')
			await view.click(scenarioSave(view)!)
			await view.settle()
			assert.match(view.query('[role="alert"]')?.textContent ?? '', /Not saved: Nope\./)
			assert.match(view.root.textContent ?? '', /Unsaved changes/)
			assert.equal(valueOf(scenarioText(view)), 'Typed.')
		} finally {
			await view.unmount()
		}
	},
)

test(
	'a non-owner reads it disabled, with the owner-only line and no Save',
	{ timeout: 120_000 },
	async () => {
		const view = await mountNote(stored({ canEdit: false }), () => ({
			scenario: 'A rainy harbour town.',
			canEdit: false,
		}))
		try {
			const field = scenarioText(view)!
			assert.equal(valueOf(field), 'A rainy harbour town.')
			assert.ok(field.hasAttribute('disabled'))
			assert.match(
				view.query(part('scenario'))?.textContent ?? '',
				/Only the session's owner can change the scenario\./,
			)
			assert.equal(scenarioSave(view), null)
		} finally {
			await view.unmount()
		}
	},
)

test(
	'a kind of session with no note shows the Scenario alone, and says nothing of the note',
	{ timeout: 120_000 },
	async () => {
		const view = await mountNote(stored({ offered: false, canEdit: false }), () => ({
			scenario: 'A rainy harbour town.',
			canEdit: true,
		}))
		try {
			assert.ok(scenarioText(view))
			assert.doesNotMatch(view.root.textContent ?? '', /no author's note/)
			assert.equal(view.query(`textarea${part('text')}`) === null, true)
		} finally {
			await view.unmount()
		}
	},
)

test('a scenario that cannot be read says so here', { timeout: 120_000 }, async () => {
	const view = await mountNote(stored(), () => {
		throw new Error('gone')
	})
	try {
		assert.match(
			view.query('[role="alert"]')?.textContent ?? '',
			/Could not read the scenario: gone/,
		)
		assert.equal(scenarioText(view), null)
	} finally {
		await view.unmount()
	}
})
