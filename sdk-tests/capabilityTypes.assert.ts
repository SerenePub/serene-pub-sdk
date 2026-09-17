/**
 * The typed probe, asserted at COMPILE time.
 *
 * This file is checked by `tsc --noEmit` and is never run. That is the whole
 * point: what it guards cannot be observed at runtime.
 *
 * `ctx.can()` is narrowed to exactly the capabilities a node declared `optional`.
 * If that inference ever widens — a `const` dropped from `describeOracleDefinition`, an
 * `optional?:` where `optional:` was meant in `OptionalCapsOf`, a stray `any`
 * somewhere in `pin` — then `can()` accepts `string`, every call keeps
 * compiling, every test keeps passing, and the guarantee is gone with no
 * symptom whatsoever. The `@ts-expect-error` lines below are the only thing that
 * notices: each one FAILS THE BUILD if the error it expects stops happening.
 *
 * A widening bug therefore shows up here as "unused '@ts-expect-error'
 * directive", which reads as nonsense until you know why this file exists —
 * hence this comment.
 */

import {
	describeOracleDefinition,
	pin,
	providerBinding,
	ok,
	S,
	type CapabilitySet,
	type Grade,
	type OptionalCapsOf,
} from '@serene-pub/sdk'

// A node that declares exactly one optional capability and one required one.
const probeType = pin(
	describeOracleDefinition({
		id: 'test:oracle/typed-probe@1',
		shape: S.textGen,
		effects: 'external',
		slots: {
			connection: {
				kind: 'connection',
				requires: ['text->text'],
				optional: ['json_schema'],
			},
		},
		ports: { in: {}, out: { main: S.text } },
	}),
)

providerBinding(probeType)(async (_input, ctx) => {
	// ✅ declared optional on this node's connection slot
	const grade = ctx.can('json_schema')

	// The return is a GRADE, not a boolean — so an author can tell "the API does
	// this itself" from "we are emulating it", which have different costs. Read
	// against `topGrade(id)`, never against a global scale.
	const _g: Grade | false = grade

	// @ts-expect-error — 'grammar' is a real capability, but not one THIS node declared
	ctx.can('grammar')

	// @ts-expect-error — a typo must not compile; that is most of the value here
	ctx.can('json_schmea')

	// @ts-expect-error — `requires` is guaranteed by the time a binding runs, so
	// asking about it is dead code and is refused rather than always-true
	ctx.can('text->text')

	// @ts-expect-error — not a capability id at all
	ctx.can('definitely-not-a-capability')

	return ok({ main: 'x' })
})

// A node declaring NO optional capabilities can ask about nothing at all.
const bareType = pin(
	describeOracleDefinition({
		id: 'test:oracle/no-optional@1',
		shape: S.textGen,
		effects: 'external',
		slots: { connection: { kind: 'connection', requires: ['text->text'] } },
		ports: { in: {}, out: { main: S.text } },
	}),
)

providerBinding(bareType)(async (_input, ctx) => {
	// @ts-expect-error — nothing was declared optional, so there is nothing to ask
	ctx.can('json_schema')
	return ok({ main: 'x' })
})

// ── OptionalCapsOf, directly ────────────────────────────────────────────────

type OneSlot = OptionalCapsOf<{
	connection: { kind: 'connection'; optional: readonly ['json_schema'] }
}>
const _one: OneSlot = 'json_schema'

// Two connection slots contribute independently — the union is across slots,
// which is why the requirement lives on the slot and not on the descriptor.
type TwoSlots = OptionalCapsOf<{
	a: { kind: 'connection'; optional: readonly ['json_schema'] }
	b: { kind: 'connection'; optional: readonly ['tools'] }
}>
const _a: TwoSlots = 'json_schema'
const _b: TwoSlots = 'tools'
// @ts-expect-error — neither slot declared it
const _c: TwoSlots = 'grammar'

// A slot with no `optional` contributes nothing, rather than widening to all.
type NoOptional = OptionalCapsOf<{ connection: { kind: 'connection' } }>
// @ts-expect-error — `never` accepts nothing, which is the correct empty answer
const _none: NoOptional = 'json_schema'

// A capability set is keyed by capability, not by arbitrary string.
// Grades, on each capability's own scale: `text->text` has two bands so 1 is its
// best, and `json_schema` has three so 1 is its emulated middle.
const _set: CapabilitySet = { 'text->text': 1, json_schema: 1 }

// @ts-expect-error — a stored set holds GRADES. The old three-value vocabulary
// is an authoring spelling now (`GradeSpec`), accepted in a DECLARATION and
// never in the column, so a band name reaching a stored set is a type error
// rather than a value every reader has to re-interpret.
const _banded: CapabilitySet = { 'text->text': 'native' }

// A plugin's transform is accepted, because the transform space is deliberately
// OPEN — anything of the form `a->b` is well-formed even if core never named it.
// 1 is its top: a capability core never named falls back to two bands, so a
// plugin's transform grades correctly with nothing added to core's table.
const _plugin: CapabilitySet = { 'audio+image->video': 1 }

// @ts-expect-error — a feature, by contrast, names a mechanism something has to
// implement, so that space is closed and a typo in one is caught here
const _badFeature: CapabilitySet = { json_schmea: 1 }

export {}
