/**
 * A minimal executor — enough to run a compiled document and produce a receipt.
 *
 * Not the real thing, but it enforces the laws the design says the executor owns:
 * discriminated results including halt, per-run seed, timeouts that bound execution
 * but never waiting, consumption budgets, per-kind injection, and core-emitted events.
 */
import { getType } from './descriptors.js';
import { collectDataRefs, isSlotRef } from './refs.js';
import { resolveConfig, slotConnectionId, slotConnectionModelId, SLOT_VALUE, } from './config.js';
import { resolveSamplingValues } from './sampling.js';
import { hashPayload, isGated, resolvePosition, } from './review.js';
import { isSecret } from './settings.js';
import { previewTarget, roughTokens } from './preview.js';
import { resolveBlockMode } from './blocks.js';
import { ITEM as ITEM_KEY } from './scope.js';
import { isAllocatedContext, measureWire } from './wire.js';
// ── The reference behind a resolved slot ────────────────────────────────────
/**
 * The row a resolved ref slot's VALUES were read from.
 *
 * ## Why this exists
 *
 * `connection` and `sampling` are both ref slots, and `resolveSlot` returns two
 * different KINDS of thing for them: a connection resolves to a *reference*
 * (`{ id, kind, metadata }` — material is injected at call time), while sampling
 * resolves to the config's *values*, deliberately without an id, because the
 * nodes that read a sampling slot need the numbers. `core:task/context-budget@1`
 * derives the token budget from `contextTokens`, and the summarize batch cutter
 * fits a transcript into that same window.
 *
 * A host, however, does not send values — it sends a request built from a
 * `sampling_configs` ROW, so what it needs from this slot is the row id. It read
 * one off the connection slot's `{ id }` and found nothing on sampling's, which
 * a host cannot distinguish from "this node picked nothing" — so a per-node pick
 * moved the budget while the request went out on the capability default. The
 * budget was computed against one window and the prompt sent against another.
 *
 * ## Why a symbol, and why `Symbol.for`
 *
 * The values object is read by nodes, hashed into a plugin node's RNG label,
 * and written into the receipt. An ordinary key would show up in all three:
 * `Object.keys`, `JSON.stringify` and `for…in` skip symbol keys, so this is
 * invisible to every value reader while object spread — which copies own
 * enumerable symbol properties — still carries it to the host.
 *
 * `Symbol.for` rather than `Symbol()` because the registry is process-wide: two
 * copies of this module (a `dist` build and a source import, say) still agree on
 * the key. A `Symbol()` would differ between them and the reference would vanish
 * again, silently — which is the exact failure mode this whole mechanism exists
 * to end.
 *
 * ⚠ **It does not survive serialization**, by construction. That is safe only
 * because the one consumer — the host's `call` — runs in-process with the
 * binding that forwards it. Plugin node bindings receive their input across a
 * sandbox transport and get no `ctx.call`, so none of them can be on the reading
 * end today. If a plugin node ever gains the ability to dispatch, this reference
 * has to be re-projected at that transport rather than assumed to cross it.
 */
export const SLOT_REF = Symbol.for('@serene-pub/sdk:slot-ref');
/**
 * The row id carried alongside a resolved slot's values, if there is one.
 *
 * Absent means "this node named nothing" — never "the id was lost". Read through
 * this rather than by indexing the symbol, so a host never has to know how the
 * reference is attached.
 */
export function slotRef(value) {
    if (!value || typeof value !== 'object')
        return null;
    const id = value[SLOT_REF];
    return typeof id === 'string' || typeof id === 'number' ? id : null;
}
export const ok = (value) => ({ kind: 'ok', value });
export const err = (reason) => ({ kind: 'err', reason });
export const halt = (reason) => ({
    kind: 'halt',
    reason,
});
export const cancelled = (reason) => ({
    kind: 'cancelled',
    reason,
});
/**
 * Values are scoped, not global.
 *
 * A single shared map cannot hold two iterations of a map at once, which is why the
 * earlier draft forced every map sequential. A scope chain fixes that and is also what
 * makes nested blocks correct: an iteration writes into its own scope and reads through
 * to its parent, so two iterations never see each other's intermediate values.
 */
class ValueScope {
    parent;
    own = new Map();
    constructor(parent) {
        this.parent = parent;
    }
    get(k) {
        return this.own.has(k) ? this.own.get(k) : this.parent?.get(k);
    }
    has(k) {
        return this.own.has(k) || !!this.parent?.has(k);
    }
    set(k, v) {
        this.own.set(k, v);
    }
    child() {
        return new ValueScope(this);
    }
}
export const isCommitted = (w) => w.status === 'committed';
/**
 * A Provider binding, with `ctx.can()` narrowed to what its own type declared.
 *
 * The one hop that matters. `pin` already carries the descriptor's literal type
 * through, so reading `optional` off it here is enough — there is no need to
 * thread capability generics through a catalog and a binding map, and every hop
 * that does not exist is a hop that cannot silently widen to `string` and take
 * the safety with it.
 *
 * ```ts
 * providerBinding(C.generateText, async (input, ctx) => {
 *   ctx.can('json_schema')   // ✅ declared optional on the connection slot
 *   ctx.can('grammar')       // ❌ compile error — this node never declared it
 * })
 * ```
 */
export function providerBinding(
// The PINNED form only. A `{descriptor: D} | D` union here looks more
// permissive and is strictly worse: inference across a union falls back to
// the constraint, `D['slots']` widens, and `can()` silently becomes `never`.
_type) {
    // CURRIED on purpose. Passing the type and the callback to one call means the
    // callback's `ctx` is contextually typed while `D` is still being inferred,
    // so it resolves against the constraint rather than the argument and `can()`
    // collapses to `never` — compiling fine, narrowing nothing. Splitting the
    // calls forces `D` to settle first.
    return (fn) => fn;
}
// ── Deterministic RNG from the run seed (F11) ───────────────────────────────
export function seededRandom(seed) {
    let h = 2166136261;
    for (let i = 0; i < seed.length; i++)
        h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
    return () => {
        h = Math.imul(h ^ (h >>> 15), 2246822507);
        h = Math.imul(h ^ (h >>> 13), 3266489909);
        return ((h ^= h >>> 16) >>> 0) / 4294967296;
    };
}
const EMPTY_WORLD = {
    overrides: [],
    samplingConfigs: [],
    connections: [],
    activeConnection: {},
};
class BudgetExceeded extends Error {
}
/**
 * The counter this run will use, resolved and loaded once.
 *
 * Two things are deliberate here.
 *
 * **The registry is reached through a dynamic import.** The barrel exports
 * `run`, and the barrel is imported by browser code in at least one host, so a
 * static import would drag the tokenizer registry — and everything a host's
 * registered loaders reach through it — into every bundle that can see this
 * function. Dynamic keeps `@serene-pub/sdk/tokenizers` a real split point.
 *
 * **Nothing here can throw.** Not the import, not the load, not an id nobody
 * has heard of. A run whose budgeting fell back to an estimate is a run with a
 * worse estimate; a run that failed because a merge table would not parse is a
 * user with no reply. The note that comes back is how the difference stays
 * visible.
 */
async function resolveTokenizer(opts) {
    if (opts.countTokens)
        return { count: opts.countTokens };
    if (!opts.tokenizer)
        return { count: roughTokens };
    try {
        const { loadTokenizer } = await import('./tokenizers.js');
        return await loadTokenizer(opts.tokenizer);
    }
    catch (e) {
        return {
            count: roughTokens,
            degraded: `the tokenizer registry could not be loaded, so this run budgeted with the ` +
                `rough estimate: ${e.message}`,
        };
    }
}
export async function run(doc, opts) {
    const world = opts.world ?? EMPTY_WORLD;
    const seed = opts.seed ?? 'seed:0';
    const rng = seededRandom(seed);
    const now = opts.now ?? (() => Date.now());
    // Blocks are addressed alongside nodes so a block can carry a setting of
    // its own — its execution mode. Keys cannot collide: a block id qualifies
    // the nodes inside it (`drafting` contains `drafting.item.draft`), so the
    // block's own id is never also a node's.
    const config = resolveConfig(world, [
        ...doc.nodes.map((n) => n.key),
        ...doc.blocks.map((b) => b.id),
    ]);
    // The one await a tokenizer costs, taken BEFORE `startedAt` is stamped: a
    // cold merge table is setup, not work, and charging the first run of a
    // process for it would make elapsed times mean two different things
    // depending on how recently the server restarted — the same reason
    // `queuedMs` is recorded and excluded.
    const tokenizer = await resolveTokenizer(opts);
    const countTokens = tokenizer.count;
    const receipt = {
        runId: opts.runId ?? 'run:test',
        specId: doc.id,
        specVersion: doc.version,
        schemaVersion: 1,
        seed,
        triggerSource: opts.triggerSource ?? 'input',
        triggerRef: opts.triggerRef,
        actorUserId: opts.actorUserId,
        depth: 0,
        queuedMs: opts.queuedMs,
        startedAt: now(),
        endedAt: 0,
        outcome: 'ok',
        nodes: [],
        emitted: [],
        consumption: { tokens: 0, nodeExecutions: 0 },
    };
    // Said out loud rather than left to be inferred from numbers that look
    // plausible. A run that silently budgeted with an estimate when somebody had
    // chosen a real tokenizer is the failure this whole option exists to end,
    // and it would be invisible if the fallback were quiet.
    if (tokenizer.degraded)
        receipt.notes = [...(receipt.notes ?? []), tokenizer.degraded];
    /** Set the moment any node with declared effects is invoked — gates compaction. */
    let effectfulNodeRan = false;
    const previewAt = opts.preview
        ? previewTarget(doc.nodes, typeof opts.preview === 'object' ? opts.preview.atNode : undefined)
        : undefined;
    /**
     * Hoist what the panel needs into one place. Almost all of it is already recorded —
     * Assemble's allocation record and the Provider's resolved input. The only figure
     * that exists nowhere else is the count of the formed payload.
     */
    const buildPreview = (node, input, typeId, targetedBy, wire, wireCtx) => {
        const ctxValue = input.context ?? input.main ?? input;
        const conn = input.connection;
        const budgetNode = doc.nodes.find((n) => n.typeId === 'core:task/context-budget');
        const budgetValue = budgetNode ? values.get(budgetNode.key) : undefined;
        // Prefer the allocated blocks, which carry the trail. Fall back to sniffing an
        // allocation array only for specs core has not migrated yet.
        const allocatedSource = wireCtx ??
            Object.values(input).find(isAllocatedContext);
        const legacyAlloc = ctxValue?.alloc ?? ctxValue?.allocation;
        const allocation = allocatedSource?.allocation ?? legacyAlloc;
        const blocks = allocatedSource
            ? allocatedSource.blocks.map((b) => ({
                id: b.id,
                sourceKey: b.sourceKey,
                role: b.role,
                weight: b.weight,
                priority: b.priority,
                included: b.included,
                tokens: b.tokens,
                why: b.why,
                reason: b.why?.[b.why.length - 1],
            }))
            : (Array.isArray(legacyAlloc) ? legacyAlloc : []).map((a) => ({
                sourceKey: a.sourceKey,
                weight: a.weight,
                priority: a.priority,
                included: (a.included ?? 0) > 0,
                tokens: countTokens(a.rendered ?? a.text ?? ''),
                reason: a.reason ??
                    (a.available !== undefined &&
                        a.included !== undefined &&
                        a.available > a.included
                        ? `${a.available - a.included} of ${a.available} dropped — budget`
                        : undefined),
            }));
        const tokens = wire?.tokens ?? countTokens(ctxValue);
        const available = budgetValue?.available ??
            ctxValue?.budget ??
            allocatedSource?.allocation.budget;
        return {
            atNode: node.key,
            typeId,
            targetedBy,
            connection: conn
                ? {
                    id: conn.id,
                    kind: conn.kind,
                    contextLength: conn.metadata?.contextLength,
                    tokenizer: conn.metadata?.tokenizer,
                }
                : undefined,
            budget: {
                maxContext: budgetValue?.maxContext ?? conn?.metadata?.contextLength,
                reserved: budgetValue?.reserved,
                available,
            },
            context: {
                rendered: redact(wire ? wire.payload : ctxValue),
                tokens,
            },
            wire: wire
                ? {
                    format: wire.format,
                    blockTokens: wire.blockTokens,
                    overheadTokens: wire.overheadTokens,
                }
                : undefined,
            blocks,
            totals: {
                blocks: blocks.length,
                included: blocks.filter((b) => b.included).length,
                dropped: blocks.filter((b) => !b.included).length,
                tokensIncluded: blocks.filter((b) => b.included).reduce((n, b) => n + b.tokens, 0),
                tokensDropped: blocks.filter((b) => !b.included).reduce((n, b) => n + b.tokens, 0),
                overBudgetBy: wire?.overBudgetBy ??
                    (typeof available === 'number' && tokens > available
                        ? tokens - available
                        : undefined),
            },
            allocation,
        };
    };
    const values = new ValueScope();
    values.set(doc.nodes[0]?.key ?? 'input', opts.input);
    const reviews = [];
    let seq = 0;
    const budget = {
        tokens: opts.budget?.tokens ?? Infinity,
        nodes: opts.budget?.nodeExecutions ?? Infinity,
    };
    const spendTokens = (n) => {
        receipt.consumption.tokens += n;
        if (receipt.consumption.tokens > budget.tokens)
            throw new BudgetExceeded('token budget exceeded');
    };
    // Blocks are executed as units when their first member is reached.
    const emittedBlocks = new Set();
    const ordered = doc.nodes.slice().sort((a, b) => a.position - b.position);
    const resolveInput = (node, scope) => {
        const cfg = { ...node.config };
        for (const { path, ref } of collectDataRefs(node.config)) {
            setPath(cfg, path, readPort(scope.get(ref.node), ref.port));
        }
        for (const [k, v] of Object.entries(cfg)) {
            if (isSlotRef(v))
                cfg[k] = resolveSlot(node, v);
        }
        return cfg;
    };
    /**
     * Row-id equality across the string/number divide.
     *
     * The panel stores a pick as a number; `buildWorld` projects ids as strings.
     * Neither is wrong on its own, and `===` between them is quietly always false.
     */
    const sameId = (a, b) => a != null && b != null && String(a) === String(b);
    const resolveSlot = (node, ref) => {
        const targetKey = node.resolvedRefs?.[Object.keys(node.config).find((k) => node.config[k] === ref) ?? ''] ??
            ref.ofNode ??
            node.key;
        const slotName = ref.slot;
        if (slotName === 'connection') {
            const d = getType(`${node.typeId}@${node.typeVersion}`);
            const targetNode = doc.nodes.find((n) => n.key === targetKey) ?? node;
            const td = getType(`${targetNode.typeId}@${targetNode.typeVersion}`);
            const kind = td?.shape ?? d?.shape;
            const stored = config[targetKey]?.['connection']?.[SLOT_VALUE];
            /**
             * The pick, then the instance default — but the default answers only
             * for a slot that names **nothing**.
             *
             * The distinction is the whole defect. A pick is a PAIR
             * (`ConnectionSlotValue`), and this branch used to compare the stored
             * value itself against a connection id: an object stringified to
             * `[object Object]`, matched nothing, and `??` then handed the whole
             * thing to `activeConnection` — so a slot that named a connection
             * perfectly clearly ran against a different one. Reading the endpoint
             * half first is only half the fix; the other half is that a slot which
             * names something we cannot resolve must resolve to NOTHING. Falling
             * back there is how "you picked the wrong server" becomes "your reply
             * came from somewhere else", with no error either way.
             *
             * So: `stored == null` is the only door to the default. A value that
             * names an unreadable endpoint, or one this world does not have,
             * leaves as null — unconfigured, which a host can say out loud.
             */
            const instanceDefault = kind ? world.activeConnection[kind] : undefined;
            const chosenId = stored == null ? instanceDefault : slotConnectionId(stored);
            // Compared as strings, because the two sides genuinely differ in type:
            // the panel commits a pick as a JSON number, and the world projects
            // connection ids as strings. `===` between them is always false, and
            // the miss used to fall through to `activeConnection` — which on most
            // installs holds the very connection that was picked, so the bug
            // looked fixed.
            const conn = chosenId == null
                ? undefined
                : world.connections.find((c) => sameId(c.id, chosenId));
            // metadata only — material is injected by the executor at call time (01 §10)
            return conn
                ? {
                    id: conn.id,
                    kind: conn.kind,
                    metadata: conn.metadata,
                    // The model half of the same pick, carried rather than
                    // dropped — a host reducing this back to an endpoint id is
                    // how a model chosen in a panel reached no request. Null
                    // when the slot named no model, the fallback included:
                    // `activeConnection` holds endpoint ids alone.
                    modelId: slotConnectionModelId(stored),
                }
                : null;
        }
        if (slotName === 'sampling') {
            /**
             * The pick, then the instance default — the same two-step the
             * `connection` branch above already takes, and `kind` is derived the
             * same way so the two cannot disagree about which node's modality is
             * being asked about.
             *
             * ⚠ The fallback was missing, and its absence was invisible because
             * dispatch has one: a slot with no pick resolved to `{}` here while
             * the call still went out against the instance default's window. A
             * node that only forwards this (every Provider — the host reduces it
             * back to a row id) could not tell. A node that READS it could: the
             * summarize batch cutter has to fit a prompt into that window, and
             * with `{}` it clamped against nothing on every install that had not
             * picked a sampling config per step.
             *
             * A Task with no shape and no shaped target still gets no fallback —
             * `core:task/context-budget@1` names its own `sampling` slot and is
             * unaffected, because there is no modality to look a default up by.
             */
            const targetNode = doc.nodes.find((n) => n.key === targetKey) ?? node;
            const kind = getType(`${targetNode.typeId}@${targetNode.typeVersion}`)?.shape ??
                getType(`${node.typeId}@${node.typeVersion}`)?.shape;
            // Split from the fallback below, because only this half is a PICK.
            // The reference handed to the host is the pipeline config speaking
            // (`pipelineConfig`, tier 2); the instance default is a tier the host
            // reads for itself, from the same `connection_defaults` rows this
            // projection comes from. Carrying the fallback down as though the
            // pipeline had named it would relabel the tier a resolution reports
            // while changing no value — a lie with no upside.
            const picked = config[targetKey]?.['sampling']?.[SLOT_VALUE];
            const refId = picked ?? (kind ? (world.activeSampling?.[kind] ?? undefined) : undefined);
            const base = world.samplingConfigs.find((s) => sameId(s.id, refId));
            const overrides = { ...(config[node.key]?.['sampling'] ?? {}) };
            delete overrides[SLOT_VALUE];
            // The config's switchboard applies here exactly as it does on the
            // direct path: a sampler switched off must not reach the provider
            // merely because a pipeline is what asked for it. A world carrying no
            // `enabled` predates the distinction and is read as all-on.
            const stored = !base
                ? {}
                : base.enabled
                    ? resolveSamplingValues({
                        shape: base.shape,
                        values: base.values,
                        enabled: base.enabled,
                    })
                    : base.values;
            // Node overrides sit ABOVE the switchboard: a spec naming a value for
            // this node is stating it outright, not toggling a stored one.
            const values = { ...stored, ...overrides };
            // The row these values came from, for the host that has to send a
            // request built from a ROW rather than from numbers — see `SLOT_REF`.
            //
            // `base.id` and not `picked`: the id and the values then describe the
            // same row BY CONSTRUCTION, which is the whole point. A pick naming a
            // row this world does not carry resolves to no values, and attaching
            // its id anyway would hand the host a window the budget above never
            // saw — the same divergence, pointed the other way.
            if (picked != null && base)
                values[SLOT_REF] = base.id;
            return values;
        }
        if (slotName === 'params') {
            // A declared default is a promise the type makes; without this it was
            // decoration. Nothing applied `default:` from a parameters schema, so
            // a spec that did not override `budget` got `undefined` — which reads
            // downstream as a budget of zero, excludes every block, and renders a
            // context with its lore silently missing.
            //
            // Read from the *target*, both the schema and the values: a shared
            // params slot is the owner's policy, so its defaults are the
            // owner's too. Reading the schema here and the values there would
            // fill a query's gaps with the query's own defaults and call the
            // result the ranker's.
            const targetNode = doc.nodes.find((n) => n.key === targetKey) ?? node;
            const d = getType(`${targetNode.typeId}@${targetNode.typeVersion}`);
            const schema = d?.slots?.[slotName]?.schema;
            const defaults = {};
            for (const [k, v] of Object.entries(schema ?? {}))
                if (v?.default !== undefined)
                    defaults[k] = v.default;
            return { ...defaults, ...(config[targetKey]?.[slotName] ?? {}) };
        }
        // The generic slots (prompts, template, settings) honour the reference
        // target too: a shared prompts slot reads the *owner's* configured
        // values, so one authored text serves every node that declared it
        // shared (13 §12 finding i). Without `ofNode` the target is the node
        // itself, which is the behaviour every existing spec compiled against.
        return config[targetKey]?.[slotName] ?? {};
    };
    const invokeInner = async (node, scope, blockMode, iteration) => {
        const d = getType(`${node.typeId}@${node.typeVersion}`);
        if (!d)
            return err(`unknown type ${node.typeId}@${node.typeVersion}`);
        const hook = opts.bindings[`${node.typeId}@${node.typeVersion}`];
        const started = now();
        const nr = {
            nodeKey: node.key,
            seq: seq++,
            kind: node.kind,
            typeId: `${node.typeId}@${node.typeVersion}`,
            result: 'ok',
            startedAt: started,
            endedAt: started,
            elapsedMs: 0,
            blockMode,
            iteration,
            resolvedRefs: node.resolvedRefs,
            notes: [],
        };
        receipt.consumption.nodeExecutions++;
        if (receipt.consumption.nodeExecutions > budget.nodes)
            throw new BudgetExceeded('node execution budget exceeded');
        // ── Script chains (18 §4a) ────────────────────────────────────────────
        // Substrate placement, like the review gate below — and deliberately
        // *before* both the gate and the preview halt: a chain is configuration,
        // so the payload a reviewer approves and the payload the preview shows
        // are the payload the binding will actually receive. The binding never
        // sees a chain and cannot decline one; declaring the hook is all a type
        // does, and a host with no engine (`applyScripts` absent) runs every
        // spec exactly as before. Declared above the input branch because an
        // input node has a hook of its own — see there.
        const scriptHooks = Object.entries(d.slots ?? {}).filter(([, sd]) => sd.kind === 'scripts');
        const applyChainsAt = async (phase, bag) => {
            if (!opts.applyScripts)
                return bag;
            let out = bag;
            for (const [slotName, sdRaw] of scriptHooks) {
                const sd = sdRaw;
                if ((sd.phase ?? 'before') !== phase)
                    continue;
                // An empty or absent chain still reaches the applier: the host
                // may carry hook-level sources of its own — a connection's stop
                // guards (18 §4b) apply whether or not the pipeline configured a
                // chain, and the applier is the side that knows.
                const chain = config[node.key]?.[slotName]?.[''];
                const port = sd.port ?? 'main';
                if (!(port in out))
                    continue;
                const before = out[port];
                try {
                    const outcome = await opts.applyScripts({
                        nodeKey: node.key,
                        typeId: nr.typeId,
                        slot: slotName,
                        phase,
                        port,
                        accepts: sd.accepts ?? [],
                        extras: sd.extras ?? [],
                    }, chain, before);
                    if (outcome.applications.length)
                        nr.scripts = [...(nr.scripts ?? []), ...outcome.applications];
                    // Alias-preserving: a task publishing {main, messages} as one
                    // value keeps agreeing with itself after the rewrite — a
                    // downstream edge may pull either name.
                    out = { ...out, [port]: outcome.value };
                    for (const [k, v] of Object.entries(out))
                        if (k !== port && v === before)
                            out[k] = outcome.value;
                }
                catch (e) {
                    // Engine failure, absorbed like an optional node's failure
                    // (18 S2): the value passes through unchanged and the record
                    // is loud. A broken sandbox must never cost somebody their
                    // reply, and must never vanish either.
                    nr.scripts = [
                        ...(nr.scripts ?? []),
                        {
                            scriptId: -1,
                            name: '(engine)',
                            typeId: nr.typeId,
                            phase,
                            appliedBy: 'substrate',
                            result: 'err',
                            reason: e.message,
                        },
                    ];
                }
            }
            return out;
        };
        if (node.kind === 'input') {
            // An input has no invocation to wrap, but it can still declare a
            // hook: phase `after`, over the value it publishes — which is what
            // retrieval and the prompt see. The stored user message, written
            // before the turn began, stays untouched by construction.
            let published = opts.input;
            if (scriptHooks.length &&
                published &&
                typeof published === 'object' &&
                !Array.isArray(published))
                published = await applyChainsAt('after', published);
            scope.set(node.key, published);
            nr.output = published;
            nr.endedAt = now();
            receipt.nodes.push(nr);
            return ok(published);
        }
        if (!hook)
            return err(`no binding registered for ${node.typeId}@${node.typeVersion}`);
        let input = resolveInput(node, scope);
        // ── Switched off ──────────────────────────────────────────────────────
        //
        // Only a node whose contract already says an empty result is fine may be
        // turned off, which is exactly what `optional` declares. Reusing it
        // rather than inventing a second flag means the question "is it safe to
        // have nothing here" is answered once, by the author, in the place
        // downstream nodes already read.
        //
        // Distinct from `toggleable`, which is for shape-transparent
        // passthroughs — a source query is not a passthrough, and turning one
        // off produces nothing rather than forwarding its input.
        //
        // Skipped before the binding runs, so a disabled source costs no query
        // at all. That is the point: `share: 0` starves a source, this one does
        // not ask for it.
        if (d.optional === true && config[node.key]?.['settings']?.['enabled'] === false) {
            nr.endedAt = now();
            nr.elapsedMs = nr.endedAt - nr.startedAt;
            nr.result = 'ok';
            nr.notes.push('skipped: switched off');
            receipt.nodes.push(nr);
            return ok({});
        }
        if (scriptHooks.length)
            input = await applyChainsAt('before', input);
        // ── The review gate (01 §7) ───────────────────────────────────────────
        // Substrate placement: after the input resolves, before the binding is invoked.
        // Keys on declared effects, not on kind, so an effectful Provider gates too.
        if (isGated(d.effects)) {
            const position = resolvePosition(d.reviewDefault, config[node.key]?.['settings']?.['review']);
            if (position !== 'off') {
                const originalHash = hashPayload(input);
                if (!opts.reviewer) {
                    nr.endedAt = now();
                    nr.result = 'err';
                    nr.reason = `review is '${position}' but no reviewer is available`;
                    receipt.nodes.push(nr);
                    return err(nr.reason);
                }
                const decision = await opts.reviewer({
                    nodeKey: node.key,
                    typeId: nr.typeId,
                    payload: input,
                    position,
                });
                const rec = {
                    nodeKey: node.key,
                    position,
                    action: decision.action,
                    originalHash,
                    by: decision.by,
                    at: decision.at,
                };
                if (decision.action === 'reject') {
                    reviews.push(rec);
                    nr.endedAt = now();
                    nr.result = 'halt';
                    nr.reason = 'rejected at review';
                    receipt.nodes.push(nr);
                    return halt('rejected at review');
                }
                if (decision.action === 'edit') {
                    // The binding receives the edited payload and cannot tell (F14).
                    input = decision.payload;
                    rec.editedHash = hashPayload(input);
                }
                reviews.push(rec);
            }
            else {
                reviews.push({
                    nodeKey: node.key,
                    position,
                    action: 'approve',
                    originalHash: hashPayload(input),
                });
            }
        }
        // ── Wire formatting, at the pre-call substrate (16 §7) ────────────────
        // Allocation happened upstream in Assemble; this is where blocks become the
        // payload the connection actually wants. Once, here — never inside the
        // allocation loop, and never a second time for the preview.
        let wire;
        // Kept because formatting replaces the port value — the panel still needs the blocks.
        let wireCtx;
        if (d.slots) {
            const wireSlot = Object.entries(d.slots).find(([, sd]) => sd.kind === 'wire');
            if (wireSlot) {
                const [slotName, decl] = wireSlot;
                const chosen = config[node.key]?.['wire'] ??
                    input[slotName] ??
                    decl.format;
                const port = Object.entries(input).find(([, v]) => isAllocatedContext(v));
                if (chosen && port) {
                    const portName = port[0];
                    const ctx = port[1];
                    wireCtx = ctx;
                    const available = input.budget?.available ?? ctx.allocation.budget;
                    try {
                        wire = measureWire(chosen, ctx, (t) => countTokens(t), available);
                        input = { ...input, [portName]: wire.payload };
                        nr.notes.push(`wire ${wire.format}: ${wire.blockTokens} block + ${wire.overheadTokens} scaffold = ${wire.tokens} tokens` +
                            (wire.overBudgetBy ? `  ⚠ OVER by ${wire.overBudgetBy}` : ''));
                    }
                    catch (e) {
                        nr.endedAt = now();
                        nr.result = 'err';
                        nr.reason = e.message;
                        receipt.nodes.push(nr);
                        return err(nr.reason);
                    }
                    // An over-budget payload is `err`, not a silent trim and not a retry:
                    // a retry would re-invoke Assemble, which is a back-edge the graph
                    // cannot show (F9, F25). It means declared overhead is wrong, and
                    // that should be loud (16 §7).
                    if (wire.overBudgetBy) {
                        nr.endedAt = now();
                        nr.result = 'err';
                        nr.reason =
                            `formatted payload is ${wire.tokens} tokens against ${available} available — ` +
                                `over by ${wire.overBudgetBy}. The estimate came from wire format '${wire.format}'`;
                        receipt.nodes.push(nr);
                        return err(nr.reason);
                    }
                }
            }
        }
        // ── The preview halt (debug mode) ─────────────────────────────────────
        // Same substrate point as the review gate, and deliberately *before* it: there
        // is nothing to review when nothing will be sent. The payload is formed and
        // counted here, so the panel shows the real figure rather than a parallel
        // estimate that drifts from what actually goes out.
        if (previewAt && node.key === previewAt.key) {
            receipt.preview = buildPreview(node, input, nr.typeId, previewAt.targetedBy, wire, wireCtx);
            nr.input = redact(input);
            nr.endedAt = now();
            nr.elapsedMs = nr.endedAt - nr.startedAt;
            nr.result = 'halt';
            nr.reason = `preview: stopped before ${node.key}, nothing sent`;
            receipt.nodes.push(nr);
            return halt(nr.reason);
        }
        nr.input = redact(input);
        // Gates receipt compaction (13 §2): once anything effectful has been invoked,
        // the run is worth recording in full whatever happens next.
        if (d.effects && d.effects !== 'none')
            effectfulNodeRan = true;
        const timeoutMs = Math.min(d.timeoutMs ?? Infinity, opts.timeoutCeilingMs ?? Infinity);
        nr.timeoutMsApplied = Number.isFinite(timeoutMs) ? timeoutMs : undefined;
        const controller = new AbortController();
        const base = {
            signal: controller.signal,
            progress: () => { }, // ephemeral, never recorded (F34)
            log: (lvl, m) => nr.notes.push(`${lvl}: ${m}`),
            countTokens,
        };
        if (d.declaresRandomness)
            base.random = rng;
        // The interior-point broker (18 §4e): granted only when the descriptor
        // declares points and the host supplied an engine — `ctx.scripts`
        // simply does not exist otherwise, the `declaresRandomness` posture.
        // The binding names a declared point and nothing else; the chain the
        // user attached there (slot `scripts`, path = the point key) is what
        // runs; applications land in the receipt marked `appliedBy: 'binding'`,
        // so an interior letting user policy in stays visible from outside.
        if (opts.applyScripts && d.scriptPoints?.length) {
            const applyScripts = opts.applyScripts;
            const declared = d.scriptPoints;
            base.scripts = {
                applyText: async (point, text) => {
                    const known = declared.find((sp) => sp.key === point);
                    if (!known)
                        throw new Error(`'${point}' is not a script point '${nr.typeId}' declares. ` +
                            `Declared: ${declared.map((sp) => sp.key).join(', ')}. ` +
                            `Points are part of the hashed contract — declare it on the descriptor.`);
                    const outcome = await applyScripts({
                        nodeKey: node.key,
                        typeId: nr.typeId,
                        slot: 'scripts',
                        phase: 'before',
                        port: point,
                        accepts: ['core:script:text/transform@1'],
                        extras: [],
                        origin: 'binding',
                    }, config[node.key]?.['scripts']?.[point], text);
                    if (outcome.applications.length)
                        nr.scripts = [...(nr.scripts ?? []), ...outcome.applications];
                    return typeof outcome.value === 'string' ? outcome.value : text;
                },
            };
        }
        const nodeRef = {
            key: node.key,
            typeId: node.typeId,
            typeVersion: node.typeVersion,
            kind: node.kind,
        };
        const host = opts.host;
        let ctx = base;
        if (node.kind === 'query')
            ctx = {
                ...base,
                read: (table, q) => host?.read ? host.read(table, q, nodeRef) : [],
            };
        if (node.kind === 'provider') {
            const conn = host?.connection?.(nodeRef);
            /**
             * What the bound connection can actually do.
             *
             * Narrowed to the ids this node DECLARED, not the connection's whole
             * set: a binding may only ask about what its own type said it might
             * use. Anything else would let a node quietly depend on a capability
             * it never advertised, which is the thing the declaration exists to
             * prevent — and the picker filters on those declarations, so a
             * dependency outside them was never checked at bind time either.
             */
            const d = getType(`${node.typeId}@${node.typeVersion}`);
            const declared = new Set();
            for (const slot of Object.values(d?.slots ?? {}))
                for (const id of slot.optional ?? [])
                    declared.add(id);
            const have = conn?.capabilities ?? {};
            ctx = {
                ...base,
                connectionMetadata: conn?.metadata ?? input.connection?.metadata ?? {},
                sampling: conn?.sampling ?? input.sampling ?? {},
                can: (id) => {
                    if (!declared.has(id))
                        return false;
                    // `typeof` as well as `> 0`: this set comes off a JSON column
                    // nothing type-checked, and a truthiness test alone would hand a
                    // binding a string it would then compare numerically.
                    const grade = have[id];
                    return typeof grade === 'number' && grade > 0 ? grade : false;
                },
                call: async (p) => {
                    // Recorded before dispatch, so a Provider that throws still leaves the
                    // request in the receipt — the failing call is the one worth reading.
                    nr.request = p;
                    return host?.call ? await host.call(p, nodeRef) : p;
                },
                reportUsage: (t) => {
                    nr.tokens = (nr.tokens ?? 0) + t;
                    spendTokens(t);
                },
                reportSampling: (applied, ignored) => {
                    nr.samplingApplied = applied;
                    nr.samplingIgnored = ignored;
                },
                reportCacheUsage: (usage) => {
                    // Each field only if it was given: absent must survive as
                    // absent all the way to the panel, or "this service does not
                    // say" is reported as "nothing was reused".
                    if (typeof usage?.prompt === 'number')
                        nr.tokensPrompt = usage.prompt;
                    if (typeof usage?.cached === 'number')
                        nr.tokensCached = usage.cached;
                    if (typeof usage?.cacheWrite === 'number')
                        nr.tokensCacheWrite = usage.cacheWrite;
                },
            };
        }
        if (node.kind === 'consumer') {
            ctx = {
                ...base,
                commit: async (p) => host?.commit
                    ? await host.commit(p, nodeRef)
                    : { id: `row:${node.key}`, ...p },
                emit: (handle, payload) => {
                    nr.notes.push(`emit → ${handle}`);
                    host?.emit?.(handle, payload, nodeRef);
                },
            };
        }
        let res;
        try {
            res = await withTimeout(Promise.resolve(hook(input, ctx)), timeoutMs, controller, now);
        }
        catch (e) {
            if (e instanceof BudgetExceeded)
                throw e;
            if (e.message === '__timeout__') {
                nr.timedOut = true;
                res = err(`timeout after ${timeoutMs}ms`);
            }
            else {
                res = err(e.message);
            }
        }
        nr.endedAt = now();
        nr.elapsedMs = nr.endedAt - nr.startedAt;
        nr.result = res.kind;
        // An optional node's failure is not the run's failure (see
        // `Descriptor.optional`). Recorded before it is absorbed: `result`
        // stays `err` and `reason` keeps the message, so the receipt reads as
        // "this failed and the run went on" rather than as a success.
        if (res.kind === 'err' && d.optional === true) {
            nr.reason = res.reason;
            nr.recoveredAsEmpty = true;
            res = ok({});
        }
        if (res.kind === 'ok') {
            // A gate-eligible Consumer publishes the discriminated write result, so the
            // committed and pending cases are the same shape and a downstream type has
            // to handle both (13 §7j-b). There is no branch node to check `status` with
            // (F25), so the obligation belongs to the port shape, not to the spec.
            let published = res.value;
            // ── Script chains, after phase (18 §4a) — over what the binding
            // published, before it reaches the scope any downstream edge reads.
            if (scriptHooks.length &&
                published &&
                typeof published === 'object' &&
                !Array.isArray(published))
                published = await applyChainsAt('after', published);
            if (node.kind === 'consumer' && isGated(d.effects)) {
                // Wrap only if it is not already discriminated — but publish
                // either way. This used to skip publishing entirely when a
                // binding returned a `WriteResult` itself, so the binding doing
                // the *right* thing got the worse wiring: no `main`, and no
                // port typed `write-result@1` populated. Nothing caught it
                // because the only in-tree producer of `pending` was the
                // executor's own async-review branch, which called
                // `publishWriteResult` on its own; retiring that branch is what
                // surfaced this.
                const w = isWriteResult(published)
                    ? published
                    : {
                        status: 'committed',
                        ids: (published ?? {}),
                    };
                published = publishWriteResult(w, d.ports.out);
            }
            scope.set(node.key, published);
            res = ok(published);
            nr.output = redact(published);
        }
        else if (res.kind === 'halt' || res.kind === 'err' || res.kind === 'cancelled') {
            nr.reason = res.reason;
        }
        // Core emits, not the node (01 §8 / F8).
        if (res.kind === 'ok' &&
            node.kind === 'consumer' &&
            d.effects === 'write' &&
            d.causesEvent) {
            receipt.emitted.push({
                event: d.causesEvent,
                cause: node.key,
                subscribers: opts.subscribers?.[d.causesEvent] ?? 0,
            });
        }
        receipt.nodes.push(nr);
        return res;
    };
    /**
     * The invocation, observed. `onNode` fires at start and settle with node
     * identity and never a payload (F34) — an observer that throws is the
     * observer's problem, not the run's.
     */
    const invoke = async (node, scope, blockMode, iteration) => {
        const ev = (phase, result) => {
            try {
                opts.onNode?.({
                    phase,
                    nodeKey: node.key,
                    typeId: `${node.typeId}@${node.typeVersion}`,
                    kind: node.kind,
                    seq,
                    declared: doc.nodes.length,
                    iteration,
                    ...(result ? { result } : {}),
                });
            }
            catch {
                // Progress display must never take a run down.
            }
        };
        ev('start');
        const res = await invokeInner(node, scope, blockMode, iteration);
        ev('end', res.kind);
        return res;
    };
    /** Admin kill (13 §3) — `cancelled`, not `err`, with the actor recorded. */
    const checkCancel = () => {
        const c = opts.cancelSignal?.();
        if (!c)
            return false;
        receipt.outcome = 'cancelled';
        receipt.cancelledBy = c.by;
        receipt.haltReason = c.reason;
        return true;
    };
    const itemsAt = (level) => {
        const nodes = ordered
            .filter((n) => n.blockId === level.blockId && n.blockChain === level.chain)
            .map((node) => ({
            sort: node.position,
            run: node,
            isBlock: false,
        }));
        const blocks = doc.blocks
            .filter((b) => b.blockId === level.blockId && b.blockChain === level.chain)
            .map((block) => ({
            sort: block.position,
            run: block,
            isBlock: true,
        }));
        return [...nodes, ...blocks].sort((a, b) => a.sort - b.sort);
    };
    const runLevel = async (level, scope, blockMode, iteration) => {
        let last = ok(null);
        for (const item of itemsAt(level)) {
            if (checkCancel())
                return cancelled('cancelled');
            last = item.isBlock
                ? await runBlock(item.run, scope)
                : await invoke(item.run, scope, blockMode, iteration);
            if (last.kind !== 'ok')
                return last;
        }
        return last;
    };
    const truthy = (v) => !!v && !(Array.isArray(v) && v.length === 0);
    const runBlock = async (block, scope) => {
        // `forceSequential` still wins over both: it is how a preview replays a
        // run deterministically, and a user setting must not be able to make a
        // preview nondeterministic.
        const mode = opts.forceSequential
            ? 'sequential'
            : resolveBlockMode(block.mode, config[block.id]?.['settings']?.['mode']);
        const collected = [];
        /**
         * The block's own output, addressable by its id.
         *
         * `into` is the parent scope for every construct but the loop, which
         * publishes into its own scope first so the body can read it — see the
         * carry below. The union reads `collected` live, so one publish keeps
         * answering as iterations arrive.
         */
        const publish = (into = scope) => {
            const union = {
                branches: collected,
                get main() {
                    return this.branches;
                },
                get values() {
                    return this.branches
                        .filter((b) => b.result.kind === 'ok')
                        .map((b) => b.result.value);
                },
                get ok() {
                    return collected.every((b) => b.result.kind === 'ok');
                },
            };
            into.set(block.id, union);
        };
        if (block.kind === 'async') {
            // Chains share the scope: a sibling is addressable by its qualified key, and
            // keys are unique, so there is nothing to collide.
            const run = (chain) => runLevel({ blockId: block.id, chain }, scope, mode);
            const results = mode === 'parallel'
                ? await Promise.all(block.chains.map(run))
                : await sequential(block.chains, run);
            block.chains.forEach((chain, i) => collected.push({
                branchKey: chain,
                index: i,
                result: results[i],
            }));
            publish();
            return collected.find((b) => b.result.kind !== 'ok')?.result ?? ok(null);
        }
        if (block.kind === 'map') {
            const items = resolveMapItems(block.over, scope);
            if (block.max !== undefined && items.length > block.max) {
                return err(`map '${block.id}' received ${items.length} items but declares max ${block.max}`);
            }
            // Each iteration gets its own scope, so genuinely parallel maps are correct
            // rather than merely equivalent-if-you-squint.
            const run = async (item, i) => {
                const child = scope.child();
                child.set(`${block.id}.${ITEM_KEY}`, item);
                return runLevel({ blockId: block.id, chain: 'item' }, child, mode, i);
            };
            const results = mode === 'parallel'
                ? await Promise.all(items.map(run))
                : await sequential(items.map((item, i) => ({ item, i })), ({ item, i }) => run(item, i));
            items.forEach((_, i) => collected.push({
                branchKey: `${block.id}[${i}]`,
                index: i,
                result: results[i],
            }));
            publish();
            return collected.find((b) => b.result.kind !== 'ok')?.result ?? ok(null);
        }
        if (block.kind === 'route') {
            // ── route (20 §10) ───────────────────────────────────────────────
            // The decision is data a task computed; the routing is declaration.
            // Every predicate's evaluation is recorded — fired and skipped
            // alike — so "why did the lore branch not run" answers from rows.
            const value = resolvePredicate(block.on, scope);
            const routes = block.routes ?? {};
            const read = (path) => {
                if (!path)
                    return value;
                let cur = value;
                for (const seg of path.split('.')) {
                    if (cur == null)
                        return undefined;
                    cur = cur[seg];
                }
                return cur;
            };
            const describe = (p) => p.default
                ? 'default'
                : p.equals !== undefined
                    ? `${p.path ?? 'value'} equals ${JSON.stringify(p.equals)}`
                    : `${p.path ?? 'value'} truthy`;
            const fires = (p) => {
                if (p.default)
                    return false; // resolved after the others
                const v = read(p.path);
                if (p.equals !== undefined)
                    return v === p.equals;
                if (p.truthy)
                    return truthy(v);
                return false;
            };
            const fired = new Map();
            for (const chain of block.chains)
                fired.set(chain, fires(routes[chain] ?? {}));
            const anyFired = [...fired.values()].some(Boolean);
            for (const chain of block.chains)
                if (routes[chain]?.default)
                    fired.set(chain, !anyFired);
            receipt.notes = [
                ...(receipt.notes ?? []),
                ...block.chains.map((chain) => `route '${block.id}': '${chain}' ${fired.get(chain) ? 'fired' : 'skipped'} (${describe(routes[chain] ?? {})})`),
            ];
            const firedChains = block.chains.filter((c) => fired.get(c));
            const run = (chain) => runLevel({ blockId: block.id, chain }, scope, mode);
            const results = new Map();
            if (mode === 'parallel') {
                const rs = await Promise.all(firedChains.map(run));
                firedChains.forEach((c, i) => results.set(c, rs[i]));
            }
            else {
                for (const c of firedChains) {
                    if (checkCancel())
                        return cancelled('cancelled');
                    results.set(c, await run(c));
                }
            }
            block.chains.forEach((chain, i) => collected.push({
                branchKey: chain,
                index: i,
                result: results.get(chain) ?? halt('not selected by route'),
                fired: !!fired.get(chain),
            }));
            // The union's ok/values read the *fired* branches: a skipped branch
            // is a stated outcome, never a failure and never a value.
            const union = {
                branches: collected,
                get main() {
                    return this.branches;
                },
                get values() {
                    return this.branches
                        .filter((b) => b.fired && b.result.kind === 'ok')
                        .map((b) => b.result.value);
                },
                ok: collected.every((b) => !b.fired || b.result.kind === 'ok'),
            };
            scope.set(block.id, union);
            return (collected.find((b) => b.fired && b.result.kind !== 'ok')?.result ?? ok(null));
        }
        // ── loop (01 §4a) ────────────────────────────────────────────────────
        // Do-while: run the body, then re-read the declared predicate. A tool loop
        // always wants one generate before it can know whether to stop.
        const max = block.max ?? 0;
        /**
         * The carry: one scope for the whole loop, holding the block's
         * accumulating output.
         *
         * A tool loop is only a loop if the next prompt can see the last
         * result, and the body cannot reference a node declared after it —
         * `makeScope` makes a back-edge unwritable (F9). What *is* declared
         * before the body is the block itself, so `$.agent.values` reads the
         * iterations that have already finished. Each iteration still runs in
         * a child of this, so an iteration's node values stay private to it
         * and a loop remains the same construct as a parallel map (F26).
         */
        const carry = scope.child();
        publish(carry);
        let ran = 0;
        const stoppedOn = (stopped) => {
            receipt.loops = [
                ...(receipt.loops ?? []),
                { blockId: block.id, iterations: ran, stopped },
            ];
            publish();
        };
        for (let i = 0; i < max; i++) {
            if (checkCancel()) {
                stoppedOn('interrupted');
                return cancelled('cancelled');
            }
            const child = carry.child();
            const r = await runLevel({ blockId: block.id, chain: 'item' }, child, 'sequential', i);
            ran++;
            collected.push({
                branchKey: `${block.id}[${i}]`,
                index: i,
                result: r,
            });
            if (r.kind !== 'ok') {
                stoppedOn('interrupted');
                return r;
            }
            const again = block.repeatWhile ? resolvePredicate(block.repeatWhile, child) : false;
            if (!truthy(again)) {
                stoppedOn('predicate');
                return ok(null);
            }
        }
        stoppedOn('ceiling');
        // Reaching `max` is not an error — it is the bound doing its job, and the
        // receipt says so rather than leaving a truncated loop looking successful.
        receipt.notes = [
            ...(receipt.notes ?? []),
            `loop '${block.id}' reached its declared max of ${max}`,
        ];
        return ok(null);
    };
    try {
        const outcome = await runLevel({ blockId: undefined, chain: undefined }, values);
        if (outcome.kind === 'halt') {
            receipt.outcome = 'halt';
            receipt.haltReason = outcome.reason;
            receipt.haltNodeKey ??= receipt.nodes.find((n) => n.result === 'halt')?.nodeKey;
        }
        else if (outcome.kind !== 'ok') {
            receipt.outcome = outcome.kind;
            if (outcome.kind === 'err') {
                receipt.haltReason ??= outcome.reason;
                receipt.haltNodeKey ??= receipt.nodes.find((n) => n.result === 'err')?.nodeKey;
            }
        }
    }
    catch (e) {
        if (e instanceof BudgetExceeded) {
            receipt.outcome = 'err';
            receipt.haltReason = e.message;
        }
        else
            throw e;
    }
    receipt.endedAt = now();
    receipt.reviews = reviews;
    // Receipts sort by execution order for rendering.
    receipt.nodes.sort((a, b) => a.seq - b.seq);
    // ── Compact receipt (13 §2) ───────────────────────────────────────────────
    // The per-message multiplier is a hot event × every subscribed pipeline, where
    // most subscribers halt on the first node and that is success (01 §5). Those
    // runs keep their attribution and lose their payloads.
    // A preview is never compacted — the preview *is* the payload. Worth noting that the
    // trigger-source rule already gets this right on its own (a preview is `ui`), but
    // relying on that would be an accident rather than a decision.
    const compactDefault = receipt.triggerSource === 'event' && !receipt.preview;
    if ((opts.compactHaltReceipts ?? compactDefault) &&
        receipt.outcome === 'halt' &&
        !effectfulNodeRan) {
        receipt.compact = true;
        receipt.compactedNodeCount = receipt.nodes.length;
        receipt.nodes = [];
        receipt.reviews = [];
    }
    return receipt;
}
/**
 * Every out port a gate-eligible Consumer declares as `write-result@1` resolves to the
 * *same* discriminated value. A port named `messageId` therefore hands downstream the
 * result, not an id — which is the point: there may not be an id yet (13 §7j-b).
 */
function publishWriteResult(w, out) {
    const published = { ...w, main: w };
    for (const [port, shape] of Object.entries(out ?? {})) {
        if (shape === 'core:shape/write-result@1')
            published[port] = w;
    }
    return published;
}
const isWriteResult = (v) => !!v &&
    typeof v === 'object' &&
    'status' in v &&
    (v.status === 'committed' || v.status === 'pending');
/**
 * A loop's `repeatWhile` is a **port reference**, resolved in the iteration's own scope.
 * Not an expression: a reference keeps the construct renderable ("repeats while
 * generate.hasToolCalls, max 8") and keeps a second expression language out of the design.
 */
function resolvePredicate(ref, scope) {
    if (!ref || typeof ref !== 'object' || ref.__ref !== 'data')
        return ref;
    const r = ref;
    return readPort(scope.get(r.node), r.port);
}
/**
 * Read a port off an upstream value.
 *
 * `main` means **the whole value** when the producer declared no distinct `main` — which
 * is exactly the case for a map or loop item, where the "producer" is a raw list element
 * that never had ports at all. Without this, `$.$item` on a plain object silently
 * resolves to undefined, which is the least debuggable failure available.
 */
function readPort(upstream, port) {
    if (!upstream || typeof upstream !== 'object')
        return upstream;
    if (port === 'main' && !(port in upstream))
        return upstream;
    return upstream[port];
}
/** `over` is either a literal list or a data ref into an upstream value. */
function resolveMapItems(over, values) {
    if (Array.isArray(over))
        return over;
    if (over && typeof over === 'object' && over.__ref === 'data') {
        const r = over;
        const v = readPort(values.get(r.node), r.port);
        return Array.isArray(v) ? v : v === undefined || v === null ? [] : [v];
    }
    return [];
}
async function sequential(items, fn) {
    const out = [];
    for (const i of items)
        out.push(await fn(i));
    return out;
}
function withTimeout(p, ms, controller, now) {
    if (!Number.isFinite(ms))
        return p;
    return new Promise((resolve, reject) => {
        const t = setTimeout(() => {
            controller.abort();
            reject(new Error('__timeout__'));
        }, ms);
        p.then((v) => {
            clearTimeout(t);
            resolve(v);
        }, (e) => {
            clearTimeout(t);
            reject(e);
        });
    });
}
function setPath(obj, path, value) {
    let cur = obj;
    for (let i = 0; i < path.length - 1; i++) {
        const k = path[i];
        cur[k] = Array.isArray(cur[k]) ? [...cur[k]] : { ...(cur[k] ?? {}) };
        cur = cur[k];
    }
    cur[path[path.length - 1]] = value;
}
/** Vectors, material and secrets never enter a receipt (16 §1a, 01 §10, 13 §6). */
function redact(v) {
    if (Array.isArray(v) && v.length > 8 && v.every((x) => typeof x === 'number')) {
        return { $vector: true, dims: v.length };
    }
    if (Array.isArray(v))
        return v.map(redact);
    // A secret-typed setting is redacted **by its type**, which is the entire reason
    // the field is typed rather than free-form: core can identify it without knowing
    // what the plugin called it (13 §6).
    if (isSecret(v))
        return '[secret]';
    if (v && typeof v === 'object') {
        const out = {};
        for (const [k, val] of Object.entries(v)) {
            if (k === 'material' || k === 'credentials') {
                out[k] = '[redacted]';
                continue;
            }
            out[k] = redact(val);
        }
        return out;
    }
    return v;
}
/** replay(receipt) — deterministic, never re-infers (F16). */
export async function replay(doc, receipt, bindings) {
    const recorded = new Map(receipt.nodes.map((n) => [n.nodeKey, n.output]));
    const replayBindings = { ...bindings };
    for (const n of receipt.nodes) {
        if (n.kind !== 'provider')
            continue;
        replayBindings[n.typeId] = async () => ok(recorded.get(n.nodeKey));
    }
    return run(doc, {
        input: receipt.nodes[0]?.output,
        bindings: replayBindings,
        seed: receipt.seed,
        runId: receipt.runId + ':replay',
    });
}
//# sourceMappingURL=executor.js.map