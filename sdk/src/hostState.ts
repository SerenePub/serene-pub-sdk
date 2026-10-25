/**
 * 🚧 **Host state** (RF fix 8, owner ruling 2026-10-23): what the host keeps
 * of a session beside the rules' attributes — never an attribute.
 *
 * Attributes are the session's rules' alone ("sessions never add
 * attributes"; genres declare none, they say what they play best with
 * through `uses`). What a session also needs that no ruleset should have to
 * declare is the host's:
 *
 *  · **where and when** — the host's world state: the place (`location`,
 *    on the world wherever a genre's scenes are placed by it, or on each
 *    character where a genre's party may split) and the time (the session's story clock, or a story
 *    time kept on the world). Scopes, routines and scenes read them; a
 *    sheet shows them in a row of their own, never among the attributes; a
 *    prompt's state block reads them as place and time words;
 *  · ⏳ **carried** — what someone carries, the host's carried zone (every
 *    session has one) kept as a list (`inventory`) where a genre's pipelines
 *    hand out the lorebook's items as item lines (Story, the Lair) — until
 *    those lines write the zone itself; drawn as what a holder carries, never
 *    among the attributes;
 *  · **tool state** — what a genre's own pipelines keep for their tools (the
 *    Lair's whisper and standing direction, the crawl's standing orders and
 *    fate). Read and written by those pipelines exactly as before (anchored
 *    to the message like every value, earshot kept), never on the sheet
 *    among the attributes, never a carry switch, never counted in fit.
 *
 * Stored as slot values, as they always were, so nothing stored moves: what
 * changed is who declares them. A genre declares none (its `slots`, `sheets`
 * and `customAttributes` are retired); core's catalogue declares the host's
 * own here (`declareHostState`), each tool scoped to the genres whose
 * pipelines keep it — beside its annex fields, which a package's tools use.
 *
 * ⚠ Not an **attribute** (the rules'); not an **annex field** (a package's
 * own document); not a **host fact** (what a registration's `when` reads of
 * the run).
 * @experimental
 */

import type { SlotAppliesTo } from './attributes.js'
import { getGenre, type GenreDecl } from './genres.js'

/**
 * 🚧 What a host-kept value is: a place, a time, ⏳ what someone carries (the
 * host's carried zone, kept as a list where a genre's pipelines hand out a
 * lorebook's items as item lines), or a genre tool's own. @experimental
 */
export const HOST_STATE_ROLES = ['place', 'time', 'carried', 'tool'] as const
/** @experimental */
export type HostStateRole = (typeof HOST_STATE_ROLES)[number]

/**
 * 🚧 The host's place: where someone is, or where the scene is
 * (`core:slot/location@1`, a premade stat since 2026-09-26). Spelled here
 * because a genre's scene place (`shape.scenes.place`) must name a value the
 * host keeps, and this is the only one there is.
 * @experimental
 */
export const HOST_PLACE_SLOT_ID = 'core:slot/location@1'

/** 🚧 The key a template reads the host's place under (`state.world.location`). @experimental */
export const HOST_PLACE_KEY = 'location'

/**
 * 🚧 One value the host keeps (`declareHostState`): the slot it is stored
 * under, its role, the owners it is kept on (narrowing the slot's own), and
 * the genres whose sessions keep it.
 * @experimental
 */
export interface HostStateDecl {
	readonly slot: string
	readonly role: HostStateRole
	readonly owners?: readonly SlotAppliesTo[]
	/** The genres whose sessions keep it, by declaration or id. */
	readonly genres: readonly (string | { readonly id: string })[]
}

const registry: HostStateDecl[] = []

/** The genre ids a declaration names. */
const genreIdsOf = (d: HostStateDecl): string[] => d.genres.map((g) => (typeof g === 'string' ? g : g.id))

/** One declaration's problems, in words. @internal */
export function hostStateFindings(d: unknown, at = 'hostState'): string[] {
	if (!d || typeof d !== 'object') return [`${at} is { slot, role, owners?, genres }`]
	const r = d as Record<string, unknown>
	const out: string[] = []
	if (typeof r.slot !== 'string' || !r.slot) out.push(`${at}.slot names the slot the value is stored under`)
	if (!(HOST_STATE_ROLES as readonly unknown[]).includes(r.role)) out.push(`${at}.role is one of ${HOST_STATE_ROLES.join(', ')}`)
	if (r.owners !== undefined && (!Array.isArray(r.owners) || r.owners.some((o) => o !== 'cast' && o !== 'world' && o !== 'location')))
		out.push(`${at}.owners is a list of cast, world and location`)
	if (!Array.isArray(r.genres) || !r.genres.length) out.push(`${at}.genres names at least one genre`)
	return out
}

/**
 * 🚧 Declare what the host keeps (core's catalogue, on import). Idempotent:
 * a module re-evaluating declares the same rows again, which are kept once.
 * @internal
 */
export function declareHostState(decls: readonly HostStateDecl[]): void {
	for (const [i, d] of decls.entries()) {
		const found = hostStateFindings(d, `hostState[${i}]`)
		if (found.length) throw new Error(found.join('\n'))
		const key = JSON.stringify([d.slot, d.role, d.owners ?? null, genreIdsOf(d)])
		if (registry.some((r) => JSON.stringify([r.slot, r.role, r.owners ?? null, genreIdsOf(r)]) === key)) continue
		registry.push(Object.freeze({ ...d, ...(d.owners ? { owners: Object.freeze([...d.owners]) } : {}) }))
	}
}

/** The world's place, kept for every genre whose scenes are placed there (`shape.scenes.place`). */
const WORLD_PLACE: HostStateDecl = Object.freeze({ slot: HOST_PLACE_SLOT_ID, role: 'place', owners: Object.freeze(['world'] as const), genres: Object.freeze([]) })

/**
 * 🚧 What the host keeps in a session of this genre, in declaration order:
 * the world's place wherever the genre's scenes are placed by it
 * (`shape.scenes.place.stateKey` is `location` — derived from what the genre
 * says of its scenes, so a plugin genre with placed scenes has it too), then
 * each row of core's catalogue whose `genres` names it. The same slot may be
 * kept on several owners by several rows (the place on the world for one
 * genre, on each character for another); a reader merges them by slot.
 * @experimental
 */
export function hostStateFor(genre: string | Pick<GenreDecl, 'id' | 'shape'> | null | undefined): readonly HostStateDecl[] {
	const g = typeof genre === 'string' ? getGenre(genre) : genre
	const id = typeof genre === 'string' ? genre : genre?.id
	if (!id) return []
	const placed = (g?.shape as { scenes?: { place?: { stateKey?: unknown } } } | undefined)?.scenes?.place?.stateKey === HOST_PLACE_KEY
	return [...(placed ? [WORLD_PLACE] : []), ...registry.filter((d) => genreIdsOf(d).includes(id))]
}

/**
 * 🚧 The role a slot plays as host state in a genre's sessions, else
 * `undefined` (it is an attribute, or nothing this session keeps).
 * @experimental
 */
export function hostStateRoleOf(slotId: string, genre: string | Pick<GenreDecl, 'id' | 'shape'> | null | undefined): HostStateRole | undefined {
	return hostStateFor(genre).find((d) => d.slot === slotId)?.role
}

/** 🚧 Whether the host keeps this slot in any genre (the place always is). @experimental */
export const isHostStateSlot = (slotId: string): boolean => slotId === HOST_PLACE_SLOT_ID || registry.some((d) => d.slot === slotId)

/** Every declaration, for tests and the docs compiler. @internal */
export const hostStateDecls = (): readonly HostStateDecl[] => [...registry]

/** @internal */
export function _clearHostState(): void {
	registry.length = 0
}

/**
 * ⏳ Forget what the host keeps for one genre alone (a package's genre
 * withdrawn or re-registered): its rows whose `genres` name it and nothing
 * else. Core's own are never a package's. @internal
 */
export function _withdrawHostStateOf(genreId: string): void {
	if (genreId.startsWith('core:')) return
	for (let i = registry.length - 1; i >= 0; i--) {
		const ids = genreIdsOf(registry[i]!)
		if (ids.length === 1 && ids[0] === genreId) registry.splice(i, 1)
	}
}
