/**
 * Annex fields — every key an owner keeps in the session annex, declared once
 * (owner-approved 2026-09-26; generalised the same day by the owner ruling
 * "one annex declaration per owner").
 *
 * An owner's **annex declaration** is the list of its annex fields: each key
 * it uses, the shape its value must have, who may see it and — optionally —
 * who may set it. It is the single source of truth for that owner's annex
 * document:
 *
 * - a `set-session-annex` step may write only declared keys (refused by name
 *   at `validate()` and the package pass when the keys are literal, and by
 *   the host at the write always);
 * - the audience stored with a value is the declaration's `see`;
 * - a value is checked against the declared `shape` at every write;
 * - `annexSchemaOf(owner)` is the shape, for a template to type
 *   `annex.<owner>.<key>`.
 *
 * `act` present makes the field **settable**: the host offers it as one
 * action (`<owner>:annex#<key>`) and serves every press with ONE core
 * pipeline (`core:spec/set-annex-field`), writing through the same annex
 * write as `set-session-annex`. `act` absent is **pipeline-written only**: no
 * action, and a press is refused.
 *
 * ```ts
 * defineExtension({
 *   slug: 'acme.dice',
 *   // …
 *   annexFields: [
 *     annexField({ key: 'last-roll', shape: { type: 'integer', min: 1, max: 20 }, see: ['person'], act: ['participant'] }),
 *     annexField({ key: 'streak', shape: { type: 'integer' } }), // pipelines write it; nobody sees it
 *   ],
 * })
 * // in the widget:
 * invoke(annexFieldAction('acme.dice', 'last-roll'), { payload: { value: 17 } })
 * ```
 *
 * Declared on the extension (`defineExtension({ annexFields })`): every
 * session the plugin is on, or — with `genre` — that genre's sessions only.
 * The **owner** is the declaring package's slug, never named by the
 * declaration, so a field can only ever describe its own package's document.
 * Core's own keys are core-catalog's `CORE_ANNEX_FIELDS`, under `core`.
 *
 * Never credentials or personal data (R61): a shape holding a `secret`
 * anywhere is refused at the declaration.
 *
 * @experimental 🚧 provisional — the vocabulary (annex field, annex
 * declaration, settable, the `<owner>:annex#<key>` identity) is new with this
 * module.
 */

import { dataAudienceFindings, isParticipantRef } from './participants.js'
import { checkSchema, checkValues, type FieldDecl, type SettingsSchema } from './settings.js'
import { i18nFindings, type I18n } from './i18n.js'
import type { VarField } from './template.js'
import { isDataRef } from './refs.js'

/** An annex field's key: a lowercase kebab token, the second half of its action identity. @experimental */
export const ANNEX_FIELD_KEY = /^[a-z][a-z0-9-]*$/

/**
 * The one core pipeline every annex field's press runs. Contributes no
 * action of its own: only the host's door, having judged the press, runs it.
 * @experimental
 */
export const ANNEX_FIELD_SPEC_ID = 'core:spec/set-annex-field'

/** What an annex field's action identity carries as its spec slug: `<owner>` + this. @experimental */
export const ANNEX_FIELD_SLUG_SUFFIX = ':annex'

/** References that cannot press anything: the model's context, a message, a run. @internal */
const NOT_A_PRESSER = new Set(['ai', 'item', 'run-owner'])

/** One annex field, as a package declares it. @experimental */
export interface AnnexFieldDecl {
	readonly __decl: 'annex-field'
	/** The annex key the value is stored under, in the owner's document. */
	readonly key: string
	/** What the value must be — the settings vocabulary's `FieldDecl`, checked by `checkValues`. */
	readonly shape: FieldDecl
	/**
	 * Who may SEE the stored value besides pipelines (R57) — a data
	 * audience (participant references). `[]` (the default) is
	 * pipelines only (R59): a widget cannot read back a value nobody may see.
	 */
	readonly see: readonly string[]
	/**
	 * Who may SET it through its ready-made action (`<owner>:annex#<key>`) —
	 * the action's `act` audience. Absent: pipeline-written only — no action
	 * is offered and a press is refused.
	 */
	readonly act?: readonly string[]
	/** The genre id whose sessions offer it; absent is every session the package is on. */
	readonly genre?: string
	/** What a listing calls the action. Default: the key. */
	readonly label?: I18n
	readonly description?: I18n
}

/** What `annexField()` takes. @experimental */
export type AnnexFieldInput = {
	key: string
	shape: FieldDecl
	see?: readonly string[]
	act?: readonly string[]
	/** Only this genre's sessions — the genre value (or its id). */
	genre?: { readonly id: string } | string
	label?: I18n
	description?: I18n
}

/** Does this shape hold a `secret` anywhere — at the top, in a list's item, in an object's member? @internal */
function holdsSecret(shape: FieldDecl | undefined): boolean {
	if (!shape || typeof shape !== 'object') return false
	if (shape.type === 'secret') return true
	if (shape.type === 'list') return holdsSecret(shape.item)
	if (shape.type === 'object') return Object.values(shape.fields ?? {}).some((f) => holdsSecret(f))
	return false
}

/**
 * Why this is not an annex field, one sentence per fault — `[]` when it is.
 * The host runs it again over a stored manifest, which an older SDK built.
 * @experimental
 */
export function annexFieldFindings(raw: unknown, at = 'annexFields'): string[] {
	if (!raw || typeof raw !== 'object') return [`${at}: an annex field is annexField({ key, shape, see?, act? })`]
	const f = raw as Record<string, unknown>
	const where = `${at}[${typeof f.key === 'string' ? f.key : '?'}]`
	const out: string[] = []
	if (typeof f.key !== 'string' || !ANNEX_FIELD_KEY.test(f.key))
		out.push(
			`${where}: 'key' is a lowercase kebab token (${ANNEX_FIELD_KEY.source}) — the field sits in ` +
				`your own package's annex document, so it never names an owner`,
		)
	const shape = f.shape as FieldDecl | undefined
	if (!shape || typeof shape !== 'object' || typeof shape.type !== 'string')
		out.push(`${where}: 'shape' is a field declaration — { type: 'integer', min: 1, max: 20 }`)
	else if (holdsSecret(shape))
		out.push(
			`${where}: the shape holds a secret — the annex never keeps credentials or personal data ` +
				`(R61); keep a secret in plugin settings`,
		)
	else
		for (const finding of checkSchema({ [String(f.key)]: shape }))
			if (finding.severity === 'error') out.push(`${where}: ${finding.message} — ${finding.fix}`)
	const see = dataAudienceFindings(f.see)
	if (see) out.push(`${where}.see: ${see}`)
	if (f.act !== undefined) {
		if (!Array.isArray(f.act) || !f.act.length)
			out.push(`${where}.act: a non-empty list of participant references — who may set the value`)
		else
			for (const r of f.act) {
				if (!isParticipantRef(r))
					out.push(`${where}.act: '${String(r)}' is not a participant reference`)
				else if (NOT_A_PRESSER.has(String(r).trim()))
					out.push(`${where}.act: '${String(r)}' cannot press anything — name who sets the value`)
			}
	}
	if (f.genre !== undefined) {
		const g = typeof f.genre === 'string' ? f.genre : (f.genre as { id?: unknown } | null)?.id
		if (typeof g !== 'string' || !/^[a-z0-9.-]+:genre\/[a-z0-9.-]+/.test(g))
			out.push(`${where}.genre: a genre — the value genre() returned, or its id ('acme.dice:genre/table')`)
	}
	out.push(...i18nFindings(f.label as I18n | undefined, `${where}.label`))
	out.push(...i18nFindings(f.description as I18n | undefined, `${where}.description`))
	return out
}

/**
 * Declare an annex field. Throws with every fault at once — an author sees
 * them while writing, never at a press.
 * @experimental
 */
export function annexField(d: AnnexFieldInput): AnnexFieldDecl {
	const problems = annexFieldFindings(d, 'annexField')
	if (problems.length) throw new Error(problems.join('\n'))
	return Object.freeze({
		__decl: 'annex-field' as const,
		key: d.key,
		shape: d.shape,
		see: Object.freeze([...(d.see ?? [])]),
		...(d.act !== undefined ? { act: Object.freeze([...d.act]) } : {}),
		...(d.genre !== undefined ? { genre: typeof d.genre === 'string' ? d.genre : d.genre.id } : {}),
		...(d.label !== undefined ? { label: d.label } : {}),
		...(d.description !== undefined ? { description: d.description } : {}),
	})
}

/** Faults in a list of fields: each one's, and a key declared twice. @experimental */
export function annexFieldListFindings(raw: unknown, at = 'annexFields'): string[] {
	if (raw === undefined) return []
	if (!Array.isArray(raw)) return [`${at}: a list of annexField(…) values`]
	const out: string[] = []
	const seen = new Set<string>()
	for (const f of raw) {
		out.push(...annexFieldFindings(f, at))
		const key = (f as { key?: unknown } | null)?.key
		if (typeof key === 'string') {
			if (seen.has(key)) out.push(`${at}: '${key}' is declared twice — a key has one shape and one audience`)
			seen.add(key)
		}
	}
	return out
}

/**
 * The action identity a widget invokes to set a field:
 * `annexFieldAction('acme.dice', 'last-roll')` → `acme.dice:annex#last-roll`.
 * @experimental
 */
export const annexFieldAction = (owner: string, key: string): string =>
	`${owner}${ANNEX_FIELD_SLUG_SUFFIX}#${key}`

/** Is this spec slug an annex field's (`<owner>:annex`)? @experimental */
export const isAnnexFieldSlug = (specSlug: string): boolean =>
	specSlug.endsWith(ANNEX_FIELD_SLUG_SUFFIX) && specSlug.length > ANNEX_FIELD_SLUG_SUFFIX.length

/** Take an annex field's identity apart; null for any other identity. @experimental */
export function parseAnnexFieldAction(id: unknown): { owner: string; key: string } | null {
	if (typeof id !== 'string') return null
	const i = id.lastIndexOf('#')
	if (i <= 0) return null
	const slug = id.slice(0, i)
	const key = id.slice(i + 1)
	if (!isAnnexFieldSlug(slug) || !ANNEX_FIELD_KEY.test(key)) return null
	return { owner: slug.slice(0, -ANNEX_FIELD_SLUG_SUFFIX.length), key }
}

/**
 * Why this press's payload cannot be stored under the field, as the
 * validator's sentence — or null when it can. The payload is `{ value }`.
 * @experimental
 */
export function annexFieldValueRefusal(
	field: Pick<AnnexFieldDecl, 'key' | 'shape'>,
	payload: unknown,
): string | null {
	if (!payload || typeof payload !== 'object' || Array.isArray(payload) || !('value' in payload))
		return `'${field.key}' is set with { payload: { value } }`
	const value = (payload as { value: unknown }).value
	if (value === undefined) return `'${field.key}' is set with { payload: { value } }`
	if (holdsSecret(field.shape)) return `'${field.key}' holds a secret, which the annex never keeps (R61)`
	const faults = checkValues({ [field.key]: field.shape }, { [field.key]: value }).filter(
		(f) => f.severity === 'error',
	)
	return faults.length ? faults.map((f) => f.message).join('; ') : null
}

// ── The annex declaration: one per owner (owner ruling 2026-09-26) ──────────

/**
 * The owners whose annex declaration this process knows — core's (registered
 * by core-catalog) and each installed package's (registered by the host from
 * its stored manifest). An owner absent here is **unknown**, which is not the
 * same as declaring nothing: `validate()` cannot judge an unknown owner's
 * keys and leaves them to the package pass and the host.
 * @internal
 */
const declarations = new Map<string, readonly AnnexFieldDecl[]>()

/**
 * Register an owner's annex declaration — its whole list of annex fields,
 * replacing whatever was registered for it. Checked as a list (a key declared
 * twice is refused); a stored entry an older SDK built is normalised through
 * `annexField()`. Throws with every fault at once. The host's and
 * core-catalog's to call: a package declares on `defineExtension({ annexFields })`.
 * @internal
 */
export function declareAnnex(owner: string, fields: readonly unknown[]): readonly AnnexFieldDecl[] {
	if (typeof owner !== 'string' || !owner.trim() || owner.includes('#'))
		throw new Error(`declareAnnex: '${String(owner)}' is not an owner — a package slug, or 'core'`)
	const faults = annexFieldListFindings(fields, `${owner}.annexFields`)
	if (faults.length) throw new Error(faults.join('\n'))
	const list = Object.freeze(fields.map((f) => annexField(f as AnnexFieldInput)))
	declarations.set(owner, list)
	return list
}

/** Forget an owner's declaration (uninstall, reinstall). @internal */
export function _withdrawAnnex(owner: string): void {
	declarations.delete(owner)
}

/** Every declaration, for a test to put back what it found. @internal */
export function _clearAnnexDeclarations(): void {
	declarations.clear()
}

/** Every owner with a declaration registered in this process, in registration order. @experimental */
export const annexOwners = (): string[] => [...declarations.keys()]

/**
 * An owner's annex declaration as registered in this process, or undefined
 * when the owner is unknown here. @experimental
 */
export const annexDeclarationOf = (owner: string): readonly AnnexFieldDecl[] | undefined => declarations.get(owner)

/**
 * The fields of a declaration in force for a session of `genre`: every
 * unscoped field and the ones scoped to that genre. With no genre — a
 * document judged before it knows its session — every field, whatever genre
 * it is scoped to. Pure. @experimental
 */
export function annexFieldsInGenre(
	fields: readonly AnnexFieldDecl[],
	genre?: string,
): AnnexFieldDecl[] {
	return fields.filter((f) => f.genre === undefined || genre === undefined || f.genre === genre)
}

/** Whether a declared field may be set by a person, through its ready-made action. @experimental */
export const isSettableAnnexField = (f: Pick<AnnexFieldDecl, 'act'>): boolean => !!f.act?.length

/**
 * An owner's annex schema — key → declared shape — for a session of `genre`
 * (or every genre, with none). Undefined when the owner is unknown here; `{}`
 * when it declares nothing. What a typed template reads `annex.<owner>.<key>`
 * against (typed-templates §1b, P6). @experimental
 */
export function annexSchemaOf(owner: string, genre?: string): SettingsSchema | undefined {
	const fields = declarations.get(owner)
	if (!fields) return undefined
	return Object.fromEntries(annexFieldsInGenre(fields, genre).map((f) => [f.key, f.shape]))
}

/**
 * The same schema as a template variable: an `object` whose members are the
 * declared keys, each optional (a key is absent until something writes it).
 * Undefined when the owner is unknown here. @experimental
 */
export function annexVarFieldOf(owner: string, genre?: string): VarField | undefined {
	const schema = annexSchemaOf(owner, genre)
	if (!schema) return undefined
	return {
		type: 'object',
		fields: Object.fromEntries(
			Object.entries(schema).map(([k, d]) => [k, { ...varFieldOfDecl(d), optional: true }]),
		),
	}
}

/** A settings field declaration read as a template variable. @internal */
function varFieldOfDecl(d: FieldDecl): VarField {
	const described = (v: VarField): VarField =>
		d.description !== undefined ? { ...v, description: d.description } : v
	switch (d.type) {
		case 'integer':
		case 'number':
			return described({ type: 'number' })
		case 'boolean':
			return described({ type: 'boolean' })
		case 'string[]':
			return described({ type: 'list', of: { type: 'string' } })
		case 'list':
			return described({ type: 'list', of: d.item ? varFieldOfDecl(d.item) : { type: 'string' } })
		case 'object':
			return described({
				type: 'object',
				fields: Object.fromEntries(
					Object.entries(d.fields ?? {}).map(([k, m]) => [
						k,
						m.required ? varFieldOfDecl(m) : { ...varFieldOfDecl(m), optional: true },
					]),
				),
			})
		case 'share':
		case 'perMember':
		case 'strengths':
			return described({ type: 'record', of: { type: 'number' } })
		default:
			return described({ type: 'string' })
	}
}

/** Whose annex a spec writes by default: the namespace of its id, before the colon. @experimental */
export const annexOwnerOfSpec = (specId: string | undefined): string => {
	if (!specId) return 'core'
	const at = specId.indexOf(':')
	return at > 0 ? specId.slice(0, at) : specId
}

/**
 * The keys a `set-session-annex` step writes, read off its config: the
 * members of a `value` object (literal or assembled from refs). Null when the
 * step wires `value` whole, so its keys are known only at the write. `[]`
 * when it writes nothing. Pure. @experimental
 */
export function annexWriteKeysOf(
	config: Record<string, unknown> | undefined,
	edgesIntoValue: readonly string[] = [],
): string[] | null {
	if (edgesIntoValue.includes('value')) return null
	const value = config?.value
	const fromEdges = edgesIntoValue.filter((p) => p.startsWith('value.')).map((p) => p.split('.')[1]!)
	if (value === undefined) return [...new Set(fromEdges)]
	if (isDataRef(value) || !value || typeof value !== 'object' || Array.isArray(value)) return null
	return [...new Set([...Object.keys(value), ...fromEdges])]
}

/** One write to an owner's annex document, as a judge sees it. @experimental */
export interface AnnexWrite {
	owner: string
	/** The keys written. */
	keys: readonly string[]
	/** The session's genre; undefined judges against every genre's fields. */
	genre?: string
	/** The values, when known (the host's write): each is held to its declared shape. */
	values?: Record<string, unknown>
}

/**
 * Why this write is refused under the owner's declaration — one sentence per
 * fault, `[]` when it may be stored. The one judge `validate()`, the package
 * pass and the host's write all quote:
 *
 * - a key the owner does not declare (for this genre) is refused by name;
 * - a value is held to its declared shape (the validator's sentence).
 *
 * `fields` undefined is an owner that declares nothing: every key is refused.
 * @experimental
 */
export function annexWriteRefusals(fields: readonly AnnexFieldDecl[] | undefined, w: AnnexWrite): string[] {
	const out: string[] = []
	const inForce = annexFieldsInGenre(fields ?? [], w.genre)
	for (const key of w.keys) {
		const decl = inForce.find((f) => f.key === key)
		if (!decl) {
			const elsewhere = (fields ?? []).find((f) => f.key === key)
			out.push(
				`'${key}' is not a key '${w.owner}' declares in its annex` +
					(elsewhere?.genre ? ` for this genre (it is declared for '${elsewhere.genre}')` : '') +
					` — declare it once, with annexField({ key: '${key}', shape, see }) on the owner's annexFields`,
			)
			continue
		}
		if (w.values && Object.hasOwn(w.values, key)) {
			const value = w.values[key]
			if (value !== null && value !== undefined) {
				const fault = annexFieldValueRefusal(decl, { value })
				if (fault) out.push(fault)
			}
		}
	}
	return out
}

/**
 * The `set-session-annex` steps of one pipeline that a declaration refuses,
 * judged where the keys are literal — the package pass's and `validate()`'s
 * shared reading. `fieldsOf(owner)` answers undefined for an owner it cannot
 * judge (another package's, unknown here): those steps are left to the host.
 * @internal
 */
export function annexStepFindings(
	spec: {
		id: string
		input?: { genre?: string }
		nodes: ReadonlyArray<{ key: string; definitionId: string; config: Record<string, unknown> }>
		edges?: ReadonlyArray<{ to: string; toPort: string }>
	},
	fieldsOf: (owner: string) => readonly AnnexFieldDecl[] | undefined,
): Array<{ nodeKey: string; owner: string; refusals: string[] }> {
	const out: Array<{ nodeKey: string; owner: string; refusals: string[] }> = []
	const specOwner = annexOwnerOfSpec(spec.id)
	for (const n of spec.nodes) {
		if (n.definitionId !== 'core:outlet/set-session-annex') continue
		const params = (n.config?.params ?? {}) as { owner?: unknown; sharedAnnex?: unknown }
		const named = typeof params.owner === 'string' && params.owner.trim() ? params.owner.trim() : null
		const owner = named && params.sharedAnnex === true ? named : specOwner
		const fields = fieldsOf(owner)
		if (fields === undefined) continue
		const into = (spec.edges ?? []).filter((e) => e.to === n.key).map((e) => e.toPort)
		const keys = annexWriteKeysOf(n.config, into.filter((p) => p === 'value' || p.startsWith('value.')))
		const refusals = annexWriteRefusals(fields, {
			owner,
			keys: keys ?? [],
			genre: spec.input?.genre,
			values:
				keys && n.config?.value && typeof n.config.value === 'object' && !isDataRef(n.config.value)
					? Object.fromEntries(
							Object.entries(n.config.value as Record<string, unknown>).filter(([, v]) => !collectsRef(v)),
						)
					: undefined,
		})
		if (refusals.length) out.push({ nodeKey: n.key, owner, refusals })
	}
	return out
}

/** Whether a literal holds a data ref somewhere (then its value is known only at run time). @internal */
function collectsRef(v: unknown): boolean {
	if (isDataRef(v)) return true
	if (Array.isArray(v)) return v.some(collectsRef)
	if (v && typeof v === 'object') return Object.values(v).some(collectsRef)
	return false
}
