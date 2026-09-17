/**
 * A handler's `input`, derived from the contract it is bound to.
 *
 * The ruling (2026-09-10): **handler input types are generated from the
 * contract.** A node handler's `input` is its type's own `ports.in` plus the
 * `params` slot's declared schema — so a declared field nothing reads is
 * *visible*, and a read of a name nothing declares is a **type error** rather
 * than a property access on `any` that is `undefined` at runtime and silent at
 * build.
 *
 * That failure is not hypothetical and it is not subtle in hindsight. Two core
 * bindings shipped reading names their own contract does not declare —
 * `input.topK` on `core:query/vector-search@1` (a *parameter*, at
 * `input.params.topK`, so the host ran on a literal `?? 40` for the mechanism's
 * whole life) and `input.limit` on `core:query/session-history@1` (the same
 * shape, the same silence). Each was found by hand, twice, after the fact.
 *
 * ## What is derivable and what is not
 *
 * **Port names, yes. Port values, no.** `ports.in` maps a port to a `ShapeId`,
 * which is a string id in a runtime registry with no TS payload behind it (see
 * src/shapes.ts), so there is nothing to derive a value type *from*. Ports
 * therefore carry `any` and the derivation's job is the set of **names**.
 *
 * **Parameter names and values, both.** A `parameters` slot declares a
 * `schema` of `FieldDecl`s, and a `FieldDecl` carries its `type` — so
 * `params.maxEntries` is a `number` because the declaration says `'integer'`,
 * and `params.strategy` is the union of its `of: [...]` choices. That is a real
 * static shape rather than a name check.
 *
 * ## Shared handlers stay structural
 *
 * One handler may serve several node types. Its input is then the
 * **intersection** of what those contracts supply — it may read only what
 * *every* one of them declares — which is what `SharedInput<[A, B]>` computes.
 * A handler is never coupled to one type id; it is coupled to a shape, and the
 * shape is checkable. `structuralCompat` in the host applies the same rule at
 * runtime, for a plugin binding to somebody else's type and for the pipeline
 * orchestrator composing nodes in the UI.
 *
 * @see src/descriptors.ts — why every `describe*` is generic over its slots
 */
/**
 * Attach a read declaration to a handler.
 *
 * ```ts
 * declaresReads(async (input: InputOf<typeof C.sessionHistory>, ctx) => …, {
 *   ports: ['scope'],
 *   params: ['limit', 'channel'],
 * })
 * ```
 *
 * Returns the same function object rather than a wrapper: a wrapper would
 * change the identity the executor's binding table holds, and one binding table
 * keyed by identity is how a shared handler is recognised as shared.
 */
export function declaresReads(hook, requires) {
    return Object.assign(hook, { requires });
}
/**
 * Attach a read declaration a contract has checked (ruling R-12, 2026-09-15).
 *
 * ```ts
 * reads<typeof C.sessionHistory>(
 *   async (input: InputOf<typeof C.sessionHistory>, ctx) => …,
 *   { ports: ['scope'], params: ['limit', 'channel'] },
 * )
 * ```
 *
 * The compile-time half of what `declaresReads` records at run time. `InputOf`
 * makes a read of an **undeclared** name a type error; this makes the
 * declaration name nothing `P` lacks — `params: ['limt']` does not compile.
 * The reverse direction (a declared name **no** handler reads) is the guard's
 * job, in the host, and it is what this declaration exists to feed.
 *
 * ⚠ **What this cannot check.** `P` is the contract the *declaration* is
 * narrowed against; the handler is a plain `Hook`, so nothing here proves the
 * handler's own `input` was typed against the same `P`. Pairing
 * `reads<typeof C.X>` with a handler whose input is `NodeInput<typeof C.X>` is
 * a **convention**, and the host keeps it by a test over the source of its
 * bindings files (`boot/readsPairing.test.ts`) rather than by the type system.
 *
 * `P` is written explicitly and the hook is a plain `Hook`, rather than both
 * inferred, because TypeScript infers all of a call's type arguments or none
 * — and the contract cannot be inferred from a handler whose `input` is an
 * intersection, an alias, or `any`.
 *
 * ⚠ **One declaration per function object.** Like `declaresReads` this attaches
 * to the hook itself rather than wrapping it, so a handler two pins share
 * carries ONE `requires` — and a second, different declaration on the same
 * function would silently replace the first. That is refused here: bind a
 * shared handler through a per-pin arrow (`(input, ctx) => shared(input, ctx)`)
 * when the two pins read differently, and declare the intersection when they
 * do not. An identical redeclaration is a no-op, on the registry's own terms.
 */
export function reads(hook, requires) {
    const plain = {
        ports: [...requires.ports],
        params: [...(requires.params ?? [])],
        ...(requires.paramTypes
            ? { paramTypes: requires.paramTypes }
            : {}),
    };
    const existing = readsOf(hook);
    if (existing && !sameRequires(existing, plain))
        throw new Error(`reads(): this handler already declares what it reads (ports ${JSON.stringify(existing.ports)}, params ${JSON.stringify(existing.params)}) and the new declaration differs ` +
            `(ports ${JSON.stringify(plain.ports)}, params ${JSON.stringify(plain.params)}). ` +
            `A declaration attaches to the function object, so a handler two pins share ` +
            `can carry only one — bind each pin through its own arrow and declare there.`);
    return declaresReads(hook, plain);
}
function sameRequires(a, b) {
    const sorted = (xs) => [...new Set(xs)].sort();
    const eq = (xs, ys) => {
        const [p, q] = [sorted(xs), sorted(ys)];
        return p.length === q.length && p.every((x, i) => x === q[i]);
    };
    if (!eq(a.ports, b.ports) || !eq(a.params, b.params))
        return false;
    const [ta, tb] = [a.paramTypes ?? {}, b.paramTypes ?? {}];
    const keys = sorted([...Object.keys(ta), ...Object.keys(tb)]);
    return keys.every((k) => ta[k] === tb[k]);
}
/** Does this hook carry a read declaration? */
export function readsOf(hook) {
    const r = hook?.requires;
    if (!r || typeof r !== 'object')
        return undefined;
    const { ports, params } = r;
    if (!Array.isArray(ports) || !Array.isArray(params))
        return undefined;
    return r;
}
// ── What a contract supplies (the runtime half of the other side) ───────────
/**
 * The names a contract puts on a handler's `input`, read off the descriptor at
 * run time.
 *
 * The runtime twin of `InputOf`, and the two are asserted to agree in
 * sdk-tests/nodeInput.assert.ts. It lives in the SDK rather than in core
 * because both sides of a plugin-to-plugin binding need the same answer, and a
 * second implementation on either side is a second answer.
 *
 * `SlotDecl` is imported for the shape of what is walked; nothing here reads a
 * slot's `kind` except to find the schema, because a schema is a schema
 * whatever the slot is called.
 */
export function suppliesOf(contract) {
    const d = descriptorOf(contract);
    const ports = [
        ...Object.keys((d?.ports?.in ?? {})),
        ...Object.keys((d?.slots ?? {})),
    ];
    const params = [];
    const paramTypes = {};
    for (const slot of Object.values((d?.slots ?? {})))
        for (const [name, field] of Object.entries((slot?.schema ?? {}))) {
            params.push(name);
            if (field?.type)
                paramTypes[name] = field.type;
        }
    return { id: d?.id ?? '(unknown type)', ports: [...new Set(ports)], params, paramTypes };
}
/** Unwrap the pinned form, tolerate a bare descriptor, refuse anything else. */
function descriptorOf(contract) {
    if (!contract || typeof contract !== 'object')
        return undefined;
    const c = contract;
    if (c.descriptor && typeof c.descriptor === 'object')
        return c.descriptor;
    if (typeof c.id === 'string' && c.ports)
        return contract;
    return undefined;
}
//# sourceMappingURL=nodeInput.js.map