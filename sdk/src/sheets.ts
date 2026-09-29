/**
 * Attribute sheets — a named, ordered bundle of attribute slots.
 *
 * A slot says what one value is; a sheet says which values a thing has, and in
 * what order they are read. *Adventure* is `hp`, `stamina`, `mood`, `trust`,
 * `location`, `time-of-day`, `weather` — declared once, named by a genre,
 * attached to an owner, and the same seven in the same order everywhere they
 * appear. Owners hold sheets; the vocabulary of an owner is the union of the
 * genre's sheets and the sheets down its chain, deduped by id.
 *
 * ## Why this is a registry of its own, beside the slots
 *
 * The two answer different questions. `attributes.ts` answers *may this value
 * be stored?* and everything in it is about one value — bounds, options, what
 * the model reads. This answers *what does this thing have?* and carries
 * nothing about any one value beyond the three things naming it on a sheet
 * decides. Folded into one registry, a single `get` would return two kinds of
 * thing and a single `retire` would mean two different things to the rows
 * underneath. The id grammar, the reserved owners and the origin rule are
 * shared — imported from there, not restated here, so there is one answer to
 * "who may claim this namespace" rather than two that agree today.
 *
 * ## Order is the declaration
 *
 * `slots` is a list and not a set. It is the order a panel draws, the order a
 * state block renders to the model, and the order rules are evaluated in.
 * Re-ordering a sheet is therefore a change to behaviour, inside the hash like
 * any other, which is why the union a genre computes preserves the order rather
 * than sorting it.
 *
 * ⚠ **Not a layout sheet.** §26 uses *sheet* for what a side zone becomes below
 * `roomy`, and *More sheet* for the mobile overflow; those are places on a
 * screen. Prose says the qualified word — *attribute sheet* — exactly as it
 * does for an attribute slot, and the exported API says it too.
 *
 * ⚠ Never an *attachment* (that is a message part) and never a *template*
 * (taken three times over already).
 */

import type { I18n } from './descriptors.js'
import { i18nFindings } from './i18n.js'
import { refuseUnlessIdentical } from './hash.js'
import {
	checkSlotValue,
	getAttributeSlot,
	isReservedAttributeOwner,
	resolveSlotConfig,
	slotOwner,
	type AttributeSlotDecl,
	type SlotAppliesTo,
	type SlotConfig,
	type SlotId,
	type SlotOrigin,
	type SlotValue,
} from './attributes.js'

// ── Ids ─────────────────────────────────────────────────────────────────────

/** `owner:sheet/name@N` — `core:sheet/adventure@1`, `acme.rp:sheet/tension@1`. @experimental */
export type SheetId = string

const SHEET_ID = /^[a-z0-9]+(?:[.-][a-z0-9]+)*:sheet\/[a-z0-9]+(?:-[a-z0-9]+)*@\d+$/

/** @experimental */
export function assertSheetId(id: string): void {
	if (!SHEET_ID.test(id))
		throw new Error(
			`'${id}' is not a valid attribute sheet id. Use 'owner:sheet/name@N' — ` +
				`'core:sheet/adventure@1'. The id is what an owner holds to say it carries this ` +
				`bundle; the name a person reads lives in the declaration.`,
		)
}

// ── The declaration ─────────────────────────────────────────────────────────

/**
 * One slot on a sheet, and the three things naming it here decides.
 *
 * Nothing else about the slot is restated: a sheet never says again what a
 * value *is*, only what it is on this sheet. `config` is a **deviation** like
 * every other layer's — the keys it changes and no others — so a sheet that
 * raises a cap does not silently drop the options declared beside it.
 * @experimental
 */
export interface SheetSlotEntry {
	id: SlotId
	/**
	 * A session of a genre carrying this sheet must have a value. With a
	 * `default` that is automatic; without one, creation refuses, and an
	 * upgrade that adds `required` with no default warns on the session rather
	 * than breaking it.
	 */
	required?: boolean
	/**
	 * What it starts at, as this sheet's deviation from the declaration's own
	 * default. Checked against the slot when the sheet is declared: a default
	 * nothing may store is a session nobody can create, and finding that out at
	 * creation time means finding it out once per person.
	 */
	default?: SlotValue
	/** This sheet's deviations from the declaration's config. */
	config?: SlotConfig
	/**
	 * 🚧 Which owners carry the slot **on this sheet** — a narrowing of the
	 * declaration's own `appliesTo`, never a widening. Absent, every owner
	 * the declaration names. It is how a premade stat that fits more than
	 * one owner is put where a genre wants it: `location` on the world in
	 * Adventure, on each cast member in a genre whose characters can be in
	 * different places (owner ruling 2026-09-26).
	 */
	appliesTo?: readonly SlotAppliesTo[]
}

/**
 * 🚧 The owners a sheet entry puts its slot on: the entry's own narrowing, or
 * the declaration's `appliesTo` when it states none. The one reader, so a host
 * and a widget cannot disagree about whether a character carries it.
 * @experimental
 */
export const sheetSlotAppliesTo = (
	entry: Pick<SheetSlotEntry, 'appliesTo'>,
	decl: Pick<AttributeSlotDecl, 'appliesTo'>,
): readonly SlotAppliesTo[] =>
	entry.appliesTo ? decl.appliesTo.filter((o) => entry.appliesTo!.includes(o)) : decl.appliesTo

/** @experimental */
export interface AttributeSheetProps {
	/** The name a person reads. Display text: stripped from the content hash. */
	label: I18n
	/** What the bundle is for, shown where it is offered. Display text: stripped. */
	description?: I18n
	/** The slots it gathers, **in order** — see the file header on why order is content. */
	slots: readonly SheetSlotEntry[]
}

/** @experimental */
export interface AttributeSheetDecl extends AttributeSheetProps {
	readonly id: SheetId
	/** Which source it came through — the same two, on the same terms, as a slot's. */
	readonly origin: SlotOrigin
	/** `stored` only: the account the row belongs to. */
	readonly authorUserId?: number | string
	/** Retired: offered nowhere new, kept everywhere it already is. `stored` only. */
	readonly retired?: boolean
}

const registry = new Map<SheetId, AttributeSheetDecl>()

/**
 * Display text this registry carries outside `i18n`/`description`.
 *
 * `label` only, and for once there is no model-facing counterpart to keep out:
 * a sheet ships no prose to a prompt. What the model reads is each slot's own
 * `descriptor`, hashed in that slot's declaration where it belongs.
 * @experimental
 */
export const SHEET_DISPLAY_KEYS = { display: ['label'] } as const

const crossOriginRefusal = (id: SheetId, held: SlotOrigin): string =>
	held === 'code'
		? `'${id}' is declared in code by the package that owns it, so an authored sheet may ` +
			`not claim it. Author yours under your own namespace instead.`
		: `'${id}' is already held by a sheet somebody authored here. Code claiming it would ` +
			`silently change what every owner carrying it has.`

/** One way in, two origins — the split is the one `register` explains in attributes.ts. */
function register(
	id: SheetId,
	rawProps: AttributeSheetProps,
	origin: SlotOrigin,
	authorUserId?: number | string,
): AttributeSheetDecl {
	assertSheetId(id)
	// The display text (R-20): refused where an author writes code; on a
	// stored row it is dropped with a warning, on the terms attributes.ts gives.
	const props =
		origin === 'code' ? assertDisplayText(id, rawProps) : withDisplayTextTolerated(id, rawProps)
	checkSheetDeclaration(id, props)
	const decl: AttributeSheetDecl = Object.freeze({
		...props,
		id,
		slots: Object.freeze([...props.slots]),
		origin,
		...(authorUserId === undefined ? {} : { authorUserId }),
	})
	const existing = registry.get(id)
	if (existing) {
		if (existing.origin !== origin) throw new Error(crossOriginRefusal(id, existing.origin))
		if (origin === 'code')
			refuseUnlessIdentical(
				existing,
				decl,
				`duplicate attribute sheet id: ${id}`,
				SHEET_DISPLAY_KEYS,
			)
	}
	registry.set(id, decl)
	return decl
}

/**
 * Declare an attribute sheet in code.
 *
 * Written **below** the slots it gathers, and that is not a style note: the
 * slots have to be in the registry already, because a sheet naming one nothing
 * declares is a vocabulary that validates against nothing.
 * @experimental
 */
export function defineAttributeSheet(id: SheetId, props: AttributeSheetProps): AttributeSheetDecl {
	return register(id, props, 'code')
}

/** The plugin-facing door — same registration, minus the ability to claim core's namespace. @experimental */
export function definePluginAttributeSheet(
	pluginId: string,
	id: SheetId,
	props: AttributeSheetProps,
): AttributeSheetDecl {
	if (id.startsWith('core:'))
		throw new Error(
			`plugin '${pluginId}' may not declare '${id}': the 'core:' namespace is reserved. ` +
				`Publish it under your own namespace — a sheet two parties can define is one ` +
				`where what a character has depends on load order.`,
		)
	return defineAttributeSheet(id, props)
}

/** The person-facing door, on the same reserved-owner terms as `defineStoredAttributeSlot`. @experimental */
export function defineStoredAttributeSheet(
	id: SheetId,
	props: AttributeSheetProps,
	meta: { userId: number | string },
): AttributeSheetDecl {
	assertSheetId(id)
	const owner = slotOwner(id)
	if (isReservedAttributeOwner(owner))
		throw new Error(
			`'${id}' is authored under the reserved owner '${owner}'. 'core' and every installed ` +
				`plugin id are reserved: a stored sheet sharing one would be redefined the next ` +
				`time that package loaded. Author it under your own namespace.`,
		)
	return register(id, props, 'stored', meta.userId)
}

/** @experimental */
export const getAttributeSheet = (id: SheetId): AttributeSheetDecl | undefined => registry.get(id)
/** @experimental */
export const attributeSheets = (): AttributeSheetDecl[] => [...registry.values()]
/** @experimental */
export function _clearAttributeSheets(): void {
	registry.clear()
}

/**
 * Withdraw a package's sheet declaration — the sheet half of
 * `_withdrawAttributeSlot`, on the same terms.
 * @internal
 */
export function _withdrawAttributeSheet(id: SheetId): boolean {
	const decl = registry.get(id)
	if (!decl || decl.origin !== 'code' || id.startsWith('core:')) return false
	return registry.delete(id)
}

/**
 * Retire a stored sheet: offered nowhere new, kept everywhere it already is.
 *
 * `stored` only, for the reason a slot is — a code sheet arrives and leaves
 * with its package, and retiring one by hand would leave the registry saying
 * something the installed code contradicts on the next boot.
 * @experimental
 */
export function retireAttributeSheet(id: SheetId): AttributeSheetDecl {
	const decl = registry.get(id)
	if (!decl)
		throw new Error(
			`cannot retire '${id}': no sheet is declared under that id. Check the id, and that ` +
				`the row was loaded into the registry.`,
		)
	if (decl.origin !== 'stored')
		throw new Error(
			`'${id}' is declared in code, and code declarations are never retired by hand. ` +
				`Uninstall or upgrade the package that declares it; every value stays where it ` +
				`is either way. Only a sheet somebody authored here can be retired.`,
		)
	const next: AttributeSheetDecl = Object.freeze({ ...decl, retired: true })
	registry.set(id, next)
	return next
}

/** The reverse of `retireAttributeSheet`, with the same `stored`-only rule. @experimental */
export function reviveAttributeSheet(id: SheetId): AttributeSheetDecl {
	const decl = registry.get(id)
	if (!decl)
		throw new Error(
			`cannot revive '${id}': no sheet is declared under that id. Check the id, and that ` +
				`the row was loaded into the registry.`,
		)
	if (decl.origin !== 'stored')
		throw new Error(
			`'${id}' is declared in code and was never retired by hand, so there is nothing ` +
				`to revive. Only a sheet somebody authored here moves between retired and live.`,
		)
	const { retired: _wasRetired, ...rest } = decl
	const next: AttributeSheetDecl = Object.freeze(rest)
	registry.set(id, next)
	return next
}

/**
 * The display-text findings of one sheet declaration (R-20): a sheet is
 * offered by its `label`, so the label is required; the `description` is what
 * a person reads under the offer. Run by the code door here and by the host's
 * **write** door for an authored sheet, never by a reload.
 * @experimental
 */
export function attributeSheetDisplayFindings(id: SheetId, props: AttributeSheetProps): string[] {
	return [
		...i18nFindings(props.label, `${id} label`, { required: true }),
		...i18nFindings(props.description, `${id} description`),
	]
}

function assertDisplayText(id: SheetId, props: AttributeSheetProps): AttributeSheetProps {
	const display = attributeSheetDisplayFindings(id, props)
	if (display.length)
		throw new Error(
			`${id} declares display text a publish refuses (R-20):\n · ${display.join('\n · ')}`,
		)
	return props
}

/**
 * A stored row reloading at boot is never refused for its display text (ruled
 * 2026-09-17, U5i review): the offending field is dropped and a warning names
 * the row — a sheet with no readable label is listed by its id, and a sheet
 * that vanished from every boot would be the worse answer.
 */
function withDisplayTextTolerated(id: SheetId, props: AttributeSheetProps): AttributeSheetProps {
	const findings = attributeSheetDisplayFindings(id, props)
	if (!findings.length) return props
	console.warn(
		`[attributes] stored sheet '${id}' carries display text a publish refuses; ` +
			`dropped on reload, fix the row: ${findings.join('; ')}`,
	)
	const tolerated = { ...props } as Partial<AttributeSheetProps>
	if (i18nFindings(props.label, 'label').length) delete tolerated.label
	if (i18nFindings(props.description, 'description').length) delete tolerated.description
	return tolerated as AttributeSheetProps
}

/** What a sheet must satisfy before an owner is allowed to carry it. */
function checkSheetDeclaration(id: SheetId, props: AttributeSheetProps): void {
	const seen = new Set<SlotId>()
	props.slots?.forEach((entry, i) => {
		const decl = getAttributeSlot(entry.id)
		if (!decl)
			throw new Error(
				`${id} names '${entry.id}' at position ${i}, and nothing declares it. A sheet ` +
					`gathers slots that exist: one that does not would be an owner whose values ` +
					`validate against nothing. Declare the slot first — a sheet is written below ` +
					`the slots it gathers, not above them.`,
			)
		if (seen.has(entry.id))
			throw new Error(
				`${id} names '${entry.id}' twice. A sheet's order is what a panel draws and what ` +
					`rules run in, so a repeat has no reading at all — say it once, at the ` +
					`position you want it in.`,
			)
		seen.add(entry.id)
		if (entry.appliesTo !== undefined) {
			if (!entry.appliesTo.length)
				throw new Error(
					`${id} puts '${entry.id}' on no owner at all. Leave \`appliesTo\` out to keep ` +
						`every owner the slot declares, or name the ones this sheet carries it on.`,
				)
			const beyond = entry.appliesTo.filter((o) => !decl.appliesTo.includes(o))
			if (beyond.length)
				throw new Error(
					`${id} puts '${entry.id}' on ${beyond.join(' and ')}, and the slot attaches only ` +
						`to ${decl.appliesTo.join(' and ')}. A sheet narrows where a slot goes; it ` +
						`never takes it somewhere its declaration does not.`,
				)
		}
		if (entry.default !== undefined) {
			const complaint = checkSlotValue(
				decl,
				entry.default,
				resolveSlotConfig(decl, entry.config),
			)
			if (complaint)
				throw new Error(
					`${id} gives '${entry.id}' a default its own configuration refuses: ` +
						`${complaint} A default nothing may store is a session creation that ` +
						`fails for everybody who picks this sheet.`,
				)
		}
	})
}
