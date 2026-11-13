/**
 * Core's Author's note as the component it ships as (AN1): the BUILT module
 * (`core-catalog/dist/components/authors-note.js`), run in a worker and
 * mirrored through the host-element vocabulary as core's box. It reads no
 * section; it asks the page for the note (`authors-note`) and saves it whole
 * (`set-authors-note`), explicitly — the harness answers both as the page
 * does, with the page's own refusals.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import type { AuthorsNoteV1, ViewerV1, WidgetRequests } from '@serene-pub/sdk'
import { mountComponent, type MountedComponent } from '../cli/src/testing.js'
import { coreComponentEntry } from './componentMount.js'
import {
	AUTHORS_NOTE_DEFAULTS,
	authorsNoteDirty,
	authorsNoteLastReplyLine,
	readAuthorsNote,
} from '@serene-pub/core-catalog/authors-note'
import { AUTHORS_NOTE_FIELD } from '@serene-pub/core-catalog'

const CORE_CATALOG = resolve(import.meta.dirname, '..', 'core-catalog')
const BUILT = 'dist/components/authors-note.js'

const stored = (over: Partial<AuthorsNoteV1> = {}): AuthorsNoteV1 => ({
	offered: true,
	canEdit: true,
	note: { text: 'It is raining.', depth: 4, interval: 1, role: 'system' },
	lastReply: { included: true, reason: 'included', depth: 4, targetIndex: 7 },
	...over,
})

async function mountNote(
	answer: () => AuthorsNoteV1,
	save?: (p: WidgetRequests['set-authors-note']['params']) => AuthorsNoteV1,
	viewer: ViewerV1 = { userId: 1, isAdmin: false, isGuest: false },
) {
	const view = await mountComponent({
		...(await coreComponentEntry('authors-note', { root: CORE_CATALOG, entry: BUILT })),
		owner: 'core',
		timeoutMs: 60_000,
		context: { session: { id: 1, name: 'Proof' }, settings: {}, viewer },
		requests: ((kind: string, params: Record<string, unknown>) => {
			if (kind === 'authors-note') return answer()
			// 🚧 The Scenario (lay-B D13) is asked on mount too.
			if (kind === 'session-scenario') return { scenario: '', canEdit: true }
			if (kind === 'set-authors-note' && save) return save(params as never)
			throw new Error(`not asked: ${kind}`)
		}) as never,
	})
	await view.settle()
	return view
}

const asked = (view: MountedComponent, kind: string) => view.requested.filter((r) => r.kind === kind)
// The note's Save, not the Scenario's above it (D13: the scenario's section draws its own Save first).
const saveButton = (view: MountedComponent) =>
	view
		.queryAll('button[data-widget-part~="authors-note.save"]')
		.find((b) => !b.closest('[data-widget-part~="authors-note.scenario"]')) ?? null
const NOTE_TEXT = 'textarea[data-widget-part~="authors-note.text"]'

test('a note goes at the end unless moved: the widget\'s defaults are the field\'s, depth 0 (owner ruling 2026-10-03)', () => {
	assert.equal(AUTHORS_NOTE_DEFAULTS.depth, 0)
	assert.deepEqual({ ...AUTHORS_NOTE_DEFAULTS }, AUTHORS_NOTE_FIELD.default)
	assert.equal((AUTHORS_NOTE_FIELD as any).fields.depth.default, 0)
	// A stored value with no depth reads at the end; a stored depth is kept.
	assert.equal(readAuthorsNote({ text: 'x' }).depth, 0)
	assert.equal(readAuthorsNote({ text: 'x', depth: 4 }).depth, 4)
})

test("the plain half reads a stored note, and dirty means different, not touched", () => {
	assert.deepEqual(readAuthorsNote({ text: 'x', depth: '2', interval: 0, role: 'narrator' }), {
		text: 'x',
		depth: 2,
		interval: 1,
		role: 'system',
	})
	assert.equal(authorsNoteDirty({ text: 'x', depth: '4' }, { text: 'x', depth: 4 }), false)
	assert.equal(authorsNoteDirty({ text: 'y' }, { text: 'x' }), true)
	const t = (s: string) => s
	assert.equal(authorsNoteLastReplyLine(null, t), null)
	assert.match(authorsNoteLastReplyLine({ included: true, reason: 'included', depth: 0, targetIndex: 3 }, t)!, /right before the reply/)
	assert.match(authorsNoteLastReplyLine({ included: false, reason: 'interval', depth: 4, targetIndex: 3 }, t)!, /skipped/)
})

test("core's Author's note reads the note, saves it explicitly, and says what the last reply did", { timeout: 120_000 }, async () => {
	let current = stored()
	const view = await mountNote(
		() => current,
		(p) => (current = stored({ note: p.note })),
	)
	try {
		assert.deepEqual(view.refused, [])
		assert.equal(asked(view, 'authors-note').length, 1)
		assert.equal(view.query(NOTE_TEXT)?.getAttribute('value') ?? (view.query(NOTE_TEXT) as any)?.value, 'It is raining.')
		assert.match(view.root.textContent ?? '', /Last reply: added 4 messages before the reply\./)
		// Clean: Save is there and does nothing to press.
		assert.ok(saveButton(view)?.hasAttribute('disabled'))

		await view.input(NOTE_TEXT, 'The storm has passed.')
		await view.settle()
		assert.ok(!saveButton(view)?.hasAttribute('disabled'))
		assert.match(view.root.textContent ?? '', /Unsaved changes/)

		await view.dispatch('sp-combobox', 'change', { value: 'user' })
		await view.click(saveButton(view)!)
		await view.settle()
		assert.deepEqual(asked(view, 'set-authors-note').map((r) => r.params), [
			{ note: { text: 'The storm has passed.', depth: 4, interval: 1, role: 'user' } },
		])
		// Saved: clean again against what the page answered.
		assert.ok(saveButton(view)?.hasAttribute('disabled'))
		assert.doesNotMatch(view.root.textContent ?? '', /Unsaved changes/)

		// A reply finished: the widget asks again.
		await view.event({ kind: 'generation:end', aborted: false })
		await view.settle()
		assert.equal(asked(view, 'authors-note').length, 2)

		// The note was saved somewhere else (Edit Session, another tab): it
		// asks again, and a clean form shows what is stored now.
		current = stored({ note: { text: 'Fog rolls in.', depth: 0, interval: 1, role: 'system' } })
		await view.event({ kind: 'genreFields:changed' })
		await view.settle()
		assert.equal(asked(view, 'authors-note').length, 3)
		assert.equal(view.query(NOTE_TEXT)?.getAttribute('value') ?? (view.query(NOTE_TEXT) as any)?.value, 'Fog rolls in.')
	} finally {
		await view.unmount?.()
	}
})

test('a guest reads it and is told only the owner may change it; a genre without one draws no note', { timeout: 120_000 }, async () => {
	const guest = await mountNote(() => stored({ canEdit: false }))
	try {
		assert.match(guest.root.textContent ?? '', /Only the session's owner can change the author's note\./)
		assert.equal(saveButton(guest), null)
		assert.ok(guest.query(NOTE_TEXT)?.hasAttribute('disabled'))
	} finally {
		await guest.unmount?.()
	}
	const none = await mountNote(() => stored({ offered: false, canEdit: false, lastReply: null }))
	try {
		assert.doesNotMatch(none.root.textContent ?? '', /no author's note/)
		assert.equal(none.query(NOTE_TEXT), null)
	} finally {
		await none.unmount?.()
	}
})

test("a refused save is the widget's own line, and the edit stays", { timeout: 120_000 }, async () => {
	const view = await mountNote(
		() => stored(),
		() => {
			throw new Error("Only the session's owner can change the author's note.")
		},
	)
	try {
		await view.input(NOTE_TEXT, 'Changed.')
		await view.click(saveButton(view)!)
		await view.settle()
		const alert = view.query('[role="alert"]')
		assert.match(alert?.textContent ?? '', /Not saved: Only the session's owner/)
		assert.match(view.root.textContent ?? '', /Unsaved changes/)
	} finally {
		await view.unmount?.()
	}
})

const NUMBERS = 'input[data-widget-part~="authors-note.number"]'
const FOLD = '[data-widget-part~="authors-note.advanced"]'

test('with advanced controls off the numbers and Sent as are not drawn, and Save still sends the stored depth, interval and role', { timeout: 120_000 }, async () => {
	let current = stored({ note: { text: 'It is raining.', depth: 4, interval: 3, role: 'user' } })
	const view = await mountNote(
		() => current,
		(p) => (current = stored({ note: p.note })),
		{ userId: 1, isAdmin: false, isGuest: false, advancedControls: false },
	)
	try {
		assert.equal(view.queryAll(NUMBERS).length, 0)
		assert.equal(view.queryAll(FOLD).length, 0)
		assert.equal(view.queryAll('[data-widget-part~="authors-note.help"]').length, 0)
		assert.equal(view.queryAll(NOTE_TEXT).length, 1)
		await view.input(NOTE_TEXT, 'The storm has passed.')
		await view.settle()
		await view.click(saveButton(view)!)
		await view.settle()
		assert.deepEqual(asked(view, 'set-authors-note').map((r) => r.params), [
			{ note: { text: 'The storm has passed.', depth: 4, interval: 3, role: 'user' } },
		])
	} finally {
		await view.unmount?.()
	}
})

test('a viewer without the switch shows the numbers and Sent as', { timeout: 120_000 }, async () => {
	const view = await mountNote(() => stored())
	try {
		assert.equal(view.queryAll(NUMBERS).length, 2)
		assert.equal(view.queryAll(FOLD).length, 1)
	} finally {
		await view.unmount?.()
	}
})
