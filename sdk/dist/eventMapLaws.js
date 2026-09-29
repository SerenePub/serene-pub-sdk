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
import { eventById } from './events.js';
/**
 * C28 over one genre's event surface. An event the registry does not know
 * is a finding too: it cannot be caused, because it does not exist.
 * @experimental
 */
export function uncausedGenreEvents(genre) {
    const out = [];
    for (const event of Object.keys(genre.events ?? {})) {
        const def = eventById(event);
        if (!def)
            out.push({
                genre: genre.id,
                event,
                sentence: `genre '${genre.id}' lists '${event}', which no one declares — nothing can cause it`,
            });
        else if (!def.causedBy?.length && !def.declaredRoot)
            out.push({
                genre: genre.id,
                event,
                sentence: `genre '${genre.id}' lists '${event}', which no write causes and which is not a declared ` +
                    `root — a preset can bind it and nothing will ever fire it`,
            });
    }
    return out;
}
/**
 * C29 over one drawn map. `terminationOf(id)` is the host's termination
 * policy for a loop through that node — auto-advance's cause rule and cap, the run
 * caps that park a tree — or undefined. Every strongly connected component
 * that holds a cycle must hold a node with a termination policy.
 * @experimental
 */
export function unterminatedCycles(graph, terminationOf) {
    const next = new Map();
    const ids = new Set();
    for (const n of graph.nodes)
        ids.add(n.id);
    for (const e of graph.edges) {
        ids.add(e.from);
        ids.add(e.to);
        const list = next.get(e.from) ?? [];
        list.push(e.to);
        next.set(e.from, list);
    }
    // Tarjan's strongly connected components, iterative so a long chain
    // cannot overflow the stack.
    let index = 0;
    const order = new Map();
    const low = new Map();
    const onStack = new Set();
    const stack = [];
    const components = [];
    for (const root of [...ids].sort()) {
        if (order.has(root))
            continue;
        const work = [{ id: root, i: 0 }];
        order.set(root, index);
        low.set(root, index++);
        stack.push(root);
        onStack.add(root);
        while (work.length) {
            const top = work[work.length - 1];
            const outs = next.get(top.id) ?? [];
            if (top.i < outs.length) {
                const w = outs[top.i++];
                if (!order.has(w)) {
                    order.set(w, index);
                    low.set(w, index++);
                    stack.push(w);
                    onStack.add(w);
                    work.push({ id: w, i: 0 });
                }
                else if (onStack.has(w))
                    low.set(top.id, Math.min(low.get(top.id), order.get(w)));
                continue;
            }
            work.pop();
            if (work.length) {
                const parent = work[work.length - 1].id;
                low.set(parent, Math.min(low.get(parent), low.get(top.id)));
            }
            if (low.get(top.id) === order.get(top.id)) {
                const component = [];
                let w;
                do {
                    w = stack.pop();
                    onStack.delete(w);
                    component.push(w);
                } while (w !== top.id);
                components.push(component);
            }
        }
    }
    const out = [];
    for (const c of components) {
        const cyclic = c.length > 1 || (next.get(c[0]) ?? []).includes(c[0]);
        if (!cyclic)
            continue;
        if (c.some((id) => terminationOf(id) !== undefined))
            continue;
        const members = [...c].sort();
        out.push({
            members,
            sentence: `a loop through ${members.map((m) => `'${m}'`).join(', ')} has no termination policy — no ` +
                `listener or pipeline in it declares how it stops, so one event can run it forever`,
        });
    }
    return out;
}
//# sourceMappingURL=eventMapLaws.js.map