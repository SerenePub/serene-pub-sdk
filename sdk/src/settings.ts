/**
 * Plugin settings — the schema an extension declares, and the four things core does
 * with it (12 §6).
 *
 * 12 §6 promises "the same schema strategy as node config and review steps — one
 * renderer, three uses." That promise is only real if it is literally the same
 * declaration, so `FieldDecl` here is the same shape node `params` use, plus the two
 * fields that only mean something for plugin settings (`scope`, `side`). An extension
 * author who has written a node's `params` schema already knows this one.
 *
 * One declaration, four uses:
 *
 *   1. **The form** core renders in plugin settings — no UI work by the author.
 *   2. **Validation** of stored values, on save and on update.
 *   3. **The manifest entry**, extracted statically by the compiler — never by running
 *      the author's code (F6, 03 §3).
 *   4. **Typed access** from the extension's own hooks: `settings.values` is inferred,
 *      so `apiKey` is a `SecretValue` and a mistyped key does not compile.
 *
 * ## The `secret` field, and why it is typed
 *
 * The ruling that produced this reads backwards at first. "SP declines custody of plugin
 * secrets" sounds safer than storing them — but an extension keeping credentials in its
 * own data directory has no key and no crypto facility, so the realistic outcome is
 * plaintext on the user's disk, unencrypted *and* unauditable. Declining custody produced
 * the worse result (13 §6).
 *
 * What makes accepting it defensible is that the field is **typed**, which is what lets
 * core mechanically redact it from receipts (F16), exclude it from export (12 §7) and
 * keep it write-only in the UI. A free-form column cannot tell a key from a note.
 */

import type { MediaKind } from './media.js'

// ── Values ──────────────────────────────────────────────────────────────────

export interface SecretValue {
	readonly $secret: true
	/** Ciphertext at rest; plaintext exists only inside the owning hook's invocation. */
	readonly value: string
}

export const secret = (value: string): SecretValue => ({ $secret: true, value })

export const isSecret = (v: unknown): v is SecretValue =>
	!!v && typeof v === 'object' && (v as SecretValue).$secret === true

// ── The declaration ─────────────────────────────────────────────────────────

/**
 * The one field language, for real this time.
 *
 * This file used to claim `FieldDecl` was "the same shape node `params` use,
 * plus `scope` and `side`". It was not: node params (`ParamDecl`) had `share`
 * and `perMember` and no `text`; settings had `text` and neither of the others;
 * one keyed its label `i18n`, the other `label`; and nothing anywhere converted
 * between them. Two languages, one promise, no adapter — so a control that
 * rendered plugin settings could not render node params, and a session mode
 * (whose `fields` are a `SettingsSchema`) could not declare a `share` control
 * that a node beside it could.
 *
 * `ParamDecl` is now an alias of this type and the union is the merge of both.
 * `label` is canonical; `i18n` is accepted as the historical alias so every
 * existing contract keeps compiling. Read either through `fieldLabel()` rather
 * than reaching for a key.
 */
export type FieldType =
	| 'string'
	| 'text'
	| 'number'
	| 'integer'
	| 'boolean'
	| 'enum'
	| 'string[]'
	| 'secret'
	/** Normalised `Record<string, number>` over `members` — ratios only, always
	 *  totalling 100%, so there is no invalid state to explain. Zero is a
	 *  member's off switch. */
	| 'share'
	/** A plain number per band over `members` — a ceiling, a floor, a count. */
	| 'perMember'
	/**
	 * An **independent** `0..1` strength per member, drawn as one bar each.
	 *
	 * Deliberately not a `share` with the normalisation switched off, and the
	 * difference is the whole reason it is its own type. A share divides one
	 * finite thing between its members, so raising one member necessarily
	 * lowers the others and the total is always 100%. A strength answers "how
	 * much does this count" one member at a time: every member may be 1 at
	 * once, and turning one up takes nothing away from anything.
	 *
	 * Drawing them alike would teach the reader the wrong arithmetic — which is
	 * exactly the confusion this type exists to prevent where the two sit on one
	 * screen. `perMember` is the third of the family and the one with no range
	 * at all: a count, a ceiling, a floor.
	 */
	| 'strengths'
	/**
	 * A reference to stored media, by uuid. `accepts` narrows which kinds the
	 * picker offers; absent means images, which is what almost every such field
	 * wants and what makes the common declaration short.
	 */
	| 'media'
	/**
	 * An **ordered list** of values, each satisfying one declaration (`item`).
	 *
	 * Ordered, and that is the whole reason it is not `string[]` with a wider
	 * element type: the order *is* part of the value. A chain of scripts, the
	 * blocks a prompt is assembled from, a fallback sequence of connections —
	 * every one of those is a list somebody reorders, and a control that
	 * rendered it as a set would drop the one thing being configured.
	 *
	 * The element declaration is a `FieldDecl` like any other, so a list of
	 * numbers, a list of enums and a list of objects are one type rather than
	 * three. Which is what keeps this general: node params, genre fields and
	 * widget settings all speak this vocabulary, and none of them had a way to
	 * say "several of these, in this order" until now.
	 */
	| 'list'
	/**
	 * A fixed-key record whose members are themselves declarations (`fields`).
	 *
	 * Deliberately **fixed-key**: the members are declared, so a form can be
	 * rendered from them and a stored value can be checked against them. A
	 * free-form map is `text` with `format: 'json'`, which is what that escape
	 * hatch is for — and the difference is exactly whether anything can tell a
	 * mistyped key from a deliberate one.
	 */
	| 'object'

export type I18nText = string | ({ en: string } & Record<string, string>)
// `I18n` is exported from descriptors.ts, which has always owned that name;
// it aliases I18nText, so the two are one type with one definition.

/** One band of a `share` / `perMember` / `strengths` control, or a labelled `enum` choice. */
export interface MemberDecl {
	/** The key inside the parameter's value object. */
	key: string
	label?: I18nText
	/** @deprecated alias of `label`. */
	i18n?: I18nText
	description?: I18nText
	/**
	 * Which colour this band takes, as an index rather than a value. The
	 * declaration says *which* band this is; the client's palette says what
	 * that looks like in the current theme. Out-of-range wraps.
	 */
	tone?: number
}

export interface FieldDecl<T extends FieldType = FieldType, O extends readonly string[] = readonly string[]> {
	type: T
	label?: I18nText
	/**
	 * @deprecated alias of `label`, kept so the contracts that were written
	 * against the node-params spelling keep compiling. `fieldLabel()` reads
	 * whichever is present.
	 */
	i18n?: I18nText
	description?: I18nText
	default?: unknown
	/**
	 * One of the few settings people actually change on this node.
	 *
	 * A panel that lists every declared setting equally makes the reader find
	 * the prompt among the thresholds every time. The author knows which few
	 * are reached for; a client heuristic would be wrong differently on every
	 * plugin. Presentation, not permission — nothing is hidden by it.
	 */
	quick?: boolean
	/**
	 * For `share`, `perMember` and `strengths`: the bands, in render order. An `enum` may
	 * use this **instead of** `of`, and should whenever the stored values are
	 * not what a person should read — `of` is derived from the keys, so
	 * nothing that reads `of` has to learn about this.
	 */
	members?: readonly MemberDecl[]
	/**
	 * For `list`: the declaration every element satisfies.
	 *
	 * A separate key rather than reusing `of`, which is an `enum`'s **options**
	 * and is typed `readonly string[]` everywhere that reads it. Widening that
	 * key to also mean "the element declaration" would make `of` two things at
	 * once and break the inference every enum in every contract depends on.
	 *
	 * `min`/`max` on a `list` are the element **count**, not a numeric range.
	 */
	item?: FieldDecl
	/**
	 * For `object`: the member declarations, in render order.
	 *
	 * A `SettingsSchema` by construction — the same map a plugin's settings, a
	 * genre's fields and a node's params are all declared as — so nesting costs
	 * no second vocabulary and a renderer that can draw a form can draw a row.
	 */
	fields?: Record<string, FieldDecl>
	/** For `media`: which kinds the picker offers. Absent means `['image']`. */
	accepts?: readonly MediaKind[]
	min?: number
	max?: number
	of?: O
	/** Options sourced from the live connection, e.g. `'connection.voices'` (17 §2b). */
	from?: string
	/**
	 * Blocks activation when unset. The plugin is **not broken** — it is installed,
	 * listed, and telling the admin exactly what it is waiting for (§ needsConfiguration).
	 */
	required?: boolean
	/** Who may write it. Admin-only is the right default; display preferences are per-user. */
	scope?: 'instance' | 'user'
	/**
	 * `extension` is requestable through the SDK at any time; `component` is fed in at
	 * render and arrives through `ctx`. A secret may never be component-side — a
	 * component runs in the browser.
	 */
	side?: 'extension' | 'component'
	/** Form grouping and ordering. Cosmetic, and cheap to get right now. */
	group?: string
	/**
	 * The four orthogonal decisions about what a field is *for*, following
	 * Elasticsearch's `index` / `doc_values` / `store` / `_source` split.
	 *
	 * They are four because collapsing them into one boolean loses information
	 * every system at this job's scale has eventually needed: a field can be
	 * worth filtering on and meaningless to sort by, worth putting in front of
	 * the model and actively harmful inside an embedding. `priority` is the
	 * example that makes it concrete — queryable, sortable, injected, and *not*
	 * embedded, because "1" contributes nothing to a cosine and dilutes what
	 * does.
	 *
	 * All four default to off. A field nobody declared queryable is one the
	 * projection builds no index for and a filter cannot name — which is the
	 * point: **the declaration says `queryable`; the projection picks the
	 * strategy.** Leak "this is a column" into the declaration and storage
	 * layout becomes a public contract.
	 *
	 * Read by entry types (`Descriptor.entryShape.fields`); harmless and unset
	 * on plugin settings and node params, which have nothing to index.
	 */
	queryable?: boolean
	/** May results be ordered by it. Independent of `queryable`: a filterable
	 *  field is not automatically a sensible sort key. */
	sortable?: boolean
	/** Does its value form part of the text an embedding is computed over. */
	embedded?: boolean
	/** Does its value reach the model in the assembled prompt. */
	injected?: boolean
	/** Show only when another field has a given value. One level; not a rules engine. */
	showIf?: { field: string; equals: unknown }
	/**
	 * For `text` fields holding structured data a form cannot decompose: the
	 * renderer shows JSON and the submit path parses it back. Produced by
	 * `inferSchema` for nested payloads; an author declaring settings should
	 * declare real fields instead.
	 */
	format?: 'json'
}

export type SettingsSchema = Record<string, FieldDecl>

/**
 * @deprecated `ParamDecl` and `FieldDecl` are one type. The alias remains so
 * `descriptors.ts` and every contract written against node params keep
 * compiling; new code should say `FieldDecl`.
 */
export type ParamDecl = FieldDecl

/** The label to render, from whichever key the author used. */
export function fieldLabel(decl: {
	label?: I18nText
	i18n?: I18nText
}): I18nText | undefined {
	return decl.label ?? decl.i18n
}

/** The media kinds a `media` field offers. Images unless it says otherwise. */
export function fieldAccepts(decl: FieldDecl): readonly MediaKind[] {
	return decl.accepts?.length ? decl.accepts : (['image'] as const)
}

// ── Inferred value types ────────────────────────────────────────────────────

type ValueOf<F> = F extends { type: 'secret' }
	? SecretValue
	: F extends { type: 'list'; item: infer I }
		? Array<ValueOf<I>>
		: F extends { type: 'object'; fields: infer M }
			? M extends SettingsSchema
				? SettingsValues<M>
				: Record<string, unknown>
			: F extends { type: 'enum'; of: readonly (infer O)[] }
				? O
				: F extends { type: 'boolean' }
					? boolean
					: F extends { type: 'number' | 'integer' }
						? number
						: F extends { type: 'string[]' }
							? string[]
							: string

type RequiredKeys<S> = { [K in keyof S]: S[K] extends { required: true } ? K : never }[keyof S]

export type SettingsValues<S extends SettingsSchema> = { [K in RequiredKeys<S>]: ValueOf<S[K]> } & {
	[K in Exclude<keyof S, RequiredKeys<S>>]?: ValueOf<S[K]>
}

// ── Findings ────────────────────────────────────────────────────────────────

export interface SettingsFinding {
	field?: string
	severity: 'error' | 'warning'
	message: string
	/** What to do instead — required, like every other finding in this SDK (15 §1.3). */
	fix: string
}

// ── Declaration-time checks ─────────────────────────────────────────────────

/**
 * A nested declaration's mistakes, reported at the path they live at.
 *
 * `list` and `object` make a schema a tree, and a finding that named only the
 * top-level key would send an author looking at the wrong declaration. The path
 * is the address a reader can follow: `blocks[].id`, `layout.columns[]`.
 *
 * ⚠ **A `secret` may not be nested**, and this is the guard for it rather than a
 * documented caution. Redaction is flat everywhere it happens — `forClient`,
 * `forExport` and `forOwningHook` all walk the schema's own keys and switch on
 * `type === 'secret'` — so a credential inside a list would be exported, sent to
 * the browser, and written into a receipt with nothing anywhere saying so. The
 * refusal is at declaration time, which is the only place it is cheap.
 */
function checkNested(decl: FieldDecl, path: string): SettingsFinding[] {
	const f: SettingsFinding[] = []
	if (decl.type === 'secret')
		f.push({
			field: path,
			severity: 'error',
			message: `'${path}' is a secret nested inside a list or object`,
			fix: 'declare it as a top-level field — redaction, export and receipts read the schema flat, so a nested secret would leak',
		})
	if (decl.type === 'list') {
		if (!decl.item)
			f.push({
				field: path,
				severity: 'error',
				message: `'${path}' is a list with no element declaration`,
				fix: "declare `item: { type: 'string' }` — a list whose elements are undeclared cannot be rendered or checked",
			})
		else f.push(...checkNested(decl.item, `${path}[]`))
	}
	if (decl.type === 'object') {
		if (!decl.fields || !Object.keys(decl.fields).length)
			f.push({
				field: path,
				severity: 'error',
				message: `'${path}' is an object with no member declarations`,
				fix: 'declare `fields: { … }` — a free-form map is `text` with `format: "json"`',
			})
		else
			for (const [k, member] of Object.entries(decl.fields))
				f.push(...checkNested(member, `${path}.${k}`))
	}
	if (decl.type === 'enum' && !decl.of?.length && !decl.members?.length && !decl.from)
		f.push({
			field: path,
			severity: 'error',
			message: `'${path}' is an enum with no options`,
			fix: "declare `of: ['a','b'] as const`, or source them from the connection with `from`",
		})
	return f
}

/** Mistakes that would otherwise become silent leaks or dead form fields. */
export function checkSchema(schema: SettingsSchema): SettingsFinding[] {
	const f: SettingsFinding[] = []
	for (const [key, d] of Object.entries(schema)) {
		// The tree below a `list` or an `object`, checked at its own address.
		// The top-level cases below stay as they are: they are about the
		// *field*, not the element, and two of them (`scope`, `side`) have no
		// meaning inside a row.
		if (d.type === 'list' || d.type === 'object') f.push(...checkNested(d, key))
		if (d.type === 'secret') {
			if (d.side === 'component') {
				f.push({
					field: key,
					severity: 'error',
					message: `'${key}' is a secret declared component-side`,
					fix: 'a component runs in the browser, so the value would be delivered to the client — declare it extension-side',
				})
			}
			if (d.default !== undefined) {
				f.push({
					field: key,
					severity: 'error',
					message: `'${key}' is a secret with a default`,
					fix: 'remove it — a shipped default credential is not a credential',
				})
			}
		}
		if (d.type === 'enum' && !d.of?.length && !d.from) {
			f.push({
				field: key,
				severity: 'error',
				message: `'${key}' is an enum with no options`,
				fix: "declare `of: ['a','b'] as const`, or source them from the connection with `from`",
			})
		}
		if (d.required && d.default !== undefined) {
			f.push({
				field: key,
				severity: 'warning',
				message: `'${key}' is required and has a default, so it can never be unset`,
				fix: 'drop `required`, or drop the default if the admin genuinely has to choose',
			})
		}
		if (d.showIf && !schema[d.showIf.field]) {
			f.push({
				field: key,
				severity: 'error',
				message: `'${key}' is shown conditionally on '${d.showIf.field}', which is not a field`,
				fix: `name a field this schema declares (${Object.keys(schema).join(', ')})`,
			})
		}
	}
	return f
}

// ── Value validation ────────────────────────────────────────────────────────

/**
 * One value against one declaration, at the address it lives at.
 *
 * Extracted from `checkValues`'s loop so a `list`'s elements and an `object`'s
 * members are checked by the same rules as a top-level field — a second copy of
 * "an integer is whole and within its range" is a second set of rules to keep
 * in step, and the first divergence is a stored value one layer accepts and the
 * other refuses.
 */
function checkOne(decl: FieldDecl, value: unknown, path: string): SettingsFinding[] {
	const f: SettingsFinding[] = []
	const bad = (why: string, fix: string) =>
		f.push({ field: path, severity: 'error' as const, message: `'${path}' ${why}`, fix })
	switch (decl.type) {
		case 'secret':
			if (!isSecret(value)) bad('is not a secret value', 'write it through the settings form; secrets are never set as plain strings')
			break
		case 'boolean':
			if (typeof value !== 'boolean') bad(`should be a boolean, got ${typeof value}`, 'store true or false')
			break
		case 'integer':
		case 'number': {
			if (typeof value !== 'number' || Number.isNaN(value)) {
				bad(`should be a number, got ${typeof value}`, 'store a number')
				break
			}
			if (decl.type === 'integer' && !Number.isInteger(value)) bad('should be a whole number', 'round it, or declare the field as `number`')
			if (decl.min !== undefined && value < decl.min) bad(`is below the minimum ${decl.min}`, `use a value ≥ ${decl.min}`)
			if (decl.max !== undefined && value > decl.max) bad(`is above the maximum ${decl.max}`, `use a value ≤ ${decl.max}`)
			break
		}
		case 'enum':
			// `decl.of` only, deliberately: a `members`-declared enum has never
			// been checked here, and starting to check it is a tightening this
			// extension has no business making.
			if (decl.of && !decl.of.includes(value as string)) bad(`is not one of ${decl.of.join(', ')}`, `use one of: ${decl.of.join(', ')}`)
			break
		case 'string[]':
			if (!Array.isArray(value)) bad('should be a list of strings', 'store an array')
			break
		case 'list': {
			if (!Array.isArray(value)) {
				bad('should be a list', 'store an array — the order is part of the value')
				break
			}
			// `min`/`max` are the element COUNT on a list, not a numeric range.
			if (decl.min !== undefined && value.length < decl.min) bad(`has fewer than ${decl.min} entries`, `keep at least ${decl.min}`)
			if (decl.max !== undefined && value.length > decl.max) bad(`has more than ${decl.max} entries`, `keep at most ${decl.max}`)
			if (decl.item) for (let i = 0; i < value.length; i++) f.push(...checkOne(decl.item, value[i], `${path}[${i}]`))
			break
		}
		case 'object': {
			if (!value || typeof value !== 'object' || Array.isArray(value)) {
				bad('should be an object', 'store a record of the declared members')
				break
			}
			const row = value as Record<string, unknown>
			for (const [k, member] of Object.entries(decl.fields ?? {})) {
				const mv = row[k]
				if (mv === undefined || mv === null) {
					if (member.required && member.default === undefined)
						f.push({
							field: `${path}.${k}`,
							severity: 'error',
							message: `'${path}.${k}' is required and not set`,
							fix: 'fill it in — the row is incomplete without it',
						})
					continue
				}
				f.push(...checkOne(member, mv, `${path}.${k}`))
			}
			break
		}
		default:
			if (typeof value !== 'string') bad(`should be a string, got ${typeof value}`, 'store a string')
	}
	return f
}

export function checkValues(schema: SettingsSchema, values: Record<string, unknown>): SettingsFinding[] {
	const f: SettingsFinding[] = []
	for (const [key, d] of Object.entries(schema)) {
		const v = values[key]
		if (v === undefined || v === null) {
			if (d.required && d.default === undefined) {
				f.push({
					field: key,
					severity: 'error',
					message: `'${key}' is required and not set`,
					fix: `set it in plugin settings — the plugin stays installed and listed until then, it is not broken`,
				})
			}
			continue
		}
		f.push(...checkOne(d, v, key))
	}
	return f
}

// ── Update: reconcile stored values against a new schema ───────────────────

export interface Reconciled {
	values: Record<string, unknown>
	/** Stored values the new schema no longer declares. **Never deleted** (12 §6, 02 §7). */
	orphaned: Array<{ field: string; value: unknown; reason: string }>
	findings: SettingsFinding[]
}

/**
 * What an update does to values that already exist.
 *
 * The rule is the one 12 §5 already applies to a node swap's orphaned slots: **unmigrated
 * values land in diagnostics rather than disappearing.** An author who renames a field
 * and an admin who then downgrades should both get their data back; silently dropping it
 * makes the update irreversible in the one direction that matters.
 */
export function reconcile(schema: SettingsSchema, stored: Record<string, unknown>): Reconciled {
	const values: Record<string, unknown> = {}
	const orphaned: Reconciled['orphaned'] = []

	for (const [key, d] of Object.entries(schema)) {
		values[key] = key in stored ? stored[key] : d.default
	}
	for (const [key, value] of Object.entries(stored)) {
		if (key in schema) continue
		orphaned.push({
			field: key,
			value: isSecret(value) ? '[secret]' : value,
			reason: 'the updated schema no longer declares this field',
		})
	}
	return { values, orphaned, findings: checkValues(schema, values) }
}

// ── The three audiences ─────────────────────────────────────────────────────

/** What the settings form sends back. A secret reports only whether it is set. */
export function forClient(schema: SettingsSchema, values: Record<string, unknown>): Record<string, unknown> {
	const out: Record<string, unknown> = {}
	for (const [key, d] of Object.entries(schema)) {
		out[key] = d.type === 'secret' ? { $secretSet: isSecret(values[key]) } : values[key]
	}
	return out
}

/** What an export carries. Secrets never leave, on the same footing as credentials. */
export function forExport(schema: SettingsSchema, values: Record<string, unknown>): Record<string, unknown> {
	const out: Record<string, unknown> = {}
	for (const [key, d] of Object.entries(schema)) {
		if (d.type === 'secret') continue
		out[key] = values[key]
	}
	return out
}

/**
 * What the declaring extension's own hook receives — the only place plaintext appears,
 * and only for the extension that owns the field. Same shape as F18's per-call injection
 * of connection material.
 */
export function forOwningHook(
	schema: SettingsSchema,
	values: Record<string, unknown>,
	decrypt: (cipher: string) => string,
): Record<string, unknown> {
	const out: Record<string, unknown> = {}
	for (const [key, d] of Object.entries(schema)) {
		const v = values[key]
		out[key] = d.type === 'secret' && isSecret(v) ? decrypt(v.value) : v
	}
	return out
}

/** What a component receives at render — extension-side fields never reach the browser. */
export function forComponent(schema: SettingsSchema, values: Record<string, unknown>): Record<string, unknown> {
	const out: Record<string, unknown> = {}
	for (const [key, d] of Object.entries(schema)) {
		if (d.side !== 'component') continue
		out[key] = values[key]
	}
	return out
}

// ── Activation ──────────────────────────────────────────────────────────────

export type PluginConfigState =
	| { state: 'ready' }
	/**
	 * Installed, listed, and waiting on the admin — **not `broken`**. The distinction is
	 * the difference between filing a bug against the author and typing an API key, and a
	 * plugin that silently does nothing is the worst of both.
	 */
	| { state: 'needs-configuration'; missing: string[]; message: string }

export function configState(schema: SettingsSchema, values: Record<string, unknown>): PluginConfigState {
	const missing = Object.entries(schema)
		.filter(([k, d]) => d.required && d.default === undefined && (values[k] === undefined || values[k] === null))
		.map(([k]) => k)
	if (!missing.length) return { state: 'ready' }
	return {
		state: 'needs-configuration',
		missing,
		message: `waiting on ${missing.join(', ')} in plugin settings`,
	}
}

// ── Form layout ─────────────────────────────────────────────────────────────

export interface FormGroup {
	group: string
	fields: Array<{ key: string; decl: FieldDecl }>
}

/** Declaration order within a group; group order is first appearance. */
export function formLayout(schema: SettingsSchema): FormGroup[] {
	const groups: FormGroup[] = []
	for (const [key, decl] of Object.entries(schema)) {
		const name = decl.group ?? 'General'
		let g = groups.find((x) => x.group === name)
		if (!g) groups.push((g = { group: name, fields: [] }))
		g.fields.push({ key, decl })
	}
	return groups
}

/** Is this field currently shown, given the values? One level of `showIf`, no rules engine. */
export const isVisible = (decl: FieldDecl, values: Record<string, unknown>): boolean =>
	!decl.showIf || values[decl.showIf.field] === decl.showIf.equals

// ── The entry point ─────────────────────────────────────────────────────────

export interface PluginSettings<S extends SettingsSchema> {
	schema: S
	/** Phantom, for `typeof s.values` in the extension's own code. Never populated. */
	readonly values?: SettingsValues<S>
	defaults(): Record<string, unknown>
	layout(): FormGroup[]
	check(values: Record<string, unknown>): SettingsFinding[]
	reconcile(stored: Record<string, unknown>): Reconciled
	state(values: Record<string, unknown>): PluginConfigState
	forClient(values: Record<string, unknown>): Record<string, unknown>
	forExport(values: Record<string, unknown>): Record<string, unknown>
	forComponent(values: Record<string, unknown>): Record<string, unknown>
	forOwningHook(values: Record<string, unknown>, decrypt: (c: string) => string): Record<string, unknown>
}

export class SettingsError extends Error {}

/**
 * Declare a plugin's settings. The compiler extracts this statically into the manifest,
 * so it must be a literal — a schema assembled at runtime cannot be read without running
 * the author's code, which the packager never does (F6, 03 §3).
 */
export function defineSettings<const S extends SettingsSchema>(schema: S): PluginSettings<S> {
	const errs = checkSchema(schema).filter((x) => x.severity === 'error')
	if (errs.length) {
		throw new SettingsError(
			'invalid settings schema:\n' + errs.map((e) => `  ${e.message}\n    → ${e.fix}`).join('\n'),
		)
	}
	return {
		schema,
		defaults: () =>
			Object.fromEntries(
				Object.entries(schema)
					.filter(([, d]) => d.default !== undefined)
					.map(([k, d]) => [k, d.default]),
			),
		layout: () => formLayout(schema),
		check: (v) => checkValues(schema, v),
		reconcile: (v) => reconcile(schema, v),
		state: (v) => configState(schema, v),
		forClient: (v) => forClient(schema, v),
		forExport: (v) => forExport(schema, v),
		forComponent: (v) => forComponent(schema, v),
		forOwningHook: (v, d) => forOwningHook(schema, v, d),
	}
}

/** Back-compat alias for the earlier name. */
export const validateSettingsSchema = (s: SettingsSchema) => checkSchema(s).map((f) => f.message)

// ── Forms from data (review pauses, arbitrary extension forms) ──────────────

const humanize = (key: string): string =>
	key
		.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
		.replace(/[_-]+/g, ' ')
		.replace(/^./, (c) => c.toUpperCase())

/**
 * A `SettingsSchema` inferred from a payload — the review gate's form producer.
 *
 * One field language for everything a person edits in a generated form: an
 * extension's declared settings, an extension's arbitrary forms, and a paused
 * node's payload all render through the same schema and the same renderer. A
 * review form is therefore 100% defined by the data the node received: a
 * string is a text field, a number is a number field, a flag is a checkbox,
 * and structure a form cannot decompose arrives as JSON rather than being
 * silently dropped — an edit surface that hides part of the payload is a
 * review gate a write can sneak past.
 */
export function inferSchema(payload: unknown): SettingsSchema {
	const source =
		payload && typeof payload === 'object' && !Array.isArray(payload)
			? (payload as Record<string, unknown>)
			: { value: payload }

	const schema: SettingsSchema = {}
	for (const [key, v] of Object.entries(source)) {
		const label = humanize(key)
		if (typeof v === 'string') {
			schema[key] = {
				type: v.length > 80 || v.includes('\n') ? 'text' : 'string',
				label,
			}
		} else if (typeof v === 'number') {
			schema[key] = { type: Number.isInteger(v) ? 'integer' : 'number', label }
		} else if (typeof v === 'boolean') {
			schema[key] = { type: 'boolean', label }
		} else if (Array.isArray(v) && v.every((x) => typeof x === 'string')) {
			schema[key] = { type: 'string[]', label }
		} else {
			schema[key] = { type: 'text', label, format: 'json' }
		}
	}
	return schema
}

/** The payload as form values — JSON-format fields serialized for editing. */
export function valuesForForm(
	schema: SettingsSchema,
	payload: unknown,
): Record<string, unknown> {
	const source =
		payload && typeof payload === 'object' && !Array.isArray(payload)
			? (payload as Record<string, unknown>)
			: { value: payload }
	const out: Record<string, unknown> = {}
	for (const [key, decl] of Object.entries(schema)) {
		const v = source[key]
		out[key] = decl.format === 'json' ? JSON.stringify(v ?? null, null, 2) : v
	}
	return out
}

/**
 * Fold edited form values back into the payload shape the node expects.
 *
 * The inverse of `valuesForForm`: JSON-format fields parse back (an
 * unparseable edit throws with the field named rather than committing a
 * string where an object stood), untouched keys keep their original values —
 * a form is an edit surface, never a filter.
 */
export function applyFormValues(
	schema: SettingsSchema,
	payload: unknown,
	edited: Record<string, unknown>,
): unknown {
	const wrapped = !(
		payload &&
		typeof payload === 'object' &&
		!Array.isArray(payload)
	)
	const base: Record<string, unknown> = wrapped
		? { value: payload }
		: { ...(payload as Record<string, unknown>) }

	for (const [key, decl] of Object.entries(schema)) {
		if (!(key in edited)) continue
		const v = edited[key]
		if (decl.format === 'json') {
			try {
				base[key] = JSON.parse(String(v))
			} catch {
				throw new SettingsError(
					`'${key}' is not valid JSON — the field holds structure the form ` +
						`cannot decompose, so it must parse before it can be committed.`,
				)
			}
		} else if (decl.type === 'number' || decl.type === 'integer') {
			const n = typeof v === 'number' ? v : Number(v)
			if (Number.isNaN(n))
				throw new SettingsError(`'${key}' must be a number.`)
			base[key] = decl.type === 'integer' ? Math.trunc(n) : n
		} else if (decl.type === 'boolean') {
			base[key] = !!v
		} else if (decl.type === 'string[]') {
			base[key] = Array.isArray(v)
				? v.map(String)
				: String(v ?? '')
						.split('\n')
						.map((l) => l.trim())
						.filter(Boolean)
		} else {
			base[key] = String(v ?? '')
		}
	}
	return wrapped ? base['value'] : base
}