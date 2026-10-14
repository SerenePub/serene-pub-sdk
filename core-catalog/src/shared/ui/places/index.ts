/**
 * `@serene-pub/core-catalog/places` — the plain-TypeScript half of core's
 * Places widget (PLAN-core-widgets W4, 2026-10-11): its settings, who stands
 * where, and the one view it draws from the page's `session-places` answer
 * and the session's state — the list's rows and the map's squares and
 * lines. The widget's Svelte source lives in `components/shared/places/`
 * (its map is the shared **map canvas**, `components/shared/map-canvas/`)
 * and ships built (`dist/components/places.js`); a host imports only this
 * half, which carries no Svelte runtime.
 *
 * **What it answers:** where are we, what is around us, where can we go.
 * The places and their ways are the page's answer — the session's book on
 * its line, at its story clock, the ways its prompt says as *From here:*.
 * Who stands where is the session's state (`session_state.v1`): the world's
 * `location` is **here**, a cast member's puts their face on that place. A
 * `location` is a reference to the place's entry, or words, which name a
 * place by its name (case and a leading "the" aside).
 *
 * ⚠ Not the lorebook's **Places lens** (the book's own map, where places
 * and ways are made); not **Stats** (which draws a place's stats as cards):
 * a place's stats show here only in its detail.
 *
 * Every sentence is English source handed through the widget's `t`, so the
 * same words speak the viewer's language natively or in a worker.
 *
 * 🚧 Provisional with the widget.
 */
import {
	isSlotLoreRef,
	type PlaceLinkV1,
	type PlaceV1,
	type SessionPlacesV1,
	type SessionStateOwnerV1,
	type SessionStateSlotV1,
	type SessionStateV1,
	type WayV1,
} from '@serene-pub/sdk'
import { formatSlotValue } from '../session-state/barMath.js'
import { slotsFor, valueOf } from '../session-state/stateView.js'

/** A translation: English source in, the viewer's words out. @experimental */
export type PlacesT = (source: string) => string

/** How the places are drawn: a list (a side rail) or a map (a wide one). @experimental */
export const PLACES_VIEWS = ['list', 'map'] as const
/** @experimental */
export type PlacesViewMode = (typeof PLACES_VIEWS)[number]

/** Whose whereabouts are picked out: the world's (**here**), the cast's (their faces), or both. @experimental */
export const PLACES_HIGHLIGHTS = ['world', 'cast', 'both'] as const
/** @experimental */
export type PlacesHighlight = (typeof PLACES_HIGHLIGHTS)[number]

/** How many tints the skin deals; a category past the sixth takes the first again, as the lens does. @experimental */
export const PLACES_TINTS = 6

/** The location stat — where an owner is (`core:slot/location@1`). @experimental */
export const LOCATION_SLOT_ID = 'core:slot/location@1'

/** The widget's settings, complete — the declared defaults wherever an instance has none. @experimental */
export interface PlacesSettings {
	view: PlacesViewMode
	highlight: PlacesHighlight
	/** Only places in these categories, as written (any case); empty is every place. */
	categories: string[]
	/** Write each place's ways out (the list's line, the detail's sentences). */
	showWays: boolean
}

/** @experimental */
export const PLACES_DEFAULTS: PlacesSettings = Object.freeze({
	view: 'list' as const,
	highlight: 'both' as const,
	categories: [] as string[],
	showWays: true,
})

const pick = <T extends string>(raw: unknown, of: readonly T[], fallback: T): T =>
	typeof raw === 'string' && (of as readonly string[]).includes(raw) ? (raw as T) : fallback

/** Read one settings payload (`settings.v1`) into the complete object above. @experimental */
export function readPlacesSettings(raw: Record<string, unknown> | undefined): PlacesSettings {
	const v = raw ?? {}
	const categories = Array.isArray(v.categories)
		? [...new Set(v.categories.map((c) => String(c).trim()).filter(Boolean))]
		: []
	return {
		view: pick(v.view, PLACES_VIEWS, PLACES_DEFAULTS.view),
		highlight: pick(v.highlight, PLACES_HIGHLIGHTS, PLACES_DEFAULTS.highlight),
		categories,
		showWays: typeof v.showWays === 'boolean' ? v.showWays : PLACES_DEFAULTS.showWays,
	}
}

// ─── who stands where ────────────────────────────────────────────────────────

/** A face drawn on a place: a cast member who stands there. @experimental */
export interface PlacesFace {
	ref: `character:${number}`
	name: string
}

/** A name as a place's name is matched: trimmed, one case, a leading "the" aside. */
const nameKey = (name: string) =>
	name
		.trim()
		.toLowerCase()
		.replace(/^the\s+/, '')
		.replace(/\s+/g, ' ')

/**
 * The place a `location` value points at, among `places`: a reference by its
 * entry, words by a place's name (one place only — words two places answer
 * to point at neither). Null when it points at none of them.
 * @experimental
 */
export function placeOfLocation(value: unknown, places: readonly PlaceV1[]): number | null {
	if (isSlotLoreRef(value))
		return places.some((p) => p.id === value.entryId) ? value.entryId : null
	if (typeof value !== 'string' || !value.trim()) return null
	const key = nameKey(value)
	const found = places.filter((p) => nameKey(p.name) === key)
	return found.length === 1 ? found[0]!.id : null
}

/** The location stat this session declares: core's, else one keyed `location`. */
function locationSlotOf(state: SessionStateV1): SessionStateSlotV1 | undefined {
	return (
		state.slots.find((s) => s.slotId === LOCATION_SLOT_ID) ??
		state.slots.find((s) => s.key === 'location')
	)
}

/**
 * Who stands where, from the session's state: the place the **world**'s
 * `location` points at (`here`), and each cast member whose `location`
 * points at a place, by place. Nothing when the state has not arrived or
 * declares no location.
 * @experimental
 */
export function placesPresence(
	state: SessionStateV1 | null | undefined,
	places: readonly PlaceV1[],
): { here: number | null; present: Map<number, PlacesFace[]> } {
	const present = new Map<number, PlacesFace[]>()
	if (!state?.loaded) return { here: null, present }
	const slot = locationSlotOf(state)
	if (!slot) return { here: null, present }
	const at = (owner: SessionStateOwnerV1) =>
		Object.hasOwn(owner.configs ?? {}, slot.slotId)
			? placeOfLocation(valueOf(state, owner, slot), places)
			: null
	const world = state.owners.find((o) => o.kind === 'session' && o.key === 'world')
	for (const owner of state.owners) {
		if (owner.kind !== 'session_cast') continue
		const placeId = at(owner)
		if (placeId == null) continue
		present.set(placeId, [
			...(present.get(placeId) ?? []),
			{ ref: `character:${owner.id}`, name: owner.label },
		])
	}
	return { here: world ? at(world) : null, present }
}

// ─── the view ────────────────────────────────────────────────────────────────

/** One place as the widget draws it — a list row, and what its detail says. @experimental */
export interface PlaceRowView {
	id: number
	name: string
	category: string | null
	/** The tint the skin colours it by (0–5); null with no category. */
	tint: number | null
	/** The scene is here (the world's `location`), when the widget picks it out. */
	here: boolean
	/** Who of the cast stands here, when the widget picks them out. */
	present: PlacesFace[]
	/** The ways out as one muted line — *→ The Guard Room, The Drowned Hall*; empty when none (or not shown). */
	waysOut: string
	/** Each way, said from here ("The rusted iron door leads north to the Drowned Hall."); empty when not shown. */
	ways: string[]
	/** What else the book links here — a keeper, a faction — said from here. */
	linked: PlaceLinkV1[]
	/** The place's stats in this session, by label, as a person reads them. */
	stats: { label: string; value: string }[]
}

/** A square of the map (the map canvas's node). @experimental */
export interface PlacesMapNode {
	id: string
	label: string
	tint: number | null
	faces: PlacesFace[]
	here: boolean
	description: string
}

/** A line of the map (the map canvas's edge); a far end not drawn is a stub. @experimental */
export interface PlacesMapEdge {
	id: string
	from: string
	to: string
	bidirectional: boolean
}

/**
 * The widget's drawing. `loading` until the first answer lands; `no-book`
 * when the session reads no lorebook; `empty` when its book has no places
 * (on its line, by its clock); `filtered` when the categories shown hold
 * none of them; `ready` otherwise. `empty` is the line said in each of the
 * first four.
 * @experimental
 */
export interface PlacesView {
	state: 'loading' | 'no-book' | 'empty' | 'filtered' | 'ready'
	empty: string
	/** The places counted, said: "5 places · 4 ways", "2 of 5 places · 1 way". */
	headline: string
	/** Grouped by category in the lens's order (no category last), entry order within. */
	rows: PlaceRowView[]
	/** The place the scene is at, when picked out and drawn. */
	hereId: number | null
	nodes: PlacesMapNode[]
	edges: PlacesMapEdge[]
}

/** The square's id on the map canvas, from the place's entry id. @experimental */
export const placeNodeId = (placeId: number) => `place:${placeId}`

/** The place's entry id from its square's id; null when it is not one. @experimental */
export function placeIdOfNode(nodeId: string): number | null {
	const m = /^place:(\d+)$/.exec(nodeId)
	return m ? Number(m[1]) : null
}

const plural = (t: PlacesT, n: number, one: string, many: string) =>
	n === 1 ? t(one) : t(many).replace('{count}', String(n))

/**
 * What the widget draws, from the page's answer, the session's state and
 * the instance's settings. Pure.
 * @experimental
 */
export function placesView(
	answer: SessionPlacesV1 | null | undefined,
	state: SessionStateV1 | null | undefined,
	settings: PlacesSettings,
	t: PlacesT = (s) => s,
): PlacesView {
	const blank = { headline: '', rows: [], hereId: null, nodes: [], edges: [] }
	if (!answer) return { ...blank, state: 'loading', empty: t('Reading the places…') }
	if (answer.lorebookId == null)
		return { ...blank, state: 'no-book', empty: t('This session reads no lorebook.') }
	if (!answer.places.length)
		return { ...blank, state: 'empty', empty: t('This book has no places yet.') }

	const wanted = new Set(settings.categories.map((c) => c.toLowerCase()))
	const drawn = wanted.size
		? answer.places.filter(
				(p) => p.category != null && wanted.has(p.category.trim().toLowerCase()),
			)
		: answer.places
	if (!drawn.length)
		return {
			...blank,
			state: 'filtered',
			empty: t("None of this book's places is in {categories}.").replace(
				'{categories}',
				settings.categories.join(', '),
			),
		}

	const nameOf = new Map(answer.places.map((p) => [p.id, p.name]))
	const drawnIds = new Set(drawn.map((p) => p.id))
	const who = placesPresence(state, answer.places)
	const showHere = settings.highlight !== 'cast'
	const showCast = settings.highlight !== 'world'
	const hereId = showHere && who.here != null && drawnIds.has(who.here) ? who.here : null

	const placeOwners = state?.loaded
		? state.owners.filter((o) => o.kind === 'session_location')
		: []
	const statsOf = (placeId: number) => {
		const owner = placeOwners.find((o) => o.id === placeId)
		if (!owner || !state) return []
		return slotsFor(state, owner)
			.map((slot) => ({ slot, value: valueOf(state, owner, slot) }))
			.filter(
				(s) =>
					s.value !== undefined &&
					s.value !== null &&
					!(Array.isArray(s.value) && !s.value.length),
			)
			.map((s) => ({ label: s.slot.label, value: formatSlotValue(s.value) }))
	}

	/** Where the ways from `placeId` lead, each far place once, in way order. */
	const waysFrom = (placeId: number) => {
		const out: { to: number; says: string }[] = []
		for (const w of answer.ways) {
			if (w.from === placeId) out.push({ to: w.to, says: w.fromSays })
			else if (w.to === placeId && w.bothWays && w.toSays)
				out.push({ to: w.from, says: w.toSays })
		}
		return out
	}

	const tintOf = (p: PlaceV1) => (p.tint == null ? null : p.tint % PLACES_TINTS)
	const rows: PlaceRowView[] = drawn
		.map((p, i) => ({ p, i }))
		.sort(
			(a, b) =>
				(a.p.tint ?? Number.MAX_SAFE_INTEGER) - (b.p.tint ?? Number.MAX_SAFE_INTEGER) ||
				a.i - b.i,
		)
		.map(({ p }) => {
			const out = waysFrom(p.id)
			const far = [...new Set(out.map((w) => w.to))]
				.map((id) => nameOf.get(id) ?? '')
				.filter(Boolean)
			return {
				id: p.id,
				name: p.name,
				category: p.category,
				tint: tintOf(p),
				here: p.id === hereId,
				present: showCast ? (who.present.get(p.id) ?? []) : [],
				waysOut: settings.showWays && far.length ? `→ ${far.join(', ')}` : '',
				ways: settings.showWays ? out.map((w) => w.says).filter(Boolean) : [],
				linked: p.linked,
				stats: statsOf(p.id),
			}
		})

	// The map: every drawn place a square; a way to a place not drawn, a stub.
	const nodes: PlacesMapNode[] = rows.map((r) => ({
		id: placeNodeId(r.id),
		label: r.name,
		tint: r.tint,
		faces: r.present,
		here: r.here,
		description: [
			r.category ?? '',
			r.present.length
				? t('{names} here').replace('{names}', r.present.map((f) => f.name).join(', '))
				: '',
		]
			.filter(Boolean)
			.join(', '),
	}))
	const edges: PlacesMapEdge[] = []
	for (const w of answer.ways as WayV1[]) {
		const fromIn = drawnIds.has(w.from)
		const toIn = drawnIds.has(w.to)
		if (!fromIn && !toIn) continue
		// Out of the end that is drawn: a stub points away from it.
		const [from, to] = fromIn ? [w.from, w.to] : [w.to, w.from]
		edges.push({
			id: `way:${w.id}`,
			from: placeNodeId(from),
			to: placeNodeId(to),
			bidirectional: w.bothWays,
		})
	}

	const shownWays = answer.ways.filter((w) => drawnIds.has(w.from) && drawnIds.has(w.to)).length
	const count =
		drawn.length === answer.places.length
			? plural(t, drawn.length, '1 place', '{count} places')
			: t('{shown} of {total} places')
					.replace('{shown}', String(drawn.length))
					.replace('{total}', String(answer.places.length))
	return {
		state: 'ready',
		empty: '',
		headline: `${count} · ${plural(t, shownWays, '1 way', '{count} ways')}`,
		rows,
		hereId,
		nodes,
		edges,
	}
}
