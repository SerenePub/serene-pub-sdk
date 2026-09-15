/**
 * A handler's `input`, derived from the contract it is bound to.
 *
 * The ruling (2026-09-10): **handler input types are generated from the
 * contract.** A node handler's `input` is its type's own `ports.in` plus the
 * `params` slot's declared schema — so a declared field nothing reads is
 * *visible*, and a read of a name nothing declares is a **type error** rather
 * than a property access on `any` that is `undefined` at runtime and silent at
 * build.
 *
 * That failure is not hypothetical and it is not subtle in hindsight. Two core
 * bindings shipped reading names their own contract does not declare —
 * `input.topK` on `core:query/vector-search@1` (a *parameter*, at
 * `input.params.topK`, so the host ran on a literal `?? 40` for the mechanism's
 * whole life) and `input.limit` on `core:query/session-history@1` (the same
 * shape, the same silence). Each was found by hand, twice, after the fact.
 *
 * ## What is derivable and what is not
 *
 * **Port names, yes. Port values, no.** `ports.in` maps a port to a `ShapeId`,
 * which is a string id in a runtime registry with no TS payload behind it (see
 * src/shapes.ts), so there is nothing to derive a value type *from*. Ports
 * therefore carry `any` and the derivation's job is the set of **names**.
 *
 * **Parameter names and values, both.** A `parameters` slot declares a
 * `schema` of `FieldDecl`s, and a `FieldDecl` carries its `type` — so
 * `params.maxEntries` is a `number` because the declaration says `'integer'`,
 * and `params.strategy` is the union of its `of: [...]` choices. That is a real
 * static shape rather than a name check.
 *
 * ## Shared handlers stay structural
 *
 * One handler may serve several node types. Its input is then the
 * **intersection** of what those contracts supply — it may read only what
 * *every* one of them declares — which is what `SharedInput<[A, B]>` computes.
 * A handler is never coupled to one type id; it is coupled to a shape, and the
 * shape is checkable. `structuralCompat` in the host applies the same rule at
 * runtime, for a plugin binding to somebody else's type and for the pipeline
 * orchestrator composing nodes in the UI.
 *
 * @see src/descriptors.ts — why every `describe*` is generic over its slots
 */

import type { Descriptor, PortDecl, SlotDecl } from './descriptors.js'
import type { FieldDecl, FieldType, MemberDecl } from './settings.js'

// ── Key extraction ──────────────────────────────────────────────────────────

/**
 * A type's own declared keys, with index signatures stripped.
 *
 * Load-bearing twice over, and both reasons are the same defect wearing
 * different clothes.
 *
 * The **first** is `Descriptor.slots`, which is the open
 * `Record<string, SlotDecl>`. Every `describe*` returns
 * `Descriptor<…> & { slots?: S }`, so the slots type arrives as
 * `Record<string, SlotDecl> & { params: {…literal…} }` — the literal survives,
 * and so does the index signature. `keyof` that intersection is `string`, which
 * would accept **every** name and opt the whole exercise out silently.
 *
 * The **second** is a declaration that names no ports at all: `ports.in` then
 * infers the open `PortDecl`, whose `keyof` is likewise `string`. Without this,
 * exactly the types that declare least would be the ones checked least.
 *
 * ⚠ A homomorphic mapped type (`K in keyof T`, with the filtering in `as`) is
 * required. `keyof (Record<string, X> & { params: Y })` collapses to `string`
 * *before* a non-homomorphic mapping could see `params`; mapping over `T`
 * itself visits declared properties and index signatures separately, which is
 * what leaves `params` behind after `string` is filtered out. Same construction
 * as `DeclaredKeysOnly` in src/capabilities.ts, which keeps `ctx.can()` from
 * widening to every capability in the app.
 */
type DeclaredOnly<T> = {
	[K in keyof T as string extends K ? never : number extends K ? never : K]: T[K]
}

/**
 * The declared names of `T`, or nothing at all when there is no `T`.
 *
 * ⚠ The `never` guard is not defensive. A mapped type over `never` is `never`,
 * and `keyof never` is `string | number | symbol` — so without this, a contract
 * that declares **no** parameters derives *every* parameter name, which is the
 * precise inversion of the point. It cost an afternoon: `userMessage.params`
 * type-checked because `ParamNamesOf` had quietly answered `string`.
 */
type DeclaredNames<T> = [T] extends [never] ? never : Extract<keyof DeclaredOnly<T>, string>

// ── Reaching the declaration ────────────────────────────────────────────────

/**
 * The descriptor behind a contract reference.
 *
 * Accepts the pinned form (`typeof C.vectorSearch` — a `Pinned<D>`, which is
 * what `@serene-pub/contracts` exports and what a spec author already holds)
 * and a bare descriptor, so a plugin that has only its own `describeQueryType`
 * return value can use these helpers without wrapping it in a `pin` first.
 */
export type DescriptorOf<P> = P extends { descriptor: infer D }
	? D
	: P extends Descriptor<any, any, any>
		? P
		: never

/** The in-port map a contract declares, or `{}` when it declares none. */
type InPortMap<P> = DescriptorOf<P> extends { ports: { in?: infer I } } ? NonNullable<I> : PortDecl

/**
 * The in-port names a contract declares, as a union of literals.
 *
 * Names only — see the file header for why a `ShapeId` has no value type to
 * derive.
 */
export type InPortsOf<P> = DeclaredNames<InPortMap<P>>

/** The slot map a contract declares, or `{}` when it declares none. */
type SlotMap<P> = DescriptorOf<P> extends { slots?: infer S } ? NonNullable<S> : never

/**
 * The slot names a contract declares.
 *
 * ⚠ **Per node, and that is new.** This used to be a fixed vocabulary — a
 * closed `CoreSlot` union in the app — because `describe*` erased its slot keys
 * into `Record<string, SlotDecl>` and there was nothing left to derive from.
 * Now that every `describe*` captures its argument, a node that declares no
 * `template` slot no longer silently accepts `input.template`.
 */
export type SlotNamesOf<P> = DeclaredNames<SlotMap<P>>

/** The `params` slot's declared schema, or `never` when there is none. */
type ParamsSchema<P> =
	DeclaredOnly<SlotMap<P>> extends { params: infer Slot }
		? Slot extends { schema?: infer Sch }
			? [NonNullable<Sch>] extends [never]
				? never
				: DeclaredOnly<NonNullable<Sch>>
			: never
		: never

/** The parameter names a contract declares. */
export type ParamNamesOf<P> = DeclaredNames<ParamsSchema<P>>

// ── Parameter values ────────────────────────────────────────────────────────

/**
 * What one declared field is, as a TS type.
 *
 * The mapping is the field language's own (src/settings.ts) and the two must
 * stay in step; the check that they do is `checkFieldTypes` in the conformance
 * suite plus the assertions in sdk-tests/nodeInput.assert.ts, both of which
 * fail on a `FieldType` this does not answer.
 *
 * ⚠ `unknown` for an unanswered type rather than `any`, deliberately. A field
 * type nobody mapped should make the *use* fail loudly at the binding, not
 * quietly become the thing `any` becomes: another silent read.
 */
export type FieldValue<F> = F extends { type: infer T }
	? T extends 'string' | 'text' | 'secret' | 'media'
		? string
		: T extends 'number' | 'integer'
			? number
			: T extends 'boolean'
				? boolean
				: T extends 'string[]'
					? string[]
					: T extends 'enum'
						? EnumValue<F>
						: T extends 'share' | 'perMember' | 'strengths'
							? Record<string, number>
							: unknown
	: unknown

/**
 * An `enum`'s value: its declared choices when it lists them, `string`
 * otherwise.
 *
 * `of` is the canonical list and `members[].key` is the labelled spelling of
 * the same thing (settings.ts: "an `enum` may use this **instead of** `of`"),
 * so both are read here — a declaration that labels its choices must not
 * degrade to a bare `string` for having been written the more helpful way.
 */
type EnumValue<F> = F extends { of: readonly (infer V)[] }
	? V extends string
		? V
		: string
	: F extends { members: readonly (infer M)[] }
		? M extends { key: infer K }
			? K extends string
				? K
				: string
			: string
		: string

/**
 * A contract's `params` object.
 *
 * Every key is optional, and that is the substrate's shape rather than a
 * hedge: `resolveInput` hands a binding the node's stored config, and a config
 * that never set a control simply has no key for it. The declared `default` is
 * applied by the *binding*, with `??`, which is why every core read of a param
 * already has one.
 */
export type ParamsOf<P> = {
	[K in ParamNamesOf<P>]?: FieldValue<ParamsSchema<P>[K]>
}

// ── The input type ──────────────────────────────────────────────────────────

/** Everything a contract puts on `input` except `params`, which is typed. */
type PlainKeys<P> = Exclude<InPortsOf<P> | SlotNamesOf<P>, 'params'>

/**
 * A node handler's `input`, derived from its contract.
 *
 * ```ts
 * const search = async (input: InputOf<typeof C.vectorSearch>) => {
 *   input.vectors            // ✅ a declared in-port
 *   input.params?.topK       // ✅ a declared parameter, typed `number`
 *   input.topK               // ❌ not a port — this is the defect that shipped
 *   input.params?.minScore   // ❌ not in the schema — nor was it ever read
 * }
 * ```
 *
 * `Partial` over the ports because a port is only present when a spec wired
 * one, and a spec that wires nothing into an optional in-port is legal — the
 * binding's `??` is the contract there, not the type.
 */
export type InputOf<P> = Partial<Record<PlainKeys<P>, any>> &
	([ParamNamesOf<P>] extends [never] ? unknown : { params?: ParamsOf<P> })

// ── Shared handlers ─────────────────────────────────────────────────────────

/**
 * The keys every contract in the list declares.
 *
 * Folded pairwise with `Extract` rather than written as an intersection of
 * unions. `('a' | 'b') & ('b' | 'c')` does reduce to `'b'`, but only because
 * TS normalises intersections of unit types — a rule that has no business
 * being load-bearing three types deep. `Extract` says what is meant.
 */
type SharedNames<Ps extends readonly unknown[]> = Ps extends readonly [infer H, ...infer R]
	? R extends readonly []
		? PlainKeys<H>
		: Extract<PlainKeys<H>, SharedNames<R>>
	: never

type SharedParamNames<Ps extends readonly unknown[]> = Ps extends readonly [infer H, ...infer R]
	? R extends readonly []
		? ParamNamesOf<H>
		: Extract<ParamNamesOf<H>, SharedParamNames<R>>
	: never

/**
 * What one shared parameter is: the **union** of what each contract declares
 * it to be.
 *
 * A union rather than an intersection, and the direction is the whole point. A
 * handler serving three types is handed whichever one the run resolved, so it
 * has to cope with every declaration — `number | string` is the honest type for
 * a key two contracts type differently, where `number & string` (`never`) would
 * say the read is impossible when it is merely varied. In practice the shared
 * lanes declare identically and the union collapses to one type.
 */
type SharedParamValue<Ps extends readonly unknown[], K extends string> = {
	[I in keyof Ps]: K extends ParamNamesOf<Ps[I]> ? FieldValue<ParamsSchema<Ps[I]>[K]> : never
}[number]

/**
 * One handler, several node types — typed as the **intersection** of what they
 * supply.
 *
 * ```ts
 * // world lore, character lore and history are one scan filtered three ways
 * const loreFor = (source: string, input: SharedInput<[
 *   typeof C.worldLore, typeof C.characterLore, typeof C.historyEntries
 * ]>) => …
 * ```
 *
 * The handler may read only what *every* listed contract declares, which is
 * exactly what makes it safe to bind to all three: whichever one the run
 * resolved, every name it touches is declared. A key one lane adds is
 * unreadable here until the others add it too — visible as a type error at the
 * read, rather than as `undefined` on two lanes out of three.
 */
export type SharedInput<Ps extends readonly unknown[]> = Partial<Record<SharedNames<Ps>, any>> &
	([SharedParamNames<Ps>] extends [never]
		? unknown
		: {
				params?: {
					[K in SharedParamNames<Ps>]?: SharedParamValue<Ps, K>
				}
			})

// ── What a handler declares it reads (the runtime half) ─────────────────────

/**
 * The names a handler reads off its input — the runtime shadow of `InputOf`.
 *
 * A type cannot be inspected at run time, and two of the three consumers of
 * this rule are runtime consumers: a plugin binding a handler to a type it did
 * not declare, and the admin-side orchestrator composing nodes in the UI.
 * Neither can typecheck anything. So a handler *declares* what it reads, in
 * the same two categories `InputOf` derives, and `structuralCompat` (core,
 * src/lib/server/pipelines/runtime/structuralCompat.ts) decides whether a
 * given contract supplies it.
 *
 * ⚠ `ports` covers **in-ports and slot names together**, because they arrive
 * on `input` indistinguishably: `resolveInput` builds one flat object out of
 * the node's config, wired edges and resolved slot refs alike. Splitting them
 * here would ask a caller to know which of the two a name is, which is
 * precisely the knowledge the flat input takes away.
 */
export interface HandlerRequires {
	/** In-port and slot names read off `input` directly. */
	ports: readonly string[]
	/** Names read off `input.params`. */
	params: readonly string[]
	/**
	 * A field type a param is required to have, for the reads that care.
	 *
	 * Optional and rarely written: most handlers care that `limit` exists, not
	 * that it is an `integer` rather than a `number`. Where it is written,
	 * `structuralCompat` reports a mismatch instead of a missing name.
	 */
	paramTypes?: Readonly<Record<string, FieldType>>
}

/**
 * A hook that says what it reads.
 *
 * Additive by construction: `Bindings` values stay plain `Hook`s, and a
 * function carrying an extra property is assignable to a function type — so a
 * host that never looks at `requires` is unaffected, and one that does gets the
 * declaration where the handler is.
 */
export type DeclaredHook<H extends (...args: any[]) => any> = H & {
	readonly requires: HandlerRequires
}

/**
 * Attach a read declaration to a handler.
 *
 * ```ts
 * declaresReads(async (input: InputOf<typeof C.sessionHistory>, ctx) => …, {
 *   ports: ['scope'],
 *   params: ['limit', 'channel'],
 * })
 * ```
 *
 * Returns the same function object rather than a wrapper: a wrapper would
 * change the identity the executor's binding table holds, and one binding table
 * keyed by identity is how a shared handler is recognised as shared.
 */
export function declaresReads<H extends (...args: any[]) => any>(
	hook: H,
	requires: HandlerRequires,
): DeclaredHook<H> {
	return Object.assign(hook, { requires }) as DeclaredHook<H>
}

/** Does this hook carry a read declaration? */
export function readsOf(hook: unknown): HandlerRequires | undefined {
	const r = (hook as { requires?: unknown } | undefined)?.requires
	if (!r || typeof r !== 'object') return undefined
	const { ports, params } = r as { ports?: unknown; params?: unknown }
	if (!Array.isArray(ports) || !Array.isArray(params)) return undefined
	return r as HandlerRequires
}

// ── What a contract supplies (the runtime half of the other side) ───────────

/**
 * The names a contract puts on a handler's `input`, read off the descriptor at
 * run time.
 *
 * The runtime twin of `InputOf`, and the two are asserted to agree in
 * sdk-tests/nodeInput.assert.ts. It lives in the SDK rather than in core
 * because both sides of a plugin-to-plugin binding need the same answer, and a
 * second implementation on either side is a second answer.
 *
 * `SlotDecl` is imported for the shape of what is walked; nothing here reads a
 * slot's `kind` except to find the schema, because a schema is a schema
 * whatever the slot is called.
 */
export function suppliesOf(contract: unknown): {
	id: string
	ports: string[]
	params: string[]
	paramTypes: Record<string, FieldType>
} {
	const d = descriptorOf(contract)
	const ports = [
		...Object.keys((d?.ports?.in ?? {}) as PortDecl),
		...Object.keys((d?.slots ?? {}) as Record<string, SlotDecl>),
	]
	const params: string[] = []
	const paramTypes: Record<string, FieldType> = {}
	for (const slot of Object.values((d?.slots ?? {}) as Record<string, SlotDecl>))
		for (const [name, field] of Object.entries(
			(slot?.schema ?? {}) as Record<string, FieldDecl>,
		)) {
			params.push(name)
			if (field?.type) paramTypes[name] = field.type
		}
	return { id: d?.id ?? '(unknown type)', ports: [...new Set(ports)], params, paramTypes }
}

/** Unwrap the pinned form, tolerate a bare descriptor, refuse anything else. */
function descriptorOf(contract: unknown): Descriptor | undefined {
	if (!contract || typeof contract !== 'object') return undefined
	const c = contract as { descriptor?: unknown; ports?: unknown; id?: unknown }
	if (c.descriptor && typeof c.descriptor === 'object') return c.descriptor as Descriptor
	if (typeof c.id === 'string' && c.ports) return contract as Descriptor
	return undefined
}

export type { FieldType, MemberDecl }
