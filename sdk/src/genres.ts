/**
 * Session genres (24 §3) — first-class declared objects with their own ids.
 *
 * A genre is what kind of session something is: `core:genre/chat`. It owns
 * its id; the create pipeline is its **required member**, not its identity
 * (revises 23 §7). The genre object declares everything a surface asks about
 * for the life of a session — display name, family, standing shape — plus
 * its **event surface**: which session events exist for this genre and which
 * are required. Presets validate against that surface; dispatch keys on
 * (genre, event).
 *
 * Pipelines reference the genre object directly (`input(…, { genre: chat,
 * event: events.messageRespond })`) — a typed reference the compiler checks,
 * never a string retyped per spec. In the document it serializes to the id.
 */
import type { SessionShape } from './descriptors.js'
import type { AttributeSlotDecl } from './attributes.js'
import { refuseUnlessIdentical } from './hash.js'

/** `owner:genre/name` — lowercase, digits, hyphens, dots in the owner. */
const GENRE_ID = /^[a-z0-9]+(?:[.-][a-z0-9]+)*:genre\/[a-z0-9]+(?:-[a-z0-9]+)*$/

export function assertGenreId(id: string): void {
	if (!GENRE_ID.test(id))
		throw new Error(
			`'${id}' is not a valid genre id. Use 'owner:genre/name' — 'core:genre/chat', ` +
				`'acme.rp:genre/mystery'. The id is an address sessions hold for their ` +
				`lifetime; the display name lives in the declaration.`,
		)
}

/**
 * The core session events (24 §5). Constants so the core vocabulary is
 * typo-proof; custom events are open, namespaced under the declaring package
 * by the context-bound toolkit.
 */
export const sessionEvents = Object.freeze({
	/** The create slot — required; exactly one pipeline per genre declares it. */
	sessionCreated: 'session-created',
	/** The primary turn. A swipe is this pipeline re-run, not a new event. */
	messageRespond: 'message-respond',
	/** Arbitrary buttons/triggers — the existing functions surface (19 §3). */
	sessionAction: 'session-action',
	/** A character or persona joined; payload carries the kind. */
	memberAdded: 'member-added',
	/** A character or persona left; payload carries the kind. */
	memberRemoved: 'member-removed',
} as const)

export type SessionEvent = (typeof sessionEvents)[keyof typeof sessionEvents]

/** One entry of a genre's event surface. */
export interface GenreEventDecl {
	/** A preset for this genre must bind this event. */
	required?: boolean
	/**
	 * An open slot: any number of pipelines may serve it (actions). A
	 * non-open event binds at most one pipeline per preset.
	 */
	open?: boolean
}

export interface GenreDecl {
	readonly id: string
	/** i18n display name — the picker card's title. */
	readonly name: unknown
	readonly family: string
	/** The picker card's subtitle. */
	readonly description?: unknown
	/** The standing SessionShape every surface asks about (19 §1). */
	readonly shape?: SessionShape
	/**
	 * The event surface: which events exist for this genre, and which are
	 * required. `session-created` is implicitly required for every genre and
	 * is added if absent — a genre without a create pipeline is not a genre.
	 */
	readonly events: Readonly<Record<string, GenreEventDecl>>
	/**
	 * The attribute slots this genre brings — `hp` and `gold` for a dungeon
	 * crawl, `weather` and `time-of-day` for an adventure.
	 *
	 * The declarations themselves, not ids: a genre that names a slot nothing
	 * declared would be a session whose stats validate against nothing. Core
	 * owns the *types* (attributes.ts); a genre composes definitions from them,
	 * which is why this list is a genre's to carry and not core's.
	 *
	 * A genre that advertises none — the standard chat — is a session where no
	 * bar is ever drawn, which is the one-LLM-call rule holding at the surface.
	 */
	readonly slots?: readonly AttributeSlotDecl[]
}

export interface GenreProps {
	name: unknown
	family: string
	description?: unknown
	shape?: SessionShape
	events?: Record<string, GenreEventDecl>
	slots?: readonly AttributeSlotDecl[]
}

/**
 * Declare a genre. The id is stated in full (`core:genre/chat`) — the
 * context-bound toolkit `announce()` hands out derives it from the package
 * namespace instead.
 */
export function genre(id: string, props: GenreProps): GenreDecl {
	assertGenreId(id)
	const events: Record<string, GenreEventDecl> = { ...(props.events ?? {}) }
	// Every genre has the create slot, stated or not — stating it merely
	// confirms; omitting it must not produce a genre nothing can instantiate.
	events[sessionEvents.sessionCreated] = {
		...(events[sessionEvents.sessionCreated] ?? {}),
		required: true,
	}
	const decl: GenreDecl = Object.freeze({
		id,
		name: props.name,
		family: props.family,
		description: props.description,
		shape: props.shape,
		events: Object.freeze(events),
		slots: props.slots ? Object.freeze([...props.slots]) : undefined,
	})
	const existing = registry.get(id)
	if (existing)
		refuseUnlessIdentical(existing, decl, `duplicate genre id: ${id}`, GENRE_DISPLAY_KEYS)
	registry.set(id, decl)
	return decl
}

/**
 * Declared genres, by id.
 *
 * ⚠ **Registered, not merely returned**, and the reason is `slots`. A genre
 * carries the attribute slots it brings, and the only party that can answer
 * "does THIS session have health?" is the genre the session was created under —
 * the declarations registry is global, so a reader that walked it would put a
 * health bar on every chat session on the instance, which is the one thing the
 * stats design says a newcomer must never see. A session holds a genre id;
 * this is what turns that id back into the list.
 *
 * Stored as a fact about the running code, like every other registry here: an
 * identical re-declaration is a no-op so a dev-server reload does not throw,
 * and a *different* declaration under a claimed id throws with both hashes
 * named.
 */
const registry = new Map<string, GenreDecl>()

/** Display text stripped from the comparison — see `SLOT_DISPLAY_KEYS`. */
const GENRE_DISPLAY_KEYS = { display: ['name', 'description'] } as const

export const getGenre = (id: string): GenreDecl | undefined => registry.get(id)
export const genres = (): GenreDecl[] => [...registry.values()]
export function _clearGenres(): void {
	registry.clear()
}

/**
 * The attribute slots a session of this genre carries.
 *
 * An id this build does not declare answers with an empty list rather than
 * with every slot in the registry: an unknown genre is a genre whose vocabulary
 * this install cannot state, and guessing it is how a stat appears where the
 * author never put one. Values already stored against such a session are
 * untouched — they are read as opaque data, which is the standing "never
 * refuse, fall back and say so" rule for a stale binding.
 */
export const genreSlots = (id: string): readonly AttributeSlotDecl[] =>
	registry.get(id)?.slots ?? []

/** A genre reference as it lands in documents: always the id. */
export const genreIdOf = (g: GenreDecl | string): string => {
	const id = typeof g === 'string' ? g : g.id
	assertGenreId(id)
	return id
}
