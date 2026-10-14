/**
 * What core's state widget draws (R21), from the `session_state` section and
 * its settings — the reading the native World State and Stats widgets did
 * against the page's store, as plain functions over the section, so the
 * remote widget and its tests share one answer. World State is Stats now
 * (W7, 2026-10-11): `statsView` reads every owner; `worldStateView` ⏳ stays
 * for one release.
 *
 * A value is looked up by its slot's QUALIFIED key (every value is filed
 * under it; the bare key is the first claimant's display name), and an owner
 * carries a slot exactly when the slot's id is a key of its `configs`.
 */
import type {
	SessionStateOwnerV1,
	SessionStateSlotV1,
	SessionStateV1,
	SlotListItem,
	StatTrailChangeV1,
} from '@serene-pub/sdk'
import { clampToBounds, formatSlotValue, type BarBounds } from './barMath.js'
import { shownValueText, slotKind } from './shapes.js'

/**
 * A value a person may write: `null` clears the session's layer, so the read
 * inherits again. A list is written whole, its items in order.
 * @experimental
 */
export type SlotWriteValue = number | string | boolean | null | readonly SlotListItem[]

/** One slot as a widget draws it for one owner: what it is, its bounds, its value. @experimental */
export interface ShownSlot {
	slot: SessionStateSlotV1
	/** The configuration in force for this owner — a bar's bounds, a chip's options. */
	config: Record<string, unknown>
	/** The resolved value; `undefined` when no layer answers. */
	value: unknown
}

/** A settings list of names (`pickSlots`, `pickMembers`): trimmed, lower-cased, blanks dropped. @experimental */
export function pickedNames(raw: unknown): string[] {
	return Array.isArray(raw) ? raw.map((n) => String(n).trim().toLowerCase()).filter(Boolean) : []
}

/** The owner's values: the world's bag, a cast member's or a location's by owner key. */
function bagOf(state: SessionStateV1, owner: SessionStateOwnerV1): Record<string, unknown> {
	if (owner.kind === 'session') return state.resolved.world ?? {}
	if (owner.kind === 'session_location') return state.resolved.locations?.[owner.key] ?? {}
	return state.resolved.cast?.[owner.key] ?? {}
}

/** The slots an owner may carry, in declaration order. @experimental */
export function slotsFor(state: SessionStateV1, owner: SessionStateOwnerV1): SessionStateSlotV1[] {
	return state.slots.filter((s) => Object.hasOwn(owner.configs ?? {}, s.slotId))
}

/** One owner's value for one slot, by the slot's qualified key. @experimental */
export function valueOf(state: SessionStateV1, owner: SessionStateOwnerV1, slot: SessionStateSlotV1): unknown {
	return bagOf(state, owner)[slot.qualifiedKey]
}

/** Does this owner have any value at all — is it in play? @experimental */
export function hasAnyValue(state: SessionStateV1, owner: SessionStateOwnerV1): boolean {
	return slotsFor(state, owner).some((s) => valueOf(state, owner, s) !== undefined)
}

/** Is the slot one a `pick` names, by key or label? `all` takes every slot. */
function slotPicked(slot: SessionStateSlotV1, mode: string, picked: readonly string[]): boolean {
	return mode !== 'pick' || picked.includes(slot.key) || picked.includes(slot.label.toLowerCase())
}

function shown(state: SessionStateV1, owner: SessionStateOwnerV1, mode: string, picked: readonly string[]): ShownSlot[] {
	return slotsFor(state, owner)
		.filter((slot) => slotPicked(slot, mode, picked))
		.map((slot) => ({ slot, config: owner.configs[slot.slotId] ?? {}, value: valueOf(state, owner, slot) }))
}

const pickEnum = <T extends string>(raw: unknown, of: readonly T[], fallback: T): T =>
	typeof raw === 'string' && (of as readonly string[]).includes(raw) ? (raw as T) : fallback

// ─── World State ────────────────────────────────────────────────────────────

/**
 * 🚧 One location drawn under the world (attributes phase 4): a
 * `session_location` owner and the slots it shows.
 * @experimental
 */
export interface WorldStatePlace {
	owner: SessionStateOwnerV1
	slots: ShownSlot[]
}

/**
 * The World State widget's drawing. `loading` until the first read lands
 * (empty then means "not yet", never "nothing"); `failed` when that first
 * read was refused — the section's error says why, and nothing is coming, so
 * no loading line may stay beside it; `empty` says which of two
 * sentences — `none-declared` (nothing in the session declares a stat at all)
 * or `none-shown` (stats exist, none of them the world's, or none picked).
 * `not-granted` when the host said the widget does not hold `session:state`
 * (`granted === false`): the section will never come, so it is said rather
 * than waited for.
 *
 * ⏳ World State is Stats now (W7, 2026-10-11): `statsView` with `owners:
 * world` and a list or strip arrangement draws exactly this. Kept for one
 * release for a reader that still calls it.
 * @deprecated REMOVE in 0.7.0 — read {@link statsView}.
 * @experimental
 */
export type WorldStateView =
	| { status: 'not-granted'; layout: 'strip' | 'list' }
	| { status: 'loading'; layout: 'strip' | 'list' }
	| { status: 'failed'; layout: 'strip' | 'list' }
	| { status: 'empty'; layout: 'strip' | 'list'; reason: 'none-declared' | 'none-shown' }
	| {
			status: 'shown'
			layout: 'strip' | 'list'
			owner: SessionStateOwnerV1
			slots: ShownSlot[]
			/**
			 * 🚧 Each location in play — one with a value in a slot this
			 * widget shows — under the world's own slots (phase 4). A place
			 * nothing has been said about is not drawn: an empty card is not
			 * a stat.
			 */
			places: WorldStatePlace[]
	  }

/** @deprecated REMOVE in 0.7.0 — read {@link statsView} with `owners: 'world'`. @experimental */
export function worldStateView(
	state: SessionStateV1 | undefined,
	settings: Record<string, unknown>,
	/** Does the widget hold `session:state` — `undefined` until the host says (`ctx.granted`). */
	granted?: boolean,
): WorldStateView {
	const layout = pickEnum(settings.layout, ['strip', 'list'], 'strip')
	if (granted === false) return { status: 'not-granted', layout }
	if (state && !state.loaded && state.error) return { status: 'failed', layout }
	if (!state || !state.loaded) return { status: 'loading', layout }
	const mode = pickEnum(settings.slots, ['all', 'pick'], 'all')
	const picked = pickedNames(settings.pickSlots)
	const world = state.owners.find((o) => o.kind === 'session' && o.key === 'world') ?? null
	const slots = world ? shown(state, world, mode, picked) : []
	const places = state.owners
		.filter((o) => o.kind === 'session_location')
		.map((owner) => ({ owner, slots: shown(state, owner, mode, picked).filter((s) => s.value !== undefined) }))
		.filter((place) => place.slots.length)
	if (!world || (!slots.length && !places.length))
		return { status: 'empty', layout, reason: state.slots.length ? 'none-shown' : 'none-declared' }
	return { status: 'shown', layout, owner: world, slots, places }
}

// ─── Stats ──────────────────────────────────────────────────────────────────

/** Whose stats a Stats widget draws — its `owners` setting (W7). @experimental */
export type StatsOwners = 'cast' | 'world' | 'places' | 'all' | 'pick'
/** How it draws them — its `arrangement` setting: a card per owner, a list down a rail, a strip across the top. @experimental */
export type StatsArrangement = 'cards' | 'list' | 'strip'
/** Which stats — its `slots` setting: every one, the bounded numbers only (a HUD), or the named. @experimental */
export type StatsSlots = 'all' | 'bars' | 'pick'
/** One kind of owner, in the order `owners: all` draws them, each under its own heading. @experimental */
export type StatsOwnerGroup = 'world' | 'cast' | 'places'

const STATS_OWNERS: readonly StatsOwners[] = ['cast', 'world', 'places', 'all', 'pick']

/** A Stats widget's settings, read (W7). @experimental */
export interface StatsSettings {
	owners: StatsOwners
	/** Which cast members, when `owners` is `cast` or `all`. */
	castScope: 'scene' | 'all'
	slots: StatsSlots
	arrangement: StatsArrangement
	density: 'compact' | 'full'
	/** `pickOwners`, read as {@link pickedNames}. */
	pickOwners: string[]
	pickSlots: string[]
	/** 🚧 Offer each stat's **stat trail** (F2): a button beside it opens its changes. */
	trail: boolean
}

/**
 * A Stats widget's settings as it reads them, every one defaulted. A host
 * hands it effective settings (each key present), so the fallbacks here are
 * for a settings object written before the Stats uplift (W7, 2026-10-11)
 * and handed raw — a bare mount, World State's wrapper: ⏳ `members: scene |
 * all` reads as `castScope`, `members: pick` as `owners: pick` (with
 * `pickMembers` as `pickOwners`), World State's `layout: strip | list` as
 * `arrangement`. The app's settings reader makes the same reading of a
 * stored row. REMOVE the fallbacks in 0.7.0.
 * @experimental
 */
export function statsSettingsOf(settings: Record<string, unknown>): StatsSettings {
	const legacyMembers = settings.members
	return {
		owners: pickEnum(settings.owners, STATS_OWNERS, legacyMembers === 'pick' ? 'pick' : 'cast'),
		castScope: pickEnum(settings.castScope, ['scene', 'all'], pickEnum(legacyMembers, ['scene', 'all'], 'scene')),
		slots: pickEnum(settings.slots, ['all', 'bars', 'pick'], 'all'),
		arrangement: pickEnum(settings.arrangement, ['cards', 'list', 'strip'], pickEnum(settings.layout, ['strip', 'list'], 'cards')),
		density: pickEnum(settings.density, ['compact', 'full'], 'full'),
		pickOwners: pickedNames(settings.pickOwners !== undefined ? settings.pickOwners : settings.pickMembers),
		pickSlots: pickedNames(settings.pickSlots),
		trail: typeof settings.trail === 'boolean' ? settings.trail : true,
	}
}

const finiteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/**
 * Is this slot a BAR for this owner — a number whose configuration in force
 * declares a floor and a ceiling above it? What `slots: bars` keeps (the HUD
 * case); the bar itself is `barView`'s, which also needs a value.
 * @experimental
 */
export function isBarSlot(slot: SessionStateSlotV1, config: Record<string, unknown>): boolean {
	return (
		slotKind(slot) === 'number' && finiteNumber(config.min) && finiteNumber(config.max) && config.max > config.min
	)
}

/** One owner as a Stats widget draws it: a card, or a line of a list or strip. @experimental */
export interface StatsShownOwner {
	owner: SessionStateOwnerV1
	group: StatsOwnerGroup
	slots: ShownSlot[]
}

/** One kind's owners, in the order drawn. Only `owners: all` heads them. @experimental */
export interface StatsGroup {
	kind: StatsOwnerGroup
	owners: StatsShownOwner[]
}

/**
 * ⏳ One cast member's card — the shape before the uplift, when Stats drew
 * the cast alone. REMOVE in 0.7.0.
 * @deprecated Read {@link StatsShownOwner}.
 * @experimental
 */
export type StatsMember = Pick<StatsShownOwner, 'owner' | 'slots'>

/** What every Stats drawing carries, whatever its status. @experimental */
export interface StatsViewBase {
	density: 'compact' | 'full'
	arrangement: StatsArrangement
	owners: StatsOwners
}

/**
 * The Stats widget's drawing: `loading` before the first read; `failed`
 * when that first read was refused (the section's error is the whole story);
 * `none-declared` when no slot is declared at all; `nothing-shown` when no
 * owner the settings admit has anything to draw (which sentence says so is
 * the widget's, by `owners` and `castScope`); `not-granted` when the host
 * said the widget does not hold `session:state`; else `shown`, in groups —
 * world, cast, places — that only `owners: all` heads.
 *
 * Which owners: `cast` — the cast, by `castScope` (`scene`: whoever has a
 * value in play; `all`: everyone); `world` — the world's own stats, and
 * under them each place with a value in play, its valued stats only (what
 * World State drew); `places` — the places in play, likewise; `all` — the
 * world, the cast by `castScope`, the places in play; `pick` — the owners
 * named, by label or key (`World` names the world), every stat shown. The
 * world is drawn only with a stat to show (or when picked). In a list or a
 * strip an owner with nothing to show is left out: an empty line is not a
 * stat; a card says so instead.
 * @experimental
 */
export type StatsView =
	| (StatsViewBase & { status: 'not-granted' | 'loading' | 'failed' | 'none-declared' })
	| (StatsViewBase & { status: 'nothing-shown'; castScope: 'scene' | 'all' })
	| (StatsViewBase & { status: 'shown'; groups: StatsGroup[] })

/** @experimental */
export function statsView(
	state: SessionStateV1 | undefined,
	settings: Record<string, unknown>,
	/** Does the widget hold `session:state` — `undefined` until the host says (`ctx.granted`). */
	granted?: boolean,
): StatsView {
	const read = statsSettingsOf(settings)
	const base: StatsViewBase = { density: read.density, arrangement: read.arrangement, owners: read.owners }
	if (granted === false) return { ...base, status: 'not-granted' }
	if (state && !state.loaded && state.error) return { ...base, status: 'failed' }
	if (!state || !state.loaded) return { ...base, status: 'loading' }
	if (!state.slots.length) return { ...base, status: 'none-declared' }

	const slotMode = read.slots === 'pick' ? 'pick' : 'all'
	const show = (owner: SessionStateOwnerV1): ShownSlot[] =>
		shown(state, owner, slotMode, read.pickSlots).filter((s) => read.slots !== 'bars' || isBarSlot(s.slot, s.config))
	const as = (group: StatsOwnerGroup, slots: (owner: SessionStateOwnerV1) => ShownSlot[]) => (owner: SessionStateOwnerV1) => ({
		owner,
		group,
		slots: slots(owner),
	})
	const world = state.owners.find((o) => o.kind === 'session' && o.key === 'world') ?? null
	const cast = state.owners.filter((o) => o.kind === 'session_cast')
	const places = state.owners.filter((o) => o.kind === 'session_location')
	/** The world's own stats — only with one to show. */
	const worldShown = (): StatsShownOwner[] => (world ? [as('world', show)(world)].filter((o) => o.slots.length) : [])
	/** The cast by `castScope`. Scene: a member nobody has given a value to has nothing to show. */
	const castShown = (): StatsShownOwner[] =>
		cast.filter((o) => read.castScope === 'all' || hasAnyValue(state, o)).map(as('cast', show))
	/** The places in play: each with a value in a stat shown, its valued stats only. */
	const placesShown = (): StatsShownOwner[] =>
		places
			.map(as('places', (o) => show(o).filter((s) => s.value !== undefined)))
			.filter((o) => o.slots.length)
	const picked = (o: SessionStateOwnerV1) =>
		read.pickOwners.includes(o.label.toLowerCase()) || read.pickOwners.includes(o.key.toLowerCase())

	let groups: StatsGroup[]
	switch (read.owners) {
		case 'world':
			// World State's reading: no world owner, nothing to draw.
			groups = world ? [{ kind: 'world', owners: worldShown() }, { kind: 'places', owners: placesShown() }] : []
			break
		case 'places':
			groups = [{ kind: 'places', owners: placesShown() }]
			break
		case 'all':
			groups = [
				{ kind: 'world', owners: worldShown() },
				{ kind: 'cast', owners: castShown() },
				{ kind: 'places', owners: placesShown() },
			]
			break
		case 'pick':
			groups = [
				{ kind: 'world', owners: (world && picked(world) ? [world] : []).map(as('world', show)) },
				{ kind: 'cast', owners: cast.filter(picked).map(as('cast', show)) },
				{ kind: 'places', owners: places.filter(picked).map(as('places', show)) },
			]
			break
		default:
			groups = [{ kind: 'cast', owners: castShown() }]
	}
	// A line of a list or a strip with nothing on it is not drawn.
	if (read.arrangement !== 'cards')
		groups = groups.map((g) => ({ ...g, owners: g.owners.filter((o) => o.slots.length) }))
	groups = groups.filter((g) => g.owners.length)
	if (!groups.length) return { ...base, status: 'nothing-shown', castScope: read.castScope }
	return { ...base, status: 'shown', groups }
}

// ─── Editing one slot ───────────────────────────────────────────────────────

/**
 * Can a person write this slot? A derived slot is computed on every read and
 * has nothing to write; a retired one still resolves and takes nothing new.
 * @experimental
 */
export const slotWritable = (slot: SessionStateSlotV1): boolean => slot.type !== 'derived' && !slot.retired

/**
 * An integer field's draft as a write: empty clears (`null`), a number is
 * truncated and held inside the bounds in force, anything else writes
 * nothing (`undefined`). A number field's bound value is a number, or null
 * when empty.
 * @experimental
 */
export function numberDraftValue(draft: unknown, config: BarBounds): number | null | undefined {
	if (draft === null || draft === undefined || (typeof draft === 'string' && draft.trim() === '')) return null
	const n = Number(draft)
	if (!Number.isFinite(n)) return undefined
	return clampToBounds(Math.trunc(n), config)
}

/**
 * A text field's draft as a write: blank clears (`null`); otherwise the text,
 * cut to the configuration's `maxLength` — the field cannot carry the limit
 * itself (a remote's `input` takes no `maxlength`).
 * @experimental
 */
export function textDraftValue(draft: unknown, config: { maxLength?: unknown }): string | null {
	const text = draft == null ? '' : String(draft)
	if (text.trim() === '') return null
	const max = config.maxLength
	return typeof max === 'number' && Number.isInteger(max) && max >= 0 ? text.slice(0, max) : text
}

/** An enum slot's **enum values** — the bare stored values its configuration closes (not `EnumOption`s). @experimental */
export function enumValues(config: Record<string, unknown>): string[] {
	return Array.isArray(config.of) ? config.of.map(String) : []
}

/**
 * A value as a person reads it, in the widget's language: the words
 * (`cleared`, `on`, `off`) through `t`, a number or a text as itself.
 * @experimental
 */
export function slotValueText(value: unknown, t: (source: string) => string): string {
	const text = formatSlotValue(value)
	return value === null || typeof value === 'boolean' ? t(text) : text
}

// ─── The stat trail (F2) ────────────────────────────────────────────────────

/** 🚧 One change of a stat's trail as Stats lists it (`stat-trail`, F2). @experimental */
export interface StatTrailRow {
	/** A key for the list: the message, the time and the place in the answer. */
	key: string
	/** The message it was written at; null before the session's first. */
	messageId: number | null
	/** When, in ms since the epoch. */
	at: number
	/** What the stat read before, as a person reads it; '' when nothing was recorded before. */
	from: string
	/** What it read after; a clear reads as `cleared`. */
	to: string
	by: StatTrailChangeV1['by']
}

const TRAIL_BY: readonly StatTrailChangeV1['by'][] = ['user', 'model', 'pipeline']

/**
 * A stat trail's changes (what `stat-trail` answered) as rows, NEWEST first
 * — the latest change sits under the button that opened it. Each value is
 * spelled as the slot draws it (`shownValueText`). An entry that is not a
 * change is skipped, so a host that answers nothing draws an empty trail.
 * @experimental
 */
export function statTrailRows(
	slot: Pick<SessionStateSlotV1, 'type' | 'field'>,
	changes: unknown,
	t: (source: string) => string,
): StatTrailRow[] {
	if (!Array.isArray(changes)) return []
	const rows: StatTrailRow[] = []
	changes.forEach((c: unknown, i) => {
		if (!c || typeof c !== 'object') return
		const change = c as Partial<StatTrailChangeV1>
		const messageId = typeof change.messageId === 'number' ? change.messageId : null
		const at = typeof change.at === 'number' && Number.isFinite(change.at) ? change.at : 0
		const by = TRAIL_BY.includes(change.by as StatTrailChangeV1['by']) ? (change.by as StatTrailChangeV1['by']) : 'pipeline'
		rows.push({
			key: `${i}:${messageId ?? '-'}:${at}`,
			messageId,
			at,
			from: change.from === null || change.from === undefined ? '' : shownValueText(slot, change.from, t),
			to: shownValueText(slot, change.to === undefined ? null : change.to, t),
			by,
		})
	})
	return rows.reverse()
}

/**
 * Who wrote a change, in words: a person's own edit, the story (a turn's
 * run), or anything automatic (a script). @experimental
 */
export function statTrailByText(by: StatTrailChangeV1['by'], t: (source: string) => string): string {
	return by === 'user' ? t('Edited') : by === 'model' ? t('From the story') : t('Automatic')
}
