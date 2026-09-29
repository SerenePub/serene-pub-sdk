/**
 * What a template can reference at one node of one document, typed (typed
 * templates P3, 2026-09-27).
 *
 * ```ts
 * const scope = templateScopeAt(doc, 'prompt', { genre: 'showcase.twenty-questions:genre/game' })
 * scope.characters          // { type: 'string', … } — the context builder's port schema
 * scope.secretEntry         // { type: 'string', … } — a band declared upstream
 * scope.annex.fields['showcase.twenty-questions'].fields.secret // the annex declaration
 * ```
 *
 * The scope is the union, checked for collisions, of:
 *
 * | Root | Where it comes from |
 * |---|---|
 * | the node's own names | the template slot's static `variables` — Assemble's are what `render()` supplies |
 * | the `prompts` slot's fields | `slotToVarField`, followed through a slot reference (`slot.prompts({ node })`, an envoy's) |
 * | the context builder's keys | the declared out-port schema (`Descriptor.portSchemas`) of whatever feeds a template-context in-port |
 * | one per declared band | `rendersAt` over the node's `variables` slot — the laid-out string |
 * | `annex` | every declared annex key of every owner in scope (`annexVarFieldOf`), as `annex.<owner>.<key>` — only where the node's `annex` in-port is wired (P6) |
 * | `state` | the builder's `state`, re-typed from the genre's attribute slots |
 *
 * **Order is `render()`'s.** The node's own names are the last word — Assemble
 * spreads the prompts and the context first and writes its own after, so a
 * builder's placeholder `sessionMessages` is superseded, not a collision.
 * Anything else two declarers both claim is refused naming both
 * (`BandCollisionError`), because a template reading it would get one or the
 * other depending on spread order.
 *
 * **Safe (owner ruling Q1, 2026-09-27).** Everything rendered into the context
 * may be in scope, and nothing dangerous is ever declared: annex declarations
 * refuse secrets at write time (R61). What this refuses on top is the
 * *kinds* no template may reach by any door — a secret, connection / sampling
 * / endpoint / model identity (R53), debug metadata, embeddings — by name,
 * anywhere in the tree (`ForbiddenTemplateFieldError`).
 *
 * The runtime value of `annex` arrives on the node's `annex` in-port, from
 * `core:query/session-annex@1` with `view: 'template'` (P6, law T2); the
 * scope carries it only where that port is wired.
 * @experimental
 */
import { annexOwners, annexVarFieldOf } from './annexFields.js';
import { slotField } from './attributes.js';
import { BandCollisionError, bandsReaching, rendersAt } from './bands.js';
import { getDefinition } from './descriptors.js';
import { genreAllowsCustomAttributes, genreEnvoy, genreSlots, getGenre, envoyPromptsSlotFor } from './genres.js';
import { fieldToVarField, slotToVarField } from './template.js';
import { getVariable } from './variables.js';
/** The shape a context builder's payload travels as. Written out, as `bands.ts` writes its own. */
const TEMPLATE_CONTEXT_SHAPE = 'core:shape/template-context@1';
/** A kind no template may reach by any door (typed templates §1 "safe" iv, R53). @experimental */
export class ForbiddenTemplateFieldError extends Error {
}
/**
 * Names that ARE a forbidden kind, compared case-blind: a connection, sampling,
 * endpoint or model identity (R53), debug metadata, embeddings, a secret value.
 * Deliberately names rather than shapes — a `VarField` has no kind for any of
 * these, which is exactly why one would arrive disguised as a `string`.
 * @experimental
 */
export const FORBIDDEN_TEMPLATE_NAMES = [
    'apiKey',
    'baseUrl',
    'connection',
    'connectionId',
    'connectionRef',
    'debugMeta',
    'embedding',
    'embeddings',
    'endpoint',
    'endpointUrl',
    'model',
    'modelId',
    'modelName',
    'sampling',
    'samplingConfig',
    'samplingConfigId',
    'secretValue',
    'vector',
    'vectors',
];
const FORBIDDEN = new Set(FORBIDDEN_TEMPLATE_NAMES.map((n) => n.toLowerCase()));
const defaultDescribe = (n) => getDefinition(`${n.definitionId}@${n.definitionVersion}`);
const shapeIdOf = (s) => typeof s === 'string' ? s : (s?.id ?? undefined);
const head = (p) => p.split('.')[0];
const isField = (d) => !!d && typeof d === 'object' && !Array.isArray(d);
const label = (n) => `'${n.key}' (${n.definitionId}@${n.definitionVersion})`;
/** Refuse a forbidden name anywhere under `root`, naming the path and who declared it. */
function refuseForbidden(root, decl, declarer) {
    const walk = (name, f, path) => {
        if (FORBIDDEN.has(name.toLowerCase()))
            throw new ForbiddenTemplateFieldError(`'${name}' (at '${path}', declared by ${declarer}) is a kind no template may reach — a ` +
                `secret, a connection, sampling, endpoint or model identity (R53), debug metadata or ` +
                `embeddings. Leave it out of the declaration: a template reads what the model is told, ` +
                `never how it is called.`);
        if (Array.isArray(f))
            for (const k of f)
                walk(k, 'any', `${path}.${k}`);
        if (!isField(f))
            return;
        for (const [k, v] of Object.entries(f.fields ?? {}))
            walk(k, v, `${path}.${k}`);
        if (f.of)
            walkOf(f.of, `${path}[]`);
    };
    const walkOf = (f, path) => {
        for (const [k, v] of Object.entries(f.fields ?? {}))
            walk(k, v, `${path}.${k}`);
        if (f.of)
            walkOf(f.of, `${path}[]`);
    };
    walk(root, decl, root);
}
/** An attribute slot's value as a template reads it; a secret is refused, never dropped. */
function slotVarField(decl) {
    const f = slotField(decl);
    if (f?.type === 'secret')
        throw new ForbiddenTemplateFieldError(`attribute slot '${decl.id}' holds a secret, and state is rendered into the context. ` +
            `A secret is never an attribute — keep it in a secret setting the model never sees.`);
    // A derived slot declares no field: what it computes is a value, not a shape.
    const vf = f ? fieldToVarField(f) : { type: 'string' };
    return { ...(vf ?? { type: 'string' }), optional: true, description: decl.descriptor };
}
/** `hp` and `owner_hp` — the bare key a template reads, and the qualified one (host `slotKey`). */
const slotKeys = (id) => {
    const bare = id.replace(/^.*:slot\//, '').replace(/@\d+$/, '');
    const qualified = id
        .replace(/@\d+$/, '')
        .replace(/:slot\//, '_')
        .replace(/[.\-]/g, '_');
    return [bare, qualified];
};
/**
 * `state`, typed from attribute slots: `state.world.<slot>`,
 * `state.cast.<member>.<slot>` beside the member's `id`, `key` and `name`,
 * and `state.locations.<place>.<slot>` likewise (P6 — what the host renders:
 * slug-keyed holders only, never the `byId` index).
 * A genre that lets sessions add attributes of their own (`customAttributes:
 * 'allow'`) — or no known genre at all — leaves the bags open: the honest
 * answer for a set nobody can list.
 */
function stateVarField(slots, open, base) {
    const bag = (applies) => {
        const out = {};
        for (const d of slots ?? []) {
            if (!d.appliesTo.includes(applies))
                continue;
            const vf = slotVarField(d);
            const [bare, qualified] = slotKeys(d.id);
            out[qualified] = vf;
            out[bare] ??= vf;
        }
        return out;
    };
    const world = open ? { type: 'record' } : { type: 'object', fields: bag('world') };
    const holder = (applies) => open
        ? { type: 'record' }
        : {
            type: 'object',
            fields: {
                id: { type: 'number' },
                key: { type: 'string' },
                name: { type: 'string' },
                ...bag(applies),
            },
        };
    const member = holder('cast');
    return {
        ...(base?.description !== undefined ? { description: base.description } : {}),
        type: 'object',
        optional: true,
        fields: {
            ...(base?.fields ?? {}),
            world,
            cast: { type: 'record', of: member },
            locations: { type: 'record', optional: true, of: holder('location') },
        },
    };
}
/**
 * The fields a node's `prompts` slot puts at the top of its template — its
 * own declaration, or the one its slot reference points at (the builder's,
 * an envoy's), because that is what the run resolves.
 */
function promptsFields(doc, node, slots, describe, genre) {
    const out = [];
    for (const [name, decl] of Object.entries(slots)) {
        if (decl.kind !== 'prompts')
            continue;
        const ref = node.config?.[name];
        let target = decl;
        let declarer = `${label(node)} slot '${name}'`;
        if (ref?.__ref === 'slot' && ref.ofEnvoy) {
            const envoy = genre ? genreEnvoy(genre, ref.ofEnvoy) : undefined;
            target = envoy ? envoyPromptsSlotFor(envoy) : undefined;
            declarer = `envoy '${ref.ofEnvoy}' prompts`;
        }
        else if (ref?.__ref === 'slot' && ref.ofNode && ref.ofNode !== node.key) {
            const owner = doc.nodes.find((n) => n.key === ref.ofNode);
            target = owner ? describe(owner)?.slots?.[ref.slot ?? name] : undefined;
            if (owner)
                declarer = `${label(owner)} slot '${ref.slot ?? name}'`;
        }
        const vf = target ? slotToVarField(target) : undefined;
        for (const [k, f] of Object.entries(vf?.fields ?? {}))
            out.push([k, f, declarer]);
    }
    return out;
}
/**
 * The scope, who declared each root, and what is untyped or wrong.
 * Throws `BandCollisionError` on a root two declarers claim, and
 * `ForbiddenTemplateFieldError` on a forbidden kind.
 * @experimental
 */
export function templateScopeReport(doc, nodeKey, env = {}) {
    const describe = env.describe ?? defaultDescribe;
    const variable = env.variable ?? getVariable;
    const genre = env.genre ?? doc.input?.genre;
    const node = doc.nodes.find((n) => n.key === nodeKey);
    if (!node)
        throw new Error(`templateScopeAt: no node '${nodeKey}' in this document`);
    const d = describe(node);
    if (!d)
        throw new Error(`templateScopeAt: ${label(node)} is not a definition this build knows`);
    const slots = d.slots ?? {};
    const slotName = env.slot ?? Object.keys(slots).find((k) => slots[k].kind === 'template');
    const template = slotName ? slots[slotName] : undefined;
    if (!template || template.kind !== 'template')
        throw new Error(`templateScopeAt: ${label(node)} has no template slot${env.slot ? ` '${env.slot}'` : ''}`);
    const scope = {};
    const declarers = {};
    const untyped = [];
    const findings = [];
    // The node's own names: the last word, so every layer below yields to them.
    const own = template.variables ?? {};
    const ownDeclarer = `${label(node)} slot '${slotName}'`;
    for (const [k, v] of Object.entries(own)) {
        scope[k] = v;
        declarers[k] = ownDeclarer;
    }
    // A prompts field a context builder also publishes is the same value,
    // resolved: `render()` spreads the prompts first and the context over them
    // ("the order is the fix"), so the context's supersedes it.
    const fromPrompts = new Set();
    const put = (root, field, declarer, layer) => {
        if (Object.prototype.hasOwnProperty.call(own, root))
            return;
        const existing = declarers[root];
        if (layer === 'context' && fromPrompts.has(root))
            fromPrompts.delete(root);
        else if (existing !== undefined && existing !== declarer)
            throw new BandCollisionError(`'${root}' reaches the template at '${nodeKey}' from two declarers: ${existing}, and ` +
                `${declarer}. A top-level template name means one thing — rename one of the two.`);
        scope[root] = field;
        declarers[root] = declarer;
        if (layer === 'prompts')
            fromPrompts.add(root);
    };
    for (const [k, f, by] of promptsFields(doc, node, slots, describe, genre))
        put(k, f, by, 'prompts');
    // What the context builder declares it publishes.
    const contextPorts = Object.entries(d.ports?.in ?? {})
        .filter(([, s]) => shapeIdOf(s) === TEMPLATE_CONTEXT_SHAPE)
        .map(([p]) => p);
    for (const port of contextPorts)
        for (const e of doc.edges.filter((x) => x.to === nodeKey && head(x.toPort) === port)) {
            const producer = doc.nodes.find((n) => n.key === e.from);
            if (!producer)
                continue;
            const outPort = head(e.fromPort);
            const schema = describe(producer)?.portSchemas?.out?.[outPort];
            const by = `${label(producer)}.${outPort}`;
            if (!schema) {
                untyped.push(by);
                continue;
            }
            if (schema.type !== 'object') {
                findings.push(`${by} feeds '${nodeKey}.${port}' with a declared ${schema.type}; a template context ` +
                    `is an object of named values — declare its schema as { type: 'object', fields }.`);
                continue;
            }
            for (const [k, f] of Object.entries(schema.fields ?? {}))
                put(k, f, by, 'context');
        }
    // `state`, re-typed from the attribute slots the session tracks.
    if (isField(scope.state) && declarers.state !== ownDeclarer) {
        const g = genre ? getGenre(genre) : undefined;
        const slotsIn = env.slots ?? (genre ? genreSlots(genre) : undefined);
        const open = env.slots ? false : !g || genreAllowsCustomAttributes(g);
        scope.state = stateVarField(slotsIn, open, scope.state);
    }
    // Bands declared upstream, each at the top level as its laid-out value.
    for (const [vName, vSlot] of Object.entries(slots)) {
        if (vSlot.kind !== 'variables' || !vSlot.rendersBands?.from)
            continue;
        const renders = rendersAt(doc, nodeKey, vSlot, describe);
        const reaching = bandsReaching(doc, nodeKey, vSlot.rendersBands.from, describe);
        for (const [band, id] of Object.entries(renders)) {
            if (Object.prototype.hasOwnProperty.call(vSlot.renders ?? {}, band))
                continue;
            const v = variable(id);
            if (!v)
                findings.push(`band '${band}' is laid out by '${id}', which is not registered here — declare it ` +
                    `with definePluginVariable() before the definition that names it.`);
            const description = v?.description ?? v?.i18n?.name;
            const by = reaching[band]?.declarer ?? `${label(node)} slot '${vName}'`;
            if (Object.prototype.hasOwnProperty.call(own, band) || declarers[band] !== undefined)
                throw new BandCollisionError(`band '${band}' declared by ${by} collides with '${band}' from ` +
                    `${declarers[band] ?? ownDeclarer} at '${nodeKey}'. A top-level template name ` +
                    `means one thing — rename the band.`);
            put(band, { type: 'string', optional: true, ...(description !== undefined ? { description } : {}) }, by);
        }
    }
    // The annex — every declared key of every owner in scope — where the
    // node's `annex` in-port is WIRED (P6): the value arrives on that port
    // (law T2 says from where), so an unwired node has no `annex` at all and a
    // template naming it is refused instead of rendering nothing.
    if (annexWired(doc, node, d)) {
        const annexOf = env.annexOf ?? annexVarFieldOf;
        const owners = {};
        for (const owner of env.owners ?? annexOwners()) {
            const f = annexOf(owner, genre);
            if (f && Object.keys(f.fields ?? {}).length)
                owners[owner] = { ...f, optional: true };
        }
        if (Object.keys(owners).length) {
            if (declarers.annex !== undefined)
                throw new BandCollisionError(`'annex' at '${nodeKey}' is declared by ${declarers.annex}, and is also where every ` +
                    `owner's declared annex keys are read (annex.<owner>.<key>). Rename the other.`);
            put('annex', { type: 'object', optional: true, fields: owners }, 'the annex declarations in scope');
        }
    }
    for (const [root, decl] of Object.entries(scope))
        refuseForbidden(root, decl, declarers[root]);
    return { scope, declarers, untyped, findings };
}
/** The in-port a template node reads the annex on (P6). @experimental */
export const TEMPLATE_ANNEX_PORT = 'annex';
/** Whether `node` declares the annex in-port and something feeds it. */
function annexWired(doc, node, d) {
    if (!Object.prototype.hasOwnProperty.call(d.ports?.in ?? {}, TEMPLATE_ANNEX_PORT))
        return false;
    return doc.edges.some((e) => e.to === node.key && head(e.toPort) === TEMPLATE_ANNEX_PORT);
}
/**
 * The typed scope of a template slot at `nodeKey` — see the module note.
 * Throws on a root collision (naming both declarers) and on a forbidden kind.
 * @experimental
 */
export function templateScopeAt(doc, nodeKey, env) {
    return templateScopeReport(doc, nodeKey, env).scope;
}
//# sourceMappingURL=templateScopeAt.js.map