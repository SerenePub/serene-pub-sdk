/**
 * 🚧 The functions the archetypes lean on (PLAN-rulesets-functions D9): core's reserved ids
 * (`CORE_FUNCTION_IDS`) and the catalogue's modules (lane A2) by their declarations' ids — so every
 * module an archetype names is registered before the archetype is declared.
 */
import { CORE_FUNCTION_IDS, type FieldDecl } from "@serene-pub/sdk"
import { deckFunction, markTallyFunction, moveEntryFunction, obligationFunction, outcomeMovesFunction, recurringFunction, rungsFunction } from "../../functions/index.js"

/** 🚧 @experimental */
export const ARCHETYPE_FUNCTIONS = Object.freeze({
	...CORE_FUNCTION_IDS,
	/** time: a value moves each turn, round, scene or day (binds `what`, an attribute; options `every`, `by`). */
	recurring: recurringFunction.id,
	/** pieces: entries owed by a story date come due (binds `owed`, an entry type with a `due` date). */
	obligation: obligationFunction.id,
	/** zones: a deck, a hand and a discard pile; a person may Draw (binds `deck`, `hand`, zone types). */
	deck: deckFunction.id,
	/** zones: an entry moves from one zone to another (binds `from`, `to`, zone types). */
	moveEntry: moveEntryFunction.id,
	/** changing: a count goes up (binds `tally`, an attribute). */
	markTally: markTallyFunction.id,
	/** values: a number read as named rungs (binds `what`, an attribute or an entry's number field; option `into` keeps the words). */
	rungs: rungsFunction.id,
	/** changing: how a check came out moves a number (binds `what`; options `check`, `moves`, `whose`). */
	outcomeMoves: outcomeMovesFunction.id
} as const)

/** 🚧 A library row: the id, its version and the entry's fields. @experimental */
export const row = (id: string, piece: Record<string, unknown>) => ({ id, version: "1.0.0", piece: piece as never })

/** 🚧 An entry's story date — what an obligation comes due by (`core:function/obligation@1` reads `due`). @experimental */
export const dueField = (description: string): FieldDecl => ({
	type: "object",
	label: { en: "Due" },
	description: { en: description },
	fields: { year: { type: "integer", label: { en: "Year" } }, month: { type: "integer", label: { en: "Month" } }, day: { type: "integer", label: { en: "Day" } } }
})
