/**
 * The builder (04 §4). Kind-named methods — `.inlet() .query() .task() .oracle()
 * .outlet()` — so reading a spec top to bottom shows the effect taxonomy, and so
 * the type system can enforce laws that a generic .step() could only find at
 * validation time (04 §4a). Clauses are `.gather() .each() .loop() .junction()`
 * (R-14, ruled 2026-09-15).
 *
 * The chain is a *value*. It compiles to a document; SP imports the document and
 * never this code (F6).
 *
 * Every node method takes either a pinned constructor or a **callback that receives the
 * scope** — `$ => C.assemble({ messages: $.history.messages })`. The callback form is
 * preferred: it types the node key and the port, and it makes a forward reference
 * impossible to write rather than a finding to read (src/scope.ts). Both forms compile
 * to the same rows.
 */
import { type NodeSpec, type Kind, type PortDecl, type OutPortsOf, type Descriptor } from './descriptors.js';
import { ITEM, type Scope } from './scope.js';
import { type DataRef } from './refs.js';
import type { SessionShape } from './descriptors.js';
import type { TemplateValue } from './engines.js';
import { type EnvoyDecl, type GenreDecl } from './genres.js';
import type { ExternalRef } from './announce.js';
import { type SessionEventDecl } from './events.js';
import { type I18n } from './i18n.js';
import { type ActionDecl } from './actions.js';
/** @experimental */
export interface SpecMeta {
    /**
     * Semver. **The upgrade key, not part of the identity** — an import replaces the
     * installed copy when newer and is ignored when it is not (src/identity.ts).
     */
    version: string;
    /**
     * Who ships this spec: a plugin slug, `core`, or absent for a hand-imported document.
     * Defaults to the owner segment of the id, so it only needs stating when they differ.
     *
     * Ownership is what stops an update from silently taking over a spec an admin
     * imported by hand, or one another plugin ships — "newer" is not a licence to
     * overwrite somebody else's row.
     */
    owner?: string;
    /**
     * For the genre's create pipeline this carries the genre's declaration
     * (24 §3): display name, family, standing `SessionShape`, event surface.
     * Stored on the version row so shape checks stay SELECTs, never document
     * loads.
     */
    genre?: {
        name: unknown;
        family: string;
        /** The picker card's subtitle. */
        description?: unknown;
        shape?: SessionShape;
        /**
         * The genre's event surface (24 §5), persisted with the declaration
         * so "which events exist and which are required" stays a SELECT —
         * the genre dashboard and the preset editor read it off the row.
         */
        events?: Record<string, {
            required?: boolean;
            open?: boolean;
        }>;
        /**
         * The genre's envoys (R-18), persisted with the declaration for the
         * same reason the events are: a host reads "which speakers does this
         * genre bring" off the create spec's row, never from the running
         * registry — which is also what makes them part of the spec's hash.
         */
        envoys?: readonly EnvoyDecl[];
        /**
         * What a person's persona-less line is called (R4), persisted with the
         * declaration on the same terms as the envoys: the host names those
         * lines off the create spec's row. See `GenreDecl.playerLabel`.
         */
        playerLabel?: unknown;
        /**
         * The genre's pinned settings (PLAN-turn-order §4.13), persisted
         * with the declaration on the same terms as the envoys: the host
         * resolves the settings cascade off the create spec's row, never
         * from the running registry. See `GenreDecl.settings`.
         */
        settings?: Readonly<Record<string, unknown>>;
    };
    i18n?: {
        name?: unknown;
    };
    /**
     * Where this spec sits in the catalogue (ruled 2026-08-27): declared
     * metadata, **never** encoded into the id — an id is an address that
     * receipts and configs hold forever, while a classification is a claim
     * that changes. The admin surface sorts, groups and filters on these;
     * nothing may parse them out of the id.
     */
    taxonomy?: SpecTaxonomy;
    /**
     * What this spec contributes to *other* surfaces (19 §3–§4). **Actions**
     * are the first kind: "I offer this function on sessions of that genre,
     * at these venues" — the narrate spec contributes the narrator button to
     * the standard genre, and the genre never has to know. Rides the document
     * (hashed with it, stored with it, exported with it), so contribution is
     * content, not registration.
     *
     * The action model (plans/29 R-15, 30 §U5c): every action declares a
     * **venue** (where, per channel), an **audience** (who sees, who acts),
     * `quick` (primary set or overflow), a **slash name** and a localised
     * `label` — see `actions.ts`.
     */
    contributes?: {
        /**
         * Each action is offered to the genre of the spec's inlet lock, so an
         * action never names a genre — `.inlet()` fills it in.
         */
        actions?: Array<Omit<ActionDecl, 'genre'> & {
            genre?: never;
        }>;
    };
}
/**
 * The catalogue claims (ruled 2026-08-27). All optional — an undeclared spec
 * still lists, it just sorts under "unclassified" — and all open to change on
 * republish without touching identity.
 * @experimental
 */
export interface SpecTaxonomy {
    /**
     * What the pipeline is to its genre: `create` instantiates sessions of its
     * type (23 §7 — the required one; the spec IS the session type), `primary`
     * carries the main turn, `action` is invoked by a person or trigger,
     * `maintenance` runs off the critical path (summaries, graph builds).
     */
    role?: 'create' | 'primary' | 'action' | 'maintenance';
    /**
     * The one session genre this spec serves — a genre id (24 §3), e.g.
     * `core:genre/chat`. **Never written by an author**: `.inlet()`
     * copies it from the lock, so the catalogue and the lock cannot
     * disagree. A document read back carries it.
     */
    genre?: never;
}
/** @experimental */
export interface BuiltNode {
    key: string;
    kind: Kind;
    definitionId: string;
    definitionVersion: number;
    config: Record<string, unknown>;
    /** Set when the node sits inside a clause — a gather, an each, a loop, a junction. */
    clauseId?: string;
    clauseKind?: ClauseKind;
    clauseChain?: string;
    position: number;
    /**
     * Where this node's controls may be shown beyond the admin's pipeline
     * panel (PLAN-turn-order §4.11, R12). `session: true` marks the node's
     * rebind (on a strategy node) or its params as a **declared session
     * setting**: the session settings form renders a card for the spec with
     * exactly the marked keys, and nothing else. Stored in the document, so
     * the form reads it off the registry. Absent = admin panel only.
     *
     * `swaps` (R28, the modder pass): the definition ids a session may seat
     * here instead of the pin, in the order a picker lists them. The pin is
     * the default and is always offered first, so it is never listed. Present
     * only when non-empty; a node with swaps is always `session: true`.
     *
     * `stream` and `status` (lair pass B3/B18, ruled 2026-09-27, D6/D5) are
     * what the node shows **while it runs**:
     *
     *  · `stream: true` — **the streaming step**: this oracle's tokens are
     *    the reply's prose, routed into the run's live row as they arrive.
     *    Declared, never inferred (D6): a spec that marks nothing streams
     *    nothing and shows its status until the write lands. At most one on
     *    any single execution path — steps in mutually exclusive branches of
     *    one junction may each stream, and the one that runs does (W2) — an
     *    oracle with a streaming out-port — a JSON step never
     *    streams — and never inside an `each` or a `loop`; `validate()`
     *    refuses the rest (law `streaming step`).
     *  · `status` — **the step status**: the sentence the row and the
     *    progress card show while this node runs (*Planning the turn*), a
     *    string or a locale map (R-20), `{speaker}` filled by the host. It
     *    wins over any status the node's own handler sets, for this node
     *    only.
     */
    expose?: {
        session?: boolean;
        swaps?: string[];
        stream?: true;
        status?: I18n;
    };
}
/**
 * One branch's condition (20 §10). Exactly one of `equals` / `equalsPath` /
 * `truthy` / `default` per predicate; `path` narrows what the condition reads
 * off the junction's value (dot path, e.g. `call.tool`). Deliberately not a
 * rules engine — a decision too rich for this table belongs in a Task that
 * computes a value this table can read.
 *
 * The shape is `predicates.ts`'s, which an action's *enabled-when* reads too,
 * so a branch and a greyed button can never mean two different things by the
 * same words.
 * @experimental
 */
export interface JunctionPredicate {
    /** Dot path read off the junction's value first. Absent = the value itself. */
    path?: string;
    /** Fires when the (possibly path-read) value strictly equals this literal. */
    equals?: unknown;
    /**
     * Fires when the value strictly equals the value at **another path on the
     * same junction value** (D-4a, 2026-09-17) — `{ path: 'accused',
     * equalsPath: 'culprit' }` over a task publishing both.
     *
     * `equals` takes a literal, so without this a branch could ask *is the
     * accused Vell?* and never *is the accused the culprit?* — the one
     * question a genre that DERIVES its hidden fact has to ask. ⚠ Either side
     * absent fires nothing: two unwired ports must not compare equal and route
     * the branch that means *you got it right*.
     */
    equalsPath?: string;
    /** Fires when the value is truthy. */
    truthy?: boolean;
    /** Fires exactly when no other branch fired. At most one per junction. */
    default?: boolean;
}
/**
 * The four clause rules (R-14, ruled 2026-09-15). A **clause** is a container of
 * nodes with a repetition or branching rule of its own: **gather** collects
 * several chains (was `async`; `mode` is a setting and, by the equivalence law,
 * unobservable), **each** runs once per item (was `map`), **loop** repeats
 * while a predicate holds, **junction** runs the branches whose predicates
 * fired (was `route`). Stored documents say these words; the content hash
 * moved once, with the kinds.
 * @experimental
 */
export type ClauseKind = 'gather' | 'each' | 'loop' | 'junction';
/** @experimental */
export interface BuiltClause {
    id: string;
    kind: ClauseKind;
    mode: 'sequential' | 'parallel';
    /** each only — the list to iterate. */
    over?: unknown;
    /**
     * **Mandatory for each and loop.** An unbounded repeat is the most likely source of a
     * surprise bill in the system, and for a loop it is also the only thing standing
     * between a bad predicate and a run that never ends.
     */
    max?: number;
    /**
     * loop only. A **port reference**, not an expression: the loop repeats while this
     * value is truthy, re-evaluated at the end of each iteration (do-while — a tool
     * loop always wants one generate before it can know whether to stop).
     *
     * A reference rather than an expression is what keeps the construct renderable
     * ("repeats while generate.hasToolCalls, max 8") and keeps a second expression
     * language out of the design.
     */
    repeatWhile?: unknown;
    /**
     * junction only. The value the branches are chosen on — a port reference
     * resolved when the clause runs. A reference for the same reason
     * `repeatWhile` is one: the construct stays renderable ("junction on
     * parse.call") and no second expression language enters the design (20 §10).
     */
    on?: unknown;
    /**
     * junction only. Each branch's declared predicate over the value. Any
     * subset of branches may fire; a `default: true` branch fires exactly when
     * nothing else did. Declarations, never code — the executor evaluates
     * them, the receipt records every evaluation, and the panel can render
     * the whole table without running anything.
     */
    branches?: Record<string, JunctionPredicate>;
    chains: string[];
    /** Clauses nest: which clause and chain this one sits inside. Undefined = the spine. */
    clauseId?: string;
    clauseChain?: string;
    /** Ordering against sibling nodes at the same level. */
    position: number;
}
/**
 * A preset the **spec author** ships — "Balanced", "Lore-heavy", "Fast" (12 §3).
 *
 * The scope chain's layer 5 is a single author default per slot, which is enough for one
 * opinion and no help at all for "here are three coherent ways to run this." Named author
 * presets fill that, and they need no schema: they seed `config_presets` and
 * `node_overrides` rows at `scope_kind='config'` on install, which both already exist.
 *
 * Two rulings ride on this — see 12 §3a.
 * @experimental
 */
export interface BuiltPreset {
    /**
     * **The identity.** Stable, PK-agnostic, and the reference an update or a defaults
     * sync matches on — same convention as the events registry (13 §7g), now applied to
     * every seeded row rather than to events alone.
     *
     * The consequence worth knowing: the slug is the identity and the label is the
     * display, so renaming "Lore-heavy" to "World-focused" is free and keeps every
     * user's selection intact. Changing the *slug* is a delete plus a create.
     */
    slug: string;
    /** The name a picker lists it by — a string or a locale map with `en` (R-20). */
    label: I18n;
    description?: I18n;
    /** At most one author preset may be the shipped default. */
    default?: boolean;
    /**
     * Who owns this preset, for update and sync. Defaults to the spec's owner, and is
     * stated explicitly only in the case that justifies the field existing: a **preset
     * pack** — a plugin shipping presets for a pipeline someone else ships. Uninstalling
     * the pack must remove its presets and leave the pipeline alone, which is only
     * decidable if the preset says who it belongs to (12 §3b).
     */
    owner?: string;
    /** Flat override rows, exactly the shape `node_overrides` stores. */
    values: Array<{
        nodeKey: string;
        slot: string;
        value: unknown;
    }>;
}
/** @experimental */
export interface BuiltSpec {
    id: string;
    meta: SpecMeta;
    nodes: BuiltNode[];
    clauses: BuiltClause[];
    /** Fragments included, recorded for provenance after expansion (16 §3a). */
    includes: Array<{
        key: string;
        fragmentId: string;
    }>;
    /** Author-shipped named configurations (12 §3a). Round-trips with the document (F4). */
    presets: BuiltPreset[];
    /**
     * The usage lock (24 §4): the session event this spec's input answers,
     * and the genre it serves. Declared on `.input()`, serialized with the
     * document, hashed with it, enforced at compile, publish and dispatch.
     *
     * `events` (PLAN-turn-order §4.1, 2026-09-21): the alternative to one
     * `event` — a spec that answers several session events (the turn-order
     * spec answers nine). A dispatched event is accepted when it is the
     * locked `event` or is in `events`. Preset bindings are unchanged: a
     * spec bound to N events has N binding rows.
     */
    input?: {
        genre?: string;
        event?: string;
        events?: string[];
    };
}
/** What a node method accepts: the value, or a function of the scope that returns it. @experimental */
export type NodeArg<N, Nodes extends Record<string, PortDecl>> = N | (($: Scope<Nodes>) => N);
/**
 * The optional third argument of a node method (PLAN-turn-order §4.11):
 * `{ expose: { session: true } }` marks the node's controls as a declared
 * session setting — see `BuiltNode.expose`. Additive: every existing call
 * passes nothing and lands exactly the row it landed before.
 *
 * `swaps` (R28) lists the pins a session may seat instead of this node's —
 * pins, not strings, so a typo is a compile error and the fit is checked
 * here: each must be the same kind with the same in- and out-ports, by name
 * and shape. Listing swaps implies `session: true`.
 * @experimental
 */
export interface NodeOpts {
    expose?: {
        session?: boolean;
        swaps?: readonly {
            readonly id: string;
            readonly descriptor: Descriptor<any, any, any>;
        }[];
        /** This oracle is the streaming step — see `BuiltNode.expose` (B3, D6). */
        stream?: true;
        /** The step status shown while this node runs — see `BuiltNode.expose` (B18, D5). */
        status?: I18n;
    };
}
/**
 * A pinned constructor of a given kind. Constraining each method to its own kind makes
 * `.query('x', C.generateText())` a **compile** error rather than a throw — 04 §4a said
 * the method names the kind, and this is that claim actually enforced by the type system
 * instead of by a message at authoring time.
 * @experimental
 */
export type NodeOf<K extends Kind> = NodeSpec<Descriptor<any, any> & {
    kind: K;
}>;
/**
 * What an each iterates. Kept as a closed union rather than `unknown | fn`, because a
 * union with `unknown` collapses to `unknown` and the callback's parameter loses its
 * type — the exact thing this whole change exists to prevent.
 * @experimental
 */
export type EachOver<Nodes extends Record<string, PortDecl>> = (($: Scope<Nodes>) => DataRef) | DataRef | readonly unknown[];
/**
 * Node keys accumulate **fully qualified**, exactly as they land in the rows (F21) — so
 * a node declared inside a clause enters the scope as `gather.semantic.embed`, and the
 * scope type expands the dots back into a path (src/scope.ts).
 */
type Qualify<Prefix extends string, K extends string> = Prefix extends '' ? K : `${Prefix}.${K}`;
type Add<Nodes extends Record<string, PortDecl>, K extends string, N> = Nodes & {
    [P in K]: OutPortsOf<N>;
};
/** Like `Add`, but for a construct whose ports are known directly rather than via a descriptor. */
type AddPorts<Nodes extends Record<string, PortDecl>, K extends string, P extends PortDecl> = Nodes & {
    [X in K]: P;
};
/** Pull the accumulated node map back out of a builder the author handed us. @experimental */
export type NodesOf<B> = B extends ChainBuilder<infer M, any> ? M : B extends GatherBuilder<infer M, any> ? M : never;
/**
 * What a clause publishes. Addressable like a node, because it is the only well-defined
 * handle on a construct that ran more than once — "whichever iteration happened to run
 * last" is not a value anyone means.
 * @experimental
 */
export type BranchPorts = {
    main: string;
    values: string;
    branches: string;
    ok: string;
};
/**
 * What a junction publishes (M4, PLAN-turn-order §4.14): the clause ports,
 * and the fired branch's own ports beside them — `$.decide.order`. Open at
 * the type level (any port name reads); `validate()` holds the document to
 * ports every branch's last node actually publishes, with one shape.
 * @experimental
 */
export type JunctionPorts = BranchPorts & {
    [port: string]: string;
};
/** Namespace a fragment's nodes under the include key, at publish and in the type (16 §3a). */
type Prefixed<K extends string, M> = {
    [P in keyof M & string as `${K}.${P}`]: M[P];
};
/** @experimental */
declare class ChainBuilder<Nodes extends Record<string, PortDecl> = {}, Prefix extends string = ''> {
    protected spec: BuiltSpec;
    protected clauseCtx?: {
        clauseId: string;
        chain: string;
    } | undefined;
    constructor(spec: BuiltSpec, clauseCtx?: {
        clauseId: string;
        chain: string;
    } | undefined);
    /** Resolve the callback form against the nodes declared so far. */
    protected resolve<N>(arg: NodeArg<N, Nodes>): N;
    protected add(kind: Kind, key: string, arg: NodeArg<NodeSpec<any>, Nodes>, opts?: NodeOpts): any;
    protected qualify(key: string): string;
    /** Where a clause declared here sits, so clauses nest exactly as nodes do. */
    protected declareClause(b: Omit<BuiltClause, 'clauseId' | 'clauseChain' | 'position'>): BuiltClause;
    /**
     * A **gather** clause: several chains collected and awaited together (01 §4).
     * `mode` is a setting — by the equivalence law (C8) parallel and sequential
     * are unobservable, which is why the construct is named for what it does
     * (gather) and not for how (was `.async()`).
     */
    gather<Id extends string, R extends GatherBuilder<any, any>>(id: Id, opts: {
        mode?: 'sequential' | 'parallel';
    }, fn: (b: GatherBuilder<Nodes, Qualify<Prefix, Id>>) => R): ChainBuilder<AddPorts<NodesOf<R>, Qualify<Prefix, Id>, BranchPorts>, Prefix>;
    /** An **each** clause: one contained chain, once per item of a list (01 §4). Was `.map()`. */
    each<Id extends string, R extends ChainBuilder<any, any>>(id: Id, opts: {
        over: EachOver<Nodes>;
        max: number;
        mode?: 'sequential' | 'parallel';
    }, fn: (c: ChainBuilder<Nodes & {
        [ITEM]: PortDecl;
    }, `${Qualify<Prefix, Id>}.item`>) => R): ChainBuilder<AddPorts<NodesOf<R>, Qualify<Prefix, Id>, BranchPorts>, Prefix>;
    /**
     * One contained chain, repeated while a declared port stays truthy — bounded by a
     * mandatory `max` (01 §4a).
     *
     * This is the construct that makes tool-calling expressible on the spine. It is **not
     * a back-edge**: like `each`, the repetition lives in the clause's declaration rather
     * than in an edge that points backwards, and the executor already knew how to run a
     * chain more than once. A loop is an each whose iteration count comes from a predicate
     * instead of a list length.
     *
     * Always sequential — each iteration depends on the last, so `mode` would be a lie.
     */
    loop<Id extends string, R extends ChainBuilder<any, any>>(id: Id, opts: {
        repeatWhile: (($: Scope<any>) => DataRef) | DataRef;
        max: number;
    }, fn: (c: ChainBuilder<Nodes, `${Qualify<Prefix, Id>}.item`>) => R): ChainBuilder<AddPorts<NodesOf<R>, Qualify<Prefix, Id>, BranchPorts>, Prefix>;
    /** Internal: the callback resolver, reachable from `loop` after the body is built. */
    resolvePublic<N>(arg: NodeArg<N, any>): N;
    /**
     * A **junction** clause (was `.route()`): branches selected by declared
     * predicates over a value on the spine (20 §10). Any subset fires — one,
     * several, or none — plus an optional `otherwise` that fires exactly when
     * nothing else did. The decision is *data a task computed* (the value the
     * junction is `on`); the branching is declaration; the receipt records
     * every predicate's evaluation, fired and skipped alike. Not a back-edge
     * and not code in the executor — the loop clause's whole argument, applied
     * to fan-out. 01 §4 amended: branching exists as a declared junction; no
     * back-edges.
     *
     * Skipped branches publish `halt('not selected')` results marked
     * `fired: false`; the union's `ok`/`values` read the *fired* branches, so
     * downstream folds see what ran, in declaration order (13 §1).
     */
    junction<Id extends string, R extends JunctionBuilder<any, any>>(id: Id, opts: {
        on: (($: Scope<any>) => DataRef) | DataRef;
        mode?: 'sequential' | 'parallel';
    }, fn: (r: JunctionBuilder<Nodes, Qualify<Prefix, Id>>) => R): ChainBuilder<AddPorts<NodesOf<R>, Qualify<Prefix, Id>, JunctionPorts>, Prefix>;
    query<K extends string, N extends NodeOf<'query'>>(key: K, node: NodeArg<N, Nodes>, opts?: NodeOpts): ChainBuilder<Add<Nodes, Qualify<Prefix, K>, N>, Prefix>;
    task<K extends string, N extends NodeOf<'task'>>(key: K, node: NodeArg<N, Nodes>, opts?: NodeOpts): ChainBuilder<Add<Nodes, Qualify<Prefix, K>, N>, Prefix>;
    oracle<K extends string, N extends NodeOf<'oracle'>>(key: K, node: NodeArg<N, Nodes>, opts?: NodeOpts): ChainBuilder<Add<Nodes, Qualify<Prefix, K>, N>, Prefix>;
    outlet<K extends string, N extends NodeOf<'outlet'>>(key: K, node: NodeArg<N, Nodes>, opts?: NodeOpts): ChainBuilder<Add<Nodes, Qualify<Prefix, K>, N>, Prefix>;
}
declare class GatherBuilder<Nodes extends Record<string, PortDecl> = {}, Id extends string = string> {
    private spec;
    private clauseId;
    constructor(spec: BuiltSpec, clauseId: string);
    /**
     * Each chain's nodes accumulate into the clause's type, so by the time `.gather()`
     * returns, the spine's scope contains every node the clause declared — under the
     * qualified key it actually has.
     */
    chain<Name extends string, R extends ChainBuilder<any, any>>(name: Name, fn: (c: ChainBuilder<Nodes, Qualify<Id, Name>>) => R): GatherBuilder<NodesOf<R>, Id>;
}
/**
 * The junction clause's own builder: every branch is a named chain *with a
 * declared predicate*, and the two are stated together so a branch without a
 * condition cannot be written at all.
 * @experimental
 */
export declare class JunctionBuilder<Nodes extends Record<string, PortDecl> = {}, Id extends string = string> {
    private spec;
    private clauseId;
    private clause;
    constructor(spec: BuiltSpec, clauseId: string, clause: BuiltClause);
    /** A branch that fires when its predicate matches the junction's value. */
    when<Name extends string, R extends ChainBuilder<any, any>>(name: Name, predicate: Omit<JunctionPredicate, 'default'>, fn: (c: ChainBuilder<Nodes, Qualify<Id, Name>>) => R): JunctionBuilder<NodesOf<R>, Id>;
    /** The branch that fires exactly when nothing else did. At most one. */
    otherwise<Name extends string, R extends ChainBuilder<any, any>>(name: Name, fn: (c: ChainBuilder<Nodes, Qualify<Id, Name>>) => R): JunctionBuilder<NodesOf<R>, Id>;
}
/**
 * Slot-named methods, for the same reason the chain has kind-named ones (04 §4a): the
 * method names the slot, so setting a slot a node never declared is caught by name rather
 * than becoming an override row that silently matches nothing.
 * @experimental
 */
export declare class PresetBuilder<Nodes extends Record<string, PortDecl> = {}> {
    private preset;
    constructor(preset: BuiltPreset);
    private set;
    /** Node behaviour knobs — retrieval `weight`, `minInclude`, `topK` (12 §2). */
    params(nodeKey: keyof Nodes & string, value: Record<string, unknown>): this;
    /** Authored text fields the node declares. */
    prompts(nodeKey: keyof Nodes & string, value: Record<string, unknown>): this;
    /** A template **and its engine** — the engine travels on the value (src/engines.ts). */
    template(nodeKey: keyof Nodes & string, value: TemplateValue): this;
    /** Generation parameters: a reference to a named config, or field overrides on top. */
    sampling(nodeKey: keyof Nodes & string, value: Record<string, unknown>): this;
    /** Node toggles and the review position. */
    settings(nodeKey: keyof Nodes & string, value: Record<string, unknown>): this;
}
/** @experimental */
export declare class SpecBuilder<Nodes extends Record<string, PortDecl> = {}> extends ChainBuilder<Nodes> {
    private inletDone;
    constructor(rawId: string, meta: SpecMeta);
    query<K extends string, N extends NodeOf<'query'>>(key: K, node: NodeArg<N, Nodes>, opts?: NodeOpts): SpecBuilder<Add<Nodes, K, N>>;
    task<K extends string, N extends NodeOf<'task'>>(key: K, node: NodeArg<N, Nodes>, opts?: NodeOpts): SpecBuilder<Add<Nodes, K, N>>;
    oracle<K extends string, N extends NodeOf<'oracle'>>(key: K, node: NodeArg<N, Nodes>, opts?: NodeOpts): SpecBuilder<Add<Nodes, K, N>>;
    outlet<K extends string, N extends NodeOf<'outlet'>>(key: K, node: NodeArg<N, Nodes>, opts?: NodeOpts): SpecBuilder<Add<Nodes, K, N>>;
    /**
     * A named configuration the spec ships with (12 §3a). Declared **after** the nodes,
     * so the node keys it addresses are the ones that exist — same accumulation the
     * scope uses, so a typo is a compile error rather than a dead override row.
     *
     * ```ts
     * .preset('lore-heavy', { label: 'Lore-heavy' }, p => p
     *   .params  ('lore',     { weight: 0.5, minInclude: 3 })
     *   .prompts ('generate', { system: LORE_SYSTEM })
     *   .template('prompt',   jinja(LORE_ASSEMBLY)))
     * ```
     */
    preset(slug: string, meta: {
        label: I18n;
        description?: I18n;
        default?: boolean;
        owner?: string;
    }, fn: (p: PresetBuilder<Nodes>) => unknown): this;
    /**
     * Exactly one **inlet**, positionally first (01 §2). Enforced here rather than
     * by the validator, so it is a throw at authoring time.
     *
     * The optional third argument is the **usage lock** (24 §4): the session
     * event this inlet answers and the genre it serves. A session-event spec
     * without it does not compile — required for now, and relaxing later
     * (`genre: string[]`, `"*"`) is additive, never breaking. **The lock is the
     * only subscription** (R-4, 09-B B5): `.on()` and `subscribes` were deleted
     * 2026-09-16 — nothing read them at dispatch.
     */
    inlet<K extends string, N extends NodeOf<'inlet'>>(key: K, node: N, binding?: {
        genre: GenreDecl | ExternalRef;
        event: string | SessionEventDecl;
    } | {
        genre: GenreDecl | ExternalRef;
        events: Array<string | SessionEventDecl>;
    }): SpecBuilder<Add<Nodes, K, N>>;
    gather<Id extends string, R extends GatherBuilder<any, any>>(id: Id, opts: {
        mode?: 'sequential' | 'parallel';
    }, fn: (b: GatherBuilder<Nodes, Id>) => R): SpecBuilder<AddPorts<NodesOf<R>, Id, BranchPorts>>;
    each<Id extends string, R extends ChainBuilder<any, any>>(id: Id, opts: {
        over: EachOver<Nodes>;
        max: number;
        mode?: 'sequential' | 'parallel';
    }, fn: (c: ChainBuilder<Nodes & {
        [ITEM]: PortDecl;
    }, `${Id}.item`>) => R): SpecBuilder<AddPorts<NodesOf<R>, Id, BranchPorts>>;
    loop<Id extends string, R extends ChainBuilder<any, any>>(id: Id, opts: {
        repeatWhile: (($: Scope<any>) => DataRef) | DataRef;
        max: number;
    }, fn: (c: ChainBuilder<Nodes, `${Id}.item`>) => R): SpecBuilder<AddPorts<NodesOf<R>, Id, BranchPorts>>;
    junction<Id extends string, R extends JunctionBuilder<any, any>>(id: Id, opts: {
        on: (($: Scope<any>) => DataRef) | DataRef;
        mode?: 'sequential' | 'parallel';
    }, fn: (r: JunctionBuilder<Nodes, Id>) => R): SpecBuilder<AddPorts<NodesOf<R>, Id, JunctionPorts>>;
    /** Compile-time include — expanded here, so rows hold the flat chain (16 §3a). */
    include<K extends string, F extends Fragment<any>>(key: K, fragment: F): SpecBuilder<Nodes & Prefixed<K, F extends Fragment<infer M> ? M : {}>>;
    build(): BuiltSpec;
}
/** @public */
export declare function spec(id: string, meta: SpecMeta): SpecBuilder<{}>;
/**
 * A fragment carries its node map in its type, so `.include('ctx', contextInfill)` puts
 * `ctx.embed`, `ctx.search`, `ctx.merge` into the including spec's scope — namespaced by
 * the include key in the type exactly as they are namespaced in the rows (16 §3a).
 * @experimental
 */
export interface Fragment<Nodes extends Record<string, PortDecl> = {}> {
    id: string;
    nodes: BuiltNode[];
    clauses: BuiltClause[];
    /** Phantom — carries the node map. Never populated at runtime. */
    readonly __nodes?: Nodes;
}
/** @experimental */
export declare function fragment<R extends ChainBuilder<any, any>>(id: string, fn: (c: ChainBuilder<{}, ''>) => R): Fragment<NodesOf<R>>;
export { ChainBuilder };
//# sourceMappingURL=builder.d.ts.map