/**
 * The three hook kinds and their injected surfaces (01 §9, F10, F32).
 *
 * "Hook" is never used bare — the three kinds have different rules, and the rules are
 * enforced by *what is in the object*, not by a document someone reads. A capability
 * that isn't on the surface cannot be called, which is why these are types rather than
 * a checklist.
 */
// ── Conformance probes (03 §9) ──────────────────────────────────────────────
/**
 * Capability names no hook surface may carry, whatever the kind.
 *
 * Every one of these is a **handle back into the executor** — a way for a hook to
 * make core do work on its behalf rather than being the work core invoked. Only
 * pipeline hooks reach Providers, and they do it by *being* a node the executor
 * invokes, never by holding a handle; a hook that could call, trigger, run or emit
 * would have opted itself out of the receipt, the budget and the review gate that
 * being a node buys.
 *
 * That is the line, and it is narrower than "a hook may not reach outside itself".
 * `fetch` was on this list and is not any more: host-scoped network access is a
 * manifest-declared, admin-deniable grant with a consent surface (see
 * `HookFetchInit` and the docblock above it), so it is metered by the permission
 * model rather than by being kept off the surface. It buys no Provider access —
 * a hook that fetches a model API directly is still outside the receipt, and the
 * grant an admin reads is what says so.
 */
const FORBIDDEN_ON_ANY_HOOK = [
    'callProvider',
    'call',
    'provider',
    'trigger',
    'run',
    'emit',
];
/**
 * F32, checked rather than documented. The probe reads the surface an implementation
 * actually hands out — a regression that adds `callProvider` back fails here instead
 * of shipping.
 */
export function assertHookSurface(kind, surface) {
    const keys = new Set(Object.keys(surface));
    const found = FORBIDDEN_ON_ANY_HOOK.filter((k) => keys.has(k));
    // Kind-specific, so it cannot live in the list above: a lifecycle hook gets
    // scoped core *reads* and nothing else (13 §7c), so a `writeCore` beside its
    // `readCore` is the same regression one level down.
    if (kind === 'lifecycle' && keys.has('writeCore'))
        found.push('writeCore');
    return found.length ? { ok: false, found } : { ok: true };
}
/**
 * The scheduled-work path, stated as code so it is discoverable from the SDK rather
 * than only from 13 §7c.
 */
export const SCHEDULED_WORK_PATH = {
    instead: 'core:event/schedule-tick@1',
    because: 'a hook calling a Provider would opt out of the receipt, the budget and the review gate, ' +
        'and would not appear on the consent screen a user reads (F32, 11 §4)',
};
//# sourceMappingURL=hooks.js.map