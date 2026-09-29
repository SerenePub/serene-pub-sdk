/**
 * Turn order as event-driven state (PLAN-turn-order §4.5, R1–R5; built
 * 2026-09-22 as A6).
 *
 * ## What this spec is
 *
 * One pipeline, bound to every session event a genre cares about, that
 * answers the question "whose turn is it" by **writing it down**:
 *
 * ```
 * event ─► history ─► pool ─► mentioned ─► strategy ─► set-turn-order
 * ```
 *
 * On the rules path it calls no model, writes no message and costs no token
 * — five reads and a `jsonb_set`. A genre may add the optional model path
 * (R41, `advise`), which asks a model once per recompute when the session's
 * `turnMode` is `model`. What it produces is the session's `metadata.turnOrder`:
 * the prepared turns, the candidates they were drawn from, and what the
 * order answers. Every surface that used to ask "who is next" by running a
 * decider now renders that state, and the reply run fires an entry out of
 * it (§4.6).
 *
 * ## Why it replaced the decider
 *
 * Until 2026-09-21 the respond spec ran up to a `speaker` node and halted
 * when nobody was due. Three things were wrong with that and all three go
 * away here: the answer existed only inside a run, so a person could not
 * see whose turn it was without starting one; "nobody is due" was a halt,
 * which is an error shape for an ordinary state; and the trigger had to
 * know about turn-taking to read the halt as quiet. Now the order is a
 * document, an empty order is an answer, and the trigger decides nothing.
 *
 * ## One spec per genre (R27, the modder pass, 2026-09-23)
 *
 * `turnOrderSpec()` below is the **public** builder: core calls it six
 * times, one per genre (`core:spec/<genre>-turn-order`), and a plugin genre
 * calls the same function. One document serves one genre — the preset check
 * refuses a preset binding a spec whose lock names another genre (24 §4) —
 * so the two shared slugs this file shipped at A6 (`core:spec/turn-order`,
 * `core:spec/turn-order-narrator`) are retired.
 *
 * A cast genre pins round robin; a planner genre (Adventure, the Lair,
 * Whodunit) pins `turn-narrator` with a pool that admits nobody, so it gets
 * exactly one narrator turn per send. What a session may pick instead is
 * the `strategy` node's `expose.swaps` (R28) — chat lists the other five
 * core strategies; the rest list none, so they render no control.
 */
import { S } from '@serene-pub/sdk';
import type { Descriptor, GenreDecl, SpecDocument } from '@serene-pub/sdk';
/** @experimental */
export declare const CHAT_TURN_ORDER_SPEC_ID = "core:spec/chat-turn-order";
/** @experimental */
export declare const GUIDE_TURN_ORDER_SPEC_ID = "core:spec/guide-turn-order";
/** @experimental */
export declare const WRITING_ROOM_TURN_ORDER_SPEC_ID = "core:spec/writing-room-turn-order";
/** @experimental */
export declare const ADVENTURE_TURN_ORDER_SPEC_ID = "core:spec/adventure-turn-order";
/** @experimental */
export declare const LAIR_TURN_ORDER_SPEC_ID = "core:spec/lair-turn-order";
/** @experimental */
export declare const WHODUNIT_TURN_ORDER_SPEC_ID = "core:spec/whodunit-turn-order";
/** @experimental */
export declare const TURN_ORDER_VERSION = "1.0.0";
/**
 * The nine events a cast genre recomputes on (§4.5).
 *
 * Every one of them can change who should speak next: a row landing, a row
 * leaving, a seat being switched off, a setting moving, a branch being
 * born. There is no gating (R1) — the list is what the genre declares and
 * the inlet locks, and a genre that wants fewer binds fewer.
 * @public
 */
export declare const TURN_ORDER_EVENTS: readonly ["core:event/message-completed@1", "core:event/message-edited@1", "core:event/message-deleted@1", "core:event/message-hidden@1", "core:event/member-added@1", "core:event/member-removed@1", "core:event/cast-changed@1", "core:event/session-updated@1", "core:event/session-branched@1"];
/**
 * The four events a planner genre recomputes on: a row landing, a row
 * leaving (deleted, or hidden and shown again), and a branch's birth. Its
 * order is one narrator entry or none — decided by whether the newest
 * visible row is a person's — so exactly the events that change which row
 * is newest move it. A cast change or a settings save cannot, and
 * recomputing on them would be reads for a document that cannot differ.
 *
 * Delete and hide are here (lair pass F6/B9, 2026-09-27) so the order stays
 * honest after a person removes the narrator's last reply: the line they
 * wrote is newest again, and the narrator is ready. Both carry an `edit`
 * cause, which auto-advance never fires on.
 * @experimental
 */
export declare const TURN_ORDER_NARRATOR_EVENTS: readonly ["core:event/message-completed@1", "core:event/message-deleted@1", "core:event/message-hidden@1", "core:event/session-branched@1"];
/**
 * A pin a turn-order spec may seat as `strategy`: a task over `candidates`
 * and `messages` that publishes `turn-entries@1` on `main` and `order`.
 * Structural, so a plugin's own strategy fits exactly as core's six do.
 */
type TurnStrategyDescriptor = Descriptor<{
    main: typeof S.turnEntries;
    order: typeof S.turnEntries;
}, {
    candidates: typeof S.turnCandidates;
    messages: typeof S.messages;
}, string> & {
    kind: 'task';
};
/**
 * A pin at any type version (`@1`, `@2` …): only `id` and `descriptor` are
 * read, and the node is built from the descriptor. The ports are also checked
 * at build — by the swap fit for a swap, by the spec's edges for the pin.
 * @public
 */
export type TurnStrategyPin = {
    readonly id: string;
    readonly descriptor: TurnStrategyDescriptor;
};
type TurnAdviseDescriptor = Descriptor<{
    main: typeof S.turnEntries;
    order: typeof S.turnEntries;
}, {
    candidates: typeof S.turnCandidates;
    messages: typeof S.messages;
}, string> & {
    kind: 'oracle';
};
/**
 * A pin a turn-order spec may seat as `advise` (R41): an oracle over
 * `candidates` and `messages` publishing `turn-entries@1` on `main` and
 * `order`, with a model's `connection`, `sampling` and `prompts` slots —
 * `core:oracle/turn-advise@1`, or a plugin's own.
 * @experimental
 */
export type TurnAdvisePin = {
    readonly id: string;
    readonly descriptor: TurnAdviseDescriptor;
};
/** The `pool` node's params, as a genre pins them (§4.4). @experimental */
export interface TurnPoolParams {
    characters?: 'active' | 'all' | 'none';
    personas?: 'none' | 'all' | 'others';
    envoys?: 'in-turn' | 'none' | 'only' | 'except';
    envoySlugs?: string[];
}
/**
 * **The turn-order spec for one genre** (R27). Core's six and every plugin
 * genre's come from this one call:
 *
 * ```ts
 * const tavernTurnOrder = turnOrderSpec({
 *   id: 'acme.rp:spec/tavern-turn-order',
 *   genre: tavern,
 *   events: [...TURN_ORDER_EVENTS, sessionEvents.annexChanged],
 *   strategy: C.turnRoundRobin,
 *   swaps: [C.turnRandom, myStrategy],
 * })
 * ```
 *
 * `id` is taken, never derived (R26). `strategy` is the pin — the default
 * the Turn order control shows, offered first; `swaps` is what a session may
 * pick instead, and none means no control. `pool` is the author preset on
 * the pool node, the one road configuration takes: declared default, the
 * author's preset over it, an administrator's deviation, a session's
 * override last. A preset binds the result like any spec: `bindings: [tavernTurnOrder, …]`.
 *
 * With `swaps`, `pool`, `mentioned` and `strategy` are marked for session
 * settings (§4.11, R42): who is eligible, the mention rule's lookback, and
 * the strategy. Without, the spec shows no turn control at all.
 * @public
 */
export declare function turnOrderSpec(opts: {
    id: string;
    genre: GenreDecl;
    events: readonly string[];
    strategy: TurnStrategyPin;
    swaps?: readonly TurnStrategyPin[];
    pool?: TurnPoolParams;
    /**
     * Which channel the `history` node reads (lair re-plan R6) — the author
     * preset on its `channel` param, beside `pool`'s. Absent: the declared
     * default, `main`. `'*'` reads every channel, which is what makes the
     * narrator strategy prepare one entry per channel whose newest row is a
     * person's (R5): the Lair's Sanctum line is answered on the Sanctum.
     */
    historyChannel?: string;
    /**
     * The optional model path (R41, M4): the oracle that asks a model who
     * speaks. Given, the spec branches after `mentioned` on the genre field
     * `turnMode` — `model` runs this oracle, anything else runs `strategy` —
     * and the node keys become `decide.model.advise` / `decide.rules.strategy`
     * (`turnStrategyNode` answers which). The genre declares `turnMode`
     * (`TURN_MODE_FIELD`) so a session can choose. Absent, no branch.
     */
    advise?: TurnAdvisePin;
    version?: string;
}): SpecDocument;
/** The key of the node a turn-order spec's Turn order control swaps (M4): `strategy`, or `decide.rules.strategy` with a model path. @experimental */
export declare const turnStrategyNode: (opts: {
    advise?: unknown;
}) => string;
/**
 * One core genre's turn-order spec, by value (R26): the document, the node its
 * Turn order control swaps, and the events it is bound on. A plugin offering
 * a strategy on it hands `build()` and `strategyNode` to `swaps` — no spec id,
 * no lookup.
 * @experimental
 */
export interface TurnOrderHandle {
    genre: GenreDecl;
    /** The spec's id — what core's presets bind and `CORE_SPECS` publishes under. */
    spec: string;
    events: readonly string[];
    /** The spec document, built once. */
    build: () => SpecDocument;
    /** The node key the genre's Turn order control swaps — read this, never assume `strategy` (R26, M4). */
    strategyNode: string;
}
/** Chat's turn order, by value — hand `build()` and `strategyNode` to `swaps` (R26). @experimental */
export declare const chatTurnOrder: TurnOrderHandle;
/** Guide's turn order, by value — hand `build()` and `strategyNode` to `swaps` (R26). @experimental */
export declare const guideTurnOrder: TurnOrderHandle;
/** Writing room's turn order, by value — hand `build()` and `strategyNode` to `swaps` (R26). @experimental */
export declare const writingRoomTurnOrder: TurnOrderHandle;
/** Adventure's turn order, by value — hand `build()` and `strategyNode` to `swaps` (R26). @experimental */
export declare const adventureTurnOrder: TurnOrderHandle;
/** The Lair's turn order, by value — hand `build()` and `strategyNode` to `swaps` (R26). @experimental */
export declare const lairTurnOrder: TurnOrderHandle;
/** Whodunit's turn order, by value — hand `build()` and `strategyNode` to `swaps` (R26). @experimental */
export declare const whodunitTurnOrder: TurnOrderHandle;
/**
 * Core's six (§4.14's table): which genre gets which spec, on which events —
 * what the presets bind and what `CORE_SPECS` publishes.
 * @experimental
 */
export declare const TURN_ORDER_BY_GENRE: ReadonlyArray<TurnOrderHandle>;
export {};
//# sourceMappingURL=turnOrder.d.ts.map