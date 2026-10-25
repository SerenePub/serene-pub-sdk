/**
 * 🚧 Stats on a ruleset's sheet (DC walk 5, 2026-10-17): a list stat that
 * holds pieces (`config.repertoire`) draws a card per piece — its name from
 * the library row, never the row id, its key facts, description and traits —
 * never `[object Object]`; a reference's form says how many and overrides the
 * row for this holder only; another player's sheet is read-only; `owners:
 * mine` draws the viewer's own seat; and ids read as their labels.
 *
 * Mounted from source: the component's `session-state` import is aliased to
 * the module's source, so the suite needs no rebuild of the catalogue.
 *
 * The widget carries no compendium (§8): the host fills a reference's
 * `resolved` and the owner row's `repertoires`. `hostRead` below plays the
 * host, from core's ruleset declaration, as `src/lib/server/rulesets/read.ts`
 * does in the app.
 */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { i18nText, type SessionStateRepertoireV1, type SessionStateV1, type SlotPiece } from '@serene-pub/sdk'
import { visItinerisRuleset } from '../core-catalog/src/registry/rulesets.js'
// 🚧 Its repertoires are entry types in the sections since 2026-10-23; the parts are read as the host reads a repertoire.
import { VIS_ITINERIS_REPERTOIRES } from '../core-catalog/src/rulesets/vis-itineris/repertoires.js'
import { mountComponent, type MountedComponent } from '../cli/src/testing.js'
import {
	formatSlotValue,
	giveTargets,
	labelOf,
	listItemText,
	mineOf,
	offersOf,
	pieceContextOf,
	pieceFacts,
	pieceFromDraft,
	pieceView,
	rulesetLabelOf,
	statsView,
} from '../core-catalog/src/shared/ui/session-state/index.js'

const CORE_CATALOG = resolve(import.meta.dirname, '..', 'core-catalog')
const SESSION_STATE_SOURCE = resolve(CORE_CATALOG, 'src', 'shared', 'ui', 'session-state', 'index.ts')
const VIS = 'core:ruleset/vis-itineris@1'
const WEAPONS = `${VIS}#weapons`
const FEATURES = `${VIS}#features`

const longsword = { kind: 'compendium', compendiumId: VIS, pieceId: 'longsword', version: '1.0.0' } as const
const potion = { kind: 'compendium', compendiumId: VIS, pieceId: 'potion-of-healing', version: '1.0.0', count: 2 } as const
const secondWind = {
	kind: 'inline',
	name: 'Second wind',
	description: 'Catch your breath and get back up.',
	source: 'class',
	usesMax: 1,
	usesSpent: 0,
	traits: ['fighter'],
} as const
const oldSword = { kind: 'lore', entryId: 7, count: 3, name: 'Grandfather’s sword' } as const

/** The host's side (§8): a repertoire's name and piece shape, by address. */
const REPERTOIRES: Record<string, SessionStateRepertoireV1> = Object.fromEntries(
	VIS_ITINERIS_REPERTOIRES.map((r) => [`${VIS}#${r.id}`, { label: i18nText(r.label) ?? r.id, piece: r.piece }]),
)
/** The host's side (§8): a compendium reference with its row read into `resolved`. */
function hostRead<P extends SlotPiece>(piece: P, repertoireId: string): P {
	if (piece.kind !== 'compendium') return piece
	const row = visItinerisRuleset.library?.rows?.[repertoireId]?.find((r) => r.id === piece.pieceId)
	if (!row) return piece
	// A row's piece is nested (2026-10-17); its bookkeeping stays outside.
	const props = row.piece as Record<string, unknown>
	const shape = VIS_ITINERIS_REPERTOIRES.find((r) => r.id === repertoireId)?.piece
	return {
		...piece,
		resolved: {
			name: String(props.name),
			...(typeof props.description === 'string' ? { description: props.description } : {}),
			...(Array.isArray(props.traits) ? { traits: props.traits as string[] } : {}),
			keyProps: pieceFacts(props, shape).map((f) => ({ key: f.key, label: f.label, value: f.text })),
			compendiumName: i18nText(visItinerisRuleset.name),
		},
	}
}
const ctxOf = (address: string) => pieceContextOf({ repertoire: address }, REPERTOIRES)

const id = (key: string) => `core:slot/${key}@1`
const slot = (key: string, extra: Record<string, unknown> = {}) => ({
	slotId: id(key),
	key,
	qualifiedKey: `core.${key}`,
	label: key[0]!.toUpperCase() + key.slice(1),
	type: 'list',
	appliesTo: ['cast'],
	...extra,
})

/** A Dungeon Crawler sheet: two seats, each with weapons and features; old string rows beside them. */
const sheet = (
	over: { annMine?: boolean; strangerMine?: boolean; strangerEditable?: boolean; offers?: SessionStateV1['offers'] } = {},
): SessionStateV1 =>
	({
		sessionId: 1,
		loaded: true,
		error: null,
		resolved: {
			world: {},
			cast: {
				'player_seat:1': {
					'core.weapons': [hostRead(longsword, 'weapons'), oldSword],
					'core.features': [secondWind],
					'core.consumables': [hostRead(potion, 'consumables')],
				},
				'player_seat:2': { 'core.weapons': [hostRead({ ...longsword, pieceId: 'dagger' }, 'weapons')] },
			},
		},
		slots: [
			slot('abilities'),
			slot('inventory', { retired: true }),
			slot('weapons', { label: 'Weapons' }),
			slot('features', { label: 'Features' }),
			slot('consumables', { label: 'Consumables' }),
		],
		owners: [
			{ key: 'world', kind: 'session', id: 1, label: 'World', configs: {} },
			{
				key: 'player_seat:1',
				kind: 'player_seat',
				id: 1,
				label: 'Ann',
				seat: true,
				...(over.annMine ? { mine: true } : {}),
				configs: {
					[id('abilities')]: {},
					[id('inventory')]: {},
					[id('weapons')]: { repertoire: WEAPONS },
					[id('features')]: { repertoire: FEATURES },
					[id('consumables')]: { repertoire: `${VIS}#consumables` },
				},
				repertoires: REPERTOIRES,
			},
			{
				key: 'player_seat:2',
				kind: 'player_seat',
				id: 2,
				label: 'Stranger',
				seat: true,
				...(over.strangerMine ? { mine: true } : {}),
				...(over.strangerEditable === false ? { editable: false } : {}),
				configs: { [id('weapons')]: { repertoire: WEAPONS }, [id('consumables')]: { repertoire: `${VIS}#consumables` } },
				repertoires: { [WEAPONS]: REPERTOIRES[WEAPONS], [`${VIS}#consumables`]: REPERTOIRES[`${VIS}#consumables`] },
			},
			// 🚧 A companion: a cast member nobody plays (★4) — never a gift's target from a seat.
			{
				key: 'tamsin',
				kind: 'session_cast',
				id: 9,
				label: 'Brother Tamsin',
				configs: { [id('consumables')]: { repertoire: `${VIS}#consumables` } },
			},
		],
		...(over.offers ? { offers: over.offers } : {}),
	}) as unknown as SessionStateV1

async function mount(state: SessionStateV1, settings: Record<string, unknown> = {}): Promise<MountedComponent> {
	return mountComponent({
		root: CORE_CATALOG,
		entry: 'components/shared/stats/stats.ts',
		alias: { '@serene-pub/core-catalog/session-state': SESSION_STATE_SOURCE },
		owner: 'core',
		timeoutMs: 60_000,
		context: {
			session: { id: 1, name: 'Drowned King' },
			settings: { trail: false, ...settings },
			viewer: { userId: 2, isAdmin: false, isGuest: true },
			scoped: { session_state: state },
		},
	} as never)
}

const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim()

describe('pieces, read (session-state)', () => {
	test('a library reference reads by its row: name, facts, traits, where from', () => {
		const v = pieceView(hostRead(longsword, 'weapons'), ctxOf(WEAPONS))
		assert.equal(v.name, 'Longsword')
		assert.equal(v.from, 'From the Vis Itineris library')
		assert.deepEqual(
			v.facts.map((f) => [f.label, f.text]),
			[
				['Training needed', 'Martial'],
				// `damageType` is its own field since 2026-10-17 (audit D) and folds
				// into the damage fact's words on the sheet (PLAN-sheet-widget §3).
				['Damage', '1d8 slashing'],
				['Two-handed damage', 'd10'],
				['Hands', '1'],
			],
		)
		// A trait never repeats a field: versatile is the two-handed die.
		assert.ok(!v.traits.includes('Versatile'))
		assert.ok(v.traits.length >= 1)
		assert.equal(v.unresolved, false)
	})

	test('an inline piece reads its own fields; uses read as what is left', () => {
		const v = pieceView(secondWind as never, ctxOf(FEATURES))
		assert.equal(v.name, 'Second wind')
		assert.equal(v.from, null)
		assert.deepEqual(
			v.facts.map((f) => [f.label, f.text]),
			[
				['From', 'Class'],
				['Uses', '1/1'],
			],
		)
		assert.deepEqual(v.traits, ['Fighter'])
	})

	test('a lore piece reads by its filled title and count; one with none by its entry', () => {
		assert.equal(listItemText(oldSword as never), 'Grandfather’s sword ×3')
		assert.equal(pieceView({ kind: 'lore', entryId: 4 }).name, 'Lore entry 4')
		assert.equal(pieceView(oldSword as never).from, 'From the lorebook')
	})

	test('a list of pieces is never [object Object], nor a raw row id', () => {
		assert.equal(formatSlotValue([hostRead(longsword, 'weapons'), hostRead(potion, 'consumables')]), 'Longsword, Potion of healing ×2')
		// A row the host could not read still reads as words, never its id.
		assert.equal(formatSlotValue([{ ...longsword, pieceId: 'vorpal-blade' }]), 'Vorpal blade')
		assert.equal(pieceView({ ...longsword, pieceId: 'vorpal-blade' }).unresolved, true)
	})

	test("a reference's form stores only what differs from its row, and its count", () => {
		const ctx = ctxOf(WEAPONS)
		const read = hostRead(longsword, 'weapons')
		const kept = pieceFromDraft(read, { name: 'Longsword', description: 'A straight blade for one hand or two.' }, 2, ctx)
		assert.deepEqual(kept, { piece: { ...longsword, count: 2 }, refusal: null })
		const renamed = pieceFromDraft(read, { name: 'Oathblade' }, 1, ctx)
		assert.deepEqual(renamed.piece, { ...longsword, overrides: { name: 'Oathblade' } })
		// The override is drawn over the host's reading; the facts stay the row's.
		assert.equal(pieceView({ ...read, overrides: { name: 'Oathblade' } }, ctx).name, 'Oathblade')
		const bad = pieceFromDraft(read, {}, 0, ctx)
		assert.equal(bad.piece, null)
		assert.match(bad.refusal!, /whole number/)
	})

	test('an inline form is checked as the write gate would', () => {
		const ctx = ctxOf(FEATURES)
		const refused = pieceFromDraft(secondWind as never, { name: 'Second wind', description: 'x', source: '' }, 1, ctx)
		assert.equal(refused.piece, null, 'a feature names where it is from')
		const ok = pieceFromDraft(secondWind as never, { name: 'Second wind', description: 'x', source: 'class', usesMax: '2', traits: 'fighter, healing' }, 1, ctx)
		assert.deepEqual(ok.piece, { kind: 'inline', name: 'Second wind', description: 'x', source: 'class', usesMax: 2, traits: ['fighter', 'healing'] })
	})
})

describe('labels for ids (session-state)', () => {
	test('selectors and stats read as words', () => {
		assert.deepEqual(
			['attack.melee', 'skill.athletics', 'strength-mod', 'save.wisdom', 'armour-class'].map((s) => rulesetLabelOf(VIS, s)),
			['Melee attack', 'Athletics', 'Strength modifier', 'Wisdom save', 'Armour class'],
		)
		// A stat selector reads as its stat's label.
		assert.equal(rulesetLabelOf(VIS, 'level'), 'Level')
		// A declared label wins.
		assert.equal(labelOf('attack.melee', { 'attack.melee': { label: { en: 'Strike' } } }), 'Strike')
	})
})

describe("Stats' `owners: mine` (session-state)", () => {
	test('the seat the host marks mine, else the first in play', () => {
		const settings = { owners: 'mine', castScope: 'all' }
		const shownLabel = (s: SessionStateV1) => {
			const v = statsView(s, settings)
			return v.status === 'shown' ? v.groups.flatMap((g) => g.owners.map((o) => o.owner.label)) : v.status
		}
		assert.deepEqual(shownLabel(sheet({ strangerMine: true })), ['Stranger'])
		assert.deepEqual(shownLabel(sheet({ annMine: true })), ['Ann'])
		assert.deepEqual(shownLabel(sheet()), ['Ann'], 'no mark: the first cast member in play')
		assert.equal(mineOf(sheet({ strangerMine: true }))?.label, 'Stranger')
	})

	test('a retired stat with nothing in it is not drawn; `hideSlots` leaves out the named', () => {
		const v = statsView(sheet({ annMine: true }), { owners: 'mine', hideSlots: ['abilities'] })
		assert.equal(v.status, 'shown')
		const keys = v.status === 'shown' ? v.groups[0]!.owners[0]!.slots.map((s) => s.slot.key) : []
		assert.deepEqual(keys, ['weapons', 'features', 'consumables'])
	})

	test('🚧 a stat drawn only while it holds something: absent between dyings, drawn while somebody lies dying (Q3-8)', () => {
		const base = sheet({ annMine: true })
		const tally = slot('crawl-death-saves', { type: 'text', label: 'Death saves', shownWhenSet: true })
		const withTally = (value: unknown): SessionStateV1 =>
			({
				...base,
				slots: [...base.slots, tally],
				owners: base.owners.map((o) => (o.key === 'player_seat:1' ? { ...o, configs: { ...o.configs, [id('crawl-death-saves')]: {} } } : o)),
				resolved: {
					...base.resolved,
					cast: {
						...base.resolved.cast,
						'player_seat:1': { ...base.resolved.cast['player_seat:1'], ...(value === undefined ? {} : { 'core.crawl-death-saves': value }) },
					},
				},
			}) as SessionStateV1
		const keysOf = (st: SessionStateV1) => {
			const v = statsView(st, { owners: 'mine' })
			return v.status === 'shown' ? v.groups[0]!.owners[0]!.slots.map((s) => s.slot.key) : []
		}
		assert.ok(!keysOf(withTally(undefined)).includes('crawl-death-saves'))
		assert.ok(!keysOf(withTally('')).includes('crawl-death-saves'))
		assert.ok(keysOf(withTally('1 pass, 0 failures')).includes('crawl-death-saves'))
	})
})

describe('Give to… (session-state, owner ruling ★4)', () => {
	test("a player's character gives to another player's seat — an offer where the viewer may not write it — never to a companion", () => {
		const state = sheet({ annMine: true, strangerEditable: false })
		const ann = state.owners.find((o) => o.key === 'player_seat:1')!
		const targets = giveTargets(state, ann, id('consumables'))
		assert.deepEqual(
			targets.map((t) => [t.owner.label, t.direct, t.place]),
			[['Stranger', false, false]],
		)
		// From a sheet the viewer may not change, nothing is offered at all.
		const stranger = state.owners.find((o) => o.key === 'player_seat:2')!
		assert.deepEqual(giveTargets(state, stranger, id('consumables')), [])
		// The session's owner, writing every sheet, gives at once.
		const owned = sheet({ annMine: true })
		assert.deepEqual(
			giveTargets(owned, owned.owners.find((o) => o.key === 'player_seat:1')!, id('consumables')).map((t) => [t.owner.label, t.direct]),
			[['Stranger', true]],
		)
	})

	test('offers are read per sheet: offered to it, and offered from it', () => {
		const offer = {
			proposalId: 4,
			slotId: id('consumables'),
			from: { kind: 'player_seat' as const, id: 2, key: 'player_seat:2', label: 'Stranger' },
			to: { kind: 'player_seat' as const, id: 1, key: 'player_seat:1', label: 'Ann' },
			item: 'Potion of healing',
			count: 1,
		}
		const state = sheet({ annMine: true, offers: [offer] })
		const ann = state.owners.find((o) => o.key === 'player_seat:1')!
		const stranger = state.owners.find((o) => o.key === 'player_seat:2')!
		assert.deepEqual(offersOf(state, ann), { incoming: [offer], outgoing: [] })
		assert.deepEqual(offersOf(state, stranger), { incoming: [], outgoing: [offer] })
	})
})

describe("core's Stats component on a ruleset's sheet", { timeout: 180_000 }, () => {
	test('pieces are cards, by name, with facts and tags — and a guest sees their own seat', async () => {
		const view = await mount(sheet({ strangerMine: true, strangerEditable: false }), { owners: 'mine' })
		try {
			assert.deepEqual(view.refused, [])
			const cards = view.queryAll('[data-widget-part~="stats.card"]')
			assert.deepEqual(cards.map((c) => c.getAttribute('aria-label')), ['Stranger'])
			assert.doesNotMatch(text(view.query('[data-widget-part~="stats.root"]')) ?? '', /object Object/)
			// A piece is one row (PLAN-sheet-widget §3); its details open in a popout.
			const piece = view.query('[data-widget-part~="piece-card.row"]')!
			assert.equal(text(piece.querySelector('[data-widget-part~="piece-card.name"]')), 'Dagger')
			// Not the viewer's to write: no edit, no remove, no add.
			assert.equal(view.queryAll('[data-widget-part~="piece-card.edit"]').length, 0)
			assert.equal(view.queryAll('[data-widget-part~="piece-card.add"]').length, 0)
		} finally {
			await view.unmount()
		}
	})

	test("the host's own sheet: inline, lore and library pieces; a reference's count is edited", async () => {
		const view = await mount(sheet({ annMine: true }), { owners: 'mine', hideSlots: ['abilities'] })
		try {
			assert.deepEqual(view.refused, [])
			const forms = view.queryAll('[data-widget-part~="piece-card.row"]').map((c) => [
				c.getAttribute('data-piece-form'),
				text(c.querySelector('[data-widget-part~="piece-card.name"]')),
				text(c.querySelector('[data-widget-part~="piece-card.count"]')) ?? null,
			])
			assert.deepEqual(forms, [
				['compendium', 'Longsword', null],
				['lore', 'Grandfather’s sword', '×3'],
				['inline', 'Second wind', null],
				['compendium', 'Potion of healing', '×2'],
			])
			// The old rows are gone: abilities by `hideSlots`, the retired empty inventory always.
			// (never hand a DOM node to an assertion: a failing one serialises the document)
			assert.equal(view.query(`[data-slot-id="${id('abilities')}"]`) === null, true)
			assert.equal(view.query(`[data-slot-id="${id('inventory')}"]`) === null, true)
			// The sword's details: its popout, opened the way the trail's is.
			const weapons = `[data-slot-id="${id('weapons')}"]`
			await view.dispatch(`${weapons} [data-widget-part~="piece-card.detail"]`, 'open-change', { open: true })
			const sword = view.query(`${weapons} [data-widget-part~="piece-card.detail-panel"]`)!
			assert.deepEqual(
				[...sword.querySelectorAll('[data-widget-part~="piece-card.fact"]')].map((f) => f.getAttribute('data-field')),
				// `damageType` folds into the damage fact (§3).
				['category', 'damage', 'versatileDie', 'hands'],
			)
			assert.ok(sword.querySelectorAll('[data-widget-part~="piece-card.trait"]').length >= 1)

			// Edit the library sword: two held, the row untouched.
			await view.click(sword.querySelector('[data-widget-part~="piece-card.edit"]')!)
			await view.input('[data-widget-part~="piece-card.form"] [data-field="count"] input', '2')
			await view.click(view.query('[data-widget-part~="piece-card.save"]')!)
			const write = view.requested.find((r) => r.kind === 'set-attribute-value')!
			assert.deepEqual(write.params, {
				owner: { kind: 'player_seat', id: 1 },
				slotId: id('weapons'),
				// The lore piece's filled title never rides back.
				value: [{ ...longsword, count: 2 }, { kind: 'lore', entryId: 7, count: 3 }],
			})
		} finally {
			await view.unmount()
		}
	})

	test('an inline piece edits through its generated form; a refusal is said', async () => {
		const view = await mount(sheet({ annMine: true }), { owners: 'mine' })
		try {
			const features = `[data-slot-id="${id('features')}"]`
			await view.dispatch(`${features} [data-widget-part~="piece-card.detail"]`, 'open-change', { open: true })
			const wind = view.query(`${features} [data-widget-part~="piece-card.detail-panel"]`)!
			await view.click(wind.querySelector('[data-widget-part~="piece-card.edit"]')!)
			const form = `[data-slot-id="${id('features')}"] [data-widget-part~="piece-card.form"]`
			// The form is the piece shape: the universal parts, then the feature's own.
			const fields = view.queryAll(`${form} [data-field]`).map((f) => f.getAttribute('data-field'))
			for (const k of ['name', 'description', 'traits', 'source', 'usesMax', 'usesSpent', 'recharge']) assert.ok(fields.includes(k), k)
			await view.input(`${form} [data-field="name"] input`, '')
			await view.click(view.query(`${form} [data-widget-part~="piece-card.save"]`)!)
			assert.ok(text(view.query(`${form} [role="alert"]`)), 'a nameless piece is refused, in words')
			assert.equal(view.requested.length, 0)
			await view.input(`${form} [data-field="name"] input`, 'Second breath')
			await view.input(`${form} [data-field="usesSpent"] input`, '1')
			await view.click(view.query(`${form} [data-widget-part~="piece-card.save"]`)!)
			assert.deepEqual(view.requested.at(-1)!.params.value, [{ ...secondWind, name: 'Second breath', usesSpent: 1 }])
		} finally {
			await view.unmount()
		}
	})

	test('Give to… a stack: how many, then the seat — ONE give-piece request; never to a companion', async () => {
		const view = await mount(sheet({ annMine: true, strangerEditable: false }), { owners: 'mine' })
		try {
			const consumables = `[data-slot-id="${id('consumables')}"]`
			await view.dispatch(`${consumables} [data-widget-part~="piece-card.detail"]`, 'open-change', { open: true })
			const panel = `${consumables} [data-widget-part~="piece-card.detail-panel"]`
			const targets = view.queryAll(`${panel} [data-widget-part~="piece-card.give-target"]`).map((t) => [
				t.getAttribute('data-owner-key'),
				t.getAttribute('data-give'),
				text(t),
			])
			assert.deepEqual(targets, [['player_seat:2', 'offer', 'Offer to Stranger']])
			assert.ok(view.query(`${panel} [data-widget-part~="piece-card.give-count"] input`), 'a stack asks how many')
			await view.input(`${panel} [data-widget-part~="piece-card.give-count"] input`, '1')
			await view.dispatch(`${panel} [data-widget-part~="piece-card.give"]`, 'select', { value: 'give:player_seat:2' })
			const asked = view.requested.find((r) => r.kind === 'give-piece')
			assert.ok(asked, 'give-piece was asked')
			assert.deepEqual(asked!.params, {
				from: { kind: 'player_seat', id: 1 },
				to: { kind: 'player_seat', id: 2 },
				slotId: id('consumables'),
				index: 0,
				count: 1,
			})
		} finally {
			await view.unmount()
		}
	})

	test('an offer on the sheet: Accept and Decline for its receiver, Withdraw for its giver', async () => {
		const offer = (yours?: boolean) => ({
			proposalId: 4,
			slotId: id('consumables'),
			from: { kind: 'player_seat' as const, id: 2, key: 'player_seat:2', label: 'Stranger' },
			to: { kind: 'player_seat' as const, id: 1, key: 'player_seat:1', label: 'Ann' },
			item: 'Potion of healing',
			count: 2,
			...(yours ? { yours: true } : {}),
		})
		const view = await mount(sheet({ annMine: true, offers: [offer()] }), { owners: 'mine' })
		try {
			const row = '[data-widget-part~="stats.offer"][data-offer="incoming"]'
			assert.equal(text(view.query(`${row} [data-widget-part~="stats.offer-text"]`)), 'Stranger offers Potion of healing ×2')
			await view.click(view.query(`${row} [data-widget-part~="stats.offer-accept"]`)!)
			assert.deepEqual(view.requested.at(-1), { kind: 'decide-proposal', params: { proposalId: 4, accept: true } })
		} finally {
			await view.unmount()
		}
		const giver = await mount(sheet({ strangerMine: true, offers: [offer(true)] }), { owners: 'mine' })
		try {
			const row = '[data-widget-part~="stats.offer"][data-offer="outgoing"]'
			assert.equal(text(giver.query(`${row} [data-widget-part~="stats.offer-text"]`)), 'Offered to Ann: Potion of healing ×2')
			await giver.click(giver.query(`${row} [data-widget-part~="stats.offer-withdraw"]`)!)
			assert.deepEqual(giver.requested.at(-1), { kind: 'decide-proposal', params: { proposalId: 4, accept: false } })
		} finally {
			await giver.unmount()
		}
	})

	test('🚧 Honour turned on mid-session: the open piece gains Edit, Give to… and Remove at the next push (Q1-7)', async () => {
		const view = await mount(sheet({ strangerMine: true, strangerEditable: false }), { owners: 'mine' })
		try {
			const weapons = `[data-slot-id="${id('weapons')}"]`
			await view.dispatch(`${weapons} [data-widget-part~="piece-card.detail"]`, 'open-change', { open: true })
			assert.equal(view.queryAll(`${weapons} [data-widget-part~="piece-card.edit"]`).length, 0)
			await view.push('scoped', { session_state: sheet({ strangerMine: true }) })
			await view.dispatch(`${weapons} [data-widget-part~="piece-card.detail"]`, 'open-change', { open: true })
			assert.equal(view.queryAll(`${weapons} [data-widget-part~="piece-card.edit"]`).length, 1)
			assert.equal(view.queryAll(`${weapons} [data-widget-part~="piece-card.remove"]`).length, 1)
		} finally {
			await view.unmount()
		}
	})
})
