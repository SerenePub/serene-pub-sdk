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
import type { SessionShape } from './descriptors.js';
import type { AttributeSlotDecl } from './attributes.js';
export declare function assertGenreId(id: string): void;
/**
 * The core session events (24 §5). Constants so the core vocabulary is
 * typo-proof; custom events are open, namespaced under the declaring package
 * by the context-bound toolkit.
 */
export declare const sessionEvents: Readonly<{
    /** The create slot — required; exactly one pipeline per genre declares it. */
    readonly sessionCreated: 'session-created';
    /** The primary turn. A swipe is this pipeline re-run, not a new event. */
    readonly messageRespond: 'message-respond';
    /** Arbitrary buttons/triggers — the existing functions surface (19 §3). */
    readonly sessionAction: 'session-action';
    /** A character or persona joined; payload carries the kind. */
    readonly memberAdded: 'member-added';
    /** A character or persona left; payload carries the kind. */
    readonly memberRemoved: 'member-removed';
}>;
export type SessionEvent = (typeof sessionEvents)[keyof typeof sessionEvents];
/** One entry of a genre's event surface. */
export interface GenreEventDecl {
    /** A preset for this genre must bind this event. */
    required?: boolean;
    /**
     * An open slot: any number of pipelines may serve it (actions). A
     * non-open event binds at most one pipeline per preset.
     */
    open?: boolean;
}
export interface GenreDecl {
    readonly id: string;
    /** i18n display name — the picker card's title. */
    readonly name: unknown;
    readonly family: string;
    /** The picker card's subtitle. */
    readonly description?: unknown;
    /** The standing SessionShape every surface asks about (19 §1). */
    readonly shape?: SessionShape;
    /**
     * The event surface: which events exist for this genre, and which are
     * required. `session-created` is implicitly required for every genre and
     * is added if absent — a genre without a create pipeline is not a genre.
     */
    readonly events: Readonly<Record<string, GenreEventDecl>>;
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
    readonly slots?: readonly AttributeSlotDecl[];
}
export interface GenreProps {
    name: unknown;
    family: string;
    description?: unknown;
    shape?: SessionShape;
    events?: Record<string, GenreEventDecl>;
    slots?: readonly AttributeSlotDecl[];
}
/**
 * Declare a genre. The id is stated in full (`core:genre/chat`) — the
 * context-bound toolkit `announce()` hands out derives it from the package
 * namespace instead.
 */
export declare function genre(id: string, props: GenreProps): GenreDecl;
export declare const getGenre: (id: string) => GenreDecl | undefined;
export declare const genres: () => GenreDecl[];
export declare function _clearGenres(): void;
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
export declare const genreSlots: (id: string) => readonly AttributeSlotDecl[];
/** A genre reference as it lands in documents: always the id. */
export declare const genreIdOf: (g: GenreDecl | string) => string;
//# sourceMappingURL=genres.d.ts.map