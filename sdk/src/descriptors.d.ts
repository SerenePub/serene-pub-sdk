/**
 * Descriptors — the shared-scope declaration of a type (01 §1, 04 §3).
 *
 * A descriptor is data: it can be listed, rendered and validated without loading
 * the hook that implements it. That is what lets the plugin manager and the editor
 * work from rows (10 §10.2).
 */
import type { ShapeId } from './shapes.js';
import type { CapabilityId } from './capabilities.js';
import type { ReviewPosition } from './review.js';
import type { TemplateScope } from './template.js';
import type { SettingsSchema, FieldDecl, I18nText } from './settings.js';
import type { MediaCapability } from './media.js';
export type Kind = 'input' | 'query' | 'task' | 'provider' | 'consumer';
export type LocaleMap = {
    en: string;
} & Record<string, string>;
/** One i18n type across the SDK — settings.ts owns it; this is the alias the
 *  descriptor surface has always exported. */
export type I18n = I18nText;
/** Slot kinds (12 §2). Siblings; only two are ever cross-referenced. */
export type SlotKind = 'connection' | 'sampling' | 'prompts' | 'template' | 'parameters' | 'wire' | 'variables' | 'scripts';
export interface SlotDecl {
    kind: SlotKind;
    /**
     * One of the few settings people actually change on this node.
     *
     * A panel that lists every declared setting equally makes the reader find
     * the prompt among the thresholds every time. The author is the one who
     * knows which three or four are reached for and which exist for the day
     * somebody needs them, so the answer is declared rather than guessed from
     * type or position — a client heuristic would be wrong differently on every
     * plugin.
     *
     * Presentation, not permission: nothing is hidden by it, and everything
     * unmarked is one disclosure away.
     */
    quick?: boolean;
    /** For connection/sampling: which shape's connections are eligible. */
    shape?: ShapeId;
    /**
     * What the connection in this slot must be able to do.
     *
     * Unmet is a hard failure at bind, naming the capability in the words a
     * person saw when they configured it — never a 400 from a provider that was
     * asked for something its API has no field for.
     *
     * On the SLOT rather than on the Descriptor because the requirement is about
     * a *connection*, and a connection comes from a slot: a node with two
     * connection slots needs to state two different things.
     *
     * This supersedes `shape` for connection slots. `shape` says "an image-gen
     * connection"; this says "one that can do text→image", which is the same fact
     * with the modality assumption removed.
     */
    requires?: readonly CapabilityId[];
    /**
     * What the binding will *use if present* and must cope without.
     *
     * The binding asks with `ctx.can(id)`, which is narrowed to exactly these
     * ids — so an undeclared capability, or a typo, does not compile. The
     * fallback path is the author's to write; declaring something optional is a
     * promise that both branches exist.
     *
     * ⚠ Not the same `optional` as `Descriptor.optional` further down this file,
     * which means "producing nothing is a legitimate outcome for this node". Two
     * meanings, one word, one file — the objects differ so it compiles, and the
     * reader is the one who pays. Named to match the ruling; if it is ever
     * renamed, `prefers` is the word that was wanted.
     */
    optional?: readonly CapabilityId[];
    /** What this slot is for, shown under its option. Display text — see ParamDecl. */
    description?: I18n;
    /** Which lens renders it (05 §3). */
    facet?: string;
    /** For prompts: the authored text fields. */
    fields?: Record<string, {
        type: 'text';
        i18n?: I18n;
    }>;
    /** For parameters: the declared schema. Options may be sourced from the connection. */
    schema?: Record<string, FieldDecl>;
    /**
     * Which template language this slot's source is written in — a registry id, not a
     * hardcoded literal (src/engines.ts). The value stored in the slot carries it too, so
     * two slots in one spec may use different engines.
     */
    engine?: string;
    /**
     * For `wire` slots: the format id this Provider defaults to. Overridable through the
     * normal scope chain, and in core sourced from the connection's adapter metadata so
     * picking Ollama gets the right instruct format without configuring anything
     * (src/wire.ts).
     */
    format?: string;
    /**
     * For template slots: the variables this template may reference.
     *
     * ⚠ Required, and 16 §4 is wrong to imply otherwise. A *source* template renders one
     * item out of a collection, and the item's shape lives inside the port's payload
     * rather than on the port — so typed ports alone cannot tell an author what
     * `{{ entry.title }}` is allowed to be. See src/template.ts.
     */
    variables?: TemplateScope;
    /**
     * For `scripts` slots: which script types this hook accepts (18 §4a).
     *
     * Pinned ids — `core:script:text/transform@1` — and **part of the content
     * hash** (S3): widening or narrowing what a hook accepts changes what an
     * untouched spec does, which is the `optional` lesson applied before it is
     * re-learned. Plain strings rather than the `ScriptTypeId` alias, because
     * scripts.ts already imports from this module and a type-only cycle is
     * still a cycle.
     *
     * The value stored in a scripts slot is an ordered list of script row ids —
     * a chain. Transform chains fold; verdict chains reduce (18 §5). The chain
     * is configuration like any slot value: resolved through the scope chain,
     * carried by presets, exported with the document.
     */
    accepts?: string[];
    /**
     * For `scripts` slots: where the chains apply, as (port, phase) — the
     * substrate declaration of 18 §4a. `before` transforms a value entering the
     * named in-port; `after` transforms what left the named out-port. The
     * binding never sees a chain and cannot decline one; declaring is all a
     * type does, which is what makes a plugin's hook trustworthy without
     * trusting the plugin (03 §4 symmetry).
     */
    port?: string;
    phase?: 'before' | 'after';
    /**
     * For `scripts` slots: read-only context this hook supplies beyond the
     * port's own variables — a speaker's name, the cast list. In-only **by
     * construction**: extras have no legal out declaration, so the general
     * in-but-not-out rule (18 §6a) covers them with no special case. The
     * editor offers exactly `ports + extras` as the fixed choices for a
     * script's declared reads — never a freeform name, which would be a
     * declaration nothing supplies.
     */
    extras?: string[];
    /**
     * For `variables` slots: which context variable each key renders.
     *
     * `{ characters: 'core:var/characters@1' }` says this node produces a value
     * called `characters`, and how it is presented is the registered variable's
     * business rather than this node's. Each key becomes one addressable setting
     * pointing at a swappable template row — so a prose rendering written for one
     * pipeline can be selected from any other pipeline that renders the same
     * variable. That cross-pipeline reuse is the point, and it only works because
     * the row is keyed by *what it renders* rather than by which spec it was
     * authored in.
     *
     * Named `renders` rather than `variables` because the field above already
     * owns that name for a different question — that one asks what a template
     * *may reference*, this one asks what a slot *produces*.
     */
    renders?: Record<string, string>;
}
/**
 * One band of a `share` or `perMember` parameter.
 *
 * The client renders a bar with a label and a colour per band, and **none of
 * those may be written in the client**. A plugin that adds a sixth retrieval
 * source has to get a labelled band without anyone editing that screen, which
 * is the 1:1 rule applied to a control that would otherwise need a hardcoded
 * list of five.
 */
/**
 * The field language, re-exported from settings.ts — where it is now defined
 * once for node params, plugin settings, session-mode fields and message-block
 * forms alike.
 *
 * These used to be a second, subtly different declaration living here: it had
 * `share` and `perMember` where settings had `text`, keyed its label `i18n`
 * where settings said `label`, and nothing converted between the two. The
 * comment in settings.ts promising "the same shape node params use" was
 * describing an intention, not the code. It is the code now.
 */
export type { MemberDecl, ParamDecl, FieldDecl, FieldType } from './settings.js';
export { fieldLabel, fieldAccepts } from './settings.js';
export interface PortDecl {
    [port: string]: ShapeId;
}
/**
 * `Out`/`In` are generic so the *port names* survive into the type system. That is what
 * lets the builder offer `$.history.messages` with autocomplete instead of
 * `$ref('history', 'messages')` with a string (see src/scope.ts). Both default to the
 * open `PortDecl`, so nothing that ignores the generics changes.
 */
/**
 * The chat-shape contract a mode-bearing input type carries (19 §1). See
 * `Descriptor.shape` for the rules; this is the vocabulary.
 *
 * Bounds omit `max` for "unlimited" and omit the whole capability for "does
 * not exist here". Every field is optional so the standard mode can state
 * today's behaviour exactly and a prose mode can state almost nothing.
 */
export interface SessionShape {
    /** The character system: toggles, ordering, pickers, cast rows. */
    characters?: {
        min: number;
        max?: number;
    };
    /** The persona system. Absent or `max: 0`: the user is prose. */
    personas?: {
        min: number;
        max?: number;
    };
    /** The lorebook attachment picker, and retrieval satisfiability. */
    lorebook?: 'optional' | 'required';
    /** What the send surface is. `none` for purely trigger-driven modes. */
    composer?: 'text' | 'none';
    /** Whose name the seed line carries (16's seedName rule, declared). */
    voice?: 'character' | 'narrator';
    /**
     * Mode-declared per-session fields (`SettingsSchema` — the one field
     * language). Rendered in session settings, stored on the session, supplied
     * back through this input's published document.
     */
    fields?: SettingsSchema;
    /** Default next-speaker strategy (19 §5). Session scope may swap it. */
    nextSpeaker?: string;
    /**
     * Whether creating a chat of this mode seeds the cast's greeting messages,
     * and on which channel (20 §7). Absent means the default — **on, on
     * `main`** — so a custom input node gets the standard chat's welcoming
     * behaviour for free and turns it off or redirects it only if it wants to.
     * Core's `user-message` input declares it explicitly so the reusable case
     * reads at a glance.
     */
    greeting?: {
        /** Seed character greetings on creation. Default true. */
        enabled?: boolean;
        /** Which channel the greetings land on. Default `main`. */
        channel?: string;
    };
    /**
     * Which message verbs sessions of this mode offer (20 §4). Absent means
     * all on — the standard chat's posture. Core owns the mechanics and
     * integrity rules; this only declares *availability*, checked server-side
     * at the verb (presence is presentation, refusal is the law).
     *
     * **Delete and hide are deliberately unrepresentable here.** They are
     * floors: the session owner can always delete and always hide their own
     * data, and a mode that could forbid deletion would own the user. Retry
     * and edit are legitimately forbiddable — a dice-are-final mode is a real
     * design.
     */
    messageVerbs?: {
        retry?: boolean;
        continue?: boolean;
        edit?: boolean;
        stepBack?: boolean;
    };
    /**
     * Which surface renders sessions of this mode (20 §12). Absent means
     * core's log — today's behaviour exactly. A plugin id (`acme/crawl`)
     * names the plugin whose declared `session-view` frame surface replaces
     * the whole message section: the total-conversion lane. The frame gets
     * the session over the MessageChannel and returns actions as validated
     * requests; it forfeits core's in-log chrome deliberately. "Restyle the
     * standard chat" is blocks, never this.
     */
    view?: string;
    /**
     * The session's channels beyond the implicit `main` (20 §7) — filter
     * lanes inside one session. What renders a channel is the surface story
     * (a frame subscribes to it); what *stores* it is `messages.channel`; and
     * pipelines choose which lanes build their context through the history
     * query's `channel` param. Declaring one here is what makes it exist for
     * sessions of this mode.
     */
    channels?: string[];
    /**
     * The panels a session of this mode offers in the surface grid (21). The
     * grid is container-responsive: panels flow into tracks that appear and
     * disappear with the *content box* width (not the viewport), so opening a
     * sidebar cascades panels the same way shrinking the window would.
     *
     * Absent means the default — the standard chat's single primary panel (the
     * log + composer). A mode declares extra panels by pushing `PanelDecl`s; a
     * panel points either at a **native** surface (a core-registered component
     * key, zero frontend code beyond registering it) or a **frame** (a plugin's
     * `surfaces.panels[]` entry, opaque-origin iframe). Both wear identical
     * chrome and both are *views onto channels* — a panel renders what a node
     * writes to the channels it subscribes to. This is the "map / cell phone /
     * mission list appears when the action is toggled on" lane: a node emits a
     * `surface:open` intent naming a declared panel, and the grid flows it in.
     *
     * Exactly one panel should carry `role: 'primary'` — it is anchored, always
     * placed, and never cascades to the drawer. Absent-panels defaults supply a
     * primary log automatically, so a mode only lists what it adds.
     */
    panels?: PanelDecl[];
}
/**
 * One panel offered by a session mode (21). Availability, not placement:
 * declaring a panel makes it *addable*; whether an instance is active and where
 * it sits is the per-user layout row's business. `defaultActive` seeds a fresh
 * session's layout; a node's `surface:open` intent activates one later.
 */
export interface PanelDecl {
    /** Stable id — layout rows and `surface:open` intents key on this. */
    id: string;
    /** Human title shown in the panel's chrome and the "add panel" menu. */
    title: string;
    /** Optional icon name (the app maps it to its icon set). */
    icon?: string;
    /**
     * The anchored conversation panel is `primary` — always placed, never
     * drawered. Everything else is `secondary` (the default).
     */
    role?: 'primary' | 'secondary';
    /** What renders inside. A native component key, or a plugin frame surface. */
    surface: {
        kind: 'native';
        component: string;
    } | {
        kind: 'frame';
        pluginId: string;
        entry: string;
    };
    /** Which channels feed it (20 §4/§7). A panel is a view onto its channels. */
    channels?: string[];
    /** Layout hints the packer honours; all optional, all have sane floors. */
    layout?: {
        /** Ideal / min / max column span, in grid tracks. */
        span?: {
            ideal?: number;
            min?: number;
            max?: number;
        };
        /** Inline (width) floor in px below which the panel un-spans or drawers. */
        minInline?: number;
        /** Block (height) floor in px for stacked panels sharing a track. */
        minBlock?: number;
        /** May the user collapse it to its title bar? Default true. */
        collapsible?: boolean;
        /** May the user close/deactivate it? Primary is never closable. */
        closable?: boolean;
        /** Where a freshly activated instance prefers to land. Default `grid`. */
        prefer?: 'grid' | 'drawer';
    };
    /** Seed this panel active in a new session's default layout. Default false. */
    defaultActive?: boolean;
}
export interface Descriptor<Out extends PortDecl = PortDecl, In extends PortDecl = PortDecl, Id extends string = string> {
    /**
     * `namespace:kind/name@N` — and the `@N` is the **type** version, which is a pin
     * (01 §3). Distinct from a spec's semver, which is an upgrade key (src/identity.ts).
     * Carried in the type so a pinned constructor can expose `.v1()` at the call site.
     */
    id: Id;
    kind: Kind;
    i18n?: {
        name?: I18n;
        description?: I18n;
    };
    slots?: Record<string, SlotDecl>;
    ports: {
        in?: In;
        out?: Out;
    };
    /** Provider/consumer only — the review gate keys on this, not on kind (01 §7). */
    effects?: 'none' | 'external' | 'write' | 'emit';
    /**
     * An author may default review **on** for their own node. There is no value here
     * that forbids it — that is the enforcement, not a rule someone checks (F14).
     */
    reviewDefault?: ReviewPosition;
    /** Connection kind for providers (== produced shape). */
    shape?: ShapeId;
    /** May this node be switched off? Requires shape transparency (01 §14 F-toggleable). */
    toggleable?: boolean;
    /**
     * Producing nothing is a legitimate outcome, so failing is not the run's
     * failure.
     *
     * An `err` — including a timeout — becomes an empty `ok` and the run
     * continues. The receipt still records what went wrong: `result` stays
     * `err`, `reason` keeps the message, and `recoveredAsEmpty` marks it, so
     * this is *tolerated* rather than hidden. A node whose failure nobody can
     * see is worse than one that stops the run.
     *
     * For enrichment a template already guards with `{{#if}}` — the narrative
     * graph's relationship summary is the case this exists for: a slow read of
     * an optional block should never cost somebody their reply. It does **not**
     * license wiring a required input to an optional node; downstream still has
     * to mean something when the value is absent, which is a property of the
     * ports, not of this flag.
     *
     * Deliberately not `halt` or `cancelled`. A halt is a binding saying "stop
     * here" on purpose (a preview, a review gate) and a cancellation is the
     * user; neither is a failure to absorb.
     */
    optional?: boolean;
    /** Declares it consumes the run seed — keeps Tasks pure (F11). */
    declaresRandomness?: boolean;
    /**
     * Interior script points (18 §4e): named moments *inside* the binding's
     * work where user text-transform chains may run — a drafting loop's
     * intermediate texts. Declared here so "which nodes can run scripts, and
     * where" is answerable from the document; the binding invokes one with
     * `ctx.scripts.applyText(key, text)` and gets no `ctx.scripts` at all
     * without a declaration. **Part of the hashed contract** — a point
     * appearing or vanishing changes what an untouched spec's configuration
     * can reach (S3's argument, one construct over). `i18n`/`description` are
     * display text and stripped from the hash as everywhere.
     */
    scriptPoints?: Array<{
        key: string;
        i18n?: I18n;
        description?: I18n;
    }>;
    /**
     * The chat-shape contract (19 §0–§1) — present **only on input types**,
     * and its presence is what makes the input type a **chat mode**. The mode
     * id is this type's id; any spec pinning it and matching the primary-write
     * signature is in the mode's bucket, by construction.
     *
     * The core idea is **capability references**: the shape names the systems
     * of core it uses, and declaring one is what enables that system's UI,
     * storage and query satisfiability for chats of the mode. A capability the
     * shape does not declare does not exist for the chat — no toggles, no
     * rows, no budget spent retrieving for it. `personas` absent or `max: 0`
     * means the user is prose: nameless text, no identity, a first-class
     * state rather than an edge case.
     *
     * **Hashed contract** (display lives in `i18n` as everywhere): widening
     * `characters.max` changes what existing sessions legally contain — the
     * `optional` lesson, again. `fields` reuses `SettingsSchema` — the
     * one-field-language rule — rendered in session settings and supplied back
     * through this input's published document. Duties and triggers are
     * deliberately NOT here: the shape is owner-only, and event functions
     * beyond the intrinsic composer are contributed by the specs that serve
     * them (19 §3–§4), so a mode never has to know its narrator exists.
     *
     * Named `sessionShape` because `shape` was already taken by the provider
     * connection kind above — renaming *that* would re-hash every provider
     * on the instance for a word.
     */
    sessionShape?: SessionShape;
    /** May finish before an upstream stream ends (01 §11). */
    earlyExit?: boolean;
    /** Public pipeline hooks may be pinned by any spec (01 §9b). */
    public?: boolean;
    /** F36 — every hook invocation is bounded. */
    timeoutMs?: number;
    timeoutKind?: 'wall' | 'idle';
    /** Which core event a write causes. Declared here, never per spec (01 §8). */
    causesEvent?: string;
    usage?: string;
    /**
     * Which media kinds this type can take in and give out.
     *
     * Declared rather than inferred from ports, because the ports are
     * deliberately general: one `media-ref` shape carries every kind, so the
     * port says *that* media flows here and this says *which*. That split is
     * what keeps a new modality from being a new shape, new ports and a new
     * branch in every wire adapter, while still letting a picker grey out a
     * connection that cannot read PDFs.
     *
     * A **type** declaring `accepts` says the contract has somewhere to put
     * media. Whether a given *connection* behind it actually does is a runtime
     * capability the adapter reports — same shape, same field name, resolved
     * against this at bind time. A spec that wires an image into a connection
     * whose model is text-only should fail where the user can see it, not at
     * the provider's HTTP call.
     */
    media?: MediaCapability;
}
export declare function getType(id: string): Descriptor | undefined;
export declare function allTypes(): Descriptor[];
export declare function _clearTypes(): void;
export declare const describeInput: <O extends PortDecl, I extends PortDecl, const Id extends string>(d: Omit<Descriptor<O, I, Id>, 'kind'>) => {
    id: Id;
    i18n?: {
        name?: I18n;
        description?: I18n;
    };
    slots?: Record<string, SlotDecl>;
    ports: {
        in?: I | undefined;
        out?: O | undefined;
    };
    effects?: 'none' | 'external' | 'write' | 'emit';
    reviewDefault?: ReviewPosition;
    shape?: ShapeId;
    toggleable?: boolean;
    optional?: boolean;
    declaresRandomness?: boolean;
    scriptPoints?: Array<{
        key: string;
        i18n?: I18n;
        description?: I18n;
    }>;
    sessionShape?: SessionShape;
    earlyExit?: boolean;
    public?: boolean;
    timeoutMs?: number;
    timeoutKind?: 'wall' | 'idle';
    causesEvent?: string;
    usage?: string;
    media?: MediaCapability;
    kind: 'input';
};
export declare const describeQueryType: <O extends PortDecl, I extends PortDecl, const Id extends string>(d: Omit<Descriptor<O, I, Id>, 'kind'>) => {
    id: Id;
    i18n?: {
        name?: I18n;
        description?: I18n;
    };
    slots?: Record<string, SlotDecl>;
    ports: {
        in?: I | undefined;
        out?: O | undefined;
    };
    effects?: 'none' | 'external' | 'write' | 'emit';
    reviewDefault?: ReviewPosition;
    shape?: ShapeId;
    toggleable?: boolean;
    optional?: boolean;
    declaresRandomness?: boolean;
    scriptPoints?: Array<{
        key: string;
        i18n?: I18n;
        description?: I18n;
    }>;
    sessionShape?: SessionShape;
    earlyExit?: boolean;
    public?: boolean;
    timeoutMs?: number;
    timeoutKind?: 'wall' | 'idle';
    causesEvent?: string;
    usage?: string;
    media?: MediaCapability;
    kind: 'query';
};
export declare const describeTaskType: <O extends PortDecl, I extends PortDecl, const Id extends string>(d: Omit<Descriptor<O, I, Id>, 'kind'>) => {
    id: Id;
    i18n?: {
        name?: I18n;
        description?: I18n;
    };
    slots?: Record<string, SlotDecl>;
    ports: {
        in?: I | undefined;
        out?: O | undefined;
    };
    effects?: 'none' | 'external' | 'write' | 'emit';
    reviewDefault?: ReviewPosition;
    shape?: ShapeId;
    toggleable?: boolean;
    optional?: boolean;
    declaresRandomness?: boolean;
    scriptPoints?: Array<{
        key: string;
        i18n?: I18n;
        description?: I18n;
    }>;
    sessionShape?: SessionShape;
    earlyExit?: boolean;
    public?: boolean;
    timeoutMs?: number;
    timeoutKind?: 'wall' | 'idle';
    causesEvent?: string;
    usage?: string;
    media?: MediaCapability;
    kind: 'task';
};
/**
 * A Provider type.
 *
 * `const S` on the slots is what makes `ctx.can()` safe: without it,
 * `optional: ['json_schema']` widens to `CapabilityId[]` at the declaration and
 * the binding can only be told "some capability", which is no narrowing at all.
 * With it the literal tuple survives into `Pinned<D>` and out the other side, so
 * a binding asking about a capability its node never declared does not compile.
 */
export declare const describeProvider: <O extends PortDecl, I extends PortDecl, const Id extends string, const S extends Record<string, unknown> = Record<string, never>>(d: Omit<Descriptor<O, I, Id>, 'kind' | 'slots'> & {
    slots?: S & Record<string, SlotDecl>;
}) => Descriptor<O, I, Id> & {
    kind: 'provider';
    slots?: S;
};
export declare const describeConsumerTarget: <O extends PortDecl, I extends PortDecl, const Id extends string>(d: Omit<Descriptor<O, I, Id>, 'kind'>) => {
    id: Id;
    i18n?: {
        name?: I18n;
        description?: I18n;
    };
    slots?: Record<string, SlotDecl>;
    ports: {
        in?: I | undefined;
        out?: O | undefined;
    };
    effects?: 'none' | 'external' | 'write' | 'emit';
    reviewDefault?: ReviewPosition;
    shape?: ShapeId;
    toggleable?: boolean;
    optional?: boolean;
    declaresRandomness?: boolean;
    scriptPoints?: Array<{
        key: string;
        i18n?: I18n;
        description?: I18n;
    }>;
    sessionShape?: SessionShape;
    earlyExit?: boolean;
    public?: boolean;
    timeoutMs?: number;
    timeoutKind?: 'wall' | 'idle';
    causesEvent?: string;
    usage?: string;
    media?: MediaCapability;
    kind: 'consumer';
};
/**
 * A pinned constructor. The builder method names the *kind*; this names the
 * *type and version* (04 §4b). Both are required — drop either and F21 or static
 * pin-checking goes with it.
 */
export interface NodeSpec<D extends Descriptor<any, any, any> = Descriptor> {
    readonly __node: true;
    descriptor: D;
    config: Record<string, unknown>;
}
/** `'core:query/session-history@2'` → `'2'`. Absent means `1`. */
type VersionOf<S extends string> = S extends `${string}@${infer V}` ? V : '1';
export type NodeCtor<D extends Descriptor<any, any, any>> = (config?: Record<string, unknown>) => NodeSpec<D>;
/**
 * A pinned constructor (04 §4b).
 *
 * The builder method names the **kind**; this names the **type and version**, and the
 * version sits at the call site — `generateText.v1({ … })` — for three reasons that a
 * version baked into the id cannot deliver:
 *
 *  - upgrading a pin is a **visible diff**, not an invisible change of meaning
 *  - two versions of a type can **coexist in one spec**, which a migration needs
 *  - a deprecated pin **strikes through** on `generateText.v1` precisely, because the
 *    key is what carries the version
 */
export type Pinned<D extends Descriptor<any, any, any>> = {
    readonly [K in `v${VersionOf<D['id']>}`]: NodeCtor<D>;
} & {
    readonly id: D['id'];
    readonly descriptor: D;
};
export declare function pin<D extends Descriptor<any, any, any>>(descriptor: D): Pinned<D>;
/** The out-port map of whatever a pinned constructor produces — the scope's raw material. */
export type OutPortsOf<N> = N extends NodeSpec<infer D> ? D extends Descriptor<infer O, any, any> ? O : PortDecl : PortDecl;
