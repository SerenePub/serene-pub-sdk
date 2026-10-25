/**
 * 🚧 The typed chain helpers core's specs share (A18, derive-don't-spell;
 * lane 4, 2026-10-20): the scope a chain's callbacks receive, a chain with a
 * node added, the chain a junction hands an arm written for several
 * branches, a node named on its chain (its full key read off that chain's
 * scope, never spelled), a step written only when a condition holds, and the
 * session document a genre's pipelines read. Types only, but for `on`,
 * `keyOf`, `heldForReview` and `chainIf` — so a graph built through them is
 * byte-identical to one written by hand.
 */

import type {
	ChainBuilder,
	DataRef,
	JunctionBuilder,
	NodesOf,
	PortDecl,
	PresetBuilder,
	Scope,
	SessionOf,
	SpecBuilder,
} from '@serene-pub/sdk'

/**
 * Any chain a helper extends — a spec's spine (`SpecBuilder`, whose clause
 * methods take no qualifier, so it is not a `ChainBuilder<any, any>` to the
 * compiler), a branch, an each's item. @internal
 */
export type Chain = ChainBuilder<any, any> | SpecBuilder<any, any>

/** A chain, read as the one class both kinds are — for a helper that only adds nodes. @internal */
export const chainOf = (c: Chain): ChainBuilder<any, any> => c as ChainBuilder<any, any>

/** The `$` a callback on chain `B` receives: the nodes declared so far, its own by short key. @internal */
export type ScopeOf<B> = B extends SpecBuilder<infer N, any>
	? Scope<N>
	: B extends ChainBuilder<infer N, infer P>
		? Scope<N, P>
		: never

/** A read off chain `B`'s scope — `($) => $.crib.main` — handed to a helper in place of a dotted path. @internal */
export type ReadOn<B> = ($: ScopeOf<B>) => unknown

type Qualified<P extends string, K extends string> = P extends '' ? K : `${P}.${K}`

/**
 * Chain `B` with node `K` added, publishing `Ports` — a spine stays a spine
 * (its `.defaults()` and `.build()` still offered). @internal
 */
export type Plus<B, K extends string, Ports extends PortDecl> =
	B extends SpecBuilder<infer N, infer A>
		? SpecBuilder<N & { [X in K]: Ports }, A>
		: B extends ChainBuilder<infer N, infer P>
			? ChainBuilder<N & { [X in Qualified<P, K>]: Ports }, P>
			: never

/**
 * The node map a chain has built — a spine's too (`NodesOf` reads chains, and
 * a spine is not one to the compiler). @internal
 */
export type ChainNodes<B> = B extends SpecBuilder<infer N, any> ? N : NodesOf<B>

/**
 * The chain a junction `J` hands its branch `Name` — for an arm written once
 * and mounted on several branches (`BranchOf<typeof j, 'full' | 'review'>`):
 * the nodes before the junction stay concrete, so the arm's `$` is typed. @internal
 */
export type BranchOf<J, Name extends string> =
	J extends JunctionBuilder<infer N, infer Id, any> ? ChainBuilder<N, `${Id}.${Name}`> : never

/**
 * 🚧 A node named on the chain that declares it (A18): its full key —
 * `reckon.on.crib` for `on(r, 'crib')` — is read off that chain's own scope
 * when the defaults are written, never spelled as a prefix and a key. Named
 * before the node exists, so a `Wiring` keeps the order the graph was built
 * in. @internal
 */
export interface NodeOn {
	readonly chain: Chain
	readonly key: string
}

/** @internal */
export const on = (chain: Chain, key: string): NodeOn => ({ chain, key })

/**
 * 🚧 A node named BEFORE the chain that declares it exists (A18) — a `Wiring`
 * entry whose place among the declared defaults comes ahead of the step
 * (their order is the document's). `.on(chain)` binds it once the chain is
 * built, and hands the chain back; its key is read off that chain's scope as
 * `on`'s is. Resolving one never bound throws. @internal
 */
export interface NodeLater extends NodeOn {
	on<B extends Chain>(chain: B): B
}

/** @internal */
export const later = (key: string): NodeLater => {
	let bound: Chain | undefined
	return {
		key,
		get chain(): Chain {
			if (!bound) throw new Error(`later('${key}'): named in the wiring, never bound to the chain that declares it`)
			return bound
		},
		on<B extends Chain>(chain: B): B {
			bound = chain
			return chain
		},
	}
}

/**
 * The full key of a node this chain declares LATER, beside one it already
 * has — `sibling($.resolve, 'planWrite')` — for a config reference to a step
 * not yet in scope (`slot.connectionOf`, `slot.samplingOf`): the chain's own
 * qualifier, read off a node of it, never spelled. @internal
 */
export const sibling = (ref: { readonly node: string }, key: string): string =>
	`${ref.node.slice(0, ref.node.lastIndexOf('.') + 1)}${key}`

/**
 * The full key of a node named on its chain — the chain's scope resolves the
 * short key exactly as `$.crib` does, so it is the key the row carries. A key
 * the chain never declared throws (the scope's own refusal). @internal
 */
export const keyOf = (n: NodeOn | string): string =>
	typeof n === 'string' ? n : chainOf(n.chain).resolvePublic<DataRef>((s: unknown) => (s as Record<string, DataRef>)[n.key]).node

/** Every write `review` named, held at the review gate in the declared defaults. @internal */
export const heldForReview = <P extends PresetBuilder<any>>(p: P, review: ReadonlyArray<NodeOn | string>): P => {
	let out: PresetBuilder<any> = p
	for (const node of review) out = out.settings(keyOf(node), { review: 'on' })
	return out as P
}

/**
 * References read off a chain's scope as it stands — `readOn(named, ($) =>
 * $.setSeat)` — for the steps deeper down (a junction's branches) of a
 * helper mounted on more than one chain, where no full path names them. A
 * reference is the same `{ node, port }` wherever it is used. @internal
 */
export const readOn = <B extends Chain, R>(chain: B, read: ($: ScopeOf<B>) => R): R =>
	chainOf(chain).resolvePublic<R>(read as never)

/**
 * A step (or several) written only when `cond` holds — the chain typed as if
 * it were, so what follows reads the step by name where the same `cond`
 * guards the read. A read of a step that was not written is still refused, at
 * build, by the scope. @internal
 */
export const chainIf = <B extends Chain, R extends Chain>(cond: boolean, chain: B, fn: (chain: B) => R): R =>
	cond ? fn(chain) : (chain as unknown as R)

/**
 * The session document an inlet hands a pipeline (`$.input.session`), its
 * `fields` keyed as genre `G` declares them — what a junction reads by a
 * typed path: `(v: SessionDocOf<typeof storyGenre>) => v.fields.turnMode`. @internal
 */
export interface SessionDocOf<G> {
	readonly fields: SessionOf<G>['fields']
	/** 🚧 Each routine in force's mode, by the pipeline it runs (R55) — `SessionSettingsV1.routineModes`. */
	readonly routineModes?: Readonly<Record<string, 'off' | 'review' | 'full'>>
}
