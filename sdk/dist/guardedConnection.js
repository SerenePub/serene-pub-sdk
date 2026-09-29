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
import { isFnHandle } from './componentWire.js';
import { SP_HOST_ELEMENTS, hostEventAllowed } from './hostElements.js';
import { receiverAttribute, receiverElementFinding } from './receiverRules.js';
// Remote DOM's protocol (`@remote-dom/core`'s constants).
const ROOT_ID = '~';
const INSERT_CHILD = 0;
const REMOVE_CHILD = 1;
const UPDATE_TEXT = 2;
const UPDATE_PROPERTY = 3;
const KINDS = new Set([INSERT_CHILD, REMOVE_CHILD, UPDATE_TEXT, UPDATE_PROPERTY]);
const PROPERTY_ATTRIBUTE = 2;
const PROPERTY_EVENT_LISTENER = 3;
const ELEMENT = 1;
const COMMENT = 8;
/** Attributes whose value names an element by id. */
const ID_REFS = new Set([
    'id',
    'for',
    'aria-labelledby',
    'aria-describedby',
    'aria-controls',
    'aria-activedescendant',
    'aria-owns',
    'aria-errormessage',
    'aria-details',
    'aria-flowto',
]);
/** A value for an id-referencing attribute, every token prefixed. */
const prefixIds = (value, prefix) => value
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => `${prefix}${t}`)
    .join(' ');
/** Every node of a serialized subtree, the root first. */
function* subtree(node) {
    yield node;
    for (const c of node.children ?? [])
        yield* subtree(c);
}
/** Is this host node what the (clean) serialization describes — the same kind, the same element? */
const sameNode = (host, n) => host.nodeType === n.type && (n.type !== ELEMENT || host.localName === n.element);
/** A host node as a refusal names it. */
const described = (host) => host.nodeType === ELEMENT ? `<${host.localName}>` : host.nodeType === 3 ? 'text' : 'a comment';
/**
 * The vocabulary as Remote DOM's element policy — which ELEMENTS, which
 * events, no methods — for the receiver behind a guarded connection.
 * Attributes are the guard's, not listed: a widget's `data-*` cannot be
 * enumerated, and Remote DOM's policy takes names only — so the receiver
 * keeps its own floor (no `on*`, no unsafe URL, no native method) and the
 * guard decides the rest, properties included.
 * @experimental
 */
export function receiverElementPolicy() {
    const out = {};
    for (const [tag, spec] of Object.entries(SP_HOST_ELEMENTS))
        out[tag] = {
            events: Object.fromEntries(spec.events.map((e) => [e, {}])),
            methods: [],
        };
    return out;
}
/**
 * The node a Remote DOM receiver holds a remote id as — its root for the
 * root id — read off the receiver's own id → node map, the one it applies
 * records by (and prunes as nodes leave). A guard judging by it can never
 * believe something about a node the receiver would not write to. The map
 * is private in Remote DOM's types, so it is held to its shape here, and a
 * receiver without one is refused rather than guarded blind.
 * @experimental
 */
export function receiverNodeOf(receiver) {
    const attached = receiver.attached;
    if (!(attached instanceof Map))
        throw new Error("Remote DOM's receiver no longer keeps its attached nodes — the guard cannot judge a remote's records");
    const nodes = attached;
    return (id) => (id === ROOT_ID ? receiver.root : nodes.get(id));
}
/**
 * A connection for a remote's records that enforces the vocabulary (see the
 * module note) before `inner` — the receiver's own connection — applies
 * them. `nodeOf` is the receiver's state: the host node a remote id is
 * attached as, the box for the root ({@link receiverNodeOf}).
 * @experimental
 */
export function guardedConnection(inner, nodeOf, options) {
    const { owner, idPrefix, fnFor, refuse } = options;
    const elementRule = options.rules?.element ?? receiverElementFinding;
    const attributeRule = options.rules?.attribute ?? receiverAttribute;
    /** One attribute, judged; `undefined` means drop it, `null` means remove it. */
    const attributeValue = (tag, name, value) => {
        const judged = attributeRule(tag, name, value, owner);
        if ('refused' in judged) {
            refuse({ finding: judged.refused, dropped: 'attribute' });
            return undefined;
        }
        const text = judged.value;
        if (text === null || idPrefix === undefined)
            return text;
        // A control's `name` groups radios page-wide; an sp-icon's names an icon.
        if (ID_REFS.has(name) || (name === 'name' && (tag === 'input' || tag === 'textarea')))
            return prefixIds(text, idPrefix);
        if (name === 'href' && text.startsWith('#'))
            return `#${idPrefix}${text.slice(1)}`;
        return text;
    };
    /**
     * A serialized subtree made safe; a refused element becomes an inert
     * stand-in — an empty comment under its id — and each refused element, as
     * the remote sent it, is added to `refused`.
     */
    const clean = (node, refused) => {
        if (node.type !== ELEMENT)
            return node; // text and comments carry data only
        const tag = String(node.element ?? '').toLowerCase();
        const why = elementRule(tag, owner);
        if (why) {
            refuse({ finding: why, dropped: 'subtree' });
            refused.push(node);
            return { id: node.id, type: COMMENT, data: '' };
        }
        const attributes = {};
        for (const [name, value] of Object.entries(node.attributes ?? {})) {
            const v = attributeValue(tag, name, value);
            if (typeof v === 'string')
                attributes[name] = v;
        }
        if (node.properties && Object.keys(node.properties).length)
            refuse({ finding: `<${tag}> set properties (${Object.keys(node.properties).join(', ')})`, dropped: 'property' });
        const eventListeners = {};
        for (const [event, handle] of Object.entries(node.eventListeners ?? {}))
            if (hostEventAllowed(tag, event) && isFnHandle(handle))
                eventListeners[event] = fnFor(handle, event);
        if (tag === 'a')
            attributes.rel = 'noopener noreferrer';
        const children = (node.children ?? []).map((child) => clean(child, refused));
        return { id: node.id, type: ELEMENT, element: tag, attributes, eventListeners, children };
    };
    // A refused element landed as a stand-in and its subtree never did; the
    // remote still draws there. Each stand-in's id → its subtree as the remote
    // holds it: every parent's children, in the remote's order — so a removal
    // inside it takes the removed node's ids with it. Every id in one → its
    // stand-in's id; the stand-in's host comment → its id, so a removal that
    // takes it is seen.
    const refusedTrees = new Map();
    const standInOf = new Map();
    const standIns = new WeakMap();
    let stopped = false;
    /** Is this id a refused node — a stand-in, or anything under one — that is not attached? */
    const refusedId = (id, host) => (host ? standIns.has(host) : standInOf.has(id));
    /** The stand-in a refused id belongs to. */
    const standInFor = (id, host) => (host ? standIns.get(host) : standInOf.get(id));
    /** Hold a serialized subtree under its stand-in, its root placed among `at.parent`'s children. */
    const hold = (standIn, node, at) => {
        let tree = refusedTrees.get(standIn);
        if (!tree)
            refusedTrees.set(standIn, (tree = new Map()));
        if (at) {
            let siblings = tree.get(at.parent);
            if (!siblings)
                tree.set(at.parent, (siblings = []));
            siblings.splice(at.index, 0, node.id);
        }
        for (const n of subtree(node)) {
            standInOf.set(n.id, standIn);
            if (n.type === ELEMENT)
                tree.set(n.id, (n.children ?? []).map((c) => c.id));
        }
    };
    /** Let go of one held id and everything under it. */
    const release = (tree, id) => {
        const children = tree.get(id);
        tree.delete(id);
        standInOf.delete(id);
        for (const child of children ?? [])
            release(tree, child);
    };
    /** A stand-in left the box: its whole subtree goes with it. */
    const forget = (standIn) => {
        const tree = refusedTrees.get(standIn);
        if (tree)
            release(tree, standIn);
        refusedTrees.delete(standIn);
    };
    /** The stand-ins a removal takes with it: the node itself, or any under it. */
    const standInsIn = (host, found = []) => {
        if (!refusedTrees.size)
            return found;
        const id = standIns.get(host);
        if (id !== undefined)
            found.push(id);
        for (const child of host.childNodes)
            standInsIn(child, found);
        return found;
    };
    const apply = (r) => inner.mutate([r]);
    function step(r) {
        // Closed world: the receiver picks its handler by plain key lookup, so a
        // kind spelled `'3'` would reach `updateProperty` past every rule below.
        // Only the four numeric kinds are records at all.
        if (!Array.isArray(r) || !KINDS.has(r[0]))
            throw new Error(`record kind ${JSON.stringify(Array.isArray(r) ? r[0] : r)} — not a record the box takes; refused`);
        if (r[0] === INSERT_CHILD) {
            const [, parentId, node, index] = r;
            const parent = nodeOf(parentId);
            // Into a refused subtree: nothing lands, and what the remote
            // inserted there is held with it.
            if (refusedId(parentId, parent)) {
                hold(standInFor(parentId, parent), node, { parent: parentId, index });
                return;
            }
            const refusedHere = [];
            const safe = clean(node, refusedHere);
            // An id the box already holds as something else is a remote
            // re-addressing a node: refused, before anything is applied.
            for (const n of subtree(safe)) {
                const held = n.id === ROOT_ID ? undefined : nodeOf(n.id);
                if (held && !sameNode(held, n))
                    throw new Error(`'${n.id}' is already in the box as ${described(held)} — refused`);
            }
            apply([r[0], parentId, safe, index]);
            for (const refused of refusedHere) {
                const host = nodeOf(refused.id);
                if (host)
                    standIns.set(host, refused.id);
                hold(refused.id, refused);
            }
        }
        else if (r[0] === REMOVE_CHILD) {
            const [, parentId, index] = r;
            const parent = nodeOf(parentId);
            // Inside a refused subtree: nothing to remove from the box, but
            // what the remote removed there is let go.
            if (refusedId(parentId, parent)) {
                const tree = refusedTrees.get(standInFor(parentId, parent));
                const [gone] = tree?.get(parentId)?.splice(index, 1) ?? [];
                if (tree && gone !== undefined)
                    release(tree, gone);
                return;
            }
            const child = parent?.childNodes[index];
            const gone = child ? standInsIn(child) : [];
            apply(r);
            for (const id of gone)
                forget(id);
        }
        else if (r[0] === UPDATE_TEXT) {
            const id = r[1];
            if (refusedId(id, nodeOf(id)))
                return;
            apply(r);
        }
        else if (r[0] === UPDATE_PROPERTY) {
            const [, id, name, value, type] = r;
            // The tag the receiver would write to. None: a node of a subtree
            // the vocabulary dropped, or one the receiver never took.
            const host = id === ROOT_ID ? undefined : nodeOf(id);
            if (host?.nodeType !== ELEMENT)
                return;
            const tag = host.localName;
            if (type === PROPERTY_ATTRIBUTE) {
                const v = attributeValue(tag, name, value);
                if (v !== undefined)
                    apply([r[0], id, name, v, type]);
            }
            else if (type === PROPERTY_EVENT_LISTENER) {
                if (!hostEventAllowed(tag, name))
                    return;
                apply([r[0], id, name, isFnHandle(value) ? fnFor(value, name) : null, type]);
            }
            else {
                refuse({ finding: `<${tag}> set property '${name}'`, dropped: 'property' });
            }
        }
    }
    return {
        call() {
            throw new Error('a remote calls no host methods');
        },
        mutate(records) {
            if (stopped)
                return;
            try {
                for (const r of records)
                    step(r);
            }
            catch (err) {
                stopped = true;
                throw err;
            }
        },
        get refusedIdsHeld() {
            return standInOf.size;
        },
    };
}
//# sourceMappingURL=guardedConnection.js.map