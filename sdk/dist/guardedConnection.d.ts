/**
 * 🚧 The guarded connection (C7): the ONE judge of the records a remote
 * component's worker sends, before a Remote DOM receiver applies them. The
 * page's receiver (the app's `receiverPolicy.ts`, inside `ComponentMount`)
 * and the component harness (`@serene-pub/cli/testing`) both run it, so what
 * an author's test shows is what the page shows, record for record.
 *
 * - an element outside the vocabulary (the rules' `element`, by default
 *   {@link receiverElementFinding}) never lands: its whole subtree is replaced
 *   by an empty comment under its id, so the remote's child INDICES stay the
 *   host's — Remote DOM addresses children by position, and a dropped node
 *   would shift every later insert and removal onto the wrong child. What the
 *   remote later writes INTO that subtree (a text change, an insert, a
 *   removal, an attribute) is dropped with it, never handed to a receiver
 *   that has no such node;
 * - an attribute the element does not take, or a value the rules refuse (the
 *   rules' `attribute`, by default {@link receiverAttribute}), is dropped;
 * - an update is judged by the node the receiver would write it to — its tag
 *   read off the attached node (`nodeOf`), never off an insert the receiver
 *   may have refused — and an insert reusing an attached id as another node
 *   is refused before anything of it is applied;
 * - records are applied ONE AT A TIME, so each is judged against what the
 *   receiver accepted, never against what an earlier record only claimed;
 *   when a record is refused the connection stops — the rest of that batch
 *   is lost, and a box that no longer matches the remote would lie from then
 *   on, so no later batch is applied either;
 * - PROPERTIES and METHOD calls are refused outright — a remote speaks in
 *   attributes and events only;
 * - ids are prefixed when an `idPrefix` is given (`id`, `for`, `aria-*`
 *   references, a `#fragment` link, a control's `name`) — the page's, per
 *   box, so a remote can never name, label, jump to or join a group with an
 *   element of the page; the harness gives none and keeps the remote's own;
 * - a link gets `rel="noopener noreferrer"` from the host, always;
 * - an event listener is kept only for an event the element raises, as the
 *   host's own function (`fnFor`).
 *
 * The rest is the host's: the receiver itself, what a live control's value
 * is, and what crosses back when a listener fires.
 *
 * Remote DOM's types only: the SDK carries no runtime import of the renderer
 * (a component never bundles it, R23), so its protocol numbers are held here
 * — the ones `@remote-dom/core` exports, which the SDK's tests pin.
 *
 * @experimental 🚧 provisional with the vocabulary it enforces (C7, R21).
 */
import { type FnHandle } from './componentWire.js';
import { type ReceiverAttribute } from './receiverRules.js';
/**
 * One thing the guard dropped: the sentence saying what and why, and how
 * much went with it. The page appends its own words to the sentence; the
 * harness lists the sentence in `refused`.
 * @experimental
 */
export interface ReceiverRefusal {
    readonly finding: string;
    /**
     * `subtree`: an element and everything under it; `attribute`: one
     * attribute's write; `property`: a property write (a remote speaks in
     * attributes).
     */
    readonly dropped: 'subtree' | 'attribute' | 'property';
}
/** The element and attribute rules a guarded connection applies — the SDK's unless a host names its own. @experimental */
export interface GuardedConnectionRules {
    /** Why an element does not land (its whole subtree is dropped), or `undefined` when it does. */
    element(tag: string, owner: string): string | undefined;
    /** One attribute, judged: what to write, or why it is dropped. */
    attribute(tag: string, attribute: string, value: unknown, owner: string): ReceiverAttribute;
}
/** @experimental */
export interface GuardedConnectionOptions {
    /** Whose box this is — `core`, or a plugin's id (the rules' owner, {@link receiverAttribute}). */
    owner: string;
    /**
     * Prefix for every id the remote writes — unique per box on the page.
     * Omitted, ids are the remote's own (the harness).
     */
    idPrefix?: string;
    /** Turns a function handle into the host function the receiver attaches. */
    fnFor: (handle: FnHandle, event: string) => (detail: unknown) => void;
    /** Each thing dropped, as it is dropped. */
    refuse: (refusal: ReceiverRefusal) => void;
    /** Replaces the SDK's element or attribute rule. */
    rules?: Partial<GuardedConnectionRules>;
}
/** A Remote DOM connection that judges every record before the receiver's applies it. */
/**
 * A Remote DOM connection, by shape — held here so the SDK's published types
 * need no Remote DOM installed; a real one is assignable to it.
 */
type RecordConnection = {
    mutate(records: readonly unknown[]): void;
    call(id: string, method: string, ...args: unknown[]): unknown;
};
/** @experimental */
export interface GuardedConnection extends RecordConnection {
    /**
     * How many remote ids the guard holds for refused subtrees — what the
     * remote still has drawn under elements that never landed. It shrinks as
     * the remote removes them, so it stays bounded by what is drawn.
     */
    readonly refusedIdsHeld: number;
}
/**
 * The vocabulary as Remote DOM's element policy — which ELEMENTS, which
 * events, no methods — for the receiver behind a guarded connection.
 * Attributes are the guard's, not listed: a widget's `data-*` cannot be
 * enumerated, and Remote DOM's policy takes names only — so the receiver
 * keeps its own floor (no `on*`, no unsafe URL, no native method) and the
 * guard decides the rest, properties included.
 * @experimental
 */
export declare function receiverElementPolicy(): Record<string, {
    events: Record<string, Record<string, never>>;
    methods: string[];
}>;
/**
 * The node a Remote DOM receiver holds a remote id as — its root for the
 * root id — read off the receiver's own id → node map, the one it applies
 * records by (and prunes as nodes leave). A guard judging by it can never
 * believe something about a node the receiver would not write to. The map
 * is private in Remote DOM's types, so it is held to its shape here, and a
 * receiver without one is refused rather than guarded blind.
 * @experimental
 */
export declare function receiverNodeOf(receiver: {
    readonly root: DocumentFragment | Element;
}): (id: string) => Node | undefined;
/**
 * A connection for a remote's records that enforces the vocabulary (see the
 * module note) before `inner` — the receiver's own connection — applies
 * them. `nodeOf` is the receiver's state: the host node a remote id is
 * attached as, the box for the root ({@link receiverNodeOf}).
 * @experimental
 */
export declare function guardedConnection(inner: RecordConnection, nodeOf: (id: string) => Node | undefined, options: GuardedConnectionOptions): GuardedConnection;
export {};
//# sourceMappingURL=guardedConnection.d.ts.map