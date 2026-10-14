/**
 * The three worked widget examples (plans/PLAN-widget-api-dx D7) —
 * `fixtures/widget-examples/` — each mounted by the harness under its own
 * declaration's `reads`, `scopes` and `channels`, as the page would mount it.
 * And `guides/widget-examples.md` holds each component's source byte for byte,
 * so the page cannot drift from the code tested here.
 *
 * ⚠ The harness bundles `@serene-pub/sdk` from its built `dist`. Until
 * `npm run sdk:build` has run after D2/D4, the worker's context has no
 * `scope()` (every Mood dial mount fails: "raw.scope is not a function") and
 * drops write grants from `grants` (the write test would then fail as "nothing
 * matches '[data-widget-part~="acme.widget-examples:mood-dial.plus"]'"); everything else passes against today's dist.
 */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { mountComponent, test } from './harnessGuard.js'
import {
	widgetRequestRefusal,
	type ActionsV1,
	type AttendanceV1,
	type MessageV1,
	type SessionPersonaV1,
	type SessionStateV1,
	type WidgetAction,
	type WidgetScope,
} from '@serene-pub/sdk'
import { logSearch, moodDial, whoIsHere } from './fixtures/widget-examples/src/index.js'

const DIR = join(import.meta.dirname, 'fixtures', 'widget-examples')
const entry = (slug: string) => join(DIR, 'components', `${slug}.ts`)
const OWNER = 'acme.widget-examples'
const TIMEOUT = 60_000

/* ── Who's here ─────────────────────────────────────────────────────────── */

const person = (userId: number, name: string, more: Partial<AttendanceV1['people'][number]> = {}) => ({
	userId,
	name,
	role: 'guest' as const,
	personaRefs: [],
	typing: false,
	lastSeenAt: 1,
	here: true,
	...more,
})
const attendance = (...people: AttendanceV1['people']): AttendanceV1 => ({ v: 1, people })
const names = (view: Awaited<ReturnType<typeof mountComponent>>) =>
	view.queryAll('li[data-widget-part~="acme.widget-examples:who-is-here.person"]').map((li) => li.textContent!.replace(/\s+/g, ' ').trim())

test("Who's here: lists who has the session open, marks the viewer, and redraws on an attendance push", async () => {
	const view = await mountComponent({
		entry: entry('who-is-here'),
		owner: OWNER,
		reads: whoIsHere.reads,
		timeoutMs: TIMEOUT,
		context: {
			viewer: { userId: 1, isAdmin: false, isGuest: false },
			attendance: attendance(
				person(1, 'Jody', { role: 'owner' }),
				person(2, 'Tam', { typing: true }),
				person(3, 'Oren', { here: false }),
			),
			// Not in `reads`: the page never posts it, and neither does the harness.
			messages: [{ id: 1, role: 'user', content: 'Hi' }],
		},
	})
	try {
		assert.deepEqual(names(view), ['Jody (you)', 'Tam'])
		assert.equal(view.query('[data-widget-part~="acme.widget-examples:who-is-here.you"]')?.textContent, '(you)')
		assert.equal(view.query('[data-widget-part~="acme.widget-examples:who-is-here.typing"]')?.textContent?.trim(), 'Tam is typing…')
		assert.equal(view.query('sp-avatar')?.getAttribute('ref'), 'user:1')

		await view.push('attendance', attendance(person(1, 'Jody', { role: 'owner' }), person(2, 'Tam'), person(3, 'Oren')))
		assert.deepEqual(names(view), ['Jody (you)', 'Tam', 'Oren'])
		assert.equal(view.query('[data-widget-part~="acme.widget-examples:who-is-here.typing"]')?.textContent?.trim(), '')

		await view.push('attendance', attendance(person(1, 'Jody', { role: 'owner', typing: true }), person(3, 'Oren', { typing: true })))
		// The viewer's own typing is not announced back to them.
		assert.equal(view.query('[data-widget-part~="acme.widget-examples:who-is-here.typing"]')?.textContent?.trim(), 'Oren is typing…')
		assert.deepEqual(view.refused, [])
		assert.deepEqual(view.errors, [])
	} finally {
		await view.unmount()
	}
})

/* ── Log search ─────────────────────────────────────────────────────────── */

const line = (id: number, content: string, speakerLabel = 'Mira'): MessageV1 => ({ id, role: 'assistant', content, speakerLabel })

test('Log search: filters the channel, pages older lines on a press, and restores its saved query', async () => {
	const pages: Record<string, { rows: MessageV1[]; nextCursor?: string }> = {
		'': { rows: [line(3, 'The mill wheel turns.'), line(4, 'Rain.')], nextCursor: 'c1' },
		c1: { rows: [line(1, 'We reach the mill.', 'Tobin'), line(2, 'Quiet.')] },
	}
	const view = await mountComponent({
		entry: entry('log-search'),
		owner: OWNER,
		reads: logSearch.reads,
		channels: logSearch.channels,
		timeoutMs: TIMEOUT,
		requests: (kind, params) => (kind === 'messages' ? pages[String(params.cursor ?? '')] : undefined),
		context: {
			state: { query: 'mill' },
			channels: { main: [line(5, 'The mill is dark.'), line(6, 'Inside, then.', 'Tobin')] },
		},
	})
	const shown = () => view.queryAll('li[data-widget-part~="acme.widget-examples:log-search.line"]').map((li) => li.textContent!.replace(/\s+/g, ' ').trim())
	try {
		// Restored from `ctx.state`: the saved query filters the live lines at once.
		assert.equal((view.query('input') as HTMLInputElement).value, 'mill')
		assert.deepEqual(shown(), ['Mira: The mill is dark.'])
		assert.equal(view.query('[data-widget-part~="acme.widget-examples:log-search.count"]')?.textContent, '1 / 2')

		await view.click('button')
		await view.settle()
		assert.deepEqual(shown(), ['Mira: The mill wheel turns.', 'Mira: The mill is dark.'])
		await view.click('button')
		await view.settle()
		assert.deepEqual(shown(), ['Tobin: We reach the mill.', 'Mira: The mill wheel turns.', 'Mira: The mill is dark.'])
		// The last page has no cursor: nothing older to load.
		assert.equal(view.query('button'), null)
		assert.deepEqual(view.requested, [
			{ kind: 'messages', params: { channel: 'main', limit: 50 } },
			{ kind: 'messages', params: { channel: 'main', cursor: 'c1', limit: 50 } },
		])

		await view.input('input', 'tobin')
		assert.equal(view.query('[data-widget-part~="acme.widget-examples:log-search.count"]')?.textContent, '0 / 6')
		await view.input('input', 'inside')
		assert.deepEqual(shown(), ['Tobin: Inside, then.'])
		assert.deepEqual(view.saved.at(-1), { query: 'inside' })
		assert.deepEqual(view.refused, [])
		assert.deepEqual(view.errors, [])
	} finally {
		await view.unmount()
	}
})

/* ── Mood dial ──────────────────────────────────────────────────────────── */

const HP = 'core:slot/hp@1'
const MOOD = 'core:slot/mood@1'
const STATE: SessionStateV1 = {
	sessionId: 3,
	loaded: true,
	error: null,
	resolved: { world: { 'core:mood': 'calm' }, cast: { mira: { 'core:hp': 12 } } },
	slots: [
		{ slotId: HP, key: 'hp', qualifiedKey: 'core:hp', label: 'HP', type: 'integer', appliesTo: ['cast'] },
		{ slotId: MOOD, key: 'mood', qualifiedKey: 'core:mood', label: 'Mood', type: 'enum', appliesTo: ['world'] },
	],
	owners: [
		{ key: 'world', kind: 'session', id: 3, label: 'World', configs: { [MOOD]: { of: ['calm', 'tense'] } } },
		{ key: 'mira', kind: 'session_cast', id: 11, label: 'Mira', configs: { [HP]: { min: 0, max: 13 } } },
	],
}
const MIRA: SessionPersonaV1 = {
	ref: 'character:7',
	characterId: 7,
	isPersona: true,
	mine: true,
	name: 'Mira',
	face: null,
	sprite: null,
	spriteSets: [],
	spriteSet: null,
	canChangeSpriteSet: false,
}
const ROLL: WidgetAction = {
	key: 'roll',
	specSlug: 'acme.dice',
	name: 'Roll',
	slash: '/roll',
	quick: false,
	audience: { see: [], act: [] },
	venue: 'widget',
	origin: 'foreign',
	floor: false,
	canAct: true,
	itemGated: false,
	isNew: false,
}
const ACTIONS: ActionsV1 = { widget: { primary: [ROLL], overflow: [ROLL] } }
const ALL = moodDial.scopes as WidgetScope[]
const READ_ONLY = ALL.filter((s) => !s.endsWith(':write'))

const mountDial = (grants: WidgetScope[], context = {}) =>
	mountComponent({
		entry: entry('mood-dial'),
		owner: OWNER,
		reads: moodDial.reads,
		grants,
		timeoutMs: TIMEOUT,
		requests: (kind) => (kind === 'set-attribute-value' ? undefined : Promise.reject(new Error(`not stubbed: ${kind}`))),
		context: { actions: ACTIONS, settings: { step: 1 }, ...context },
	})

test('Mood dial: a refused scope is drawn as not granted, never as loading', async () => {
	const view = await mountDial([])
	try {
		assert.ok(view.query('[data-widget-part~="acme.widget-examples:mood-dial.not-granted"]'))
		assert.equal(view.query('[data-widget-part~="acme.widget-examples:mood-dial.loading"]'), null)
	} finally {
		await view.unmount()
	}
})

test('Mood dial: granted but not posted yet is loading; posted, it lists the owner\'s slots', async () => {
	const view = await mountDial(READ_ONLY)
	try {
		assert.ok(view.query('[data-widget-part~="acme.widget-examples:mood-dial.loading"]'))
		assert.equal(view.query('[data-widget-part~="acme.widget-examples:mood-dial.not-granted"]'), null)
		await view.push('scoped', { session_state: STATE, persona: [MIRA] })
		// The viewer's persona owns HP; the world's Mood is not Mira's.
		assert.equal(view.query('[data-widget-part~="acme.widget-examples:mood-dial.owner"]')?.textContent, 'Mira')
		assert.deepEqual(
			view.queryAll('li[data-widget-part~="acme.widget-examples:mood-dial.slot"]').map((li) => li.getAttribute('data-slot')),
			['hp'],
		)
		assert.equal(view.query('[data-widget-part~="acme.widget-examples:mood-dial.value"]')?.textContent, '12')
		// No write grant: no buttons, and it says so.
		assert.equal(view.query('[data-widget-part~="acme.widget-examples:mood-dial.plus"]'), null)
		assert.ok(view.query('[data-widget-part~="acme.widget-examples:mood-dial.read-only"]'))
		// Without a persona the world's stats are drawn.
		await view.push('scoped', { session_state: STATE, persona: [] })
		assert.equal(view.query('[data-widget-part~="acme.widget-examples:mood-dial.owner"]')?.textContent, 'World')
		assert.equal(view.query('[data-widget-part~="acme.widget-examples:mood-dial.value"]')?.textContent, 'calm')
	} finally {
		await view.unmount()
	}
})

test('Mood dial: set-attribute-value is refused without the write grant and allowed with it', () => {
	const refusal = widgetRequestRefusal('set-attribute-value', { owner: OWNER, grants: READ_ONLY })
	assert.match(refusal ?? '', /write grant 'session:state:write'/)
	assert.equal(widgetRequestRefusal('set-attribute-value', { owner: OWNER, grants: ALL }), null)
})

test('Mood dial: with the write grant a press nudges the stat (clamped), an action is pressed by identity, and a revoked write hides the buttons', async () => {
	const view = await mountDial(ALL, { scoped: { session_state: STATE, persona: [MIRA] } })
	try {
		await view.click('[data-widget-part~="acme.widget-examples:mood-dial.plus"]')
		await view.settle()
		// The write answers nothing; the new value arrives as a push, as on the page.
		const at13 = { ...STATE, resolved: { ...STATE.resolved, cast: { mira: { 'core:hp': 13 } } } }
		await view.push('scoped', { session_state: at13, persona: [MIRA] })
		assert.equal(view.query('[data-widget-part~="acme.widget-examples:mood-dial.value"]')?.textContent, '13')
		await view.click('[data-widget-part~="acme.widget-examples:mood-dial.plus"]') // the ceiling (13) holds it
		await view.settle()
		await view.click('[data-widget-part~="acme.widget-examples:mood-dial.minus"]')
		await view.settle()
		const writes = view.requested.filter((r) => r.kind === 'set-attribute-value').map((r) => r.params)
		assert.deepEqual(writes, [
			{ owner: { kind: 'session_cast', id: 11 }, slotId: HP, value: 13 },
			{ owner: { kind: 'session_cast', id: 11 }, slotId: HP, value: 13 },
			{ owner: { kind: 'session_cast', id: 11 }, slotId: HP, value: 12 },
		])
		assert.equal(view.query('[data-widget-part~="acme.widget-examples:mood-dial.failed"]'), null)

		await view.click('[data-widget-part~="acme.widget-examples:mood-dial.action"]')
		assert.deepEqual(view.invoked, [{ key: 'acme.dice#roll' }])

		await view.setGrants(READ_ONLY)
		assert.equal(view.query('[data-widget-part~="acme.widget-examples:mood-dial.plus"]'), null)
		assert.ok(view.query('[data-widget-part~="acme.widget-examples:mood-dial.read-only"]'))
		assert.deepEqual(view.refused, [])
		assert.deepEqual(view.errors, [])
	} finally {
		await view.unmount()
	}
})

/* ── the guide page ─────────────────────────────────────────────────────── */

test('guides/widget-examples.md shows each example\'s files byte for byte', async () => {
	const guide = await readFile(join(import.meta.dirname, '..', 'guides', 'widget-examples.md'), 'utf8')
	for (const [file, lang] of [
		['components/WhoIsHere.svelte', 'svelte'],
		['components/LogSearch.svelte', 'svelte'],
		['components/MoodDial.svelte', 'svelte'],
		['components/mood-dial.ts', 'ts'],
	] as const) {
		const source = (await readFile(join(DIR, file), 'utf8')).trimEnd()
		// The fence may carry a word after its language (`ts nocheck …`); its body is the file.
		assert.match(guide, new RegExp('```' + lang + '[^\\n]*\\n' + source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\n```'), `${file}: the guide's fence is the file's own text`)
	}
	// Each declaration on the page is the one this suite mounts under.
	const decls = await readFile(join(DIR, 'src', 'index.ts'), 'utf8')
	const shown = decls.match(/export const \w+ = widget\(\{[\s\S]*?\n\}\)/g) ?? []
	assert.equal(shown.length, 3)
	for (const decl of shown) assert.ok(guide.includes(decl), `the guide shows the declaration the test mounts:\n${decl}`)
})
