/**
 * 🚧 Drawing and editing a **piece** — one item of a list stat that holds a
 * ruleset's things (`config.repertoire`): a weapon, a potion, a feature.
 * The plain-TypeScript half of the shared piece card (`PieceCard.svelte`),
 * which Stats draws now and a card's or a place's editor can draw later.
 *
 * A piece comes in three forms (`SlotPiece`): written out where it is held
 * (inline), a lorebook entry, or a row of its ruleset's library — the last
 * two with the holder's count and overrides. Each is read here into ONE
 * view: its name (never the raw row id: `potion-of-healing` reads
 * _Potion of healing_), its key facts from the piece shape the ruleset
 * declares (damage, armour, uses left, level…), its description, prose and
 * traits, how many are held, and where it came from.
 *
 * Everything here reads only what the wire carries (§8, plan rulesets):
 * an inline piece's own fields; a reference's `resolved` — the entry or the
 * row as the host read it, with its key facts already in words — under the
 * holder's overrides; and the owner row's `repertoires`, each repertoire's
 * name and piece shape, for a fact's label and the edit form. A widget
 * never carries a compendium: a reference the host could not read draws by
 * its id.
 *
 * ⚠ Never the piece's prose for the model: what a prompt reads is the
 * ruleset handler's render, at its render depth. This is display.
 */
import {
	PIECE_FIELDS,
	RELATIONAL_PIECE_FIELDS,
	checkPiece,
	getAttributeSlot,
	getRuleset,
	i18nText,
	parseRepertoireAddress,
	rulesetSelectors,
	slotValueForStorage,
	type FieldDecl,
	type I18n,
	type RepertoireDecl,
	type SessionStateRepertoireV1,
	type SlotListItem,
	type SlotPiece,
	type SlotPieceResolved,
} from '@serene-pub/sdk'

/** 🚧 Is this list item a piece? Re-exported for a component, which may not import the SDK whole. @experimental */
export { isSlotPiece } from '@serene-pub/sdk'

type Translate = (source: string) => string
const same: Translate = (s) => s

// ─── Which repertoire a list holds ──────────────────────────────────────────

/** 🚧 The repertoire a list stat's configuration names, by address — `undefined` for a plain list. @experimental */
export const repertoireAddressOf = (config: Record<string, unknown> | undefined): string | undefined =>
	typeof config?.repertoire === 'string' && config.repertoire ? config.repertoire : undefined

/** 🚧 Does this list stat hold pieces (its config names a repertoire)? @experimental */
export const slotHoldsPieces = (config: Record<string, unknown> | undefined): boolean => !!repertoireAddressOf(config)

/** 🚧 What a piece list is drawn against: its repertoire's address, id, and (when the host sent it) name and piece shape. @experimental */
export interface PieceContext {
	/** The repertoire's address (`core:ruleset/vis-itineris@1#weapons`). */
	address?: string
	/** Its name and piece shape, from the owner row's `repertoires` — absent from a host that sent none. */
	repertoire?: SessionStateRepertoireV1
	/** The repertoire's own id (`weapons`). */
	repertoireId?: string
}

/**
 * 🚧 The context a list stat's configuration names, read against the owner
 * row's `repertoires` (`SessionStateOwnerV1.repertoires`).
 * @experimental
 */
export function pieceContextOf(
	config: Record<string, unknown> | undefined,
	repertoires?: Readonly<Record<string, SessionStateRepertoireV1>>,
): PieceContext {
	const address = repertoireAddressOf(config)
	if (!address) return {}
	const repertoire = repertoires?.[address]
	return {
		address,
		...(repertoire ? { repertoire } : {}),
		repertoireId: parseRepertoireAddress(address)?.repertoire,
	}
}

// ─── Words ──────────────────────────────────────────────────────────────────

/** `potion-of-healing` → _Potion of healing_: an id read as words, never shown raw. @experimental */
export function humaniseId(id: string): string {
	const words = id
		.replace(/([a-z])([A-Z])/g, '$1 $2')
		.replace(/[-_.]+/g, ' ')
		.trim()
		.toLowerCase()
	return words ? words[0]!.toUpperCase() + words.slice(1) : id
}

const textOf = (v: I18n | undefined): string | undefined => {
	const s = i18nText(v)
	return s && s.trim() ? s : undefined
}

const fieldLabel = (key: string, decl: FieldDecl | undefined): string => textOf(decl?.label as I18n | undefined) ?? humaniseId(key)

/** An enum's stored key as its member's label, else the key in words. */
function choiceText(decl: FieldDecl, value: string): string {
	const member = decl.members?.find((m) => m.key === value)
	return textOf(member?.label as I18n | undefined) ?? humaniseId(value)
}

// ─── Labels for ids (selectors, stats) ──────────────────────────────────────

/** 🚧 What `labelOf` reads a declared id's label from: a selector or stat declaration. @experimental */
export type LabelDecl = { label?: I18n } | { kind: 'stat'; slot: string } | { kind: string; [k: string]: unknown }

/**
 * 🚧 A ruleset id as a person reads it — `attack.melee` → _Melee attack_,
 * `skill.athletics` → _Athletics_, `strength-mod` → _Strength modifier_.
 * A declared `label` wins; a stat selector reads as its stat's label; else
 * the id in words, a dotted one family last (`save.wisdom` → _Wisdom
 * save_), a skill or a check by its own name alone.
 * @experimental
 */
export function labelOf(
	id: string,
	decls?: ReadonlyMap<string, LabelDecl> | Readonly<Record<string, LabelDecl | undefined>>,
): string {
	const decl = decls instanceof Map ? decls.get(id) : (decls as Record<string, LabelDecl | undefined> | undefined)?.[id]
	const declared = decl && 'label' in decl ? textOf(decl.label as I18n | undefined) : undefined
	if (declared) return declared
	if (decl && (decl as { kind?: unknown }).kind === 'stat' && typeof (decl as { slot?: unknown }).slot === 'string') {
		const stat = textOf(getAttributeSlot((decl as { slot: string }).slot as never)?.label as I18n | undefined)
		if (stat) return stat
	}
	const mod = /^(.+)-mod$/.exec(id)
	if (mod) return `${humaniseId(mod[1]!)} modifier`
	const parts = id.split('.').filter(Boolean)
	if (parts.length > 1) {
		const [family, ...rest] = parts
		const own = humaniseId(rest.join(' '))
		if (family === 'skill' || family === 'check') return own
		return `${own} ${family!.replace(/[-_]+/g, ' ').toLowerCase()}`
	}
	return humaniseId(id)
}

/** 🚧 `labelOf` against a registered ruleset's selectors and stats. @experimental */
export function rulesetLabelOf(rulesetId: string | null | undefined, id: string): string {
	// The registry in this realm: a page or a server has its rulesets; a
	// widget's worker has none, and an id there reads as words.
	const ruleset = rulesetId ? getRuleset(rulesetId) : undefined
	return labelOf(id, ruleset ? (rulesetSelectors(ruleset) as ReadonlyMap<string, LabelDecl>) : undefined)
}

// ─── One piece, read ────────────────────────────────────────────────────────

/** 🚧 One fact on a piece's card: a field's label and its value in words (empty for a switch that is on). @experimental */
export interface PieceFact {
	key: string
	label: string
	text: string
}

/** 🚧 A piece as its card draws it. @experimental */
export interface PieceView {
	form: SlotPiece['kind']
	name: string
	/** How many are held — one when the piece says none. */
	count: number
	description: string | null
	prose: string | null
	traits: string[]
	facts: PieceFact[]
	/** Where it came from, in words: the lorebook, or the ruleset's library; null for one written here. */
	from: string | null
	/** A library reference whose row this install does not have (its ruleset is missing or moved on). */
	unresolved: boolean
}

/**
 * Fields a sheet's card leaves to the full view: what it weighs and costs
 * are a shop's facts, not a fight's.
 */
const CARD_SKIPS = new Set(['weight', 'cost'])

/** Two fields read as one: what is left of a maximum (`usesMax` − `usesSpent` → _Uses 1/2_). */
const LEFT_OF: ReadonlyArray<readonly [max: string, spent: string]> = [
	['usesMax', 'usesSpent'],
	['max', 'used'],
]

const present = (v: unknown): boolean => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && !v.length)

/** A value of a field, in words; `null` when there is nothing to say. @experimental */
export function fieldValueText(decl: FieldDecl | undefined, value: unknown): string | null {
	if (!present(value)) return null
	if (typeof value === 'boolean') return value ? fieldLabel('', decl) : null
	if (decl?.type === 'enum' && typeof value === 'string') return choiceText(decl, value)
	if (Array.isArray(value)) {
		const words = value
			.map((item) =>
				item && typeof item === 'object' && typeof (item as { name?: unknown }).name === 'string'
					? (item as { name: string }).name
					: fieldValueText(decl?.item, item),
			)
			.filter((w): w is string => !!w)
		return words.length ? words.join(', ') : null
	}
	if (typeof value === 'object') {
		const v = value as Record<string, unknown>
		const fields = decl?.fields ?? {}
		const keys = Object.keys(fields).length ? Object.keys(fields) : Object.keys(v)
		const out: string[] = []
		// Dice read as dice: `1` and `d8` are `1d8`.
		const dice = typeof v.dice === 'number' && typeof v.die === 'string' ? `${v.dice}${v.die}` : null
		if (dice) out.push(dice)
		const numbers: number[] = []
		for (const k of keys) {
			if (dice && (k === 'dice' || k === 'die')) continue
			const sub = v[k]
			if (!present(sub)) continue
			if (typeof sub === 'number' && !dice) {
				numbers.push(sub)
				continue
			}
			const said = fieldValueText(fields[k], sub)
			if (said) out.push(said)
		}
		// A run of numbers is a span: a range of 80/320.
		if (numbers.length) out.unshift(numbers.join('/'))
		return out.length ? out.join(' ') : null
	}
	return String(value)
}

/** The facts a piece's own fields say, in declared order. @experimental */
export function pieceFacts(values: Record<string, unknown>, piece: FieldDecl | undefined): PieceFact[] {
	const fields = piece?.fields ?? {}
	const universal = new Set([...Object.keys(PIECE_FIELDS), ...Object.keys(RELATIONAL_PIECE_FIELDS)])
	const out: PieceFact[] = []
	const paired = new Set<string>()
	for (const [max, spent] of LEFT_OF)
		if (fields[max] && fields[spent]) {
			paired.add(max).add(spent)
		}
	for (const [key, decl] of Object.entries(fields)) {
		if (universal.has(key) || CARD_SKIPS.has(key)) continue
		if (paired.has(key)) {
			const pair = LEFT_OF.find(([max]) => max === key)
			if (!pair) continue
			const top = values[pair[0]]
			if (typeof top !== 'number') continue
			const spent = typeof values[pair[1]] === 'number' ? (values[pair[1]] as number) : 0
			out.push({ key, label: fieldLabel(key, decl), text: `${Math.max(0, top - spent)}/${top}` })
			continue
		}
		const value = values[key]
		if (typeof value === 'boolean') {
			if (value) out.push({ key, label: fieldLabel(key, decl), text: '' })
			continue
		}
		const text = fieldValueText(decl, value)
		if (text !== null) out.push({ key, label: fieldLabel(key, decl), text })
	}
	return foldDamageType(out)
}

/**
 * 🚧 A weapon's damage reads as one fact (PLAN-sheet-widget §3): its
 * `damageType` folds into the `damage` fact's words — _1d8 slashing_, never
 * two lines. Idempotent, so a host's `keyProps` read through
 * {@link pieceFacts} and folded again come out the same.
 * @experimental
 */
export function foldDamageType(facts: PieceFact[]): PieceFact[] {
	const damage = facts.findIndex((f) => f.key === 'damage')
	const type = facts.findIndex((f) => f.key === 'damageType')
	if (damage < 0 || type < 0 || !facts[type]!.text) return facts
	const out = facts.slice()
	out[damage] = { ...out[damage]!, text: `${out[damage]!.text} ${facts[type]!.text.toLowerCase()}`.trim() }
	out.splice(type, 1)
	return out
}

/**
 * 🚧 A piece row's **brief** (PLAN-sheet-widget §3): its first two facts in
 * declared order, joined with " · " — authors declare the facts that matter
 * first. A fact that is a bare figure keeps its label (_Hands 1_); a word
 * stands alone (_Martial_); a switch that is on is its label.
 * @experimental
 */
export function pieceBrief(view: Pick<PieceView, 'facts'>): string {
	return view.facts
		.slice(0, 2)
		.map((f) => (!f.text ? f.label : /^[+\-−]?\d[\d/]*$/.test(f.text) ? `${f.label} ${f.text}` : f.text))
		.join(' · ')
}

/** A reference's host-read entry or row, when the host filled it. */
const resolvedOf = (piece: SlotPiece): SlotPieceResolved | undefined =>
	piece.kind === 'inline' ? undefined : (piece as { resolved?: SlotPieceResolved }).resolved

/**
 * A piece's values as its card and form read them: an inline piece's own
 * fields; a reference's host-read parts (name, description, prose, traits)
 * under the holder's overrides. A reference's other fields are its
 * overrides alone — its row's are already words, in `resolved.keyProps`.
 */
function pieceValues(piece: SlotPiece): Record<string, unknown> {
	if (piece.kind === 'inline') {
		const { kind: _k, count: _c, ...props } = piece as unknown as Record<string, unknown>
		return props
	}
	return { ...resolvedBase(piece), ...(piece.overrides ?? {}) }
}

/** The parts of a reference the host read, as values: what an override is compared against. */
function resolvedBase(piece: SlotPiece): Record<string, unknown> {
	const r = resolvedOf(piece)
	if (!r) return {}
	return {
		name: r.name,
		...(r.description !== undefined ? { description: r.description } : {}),
		...(r.prose !== undefined ? { prose: r.prose } : {}),
		...(r.traits?.length ? { traits: [...r.traits] } : {}),
	}
}

/**
 * A reference's facts: the host's, in their order, each one the holder
 * overrides said again from the override (one the row did not have joins
 * at the end).
 */
function referenceFacts(piece: SlotPiece, shape: FieldDecl | undefined): PieceFact[] {
	const overridden = new Map(pieceFacts((piece as { overrides?: Record<string, unknown> }).overrides ?? {}, shape).map((f) => [f.key, f]))
	const out: PieceFact[] = []
	for (const p of resolvedOf(piece)?.keyProps ?? []) {
		const o = overridden.get(p.key)
		out.push(o ?? { key: p.key, label: p.label, text: p.value })
		overridden.delete(p.key)
	}
	return [...out, ...overridden.values()]
}

/** 🚧 One piece as its card draws it. @experimental */
export function pieceView(piece: SlotPiece, ctx: PieceContext = {}, t: Translate = same): PieceView {
	const values = pieceValues(piece)
	const resolved = resolvedOf(piece)
	const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
	const name =
		str(values.name) ??
		str((piece as { name?: unknown }).name) ??
		(piece.kind === 'compendium'
			? humaniseId(piece.pieceId)
			: piece.kind === 'lore'
				? t('Lore entry {id}').replace('{id}', String(piece.entryId))
				: t('Unnamed'))
	const count = typeof piece.count === 'number' && piece.count >= 1 ? piece.count : 1
	const traits = Array.isArray(values.traits) ? values.traits.filter((x): x is string => typeof x === 'string' && !!x.trim()) : []
	const compendiumName = piece.kind === 'compendium' ? (str(resolved?.compendiumName) ?? null) : null
	return {
		form: piece.kind,
		name,
		count,
		description: str(values.description),
		prose: str(values.prose),
		traits: traits.map(humaniseId),
		facts: piece.kind === 'inline' ? pieceFacts(values, ctx.repertoire?.piece) : foldDamageType(referenceFacts(piece, ctx.repertoire?.piece)),
		from:
			piece.kind === 'lore'
				? t('From the lorebook')
				: piece.kind === 'compendium'
					? compendiumName
						? t('From the {ruleset} library').replace('{ruleset}', compendiumName)
						: t('From a library')
					: null,
		unresolved: piece.kind === 'compendium' && !resolved,
	}
}

/** The memo's words for a repertoire, by object: a push hands a new one, so it is read once per push at most. */
const repertoireKeys = new WeakMap<object, string>()
const pieceViews = new Map<string, PieceView>()
/** How many readings the memo keeps before it starts over — a sheet holds dozens, not thousands. */
const PIECE_VIEW_MEMO = 500

/**
 * 🚧 {@link pieceView}, remembered by VALUE (C10): a push re-sends every
 * owner's pieces as new objects, and a piece whose words did not change
 * keeps the reading it had — the same object back, so nothing downstream
 * redraws. Keyed on the piece's JSON, its repertoire's and the language's
 * first word.
 * @experimental
 */
export function pieceViewOf(piece: SlotPiece, ctx: PieceContext = {}, t: Translate = same): PieceView {
	let rep = ''
	if (ctx.repertoire) {
		rep = repertoireKeys.get(ctx.repertoire) ?? ''
		if (!rep) {
			rep = JSON.stringify(ctx.repertoire)
			repertoireKeys.set(ctx.repertoire, rep)
		}
	}
	const key = `${t('Unnamed')}|${ctx.address ?? ''}|${rep}|${JSON.stringify(piece)}`
	const held = pieceViews.get(key)
	if (held) return held
	if (pieceViews.size >= PIECE_VIEW_MEMO) pieceViews.clear()
	const view = pieceView(piece, ctx, t)
	pieceViews.set(key, view)
	return view
}

/**
 * 🚧 A piece in one line — its name, and ×N when more than one is held.
 * What a list, a ledger line or a trail reads.
 * @experimental
 */
export function pieceText(piece: SlotPiece): string {
	const v = pieceView(piece)
	return v.count > 1 ? `${v.name} ×${v.count}` : v.name
}

/** 🚧 A stable key for a piece in a keyed `#each`: its position and its identity. @experimental */
export const pieceKeyOf = (piece: SlotPiece, index: number): string =>
	`${index}:${piece.kind === 'inline' ? `inline:${piece.name}` : piece.kind === 'lore' ? `entry:${piece.entryId}` : `row:${piece.compendiumId}/${piece.pieceId}`}`

// ─── Editing one piece ──────────────────────────────────────────────────────

/** 🚧 The fields a piece's form draws: the universal ones, then the repertoire's own. @experimental */
export function pieceFormFields(ctx: PieceContext, piece: SlotPiece): Array<[string, FieldDecl]> {
	const all = ctx.repertoire?.piece.fields ?? PIECE_FIELDS
	const entries = Object.entries(all).filter(([k]) => k !== 'towards' && k !== 'edge')
	// A reference's name is its entry's or its row's: an override is offered,
	// never required — the form draws every field optional for one.
	return piece.kind === 'inline' ? entries : entries.map(([k, d]) => [k, { ...d, required: false }])
}

/** 🚧 A form's draft: the piece's values, traits as a line of words. @experimental */
export function pieceDraftOf(piece: SlotPiece, _ctx: PieceContext = {}): Record<string, unknown> {
	const values = structuredCloneish(pieceValues(piece))
	if (Array.isArray(values.traits)) values.traits = (values.traits as unknown[]).join(', ')
	return values
}

const structuredCloneish = (v: Record<string, unknown>): Record<string, unknown> => JSON.parse(JSON.stringify(v ?? {}))

/** A draft value cleaned for storage: blanks dropped, numbers kept, objects emptied away. */
function cleaned(decl: FieldDecl | undefined, v: unknown): unknown {
	if (v === undefined || v === null) return undefined
	if (typeof v === 'string') {
		const s = v.trim()
		if (!s) return undefined
		if (decl?.type === 'integer' || decl?.type === 'number') {
			const n = Number(s)
			return Number.isFinite(n) ? (decl.type === 'integer' ? Math.trunc(n) : n) : undefined
		}
		if (decl?.type === 'list') return s.split(',').map((w) => w.trim()).filter(Boolean)
		return s
	}
	if (typeof v === 'number') return Number.isFinite(v) ? v : undefined
	if (Array.isArray(v)) return v.length ? v : undefined
	if (typeof v === 'object') {
		const fields = decl?.fields ?? {}
		const out: Record<string, unknown> = {}
		for (const [k, sub] of Object.entries(v as Record<string, unknown>)) {
			const c = cleaned(fields[k], sub)
			if (c !== undefined) out[k] = c
		}
		return Object.keys(out).length ? out : undefined
	}
	return v
}

const sameValue = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b)

/** 🚧 What saving a piece's form writes: the piece, or why it was refused. @experimental */
export interface PieceEdit {
	piece: SlotPiece | null
	refusal: string | null
}

/**
 * 🚧 The piece a saved form makes. Inline: the draft whole. A reference:
 * its count, and as overrides only the fields that differ from what the
 * host read of it (`resolved`). Checked against the repertoire's piece
 * shape as the write gate would (`checkPiece`).
 * @experimental
 */
export function pieceFromDraft(
	piece: SlotPiece,
	draft: Record<string, unknown>,
	count: unknown,
	ctx: PieceContext,
	t: Translate = same,
): PieceEdit {
	const n = count === null || count === undefined || count === '' ? 1 : Number(count)
	if (!Number.isInteger(n) || n < 1) return { piece: null, refusal: t('How many is a whole number, 1 or more.') }
	const fields = Object.fromEntries(pieceFormFields(ctx, piece))
	const values: Record<string, unknown> = {}
	for (const [k, v] of Object.entries(draft)) {
		const c = cleaned(fields[k], v)
		if (c !== undefined) values[k] = c
	}
	let next: SlotPiece
	if (piece.kind === 'inline') {
		next = { kind: 'inline', ...values, ...(n > 1 ? { count: n } : {}) } as SlotPiece
	} else {
		const base = resolvedBase(piece)
		const overrides = Object.fromEntries(Object.entries(values).filter(([k, v]) => !sameValue(base[k], v)))
		const { name: _filled, resolved: _read, overrides: _o, count: _c, ...ref } = piece as SlotPiece & {
			name?: string
			resolved?: unknown
		}
		next = {
			...ref,
			...(n > 1 ? { count: n } : {}),
			...(Object.keys(overrides).length ? { overrides } : {}),
		} as SlotPiece
	}
	if (ctx.repertoire) {
		// The gate's check, against the shape the host sent: a widget holds no
		// compendium, so a reference's row is the host's to check.
		const decl = { id: ctx.repertoireId ?? '', label: ctx.repertoire.label, prose: '', piece: ctx.repertoire.piece } as RepertoireDecl
		const refusal = checkPiece(decl, next)
		if (refusal) return { piece: null, refusal }
	} else if (next.kind === 'inline' && !(typeof next.name === 'string' && next.name.trim())) {
		return { piece: null, refusal: t('A name is needed.') }
	}
	return { piece: next, refusal: null }
}

/** 🚧 A blank piece for the form's Add — a name and a description to fill. @experimental */
export const blankPiece = (): SlotPiece => ({ kind: 'inline', name: '', description: '' })

/** 🚧 The list with the item at `index` replaced (or, given `null`, removed); an index past the end adds. @experimental */
export function listWithPieceAt(value: unknown, index: number, piece: SlotPiece | null): unknown[] {
	const items = Array.isArray(value) ? [...value] : value === undefined || value === null ? [] : [value]
	if (index >= items.length) {
		if (piece) items.push(piece)
	} else if (piece) items[index] = piece
	else items.splice(index, 1)
	// Stored as stored: a host-filled name or reading never rides back, one held is bare.
	const bare = items.map((item) => {
		if (!item || typeof item !== 'object' || !('resolved' in item)) return item
		const { resolved: _read, ...rest } = item as Record<string, unknown>
		return rest
	})
	return slotValueForStorage(bare as SlotListItem[]) as unknown[]
}
