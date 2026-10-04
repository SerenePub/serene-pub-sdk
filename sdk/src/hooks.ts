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

import type { Result } from './executor.js'
import type { ExtensionStorage } from './storage.js'

/**
 * Log severities.
 *
 * Was `'info' | 'warn'`, which left an extension no way to say a thing had
 * actually failed — so failures were logged as warnings and became invisible in
 * exactly the situation a log exists for. `debug` is the other half of the same
 * problem: without it, authors log at `info` and users get noise.
 * @experimental
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

// ── Handler — the callable implementing a node definition ───────────────────

/**
 * Data in, expected shape out; the executor is the only caller. Private = only the
 * owning extension's specs may pin it. Public = any spec may, which is how peer
 * composition happens — as a node on the spine, never a peer call mid-run (F10).
 *
 * Both are enumerated in the manifest. Listing private ones costs nothing and the
 * manifest is already the audit surface, since permissions are compiled from SDK
 * usage (13 §7c).
 * @experimental
 */
export interface HandlerRules {
	kind: 'pipeline'
	definitionId: string
	visibility: 'private' | 'public'
}

// ── Mediated network — the one capability that is a grant, not a given ──────

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
 * @experimental
 */
export interface HookFetchInit {
	/** HTTP method. Defaults to GET. */
	method?: string
	/** Headers as a plain object. Dropped on a cross-origin redirect hop, so an
	 *  `Authorization` header never rides to a host the author did not address. */
	headers?: Record<string, string>
	/** Body, sent as text. */
	body?: string
	/** Deliberately absent: `signal` — cancellation is `ctx.signal`, and the host
	 *  refuses any request started after it fires, including the next hop of a
	 *  redirect chain. Also absent: `redirect`, `credentials`, `mode`, `cache` —
	 *  the host owns redirect-following because that is where the allowlist is
	 *  re-checked. */
}

/**
 * What `ctx.fetch` resolves to: the response flattened to plain data.
 *
 * **Not** a web `Response` — nothing live crosses the sandbox boundary, so there
 * is no `.json()`, no `.text()`, no body stream and no `Headers` instance. The
 * body has already been read for you.
 * @experimental
 */
export interface HookFetchResponse {
	status: number
	/** `status` in 200–299, precomputed the way `Response.ok` is. */
	ok: boolean
	/** Response headers flattened to a plain object, names lower-cased. */
	headers: Record<string, string>
	/** The whole response body, already read as text. Parse it yourself. */
	body: string
}

// ── Event listener — registered against a core event ────────────────────────

/**
 * What arrives as an event listener's **first argument**.
 *
 * An envelope rather than the bare payload, because one exported hook may be
 * subscribed to more than one event — the manifest's `eventHooks` is a list of
 * subscriptions, not a map — so a hook that could not tell which occurrence it
 * was answering would need one export per event to find out.
 * @experimental
 */
export interface EventListenerInput<T = unknown> {
	/** The event that fired, exactly as the subscription pinned it. */
	event: string
	/**
	 * The occurrence, snapshotted at emit time (11 §3) — a hook never reads live
	 * state through this.
	 *
	 * Read-only in the sense that matters: mutating it, or returning something
	 * else in its place, changes nothing for the subscribers after you and
	 * nothing for the action that emitted it. An event states what happened.
	 */
	payload: T
}

/**
 * What an event listener finds on `ctx`: exactly the members the grant table
 * (`hookGrants.ts`) gives the `event` kind — the base four and storage. No
 * network: `ctx.fetch` is an oracle's alone, and a listener that needs the
 * network asks an oracle to do it as a node.
 * @experimental
 */
export interface EventListenerSurface {
	/** A deterministic stream per call. `Math.random` is frozen in the SES
	 *  sandbox, so this is the only randomness a listener has. */
	random(): number
	/** The fan-out's pinned clock: every listener of one occurrence reads the
	 *  same instant. Use it instead of `Date.now()`. */
	now(): number
	log(level: LogLevel, message: string, detail?: unknown): void
	/** The extension's own rows and files — query, write, delete, and ask how
	 *  much room is left. See storage.ts for why all four are needed. */
	storage: ExtensionStorage
	signal: AbortSignal
	/** Deliberately absent: callProvider (F32), trigger (F10), fetch — an
	 *  event listener is told what happened, and network access is an oracle's
	 *  grant. Also absent: any way to read the occurrence off this object. It
	 *  arrives as argument 0 (see `EventListenerInput`), which is what both
	 *  sandboxes have always passed. */
}

// ── Lifecycle callback — core-invoked at defined moments ────────────────────

/**
 * What a lifecycle callback finds on `ctx`: exactly the members the grant table
 * (`hookGrants.ts`) gives the `lifecycle` kind — the base four and storage, the
 * same as an event listener's.
 *
 * Absent, and for one reason: a lifecycle callback may not call a Provider and
 * may not trigger a pipeline, so **scheduled model work subscribes to
 * `core:event/schedule-tick@1` instead** — which gets it a receipt, a budget and
 * the review gate, and puts it on the consent screen. A lifecycle callback doing
 * that work would have had none of the four.
 * @experimental
 */
export interface LifecycleCallbackSurface {
	/** A deterministic stream per call — see {@link EventListenerSurface.random}. */
	random(): number
	/** The call's pinned clock — see {@link EventListenerSurface.now}. */
	now(): number
	log(level: LogLevel, message: string, detail?: unknown): void
	/** The extension's own rows and files. */
	storage: ExtensionStorage
	signal: AbortSignal
	/** Deliberately absent: callProvider (F32), trigger (F10), fetch (an
	 *  oracle's grant), and any read or write of core's tables. */
}

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
] as const

/** One of {@link LIFECYCLE_MOMENTS}. @experimental */
export type LifecycleMoment = (typeof LIFECYCLE_MOMENTS)[number]

/**
 * What the `update` moment's callback is sent: the version its bundle replaced
 * and the version now running. Every other moment is sent an empty object.
 * @experimental
 */
export interface LifecycleUpdateInput {
	previousVersion: string
	version: string
}

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
 * @experimental
 */
export type EventListener = (input: EventListenerInput, ctx: EventListenerSurface) => Result | Promise<Result>

/**
 * A core-invoked lifecycle callback: **`(input, ctx)`**, like every other callable.
 *
 * `ctx` is the surface above — argument **1**, not argument 0. This was typed
 * for a while as taking the surface alone, while both sandboxes called it
 * `__fn(__input, ctx)` exactly as they call every other hook; an author who
 * followed the type read `storage` and `log` off the input envelope and found
 * neither. The same defect `EventListener` carried, fixed the same way and in the
 * same direction — towards what the runtimes have always done.
 *
 * `input` is typed `unknown` because it depends on the moment: `update` is sent
 * a {@link LifecycleUpdateInput}, and every other moment an empty object. The
 * moment itself is not in it — a hook is registered *against* a moment, so it
 * already knows which one it is. Deliberately not given a shape it does not
 * have; that is the mistake this signature exists to undo.
 * @experimental
 */
export type LifecycleCallback = (input: unknown, ctx: LifecycleCallbackSurface) => Result | Promise<Result>

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
] as const

/**
 * F32, checked rather than documented. The probe reads the surface an implementation
 * actually hands out — a regression that adds `callProvider` back fails here instead
 * of shipping.
 * @experimental
 */
export function assertHookSurface(
	kind: 'event' | 'lifecycle',
	surface: object,
): { ok: true } | { ok: false; found: string[] } {
	const keys = new Set(Object.keys(surface))
	const found: string[] = FORBIDDEN_ON_ANY_HOOK.filter((k) => keys.has(k))
	// Kind-specific, so it cannot live in the list above: a lifecycle callback runs
	// at core's own moments (boot, enable, uninstall), where a write to core's
	// tables would be a migration nobody reviewed (13 §7c).
	if (kind === 'lifecycle' && keys.has('writeCore')) found.push('writeCore')
	return found.length ? { ok: false, found } : { ok: true }
}

/**
 * The scheduled-work path, stated as code so it is discoverable from the SDK rather
 * than only from 13 §7c.
 * @experimental
 */
export const SCHEDULED_WORK_PATH = {
	instead: 'core:event/schedule-tick@1',
	because:
		'a hook calling a Provider would opt out of the receipt, the budget and the review gate, ' +
		'and would not appear on the consent screen a user reads (F32, 11 §4)',
} as const
