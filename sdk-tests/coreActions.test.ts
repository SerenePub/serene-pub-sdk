/**
 * The plain-TypeScript half of core's Actions widget
 * (`@serene-pub/core-catalog/actions`, PLAN-core-widgets W8): its
 * declaration, its settings, the grouping of the session's listed actions —
 * turn controls, the genre's own, the added ones — and the verdict each
 * button reads, which is the composer's chips' (`paletteRowState`).
 */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { ActionsV1, WidgetAction } from '@serene-pub/sdk'
import {
	ACTIONS_DEFAULTS,
	ACTIONS_GROUP_ORDER,
	actionsGroupOf,
	actionsView,
	actionsGroups,
	readActionsSettings,
} from '../core-catalog/src/shared/ui/actions/index.js'
import { CORE_COMPONENTS, CORE_WIDGETS, coreWidgets } from '../core-catalog/src/index.js'

const en = (s: string) => s

const act = (over: Partial<WidgetAction> & Pick<WidgetAction, 'key' | 'venue'>): WidgetAction => ({
	specSlug: 'core',
	name: over.key,
	slash: over.key,
	quick: true,
	audience: { see: ['participant'], act: ['participant'] },
	origin: 'core',
	floor: false,
	canAct: true,
	itemGated: false,
	isNew: false,
	enabled: true,
	...over,
})

const ADVANCE = act({
	key: 'advance',
	venue: 'extra',
	name: 'Continue',
	icon: 'message-square-more',
})
const PICK = act({
	key: 'pick',
	venue: 'extra',
	name: 'Pick who speaks',
	icon: 'message-square-plus',
})
const NUDGE = act({
	key: 'nudge',
	specSlug: 'core:spec/lair-nudge',
	origin: 'companion',
	venue: 'composer',
	name: 'Nudge',
	description: 'Tell the narrator what you want next.',
})
const ROLL = act({
	key: 'roll',
	specSlug: 'acme:spec/dice',
	origin: 'foreign',
	venue: 'composer',
	name: 'Roll',
	icon: 'dice-5',
	isNew: true,
})
const EDIT = act({ key: 'edit', venue: 'message', name: 'Edit' })

const venues = (
	v: Partial<
		Record<string, WidgetAction[] | { primary: WidgetAction[]; overflow: WidgetAction[] }>
	>,
): ActionsV1 =>
	Object.fromEntries(
		Object.entries(v).map(([k, list]) => [
			k,
			Array.isArray(list) ? { primary: list, overflow: [] } : list!,
		]),
	)

describe('the declaration', () => {
	test('actions: one per layout, every genre, no scopes, the three sections it reads', () => {
		const decl = CORE_WIDGETS.find((w) => w.id === 'actions')!
		assert.ok(decl)
		assert.equal(coreWidgets.actions, decl)
		assert.equal(decl.title, 'Actions')
		assert.equal(decl.icon, 'MousePointerClick')
		assert.equal(decl.maxInstances, 1)
		assert.equal(decl.genres, undefined)
		assert.equal(decl.scopes, undefined)
		assert.deepEqual(decl.reads, ['actions', 'settings', 'locale'])
		assert.deepEqual(decl.layout, { span: { ideal: 1 }, minInline: 220 })
		assert.ok(
			CORE_COMPONENTS.some(
				(c) => c.slug === 'actions' && c.entry === 'components/shared/actions/actions.ts',
			),
		)
	})

	test("the declared defaults and choices are the reader's", () => {
		const decl = CORE_WIDGETS.find((w) => w.id === 'actions')!
		const s = decl.settings as Record<
			string,
			{ default: unknown; group?: string; of?: string[] }
		>
		assert.deepEqual(ACTIONS_DEFAULTS, {
			groups: s.groups!.default,
			size: s.size!.default,
			showWaiting: s.showWaiting!.default,
		})
		assert.deepEqual(s.groups!.of, ['all', ...ACTIONS_GROUP_ORDER])
		assert.deepEqual(s.size!.of, ['compact', 'large'])
		assert.equal(s.showWaiting!.group, undefined, 'a section of one field is no section')
		assert.deepEqual(readActionsSettings(undefined), ACTIONS_DEFAULTS)
		assert.deepEqual(
			readActionsSettings({ groups: 'scripts', size: 'huge', showWaiting: 'no' }),
			ACTIONS_DEFAULTS,
		)
		assert.deepEqual(
			readActionsSettings({ groups: 'turn', size: 'large', showWaiting: false }),
			{
				groups: 'turn',
				size: 'large',
				showWaiting: false,
			},
		)
	})
})

describe('grouping', () => {
	test('each action by the fields it carries: added before venue, extra is turn, composer is genre', () => {
		assert.equal(actionsGroupOf(ADVANCE), 'turn')
		assert.equal(actionsGroupOf(NUDGE), 'genre')
		assert.equal(actionsGroupOf(ROLL), 'foreign')
		assert.equal(actionsGroupOf({ ...ROLL, venue: 'extra' }), 'foreign')
		assert.equal(actionsGroupOf(EDIT), null)
		assert.equal(actionsGroupOf({ ...NUDGE, venue: 'widget' }), null)
	})

	test('turn controls first, then the genre, then the added — whatever order the listing gave', () => {
		const groups = actionsGroups(
			venues({ composer: [ROLL, NUDGE], extra: [ADVANCE, PICK], message: [EDIT] }),
		)
		assert.deepEqual(
			groups.map((g) => [g.key, g.actions.map((a) => a.key)]),
			[
				['turn', ['advance', 'pick']],
				['genre', ['nudge']],
				['foreign', ['roll']],
			],
		)
	})

	test('each action once: the primary set, then what the overflow adds', () => {
		const groups = actionsGroups(
			venues({ extra: { primary: [ADVANCE], overflow: [ADVANCE, PICK] }, composer: [] }),
		)
		assert.deepEqual(
			groups.map((g) => [g.key, g.actions.map((a) => a.key)]),
			[['turn', ['advance', 'pick']]],
		)
	})

	test('one group alone, and none with nothing in it', () => {
		const all = venues({ composer: [ROLL, NUDGE], extra: [ADVANCE] })
		assert.deepEqual(
			actionsGroups(all, 'turn').map((g) => g.key),
			['turn'],
		)
		assert.deepEqual(
			actionsGroups(all, 'foreign').map((g) => g.key),
			['foreign'],
		)
		assert.deepEqual(actionsGroups(venues({ extra: [ADVANCE] }), 'genre'), [])
		assert.deepEqual(actionsGroups(undefined), [])
	})
})

describe('the view', () => {
	const view = (actions: ActionsV1, over: Partial<Parameters<typeof actionsView>[0]> = {}) =>
		actionsView({ actions, settings: ACTIONS_DEFAULTS, locale: 'en', t: en, ...over })

	test('a button per action, with its icon, its name, and what it does as its title', () => {
		const v = view(venues({ composer: [NUDGE], extra: [ADVANCE] }))
		assert.deepEqual(
			v.groups.map((g) => g.title),
			['Turn controls', 'Genre actions'],
		)
		const [cont] = v.groups[0]!.buttons
		assert.deepEqual(
			{
				identity: cont!.identity,
				icon: cont!.icon,
				disabled: cont!.disabled,
				reason: cont!.reason,
				title: cont!.title,
			},
			{
				identity: 'core#advance',
				icon: 'message-square-more',
				disabled: false,
				reason: null,
				title: 'Continue',
			},
		)
		const [nudge] = v.groups[1]!.buttons
		assert.equal(nudge!.identity, 'core:spec/lair-nudge#nudge')
		assert.equal(nudge!.icon, 'play', "the overflow's icon where none is declared")
		assert.equal(nudge!.title, 'Nudge — Tell the narrator what you want next.')
		assert.equal(v.empty, null)
	})

	test("greyed with the chips' reason: the audience's sentence, then the enabled-when's in the viewer's language", () => {
		const notYours = {
			...ROLL,
			canAct: false,
			audience: { see: ['participant'], act: ['owner'] },
		}
		const waits = act({
			key: 'survey',
			specSlug: 'core:spec/story-survey',
			origin: 'companion',
			venue: 'composer',
			name: 'Survey',
			enabled: false,
			reason: { i18n: { en: 'set a location first', es: 'primero elige un lugar' } },
		})
		const v = view(venues({ composer: [waits, notYours] }), { locale: 'es' })
		const [survey] = v.groups.find((g) => g.key === 'genre')!.buttons
		assert.equal(survey!.disabled, true)
		assert.equal(survey!.reason, 'primero elige un lugar')
		assert.equal(survey!.title, 'Survey — primero elige un lugar')
		const [roll] = v.groups.find((g) => g.key === 'foreign')!.buttons
		assert.equal(roll!.disabled, true)
		assert.equal(roll!.reason, "'Roll' is not yours to use here — its audience is owner.")
		// A grey the listing gave no sentence for still says so.
		const bare = view(venues({ extra: [{ ...PICK, enabled: false }] }))
		assert.equal(bare.groups[0]!.buttons[0]!.reason, 'not available right now')
	})

	test('the newcomers it draws are the ones it says it has met', () => {
		const v = view(venues({ composer: [ROLL, NUDGE] }))
		assert.deepEqual(v.fresh, ['acme:spec/dice#roll'])
		assert.equal(v.groups.find((g) => g.key === 'foreign')!.buttons[0]!.isNew, true)
		assert.deepEqual(
			view(venues({ composer: [ROLL] }), {
				settings: { ...ACTIONS_DEFAULTS, groups: 'turn' },
			}).fresh,
			[],
		)
	})

	test('nothing to draw says so, for the session or for the one group chosen', () => {
		assert.equal(view(venues({})).empty, 'This session offers no actions here.')
		assert.equal(
			view(venues({ composer: [NUDGE] }), {
				settings: { ...ACTIONS_DEFAULTS, groups: 'turn' },
			}).empty,
			'This session offers none of these actions here.',
		)
	})
})
