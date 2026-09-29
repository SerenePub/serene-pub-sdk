/**
 * The event map's two laws (PLAN-turn-order §B3), as pure functions the
 * conformance kit (C28, C29) and a host's boot check both call — one
 * judgement, two callers, so the kit and the warning cannot disagree.
 *
 * **C28 — every event a genre lists is caused or a declared root.** A
 * listed event that nothing writes and nobody starts is a slot a preset can
 * bind and nothing will ever fire.
 *
 * **C29 — every cycle has a termination policy.** The event map (events,
 * pipelines, listeners; binds · causes · listens) may loop: a reply completes a
 * message, the message recomputes the turn order, auto-advance asks for the
 * next reply. A loop is fine when something in it declares how it stops —
 * auto-advance's cause rule and cap, or the host's run caps, which park a
 * run tree for its owner. A loop where nothing does runs until the host
 * falls over.
 */
/** @experimental */
export type EventGraphNodeKind = 'event' | 'spec' | 'listener';
/** @experimental */
export type EventGraphEdgeKind = 'binds' | 'causes' | 'listens';
/** The event map as a host draws it — the same shape the app's `eventMap` returns. @experimental */
export interface EventGraph {
    nodes: ReadonlyArray<{
        id: string;
        kind: EventGraphNodeKind;
    }>;
    edges: ReadonlyArray<{
        from: string;
        to: string;
        kind: EventGraphEdgeKind;
    }>;
}
/** One C28 finding: a genre lists an event that nothing causes and nobody starts. @experimental */
export interface UncausedEventFinding {
    genre: string;
    event: string;
    sentence: string;
}
/**
 * C28 over one genre's event surface. An event the registry does not know
 * is a finding too: it cannot be caused, because it does not exist.
 * @experimental
 */
export declare function uncausedGenreEvents(genre: {
    id: string;
    events?: Readonly<Record<string, unknown>>;
}): UncausedEventFinding[];
/** One C29 finding: a cycle in which no node declares a termination policy. @experimental */
export interface UnterminatedCycleFinding {
    /** The cycle's members (one strongly connected component), sorted. */
    members: string[];
    sentence: string;
}
/**
 * C29 over one drawn map. `terminationOf(id)` is the host's termination
 * policy for a loop through that node — auto-advance's cause rule and cap, the run
 * caps that park a tree — or undefined. Every strongly connected component
 * that holds a cycle must hold a node with a termination policy.
 * @experimental
 */
export declare function unterminatedCycles(graph: EventGraph, terminationOf: (nodeId: string) => string | undefined): UnterminatedCycleFinding[];
//# sourceMappingURL=eventMapLaws.d.ts.map