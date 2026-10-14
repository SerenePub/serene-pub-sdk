/**
 * Core's Places widget (PLAN-core-widgets W4) — its declaration, the plain
 * half (`@serene-pub/core-catalog/places`): its settings, who stands where
 * (the world's `location` is **Here**, a cast member's puts their face on
 * the place), the categories it shows and the ways out it writes — and the
 * shared **map canvas**'s layout (`components/shared/map-canvas/`), which is
 * the same for the same input.
 */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
	WIDGET_REQUEST_ASKERS,
	type SessionPlacesV1,
	type SessionStateOwnerV1,
	type SessionStateV1,
} from '@serene-pub/sdk'
import {
	LOCATION_SLOT_ID,
	PLACES_DEFAULTS,
	placeIdOfNode,
	placeNodeId,
	placeOfLocation,
	placesPresence,
	placesView,
	readPlacesSettings,
} from '../core-catalog/src/shared/ui/places/index.js'
import { CORE_COMPONENTS, CORE_WIDGETS, coreWidgets } from '../core-catalog/src/index.js'
import {
	MAP_NODE_H,
	MAP_NODE_W,
	MAP_STUB_LEN,
	layoutMap,
	nextMapZoom,
	type MapCanvasEdge,
	type MapCanvasNode,
} from '../core-catalog/components/shared/map-canvas/index.js'

const t = (s: string) => s

const place = (
	id: number,
	name: string,
	category: string | null = null,
	tint: number | null = null,
) => ({
	id,
	name,
	category,
	tint,
	linked: [],
})

const ANSWER: SessionPlacesV1 = {
	lorebookId: 4,
	asOf: null,
	places: [
		place(1, 'The Guardroom', 'Upper floor', 1),
		place(2, 'The Drowned Hall', 'Cellars', 0),
		place(3, 'The Crypt', 'Cellars', 0),
		place(4, 'The Well', null, null),
	],
	ways: [
		{
			id: 10,
			from: 1,
			to: 2,
			bothWays: true,
			name: 'the rusted iron door',
			fromSays: 'The rusted iron door leads north to The Drowned Hall.',
			toSays: 'The rusted iron door leads south to The Guardroom.',
		},
		{
			id: 11,
			from: 2,
			to: 3,
			bothWays: false,
			name: null,
			fromSays: 'Leads down to The Crypt.',
			toSays: null,
		},
	],
}

const LOC = LOCATION_SLOT_ID
const owner = (
	o: Partial<SessionStateOwnerV1> & Pick<SessionStateOwnerV1, 'key' | 'kind' | 'id' | 'label'>,
) => ({
	configs: { [LOC]: {} },
	...o,
})

function state(over: { world?: unknown; mira?: unknown; bram?: unknown } = {}): SessionStateV1 {
	return {
		sessionId: 7,
		loaded: true,
		error: null,
		resolved: {
			world:
				over.world === undefined
					? { 'core.location': { entryId: 1 } }
					: { 'core.location': over.world },
			cast: {
				mira:
					over.mira === undefined
						? { 'core.location': { entryId: 2, name: 'The Drowned Hall' } }
						: { 'core.location': over.mira },
				bram:
					over.bram === undefined
						? { 'core.location': 'the guardroom' }
						: { 'core.location': over.bram },
			},
			locations: {
				'place:3': { 'core.inventory': [{ entryId: 9, name: 'Rusty key', count: 2 }] },
			},
		},
		slots: [
			{
				slotId: LOC,
				key: 'location',
				qualifiedKey: 'core.location',
				label: 'Location',
				type: 'text',
				appliesTo: ['world', 'cast'],
			},
			{
				slotId: 'core:slot/inventory@1',
				key: 'inventory',
				qualifiedKey: 'core.inventory',
				label: 'Inventory',
				type: 'list',
				appliesTo: ['location'],
			},
		] as SessionStateV1['slots'],
		owners: [
			owner({ key: 'world', kind: 'session', id: 7, label: 'World' }),
			owner({ key: 'mira', kind: 'session_cast', id: 11, label: 'Mira' }),
			owner({ key: 'bram', kind: 'session_cast', id: 12, label: 'Bram' }),
			{
				key: 'place:3',
				kind: 'session_location',
				id: 3,
				label: 'The Crypt',
				configs: { 'core:slot/inventory@1': {} },
			},
		],
	}
}

describe('the declaration', () => {
	test('places: the lore and state grants, one section read, a span of two, Map (the place glyph)', () => {
		const decl = CORE_WIDGETS.find((w) => w.id === 'places')!
		assert.ok(decl)
		assert.equal(coreWidgets.places, decl)
		assert.equal(decl.title, 'Places')
		assert.equal(decl.icon, 'Map', "a place's glyph (NOMENCLATURE §22)")
		assert.deepEqual(decl.scopes, ['lore', 'session:state'])
		assert.deepEqual(decl.reads, ['settings'])
		assert.deepEqual(decl.layout, { span: { ideal: 2 }, minInline: 260, minBlock: 120 })
		assert.ok(
			CORE_COMPONENTS.some(
				(c) => c.slug === 'places' && c.entry === 'components/shared/places/places.ts',
			),
		)
		assert.deepEqual(WIDGET_REQUEST_ASKERS['session-places'], { scope: 'lore' })
	})

	test("the declared defaults are the reader's; the less-used two are behaviour", () => {
		const s = CORE_WIDGETS.find((w) => w.id === 'places')!.settings as Record<
			string,
			{ type: string; default: unknown; of?: string[]; group?: string }
		>
		assert.deepEqual(s.view!.of, ['list', 'map'])
		assert.deepEqual(s.highlight!.of, ['world', 'cast', 'both'])
		assert.equal(s.categories!.type, 'string[]')
		assert.equal(s.categories!.group, 'behaviour')
		assert.equal(s.showWays!.group, 'behaviour')
		assert.deepEqual(PLACES_DEFAULTS, {
			view: s.view!.default,
			highlight: s.highlight!.default,
			categories: s.categories!.default,
			showWays: s.showWays!.default,
		})
		assert.deepEqual(readPlacesSettings(undefined), PLACES_DEFAULTS)
		assert.deepEqual(
			readPlacesSettings({ view: 'globe', highlight: 7, categories: 'x', showWays: 'no' }),
			PLACES_DEFAULTS,
		)
		assert.deepEqual(
			readPlacesSettings({ view: 'map', categories: [' Cellars ', '', 'Cellars'] })
				.categories,
			['Cellars'],
		)
	})
})

describe('who stands where', () => {
	test('a reference points at its entry; words at the one place of that name, "the" and case aside', () => {
		assert.equal(placeOfLocation({ entryId: 3 }, ANSWER.places), 3)
		assert.equal(placeOfLocation({ entryId: 99 }, ANSWER.places), null)
		assert.equal(placeOfLocation('the drowned   HALL', ANSWER.places), 2)
		assert.equal(placeOfLocation('Crypt', ANSWER.places), 3)
		assert.equal(placeOfLocation('the moon', ANSWER.places), null)
		assert.equal(placeOfLocation('', ANSWER.places), null)
		const twins = [place(1, 'The Hall'), place(2, 'Hall')]
		assert.equal(placeOfLocation('hall', twins), null, 'two places answer: neither')
	})

	test("the world's location is Here; each cast member's puts their face on the place", () => {
		const who = placesPresence(state(), ANSWER.places)
		assert.equal(who.here, 1)
		assert.deepEqual(who.present.get(2), [{ ref: 'character:11', name: 'Mira' }])
		assert.deepEqual(who.present.get(1), [{ ref: 'character:12', name: 'Bram' }])
		// Not loaded yet, or no location declared: nothing is picked out.
		assert.equal(placesPresence({ ...state(), loaded: false }, ANSWER.places).here, null)
		assert.equal(placesPresence({ ...state(), slots: [] }, ANSWER.places).present.size, 0)
		assert.equal(placesPresence(undefined, ANSWER.places).here, null)
	})
})

describe('placesView', () => {
	test('the empty lines say why', () => {
		assert.equal(placesView(null, undefined, PLACES_DEFAULTS, t).state, 'loading')
		const noBook = placesView(
			{ lorebookId: null, asOf: null, places: [], ways: [] },
			undefined,
			PLACES_DEFAULTS,
			t,
		)
		assert.deepEqual(
			[noBook.state, noBook.empty],
			['no-book', 'This session reads no lorebook.'],
		)
		const none = placesView({ ...ANSWER, places: [], ways: [] }, undefined, PLACES_DEFAULTS, t)
		assert.deepEqual([none.state, none.empty], ['empty', 'This book has no places yet.'])
		const filtered = placesView(
			ANSWER,
			undefined,
			{ ...PLACES_DEFAULTS, categories: ['Attic'] },
			t,
		)
		assert.deepEqual(
			[filtered.state, filtered.empty],
			['filtered', "None of this book's places is in Attic."],
		)
	})

	test('rows: grouped by category in the lens order (none last), here and faces picked out, ways out in a line', () => {
		const v = placesView(ANSWER, state(), PLACES_DEFAULTS, t)
		assert.equal(v.state, 'ready')
		assert.equal(v.headline, '4 places · 2 ways')
		assert.deepEqual(
			v.rows.map((r) => [r.name, r.category, r.tint, r.here]),
			[
				['The Drowned Hall', 'Cellars', 0, false],
				['The Crypt', 'Cellars', 0, false],
				['The Guardroom', 'Upper floor', 1, true],
				['The Well', null, null, false],
			],
		)
		assert.equal(v.hereId, 1)
		const hall = v.rows[0]!
		assert.deepEqual(hall.present, [{ ref: 'character:11', name: 'Mira' }])
		// Both ways back to the guardroom, one way down to the crypt.
		assert.equal(hall.waysOut, '→ The Guardroom, The Crypt')
		assert.deepEqual(hall.ways, [
			'The rusted iron door leads south to The Guardroom.',
			'Leads down to The Crypt.',
		])
		// A one-way way is no way out of the crypt.
		assert.equal(v.rows[1]!.waysOut, '')
		assert.deepEqual(v.rows[1]!.stats, [{ label: 'Inventory', value: 'Rusty key ×2' }])
		assert.equal(v.rows[3]!.waysOut, '')
	})

	test('highlight: world marks Here alone; cast draws faces alone; showWays off writes no ways', () => {
		const world = placesView(ANSWER, state(), { ...PLACES_DEFAULTS, highlight: 'world' }, t)
		assert.equal(world.hereId, 1)
		assert.ok(world.rows.every((r) => r.present.length === 0))
		const cast = placesView(ANSWER, state(), { ...PLACES_DEFAULTS, highlight: 'cast' }, t)
		assert.equal(cast.hereId, null)
		assert.ok(cast.rows.every((r) => !r.here))
		assert.equal(cast.rows.find((r) => r.id === 2)!.present.length, 1)
		const quiet = placesView(ANSWER, state(), { ...PLACES_DEFAULTS, showWays: false }, t)
		assert.ok(quiet.rows.every((r) => r.waysOut === '' && r.ways.length === 0))
	})

	test('categories narrow the places (any case); a way out of them is a stub on the map', () => {
		const v = placesView(ANSWER, state(), { ...PLACES_DEFAULTS, categories: ['cellars'] }, t)
		assert.deepEqual(
			v.rows.map((r) => r.id),
			[2, 3],
		)
		assert.equal(v.headline, '2 of 4 places · 1 way')
		// Here (the guardroom) is not drawn, so nothing is marked.
		assert.equal(v.hereId, null)
		assert.deepEqual(
			v.nodes.map((n) => n.id),
			['place:2', 'place:3'],
		)
		assert.deepEqual(v.edges, [
			{ id: 'way:10', from: 'place:2', to: 'place:1', bidirectional: true },
			{ id: 'way:11', from: 'place:2', to: 'place:3', bidirectional: false },
		])
		// The guardroom is still where the hall's way leads.
		assert.equal(v.rows[0]!.waysOut, '→ The Guardroom, The Crypt')
	})

	test("the map's squares carry the tint, the faces, Here and a description", () => {
		const v = placesView(ANSWER, state(), PLACES_DEFAULTS, t)
		const hall = v.nodes.find((n) => n.id === placeNodeId(2))!
		assert.deepEqual(hall, {
			id: 'place:2',
			label: 'The Drowned Hall',
			tint: 0,
			faces: [{ ref: 'character:11', name: 'Mira' }],
			here: false,
			description: 'Cellars, Mira here',
		})
		assert.equal(v.nodes.find((n) => n.id === 'place:1')!.here, true)
		assert.equal(placeIdOfNode('place:12'), 12)
		assert.equal(placeIdOfNode('way:12'), null)
	})
})

describe('the map canvas layout', () => {
	const node = (id: string, over: Partial<MapCanvasNode> = {}): MapCanvasNode => ({
		id,
		label: id,
		...over,
	})
	const edge = (from: string, to: string, over: Partial<MapCanvasEdge> = {}): MapCanvasEdge => ({
		id: `${from}-${to}`,
		from,
		to,
		...over,
	})
	const NODES = [
		node('a'),
		node('b', { here: true }),
		node('c'),
		node('d'),
		node('e'),
		node('lone'),
	]
	const EDGES = [
		edge('a', 'b'),
		edge('b', 'c', { bidirectional: true }),
		edge('b', 'd'),
		edge('d', 'e'),
		edge('e', 'away'),
	]

	test('is the same for the same input', () => {
		assert.deepEqual(layoutMap(NODES, EDGES), layoutMap(NODES, EDGES))
		assert.deepEqual(
			JSON.stringify(layoutMap(NODES, EDGES)),
			JSON.stringify(layoutMap([...NODES], [...EDGES])),
		)
	})

	test('rings outward from Here; the unjoined beneath; focus order ring by ring', () => {
		const l = layoutMap(NODES, EDGES)
		const ring = Object.fromEntries(l.nodes.map((n) => [n.id, n.ring]))
		assert.deepEqual(ring, { b: 0, a: 1, c: 1, d: 1, e: 2, lone: -1 })
		// d stands over e, its one neighbour beneath; a and c keep their order.
		assert.deepEqual(
			l.nodes.map((n) => n.id),
			['b', 'a', 'd', 'c', 'e', 'lone'],
		)
		const at = (id: string) => l.nodes.find((n) => n.id === id)!
		assert.ok(at('a').y > at('b').y && at('e').y > at('a').y && at('lone').y > at('e').y)
		assert.ok(l.nodes.every((n) => n.w === MAP_NODE_W && n.h === MAP_NODE_H))
		assert.ok(
			l.nodes.every(
				(n) => n.x >= 0 && n.y >= 0 && n.x + n.w <= l.width && n.y + n.h <= l.height,
			),
		)
	})

	test('edges stop at the squares; a far end not drawn is a stub; two between one pair are drawn apart', () => {
		const l = layoutMap(NODES, EDGES)
		const ab = l.edges.find((e) => e.id === 'a-b')!
		const a = l.nodes.find((n) => n.id === 'a')!
		const b = l.nodes.find((n) => n.id === 'b')!
		// a is below b: the line runs up, from a's top border to b's bottom one.
		assert.equal(ab.angle < 0, true)
		assert.ok(Math.abs(ab.y - a.y) < 1, 'it leaves a by its top border')
		const centres = Math.hypot(b.x - a.x, b.y - a.y)
		assert.ok(ab.len > 0 && ab.len < centres)
		assert.equal(l.edges.find((e) => e.id === 'b-c')!.bidirectional, true)
		const stub = l.edges.find((e) => e.id === 'e-away')!
		assert.equal(stub.stub, true)
		assert.equal(stub.len, MAP_STUB_LEN)
		assert.equal(stub.angle, 90)

		const twice = layoutMap(
			[node('x'), node('y')],
			[edge('x', 'y', { id: 'one' }), edge('y', 'x', { id: 'two' })],
		)
		const [one, two] = twice.edges
		assert.notDeepEqual([one!.x, one!.y], [two!.x, two!.y])
		assert.equal(twice.edges.length, 2)
		// Nothing to self, nothing from nowhere.
		assert.equal(layoutMap([node('x')], [edge('x', 'x'), edge('nowhere', 'x')]).edges.length, 0)
	})

	test('zoom steps in and out, and stops at either end', () => {
		assert.equal(nextMapZoom(1, 'in'), 1.25)
		assert.equal(nextMapZoom(1, 'out'), 0.75)
		assert.equal(nextMapZoom(2, 'in'), 2)
		assert.equal(nextMapZoom(0.5, 'out'), 0.5)
	})
})
