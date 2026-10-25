/**
 * 🚧 **Writing a core ruleset in the seven sections** (lane A2, 2026-10-23;
 * PLAN-rulesets-functions D2, D9) — the small builders Vis Itineris,
 * Wherewithal and the dice templates are declared with: a way to decide as a
 * reference to core's deciding function, a check, a worked-out value, a
 * ruleset's own module, an entry type from a repertoire declaration, the
 * outcome words from a crosswalk, the options from settings.
 *
 * Each builds the very shape a section says (`RulesetSections`) from the
 * declared objects — functions, repertoires, slots — never a hand-typed id
 * (R35, A18).
 */
import {
	type CheckMethodDecl,
	type ConversionDecl,
	type DegreeCrosswalk,
	type FieldDecl,
	type FunctionDecl,
	type FunctionPhase,
	type FunctionRef,
	type I18n,
	PIECE_FIELDS,
	type RepertoireDecl,
	type RulesetChoiceLays,
	type RulesetOptions,
	type RulesetOutcomeDecl,
	type RulesetPresetDecl,
	type RulesetSettingDecl,
	type RulesetEntryTypeDecl
} from "@serene-pub/sdk"
import { checkFunction, dieTargetFunction, dicePoolFunction, cardDrawFunction, compareFunction, judgeFunction, spendFunction, workedOutFunction } from "../functions/index.js"

/** The deciding function each check method kind is decided by — the declared modules (derive, don't spell). */
const WAY_FUNCTIONS: Readonly<Record<string, FunctionDecl>> = Object.freeze({
	"die-target": dieTargetFunction,
	"dice-pool": dicePoolFunction,
	"card-draw": cardDrawFunction,
	compare: compareFunction,
	bid: spendFunction,
	none: judgeFunction
})

/**
 * 🚧 A **way** to decide — a check method, written as the reference to the
 * deciding function of its kind: its options the method's own, its words and
 * bands riding with them; `extra` lays what else rides (natural faces, a
 * check's `base` named as its way).
 * @experimental
 */
export function wayRef(key: string, method: CheckMethodDecl, extra: Record<string, unknown> = {}): FunctionRef {
	const { kind, ...options } = method as CheckMethodDecl & Record<string, unknown>
	const fn = WAY_FUNCTIONS[String(kind)]
	if (!fn) throw new Error(`no core way decides a '${String(kind)}' check`)
	const all = { ...options, ...extra }
	return { ref: fn.id, key, ...(Object.keys(all).length ? { options: all } : {}) }
}

/** 🚧 A **check** — what it reads (`base`), the way it is decided by (`way`), the family it counts `within`, and 🚧 its words (`label`, GM 2026-10-23). @experimental */
export function checkRef(key: string, options: { base?: string; way?: string; within?: string; label?: I18n } = {}): FunctionRef {
	return { ref: checkFunction.id, key, ...(Object.keys(options).length ? { options } : {}) }
}

/** 🚧 A **worked-out value** — from what, on the sheet or not, under which words. @experimental */
export function workedOutRef(key: string, options: { from: readonly string[]; onSheet?: boolean; label?: I18n }): FunctionRef {
	return { ref: workedOutFunction.id, key, options: { ...options, from: [...options.from] } }
}

/**
 * 🚧 A ruleset's **own module** — a function it carries whose body is ⏳ its
 * seeded script row (`seedKey`): a fork of a core function when it does the
 * same job its own way (`forkedFrom`), else a function of its own.
 * @experimental
 */
export function ownModuleRef(
	rulesetId: string,
	seedKey: string,
	header: { name: I18n; meaning: I18n; kind: FunctionDecl["kind"]; prose: string; phase: FunctionPhase; forkedFrom?: FunctionDecl }
): FunctionRef {
	const owner = rulesetId.slice(0, rulesetId.indexOf(":"))
	const name = seedKey.slice(Math.max(seedKey.lastIndexOf("/"), seedKey.lastIndexOf(":")) + 1)
	const id = `${owner}:function/${name}@1`
	const module: FunctionDecl = {
		id,
		name: header.name,
		meaning: header.meaning,
		kind: header.kind,
		prose: header.prose,
		phases: [header.phase],
		seedKey,
		...(header.forkedFrom ? { forkedFrom: header.forkedFrom.id } : {})
	}
	return { ref: id, key: name, module }
}

/**
 * 🚧 An **entry type** from a repertoire declaration — its whole piece shape,
 * its ⏳ piece rules, depth, renames and retired fields carried, its holders,
 * who sees it, its tags; `entryable: false` when it never yields one.
 * @experimental
 */
export function entryTypeOf(r: RepertoireDecl, entryable: boolean): RulesetEntryTypeDecl {
	return {
		id: r.id,
		name: r.label,
		...(r.description !== undefined ? { description: r.description } : {}),
		...(r.piece !== undefined ? { piece: r.piece } : {}),
		prose: r.prose,
		...(r.relational ? { relational: true as const } : {}),
		...(r.appliesTo !== undefined ? { holders: r.appliesTo } : {}),
		...(r.gmOnly ? { visibility: "gm" as const } : r.earshot === "holder" ? { visibility: "holder" as const } : {}),
		...(r.tags !== undefined ? { tags: r.tags } : {}),
		...(r.mechanics !== undefined ? { mechanics: r.mechanics } : {}),
		...(r.renderDepth !== undefined ? { renderDepth: r.renderDepth } : {}),
		...(r.renames !== undefined ? { renames: r.renames } : {}),
		...(r.retired !== undefined ? { retired: r.retired } : {}),
		...(entryable ? {} : { entryable: false as const })
	}
}

/** 🚧 The **outcome words** of a crosswalk, each with its step on the five and the margin it starts at. @experimental */
export const outcomesOf = (degrees: DegreeCrosswalk): RulesetOutcomeDecl[] =>
	degrees.bands.map((b) => ({ id: b.id, label: b.label, five: b.five, ...(b.from !== undefined ? { from: b.from } : {}) }))

/**
 * 🚧 The **options** a table may play the ruleset by: each setting a choice
 * field (owner reach is the field language's default), what each choice
 * lays, the presets, the conversions from other rulesets.
 * @experimental
 */
export function optionsOf(
	settings: Readonly<Record<string, RulesetSettingDecl>>,
	presets?: readonly RulesetPresetDecl[],
	conversions?: readonly ConversionDecl[]
): RulesetOptions {
	const fields: Record<string, FieldDecl> = {}
	const lays: Record<string, Record<string, RulesetChoiceLays>> = {}
	for (const [name, s] of Object.entries(settings)) {
		fields[name] = {
			type: "enum",
			label: s.label,
			...(s.description !== undefined ? { description: s.description } : {}),
			of: s.choices.map((c) => c.id),
			members: s.choices.map((c) => ({ key: c.id, label: c.label, ...(c.description !== undefined ? { description: c.description } : {}) })),
			default: s.default
		} as FieldDecl
		for (const c of s.choices) if (c.conventions !== undefined) (lays[name] ??= {})[c.id] = { conventions: c.conventions }
	}
	return {
		...(Object.keys(fields).length ? { fields } : {}),
		...(Object.keys(lays).length ? { lays } : {}),
		...(presets !== undefined ? { presets } : {}),
		...(conversions !== undefined ? { conversions } : {})
	}
}

/**
 * 🚧 **How long an entry lasts** on its holder, as an entry type's own field:
 * the universal piece part's units, how many and what ends it
 * (`PIECE_FIELDS.duration`), without the host's bookkeeping (`startedAt`,
 * `spent`), which no author writes. What a condition-like entry type
 * declares so its library rows may say how long they last.
 * @experimental
 */
export const LASTS_FIELD: FieldDecl = (() => {
	const d = PIECE_FIELDS.duration!
	const { units, value, expiry } = d.fields!
	return Object.freeze({ type: "object", label: d.label, fields: { units: units!, value: value!, expiry: expiry! } }) as FieldDecl
})()
