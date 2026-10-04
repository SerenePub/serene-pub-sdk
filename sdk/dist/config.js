/**
 * Configuration resolution (12 §2). Four layers, first hit wins, evaluated
 * independently per path — which is what makes an admin's connection change reach a
 * user who has customized their prompts (F20).
 *
 * ## The chain (R-10, ruled 2026-09-15; 09-B B8)
 *
 * **`session · config · defaults · author`.**
 *
 *  - `session` — a session's own override of a value (the *chat override* of
 *    12 §2's "pipeline → config → chat override").
 *  - `config` — the rows of the **selected config**: the config IS the
 *    instance's tuning. An administrator's edit lands in the config (ruled
 *    2026-08-24), so there is no separate `instance` layer for it to be shadowed
 *    by, and no `user` layer — a preference that differs per user is a session's
 *    to hold.
 *  - `defaults` — values a host *projects* rather than values anyone decided:
 *    system settings, connection defaults, a legacy layer. Nothing interactive
 *    writes here (it appears in no write matrix row).
 *  - `author` — the definition's declared parameter defaults; the floor.
 *
 * `user` and `instance` stood in this list until 2026-09-16 and were pushed by
 * nothing: `world.ts` never projected a row at either (plans/29a §3). Their
 * semantics fold into `config` — the config an admin edits is the instance's
 * configuration — which is the 2026-08-24 ruling stated as a constant.
 *
 * Resolved run-wide *before* execution, which is why referencing another node's
 * config is not a data edge (F35).
 *
 * ## `config`, not `preset` (R1)
 *
 * Two other things are called a preset — a **session preset** (the bundle a
 * session is born on) and an author's `.preset(…)` on a spec — and neither is
 * this layer, so the scope takes the canon's word for what it holds: the
 * **config**.
 */
/** @internal */
export const SCOPE_ORDER = ['session', 'config', 'defaults', 'author'];
/**
 * A row's scope kind. Anything that is not a `ScopeKind` is `undefined` — a
 * row at a scope nobody resolves at, which resolution skips rather than
 * guesses about.
 * @experimental 🚧
 */
export function scopeKindOf(raw) {
    return SCOPE_ORDER.includes(raw) ? raw : undefined;
}
/**
 * The path a REF slot's single value lives at.
 *
 * A `connection` or `sampling` slot holds exactly one thing — the id of a row in
 * its own table — so it has no sub-paths and its address is the empty one.
 *
 * This constant exists because that fact was written down three different ways
 * and the three never met. The panel wrote `''`, the app's legacy projection
 * wrote `'ref'`, and this file's own executor read `'$ref'`; resolution below is
 * exact-match on `(nodeKey, slot, path)`, so the three were unrelated addresses
 * that could never collide and never warn. A pick made in the config panel was
 * saved, shown back, and read by nobody — for as long as the feature has existed.
 *
 * `''` is the winner because it is what the writer already emits, so it is what
 * is already in every user's `pipeline_config_values`. Any other choice would
 * migrate live data to match a convention only the reader believed in.
 *
 * @internal
 */
export const SLOT_VALUE = '';
/**
 * The endpoint half of a connection slot's value, or null when it names none.
 *
 * Returns the id **exactly as stored** — a string stays a string, a number
 * stays a number. Row ids belong to the host, and this package has no business
 * ruling that they are one or the other; the string/number divide is reconciled
 * where the comparison happens, not here.
 * @internal
 */
export function slotConnectionId(value) {
    if (typeof value === 'number')
        return Number.isFinite(value) ? value : null;
    if (typeof value === 'string')
        return value === '' ? null : value;
    if (value && typeof value === 'object') {
        const o = value;
        const inner = o.ref ?? o.id;
        if (typeof inner === 'number')
            return Number.isFinite(inner) ? inner : null;
        if (typeof inner === 'string')
            return inner === '' ? null : inner;
    }
    return null;
}
/**
 * The model half of a connection slot's value, or null when it names no model.
 *
 * Null for every value written before the pair existed, which is the whole
 * compatibility story — and null is *absence*, never a model the endpoint is
 * taken to mean. Same id-type rule as {@link slotConnectionId}: stored as
 * given, back as stored.
 * @internal
 */
export function slotConnectionModelId(value) {
    if (!value || typeof value !== 'object')
        return null;
    const inner = value.modelId;
    if (typeof inner === 'number')
        return Number.isFinite(inner) ? inner : null;
    if (typeof inner === 'string')
        return inner === '' ? null : inner;
    return null;
}
/**
 * Effective config **with provenance** = base ⊕ overrides, per (nodeKey, slot, path).
 *
 * This is the primitive; `resolveConfig` is derived from it rather than written
 * beside it. Two implementations of a five-layer walk are two implementations
 * that eventually disagree about which layer wins — and the one that disagrees
 * silently is whichever one the UI is not using.
 * @internal
 */
export function resolveConfigSources(world, nodeKeys) {
    const out = {};
    for (const nodeKey of nodeKeys) {
        const node = {};
        out[nodeKey] = node;
        const author = world.authorDefaults?.[nodeKey] ?? {};
        for (const [slot, paths] of Object.entries(author))
            for (const [path, value] of Object.entries(paths)) {
                node[slot] ??= {};
                node[slot][path] = { value, scopeKind: 'author' };
            }
        const rows = world.overrides.filter((o) => o.nodeKey === nodeKey);
        // Addressed by the pair itself, and keyed on a separator no path can
        // contain. Grouping on `${slot} ${path}` and splitting the pair back out
        // made a declared field named `opening line` resolve against the path
        // `opening`, so it matched nothing — silently, for whoever declared it.
        // No core path has a space in it; nothing stops a plugin's from having one.
        //
        // `\u0000` as an escape, deliberately, rather than the raw NUL byte the
        // first fix used: a literal NUL in a source file makes git classify it as
        // binary, so `git diff` emits "Binary files differ" and a patch generated
        // without `--binary` carries no content at all. That is how the previous
        // version of this fix was lost in transit.
        const SEP = '\u0000';
        const addresses = new Map();
        for (const r of rows)
            addresses.set(`${r.slot}${SEP}${r.path}`, [r.slot, r.path]);
        for (const [slot, path] of addresses.values()) {
            const candidates = rows.filter((r) => r.slot === slot && r.path === path);
            for (const scope of SCOPE_ORDER) {
                const hit = candidates.find((c) => scopeKindOf(c.scopeKind) === scope);
                if (hit) {
                    node[slot] ??= {};
                    node[slot][path] = {
                        value: hit.value,
                        scopeKind: scope,
                        ...(hit.scopeId !== undefined ? { scopeId: hit.scopeId } : {}),
                    };
                    break;
                }
            }
        }
    }
    return out;
}
/** Effective config = base ⊕ overrides, per (nodeKey, slot, path). @internal */
export function resolveConfig(world, nodeKeys) {
    const out = {};
    for (const [nodeKey, slots] of Object.entries(resolveConfigSources(world, nodeKeys))) {
        const node = {};
        out[nodeKey] = node;
        for (const [slot, paths] of Object.entries(slots)) {
            node[slot] = {};
            for (const [path, resolved] of Object.entries(paths))
                node[slot][path] = resolved.value;
        }
    }
    return out;
}
/**
 * Which scopes may write which slot (12 §4). The admin cascade needs no mechanism:
 * connection has no writable scope below the config for a non-admin, so an
 * admin's choice reaches everyone automatically.
 *
 * `config` here is the selected config — the one place an administrator's
 * edit lands (R-10 folded `instance` into it, 2026-09-16). A slot a session may
 * not write is a slot only the config carries.
 * @internal
 */
export const WRITE_MATRIX = {
    // A session names no connection (ruled 2026-09-30): the pair a step runs
    // on is the pipeline configuration's, or the instance default, so the
    // only scope that may write it is `config` — an admin's edit to the
    // configuration itself. What a session tunes is `sampling` and `prompts`.
    // ⚠ An AUTHOR preset (12 §3a, `PresetBuilder`) still may not carry a
    // connection — it does not export — which is F20's actual concern; that
    // refusal is `PresetBuilder`'s deliberate absence of `.connection()`.
    connection: ['config'],
    sampling: ['session', 'config'],
    template: ['config'],
    // How a context variable is presented is a property of the instance's
    // configuration, not a personal preference: two users whose characters render
    // differently are two users whose bug reports cannot be compared. Same
    // scopes as `template`, which is the same decision one level up.
    variables: ['config'],
    prompts: ['session', 'config'],
    params: ['session', 'config'],
    settings: ['session', 'config'],
    // A chain changes what every run of the pipeline sends — the `variables`
    // argument one tier up: two users whose chains differ are two users whose
    // reports cannot be compared. Same scopes as `template`; widening to
    // session later is one entry here, additively (18 §4a).
    scripts: ['config'],
};
/** @internal */
export function mayWrite(slot, scope) {
    const kind = scopeKindOf(scope);
    return kind !== undefined && (WRITE_MATRIX[slot] ?? []).includes(kind);
}
/** Reject a write the matrix forbids, with the reason (15 §1.3). @experimental */
export function assertWritable(slot, scope) {
    if (!mayWrite(slot, scope)) {
        throw new Error(`scope '${scope}' may not write slot '${slot}'. ` +
            `Allowed: ${(WRITE_MATRIX[slot] ?? ['(none)']).join(', ')}. ` +
            (slot === 'connection'
                ? scope === 'session'
                    ? 'A session never picks its own connection: it runs on the pair its pipeline configuration names, or the pub default. Change it in Pipelines.'
                    : 'Connections are admin-only so credentials and compute stay under admin control (12 §4).'
                : ''));
    }
}
//# sourceMappingURL=config.js.map