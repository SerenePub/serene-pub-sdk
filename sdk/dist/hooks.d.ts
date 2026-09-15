/**
 * The three hook kinds and their injected surfaces (01 §9, F10, F32).
 *
 * "Hook" is never used bare — the three kinds have different rules, and the rules are
 * enforced by *what is in the object*, not by a document someone reads. A capability
 * that isn't on the surface cannot be called, which is why these are types rather than
 * a checklist.
 */
import type { Result } from './executor.js';
import type { ExtensionStorage } from './storage.js';
/**
 * Log severities.
 *
 * Was `'info' | 'warn'`, which left an extension no way to say a thing had
 * actually failed — so failures were logged as warnings and became invisible in
 * exactly the situation a log exists for. `debug` is the other half of the same
 * problem: without it, authors log at `info` and users get noise.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
/**
 * Scoped reads of core tables.
 *
 * Typed as a query rather than `unknown` so a host can validate it, and
 * paginated because the previous signature had no answer at all for a table
 * with a hundred thousand rows — an extension either got everything or wrote
 * its own windowing on top of a call that could not window.
 */
export interface CoreQuery {
    /** Column filters, ANDed. Values are compared for equality. */
    where?: Record<string, unknown>;
    limit?: number;
    cursor?: string;
    order?: {
        column: string;
        direction?: 'asc' | 'desc';
    };
}
export interface CorePage<T = unknown> {
    rows: T[];
    nextCursor?: string;
}
/**
 * Data in, expected shape out; the executor is the only caller. Private = only the
 * owning extension's specs may pin it. Public = any spec may, which is how peer
 * composition happens — as a node on the spine, never a peer call mid-run (F10).
 *
 * Both are enumerated in the manifest. Listing private ones costs nothing and the
 * manifest is already the audit surface, since permissions are compiled from SDK
 * usage (13 §7c).
 */
export interface PipelineHookRules {
    kind: 'pipeline';
    typeId: string;
    visibility: 'private' | 'public';
}
/**
 * `ctx.fetch` is **permissioned**, and unlike everything else on a hook surface
 * it can be absent at runtime even though the type says it is there.
 *
 * The manifest must declare a host allowlist — `permissions.network.hosts`, each
 * entry an exact host, a `*.suffix` / bare `*` wildcard, optionally pinned to a
 * `:port` — and the packager refuses a `network` declaration with no hosts. Install
 * stores that declaration; an **admin reviews it host by host** and can deny any
 * single one without killing the rest, so the allowlist the host enforces is the
 * *effective* grant (declared − denied), never the manifest. A hook that declared
 * nothing, or whose hosts were all denied, gets a `ctx.fetch` that refuses every
 * call — the capability is never ambient.
 *
 * The host, not the guest, enforces: http(s) only; the host must match the
 * allowlist and (for a bare host or wildcard) use a default web port; redirects
 * are followed by the host and **re-checked at every hop**; a name that resolves
 * to a loopback/private/link-local address is refused unless an admin allowlisted
 * that IP literal or `localhost` outright; and no request may *start* after
 * `ctx.signal` fires. Every refusal throws — none of them come back as a response.
 *
 * Two further facts an author needs before reaching for it:
 *  - **It is async**, and therefore SES-only. A plugin pinned to the QuickJS
 *    backend gets a `ctx.fetch` that throws "network (fetch) requires the SES
 *    backend", the same way a WebAssembly plugin is SES-only.
 *  - **It is not a way to call a model.** Model work belongs to a Provider node,
 *    which is what gets it a receipt, a budget and the review gate; see
 *    `SCHEDULED_WORK_PATH` and the forbidden list below.
 */
/**
 * Request options for `ctx.fetch` — the JSON-serializable subset of `RequestInit`
 * the host actually reads, and deliberately not `RequestInit` itself: the options
 * cross the sandbox boundary as JSON, so a `Headers`, a `Blob`, a `FormData`, a
 * stream or an `AbortSignal` cannot make the trip. A field not named here is
 * dropped in transit rather than honoured, which is why they are not typed as
 * accepted.
 */
export interface HookFetchInit {
    /** HTTP method. Defaults to GET. */
    method?: string;
    /** Headers as a plain object. Dropped on a cross-origin redirect hop, so an
     *  `Authorization` header never rides to a host the author did not address. */
    headers?: Record<string, string>;
    /** Body, sent as text. */
    body?: string;
}
/**
 * What `ctx.fetch` resolves to: the response flattened to plain data.
 *
 * **Not** a web `Response` — nothing live crosses the sandbox boundary, so there
 * is no `.json()`, no `.text()`, no body stream and no `Headers` instance. The
 * body has already been read for you.
 */
export interface HookFetchResponse {
    status: number;
    /** `status` in 200–299, precomputed the way `Response.ok` is. */
    ok: boolean;
    /** Response headers flattened to a plain object, names lower-cased. */
    headers: Record<string, string>;
    /** The whole response body, already read as text. Parse it yourself. */
    body: string;
}
/**
 * What arrives as an event hook's **first argument**.
 *
 * An envelope rather than the bare payload, because one exported hook may be
 * subscribed to more than one event — the manifest's `eventHooks` is a list of
 * subscriptions, not a map — so a hook that could not tell which occurrence it
 * was answering would need one export per event to find out.
 */
export interface EventHookInput<T = unknown> {
    /** The event that fired, exactly as the subscription pinned it. */
    event: string;
    /**
     * The occurrence, snapshotted at emit time (11 §3) — a hook never reads live
     * state through this.
     *
     * Read-only in the sense that matters: mutating it, or returning something
     * else in its place, changes nothing for the subscribers after you and
     * nothing for the action that emitted it. An event states what happened.
     */
    payload: T;
}
export interface EventHookSurface {
    /** The extension's own rows and files — query, write, delete, and ask how
     *  much room is left. See storage.ts for why all four are needed. */
    storage: ExtensionStorage;
    log(level: LogLevel, message: string, detail?: unknown): void;
    signal: AbortSignal;
    /** Host-scoped network access — present in the type, but only usable for the
     *  hosts the manifest declared and an admin left granted, and only on the SES
     *  backend. See the section docblock above for the grant and its refusals. */
    fetch(url: string, init?: HookFetchInit): Promise<HookFetchResponse>;
    /** Deliberately absent: callProvider (F32), trigger (F10), readCore — an
     *  event hook is told what happened; reading the rest of the instance is
     *  the lifecycle surface's privilege, and widening this one would make
     *  every event subscription a database grant. Also absent: any way to read
     *  the occurrence off this object. It arrives as argument 0 (see
     *  `EventHookInput`), which is what both sandboxes have always passed. */
    /** @deprecated use `storage.get` / `storage.query`. */
    readOwnRows?(key?: string): unknown;
    /** @deprecated use `storage.put`, which reports quota instead of dropping. */
    writeOwnRows?(key: string, value: unknown): void;
}
/**
 * Scoped core reads, plus read/write on the extension's own namespaced rows. Nothing
 * else (13 §7c).
 *
 * Two absences, and they are the same absence for the same reason. A lifecycle hook
 * may not call a Provider and may not trigger a pipeline, so **scheduled model work
 * subscribes to `core:event/schedule-tick@1` instead** — which gets it a receipt, a
 * budget and the review gate, and puts it on the consent screen. A lifecycle hook
 * doing that work would have had none of the four.
 */
export interface LifecycleHookSurface {
    readCore<T = unknown>(table: string, q?: CoreQuery): Promise<CorePage<T>>;
    storage: ExtensionStorage;
    log(level: LogLevel, message: string, detail?: unknown): void;
    signal: AbortSignal;
    /** Host-scoped network access — same grant, same refusals, same SES-only
     *  restriction as the event surface's. See the section docblock above. */
    fetch(url: string, init?: HookFetchInit): Promise<HookFetchResponse>;
    /** Deliberately absent: callProvider (F32), trigger (F10), writeCore. */
    /** @deprecated use `storage.get` / `storage.query`. */
    readOwnRows?(key?: string): unknown;
    /** @deprecated use `storage.put`, which reports quota instead of dropping. */
    writeOwnRows?(key: string, value: unknown): void;
}
export type LifecycleMoment = 'load' | 'startup' | 'shutdown' | 'enable' | 'disable' | 'update' | 'sidecarSpawn' | 'scheduled'
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
 | 'uninstall';
/**
 * A subscriber to a core event: **`(input, ctx)`**, like every other hook.
 *
 * `input` is the envelope above and `ctx` is the surface — the two arguments
 * both sandboxes have always called a hook with. It was typed for a while as
 * taking the surface alone, with the occurrence read back off it through a
 * `readEvent()` method no runtime ever endowed; an author who followed that
 * type called a function that was not there.
 *
 * ## Many hooks may register against one event
 *
 * A subscription is one entry in the manifest's `eventHooks` list, so several
 * extensions — and several of one extension's hooks — can answer the same
 * occurrence. Three things follow, and an author should know all three:
 *
 *  - **You are isolated.** Throwing, overrunning or being stopped costs you
 *    your own call and nothing else: no sibling's result changes, no sibling's
 *    storage rolls back with yours, and the action that caused the event still
 *    succeeds (01 §9c).
 *  - **You cannot rely on order, and you cannot rely on being alone.** Dispatch
 *    order is **declaration order** — the order you wrote your own
 *    subscriptions in, tie-broken across extensions by plugin id — so a bug
 *    reproduces, but nothing about completion order is promised (11 §3). There
 *    is no `priority` to raise: it would promise a sequencing core declines to
 *    give, and be its own collision the moment two extensions claimed one
 *    number.
 *  - **Your return is ignored.** Delivery is fire-and-forget, so there is no
 *    opt-in that would let your return rewrite what a sibling — or the action
 *    that emitted the event — is given. Transforming a value is what a script
 *    chain and a pipeline node hook are for.
 *
 * Returning `halt(reason)` is the normal way to say "not applicable to me", and
 * is a success rather than a failure (11 §3).
 */
export type EventHook = (input: EventHookInput, ctx: EventHookSurface) => Result | Promise<Result>;
/**
 * A core-invoked lifecycle hook: **`(input, ctx)`**, like every other hook.
 *
 * `ctx` is the surface above — argument **1**, not argument 0. This was typed
 * for a while as taking the surface alone, while both sandboxes called it
 * `__fn(__input, ctx)` exactly as they call every other hook; an author who
 * followed the type read `storage` and `log` off the input envelope and found
 * neither. The same defect `EventHook` carried, fixed the same way and in the
 * same direction — towards what the runtimes have always done.
 *
 * `input` is typed `unknown` because core sends no envelope worth reading: the
 * one moment it invokes today (`startup`) passes an empty object, and the
 * moment is not in it — a hook is registered *against* a moment, so it already
 * knows which one it is. Deliberately not given a shape it does not have; that
 * is the mistake this signature exists to undo.
 */
export type LifecycleHook = (input: unknown, ctx: LifecycleHookSurface) => Result | Promise<Result>;
/**
 * F32, checked rather than documented. The probe reads the surface an implementation
 * actually hands out — a regression that adds `callProvider` back fails here instead
 * of shipping.
 */
export declare function assertHookSurface(kind: 'event' | 'lifecycle', surface: object): {
    ok: true;
} | {
    ok: false;
    found: string[];
};
/**
 * The scheduled-work path, stated as code so it is discoverable from the SDK rather
 * than only from 13 §7c.
 */
export declare const SCHEDULED_WORK_PATH: {
    readonly instead: 'core:event/schedule-tick@1';
    readonly because: string;
};
//# sourceMappingURL=hooks.d.ts.map