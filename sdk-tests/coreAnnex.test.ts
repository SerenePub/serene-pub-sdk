/**
 * The plain-TypeScript half of core's Annex widget
 * (`@serene-pub/core-catalog/annex`, PLAN-core-widgets W9): its declaration,
 * its settings, what it knows of a declared field from the host's listing,
 * and the one view it draws — an empty state, each one line, or one annex
 * key's value in its shape with the Session data list's Edit where the
 * viewer may set it.
 */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { ActionsV1, AnnexV1, ViewerV1, WidgetAction } from '@serene-pub/sdk'
import {
	ANNEX_WIDGET_DEFAULTS,
	ANNEX_WIDGET_EMPTY,
	annexWidgetFieldsFrom,
	annexWidgetView,
	parseAnnexWidgetKey,
	readAnnexWidgetSettings,
	type AnnexWidgetField,
	type AnnexWidgetInputs,
} from '../core-catalog/src/shared/ui/annex/index.js'
import { CORE_COMPONENTS, CORE_WIDGETS, coreWidgets } from '../core-catalog/src/index.js'

const OWNER: ViewerV1 = { userId: 10, isAdmin: false, isGuest: false }
const GUEST: ViewerV1 = { userId: 11, isAdmin: false, isGuest: true }

/** A settable field, as the host lists it: one action at the `widget` venue. */
const fieldAction = (
	owner: string,
	key: string,
	name: string,
	over: Partial<WidgetAction> = {},
): WidgetAction => ({
	key,
	specSlug: `${owner}:annex`,
	name,
	slash: key,
	quick: false,
	audience: { see: ['owner'], act: ['owner'] },
	venue: 'widget',
	origin: 'foreign',
	floor: false,
	canAct: true,
	itemGated: false,
	isNew: false,
	enabled: true,
	...over,
})

const ANNEX: AnnexV1 = {
	'acme.dice': {
		notes: 'Rolled twice.\nThe second was a 20.',
		'last-roll': 17,
		lucky: true,
		mood: 'very-calm',
		tags: ['brave', 'tired'],
		sheet: { hp: 7, name: 'Bram' },
		blank: '',
	},
}

const view = (over: Partial<AnnexWidgetInputs>) =>
	annexWidgetView({ annex: ANNEX, fields: [], key: '', viewer: OWNER, ...over })

describe('the declaration', () => {
	test('annex: every genre, no scopes, no cap, the five sections it reads', () => {
		const decl = CORE_WIDGETS.find((w) => w.id === 'annex')!
		assert.ok(decl)
		assert.equal(coreWidgets.annex, decl)
		assert.equal(decl.title, 'Annex')
		assert.equal(decl.icon, 'ClipboardList')
		assert.equal(decl.maxInstances, undefined, 'one copy per key')
		assert.equal(decl.genres, undefined)
		assert.equal(decl.scopes, undefined)
		assert.deepEqual(decl.reads, ['annex', 'actions', 'viewer', 'settings', 'locale'])
		assert.deepEqual(decl.layout, { span: { ideal: 1 }, minInline: 220 })
		assert.ok(
			CORE_COMPONENTS.some(
				(c) => c.slug === 'annex' && c.entry === 'components/shared/annex/annex.ts',
			),
		)
	})

	test("the declared defaults are the reader's", () => {
		const decl = CORE_WIDGETS.find((w) => w.id === 'annex')!
		const s = decl.settings as Record<string, { type: string; default: unknown }>
		assert.equal(s.key!.type, 'string')
		assert.equal(s.showLabel!.type, 'boolean')
		assert.deepEqual(ANNEX_WIDGET_DEFAULTS, {
			key: s.key!.default,
			showLabel: s.showLabel!.default,
		})
		assert.deepEqual(readAnnexWidgetSettings(undefined), ANNEX_WIDGET_DEFAULTS)
		assert.deepEqual(
			readAnnexWidgetSettings({ key: 3, showLabel: 'yes' }),
			ANNEX_WIDGET_DEFAULTS,
		)
		assert.deepEqual(
			readAnnexWidgetSettings({ key: '  core.retake-quietly ', showLabel: true }),
			{
				key: 'core.retake-quietly',
				showLabel: true,
			},
		)
	})
})

describe('the key', () => {
	test('owner, a dot, the key — the last dot splits, so an owner may hold dots', () => {
		assert.deepEqual(parseAnnexWidgetKey('core.castellan-scratchpad'), {
			owner: 'core',
			key: 'castellan-scratchpad',
		})
		assert.deepEqual(parseAnnexWidgetKey('acme.dice.last-roll'), {
			owner: 'acme.dice',
			key: 'last-roll',
		})
		for (const bad of [
			'',
			'last-roll',
			'.last-roll',
			'core.',
			'core.Last_Roll',
			'core:annex#last-roll',
			'a b.c',
		])
			assert.equal(parseAnnexWidgetKey(bad), null, bad)
	})
})

describe('what it knows of a field', () => {
	test("the listing's settable fields: the widget venue's `<owner>:annex` actions, each once", () => {
		const listing: ActionsV1 = {
			widget: {
				primary: [
					fieldAction('acme.dice', 'notes', 'Table notes'),
					fieldAction('core', 'retake-quietly', "Don't ask before regenerating a turn", {
						enabled: false,
					}),
					fieldAction('acme.dice', 'roll', 'Roll', { specSlug: 'acme.dice:spec/roll' }),
				],
				overflow: [fieldAction('acme.dice', 'notes', 'Table notes')],
			},
			composer: {
				primary: [fieldAction('acme.dice', 'tags', 'Tags', { venue: 'composer' })],
				overflow: [],
			},
		}
		const fields: AnnexWidgetField[] = annexWidgetFieldsFrom(listing)
		assert.deepEqual(fields, [
			{ owner: 'acme.dice', key: 'notes', label: 'Table notes', canAct: true },
			{
				owner: 'core',
				key: 'retake-quietly',
				label: "Don't ask before regenerating a turn",
				canAct: false,
			},
		])
		assert.deepEqual(annexWidgetFieldsFrom(undefined), [])
	})
})

describe('the view', () => {
	test('no key, or not one: Pick a key in settings, titled Annex', () => {
		for (const key of ['', 'notes', 'acme.dice.']) {
			const v = view({ key })
			assert.equal(v.state, 'pick', key)
			assert.equal(v.title, 'Annex')
			assert.equal(v.empty, ANNEX_WIDGET_EMPTY.pick)
			assert.equal(v.empty, 'Pick a key in settings')
			assert.equal(v.identity, null)
			assert.equal(v.canEdit, false)
		}
	})

	test('a key in the view but blank, or not in it: Nothing written yet', () => {
		for (const key of ['acme.dice.blank', 'acme.dice.score', 'nobody.score']) {
			const v = view({ key })
			assert.equal(v.state, 'unwritten', key)
			assert.equal(v.empty, 'Nothing written yet')
		}
	})

	test("the host's see verdict: You can't see this", () => {
		const hidden = view({
			key: 'core.castellan-scratchpad',
			fields: [{ owner: 'core', key: 'castellan-scratchpad', canSee: false }],
		})
		assert.equal(hidden.state, 'hidden')
		assert.equal(hidden.empty, "You can't see this")
		assert.equal(hidden.title, 'castellan-scratchpad', 'no label known: the key')
		// Without it, absent reads as unwritten: an unseen key is absent from the view exactly so.
		assert.equal(view({ key: 'core.castellan-scratchpad' }).state, 'unwritten')
		// A value in the view was seen, whatever else is said.
		assert.equal(
			view({
				key: 'acme.dice.notes',
				fields: [{ owner: 'acme.dice', key: 'notes', canSee: false }],
			}).state,
			'value',
		)
	})

	test("titled by the listing's label, else by the key", () => {
		const fields = annexWidgetFieldsFrom({
			widget: { primary: [fieldAction('acme.dice', 'notes', 'Table notes')], overflow: [] },
		})
		assert.equal(view({ key: 'acme.dice.notes', fields }).title, 'Table notes')
		assert.equal(view({ key: 'acme.dice.last-roll', fields }).title, 'last-roll')
		assert.equal(
			view({
				key: 'acme.dice.notes',
				fields: [
					{
						owner: 'acme.dice',
						key: 'notes',
						label: { en: 'Notes', fr: 'Notes de table' },
					},
				],
				locale: 'fr',
			}).title,
			'Notes de table',
		)
	})

	test('text is prose, its line breaks kept', () => {
		const v = view({ key: 'acme.dice.notes' })
		assert.equal(v.state, 'value')
		if (v.state !== 'value') return
		assert.equal(v.shape, 'text')
		assert.deepEqual(v.drawn, { as: 'prose', text: 'Rolled twice.\nThe second was a 20.' })
		assert.equal(v.identity, 'acme.dice:annex#notes')
	})

	test('a number, a switch and a choice are one label/value row', () => {
		const number = view({ key: 'acme.dice.last-roll' })
		assert.equal(number.state === 'value' && number.shape, 'integer')
		assert.deepEqual(number.state === 'value' && number.drawn, {
			as: 'rows',
			rows: [{ key: 'last-roll', label: 'last-roll', text: '17' }],
		})
		const lucky = view({ key: 'acme.dice.lucky' })
		assert.deepEqual(lucky.state === 'value' && lucky.drawn, {
			as: 'rows',
			rows: [{ key: 'lucky', label: 'lucky', text: 'Yes' }],
		})
		const mood = view({
			key: 'acme.dice.mood',
			fields: [
				{
					owner: 'acme.dice',
					key: 'mood',
					label: 'Mood',
					shape: {
						type: 'enum',
						of: ['calm', 'very-calm'],
						members: [{ key: 'calm', label: 'Calm' }],
					},
				},
			],
		})
		assert.equal(mood.state === 'value' && mood.shape, 'enum')
		// A member with no label reads as its value humanised, never raw.
		assert.deepEqual(mood.state === 'value' && mood.drawn, {
			as: 'rows',
			rows: [{ key: 'mood', label: 'Mood', text: 'Very calm' }],
		})
	})

	test('a list is chips', () => {
		const v = view({ key: 'acme.dice.tags' })
		assert.equal(v.state === 'value' && v.shape, 'list')
		assert.deepEqual(v.state === 'value' && v.drawn, { as: 'chips', chips: ['brave', 'tired'] })
	})

	test('an object is a row per member: declared members first, by their labels', () => {
		const undeclared = view({ key: 'acme.dice.sheet' })
		assert.deepEqual(undeclared.state === 'value' && undeclared.drawn, {
			as: 'rows',
			rows: [
				{ key: 'hp', label: 'Hp', text: '7' },
				{ key: 'name', label: 'Name', text: 'Bram' },
			],
		})
		const declared = view({
			key: 'acme.dice.sheet',
			fields: [
				{
					owner: 'acme.dice',
					key: 'sheet',
					shape: {
						type: 'object',
						fields: {
							name: { type: 'string', label: 'Name' },
							hp: { type: 'integer', label: 'Hit points' },
						},
					},
				},
			],
		})
		assert.deepEqual(declared.state === 'value' && declared.drawn, {
			as: 'rows',
			rows: [
				{ key: 'name', label: 'Name', text: 'Bram' },
				{ key: 'hp', label: 'Hit points', text: '7' },
			],
		})
	})

	test("Edit: a text field the host lists as the viewer's to set, never a guest's, never a non-text one", () => {
		const fields = annexWidgetFieldsFrom({
			widget: {
				primary: [
					fieldAction('acme.dice', 'notes', 'Table notes'),
					fieldAction('acme.dice', 'last-roll', 'Last roll'),
					fieldAction('acme.dice', 'tags', 'Tags', { canAct: false }),
				],
				overflow: [],
			},
		})
		const notes = view({ key: 'acme.dice.notes', fields })
		assert.equal(notes.canEdit, true)
		assert.equal(notes.draft, 'Rolled twice.\nThe second was a 20.')
		assert.equal(view({ key: 'acme.dice.notes', fields, viewer: GUEST }).canEdit, false)
		assert.equal(
			view({ key: 'acme.dice.notes' }).canEdit,
			false,
			'not listed: nobody may set it',
		)
		assert.equal(
			view({ key: 'acme.dice.last-roll', fields }).canEdit,
			false,
			'a number is not edited as text',
		)
		assert.equal(view({ key: 'acme.dice.tags', fields }).canEdit, false)
		// Nothing written, shape unknown: no Edit — the door would hold a guess to a shape it cannot see.
		assert.equal(
			view({
				key: 'acme.dice.score',
				fields: [{ owner: 'acme.dice', key: 'score', canAct: true }],
			}).canEdit,
			false,
		)
		// Declared text, nothing written: the first value may be written here.
		const first = view({
			key: 'acme.dice.score',
			fields: [{ owner: 'acme.dice', key: 'score', canAct: true, shape: { type: 'text' } }],
		})
		assert.equal(first.state, 'unwritten')
		assert.equal(first.canEdit, true)
		assert.equal(first.identity, 'acme.dice:annex#score')
	})
})
