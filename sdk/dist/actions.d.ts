/**
 * Actions — what a person (or an AI-portrayed participant) can invoke, and
 * where (plans/29 R-15 *venue* · *audience* · *quick* · *slash name*;
 * 09-AMENDMENTS-B B9, F40 — was F38 before the 2026-09-17 renumbering; ruled
 * 2026-09-15, built 2026-09-16 as U5c).
 *
 * A spec contributes actions through `contributes.actions[]`. Core's own message verbs — the floors and the
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
 *   presentation; availability is data (F40). A CSS pack may reposition the
 *   primary set, never remove an action.
 * - **slash** — the stable ASCII id a composer action is called by. Core's
 *   specs claim bare names (`advance`, `narrate`); a plugin's are
 *   `<plugin>.<action>` (`acme.roll`), the plugin id being the spec's
 *   namespace — so a collision across owners is impossible by construction,
 *   and the palette autocompletes so nobody types the long form. Never
 *   localised (R-20): the palette shows the localised `label` beside it.
 *
 * - **enabled-when** (U5e, built 2026-09-17) — whether the action is offered
 *   *now*: a declared predicate over the session's **published values**, the
 *   junction clause's shape (`{ on: 'state.world.location', truthy: true,
 *   reason }`), never code. A list means all must hold. The genre supplies
 *   defaults per function (`GenreDecl.enabledWhen`); a session may override
 *   one function's; the action's own declaration sits between. The panel
 *   renders **why** a button is grey from the failing predicate's `reason`.
 *   The shape and its evaluator live in `predicates.ts`, shared with the
 *   junction clause.
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
import { type EnabledWhen, type EnabledWhenDecl } from './predicates.js';
import type { VerdictResult } from './verdicts.js';
export type { EnabledWhen, EnabledWhenDecl } from './predicates.js';
/** The two sides of the effects line (R-15). `fiction` is the default. @experimental */
export declare const ACTION_EFFECTS: readonly ['fiction', 'world'];
/** @experimental */
export type ActionEffects = (typeof ACTION_EFFECTS)[number];
/**
 * How much an action needs the text it **collects** (lair pass R3,
 * 2026-09-28): `required` — the press does not fire without some;
 * `optional` — an empty submit fires too, and `CollectedText.ifEmpty` says
 * what that does. Was `COMPOSER_TEXT_MODES` (B10), when the text was read
 * off the composer's draft.
 * @experimental
 */
export declare const TEXT_NEEDS: readonly ['required', 'optional'];
/**
 * The text an action collects before it fires (lair pass R3, ruled
 * 2026-09-28: typing and then pressing an action is unintuitive). The press
 * opens the **collect modal**, or — S2 — a slash argument supplies it. It
 * reaches the run as `input.text`, trimmed.
 * @experimental
 */
export interface CollectedText {
    need: (typeof TEXT_NEEDS)[number];
    /** The field's label — what the modal asks: "What do you whisper?". Display text (R-20). */
    label: I18n;
    /** The empty field's placeholder. Display text (R-20). */
    placeholder?: I18n;
    /**
     * What an empty submit does, in one sentence — "The room decides."
     * **Required when `need` is `optional`**: an empty box must say what
     * pressing on will do. Display text (R-20).
     */
    ifEmpty?: I18n;
}
/**
 * The cast members an action collects before it fires (lair pass R3; the
 * whisper's use is R10): a multiselect over the session's **enabled cast
 * members**, each a `character:<id>` reference. They reach the run as
 * `input.recipients`, validated by the host: seated and enabled, no
 * duplicates, within `min` and `max`.
 * @experimental
 */
export interface CollectedRecipients {
    /** The list's label — "Who hears it". Display text (R-20). */
    label: I18n;
    /** The fewest that may be picked. Default 1; never below 1. */
    min?: number;
    /** The most that may be picked. Absent: any number. */
    max?: number;
    /**
     * The per-cast slot this action writes on each recipient, replacing what
     * it held (lair re-plan R10, 2026-09-28) — the Lair's Whisper names
     * `core:slot/whisper@1`. The collect modal shows each member's current
     * value beside their box, so an overwrite is visible before it happens.
     * Display only: what the run writes is the spec's.
     */
    overwrites?: string;
}
/**
 * The venues a `world` action may appear in: never a form, the extra tab or a
 * widget.
 *
 * ⚠ **`message` is on the owner's side since 2026-09-28** (lair re-plan R11,
 * *File as a room*). The line exists so that a character can never be asked
 * to answer an out-of-fiction question (29 R-15 *The line*), and a question
 * put to someone lives in the **`form`** venue — split out of `message` the
 * day the line was built (U5d review, S1). The `message` venue is a message's
 * own ⋮ and quick row: a person's button, pressed by the person, on a row.
 * With `act` held to `owner` / `admin` (`WORLD_ACTION_ACTORS`), no block
 * naming it, and no fire made **as** a participant, a `world` action there
 * is the owner acting on a row — the same act as the composer's button,
 * with the row as its subject. `extra` and `widget` stay out: a widget can
 * invoke without a person's press.
 * @experimental
 */
export declare const WORLD_ACTION_VENUES: readonly VenueKind[];
/** The references a `world` action's `act` audience may name: the owner, an administrator. @experimental */
export declare const WORLD_ACTION_ACTORS: readonly string[];
/** An action's side of the line: what it declared, else `fiction`. @experimental */
export declare const effectsOf: (action: {
    effects?: unknown;
}) => ActionEffects;
/**
 * The closed set of places an action may appear. Core owns it; a plugin picks.
 *
 * `form` (U5d review, S1) is the one venue nothing lists: an action carried
 * by a **form** — a `choices` or `form` block in a message — and pressed
 * only from that block (the Adventure genre's *Answer*). A `form`-venue
 * action never appears in a message's overflow, the composer's More menu or
 * any other listing (`LISTED_VENUE_KINDS`); the block's fire still resolves
 * it. A `world` action may not take it (`WORLD_ACTION_VENUES`): an
 * out-of-fiction effect is never a question a message carries.
 *
 * ⚠ **`form` stays fiction-only even after L1** (ruled 2026-09-17). A block
 * addressed to the **owner** may name a `world` action — see
 * `worldBlockFunctions` — but a *venue* is declared and an *addressee* is
 * decided at run time, so this check cannot see one and would have to admit
 * every `form`-venue world action to admit the owner's. The owner-addressed
 * block therefore names a `composer`-venue world action instead: the venue
 * says where the declaration may be OFFERED, the addressee says who may press
 * this particular button, and the two answers stay separate.
 * @experimental
 */
export declare const VENUE_KINDS: readonly ['composer', 'message', 'extra', 'widget', 'session-settings', 'pipelines', 'admin', 'review', 'form'];
/** @experimental */
export type VenueKind = (typeof VENUE_KINDS)[number];
/** The venues a listing offers — every kind but `form`, which only a block reaches. @experimental */
export declare const LISTED_VENUE_KINDS: readonly Exclude<VenueKind, 'form'>[];
/** @experimental */
export type ListedVenueKind = (typeof LISTED_VENUE_KINDS)[number];
/** Where an action appears, optionally on one channel only. @experimental */
export interface Venue {
    kind: VenueKind;
    /** A channel slug (20 §7). Absent = every channel of the session. */
    channel?: string;
}
/**
 * A contributed action, as a spec declares it under `contributes.actions[]`.
 *
 * `key` is the action's own identity within the spec — what a widget's
 * `invoke(key)` names, what the *new* marker is kept against, and, joined to
 * the spec slug as `<spec>#<key>` (`ACTION_IDENTITY`), **the one key
 * everything routes and stores by** (plans/31 V2, ruled 2026-09-17): a
 * binding's subject, a preset's included set, a session's enablement row, a
 * genre's enabled-when default, the fire, a block's `action`. There is no
 * second routing key: two specs declaring the same `key` are two actions, and
 * a person binds each on its own.
 * @experimental
 */
export interface ActionDecl {
    key: string;
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
    /** What the control reads — a string or a locale map with `en` (R-20); never the slash name. */
    label: I18n;
    /** A Lucide icon name, kebab-case. */
    icon?: string;
    /**
     * What the icon says when it stands alone — the accessible name of an
     * icon-only control (`aria-label`). Display text (R-20). Absent: the
     * `label`, which is right for nearly every action; give one only when the
     * icon-only control should read differently from the named one. Needs an
     * `icon`.
     * @experimental
     */
    iconAlt?: I18n;
    /**
     * What the action does, in one plain sentence — display text (R-20).
     * **Required** (2026-09-28): the session's action legend lists every
     * action with it, and a control shows it as its tooltip, so a person can
     * learn what a button does before pressing it. Say the effect, not the
     * mechanism: "Roll the dice and post the result."
     * @experimental
     */
    description: I18n;
    /**
     * When the action is offered (plans/29 R-15 *enabled-when*; U5e): a
     * predicate — or a list, all of which must hold — over the session's
     * published values, the junction clause's shape and never code. `on` is
     * a dotted path such as `state.world.location`, `session.generating` or
     * `item.hidden` (message venue) — not a port reference: actions live
     * outside a run. `reason` says why the control is grey. Absent: the
     * genre's default for this function, if it declares one, else always
     * enabled. See `predicates.ts`.
     */
    enabledWhen?: EnabledWhenDecl;
    /**
     * When the action is **present** at all (W-GATE D3, 2026-09-27): the
     * turn controls' present-when (B8), on a contributed action. The same
     * predicate grammar as `enabledWhen`, over the same published values,
     * and the opposite answer when it fails — the action is **hidden**, not
     * grey: left out of every listing and refused at the door when pressed
     * from one. A press on a form (a block) is judged by that form instead,
     * which is its own evidence the action has something to act on.
     *
     * For an action that is nonsense rather than merely unavailable without
     * its referent — the Lair's *Answer the door* with no door knocked
     * (`session.openForm.action`). An `item.*` predicate is refused: a
     * listing has no row to judge it on. Absent: always present.
     * @experimental
     */
    presentWhen?: EnabledWhenDecl;
    /**
     * What the action's result touches — **the effects line** (plans/29
     * R-15 *The line*; F41, was 09-B's F39; built 2026-09-17 as U5d).
     *
     * `fiction` (the default): the result stays inside the story — a
     * message, a state proposal, a narration, a branch (a copy of a session
     * is still the fiction). `world`: the result touches something outside
     * it — character cards, lorebook data, settings, permissions,
     * connections. A `world` action may appear only in the `composer`,
     * `message` (a row's own ⋮, since lair re-plan R11), `session-settings`,
     * `admin` or `review` venues (never `form`, `extra` or `widget`), its `act` audience is `owner` and/or `admin`
     * only, no block may name it **unless that block is addressed to the
     * owner** (`worldBlockFunctions`, `isOwnerAddressed`; L1, ruled
     * 2026-09-17), and the form-answer pipeline refuses to answer it — so a
     * character asking a question is fine, and a character granting another
     * character permission is impossible by construction. Refused at
     * construction, in `validate()`, in `announce.build()` and at the host's
     * publish.
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
    /**
     * What the action asks for before it fires (lair pass R3, 2026-09-28):
     * `text` (`CollectedText`) and/or `recipients` (`CollectedRecipients`).
     * Every press of a collecting action — a chip, the palette, a message's
     * ⋮, a form's option — opens the **collect modal**; S2's slash argument
     * supplies the text instead. What was collected reaches the run as
     * `input.text` and `input.recipients`. Absent: the action collects
     * nothing, and its run's `input.text` is empty. Any venue. Was
     * `composerText`, when the text was read off the composer's draft.
     * @experimental
     */
    collects?: {
        text?: CollectedText;
        recipients?: CollectedRecipients;
    };
}
/** A declaration after normalisation: venues and predicates always lists, no alias spellings, no `function`. @experimental */
export interface NormalizedAction extends ActionDecl {
    venue: Venue[];
    enabledWhen?: EnabledWhen[];
    presentWhen?: EnabledWhen[];
    envoy?: EnvoyDecl & {
        speaks: 'on-action';
    };
}
/** A contributed action's default audience: any member sees it, the owner acts. @internal */
export declare const DEFAULT_ACTION_AUDIENCE: Readonly<Audience>;
/** A core message verb's audience: whoever the message belongs to (the item rule). @experimental */
export declare const ITEM_AUDIENCE: Readonly<Audience>;
/** A bare slash name — core's and its genres'. @experimental */
export declare const BARE_SLASH: RegExp;
/** A plugin's slash name is `<plugin>.<action>`; the plugin id is the spec's namespace. @experimental */
export declare const NAMESPACED_SLASH: RegExp;
/**
 * One venue's listing (F40 — every enabled action is reachable): the
 * **primary set**, the actions declaring `quick`, and the **overflow**, the
 * rest. Every action the venue holds is in exactly one of the two, so nothing
 * is reachable only by prominence and nothing is dropped. Placement is
 * presentation: a CSS pack may reposition the primary set and never remove an
 * entry. The host's `SessionActionVenues` is this shape with its entries
 * decorated (audience, the *new* mark, enablement).
 * @experimental
 */
export interface VenueListing<A> {
    primary: A[];
    overflow: A[];
}
/** Every listed venue's listing — `form` has none (`LISTED_VENUE_KINDS`). @experimental */
export type VenueListings<A> = Record<ListedVenueKind, VenueListing<A>>;
/**
 * Place actions into their venues for one channel — the placement rule every
 * listing applies (F40; R-15 *quick*). `quick` → the primary set, else the
 * overflow; a venue naming another channel's slug is skipped (a bare slug
 * means every lane of it, 20 §7); a `form` venue is listed nowhere — the
 * block alone reaches it (U5d review, S1).
 *
 * Availability is decided BEFORE this: the genre's verbs, the preset's
 * included set and enabled-when say which actions a session offers, and the
 * host's `listSessionActions` decorates each. Pass the offered set and every
 * entry lands in each of its venues exactly once. Pure, so a host can build
 * the conformance kit's `listActions` seam on it — the SDK's own host does
 * — and the kit itself never calls it: C19 judges the listing the HOST
 * returns, entry by entry, and a rule the kit applied for the host would be
 * a rule it could not see the host break (U7 review, C1).
 * @experimental
 */
export declare function placeActions<A extends {
    venue: ReadonlyArray<Venue>;
    quick?: boolean;
}>(actions: ReadonlyArray<A>, channel?: string): VenueListings<A>;
/** The namespace of a spec id — `core:spec/narrate` → `core`, `acme:spec/roll` → `acme`. @experimental */
export declare function specNamespace(specId: string): string;
/** Is this namespace core's — the one whose actions take bare slash names? @experimental */
export declare const isCoreNamespace: (ns: string) => boolean;
/**
 * The slash name an action is called by: the declared one, else derived from
 * the key by the same rule a declared name must obey — `key` for core,
 * `<plugin>.<key>` for a plugin. Always defined, so every composer action is
 * reachable by `/` (F40) whether or not its author named one.
 * @experimental
 */
export declare function slashNameOf(action: {
    key: string;
    slash?: string;
}, specId: string): string;
/**
 * The law one action finding comes from. Nearly every fault in a declaration
 * is its shape — a venue core does not offer, a slash name outside the
 * spec's namespace, a missing label — and is **R-15**'s. The two that are
 * not are **the effects line** (F41; U7 review, W3): a `world` action in a
 * venue where a character could be asked to press it, or one whose `act`
 * audience names someone other than the owner or an administrator. The
 * validator labels each finding with its law, so a kit can key on `F41`
 * rather than on a word in the sentence.
 * @experimental
 */
export interface ActionFinding {
    law: 'R-15' | 'F41';
    message: string;
    /** What to do instead, where the law states one — an F41 finding quotes the verdict's fix. */
    fix?: string;
}
/**
 * The declaration half of the effects line's input — a `world` action's
 * declared venue, or a reference its `act` audience names. The whole
 * input, with the write and fire halves, is `EffectsLineInput` in
 * `messageBlocks.ts`, where `core:verdict/effects-line` is declared.
 * @experimental
 */
export type EffectsLineDeclarationInput = {
    kind: 'venue';
    where: string;
    effects: unknown;
    venue: unknown;
} | {
    kind: 'actor';
    where: string;
    effects: unknown;
    ref: unknown;
};
/**
 * The effects line at a declaration (R-15 *The line*; F41): a `world` action
 * is owner-only and never in a form, extra or widget venue. Judged one venue or one
 * reference at a time, so the sentence names the venue or the reference
 * that crossed.
 *
 * This is the declaration half of `effectsLineVerdict`'s judge
 * (`messageBlocks.ts`), defined here because `actionFindingsByLaw` — the
 * construction and `validate()` door — sits below that module in the
 * import graph and must not import it. The verdict calls this for a
 * `venue` or `actor` input; the door calls it directly and quotes it.
 * @experimental
 */
export declare function worldActionCrossing(input: EffectsLineDeclarationInput): VerdictResult;
/**
 * Every fault in one `ActionDecl.collects` (lair pass R3), as sentences: an
 * unknown key, a missing label, an `optional` text with no `ifEmpty`, a
 * `min` below 1 or a `max` below `min`. `where` is the field's address
 * (`contributes.actions[nudge].collects`).
 * @experimental
 */
export declare function collectsFindings(raw: unknown, where: string): string[];
/**
 * Every fault in one action declaration, as sentences — the teaching-error
 * pattern (15 §1.3). Empty when the declaration is sound.
 *
 * `specId` decides which slash grammar applies: a `core:` spec may not claim a
 * dotted name and a plugin spec may not claim a bare one, or a name outside its
 * own namespace. That rule is the whole collision guarantee.
 * @experimental
 */
export declare function actionFindings(raw: unknown, specId: string, at?: string): string[];
/** `actionFindings`, each sentence with the law it comes from (`ActionFinding`). @experimental */
export declare function actionFindingsByLaw(raw: unknown, specId: string, at?: string): ActionFinding[];
/** The slash-name grammar, applied to one name for one spec. @experimental */
export declare function slashFindings(slash: string, specId: string, where?: string): string[];
/**
 * The document form of one declaration: `venue` as a list. Returns a copy.
 * @experimental
 */
export declare function normalizeAction(raw: ActionDecl): NormalizedAction;
/**
 * `contributes` after normalisation: every action in its document form.
 * @experimental
 */
export declare function normalizeContributes<T extends {
    actions?: unknown[];
}>(contributes: T | undefined): (Omit<T, 'actions'> & {
    actions?: NormalizedAction[];
}) | undefined;
/**
 * Every action a document contributes, normalised, with the spec id each
 * came from. The one reader hosts use.
 * @experimental
 */
export declare function actionsOf(doc: {
    id: string;
    contributes?: unknown;
}): Array<NormalizedAction & {
    specId: string;
}>;
export { ACTION_IDENTITY, ACTION_IDENTITY_MAX_LENGTH, CORE_ACTION_SPEC_ID, actionIdentity, isActionIdentity, parseActionIdentity, } from './identity.js';
/**
 * A slash collision: two actions offered to one genre under one name. One
 * slash name means one action (plans/31 V2, ruled 2026-09-17): since the
 * identity `<spec>#<key>` is the only routing key, two specs claiming one
 * name are two actions a palette could not tell apart — a collision, not
 * alternatives. (Until V2 two specs sharing a *function* under one name were
 * alternatives a binding selected among; the function is gone, and so is the
 * exemption.) A plugin's names are namespaced (`acme.roll`), so a plugin
 * declaring the same `key` as a core verb is a different identity under a
 * different name, and never shadows it.
 *
 * Core's verbs hold their names first (U5c review, S1): every genre the list
 * touches is seeded with `CORE_ACTIONS` under `core`, so a core spec claiming
 * `/retry` collides with the verb rather than shadowing it in the palette. (A
 * plugin spec cannot claim a bare name at all — that is the grammar's job.)
 *
 * `slashCollisions` is the whole rule; `validate()` applies it inside one
 * document, `announce.build()` inside one package, and the host across every
 * published spec of an install (a boot-time refusal).
 * @experimental
 */
export declare function slashCollisions(actions: ReadonlyArray<NormalizedAction & {
    specId: string;
}>): string[];
/** Every finding on one document's contributed actions, sentences only. @internal */
export declare function actionDocumentFindings(doc: {
    id: string;
    contributes?: unknown;
}): string[];
/**
 * `actionDocumentFindings` with the law each sentence comes from — what
 * `validate()` labels its findings by. A slash collision is R-15's.
 * @experimental
 */
export declare function actionDocumentFindingsByLaw(doc: {
    id: string;
    contributes?: unknown;
}): ActionFinding[];
/**
 * Who core's message verbs are for and where they live — the same shape a
 * contributed action has, so the client renders one list.
 *
 * Every entry is a **built-in** (U5b): its `key` is the verb the
 * message-verb handlers know (`sessionMessages:*`), never something
 * `sessions:fireAction` routes; its identity is `core#<key>`
 * (`CORE_ACTION_SPEC_ID`), which is what a genre's enabled-when default
 * and a session's override name it by (plans/31 V2). `retry` also lives in the
 * composer's *extra* venue (the turn controls), where it acts on the newest
 * reply. Availability is the genre's (`messageVerbs`): a host lists an entry
 * only when the genre offers it; the floors are always offered.
 *
 * Four entries are not message verbs but **turn controls**
 * (`TURN_CONTROLS`, lair pass B7 + B8, R2): **`advance`**, the composer's
 * Continue, which fires the turn order's head; **`pick`**, Pick who speaks;
 * and **`narrate`**, a narrator turn — all `sessions:fireTurn` — and
 * **`retake`**, Regenerate the last turn as a whole (`sessions:retakeTurn`).
 * They live at the extra venue only, their presence is the genre's
 * `turnControls`, and they act on no row. ⚠ `advance` is not `extend` — the prefill verb that
 * extends one reply (`core#extend`, labelled Extend; renamed from
 * `continue` 2026-09-28 so Continue means one press).
 */
/**
 * A core verb is declared without a `genre` (U5c review, S-E): it is offered
 * in **every** genre — availability is the genre's `messageVerbs`, and the
 * floors are not even that — so a genre on the declaration would name one
 * and lie about the rest. `Omit` rather than a cast, so a verb missing a
 * required field is a compile error here and not a runtime surprise in the
 * host's list.
 * @experimental
 */
export interface CoreActionDecl extends Omit<NormalizedAction, 'genre'> {
    /** stop · branch · edit — present in every genre. */
    floor: boolean;
}
/**
 * The sentences beside a grey core verb, as locale maps — the `reason` of
 * each verb's enabled-when below (U5e). One vocabulary: the host's chips,
 * menus and palette read these through the verdict, and a refusal at the
 * door says the same words. The two conditions that are NOT published
 * values — an edit in progress, the audience — keep their sentences on the
 * client (`messageVerbState.ts`).
 * @internal
 */
export declare const CORE_VERB_REASONS: Readonly<{
    readonly generating: {
        readonly en: 'wait for the reply to finish';
    };
    readonly hidden: {
        readonly en: 'unhide it first';
    };
    readonly notNewest: {
        readonly en: 'only the newest reply can be regenerated';
    };
    readonly noSwipe: {
        readonly en: 'nothing to swipe to';
    };
    readonly greeting: {
        readonly en: 'a greeting is swiped, not regenerated';
    };
    readonly ownLine: {
        readonly en: 'your own line is edited, not regenerated';
    };
    readonly nobodySeated: {
        readonly en: 'nobody is seated to pick';
    };
}>;
/** @internal */
export declare const CORE_ACTIONS: ReadonlyArray<CoreActionDecl>;
/** The core action a verb is, or undefined for a verb core does not describe. @internal */
export declare const coreAction: (key: string) => CoreActionDecl | undefined;
//# sourceMappingURL=actions.d.ts.map