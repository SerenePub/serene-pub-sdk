/**
 * 🚧 **Conditions** — the `when` of a registration (R31, A5) and the `where`
 * of a cadence: a declared test over the session's **published values**,
 * never code.
 *
 * A condition is the predicate grammar `predicates.ts` already reads for an
 * action's *enabled-when* — `{ on, equals | truthy | equalsPath }` — widened
 * by the comparisons a routine needs (`gt` · `gte` · `lt` · `lte` · `in`) and
 * composed with `all` · `any` · `not`. An `EnabledWhen` is therefore a valid
 * condition leaf (it is the leaf form plus `reason`), and one evaluator reads
 * both.
 *
 * ## The path string is only the stored form
 *
 * `on` is a dotted path into the published values (`state.world.inCombat`).
 * Authors never type it by hand: the typed builders (`isTrue`, `eq`, `gt`, …,
 * over `sessionOf(genre)`) produce it — lane 2 of the layering build. This file
 * holds the stored shape, the evaluator and the findings, so a host and the
 * SDK judge a stored condition the same way.
 *
 * ## Absence is false, and nothing throws
 *
 * A path that leaves the document is `undefined`, and every comparison over
 * `undefined` is false — so a typo, or a slot a ruleset does not play, makes
 * a condition false rather than a run fail (A19). `not` of an absent leaf is
 * therefore true; say `all: [{ on, truthy: true }, …]` where presence matters.
 * A malformed stored condition is false too: the evaluator never throws.
 *
 * ## "Some cast member" — the `*` segment
 *
 * A path segment `*` stands for **any one key** at that point
 * (`state.cast.byId.*.hp`): the leaf holds when it holds for SOME expansion —
 * `gt(s.cast.any.hp, 0)` is "someone still stands". `not` of it is "no one".
 * Only `on` may hold one; `equalsPath` names one value. Written by the typed
 * view (`s.cast.any.…`, `s.locations.any.…`, `s.sprites.any.…`), never by hand.
 *
 * ## The typed view (lane 2, A5)
 *
 * `sessionOf(genre, { ruleset?, vocabularies?, annex? })` is a typed view of
 * what a condition may test, derived from declarations only — the genre's
 * fields and slots (and sheets), the active ruleset's stats and the
 * vocabularies it plays, annex fields, and the host's fixed facts. Each leaf
 * is a `ConditionProp` carrying its stored path and value type; the builders
 * (`isTrue`, `eq`, `gt`, `gte`, `lt`, `lte`, `oneOf`, `and`, `or`, `not`,
 * `same`) turn them into the stored `ConditionDecl`. A property exists only if
 * a declaration made it, and a wrong enum member does not compile.
 * @experimental
 * @ruling R31, A5, A19
 */

import { readPath, truthy as isTruthy } from './predicates.js'
import { getAttributeSlot, slotSlug, type AttributeSlotDecl, type SlotAppliesTo } from './attributes.js'
import { getStatShape } from './statShapes.js'
import type { FieldDecl } from './settings.js'
import type { GenreDecl } from './genres.js'
import { hostStateFor } from './hostState.js'
import type { RulesetDecl } from './rulesets.js'
import type { AnnexFieldDecl } from './annexFields.js'
import {
	isVocabulary,
	memberWord,
	playedVocabularies,
	rulesetVocabulary,
	VOCABULARY_OWNERS,
	type Vocabulary,
	type VocabularyGroup,
} from './vocabularies.js'

/** What a condition compares against — a JSON scalar. @experimental */
export type ConditionPrimitive = string | number | boolean | null

/**
 * One test over one published value. Exactly one comparison per leaf.
 * @experimental
 */
export interface ConditionLeaf {
	/** A dotted path into the published values — `state.world.inCombat`. Never a port reference. */
	readonly on: string
	/** Holds when the value strictly equals this literal. */
	readonly equals?: ConditionPrimitive
	/** `true`: holds when the value is truthy. `false`: holds when it is present and falsy. */
	readonly truthy?: boolean
	/** Holds when the value is a number greater than this. */
	readonly gt?: number
	/** Holds when the value is a number greater than or equal to this. */
	readonly gte?: number
	/** Holds when the value is a number less than this. */
	readonly lt?: number
	/** Holds when the value is a number less than or equal to this. */
	readonly lte?: number
	/** Holds when the value strictly equals one of these. */
	readonly in?: readonly ConditionPrimitive[]
	/** Holds when the value strictly equals the value at another path of the same document (both present). */
	readonly equalsPath?: string
}

/**
 * A stored condition: a leaf, or a composition of conditions.
 * @experimental
 * @ruling A5
 */
export type ConditionDecl =
	| ConditionLeaf
	| { readonly all: readonly ConditionDecl[] }
	| { readonly any: readonly ConditionDecl[] }
	| { readonly not: ConditionDecl }

/** The comparisons a leaf may state — exactly one. @experimental */
export const CONDITION_COMPARISONS = [
	'equals',
	'truthy',
	'gt',
	'gte',
	'lt',
	'lte',
	'in',
	'equalsPath',
] as const

const isObject = (v: unknown): v is Record<string, unknown> =>
	!!v && typeof v === 'object' && !Array.isArray(v)

const isPrimitive = (v: unknown): v is ConditionPrimitive =>
	v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'

/** Segments a published-values path may not walk. */
const FORBIDDEN_SEGMENTS: ReadonlySet<string> = new Set(['__proto__', 'constructor', 'prototype'])

/** 🚧 The `*` segment: any one key at that point of the path ("some cast member"). @experimental */
export const ANY_SEGMENT = '*'

/** At most this many values one wildcard path expands to — a bound, never a surprise. */
const MAX_EXPANSIONS = 10_000

/**
 * Every value a path reaches: one for a plain path, one per key at each `*`
 * (an object's own keys, an array's items). `undefined` ends are kept out.
 */
function valuesAt(root: unknown, path: string): unknown[] {
	const segments = path.split('.')
	let frontier: unknown[] = [root]
	for (const seg of segments) {
		const next: unknown[] = []
		for (const v of frontier) {
			if (v === null || typeof v !== 'object') continue
			if (seg === ANY_SEGMENT) {
				const items = Array.isArray(v) ? v : Object.values(v as Record<string, unknown>)
				for (const x of items) if (next.length < MAX_EXPANSIONS) next.push(x)
			} else if (Object.prototype.hasOwnProperty.call(v, seg)) next.push((v as Record<string, unknown>)[seg])
		}
		frontier = next
	}
	return frontier.filter((v) => v !== undefined)
}

function leafHolds(leaf: Record<string, unknown>, values: unknown): boolean {
	if (typeof leaf.on !== 'string' || !leaf.on) return false
	if (leaf.on.split('.').some((s) => FORBIDDEN_SEGMENTS.has(s))) return false
	if (leaf.on.split('.').includes(ANY_SEGMENT))
		return valuesAt(values, leaf.on).some((v) => valueHolds(leaf, v, values))
	const v = readPath(values, leaf.on)
	return valueHolds(leaf, v, values)
}

/** One comparison over one value — the leaf's, whichever expansion of `on` it came from. */
function valueHolds(leaf: Record<string, unknown>, v: unknown, values: unknown): boolean {
	if (v === undefined) return false
	if (leaf.equals !== undefined) return v === leaf.equals
	if (leaf.truthy !== undefined) return leaf.truthy === true ? isTruthy(v) : !isTruthy(v)
	const num = (k: string) => typeof leaf[k] === 'number' && typeof v === 'number'
	if (leaf.gt !== undefined) return num('gt') && (v as number) > (leaf.gt as number)
	if (leaf.gte !== undefined) return num('gte') && (v as number) >= (leaf.gte as number)
	if (leaf.lt !== undefined) return num('lt') && (v as number) < (leaf.lt as number)
	if (leaf.lte !== undefined) return num('lte') && (v as number) <= (leaf.lte as number)
	if (leaf.in !== undefined) return Array.isArray(leaf.in) && leaf.in.some((x) => x === v)
	if (leaf.equalsPath !== undefined) {
		if (typeof leaf.equalsPath !== 'string' || !leaf.equalsPath) return false
		const segs = leaf.equalsPath.split('.')
		if (segs.some((s) => FORBIDDEN_SEGMENTS.has(s) || s === ANY_SEGMENT)) return false
		const other = readPath(values, leaf.equalsPath)
		return other !== undefined && other === v
	}
	return false
}

/**
 * Does the condition hold over these published values? Absent (`undefined`)
 * holds — a registration without `when` always runs (R31). An absent path is
 * false; a malformed condition is false; nothing throws.
 * @experimental
 * @ruling R31, A5
 */
export function evaluateCondition(c: ConditionDecl | undefined | null, values: unknown): boolean {
	if (c === undefined || c === null) return true
	return holds(c, values, 0)
}

const MAX_DEPTH = 32

function holds(c: unknown, values: unknown, depth: number): boolean {
	if (depth > MAX_DEPTH || !isObject(c)) return false
	if ('all' in c) return Array.isArray(c.all) && c.all.every((x) => holds(x, values, depth + 1))
	if ('any' in c) return Array.isArray(c.any) && c.any.some((x) => holds(x, values, depth + 1))
	if ('not' in c) return isObject(c.not) && !holds(c.not, values, depth + 1)
	return leafHolds(c, values)
}

/**
 * Every fault in one stored condition, as sentences that say what to do
 * instead. Empty when it is sound and for `undefined` (no condition).
 * @experimental
 */
export function conditionFindings(raw: unknown, at = 'when'): string[] {
	if (raw === undefined || raw === null) return []
	const out: string[] = []
	const walk = (c: unknown, where: string, depth: number) => {
		if (depth > MAX_DEPTH) {
			out.push(`${where}: nests deeper than ${MAX_DEPTH} — flatten it`)
			return
		}
		if (!isObject(c)) {
			out.push(
				`${where}: a condition is { on, equals | truthy | gt | gte | lt | lte | in | equalsPath } or ` +
					`{ all | any: [ … ] } or { not: … } — got ${Array.isArray(c) ? 'a list' : typeof c}`,
			)
			return
		}
		const groups = ['all', 'any', 'not'].filter((k) => k in c)
		if (groups.length > 1 || (groups.length === 1 && 'on' in c)) {
			out.push(
				`${where}: states ${[...groups, ...('on' in c ? ['on'] : [])].join(' and ')} — one of them per condition`,
			)
			return
		}
		if (groups[0] === 'all' || groups[0] === 'any') {
			const list = c[groups[0]]
			if (!Array.isArray(list) || !list.length)
				out.push(`${where}.${groups[0]}: a list of one or more conditions`)
			else list.forEach((x, i) => walk(x, `${where}.${groups[0]}[${i}]`, depth + 1))
			return
		}
		if (groups[0] === 'not') {
			walk(c.not, `${where}.not`, depth + 1)
			return
		}
		if (typeof c.on !== 'string' || !c.on)
			out.push(
				`${where}: 'on' is required — a published-values path such as 'state.world.location'`,
			)
		else if (c.on.startsWith('$'))
			out.push(
				`${where}: 'on' is '${c.on}', which reads as a port reference — a condition reads the published values`,
			)
		else if (c.on.split('.').some((s) => FORBIDDEN_SEGMENTS.has(s)))
			out.push(
				`${where}: 'on' walks a prototype segment — a published-values path names data`,
			)
		const stated = CONDITION_COMPARISONS.filter((k) => c[k] !== undefined)
		if (stated.length !== 1)
			out.push(
				`${where}: states ${stated.length ? stated.join(', ') : 'no comparison'} — exactly one of ` +
					`${CONDITION_COMPARISONS.join(', ')}`,
			)
		if (c.equals !== undefined && !isPrimitive(c.equals))
			out.push(
				`${where}: 'equals' compares a JSON scalar — a string, number, boolean or null`,
			)
		if (c.truthy !== undefined && typeof c.truthy !== 'boolean')
			out.push(`${where}: 'truthy' is true or false`)
		for (const k of ['gt', 'gte', 'lt', 'lte'] as const)
			if (c[k] !== undefined && (typeof c[k] !== 'number' || !Number.isFinite(c[k])))
				out.push(`${where}: '${k}' compares a finite number`)
		if (
			c.in !== undefined &&
			(!Array.isArray(c.in) || !c.in.length || !c.in.every(isPrimitive))
		)
			out.push(`${where}: 'in' is a non-empty list of JSON scalars`)
		if (c.equalsPath !== undefined && (typeof c.equalsPath !== 'string' || !c.equalsPath))
			out.push(`${where}: 'equalsPath' is a published-values path`)
		else if (typeof c.equalsPath === 'string' && c.equalsPath.split('.').includes(ANY_SEGMENT))
			out.push(`${where}: 'equalsPath' names one value — a '*' (any member) belongs in 'on' only`)
		if (typeof c.on === 'string' && c.on.split('.').some((s) => s.includes(ANY_SEGMENT) && s !== ANY_SEGMENT))
			out.push(`${where}: '*' stands alone as a segment ('state.cast.byId.*.hp') — it is not a pattern`)
		const known = new Set(['on', ...CONDITION_COMPARISONS, 'reason'])
		for (const k of Object.keys(c))
			if (!known.has(k))
				out.push(
					`${where}: '${k}' is not a condition key — one of ${[...known].join(', ')}`,
				)
	}
	walk(raw, at, 0)
	return out
}

// ── The typed view: sessionOf(genre) (A5, D6) ───────────────────────────────

/**
 * 🚧 What a condition property holds, as far as its declaration says:
 * `boolean`, `number`, `string`, `enum` (its `members` known), or `unknown`
 * (a list, a derived value, a shape core cannot read a scalar off).
 * @experimental
 * @ruling A5
 */
export type ConditionPropType = 'boolean' | 'number' | 'string' | 'enum' | 'unknown'

const CONDITION_PROP = Symbol.for('serene-pub.condition-prop')

/**
 * 🚧 A **condition property** — one leaf of `sessionOf(genre)`: a typed
 * reference to one published value. It carries the **stored path**
 * (`state.world.weather`) — the only place the string lives — and what the
 * value is (`type`, an enum's `members`, the attribute `slot` that declared
 * it). `V` is the value's TypeScript type, so `eq(s.world.weather, 'stom')` is
 * a compile error when the slot's choices are known. A property exists only
 * if a declaration made it.
 * @experimental
 * @ruling A5, A18
 */
export interface ConditionProp<V = unknown, T extends ConditionPropType = ConditionPropType> {
	/** The stored form: a dotted path into the published values; `*` is "any member". */
	readonly path: string
	readonly type: T
	/** An enum's choices, when its declaration names them. */
	readonly members?: readonly string[]
	/** The attribute slot that declared it, when one did. */
	readonly slot?: string
	/** Phantom — the value's type. Never set. */
	readonly __value?: V
}

/** Is this a condition property (a leaf of `sessionOf(…)`)? @experimental */
export const isConditionProp = (x: unknown): x is ConditionProp =>
	!!x && typeof x === 'object' && (x as Record<symbol, unknown>)[CONDITION_PROP] === true

function prop(path: string, type: ConditionPropType, extra: { members?: readonly string[]; slot?: string } = {}): ConditionProp {
	const p = {
		path,
		type,
		...(extra.members?.length ? { members: Object.freeze([...extra.members]) } : {}),
		...(extra.slot ? { slot: extra.slot } : {}),
	}
	Object.defineProperty(p, CONDITION_PROP, { value: true, enumerable: false })
	return Object.freeze(p) as ConditionProp
}

/** The stored path of a property, refused — naming the fix — when it is not one. */
function pathOf(p: unknown, builder: string): string {
	if (!isConditionProp(p))
		throw new Error(
			`${builder}(…) takes a condition property — s.world.weather from sessionOf(genre) — got ${
				p === undefined ? 'undefined (a property this genre does not declare?)' : typeof p
			}`,
		)
	return p.path
}

/**
 * 🚧 Holds when the property is truthy: `isTrue(s.world.inCombat)`.
 * @experimental
 * @ruling A5
 */
export function isTrue(p: ConditionProp): ConditionLeaf {
	return { on: pathOf(p, 'isTrue'), truthy: true }
}

/**
 * 🚧 Holds when the property equals the value — an enum's member, a number, a
 * string, a boolean. The value is typed by the property: a member the enum
 * does not have does not compile.
 * @experimental
 * @ruling A5
 */
export function eq<V, T extends ConditionPropType>(p: ConditionProp<V, T>, value: NoInfer<V> & ConditionPrimitive): ConditionLeaf {
	return { on: pathOf(p, 'eq'), equals: value }
}

/** A numeric property (or one whose type no declaration states). */
type Numeric = ConditionProp<unknown, 'number' | 'unknown'>

const numberArg = (n: unknown, builder: string): number => {
	if (typeof n !== 'number' || !Number.isFinite(n)) throw new Error(`${builder}(…) compares a finite number`)
	return n
}

/** 🚧 Holds when the number is greater than `n`. @experimental */
export function gt(p: Numeric, n: number): ConditionLeaf {
	return { on: pathOf(p, 'gt'), gt: numberArg(n, 'gt') }
}
/** 🚧 Holds when the number is at least `n`. @experimental */
export function gte(p: Numeric, n: number): ConditionLeaf {
	return { on: pathOf(p, 'gte'), gte: numberArg(n, 'gte') }
}
/** 🚧 Holds when the number is less than `n`. @experimental */
export function lt(p: Numeric, n: number): ConditionLeaf {
	return { on: pathOf(p, 'lt'), lt: numberArg(n, 'lt') }
}
/** 🚧 Holds when the number is at most `n`. @experimental */
export function lte(p: Numeric, n: number): ConditionLeaf {
	return { on: pathOf(p, 'lte'), lte: numberArg(n, 'lte') }
}

/**
 * 🚧 Holds when the property equals one of the values: `oneOf(s.world.weather,
 * ['storm', 'fog'])`. Typed like `eq`.
 * @experimental
 */
export function oneOf<V, T extends ConditionPropType>(
	p: ConditionProp<V, T>,
	values: readonly (NoInfer<V> & ConditionPrimitive)[],
): ConditionLeaf {
	const on = pathOf(p, 'oneOf')
	if (!Array.isArray(values) || !values.length) throw new Error('oneOf(…) takes one or more values')
	return { on, in: [...values] }
}

/** 🚧 Holds when every condition holds. @experimental */
export function and(first: ConditionDecl, ...rest: ConditionDecl[]): ConditionDecl {
	return { all: [first, ...rest] }
}

/** 🚧 Holds when any condition holds. @experimental */
export function or(first: ConditionDecl, ...rest: ConditionDecl[]): ConditionDecl {
	return { any: [first, ...rest] }
}

/** 🚧 Holds when the condition does not — an absent value's leaf is false, so its `not` is true. @experimental */
export function not(c: ConditionDecl): ConditionDecl {
	return { not: c }
}

/**
 * 🚧 Holds when two properties hold the same value (both present):
 * `same(s.message.speaker, s.world.host)`. The first may be "any member"
 * (`s.cast.any.…`); the second names one value.
 * @experimental
 */
export function same<V, T extends ConditionPropType>(
	a: ConditionProp<V, T>,
	b: ConditionProp<NoInfer<V>, ConditionPropType> | ConditionProp<unknown, 'unknown'>,
): ConditionLeaf {
	const on = pathOf(a, 'same')
	const other = pathOf(b, 'same')
	if (other.split('.').includes(ANY_SEGMENT))
		throw new Error(`same(…): the second property names one value — "any member" belongs first`)
	return { on, equalsPath: other }
}

// ── Deriving the view's types from declarations ──

/** `time-of-day` → `timeOfDay`. */
type Camel<S extends string> = S extends `${infer H}-${infer T}` ? `${H}${Capitalize<Camel<T>>}` : S
/** `core:slot/time-of-day@1` → `time-of-day`; `never` for an id the type does not know literally. */
type SlugOfId<Id> = Id extends `${string}:slot/${infer S}@${number}` ? S : never
/** What a slot declaration declared — its props (`DeclaredAttributeSlot`). */
type DeclaredOf<S> = S extends { readonly __declared?: infer P } ? NonNullable<P> : never
type IdOfDecl<S> = S extends { readonly id: infer I } ? I : never
type AppliesOf<S> = DeclaredOf<S> extends { readonly appliesTo: readonly (infer A)[] } ? A : never
type ChoicesOf<P> = P extends { readonly config: { readonly of: readonly (infer O extends string)[] } }
	? O
	: P extends { readonly shape: { readonly of: readonly (infer O extends string)[] } }
		? O
		: string
/** A core stat shape's id reads as its kind: `core:stat-shape/number@1` → `number`. */
type ShapeKindOfId<Id> = Id extends `${string}:stat-shape/${infer K}@${number}` ? K : never

type FieldPropOf<F, Choices = string> = F extends { readonly type: 'boolean' }
	? ConditionProp<boolean, 'boolean'>
	: F extends { readonly type: 'number' | 'integer' }
		? ConditionProp<number, 'number'>
		: F extends { readonly type: 'enum'; readonly of: readonly (infer O extends string)[] }
			? ConditionProp<O, 'enum'>
			: F extends { readonly type: 'enum' }
				? ConditionProp<Choices, 'enum'>
				: F extends { readonly type: 'string' | 'text' }
					? ConditionProp<string, 'string'>
					: ConditionProp<unknown, 'unknown'>

type ShapeIdProp<K, P> = K extends 'number'
	? ConditionProp<number, 'number'>
	: K extends 'choice'
		? ConditionProp<ChoicesOf<P>, 'enum'>
		: K extends 'boolean'
			? ConditionProp<boolean, 'boolean'>
			: K extends 'text' | 'story-time'
				? ConditionProp<string, 'string'>
				: ConditionProp<unknown, 'unknown'>

/**
 * 🚧 The condition property a slot declaration makes, typed from what it
 * declared: its `type`, else its `shape` (a field, or a core stat shape by id),
 * an enum's choices from `config.of`.
 * @experimental
 */
export type SlotConditionProp<S> = DeclaredOf<S> extends infer P
	? P extends { readonly type: 'boolean' }
		? ConditionProp<boolean, 'boolean'>
		: P extends { readonly type: 'integer' }
			? ConditionProp<number, 'number'>
			: P extends { readonly type: 'enum' }
				? ConditionProp<ChoicesOf<P>, 'enum'>
				: P extends { readonly type: 'text' }
					? ConditionProp<string, 'string'>
					: P extends { readonly type: 'list' | 'derived' }
						? ConditionProp<unknown, 'unknown'>
						: P extends { readonly shape: infer Sh }
							? Sh extends string
								? ShapeIdProp<ShapeKindOfId<Sh>, P>
								: FieldPropOf<Sh, ChoicesOf<P>>
							: ConditionProp<unknown, 'unknown'>
	: never

type SlotsOfGenre<G> = G extends { readonly __declared?: { readonly slots: infer L } }
	? NonNullable<L> extends readonly (infer S)[]
		? S
		: never
	: never
type FieldsOfGenre<G> = G extends { readonly __declared?: { readonly fields: infer F } } ? NonNullable<F> : {}
/** A genre field's kind as `genre()` projects it (plain kinds, so a frozen genre's type names nothing unfrozen). */
type FieldKindProp<K> = K extends 'boolean'
	? ConditionProp<boolean, 'boolean'>
	: K extends 'number'
		? ConditionProp<number, 'number'>
		: K extends 'string'
			? ConditionProp<string, 'string'>
			: K extends readonly ['enum', infer O]
				? ConditionProp<O, 'enum'>
				: ConditionProp<unknown, 'unknown'>

type MembersFromSlots<S, Owner extends SlotAppliesTo> = {
	readonly [X in S as Owner extends AppliesOf<X> ? Camel<SlugOfId<IdOfDecl<X>>> : never]: SlotConditionProp<X>
}

type VocabMembers<V, Owner extends SlotAppliesTo> = V extends { readonly [K in Owner]: infer M }
	? { readonly [K in keyof M & string]: SlotConditionProp<M[K]> }
	: {}

type UnionToIntersection<U> = (U extends unknown ? (x: U) => void : never) extends (x: infer I) => void ? I : never

type VocabsOf<O> =
	| (O extends { readonly ruleset?: infer R } ? NonNullable<R> : never)
	| (O extends { readonly vocabularies?: readonly (infer V)[] } ? V : never)

type OwnerMembers<G, O, Owner extends SlotAppliesTo> = MembersFromSlots<SlotsOfGenre<G>, Owner> &
	UnionToIntersection<VocabMembers<VocabsOf<O>, Owner>>

type AnnexMembers<L> = L extends readonly (infer F)[]
	? {
			readonly [X in F as X extends { readonly key: infer K extends string } ? Camel<K> : never]: FieldPropOf<
				X extends { readonly shape: infer Sh } ? Sh : never
			>
		}
	: {}

type AnnexOf<O> = O extends { readonly annex?: infer A }
	? { readonly [Owner in keyof NonNullable<A> & string]: AnnexMembers<NonNullable<A>[Owner]> }
	: {}

/**
 * 🚧 The host's fixed facts a condition may test (A5): whether the session is
 * generating, its turn, round and last speaker (R51, R52), the open form's action, the backdrop, each cast member's current
 * sprite, which invokable functions the session's rules use (S3), and — on an action that carries one — the message (`item.*` in the
 * published values; absent elsewhere, so a condition on it reads false).
 * @experimental
 * @ruling A5
 */
export interface SessionHostFacts {
	/** `session.generating` — a reply or an action run is in flight. */
	readonly generating: ConditionProp<boolean, 'boolean'>
	/** 🚧 `session.turn` — turns taken on the story's lane so far (R51). */
	readonly turn: ConditionProp<number, 'number'>
	/** 🚧 `session.round` — the round in progress on the story's lane, counted from 1 (R52). */
	readonly round: ConditionProp<number, 'number'>
	/** 🚧 `session.lastSpeaker` — who took the last turn on the story's lane: a participant reference, or `narrator` (R51). */
	readonly lastSpeaker: ConditionProp<string, 'string'>
	/** `session.openForm.action` — the action that answers the open form, when one is open. */
	readonly openForm: { readonly action: ConditionProp<string, 'string'> }
	/** `backdrop.*` — whether the session has a backdrop, and its file id. */
	readonly backdrop: { readonly set: ConditionProp<boolean, 'boolean'>; readonly mediaId: ConditionProp<number, 'number'> }
	/** `sprites.byId.*.…` — some cast member's current sprite set and label. */
	readonly sprites: { readonly any: { readonly set: ConditionProp<string, 'string'>; readonly label: ConditionProp<string, 'string'> } }
	/**
	 * 🚧 `rules.invokable.<function>` — the session's rules use this
	 * **invokable** function, so a **rules action** offers it at the composer
	 * (PLAN-genres-seams S3, 2026-10-23): true while its ruleset uses it,
	 * absent otherwise — `not(isTrue(s.rules.invokable(restFunction)))` holds
	 * when the rules offer no Rest of their own. Named by the function's
	 * declaration (any `{ id }` — `defineFunction`'s), never its id typed; the
	 * path's segment is `rulesInvokableSegment(id)`.
	 */
	readonly rules: { readonly invokable: (fn: { readonly id: string }) => ConditionProp<boolean, 'boolean'> }
	/** `item.*` — the message an action acts on (the message venue). */
	readonly message: {
		readonly id: ConditionProp<number, 'number'>
		readonly isNewest: ConditionProp<boolean, 'boolean'>
		readonly hidden: ConditionProp<boolean, 'boolean'>
		readonly generating: ConditionProp<boolean, 'boolean'>
		readonly role: ConditionProp<string, 'string'>
		readonly mine: ConditionProp<boolean, 'boolean'>
		readonly hasSwipes: ConditionProp<boolean, 'boolean'>
		readonly greeting: ConditionProp<boolean, 'boolean'>
		readonly channel: ConditionProp<string, 'string'>
		readonly speaker: ConditionProp<string, 'string'>
	}
}

/**
 * 🚧 The typed view `sessionOf(genre, opts)` returns (A5): what a condition
 * may test in a session of that genre, from declarations only.
 *
 * - `world.*` — world attributes (`state.world.<slug>`);
 * - `cast.any.*` — "some cast member's" attribute (`state.cast.byId.*.<slug>`);
 * - `locations.any.*` — "some place's" attribute (`state.locations.byId.*.<slug>`);
 * - `fields.*` — the genre's session fields (`session.fields.<key>`);
 * - `annex[owner].*` — declared annex fields (`annex.<owner>.<key>`);
 * - the host's facts (`SessionHostFacts`).
 *
 * Attributes come from the genre's slots (and sheets, at run time), the
 * ruleset's stats and the vocabularies passed; a slot's member word is its
 * slug in camel case (`time-of-day` → `timeOfDay`), a vocabulary's its own.
 * @experimental
 * @ruling A5, A19
 */
export type SessionOf<G, O = {}> = {
	readonly world: OwnerMembers<G, O, 'world'>
	readonly cast: { readonly any: OwnerMembers<G, O, 'cast'> }
	readonly locations: { readonly any: OwnerMembers<G, O, 'location'> }
	readonly fields: { readonly [K in keyof FieldsOfGenre<G> & string]: FieldKindProp<FieldsOfGenre<G>[K]> }
	readonly annex: AnnexOf<O>
} & SessionHostFacts

/**
 * 🚧 What `sessionOf` reads beside the genre: the session's **ruleset** (a
 * vocabulary — `rulesets.core.visItineris` — or a declared ruleset, read as
 * its own stats plus the vocabularies it plays), further **vocabularies**
 * (the common one, a custom one), and the **annex** fields to type, by owner.
 * @experimental
 */
export interface SessionOfOptions {
	readonly ruleset?: Vocabulary | RulesetDecl
	readonly vocabularies?: readonly Vocabulary[]
	readonly annex?: Readonly<Record<string, readonly AnnexFieldDecl[]>>
}

/** The kind and choices a declared attribute slot's value has, read at run time. */
function slotValueType(slot: AttributeSlotDecl): { type: ConditionPropType; members?: readonly string[] } {
	const field: FieldDecl | undefined =
		typeof slot.shape === 'object' ? slot.shape : typeof slot.shape === 'string' ? getStatShape(slot.shape)?.field : undefined
	const choices = slot.config?.of ?? field?.of
	switch (slot.type) {
		case 'boolean':
			return { type: 'boolean' }
		case 'integer':
			return { type: 'number' }
		case 'enum':
			return { type: 'enum', members: choices }
		case 'text':
			return { type: 'string' }
		default:
			return { type: 'unknown' }
	}
}

function fieldValueType(f: FieldDecl | undefined): { type: ConditionPropType; members?: readonly string[] } {
	switch (f?.type) {
		case 'boolean':
			return { type: 'boolean' }
		case 'number':
		case 'integer':
			return { type: 'number' }
		case 'enum':
			return { type: 'enum', members: f.of }
		case 'string':
		case 'text':
			return { type: 'string' }
		default:
			return { type: 'unknown' }
	}
}

const OWNER_PATH: Record<SlotAppliesTo, string> = {
	world: 'state.world',
	cast: `state.cast.byId.${ANY_SEGMENT}`,
	location: `state.locations.byId.${ANY_SEGMENT}`,
}

/** The host's fixed facts, at run time — one shape, every view. */
function hostFacts(): SessionHostFacts {
	const item = (k: string, t: ConditionPropType) => prop(`item.${k}`, t)
	return {
		generating: prop('session.generating', 'boolean') as ConditionProp<boolean, 'boolean'>,
		turn: prop('session.turn', 'number') as ConditionProp<number, 'number'>,
		round: prop('session.round', 'number') as ConditionProp<number, 'number'>,
		lastSpeaker: prop('session.lastSpeaker', 'string') as ConditionProp<string, 'string'>,
		openForm: Object.freeze({ action: prop('session.openForm.action', 'string') }) as SessionHostFacts['openForm'],
		backdrop: Object.freeze({ set: prop('backdrop.set', 'boolean'), mediaId: prop('backdrop.mediaId', 'number') }) as SessionHostFacts['backdrop'],
		sprites: Object.freeze({
			any: Object.freeze({
				set: prop(`sprites.byId.${ANY_SEGMENT}.set`, 'string'),
				label: prop(`sprites.byId.${ANY_SEGMENT}.label`, 'string'),
			}),
		}) as SessionHostFacts['sprites'],
		rules: Object.freeze({
			invokable: (fn: { readonly id: string }) => {
				if (!fn || typeof fn.id !== 'string' || !fn.id)
					throw new Error('s.rules.invokable(fn): pass the function’s declaration — defineFunction(…)')
				return prop(`rules.invokable.${rulesInvokableSegment(fn.id)}`, 'boolean') as ConditionProp<boolean, 'boolean'>
			},
		}) as SessionHostFacts['rules'],
		message: Object.freeze({
			id: item('id', 'number'),
			isNewest: item('isNewest', 'boolean'),
			hidden: item('hidden', 'boolean'),
			generating: item('generating', 'boolean'),
			role: item('role', 'string'),
			mine: item('mine', 'boolean'),
			hasSwipes: item('hasSwipes', 'boolean'),
			greeting: item('greeting', 'boolean'),
			channel: item('channel', 'string'),
			speaker: item('speaker', 'string'),
		}) as SessionHostFacts['message'],
	}
}

/** 🚧 The annex owner as a path segment: a package slug's dots would split the path, so they read as `_`. @experimental */
export const annexOwnerSegment = (owner: string): string => owner.replace(/\./g, '_')

/**
 * 🚧 A function id as the segment of `rules.invokable.<segment>` in the
 * published values (S3): a package slug's dots would split the path, so they
 * read as `_`, as an annex owner's do. What the host publishes under and the
 * typed view reads — one rule for both. @experimental
 */
export const rulesInvokableSegment = (functionId: string): string => functionId.replace(/\./g, '_')

/**
 * 🚧 The typed view of a session of `genre` (A5, D6) — what a registration's
 * `when` (and an action's enabled-when, a cadence's `whenValue`) may test,
 * derived from declarations only, the way Drizzle derives columns from a table:
 *
 * ```ts
 * const s = sessionOf(storyGenre, { ruleset: rulesets.core.visItineris, vocabularies: [rulesets.common] })
 * register(coreEvents.messageRespond, combatReply, { when: isTrue(s.world.inCombat) })
 * when: and(eq(s.world.weather, 'storm'), gt(s.cast.any.hp, 0))
 * ```
 *
 * Built once per call; every leaf is a frozen `ConditionProp`. At run time the
 * genre's sheets and a declared ruleset's played vocabularies are read too (the
 * types see the genre's slots and the vocabulary objects passed).
 * @experimental
 * @ruling A5, A19, R31
 */
export function sessionOf<G extends GenreDecl, const O extends SessionOfOptions = {}>(
	genre: G,
	opts?: O,
): SessionOf<G, O> {
	if (!genre || typeof genre !== 'object' || typeof genre.id !== 'string')
		throw new Error('sessionOf(genre): pass the genre declaration — genre(…)')
	const groups: Record<SlotAppliesTo, Record<string, ConditionProp>> = { world: {}, cast: {}, location: {} }
	const addSlot = (word: string, slot: AttributeSlotDecl, owners: readonly SlotAppliesTo[]) => {
		const slug = slotSlug(slot.id)
		if (!slug) return
		for (const owner of owners) {
			if (word in groups[owner]) continue
			const t = slotValueType(slot)
			groups[owner][word] = prop(`${OWNER_PATH[owner]}.${slug}`, t.type, { members: t.members, slot: slot.id })
		}
	}
	const ruleset = opts?.ruleset
	// A declared ruleset's `map` (A19): a member it maps reads as its own stat,
	// whoever names it — a played vocabulary.
	const mapped = new Map(
		(ruleset && !isVocabulary(ruleset) ? ((ruleset as RulesetDecl).map ?? []) : []).map(([from, to]) => [from, to] as const),
	)
	const throughMap = (slot: AttributeSlotDecl): AttributeSlotDecl => {
		const to = mapped.get(slot.id)
		return (to && getAttributeSlot(to)) || slot
	}
	// 🚧 RF fix 8: a genre brings no slots; what the host keeps for its
	// sessions (the place, the time, a tool's own state) is testable instead.
	for (const kept of hostStateFor(genre as GenreDecl)) {
		const slot = getAttributeSlot(kept.slot)
		if (slot) addSlot(memberWord(slotSlug(slot.id)), slot, kept.owners ?? slot.appliesTo)
	}
	const addVocabulary = (v: Vocabulary) => {
		for (const owner of VOCABULARY_OWNERS)
			for (const [word, slot] of Object.entries(v[owner] as VocabularyGroup)) addSlot(word, throughMap(slot), [owner])
	}
	if (isVocabulary(ruleset)) addVocabulary(ruleset)
	else if (ruleset && typeof ruleset === 'object' && Array.isArray((ruleset as RulesetDecl).stats)) {
		const decl = ruleset as RulesetDecl
		addVocabulary(rulesetVocabulary(decl))
		for (const v of playedVocabularies(decl)) addVocabulary(v)
	}
	for (const v of opts?.vocabularies ?? []) if (isVocabulary(v)) addVocabulary(v)

	const fields: Record<string, ConditionProp> = {}
	for (const [key, f] of Object.entries((genre.shape?.fields ?? {}) as Record<string, FieldDecl>)) {
		const t = fieldValueType(f)
		fields[key] = prop(`session.fields.${key}`, t.type, { members: t.members })
	}

	const annex: Record<string, Record<string, ConditionProp>> = {}
	for (const [owner, list] of Object.entries(opts?.annex ?? {})) {
		const out: Record<string, ConditionProp> = {}
		for (const f of list ?? []) {
			if (!f || typeof f.key !== 'string') continue
			const t = fieldValueType(f.shape)
			out[memberWord(f.key)] = prop(`annex.${annexOwnerSegment(owner)}.${f.key}`, t.type, { members: t.members })
		}
		annex[owner] = Object.freeze(out)
	}

	return Object.freeze({
		world: Object.freeze(groups.world),
		cast: Object.freeze({ any: Object.freeze(groups.cast) }),
		locations: Object.freeze({ any: Object.freeze(groups.location) }),
		fields: Object.freeze(fields),
		annex: Object.freeze(annex),
		...hostFacts(),
	}) as unknown as SessionOf<G, O>
}

/**
 * 🚧 Every condition property of a view, flat, with its name as a person reads
 * it (`cast.any.hp`) — what the admin's condition picker lists (A5: no
 * free-text paths anywhere).
 * @experimental
 * @ruling A5
 */
export function conditionPropsOf(view: object): { readonly name: string; readonly prop: ConditionProp }[] {
	const out: { name: string; prop: ConditionProp }[] = []
	const walk = (v: unknown, at: string, depth: number) => {
		if (depth > 6 || !v || typeof v !== 'object') return
		if (isConditionProp(v)) {
			out.push({ name: at, prop: v })
			return
		}
		for (const [k, x] of Object.entries(v)) walk(x, at ? `${at}.${k}` : k, depth + 1)
	}
	walk(view, '', 0)
	return out
}
