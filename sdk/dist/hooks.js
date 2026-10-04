/**
 * The three kinds of extension callable and their injected surfaces (01 §9, F10, F32).
 *
 * A **hook** is a declared point where authored code may run (NOMENCLATURE §12); the
 * three callables are named for what they are (R-1, ruled 2026-09-14): a **handler**
 * implements a node definition, a **lifecycle callback** answers a core moment, an
 * **event listener** answers a core event. 01's *pipeline hook* / *lifecycle hook* /
 * *event hook* are the same three under the old word; the code moved 2026-09-16 (U3).
 *
 * The rules are enforced by *what is in the object*, not by a document someone reads.
 * A capability that isn't on the surface cannot be called, which is why these are
 * types rather than a checklist.
 */
/**
 * The moments a lifecycle callback may be registered against:
 *
 * - `startup` — at boot, before the ready-gate opens.
 * - `load` — declared, and not called yet (INTEGRATING.md §5c, Gaps).
 * - `enable` — after the plugin is switched on.
 * - `disable` — before it is switched off. Bounded; a failure never stops the switch.
 * - `update` — once, after a reinstall replaced its bundle, on the new bundle's
 *   first run. Its input is {@link LifecycleUpdateInput}.
 * - `uninstall` — before its rows and files are removed. Bounded.
 * - `shutdown` — during the app's graceful shutdown. Bounded; never holds up exit.
 *
 * Every moment runs with the lifecycle grants and the lifecycle timeout, and a
 * callback that throws or overruns is logged and recorded, never fatal.
 *
 * `sidecarSpawn` and `scheduled` were declared here once and never called.
 * They are gone until something needs them, and the plugin compiler refuses a
 * callback that names either one (`E_LIFECYCLE_MOMENT_UNSUPPORTED`). Scheduled
 * work subscribes to `core:event/schedule-tick@1` ({@link SCHEDULED_WORK_PATH}).
 * @experimental
 */
export const LIFECYCLE_MOMENTS = [
    'load',
    'startup',
    'shutdown',
    'enable',
    'disable',
    'update',
    /**
     * The extension is being removed. Its last chance to clean up.
     *
     * Without this there was no such chance, and combined with a storage API
     * that had no delete, an uninstalled extension's data was immortal — the
     * same orphan problem the media cleanup tool exists to solve, one layer up.
     *
     * Best-effort by construction: the host removes the extension's namespace
     * afterwards regardless, so a hook that throws, hangs or was never
     * registered costs nothing. It exists for the work core *cannot* do on an
     * extension's behalf — retiring a sidecar's external state, revoking a
     * token it issued — not for deleting its own rows.
     */
    'uninstall',
];
// ── Conformance probes (03 §9) ──────────────────────────────────────────────
/**
 * Capability names no hook surface may carry, whatever the kind.
 *
 * Every one of these is a **handle back into the executor** — a way for a hook to
 * make core do work on its behalf rather than being the work core invoked. Only
 * handlers reach oracles, and they do it by *being* a node the executor
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
// Member NAMES a surface must not hand out — not kind words, so `provider`
// is right here after the U3 rename (`oracle` is the kind; a surface member
// called `provider` would still be a model door and is still forbidden).
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
 * @experimental
 */
export function assertHookSurface(kind, surface) {
    const keys = new Set(Object.keys(surface));
    const found = FORBIDDEN_ON_ANY_HOOK.filter((k) => keys.has(k));
    // Kind-specific, so it cannot live in the list above: a lifecycle callback runs
    // at core's own moments (boot, enable, uninstall), where a write to core's
    // tables would be a migration nobody reviewed (13 §7c).
    if (kind === 'lifecycle' && keys.has('writeCore'))
        found.push('writeCore');
    return found.length ? { ok: false, found } : { ok: true };
}
/**
 * The scheduled-work path, stated as code so it is discoverable from the SDK rather
 * than only from 13 §7c.
 * @experimental
 */
export const SCHEDULED_WORK_PATH = {
    instead: 'core:event/schedule-tick@1',
    because: 'a hook calling a Provider would opt out of the receipt, the budget and the review gate, ' +
        'and would not appear on the consent screen a user reads (F32, 11 §4)',
};
//# sourceMappingURL=hooks.js.map