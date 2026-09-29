/**
 * What core's two state widgets draw (R21), from the `session_state` section
 * and their settings — the reading the native World State and Stats widgets
 * did against the page's store, as plain functions over the section, so the
 * remote widgets and their tests share one answer.
 *
 * A value is looked up by its slot's QUALIFIED key (every value is filed
 * under it; the bare key is the first claimant's display name), and an owner
 * carries a slot exactly when the slot's id is a key of its `configs`.
 */
import type { SessionStateOwnerV1, SessionStateSlotV1, SessionStateV1, SlotListItem } from '@serene-pub/sdk'
import { clampToBounds, formatSlotValue, type BarBounds } from './barMath.js'

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

/** @experimental */
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

/** One cast member's card. @experimental */
export interface StatsMember {
	owner: SessionStateOwnerV1
	slots: ShownSlot[]
}

/**
 * The Stats widget's drawing: `loading` before the first read; `failed`
 * when that first read was refused (the section's error is the whole story);
 * `none-declared` when no slot is declared at all; `no-members` when nobody
 * the `members` setting admits is left (`pick` says so differently);
 * `not-granted` when the host said the widget does not hold `session:state`.
 * @experimental
 */
export type StatsView =
	| { status: 'not-granted'; density: 'compact' | 'full' }
	| { status: 'loading'; density: 'compact' | 'full' }
	| { status: 'failed'; density: 'compact' | 'full' }
	| { status: 'none-declared'; density: 'compact' | 'full' }
	| { status: 'no-members'; density: 'compact' | 'full'; members: 'scene' | 'all' | 'pick' }
	| { status: 'shown'; density: 'compact' | 'full'; members: StatsMember[] }

/** @experimental */
export function statsView(
	state: SessionStateV1 | undefined,
	settings: Record<string, unknown>,
	/** Does the widget hold `session:state` — `undefined` until the host says (`ctx.granted`). */
	granted?: boolean,
): StatsView {
	const density = pickEnum(settings.density, ['compact', 'full'], 'full')
	if (granted === false) return { status: 'not-granted', density }
	if (state && !state.loaded && state.error) return { status: 'failed', density }
	if (!state || !state.loaded) return { status: 'loading', density }
	if (!state.slots.length) return { status: 'none-declared', density }
	const membersMode = pickEnum(settings.members, ['scene', 'all', 'pick'], 'scene')
	const slotsMode = pickEnum(settings.slots, ['all', 'pick'], 'all')
	const pickedMembers = pickedNames(settings.pickMembers)
	const pickedSlots = pickedNames(settings.pickSlots)
	const members = state.owners
		// The cast's alone: a location (phase 4) is drawn by World State.
		.filter((o) => o.kind === 'session_cast')
		.filter((owner) => {
			if (membersMode === 'all') return true
			if (membersMode === 'pick')
				return pickedMembers.includes(owner.label.toLowerCase()) || pickedMembers.includes(owner.key)
			// Scene: whoever has state in play. A member nobody has given a value
			// to has nothing to show, and an empty card is not a stat.
			return hasAnyValue(state, owner)
		})
		.map((owner) => ({ owner, slots: shown(state, owner, slotsMode, pickedSlots) }))
	if (!members.length) return { status: 'no-members', density, members: membersMode }
	return { status: 'shown', density, members }
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
