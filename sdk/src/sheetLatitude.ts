/**
 * 🚧 **Sheet latitude** (owner rulings 2026-11-05, plan §25 ★1 and ★7).
 *
 * Purpose: say how far each role (the session owner, a player) may change sheets and move
 * items **by hand**, and judge one hand edit against it — one pure function the host's write
 * gate and the sheet's edit controls both call, so the two never disagree.
 *
 * Why it exists: before it, a hand edit was judged by an attribute's `changedBy` and a slot's
 * lock alone, and a table that wanted looser (or no) hand editing had no word for it.
 *
 * Owns: the levels, the judge, its types.
 *
 * Does NOT own: who a person is in the session, whose a sheet is, the stored setting (the app
 * resolves those and passes them in); the refusal the person finally reads (the app's — it
 * quotes {@link HAND_EDIT_SENTENCES} and may say any cause its own way); runs and pipelines
 * (never judged here — the latitude limits a person's hand only).
 *
 * ⚠ Not `changedBy` (an attribute's own word for who may change it — the judge *reads* it); not
 * a slot lock (`configs[slot].lock`, `none · people · all` — the judge *reads* it); not `reach`
 * (a setting's word for who sees it); not earshot (which prompts read a value).
 *
 * Pure: no I/O, never throws — it runs in the browser too.
 */
import type { AttributeChanger } from './rulesetSections.js'

/**
 * 🚧 The sheet-latitude levels, one per role:
 *
 *  - `as-ruled` — _As the rules say_: the session owner changes anyone's values as the game
 *    master; a player changes their own as the holder; each attribute's `changedBy` decides
 *    (writer `gm` for the owner, `holder` for a player; the game master may change what the
 *    holder may).
 *  - `no-edits` — _No editing by hand_.
 *  - `all-own` — _Everything on their own characters_: every value on the role's own,
 *    `changedBy` set aside.
 *  - `all-any` — _Everything on anyone's_: every value on anyone's (the world and places too),
 *    `changedBy` set aside.
 *
 * **Own**: for a player, the cards they own (`characters.userId`) and their card-less seat; for
 * the session owner, their own cards plus the world, the people nobody plays (NPCs) and the
 * places. Watchers never change anything (no setting).
 *
 * `all-own` and `all-any` pass `changedBy` — `rules` included — but **never** a lock `all` and
 * **never** an unheard value (owner ruling ★4, 2026-11-05).
 * @experimental
 */
export const SHEET_LATITUDES = Object.freeze([
	'as-ruled',
	'no-edits',
	'all-own',
	'all-any',
] as const)
/** @experimental */
export type SheetLatitude = (typeof SHEET_LATITUDES)[number]

/**
 * 🚧 The item-move levels, one per role:
 *
 *  - `follow-sheet` — _Follow sheet editing_: each side of a move is judged as a `set` under the
 *    sheet latitude.
 *  - `no-moves` — _No moving by hand_.
 *  - `own-items` — _Their own items_: a side on the role's own passes, `changedBy` set aside (so
 *    a player gives their own items away: the receiving side becomes an offer the receiver
 *    accepts as their own `put-on`).
 *  - `any-items` — _Anyone's_.
 *
 * A **give** is two sides judged separately (`take-from` on the giver, `put-on` on the
 * receiver); a **drop** is the giver's side only; a **pick-up** the receiver's side only.
 * `own-items` and `any-items` pass `changedBy` — `rules` included — but **never** a lock `all`
 * and **never** an unheard value (owner ruling ★4, 2026-11-05).
 * @experimental
 */
export const ITEM_MOVE_LATITUDES = Object.freeze([
	'follow-sheet',
	'no-moves',
	'own-items',
	'any-items',
] as const)
/** @experimental */
export type ItemMoveLatitude = (typeof ITEM_MOVE_LATITUDES)[number]

/**
 * 🚧 Who puts a hand on the sheet. A watcher is a guest who is not a player.
 * @experimental
 */
export type HandEditorRole = 'owner' | 'player' | 'watcher'

/**
 * 🚧 What the hand does: change a value, set or clear a stat's lock, or one side of an item move.
 * @experimental
 */
export type HandEditAct = 'set' | 'configure' | 'take-from' | 'put-on'

/**
 * 🚧 Why a hand edit is refused — the app maps each to its sentence.
 * @experimental
 */
export const HAND_EDIT_CAUSES = Object.freeze([
	'watching',
	'owner-locks',
	'unheard',
	'locked',
	'no-edits',
	'not-theirs',
	'changed-by',
	'no-moves',
] as const)
/** @experimental */
export type HandEditCause = (typeof HAND_EDIT_CAUSES)[number]

/**
 * 🚧 The default sentence a person reads for each {@link HandEditCause} (owner ruling ★sl-5,
 * 2026-11-05: the SDK ships one per cause, the app may say any cause its own way). `attribute`
 * is the value's name as the person reads it (_Health_), filled in by the caller; a sentence
 * that names no attribute ignores it.
 *
 * ⚠ Not the judge (`sheetLatitudeAllows` returns the cause, never words).
 * @experimental
 */
export const HAND_EDIT_SENTENCES: Readonly<
	Record<HandEditCause, (words: { attribute: string }) => string>
> = Object.freeze({
	watching: () => "You're watching this session; only its players and owner change sheets.",
	'owner-locks': () => 'Only the session owner locks or unlocks a stat.',
	unheard: ({ attribute }) => `Only whoever hears ${attribute} can change it.`,
	locked: ({ attribute }) => `${attribute} is locked.`,
	'no-edits': () =>
		"Sheets aren't changed by hand in this session. The session owner can change that in the session's settings, under Players.",
	'not-theirs': ({ attribute }) => `You can change only your own characters' ${attribute}.`,
	'changed-by': ({ attribute }) => `Only the game master or the rules change ${attribute}.`,
	'no-moves': () =>
		"Items aren't moved by hand in this session. The session owner can change that in the session's settings, under Players.",
})

/**
 * 🚧 One hand edit, with everything the judge reads (the caller resolves each).
 * @experimental
 */
export interface SheetLatitudeQuestion {
	role: HandEditorRole
	act: HandEditAct
	/** Whose the value is, seen from `role` (the caller resolves it): `own` or `other`. */
	whose: 'own' | 'other'
	/** The role's sheet latitude in force. Ignored for a watcher and for `configure`. */
	latitude: SheetLatitude
	/** The role's item-move latitude in force, for `take-from` / `put-on`. Absent: `follow-sheet`. */
	itemMoves?: ItemMoveLatitude
	/** The attribute's `changedBy`, when the slot files under one of the session's rules' attributes. Absent or empty: anyone. */
	changedBy?: readonly AttributeChanger[]
	/** The slot's lock (`configs[slot].lock`). Absent: `none`. */
	lock?: 'none' | 'people' | 'all'
	/** False when the value's earshot keeps it from this person. Absent: heard. */
	heard?: boolean
}

/**
 * 🚧 The judge's answer: allowed, or refused with the cause.
 * @experimental
 */
export type SheetLatitudeVerdict = { ok: true } | { ok: false; cause: HandEditCause }

const OK: SheetLatitudeVerdict = Object.freeze({ ok: true })
const refuse = (cause: HandEditCause): SheetLatitudeVerdict => ({ ok: false, cause })

/** Step 6: the sheet latitude (a `set`, or a move under `follow-sheet`). */
function bySheetLatitude(q: SheetLatitudeQuestion): SheetLatitudeVerdict {
	switch (q.latitude) {
		case 'no-edits':
			return refuse('no-edits')
		case 'all-any':
			return OK
		case 'all-own':
			return q.whose === 'own' ? OK : refuse('not-theirs')
		default: {
			// `as-ruled`, and anything unrecognised: the rules decide.
			if (q.role === 'player' && q.whose === 'other') return refuse('not-theirs')
			const by = q.changedBy
			if (!by || by.length === 0 || by.includes('everyone')) return OK
			const writer: AttributeChanger = q.role === 'owner' ? 'gm' : 'holder'
			if (by.includes(writer)) return OK
			if (writer === 'gm' && by.includes('holder')) return OK
			return refuse('changed-by')
		}
	}
}

/**
 * 🚧 Judge one hand edit against the sheet latitude, the item-move latitude, the slot's lock and
 * the attribute's `changedBy`. The first cause that applies wins: a watcher (`watching`); a
 * `configure` by anyone but the session owner (`owner-locks`); an unheard value (`unheard`); a
 * lock (`locked` — `all` for everyone, `people` for a player); the item-move level; the sheet
 * level. Pure, never throws; the host's write gate and the sheet's edit controls both call it.
 * @experimental
 */
export function sheetLatitudeAllows(q: SheetLatitudeQuestion): SheetLatitudeVerdict {
	if (q.role === 'watcher') return refuse('watching')
	if (q.act === 'configure') return q.role === 'owner' ? OK : refuse('owner-locks')
	if (q.heard === false) return refuse('unheard')
	if (q.lock === 'all' || (q.lock === 'people' && q.role === 'player')) return refuse('locked')
	if (q.act === 'take-from' || q.act === 'put-on') {
		switch (q.itemMoves ?? 'follow-sheet') {
			case 'no-moves':
				return refuse('no-moves')
			case 'own-items':
				return q.whose === 'own' ? OK : refuse('not-theirs')
			case 'any-items':
				return OK
			default:
				break // `follow-sheet`: judged as a `set`
		}
	}
	return bySheetLatitude(q)
}

/**
 * 🚧 A stored value read defensively: one of the levels, else `as-ruled` (the default when a
 * genre says nothing).
 * @experimental
 */
export function sheetLatitudeOf(value: unknown): SheetLatitude {
	return (SHEET_LATITUDES as readonly unknown[]).includes(value)
		? (value as SheetLatitude)
		: 'as-ruled'
}

/**
 * 🚧 A stored value read defensively: one of the levels, else `follow-sheet`.
 * @experimental
 */
export function itemMoveLatitudeOf(value: unknown): ItemMoveLatitude {
	return (ITEM_MOVE_LATITUDES as readonly unknown[]).includes(value)
		? (value as ItemMoveLatitude)
		: 'follow-sheet'
}
