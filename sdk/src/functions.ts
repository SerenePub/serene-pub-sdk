/**
 * 🚧 **Function modules** — the small rules a ruleset is built from
 * (PLAN-rulesets-functions D1, D4; owner rulings 2026-10-22: "functions, not
 * packs", "all functions are scripts").
 *
 * A function module is a declarative **header** — its name, its meaning in
 * one sentence, its kind, the **function bindings** it needs (an attribute,
 * an entry type, a zone type, a scope, an owner — each resolved by tag, by
 * pick, or bound by the ruleset that uses it), what it adds, the prose the
 * model reads, an optional schema fragment for JSON replies, its options
 * form, the phases its handlers run at, the events it emits, and whether a
 * person may invoke it as an action — plus an optional **body** (script
 * source, run in the sandbox, with a handler per phase). A function with no
 * body is header-only: the model reads its prose and judges in words.
 *
 * A function never writes state (R8): its handlers return deltas, lines,
 * outcome words, emitted events and asks, and the pipeline's outlet applies
 * or proposes them under the registration's mode. A function never assumes
 * another; it declares what it needs.
 *
 * Declared once, versioned in its id (`core:function/die-target@1`) and
 * hashed like every registry here (`functionHash`); an identical
 * re-declaration is a no-op. A ruleset lists the functions it uses as
 * **function references** — `{ ref, key?, bindings?, options? }`, a
 * reference and a pin, never a copy (`FunctionRef`); editing a body forks it
 * into the ruleset (`forkFunction`, `forkedFrom`).
 *
 * Core's catalogue ships as function modules (lane A2). The ids core
 * reserves are named here (`CORE_FUNCTION_IDS`) so a ruleset may reference
 * them before the modules are registered: a reserved id resolves later.
 *
 * ⚠ A **function binding** is what a function needs and what a ruleset ties
 * it to — always "function binding" where it could stand alone (R3), never
 * the bare _binding_ (the cast-member ↔ card link, NOMENCLATURE §8). Not a
 * pipeline node either: a function runs inside the ruleset handler.
 * @experimental
 * @ruling PLAN-rulesets-functions D1, D4 (2026-10-23)
 */

import { i18nFindings, i18nText, type I18n } from './i18n.js'
import { declarationHash, refuseUnlessIdentical } from './hash.js'
import { checkSchema, checkValues, settingsSchemaFindings, type FieldType, type SettingsSchema } from './settings.js'
import { EVENT_ID, eventById, packageEventById } from './events.js'
import { finding, RulesetError } from './repertoires.js'
import type { CoreCheckMethodKind } from './checkMethods.js'
import type { SlotAppliesTo } from './attributes.js'
import {
	ATTRIBUTE_KINDS,
	attributeKindsInWords,
	NUMBER_ATTRIBUTE_KINDS,
	rulesetAttributeFindings,
	rulesetOutcomeFindings,
	zoneTypeFindings,
	type RulesetAttributeDecl,
	type RulesetAttributeKind,
	type RulesetOutcomeDecl,
	type ZoneTypeDecl,
} from './rulesetSections.js'

// ── Ids ─────────────────────────────────────────────────────────────────────

/** 🚧 `owner:function/name@N` — `core:function/die-target@1`. @experimental */
export type FunctionId = string

/** 🚧 The grammar of a function id: `owner:function/name@N`. @experimental */
export const FUNCTION_ID_PATTERN = /^[a-z0-9]+(?:[.-][a-z0-9]+)*:function\/[a-z0-9]+(?:-[a-z0-9]+)*@\d+$/

/** 🚧 Whether a value is a function id by its grammar — registered or not. @experimental */
export const isFunctionId = (id: unknown): id is FunctionId => typeof id === 'string' && FUNCTION_ID_PATTERN.test(id)

/** 🚧 A function id's parts: `core:function/die-target@1` → `{ owner: 'core', name: 'die-target', version: 1 }`. @experimental */
export function parseFunctionId(id: string): { owner: string; name: string; version: number } | undefined {
	if (!isFunctionId(id)) return undefined
	return {
		owner: id.slice(0, id.indexOf(':')),
		name: id.slice(id.indexOf('/') + 1, id.lastIndexOf('@')),
		version: Number(id.slice(id.lastIndexOf('@') + 1)),
	}
}

// ── Vocabulary ──────────────────────────────────────────────────────────────

/**
 * 🚧 The kinds core reads — the catalogue's groups: `value` (a number worked
 * out or kept), `deciding` (how a moment that could go either way is decided
 * — dice, cards, a spend, a comparison, judgement), `changing` (what moves a
 * value), `pieces` (entries made, given, spent), `zones` (entries moved
 * between zones), `scope` (who is in reach — returns members, never
 * changes), `asking` (asks people and waits), `time` (time and order),
 * `progression` (levels, experience, economy).
 * @experimental
 */
export const CORE_FUNCTION_KINDS = ['value', 'deciding', 'changing', 'pieces', 'zones', 'scope', 'asking', 'time', 'progression'] as const
/** @experimental */
export type CoreFunctionKind = (typeof CORE_FUNCTION_KINDS)[number]
/**
 * 🚧 A function's kind: one of core's, or a package's own, namespaced
 * `owner:name` — open, but never a bare word, so a typo refuses.
 * @experimental
 */
export type FunctionKind = CoreFunctionKind | `${string}:${string}`

/** 🚧 Whether a kind is a package's own (`owner:name`). @experimental */
export const isPackageFunctionKind = (kind: unknown): kind is `${string}:${string}` =>
	typeof kind === 'string' && /^[a-z0-9]+(?:[.-][a-z0-9]+)*:[a-z0-9]+(?:-[a-z0-9]+)*$/.test(kind)

/**
 * 🚧 The phases a function's handlers run at, in the handler's fixed order
 * (D3): `effects` (what a held piece or a standing rule does), `derived`
 * (worked-out values), `before` and `after` (around a decision — the old
 * `pre-roll` / `post-roll`), `render` (what the model reads).
 * @experimental
 */
export const FUNCTION_PHASES = ['effects', 'derived', 'before', 'after', 'render'] as const
/** @experimental */
export type FunctionPhase = (typeof FUNCTION_PHASES)[number]

/**
 * 🚧 What a function binding ties a function to: one of the ruleset's
 * attributes, entry types or zone types, a **scope** (who is in reach), or an
 * **owner** kind (`cast` · `world` · `location`).
 * @experimental
 */
export const FUNCTION_BINDING_TARGETS = ['attribute', 'entry-type', 'zone-type', 'scope', 'owner'] as const
/** @experimental */
export type FunctionBindingTarget = (typeof FUNCTION_BINDING_TARGETS)[number]

/**
 * 🚧 One function binding a function declares — a role it needs filled
 * (`what`, `whom`):
 *
 *  · `to` — what fills it (`FunctionBindingTarget`);
 *  · `tags` — resolved **by tag**: whatever the ruleset tags so (every
 *    attribute tagged `resource`);
 *  · `pick: true` — resolved **by pick**: chosen when the function is used
 *    or invoked (the attribute a check reads);
 *  · `many: true` — fills with several (a list);
 *  · 🚧 `kinds` — on an `attribute` role, the **attribute kinds** it takes
 *    (`ATTRIBUTE_KINDS`): a sum takes `['number', 'pool', 'tally']`, a word
 *    `['label', 'text']`. Left out, every kind. A ruleset that binds the
 *    role to an attribute of another kind is refused (`bad-binding-kind`),
 *    and the host never hands the handler a value of a kind the role does
 *    not take (RF fix 6, 2026-10-23);
 *  · `entryFields` — on an `attribute` role, an entry type's field may fill
 *    it too, by its **entry field selector** `<entry type>.<field>`
 *    (`bond.affection`): read per held entry — a tie's per side — never per
 *    owner (🚧 ties T3, 2026-10-23). `true` takes a number field (`number`,
 *    `integer`); 🚧 a list names the field types it takes, in the one
 *    field language's words (`['string', 'enum']`; RF fix 6);
 *  · `label` — the role's words in the editor's sentence ("restore ___").
 *
 * A role with neither `tags` nor `pick` is bound by the ruleset that uses
 * the function (`FunctionRef.bindings`) — refused there when left unbound
 * (`unbound-function-binding`).
 * @experimental
 */
export interface FunctionBindingDecl {
	to: FunctionBindingTarget
	tags?: readonly string[]
	pick?: true
	many?: true
	kinds?: readonly RulesetAttributeKind[]
	entryFields?: true | readonly FieldType[]
	label?: I18n
}

/**
 * 🚧 An **option role** (RF fix 8): an option that names something of the
 * ruleset's — a value it reads (`names: 'value'`, of `kinds`; left out,
 * every number kind) or one of its functions by key (`names: 'function'`).
 * @experimental
 */
export interface FunctionOptionRole {
	readonly names: 'value' | 'function'
	readonly kinds?: readonly RulesetAttributeKind[]
}

/**
 * 🚧 The field types an entry field may hold to fill a role — the one field
 * language's scalar words (`FieldType`). `entryFields: true` is the first two.
 * @experimental
 */
export const ENTRY_FIELD_BINDING_TYPES = ['number', 'integer', 'string', 'text', 'boolean', 'enum'] as const satisfies readonly FieldType[]

/**
 * 🚧 The attribute kinds an `attribute` role takes: its `kinds`, else every
 * kind (RF fix 6, 2026-10-23). Empty for a role tied to anything else.
 * @experimental
 */
export const functionBindingKinds = (b: Pick<FunctionBindingDecl, 'to' | 'kinds'> | undefined): readonly RulesetAttributeKind[] =>
	b?.to !== 'attribute' ? [] : Array.isArray(b.kinds) && b.kinds.length ? b.kinds : ATTRIBUTE_KINDS

/**
 * 🚧 The entry field types an `attribute` role takes (`entryFields`): `true`
 * is a number field (`number`, `integer`); a list is its own. Empty when no
 * entry field may fill it.
 * @experimental
 */
export const functionBindingFieldTypes = (b: Pick<FunctionBindingDecl, 'to' | 'entryFields'> | undefined): readonly FieldType[] =>
	b?.to !== 'attribute' || b.entryFields === undefined ? [] : b.entryFields === true ? ['number', 'integer'] : Array.isArray(b.entryFields) ? b.entryFields : []

/**
 * 🚧 An event a function adds — one it raises that is no core event:
 * `{ id: 'acme:event/confession-accepted@1', name }`. Emitted at the end of
 * the pipeline, after the receipt (D3).
 * @experimental
 */
export interface FunctionEventDecl {
	id: string
	name: I18n
	description?: I18n
}

/**
 * 🚧 What a function **adds** to a ruleset that uses it: attributes (a
 * worked-out value, a pool it spends), events it raises, verbs it answers
 * to, outcome words, zone types (a deck, a discard). Read by
 * `functionProvides` and `rulesetProvides`.
 * @experimental
 */
export interface FunctionAdds {
	attributes?: readonly RulesetAttributeDecl[]
	events?: readonly FunctionEventDecl[]
	verbs?: readonly string[]
	outcomes?: readonly RulesetOutcomeDecl[]
	zoneTypes?: readonly ZoneTypeDecl[]
}

/**
 * 🚧 A function a person may invoke as an **action** (D6): the button's
 * words and the form its answer is asked in (`jsonSchemaOf(fn, { part:
 * 'invokable' })`); absent `form`, the function's own options `form`.
 * @experimental
 */
export interface FunctionInvokable {
	label: I18n
	description?: I18n
	form?: SettingsSchema
}

/** 🚧 What `defineFunction` takes — the header, and an optional body. @experimental */
export interface FunctionProps {
	/** The name a person reads ("Restore a value"). */
	name: I18n
	/** What it does, in one sentence a person reads on its card. Display text. */
	meaning: I18n
	kind: FunctionKind
	/** The roles it needs filled, by role name (`what`, `whom`, `from`). */
	bindings?: Readonly<Record<string, FunctionBindingDecl>>
	adds?: FunctionAdds
	/**
	 * What the model reads when the function is present — one or two
	 * sentences, which may hold `{{role}}` holes its bindings fill
	 * ("{{what}} comes back each morning."). Model-facing: inside the hash.
	 * Required — a header-only function is judged from it.
	 */
	prose: string
	/** 🚧 The fields it adds to a JSON reply's changes (R7), in the one field language. */
	schema?: SettingsSchema
	/** Its options — what a ruleset that uses it sets (`FunctionRef.options`). */
	form?: SettingsSchema
	/**
	 * 🚧 Its **option roles** (RF fix 8 — RF fix 6 ★2/★3): the options in
	 * its `form` that name something of the ruleset's, typed like a role — a
	 * value it reads (`names: 'value'`: a way's `modifierOf`, a spend's
	 * `resource`, a check's `base`; an attribute of `kinds`, a number entry
	 * field, or a worked-out value's key — never a word or free text where it
	 * counts) or one of the ruleset's functions by key (`names: 'function'`:
	 * a check's `way`, an outcome's `check`). Judged where the ruleset is
	 * (`bad-binding-kind`, `unknown-way`); stored where they always were.
	 */
	optionRoles?: Readonly<Record<string, FunctionOptionRole>>
	/** The phases its body's handlers run at. Empty or absent: header-only. */
	phases?: readonly FunctionPhase[]
	/** The events it may raise — event ids (core's, a package's, or one it adds). */
	emits?: readonly string[]
	/** 🚧 A person may invoke it as an action (D6). */
	invokable?: FunctionInvokable
	/** The body: script source, a handler per phase (`effects`, `derived`, …), run in the sandbox. */
	body?: string
	/**
	 * ⏳ The body lives in a **seeded script row** by this seed key — the
	 * form a ruleset's scripts took before functions (`RulesetProps.scripts`,
	 * read as function modules by `rulesetSections`). New modules carry `body`.
	 */
	seedKey?: string
	/** 🚧 Its outcome depends on chance — dice or cards (a deciding function). */
	chance?: true
	/** 🚧 It throws dice — what lets an amount be a dice string. Implies `chance`. */
	rollsDice?: true
	/** 🚧 The function this one was forked from, by id (`forkFunction`). */
	forkedFrom?: FunctionId
}

/** 🚧 A declared function module: its props and its id. @experimental */
export interface FunctionDecl extends FunctionProps {
	readonly id: FunctionId
}

/** The most a function body may weigh — the sandbox's source cap. @experimental */
export const MAX_FUNCTION_BODY_BYTES = 256 * 1024

/** Display text outside `i18n`/`description`: the meaning and every label. */
const FUNCTION_DISPLAY_KEYS = { display: ['meaning', 'label'] } as const

/**
 * 🚧 A function module's content hash — what a ruleset may pin
 * (`FunctionRef.hash`) and what an identical re-declaration is judged by.
 * Display text (the meaning, labels, descriptions) is not content; the
 * prose the model reads is.
 * @experimental
 */
export const functionHash = (decl: FunctionDecl): string => declarationHash(decl, FUNCTION_DISPLAY_KEYS)

// ── Core's reserved ids ─────────────────────────────────────────────────────

/**
 * 🚧 The function ids core reserves (lane A2 ships the modules): a ruleset
 * may reference one before it is registered, and it resolves later
 * (`resolveFunctionRef` → `reserved`). Grouped as the catalogue is:
 *
 *  · deciding — `judge` (judged in words; header-only), `dieTarget`,
 *    `dicePool`, `cardDraw`, `compare`, `spend` (a bid), `table` (roll on a
 *    table);
 *  · scopes (D4) — `samePlace`, `withinTie`, `aimedAt`, `everyone`;
 *  · ⏳ what the aliases read the shapes before functions as
 *    (`rulesetSections`): `check` (a named check, decided by one of the
 *    ruleset's ways), `workedOut` (a derived selector), `tally` (a tally
 *    selector), `typedBonuses` (`conventions.bonuses`), `castingPool`
 *    (`conventions.casting`).
 * @experimental
 */
export const CORE_FUNCTION_IDS = Object.freeze({
	judge: 'core:function/judge@1',
	dieTarget: 'core:function/die-target@1',
	dicePool: 'core:function/dice-pool@1',
	cardDraw: 'core:function/card-draw@1',
	compare: 'core:function/compare@1',
	spend: 'core:function/spend@1',
	table: 'core:function/table@1',
	samePlace: 'core:function/same-place@1',
	withinTie: 'core:function/within-tie@1',
	aimedAt: 'core:function/aimed-at@1',
	everyone: 'core:function/everyone@1',
	check: 'core:function/check@1',
	workedOut: 'core:function/worked-out@1',
	tally: 'core:function/tally@1',
	typedBonuses: 'core:function/typed-bonuses@1',
	castingPool: 'core:function/casting-pool@1',
} as const)

/**
 * 🚧 What core says of a reserved id before its module is registered: its
 * kind, whether it **decides** by the rules (`rulesetDecides`; `judge` and
 * `check` do not — the first is judged in words, the second is decided by
 * the way it names), its chance, and the check method kind it is the
 * function of (`CHECK_METHOD_FUNCTIONS`).
 * @experimental
 */
export interface ReservedFunction {
	readonly kind: CoreFunctionKind
	readonly decides?: true
	readonly chance?: true
	readonly rollsDice?: true
	readonly methodKind?: CoreCheckMethodKind
}

const F = CORE_FUNCTION_IDS
/** 🚧 Core's reserved function ids and what each is, before it is registered. @experimental */
export const RESERVED_FUNCTIONS: Readonly<Record<string, ReservedFunction>> = Object.freeze({
	[F.judge]: Object.freeze({ kind: 'deciding', methodKind: 'none' }),
	[F.dieTarget]: Object.freeze({ kind: 'deciding', decides: true, chance: true, rollsDice: true, methodKind: 'die-target' }),
	[F.dicePool]: Object.freeze({ kind: 'deciding', decides: true, chance: true, rollsDice: true, methodKind: 'dice-pool' }),
	[F.cardDraw]: Object.freeze({ kind: 'deciding', decides: true, chance: true, methodKind: 'card-draw' }),
	[F.compare]: Object.freeze({ kind: 'deciding', decides: true, methodKind: 'compare' }),
	[F.spend]: Object.freeze({ kind: 'deciding', decides: true, methodKind: 'bid' }),
	[F.table]: Object.freeze({ kind: 'deciding', decides: true, chance: true, rollsDice: true }),
	[F.samePlace]: Object.freeze({ kind: 'scope' }),
	[F.withinTie]: Object.freeze({ kind: 'scope' }),
	[F.aimedAt]: Object.freeze({ kind: 'scope' }),
	[F.everyone]: Object.freeze({ kind: 'scope' }),
	[F.check]: Object.freeze({ kind: 'deciding' }),
	[F.workedOut]: Object.freeze({ kind: 'value' }),
	[F.tally]: Object.freeze({ kind: 'value' }),
	[F.typedBonuses]: Object.freeze({ kind: 'value' }),
	[F.castingPool]: Object.freeze({ kind: 'changing' }),
} satisfies Record<string, ReservedFunction>)

/** 🚧 Whether an id is one core reserves (`CORE_FUNCTION_IDS`). @experimental */
export const isReservedFunctionId = (id: unknown): boolean =>
	typeof id === 'string' && Object.prototype.hasOwnProperty.call(RESERVED_FUNCTIONS, id)

/**
 * 🚧 The deciding function each core check method kind is read as
 * (`die-target` → `core:function/die-target@1`, `bid` →
 * `core:function/spend@1`, `none` → `core:function/judge@1`) — what the
 * aliases write for `conventions.methods`, and read back
 * (`normaliseRuleset`).
 * @experimental
 */
export const CHECK_METHOD_FUNCTIONS: Readonly<Record<CoreCheckMethodKind, FunctionId>> = Object.freeze({
	'die-target': F.dieTarget,
	'dice-pool': F.dicePool,
	'card-draw': F.cardDraw,
	compare: F.compare,
	bid: F.spend,
	none: F.judge,
})

/** 🚧 The check method kind a function id is the function of, when it is one (`CHECK_METHOD_FUNCTIONS` read back). @experimental */
export const checkMethodKindOfFunction = (id: unknown): CoreCheckMethodKind | undefined =>
	typeof id === 'string' ? RESERVED_FUNCTIONS[id]?.methodKind : undefined

/** 🚧 Core's scope functions (D4), by name — what a `visibility` or a scope binding names. @experimental */
export const CORE_SCOPE_IDS = Object.freeze({
	samePlace: F.samePlace,
	withinTie: F.withinTie,
	aimedAt: F.aimedAt,
	everyone: F.everyone,
} as const)

// ── Visibility and scopes (D4) ──────────────────────────────────────────────

/**
 * 🚧 The three words a `visibility` may say instead of a scope: `holder`
 * (only who carries it — the owner of a zone, the holder of a value),
 * `gm` (the game master's steps alone), `everyone`.
 * @experimental
 */
export const VISIBILITY_WORDS = ['holder', 'gm', 'everyone'] as const
/** @experimental */
export type VisibilityWord = (typeof VISIBILITY_WORDS)[number]

/**
 * 🚧 Who sees a thing (D4): a visibility word, or a **scope** — the id of a
 * function of kind `scope` (core's `core:function/same-place@1`, a
 * package's, or one the ruleset carries). It belongs to where a thing sits:
 * an attribute's, a zone type's, an entry type's. An instance's owner may
 * still **expose** one (the instance's `exposed` flag); who may change it is
 * separate (`changedBy`).
 * @experimental
 */
export type Visibility = VisibilityWord | FunctionId

/** 🚧 Whether a value is a visibility word. @experimental */
export const isVisibilityWord = (v: unknown): v is VisibilityWord => (VISIBILITY_WORDS as readonly unknown[]).includes(v)

/** The owner kinds a function binding of `to: 'owner'` takes. */
const OWNER_KINDS: readonly SlotAppliesTo[] = ['cast', 'world', 'location']

/**
 * 🚧 Why a visibility is refused (`bad-visibility`): neither a visibility
 * word nor a scope — a function of kind `scope`, registered, reserved by
 * core, or among `own` (the modules a ruleset carries).
 * @internal
 */
export function visibilityFindings(v: unknown, at: string, own: ReadonlyMap<string, FunctionDecl> = new Map()): string[] {
	if (v === undefined || isVisibilityWord(v)) return []
	if (!isFunctionId(v))
		return [finding('bad-visibility', `${at} is '${String(v)}'. Say ${VISIBILITY_WORDS.map((w) => `'${w}'`).join(', ')}, or a scope — a function of kind 'scope' (${F.samePlace}).`)]
	const kind = functionKindOf(v, own)
	if (kind === undefined) return [finding('unknown-function', `${at} names '${v}', which no registered, reserved or carried function is.`)]
	if (kind !== 'scope') return [finding('bad-visibility', `${at} names '${v}', a '${kind}' function. Who sees a thing is a scope — a function of kind 'scope'.`)]
	return []
}

/** A function id's kind: carried, registered, else reserved by core. */
function functionKindOf(id: string, own: ReadonlyMap<string, FunctionDecl>): string | undefined {
	return own.get(id)?.kind ?? registry.get(id)?.kind ?? RESERVED_FUNCTIONS[id]?.kind
}

// ── Findings ────────────────────────────────────────────────────────────────

const ROLE_NAME = /^[a-z][a-zA-Z0-9]*(?:-[a-z0-9]+)*$/
const TAG_WORD = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const VERB_NAME = /^[a-z][a-zA-Z0-9]*(?:-[a-z0-9]+)*$/

/** A list of tag words — lowercase words joined by '-'. @internal */
export const tagListFindings = (tags: unknown, at: string): string[] =>
	tags === undefined
		? []
		: !Array.isArray(tags) || tags.some((t) => typeof t !== 'string' || !TAG_WORD.test(t)) || new Set(tags).size !== tags.length
			? [finding('bad-tags', `${at} is a list of distinct tags — lowercase words joined by '-' ('resource', 'relationship').`)]
			: []

/** A settings schema the one field language accepts: structure, then the schema check's errors. */
function schemaFindings(schema: unknown, at: string, reason: string): string[] {
	if (schema === undefined) return []
	const structural = settingsSchemaFindings(schema, at)
	if (structural.length) return structural.map((f) => finding(reason, f))
	const out: string[] = []
	for (const [k, d] of Object.entries(schema as Record<string, { type?: unknown }>))
		if (typeof d?.type !== 'string') out.push(finding(reason, `${at}.${k} has no type. A field says its type — { type: 'integer', label: 'Bonus' }.`))
	if (out.length) return out
	return checkSchema(schema as SettingsSchema)
		.filter((f) => f.severity === 'error')
		.map((f) => finding(reason, `${at}${f.field ? `.${f.field}` : ''}: ${f.message} — ${f.fix}`))
}

/**
 * 🚧 Every reason a function module is refused, each opened by its reason's
 * name: `bad-function-id` · `display-text` · `unknown-function-kind` ·
 * `reserved-kind` (a reserved core id declared as another kind) ·
 * `missing-prose` · `bad-function-binding` · `bad-phase` · `bad-schema` ·
 * `bad-form` · `bad-body` · `body-without-phases` · `phases-without-body` ·
 * `bad-emits` · `bad-invokable` · `bad-adds` (with the attribute, outcome
 * and zone type reasons inside) · `bad-tags` · `bad-chance` · `bad-fork`.
 * @experimental
 */
export function functionFindings(id: string, props: FunctionProps): string[] {
	const out: string[] = []
	const at = String(id)
	if (!isFunctionId(id)) out.push(finding('bad-function-id', `'${at}' is not a function id. Use 'owner:function/name@N' — 'core:function/die-target@1'.`))
	if (!props || typeof props !== 'object') return [...out, finding('bad-function', `${at} is { name, meaning, kind, prose, … }.`)]
	out.push(...i18nFindings(props.name, `${at} name`, { required: true }).map((f) => finding('display-text', f)))
	out.push(...i18nFindings(props.meaning, `${at} meaning`, { required: true }).map((f) => finding('display-text', f)))
	const kind = props.kind as unknown
	if (!(CORE_FUNCTION_KINDS as readonly unknown[]).includes(kind) && !isPackageFunctionKind(kind))
		out.push(finding('unknown-function-kind', `${at}.kind is '${String(kind)}'. Say one of ${CORE_FUNCTION_KINDS.join(', ')}, or a package's own as 'owner:name'.`))
	const reserved = RESERVED_FUNCTIONS[at]
	if (reserved && kind !== reserved.kind)
		out.push(finding('reserved-kind', `${at} is reserved by core as a '${reserved.kind}' function; it is declared as '${String(kind)}'.`))
	if (typeof props.prose !== 'string' || !props.prose.trim())
		out.push(finding('missing-prose', `${at} has no prose. Say in a sentence or two what the model reads when it is present — "{{what}} comes back each morning."`))
	const bindings = props.bindings
	if (bindings !== undefined) {
		if (!bindings || typeof bindings !== 'object' || Array.isArray(bindings))
			out.push(finding('bad-function-binding', `${at}.bindings is a map of roles — { what: { to: 'attribute', pick: true } }.`))
		else
			for (const [role, b] of Object.entries(bindings)) {
				const where = `${at}.bindings.${role}`
				if (!ROLE_NAME.test(role)) out.push(finding('bad-function-binding', `${where}: a role is named in lowercase words — 'what', 'whom'.`))
				if (!b || typeof b !== 'object') {
					out.push(finding('bad-function-binding', `${where} is { to, tags?, pick?, many?, kinds?, entryFields?, label? }.`))
					continue
				}
				if (!(FUNCTION_BINDING_TARGETS as readonly unknown[]).includes(b.to))
					out.push(finding('bad-function-binding', `${where}.to is '${String(b.to)}'. Say one of ${FUNCTION_BINDING_TARGETS.join(', ')}.`))
				out.push(...tagListFindings(b.tags, `${where}.tags`))
				for (const flag of ['pick', 'many'] as const)
					if (b[flag] !== undefined && b[flag] !== true) out.push(finding('bad-function-binding', `${where}.${flag} is true or left out.`))
				// 🚧 The attribute kinds a role takes (RF fix 6, 2026-10-23).
				if (b.kinds !== undefined) {
					const ks = b.kinds as unknown
					if (b.to !== 'attribute') out.push(finding('bad-function-binding', `${where}.kinds: only an attribute role takes attribute kinds.`))
					else if (!Array.isArray(ks) || !ks.length || ks.some((k) => !(ATTRIBUTE_KINDS as readonly unknown[]).includes(k)) || new Set(ks).size !== ks.length)
						out.push(finding('bad-function-binding', `${where}.kinds is a list of distinct attribute kinds, among ${ATTRIBUTE_KINDS.join(', ')} — or left out for every kind.`))
				}
				if (b.entryFields !== undefined) {
					const ef = b.entryFields as unknown
					if (b.to !== 'attribute') out.push(finding('bad-function-binding', `${where}.entryFields: only an attribute role may be filled by an entry type's field.`))
					else if (ef !== true && (!Array.isArray(ef) || !ef.length || ef.some((t) => !(ENTRY_FIELD_BINDING_TYPES as readonly unknown[]).includes(t)) || new Set(ef).size !== ef.length))
						out.push(finding('bad-function-binding', `${where}.entryFields is true (a number field), or a list of distinct field types among ${ENTRY_FIELD_BINDING_TYPES.join(', ')}.`))
				}
				out.push(...i18nFindings(b.label, `${where}.label`).map((f) => finding('display-text', f)))
				for (const k of Object.keys(b))
					if (!['to', 'tags', 'pick', 'many', 'kinds', 'entryFields', 'label'].includes(k))
						out.push(finding('bad-function-binding', `${where} says '${k}'. A function binding is { to, tags?, pick?, many?, kinds?, entryFields?, label? }.`))
			}
	}
	const phases = props.phases
	if (phases !== undefined && (!Array.isArray(phases) || phases.some((p) => !(FUNCTION_PHASES as readonly unknown[]).includes(p)) || new Set(phases).size !== phases.length))
		out.push(finding('bad-phase', `${at}.phases is a list of distinct phases, among ${FUNCTION_PHASES.join(', ')}.`))
	out.push(...schemaFindings(props.schema, `${at}.schema`, 'bad-schema'))
	out.push(...schemaFindings(props.form, `${at}.form`, 'bad-form'))
	// 🚧 Option roles (RF fix 8): each names an option its form has, and says what it names.
	if (props.optionRoles !== undefined) {
		if (!props.optionRoles || typeof props.optionRoles !== 'object' || Array.isArray(props.optionRoles))
			out.push(finding('bad-function-options', `${at}.optionRoles is a map of option → { names: 'value' | 'function', kinds? }.`))
		else
			for (const [k, r] of Object.entries(props.optionRoles)) {
				if (!props.form || !Object.prototype.hasOwnProperty.call(props.form, k))
					out.push(finding('bad-function-options', `${at}.optionRoles.${k}: its form has no option '${k}'.`))
				if (r?.names !== 'value' && r?.names !== 'function')
					out.push(finding('bad-function-options', `${at}.optionRoles.${k}.names is 'value' or 'function'.`))
				if (r?.kinds !== undefined && (r.names !== 'value' || !Array.isArray(r.kinds) || r.kinds.some((x) => !(ATTRIBUTE_KINDS as readonly unknown[]).includes(x))))
					out.push(finding('bad-function-options', `${at}.optionRoles.${k}.kinds: a value role's attribute kinds, among ${ATTRIBUTE_KINDS.join(', ')}.`))
			}
	}
	const hasBody = props.body !== undefined
	if (hasBody && (typeof props.body !== 'string' || !props.body.trim()))
		out.push(finding('bad-body', `${at}.body is the module's script source, or left out for a header-only function.`))
	else if (hasBody && props.body!.length > MAX_FUNCTION_BODY_BYTES)
		out.push(finding('bad-body', `${at}.body is ${props.body!.length} bytes; a function body is at most ${MAX_FUNCTION_BODY_BYTES}.`))
	if (props.seedKey !== undefined && (typeof props.seedKey !== 'string' || !props.seedKey))
		out.push(finding('bad-body', `${at}.seedKey names a seeded script row, or is left out.`))
	if (hasBody && props.seedKey !== undefined)
		out.push(finding('bad-body', `${at} says both body and seedKey. A module's body is its own source, or (⏳) a seeded row's — one of them.`))
	const scripted = hasBody || props.seedKey !== undefined
	const phaseCount = Array.isArray(phases) ? phases.length : 0
	if (scripted && !phaseCount) out.push(finding('body-without-phases', `${at} has a body and no phases. Say the phases its handlers run at — ${FUNCTION_PHASES.join(', ')}.`))
	if (!scripted && phaseCount) out.push(finding('phases-without-body', `${at} lists phases and has no body. A header-only function runs nothing; drop the phases or write the body.`))
	if (props.emits !== undefined && (!Array.isArray(props.emits) || props.emits.some((e) => typeof e !== 'string' || !EVENT_ID.test(e))))
		out.push(finding('bad-emits', `${at}.emits is a list of event ids — 'core:event/turn-ended@1', 'acme:event/confession-accepted@1'.`))
	const inv = props.invokable
	if (inv !== undefined) {
		if (!inv || typeof inv !== 'object') out.push(finding('bad-invokable', `${at}.invokable is { label, description?, form? }.`))
		else {
			out.push(...i18nFindings(inv.label, `${at}.invokable.label`, { required: true }).map((f) => finding('display-text', f)))
			out.push(...i18nFindings(inv.description, `${at}.invokable.description`).map((f) => finding('display-text', f)))
			out.push(...schemaFindings(inv.form, `${at}.invokable.form`, 'bad-invokable'))
		}
	}
	out.push(...addsFindings(props.adds, `${at}.adds`))
	for (const flag of ['chance', 'rollsDice'] as const)
		if (props[flag] !== undefined && props[flag] !== true) out.push(finding('bad-chance', `${at}.${flag} is true or left out.`))
	if (props.rollsDice === true && props.chance !== true) out.push(finding('bad-chance', `${at} rolls dice and does not say chance. Dice are chance — say chance: true too.`))
	if (props.forkedFrom !== undefined && !isFunctionId(props.forkedFrom))
		out.push(finding('bad-fork', `${at}.forkedFrom is the id of the function it was forked from — 'core:function/die-target@1'.`))
	return out
}

function addsFindings(adds: FunctionAdds | undefined, at: string): string[] {
	if (adds === undefined) return []
	if (!adds || typeof adds !== 'object' || Array.isArray(adds)) return [finding('bad-adds', `${at} is { attributes?, events?, verbs?, outcomes?, zoneTypes? }.`)]
	const out: string[] = []
	for (const k of Object.keys(adds))
		if (!['attributes', 'events', 'verbs', 'outcomes', 'zoneTypes'].includes(k))
			out.push(finding('bad-adds', `${at} says '${k}'. A function adds attributes, events, verbs, outcomes or zone types.`))
	const list = (v: unknown, k: string): readonly unknown[] => {
		if (v === undefined) return []
		if (!Array.isArray(v)) {
			out.push(finding('bad-adds', `${at}.${k} is a list.`))
			return []
		}
		return v
	}
	list(adds.attributes, 'attributes').forEach((a, i) => out.push(...rulesetAttributeFindings(a as RulesetAttributeDecl, `${at}.attributes[${i}]`)))
	list(adds.events, 'events').forEach((e, i) => {
		const ev = e as Partial<FunctionEventDecl>
		if (typeof ev?.id !== 'string' || !EVENT_ID.test(ev.id))
			out.push(finding('bad-adds', `${at}.events[${i}].id is an event id under the function's owner — 'acme:event/confession-accepted@1'.`))
		out.push(...i18nFindings(ev?.name, `${at}.events[${i}].name`, { required: true }).map((f) => finding('display-text', f)))
	})
	const verbs = list(adds.verbs, 'verbs')
	if (verbs.some((v) => typeof v !== 'string' || !VERB_NAME.test(v)))
		out.push(finding('bad-adds', `${at}.verbs is a list of verb names — 'change', 'reveal', 'move'.`))
	list(adds.outcomes, 'outcomes').forEach((o, i) => out.push(...rulesetOutcomeFindings(o as RulesetOutcomeDecl, `${at}.outcomes[${i}]`)))
	list(adds.zoneTypes, 'zoneTypes').forEach((z, i) => out.push(...zoneTypeFindings(z as ZoneTypeDecl, `${at}.zoneTypes[${i}]`)))
	return out
}

// ── The registry ────────────────────────────────────────────────────────────

const registry = new Map<FunctionId, FunctionDecl>()

const freezeDeep = <T>(v: T): T => {
	if (v && typeof v === 'object' && !Object.isFrozen(v)) {
		for (const x of Object.values(v as Record<string, unknown>)) freezeDeep(x)
		Object.freeze(v)
	}
	return v
}

function register(id: FunctionId, props: FunctionProps): FunctionDecl {
	const found = functionFindings(id, props)
	if (found.length) throw new RulesetError(String(id), found)
	const decl = freezeDeep({ ...JSON.parse(JSON.stringify(props)), id }) as FunctionDecl
	const existing = registry.get(id)
	if (existing) {
		refuseUnlessIdentical(existing, decl, `duplicate function id: ${id}`, FUNCTION_DISPLAY_KEYS)
		return existing
	}
	registry.set(id, decl)
	return decl
}

/**
 * 🚧 Declare a function module (core's, or a package's through
 * `definePluginFunction`). Refused on any finding (`RulesetError`). An
 * identical re-declaration is a no-op — a dev server's reload re-runs this —
 * and a different one under a claimed id throws with both hashes.
 * @experimental
 */
export function defineFunction(id: FunctionId, props: FunctionProps): FunctionDecl {
	return register(id, props)
}

/** 🚧 The package door: the same registration, minus core's namespace. @experimental */
export function definePluginFunction(pluginId: string, id: FunctionId, props: FunctionProps): FunctionDecl {
	if (typeof id === 'string' && id.startsWith('core:'))
		throw new Error(
			`plugin '${pluginId}' may not declare '${id}': the 'core:' namespace is reserved. Publish it under your own ` +
				`namespace — a function two parties can define is one whose rules depend on load order.`,
		)
	return register(id, props)
}

/** 🚧 A registered function module by id. @experimental */
export const getFunction = (id: FunctionId): FunctionDecl | undefined => registry.get(id)
/** 🚧 Every registered function module. @experimental */
export const functions = (): FunctionDecl[] => [...registry.values()]
/** 🚧 Forget a package's function (uninstall). Core's stay. @internal */
export function _withdrawFunction(id: FunctionId): boolean {
	if (typeof id !== 'string' || id.startsWith('core:')) return false
	return registry.delete(id)
}
/** @internal */
export function _clearFunctions(): void {
	registry.clear()
}

// ── References ──────────────────────────────────────────────────────────────

/** 🚧 What a function binding is tied to in a ruleset: one name, or several (`many`). @experimental */
export type FunctionBindingValue = string | readonly string[]

/**
 * 🚧 A **function reference** — one use of a function in a ruleset's
 * `functions` section: a reference and a pin, never a copy (D1).
 *
 *  · `ref` — the function's id, its version the pin (`core:function/die-target@1`);
 *  · `key` — the ruleset's own name for this use (`d20`, `skill.stealth`),
 *    what other parts name it by; absent, the function's name segment.
 *    Unique within the ruleset;
 *  · `bindings` — role → the attribute, entry type or zone type id(s), the
 *    scope, or the owner kind it is tied to;
 *  · `options` — values for the function's `form`;
 *  · `module` — the function itself, when the ruleset carries it (its own,
 *    or a fork — `forkedFrom`); then `ref` is the module's id;
 *  · `hash` — an optional content-hash pin (`functionHash`): a module whose
 *    content moved under the same version is refused (`function-hash-moved`).
 *
 * The first deciding function listed is the ruleset's default way to decide.
 * @experimental
 */
export interface FunctionRef {
	ref: FunctionId
	key?: string
	bindings?: Readonly<Record<string, FunctionBindingValue>>
	options?: Readonly<Record<string, unknown>>
	module?: FunctionDecl
	hash?: string
}

/**
 * 🚧 What a function reference resolves to: the module (`decl`) when it is
 * carried or registered; `reserved` when it is one of core's ids whose
 * module is not registered yet (it resolves later); neither when it names
 * nothing (`findings` says so).
 * @experimental
 */
export interface ResolvedFunctionRef {
	readonly ref: FunctionRef
	readonly key: string
	readonly decl?: FunctionDecl
	readonly reserved?: ReservedFunction
	readonly findings: readonly string[]
}

/** 🚧 The key a reference is named by: its own, else the function's name segment. @experimental */
export const functionRefKey = (ref: Pick<FunctionRef, 'ref' | 'key'>): string =>
	typeof ref?.key === 'string' && ref.key ? ref.key : (parseFunctionId(String(ref?.ref))?.name ?? String(ref?.ref))

/**
 * 🚧 Resolve one reference: the module it carries, else the registry's,
 * else a reserved core id (resolved later). Findings: `bad-function-ref`,
 * `unknown-function`, `module-not-ref` (a carried module under another id),
 * `function-hash-moved`.
 * @experimental
 */
export function resolveFunctionRef(ref: FunctionRef): ResolvedFunctionRef {
	const key = functionRefKey(ref)
	if (!ref || typeof ref !== 'object' || !isFunctionId(ref.ref))
		return { ref, key, findings: [finding('bad-function-ref', `A function reference is { ref: 'owner:function/name@N', key?, bindings?, options? } — '${String(ref?.ref)}' is no function id.`)] }
	const out: string[] = []
	if (ref.module !== undefined && ref.module?.id !== ref.ref)
		out.push(finding('module-not-ref', `The function carried under '${key}' is '${String(ref.module?.id)}', and the reference names '${ref.ref}'. A carried module is referenced by its own id.`))
	const decl = ref.module ?? registry.get(ref.ref)
	const reserved = decl ? undefined : RESERVED_FUNCTIONS[ref.ref]
	if (!decl && !reserved) out.push(finding('unknown-function', `'${ref.ref}' is no registered function, none core reserves, and the ruleset carries no module of it.`))
	if (decl && ref.hash !== undefined && functionHash(decl) !== ref.hash)
		out.push(finding('function-hash-moved', `'${ref.ref}' was pinned at ${ref.hash}; it hashes ${functionHash(decl)} now. Re-pin it, or keep the version you pinned.`))
	return { ref, key, ...(decl ? { decl } : {}), ...(reserved ? { reserved } : {}), findings: out }
}

/**
 * 🚧 The kind of the function a reference names — its module's, else the
 * reserved id's — or `undefined` when it names nothing.
 * @experimental
 */
export const functionRefKind = (ref: FunctionRef): string | undefined =>
	ref?.module?.kind ?? (typeof ref?.ref === 'string' ? (registry.get(ref.ref)?.kind ?? RESERVED_FUNCTIONS[ref.ref]?.kind) : undefined)

/** A body that exports a `decide` handler — `export function decide(…)`, `export const decide`, or `export { decide }`. */
const DECIDE_EXPORT = /\bexport\s+(?:async\s+)?function\s*\*?\s*decide\s*\(|\bexport\s+(?:const|let|var)\s+decide\b|\bexport\s*\{[^}]*\bdecide\b[^}]*\}/

/**
 * 🚧 Whether a function body exports a `decide` handler — what makes a
 * deciding function a **way** by itself (2026-10-23).
 * @experimental
 */
export const functionExportsDecide = (body: unknown): boolean => typeof body === 'string' && DECIDE_EXPORT.test(body)

/**
 * 🚧 Whether a reference **decides** by the rules: a reserved deciding
 * resolver (`judge` and `check` do not — judged in words; decided by the way
 * it names), or a registered or carried function of kind `deciding` that is
 * a **way**: its body exports `decide`, or a check names it as its way
 * (`ways`, the keys the ruleset's checks name under `options.way`) and it
 * has a body (or ⏳ a seeded one) or chance. A deciding function that only
 * shapes a decision (an edge, margins, natural faces) decides nothing by
 * itself; a header-only one is judged in words.
 * @experimental
 */
export function functionRefDecides(ref: FunctionRef, ways?: ReadonlySet<string>): boolean {
	const decl = ref?.module ?? (typeof ref?.ref === 'string' ? registry.get(ref.ref) : undefined)
	if (decl) {
		if (decl.kind !== 'deciding') return false
		if (functionExportsDecide(decl.body)) return true
		return ways?.has(functionRefKey(ref)) === true && (decl.body !== undefined || decl.seedKey !== undefined || decl.chance === true)
	}
	return RESERVED_FUNCTIONS[String(ref?.ref)]?.decides === true
}

/**
 * 🚧 The keys a ruleset's checks name as their way (`options.way` on a
 * `core:function/check@1` reference) — the `ways` `functionRefDecides` reads.
 * @experimental
 */
export function functionWayKeys(functions: readonly FunctionRef[] | undefined): ReadonlySet<string> {
	const out = new Set<string>()
	for (const f of functions ?? []) {
		const way = f?.ref === CORE_FUNCTION_IDS.check ? (f.options as { way?: unknown } | undefined)?.way : undefined
		if (typeof way === 'string' && way) out.add(way)
	}
	return out
}

/**
 * 🚧 The context a ruleset's function references are checked in: the ids of
 * its attributes, entry types and zone types, the modules it carries, and
 * every event id its functions add.
 * @internal
 */
export interface FunctionRefContext {
	readonly attributes: ReadonlySet<string>
	readonly entryTypes: ReadonlySet<string>
	/** 🚧 Every entry field selector the ruleset's entry types give (`bond.affection`) — what an `entryFields` role may name. */
	readonly entryFields?: ReadonlySet<string>
	/**
	 * 🚧 The kinds each attribute may be read as, by id (RF fix 6): its own
	 * `kind`, or what its slot's type allows. An attribute not here is not
	 * judged by kind.
	 */
	readonly attributeKinds?: ReadonlyMap<string, readonly RulesetAttributeKind[]>
	/** 🚧 Every entry field selector's field type (`bond.affection` → `integer`; RF fix 6). */
	readonly entryFieldTypes?: ReadonlyMap<string, string>
	readonly zoneTypes: ReadonlySet<string>
	readonly modules: ReadonlyMap<string, FunctionDecl>
	readonly events: ReadonlySet<string>
	/** 🚧 Every function key the ruleset's uses have (RF fix 8): what a `names: 'function'` option role may name. */
	readonly functionKeys?: ReadonlySet<string>
}

/**
 * 🚧 Every reason one function reference in a ruleset is refused:
 * `resolveFunctionRef`'s, the carried module's own (`functionFindings`),
 * then — when the function resolves — `unknown-function-binding` (a role it
 * does not declare), `unbound-function-binding` (a role with neither tags
 * nor pick, left unbound), `bad-function-binding` (bound to nothing the
 * ruleset has: an attribute, entry type or zone type id, a scope, an owner
 * kind), 🚧 `bad-binding-kind` (an attribute, or an entry's field, of a kind
 * the role does not take — RF fix 6; 🚧 an option role's value too, RF fix
 * 8), 🚧 `unknown-way` (an option role naming none of the ruleset's
 * functions — a check's `way`, an outcome's `check`; RF fix 8),
 * `bad-function-options` (against its `form`), `unknown-event` (it emits an
 * event no one declares).
 * @internal
 */
export function functionRefFindings(ref: FunctionRef, at: string, ctx: FunctionRefContext): string[] {
	const r = resolveFunctionRef(ref)
	const out = r.findings.map((f) => f.replace('] ', `] ${at}: `))
	if (ref?.module !== undefined) out.push(...functionFindings(ref.module.id, ref.module))
	if (ref?.bindings !== undefined && (!ref.bindings || typeof ref.bindings !== 'object' || Array.isArray(ref.bindings)))
		out.push(finding('bad-function-binding', `${at}.bindings is a map of role → what it is tied to.`))
	if (ref?.options !== undefined && (!ref.options || typeof ref.options !== 'object' || Array.isArray(ref.options)))
		out.push(finding('bad-function-options', `${at}.options is a map of option values.`))
	const decl = r.decl
	if (!decl) return out
	const declared = decl.bindings ?? {}
	const bound = (ref.bindings && typeof ref.bindings === 'object' ? ref.bindings : {}) as Record<string, FunctionBindingValue>
	for (const role of Object.keys(bound))
		if (!Object.prototype.hasOwnProperty.call(declared, role))
			out.push(finding('unknown-function-binding', `${at}.bindings.${role}: ${decl.id} declares no role '${role}' (${Object.keys(declared).join(', ') || 'none'}).`))
	for (const [role, b] of Object.entries(declared)) {
		const v = bound[role]
		if (v === undefined) {
			if (!b.tags?.length && b.pick !== true)
				out.push(finding('unbound-function-binding', `${at}: ${decl.id} needs '${role}' (${b.to}) bound — it is resolved by no tag and no pick.`))
			continue
		}
		const values = typeof v === 'string' ? [v] : Array.isArray(v) ? v : null
		if (!values || !values.length || values.some((x) => typeof x !== 'string')) {
			out.push(finding('bad-function-binding', `${at}.bindings.${role} names what it is tied to — one id, or a list of them.`))
			continue
		}
		if (values.length > 1 && b.many !== true)
			out.push(finding('bad-function-binding', `${at}.bindings.${role} names ${values.length}; ${decl.id}'s '${role}' takes one (it does not say many).`))
		const kinds = functionBindingKinds(b)
		const fieldTypes = functionBindingFieldTypes(b)
		// 🚧 Whose role it is, in words, for a sentence that names it (RF fix 6).
		const roleWords = `${i18nText(decl.name) ?? decl.id}'s '${i18nText(b.label) ?? role}'`
		/** Why an attribute role refuses `x`: none of the ruleset's, or a kind (a field type) the role does not take. */
		const attributeWhy = (x: string): string | null => {
			if (ctx.attributes.has(x)) {
				const has = ctx.attributeKinds?.get(x)
				return !has?.length || has.some((k) => kinds.includes(k))
					? null
					: finding('bad-binding-kind', `${at}.bindings.${role}: ${roleWords} takes ${attributeKindsInWords(kinds)}; '${x}' is ${attributeKindsInWords(has)}.`)
			}
			const fieldType = ctx.entryFieldTypes?.get(x) ?? (ctx.entryFields?.has(x) ? 'number' : undefined)
			if (fieldTypes.length && fieldType !== undefined)
				return fieldTypes.includes(fieldType as FieldType)
					? null
					: finding('bad-binding-kind', `${at}.bindings.${role}: ${roleWords} takes ${attributeKindsInWords(kinds)}, or an entry's ${fieldTypes.join(' or ')} field; '${x}' is a ${fieldType} field.`)
			return fieldTypes.length
				? `'${x}' is none of the ruleset's attributes, and no entry type's ${fieldTypes.join(' or ')} field ('<entry type>.<field>')`
				: `'${x}' is none of the ruleset's attributes`
		}
		for (const x of values) {
			const why =
				b.to === 'attribute'
					? attributeWhy(x)
					: b.to === 'entry-type'
						? ctx.entryTypes.has(x) ? null : `'${x}' is none of the ruleset's entry types`
						: b.to === 'zone-type'
							? ctx.zoneTypes.has(x) ? null : `'${x}' is none of the ruleset's zone types`
							: b.to === 'owner'
								? (OWNER_KINDS as readonly string[]).includes(x) ? null : `'${x}' is no owner kind (${OWNER_KINDS.join(', ')})`
								: visibilityFindings(x, `${at}.bindings.${role}`, ctx.modules)[0] ?? null
			if (why) out.push(why.startsWith('[') ? why : finding('bad-function-binding', `${at}.bindings.${role}: ${why}.`))
		}
	}
	if (decl.form && ref.options && typeof ref.options === 'object' && !Array.isArray(ref.options)) {
		for (const k of Object.keys(ref.options))
			if (!Object.prototype.hasOwnProperty.call(decl.form, k))
				out.push(finding('bad-function-options', `${at}.options.${k}: ${decl.id} takes ${Object.keys(decl.form).join(', ') || 'no options'}.`))
		const known = Object.fromEntries(Object.entries(ref.options).filter(([k]) => Object.prototype.hasOwnProperty.call(decl.form!, k)))
		for (const f of checkValues(decl.form, known as Record<string, unknown>))
			if (f.severity === 'error') out.push(finding('bad-function-options', `${at}.options: ${f.message} — ${f.fix}`))
	}
	// 🚧 Option roles (RF fix 8 — RF fix 6 ★2/★3): an option naming a value
	// never names a word or free text where it is counted; one naming a
	// function names one of this ruleset's (a pasted Document can carry one
	// that names nothing).
	for (const [k, role] of Object.entries(decl.optionRoles ?? {})) {
		const v = ref.options && typeof ref.options === 'object' ? (ref.options as Record<string, unknown>)[k] : undefined
		if (typeof v !== 'string' || !v) continue
		const optionWords = `${i18nText(decl.name) ?? decl.id}'s '${i18nText((decl.form?.[k] as { label?: I18n } | undefined)?.label) ?? k}'`
		if (role.names === 'function') {
			if (ctx.functionKeys && !ctx.functionKeys.has(v))
				out.push(finding('unknown-way', `${at}.options.${k}: ${optionWords} names '${v}', which is none of the ruleset's functions${ctx.functionKeys.size ? ` (${[...ctx.functionKeys].slice(0, 8).join(', ')}${ctx.functionKeys.size > 8 ? ', …' : ''})` : ''}.`))
			continue
		}
		const kinds = role.kinds?.length ? role.kinds : NUMBER_ATTRIBUTE_KINDS
		const has = ctx.attributes.has(v) ? ctx.attributeKinds?.get(v) : undefined
		if (has?.length && !has.some((x) => kinds.includes(x)))
			out.push(finding('bad-binding-kind', `${at}.options.${k}: ${optionWords} takes ${attributeKindsInWords(kinds)}; '${v}' is ${attributeKindsInWords(has)}.`))
		const fieldType = ctx.entryFieldTypes?.get(v)
		if (fieldType !== undefined && fieldType !== 'number' && fieldType !== 'integer')
			out.push(finding('bad-binding-kind', `${at}.options.${k}: ${optionWords} takes ${attributeKindsInWords(kinds)}, or an entry's number field; '${v}' is a ${fieldType} field.`))
	}
	for (const e of decl.emits ?? [])
		if (!ctx.events.has(e) && !knownEvent(e)) out.push(finding('unknown-event', `${at}: ${decl.id} emits '${e}', which no core event, package event or function of this ruleset declares.`))
	return out
}

/** A core or package event, read at call time — a package's count once declared. */
const knownEvent = (id: string): boolean => eventById(id) !== undefined || packageEventById(id) !== undefined

// ── Forks, what a function provides ─────────────────────────────────────────

/**
 * 🚧 Fork a function into a ruleset — what editing a body does (D1): a copy
 * under the ruleset's owner (`<owner>:function/<ruleset>-<name>@1`, or `id`),
 * marked `forkedFrom` the original. Carry it in the ruleset as a reference
 * with `module` (`{ ref: fork.id, module: fork }`). Pure: nothing registers.
 * @experimental
 */
export function forkFunction(decl: FunctionDecl, into: string, opts: { id?: FunctionId } = {}): FunctionDecl {
	const m = /^([a-z0-9]+(?:[.-][a-z0-9]+)*):ruleset\/([a-z0-9]+(?:-[a-z0-9]+)*)@\d+$/.exec(String(into))
	if (!m && opts.id === undefined) throw new Error(`'${String(into)}' is not a ruleset id. Fork a function into 'owner:ruleset/name@N'.`)
	const name = parseFunctionId(decl.id)?.name ?? 'function'
	const id = opts.id ?? `${m![1]}:function/${m![2]}-${name}@1`
	if (!isFunctionId(id)) throw new Error(`'${id}' is not a function id. Use 'owner:function/name@N'.`)
	const { id: _id, forkedFrom: _f, ...props } = JSON.parse(JSON.stringify(decl)) as FunctionDecl
	return freezeDeep({ ...props, id, forkedFrom: decl.id }) as FunctionDecl
}

/** 🚧 What a function provides — its kind and everything it adds. @experimental */
export interface FunctionProvides {
	readonly kind: string
	readonly attributes: readonly string[]
	readonly events: readonly string[]
	readonly verbs: readonly string[]
	readonly outcomes: readonly string[]
	readonly zoneTypes: readonly string[]
	readonly emits: readonly string[]
	readonly phases: readonly FunctionPhase[]
	readonly decides: boolean
	readonly chance: boolean
	readonly rollsDice: boolean
	readonly invokable: boolean
	readonly headerOnly: boolean
}

/**
 * 🚧 What a function provides (D1): its kind, the attributes, events,
 * verbs, outcome words and zone types it adds (by id), what it emits, its
 * phases, whether it decides by the rules, its chance, and whether a person
 * may invoke it. A reserved id not yet registered provides its kind and
 * chance alone.
 * @experimental
 */
export function functionProvides(fn: FunctionDecl | FunctionRef | FunctionId): FunctionProvides {
	const ref: FunctionRef = typeof fn === 'string' ? { ref: fn } : 'ref' in fn && typeof fn.ref === 'string' ? (fn as FunctionRef) : { ref: (fn as FunctionDecl).id, module: fn as FunctionDecl }
	const decl = ref.module ?? registry.get(ref.ref)
	const reserved = decl ? undefined : RESERVED_FUNCTIONS[ref.ref]
	const ids = (xs: readonly { id?: unknown }[] | undefined) => (xs ?? []).map((x) => String(x?.id))
	return Object.freeze({
		kind: String(decl?.kind ?? reserved?.kind ?? ''),
		attributes: ids(decl?.adds?.attributes),
		events: ids(decl?.adds?.events),
		verbs: [...(decl?.adds?.verbs ?? [])],
		outcomes: ids(decl?.adds?.outcomes),
		zoneTypes: ids(decl?.adds?.zoneTypes),
		emits: [...(decl?.emits ?? [])],
		phases: [...(decl?.phases ?? [])],
		decides: functionRefDecides(ref),
		chance: decl ? decl.chance === true : reserved?.chance === true,
		rollsDice: decl ? decl.rollsDice === true : reserved?.rollsDice === true,
		invokable: decl?.invokable !== undefined,
		headerOnly: decl ? decl.body === undefined && decl.seedKey === undefined : reserved?.decides !== true,
	})
}
