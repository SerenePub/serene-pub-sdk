/**
 * 🚧 **A declared shape, as the JSON Schema a model answers against — and the
 * one check on the answer** (Lair rewrite D1, 2026-10-21; PROPOSAL §12).
 *
 * `generate-json@1`'s `schema` in-port takes a JSON Schema document; until
 * now every pipeline that asked a model for something declared wrote that
 * document by hand beside the declaration, and the two drifted. Here the
 * declaration is the source:
 *
 *  · an **entry type** (`EntryTypeDecl`, or the registered descriptor) —
 *    the fields `create-lore-entry@1`'s `fields` port takes; a ruleset's
 *    derived entry types (`rulesetEntryTypeDecls`) included, so a room draft
 *    asks for exactly the fields the session's ruleset declares;
 *  · an **attribute sheet** — or a ruleset's stats, read as its sheet —
 *    keyed by each slot's slug (`sheetSchemaKeys`);
 *  · a **repertoire**'s piece shape — one inline piece;
 *  · a **form** in a message (`choices`, `form`, `roll`) — its answer.
 *
 * `jsonSchemaOf(decl)` asks; `validateAgainst(decl, value)` checks the answer
 * against the **same** declaration with the SDK's existing checkers
 * (`checkValues`, `checkSlotValue`, `checkPiece`, `formFireOf`), so what was
 * asked and what is accepted cannot disagree. `fieldsFindings` is the entry
 * type's half, the one a host calls at the review gate and the commit.
 *
 * ## Strict by default
 *
 * The schema goes out through whichever door the connection holds — native
 * `json_schema`, a grammar compiled from it, or a sentence — so by default it
 * is the subset all three can carry: every property listed in `required`,
 * `additionalProperties: false`, no `null`, no combinators, no `maxLength`,
 * no `const` (a single-element `enum` pins a value). What a model could not
 * write is left out rather than loosened: a secret, a media reference, a
 * free-form JSON map, an enum whose options come from a live connection, an
 * object that declares no members. `strict: false` keeps optional fields
 * optional, for a reader or a service that takes them.
 *
 * ⚠ Strict means a model fills every field it is shown — leave out what it
 * should not invent (`omit`: an entry's priority, read off its `roles`).
 * @experimental
 * @ruling Lair rewrite D1 (2026-10-21)
 */

import { checkValues, type FieldDecl, type SettingsFinding, type SettingsSchema } from './settings.js'
import { i18nText, type I18n } from './i18n.js'
import {
	checkSlotValue,
	getAttributeSlot,
	resolveSlotConfig,
	slotField,
	slotSlug,
	type AttributeSlotDecl,
	type SlotAppliesTo,
	type SlotConfig,
	type SlotId,
	type SlotPiece,
	type SlotValue,
} from './attributes.js'
import { sheetSlotAppliesTo, type SheetSlotEntry } from './sheets.js'
import { checkPiece, getRepertoire, pieceDurationProblem, type RepertoireDecl } from './repertoires.js'
import { derivedEntryTypeSource, type RulesetDecl } from './rulesets.js'
import { allEntryTypes, type EntryDescriptor, type EntryShape, type EntryTypeDecl } from './descriptors.js'
import { formAnswerSchema, formFireOf, type FormBlock } from './messageBlocks.js'
import type { CheckMethodKindDecl } from './checkMethods.js'
import { isFunctionId, type FunctionDecl } from './functions.js'
import { declaresSections, rulesetSections, rulesetAttributeSlots } from './rulesetSections.js'

/**
 * 🚧 A JSON Schema document — what `generate-json@1`'s `schema` port takes
 * (`S.json`), as plain data. ⚠ Not a `SettingsSchema` (the one field
 * language a declaration is written in) and not a shape (`S.*`).
 * @experimental
 */
export interface JsonSchema {
	[keyword: string]: unknown
}

/**
 * 🚧 What `jsonSchemaOf` and `validateAgainst` read: an entry type (declared
 * or registered), an attribute sheet (or anything with its `slots`), a
 * ruleset (its stats, as its sheet), a repertoire (its piece shape), a
 * form block (its answer), or 🚧 a check method kind (its options —
 * `CHECK_METHOD_KINDS[kind]`, 2026-10-22).
 * @experimental
 */
export type JsonSchemaSource =
	| EntryTypeDecl
	| EntryDescriptor
	| { readonly slots: readonly SheetSlotEntry[] }
	| RulesetDecl
	| RepertoireDecl
	| FormBlock
	| CheckMethodKindDecl
	| FunctionDecl

/** 🚧 How `jsonSchemaOf` writes the document. @experimental */
export interface JsonSchemaOptions {
	/**
	 * The subset every structured-output door carries (the module note):
	 * every property required, nothing a grammar cannot hold. Default `true`.
	 */
	strict?: boolean
	/**
	 * Fields to leave out, by dotted path (`priority`, `duration.startedAt`).
	 * A list's element fields are named through the list's own key.
	 */
	omit?: readonly string[]
	/** A sheet or a ruleset: only the slots it puts on this owner (`sheetSlotAppliesTo`). */
	appliesTo?: SlotAppliesTo
	/** The language descriptions are read in. Default `'en'` — the model's. */
	language?: string
	/**
	 * 🚧 A function module: which of its schemas — `form` (its options, the
	 * default), `schema` (the fields it adds to a JSON reply, R7) or
	 * `invokable` (what a person answers when invoking it as an action; its
	 * `form` when it says none). 2026-10-23.
	 */
	part?: 'form' | 'schema' | 'invokable'
}

/** 🚧 How `validateAgainst` reads the value. @experimental */
export interface ValidateAgainstOptions {
	/**
	 * A patch: the keys it names are checked, nothing is required, `null`
	 * clears a field (update-lore-entry's `fields`, a reference's overrides).
	 */
	partial?: boolean
	/** A sheet or a ruleset: only the slots it puts on this owner. */
	appliesTo?: SlotAppliesTo
	/** 🚧 A function module: which of its schemas the value answers (`JsonSchemaOptions.part`). */
	part?: 'form' | 'schema' | 'invokable'
}

/**
 * The piece fields the host keeps while it counts a duration down — never
 * asked of a model (`PieceDuration.startedAt` / `spent`).
 */
const PIECE_BOOKKEEPING = ['duration.startedAt', 'duration.spent'] as const

/**
 * The field a type with a title role carries in the outlets' `name` port —
 * a derived entry type's piece `name`. Never a second copy in `fields`.
 */
const TITLE_PORT_FIELD = 'name'

// ── Which declaration ───────────────────────────────────────────────────────

type Classified =
	| { kind: 'entry'; id: string; shape: EntryShape }
	| { kind: 'sheet'; slots: readonly SheetSlotEntry[] }
	| { kind: 'repertoire'; rep: RepertoireDecl }
	| { kind: 'form'; block: FormBlock }
	| { kind: 'method'; decl: CheckMethodKindDecl }
	| { kind: 'function'; decl: FunctionDecl }

const FORM_KINDS: ReadonlySet<unknown> = new Set(['choices', 'form', 'roll'])

function classify(source: JsonSchemaSource): Classified {
	const s = source as unknown as Record<string, unknown>
	if (!s || typeof s !== 'object') throw new TypeError(notASource(source))
	if (typeof s.methodKind === 'string' && s.options && typeof s.options === 'object' && !Array.isArray(s.options))
		return { kind: 'method', decl: source as CheckMethodKindDecl }
	if (s.kind === 'entry' && s.entryShape && typeof s.id === 'string')
		return { kind: 'entry', id: s.id, shape: s.entryShape as EntryShape }
	if (FORM_KINDS.has(s.kind)) return { kind: 'form', block: source as FormBlock }
	if (s.roles && typeof s.sourceKind === 'string' && typeof s.id === 'string') {
		const { id: _id, i18n: _i, ...shape } = source as EntryTypeDecl
		return { kind: 'entry', id: s.id, shape }
	}
	// 🚧 A function module (2026-10-23): its options, reply fields or action form.
	if (typeof s.id === 'string' && isFunctionId(s.id) && typeof s.kind === 'string' && typeof s.prose === 'string')
		return { kind: 'function', decl: source as FunctionDecl }
	if (s.piece && typeof s.prose === 'string' && typeof s.id === 'string')
		return { kind: 'repertoire', rep: source as RepertoireDecl }
	// 🚧 A ruleset in sections (2026-10-23): its attributes are its sheet — the
	// slot each names, else the one its own attribute is filed under.
	if (typeof s.id === 'string' && /:ruleset\//.test(s.id) && Array.isArray(s.attributes) && declaresSections(s)) {
		const slots = rulesetAttributeSlots({ id: s.id, attributes: rulesetSections(s).attributes })
		return {
			kind: 'sheet',
			slots: (rulesetSections(s).attributes ?? []).map((a) => ({
				id: slots.get(a.id)!,
				...(a.slot !== undefined && a.config !== undefined ? { config: a.config } : {}),
				...(a.slot !== undefined && a.start !== undefined ? { default: a.start } : {}),
				...(a.required !== undefined ? { required: a.required } : {}),
				...(a.slot !== undefined && a.carriedBy !== undefined ? { appliesTo: a.carriedBy } : {}),
			})),
		}
	}
	if (Array.isArray(s.stats) && s.conventions) return { kind: 'sheet', slots: s.stats as readonly SheetSlotEntry[] }
	if (Array.isArray(s.slots)) return { kind: 'sheet', slots: s.slots as readonly SheetSlotEntry[] }
	throw new TypeError(notASource(source))
}

const notASource = (source: unknown): string =>
	`jsonSchemaOf / validateAgainst read an entry type, an attribute sheet, a ruleset, a repertoire, a ` +
	`form block or a check method kind — or a function module; '${typeof source === 'object' ? JSON.stringify(source)?.slice(0, 80) : String(source)}' is none of them.`

// ── The one field language, as JSON Schema ──────────────────────────────────

interface Ctx {
	strict: boolean
	omit: ReadonlySet<string>
	language: string
}

const describe = (decl: { description?: I18n; label?: I18n }, ctx: Ctx): JsonSchema => {
	const text = i18nText(decl.description, ctx.language) ?? i18nText(decl.label, ctx.language)
	return text ? { description: text } : {}
}

/** What a story-time field is told, beside its own description — `storyTime.ts`'s canonical line. */
const STORY_TIME_SENTENCE = "A story time: a year, then optionally month, day and time, as '412-03-05 22:30'."

const own = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k)

/** The options an enum stores: `of`, else its members' keys. */
const enumOptions = (decl: FieldDecl): readonly string[] => decl.of ?? decl.members?.map((m) => m.key) ?? []

/** One field, or `undefined` when it is nothing a model could write (the module note). */
function fieldSchema(decl: FieldDecl, path: string, ctx: Ctx): JsonSchema | undefined {
	const about = describe(decl, ctx)
	switch (decl.type) {
		case 'secret':
		case 'media':
			return undefined
		case 'boolean':
			return { type: 'boolean', ...about }
		case 'integer':
		case 'number':
			return {
				type: decl.type,
				...(decl.min !== undefined ? { minimum: decl.min } : {}),
				...(decl.max !== undefined ? { maximum: decl.max } : {}),
				...about,
			}
		case 'enum': {
			const of = enumOptions(decl)
			return of.length ? { type: 'string', enum: [...of], ...about } : undefined
		}
		case 'string[]':
			return { type: 'array', items: { type: 'string' }, ...about }
		case 'list': {
			const item = decl.item ? fieldSchema(decl.item, path, ctx) : undefined
			if (!item) return undefined
			return {
				type: 'array',
				items: item,
				...(decl.min !== undefined ? { minItems: decl.min } : {}),
				...(decl.max !== undefined ? { maxItems: decl.max } : {}),
				...about,
			}
		}
		case 'object': {
			const nested = objectSchema(decl.fields ?? {}, `${path}.`, ctx)
			if (!Object.keys(nested.properties as object).length) return ctx.strict ? undefined : { type: 'object', ...about }
			return { ...nested, ...about }
		}
		case 'share':
		case 'perMember':
		case 'strengths': {
			const members = decl.members ?? []
			if (!members.length) return undefined
			const one: JsonSchema = decl.type === 'strengths' ? { type: 'number', minimum: 0, maximum: 1 } : { type: 'number' }
			return {
				type: 'object',
				properties: Object.fromEntries(members.map((m) => [m.key, { ...one }])),
				required: members.map((m) => m.key),
				additionalProperties: false,
				...about,
			}
		}
		default:
			// `string` and `text`. A JSON map or a logit-bias list held as text is
			// structure a person edits, not words a model writes.
			if (decl.format === 'json' || decl.format === 'logit-bias') return undefined
			if (decl.format === 'story-time')
				return { type: 'string', description: [about.description, STORY_TIME_SENTENCE].filter(Boolean).join(' ') }
			return { type: 'string', ...about }
	}
}

/** A record of fields: every one it can carry, in declaration order. */
function objectSchema(fields: Readonly<Record<string, FieldDecl>>, prefix: string, ctx: Ctx): JsonSchema {
	const properties: Record<string, JsonSchema> = {}
	const required: string[] = []
	for (const [key, decl] of Object.entries(fields)) {
		if (ctx.omit.has(`${prefix}${key}`)) continue
		const one = fieldSchema(decl, `${prefix}${key}`, ctx)
		if (!one) continue
		properties[key] = one
		if (ctx.strict || decl.required) required.push(key)
	}
	return { type: 'object', properties, required, additionalProperties: false }
}

// ── Each declaration's fields ───────────────────────────────────────────────

/** An entry type's typed fields — every declared field but the title's (the `name` port). */
function entryFields(shape: EntryShape): SettingsSchema {
	const fields = { ...(shape.fields ?? {}) }
	if (shape.roles?.title !== undefined) delete fields[TITLE_PORT_FIELD]
	return fields
}

/** A sheet's entries that can be asked for: declared, not derived, not retired — on `appliesTo`, when given. */
function askableEntries(
	slots: readonly SheetSlotEntry[],
	appliesTo: SlotAppliesTo | undefined,
): Array<{ entry: SheetSlotEntry; decl: AttributeSlotDecl }> {
	const out: Array<{ entry: SheetSlotEntry; decl: AttributeSlotDecl }> = []
	for (const entry of slots) {
		const decl = getAttributeSlot(entry.id)
		if (!decl || decl.type === 'derived' || decl.retired) continue
		if (appliesTo !== undefined && !sheetSlotAppliesTo(entry, decl).includes(appliesTo)) continue
		out.push({ entry, decl })
	}
	return out
}

/**
 * 🚧 The keys a sheet's JSON Schema uses, each to the slot it answers for:
 * the slot's slug (`hp`, `death-saves`) — or, where two slots on the sheet
 * share a slug, each one's full slot id. Derived and retired slots ask for
 * nothing and are not here. A ruleset's stats read as its sheet. What a host
 * reads an answer back through.
 * @experimental
 */
export function sheetSchemaKeys(
	sheet: { readonly slots: readonly SheetSlotEntry[] } | Pick<RulesetDecl, 'stats'>,
	opts: { appliesTo?: SlotAppliesTo } = {},
): ReadonlyMap<string, SlotId> {
	const slots = 'slots' in sheet ? sheet.slots : sheet.stats
	const entries = askableEntries(slots, opts.appliesTo)
	const slugs = new Map<string, number>()
	for (const { entry } of entries) slugs.set(slotSlug(entry.id), (slugs.get(slotSlug(entry.id)) ?? 0) + 1)
	return new Map(
		entries.map(({ entry }) => [slugs.get(slotSlug(entry.id))! > 1 ? entry.id : slotSlug(entry.id), entry.id] as const),
	)
}

/** One slot's value, as its type and this sheet's configuration say. */
function slotSchema(decl: AttributeSlotDecl, config: SlotConfig, path: string, ctx: Ctx): JsonSchema | undefined {
	const about = decl.descriptor ? { description: decl.descriptor } : describe(decl, ctx)
	const field = slotField(decl)
	switch (decl.type) {
		case 'integer':
			return {
				type: field?.type === 'number' ? 'number' : 'integer',
				...(typeof config.min === 'number' ? { minimum: config.min } : {}),
				...(typeof config.max === 'number' ? { maximum: config.max } : {}),
				...about,
			}
		case 'enum': {
			const of = config.of ?? []
			return of.length ? { type: 'string', enum: [...of], ...about } : undefined
		}
		case 'boolean':
			return { type: 'boolean', ...about }
		case 'text':
			if (field?.format !== 'story-time') return { type: 'string', ...about }
			return {
				type: 'string',
				description: [about.description, STORY_TIME_SENTENCE].filter(Boolean).join(' '),
			}
		case 'list': {
			const rep = typeof config.repertoire === 'string' ? getRepertoire(config.repertoire) : undefined
			let items: JsonSchema | undefined
			if (rep) {
				const piece = pieceSchema(rep, path, ctx)
				items = {
					...piece,
					properties: { kind: { type: 'string', enum: ['inline'] }, ...(piece.properties as object) },
					required: ['kind', ...(piece.required as string[])],
				}
			} else if (config.of?.length) items = { type: 'string', enum: [...config.of] }
			else items = { type: 'string' }
			return {
				type: 'array',
				items,
				...(typeof config.maxItems === 'number' ? { maxItems: config.maxItems } : {}),
				...about,
			}
		}
		default:
			return undefined
	}
}

/** One inline piece of a repertoire: its whole piece shape, the host's bookkeeping left out. */
function pieceSchema(rep: RepertoireDecl, prefix: string, ctx: Ctx): JsonSchema {
	const omit = new Set(ctx.omit)
	for (const p of PIECE_BOOKKEEPING) omit.add(prefix ? `${prefix}.${p}` : p)
	return objectSchema(rep.piece.fields ?? {}, prefix ? `${prefix}.` : '', { ...ctx, omit })
}

// ── The two doors ───────────────────────────────────────────────────────────

/**
 * 🚧 A declaration as the JSON Schema a model answers against — what
 * `generate-json@1`'s `schema` in-port takes. Strict by default (the module
 * note); `omit` leaves fields out by dotted path; a sheet or ruleset reads
 * the slots it puts on `appliesTo` when one is given.
 *
 *  · entry type → `{ <field>: … }`, the type's typed fields (the title's
 *    excepted — that is the `name` port): what `create-lore-entry@1`'s
 *    `fields` takes. A derived entry type leaves out the host's duration
 *    bookkeeping, as a piece does.
 *  · sheet / ruleset → `{ <slot slug>: … }` (`sheetSchemaKeys`), each slot's
 *    value as its configuration bounds it; a repertoire list's items are
 *    inline pieces (`kind: 'inline'`).
 *  · repertoire → one inline piece (its universal parts and its own),
 *    without the host's duration bookkeeping.
 *  · form block → its answer (`formAnswerSchema`, strict).
 *  · 🚧 check method kind (`CHECK_METHOD_KINDS[kind]`) → its options, the
 *    editor's form for a method (`{ strict: false }` for a form; 2026-10-22).
 * @experimental
 * @ruling Lair rewrite D1 (2026-10-21)
 */
export function jsonSchemaOf(source: JsonSchemaSource, opts: JsonSchemaOptions = {}): JsonSchema {
	const ctx: Ctx = { strict: opts.strict !== false, omit: new Set(opts.omit ?? []), language: opts.language ?? 'en' }
	const c = classify(source)
	switch (c.kind) {
		case 'entry': {
			// A derived entry type's fields are its repertoire's piece shape:
			// the host's duration bookkeeping is no more the model's here.
			const derived = derivedEntryTypeSource(c.id) !== undefined
			const omit = derived ? new Set([...ctx.omit, ...PIECE_BOOKKEEPING]) : ctx.omit
			return objectSchema(entryFields(c.shape), '', { ...ctx, omit })
		}
		case 'repertoire':
			return pieceSchema(c.rep, '', ctx)
		case 'method':
			return objectSchema(c.decl.options, '', ctx)
		case 'function': {
			const part = opts.part ?? 'form'
			const fields = part === 'schema' ? c.decl.schema : part === 'invokable' ? (c.decl.invokable?.form ?? c.decl.form) : c.decl.form
			return objectSchema(fields ?? {}, '', ctx)
		}
		case 'form':
			return c.block.kind === 'form' ? objectSchema(c.block.fields, '', ctx) : formAnswerSchema(c.block)
		case 'sheet': {
			const keys = sheetSchemaKeys({ slots: c.slots }, opts)
			const byId = new Map(c.slots.map((e) => [e.id, e]))
			const properties: Record<string, JsonSchema> = {}
			const required: string[] = []
			for (const [key, slotId] of keys) {
				if (ctx.omit.has(key)) continue
				const entry = byId.get(slotId)!
				const decl = getAttributeSlot(slotId)!
				const one = slotSchema(decl, resolveSlotConfig(decl, entry.config), key, ctx)
				if (!one) continue
				properties[key] = one
				if (ctx.strict || entry.required) required.push(key)
			}
			return { type: 'object', properties, required, additionalProperties: false }
		}
	}
}

const bad = (field: string | undefined, message: string, fix: string): SettingsFinding => ({
	...(field !== undefined ? { field } : {}),
	severity: 'error',
	message,
	fix,
})

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/**
 * The fields as their schema asked for them, for the one value checker: an
 * enum declared by `members` alone checks against their keys, and a
 * `share` / `perMember` / `strengths` field is the record of numbers it was
 * asked as (a strength between 0 and 1) — which the checker, built for
 * stored settings, otherwise reads as text.
 */
function asAsked(fields: Readonly<Record<string, FieldDecl>>): SettingsSchema {
	const one = (d: FieldDecl): FieldDecl => {
		switch (d.type) {
			case 'enum':
				return !d.of && d.members?.length ? { ...d, of: d.members.map((m) => m.key) } : d
			case 'object':
				return d.fields ? { ...d, fields: asAsked(d.fields) } : d
			case 'list':
				return d.item ? { ...d, item: one(d.item) } : d
			case 'share':
			case 'perMember':
			case 'strengths': {
				const n: FieldDecl = d.type === 'strengths' ? { type: 'number', min: 0, max: 1 } : { type: 'number' }
				return {
					type: 'object',
					required: d.required,
					fields: Object.fromEntries((d.members ?? []).map((m) => [m.key, { ...n }])),
				}
			}
			default:
				return d
		}
	}
	return Object.fromEntries(Object.entries(fields).map(([k, d]) => [k, one(d)]))
}

/** A record of values against a record of fields: unknown keys, then the one value checker. */
function recordFindings(
	fields: Readonly<Record<string, FieldDecl>>,
	value: unknown,
	opts: { partial?: boolean; accepted?: ReadonlySet<string>; what: string },
): SettingsFinding[] {
	if (value === undefined || value === null) value = {}
	if (!isRecord(value))
		return [bad(undefined, `${opts.what} is not a record of fields`, `send an object keyed by field — ${Object.keys(fields).join(', ') || 'nothing is declared'}`)]
	const out: SettingsFinding[] = []
	for (const k of Object.keys(value))
		if (!own(fields, k) && !opts.accepted?.has(k))
			out.push(bad(k, `'${k}' is not a field of ${opts.what}`, `name one of: ${Object.keys(fields).join(', ') || '(none declared)'}`))
	const schema = asAsked(
		opts.partial
			? Object.fromEntries(Object.entries(fields).filter(([k]) => own(value, k)).map(([k, d]) => [k, { ...d, required: false }]))
			: fields,
	)
	for (const [k, d] of Object.entries(schema)) out.push(...nestedUnknown(d, value[k], k))
	// A patch clears with `null`; the checker reads a cleared optional field as unset already.
	return [...out, ...checkValues(schema, value).filter((f) => f.severity === 'error')]
}

/** An undeclared key inside an object field (or a list of them) — the schema refused it too. */
function nestedUnknown(decl: FieldDecl, v: unknown, path: string): SettingsFinding[] {
	if (decl.type === 'list' && decl.item && Array.isArray(v))
		return v.flatMap((item, i) => nestedUnknown(decl.item!, item, `${path}[${i}]`))
	if (decl.type !== 'object' || !decl.fields || !isRecord(v)) return []
	const out: SettingsFinding[] = []
	for (const k of Object.keys(v))
		if (!own(decl.fields, k))
			out.push(bad(`${path}.${k}`, `'${path}.${k}' is not a field`, `name one of: ${Object.keys(decl.fields).join(', ')}`))
		else out.push(...nestedUnknown(decl.fields[k]!, v[k], `${path}.${k}`))
	return out
}

/**
 * 🚧 An entry type's typed fields checked — what `create-lore-entry@1` and
 * `update-lore-entry@1` hold their `fields` to, at the review gate and the
 * commit (D2). `type` is the declaration, the registered descriptor, or an
 * id (bare — `core:entry/location`, as the outlets' `entryType` names it —
 * or versioned). Empty findings: it fits.
 *
 * Whole by default (a create: required fields must be there); `partial` for
 * a patch (an update: only the keys it names, `null` clears). An undeclared
 * key is refused, never dropped — a misfit is the author's to see; a derived
 * entry type also accepts its repertoire's retired and renamed piece fields
 * (stored pieces read through) and checks a `duration` as a piece's is.
 * Absent `fields` read as `{}`.
 * @experimental
 * @ruling Lair rewrite D2 (2026-10-21)
 */
export function fieldsFindings(
	type: EntryTypeDecl | EntryDescriptor | string,
	fields: unknown,
	opts: { partial?: boolean } = {},
): SettingsFinding[] {
	const resolved = typeof type === 'string' ? entryTypeById(type) : classify(type)
	if (!resolved || resolved.kind !== 'entry')
		return [
			bad(
				undefined,
				`'${String(type)}' is not a declared entry type`,
				`name one of: ${allEntryTypes().map((t) => t.id.replace(/@\d+$/, '')).join(', ')}`,
			),
		]
	const source = derivedEntryTypeSource(resolved.id)
	const accepted = new Set([...(source?.repertoire.retired ?? []), ...Object.keys(source?.repertoire.renames ?? {})])
	const out = recordFindings(entryFields(resolved.shape), fields, { partial: opts.partial, accepted, what: resolved.id })
	const durationSaid = out.some((f) => f.field === 'duration' || f.field?.startsWith('duration.'))
	if (source && !durationSaid && isRecord(fields) && fields.duration !== undefined && fields.duration !== null) {
		const why = pieceDurationProblem(fields.duration)
		if (why) out.push(bad('duration', why, "say { units, value?, expiry? } — 'round', 'minute', 'hour', 'day', 'turn', 'scene' or 'until-removed'"))
	}
	return out
}

/** An entry type by id — bare (its highest version) or versioned. */
function entryTypeById(id: string): Extract<Classified, { kind: 'entry' }> | undefined {
	const bare = id.replace(/@\d+$/, '')
	const matches = allEntryTypes().filter((t) => (/@\d+$/.test(id) ? t.id === id : t.id.replace(/@\d+$/, '') === bare))
	const best = matches.sort((a, b) => Number(b.id.split('@')[1]) - Number(a.id.split('@')[1]))[0]
	return best ? { kind: 'entry', id: best.id, shape: best.entryShape } : undefined
}

/**
 * 🚧 A value checked against the declaration `jsonSchemaOf` asked from — the
 * answer on its way back. Empty findings: it fits. Never throws on the
 * value; each finding names the field (`field`) where it can.
 *
 *  · entry type → `fieldsFindings`.
 *  · sheet / ruleset → each key a slot the sheet asks for, each value by
 *    `checkSlotValue` under this sheet's configuration; whole, a required
 *    slot with no default must be there.
 *  · repertoire → one inline piece by `checkPiece` (`kind` may be left
 *    out); `partial`, the keys as a reference's overrides.
 *  · form block → the answer `formFireOf` would fire, and a `form`'s values
 *    by its fields.
 * @experimental
 * @ruling Lair rewrite D1 (2026-10-21)
 */
export function validateAgainst(
	source: JsonSchemaSource,
	value: unknown,
	opts: ValidateAgainstOptions = {},
): SettingsFinding[] {
	const c = classify(source)
	switch (c.kind) {
		case 'entry':
			return fieldsFindings(source as EntryTypeDecl, value, opts)
		case 'method': {
			// A method's own options; the parts every method may say beside them pass.
			if (!isRecord(value)) return [bad(undefined, `a ${c.decl.methodKind} method is a record of its options`, 'send an object')]
			const { kind: _k, label: _l, description: _d, bands: _b, ...options } = value
			return recordFindings(c.decl.options, options, { partial: opts.partial, what: `a ${c.decl.methodKind} method` })
		}
		case 'function': {
			// 🚧 A function module (2026-10-23): a value checked against the part asked for — its options by default.
			const part = opts.part ?? 'form'
			const fields = part === 'schema' ? c.decl.schema : part === 'invokable' ? (c.decl.invokable?.form ?? c.decl.form) : c.decl.form
			return recordFindings(fields ?? {}, value, { partial: opts.partial, what: `${c.decl.id}'s ${part}` })
		}
		case 'repertoire': {
			if (!isRecord(value)) return [bad(undefined, `a '${c.rep.id}' piece is a record of its fields`, 'send an object')]
			const { kind, ...props } = value
			if (kind !== undefined && kind !== 'inline')
				return [bad('kind', `'${String(kind)}' is not an inline piece`, "leave 'kind' out, or say 'inline'")]
			const piece = (opts.partial
				? { kind: 'lore', entryId: 1, overrides: props }
				: { kind: 'inline', ...props }) as unknown as SlotPiece
			const why = checkPiece(c.rep, piece)
			return why ? [bad(undefined, why, `fit the piece to '${c.rep.id}': ${Object.keys(c.rep.piece.fields ?? {}).join(', ')}`)] : []
		}
		case 'form': {
			const block = c.block
			if (block.kind === 'form') return recordFindings(block.fields, value, { partial: opts.partial, what: 'the form' })
			if (formFireOf(block, value)) return []
			return [
				bad(
					undefined,
					block.kind === 'roll'
						? 'the answer names no check and band the roll offers'
						: 'the answer names no option the question offers',
					block.kind === 'roll'
						? "answer { check, stat, band } with one of the offered checks and bands — check: false for No check"
						: `answer { choice } with one of: ${block.actions.map((a) => a.choice).filter(Boolean).join(', ')}`,
				),
			]
		}
		case 'sheet': {
			if (!isRecord(value)) return [bad(undefined, 'a sheet answer is a record of stats', 'send an object keyed by stat')]
			const keys = sheetSchemaKeys({ slots: c.slots }, opts)
			const byId = new Map(c.slots.map((e) => [e.id, e]))
			const out: SettingsFinding[] = []
			for (const [k, v] of Object.entries(value)) {
				const slotId = keys.get(k)
				if (!slotId) {
					out.push(bad(k, `'${k}' is not a stat this sheet asks for`, `name one of: ${[...keys.keys()].join(', ') || '(none)'}`))
					continue
				}
				if (v === null && opts.partial) continue
				const entry = byId.get(slotId)!
				const decl = getAttributeSlot(slotId)!
				const why = checkSlotValue(decl, v as SlotValue, resolveSlotConfig(decl, entry.config))
				if (why) out.push(bad(k, why, `fit '${k}' to ${slotId}`))
			}
			if (!opts.partial)
				for (const [k, slotId] of keys) {
					const entry = byId.get(slotId)!
					const decl = getAttributeSlot(slotId)!
					if (entry.required && entry.default === undefined && decl.default === undefined && (value[k] === undefined || value[k] === null))
						out.push(bad(k, `'${k}' is required and not set`, `give ${slotId} a value`))
				}
			return out
		}
	}
}
