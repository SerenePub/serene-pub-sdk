/**
 * A minimal template engine, enough to demonstrate variable awareness (16 §4).
 *
 * Supports `{{ a.b.c }}` and `{% for x in items %}…{% endfor %}`. Not Jinja — just
 * enough surface to answer the question the docs make a promise about: *can the editor
 * tell an author which variables exist, and flag one that doesn't?*
 *
 * ⚠ Writing this surfaced a correction to 16 §4 — see `templateScope`.
 */

import type { I18n } from './descriptors.js'

export interface TemplateRef {
	/** The root identifier, e.g. `message` in `{{ message.author.name }}`. */
	root: string
	path: string[]
	/** True when the reference is inside a loop and bound by it. */
	bound: boolean
	dynamic: boolean
}

const EXPR = /\{\{\s*([^}]+?)\s*\}\}/g
const FOR = /\{%\s*for\s+(\w+)\s+in\s+([\w.]+)\s*%\}/g
const IF = /\{%\s*if\s+([^%]+?)\s*%\}/g

/**
 * Extract top-level variable references. Loop-bound names are marked so they are not
 * reported as unknown, and anything computed is marked dynamic rather than verified —
 * an editor that promises correctness and lets a typo through is worse than one that
 * says what it checks (16 §4).
 */
export function extractRefs(src: string): TemplateRef[] {
	const bound = new Set<string>()
	const loopSources: TemplateRef[] = []
	for (const m of src.matchAll(FOR)) bound.add(m[1]!)
	for (const m of src.matchAll(FOR)) {
		const parts = m[2]!.split('.')
		// ⚠ This used to be an unconditional `bound: false`, which made every
		// nested loop a false error: `{% for l in c.lore %}` reported `'c' is
		// not available to this template`, because the thing being iterated is
		// itself a loop variable and nothing said so. Two passes, because a
		// loop can be bound by one that appears later in the source.
		loopSources.push({
			root: parts[0]!,
			path: parts.slice(1),
			bound: bound.has(parts[0]!),
			dynamic: false,
		})
	}

	const refs: TemplateRef[] = [...loopSources]
	for (const m of src.matchAll(EXPR)) {
		const expr = m[1]!.trim()
		const dynamic = /[\[\(]/.test(expr)
		const parts = expr.split('.')
		refs.push({
			root: parts[0]!.replace(/[\[\(].*$/, ''),
			path: parts.slice(1),
			bound: bound.has(parts[0]!.replace(/[\[\(].*$/, '')),
			dynamic,
		})
	}
	return refs
}

/** Render. Missing values become empty strings — templates never throw at run time. */
export function render(src: string, baseScope: Record<string, unknown>): string {
	let out = src
	let prev: string
	const scope: Record<string, unknown> = { ...baseScope }

	// {% set name = expr %} — bind a value for the rest of this scope. This is what makes
	// depth positioning a template concern: capture the outer loop's index before entering
	// an inner loop, where `loop` would otherwise be shadowed.
	//
	// Loop bodies are masked first, so a set belonging to an inner scope is left for that
	// scope's own render pass rather than being stripped by this one.
	{
		const { masked, blocks } = maskLoops(out)
		out = masked
		out = out.replace(/\{%\s*set\s+(\w+)\s*=\s*([^%]+?)\s*%\}/g, (_m, name: string, expr: string) => {
			const raw = expr.trim()
			scope[name] = /^-?\d+$/.test(raw)
				? Number(raw)
				: /^['"].*['"]$/.test(raw)
					? raw.slice(1, -1)
					: get(scope, raw.split('.'))
			return ''
		})
		out = out.replace(/\u0000(\d+)\u0000/g, (_m, i: string) => blocks[Number(i)]!)
	}

	// loops — outermost first, so inner loops render inside their parent's scope.
	// (An innermost-first pass evaluates the inner loop before `set`/item bindings exist,
	// which is a real bug this replaced.)
	out = renderLoops(out, scope)

	// conditionals
	do {
		prev = out
		out = out.replace(
			/\{%\s*if\s+([^%]+?)\s*%\}((?:(?!\{%\s*if\s)[\s\S])*?)\{%\s*endif\s*%\}/g,
			(_m, cond: string, body: string) => (evaluate(cond, scope) ? body : ''),
		)
	} while (out !== prev)

	return out.replace(EXPR, (_m, expr: string) => {
		const v = get(scope, expr.trim().split('.'))
		return v === undefined || v === null ? '' : String(v)
	})
}

/** `a.b == c`, `a.b != c`, or a truthy path. Enough for positioning, not a language. */
function evaluate(cond: string, scope: Record<string, unknown>): boolean {
	const cmp = /^(.+?)\s*(==|!=)\s*(.+)$/.exec(cond.trim())
	if (!cmp) return Boolean(get(scope, cond.trim().split('.')))
	const left = get(scope, cmp[1]!.trim().split('.'))
	const rightRaw = cmp[3]!.trim()
	const right = /^-?\d+$/.test(rightRaw)
		? Number(rightRaw)
		: /^['"].*['"]$/.test(rightRaw)
			? rightRaw.slice(1, -1)
			: get(scope, rightRaw.split('.'))
	return cmp[2] === '==' ? left === right : left !== right
}

function get(scope: Record<string, unknown>, path: string[]): unknown {
	let cur: any = scope
	for (const k of path) {
		if (cur === undefined || cur === null) return undefined
		cur = cur[k]
	}
	return cur
}

/**
 * ⚠ CORRECTION TO 16 §4.
 *
 * The docs say template variable awareness "falls out of typed ports with no new
 * mechanism." Building it shows that is only true for the **assembly** template, whose
 * scope really is its input ports.
 *
 * A **source** template renders one *item* out of a collection — one lorebook entry, one
 * message — and the item's shape lives *inside* the port's payload, not on the port. No
 * amount of port typing recovers it.
 *
 * So the template slot must **declare its own variable scope**. That is one extra field on
 * the descriptor, not a new mechanism, but the docs currently claim something that isn't
 * quite true and would have been discovered by the first plugin author who tried it.
 */
/**
 * The kinds a declared value can be.
 *
 * Deliberately closed and deliberately small. This is not JSON Schema: an
 * editor has to *walk* this to offer completions, and every case it cannot walk
 * is a case where the author is back to guessing. Six kinds cover every value
 * core renders, and a seventh should have to earn its place by naming the
 * variable that needs it.
 */
export type VarType =
	| 'string'
	| 'number'
	| 'boolean'
	/** A fixed set of named fields — `fields`. */
	| 'object'
	/** A positional collection — `of` describes an element. */
	| 'list'
	/** Keyed by author-chosen strings — `of` describes a value. */
	| 'record'

export interface VarField {
	type: VarType
	/** Shown in the editor's completion list and on hover. */
	description?: I18n
	/** `object` — the fields it carries. */
	fields?: Record<string, VarField>
	/** `list` / `record` — the shape of each entry. */
	of?: VarField
	/**
	 * May be absent, or present and null.
	 *
	 * The two are one flag rather than two because a template cannot tell them
	 * apart: `{{ this.personality }}` renders empty either way. What the author
	 * needs to know is "do not promise this will be here", and that is the same
	 * answer for a dropped key and a null one.
	 */
	optional?: boolean
}

/**
 * What one root name in a template's scope is.
 *
 * The two legacy forms stay valid, and stay *meaningfully* valid rather than
 * being quietly coerced:
 *
 * - `'any'` means unchecked. It is what every variable said before schemas
 *   existed and it is still the honest answer for a value whose shape genuinely
 *   varies.
 * - `string[]` is a bare list of field names, untyped and unnested.
 *
 * Neither is an error. A plugin published against the old form keeps working
 * across this upgrade, which is the whole reason they survive — lint can nudge
 * an author toward a real schema, but an upgrade that broke every third-party
 * node's declaration to buy nothing but tidiness is not a trade worth making.
 */
export type VarDecl = VarField | 'any' | string[]

export type TemplateScope = Record<string, VarDecl>

export function templateScope(decl: { variables?: TemplateScope } | undefined): TemplateScope {
	return decl?.variables ?? {}
}

export interface TemplateFinding {
	severity: 'error' | 'warning'
	message: string
	fix: string
}

export function checkTemplate(src: string, scope: TemplateScope): TemplateFinding[] {
	const known = Object.keys(scope)
	const bindings = loopBindings(src)
	const out: TemplateFinding[] = []

	const report = (r: PathResolution, base: string) =>
		out.push({
			severity: 'error',
			message: r.message ?? `'${base}' does not exist`,
			fix: r.available?.length
				? `'${base}' has: ${r.available.join(', ')}`
				: 'check the shape this template declares — the path does not exist on it',
		})

	for (const ref of extractRefs(src)) {
		if (ref.dynamic) {
			out.push({
				severity: 'warning',
				message: `'${ref.root}' is accessed dynamically and cannot be checked`,
				fix: 'this is allowed — a computed key is not knowable here, so confirm this one yourself',
			})
			continue
		}

		// A loop-bound name is one *element* of what it iterates. Before the
		// schema there was no way to say what that was, so every reference
		// through a loop variable went unchecked — which is where the typos
		// live, because a loop body is the only place a template writes a
		// nested path at all.
		if (ref.bound) {
			const element = boundType(ref.root, bindings, scope, new Set())
			if (!element) continue
			const r = resolvePath(element, ref.path, ref.root)
			if (!r.ok) report(r, ref.root)
			continue
		}

		if (!known.includes(ref.root)) {
			out.push({
				severity: 'error',
				message: `'${ref.root}' is not available to this template`,
				fix: known.length
					? `available here: ${known.join(', ')}`
					: 'this template slot declares no variables — check the node type',
			})
			continue
		}

		const r = resolvePath(scope[ref.root], ref.path, ref.root)
		if (!r.ok) report(r, ref.root)
	}
	return out
}

/** `{% for x in a.b %}` — every loop variable, and what it iterates. */
function loopBindings(src: string): Map<string, string[]> {
	const out = new Map<string, string[]>()
	for (const m of src.matchAll(FOR)) out.set(m[1]!, m[2]!.split('.'))
	return out
}

/**
 * The element type a loop variable is bound to, or `undefined` when it cannot
 * be known.
 *
 * `seen` guards a template that binds a name from itself. That is not a
 * template anyone means to write, but it is one somebody can type, and a lint
 * that hangs the editor on it is worse than the typo.
 */
function boundType(
	name: string,
	bindings: Map<string, string[]>,
	scope: TemplateScope,
	seen: Set<string>,
): VarField | undefined {
	const source = bindings.get(name)
	if (!source || seen.has(name)) return undefined
	seen.add(name)

	const [root, ...rest] = source
	const decl: VarDecl | undefined = bindings.has(root!)
		? boundType(root!, bindings, scope, seen)
		: scope[root!]
	const r = resolvePath(decl, rest)
	return r.ok ? elementOf(r.field) : undefined
}

/**
 * Walking a path against a schema.
 *
 * The whole point of widening `TemplateScope` was to be able to answer "is
 * `{{ this.nickanme }}` a field?" — and answering it needs one rule the
 * name-only lint never had to state: **what may go unchecked stays unchecked**.
 * A declaration that says `'any'`, a legacy `string[]`, a record's
 * author-chosen key — none of those can be verified, and reporting them would
 * put a red squiggle under working templates. A lint that cries wolf gets
 * turned off, and then it catches nothing at all.
 *
 * So `ok: false` is reserved for a path the schema positively contradicts.
 * Everything else resolves, with `checked` saying whether the answer means
 * anything downstream.
 */
export interface PathResolution {
	ok: boolean
	/** The type at the end of the path, when one is known. */
	field?: VarField
	/** Whether the schema could actually speak to this path. */
	checked: boolean
	/** The segment that failed. */
	at?: string
	/** What does exist there, when that is a listable answer. */
	available?: string[]
	message?: string
}

const UNCHECKED: PathResolution = { ok: true, checked: false }

/**
 * `length` is not a declared field and never will be, but Handlebars and the
 * `{% for %}` engine both answer it on a list and a string. Flagging it would
 * be the first false positive an author hit.
 */
const INTRINSIC = 'length'

/**
 * Resolve `path` against a declared type.
 *
 * `list` is the interesting case. A list is reached by *position*, so
 * `characters.name` is not a near-miss to be corrected — it is a category
 * error, and saying so is the whole reason the old flattened `string[]` form
 * had to go: it accepted exactly that and rejected `characters.0.name`.
 */
export function resolvePath(
	decl: VarDecl | undefined,
	path: readonly string[],
	base = '',
): PathResolution {
	if (decl === undefined || decl === 'any') return UNCHECKED

	// The legacy form answers for its own first segment and nothing deeper —
	// exactly what it could answer before schemas existed.
	if (Array.isArray(decl)) {
		if (!path.length) return UNCHECKED
		if (decl.includes(path[0]!)) return UNCHECKED
		return {
			ok: false,
			checked: true,
			at: path[0]!,
			available: decl,
			message: `'${label(base, [path[0]!])}' does not exist`,
		}
	}

	let cur: VarField = decl
	for (let i = 0; i < path.length; i++) {
		const seg = path[i]!
		const where = label(base, path.slice(0, i + 1))

		switch (cur.type) {
			case 'object': {
				const fields = cur.fields
				if (!fields) return UNCHECKED
				const next = fields[seg]
				if (!next)
					return {
						ok: false,
						checked: true,
						at: seg,
						available: Object.keys(fields),
						message: `'${where}' does not exist`,
					}
				cur = next
				break
			}

			case 'record': {
				// Keyed by whatever the author of the *data* chose. Any key is
				// plausible and none can be verified, so the walk continues
				// with the value's type and stops claiming certainty.
				if (!cur.of) return UNCHECKED
				cur = cur.of
				break
			}

			case 'list': {
				if (seg === INTRINSIC) return { ok: true, checked: true, field: { type: 'number' } }
				if (!/^\d+$/.test(seg))
					return {
						ok: false,
						checked: true,
						at: seg,
						message:
							`'${where}' does not exist — '${label(base, path.slice(0, i)) || 'this'}' is a ` +
							`list, so it is reached by position. Loop over it and read '${seg}' from ` +
							`each entry instead.`,
					}
				if (!cur.of) return UNCHECKED
				cur = cur.of
				break
			}

			default: {
				if (seg === INTRINSIC && cur.type === 'string')
					return { ok: true, checked: true, field: { type: 'number' } }
				return {
					ok: false,
					checked: true,
					at: seg,
					message: `'${where}' does not exist — '${label(base, path.slice(0, i)) || 'this'}' is a ${cur.type}.`,
				}
			}
		}
	}
	return { ok: true, checked: true, field: cur }
}

/**
 * What one iteration of a collection is.
 *
 * `undefined` where the answer is unknown rather than absent — a scalar has no
 * element, but so does an `'any'`, and a caller that cannot tell those apart
 * would report iterating an unchecked value as an error.
 */
function label(base: string, path: readonly string[]): string {
	return [base, ...path].filter(Boolean).join('.')
}

export function elementOf(decl: VarDecl | undefined): VarField | undefined {
	if (!decl || decl === 'any' || Array.isArray(decl)) return undefined
	if (decl.type === 'list' || decl.type === 'record') return decl.of
	return undefined
}

/**
 * Does a value match a declared schema?
 *
 * This exists so a `sample` and its `scope` cannot drift apart. A sample is not
 * decoration: it is what the layout editor renders a live preview against, so a
 * sample whose shape is wrong shows the author a preview that works and a chat
 * that doesn't — a lie told at exactly the moment they are trusting the tool.
 * The declaration and the example of it have to be checkable against each
 * other, and this is the check.
 *
 * Findings are errors, not warnings, and an undeclared key is one of them. A
 * sample carrying a field the schema omits means the schema is incomplete, and
 * an incomplete schema is a completion list missing an entry the author needs —
 * silently, with no way to tell it apart from a field that truly is not there.
 */
export function checkValue(value: unknown, field: VarField, path = ''): string[] {
	const at = path || 'value'
	const out: string[] = []
	const wrong = (want: string) => [`${at}: expected ${want}, got ${describe(value)}`]

	switch (field.type) {
		case 'string':
			return typeof value === 'string' ? [] : wrong('a string')
		case 'number':
			return typeof value === 'number' ? [] : wrong('a number')
		case 'boolean':
			return typeof value === 'boolean' ? [] : wrong('a boolean')

		case 'list': {
			if (!Array.isArray(value)) return wrong('a list')
			if (!field.of) return out
			value.forEach((item, i) => out.push(...checkValue(item, field.of!, `${at}[${i}]`)))
			return out
		}

		case 'record': {
			if (!isPlainObject(value)) return wrong('a record')
			if (!field.of) return out
			for (const [k, v] of Object.entries(value))
				out.push(...checkValue(v, field.of, `${at}.${k}`))
			return out
		}

		case 'object': {
			if (!isPlainObject(value)) return wrong('an object')
			const fields = field.fields ?? {}
			for (const [k, f] of Object.entries(fields)) {
				const has = k in value && value[k] !== undefined && value[k] !== null
				if (!has) {
					if (!f.optional) out.push(`${at}.${k}: declared but missing from the sample`)
					continue
				}
				out.push(...checkValue(value[k], f, `${at}.${k}`))
			}
			for (const k of Object.keys(value)) {
				if (k in fields) continue
				if (value[k] === undefined) continue
				out.push(
					`${at}.${k}: present in the sample but not declared — ` +
						`add it to \`fields\`, or drop it from the sample`,
				)
			}
			return out
		}
	}
}

/**
 * Check every key of a scope against the values a declaration samples for it.
 *
 * Legacy declarations are skipped rather than guessed at. `'any'` means
 * unchecked by definition, and a bare `string[]` carries no types to check
 * against — pretending otherwise would fail honest declarations that simply
 * predate the schema.
 */
export function checkScopeSample(
	values: Record<string, unknown>,
	scope: TemplateScope,
	label = '',
): string[] {
	const out: string[] = []
	const prefix = label ? `${label} ` : ''
	for (const [key, decl] of Object.entries(scope)) {
		if (decl === 'any' || Array.isArray(decl)) continue
		if (!(key in values) || values[key] === undefined) {
			out.push(`${prefix}${key}: declared in scope but the sample supplies no value for it`)
			continue
		}
		out.push(...checkValue(values[key], decl, `${prefix}${key}`))
	}
	return out
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
	return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function describe(v: unknown): string {
	if (v === null) return 'null'
	if (v === undefined) return 'undefined'
	if (Array.isArray(v)) return 'a list'
	return `a ${typeof v}`
}

/**
 * Mask top-level `{% for %}…{% endfor %}` blocks with placeholders, matching them balanced
 * rather than by regex — nested loops make non-greedy matching wrong, which is exactly the
 * bug this replaced.
 */
function maskLoops(src: string): { masked: string; blocks: string[] } {
	const blocks: string[] = []
	let out = ''
	let i = 0
	const FOR_OPEN = /\{%\s*for\s/g
	const TAG = /\{%\s*(for|endfor)\b[^%]*%\}/g

	while (i < src.length) {
		FOR_OPEN.lastIndex = i
		const open = FOR_OPEN.exec(src)
		if (!open) {
			out += src.slice(i)
			break
		}
		out += src.slice(i, open.index)
		let depth = 0
		TAG.lastIndex = open.index
		let m: RegExpExecArray | null
		let end = -1
		while ((m = TAG.exec(src))) {
			if (m[1] === 'for') depth++
			else if (--depth === 0) {
				end = m.index + m[0].length
				break
			}
		}
		if (end === -1) {
			out += src.slice(open.index)
			break
		}
		out += `\u0000${blocks.push(src.slice(open.index, end)) - 1}\u0000`
		i = end
	}
	return { masked: out, blocks }
}

/** Render top-level `{% for %}` blocks; nested ones are handled by the recursive call. */
function renderLoops(src: string, scope: Record<string, unknown>): string {
	const { masked, blocks } = maskLoops(src)
	if (!blocks.length) return src
	return masked.replace(/\u0000(\d+)\u0000/g, (_m, idx: string) => {
		const block = blocks[Number(idx)]!
		const head = /^\{%\s*for\s+(\w+)\s+in\s+([\w.]+)\s*%\}/.exec(block)
		if (!head) return block
		const body = block.slice(head[0].length, block.lastIndexOf('{%'))
		const items = get(scope, head[2]!.split('.'))
		if (!Array.isArray(items)) return ''
		return items
			.map((item, i) =>
				render(body, {
					...scope,
					[head[1]!]: item,
					loop: { index: i + 1, index0: i, revindex: items.length - i, length: items.length },
				}),
			)
			.join('')
	})
}
