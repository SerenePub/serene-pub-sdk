/**
 * The typed chain scope — `$.history.messages` instead of `$ref('history', 'messages')`.
 *
 * Why this is worth machinery. `$ref` takes two strings, and strings are where the
 * remaining classes of authoring mistake live in this SDK: a mistyped node key, a
 * mistyped port, a reference to a node that does not exist *yet*. All three were
 * publish-time findings. With a scope object accumulated as the chain is built, all
 * three become **compile errors**, which is the same move the kind-named methods made
 * for the five laws they enforce.
 *
 * The one that matters most is the third. `$` contains only the nodes declared *above*
 * the call, so a reference to a later node does not type-check — **"no back-edges"
 * stops being a rule the validator checks and becomes a thing you cannot write.**
 *
 * Nothing about the compiled document changes. A scope access produces exactly the
 * `DataRef` that `$ref` produces, so the rows, the edges and the canonical hash are
 * byte-identical. This is authoring sugar over an unchanged value.
 * @ruling 04 §4a, F9, F3, F6
 */

import { $ref, type DataRef } from './refs.js'
import type { PortDecl } from './descriptors.js'

/**
 * A node accessor. It **is** a ref to `main`, and property access refines the port —
 * so `$.generate` and `$.generate.text` are both legal and mean what they look like.
 * @experimental
 */
export type NodeAccessor<Out extends PortDecl> = DataRef & {
	readonly [K in keyof Out]: DataRef
}

/**
 * Node keys accumulate **flat and dotted** — `'gather.semantic.embed'` — because that is
 * exactly what the row's `node_key` is. The scope then expands them back into a
 * nested shape, so `$.gather.semantic.embed.vector` reads like the key it compiles to.
 *
 * Blocks are not nodes, so a block name alone is not a ref: `$.gather` is a path, and
 * only the leaf carries the accessor. That falls out of the split below rather than
 * needing a rule.
 * @ruling F21
 */
type Head<K extends string> = K extends `${infer H}.${string}` ? H : K

type ChildrenOf<N, H extends string> = {
	[K in keyof N & string as K extends `${H}.${infer R}` ? R : never]: N[K]
}

type Nested<N> = {
	readonly [H in Head<keyof N & string>]: (H extends keyof N
		? NodeAccessor<NonNullable<N[H]> extends PortDecl ? NonNullable<N[H]> : PortDecl>
		: unknown) &
		Nested<ChildrenOf<N, H>>
}

/**
 * The chain's own nodes under their **short** keys (A18): inside a clause chain
 * whose qualifier is `Prefix` (`reckon.on`), a sibling is named `$.crib` as well
 * as `$.reckon.on.crib` — exactly what `makeScope`'s `localPrefix` resolves at
 * run time, now in the type. Only the innermost chain's: a loop inside a branch
 * names the branch's nodes by their full path, as the runtime does.
 */
type Local<N, Prefix extends string> = Prefix extends ''
	? {}
	: { [K in keyof N & string as K extends `${Prefix}.${infer R}` ? R : never]: N[K] }

/** The flat node map a scope was built from — local short keys included. @experimental */
export type ScopeNodes<Nodes extends Record<string, PortDecl>, Prefix extends string = ''> = Nodes &
	Local<Nodes, Prefix>

/** Phantom brand: the flat node map behind a scope, so `nodeAt` can type a dotted key. */
declare const SCOPE_NODES: unique symbol

/**
 * What the callback receives. `Nodes` is accumulated by the builder, one entry per
 * declared node, so autocomplete lists exactly the nodes that exist at this point in
 * the chain — and nothing later. Inside a clause chain (`Prefix`), the chain's own
 * nodes are reachable by their short keys too (A18).
 * @experimental
 */
export type Scope<Nodes extends Record<string, PortDecl>, Prefix extends string = ''> = Nested<
	ScopeNodes<Nodes, Prefix>
> & { readonly [SCOPE_NODES]?: ScopeNodes<Nodes, Prefix> }

/** The flat, dotted node keys a scope can name — `'reckon.on.crib'`, and `'crib'` inside that chain. @experimental */
export type ScopeKey<S> = S extends { readonly [SCOPE_NODES]?: infer N } ? keyof N & string : string

/** The accessor a scope hands out for one flat key — what `nodeAt($, key)` returns. @experimental */
export type ScopeAccessor<S, K extends string> = S extends { readonly [SCOPE_NODES]?: infer N }
	? K extends keyof N
		? NodeAccessor<NonNullable<N[K]> extends PortDecl ? NonNullable<N[K]> : PortDecl>
		: never
	: NodeAccessor<PortDecl>

/**
 * 🚧 A node read by its **flat, dotted key** — `nodeAt($, 'reckon.on.crib')` —
 * typed against the nodes declared above this point (A18): a key no node has is
 * a compile error, and the accessor's ports are the node's own. The same
 * `DataRef` the property chain `$.reckon.on.crib` produces, walked through the
 * same scope proxy, so the stored document is byte-identical.
 *
 * Prefer the property chain where it reads well; this form is for a helper that
 * holds the key as a typed constant (`const R = 'reckon.on.' as const`,
 * `` nodeAt($, `${R}crib`) ``). It replaces core-catalog's untyped `at($, path)`.
 * @experimental
 * @ruling A18
 */
export function nodeAt<S extends { readonly [SCOPE_NODES]?: unknown }, K extends ScopeKey<S>>(
	$: S,
	key: K,
): ScopeAccessor<S, K> {
	if (typeof key !== 'string' || !key) throw new Error(`nodeAt: a node key, such as 'reckon.on.crib'`)
	return key.split('.').reduce((o: any, k) => o[k], $ as any)
}

const REF_KEYS = new Set(['__ref', 'node', 'port'])

/**
 * A ref that can be refined. The proxy target is a real `DataRef`, so `JSON.stringify`,
 * `Object.entries` and `collectDataRefs` all see a plain object — the proxy is invisible
 * to everything downstream of authoring.
 */
function refAccessor(node: string, port = 'main'): any {
	const target = $ref(node, port)
	return new Proxy(target, {
		get(t, prop, recv) {
			if (typeof prop !== 'string') return Reflect.get(t, prop, recv)
			if (REF_KEYS.has(prop) || prop === 'toJSON' || prop === 'then')
				return Reflect.get(t, prop, recv)
			// Object internals must pass through untouched, or deep-equality, logging and
			// anything else that probes an object turns into a port reference.
			if (prop in Object.prototype) return Reflect.get(t, prop, recv)
			// Refining an already-refined ref is a mistake worth catching early:
			// `$.a.b.c` has no meaning — ports are flat.
			if (port !== 'main') {
				throw new Error(
					`'${node}.${port}.${prop}' — ports are flat, so a ref cannot be refined twice. ` +
						`Reference the port you want directly, or reach inside the payload in the node's own hook.`,
				)
			}
			return refAccessor(node, prop)
		},
	})
}

/**
 * Build the scope for a call site.
 *
 * @param knownKeys every node key declared so far, fully qualified
 * @param localPrefix inside a block chain, the qualifier its members share — so a
 *   sibling can be named by its short key (`$.embed`) while an outside node is still
 *   reachable by its full path (`$.gather.semantic.embed`).
 * @experimental
 */
export function makeScope(knownKeys: Set<string>, localPrefix?: string, clauseId?: string): any {
	/** A sibling inside the same chain wins over a same-named outside key. */
	const resolveKey = (joined: string): string | undefined => {
		if (localPrefix && knownKeys.has(`${localPrefix}.${joined}`))
			return `${localPrefix}.${joined}`
		return knownKeys.has(joined) ? joined : undefined
	}
	const isPrefix = (joined: string) =>
		[...knownKeys].some(
			(k) =>
				k.startsWith(`${joined}.`) ||
				(!!localPrefix && k.startsWith(`${localPrefix}.${joined}.`)),
		)

	/**
	 * A path segment can be three things at once, and the order matters:
	 *
	 *  1. a **step toward** a longer key — `gather` on the way to `gather.semantic.embed`
	 *  2. a **key in its own right** — a block publishes under its own id, so `$.gather`
	 *     is also a real reference
	 *  3. a **port** on the key we already have — `$.history.messages`
	 *
	 * Walking wins over porting, because a block id being addressable must not shadow the
	 * nodes underneath it. Only when nothing deeper can match is the segment a port.
	 */
	const walk = (path: string[]): any => {
		const joined = path.join('.')
		const selfKey = joined ? resolveKey(joined) : undefined
		// `$.block.item`, written from inside that block, is the iteration item when
		// used as a *value* — while staying a step on the walk to the chain's inner
		// nodes (`$.agent.item.turn` still reaches the node). Without this the path
		// was a bare prefix, so the reference silently serialized to nothing: the
		// one wiring mistake that produces plausible output against missing input.
		const itemKey =
			!selfKey && clauseId && joined === `${clauseId}.item` ? `${clauseId}.${ITEM}` : undefined
		const target = selfKey
			? $ref(selfKey, 'main')
			: itemKey
				? $ref(itemKey, 'main')
				: Object.create(null)
		return new Proxy(target, {
			get(t, prop, recv) {
				if (typeof prop !== 'string') return Reflect.get(t, prop, recv)
				if (REF_KEYS.has(prop) || prop === 'toJSON' || prop === 'then')
					return Reflect.get(t, prop, recv)
				if (prop in Object.prototype) return Reflect.get(t, prop, recv)
				// Inside a map or loop, the current item is addressable without naming the
				// block — its key is bookkeeping the author should not have to repeat.
				if (prop === ITEM && clauseId && path.length === 0)
					return refAccessor(`${clauseId}.${ITEM}`)

				const next = [...path, prop]
				const nextJoined = next.join('.')
				// Inside a block, `block.item` is always a walkable path — the chain
				// itself — even before any inner node is declared. Without this,
				// authoring `$.drafting.item` while *declaring* the first inner node
				// fell through to the port branch and quietly produced an edge from
				// the block's (not yet existing) `item` port.
				if (
					resolveKey(nextJoined) ||
					isPrefix(nextJoined) ||
					(clauseId && nextJoined === `${clauseId}.item`)
				)
					return walk(next)
				if (selfKey) return refAccessor(selfKey, prop)

				throw new Error(
					`'${nextJoined}' is not a node declared before this point.` +
						(knownKeys.size
							? ` Available: ${[...knownKeys].join(', ')}.`
							: ' No nodes are declared yet — the Input comes first (01 §2).') +
						` Pipelines have no back-edges (F9), so a node cannot reference one declared later.`,
				)
			},
		})
	}
	return walk([])
}

/** The current item inside a map, addressed without knowing the block's key. @experimental */
export const ITEM = '$item'
