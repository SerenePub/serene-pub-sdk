/**
 * Configuration resolution (12 §2). Five layers, first hit wins, evaluated
 * independently per path — which is what makes an admin's connection change reach a
 * user who has customized their prompts (F20).
 *
 * ## Why `instance` sits above `preset` (0.6 revision)
 *
 * The original order put the selected config above the instance layer, reading
 * `instance` as "the defaults a config sits on". That made an administrator's
 * live edit the one write in the system that could store cleanly and do
 * nothing: the shipped default config covers most paths, so an instance
 * override under it was permanently shadowed — found the day an admin changed
 * a budget on screen and the run kept using the config's number.
 *
 * The revised reading: a *named config* is a value source you select; an
 * *override* is a decision someone made on top of it. Overrides therefore
 * always beat the selected config, and among overrides the more specific
 * scope wins — chat, then user, then instance.
 *
 * `defaults` is the sixth scope the split forced into the open: values a host
 * *projects* — system settings, a legacy layer — rather than values anyone
 * decided. They sit under the selected config, which is where "defaults" have
 * always belonged; the old chain filed them under `instance` and the two
 * meanings of that word are exactly what shadowed the admin's edits. Nothing
 * interactive ever writes at `defaults` (it appears in no write matrix row);
 * `author` — the type's declared parameter defaults — stays the floor.
 *
 * Resolved run-wide *before* execution, which is why referencing another node's
 * config is not a data edge (F35).
 */
export const SCOPE_ORDER = ['session', 'user', 'instance', 'preset', 'defaults', 'author'];
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
 * @see normalizeSlotPath — accepts the two dead spellings, loudly.
 */
export const SLOT_VALUE = '';
/** Slots whose value is a row reference, not a structure. */
const REF_SLOTS = new Set(['connection', 'sampling']);
/** The two spellings that were never written by the panel but were read for. */
const LEGACY_SLOT_PATHS = new Set(['ref', '$ref']);
const warned = new Set();
/**
 * A ref slot's path, with the historical spellings folded in.
 *
 * Deliberately narrow: it applies only to `connection` and `sampling`, and only
 * to the two exact strings. A `sampling` slot legitimately carries *other* paths
 * — a node-level override of one sampler is stored at that sampler's own name —
 * and none of those is `ref` or `$ref`, so nothing real is captured by accident.
 *
 * It warns once per address rather than staying quiet, because the failure this
 * replaces was silent. A row that still needs migrating should say so.
 */
function normalizeSlotPath(slot, path) {
    if (!REF_SLOTS.has(slot) || !LEGACY_SLOT_PATHS.has(path))
        return path;
    const key = `${slot}:${path}`;
    if (!warned.has(key)) {
        warned.add(key);
        console.warn(`[config] a ${slot} slot value is stored at the legacy path '${path}'; ` +
            `reading it as '${SLOT_VALUE}'. Migration 0175 normalises these — ` +
            `if this appears after it has run, something is still writing the old address.`);
    }
    return SLOT_VALUE;
}
/** Test seam: the warn-once set is process-global by design. */
export function _resetSlotPathWarnings() {
    warned.clear();
}
/**
 * The endpoint half of a connection slot's value, or null when it names none.
 *
 * Returns the id **exactly as stored** — a string stays a string, a number
 * stays a number. Row ids belong to the host, and this package has no business
 * ruling that they are one or the other; the string/number divide is reconciled
 * where the comparison happens, not here.
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
        // Normalised as the address is formed, so this is the ONE chokepoint every
        // read passes through — a legacy spelling can never again resolve to its
        // own private address (see SLOT_VALUE).
        for (const r of rows) {
            const path = normalizeSlotPath(r.slot, r.path);
            addresses.set(`${r.slot}${SEP}${path}`, [r.slot, path]);
        }
        for (const [slot, path] of addresses.values()) {
            const candidates = rows.filter((r) => r.slot === slot && normalizeSlotPath(r.slot, r.path) === path);
            for (const scope of SCOPE_ORDER) {
                const hit = candidates.find((c) => c.scopeKind === scope);
                if (hit) {
                    node[slot] ??= {};
                    node[slot][path] = {
                        value: hit.value,
                        scopeKind: hit.scopeKind,
                        ...(hit.scopeId !== undefined ? { scopeId: hit.scopeId } : {}),
                    };
                    break;
                }
            }
        }
    }
    return out;
}
/** Effective config = base ⊕ overrides, per (nodeKey, slot, path). */
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
 * connection has no writable scope at chat/user, so an admin's choice reaches
 * everyone automatically.
 */
export const WRITE_MATRIX = {
    // `session` added 2026-08-26 so a chat may point at its own connection —
    // the per-session connection 0.5 had. Still admin-only in practice:
    // `visibleTo` shows the slot to admins alone and `resolveWriteScope`
    // refuses a non-admin every non-prompt write, so "credentials and compute
    // stay under admin control" holds by a different gate than the matrix.
    // This narrows F20's instance-only reading rather than dropping it: a
    // *preset* still may not carry a connection (it does not export), which is
    // the ruling's actual concern.
    connection: ['session', 'instance', 'preset'],
    sampling: ['session', 'user', 'preset', 'instance'],
    template: ['preset', 'instance'],
    // How a context variable is presented is a property of the instance's
    // configuration, not a personal preference: two users whose characters render
    // differently are two users whose bug reports cannot be compared. Same
    // scopes as `template`, which is the same decision one level up.
    variables: ['preset', 'instance'],
    prompts: ['session', 'user', 'preset', 'instance'],
    params: ['session', 'user', 'preset', 'instance'],
    settings: ['session', 'user', 'preset', 'instance'],
    // A chain changes what every run of the pipeline sends — the `variables`
    // argument one tier up: two users whose chains differ are two users whose
    // reports cannot be compared. Same scopes as `template`; widening to
    // chat/user later is one entry here, additively (18 §4a).
    scripts: ['preset', 'instance'],
};
export function mayWrite(slot, scope) {
    return (WRITE_MATRIX[slot] ?? []).includes(scope);
}
/** Reject a write the matrix forbids, with the reason (15 §1.3). */
export function assertWritable(slot, scope) {
    if (!mayWrite(slot, scope)) {
        throw new Error(`scope '${scope}' may not write slot '${slot}'. ` +
            `Allowed: ${(WRITE_MATRIX[slot] ?? ['(none)']).join(', ')}. ` +
            (slot === 'connection'
                ? 'Connections are admin-only so credentials and compute stay under admin control (12 §4).'
                : ''));
    }
}
//# sourceMappingURL=config.js.map