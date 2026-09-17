/**
 * The value-type system (24 §8).
 *
 * Authoring goes through a toolkit facade — `v.integer({})`, `v.weights({})`,
 * `v.stackedBar({})` — for ergonomics and dot-discoverability; the output is
 * always **frozen plain data** in single-key typed serialization:
 *
 *     v.integer({ min: 0, max: 4096 })  →  { "integer@1": { min: 0, max: 4096 } }
 *
 * The key IS the type id, versioned exactly like node types: `integer@2` is a
 * new key, never a mutated schema under the old one. Package-minted kinds
 * serialize namespaced (`acme.dice:roll@1`) via a context-bound toolkit, so
 * collision with core or another package is impossible by construction.
 * Unknown keys degrade safely: consumers render a read-only fallback and
 * refuse writes to types they cannot validate.
 *
 * Constraints come in two tiers, both pure data (24 §8):
 *  - T1 declarative: min/max/step/pattern/options; group: sumTo/normalize.
 *  - T2 predicates: `requiredWhen`/`visibleWhen`/`enabledWhen`, reusing the
 *    route-predicate shape ({path, equals, truthy}) — declarations that read
 *    as sentences, renderable without running anything.
 * T3 (validator code) is deliberately absent.
 *
 * Four consumers key off the same id — factory (here), validator (here),
 * control renderer (@serene-pub/controls), scaffold printer (cli) — and a
 * conformance canary asserts no shipped type is missing any of the four.
 */

/** One condition over sibling values — the route-predicate shape (20 §10). */
export interface ValuePredicate {
	/** Dot path into the sibling value map. */
	path: string
	/** Fires when the value strictly equals this literal. */
	equals?: unknown
	/** Fires when the value is truthy. */
	truthy?: boolean
}

/** Fields every declaration may carry, regardless of kind. */
export interface ValueCommon {
	label?: unknown
	description?: unknown
	/**
	 * No shipped default — a config MUST supply this value. Requiredness is
	 * what makes "missing" a fact the coverage report can state (24 §7).
	 */
	required?: boolean
	requiredWhen?: ValuePredicate
	visibleWhen?: ValuePredicate
	enabledWhen?: ValuePredicate
}

/**
 * A value declaration in single-key form: exactly one key, which is the
 * versioned type id; the payload is that type's own schema.
 */
export type ValueDecl = { readonly [definitionId: string]: Record<string, unknown> }

/** The one key of a declaration — its type id. Throws on malformed decls. */
export function valueKind(decl: ValueDecl): string {
	const keys = Object.keys(decl)
	if (keys.length !== 1)
		throw new Error(
			`a value declaration holds exactly one key (its type id); got [${keys.join(', ')}]`,
		)
	return keys[0]!
}

/** Type id syntax: `name@N` or `owner:name@N` — same discipline as node types. */
const VALUE_TYPE_ID = /^([a-z0-9]+(?:[.-][a-z0-9]+)*:)?[a-z0-9]+(?:-[a-z0-9]+)*@\d+$/

export function assertValueTypeId(id: string): void {
	if (!VALUE_TYPE_ID.test(id))
		throw new Error(
			`'${id}' is not a valid value-type id. Use 'name@N' for core kinds or ` +
				`'owner:name@N' for package-minted ones — the version lives in the key ` +
				`('integer@2' is a new key, never a mutated 'integer@1').`,
		)
}

const freeze = <T extends object>(o: T): T => Object.freeze(o)

/** Builds the single-key object, dropping undefined fields for canonical JSON. */
function decl(definitionId: string, props: Record<string, unknown>): ValueDecl {
	assertValueTypeId(definitionId)
	const clean: Record<string, unknown> = {}
	for (const [k, val] of Object.entries(props)) if (val !== undefined) clean[k] = val
	return freeze({ [definitionId]: freeze(clean) }) as ValueDecl
}

/* ── core kind schemas ──────────────────────────────────────────────────── */

export interface IntegerProps extends ValueCommon {
	min?: number
	max?: number
	step?: number
	default?: number
}
export interface NumberProps extends ValueCommon {
	min?: number
	max?: number
	step?: number
	default?: number
}
export interface WeightsProps extends ValueCommon {
	/** Part name → author-default weight. The parts are the group. */
	parts: Record<string, number>
	/**
	 * The pinned sum (100 for percents, 1 for fractions). Absent = free
	 * weights; add `normalize: true` when the consumer reads them normalized.
	 */
	total?: number
	step?: number
	/** Per-part floor/ceiling. */
	min?: number
	max?: number
	normalize?: boolean
	/** Which control edits this — presentation, not domain. */
	control?: 'stacked-bar' | 'sliders'
}
export interface SelectProps extends ValueCommon {
	/**
	 * A closed set. `description` is part of the option because the control
	 * shows it under the picker — a stored value like `rag` is not a word
	 * anybody chose to read, and the place to say what it means is the
	 * declaration, not the host.
	 */
	options: ReadonlyArray<string | { value: string; label?: unknown; description?: unknown }>
	default?: string
}
export interface RankingProps extends ValueCommon {
	/** The orderable set; the value is a permutation of it. */
	options: ReadonlyArray<string>
	default?: ReadonlyArray<string>
}
export interface TextProps extends ValueCommon {
	minLength?: number
	maxLength?: number
	/** Anchored ECMAScript regex source. */
	pattern?: string
	default?: string
	multiline?: boolean
}
export interface BooleanProps extends ValueCommon {
	default?: boolean
}
/** A prompts-ref slot: the value is a reference to a shipped/named prompt. */
export interface PromptProps extends ValueCommon {}

/* ── the toolkit ────────────────────────────────────────────────────────── */

export interface ValueToolkit {
	integer(props?: IntegerProps): ValueDecl
	number(props?: NumberProps): ValueDecl
	/** Sugar: a number in [0, 1] with a 0.01 step. */
	fraction(props?: Omit<NumberProps, 'min' | 'max'>): ValueDecl
	weights(props: WeightsProps): ValueDecl
	/** Sugar: weights rendered as a stacked bar. */
	stackedBar(props: Omit<WeightsProps, 'control'>): ValueDecl
	select(
		options: SelectProps['options'] | SelectProps,
		props?: Omit<SelectProps, 'options'>,
	): ValueDecl
	ranking(options: RankingProps['options'], props?: Omit<RankingProps, 'options'>): ValueDecl
	text(props?: TextProps): ValueDecl
	boolean(props?: BooleanProps): ValueDecl
	prompt(props?: PromptProps): ValueDecl
	/**
	 * A package-minted kind. With a context-bound toolkit the id is prefixed
	 * with the package namespace automatically; the bare toolkit refuses,
	 * because an unprefixed custom kind could shadow a future core one.
	 */
	custom(kind: string, version: number, props: Record<string, unknown>): ValueDecl
}

/**
 * Construct a toolkit. `ns` is the declaring package's namespace — the
 * context-bound form `announce()` hands authors — and prefixes every custom
 * kind. The bare exported `v` has no namespace and mints no custom kinds.
 */
export function makeValueToolkit(ns?: string): ValueToolkit {
	return freeze({
		integer: (p: IntegerProps = {}) => decl('integer@1', { ...p }),
		number: (p: NumberProps = {}) => decl('number@1', { ...p }),
		fraction: (p: Omit<NumberProps, 'min' | 'max'> = {}) =>
			decl('number@1', { min: 0, max: 1, step: p.step ?? 0.01, ...p }),
		weights: (p: WeightsProps) => {
			validateWeightsProps(p)
			return decl('weights@1', { ...p })
		},
		stackedBar: (p: Omit<WeightsProps, 'control'>) => {
			validateWeightsProps(p)
			return decl('weights@1', { ...p, control: 'stacked-bar' })
		},
		select: (
			options: SelectProps['options'] | SelectProps,
			props?: Omit<SelectProps, 'options'>,
		) => {
			const p: SelectProps = Array.isArray(options)
				? { options, ...props }
				: (options as SelectProps)
			if (!p.options?.length) throw new Error('select needs at least one option')
			return decl('select@1', { ...p })
		},
		ranking: (options: RankingProps['options'], props?: Omit<RankingProps, 'options'>) => {
			if (!options?.length) throw new Error('ranking needs at least one option')
			return decl('ranking@1', { options, ...props })
		},
		text: (p: TextProps = {}) => {
			if (p.pattern !== undefined) new RegExp(p.pattern) // throws at the author's line
			return decl('text@1', { ...p })
		},
		boolean: (p: BooleanProps = {}) => decl('boolean@1', { ...p }),
		prompt: (p: PromptProps = {}) => decl('prompt-ref@1', { ...p }),
		custom: (kind: string, version: number, props: Record<string, unknown>) => {
			if (!ns)
				throw new Error(
					`custom value kinds need a package context — use the toolkit announce() hands you, ` +
						`so '${kind}' serializes namespaced ('yourpkg:${kind}@${version}') and cannot ` +
						`shadow a core kind.`,
				)
			return decl(`${ns}:${kind}@${version}`, props)
		},
	})
}

/** Eager construction checks — thrown at the author's line, not in a document pass. */
function validateWeightsProps(p: WeightsProps): void {
	const parts = Object.entries(p.parts ?? {})
	if (!parts.length) throw new Error('weights needs at least one part')
	if (p.total !== undefined) {
		const sum = parts.reduce((a, [, w]) => a + w, 0)
		// Author defaults must satisfy the constraint they impose on everyone else.
		if (Math.abs(sum - p.total) > 1e-9)
			throw new Error(
				`weights parts sum to ${sum}, but total is pinned to ${p.total} — ` +
					`the author defaults must satisfy the constraint they declare`,
			)
	}
	for (const [name, w] of parts) {
		if (p.min !== undefined && w < p.min)
			throw new Error(`part '${name}' is below min ${p.min}`)
		if (p.max !== undefined && w > p.max)
			throw new Error(`part '${name}' is above max ${p.max}`)
	}
}

/** The bare toolkit: core kinds only, no custom minting. */
export const v: ValueToolkit = makeValueToolkit()

/* ── validation (the server-side half; same declarations) ───────────────── */

type Validator = (schema: Record<string, unknown>, value: unknown) => string[]

const num = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)

const numberValidator =
	(integer: boolean): Validator =>
	(s, value) => {
		const errors: string[] = []
		if (!num(value)) return [`expected a number, got ${typeof value}`]
		if (integer && !Number.isInteger(value)) errors.push('expected an integer')
		if (num(s.min) && value < s.min) errors.push(`below min ${s.min}`)
		if (num(s.max) && value > s.max) errors.push(`above max ${s.max}`)
		return errors
	}

/**
 * Validators for the shipped kinds, keyed by type id. Kept beside the
 * factories so adding a kind is one edit — the conformance canary refuses a
 * factory output whose kind has no validator here.
 */
export const valueValidators: Record<string, Validator> = {
	'integer@1': numberValidator(true),
	'number@1': numberValidator(false),
	'weights@1': (s, value) => {
		if (typeof value !== 'object' || value === null || Array.isArray(value))
			return ['expected an object of part → weight']
		const errors: string[] = []
		const declared = Object.keys((s.parts as Record<string, number>) ?? {})
		const got = value as Record<string, unknown>
		for (const k of Object.keys(got))
			if (!declared.includes(k)) errors.push(`unknown part '${k}'`)
		for (const k of declared) {
			const w = got[k]
			if (!num(w)) {
				errors.push(`part '${k}' is not a number`)
				continue
			}
			if (num(s.min) && w < s.min) errors.push(`part '${k}' below min ${s.min}`)
			if (num(s.max) && w > s.max) errors.push(`part '${k}' above max ${s.max}`)
		}
		if (num(s.total)) {
			const sum = declared.reduce((a, k) => a + (num(got[k]) ? (got[k] as number) : 0), 0)
			if (Math.abs(sum - (s.total as number)) > 1e-9)
				errors.push(`parts sum to ${sum}, expected ${s.total}`)
		}
		return errors
	},
	'select@1': (s, value) => {
		const opts = ((s.options as SelectProps['options']) ?? []).map((o) =>
			typeof o === 'string' ? o : o.value,
		)
		return typeof value === 'string' && opts.includes(value)
			? []
			: [`expected one of [${opts.join(', ')}]`]
	},
	'ranking@1': (s, value) => {
		const opts = (s.options as string[]) ?? []
		if (!Array.isArray(value)) return ['expected an array']
		const sorted = [...(value as unknown[])].sort()
		const expected = [...opts].sort()
		return JSON.stringify(sorted) === JSON.stringify(expected)
			? []
			: [`expected a permutation of [${opts.join(', ')}]`]
	},
	'text@1': (s, value) => {
		if (typeof value !== 'string') return ['expected a string']
		const errors: string[] = []
		if (num(s.minLength) && value.length < s.minLength)
			errors.push(`shorter than minLength ${s.minLength}`)
		if (num(s.maxLength) && value.length > s.maxLength)
			errors.push(`longer than maxLength ${s.maxLength}`)
		if (typeof s.pattern === 'string' && !new RegExp(s.pattern).test(value))
			errors.push(`does not match pattern ${s.pattern}`)
		return errors
	},
	'boolean@1': (_s, value) => (typeof value === 'boolean' ? [] : ['expected a boolean']),
	'prompt-ref@1': (_s, value) =>
		typeof value === 'string' || typeof value === 'number'
			? []
			: ['expected a prompt reference'],
	// A media value is the blob's public address — the uuid, never a path and
	// never bytes. Validated by shape rather than by looking it up: whether it
	// still exists is the host's question at read time, not the schema's.
	'media-ref@1': (_s, value) =>
		typeof value === 'string' &&
		/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
			? []
			: ['expected a media uuid'],
}

/**
 * Validate one value against its declaration. Unknown type ids refuse —
 * a consumer must never accept a write it cannot check (24 §8).
 */
export function validateValue(declaration: ValueDecl, value: unknown): string[] {
	const kind = valueKind(declaration)
	const validator = valueValidators[kind]
	if (!validator) return [`unknown value type '${kind}' — refusing the write`]
	return validator(declaration[kind]!, value)
}

/**
 * A deliberate hole (24 §7): type-checks wherever a value goes, so authoring
 * can continue — but the coverage report lists it as a named gap, and
 * validation refuses it like any other unknown.
 */
export function todo(note: string): { 'todo@1': { note: string } } {
	return freeze({ 'todo@1': freeze({ note }) })
}

export const isTodo = (value: unknown): value is { 'todo@1': { note: string } } =>
	typeof value === 'object' &&
	value !== null &&
	Object.keys(value).length === 1 &&
	'todo@1' in (value as object)

/** Every kind the bare toolkit can mint — the registry the canary checks. */
export const shippedValueKinds = Object.freeze(Object.keys(valueValidators))

/**
 * The bridge from the settings-schema vocabulary (`{type:'integer', …}` on
 * node-type slots) to value declarations (24 T6c). Derived at read, never
 * stored — no document or hash changes — so panels and controls can speak
 * the value-decl contract while the schemas migrate underneath at their own
 * pace. Unknown entry types map to nothing, and the caller keeps its
 * legacy rendering for them.
 */
export function valueDeclOf(entry: unknown): ValueDecl | null {
	const e = entry as Record<string, any>
	if (!e || typeof e !== 'object') return null
	const common: Record<string, unknown> = {}
	if (e.default !== undefined) common.default = e.default
	if (e.min !== undefined) common.min = e.min
	if (e.max !== undefined) common.max = e.max
	switch (e.type) {
		case 'integer':
			return decl('integer@1', common)
		case 'number':
			return decl('number@1', common)
		case 'boolean':
			return decl('boolean@1', {
				...(e.default !== undefined ? { default: e.default } : {}),
			})
		case 'string':
			return decl('text@1', {
				...(e.default !== undefined ? { default: e.default } : {}),
			})
		// The plugin-settings vocabulary (settings.ts `FieldDecl`) spells a
		// multiline string `text`, and marks structured payloads a form cannot
		// decompose with `format: 'json'`. Both are the same value type — a
		// text box that wants rows — so they bridge here rather than growing a
		// second bridge beside this one.
		//
		// The node-slot vocabulary's `text` control is the same multi-line
		// string (an envoy's instructions are the first parameter to declare
		// one, U5g), so the app's config panel hands it through unchanged.
		case 'text':
			return decl('text@1', {
				multiline: true,
				...(e.default !== undefined
					? {
							default:
								e.format === 'json'
									? JSON.stringify(e.default, null, 2)
									: e.default,
						}
					: {}),
			})
		case 'enum': {
			const options = ((e.of as unknown[]) ??
				(e.members as any[])?.map((m) => ({
					value: String(m.key ?? m),
					label: m.i18n ?? m.label,
				})) ??
				[]) as SelectProps['options']
			if (!options.length) return null
			return decl('select@1', { options, ...common })
		}
		case 'share': {
			// Normalised fractions: the consumer reads shares, zero is a
			// band's off switch — weights with normalize, drawn as the bar.
			const parts = Object.fromEntries(
				((e.members as any[]) ?? []).map((m) => [
					String(m.key ?? m),
					Number((e.default ?? {})[String(m.key ?? m)] ?? 0),
				]),
			)
			if (!Object.keys(parts).length) return null
			return decl('weights@1', {
				parts,
				normalize: true,
				control: 'stacked-bar',
			})
		}
		case 'media': {
			// Like `prompt-ref`, the choices are instance data — this user's
			// media library, not anything a declaration can enumerate — so the
			// host supplies the control. The declaration carries only which
			// kinds to offer; `accepts` defaults to images, which is what
			// nearly every such field wants.
			return decl('media-ref@1', {
				accepts:
					Array.isArray(e.accepts) && e.accepts.length
						? e.accepts
						: ['image'],
				...(e.default !== undefined ? { default: e.default } : {}),
			})
		}
		case 'perMember': {
			// Free numbers per member — weights without a pinned total.
			const parts = Object.fromEntries(
				((e.members as any[]) ?? []).map((m) => [
					String(m.key ?? m),
					Number((e.default ?? {})[String(m.key ?? m)] ?? 0),
				]),
			)
			if (!Object.keys(parts).length) return null
			return decl('weights@1', { parts, min: 0 })
		}
		case 'strengths': {
			// Independent 0..1 strengths — weights with a range and **no**
			// normalisation, which is the one thing that separates this from
			// `share` above. Bounded here rather than left to the control, so a
			// host that renders `weights@1` without knowing about this type
			// still clamps to the range the declaration promised.
			const parts = Object.fromEntries(
				((e.members as any[]) ?? []).map((m) => [
					String(m.key ?? m),
					Number((e.default ?? {})[String(m.key ?? m)] ?? 0),
				]),
			)
			if (!Object.keys(parts).length) return null
			return decl('weights@1', {
				parts,
				min: e.min ?? 0,
				max: e.max ?? 1,
				control: 'sliders',
			})
		}
		default:
			return null
	}
}
