/**
 * Actions — what a person (or an AI-portrayed participant) can invoke, and
 * where (plans/29 R-15 *venue* · *audience* · *quick* · *slash name*;
 * 09-AMENDMENTS-B B9, F40 — was F38 before the 2026-09-17 renumbering; ruled
 * 2026-09-15, built 2026-09-16 as U5c).
 *
 * A spec contributes actions through `contributes.actions[]`. Core's own message verbs — the floors and the
 * built-ins of U5b — are described by the same shape in `CORE_ACTIONS`, so
 * a client renders **one list** per venue and never hand-writes a verb button.
 *
 * ## The four declarations
 *
 * - **venue** — where the action appears, *per channel*: `{ kind, channel? }`.
 *   `VENUE_KINDS` is a closed set core owns; a plugin picks from it. An
 *   action may name several venues. A venue with no `channel` appears on
 *   every channel of the session.
 * - **audience** — who may *see* and who may *act*, as participant
 *   references (`participants.ts`). Defaults per kind: a contributed action
 *   is seen by any `participant` and acted on by the `owner`
 *   (`DEFAULT_ACTION_AUDIENCE`); a core message verb is `item` — whoever the
 *   message belongs to, decided against the row at the venue.
 * - **quick** — the one prominence flag. Every venue is a **primary set**
 *   (`quick: true`) plus an **overflow** that always lists every enabled
 *   action; composer actions are always reachable through `/`. Placement is
 *   presentation; availability is data (F40). A CSS pack may reposition the
 *   primary set, never remove an action.
 * - **slash** — the stable ASCII id a composer action is called by. Core's
 *   specs claim bare names (`advance`, `narrate`); a plugin's are
 *   `<plugin>.<action>` (`acme.roll`), the plugin id being the spec's
 *   namespace — so a collision across owners is impossible by construction,
 *   and the palette autocompletes so nobody types the long form. Never
 *   localised (R-20): the palette shows the localised `label` beside it.
 *
 * - **enabled-when** (U5e, built 2026-09-17) — whether the action is offered
 *   *now*: a declared predicate over the session's **published values**, the
 *   junction clause's shape (`{ on: 'state.world.location', truthy: true,
 *   reason }`), never code. A list means all must hold. The genre supplies
 *   defaults per function (`GenreDecl.enabledWhen`); a session may override
 *   one function's; the action's own declaration sits between. The panel
 *   renders **why** a button is grey from the failing predicate's `reason`.
 *   The shape and its evaluator live in `predicates.ts`, shared with the
 *   junction clause.
 *
 * ## What this is not
 *
 * Not a *pipeline* — an action *starts* one (`function` is the key routing
 * resolves, 19 §3). Not an *event* — those are core-owned occurrences. Not
 * *availability* — the genre's `messageVerbs` and the preset's included set
 * decide that; a declaration here says where and to whom an available action
 * is offered.
 */

import type { Audience } from './participants.js'
import { isParticipantRef, PARTICIPANT_ROLES } from './participants.js'
import { DEFAULT_CHANNEL, parseChannel } from './channels.js'
import type { I18n, LocaleMap } from './descriptors.js'
import { envoyFindings, type EnvoyDecl } from './genres.js'
import {
	enabledWhenFindings,
	i18nFindings,
	isEnabledWhenShaped,
	normalizeEnabledWhen,
	type EnabledWhen,
	type EnabledWhenDecl,
} from './predicates.js'
import { i18nText } from './i18n.js'
import type { VerdictResult } from './verdicts.js'
import { CORE_ACTION_SPEC_ID } from './identity.js'
import { assertSlotId } from './attributes.js'

export type { EnabledWhen, EnabledWhenDecl } from './predicates.js'

/** The two sides of the effects line (R-15). `fiction` is the default. @experimental */
export const ACTION_EFFECTS = ['fiction', 'world'] as const
/** @experimental */
export type ActionEffects = (typeof ACTION_EFFECTS)[number]

/**
 * How much an action needs the text it **collects** (lair pass R3,
 * 2026-09-28): `required` — the press does not fire without some;
 * `optional` — an empty submit fires too, and `CollectedText.ifEmpty` says
 * what that does. Was `COMPOSER_TEXT_MODES` (B10), when the text was read
 * off the composer's draft.
 * @experimental
 */
export const TEXT_NEEDS = ['required', 'optional'] as const

/**
 * The text an action collects before it fires (lair pass R3, ruled
 * 2026-09-28: typing and then pressing an action is unintuitive). The press
 * opens the **collect modal**, or — S2 — a slash argument supplies it. It
 * reaches the run as `input.text`, trimmed.
 * @experimental
 */
export interface CollectedText {
	need: (typeof TEXT_NEEDS)[number]
	/** The field's label — what the modal asks: "What do you whisper?". Display text (R-20). */
	label: I18n
	/** The empty field's placeholder. Display text (R-20). */
	placeholder?: I18n
	/**
	 * What an empty submit does, in one sentence — "The room decides."
	 * **Required when `need` is `optional`**: an empty box must say what
	 * pressing on will do. Display text (R-20).
	 */
	ifEmpty?: I18n
}

/**
 * The cast members an action collects before it fires (lair pass R3; the
 * whisper's use is R10): a multiselect over the session's **enabled cast
 * members**, each a `character:<id>` reference. They reach the run as
 * `input.recipients`, validated by the host: seated and enabled, no
 * duplicates, within `min` and `max`.
 * @experimental
 */
export interface CollectedRecipients {
	/** The list's label — "Who hears it". Display text (R-20). */
	label: I18n
	/** The fewest that may be picked. Default 1; never below 1. */
	min?: number
	/** The most that may be picked. Absent: any number. */
	max?: number
	/**
	 * The per-cast slot this action writes on each recipient, replacing what
	 * it held (lair re-plan R10, 2026-09-28) — the Lair's Whisper names
	 * `core:slot/whisper@1`. The collect modal shows each member's current
	 * value beside their box, so an overwrite is visible before it happens.
	 * Display only: what the run writes is the spec's.
	 */
	overwrites?: string
}

/** The keys `ActionDecl.collects` may carry, and each request's own keys. */
const COLLECTS_KEYS: readonly string[] = ['text', 'recipients']
const COLLECTED_TEXT_KEYS: readonly string[] = ['need', 'label', 'placeholder', 'ifEmpty']
const COLLECTED_RECIPIENTS_KEYS: readonly string[] = ['label', 'min', 'max', 'overwrites']

/**
 * The venues a `world` action may appear in: never a form, the extra tab or a
 * widget.
 *
 * ⚠ **`message` is on the owner's side since 2026-09-28** (lair re-plan R11,
 * *File as a room*). The line exists so that a character can never be asked
 * to answer an out-of-fiction question (29 R-15 *The line*), and a question
 * put to someone lives in the **`form`** venue — split out of `message` the
 * day the line was built (U5d review, S1). The `message` venue is a message's
 * own ⋮ and quick row: a person's button, pressed by the person, on a row.
 * With `act` held to `owner` / `admin` (`WORLD_ACTION_ACTORS`), no block
 * naming it, and no fire made **as** a participant, a `world` action there
 * is the owner acting on a row — the same act as the composer's button,
 * with the row as its subject. `extra` and `widget` stay out: a widget can
 * invoke without a person's press.
 * @experimental
 */
export const WORLD_ACTION_VENUES: readonly VenueKind[] = ['composer', 'message', 'session-settings', 'admin', 'review']
/** The references a `world` action's `act` audience may name: the owner, an administrator. @experimental */
export const WORLD_ACTION_ACTORS: readonly string[] = ['owner', 'admin']

/** An action's side of the line: what it declared, else `fiction`. @experimental */
export const effectsOf = (action: { effects?: unknown }): ActionEffects =>
	action.effects === 'world' ? 'world' : 'fiction'

/**
 * The closed set of places an action may appear. Core owns it; a plugin picks.
 *
 * `form` (U5d review, S1) is the one venue nothing lists: an action carried
 * by a **form** — a `choices` or `form` block in a message — and pressed
 * only from that block (the Adventure genre's *Answer*). A `form`-venue
 * action never appears in a message's overflow, the composer's More menu or
 * any other listing (`LISTED_VENUE_KINDS`); the block's fire still resolves
 * it. A `world` action may not take it (`WORLD_ACTION_VENUES`): an
 * out-of-fiction effect is never a question a message carries.
 *
 * ⚠ **`form` stays fiction-only even after L1** (ruled 2026-09-17). A block
 * addressed to the **owner** may name a `world` action — see
 * `worldBlockFunctions` — but a *venue* is declared and an *addressee* is
 * decided at run time, so this check cannot see one and would have to admit
 * every `form`-venue world action to admit the owner's. The owner-addressed
 * block therefore names a `composer`-venue world action instead: the venue
 * says where the declaration may be OFFERED, the addressee says who may press
 * this particular button, and the two answers stay separate.
 * @experimental
 */
export const VENUE_KINDS = [
	'composer',
	'message',
	'extra',
	'widget',
	'session-settings',
	'pipelines',
	'admin',
	'review',
	'form',
] as const
/** @experimental */
export type VenueKind = (typeof VENUE_KINDS)[number]

/** The venues a listing offers — every kind but `form`, which only a block reaches. @experimental */
export const LISTED_VENUE_KINDS: readonly Exclude<VenueKind, 'form'>[] = VENUE_KINDS.filter(
	(k): k is Exclude<VenueKind, 'form'> => k !== 'form',
)
/** @experimental */
export type ListedVenueKind = (typeof LISTED_VENUE_KINDS)[number]

/** Where an action appears, optionally on one channel only. @experimental */
export interface Venue {
	kind: VenueKind
	/** A channel slug (20 §7). Absent = every channel of the session. */
	channel?: string
}

/**
 * A contributed action, as a spec declares it under `contributes.actions[]`.
 *
 * `key` is the action's own identity within the spec — what a widget's
 * `invoke(key)` names, what the *new* marker is kept against, and, joined to
 * the spec slug as `<spec>#<key>` (`ACTION_IDENTITY`), **the one key
 * everything routes and stores by** (plans/31 V2, ruled 2026-09-17): a
 * binding's subject, a preset's included set, a session's enablement row, a
 * genre's enabled-when default, the fire, a block's `action`. There is no
 * second routing key: two specs declaring the same `key` are two actions, and
 * a person binds each on its own.
 * @experimental
 */
export interface ActionDecl {
	key: string
	/**
	 * The genre this action serves — a genre id (24 §3). Required (U5c
	 * review, W5): an action is offered *to a genre*, and one naming none
	 * would be offered to nobody while still claiming a slash name — so it is
	 * refused at construction, in `validate()` and in `announce.build()`.
	 */
	genre: string
	venue: Venue | Venue[]
	audience?: Audience
	quick?: boolean
	/** The slash name. Composer actions without one are called by their `key`. */
	slash?: string
	/** What the control reads — a string or a locale map with `en` (R-20); never the slash name. */
	label: I18n
	/** A Lucide icon name, kebab-case. */
	icon?: string
	/**
	 * What the icon says when it stands alone — the accessible name of an
	 * icon-only control (`aria-label`). Display text (R-20). Absent: the
	 * `label`, which is right for nearly every action; give one only when the
	 * icon-only control should read differently from the named one. Needs an
	 * `icon`.
	 * @experimental
	 */
	iconAlt?: I18n
	/**
	 * What the action does, in one plain sentence — display text (R-20).
	 * **Required** (2026-09-28): the session's action legend lists every
	 * action with it, and a control shows it as its tooltip, so a person can
	 * learn what a button does before pressing it. Say the effect, not the
	 * mechanism: "Roll the dice and post the result."
	 * @experimental
	 */
	description: I18n
	/**
	 * When the action is offered (plans/29 R-15 *enabled-when*; U5e): a
	 * predicate — or a list, all of which must hold — over the session's
	 * published values, the junction clause's shape and never code. `on` is
	 * a dotted path such as `state.world.location`, `session.generating` or
	 * `item.hidden` (message venue) — not a port reference: actions live
	 * outside a run. `reason` says why the control is grey. Absent: the
	 * genre's default for this function, if it declares one, else always
	 * enabled. See `predicates.ts`.
	 */
	enabledWhen?: EnabledWhenDecl
	/**
	 * When the action is **present** at all (W-GATE D3, 2026-09-27): the
	 * turn controls' present-when (B8), on a contributed action. The same
	 * predicate grammar as `enabledWhen`, over the same published values,
	 * and the opposite answer when it fails — the action is **hidden**, not
	 * grey: left out of every listing and refused at the door when pressed
	 * from one. A press on a form (a block) is judged by that form instead,
	 * which is its own evidence the action has something to act on.
	 *
	 * For an action that is nonsense rather than merely unavailable without
	 * its referent — the Lair's *Answer the door* with no door knocked
	 * (`session.openForm.action`). An `item.*` predicate is refused: a
	 * listing has no row to judge it on. Absent: always present.
	 * @experimental
	 */
	presentWhen?: EnabledWhenDecl
	/**
	 * What the action's result touches — **the effects line** (plans/29
	 * R-15 *The line*; F41, was 09-B's F39; built 2026-09-17 as U5d).
	 *
	 * `fiction` (the default): the result stays inside the story — a
	 * message, a state proposal, a narration, a branch (a copy of a session
	 * is still the fiction). `world`: the result touches something outside
	 * it — character cards, lorebook data, settings, permissions,
	 * connections. A `world` action may appear only in the `composer`,
	 * `message` (a row's own ⋮, since lair re-plan R11), `session-settings`,
	 * `admin` or `review` venues (never `form`, `extra` or `widget`), its `act` audience is `owner` and/or `admin`
	 * only, no block may name it **unless that block is addressed to the
	 * owner** (`worldBlockFunctions`, `isOwnerAddressed`; L1, ruled
	 * 2026-09-17), and the form-answer pipeline refuses to answer it — so a
	 * character asking a question is fine, and a character granting another
	 * character permission is impossible by construction. Refused at
	 * construction, in `validate()`, in `announce.build()` and at the host's
	 * publish.
	 */
	effects?: ActionEffects
	/**
	 * The speaker this action's results post as (plans/29 R-18 (1), R-21
	 * (6); built 2026-09-16 as U5g) — a dice plugin's *Roll* reporting as
	 * "the Dice Master". Addressed as `envoy:<plugin>.<key>`
	 * (`envoyIdentity({ action: { specId } }, key)`), a cast member with
	 * `origin: action` once it has posted, and **`on-action` only**: it
	 * speaks through this action's outputs and is never a turn-taking
	 * candidate. `speaks` is stamped by `normalizeAction` and a declaration
	 * saying `in-turn` is refused.
	 */
	envoy?: EnvoyDecl
	/**
	 * What the action asks for before it fires (lair pass R3, 2026-09-28):
	 * `text` (`CollectedText`) and/or `recipients` (`CollectedRecipients`).
	 * Every press of a collecting action — a chip, the palette, a message's
	 * ⋮, a form's option — opens the **collect modal**; S2's slash argument
	 * supplies the text instead. What was collected reaches the run as
	 * `input.text` and `input.recipients`. Absent: the action collects
	 * nothing, and its run's `input.text` is empty. Any venue. Was
	 * `composerText`, when the text was read off the composer's draft.
	 * @experimental
	 */
	collects?: { text?: CollectedText; recipients?: CollectedRecipients }
}

/** A declaration after normalisation: venues and predicates always lists, no alias spellings, no `function`. @experimental */
export interface NormalizedAction extends ActionDecl {
	venue: Venue[]
	enabledWhen?: EnabledWhen[]
	presentWhen?: EnabledWhen[]
	envoy?: EnvoyDecl & { speaks: 'on-action' }
}

/** A contributed action's default audience: any member sees it, the owner acts. @internal */
export const DEFAULT_ACTION_AUDIENCE: Readonly<Audience> = Object.freeze({
	see: ['participant'],
	act: ['owner'],
} as Audience)

/** A core message verb's audience: whoever the message belongs to (the item rule). @experimental */
export const ITEM_AUDIENCE: Readonly<Audience> = Object.freeze({
	see: ['participant'],
	act: ['item'],
} as Audience)

/** A bare slash name — core's and its genres'. @experimental */
export const BARE_SLASH = /^[a-z][a-z0-9-]*$/
/** A plugin's slash name is `<plugin>.<action>`; the plugin id is the spec's namespace. @experimental */
export const NAMESPACED_SLASH = /^([a-z0-9]+(?:[.-][a-z0-9]+)*)\.([a-z][a-z0-9-]*)$/

/**
 * One venue's listing (F40 — every enabled action is reachable): the
 * **primary set**, the actions declaring `quick`, and the **overflow**, the
 * rest. Every action the venue holds is in exactly one of the two, so nothing
 * is reachable only by prominence and nothing is dropped. Placement is
 * presentation: a CSS pack may reposition the primary set and never remove an
 * entry. The host's `SessionActionVenues` is this shape with its entries
 * decorated (audience, the *new* mark, enablement).
 * @experimental
 */
export interface VenueListing<A> {
	primary: A[]
	overflow: A[]
}

/** Every listed venue's listing — `form` has none (`LISTED_VENUE_KINDS`). @experimental */
export type VenueListings<A> = Record<ListedVenueKind, VenueListing<A>>

/**
 * Place actions into their venues for one channel — the placement rule every
 * listing applies (F40; R-15 *quick*). `quick` → the primary set, else the
 * overflow; a venue naming another channel's slug is skipped (a bare slug
 * means every lane of it, 20 §7); a `form` venue is listed nowhere — the
 * block alone reaches it (U5d review, S1).
 *
 * Availability is decided BEFORE this: the genre's verbs, the preset's
 * included set and enabled-when say which actions a session offers, and the
 * host's `listSessionActions` decorates each. Pass the offered set and every
 * entry lands in each of its venues exactly once. Pure, so a host can build
 * the conformance kit's `listActions` seam on it — the SDK's own host does
 * — and the kit itself never calls it: C19 judges the listing the HOST
 * returns, entry by entry, and a rule the kit applied for the host would be
 * a rule it could not see the host break (U7 review, C1).
 * @experimental
 */
export function placeActions<A extends { venue: ReadonlyArray<Venue>; quick?: boolean }>(
	actions: ReadonlyArray<A>,
	channel: string = DEFAULT_CHANNEL,
): VenueListings<A> {
	const listings = {} as VenueListings<A>
	for (const k of LISTED_VENUE_KINDS) listings[k] = { primary: [], overflow: [] }
	const slug = parseChannel(channel).slug
	for (const a of actions)
		for (const v of a.venue) {
			if (v.channel !== undefined && parseChannel(v.channel).slug !== slug) continue
			const bucket = listings[v.kind as ListedVenueKind]
			if (!bucket) continue
			;(a.quick === true ? bucket.primary : bucket.overflow).push(a)
		}
	return listings
}

/** The namespace of a spec id — `core:spec/narrate` → `core`, `acme:spec/roll` → `acme`. @experimental */
export function specNamespace(specId: string): string {
	const i = specId.indexOf(':')
	return i === -1 ? '' : specId.slice(0, i)
}

/** Is this namespace core's — the one whose actions take bare slash names? @experimental */
export const isCoreNamespace = (ns: string): boolean => ns === 'core'

/**
 * The slash name an action is called by: the declared one, else derived from
 * the key by the same rule a declared name must obey — `key` for core,
 * `<plugin>.<key>` for a plugin. Always defined, so every composer action is
 * reachable by `/` (F40) whether or not its author named one.
 * @experimental
 */
export function slashNameOf(action: { key: string; slash?: string }, specId: string): string {
	if (action.slash) return action.slash
	const ns = specNamespace(specId)
	return isCoreNamespace(ns) || !ns ? action.key : `${ns}.${action.key}`
}

const KEY = /^[a-z][a-z0-9-]*$/

/**
 * The law one action finding comes from. Nearly every fault in a declaration
 * is its shape — a venue core does not offer, a slash name outside the
 * spec's namespace, a missing label — and is **R-15**'s. The two that are
 * not are **the effects line** (F41; U7 review, W3): a `world` action in a
 * venue where a character could be asked to press it, or one whose `act`
 * audience names someone other than the owner or an administrator. The
 * validator labels each finding with its law, so a kit can key on `F41`
 * rather than on a word in the sentence.
 * @experimental
 */
export interface ActionFinding {
	law: 'R-15' | 'F41'
	message: string
	/** What to do instead, where the law states one — an F41 finding quotes the verdict's fix. */
	fix?: string
}

/**
 * The declaration half of the effects line's input — a `world` action's
 * declared venue, or a reference its `act` audience names. The whole
 * input, with the write and fire halves, is `EffectsLineInput` in
 * `messageBlocks.ts`, where `core:verdict/effects-line` is declared.
 * @experimental
 */
export type EffectsLineDeclarationInput =
	| { kind: 'venue'; where: string; effects: unknown; venue: unknown }
	| { kind: 'actor'; where: string; effects: unknown; ref: unknown }

/** What a `world` action across the line is told to do instead — one fix for both halves of the declaration. */
const EFFECTS_LINE_FIX =
	`move the action to a venue on the owner's side of the line (${WORLD_ACTION_VENUES.join(', ')}) ` +
	`and keep audience.act to ${WORLD_ACTION_ACTORS.join(' and/or ')} — or declare effects: 'fiction' ` +
	`if its result stays inside the story`

/**
 * The effects line at a declaration (R-15 *The line*; F41): a `world` action
 * is owner-only and never in a form, extra or widget venue. Judged one venue or one
 * reference at a time, so the sentence names the venue or the reference
 * that crossed.
 *
 * This is the declaration half of `effectsLineVerdict`'s judge
 * (`messageBlocks.ts`), defined here because `actionFindingsByLaw` — the
 * construction and `validate()` door — sits below that module in the
 * import graph and must not import it. The verdict calls this for a
 * `venue` or `actor` input; the door calls it directly and quotes it.
 * @experimental
 */
export function worldActionCrossing(input: EffectsLineDeclarationInput): VerdictResult {
	if (input.effects !== 'world') return { ok: true }
	if (input.kind === 'venue') {
		const kind = input.venue
		if (typeof kind !== 'string' || WORLD_ACTION_VENUES.includes(kind as VenueKind)) return { ok: true }
		return {
			ok: false,
			sentence:
				`${input.where}: a 'world' action may not appear in the '${kind}' venue — its result ` +
				`reaches outside the fiction (cards, lore, settings, permissions), so it belongs ` +
				`in ${WORLD_ACTION_VENUES.join(', ')} and never where a character could be asked ` +
				`to answer it (the effects line, R-15)`,
			fix: EFFECTS_LINE_FIX,
		}
	}
	if (WORLD_ACTION_ACTORS.includes(String(input.ref))) return { ok: true }
	return {
		ok: false,
		sentence:
			`${input.where}: a 'world' action's audience.act names '${String(input.ref)}' — an ` +
			`out-of-fiction effect is the owner's (or an administrator's) to invoke, ` +
			`never a participant's or a character's (the effects line, R-15)`,
		fix: EFFECTS_LINE_FIX,
	}
}

/**
 * Every fault in one `ActionDecl.collects` (lair pass R3), as sentences: an
 * unknown key, a missing label, an `optional` text with no `ifEmpty`, a
 * `min` below 1 or a `max` below `min`. `where` is the field's address
 * (`contributes.actions[nudge].collects`).
 * @experimental
 */
export function collectsFindings(raw: unknown, where: string): string[] {
	const out: string[] = []
	const unknownKeys = (o: Record<string, unknown>, known: readonly string[], at: string) => {
		for (const k of Object.keys(o))
			if (!known.includes(k))
				out.push(`${at}: '${k}' is not something an action collects here — one of ${known.join(', ')}`)
	}
	if (!raw || typeof raw !== 'object' || Array.isArray(raw))
		return [`${where} is { text?, recipients? } — what the press asks for before it fires`]
	const c = raw as Record<string, unknown>
	unknownKeys(c, COLLECTS_KEYS, where)
	if (c.text !== undefined) {
		const at = `${where}.text`
		const t = c.text as Record<string, unknown> | null
		if (!t || typeof t !== 'object' || Array.isArray(t))
			out.push(`${at} is { need, label, placeholder?, ifEmpty? } — the text the modal asks for`)
		else {
			unknownKeys(t, COLLECTED_TEXT_KEYS, at)
			if (!(TEXT_NEEDS as readonly unknown[]).includes(t.need))
				out.push(
					`${at}.need is one of ${TEXT_NEEDS.join(', ')} — whether the press fires ` +
						`without any text`,
				)
			out.push(...i18nFindings(t.label, `${at}.label`, { required: true }))
			out.push(...i18nFindings(t.placeholder, `${at}.placeholder`))
			if (t.need === 'optional' && t.ifEmpty === undefined)
				out.push(
					`${at}.ifEmpty is required when need is 'optional' — one sentence saying what an ` +
						`empty submit does ('The room decides.')`,
				)
			else out.push(...i18nFindings(t.ifEmpty, `${at}.ifEmpty`))
		}
	}
	if (c.recipients !== undefined) {
		const at = `${where}.recipients`
		const r = c.recipients as Record<string, unknown> | null
		if (!r || typeof r !== 'object' || Array.isArray(r))
			out.push(`${at} is { label, min?, max?, overwrites? } — the cast members the modal asks for`)
		else {
			unknownKeys(r, COLLECTED_RECIPIENTS_KEYS, at)
			out.push(...i18nFindings(r.label, `${at}.label`, { required: true }))
			const count = (v: unknown) => typeof v === 'number' && Number.isInteger(v)
			if (r.min !== undefined && (!count(r.min) || (r.min as number) < 1))
				out.push(`${at}.min is a whole number, 1 or more — the fewest who may be picked`)
			if (r.max !== undefined) {
				const min = count(r.min) ? (r.min as number) : 1
				if (!count(r.max) || (r.max as number) < min)
					out.push(`${at}.max is a whole number no smaller than min (${min}) — the most who may be picked`)
			}
			if (r.overwrites !== undefined) {
				try {
					if (typeof r.overwrites !== 'string') throw new Error('not a string')
					assertSlotId(r.overwrites)
				} catch {
					out.push(
						`${at}.overwrites is a slot id ('core:slot/whisper@1') — the per-cast slot the action ` +
							`writes on each recipient`,
					)
				}
			}
		}
	}
	if (c.text === undefined && c.recipients === undefined && !out.length)
		out.push(`${where} collects nothing — declare text, recipients, or leave collects out`)
	return out
}

/**
 * Every fault in one action declaration, as sentences — the teaching-error
 * pattern (15 §1.3). Empty when the declaration is sound.
 *
 * `specId` decides which slash grammar applies: a `core:` spec may not claim a
 * dotted name and a plugin spec may not claim a bare one, or a name outside its
 * own namespace. That rule is the whole collision guarantee.
 * @experimental
 */
export function actionFindings(raw: unknown, specId: string, at = 'contributes.actions'): string[] {
	return actionFindingsByLaw(raw, specId, at).map((f) => f.message)
}

/** `actionFindings`, each sentence with the law it comes from (`ActionFinding`). @experimental */
export function actionFindingsByLaw(
	raw: unknown,
	specId: string,
	at = 'contributes.actions',
): ActionFinding[] {
	const out: ActionFinding[] = []
	/** A fault in the declaration's shape (R-15). */
	const shape = (...messages: string[]) => {
		for (const message of messages) out.push({ law: 'R-15', message })
	}
	/** A crossing of the effects line (F41) — the verdict's sentence and fix, quoted. */
	const line = (heard: VerdictResult) => {
		if (!heard.ok) out.push({ law: 'F41', message: i18nText(heard.sentence)!, fix: i18nText(heard.fix) })
	}
	if (!raw || typeof raw !== 'object')
		return [{ law: 'R-15', message: `${at}: an action is an object — got ${typeof raw}` }]
	const a = raw as Record<string, unknown>
	const where = `${at}[${typeof a.key === 'string' ? a.key : '?'}]`

	if (typeof a.key !== 'string' || !KEY.test(a.key))
		shape(`${where}: 'key' is required — a lowercase kebab token (${KEY.source})`)
	if (typeof a.genre !== 'string' || !a.genre)
		shape(
			`${where}: 'genre' is required — the genre id this action is offered to (24 §3), ` +
				`such as core:genre/chat`,
		)

	const venues = Array.isArray(a.venue) ? a.venue : a.venue === undefined ? [] : [a.venue]
	if (!venues.length) shape(`${where}: 'venue' is required — where the action appears (R-15)`)
	for (const v of venues) {
		if (!v || typeof v !== 'object') {
			shape(`${where}: a venue is { kind, channel? } — got ${typeof v}`)
			continue
		}
		const kind = (v as Record<string, unknown>).kind
		if (!(VENUE_KINDS as readonly unknown[]).includes(kind))
			shape(
				`${where}: venue kind '${String(kind)}' is not one core offers — ` +
					`one of ${VENUE_KINDS.join(', ')}`,
			)
		const channel = (v as Record<string, unknown>).channel
		if (channel !== undefined && (typeof channel !== 'string' || !channel))
			shape(`${where}: a venue's 'channel' is a channel slug`)
	}

	if (a.audience !== undefined) {
		const aud = a.audience as Record<string, unknown> | null
		if (!aud || typeof aud !== 'object') shape(`${where}: 'audience' is { see, act }`)
		else
			for (const half of ['see', 'act'] as const) {
				const refs = aud[half]
				if (!Array.isArray(refs))
					shape(`${where}: audience.${half} is a list of participant references`)
				else
					for (const r of refs)
						if (!isParticipantRef(r))
							shape(
								`${where}: audience.${half} names '${String(r)}', which is not a participant ` +
									`reference — one of ${PARTICIPANT_ROLES.join(', ')}, or user:<id>, ` +
									`character:<id>, envoy:<slug>`,
							)
			}
	}

	if (a.quick !== undefined && typeof a.quick !== 'boolean')
		shape(`${where}: 'quick' is a boolean — the one prominence flag`)

	// What the press collects (lair pass R3): text and/or recipients, each
	// labelled, in the collect modal. Any venue.
	if (a.collects !== undefined) shape(...collectsFindings(a.collects, `${where}.collects`))

	// The effects line (R-15, F41): a `world` action is owner-only and never
	// in a form, extra or widget venue (a row's ⋮ is the owner's, R11). Judged one declared venue and one `act` reference
	// at a time by `worldActionCrossing` — the declaration half of
	// `core:verdict/effects-line` — so the sentence names the venue or the
	// reference that crossed it. An unknown `effects` value is the
	// declaration's shape (R-15); a crossing is F41.
	if (a.effects !== undefined && !(ACTION_EFFECTS as readonly unknown[]).includes(a.effects))
		shape(
			`${where}: 'effects' is one of ${ACTION_EFFECTS.join(', ')} — what the result touches ` +
				`(the effects line, R-15)`,
		)
	for (const v of venues)
		line(
			worldActionCrossing({
				kind: 'venue',
				where,
				effects: a.effects,
				venue: (v as Record<string, unknown> | null)?.kind,
			}),
		)
	const act = (a.audience as { act?: unknown } | undefined)?.act
	if (Array.isArray(act))
		for (const r of act) line(worldActionCrossing({ kind: 'actor', where, effects: a.effects, ref: r }))

	shape(...i18nFindings(a.label, `${where}.label`, { required: true }))
	// The legend (2026-09-28): every action says what it does, so the
	// session's legend and the control's tooltip always have a sentence.
	if (a.description === undefined)
		shape(
			`${where}: 'description' is required — one plain sentence saying what the action does, ` +
				`shown in the session's action legend and as the control's tooltip ` +
				`({ en: 'Roll the dice and post the result.' })`,
		)
	else shape(...i18nFindings(a.description, `${where}.description`))
	if (a.iconAlt !== undefined) {
		shape(...i18nFindings(a.iconAlt, `${where}.iconAlt`))
		if (a.icon === undefined)
			shape(
				`${where}: 'iconAlt' needs an 'icon' — it is what the icon says when it stands alone; ` +
					`drop it, or declare the icon`,
			)
	}

	if (a.slash !== undefined) {
		if (typeof a.slash !== 'string') shape(`${where}: 'slash' is a string`)
		else shape(...slashFindings(a.slash, specId, where))
	}

	// The action's envoy (R-18): the same declaration a genre's carries, with
	// one rule of its own — `on-action` only. Judged as an action's, so a
	// `speaks: 'in-turn'` is a sentence here rather than a silent overwrite.
	if (a.envoy !== undefined) shape(...envoyFindings(a.envoy, `${where}.envoy`, 'action'))

	// Enabled-when (R-15, U5e): the junction rule over published values —
	// a path that is not a port reference, exactly one condition, a reason.
	shape(...enabledWhenFindings(a.enabledWhen, `${where}.enabledWhen`))
	// An `item.*` predicate is answered by the message a press is on: an
	// action with no venue that has one would be judged against nothing.
	const onMessage = venues.some((v) => {
		const kind = (v as Record<string, unknown> | null)?.kind
		return kind === 'message' || kind === 'form'
	})
	if (!onMessage)
		normalizeEnabledWhen(a.enabledWhen).forEach((p, i) => {
			if (p.on === 'item' || p.on.startsWith('item.'))
				shape(
					`${where}.enabledWhen[${i}]: reads '${p.on}', which only a press on a message can ` +
						`answer — add a { kind: 'message' } venue, or read a session value ` +
						`('state.world.…', 'session.generating') instead`,
				)
		})
	// Present-when (W-GATE D3): the same grammar, and never `item.*` — a
	// hidden action is hidden from a listing, which has no row to read.
	shape(...enabledWhenFindings(a.presentWhen, `${where}.presentWhen`))
	normalizeEnabledWhen(a.presentWhen).forEach((p, i) => {
		if (p.on === 'item' || p.on.startsWith('item.'))
			shape(
				`${where}.presentWhen[${i}]: reads '${p.on}' — whether an action is present is ` +
					`decided for a listing, which has no message to read; read a session value ` +
					`('state.world.…', 'session.openForm.action') instead, or grey it per row with ` +
					`enabledWhen`,
			)
	})
	return out
}

/** The slash-name grammar, applied to one name for one spec. @experimental */
export function slashFindings(slash: string, specId: string, where = 'slash'): string[] {
	const ns = specNamespace(specId)
	if (isCoreNamespace(ns)) {
		if (BARE_SLASH.test(slash)) return []
		return [
			NAMESPACED_SLASH.test(slash)
				? `${where}: a core spec may not claim the namespaced slash name '/${slash}' — ` +
					`core's actions take bare names (/${slash.slice(slash.lastIndexOf('.') + 1)})`
				: `${where}: '/${slash}' is not a slash name — lowercase, digits and hyphens, ` +
					`starting with a letter`,
		]
	}
	const m = NAMESPACED_SLASH.exec(slash)
	if (!m)
		return [
			BARE_SLASH.test(slash)
				? `${where}: a plugin spec may not claim the bare slash name '/${slash}' — ` +
					`third-party actions are '/<plugin>.<action>' (/${ns}.${slash}), so a ` +
					`collision with core's is impossible`
				: `${where}: '/${slash}' is not a slash name — '<plugin>.<action>', lowercase, ` +
					`digits and hyphens`,
		]
	if (m[1] !== ns)
		return [
			`${where}: '/${slash}' claims the namespace '${m[1]}' — a spec under '${ns}' ` +
				`names its actions '/${ns}.<action>'`,
		]
	return []
}

/**
 * The document form of one declaration: `venue` as a list. Returns a copy.
 * @experimental
 */
export function normalizeAction(raw: ActionDecl): NormalizedAction {
	const a = { ...(raw as unknown as Record<string, unknown>) }
	if (a.venue && !Array.isArray(a.venue)) a.venue = [a.venue]
	else if (!Array.isArray(a.venue)) a.venue = []
	// An action's envoy is `on-action` by construction (R-21 (6)): the
	// document form always says so, whether or not the author did.
	if (a.envoy && typeof a.envoy === 'object')
		a.envoy = { ...(a.envoy as Record<string, unknown>), speaks: 'on-action' }
	// Enabled-when in its list form (U5e), `reason` a locale map. Only when
	// it is a predicate or a list of them: anything else is left as written
	// for `actionFindings` to name.
	if (a.enabledWhen !== undefined && a.enabledWhen !== null) {
		const list = Array.isArray(a.enabledWhen) ? a.enabledWhen : [a.enabledWhen]
		if (list.every(isEnabledWhenShaped)) a.enabledWhen = normalizeEnabledWhen(a.enabledWhen)
	}
	if (a.presentWhen !== undefined && a.presentWhen !== null) {
		const list = Array.isArray(a.presentWhen) ? a.presentWhen : [a.presentWhen]
		if (list.every(isEnabledWhenShaped)) a.presentWhen = normalizeEnabledWhen(a.presentWhen)
	}
	return a as unknown as NormalizedAction
}

/**
 * `contributes` after normalisation: every action in its document form.
 * @experimental
 */
export function normalizeContributes<T extends { actions?: unknown[] }>(
	contributes: T | undefined,
): (Omit<T, 'actions'> & { actions?: NormalizedAction[] }) | undefined {
	if (!contributes) return contributes
	const { actions, ...rest } = contributes
	if (!actions?.length) return rest
	return { ...rest, actions: (actions as ActionDecl[]).map(normalizeAction) }
}

/**
 * Every action a document contributes, normalised, with the spec id each
 * came from. The one reader hosts use.
 * @experimental
 */
export function actionsOf(doc: {
	id: string
	contributes?: unknown
}): Array<NormalizedAction & { specId: string }> {
	const c = doc.contributes as { actions?: unknown[] } | undefined
	const normalized = normalizeContributes(c)
	return (normalized?.actions ?? []).map((a) => ({ ...(a as NormalizedAction), specId: doc.id }))
}

// The identity grammar lives in `identity.ts` (a leaf, so `genres.ts` can
// hold a default's key to it without a cycle); re-exported here where every
// reader of it has always found it.
export {
	ACTION_IDENTITY,
	ACTION_IDENTITY_MAX_LENGTH,
	CORE_ACTION_SPEC_ID,
	actionIdentity,
	isActionIdentity,
	parseActionIdentity,
} from './identity.js'

/**
 * A slash collision: two actions offered to one genre under one name. One
 * slash name means one action (plans/31 V2, ruled 2026-09-17): since the
 * identity `<spec>#<key>` is the only routing key, two specs claiming one
 * name are two actions a palette could not tell apart — a collision, not
 * alternatives. (Until V2 two specs sharing a *function* under one name were
 * alternatives a binding selected among; the function is gone, and so is the
 * exemption.) A plugin's names are namespaced (`acme.roll`), so a plugin
 * declaring the same `key` as a core verb is a different identity under a
 * different name, and never shadows it.
 *
 * Core's verbs hold their names first (U5c review, S1): every genre the list
 * touches is seeded with `CORE_ACTIONS` under `core`, so a core spec claiming
 * `/retry` collides with the verb rather than shadowing it in the palette. (A
 * plugin spec cannot claim a bare name at all — that is the grammar's job.)
 *
 * `slashCollisions` is the whole rule; `validate()` applies it inside one
 * document, `announce.build()` inside one package, and the host across every
 * published spec of an install (a boot-time refusal).
 * @experimental
 */
export function slashCollisions(
	actions: ReadonlyArray<NormalizedAction & { specId: string }>,
): string[] {
	const seen = new Map<string, { identity: string; specId: string; key: string; slash: string }>()
	const out: string[] = []
	for (const genre of new Set(actions.map((a) => a.genre ?? '')))
		for (const c of CORE_ACTIONS) {
			const slash = slashNameOf(c, CORE_ACTION_SPEC_ID)
			seen.set(`${genre}#${slash}`, {
				identity: `${CORE_ACTION_SPEC_ID}#${c.key}`,
				specId: CORE_ACTION_SPEC_ID,
				key: c.key,
				slash,
			})
		}
	for (const a of actions) {
		const slash = slashNameOf(a, a.specId)
		const identity = `${a.specId}#${a.key}`
		const key = `${a.genre ?? ''}#${slash}`
		const prior = seen.get(key)
		if (!prior) {
			seen.set(key, { identity, specId: a.specId, key: a.key, slash })
			continue
		}
		// The same declaration met twice (a document listed on two roads) is
		// one action, not two.
		if (prior.identity === identity) continue
		out.push(
			`'/${slash}' is claimed twice for genre '${a.genre ?? '(none)'}': by '${prior.specId}' ` +
				`for '${prior.key}' and by '${a.specId}' for '${a.key}' — one slash name ` +
				`means one action; rename one of them`,
		)
	}
	return out
}

/** Every finding on one document's contributed actions, sentences only. @internal */
export function actionDocumentFindings(doc: { id: string; contributes?: unknown }): string[] {
	return actionDocumentFindingsByLaw(doc).map((f) => f.message)
}

/**
 * `actionDocumentFindings` with the law each sentence comes from — what
 * `validate()` labels its findings by. A slash collision is R-15's.
 * @experimental
 */
export function actionDocumentFindingsByLaw(doc: {
	id: string
	contributes?: unknown
}): ActionFinding[] {
	const c = doc.contributes as { actions?: unknown[] } | undefined
	if (!c) return []
	const out: ActionFinding[] = []
	for (const entry of c.actions ?? []) {
		const a = normalizeAction(entry as ActionDecl)
		out.push(...actionFindingsByLaw(a, doc.id))
	}
	if (out.length) return out
	return slashCollisions(actionsOf(doc)).map((message) => ({ law: 'R-15' as const, message }))
}

/**
 * Who core's message verbs are for and where they live — the same shape a
 * contributed action has, so the client renders one list.
 *
 * Every entry is a **built-in** (U5b): its `key` is the verb the
 * message-verb handlers know (`sessionMessages:*`), never something
 * `sessions:fireAction` routes; its identity is `core#<key>`
 * (`CORE_ACTION_SPEC_ID`), which is what a genre's enabled-when default
 * and a session's override name it by (plans/31 V2). `retry` also lives in the
 * composer's *extra* venue (the turn controls), where it acts on the newest
 * reply. Availability is the genre's (`messageVerbs`): a host lists an entry
 * only when the genre offers it; the floors are always offered.
 *
 * Four entries are not message verbs but **turn controls**
 * (`TURN_CONTROLS`, lair pass B7 + B8, R2): **`advance`**, the composer's
 * Continue, which fires the turn order's head; **`pick`**, Pick who speaks;
 * and **`narrate`**, a narrator turn — all `sessions:fireTurn` — and
 * **`retake`**, Regenerate the last turn as a whole (`sessions:retakeTurn`).
 * They live at the extra venue only, their presence is the genre's
 * `turnControls`, and they act on no row. ⚠ `advance` is not `extend` — the prefill verb that
 * extends one reply (`core#extend`, labelled Extend; renamed from
 * `continue` 2026-09-28 so Continue means one press).
 */
/**
 * A core verb is declared without a `genre` (U5c review, S-E): it is offered
 * in **every** genre — availability is the genre's `messageVerbs`, and the
 * floors are not even that — so a genre on the declaration would name one
 * and lie about the rest. `Omit` rather than a cast, so a verb missing a
 * required field is a compile error here and not a runtime surprise in the
 * host's list.
 * @experimental
 */
export interface CoreActionDecl extends Omit<NormalizedAction, 'genre'> {
	/** stop · branch · edit — present in every genre. */
	floor: boolean
}

/**
 * The sentences beside a grey core verb, as locale maps — the `reason` of
 * each verb's enabled-when below (U5e). One vocabulary: the host's chips,
 * menus and palette read these through the verdict, and a refusal at the
 * door says the same words. The two conditions that are NOT published
 * values — an edit in progress, the audience — keep their sentences on the
 * client (`messageVerbState.ts`).
 * @internal
 */
export const CORE_VERB_REASONS = Object.freeze({
	generating: { en: 'wait for the reply to finish' },
	hidden: { en: 'unhide it first' },
	notNewest: { en: 'only the newest reply can be regenerated' },
	noSwipe: { en: 'nothing to swipe to' },
	greeting: { en: 'a greeting is swiped, not regenerated' },
	ownLine: { en: 'your own line is edited, not regenerated' },
	nobodySeated: { en: 'nobody is seated to pick' },
} as const satisfies Record<string, LocaleMap>)

/** Nothing in the session is generating — the busy rule every verb but stop shares. */
const NOT_GENERATING: EnabledWhen = {
	on: 'session.generating',
	equals: false,
	reason: CORE_VERB_REASONS.generating,
}
/** The row is the newest on its channel — retry, extend and swipe act on the newest reply only. */
const NEWEST: EnabledWhen = { on: 'item.isNewest', truthy: true, reason: CORE_VERB_REASONS.notNewest }
/**
 * The row is a reply — retry, extend and swipe write a reply over the row,
 * so on the author's own line (`role: 'user'`) they would overwrite what the
 * author wrote with the narrator's prose (F1, every persona-less genre). Keyed
 * on the role, never on a persona: a persona-less author line has none.
 */
const REPLY: EnabledWhen = { on: 'item.role', equals: 'assistant', reason: CORE_VERB_REASONS.ownLine }

/** @internal */
export const CORE_ACTIONS: ReadonlyArray<CoreActionDecl> = Object.freeze([
	{
		key: 'stop',
		venue: [{ kind: 'message' }],
		audience: { see: ['participant'], act: ['participant'] },
		quick: true,
		label: { en: 'Stop generating' },
		description: { en: 'Stop the reply being written now; what it wrote so far is kept.' },
		icon: 'square',
		floor: true,
	},
	{
		key: 'edit',
		venue: [{ kind: 'message' }],
		audience: ITEM_AUDIENCE,
		quick: true,
		label: { en: 'Edit' },
		description: { en: 'Change the text of this message.' },
		icon: 'pencil',
		enabledWhen: [
			{ on: 'item.hidden', equals: false, reason: CORE_VERB_REASONS.hidden },
			NOT_GENERATING,
		],
		floor: true,
	},
	{
		key: 'branch',
		venue: [{ kind: 'message' }],
		audience: { see: ['participant'], act: ['owner'] },
		label: { en: 'Branch from here' },
		description: { en: 'Start a copy of the session from this message, leaving this one as it is.' },
		icon: 'git-branch',
		enabledWhen: [NOT_GENERATING],
		floor: true,
	},
	{
		key: 'retry',
		venue: [{ kind: 'message' }, { kind: 'extra' }],
		audience: ITEM_AUDIENCE,
		quick: true,
		slash: 'retry',
		label: { en: 'Regenerate' },
		description: { en: 'Write the newest reply again, in place of the one there.' },
		icon: 'refresh-cw',
		enabledWhen: [
			NEWEST,
			REPLY,
			{ on: 'item.greeting', equals: false, reason: CORE_VERB_REASONS.greeting },
			{ on: 'item.hidden', equals: false, reason: CORE_VERB_REASONS.hidden },
			NOT_GENERATING,
		],
		floor: false,
	},
	{
		// The prefill extend: carry this reply on (ruling 2026-09-08; renamed
		// from `continue` 2026-09-28). A message verb only — the composer's
		// Continue is `advance` below.
		key: 'extend',
		venue: [{ kind: 'message' }],
		audience: ITEM_AUDIENCE,
		label: { en: 'Extend' },
		description: { en: 'Carry on writing this reply from where it stopped.' },
		icon: 'arrow-down',
		enabledWhen: [NEWEST, REPLY, NOT_GENERATING],
		floor: false,
	},
	{
		// The composer's Continue (lair pass B7): fire the turn order's head.
		// A turn control, not a message verb — no row, so no `item.*`
		// predicate; who may fire which entry is the fire's own rule.
		key: 'advance',
		venue: [{ kind: 'extra' }],
		audience: { see: ['participant'], act: ['participant'] },
		slash: 'advance',
		label: { en: 'Continue' },
		description: { en: 'Let whoever is next in the turn order speak.' },
		icon: 'message-square-more',
		enabledWhen: [NOT_GENERATING],
		floor: false,
	},
	{
		// Pick who speaks (lair pass B8): fire a character the person names.
		// A turn control — present where the genre's `turnControls.pick`
		// says it applies; greyed here while busy or with nobody to pick.
		key: 'pick',
		venue: [{ kind: 'extra' }],
		audience: { see: ['participant'], act: ['participant'] },
		// Not `/pick`: too plain a word to take from every plugin's palette.
		slash: 'pick-speaker',
		label: { en: 'Pick who speaks' },
		description: { en: 'Choose which character speaks next.' },
		icon: 'message-square-plus',
		enabledWhen: [
			NOT_GENERATING,
			{ on: 'state.who.active', truthy: true, reason: CORE_VERB_REASONS.nobodySeated },
		],
		floor: false,
	},
	{
		// The genre's own voice narrates (lair pass B8, D3; R8): fire it with
		// no new direction — Adventure's narrator, the Lair's Castellan (the
		// host stamps the fire `via: 'narrate'`). Opt-in — only a `voice:
		// 'narrator'` genre has one (`turnControls.narrate`). The owner's, as
		// a pick out of order is.
		key: 'narrate',
		venue: [{ kind: 'extra' }],
		audience: { see: ['participant'], act: ['owner'] },
		// Not `/narrate`: Chat's narrate spec claims that name, and one
		// slash name means one action (`slashCollisions`).
		slash: 'narrator',
		label: { en: 'Narrate' },
		// Voice-neutral (lair pass R8, 2026-09-28): whose voice narrates is
		// the genre's — Adventure's narrator, the Lair's Castellan.
		description: { en: 'Describe what happens next, with no new direction.' },
		icon: 'cloud-sun',
		enabledWhen: [NOT_GENERATING],
		floor: false,
	},
	{
		// Regenerate the last turn, as a whole (lair pass R2, owner
		// 2026-09-28): delete the newest turn's yield — every row its run
		// created, on every channel, never a person's own line — and take
		// the same turn again. Opt-in (`turnControls.retake`), for a genre
		// whose turn writes more than one row; where it is offered, `retry`
		// leaves the extra venue so one genre never shows two _Regenerate_
		// chips. The owner's: it deletes what everybody at the table saw.
		key: 'retake',
		venue: [{ kind: 'extra' }],
		audience: { see: ['participant'], act: ['owner'] },
		slash: 'retake',
		label: { en: 'Regenerate' },
		description: {
			en: "Delete the last turn's messages and take the same turn again. Your own lines stay.",
		},
		icon: 'refresh-cw',
		enabledWhen: [NOT_GENERATING],
		floor: false,
	},
	{
		key: 'swipe',
		venue: [{ kind: 'message' }],
		audience: ITEM_AUDIENCE,
		label: { en: 'Swipe' },
		description: { en: 'Step between the other versions of this reply.' },
		icon: 'chevrons-left-right',
		enabledWhen: [
			NEWEST,
			REPLY,
			{ on: 'item.hasSwipes', truthy: true, reason: CORE_VERB_REASONS.noSwipe },
			NOT_GENERATING,
		],
		floor: false,
	},
	{
		key: 'hide',
		venue: [{ kind: 'message' }],
		audience: ITEM_AUDIENCE,
		label: { en: 'Hide' },
		description: { en: 'Leave this message out of what the characters remember; it stays on the page.' },
		icon: 'ghost',
		enabledWhen: [NOT_GENERATING],
		floor: false,
	},
	{
		key: 'delete',
		venue: [{ kind: 'message' }],
		audience: ITEM_AUDIENCE,
		label: { en: 'Delete' },
		description: { en: 'Remove this message from the session.' },
		icon: 'trash-2',
		enabledWhen: [NOT_GENERATING],
		floor: false,
	},
] satisfies CoreActionDecl[])

/** The core action a verb is, or undefined for a verb core does not describe. @internal */
export const coreAction = (key: string): CoreActionDecl | undefined =>
	CORE_ACTIONS.find((a) => a.key === key)
