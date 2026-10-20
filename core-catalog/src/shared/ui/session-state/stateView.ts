/**
 * What core's state widget draws (R21), from the `session_state` section and
 * its settings — the reading the native World State and Stats widgets did
 * against the page's store, as plain functions over the section, so the
 * remote widget and its tests share one answer. World State is Stats now
 * (W7, 2026-10-11): `statsView` reads every owner, the world's among them
 * (`owners: world`, `arrangement: strip` is what World State drew).
 *
 * A value is looked up by its slot's QUALIFIED key (every value is filed
 * under it; the bare key is the first claimant's display name), and an owner
 * carries a slot exactly when the slot's id is a key of its `configs`.
 */
import type {
	SessionStateOfferV1,
	SessionStateOwnerV1,
	SessionStateSlotV1,
	SessionStateV1,
	SlotListItem,
	StatTrailChangeV1,
} from '@serene-pub/sdk'
import { slotWordsFor } from '@serene-pub/sdk'
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

function shown(
	state: SessionStateV1,
	owner: SessionStateOwnerV1,
	mode: string,
	picked: readonly string[],
	hidden: readonly string[] = [],
): ShownSlot[] {
	return (
		slotsFor(state, owner)
			.filter((slot) => slotPicked(slot, mode, picked))
			// 🚧 A copy's `hideSlots`: the stats it leaves out, by key or label.
			.filter((slot) => !hidden.includes(slot.key) && !hidden.includes(slot.label.toLowerCase()))
			.map((slot) => ({ slot, config: owner.configs[slot.slotId] ?? {}, value: valueOf(state, owner, slot) }))
			// 🚧 A retired stat with nothing in it says nothing: it takes no new
			// value, so its "not set" row is a row that can never fill (DC walk
			// 5, 2026-10-17). One that still holds a value is drawn, greyed.
			.filter((s) => !(s.slot.retired && s.value === undefined))
			// 🚧 Nor does a stat whose own ceiling is none and that holds none
			// (PLAN-dc-after-walk2 Q1-6): a class that casts nothing holds a
			// spell-point pool of 0 of 0 — a row that can never fill.
			.filter((s) => !(s.config.max === 0 && (s.value === undefined || s.value === null || s.value === 0)))
			// 🚧 Nor a stat drawn only while it holds something (`shownWhenSet`,
			// PLAN-dc-after-walk2 Q3-8): a crawl's death saves, between dyings.
			.filter(
				(s) =>
					!(
						s.slot.shownWhenSet &&
						(s.value === undefined || s.value === null || (typeof s.value === 'string' && !s.value.trim()))
					),
			)
			// 🚧 At a table that keeps no numbers (Q2-3, owner ruling ★3): a number
			// reads in its words, worked out and never edited — "Health: Hurt" —
			// and a number with none is not drawn (a Story sheet's Level).
			.flatMap((s) => (state.wordsOnly ? inWords(s) : [s]))
	)
}

/** A number at a table of words: its words, as a derived row draws them; nothing when it has none. */
function inWords(s: ShownSlot): ShownSlot[] {
	if (s.slot.type !== 'integer') return [s]
	const said = slotWordsFor(s.slot.words, s.value, s.config.max)
	if (said === null && s.slot.words?.length && s.value === undefined) {
		// Never set: the stat's own top band — a fresh sheet is whole.
		return [{ ...s, slot: { ...s.slot, type: 'derived' }, value: s.slot.words[s.slot.words.length - 1]!.label }]
	}
	return said === null ? [] : [{ ...s, slot: { ...s.slot, type: 'derived' }, value: said }]
}

const pickEnum = <T extends string>(raw: unknown, of: readonly T[], fallback: T): T =>
	typeof raw === 'string' && (of as readonly string[]).includes(raw) ? (raw as T) : fallback

// ─── Stats ──────────────────────────────────────────────────────────────────

/**
 * Whose stats a Stats widget draws — its `owners` setting (W7). 🚧 `mine`
 * (2026-10-17): the viewer's own — their player seat or persona, as the host
 * marks it (`owner.mine`), else the first cast member in play.
 * @experimental
 */
export type StatsOwners = 'cast' | 'world' | 'places' | 'all' | 'pick' | 'mine' | 'seats'
/**
 * How it draws them — its `arrangement` setting: a card per owner, a list
 * down a rail, a strip across the top, or 🚧 `faces` (PLAN-sheet-widget §10,
 * 2026-10-17): a strip of owner chips over ONE sheet, the viewer's own first.
 * @experimental
 */
export type StatsArrangement = 'cards' | 'list' | 'strip' | 'faces'
/** Which stats — its `slots` setting: every one, the bounded numbers only (a HUD), or the named. @experimental */
export type StatsSlots = 'all' | 'bars' | 'pick'
/** One kind of owner, in the order `owners: all` draws them, each under its own heading. @experimental */
export type StatsOwnerGroup = 'world' | 'cast' | 'places'

const STATS_OWNERS: readonly StatsOwners[] = ['cast', 'world', 'places', 'all', 'pick', 'mine', 'seats']

/** A Stats widget's settings, read (W7). @experimental */
export interface StatsSettings {
	owners: StatsOwners
	/** Which cast members, when `owners` is `cast` (the setting shows only then; `all` reads `scene`). */
	castScope: 'scene' | 'all'
	slots: StatsSlots
	arrangement: StatsArrangement
	density: 'compact' | 'full'
	/** `pickOwners`, read as {@link pickedNames}. */
	pickOwners: string[]
	pickSlots: string[]
	/** 🚧 `hideSlots`, read as {@link pickedNames}: the stats this copy leaves out, by key or label. */
	hideSlots: string[]
	/** 🚧 Offer each stat's **stat trail** (F2): a button beside it opens its changes. */
	trail: boolean
	/** 🚧 What the widget says when there is nothing to draw; `null` keeps its own sentence. */
	emptyState: string | null
	/** 🚧 How a story-time stat is spelled (`formatStoryTimeAs`); `null` keeps the calendar's spelling. */
	timeFormat: string | null
}

/**
 * A Stats widget's settings as it reads them, every one defaulted. A host
 * hands it effective settings (each key present), so the fallbacks here are
 * for a settings object written before the Stats uplift (W7, 2026-10-11)
 * and handed raw — a bare mount: ⏳ `members: scene | all` reads as
 * `castScope`, `members: pick` as `owners: pick` (with `pickMembers` as
 * `pickOwners`). World State's stored `layout` is the host's to read as
 * `arrangement` (the app's settings reader moves it), never this one's.
 * REMOVE the fallbacks in 0.7.0.
 * @experimental
 */
export function statsSettingsOf(settings: Record<string, unknown>): StatsSettings {
	const legacyMembers = settings.members
	return {
		owners: pickEnum(settings.owners, STATS_OWNERS, legacyMembers === 'pick' ? 'pick' : 'cast'),
		castScope: pickEnum(settings.castScope, ['scene', 'all'], pickEnum(legacyMembers, ['scene', 'all'], 'scene')),
		slots: pickEnum(settings.slots, ['all', 'bars', 'pick'], 'all'),
		arrangement: pickEnum(settings.arrangement, ['cards', 'list', 'strip', 'faces'], 'cards'),
		density: pickEnum(settings.density, ['compact', 'full'], 'full'),
		pickOwners: pickedNames(settings.pickOwners !== undefined ? settings.pickOwners : settings.pickMembers),
		pickSlots: pickedNames(settings.pickSlots),
		hideSlots: pickedNames(settings.hideSlots),
		trail: typeof settings.trail === 'boolean' ? settings.trail : true,
		emptyState: typeof settings.emptyState === 'string' && settings.emptyState.trim() ? settings.emptyState.trim() : null,
		timeFormat: typeof settings.timeFormat === 'string' && settings.timeFormat.trim() ? settings.timeFormat : null,
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

/**
 * 🚧 An owner's **derived values** as a sheet draws them (2026-10-18,
 * `SessionStateOwnerV1.derived`): read-only rows — no edit, no trail —
 * each with a label and a value that reads as words. Anything malformed is
 * left out; a host that sends none draws none.
 * @experimental
 */
export function derivedRowsOf(owner: SessionStateOwnerV1): Array<{ key: string; label: string; value: string }> {
	const raw = (owner as SessionStateOwnerV1 & { derived?: unknown }).derived
	if (!Array.isArray(raw)) return []
	const out: Array<{ key: string; label: string; value: string }> = []
	for (const d of raw) {
		if (!d || typeof d !== 'object') continue
		const { key, label, value } = d as { key?: unknown; label?: unknown; value?: unknown }
		if (typeof key !== 'string' || !key || typeof label !== 'string' || !label.trim()) continue
		if (!(typeof value === 'string' ? value.trim() : finiteNumber(value))) continue
		out.push({ key, label: label.trim(), value: String(value) })
	}
	return out
}

/**
 * 🚧 Where an owner's derived rows sit among its slots: right after the
 * leading bars (health first, armour class under it), else at the top.
 * @experimental
 */
export function derivedRowsAt(slots: readonly ShownSlot[]): number {
	let i = 0
	while (i < slots.length && isBarSlot(slots[i]!.slot, slots[i]!.config)) i++
	return i
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
 * world, the cast in play, the places in play (`castScope` is read under
 * `cast` alone, the one place its setting shows); `pick` — the owners
 * named, by label or key (`World` names the world), every stat shown. The
 * world is drawn only with a stat to show (or when picked). In a list or a
 * strip an owner with nothing to show is left out: an empty line is not a
 * stat; a card (and a sheet under `faces`) says so instead.
 * @experimental
 */
export type StatsView =
	| (StatsViewBase & { status: 'not-granted' | 'loading' | 'failed' | 'none-declared' })
	| (StatsViewBase & { status: 'nothing-shown'; castScope: 'scene' | 'all' })
	| (StatsViewBase & { status: 'shown'; groups: StatsGroup[] })

/**
 * 🚧 The viewer's own cast owner (`owners: mine`): the one the host marks
 * theirs (`mine` — their player seat, or the card their persona voices),
 * else the first cast member in play, else the first cast member; `null`
 * with no cast. A guest's sheet is then their own, never the host's.
 * @experimental
 */
export function mineOf(
	state: SessionStateV1,
	cast: readonly SessionStateOwnerV1[] = state.owners.filter((o) => o.kind === 'session_cast' || o.kind === 'player_seat'),
): SessionStateOwnerV1 | null {
	return (
		cast.find((o) => (o as SessionStateOwnerV1 & { mine?: boolean }).mine === true) ??
		cast.find((o) => hasAnyValue(state, o)) ??
		cast[0] ??
		null
	)
}

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
		shown(state, owner, slotMode, read.pickSlots, read.hideSlots).filter((s) => read.slots !== 'bars' || isBarSlot(s.slot, s.config))
	const as = (group: StatsOwnerGroup, slots: (owner: SessionStateOwnerV1) => ShownSlot[]) => (owner: SessionStateOwnerV1) => ({
		owner,
		group,
		slots: slots(owner),
	})
	const world = state.owners.find((o) => o.kind === 'session' && o.key === 'world') ?? null
	// A card-less player seat (`player_seat`) is a cast member with no card: its values ride in `resolved.cast` too.
	const cast = state.owners.filter((o) => o.kind === 'session_cast' || o.kind === 'player_seat')
	const places = state.owners.filter((o) => o.kind === 'session_location')
	/** The world's own stats — only with one to show. */
	const worldShown = (): StatsShownOwner[] => (world ? [as('world', show)(world)].filter((o) => o.slots.length) : [])
	/** The cast by `scope`. Scene: a member nobody has given a value to has nothing to show. */
	const castShown = (scope: 'scene' | 'all'): StatsShownOwner[] =>
		cast.filter((o) => scope === 'all' || hasAnyValue(state, o)).map(as('cast', show))
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
				// The cast by `castScope` here too: a layout that says `all` means everyone.
				{ kind: 'cast', owners: castShown(read.castScope) },
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
		case 'mine': {
			const own = mineOf(state, cast)
			groups = own ? [{ kind: 'cast', owners: [as('cast', show)(own)] }] : []
			break
		}
		case 'seats': {
			// 🚧 Every player seat (2026-10-18), the viewer's own first; never a
			// companion or an NPC card. A host that marks no seat (older) reads
			// every card-less seat, and the viewer's own.
			const seated = cast.filter(
				(o) =>
					(o as SessionStateOwnerV1 & { seat?: boolean }).seat === true ||
					o.kind === 'player_seat' ||
					(o as SessionStateOwnerV1 & { mine?: boolean }).mine === true,
			)
			const mineFirst = [
				...seated.filter((o) => (o as SessionStateOwnerV1 & { mine?: boolean }).mine === true),
				...seated.filter((o) => (o as SessionStateOwnerV1 & { mine?: boolean }).mine !== true),
			]
			groups = mineFirst.length ? [{ kind: 'cast', owners: mineFirst.map(as('cast', show)) }] : []
			break
		}
		default:
			groups = [{ kind: 'cast', owners: castShown(read.castScope) }]
	}
	// A line of a list or a strip with nothing on it is not drawn.
	if (read.arrangement !== 'cards' && read.arrangement !== 'faces')
		groups = groups.map((g) => ({ ...g, owners: g.owners.filter((o) => o.slots.length) }))
	groups = groups.filter((g) => g.owners.length)
	if (!groups.length) return { ...base, status: 'nothing-shown', castScope: read.castScope }
	return { ...base, status: 'shown', groups }
}

// ─── Faces, locks, gives (PLAN-sheet-widget §10, 2026-10-17) ────────────────

/**
 * 🚧 Every owner a `faces` arrangement offers as a chip, in the order drawn:
 * the viewer's own (`owner.mine`) first, then the rest as the groups have
 * them. The sheet under the strip is one of these.
 * @experimental
 */
export function facesOwners(view: StatsView): StatsShownOwner[] {
	if (view.status !== 'shown') return []
	const all = view.groups.flatMap((g) => g.owners)
	const mine = all.filter((o) => o.owner.mine === true)
	return [...mine, ...all.filter((o) => o.owner.mine !== true)]
}

/**
 * 🚧 A short, stable fingerprint of what one owner's sheet holds — its
 * values, slot by slot — so a faces chip can say "changed since you looked"
 * without the widget keeping the values themselves. Not a hash anyone
 * compares across installs: only this viewer's last look.
 * @experimental
 */
export function ownerSheetHash(state: SessionStateV1, owner: SessionStateOwnerV1): string {
	const parts: string[] = []
	for (const slot of slotsFor(state, owner)) {
		const v = valueOf(state, owner, slot)
		if (v !== undefined) parts.push(`${slot.slotId}=${JSON.stringify(v)}`)
	}
	let h = 5381
	const text = parts.join('\u0001')
	for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0
	return (h >>> 0).toString(36)
}

/** 🚧 Who may hand-edit one slot (`config.lock`, set by `core:outlet/set-stat-config@1`). @experimental */
export type SlotLock = 'none' | 'people' | 'all'

/** 🚧 The slot's lock as its configuration in force says it; `none` when unsaid. @experimental */
export const slotLockOf = (config: Record<string, unknown> | undefined): SlotLock =>
	config?.lock === 'people' || config?.lock === 'all' ? config.lock : 'none'

/**
 * 🚧 Is this slot closed to a person's hand edit? `people` and `all` both
 * are — the host still lets a pipeline (and, under `people`, the session's
 * owner) write it, and refuses the rest with its own sentence. A widget
 * draws it with a small lock and no edit controls.
 * @experimental
 */
export const slotLocked = (config: Record<string, unknown> | undefined): boolean => slotLockOf(config) !== 'none'

/**
 * 🚧 The repertoires a piece list is drawn against: the section's own map
 * when the host sends one there (C10: one copy, not one per owner), else
 * the owner row's.
 * @experimental
 */
export function repertoiresFor(
	state: SessionStateV1 | undefined,
	owner: SessionStateOwnerV1,
): SessionStateOwnerV1['repertoires'] {
	const section = (state as { repertoires?: SessionStateOwnerV1['repertoires'] } | undefined)?.repertoires
	if (section && typeof section === 'object' && Object.keys(section).length) {
		return owner.repertoires ? { ...owner.repertoires, ...section } : section
	}
	return owner.repertoires
}

/**
 * 🚧 Where a piece may be **given** (PLAN-sheet-widget §10; owner ruling ★4,
 * 2026-10-19): every other owner that carries the same slot — another seat
 * or cast member, or a place ("Drop at …"). `direct` when the viewer may
 * write both sides: the host gives it at once. Otherwise it is an **offer**
 * the receiver accepts or declines (`give-piece`, {@link SessionStateV1}'s
 * `offers`) — only ever to a person: a place the viewer may not write has
 * nobody to accept, and is not offered. Nothing is offered from a sheet the
 * viewer may not change.
 * @experimental
 */
export interface GiveTarget {
	owner: SessionStateOwnerV1
	/** A place: the piece is put down there, not handed over. */
	place: boolean
	/** The viewer may write both sides, so the give lands at once; else it is an offer. */
	direct: boolean
}

/**
 * 🚧 The owners a piece in `from`'s `slotId` may be given to, people first,
 * then places. A player's character (`from.seat`) gives to another player's
 * character or puts it down at a place — never to a cast member nobody
 * plays: a companion keeps no sheet a gift could land on, and is handed
 * things in the story (owner ruling ★4; the host refuses it the same way,
 * `state/give.ts`). @experimental
 */
export function giveTargets(state: SessionStateV1, from: SessionStateOwnerV1, slotId: string): GiveTarget[] {
	if (from.editable === false || slotLocked(from.configs[slotId])) return []
	const out: GiveTarget[] = []
	for (const owner of state.owners) {
		if (owner.key === from.key || owner.kind === 'session') continue
		if (!Object.hasOwn(owner.configs, slotId)) continue
		const place = owner.kind === 'session_location'
		if (!place && from.seat === true && owner.seat !== true) continue
		const direct = owner.editable !== false && !slotLocked(owner.configs[slotId])
		if (place && !direct) continue
		out.push({ owner, place, direct })
	}
	return [...out.filter((t) => !t.place), ...out.filter((t) => t.place)]
}

/**
 * 🚧 The offers on one owner's sheet ({@link SessionStateV1.offers}):
 * `incoming` — offered to it, the receiver's to accept or decline;
 * `outgoing` — offered from it, waiting on somebody else. @experimental
 */
export function offersOf(
	state: SessionStateV1 | undefined,
	owner: SessionStateOwnerV1,
): { incoming: SessionStateOfferV1[]; outgoing: SessionStateOfferV1[] } {
	const all = Array.isArray(state?.offers) ? state!.offers : []
	return {
		incoming: all.filter((o) => o.to.key === owner.key),
		outgoing: all.filter((o) => o.from.key === owner.key),
	}
}

/**
 * 🚧 A host refusal in plain words (A21). A sentence that names the
 * machinery — a slot id (`core:slot/hp@1`), an owner kind (`player_seat`),
 * a code path — reads as "You can't change this right now.", its own words
 * kept as `detail` for a tooltip; a sentence written for people stays as it
 * is ("Your sheet is kept by the Narrator…").
 * @experimental
 */
export function plainRefusal(message: string, t: (source: string) => string = (s) => s): { text: string; detail: string | null } {
	const said = message.trim()
	const internal =
		!said ||
		/[a-z][\w-]*:[a-z][\w-]*\/[\w.-]+(@\d+)?/i.test(said) ||
		/\b(session_cast|player_seat|session_location|slotId|ownerKind|owner kind|undefined|NaN|TypeError|Error:|SQL|constraint|\bat\s+\S+\s+\()/.test(said) ||
		/\b[a-z]+_[a-z_]+\b/.test(said)
	return internal ? { text: t("You can't change this right now."), detail: said || null } : { text: said, detail: null }
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
