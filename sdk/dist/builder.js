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
 * scope** — `$ => C.assemble({ candidates: $.history.messages })`. The callback form is
 * preferred: it types the node key and the port, and it makes a forward reference
 * impossible to write rather than a finding to read (src/scope.ts). Both forms compile
 * to the same rows.
 */
import { makeScope, ITEM } from './scope.js';
import { assertSpecId, parseSpecId } from './identity.js';
import { genreIdOf } from './genres.js';
import { actionFindings, normalizeContributes, slashCollisions, } from './actions.js';
/** Lowercase kebab. A slug is a database reference, not display text. */
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const parseId = (definitionId) => {
    const m = /^(.*)@(\d+)$/.exec(definitionId);
    return m ? { base: m[1], version: Number(m[2]) } : { base: definitionId, version: 1 };
};
// ── Chain builders ──────────────────────────────────────────────────────────
class ChainBuilder {
    spec;
    clauseCtx;
    constructor(spec, clauseCtx) {
        this.spec = spec;
        this.clauseCtx = clauseCtx;
    }
    /** Resolve the callback form against the nodes declared so far. */
    resolve(arg) {
        if (typeof arg !== 'function')
            return arg;
        const known = new Set(this.spec.nodes.map((n) => n.key));
        // Clauses publish under their own id, so they are addressable exactly like nodes —
        // and for an each or a loop that is the *only* well-defined thing to address.
        for (const b of this.spec.clauses)
            known.add(b.id);
        // Inside an each, the current item is addressable without naming the clause.
        if (this.clauseCtx)
            known.add(`${this.clauseCtx.clauseId}.${ITEM}`);
        const localPrefix = this.clauseCtx
            ? `${this.clauseCtx.clauseId}.${this.clauseCtx.chain}`
            : undefined;
        const scope = makeScope(known, localPrefix, this.clauseCtx?.clauseId);
        return arg(scope);
    }
    add(kind, key, arg) {
        const node = this.resolve(arg);
        if (node?.descriptor?.kind !== kind) {
            throw new Error(`.${kind}('${key}', …) was given a ${node?.descriptor?.kind ?? 'non-node'} ` +
                `('${node?.descriptor?.id ?? '?'}'). The method names the kind; use .${node?.descriptor?.kind}() instead.`);
        }
        // A colon marks a synthetic config address, not a node: an envoy's
        // config lives at `envoy:<key>` beside the node keys in the resolved
        // config (`envoyConfigKey`), and a node spelled with one could shadow
        // it — or be read as one. Refused at the key, before it can (U5g
        // review, S2).
        if (key.includes(':')) {
            throw new Error(`node key '${key}' contains ':' — a colon marks a synthetic config address ` +
                `(\`envoy:<key>\`), which a node key must never be mistaken for`);
        }
        if (this.spec.nodes.some((n) => n.key === this.qualify(key))) {
            throw new Error(`duplicate node key '${this.qualify(key)}' — keys are explicit and unique (F21)`);
        }
        // Nodes and clauses share one address space: `$.tools` must name exactly
        // one thing, and the executor publishes a clause's union under its id
        // beside the node values. Found when the tool loop took the key `tools`
        // (2026-09-16) beside a query of the same name.
        if (this.spec.clauses.some((c) => c.id === this.qualify(key))) {
            throw new Error(`node key '${this.qualify(key)}' is already a clause id — nodes and clauses share one address space`);
        }
        const { base, version } = parseId(node.descriptor.id);
        this.spec.nodes.push({
            key: this.qualify(key),
            kind,
            definitionId: base,
            definitionVersion: version,
            config: node.config,
            clauseId: this.clauseCtx?.clauseId,
            clauseKind: this.clauseCtx
                ? (this.spec.clauses.find((b) => b.id === this.clauseCtx.clauseId)?.kind ?? 'gather')
                : undefined,
            clauseChain: this.clauseCtx?.chain,
            position: this.spec.nodes.length,
        });
        return this;
    }
    qualify(key) {
        return this.clauseCtx ? `${this.clauseCtx.clauseId}.${this.clauseCtx.chain}.${key}` : key;
    }
    /** Where a clause declared here sits, so clauses nest exactly as nodes do. */
    declareClause(b) {
        if (this.spec.nodes.some((n) => n.key === b.id) || this.spec.clauses.some((c) => c.id === b.id))
            throw new Error(`clause id '${b.id}' is already a node key or clause id — nodes and clauses share one address space`);
        const clause = {
            ...b,
            clauseId: this.clauseCtx?.clauseId,
            clauseChain: this.clauseCtx?.chain,
            position: this.spec.nodes.length,
        };
        this.spec.clauses.push(clause);
        return clause;
    }
    /**
     * A **gather** clause: several chains collected and awaited together (01 §4).
     * `mode` is a setting — by the equivalence law (C8) parallel and sequential
     * are unobservable, which is why the construct is named for what it does
     * (gather) and not for how (was `.async()`).
     */
    gather(id, opts, fn) {
        const qualified = this.qualify(id);
        this.declareClause({
            id: qualified,
            kind: 'gather',
            mode: opts.mode ?? 'parallel',
            chains: [],
        });
        fn(new GatherBuilder(this.spec, qualified));
        return this;
    }
    /** An **each** clause: one contained chain, once per item of a list (01 §4). Was `.map()`. */
    each(id, opts, fn) {
        const qualified = this.qualify(id);
        this.declareClause({
            id: qualified,
            kind: 'each',
            mode: opts.mode ?? 'parallel',
            over: typeof opts.over === 'function' ? this.resolve(opts.over) : opts.over,
            max: opts.max,
            chains: ['item'],
        });
        fn(new ChainBuilder(this.spec, { clauseId: qualified, chain: 'item' }));
        return this;
    }
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
    loop(id, opts, fn) {
        const qualified = this.qualify(id);
        const clause = this.declareClause({
            id: qualified,
            kind: 'loop',
            mode: 'sequential',
            max: opts.max,
            chains: ['item'],
        });
        fn(new ChainBuilder(this.spec, { clauseId: qualified, chain: 'item' }));
        // Resolved *after* the body, so the predicate may name a node inside it — which
        // is the only place a predicate that ever changes can come from.
        clause.repeatWhile =
            typeof opts.repeatWhile === 'function'
                ? new ChainBuilder(this.spec, {
                    clauseId: qualified,
                    chain: 'item',
                }).resolvePublic(opts.repeatWhile)
                : opts.repeatWhile;
        return this;
    }
    /** Internal: the callback resolver, reachable from `loop` after the body is built. */
    resolvePublic(arg) {
        return this.resolve(arg);
    }
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
    junction(id, opts, fn) {
        const qualified = this.qualify(id);
        const clause = this.declareClause({
            id: qualified,
            kind: 'junction',
            mode: opts.mode ?? 'parallel',
            on: typeof opts.on === 'function' ? this.resolve(opts.on) : opts.on,
            branches: {},
            chains: [],
        });
        fn(new JunctionBuilder(this.spec, qualified, clause));
        return this;
    }
    query(key, node) {
        return this.add('query', key, node);
    }
    task(key, node) {
        return this.add('task', key, node);
    }
    oracle(key, node) {
        return this.add('oracle', key, node);
    }
    outlet(key, node) {
        return this.add('outlet', key, node);
    }
}
class GatherBuilder {
    spec;
    clauseId;
    constructor(spec, clauseId) {
        this.spec = spec;
        this.clauseId = clauseId;
    }
    /**
     * Each chain's nodes accumulate into the clause's type, so by the time `.gather()`
     * returns, the spine's scope contains every node the clause declared — under the
     * qualified key it actually has.
     */
    chain(name, fn) {
        const clause = this.spec.clauses.find((b) => b.id === this.clauseId);
        clause.chains.push(name);
        fn(new ChainBuilder(this.spec, {
            clauseId: this.clauseId,
            chain: name,
        }));
        return this;
    }
}
/**
 * The junction clause's own builder: every branch is a named chain *with a
 * declared predicate*, and the two are stated together so a branch without a
 * condition cannot be written at all.
 */
export class JunctionBuilder {
    spec;
    clauseId;
    clause;
    constructor(spec, clauseId, clause) {
        this.spec = spec;
        this.clauseId = clauseId;
        this.clause = clause;
    }
    /** A branch that fires when its predicate matches the junction's value. */
    when(name, predicate, fn) {
        this.clause.chains.push(name);
        this.clause.branches[name] = { ...predicate };
        fn(new ChainBuilder(this.spec, {
            clauseId: this.clauseId,
            chain: name,
        }));
        return this;
    }
    /** The branch that fires exactly when nothing else did. At most one. */
    otherwise(name, fn) {
        this.clause.chains.push(name);
        this.clause.branches[name] = { default: true };
        fn(new ChainBuilder(this.spec, {
            clauseId: this.clauseId,
            chain: name,
        }));
        return this;
    }
}
/**
 * Slot-named methods, for the same reason the chain has kind-named ones (04 §4a): the
 * method names the slot, so setting a slot a node never declared is caught by name rather
 * than becoming an override row that silently matches nothing.
 */
export class PresetBuilder {
    preset;
    constructor(preset) {
        this.preset = preset;
    }
    set(nodeKey, slot, value) {
        this.preset.values.push({ nodeKey, slot, value });
        return this;
    }
    /** Node behaviour knobs — retrieval `weight`, `minInclude`, `topK` (12 §2). */
    params(nodeKey, value) {
        return this.set(nodeKey, 'params', value);
    }
    /** Authored text fields the node declares. */
    prompts(nodeKey, value) {
        return this.set(nodeKey, 'prompts', value);
    }
    /** A template **and its engine** — the engine travels on the value (src/engines.ts). */
    template(nodeKey, value) {
        return this.set(nodeKey, 'template', value);
    }
    /** Generation parameters: a reference to a named config, or field overrides on top. */
    sampling(nodeKey, value) {
        return this.set(nodeKey, 'sampling', value);
    }
    /** Node toggles and the review position. */
    settings(nodeKey, value) {
        return this.set(nodeKey, 'settings', value);
    }
}
export class SpecBuilder extends ChainBuilder {
    inletDone = false;
    constructor(rawId, meta) {
        assertSpecId(rawId);
        const parsed = parseSpecId(rawId);
        /**
         * The stored id is the **slug**, versionless (`identity.ts`): a trailing
         * `@N` is type-pin syntax `parseSpecId` tolerates, and until 2026-09-16
         * it was kept verbatim here — so `demo:roll@1` contributed actions whose
         * identity read `demo:roll@1#roll`, which the host's identity grammar
         * (`<spec slug>#<key>`, no `@`) refuses. One spelling leaves the builder.
         */
        const id = rawId.replace(/@\d+$/, '');
        // The deep rename (24 §2): `mode` is accepted as a deprecated alias and
        // normalized here, so documents only ever carry `genre`.
        const normalized = { ...meta };
        if (normalized.mode && !normalized.genre)
            normalized.genre = normalized.mode;
        delete normalized.mode;
        if (normalized.taxonomy) {
            const t = { ...normalized.taxonomy };
            if (t.mode && !t.genre)
                t.genre = t.mode;
            delete t.mode;
            normalized.taxonomy = t;
        }
        // The action model (U5c): `triggers` folds into `actions`, every
        // action's aliases fold with it, and a malformed declaration — an
        // unknown venue kind, a slash name outside the spec's namespace, a
        // bare-string-less label — is refused here, where the author is.
        if (normalized.contributes) {
            normalized.contributes = normalizeContributes(normalized.contributes);
            const actions = normalized.contributes?.actions ?? [];
            const faults = actions.flatMap((a) => actionFindings(a, id));
            if (!faults.length)
                faults.push(...slashCollisions(actions.map((a) => ({ ...a, specId: id }))));
            if (faults.length)
                throw new Error(`spec '${id}' declares an action core cannot offer:\n · ${faults.join('\n · ')}`);
        }
        super({
            id,
            meta: { ...normalized, owner: normalized.owner ?? parsed.owner },
            nodes: [],
            clauses: [],
            includes: [],
            presets: [],
        });
    }
    // The four node methods are re-declared here purely so the spine keeps offering
    // .gather(), .each(), .include() and .build(). Same implementation, narrower return.
    query(key, node) {
        return this.add('query', key, node);
    }
    task(key, node) {
        return this.add('task', key, node);
    }
    oracle(key, node) {
        return this.add('oracle', key, node);
    }
    outlet(key, node) {
        return this.add('outlet', key, node);
    }
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
    preset(slug, meta, fn) {
        if (!SLUG.test(slug)) {
            throw new Error(`'${slug}' is not a valid preset slug. Use lowercase letters, digits and hyphens ` +
                `(e.g. 'lore-heavy'). The slug is a stable database reference an update matches on, ` +
                `not display text — put the pretty name in \`label\` (12 §3a).`);
        }
        if (this.spec.presets.some((p) => p.slug === slug)) {
            throw new Error(`duplicate preset slug '${slug}' — slugs are unique per spec, because they are the sync key (12 §3a)`);
        }
        if (meta.default && this.spec.presets.some((p) => p.default)) {
            throw new Error(`'${slug}' is a second default preset. A spec ships at most one default; ` +
                `an admin chooses among the rest (12 §3a)`);
        }
        const built = {
            slug,
            ...meta,
            owner: meta.owner ?? this.spec.meta.owner,
            values: [],
        };
        fn(new PresetBuilder(built));
        this.spec.presets.push(built);
        return this;
    }
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
    inlet(key, node, binding) {
        if (this.inletDone)
            throw new Error('a spec has exactly one inlet (01 §2) — .inlet() may be called once');
        if (this.spec.nodes.length > 0)
            throw new Error('the inlet must be the first node (01 §2)');
        if (binding) {
            if (!binding.event)
                throw new Error('an inlet binding names its event — { genre, event } (24 §4)');
            if (!binding.genre)
                throw new Error(`a spec answering '${binding.event}' must declare the genre it serves — ` +
                    `{ genre, event } (24 §4). Required for now; multi-genre opens later ` +
                    `without breaking this declaration.`);
            this.spec.input = { genre: genreIdOf(binding.genre), event: binding.event };
        }
        this.inletDone = true;
        return this.add('inlet', key, node);
    }
    // Clauses are inherited from ChainBuilder so they nest; re-declared here only so the
    // spine keeps offering .include() and .build() afterwards.
    gather(id, opts, fn) {
        return super.gather(id, opts, fn);
    }
    each(id, opts, fn) {
        return super.each(id, opts, fn);
    }
    loop(id, opts, fn) {
        return super.loop(id, opts, fn);
    }
    junction(id, opts, fn) {
        return super.junction(id, opts, fn);
    }
    /** Compile-time include — expanded here, so rows hold the flat chain (16 §3a). */
    include(key, fragment) {
        this.spec.includes.push({ key, fragmentId: fragment.id });
        for (const n of fragment.nodes) {
            this.spec.nodes.push({
                ...n,
                key: `${key}.${n.key}`,
                clauseId: n.clauseId ? `${key}.${n.clauseId}` : undefined,
                position: this.spec.nodes.length,
            });
        }
        for (const b of fragment.clauses) {
            this.spec.clauses.push({
                ...b,
                id: `${key}.${b.id}`,
                clauseId: b.clauseId ? `${key}.${b.clauseId}` : undefined,
                position: this.spec.nodes.length,
            });
        }
        return this;
    }
    build() {
        return this.spec;
    }
}
export function spec(id, meta) {
    return new SpecBuilder(id, meta);
}
export function fragment(id, fn) {
    const inner = {
        id,
        meta: { version: '0.0.0' },
        nodes: [],
        clauses: [],
        includes: [],
        presets: [],
    };
    fn(new ChainBuilder(inner));
    return { id, nodes: inner.nodes, clauses: inner.clauses };
}
export { ChainBuilder };
//# sourceMappingURL=builder.js.map