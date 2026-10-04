/**
 * The widget data contract — ONE envelope every session widget receives,
 * native and frame alike (PLAN 25, ruled 2026-08-30).
 *
 * A native widget reads these sections through the host's in-document context
 * (live, reactive); a frame receives the same sections snapshotted over its
 * port. Field-for-field identical: reactivity is the native analog of a push,
 * and that is the whole of the difference. The declarations live here so the
 * two deliveries cannot drift — a plugin compiled against this package sees
 * exactly the shapes an instance sends.
 *
 * These types are TRANSPORT-NEUTRAL. The frame wire that carries them is
 * `surfaces.ts` (`HostFrameMessage` / `FrameHostMessage`); the host internals
 * that produce them — measuring a box, deciding a grant — are core's and are
 * not declared here.
 *
 * ## Two version clocks
 *
 *  - `WIDGET_PROTOCOL` versions the TRANSPORT — the verbs (`action` / `invoke`
 *    / `request` / `menu` / `on`) and the message kinds. Rev only when the wire
 *    itself changes.
 *  - Each DATA section is a bag of versioned shapes (`layout: { v1 }`, …). When
 *    a pre-existing key inside a section changes meaning, emit `v2` alongside
 *    `v1` for a transition window; old widgets read `.v1`, new ones read `.v2`.
 *    ADDITIVE keys go straight into the existing `v1` — no bump.
 *
 * ## Base vs scoped
 *
 * Base sections ({@link WIDGET_BASE_SECTIONS}: layout / session / channels /
 * messages / props / actions / settings / annex / locale / viewer /
 * turnOrder) are delivered to every widget that READS them (R75,
 * `WidgetDecl.reads`; a declaration without `reads` reads all of them, which
 * is every widget written before R75). Scoped sections
 * ({@link WidgetScopedSections}, the one table) appear ONLY when the widget
 * declared the scope AND it was granted — the same deny-by-default a frame
 * gets, applied at projection so a native widget is no more privileged.
 * Absence means "not granted", never a silent empty — or "not posted yet":
 * which of the two, the host says with `grants` (the scopes the widget
 * holds, on mount and on every change), so a widget draws "not granted"
 * rather than loading forever.
 */
import type { TurnOrderV1 } from './turnOrder.js';
import type { SlotAppliesTo, SlotType, SlotValue } from './attributes.js';
import type { FieldDecl } from './settings.js';
import type { StatusText, WidgetActionReason } from './status.js';
import type { EnabledWhen } from './predicates.js';
/** Free-form data riding beside a verb or an event. Keys are the sender's. @experimental */
export type WidgetPayload = Record<string, unknown>;
/**
 * The width class of a widget's own box.
 *
 * A fact about the widget's box, not the window: a widget in a 240px rail is
 * `compact` however wide the viewport is, and that is what it reflows against.
 * @experimental
 */
export type WidgetTier = 'compact' | 'cozy' | 'roomy' | 'wide';
/** Where this widget sits, and what the host is painting around it. @experimental */
export interface LayoutV1 {
    /**
     * Which zone in the page-level zone grid (identity + totals).
     *
     * Cell counts of the zone's grid — the session layout's whole cells. Read
     * them for where the widget sits, never for its size: `tier`, `box.px`,
     * `box.edges` and `chrome` are the fields a widget sizes itself by.
     */
    zone: {
        columns: number;
        column: number;
        rows: number;
        row: number;
    };
    /** Where this widget sits within its zone. */
    box: {
        /** Width in the zone's cells. See `zone`. */
        cols: number;
        /**
         * Height in the zone's cells, or null when the widget grows / is
         * unbounded. See `zone`.
         */
        rows: number | null;
        /** Which zone edges the widget touches. */
        edges: {
            top: boolean;
            right: boolean;
            bottom: boolean;
            left: boolean;
        };
        /**
         * The widget box as the host MEASURED it, in CSS pixels.
         *
         * The size a widget can actually draw against: whatever the browser
         * resolved for the widget's box, so the number is the answer rather
         * than a cell count multiplied by the cell module.
         *
         * Absent when the host has not measured this mount — a widget in a
         * pop-over, a first frame before layout settles, a host that measures
         * width alone. Absent is "unknown", never zero, so a widget reads
         * `tier` when it is missing rather than reflowing against a 0.
         */
        px?: {
            width: number;
            height: number;
        };
    };
    /** The width class of this widget's own box. */
    tier: WidgetTier;
    /** Guaranteed-visible: placed in the grid, not collapsible/closable away. */
    pinned: boolean;
    collapsed: boolean;
    drawered: boolean;
    /**
     * Decoration the HOST is painting, so the widget suppresses its own and
     * never double-draws (a widget renders its own backdrop only where false).
     */
    chrome: {
        background: boolean;
        wrapper: boolean;
        titleBar: boolean;
        padding: boolean;
        /**
         * @experimental Is the host drawing its **card** around this widget —
         * a surface, a border and (outside a tab group) a title bar?
         *
         * Off by default for a widget placed in a zone: it sits flush in its
         * cell and its own style decides whether it has a surface. On when the
         * person turned on the widget's **Card** setting (`hostCard`), and
         * always on while the widget is momentarily opened over the session (a
         * pop-over, a flyout, the phone's panel sheet). When it is on,
         * `background` and `wrapper` are true as well.
         *
         * The page also marks the widget's box `data-sp-card="on"` or `"off"`,
         * so a stylesheet can key off the same fact without reading this.
         */
        card: boolean;
    };
}
/** The session a widget is drawn in, as much of it as every widget may see. @experimental */
export interface SessionV1 {
    id: number;
    name: string | null;
}
/**
 * @experimental One message as a widget sees it (🚧 `parts`).
 *
 * The host posts the session's message rows, so what arrives is a row: `id`,
 * `role` and `content` are on every one of them, and the rest is present when
 * the row carries it. The index signature is the honest part of the shape —
 * the host forwards the row, less only its bookkeeping (below), so columns
 * not named here ride along at the top level, and a widget that reaches for one is
 * reading something core may narrow without notice.
 *
 * A widget renders from the named fields. `extras` is the row's own bag, not a
 * catch-all for the unnamed ones.
 *
 * Withheld, though the stored row carries them: `userId` (a widget never
 * compares user ids — the host answers "may this viewer act" itself),
 * `queueItemId`, `debugMeta` (the compiled prompt — admins read it through
 * the host's `prompt-details`), `embedding` (the row's vector),
 * `embeddingModel`, `embeddingSourceHash` and `embedTextHash` (the hashes the
 * embedding queue compares), `vectorizedAt` and `version`. They are host
 * bookkeeping, listed once in {@link MESSAGE_HOST_FIELDS}: a host strips them
 * from every row it posts ({@link projectMessageRow}), so a widget never
 * receives them.
 */
export interface MessageV1 {
    /** The row's id. What every verb taking a `messageId` wants. */
    id: number;
    /** The session this row belongs to. */
    sessionId?: number;
    /**
     * The lane this row is on, canonically (`main`, `text-messages:2`).
     *
     * The LANE rides inside this string — `<slug>:<lane>`, with a bare slug
     * meaning lane 1 — and `parseChannel` takes it apart. Absent reads as
     * `main`.
     */
    channel?: string;
    /** `user` · `assistant` · `system` — the chat-completions vocabulary. */
    role: string;
    /** The rendered text of the message. */
    content: string;
    /**
     * Who spoke, as the host resolved it for display: a character's name, a
     * persona's, the narrator's. Null when the host has no name for the row.
     */
    speakerLabel?: string | null;
    /** The speaking character, when one spoke. */
    characterId?: number | null;
    /** The speaking persona, when one spoke. */
    personaId?: number | null;
    /** True for a narrator turn: no character, no persona, `role: assistant`. */
    isNarratorResponse?: boolean;
    /** The row's kind, where a host distinguishes several. */
    kind?: string;
    /**
     * 🚧 Provisional. The parts-native half of the message model: the parts a
     * renderer composes, blocks included, each at its step and revision — the
     * row shows, per step, the revision `activeRevisions` names. The row's
     * `content` is the flattened text of the same thing and stays
     * authoritative for a widget that only draws prose. Absent on a row the
     * host has not projected yet (one written mid-run).
     */
    parts?: MessagePartV1[];
    /** When the row was written, as a string on the wire. */
    createdAt?: string;
    /** When the row last changed — a timestamp, as a string on the wire. */
    updatedAt?: string;
    /** A person has edited this row's text. */
    isEdited?: boolean;
    /** The host is not showing this row. */
    isHidden?: boolean;
    /** A run is filling this row right now. */
    isGenerating?: boolean;
    /**
     * How the last generation on this row ended, when it did not end normally
     * — `stopped` for a reply a person stopped, leaving the partial text.
     * Null or absent for a reply that finished.
     */
    generationOutcome?: string | null;
    /**
     * What the run filling this row is doing right now (R-19) — *{speaker} is
     * typing* — as display text with its variables filled, NOT a string:
     * resolve it with `renderStatusText`. Null or absent when nothing runs.
     */
    generationStatus?: StatusText | null;
    /** Why the last run on this row failed, when it did — shown in place of text. */
    error?: MessageErrorV1 | null;
    /**
     * Per step (`"0"`, `"1"`, …), the revision of that step's parts the row
     * shows — the swipe cursor of the parts-native model (`{ "0": 1 }`).
     */
    activeRevisions?: Record<string, number>;
    /** The row's own metadata bag — the keys a widget reads are named in {@link MessageMetadataV1}. */
    metadata?: MessageMetadataV1;
    /** Whatever else the host attached to the row for a widget to read. */
    extras?: WidgetPayload;
    /**
     * The host forwards the row, less {@link MESSAGE_HOST_FIELDS}, so columns
     * this interface does not name arrive at the top level beside the ones it
     * does.
     */
    [k: string]: unknown;
}
/**
 * @experimental The message-row columns a host never posts to a widget — the
 * bookkeeping {@link MessageV1} withholds. The one list: a host's projection
 * ({@link projectMessageRow}) and `MessageV1`'s doc comment both follow it.
 */
export declare const MESSAGE_HOST_FIELDS: readonly ["userId", "queueItemId", "debugMeta", "embedding", "embeddingModel", "embeddingSourceHash", "embedTextHash", "vectorizedAt", "version"];
/** @experimental One of {@link MESSAGE_HOST_FIELDS}. */
export type MessageHostField = (typeof MESSAGE_HOST_FIELDS)[number];
/**
 * @experimental A message row as it may cross to a widget: a shallow copy
 * without {@link MESSAGE_HOST_FIELDS}. Every road a row takes to a widget —
 * the `messages` post, a `channel` post, a `messages` page — goes through
 * this. A non-object is returned as it is.
 */
export declare function projectMessageRow<T>(row: T): Omit<T, MessageHostField>;
/** A failed run, as the row carries it. @experimental */
export interface MessageErrorV1 {
    message: string;
    code?: string;
    /**
     * The connection the run failed on — its identity, which only an
     * administrator is sent: for everyone else the whole bag is absent. Any
     * field may be null (a connection deleted since, a model never named).
     */
    connection?: MessageErrorConnectionV1;
}
/** @experimental A failed run's connection identity (administrators only; see {@link MessageErrorV1}). */
export interface MessageErrorConnectionV1 {
    id?: number | null;
    name?: string | null;
    /** The model the connection names — a file path, on a managed connection. */
    model?: string | null;
    /** The adapter kind: `koboldcpp`, `openai-chat`. */
    type?: string | null;
    /** What the service itself said, verbatim. */
    detail?: string;
}
/**
 * @experimental 🚧 One part of a message (the parts-native model): a typed piece at a
 * `step`, in one `revision` of that step, in `ordinal` order.
 */
export interface MessagePartV1 {
    id: number;
    messageId: number;
    step: number;
    revision: number;
    ordinal: number;
    /**
     * `core:markdown` · `core:reasoning` (the reply's reasoning) ·
     * `core:section` · `core:image` · … or a plugin's namespaced type.
     */
    type: string;
    /**
     * The text, for a textual type. A `core:section` holds its section's text
     * here — for a list, the items as a markdown bullet list, so a renderer
     * that knows nothing of `items` still shows something readable.
     */
    content: string | null;
    /**
     * Structure, for a type that has any. A `core:section` carries
     * {@link FoldedSectionPartDataV1}: its `title`, and — for a folded section —
     * its `kind`, and `items` when it is a list.
     */
    data: Record<string, unknown> | null;
}
/**
 * @experimental 🚧 A **folded section**: a named piece of a reply shown
 * collapsed beside its body, never as the body — a narrator's Plan (beats and
 * speakers, as a list), a step's notes (B4; decision D5, 2026-09-27). What the
 * `sections` in-port of `core:outlet/create-message@1` and
 * `core:outlet/update-message@1` takes, as a list, and what the host stores per
 * swipe and serves to widgets as a `core:section` part.
 *
 * Exactly one of `content` and `items`. A folded section never enters the
 * prompt transcript, and neither does the reply's reasoning: both are for the
 * person reading, never re-sent to the model.
 *
 * ⚠ Not a layout **fold** (a unit or zone giving way at a size), and not the
 * model's reasoning trace — that is the `reasoning` in-port, stored as a
 * `core:reasoning` part.
 */
export interface FoldedSectionV1 {
    /**
     * What the section holds, as a lowercase slug — `plan`, `notes`, or a
     * plugin's own. Chooses the glyph; never shown.
     */
    kind: string;
    /** The heading on the section's disclosure button, in sentence case: `Plan`. */
    label: string;
    /** The section's text (markdown). */
    content?: string;
    /** The section as a list, one entry per line — rendered as a list, never as JSON. */
    items?: string[];
}
/**
 * @experimental The `data` of a `core:section` part. `title` is the heading;
 * `kind` and `items` are present on a folded section ({@link FoldedSectionV1}).
 */
export interface FoldedSectionPartDataV1 {
    title: string;
    kind?: string;
    items?: string[];
}
/** @experimental The metadata keys a message widget reads; others ride along. */
export interface MessageMetadataV1 {
    isGreeting?: boolean;
    /** Alternative replies: their texts, and which one is shown. */
    swipes?: MessageSwipesV1;
    narratorName?: string;
    narratorInstructions?: string;
    /**
     * The model's reasoning for the shown swipe, when it shared any — written
     * on every streamed frame, so it fills while the reply is still reasoning.
     */
    reasoning?: string | null;
    /**
     * The row's folded sections while it has no alternatives; once it has,
     * `swipes.sectionsHistory` holds each one's. A widget reads the
     * `core:section` parts instead.
     */
    sections?: FoldedSectionV1[] | null;
    /** The expression sprite shown beside the row. */
    sprite?: unknown;
    /** Who spoke, as the speaker envoy recorded it. */
    speaker?: unknown;
    /** The form this row answers: the message carrying it, and the block. */
    answersForm?: {
        messageId: number;
        blockId: string;
    };
    [k: string]: unknown;
}
/** @experimental A row's alternative replies (`metadata.swipes`). */
export interface MessageSwipesV1 {
    /** Which of `history` is shown; null before the first. */
    currentIdx: number | null;
    /** Every reply's text, oldest first. */
    history: string[];
    /** The reasoning each reply carried, parallel to `history`. */
    reasoningHistory?: (string | null)[];
    /**
     * The folded sections each reply carried, parallel to `history`. Absent
     * until a write gives a later alternative sections; until then the first
     * alternative's are the row's `sections`.
     */
    sectionsHistory?: (FoldedSectionV1[] | null)[];
    [k: string]: unknown;
}
/** Who is looking — what a widget needs to know about the viewer, and no more. @experimental */
export interface ViewerV1 {
    userId: number | null;
    isAdmin: boolean;
    /** A guest seat: may read, may not write. */
    isGuest: boolean;
}
/**
 * One action as a venue lists it (plans/29 R-15) — transport-neutral here so a
 * frame and a native widget read the same rows. `specSlug` is `core` for one
 * of core's own message verbs.
 * @experimental
 */
export interface WidgetAction {
    key: string;
    specSlug: string;
    name: string;
    /** What it does, one sentence — every contributed and core action declares one (2026-09-28). */
    description?: string;
    icon?: string;
    /**
     * What the icon says standing alone — the accessible name of an
     * icon-only control. Absent: `name`.
     * @experimental
     */
    iconAlt?: string;
    slash: string;
    quick: boolean;
    audience: {
        see: string[];
        act: string[];
    };
    venue: string;
    channel?: string;
    origin: 'core' | 'companion' | 'foreign';
    floor: boolean;
    canAct: boolean;
    itemGated: boolean;
    isNew: boolean;
    /**
     * The enabled-when verdict (U5e), beside `canAct` — both shown, neither
     * hides the action: every predicate the host could judge over the
     * session's published values holds. The `item.*` ones are not among
     * them (`itemPredicates`). The host always sends it; absent (a fixture,
     * a host before U5e) reads as enabled.
     */
    enabled?: boolean;
    /** Why it is grey when `enabled` is false — resolve with `renderStatusText`. */
    reason?: WidgetActionReason;
    /**
     * The predicates over `item.*` — the message the action is pressed on —
     * which a widget judges per row with `evaluateEnabledWhen`. Message venue
     * only; absent when there are none.
     */
    itemPredicates?: EnabledWhen[];
}
/**
 * The session's actions per **venue**, each a primary set plus an overflow
 * that lists every enabled action (F38). Keyed by venue kind (`composer`,
 * `message`, `extra`, `widget`, …); a widget reads the venues it draws —
 * `widget` for its own controls, `message` when it renders a message's menu —
 * and fires one through `invoke(key)`. Empty venues when the host has no list
 * yet.
 * @experimental
 */
export type ActionsV1 = Record<string, {
    primary: WidgetAction[];
    overflow: WidgetAction[];
}>;
/** The transport-neutral data half — the versioned sections. */
/**
 * What this viewer may see of the session annex (R57): per owner, the values
 * whose audience holds for them — never the annex itself. A value stored for
 * pipelines only is never here.
 * @experimental
 */
export type AnnexV1 = Record<string, Record<string, unknown>>;
/**
 * 🚧 The session's stats and states, as a widget reads them —
 * `session_state.v1` (R72: a SCOPED section, scope `session:state`, which a
 * plugin's widget is granted as `widget:session:state`, reviewed like
 * `session:full`). The viewer's view of the one resolved read (`state:get`):
 * what every member of the session reads today, until state gets per-viewer
 * audiences.
 *
 * `resolved`, never `state`: `state` on a component's context is the view
 * state it saved.
 * @experimental
 */
export interface SessionStateV1 {
    /** The session this answers for. */
    sessionId: number;
    /** The first read has landed. Before it, empty means "not yet", never "nothing". */
    loaded: boolean;
    /**
     * Why the last READ failed, in words; null when it did not. A write a
     * widget asked for fails as that request's own rejection — errors are
     * per widget (R77), never one line every state widget shows.
     */
    error: string | null;
    /** The values, resolved: what a template reads as `state`. */
    resolved: SessionResolvedStateV1;
    /** Every slot this install declares, as a widget has to draw it. */
    slots: SessionStateSlotV1[];
    /** Every owner this session's values belong to: the world, and each cast member. */
    owners: SessionStateOwnerV1[];
}
/**
 * The resolved values — the object a template reads as `state`. Each bag is
 * keyed by a slot's QUALIFIED key (`SessionStateSlotV1.qualifiedKey`), the
 * key every value is filed under.
 * @experimental
 */
export interface SessionResolvedStateV1 {
    /** The world's values. */
    world: Record<string, unknown>;
    /** Each cast member's values, by owner key (`SessionStateOwnerV1.key`). */
    cast: Record<string, Record<string, unknown>>;
    /**
     * 🚧 Each location's values, by owner key (`SessionStateOwnerV1.key`, a
     * `session_location` owner) — attributes phase 4. Absent from a host
     * that predates locations holding state.
     */
    locations?: Record<string, Record<string, unknown>>;
    /** The session's state version (U5f): moved by every applied change. */
    version?: number;
}
/**
 * What a slot IS, for a widget that draws it: `14` is a bar only because the
 * slot is an integer with a floor and a ceiling, `wary` a chip only because
 * the slot is an enum. ⚠ Never the slot's `descriptor` — that is the
 * sentence the MODEL reads, and a widget drawing it would put prompt text on
 * a bar.
 * @experimental
 */
export interface SessionStateSlotV1 {
    /** `owner:slot/name@N` — what `set-attribute-value` names. */
    slotId: string;
    /** The key a person reads (`hp`): the first claimant's, so a display name, not an address. */
    key: string;
    /** The key every value is filed under in `resolved` — the one to look a value up by. */
    qualifiedKey: string;
    label: string;
    description?: string;
    type: SlotType;
    /**
     * 🚧 The catalogue stat shape the slot names (`core:stat-shape/list@1`),
     * when it names one; absent for a slot shaped inline or by `type` alone.
     */
    shape?: string;
    /**
     * 🚧 What the value IS, in the field language (`FieldDecl`): the stat
     * shape's field — what decides a bar, a chip, a list or a story time
     * (`statShapeKindOf`). Absent from a host that predates shapes, and for a
     * derived slot: read the field off `type` then (`fieldForSlotType`).
     */
    field?: FieldDecl;
    appliesTo: SlotAppliesTo[];
    /** A sheet says a session of this shape must have a value (R7): shown, never enforced here. */
    required?: boolean;
    /** Retired (R3): its values still resolve and nothing new is written; drawn greyed, never dropped. */
    retired?: boolean;
    /** The sheet that first named it, when one did. */
    sheetId?: string;
}
/**
 * An owner a session's values belong to — the world (`kind: 'session'`), a
 * cast member (`session_cast`) or 🚧 a location (`session_location`, whose
 * `id` is the location's lore entry) — keyed exactly as `resolved` keys it.
 * `key` is the lookup; `kind` and `id` are what `set-attribute-value` names.
 * @experimental
 */
export interface SessionStateOwnerV1 {
    /** `world`, the cast member's key in `resolved.cast`, or the location's in `resolved.locations`. */
    key: string;
    kind: 'session' | 'session_cast' | 'session_location';
    id: number;
    label: string;
    /**
     * The configuration in force per slot id — a bar's bounds, a chip's
     * options. Only the slots this owner may carry appear, so a slot is this
     * owner's exactly when its id is a key here.
     */
    configs: Record<string, Record<string, unknown>>;
}
/**
 * 🚧 The session's cast, as a widget draws it — `characters.v1` (R76) — with
 * the scene images they picture riding along: images ride with their parent.
 * @experimental
 */
export interface SessionCharactersV1 {
    /** Everyone still in the session: its characters, then its personas. */
    members: SessionCharacterV1[];
    /** The portraits pinned beside the conversation, one per side; null for an empty side. */
    sceneImages: {
        left: SessionSceneImageV1 | null;
        right: SessionSceneImageV1 | null;
    };
}
/**
 * One cast member, **cascaded cast over card** (R76): the character card's
 * fields overlaid by the cast member's, and **the cast member wins wherever
 * both speak** — its name, its face, its sprite set. The card owns the art;
 * the cast member picks the set. The host merges; a widget reads the merged
 * value and never resolves the cascade itself.
 *
 * The host also resolves every URL and the current sprite, so a widget draws
 * what it is handed and asks nothing of the page but its verbs.
 * @experimental
 */
export interface SessionCharacterV1 {
    /**
     * `character:<id>` — a persona's too: a persona is a character row
     * (`isPersona` says which), so its reference is the same grammar
     * (`TurnCandidateV1.ref` reads it the same way).
     */
    ref: `character:${number}`;
    characterId: number;
    /** A persona — a person's own character — rather than one of the cast. */
    isPersona: boolean;
    /**
     * The viewer's own persona in this session: what a widget draws for "your
     * persona" (R77 — the viewer's, never merely the first one listed).
     */
    mine: boolean;
    /** The name to show: the cast member's (a nickname) over the card's. */
    name: string;
    /** The member's avatar, resolved (a same-origin media URL); null when there is none. */
    face: string | null;
    /**
     * The member's CURRENT sprite — the one on the newest line it spoke, in
     * `spriteSet` — resolved; null when the card has no sprites.
     */
    sprite: string | null;
    /** The card's sprite sets, by name, in the card's order. */
    spriteSets: string[];
    /** The set this member shows: the session's choice over the card's; null when neither names one. */
    spriteSet: string | null;
    /**
     * 🚧 The session's own choice alone (`set-sprite-set`): the set this
     * session overrides the story's with, null when it follows the story. What
     * a sprite-set menu marks as picked, where "as the story has it" is the
     * absence of an override rather than the card's default set. Optional
     * (additive): absent reads as null.
     */
    spriteSetOverride?: string | null;
    /**
     * The viewer may switch this member's set (`set-sprite-set`) — the
     * server's rule (the session's owner or the character's), answered by the
     * host so a menu is offered only where it will be allowed (R77).
     */
    canChangeSpriteSet: boolean;
}
/** A portrait pinned to one side of the conversation. @experimental */
export interface SessionSceneImageV1 {
    /** The image, as the host resolved it. */
    src: string;
    /**
     * The member it pictures, when the host can tell — a pin is stored as an
     * image, so it is matched by face; null for an image pinned from anywhere
     * else.
     */
    ref: `character:${number}` | null;
}
/**
 * 🚧 **The** table of scoped sections: each widget scope that delivers data,
 * the name its section is posted under, and that section's `v1` shape.
 * Every other spelling is derived from this one — `WidgetScope`,
 * `WidgetData`'s scoped keys, `ComponentSections.scoped`, the frame's
 * `scoped` message, the component wire's receiver — so a scoped section is
 * added by one entry here and one in {@link WIDGET_SCOPED_SECTIONS}, which
 * the compiler holds to this.
 *
 * A scoped section appears ONLY when the widget declared the scope AND it was
 * granted (a plugin's as `widget:<scope>`, reviewed and deniable; core's own
 * widgets hold every scope). Absence means "not granted", never a silent
 * empty — or, before the first post, "not yet"; the host's `grants`
 * (frame message `grants`, `ComponentContext.grants` / `granted(scope)`)
 * says which.
 * @experimental
 */
export interface WidgetScopedSections {
    /** 🚧 The whole conversation as core's own conversation sees it (the dossier); its shape settles with C7. */
    'session:full': {
        section: 'session_full';
        v1: unknown;
    };
    /** 🚧 The session's stats and states (R72). */
    'session:state': {
        section: 'session_state';
        v1: SessionStateV1;
    };
    /** 🚧 The viewer's persona. Declared; no host supplies it yet. */
    persona: {
        section: 'persona';
        v1: unknown;
    };
    /** 🚧 The session's cast, cast over card, and the scene images they picture (R76). */
    characters: {
        section: 'characters';
        v1: SessionCharactersV1;
    };
    /**
     * 🚧 The session's lore. Declared and never pushed: it is the grant a
     * plugin's widget holds to ask `session-entries` (the lore is paged by
     * request, as messages are).
     */
    lore: {
        section: 'lore';
        v1: unknown;
    };
}
/** A widget scope that delivers a scoped section — every scope but `channel:<slug>`. @experimental */
export type WidgetSectionScope = keyof WidgetScopedSections;
/** A scoped section's name as posted: `session_full`, `session_state`, `persona`, `characters`, `lore`. @experimental */
export type WidgetScopedSectionName = WidgetScopedSections[WidgetSectionScope]['section'];
/** Each scoped section's `v1`, by its posted name. @experimental */
export type WidgetScopedSectionValues = {
    [S in WidgetSectionScope as WidgetScopedSections[S]['section']]: WidgetScopedSections[S]['v1'];
};
/** The envelope's scoped half: each section a `{ v1 }` bag, present iff declared and granted. @experimental */
export type WidgetScopedData = {
    [N in WidgetScopedSectionName]?: {
        v1: WidgetScopedSectionValues[N];
    };
};
/**
 * {@link WidgetScopedSections} at runtime: scope → the name its section is
 * posted under. Typed off the table, so a scope missing here, or a name that
 * disagrees with it, does not compile.
 * @experimental
 */
export declare const WIDGET_SCOPED_SECTIONS: {
    readonly [S in WidgetSectionScope]: WidgetScopedSections[S]['section'];
};
/** Is this a scoped section's posted name — what a receiver checks an incoming `scoped` message against. @experimental */
export declare const isWidgetScopedSectionName: (name: unknown) => name is WidgetScopedSectionName;
/**
 * The transport-neutral data half — the versioned sections: the base ones
 * below, and the scoped half ({@link WidgetScopedData}) the table above
 * derives.
 *
 * A base section a widget does not READ (`WidgetDecl.reads`, R75) is never
 * sent to it: a remote or a frame never receives it, and a native widget is
 * handed its empty value (`[]`, `{}`) and never re-projected for it — so a
 * widget that does not read `messages` is not handed the log again on every
 * token.
 * @experimental
 */
export interface WidgetData extends WidgetScopedData {
    layout: {
        v1: LayoutV1;
    };
    session: {
        v1: SessionV1;
    };
    channels: {
        v1: string[];
    };
    messages: {
        v1: MessageV1[];
    };
    props: {
        v1: WidgetPayload;
    };
    /**
     * The action model's venues (R-15) — base, so a widget need not declare a
     * scope to offer a control.
     */
    actions: {
        v1: ActionsV1;
    };
    /**
     * This instance's effective settings: every field the widget declares
     * (`WidgetDecl.settings`), defaults filled in, with the user's deviations
     * over them. Complete by construction, so a widget reads a value rather
     * than re-deriving its own defaults. Empty for a widget that declares none.
     */
    settings: {
        v1: WidgetPayload;
    };
    /** The viewer's view of the session annex (R57) — `{}` when there is nothing to see. */
    annex: {
        v1: AnnexV1;
    };
    /**
     * The viewer's language code (`en`, `fr`, …), so a widget renders a locale
     * map (`i18nText(text, locale.v1)`) in the language the page speaks.
     */
    locale: {
        v1: string;
    };
    /** 🚧 Who is looking (C0b). */
    viewer: {
        v1: ViewerV1;
    };
    /**
     * The session's turn order (C5): who is due to speak, in order, and who
     * could — the stored order core and every strategy write (A9), never
     * recomputed by a reader. What the page already shows every member in
     * its "next" line; `EMPTY_TURN_ORDER` before the first recompute. An
     * entry is open: a strategy may add keys (a `reason`, …) and they arrive.
     */
    turnOrder: {
        v1: TurnOrderV1;
    };
}
/** A base section's name — what a widget lists in `WidgetDecl.reads` (R75). @experimental */
export type WidgetBaseSection = Exclude<keyof WidgetData, WidgetScopedSectionName>;
/**
 * The base sections, in the order the envelope declares them (R75): what
 * `WidgetDecl.reads` may name, and what a widget reads when it names none.
 * @experimental
 */
export declare const WIDGET_BASE_SECTIONS: readonly WidgetBaseSection[];
/** A menu for the host to render at a point the widget names. @experimental */
export interface MenuSpec {
    at: {
        x: number;
        y: number;
    };
    items: Array<{
        id: string;
        label: string;
        icon?: string;
        disabled?: boolean;
    }>;
}
/** What a person picked out of a `MenuSpec`. @experimental */
export interface MenuResult {
    id: string;
}
/**
 * 🚧 What a widget may ASK the host for (C0b) — by kind, with its params and
 * what comes back. A request is not a grant: the host may decline, and the
 * promise rejects. The host-UI kinds open something of the host's own (a
 * panel, a viewer, a picker) and resolve once it is shown; the widget never
 * sees what the host draws.
 * @experimental
 */
export interface WidgetRequests {
    /** A page of a lane's messages, older than `cursor`. */
    messages: {
        params: {
            channel?: string;
            cursor?: string;
            limit?: number;
        };
        result: {
            rows: MessageV1[];
            nextCursor?: string;
        };
    };
    /** The character's sheet in the host's panel. */
    'open-character': {
        params: {
            characterId: number;
        };
        result: void;
    };
    /** A participant's avatar, full size. */
    'view-avatar': {
        params: {
            ref: string;
        };
        result: void;
    };
    /**
     * An image a message shows, full size, in the page's lightbox. 🚧 `gallery`
     * (composer attachments §3.4): the other images it sits with — a message's
     * media strip — so the lightbox pages through them (←/→, swipe); `index` is
     * where `src` sits in `srcs`, `captions` what each is called. Without it
     * the lightbox shows the one image.
     */
    'view-image': {
        params: {
            src: string;
            gallery?: {
                srcs: string[];
                index: number;
                captions?: string[];
            };
        };
        result: void;
    };
    /** The lore panel at a history entry, a scene, or a new history entry. */
    'open-lore': {
        params: {
            lorebookId?: number;
            scope: 'history' | 'scenes';
            entryId?: number;
            sceneId?: number;
            create?: boolean;
        };
        result: void;
    };
    /** The prompt a message was generated from (admins, when context debugging is on). */
    'prompt-details': {
        params: {
            messageId: number;
        };
        result: void;
    };
    /** The run that wrote a message, in the run inspector (admins). */
    'inspect-run': {
        params: {
            messageId: number;
        };
        result: void;
    };
    /** The host's "who speaks next" picker; resolves once a turn was fired or it was closed. */
    'pick-turn': {
        params: Record<string, never>;
        result: void;
    };
    /** The host's sprite picker for a character's line (DESIGN-sprites §6). */
    'change-sprite': {
        params: {
            messageId: number;
        };
        result: void;
    };
    /** The viewer has now seen these newly offered actions (their "new" mark clears). */
    'actions-seen': {
        params: {
            keys: string[];
        };
        result: void;
    };
    /** Summarize the selected messages into a scene, world lore or a character's lore. */
    summarize: {
        params: {
            kind: 'scene' | 'world' | 'character';
            messageIds: number[];
        };
        result: void;
    };
    /**
     * 🚧 Core's own composer (C0b): send the viewer's line, as the persona and
     * on the lane named. A host answers it for core's widget only — a
     * plugin's widget writes through its own actions.
     */
    send: {
        params: {
            content: string;
            personaId: number | null;
            channel: string;
            /**
             * 🚧 The composer's **tray items** to send as this line's
             * attachments (composer attachments §3.1), in tray order. With
             * any, `content` may be empty. The host refuses the whole line
             * when one is not ready; the tray then stays as it was.
             */
            trayItemIds?: string[];
        };
        result: void;
    };
    /**
     * 🚧 Core's composer (composer attachments §3.3): upload these files into
     * the session's composer tray — the files a person picked, dropped or
     * pasted (`sp-file-picker`, `sp-drop-zone`). Resolves once they are
     * queued; their progress, readiness and refusals arrive in the dossier's
     * `composer.tray`, never in the reply.
     */
    'attach-files': {
        params: {
            files: File[];
        };
        result: void;
    };
    /** 🚧 Core's composer: take one tray item out of the tray (its upload stops; nothing is sent). */
    'remove-tray-item': {
        params: {
            trayItemId: string;
        };
        result: void;
    };
    /**
     * 🚧 Core's conversation (composer attachments D9, remove only): take one
     * attachment — a `core:image` / `core:file` part, by its id — off a sent
     * message. Whoever may edit the message may; the file itself stays.
     */
    'remove-attachment': {
        params: {
            messageId: number;
            partId: number;
        };
        result: void;
    };
    /** 🚧 Core's composer: the draft changed (the host keeps it, and counts its tokens). */
    draft: {
        params: {
            content: string;
        };
        result: void;
    };
    /** 🚧 Core's composer: write as another of the viewer's personas. */
    'switch-persona': {
        params: {
            personaId: number;
        };
        result: void;
    };
    /** 🚧 Core's composer: the host's "add your persona" flow, for a guest with none. */
    'add-persona': {
        params: Record<string, never>;
        result: void;
    };
    /**
     * 🚧 Core's conversation: Continue — fire the first entry of the session's
     * turn order on `channel`, the channel of the composer it was pressed in
     * (lair re-plan R5, 2026-09-28). Absent, the host answers for its own
     * composer's channel.
     */
    'fire-turn': {
        params: {
            channel?: string;
        };
        result: void;
    };
    /** 🚧 Core's conversation: accept or reject a proposed change to the session's state. */
    'decide-proposal': {
        params: {
            proposalId: number;
            accept: boolean;
        };
        result: void;
    };
    /**
     * 🚧 Core's state widgets (R21): set one owner's value for one slot, at
     * the session layer — the viewer's own edit, applied at once (the page's
     * `state:set`); `null` clears the session's value so the read inherits
     * again. The page names its own session. Resolves once written; the new
     * value arrives as a `session_state` push, never in the reply.
     */
    'set-attribute-value': {
        params: {
            owner: {
                kind: 'session' | 'session_cast' | 'session_location';
                id: number;
            };
            slotId: string;
            /** A list is written whole — its items in order, words and lore references (`SlotListItem`). */
            value: SlotValue;
        };
        result: void;
    };
    /**
     * 🚧 Core's scene portraits (R21): show a character in another of its
     * sprite sets, for this session only; `null` goes back to the card's.
     * Offered where `SessionCharacterV1.canChangeSpriteSet` says so; the
     * server judges it again.
     */
    'set-sprite-set': {
        params: {
            characterId: number;
            set: string | null;
        };
        result: void;
    };
    /**
     * 🚧 Core's scene portraits (R21): take down the portrait pinned on one
     * side — the page's own pin, which the page keeps (R77: the page and the
     * widget never disagree about what is pinned).
     */
    'clear-scene-image': {
        params: {
            side: 'left' | 'right';
        };
        result: void;
    };
    /**
     * 🚧 A page of the session's lorebook, entry by entry, with what this
     * session's rankings made of each (R58) — searched by title and keys,
     * sorted, filtered, paged. The page names its own session. `lorebookId`
     * is null when the session reads into no book; `ownerOnly` when the viewer
     * is not the book's owner, and then `rows` is empty. `offset` is the page
     * actually served — pulled back when the one asked for ran past the end.
     */
    'session-entries': {
        params: {
            /**
             * 🚧 Text an entry's title or one of its keys contains — the
             * search box's words, matched as they are (`%` and `_` are
             * literal). Never `query`, a retired word here — the node kind
             * owns it (NOMENCLATURE, Retired words): the page reconciles this
             * with its socket's spelling.
             */
            titleOrKey?: string;
            sort?: 'name' | 'lastRead' | 'timesRead' | 'rank';
            filter?: 'all' | 'fired' | 'pinned' | 'off';
            /**
             * 🚧 Only entries of these entry types (`core:entry/item`, …) —
             * what a state widget's item picker asks for before the rest of
             * the book (attributes phase 3c). Absent or empty is every type.
             */
            typeIds?: string[];
            offset?: number;
            limit?: number;
        };
        result: {
            lorebookId: number | null;
            bookName?: string;
            ownerOnly: boolean;
            rows: SessionEntryV1[];
            total: number;
            offset: number;
        };
    };
    /**
     * 🚧 Core's lore entries (R58): an entry's **Off** and **Pin** marks, and
     * nothing else — never a re-embed. Resolves with both marks as the session
     * reads the entry — its line, at its clock. For the book's owner and
     * admins; the server judges it.
     *
     * `heldBy` is present when a dated amendment still decides a mark asked
     * for, so it does not read as asked here: the entry itself was saved, and
     * the amendment wins from `date` on (spelled by the book's calendar).
     */
    'set-entry-marks': {
        params: {
            entryId: number;
            off?: boolean;
            pinned?: boolean;
        };
        result: {
            off: boolean;
            pinned: boolean;
            heldBy?: {
                mark: 'off' | 'pinned';
                date: string;
            };
        };
    };
    /**
     * 🚧 Core's author's note widget (2026-10-02, AN1): the session's
     * author's note as it reads now, whether the viewer may change it, and
     * what the newest reply's prompt did with it. The page names its own
     * session.
     */
    'authors-note': {
        params: Record<string, never>;
        result: AuthorsNoteV1;
    };
    /**
     * 🚧 Core's author's note widget: save the session's author's note,
     * whole. The session's owner only — the server judges it. Resolves with
     * the note as it now reads.
     */
    'set-authors-note': {
        params: {
            note: AuthorsNoteValueV1;
        };
        result: AuthorsNoteV1;
    };
}
/**
 * 🚧 The session's author's note, as stored (2026-10-02, AN1) — the value of
 * a genre's `authorsNote` field (`AUTHORS_NOTE_FIELD` in core's catalogue).
 * Not the post-history reminder, which is the pipeline's and the card's.
 * @experimental
 */
export interface AuthorsNoteValueV1 {
    text: string;
    /** Messages before the reply it is placed; 0 is right before the reply. */
    depth: number;
    /** Added to every `interval`-th reply; 1 is every reply. */
    interval: number;
    role: 'system' | 'user' | 'assistant';
}
/**
 * 🚧 What the `authors-note` request answers (2026-10-02, AN1).
 * @experimental
 */
export interface AuthorsNoteV1 {
    /** The session's genre declares an author's note at all. False: nothing else here means anything. */
    offered: boolean;
    /** The viewer may change it (the session's owner). */
    canEdit: boolean;
    note: AuthorsNoteValueV1;
    /**
     * What the newest reply's prompt did with the note — Assemble's own
     * decision, off that run's receipt. Null when no reply has been written
     * with a note in scope yet.
     */
    lastReply: {
        included: boolean;
        /** `included`, `empty` (no text), or `interval` (this reply was not one of every `interval`). */
        reason: 'included' | 'empty' | 'interval';
        depth: number;
        /** Where it landed among the messages the prompt carried, oldest first. */
        targetIndex: number;
    } | null;
}
/** @experimental */
export type WidgetRequestKind = keyof WidgetRequests;
/**
 * 🚧 One entry of the session's lorebook, with what this session's rankings
 * made of it — a row of `session-entries`.
 * @experimental
 */
export interface SessionEntryV1 {
    id: number;
    /** The entry type's id. */
    typeId: string;
    title: string;
    keys: string[];
    /** Marked **Off**: retrieval may not use it. */
    off: boolean;
    /** **Pinned**: in every prompt, whatever the ranking says. */
    pinned: boolean;
    /** How often this session's rankings judged it, and how often they included it. */
    timesJudged: number;
    timesIncluded: number;
    /** When a ranking last judged it (an ISO string on the wire); null when none has. */
    lastJudgedAt: string | null;
    /** Whether that last judgement included it, why, and at what rank. */
    lastIncluded: boolean | null;
    lastReason: string | null;
    lastRank: number | null;
}
/**
 * 🚧 Who a host answers a request kind for — its **askers** (F9):
 *
 *  - `'any'` — any widget's, core's or a plugin's. The host still applies
 *    its own rules (an admin's view, an image off the app's origin).
 *  - `'core'` — core's own widgets only: a verb that acts as the viewer
 *    (sends, writes, marks), which a plugin's widget does through its own
 *    actions instead.
 *  - `{ scope }` — core's, or a plugin's widget GRANTED that scope (reviewed
 *    as `widget:<scope>`, carried as the bare scope): a request that READS
 *    scoped data, so the scope that would have pushed it is what lets a
 *    widget page it.
 * @experimental
 */
export type WidgetRequestAskers = 'any' | 'core' | {
    scope: WidgetSectionScope;
};
/**
 * The askers of every request kind — the marking a host enforces
 * ({@link widgetRequestRefusal}). Typed off {@link WidgetRequests}, so a kind
 * cannot be added without saying who may ask it.
 * @experimental
 */
export declare const WIDGET_REQUEST_ASKERS: {
    readonly [K in WidgetRequestKind]: WidgetRequestAskers;
};
/** Every request kind — what a host checks an incoming `request` against. @experimental */
export declare const WIDGET_REQUEST_KINDS: readonly WidgetRequestKind[];
/**
 * Why a host must decline this request from this widget, as a sentence — or
 * null when {@link WIDGET_REQUEST_ASKERS} lets it ask. `owner` is `'core'` or
 * the widget's plugin id; `grants` the scopes that widget was granted, as
 * BARE scopes (`'lore'`, `'session:state'`) — never the permission keys they
 * are reviewed as (`'widget:lore'`), which match nothing here. Core's widgets
 * hold every scope. A request is still not a grant: null means the host MAY
 * answer, never that it must. Grants that are not a list — a stored string,
 * whose `includes` would match a substring — grant nothing.
 * @experimental
 */
export declare function widgetRequestRefusal(kind: string, from: {
    owner: string;
    grants?: readonly string[];
}): string | null;
/** What rides beside an invocation: the subject message, entered values. @experimental */
export interface WidgetInvokeArgs {
    messageId?: number;
    payload?: WidgetPayload;
    /**
     * The form the press answers — a block's id within `messageId` (R-15
     * *Forms*) — so the server reads the block off the row and holds the press
     * to its addressee. Absent on every other press.
     *
     * The `invoke` spelling of {@link WidgetVerbs.action}'s fifth argument: a
     * widget drawing a message's form presses it by the declaration's identity
     * like any other action, and the block it answers rides here rather than
     * forcing that one press back onto the deprecated verb.
     */
    blockId?: string;
    /**
     * The text the press already supplies (lair pass S2): the composer's
     * **slash argument**, `/nudge go north` → `go north`. The host hands it
     * to an action that collects text, as if the collect modal had — and
     * refuses the press, firing nothing, when the action collects none. An
     * action that also collects recipients still opens its modal, prefilled.
     */
    text?: string;
}
/**
 * Something the host told this widget about.
 *
 * A discriminated union on `kind`. The last member is the ESCAPE HATCH and it
 * is namespaced on purpose: a bare `{ kind: string }` widened the union back to
 * "any string", so an author's typo compiled and every other member stopped
 * narrowing. A kind core does not ship is spelled `custom:<whatever>`, which
 * can never collide with a member added here later.
 * @experimental
 */
export type WidgetEvent = {
    kind: 'message:created';
    /** The channel as stored — canonical, so lane 1 is the bare slug. */
    channel: string;
    /** …taken apart, so a widget need not parse it (ruling 2026-09-09). */
    slug: string;
    lane: number;
    messageId: number;
}
/**
 * A row this widget can see changed in a way that is not an arriving
 * delta — an edit, a hide, a swipe, a re-stamped metadata bag.
 *
 * `channel` is the row's, canonically, so the host can narrow this to the
 * widgets that declared it; absent from a host that does not know which
 * channel the row was on, which reaches every widget as before.
 */
 | {
    kind: 'message:updated';
    messageId: number;
    channel?: string;
}
/** A row this widget can see is gone. `channel` as `message:updated`. */
 | {
    kind: 'message:deleted';
    messageId: number;
    channel?: string;
}
/**
 * Text was appended to a row being generated — `delta` is the appended
 * text alone, never the row's whole content. Emitted per arrival, so a
 * listener doing real work per delta is doing it once per chunk.
 * `channel` as `message:updated`.
 */
 | {
    kind: 'message:delta';
    messageId: number;
    delta: string;
    channel?: string;
}
/**
 * A reply started filling. Carries the row when the host knows which one
 * (it usually does — the row exists before its first token).
 *
 * Names no channel on purpose: a generation is session news, not channel
 * news, and reaches every widget.
 */
 | {
    kind: 'generation:start';
    messageId?: number;
}
/**
 * …and stopped. `aborted` is true for a reply a person stopped, leaving
 * the partial text — the `stopped` outcome, not an error.
 */
 | {
    kind: 'generation:end';
    messageId?: number;
    aborted: boolean;
} | {
    kind: 'channel:activated';
    channel: string;
    slug: string;
    lane: number;
}
/**
 * 🚧 Provisional — DECLARED, NOT PRODUCED (2026-09-17). No host ships a
 * single "the selected message"; the session page's only selection is the
 * summarization mode's SET of rows, which this member cannot describe and
 * must not be bent into. A widget may subscribe, and will hear nothing
 * until a host has one selected message to announce; the shape may change
 * when one does. Do not read absence as "nothing is selected".
 */
 | {
    kind: 'selection:changed';
    messageId: number | null;
}
/**
 * This widget's placement changed — it moved, resized, changed tier, or was
 * collapsed/drawered. The new `layout.v1` rides along so a listener needs no
 * second read; a native consumer can equally read `layout.v1` off its own
 * context, which is already reactive. It exists for the frame lane, where a
 * push is the only reactivity there is, and is emitted on both so the two
 * stay field-for-field identical.
 */
 | {
    kind: 'layout:changed';
    layout: LayoutV1;
}
/**
 * A package's event was recorded in this session (R56) — everything in the
 * session hears it, so every widget does. `event` is its id (compare with
 * the declaration: `e.event === guessed.id`); `payload` is what the
 * recording wrote; `at` the instant it was recorded. Names no channel: an
 * event is session news. Core's own events reach widgets as the members
 * above, never as this one.
 */
 | {
    kind: 'event:recorded';
    event: string;
    payload: unknown;
    at: number;
}
/**
 * 🚧 A turn in this session ranked its lore (R81): what the rankings made
 * of the session's lore entries was written — the rollup `session-entries`
 * reads moved — so a lore reader asks again now, and only now. Carries
 * nothing: the rows are the request's. Sent after the write, never before
 * it. Heard by core's widgets and by a plugin's widget granted `lore`
 * ({@link WIDGET_EVENT_SCOPES}); names no channel.
 */
 | {
    kind: 'lore:ranked';
}
/**
 * 🚧 A lore entry of the session's book changed — its marks (pinned, off)
 * or anything else a save wrote — by this viewer, in any of their tabs,
 * widgets or the lorebook's editors. A lore reader showing `entryId` asks
 * again, so a mark set in one place is never stale in another; one showing
 * only pinned or off entries asks again whatever the id, since the entry
 * may have joined. Carries the id only — not how the session reads the
 * entry now: the row is the request's. Sent after the write. Scoped like
 * `lore:ranked` ({@link WIDGET_EVENT_SCOPES}); names no channel.
 */
 | {
    kind: 'lore:marked';
    entryId: number;
}
/**
 * 🚧 The session's stored **genre fields** changed (history window lane,
 * 2026-10-03) — Edit Session › Settings saved one, or a widget wrote one
 * (the Author's note's `set-authors-note`), in any of the owner's tabs. A
 * widget showing a genre field's value asks again; carries nothing — the
 * value is the request's. Sent after the write, to the session's owner's
 * page only (the one person who may change them); names no channel.
 */
 | {
    kind: 'genreFields:changed';
}
/** Anything core does not ship. Namespaced so it cannot shadow a member. */
 | {
    kind: `custom:${string}`;
    payload?: WidgetPayload;
};
/** Every event kind a widget may subscribe to, the custom namespace included. @experimental */
export type WidgetEventKind = WidgetEvent['kind'];
/**
 * 🚧 The scope a widget must hold to HEAR an event kind (R81) — a kind not
 * listed is heard by every widget its channel reaches. An event about scoped
 * data is scoped data: a widget that may not read the lore is not told when
 * it moved. Read by {@link widgetEventHeard}, which every host delivery of
 * widget events asks.
 * @experimental
 */
export declare const WIDGET_EVENT_SCOPES: {
    readonly [K in WidgetEventKind]?: WidgetSectionScope;
};
/**
 * Is this widget told of an event of this kind? Core's widgets hold every
 * scope; a plugin's hears a scoped kind only when granted its scope — as
 * BARE scopes (`'lore'`), never the permission keys (`'widget:lore'`); grants
 * that are not a list grant nothing (the rule {@link widgetRequestRefusal}
 * holds a request to).
 * @experimental
 */
export declare function widgetEventHeard(kind: string, to: {
    owner: string;
    grants?: readonly string[];
}): boolean;
/** What a widget can DO — the transport half of the envelope. @experimental */
export interface WidgetVerbs {
    /**
     * ⏳ Fire an action by its bare **key**.
     *
     * @deprecated Use {@link WidgetVerbs.invoke}. A press names a DECLARATION
     * by its identity: a bare key is resolved by the server to the genre's
     * sole declarer of it and refused — naming the identities — when several
     * specs declare it (plans/31 V2). Accepted for one release; `invoke`
     * resolves the identity for you.
     *
     * `action` is the identity of the declaration being fired
     * (`<spec slug>#<key>`) when one is in hand — `invoke` always supplies it —
     * so the server checks THAT action's audience and enablement and runs THAT
     * spec.
     */
    action(fn: string, messageId?: number, payload?: WidgetPayload, action?: string, 
    /**
     * The form the press answers — a block's id within `messageId` (R-15
     * *Forms*) — so the server reads the block off the row and holds the
     * press to its addressee. Absent on every other press.
     */
    blockId?: string): void;
    /**
     * Fire an action from `actions.v1` by its **identity** (`<spec slug>#<key>`)
     * or, when only one action carries it, its bare **key** (R-15
     * `invoke(id, args)`): the host resolves it to the declaration and routes it
     * — one of core's verbs to the host's real handler (an `extend` is an
     * extend, never a function fire), a contributed one to the audited fire
     * with its identity. A key no venue lists, or a bare key several actions
     * share, throws: a widget cannot fire something the session does not offer —
     * or something ambiguous — and believe it did.
     */
    invoke(key: string, args?: WidgetInvokeArgs): void;
    /** Ask the host for something ({@link WidgetRequests}); rejects when it declines. */
    request<K extends WidgetRequestKind>(kind: K, params: WidgetRequests[K]['params']): Promise<WidgetRequests[K]['result']>;
    /**
     * 🚧 The viewer's translation of an English UI string (C0b) — synchronous,
     * the source itself until a translation arrives, then re-rendered. For
     * a widget's OWN literals; declared text (a label, a title) is a locale
     * map read with `i18nText(text, locale.v1)`.
     */
    t(source: string): string;
    /** Host-rendered menu; resolves to the pick, or null if dismissed. */
    menu(spec: MenuSpec): Promise<MenuResult | null>;
    /**
     * Subscribe to a host event; returns an unsubscribe.
     *
     * `'*'` receives every event, which is how a widget forwards the lot —
     * into its own store, a log, a bridge — without enumerating a union it
     * would then have to keep in step. It is a SUBSCRIPTION, never a kind: no
     * event is ever delivered carrying `kind: '*'`.
     */
    on(kind: WidgetEventKind | '*', cb: (e: WidgetEvent) => void): () => void;
}
/**
 * The version of the widget contract — the verbs above and the message kinds
 * that carry them.
 *
 * ONE number for both deliveries: native IS frame minus the iframe (ruled
 * 2026-09-08), so a second clock for the in-document lane would be a second
 * contract by accident. `FRAME_PROTOCOL` in `surfaces.ts` is this constant
 * under the name the frame wire spells it, and the frame's `init` carries it.
 * @experimental
 */
export declare const WIDGET_PROTOCOL: 2;
/** A version of the widget contract a host and a frame can both speak. @experimental */
export type WidgetProtocolVersion = 1 | 2;
//# sourceMappingURL=widgets.d.ts.map