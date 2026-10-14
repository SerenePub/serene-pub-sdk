/**
 * The card dowry — the stats a character card brings with it.
 *
 * ## What it is
 *
 * `extensions.serenepub.dowry` on an exported card (format 1): the sheets the
 * card holds, its card-layer stat rows (configurations and values), the
 * **declarations** those rows need that the receiving install may not have —
 * stored and plugin slots and sheets, embedded with their props and content
 * hash — and **refs** to core declarations, by id and hash only. It is what
 * lets a card round-trip between Serene Pub installs with its numbers intact.
 * A reader that is not Serene Pub sees nothing of it; the prose card is
 * complete without it.
 *
 * ## What it is NOT
 *
 *  · **Not a style pack, and not a lorebook export.** It carries one card's
 *    state and the vocabulary that state is filed under — nothing about how
 *    anything looks, and no world. Session-layer rows never travel.
 *  · **Not an importer.** Everything here is pure: `planDowryImport` reads the
 *    install through a view the host supplies and answers with a plan — what
 *    to use, register, rename, re-own, keep opaque or refuse, the id map, the
 *    rewritten sheets and rows, and the summary lines a person reads. The host
 *    writes; this decides.
 *  · **Not a carrier for core.** Core declarations are referenced, never
 *    embedded: a card cannot redefine `core:slot/hp@1` on the install that
 *    reads it.
 */

import { i18nText } from './i18n.js'
import { declarationHash } from './hash.js'
import {
	SLOT_DISPLAY_KEYS,
	slotOwner,
	slotSlug,
	slotVersion,
	type AttributeSlotProps,
	type SlotId,
	type SlotOrigin,
} from './attributes.js'
import { SHEET_DISPLAY_KEYS, type AttributeSheetProps, type SheetId } from './sheets.js'

// ── The format ──────────────────────────────────────────────────────────────

/** Which registry a declaration belongs to — the id's own kind segment. @experimental */
export type DowryDeclarationKind = 'slot' | 'sheet'

/**
 * One embedded declaration: its id as the exporting install knew it, the
 * content hash (`dowryDeclarationHash`) and the props.
 *
 * `origin` says whether a person authored it (`stored`, the default) or a
 * plugin declared it (`plugin`). The id grammar cannot tell a username from a
 * plugin id, and the two are imported on opposite rules — so the
 * exporter, which knows, says.
 * @experimental
 */
export interface DowryDeclaration<P> {
	id: string
	hash: string
	props: P
	origin?: 'stored' | 'plugin'
}

/** A core declaration the card uses: id and content hash, never props. @experimental */
export interface DowryRef {
	id: string
	hash: string
}

/**
 * One card-layer stat row, the lorebook export's row shape minus its owner
 * addressing (the owner is the card): a configuration row carries `config`, a
 * value row `value` (`{ v }`). Exactly one of the two.
 * @experimental
 */
export interface DowryRow {
	slotId: SlotId
	/** A configuration row's deviations. */
	config?: Record<string, unknown>
	/** A value row's wrapped value. */
	value?: { v: unknown }
	updatedBy?: string
	note?: string | null
}

/** `extensions.serenepub.dowry`, format 1. @experimental */
export interface CardDowry {
	format: 1
	/** The card's sheets, in order — `owner_sheets`. */
	sheets: SheetId[]
	rows: DowryRow[]
	declarations: {
		slots: DowryDeclaration<AttributeSlotProps>[]
		sheets: DowryDeclaration<AttributeSheetProps>[]
	}
	refs: DowryRef[]
}

/**
 * The caps a dowry is held to at import. Each row is measured by what the
 * importer stores from it — a configuration's `config`, a value's `value` —
 * as the lorebook's stat import is.
 * @experimental
 */
export const DOWRY_LIMITS = Object.freeze({
	maxRows: 2000,
	maxRowJsonBytes: 16_384,
	/** Slots and sheets together. */
	maxDeclarations: 200,
} as const)

// ── The hash ────────────────────────────────────────────────────────────────

/**
 * Keys never part of a declaration's dowry hash beyond each registry's own
 * display keys: the registry-held fields (`id`, `origin`, `authorUserId`,
 * `retired`), so a full declaration and its bare props hash alike, and
 * `importedFrom`, so a re-owned copy hashes as the declaration it came from —
 * which is what lets a repeat import find it.
 */
const DOWRY_EXTRA_DISPLAY = ['id', 'origin', 'authorUserId', 'retired', 'importedFrom'] as const

/**
 * The content hash a dowry carries for a declaration — `declarationHash`
 * (hash.ts), the hasher every registry here shares, over the props with the
 * registry's display keys stripped (`SLOT_DISPLAY_KEYS` / `SHEET_DISPLAY_KEYS`).
 * A slot's `earshot: 'all'` is the default said aloud and hashes as absent,
 * as the slot registry stores it.
 * @experimental
 */
export function dowryDeclarationHash(
	kind: DowryDeclarationKind,
	props: AttributeSlotProps | AttributeSheetProps,
): string {
	const base = kind === 'slot' ? SLOT_DISPLAY_KEYS.display : SHEET_DISPLAY_KEYS.display
	let material: unknown = props
	if (kind === 'slot' && (props as AttributeSlotProps).earshot === 'all') {
		const { earshot: _all, ...rest } = props as AttributeSlotProps
		material = rest
	}
	return declarationHash(material, { display: [...base, ...DOWRY_EXTRA_DISPLAY] })
}

// ── Validate ────────────────────────────────────────────────────────────────

/** One thing wrong with a dowry. @experimental */
export interface DowryFinding {
	/** e.g. `rows[12].value` */
	path: string
	message: string
}

const isObj = (v: unknown): v is Record<string, unknown> =>
	!!v && typeof v === 'object' && !Array.isArray(v)

const ATTR_ID = /^([a-z0-9]+(?:[.-][a-z0-9]+)*):(slot|sheet)\/([a-z0-9]+(?:-[a-z0-9]+)*)@(\d+)$/

const kindOfId = (id: string): DowryDeclarationKind | undefined =>
	(ATTR_ID.exec(id)?.[2] as DowryDeclarationKind | undefined) ?? undefined

const utf8 = (s: string): number => new TextEncoder().encode(s).length

/**
 * A dowry against its shape and `DOWRY_LIMITS`. Empty means it may be planned.
 * An embedded hash that does not match its props is a finding: the file was
 * edited, and `planDowryImport` trusts the content, never the claim.
 * @experimental
 */
export function validateDowry(dowry: unknown): DowryFinding[] {
	const out: DowryFinding[] = []
	if (!isObj(dowry)) return [{ path: 'dowry', message: 'a dowry is an object' }]
	if (dowry.format !== 1)
		out.push({ path: 'format', message: `format ${String(dowry.format)} is not one this install reads (1)` })
	const L = DOWRY_LIMITS

	if (!Array.isArray(dowry.sheets)) out.push({ path: 'sheets', message: 'sheets is a list of sheet ids' })
	else
		dowry.sheets.forEach((id, i) => {
			if (typeof id !== 'string' || kindOfId(id) !== 'sheet')
				out.push({ path: `sheets[${i}]`, message: `'${String(id)}' is not a sheet id` })
		})

	if (!Array.isArray(dowry.rows)) out.push({ path: 'rows', message: 'rows is a list' })
	else {
		if (dowry.rows.length > L.maxRows)
			out.push({ path: 'rows', message: `a card carries at most ${L.maxRows} stat rows; this one has ${dowry.rows.length}` })
		dowry.rows.forEach((row, i) => {
			const at = `rows[${i}]`
			if (!isObj(row)) return void out.push({ path: at, message: 'a row is an object' })
			if (typeof row.slotId !== 'string' || kindOfId(row.slotId) !== 'slot')
				out.push({ path: `${at}.slotId`, message: `'${String(row.slotId)}' is not a slot id` })
			const hasConfig = row.config !== undefined
			const hasValue = row.value !== undefined
			if (hasConfig === hasValue)
				out.push({ path: at, message: 'a row carries exactly one of config or value' })
			if (hasConfig && !isObj(row.config)) out.push({ path: `${at}.config`, message: 'config is an object' })
			if (hasValue && (!isObj(row.value) || !('v' in row.value)))
				out.push({ path: `${at}.value`, message: 'value is { v }' })
			const payload = hasConfig ? row.config : row.value
			if (payload !== undefined) {
				const bytes = utf8(JSON.stringify(payload) ?? '')
				if (bytes > L.maxRowJsonBytes)
					out.push({
						path: hasConfig ? `${at}.config` : `${at}.value`,
						message: `a stat row is at most ${L.maxRowJsonBytes} bytes; this one is ${bytes}`,
					})
			}
		})
	}

	const decls = dowry.declarations
	if (!isObj(decls)) out.push({ path: 'declarations', message: 'declarations is { slots, sheets }' })
	else {
		let count = 0
		for (const kind of ['slot', 'sheet'] as const) {
			const key = kind === 'slot' ? 'slots' : 'sheets'
			const list = decls[key]
			if (!Array.isArray(list)) {
				out.push({ path: `declarations.${key}`, message: `declarations.${key} is a list` })
				continue
			}
			count += list.length
			const seen = new Set<string>()
			list.forEach((d, i) => {
				const at = `declarations.${key}[${i}]`
				if (!isObj(d)) return void out.push({ path: at, message: 'a declaration is an object' })
				if (typeof d.id !== 'string' || kindOfId(d.id) !== kind)
					return void out.push({ path: `${at}.id`, message: `'${String(d.id)}' is not a ${kind} id` })
				if (seen.has(d.id)) out.push({ path: `${at}.id`, message: `'${d.id}' is declared twice` })
				seen.add(d.id)
				if (slotOwner(d.id) === 'core')
					out.push({ path: `${at}.id`, message: `'${d.id}' is core's — core declarations are referenced, never embedded` })
				if (d.origin !== undefined && d.origin !== 'stored' && d.origin !== 'plugin')
					out.push({ path: `${at}.origin`, message: "origin is 'stored' or 'plugin'" })
				if (!isObj(d.props)) return void out.push({ path: `${at}.props`, message: 'props is an object' })
				if (kind === 'sheet' && !Array.isArray(d.props.slots))
					out.push({ path: `${at}.props.slots`, message: 'a sheet lists its slots' })
				if (typeof d.hash !== 'string')
					out.push({ path: `${at}.hash`, message: 'a declaration carries its content hash' })
				else if (
					d.hash !== dowryDeclarationHash(kind, d.props as unknown as AttributeSlotProps | AttributeSheetProps)
				)
					out.push({ path: `${at}.hash`, message: `'${d.id}' does not match its hash — its content was edited` })
			})
		}
		if (count > L.maxDeclarations)
			out.push({
				path: 'declarations',
				message: `a card carries at most ${L.maxDeclarations} declarations; this one has ${count}`,
			})
	}

	if (!Array.isArray(dowry.refs)) out.push({ path: 'refs', message: 'refs is a list' })
	else
		dowry.refs.forEach((r, i) => {
			if (!isObj(r) || typeof r.id !== 'string' || !kindOfId(r.id) || typeof r.hash !== 'string')
				out.push({ path: `refs[${i}]`, message: 'a ref is { id, hash } naming a slot or sheet' })
		})
	return out
}

// ── Plan ────────────────────────────────────────────────────────────────────

/** What the install already holds under an id. @experimental */
export interface DowryLocalDeclaration {
	hash: string
	origin: SlotOrigin
}

/**
 * The install, as the planner reads it. Every answer is the host's; the
 * planner never reaches a registry itself, so a plan is a pure function of
 * this view.
 * @experimental
 */
export interface DowryLocalView {
	/** The slot held under this id — its dowry hash (`dowryDeclarationHash`) and origin. */
	slot(id: SlotId): DowryLocalDeclaration | undefined
	sheet(id: SheetId): DowryLocalDeclaration | undefined
	/** `core` and every installed plugin id (`isReservedAttributeOwner`). */
	isReservedOwner(segment: string): boolean
	installedPlugin(segment: string): boolean
	/**
	 * A declaration this install already made from one named `name` (the
	 * original id's slug) whose dowry hash is `hash` — a re-owned or renamed
	 * copy from an earlier import of the same card. How a card imported twice
	 * makes one declaration.
	 */
	existingByNameAndHash(kind: DowryDeclarationKind, name: string, hash: string): string | undefined
}

/** Who is importing: the owner segment declarations are re-owned to. @experimental */
export interface DowryImporter {
	ownerSegment: string
}

/**
 * What to do with one embedded declaration — the import rules as data.
 *
 *  - `use-local` — the install's own under `id` (the original, or the copy an
 *    earlier import made); nothing written.
 *  - `register` — unknown here and already the importer's: write it as is.
 *  - `rename` — same id here with different content: register under `id` in
 *    the importer's namespace, suffixed; `from` is the original id.
 *  - `reown` — unknown here, a person's: register under `id` in the
 *    importer's namespace; keep `from` as where it came from.
 *  - `opaque` — a plugin's that is not installed: keep it as the last-seen
 *    record, values kept, shown greyed.
 *  - `refuse` — not taken; its rows and sheet entries are dropped.
 * @experimental
 */
export type DowryDeclarationAction =
	| { action: 'use-local'; id: string }
	| { action: 'register'; id: string }
	| { action: 'rename'; id: string; from: string }
	| { action: 'reown'; id: string; from: string }
	| { action: 'opaque'; id: string }
	| { action: 'refuse'; reason: string }

/** One embedded declaration's verdict, with the props to write (rewritten for a sheet). @experimental */
export type DowryPlannedDeclaration<P> = {
	kind: DowryDeclarationKind
	/** The id as the card carried it. */
	original: string
	/** The content to write, for `register`/`rename`/`reown`/`opaque` — a sheet's slot ids already mapped. */
	props: P
	/** Its dowry hash, computed here — never the file's claim. */
	hash: string
} & DowryDeclarationAction

/** @experimental */
export interface DowryImportPlan {
	/** One verdict per embedded declaration, in the dowry's order — slots, then sheets. */
	declarations: {
		slots: DowryPlannedDeclaration<AttributeSlotProps>[]
		sheets: DowryPlannedDeclaration<AttributeSheetProps>[]
	}
	/** Every id whose address changed, old → new. Read as `idMap[id] ?? id`. */
	idMap: Record<string, string>
	/** Ids refused — their rows and sheet entries are not written. */
	dropped: string[]
	/** The card's sheets, ids rewritten, refused ones gone — `owner_sheets`, in order. */
	sheets: SheetId[]
	/** The card's rows, slot ids rewritten, rows of refused slots gone. */
	rows: DowryRow[]
	/** What a person reads in the import summary, one line each. */
	summary: string[]
}

const idOf = (owner: string, kind: DowryDeclarationKind, slug: string, version: number): string =>
	`${owner}:${kind}/${slug}@${version}`

const labelOf = (props: { label?: unknown } | undefined, id: string): string =>
	i18nText(props?.label as Parameters<typeof i18nText>[0]) ?? (slotSlug(id) || id)

/**
 * Plan a dowry's import against the install — the import rules as a function.
 *
 * Slots first, then sheets (a sheet names slots, so its entries are
 * rewritten through the slot map before its own hash is taken), then the
 * card's sheet list and rows through the whole map, then the core refs.
 *
 * Per embedded declaration, by its id's owner segment:
 *
 *  1. An **installed plugin's**: the plugin's live declaration if it has the
 *     id (a note when the content differs), else refused — a card cannot
 *     declare into a namespace a package owns.
 *  2. Another **reserved** owner's (core): the install's own if present,
 *     else refused — core is referenced, never embedded.
 *  3. A **plugin's not installed** here: kept **opaque** (or the install's
 *     last-seen copy, when it holds the same content).
 *  4. **Held here** with the same hash: used. With a different hash:
 *     **renamed** into the importer's namespace with the first free `-2`,
 *     `-3`… suffix; never overwritten.
 *  5. The **importer's own**, unknown here: **registered** as is.
 *  6. **Another person's**, unknown here: **re-owned** to the importer —
 *     unless an earlier import already made it (`existingByNameAndHash`), in
 *     which case that copy is used.
 *
 * A rename or re-own whose candidate id is already held with the same hash
 * uses that copy too: the same card imported twice makes one declaration.
 * Run `validateDowry` first; the planner assumes a well-formed dowry.
 * @experimental
 */
export function planDowryImport(
	dowry: CardDowry,
	local: DowryLocalView,
	importer: DowryImporter,
): DowryImportPlan {
	const idMap: Record<string, string> = {}
	const dropped: string[] = []
	const summary: string[] = []
	const me = importer.ownerSegment
	const held = (kind: DowryDeclarationKind, id: string) => (kind === 'slot' ? local.slot(id) : local.sheet(id))
	const noun = (kind: DowryDeclarationKind) => (kind === 'slot' ? 'stat' : 'stat sheet')

	/** The first id in the importer's namespace that is free or already holds this content. */
	const findHome = (
		kind: DowryDeclarationKind,
		slug: string,
		version: number,
		hash: string,
		startAt: number,
	): { id: string; existing: boolean } => {
		for (let n = startAt; ; n++) {
			const id = idOf(me, kind, n === 1 ? slug : `${slug}-${n}`, version)
			const there = held(kind, id)
			if (!there) return { id, existing: false }
			if (there.hash === hash) return { id, existing: true }
		}
	}

	function decide<P extends AttributeSlotProps | AttributeSheetProps>(
		kind: DowryDeclarationKind,
		d: DowryDeclaration<P>,
		props: P,
	): DowryPlannedDeclaration<P> {
		const original = d.id
		const owner = slotOwner(original)
		const slug = slotSlug(original)
		const version = slotVersion(original)
		const hash = dowryDeclarationHash(kind, props)
		const label = labelOf(props, original)
		const base = { kind, original, props, hash }
		const here = held(kind, original)
		const plan = (a: DowryDeclarationAction): DowryPlannedDeclaration<P> => {
			if ('id' in a && a.id !== original) idMap[original] = a.id
			if (a.action === 'refuse') dropped.push(original)
			return { ...base, ...a }
		}

		if (local.installedPlugin(owner)) {
			if (here) {
				if (here.hash !== hash)
					summary.push(
						`The ${noun(kind)} "${label}" differs from the one the installed plugin "${owner}" declares; the plugin's is used.`,
					)
				return plan({ action: 'use-local', id: original })
			}
			summary.push(
				`The ${noun(kind)} "${label}" was left out: the installed plugin "${owner}" does not declare it.`,
			)
			return plan({ action: 'refuse', reason: `the installed plugin '${owner}' does not declare '${original}'` })
		}
		if (local.isReservedOwner(owner)) {
			if (here) return plan({ action: 'use-local', id: original })
			summary.push(`The ${noun(kind)} "${label}" was left out: "${owner}" is a reserved name here.`)
			return plan({ action: 'refuse', reason: `'${owner}' is a reserved owner and holds no '${original}' here` })
		}
		if (d.origin === 'plugin') {
			if (here && here.hash === hash) return plan({ action: 'use-local', id: original })
			summary.push(
				`The ${noun(kind)} "${label}" comes from the plugin "${owner}", which is not installed; its values are kept and shown greyed.`,
			)
			return plan({ action: 'opaque', id: original })
		}
		if (here) {
			if (here.hash === hash) return plan({ action: 'use-local', id: original })
			const prior = local.existingByNameAndHash(kind, slug, hash)
			const home = prior ? { id: prior, existing: true } : findHome(kind, slug, version, hash, 2)
			if (home.existing) return plan({ action: 'use-local', id: home.id })
			summary.push(
				`The ${noun(kind)} "${label}" on this card differs from yours with the same id, so it was added as ${home.id}.`,
			)
			return plan({ action: 'rename', id: home.id, from: original })
		}
		if (owner === me) return plan({ action: 'register', id: original })
		const prior = local.existingByNameAndHash(kind, slug, hash)
		if (prior) return plan({ action: 'use-local', id: prior })
		const home = findHome(kind, slug, version, hash, 1)
		if (home.existing) return plan({ action: 'use-local', id: home.id })
		summary.push(`The ${noun(kind)} "${label}" was added to your stats as ${home.id}.`)
		return plan({ action: 'reown', id: home.id, from: original })
	}

	const mapId = (id: string) => idMap[id] ?? id
	const isDropped = (id: string) => dropped.includes(id)

	const slots = dowry.declarations.slots.map((d) => decide('slot', d, d.props))

	const sheets = dowry.declarations.sheets.map((d) => {
		const gone = d.props.slots.filter((e) => isDropped(e.id))
		if (gone.length)
			summary.push(
				`The stat sheet "${labelOf(d.props, d.id)}" lost ${gone.length} stat${gone.length === 1 ? '' : 's'} that could not be brought in.`,
			)
		const props: AttributeSheetProps = {
			...d.props,
			slots: d.props.slots.filter((e) => !isDropped(e.id)).map((e) => ({ ...e, id: mapId(e.id) })),
		}
		return decide('sheet', d, props)
	})

	const sheetList = dowry.sheets.filter((id) => !isDropped(id)).map(mapId)
	const rows = dowry.rows.filter((r) => !isDropped(r.slotId)).map((r) => ({ ...r, slotId: mapId(r.slotId) }))
	const lostRows = dowry.rows.length - rows.length
	if (lostRows)
		summary.push(`${lostRows} stat value${lostRows === 1 ? ' was' : 's were'} left out with the stats they belong to.`)

	for (const ref of dowry.refs) {
		const kind = kindOfId(ref.id)
		if (!kind) continue
		const here = held(kind, ref.id)
		const name = slotSlug(ref.id) || ref.id
		if (!here)
			summary.push(`The ${noun(kind)} "${name}" is not on this install; values filed under it are kept but not shown.`)
		else if (here.hash !== ref.hash)
			summary.push(`The ${noun(kind)} "${name}" is a newer or older version here than where this card was made; this install's is used.`)
	}

	return { declarations: { slots, sheets }, idMap, dropped, sheets: sheetList, rows, summary }
}
