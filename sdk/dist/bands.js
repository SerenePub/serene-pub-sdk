/**
 * Bands as template variables (typed templates P2, 2026-09-27).
 *
 * A **band** is the ranker's word for one source's slice of the context window
 * (`bandIntent`, candidates.ts). A source that puts its own band in the window
 * — Twenty Questions' secret entry — now also **declares** it: the key it
 * publishes and the registered variable that says how the band is laid out.
 *
 * ```ts
 * const varSecretEntry = definePluginVariable('showcase.twenty-questions', {
 *   id: 'showcase.twenty-questions:var/secret-entry@1',
 *   scope: { secretEntry: { type: 'record', of: { type: 'string' } } },
 *   sample: { 'The Brass Clock': 'A clock that rings when nobody winds it.' },
 * })
 * describeTaskDefinition({ …, bands: { secretEntry: varSecretEntry } })
 * // …and a context template places it as {{{secretEntry}}}.
 * ```
 *
 * Declared, a band is a **top-level template name**: Assemble exposes it as
 * `{{{secretEntry}}}`, rendered through the variable's selected layout (the
 * in-code fallback is the band as title-keyed minified JSON). So a band key is
 * an identifier, and it means one thing: two declarers naming the same key
 * with different variables, or a band shadowing a name core already renders,
 * is refused with both declarers named.
 *
 * Which bands a node renders is its own `variables` slot's `renders` plus —
 * when the slot says `rendersBands` — every band declared upstream of the
 * named in-port, followed through any node that takes candidates in
 * (concatenation, fusion, ranking). `rendersAt` is that answer.
 */
import { getDefinition } from './descriptors.js';
import { allVariables, getVariable } from './variables.js';
/**
 * The shape a candidates port carries. Written out rather than imported from
 * `shapes.ts`, which reaches the descriptor module this one is read from.
 */
const CANDIDATES_SHAPE = 'core:shape/context-candidates@1';
/** Letters, digits and `_`, not starting with a digit — a bare name in both core engines. */
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
/** @experimental */
export const isBandKey = (key) => IDENTIFIER.test(key);
/** `secret-entry` → `secretEntry`: the identifier a refusal suggests. @internal */
export function bandKeySuggestion(key) {
    const camel = key
        .replace(/[^A-Za-z0-9_]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ''))
        .replace(/^[^A-Za-z_]+/, '');
    return camel || 'band';
}
/**
 * Names Assemble puts at the top of a context template that are not bands and
 * not registered variables — what a band key may never be.
 *
 * Assemble's own values. A band called `budget` would shadow the budget a
 * template reads, silently, on every turn.
 * @internal
 */
export const ASSEMBLE_OWN_TEMPLATE_NAMES = [
    'sessionMessages',
    'injectionsByIndex',
    'budget',
    'postHistory',
    'blocks',
    'prompts',
];
/** The declared variable id of one band entry — a declaration, or its id as a registry row carries it. */
const variableIdOf = (v) => typeof v === 'string' ? v : v?.id;
/**
 * A **core** variable that already renders a top-level name, if any — the
 * names core's own nodes put in a template (`characters`, `scenario`, …). A
 * plugin variable sharing a root is not by itself a collision: two plugins'
 * bands meaning different things is, and the definitions check names both.
 */
const otherVariableRendering = (key, id) => allVariables().find((v) => v.id !== id &&
    v.id.startsWith('core:') &&
    Object.prototype.hasOwnProperty.call(v.scope, key));
/**
 * Refuse a definition's band declarations — at `describe…Definition`, where
 * the author is.
 *
 * - the key is an identifier (a band is a template name);
 * - the variable is registered (`defineVariable` / `definePluginVariable`) and
 *   its scope declares the key, because a layout renders `{ [key]: value }`;
 * - the key does not shadow a name core renders — Assemble's own, or a
 *   core variable's that is not this band's own variable;
 * - no other registered definition declares the key with a different variable.
 *
 * Each refusal names the fix.
 * @internal
 */
export function checkBandDeclarations(d, others) {
    const bands = d.bands;
    for (const key of Object.keys(d.bandPorts ?? {}))
        if (!bands || !Object.prototype.hasOwnProperty.call(bands, key))
            throw new Error(`'${d.id}' names band '${key}' in bandPorts but does not declare it in bands. ` +
                `Declare it (bands: { ${key}: varMyBand }), or drop it from bandPorts.`);
    if (!bands)
        return;
    for (const [key, decl] of Object.entries(bands)) {
        if (!isBandKey(key))
            throw new Error(`'${d.id}' declares band '${key}': a band key is a top-level template name, so it must ` +
                `be an identifier — letters, digits and '_', not starting with a digit. Rename it ` +
                `'${bandKeySuggestion(key)}', and emit that same key from bandIntent() and as each ` +
                `candidate's source.`);
        const id = variableIdOf(decl);
        if (!id || !decl || typeof decl !== 'object')
            throw new Error(`'${d.id}' declares band '${key}' without a variable. Declare one with ` +
                `definePluginVariable() (defineVariable() in core) whose scope names '${key}', and ` +
                `pass the declaration: bands: { ${key}: varMyBand }.`);
        const registered = getVariable(id);
        if (!registered)
            throw new Error(`'${d.id}' declares band '${key}' with variable '${id}', which is not registered. ` +
                `Declare it with definePluginVariable() (defineVariable() in core) before the ` +
                `definition that names it — the layout picker and the template editor read it ` +
                `from the registry.`);
        if (!Object.prototype.hasOwnProperty.call(registered.scope, key))
            throw new Error(`'${d.id}' declares band '${key}' with variable '${id}', whose scope does not declare ` +
                `'${key}' (it declares ${Object.keys(registered.scope).map((k) => `'${k}'`).join(', ') || 'nothing'}). ` +
                `A layout renders the band as {{{${key}}}}, so add '${key}' to the variable's scope — ` +
                `or rename the band to the key the variable declares.`);
        if (ASSEMBLE_OWN_TEMPLATE_NAMES.includes(key))
            throw new Error(`'${d.id}' declares band '${key}', which collides with Assemble's own '${key}' — a ` +
                `template reading {{{${key}}}} would get one or the other depending on order. ` +
                `Rename the band.`);
        const core = otherVariableRendering(key, id);
        if (core)
            throw new Error(`'${d.id}' declares band '${key}' as '${id}', which collides with '${core.id}' — that ` +
                `variable already renders the top-level name '${key}'. A band key means one thing; ` +
                `rename the band.`);
        const ports = d.bandPorts?.[key];
        if (ports !== undefined) {
            const out = Object.keys(d.ports?.out ?? {});
            const unknown = ports.filter((p) => !out.includes(p));
            if (!ports.length || unknown.length)
                throw new Error(`'${d.id}' says band '${key}' is carried on ` +
                    (ports.length
                        ? `${unknown.map((p) => `'${p}'`).join(', ')}, which ${unknown.length === 1 ? 'is not an out-port' : 'are not out-ports'} it declares`
                        : 'no out-port at all') +
                    ` (it declares ${out.map((p) => `'${p}'`).join(', ') || 'none'}). Name the out-ports ` +
                    `that publish the band's candidates in bandPorts, or leave '${key}' out of bandPorts ` +
                    `if every out-port may carry it.`);
        }
        for (const other of others) {
            if (other.id === d.id)
                continue;
            const theirs = variableIdOf(other.bands?.[key]);
            if (theirs && theirs !== id)
                throw new Error(`'${d.id}' declares band '${key}' as '${id}', but '${other.id}' already declares ` +
                    `'${key}' as '${theirs}'. A band key is a top-level template name and means one ` +
                    `thing — rename one of the two bands.`);
        }
    }
}
/** Two declarers naming one band differently, or a band shadowing a name the node renders. @experimental */
export class BandCollisionError extends Error {
}
const shapeIdOf = (s) => typeof s === 'string' ? s : (s?.id ?? undefined);
const defaultDescribe = (n) => getDefinition(`${n.definitionId}@${n.definitionVersion}`);
/**
 * Every band declared upstream of `nodeKey`'s in-port `port`.
 *
 * Walks the edges backwards from the port: each producer's declared `bands`
 * are collected, and the walk continues through every in-port the producer
 * declares as a candidates port — so a band declared at a source reaches a
 * ranker through a concatenation or a fusion, and Assemble through the ranker.
 * A producer declaring no candidates in-port is where the walk stops. A band
 * whose declarer names the out-ports carrying it (`bandPorts`) reaches only
 * through an edge from one of those ports.
 *
 * Throws `BandCollisionError`, naming both declarers, when two of them name
 * one key with different variables.
 * @experimental
 */
export function bandsReaching(doc, nodeKey, port, describe = defaultDescribe) {
    const out = {};
    const seen = new Set();
    const byKey = new Map(doc.nodes.map((n) => [n.key, n]));
    const head = (p) => p.split('.')[0];
    // Each producer is reached through one of its OUT-ports, and a band that
    // names the ports carrying it (`bandPorts`) reaches only through those —
    // entity-search's recalled lines ride `messages`, never `main`, so a spec
    // wiring only `main` does not offer a band that can never fill.
    const into = (to, toPort) => doc.edges
        .filter((e) => e.to === to && head(e.toPort) === toPort)
        .map((e) => ({ key: e.from, port: head(e.fromPort) }));
    const queue = into(nodeKey, port);
    const walked = new Set();
    while (queue.length) {
        const { key, port: outPort } = queue.shift();
        if (seen.has(`${key}|${outPort}`))
            continue;
        seen.add(`${key}|${outPort}`);
        const node = byKey.get(key);
        if (!node)
            continue;
        const d = describe(node);
        if (!d)
            continue;
        const declarer = `'${node.key}' (${node.definitionId}@${node.definitionVersion})`;
        for (const [band, v] of Object.entries(d.bands ?? {})) {
            const carriers = d.bandPorts?.[band];
            if (carriers && !carriers.includes(outPort))
                continue;
            const variable = variableIdOf(v);
            if (!variable)
                continue;
            const existing = out[band];
            if (existing && existing.variable !== variable)
                throw new BandCollisionError(`band '${band}' reaches '${nodeKey}.${port}' from two declarers with different ` +
                    `variables: ${existing.declarer} as '${existing.variable}', and ${declarer} as ` +
                    `'${variable}'. A band key is a top-level template name and means one thing — ` +
                    `rename one of the two bands.`);
            if (!existing)
                out[band] = { variable, declarer };
        }
        if (walked.has(key))
            continue;
        walked.add(key);
        for (const [inPort, shape] of Object.entries(d.ports?.in ?? {}))
            if (shapeIdOf(shape) === CANDIDATES_SHAPE)
                queue.push(...into(node.key, inPort));
    }
    return out;
}
/**
 * What a `variables` slot renders at one node of a document: its static
 * `renders`, plus — when it declares `rendersBands` — every band declared
 * upstream of that in-port.
 *
 * A band the static half already renders under the same variable is the same
 * name, not a collision (core's lore queries declare `worldLore`; Assemble
 * renders `worldLore`). One declared under a different variable, or shadowing
 * a name Assemble renders itself, is refused naming both.
 * @experimental
 */
export function rendersAt(doc, nodeKey, slot, describe) {
    const out = { ...(slot.renders ?? {}) };
    const from = slot.rendersBands?.from;
    if (!from)
        return out;
    const reaching = bandsReaching(doc, nodeKey, from, describe);
    for (const [band, { variable, declarer }] of Object.entries(reaching)) {
        const own = slot.renders?.[band];
        if (own !== undefined) {
            if (own !== variable)
                throw new BandCollisionError(`band '${band}' declared by ${declarer} as '${variable}' collides with '${nodeKey}''s ` +
                    `own '${band}', which it renders as '${own}'. Rename the band.`);
            continue;
        }
        if (ASSEMBLE_OWN_TEMPLATE_NAMES.includes(band))
            throw new BandCollisionError(`band '${band}' declared by ${declarer} collides with Assemble's own '${band}' at ` +
                `'${nodeKey}'. Rename the band.`);
        out[band] = variable;
    }
    return out;
}
//# sourceMappingURL=bands.js.map