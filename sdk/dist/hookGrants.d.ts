/**
 * The grant table (plans 29 R-3): which members each kind of plugin hook finds
 * on its `ctx`. The ONE copy — the app's sandboxes derive every call's grants
 * from it, the boot check reads each kind's keys from it, an author's harness
 * builds its context from it, and the plugin permissions guide is rendered
 * from it (K1c). Nothing else in here, so the runtime can import it without
 * the test harness behind it.
 */
/**
 * The kinds of hook the host dispatches — the four node kinds a plugin may
 * implement, a chain link (a script kind's hook), an event listener and a
 * lifecycle callback.
 *
 * Spelled exactly as the app's `$lib/server/plugins/hookCtx.ts` spells it,
 * because it is the same table read by three things that must agree: each
 * sandbox's `invoke` derives its grants from it, the boot check reads the keys
 * per kind from it, and — now — an author's harness builds its context from it.
 * A fourth copy that disagreed would be the drift the boot check exists to
 * catch, so when the app's table moves this one moves with it.
 * @experimental
 */
export type HookCtxKind = 'task' | 'query' | 'oracle' | 'outlet' | 'chain-link' | 'event' | 'lifecycle';
/** @experimental */
export declare const HOOK_CTX_KINDS: readonly HookCtxKind[];
/** Which of the two permission-gated members a kind's context carries. @experimental */
export interface HookCtxGrants {
    /** The extension's own namespaced rows and files (`ctx.storage`). */
    storage: boolean;
    /** Host-scoped network access (`ctx.fetch`). */
    fetch: boolean;
}
/** @internal */
export declare function isHookCtxKind(v: unknown): v is HookCtxKind;
/**
 * The grants for a kind. An unknown kind is a programming error at the call
 * site — every caller names one — so it throws rather than defaulting: a
 * default in either direction is a grant nobody decided.
 * @experimental
 */
export declare function hookCtxGrants(kind: unknown): HookCtxGrants;
/**
 * The keys a hook of this kind finds on `ctx`, in the order the sandboxes
 * define them — what a test compares `Object.keys(ctx)` against.
 * @experimental
 */
export declare function hookCtxKeysFor(kind: HookCtxKind): string[];
//# sourceMappingURL=hookGrants.d.ts.map