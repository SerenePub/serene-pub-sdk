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
 * `turnOrderSpec()` below is the **public** builder: core calls it four
 * times, one per genre (`core:spec/<genre>-turn-order`), and a plugin genre
 * calls the same function. One document serves one genre — the preset check
 * refuses a preset binding a spec whose lock names another genre (24 §4) —
 * so the two shared slugs this file shipped at A6 (`core:spec/turn-order`,
 * `core:spec/turn-order-narrator`) are retired.
 *
 * A cast genre pins round robin; a planner genre (Adventure, the Lair)
 * pins `turn-narrator`, so it gets exactly one narrator turn per send —
 * Adventure's pool admits nobody; the Lair's admits its delvers, for the
 * character turns a standing turn plan names. What a session may pick instead is
 * the `strategy` node's `expose.swaps` (R28) — chat lists the other five
 * core strategies; the rest list none, so they render no control.
 */
import { compile, slot, spec, sessionEvents } from '@serene-pub/sdk';
import * as C from '@serene-pub/contracts';
import { chatGenre, guideGenre } from './genres.js';
import { adventureGenre, lairGenre } from './genres.js';
/** @experimental */
export const CHAT_TURN_ORDER_SPEC_ID = 'core:spec/chat-turn-order';
/** @experimental */
export const GUIDE_TURN_ORDER_SPEC_ID = 'core:spec/guide-turn-order';
/** @experimental */
export const ADVENTURE_TURN_ORDER_SPEC_ID = 'core:spec/adventure-turn-order';
/** @experimental */
export const LAIR_TURN_ORDER_SPEC_ID = 'core:spec/lair-turn-order';
/** @experimental */
export const TURN_ORDER_VERSION = '1.0.0';
/**
 * The nine events a cast genre recomputes on (§4.5).
 *
 * Every one of them can change who should speak next: a row landing, a row
 * leaving, a seat being switched off, a setting moving, a branch being
 * born. There is no gating (R1) — the list is what the genre declares and
 * the inlet locks, and a genre that wants fewer binds fewer.
 * @public
 */
export const TURN_ORDER_EVENTS = [
    sessionEvents.messageCompleted,
    sessionEvents.messageEdited,
    sessionEvents.messageDeleted,
    sessionEvents.messageHidden,
    sessionEvents.memberAdded,
    sessionEvents.memberRemoved,
    sessionEvents.castChanged,
    sessionEvents.sessionUpdated,
    sessionEvents.sessionBranched,
];
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
export const TURN_ORDER_NARRATOR_EVENTS = [
    sessionEvents.messageCompleted,
    sessionEvents.messageDeleted,
    sessionEvents.messageHidden,
    sessionEvents.sessionBranched,
];
/** The node an advise pin seats, whatever its type version. */
const adviseNode = (advise, config) => ({ __node: true, descriptor: advise.descriptor, config });
/** The node a strategy pin seats, whatever its type version. */
const strategyNode = (strategy, config) => ({ __node: true, descriptor: strategy.descriptor, config });
/**
 * **The turn-order spec for one genre** (R27). Core's four and every plugin
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
export function turnOrderSpec(opts) {
    const { id, genre, events, strategy, swaps = [], pool = {}, historyChannel, advise, version = TURN_ORDER_VERSION } = opts;
    // The model path branches on the genre field `turnMode`; a genre that
    // does not declare it could never take it (R26, M4 review).
    if (advise && !genre.shape?.fields?.turnMode)
        throw new Error(`turnOrderSpec('${id}'): advise needs genre '${genre.id}' to declare the field turnMode ` +
            `(TURN_MODE_FIELD) — without it the model path can never fire`);
    // R42: a spec that offers swaps shows its turn controls — who may be
    // seated, the mention rule, the strategy; one that offers none shows none.
    const controls = swaps.length ? { expose: { session: true } } : undefined;
    // Only with something to choose: no swaps, no control (R28).
    const strategyExpose = swaps.length ? { expose: { swaps } } : undefined;
    /**
     * Locked over every event this genre recomputes on (§4.1): one document,
     * N binding rows. The visible history is what every rule reads to decide
     * who has already spoken; the cast rides on the inlet in the settings
     * document (§4.12), resolved after the write that caused this event.
     * `pool` decides who may be seated at all; `mentioned` (R8) moves whoever
     * was named to the front without changing who is in.
     */
    const upToMentioned = spec(id, { version, taxonomy: { role: 'primary' } })
        .inlet('event', C.sessionEvent.v1(), { genre, events: [...events] })
        .query('history', ($) => C.sessionHistory.v1({ scope: $.event.sessionScope, params: slot.params() }))
        .task('pool', ($) => C.turnPool.v1({ cast: $.event.cast, messages: $.history.main, params: slot.params() }), controls)
        .task('mentioned', ($) => C.turnMentioned.v1({ candidates: $.pool.main, messages: $.history.main, params: slot.params() }), controls);
    /** The strategy — turns candidates into entries, never halts (an empty order is an answer). */
    const strategyTask = (b) => b.task('strategy', ($) => strategyNode(strategy, { candidates: $.mentioned.main, messages: $.history.main }), strategyExpose);
    /**
     * The two paths (R41): the junction reads the settings document on the
     * inlet, so `turnMode` cascades like any genre field (§4.13). `advise` is
     * in session settings so a plugin's model strategy can be contributed to
     * it (R29, M4). Its result port `order` is what the write reads.
     */
    const decided = advise
        ? upToMentioned.junction('decide', { on: ($) => $.event.session }, (j) => j
            .when('model', { path: 'fields.turnMode', equals: 'model' }, (c) => c.oracle('advise', ($) => adviseNode(advise, {
            candidates: $.mentioned.main,
            messages: $.history.main,
            connection: slot.connection(),
            sampling: slot.sampling(),
            prompts: slot.prompts(),
        }), { expose: { session: true } }))
            .otherwise('rules', strategyTask))
        : strategyTask(upToMentioned);
    return compile(decided
        /**
         * The one write path (§4.2). `basedOnAt` is the answered event's
         * instant, so an order computed from an older event is dropped
         * rather than landing on top of a newer one; `cause` travels on into
         * `turn-order-changed`, which is how auto-advance can tell a
         * person's send from a migration's backfill. `order` is the
         * strategy's — or, with a model path, the `decide` junction's own
         * result port, whichever path fired (M4).
         */
        .outlet('write', ($) => C.setTurnOrder.v1({
        order: advise ? $.decide.order : $.strategy.order,
        candidates: $.pool.main,
        basedOnAt: $.event.at,
        event: $.event.event,
        cause: $.event.cause,
    }))
        // The author preset on `pool`, only when the genre pins anything:
        // an empty value would be a preset that changes nothing.
        .preset('turn-order', { label: 'Turn order', default: true }, (p) => {
        const pooled = Object.keys(pool).length ? p.params('pool', { ...pool }) : p;
        return historyChannel ? pooled.params('history', { channel: historyChannel }) : pooled;
    })
        .build());
}
/** The key of the node a turn-order spec's Turn order control swaps (M4): `strategy`, or `decide.rules.strategy` with a model path. @experimental */
export const turnStrategyNode = (opts) => opts.advise ? 'decide.rules.strategy' : 'strategy';
/** Built once, on first use — a preset reads it at import, `CORE_SPECS` whenever it publishes. */
const once = (build) => {
    let doc;
    return () => (doc ??= build());
};
/** Every core turn strategy but round robin, in the order chat's control lists them. */
const CHAT_SWAPS = [C.turnUserSplit, C.turnRandom, C.turnScripted, C.turnManual, C.turnNarrator];
/** Guide: its one in-turn envoy is the whole order. */
const ENVOY_ONLY = { characters: 'none', envoys: 'in-turn' };
/** The planner genres: nobody is seated — the one entry is the pipeline's own voice. */
const NOBODY = { characters: 'none', envoys: 'none' };
/**
 * 🚧 The Lair: its active delvers are seated (owner ruling 2026-09-30, "they
 * are character turns"). The narrator strategy still seats nobody by rule;
 * what the pool admits is who a standing turn plan may prepare a character
 * turn for, since an entry naming somebody the pool did not admit is dropped
 * at the write. Envoys stay out: the Castellan's turns are the null entry's.
 */
const PARTY = { characters: 'active', envoys: 'none' };
/** Chat's turn order, by value — hand `build()` and `strategyNode` to `swaps` (R26). @experimental */
export const chatTurnOrder = {
    genre: chatGenre,
    spec: CHAT_TURN_ORDER_SPEC_ID,
    events: TURN_ORDER_EVENTS,
    build: once(() => turnOrderSpec({
        id: CHAT_TURN_ORDER_SPEC_ID,
        genre: chatGenre,
        events: TURN_ORDER_EVENTS,
        strategy: C.turnRoundRobin,
        swaps: CHAT_SWAPS,
        // The optional model path (R41, M4): chat declares `turnMode`.
        advise: C.turnAdvise,
    })),
    strategyNode: turnStrategyNode({ advise: C.turnAdvise }),
};
/** Guide's turn order, by value — hand `build()` and `strategyNode` to `swaps` (R26). @experimental */
export const guideTurnOrder = {
    genre: guideGenre,
    spec: GUIDE_TURN_ORDER_SPEC_ID,
    events: TURN_ORDER_EVENTS,
    build: once(() => turnOrderSpec({
        id: GUIDE_TURN_ORDER_SPEC_ID,
        genre: guideGenre,
        events: TURN_ORDER_EVENTS,
        strategy: C.turnRoundRobin,
        pool: ENVOY_ONLY,
    })),
    strategyNode: turnStrategyNode({}),
};
/** Adventure's turn order, by value — hand `build()` and `strategyNode` to `swaps` (R26). @experimental */
export const adventureTurnOrder = {
    genre: adventureGenre,
    spec: ADVENTURE_TURN_ORDER_SPEC_ID,
    events: TURN_ORDER_NARRATOR_EVENTS,
    build: once(() => turnOrderSpec({
        id: ADVENTURE_TURN_ORDER_SPEC_ID,
        genre: adventureGenre,
        events: TURN_ORDER_NARRATOR_EVENTS,
        strategy: C.turnNarrator,
        pool: NOBODY,
    })),
    strategyNode: turnStrategyNode({}),
};
/** The Lair's turn order, by value — hand `build()` and `strategyNode` to `swaps` (R26). @experimental */
export const lairTurnOrder = {
    genre: lairGenre,
    spec: LAIR_TURN_ORDER_SPEC_ID,
    events: TURN_ORDER_NARRATOR_EVENTS,
    build: once(() => turnOrderSpec({
        id: LAIR_TURN_ORDER_SPEC_ID,
        genre: lairGenre,
        events: TURN_ORDER_NARRATOR_EVENTS,
        strategy: C.turnNarrator,
        // The delvers its plans name take character turns.
        pool: PARTY,
        // Every channel (R6): a line on the Sanctum prepares the
        // Castellan's reply there, as a line on `main` prepares its turn.
        historyChannel: '*',
    })),
    strategyNode: turnStrategyNode({}),
};
/**
 * Core's four (§4.14's table): which genre gets which spec, on which events —
 * what the presets bind and what `CORE_SPECS` publishes.
 * @experimental
 */
export const TURN_ORDER_BY_GENRE = [
    chatTurnOrder,
    guideTurnOrder,
    adventureTurnOrder,
    lairTurnOrder,
];
//# sourceMappingURL=turnOrder.js.map