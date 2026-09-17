/**
 * Actions — what a person (or an AI-portrayed participant) can invoke, and
 * where (plans/29 R-15 *venue* · *audience* · *quick* · *slash name*;
 * 09-AMENDMENTS-B B9, F38; ruled 2026-09-15, built 2026-09-16 as U5c).
 *
 * A spec contributes actions through `contributes.actions[]` (was
 * `contributes.triggers[]`, kept one release as a deprecated alias the
 * builder normalises). Core's own message verbs — the floors and the
 * built-ins of U5b — are described by the same shape in `CORE_ACTIONS`, so
 * a client renders **one list** per venue and never hand-writes a verb button.
 *
 * ## The four declarations
 *
 * - **venue** — where the action appears, *per channel*: `{ kind, channel? }`.
 *   `VENUE_KINDS` is a closed set core owns; a plugin picks from it. An
 *   action may name several venues. A venue with no `channel` appears on
 *   every channel of the session.
 * - **audience** — who may *see* and who may *act*, as participant
 *   references (`participants.ts`). Defaults per kind: a contributed action
 *   is seen by any `participant` and acted on by the `owner`
 *   (`DEFAULT_ACTION_AUDIENCE`); a core message verb is `item` — whoever the
 *   message belongs to, decided against the row at the venue.
 * - **quick** — the one prominence flag. Every venue is a **primary set**
 *   (`quick: true`) plus an **overflow** that always lists every enabled
 *   action; composer actions are always reachable through `/`. Placement is
 *   presentation; availability is data (F38). A CSS pack may reposition the
 *   primary set, never remove an action.
 * - **slash** — the stable ASCII id a composer action is called by. Core's
 *   specs claim bare names (`continue`, `narrate`); a plugin's are
 *   `<plugin>.<action>` (`acme.roll`), the plugin id being the spec's
 *   namespace — so a collision across owners is impossible by construction,
 *   and the palette autocompletes so nobody types the long form. Never
 *   localised (R-20): the palette shows the localised `label` beside it.
 *
 * `enabledWhen` is reserved for U5e (a junction-shaped predicate) and is not
 * read by this release.
 *
 * ## What this is not
 *
 * Not a *pipeline* — an action *starts* one (`function` is the key routing
 * resolves, 19 §3). Not an *event* — those are core-owned occurrences. Not
 * *availability* — the genre's `messageVerbs` and the preset's included set
 * decide that; a declaration here says where and to whom an available action
 * is offered.
 */
import type { Audience } from './participants.js';
import type { I18n } from './descriptors.js';
import { type EnvoyDecl } from './genres.js';
/** The two sides of the effects line (R-15). `fiction` is the default. */
export declare const ACTION_EFFECTS: readonly ['fiction', 'world'];
export type ActionEffects = (typeof ACTION_EFFECTS)[number];
/** The venues a `world` action may appear in: never a message, the extra tab or a widget. */
export declare const WORLD_ACTION_VENUES: readonly VenueKind[];
/** The references a `world` action's `act` audience may name: the owner, an administrator. */
export declare const WORLD_ACTION_ACTORS: readonly string[];
/** An action's side of the line: what it declared, else `fiction`. */
export declare const effectsOf: (action: {
    effects?: unknown;
}) => ActionEffects;
/** The closed set of places an action may appear. Core owns it; a plugin picks. */
export declare const VENUE_KINDS: readonly ['composer', 'message', 'extra', 'widget', 'session-settings', 'pipelines', 'admin', 'review'];
export type VenueKind = (typeof VENUE_KINDS)[number];
/** Where an action appears, optionally on one channel only. */
export interface Venue {
    kind: VenueKind;
    /** A channel slug (20 §7). Absent = every channel of the session. */
    channel?: string;
}
/**
 * A contributed action, as a spec declares it under `contributes.actions[]`.
 *
 * `key` is the action's own identity within the spec — what a widget's
 * `invoke(key)` names and what the *new* marker is kept against;
 * `function` is the function key the fire routes (several actions, and
 * several specs, may share one). They coincide for every action core ships.
 */
export interface ActionDecl {
    key: string;
    function: string;
    /**
     * The genre this action serves — a genre id (24 §3). Required (U5c
     * review, W5): an action is offered *to a genre*, and one naming none
     * would be offered to nobody while still claiming a slash name — so it is
     * refused at construction, in `validate()` and in `announce.build()`.
     */
    genre: string;
    venue: Venue | Venue[];
    audience?: Audience;
    quick?: boolean;
    /** The slash name. Composer actions without one are called by their `key`. */
    slash?: string;
    label: I18n;
    /** A Lucide icon name, kebab-case. */
    icon?: string;
    description?: I18n;
    /** Reserved for U5e — a declared predicate, the junction clause's shape. Not read yet. */
    enabledWhen?: unknown;
    /**
     * What the action's result touches — **the effects line** (plans/29
     * R-15 *The line*; 09-B F39; built 2026-09-17 as U5d).
     *
     * `fiction` (the default): the result stays inside the story — a
     * message, a state proposal, a narration, a branch (a copy of a session
     * is still the fiction). `world`: the result touches something outside
     * it — character cards, lorebook data, settings, permissions,
     * connections. A `world` action may appear only in the `composer`,
     * `session-settings`, `admin` or `review` venues (never `message`,
     * `extra` or `widget`), its `act` audience is `owner` and/or `admin`
     * only, no block may name it (`worldBlockFunctions`), and the
     * form-answer pipeline refuses to answer it — so a character asking a
     * question is fine, and a character granting another character
     * permission is impossible by construction. Refused at construction, in
     * `validate()`, in `announce.build()` and at the host's publish.
     */
    effects?: ActionEffects;
    /**
     * The speaker this action's results post as (plans/29 R-18 (1), R-21
     * (6); built 2026-09-16 as U5g) — a dice plugin's *Roll* reporting as
     * "the Dice Master". Addressed as `envoy:<plugin>.<key>`
     * (`envoyIdentity({ action: { specId } }, key)`), a cast member with
     * `origin: action` once it has posted, and **`on-action` only**: it
     * speaks through this action's outputs and is never a turn-taking
     * candidate. `speaks` is stamped by `normalizeAction` and a declaration
     * saying `in-turn` is refused.
     */
    envoy?: EnvoyDecl;
}
/** A declaration after normalisation: venues always a list, no alias spellings. */
export interface NormalizedAction extends ActionDecl {
    venue: Venue[];
    envoy?: EnvoyDecl & {
        speaks: 'on-action';
    };
}
/**
 * @deprecated The pre-U5c spelling under `contributes.triggers[]`: `kind`
 * became `venue` in U3, and `i18n` is `label` here. Normalised by the builder
 * for one release; a document stored by this release only ever carries
 * `actions`.
 */
export interface TriggerDeclAlias {
    genre?: string;
    /** @deprecated renamed to `genre` (24 §2). */
    mode?: string;
    function: string;
    venue: 'composer' | 'message';
    i18n?: unknown;
    icon?: string;
}
/** A contributed action's default audience: any member sees it, the owner acts. */
export declare const DEFAULT_ACTION_AUDIENCE: Readonly<Audience>;
/** A core message verb's audience: whoever the message belongs to (the item rule). */
export declare const ITEM_AUDIENCE: Readonly<Audience>;
/** A bare slash name — core's and its genres'. */
export declare const BARE_SLASH: RegExp;
/** A plugin's slash name is `<plugin>.<action>`; the plugin id is the spec's namespace. */
export declare const NAMESPACED_SLASH: RegExp;
/** The namespace of a spec id — `core:spec/narrate` → `core`, `acme:spec/roll` → `acme`. */
export declare function specNamespace(specId: string): string;
/** Is this namespace core's — the one whose actions take bare slash names? */
export declare const isCoreNamespace: (ns: string) => boolean;
/**
 * The slash name an action is called by: the declared one, else derived from
 * the key by the same rule a declared name must obey — `key` for core,
 * `<plugin>.<key>` for a plugin. Always defined, so every composer action is
 * reachable by `/` (F38) whether or not its author named one.
 */
export declare function slashNameOf(action: {
    key: string;
    slash?: string;
}, specId: string): string;
/**
 * Every fault in one action declaration, as sentences — the teaching-error
 * pattern (15 §1.3). Empty when the declaration is sound.
 *
 * `specId` decides which slash grammar applies: a `core:` spec may not claim a
 * dotted name and a plugin spec may not claim a bare one, or a name outside its
 * own namespace. That rule is the whole collision guarantee.
 */
export declare function actionFindings(raw: unknown, specId: string, at?: string): string[];
/** The slash-name grammar, applied to one name for one spec. */
export declare function slashFindings(slash: string, specId: string, where?: string): string[];
/**
 * The document form of one declaration: a trigger alias folded into an action,
 * `mode` into `genre`, `i18n` into `label`, `venue` into a list. Returns a copy.
 */
export declare function normalizeAction(raw: ActionDecl | TriggerDeclAlias): NormalizedAction;
/**
 * `contributes` after normalisation: `triggers` folded into `actions`, one
 * release. A document carrying both keeps both lists' entries.
 */
export declare function normalizeContributes<T extends {
    actions?: unknown[];
    triggers?: unknown[];
}>(contributes: T | undefined): (Omit<T, 'actions' | 'triggers'> & {
    actions?: NormalizedAction[];
}) | undefined;
/**
 * Every action a document contributes, normalised — the `triggers` alias
 * folded in — with the spec id each came from. The one reader hosts use, so
 * the alias is honoured in exactly one place.
 */
export declare function actionsOf(doc: {
    id: string;
    contributes?: unknown;
}): Array<NormalizedAction & {
    specId: string;
}>;
/** The spec id core's own verbs are listed under — a name, not a row. */
export declare const CORE_ACTION_SPEC_ID = "core";
/**
 * An action's **identity** on the wire: `<spec slug>#<key>` — a spec slug
 * (`core`, `core:spec/narrate`, `acme:spec/roll`; versionless, so no `@`)
 * and a key (a lowercase kebab token), joined by `#`. One string names one
 * declaration; everything that keys on an action keys on this — a preset's
 * included set, a session's enablement row, the fire, a block's `action`,
 * the *new* mark. Never the bare function: several actions, and several
 * specs, may share one. The host's `shared/actions/identity.ts` reads the
 * same grammar from here.
 */
export declare const ACTION_IDENTITY: RegExp;
/** The longest identity the wire accepts; a spec slug is never near this. */
export declare const ACTION_IDENTITY_MAX_LENGTH = 200;
/**
 * A slash collision: two actions offered to one genre under one name for two
 * different functions. Two specs contributing the **same function** under one
 * name are alternatives the binding selects among (19 §3), not a collision —
 * the name still means one thing.
 *
 * Core's verbs hold their names first (U5c review, S1): every genre the list
 * touches is seeded with `CORE_ACTIONS` under `core`, so a core spec claiming
 * `/retry` for some other function collides with the verb rather than
 * shadowing it in the palette. (A plugin spec cannot claim a bare name at
 * all — that is the grammar's job.)
 *
 * `slashCollisions` is the whole rule; `validate()` applies it inside one
 * document, `announce.build()` inside one package, and the host across every
 * published spec of an install (a boot-time refusal).
 */
export declare function slashCollisions(actions: ReadonlyArray<NormalizedAction & {
    specId: string;
}>): string[];
/** Every finding on one document's contributed actions, sentences only. */
export declare function actionDocumentFindings(doc: {
    id: string;
    contributes?: unknown;
}): string[];
/**
 * Who core's message verbs are for and where they live — the same shape a
 * contributed action has, so the client renders one list.
 *
 * Every entry is a **built-in** (U5b): its `function` is the verb the
 * message-verb handlers know (`sessionMessages:*`), never something
 * `sessions:triggerFunction` routes. `retry` and `continue` also live in the
 * composer's *extra* venue (the turn controls), where they act on the newest
 * reply. Availability is the genre's (`messageVerbs`): a host lists an entry
 * only when the genre offers it; the floors are always offered.
 */
/**
 * A core verb is declared without a `genre` (U5c review, S-E): it is offered
 * in **every** genre — availability is the genre's `messageVerbs`, and the
 * floors are not even that — so a genre on the declaration would name one
 * and lie about the rest. `Omit` rather than a cast, so a verb missing a
 * required field is a compile error here and not a runtime surprise in the
 * host's list.
 */
export interface CoreActionDecl extends Omit<NormalizedAction, 'genre'> {
    /** stop · branch · edit — present in every genre. */
    floor: boolean;
}
export declare const CORE_ACTIONS: ReadonlyArray<CoreActionDecl>;
/** The core action a verb is, or undefined for a verb core does not describe. */
export declare const coreAction: (key: string) => CoreActionDecl | undefined;
//# sourceMappingURL=actions.d.ts.map