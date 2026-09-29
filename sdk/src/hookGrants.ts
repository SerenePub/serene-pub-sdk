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
export type HookCtxKind = 'task' | 'query' | 'oracle' | 'outlet' | 'chain-link' | 'event' | 'lifecycle'

/** @experimental */
export const HOOK_CTX_KINDS: readonly HookCtxKind[] = [
	'task',
	'query',
	'oracle',
	'outlet',
	'chain-link',
	'event',
	'lifecycle',
]

/** Which of the two permission-gated members a kind's context carries. @experimental */
export interface HookCtxGrants {
	/** The extension's own namespaced rows and files (`ctx.storage`). */
	storage: boolean
	/** Host-scoped network access (`ctx.fetch`). */
	fetch: boolean
}

/**
 * The table.
 *
 *  - **task**, **chain-link** — neither. A task is pure (F11) and a chain link
 *    is a script: the in-app script host hands one `{ random, log }` and a
 *    plugin's link gets the same.
 *  - **query**, **outlet**, **event**, **lifecycle** — storage. F32: an
 *    extension's own rows, no network.
 *  - **oracle** — storage and fetch. The one kind that calls out, which is what
 *    `effects: 'external'` names.
 */
const GRANTS: Record<HookCtxKind, HookCtxGrants> = {
	task: { storage: false, fetch: false },
	'chain-link': { storage: false, fetch: false },
	query: { storage: true, fetch: false },
	outlet: { storage: true, fetch: false },
	event: { storage: true, fetch: false },
	lifecycle: { storage: true, fetch: false },
	oracle: { storage: true, fetch: true },
}

/** @internal */
export function isHookCtxKind(v: unknown): v is HookCtxKind {
	// Own keys only: `'constructor' in GRANTS` is true through the prototype,
	// and a kind read off a manifest or a registry row must not pass by it.
	return typeof v === 'string' && Object.hasOwn(GRANTS, v)
}

/**
 * The grants for a kind. An unknown kind is a programming error at the call
 * site — every caller names one — so it throws rather than defaulting: a
 * default in either direction is a grant nobody decided.
 * @experimental
 */
export function hookCtxGrants(kind: unknown): HookCtxGrants {
	if (!isHookCtxKind(kind))
		throw new Error(
			`a plugin hook context was built without a hook ctx kind (got ${JSON.stringify(kind)}); ` +
				`name one of ${HOOK_CTX_KINDS.join(' · ')} (plans/29 R-3)`,
		)
	return GRANTS[kind]
}

/** The members every kind's context carries, before the grants. */
const BASE_KEYS = ['random', 'now', 'log', 'signal'] as const

/**
 * The keys a hook of this kind finds on `ctx`, in the order the sandboxes
 * define them — what a test compares `Object.keys(ctx)` against.
 * @experimental
 */
export function hookCtxKeysFor(kind: HookCtxKind): string[] {
	const g = hookCtxGrants(kind)
	return [...BASE_KEYS.slice(0, 3), ...(g.storage ? ['storage'] : []), ...(g.fetch ? ['fetch'] : []), BASE_KEYS[3]!]
}

