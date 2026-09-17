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
import { type LocaleMap, type SessionShape, type SlotDecl } from './descriptors.js';
import type { AttributeSlotDecl } from './attributes.js';
export declare function assertGenreId(id: string): void;
/**
 * The core session events (24 §5), as **event ids** — `core:event/<name>@1`.
 *
 * Constants so the core vocabulary is typo-proof. Since R-4 (ruled 2026-09-15,
 * landed 2026-09-16) these ARE `CORE_EVENTS` entries (`events.ts`): one
 * registry, and a genre's event surface, a preset's `bindings` map and a spec's
 * inlet lock are all keyed by these ids. The bare names (`session-created`)
 * were the keys until the fold; a host migrates its stored keys once.
 */
export declare const sessionEvents: Readonly<{
    /** The create slot — required; exactly one pipeline per genre declares it. */
    readonly sessionCreated: 'core:event/session-created@1';
    /** The primary turn. A swipe is this pipeline re-run, not a new event. */
    readonly messageRespond: 'core:event/message-respond@1';
    /** Arbitrary buttons/triggers — the existing functions surface (19 §3). */
    readonly sessionAction: 'core:event/session-action@1';
    /** A character or persona joined; payload carries the kind. */
    readonly memberAdded: 'core:event/member-added@1';
    /** A character or persona left; payload carries the kind. */
    readonly memberRemoved: 'core:event/member-removed@1';
    /**
     * A form in a message was addressed to a participant the AI portrays
     * (R-15 *Forms*; U5d). Optional in every genre's surface: a genre that
     * binds nothing leaves such a form waiting, as it would for a person.
     */
    readonly formAddressed: 'core:event/form-addressed@1';
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
    /**
     * The **envoys** this genre brings with it (plans/29 R-18, ruled
     * 2026-09-15; built 2026-09-16 as U5g) — speakers that exist nowhere in
     * the library: Serene Pub's guide, a dungeon's narrator-in-residence. An
     * array, so a genre may offer several; the session or its preset's
     * defaults seat one or more, and `default: true` seats one with no choice.
     *
     * Normalised at declaration: every entry carries `speaks` (`in-turn`
     * unless stated), keys are unique, at most one is the default, and every
     * `name` is a locale map with `en`. Part of the declaration's hash, so a
     * changed envoy is a changed genre.
     */
    readonly envoys?: readonly EnvoyDecl[];
}
export interface GenreProps {
    name: unknown;
    family: string;
    description?: unknown;
    shape?: SessionShape;
    events?: Record<string, GenreEventDecl>;
    slots?: readonly AttributeSlotDecl[];
    envoys?: readonly EnvoyDecl[];
}
/**
 * When an envoy speaks (plans/29 R-21 (6)).
 *
 *  · `in-turn` — a turn-taking candidate like any cast character: the turn
 *    strategies may pick it, the composer's reply may be its. The default for
 *    a genre's envoys.
 *  · `on-action` — speaks **only through an action's outputs**: a dice
 *    plugin's *Roll* reports as its envoy, and no strategy ever picks it. The
 *    only value an action's envoy may carry (`ActionDecl.envoy`).
 */
export type EnvoySpeaks = 'in-turn' | 'on-action';
/**
 * A speaker a genre or a contributed action brings with it (plans/29 R-18).
 *
 * Declared in one of exactly two places — `GenreDecl.envoys[]` or
 * `ActionDecl.envoy` — and nowhere else: there is no API to add an envoy to
 * another genre and no user authors one. Addressed as `envoy:<slug>` wherever
 * a character is `character:<id>` (`participants.ts`): a genre's slug is its
 * `key`; an action's is `<plugin>.<key>`, namespaced like a slash name so it
 * cannot collide with a genre's (`envoyIdentity`).
 *
 * Its data is **configuration** (R-18 (2)): `prompts`, `description` and
 * `image` are the genre's declared defaults, read by a pipeline node through
 * `slot.prompts({ envoy })` and tuned in the Pipelines panel with deviation
 * semantics like any other setting — no second schema.
 *
 * ⚠ Not a *character* (a library row) and not a *persona* (the user's own).
 */
export interface EnvoyDecl {
    /** The genre-local key — lowercase kebab, no dots (a dot marks an action's namespace). */
    key: string;
    /** A locale map with `en` (R-20) — never a bare string, so the type says what publish enforces. */
    name: LocaleMap;
    /**
     * ⏳ An `http(s)://` URL or a `data:image/…` URI (`ENVOY_IMAGE`) — refused
     * at the declaration otherwise, because a host renders it as an `<img>`
     * source and nothing else, and a `javascript:` or `data:text/html` string
     * is not an image. Neither the SDK nor the catalog ships binary assets
     * today (widgets carry Lucide icon *names*); until a package can ship an
     * image, the string is the image.
     */
    image?: string;
    description?: LocaleMap;
    /**
     * The envoy's authored instructions — the fields of the context builder's
     * `prompts` slot (`core:task/build-template-context@1`: `systemPrompt`,
     * `postHistoryInstructions`), because that is the slot a node reads them
     * through. One vocabulary, read by reference; never a mapping.
     */
    prompts?: {
        systemPrompt?: string;
        postHistoryInstructions?: string;
    };
    /** Seated on every new session of the genre, with no choice. At most one per genre. */
    default?: boolean;
    /** See `EnvoySpeaks`. A genre's default is `in-turn`; an action's envoy is always `on-action`. */
    speaks?: EnvoySpeaks;
}
/** An envoy's key: a lowercase kebab token. Dots are reserved for an action's namespace. */
export declare const ENVOY_KEY: RegExp;
/** An envoy's image: an `http(s)://` URL or a `data:image/…` URI — an `<img>` source, nothing else. */
export declare const ENVOY_IMAGE: RegExp;
/**
 * Every fault in one envoy declaration, as sentences (the teaching-error
 * pattern, 15 §1.3). Empty when it is sound. `owner` says which of the two
 * declaring places this is, because an action's envoy has one rule of its own:
 * it may only be `on-action`.
 */
export declare function envoyFindings(raw: unknown, at: string, owner?: 'genre' | 'action'): string[];
/** The findings on a genre's whole list: each entry's, plus unique keys and at most one default. */
export declare function envoysFindings(raw: unknown, at?: string): string[];
/** One envoy in its document form: `speaks` stated, nothing else added. */
export declare function normalizeEnvoy(raw: EnvoyDecl, speaks: EnvoySpeaks): EnvoyDecl;
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
/**
 * The envoys a genre declares, by id — empty for a genre this build does not
 * declare, on the same "never guess" terms as `genreSlots`.
 */
export declare const genreEnvoys: (id: string) => readonly EnvoyDecl[];
/** One of a genre's envoys by key, or undefined. */
export declare const genreEnvoy: (g: GenreDecl | string, key: string) => EnvoyDecl | undefined;
/** A genre reference as it lands in documents: always the id. */
export declare const genreIdOf: (g: GenreDecl | string) => string;
/**
 * The configurable surface of one envoy, as a slot declaration (R-18 (2)).
 *
 * An envoy is not a node and has no registry row to carry a declaration —
 * so the SDK declares its slot from the two facts the genre does carry, its
 * `prompts` defaults and its name, the way `clauseSettingsSlotFor` declares
 * a gather clause's mode. A host renders it through the same reader a node's
 * slot goes through, at the address `envoy:<key>` (`envoyConfigKey`), with
 * the genre's text as the author default: an admin's edit is a deviation
 * above it, and clearing the edit is the genre's text again.
 *
 * `parameters`, not `prompts`, and the reason is what each kind means to a
 * panel: a `prompts` slot is a **reference** to a swappable prompt row, and
 * an envoy's instructions are not a row anybody swaps — they are the genre's
 * words, tuned in place. The slot is still *named* `prompts`, because that
 * is the name the reading node's own slot has and the name `slot.prompts({
 * envoy })` resolves at; the fields are that node's fields.
 */
export declare function envoyPromptsSlotFor(envoy: EnvoyDecl): SlotDecl;
//# sourceMappingURL=genres.d.ts.map