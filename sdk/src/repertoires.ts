/**
 * 🚧 Repertoires — the kinds of thing a ruleset lets an owner hold, and the
 * pieces each one holds.
 *
 * A **repertoire** is a list a ruleset declares: *things* a character
 * carries, *conditions* they suffer, *exits* out of a place. A **piece** is
 * one item of it — a sword, *Bleeding*, a barred oak door — and every piece,
 * whatever the repertoire, has the same universal parts: a `name`, a
 * `description`, optional `prose`, its `traits` (plain strings a mechanic's
 * predicate can test), whether it is `equipped`, and how long it lasts on its
 * holder (`duration`). A repertoire's own `piece` shape adds what is
 * particular to it.
 *
 * ## Prose and mechanics are siblings
 *
 * A repertoire carries field-level `prose` (what a model should infer pieces
 * of this kind do) beside its `mechanics` (what the handler computes). At
 * `prose` rigour only the first is read; at `mechanics` the second is
 * evaluated too. There is no translation step between them.
 *
 * ## Mechanics: a closed, single-pass set of verbs
 *
 * `modify` · `set` (the owning ruleset only) · `adjustDegree` · `rider` —
 * and 🚧 (2026-10-18, owner ruling ★4: the ruleset handler executes a
 * piece's effects, never a model's arithmetic) five that act **when a piece
 * is used** (`on: 'hit'` or `'use'`): `rollWith` (the check rolls with the
 * best of some modifiers), `harm` and `heal` (dice a piece field holds, on a
 * stat), `cure` (pieces with a trait leave) and `consume` (one use spent).
 * Each may fire `on` an event and hold under a `predicate`. How long an
 * effect lasts is the **piece's** `duration` (a universal part, counted down
 * by the host), never the mechanic's: a mechanic holds while its piece is
 * held. A mechanic that would silently do nothing — a degree adjustment on a
 * rest, a `traverse` on a repertoire that is not relational, a target no
 * selector or selector family names — is refused when it is authored, with
 * the reason named (`repertoireFindings`).
 *
 * (2026-10-17: `bestow`, `situational`, a mechanic's own `duration` and
 * `promptPolicy` were cut — declared and validated, never read by a host.)
 *
 * ## Where a piece lives
 *
 * A piece is stored as an item of an ordinary `list` attribute slot whose
 * `config.repertoire` names the repertoire by its address
 * (`core:ruleset/freeform@1#things`, `repertoireAddress`). Three forms
 * (`SlotPiece`, attributes.ts): written out inline, a reference to a lore
 * entry, or a reference to a compendium row — the last two with optional
 * overrides. No seventh slot type: a repertoire is a list that knows its
 * item's shape.
 *
 * ⚠ Not a *list slot* in general (that holds words and lore references), not
 * a *sheet* (which names slots), never an *inventory* (that is one core slot).
 * @experimental
 */

import type { I18n } from './i18n.js'
import { i18nFindings } from './i18n.js'
import { checkValues, settingsSchemaFindings, type FieldDecl } from './settings.js'
import { PREDICATE_CONDITION_KEYS, type Predicate } from './predicates.js'
import type { SlotAppliesTo, SlotEarshot, SlotPiece, SlotScalar } from './attributes.js'
import type { StoryTime } from './storyTime.js'

// ── Vocabulary ──────────────────────────────────────────────────────────────

/** The depths, shallowest first — the order a budget degrades through. */
const RENDER_DEPTHS = ['index', 'summary', 'full'] as const

/**
 * 🚧 How deep a piece renders into a prompt: one line (`index`), the
 * declared summary (`summary`), or everything (`full`). A budget degrades a
 * block's depth before it drops it.
 * @experimental
 */
export type RenderDepth = (typeof RENDER_DEPTHS)[number]

/** The verbs a mechanic may use — closed, single pass. */
const MECHANIC_VERBS = ['modify', 'set', 'adjustDegree', 'rider', 'rollWith', 'harm', 'heal', 'cure', 'consume'] as const

/**
 * 🚧 The verbs that act when a piece is used (2026-10-18): they need the
 * piece and an event that uses it (`hit`, `use`), so a bridge — which has
 * no piece — never says one. @internal
 */
export const PIECE_USE_VERBS: ReadonlySet<string> = new Set(['rollWith', 'harm', 'heal', 'cure', 'consume'])

/**
 * The events a mechanic may fire on. `hit`, `use` and `traverse` are the
 * three that resolve a check; `traverse` is a relational repertoire's (an
 * exit is crossed). `elapsed` names `every`; `at` names a story date.
 */
const MECHANIC_EVENTS = ['hit', 'use', 'rest', 'equip', 'turn', 'elapsed', 'at', 'change', 'traverse'] as const
type MechanicEvent = (typeof MECHANIC_EVENTS)[number]

/** The events that resolve a check — the only ones a degree can touch. */
const CHECK_EVENTS: ReadonlySet<MechanicEvent> = new Set(['hit', 'use', 'traverse'])
/** The events that use a piece — the only ones a piece-use verb fires on. */
const USE_EVENTS: ReadonlySet<MechanicEvent> = new Set(['hit', 'use'])

/**
 * The units a piece's `duration` counts in. `round` is a round-keeping
 * ruleset's; `minute`/`hour`/`day` need a ruleset with a clock; `turn`,
 * `scene` and `until-removed` are counted by play, not by a clock.
 */
const PIECE_DURATION_UNITS = ['round', 'minute', 'hour', 'day', 'turn', 'scene', 'until-removed'] as const
/** What ends a piece's `duration`. */
const PIECE_DURATION_EXPIRIES = ['turn-start', 'turn-end', 'rest', 'scene-end', 'elapsed', 'never'] as const
/** The units a clock counts — the ones `expiry: 'elapsed'` can run out in. */
const CLOCK_UNITS: ReadonlySet<string> = new Set(['round', 'minute', 'hour', 'day'])

/**
 * 🚧 How long a piece lasts **on its holder** — a universal piece part
 * (`PIECE_FIELDS.duration`): _Poisoned_ for an hour, _Prone_ until removed.
 * The host counts it down and removes the piece when it runs out; a
 * repertoire never redeclares it.
 *
 *  · `units` — `round` · `minute` · `hour` · `day` · `turn` · `scene` ·
 *    `until-removed`, refused when the ruleset's time cannot count it
 *    (`pieceDurationProblem`): a round in a ruleset that keeps no rounds, a
 *    minute in one that keeps time by the scene.
 *  · `value` — how many units; `expiry` — what ends it (`turn-start` ·
 *    `turn-end` · `rest` · `scene-end` · `elapsed` · `never`).
 *  · `startedAt` / `spent` — the host's bookkeeping as it counts down.
 *
 * ⚠ Not how long a *spell's effect* lasts once cast: a known spell is held
 * until forgotten, and a ruleset says its effect's length in a field of its
 * own (Vis Itineris: `effectDuration`).
 * @experimental
 */
export interface PieceDuration {
	units: (typeof PIECE_DURATION_UNITS)[number]
	value?: number
	expiry?: (typeof PIECE_DURATION_EXPIRIES)[number]
	startedAt?: { turn?: number; messageId?: number; clock?: StoryTime }
	spent?: number
}

/**
 * 🚧 Why a piece's `duration` cannot be counted by a ruleset that keeps time
 * in `timeUnit`, or `null` when it can. Without a `timeUnit` only the shape
 * is judged. What `checkPiece` and a ruleset's compendium check both ask.
 * @experimental
 */
export function pieceDurationProblem(duration: unknown, timeUnit?: string): string | null {
	if (duration === undefined || duration === null) return null
	const d = duration as Partial<PieceDuration>
	if (typeof d !== 'object' || Array.isArray(d) || !PIECE_DURATION_UNITS.includes(d.units as never))
		return `a duration is { units: ${PIECE_DURATION_UNITS.join(' | ')}, value?, expiry? }; '${JSON.stringify(duration)}' is not one.`
	if (d.expiry === 'elapsed' && !(CLOCK_UNITS.has(d.units!) && typeof d.value === 'number'))
		return `a duration that ends when time runs out ('elapsed') counts rounds, minutes, hours or days, and says how many.`
	if (timeUnit === undefined) return null
	if (d.units === 'round' && timeUnit !== 'round')
		return `a duration in rounds needs a ruleset that keeps rounds; this one keeps time in '${timeUnit}'. Say minutes, or a turn.`
	if (CLOCK_UNITS.has(d.units!) && timeUnit === 'scene')
		return `a duration in ${d.units}s needs a clock; this ruleset keeps time by the scene. Say 'scene', 'turn' or 'until-removed'.`
	return null
}

/**
 * 🚧 The condition a mechanic holds under: the SDK's predicate grammar
 * (`predicates.ts`) over a **selector** path, extended with trait strings
 * and the three combinators. A path names a selector the owning ruleset
 * declares, or `piece.<field>` for the repertoire's own piece fields —
 * anything else is refused when authored, never a silent miss at runtime.
 * @experimental
 */
export type MechanicPredicate =
	| (Predicate & { path: string })
	| { traits: { all?: readonly string[]; any?: readonly string[]; none?: readonly string[] } }
	| { all: readonly MechanicPredicate[] }
	| { any: readonly MechanicPredicate[] }
	| { not: MechanicPredicate }

/** What every mechanic may say beside its verb. */
interface MechanicBase {
	/** The event it fires on. Absent: it holds whenever its owner is resolved. */
	on?: MechanicEvent
	/** `on: 'elapsed'` only: every how many of the ruleset's time units. */
	every?: number
	/** `on: 'at'` only: the story date it fires at (`'412-03-05 22:30'`). */
	at?: string
	predicate?: MechanicPredicate
}

/**
 * 🚧 One mechanic. `target` is a selector the owning ruleset declares, or —
 * for `modify`, `adjustDegree` and `rider` — a **selector family**: a dotted
 * selector's parent (`attack` covers `attack.melee`) or a check's declared
 * `within` (`check` covers every skill check). See `RulesetSelectorDecl`.
 *
 *  · `modify` — add `value` to the target; `bonusType` groups typed bonuses.
 *  · `set` — the target becomes `value`. Only the ruleset that owns the stat,
 *    and only the stat itself, never a family.
 *  · `adjustDegree` — a check's degree moves one band (`by`).
 *  · `rider` — prose attached to a stat (`target`) or an event (`on`).
 *
 * 🚧 When a piece is used (`on: 'hit'` or `'use'`; 2026-10-18):
 *
 *  · `rollWith` — a check made with the piece on `target` (a check or a
 *    family) rolls with the highest of the `from` selectors as its modifier
 *    instead of its own `base` — a finesse blade with Strength or Dexterity.
 *  · `harm` — on a landed check (or a use against nothing), roll the dice
 *    the piece field `dice` holds (`piece.damage`: `{ dice, die }`,
 *    `{ formula }` or `'2d4+2'`), add `plus` — `'check'` (the modifier the
 *    check rolled with) or the highest of some selectors — and the
 *    ruleset's `tally` modifies, and take the total off `stat` on the
 *    **target** the change names. With no target owner the roll is only told.
 *  · `heal` — the same dice and `plus`, added to `stat` on the target (else
 *    the holder), never past the stat's maximum.
 *  · `cure` — on the target (else the holder), every held piece carrying
 *    one of `traits` leaves, and none carrying one lands for the rest of the
 *    change set.
 *  · `consume` — one use of the piece is spent whenever it is used, landed
 *    or not (`uses`, else the stack's `count`; the last leaves).
 *
 * ⚠ `harm`/`heal` roll dice, so a host runs them only where dice count
 * (the `mechanics` rigour and up); `cure` and `consume` change no number
 * and apply at every rigour.
 * @experimental
 */
export type MechanicDecl = MechanicBase &
	(
		| { verb: 'modify'; target: string; value: number; bonusType?: string }
		| { verb: 'set'; target: string; value: SlotScalar }
		| { verb: 'adjustDegree'; target: string; by: -1 | 1 }
		| { verb: 'rider'; text: string; target?: string }
		| { verb: 'rollWith'; target: string; from: readonly string[] }
		| { verb: 'harm'; dice: string; stat: string; plus?: 'check' | readonly string[] }
		| { verb: 'heal'; dice: string; stat: string; plus?: readonly string[] }
		| { verb: 'cure'; traits: readonly string[] }
		| { verb: 'consume' }
	)

// ── The piece shape ─────────────────────────────────────────────────────────

/**
 * 🚧 The parts every piece has, whatever its repertoire. A repertoire's own
 * `piece` fields are laid beside these and may not redeclare them.
 * @experimental
 */
export const PIECE_FIELDS: Readonly<Record<string, FieldDecl>> = Object.freeze({
	name: { type: 'string', required: true, label: { en: 'Name' } },
	description: { type: 'text', required: true, label: { en: 'Description' } },
	prose: { type: 'text', label: { en: 'Prose' } },
	traits: { type: 'list', item: { type: 'string' }, default: [], label: { en: 'Traits' } },
	// 🚧 2026-10-17 (audit A3): one universal flag, so `on: 'equip'` and
	// passive gear read the same field in every ruleset.
	equipped: {
		type: 'boolean',
		label: { en: 'Equipped' },
		description: { en: 'Worn, wielded or readied — what equip mechanics and passive gear read.' },
	},
	// 🚧 2026-10-17: how long a piece lasts on its holder, one shape for every
	// repertoire (`PieceDuration`); the host counts it down.
	duration: {
		type: 'object',
		label: { en: 'Lasts' },
		fields: {
			units: {
				type: 'enum',
				of: [...PIECE_DURATION_UNITS],
				members: [
					{ key: 'round', label: { en: 'Rounds' } },
					{ key: 'minute', label: { en: 'Minutes' } },
					{ key: 'hour', label: { en: 'Hours' } },
					{ key: 'day', label: { en: 'Days' } },
					{ key: 'turn', label: { en: 'Turns' } },
					{ key: 'scene', label: { en: 'Scene' } },
					{ key: 'until-removed', label: { en: 'Until removed' } },
				],
				required: true,
				label: { en: 'Units' },
			},
			value: { type: 'integer', min: 1, label: { en: 'How many' } },
			expiry: {
				type: 'enum',
				of: [...PIECE_DURATION_EXPIRIES],
				members: [
					{ key: 'turn-start', label: { en: 'Start of turn' } },
					{ key: 'turn-end', label: { en: 'End of turn' } },
					{ key: 'rest', label: { en: 'A rest' } },
					{ key: 'scene-end', label: { en: 'End of scene' } },
					{ key: 'elapsed', label: { en: 'When time runs out' } },
					{ key: 'never', label: { en: 'Never on its own' } },
				],
				label: { en: 'Ends at' },
			},
			startedAt: {
				type: 'object',
				label: { en: 'Started' },
				fields: {
					turn: { type: 'integer', min: 0, label: { en: 'Turn' } },
					messageId: { type: 'integer', min: 1, label: { en: 'Message' } },
					clock: { type: 'object', label: { en: 'Story time' } },
				},
			},
			spent: { type: 'integer', min: 0, label: { en: 'Spent' } },
		},
	},
})

/**
 * 🚧 What a relational repertoire's pieces carry as well: the owner the piece
 * points `towards` (`location:12`, `character:4`) and, for an exit, the places
 * graph `edge` it decorates.
 * @experimental
 */
export const RELATIONAL_PIECE_FIELDS: Readonly<Record<string, FieldDecl>> = Object.freeze({
	towards: { type: 'string', required: true, label: { en: 'Towards' } },
	edge: { type: 'string', label: { en: 'Edge' } },
})

/**
 * 🚧 A piece's fields, flat: the universal parts and a repertoire's own.
 * What an inline piece and a compendium row both are.
 * @experimental
 */
export interface PieceProps {
	name: string
	description: string
	prose?: string
	traits?: readonly string[]
	equipped?: boolean
	duration?: PieceDuration
	[field: string]: unknown
}

// ── The declaration ─────────────────────────────────────────────────────────

/** What `defineRepertoire` takes. */
interface RepertoireProps {
	/** The name a person reads. Display text. */
	label: I18n
	/** What it is for. Display text. */
	description?: I18n
	/**
	 * The repertoire's own piece fields, as an `object` FieldDecl. The
	 * universal parts (`PIECE_FIELDS`) are always present and are not restated.
	 */
	piece?: FieldDecl
	/** Field-level prose: what a model infers pieces of this kind do. Model-facing; inside the hash. */
	prose: string
	mechanics?: readonly MechanicDecl[]
	/**
	 * 🚧 Which prompts may read its pieces — the slot word (`SlotEarshot`):
	 * `'all'` (absent) every agent's, `'holder'` only the holder's own voice.
	 */
	earshot?: SlotEarshot
	/**
	 * 🚧 Read by the game master's steps alone (a creature's stat block): kept
	 * out of every voice's prompt and every player's view. Separate from
	 * `earshot` — who hears it and whether the GM alone does are two questions.
	 */
	gmOnly?: boolean
	/** The depth its pieces render at when nothing else decides. */
	renderDepth?: RenderDepth
	/**
	 * Which owners hold its pieces: cast members (the default), the world, a
	 * location — an exit is held by the place it leads out of.
	 */
	appliesTo?: readonly SlotAppliesTo[]
	/** Pieces point at another owner (`towards`) — relationships, exits. */
	relational?: boolean
	/** Its pieces may become lorebook entries of a derived entry type. */
	entryable?: boolean
	/**
	 * Piece fields renamed since an earlier version, old → new — so stored
	 * pieces read through. Required by `rulesetUpgradeFindings` for a field
	 * that disappears.
	 */
	renames?: Readonly<Record<string, string>>
	/** Piece fields retired since an earlier version: no longer declared, still read. */
	retired?: readonly string[]
}

/** @experimental */
export interface RepertoireDecl extends Omit<RepertoireProps, 'piece'> {
	/** A short name unique within its ruleset — `things`, `conditions`. */
	readonly id: string
	/** The whole piece shape: the universal parts, the relational ones when it is relational, then its own. */
	readonly piece: FieldDecl
}

/**
 * 🚧 Why a ruleset, repertoire, bridge or conversion is refused. Thrown by
 * the define doors with every finding joined; each finding opens with its
 * reason's name in brackets (`[unknown-selector] …`).
 * @internal
 */
export class RulesetError extends Error {
	readonly findings: readonly string[]
	constructor(what: string, findings: readonly string[]) {
		super(`${what} is refused:\n · ${findings.join('\n · ')}`)
		this.name = 'RulesetError'
		this.findings = findings
	}
}

/** A finding, opened by its reason's name — `[reason] sentence`. @internal */
export const finding = (reason: string, text: string): string => `[${reason}] ${text}`

const REPERTOIRE_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * The ruleset id grammar — `owner:ruleset/name@N`. Declared here because a
 * compendium reference is checked here; `rulesets.ts` reads the same pattern.
 * @internal
 */
export const RULESET_ID_PATTERN = /^[a-z0-9]+(?:[.-][a-z0-9]+)*:ruleset\/[a-z0-9]+(?:-[a-z0-9]+)*@\d+$/

/**
 * 🚧 A repertoire's address: its ruleset's id and its own name —
 * `core:ruleset/freeform@1#things`. What a slot's `config.repertoire` holds.
 * @experimental
 */
export const repertoireAddress = (rulesetId: string, repertoireId: string): string => `${rulesetId}#${repertoireId}`

/** 🚧 The two halves of an address, or `undefined` when it is not one. @experimental */
export function parseRepertoireAddress(address: string): { ruleset: string; repertoire: string } | undefined {
	const at = typeof address === 'string' ? address.lastIndexOf('#') : -1
	if (at < 0) return undefined
	const ruleset = address.slice(0, at)
	const repertoire = address.slice(at + 1)
	return RULESET_ID_PATTERN.test(ruleset) && REPERTOIRE_NAME.test(repertoire) ? { ruleset, repertoire } : undefined
}

const UNIVERSAL_KEYS = new Set([...Object.keys(PIECE_FIELDS), ...Object.keys(RELATIONAL_PIECE_FIELDS)])
/** What a held piece (`SlotPiece`) says beside its fields — never a field name. */
const PIECE_FORM_KEYS = new Set(['kind', 'count', 'overrides'])

/** The context-free findings, plus the whole piece shape when it can be built. */
function ownFindings(id: string, props: Omit<RepertoireProps, 'piece'> & { piece?: FieldDecl }, built?: FieldDecl): string[] {
	const at = `repertoire '${id}'`
	const out: string[] = []
	if (typeof id !== 'string' || !REPERTOIRE_NAME.test(id))
		out.push(finding('invalid-id', `'${String(id)}' is not a repertoire name. Use lowercase words joined by '-' — 'things', 'known-spells'.`))
	out.push(...i18nFindings(props.label, `${at} label`, { required: true }).map((f) => finding('display-text', f)))
	out.push(...i18nFindings(props.description, `${at} description`).map((f) => finding('display-text', f)))
	if (typeof props.prose !== 'string' || !props.prose.trim())
		out.push(finding('missing-prose', `${at} declares no prose. It is what a model reads about pieces of this kind at every rigour; without it a piece reaches a prompt as a bare name.`))
	if (!built && props.piece !== undefined) {
		if (!props.piece || props.piece.type !== 'object')
			out.push(finding('piece-not-object', `${at}.piece is a '${String(props.piece?.type)}' field. A piece is a record — declare { type: 'object', fields: { … } }.`))
		else {
			const own = Object.keys(props.piece.fields ?? {})
			for (const k of own.filter((k) => UNIVERSAL_KEYS.has(k)))
				out.push(finding('piece-redeclares-universal', `${at}.piece declares '${k}', which every piece already has. Declare only this repertoire's own fields.`))
			for (const k of own.filter((k) => PIECE_FORM_KEYS.has(k)))
				out.push(finding('piece-reserved-field', `${at}.piece declares '${k}', which a held piece uses for its form and count. Name the field otherwise — 'sort', 'uses'.`))
			out.push(...settingsSchemaFindings(props.piece.fields ?? {}, `${at}.piece`).map((f) => finding('display-text', f)))
		}
	}
	if (props.earshot !== undefined && props.earshot !== 'all' && props.earshot !== 'holder')
		out.push(
			finding(
				'bad-earshot',
				`${at}.earshot is '${String(props.earshot)}'. Say 'all' or 'holder'` +
					(String(props.earshot) === 'gm' ? `; for the game master's steps alone, say gmOnly: true.` : '.'),
			),
		)
	if (props.gmOnly !== undefined && typeof props.gmOnly !== 'boolean')
		out.push(finding('bad-gm-only', `${at}.gmOnly is true or left out.`))
	else if (props.gmOnly === true && props.earshot === 'holder')
		out.push(finding('bad-earshot', `${at} is gmOnly and heard by its holder alone — no prompt would read it. Say one.`))
	if (props.appliesTo !== undefined && (!Array.isArray(props.appliesTo) || !props.appliesTo.length || props.appliesTo.some((o) => !['cast', 'world', 'location'].includes(o))))
		out.push(finding('bad-applies-to', `${at}.appliesTo is a non-empty list of 'cast', 'world' and 'location'; leave it out for cast members.`))
	if (props.renderDepth !== undefined && !RENDER_DEPTHS.includes(props.renderDepth))
		out.push(finding('bad-render-depth', `${at}.renderDepth is '${String(props.renderDepth)}'. Say 'index', 'summary' or 'full'.`))
	const fields = new Set(Object.keys((built ?? wholePiece(props)).fields ?? {}))
	for (const [from, to] of Object.entries(props.renames ?? {})) {
		if (fields.has(from))
			out.push(finding('rename-still-declared', `${at} renames '${from}' to '${to}' and still declares '${from}'. A renamed field is gone under its old name; drop it from the piece.`))
		if (!fields.has(to))
			out.push(finding('rename-to-nothing', `${at} renames '${from}' to '${to}', which the piece does not declare. Declare '${to}', or retire '${from}' instead.`))
	}
	for (const k of props.retired ?? [])
		if (fields.has(k))
			out.push(finding('retired-still-declared', `${at} retires '${k}' and still declares it. Drop it from the piece, or un-retire it.`))
	return out
}

function wholePiece(props: Pick<RepertoireProps, 'relational' | 'piece'>): FieldDecl {
	return {
		type: 'object',
		fields: {
			...PIECE_FIELDS,
			...(props.relational ? RELATIONAL_PIECE_FIELDS : {}),
			...(props.piece?.fields ?? {}),
		},
	}
}

/**
 * What a repertoire sits in when it is checked against a ruleset: the
 * selectors mechanics may target, the selector families a `modify`,
 * `adjustDegree` or `rider` may target besides, the stats the ruleset owns
 * (the only targets of `set`), its repertoires, and its time unit.
 * @internal
 */
export interface RepertoireContext {
	ruleset: string
	selectors: ReadonlySet<string>
	/**
	 * Names that are no selector but cover some (2026-10-17): every dotted
	 * selector's parents (`attack` for `attack.melee`) and every check's
	 * declared `within`.
	 */
	families?: ReadonlySet<string>
	/** Selector names that are the ruleset's own stats. */
	ownStats: ReadonlySet<string>
	repertoires: ReadonlyMap<string, RepertoireDecl>
	timeUnit?: string
	/**
	 * Extra paths a predicate may name, never a target — a bridge's own field,
	 * by its bare key and its id, and their properties (`mood`, `mood.tone`).
	 * Added 2026-10-17.
	 */
	predicatePaths?: ReadonlySet<string>
}

function predicateFindings(p: unknown, at: string, ok: (path: string) => boolean): string[] {
	if (!p || typeof p !== 'object' || Array.isArray(p))
		return [finding('bad-predicate', `${at} is not a predicate. Say { path, equals | equalsPath | truthy }, { traits: { all | any | none } }, or combine with all / any / not.`)]
	const o = p as Record<string, unknown>
	const keys = Object.keys(o)
	if ('all' in o || 'any' in o) {
		const list = (o.all ?? o.any) as unknown
		if (keys.length !== 1 || !Array.isArray(list) || !list.length)
			return [finding('bad-predicate', `${at} combines with ${keys.join(' and ')}. Say one of all / any, over a non-empty list.`)]
		return list.flatMap((q, i) => predicateFindings(q, `${at}.${keys[0]}[${i}]`, ok))
	}
	if ('not' in o) {
		if (keys.length !== 1) return [finding('bad-predicate', `${at} says 'not' beside ${keys.filter((k) => k !== 'not').join(', ')}. 'not' stands alone.`)]
		return predicateFindings(o.not, `${at}.not`, ok)
	}
	if ('traits' in o) {
		const t = o.traits as Record<string, unknown> | undefined
		const lists = t && typeof t === 'object' ? (['all', 'any', 'none'] as const).filter((k) => t[k] !== undefined) : []
		if (keys.length !== 1 || !lists.length)
			return [finding('bad-predicate', `${at}.traits names none of all / any / none. Say which traits must, may or must not be present.`)]
		const bad = lists.filter((k) => !Array.isArray(t![k]) || !(t![k] as unknown[]).length || (t![k] as unknown[]).some((s) => typeof s !== 'string' || !s.trim()))
		return bad.map((k) => finding('bad-predicate', `${at}.traits.${k} is not a non-empty list of trait words.`))
	}
	const conds = PREDICATE_CONDITION_KEYS.filter((k) => o[k] !== undefined)
	if (typeof o.path !== 'string' || !o.path || conds.length !== 1)
		return [finding('bad-predicate', `${at} needs a path and exactly one of ${PREDICATE_CONDITION_KEYS.join(', ')}.`)]
	if (!ok(o.path))
		return [finding('unknown-selector', `${at}.path '${o.path}' names no selector this ruleset declares, and no field of the piece. Declare it, or correct the spelling — an unknown path would never hold.`)]
	return []
}

/** A non-empty list of non-empty names. */
const isNameList = (x: unknown): boolean =>
	Array.isArray(x) && x.length > 0 && x.every((n) => typeof n === 'string' && !!n.trim())

function mechanicFindings(
	rep: { id: string; relational?: boolean; piece: FieldDecl },
	m: MechanicDecl,
	i: number,
	ctx?: RepertoireContext,
	where = `repertoire '${rep.id}'`,
): string[] {
	const at = `${where} mechanic ${i}`
	const out: string[] = []
	if (!m || typeof m !== 'object') return [finding('malformed-mechanic', `${at} is not a mechanic object.`)]
	const verb = (m as { verb?: unknown }).verb
	if (!MECHANIC_VERBS.includes(verb as (typeof MECHANIC_VERBS)[number]))
		return [finding('unknown-verb', `${at} uses the verb '${String(verb)}'. A mechanic is one of ${MECHANIC_VERBS.join(', ')}.`)]
	const on = m.on
	if (on !== undefined && !MECHANIC_EVENTS.includes(on))
		out.push(finding('unknown-event', `${at} fires on '${String(on)}'. Say one of ${MECHANIC_EVENTS.join(', ')}.`))
	if (on === 'elapsed' && !(typeof m.every === 'number' && m.every > 0))
		out.push(finding('inert-pairing', `${at} fires on 'elapsed' with no 'every'. Say every how many time units it fires, or it never would.`))
	if (on !== 'elapsed' && m.every !== undefined)
		out.push(finding('inert-pairing', `${at} says 'every' without firing on 'elapsed'. Drop it, or fire on 'elapsed'.`))
	if (on === 'at' && !(typeof m.at === 'string' && m.at.trim()))
		out.push(finding('inert-pairing', `${at} fires on 'at' with no story date. Say 'at', or it never would.`))
	if (on !== 'at' && m.at !== undefined)
		out.push(finding('inert-pairing', `${at} names a date without firing on 'at'. Drop it, or fire on 'at'.`))
	if (on === 'traverse' && !rep.relational)
		out.push(finding('inert-pairing', `${at} fires on 'traverse', and '${rep.id}' is not relational — nothing of it is ever crossed. Make the repertoire relational, or fire on another event.`))
	if (verb === 'adjustDegree' && on !== undefined && !CHECK_EVENTS.has(on))
		out.push(finding('inert-pairing', `${at} is adjustDegree on '${on}', which resolves no check — a degree has nothing to touch there. Fire on hit, use or traverse, or leave 'on' out.`))
	if (PIECE_USE_VERBS.has(verb as string) && (on === undefined || !USE_EVENTS.has(on)))
		out.push(finding('inert-pairing', `${at} is ${String(verb)}${on === undefined ? ' on no event' : ` on '${on}'`}, and it acts only when its piece is used. Fire on hit or use.`))
	const need = (k: string, ok: boolean, what: string) => {
		if (!ok) out.push(finding('malformed-mechanic', `${at} (${String(verb)}) needs ${k}: ${what}.`))
	}
	const mm = m as unknown as Record<string, unknown>
	switch (verb) {
		case 'modify':
			need('target', typeof mm.target === 'string' && !!mm.target, 'the selector it changes')
			need('value', typeof mm.value === 'number' && Number.isFinite(mm.value), 'a number')
			break
		case 'set':
			need('target', typeof mm.target === 'string' && !!mm.target, 'the stat it sets')
			need('value', mm.value === null || ['number', 'string', 'boolean'].includes(typeof mm.value), 'a stat value')
			break
		case 'adjustDegree':
			need('target', typeof mm.target === 'string' && !!mm.target, 'the check it adjusts')
			need('by', mm.by === 1 || mm.by === -1, '1 or -1 — one band')
			break
		case 'rider':
			need('text', typeof mm.text === 'string' && !!(mm.text as string).trim(), 'the prose it attaches')
			if (mm.target === undefined && on === undefined)
				out.push(finding('inert-pairing', `${at} is a rider on neither a stat nor an event. Say 'target' or 'on', or its prose is attached to nothing.`))
			break
		case 'rollWith':
			need('target', typeof mm.target === 'string' && !!mm.target, 'the check it changes the modifier of')
			need('from', isNameList(mm.from), 'a non-empty list of the selectors whose highest is rolled with')
			break
		case 'harm':
		case 'heal':
			need('dice', typeof mm.dice === 'string' && (mm.dice as string).startsWith('piece.'), "the piece field holding its dice — 'piece.damage'")
			need('stat', typeof mm.stat === 'string' && !!mm.stat, 'the stat it changes')
			if (mm.plus !== undefined && !(verb === 'harm' && mm.plus === 'check') && !isNameList(mm.plus))
				out.push(finding('malformed-mechanic', `${at} (${verb}) adds 'plus': ${verb === 'harm' ? "'check' (the modifier the check rolled with) or " : ''}a non-empty list of selectors, the highest added.`))
			if (verb === 'harm' && mm.plus === 'check' && on !== 'hit')
				out.push(finding('inert-pairing', `${at} adds the check's modifier on '${String(on)}'. Only a hit's check rolls with a modifier to add; fire on hit, or name the selectors.`))
			break
		case 'cure':
			need('traits', isNameList(mm.traits), 'a non-empty list of the trait words whose pieces leave')
			break
	}
	if ('duration' in mm)
		out.push(finding('mechanic-duration', `${at} says a duration. How long an effect lasts is its piece's duration (a universal part) — the mechanic holds while the piece is held.`))
	const pieceFields = new Set(Object.keys(rep.piece.fields ?? {}))
	const extraOk = (p: string) => {
		const extra = ctx?.predicatePaths
		if (!extra) return false
		for (const x of extra) if (p === x || p.startsWith(`${x}.`)) return true
		return false
	}
	const pathOk = (p: string) =>
		p.startsWith('piece.') ? pieceFields.has(p.slice('piece.'.length)) : !ctx || ctx.selectors.has(p) || extraOk(p)
	if (m.predicate !== undefined) out.push(...predicateFindings(m.predicate, `${at}.predicate`, pathOk))
	if ((verb === 'harm' || verb === 'heal') && typeof mm.dice === 'string' && mm.dice.startsWith('piece.') && !pathOk(mm.dice))
		out.push(finding('unknown-selector', `${at} reads its dice from '${mm.dice}', which is no field of the piece. Declare it, or correct the spelling.`))
	if (ctx) {
		// The selectors a piece-use verb reads or writes: each must be one.
		const named = [
			...(verb === 'harm' || verb === 'heal' ? [mm.stat] : []),
			...(verb === 'rollWith' && Array.isArray(mm.from) ? (mm.from as unknown[]) : []),
			...((verb === 'harm' || verb === 'heal') && Array.isArray(mm.plus) ? (mm.plus as unknown[]) : []),
		].filter((x): x is string => typeof x === 'string' && !!x)
		for (const n of named)
			if (!ctx.selectors.has(n))
				out.push(finding('unknown-selector', `${at} (${String(verb)}) names '${n}', which no selector of ${ctx.ruleset} is. Declare it among the ruleset's selectors or stats, or correct the spelling.`))
		const target = typeof mm.target === 'string' ? mm.target : undefined
		// A family (`attack`, `check`) reaches every selector it covers; `set`
		// writes one stored value, so it names the stat itself.
		const resolves = (t: string) => ctx.selectors.has(t) || (verb !== 'set' && !!ctx.families?.has(t))
		if (target && !resolves(target))
			out.push(finding('unknown-selector', `${at} targets '${target}', which no selector or selector family of ${ctx.ruleset} names. Declare it among the ruleset's selectors or stats, or correct the spelling.`))
		if (verb === 'set' && target && ctx.selectors.has(target) && !ctx.ownStats.has(target))
			out.push(finding('set-outside-owner', `${at} sets '${target}', which is not one of ${ctx.ruleset}'s own stats. Only the ruleset that owns a stat may set it; use modify.`))
	} else if (verb === 'set')
		out.push(finding('set-outside-owner', `${at} sets '${String(mm.target)}' outside any ruleset. Only a ruleset may set its own stats; declare the repertoire on it.`))
	return out
}

/**
 * One mechanic's findings outside a repertoire — a bridge's effects. `where`
 * names the declaration in each sentence.
 * @internal
 */
export const _mechanicFindings = (m: MechanicDecl, i: number, ctx: RepertoireContext | undefined, where: string): string[] =>
	mechanicFindings({ id: where, piece: { type: 'object', fields: {} } }, m, i, ctx, where)

/**
 * 🚧 Every reason a repertoire is refused, each opened by its reason's name.
 * Without `ctx` it checks what the declaration says by itself; with one it
 * also checks the mechanics against the ruleset it sits in
 * (`unknown-selector`, `set-outside-owner`). `rulesetFindings` passes the
 * context.
 *
 * Reasons: `invalid-id` · `display-text` · `missing-prose` ·
 * `piece-not-object` · `piece-redeclares-universal` · `piece-reserved-field` ·
 * `bad-applies-to` · `bad-earshot` · `bad-gm-only` · `bad-render-depth` ·
 * `rename-still-declared` · `rename-to-nothing` · `retired-still-declared` ·
 * `unknown-verb` · `unknown-event` · `malformed-mechanic` · `inert-pairing` ·
 * `mechanic-duration` · `bad-predicate` · `unknown-selector` ·
 * `set-outside-owner`.
 * @internal
 */
export function repertoireFindings(decl: RepertoireDecl, ctx?: RepertoireContext): string[] {
	return [
		...ownFindings(decl.id, decl, decl.piece),
		...(decl.mechanics ?? []).flatMap((m, i) => mechanicFindings(decl, m, i, ctx)),
	]
}

/**
 * 🚧 Declare a repertoire. Its own findings refuse it here (`RulesetError`);
 * the ones that need its ruleset — selectors, owned stats — refuse the
 * ruleset that lists it. Not registered on its own: a repertoire is reached
 * through the ruleset that declares it.
 * @experimental
 */
export function defineRepertoire(id: string, props: RepertoireProps): RepertoireDecl {
	const own = ownFindings(id, props)
	const piece = wholePiece(props)
	const rep = { id, relational: props.relational, piece }
	const found = [...own, ...(props.mechanics ?? []).flatMap((m, i) => mechanicFindings(rep, m, i))].filter(
		// `set` is judged against the ruleset that lists the repertoire.
		(f) => !f.startsWith('[set-outside-owner]'),
	)
	if (found.length) throw new RulesetError(`repertoire '${id}'`, found)
	return Object.freeze({
		...props,
		id,
		piece: Object.freeze(piece),
		...(props.mechanics ? { mechanics: Object.freeze([...props.mechanics]) } : {}),
	}) as RepertoireDecl
}

// ── Pieces ──────────────────────────────────────────────────────────────────

const registry = new Map<string, RepertoireDecl>()
const compendia = new Map<string, ReadonlyMap<string, ReadonlySet<string>>>()
/** Each registered ruleset's time unit — what a held piece's duration is judged against at a write. */
const timeUnits = new Map<string, string | undefined>()

/**
 * Put a registered ruleset's repertoires, compendium row ids and time unit
 * where a write can reach them by address. Called by `rulesets.ts` only.
 * @internal
 */
export function _registerRulesetRepertoires(
	rulesetId: string,
	repertoires: readonly RepertoireDecl[],
	compendiumRows: ReadonlyMap<string, ReadonlySet<string>>,
	timeUnit?: string,
): void {
	for (const r of repertoires) registry.set(repertoireAddress(rulesetId, r.id), r)
	compendia.set(rulesetId, compendiumRows)
	timeUnits.set(rulesetId, timeUnit)
}

/** The time unit of the ruleset an address names, when it is registered. @internal */
export const _repertoireTimeUnit = (address: string): string | undefined => {
	const parsed = parseRepertoireAddress(address)
	return parsed ? timeUnits.get(parsed.ruleset) : undefined
}

/** @internal */
export function _clearRepertoires(): void {
	registry.clear()
	compendia.clear()
	timeUnits.clear()
}

/** 🚧 The repertoire at an address (`core:ruleset/freeform@1#things`), when a registered ruleset declares it. @experimental */
export const getRepertoire = (address: string): RepertoireDecl | undefined => registry.get(address)

const acceptedKeys = (rep: RepertoireDecl): Set<string> =>
	new Set([...Object.keys(rep.piece.fields ?? {}), ...(rep.retired ?? []), ...Object.keys(rep.renames ?? {})])

function propsComplaint(rep: RepertoireDecl, values: Record<string, unknown>, partial: boolean): string | null {
	const accepted = acceptedKeys(rep)
	const unknown = Object.keys(values).filter((k) => !accepted.has(k))
	if (unknown.length)
		return `'${rep.id}' pieces have no ${unknown.map((k) => `'${k}'`).join(', ')}; they have ${[...Object.keys(rep.piece.fields ?? {})].join(', ')}.`
	const fields = rep.piece.fields ?? {}
	const schema = partial
		? Object.fromEntries(Object.keys(values).filter((k) => fields[k]).map((k) => [k, { ...fields[k]!, required: false }]))
		: fields
	const bad = checkValues(schema, values).filter((f) => f.severity === 'error')
	return bad.length ? bad.map((f) => f.message).join('; ') + '.' : null
}

const countComplaint = (count: unknown): string | null =>
	count === undefined || (Number.isInteger(count) && (count as number) >= 1)
		? null
		: `a piece's count is a whole number of at least 1; '${String(count)}' is not one.`

/**
 * 🚧 Why this piece may not be held in this repertoire, or `null` if it may.
 * An inline piece is checked whole against the piece shape; a reference's
 * `overrides` are checked key by key. A compendium reference to a registered
 * ruleset must name a row it has in this repertoire; one to a ruleset that
 * is not installed is kept — its data parks, it is never refused for that.
 * With `ctx.timeUnit` (the ruleset's), a `duration` it cannot count is
 * refused too (`pieceDurationProblem`); a write through a slot passes it.
 * @experimental
 */
export function checkPiece(rep: RepertoireDecl, item: SlotPiece, ctx: { timeUnit?: string } = {}): string | null {
	const o = item as unknown as Record<string, unknown>
	const lasts = (props: Record<string, unknown> | undefined) => pieceDurationProblem(props?.duration, ctx.timeUnit)
	switch (item.kind) {
		case 'inline': {
			const { kind: _k, count, ...props } = o
			return countComplaint(count) ?? propsComplaint(rep, props, false) ?? lasts(props)
		}
		case 'lore': {
			const extra = Object.keys(o).filter((k) => !['kind', 'entryId', 'count', 'overrides', 'name', 'resolved'].includes(k))
			if (extra.length || !(Number.isInteger(item.entryId) && item.entryId > 0))
				return `a lore piece is { kind: 'lore', entryId, count?, overrides? }; '${JSON.stringify(item)}' is not one.`
			return countComplaint(item.count) ?? overridesComplaint(rep, item.overrides) ?? lasts(item.overrides as never)
		}
		case 'compendium': {
			const extra = Object.keys(o).filter(
				(k) => !['kind', 'compendiumId', 'pieceId', 'version', 'count', 'overrides', 'name', 'resolved'].includes(k),
			)
			if (
				extra.length ||
				typeof item.compendiumId !== 'string' ||
				!RULESET_ID_PATTERN.test(item.compendiumId) ||
				typeof item.pieceId !== 'string' ||
				!item.pieceId ||
				typeof item.version !== 'string' ||
				!item.version
			)
				return `a compendium piece is { kind: 'compendium', compendiumId: a ruleset id, pieceId, version, count?, overrides? }; '${JSON.stringify(item)}' is not one.`
			const rows = compendia.get(item.compendiumId)
			if (rows && !rows.get(rep.id)?.has(item.pieceId))
				return `${item.compendiumId}'s compendium has no '${item.pieceId}' among its '${rep.id}'.`
			return countComplaint(item.count) ?? overridesComplaint(rep, item.overrides) ?? lasts(item.overrides as never)
		}
		default:
			return `'${String((item as { kind?: unknown }).kind)}' is not a piece form; say 'inline', 'lore' or 'compendium'.`
	}
}

function overridesComplaint(rep: RepertoireDecl, overrides: unknown): string | null {
	if (overrides === undefined) return null
	if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides))
		return `a piece's overrides are a record of its fields; '${JSON.stringify(overrides)}' is not one.`
	return propsComplaint(rep, overrides as Record<string, unknown>, true)
}
