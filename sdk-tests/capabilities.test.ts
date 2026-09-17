/**
 * The capability vocabulary.
 *
 * Two axes — transforms (what can flow) and features (how a request is
 * constrained) — resolved through four layers, with the adapter's declaration
 * acting as a gate rather than a default. These tests hold the properties that
 * make the model worth having:
 *
 *   · an id is canonical, so two spellings of one transform are one key;
 *   · the adapter gates absolutely, so no later layer can invent a capability
 *     the wire protocol has no field for;
 *   · what a connection stores is always a GRADE — a number on that
 *     capability's own scale — so no consumer has to guess what "we have not
 *     asked yet" means;
 *   · a required capability that is missing is distinguishable from one that is
 *     supported below its own best, and both from an optional one that is
 *     absent.
 *
 * ⚠ The grade LITERALS below are deliberate, not laziness. `bandsFor` is what
 * the code under test consults, so writing `gradeOf(id, 'native')` in an
 * assertion would restate the implementation and pass however wrong the table
 * became. The numbers are stated, with the band table they come from named in a
 * comment: `tools`, `json_object` and `json_schema` have three bands
 * ([none, emulated, native], so native is 2) and everything else has two
 * ([none, native], so native is 1).
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
	IO_KINDS,
	IoKinds,
	FEATURES,
	TRANSFORMS,
	tf,
	transformId,
	parseTransform,
	isTransformId,
	closure,
	resolveCapabilities,
	satisfies,
	capabilityLabel,
	capabilityTagline,
	isBasicCapability,
	bandsFor,
	gradeLetter,
	gradeOf,
	topGrade,
	BAND,
	BANDS,
	EMULATABLE_VIA,
	type AdapterCapabilities,
	type CapabilityId,
	type CapabilitySet,
	S,
	describeOracleDefinition,
	pin,
	spec,
	validate,
} from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import { publish, errorsFor } from './helpers.js'

describe('transform ids are canonical', () => {
	test('order follows IO_KINDS, not the caller and not the alphabet', () => {
		// Text leads, so vision reads `text+image->text`. Alphabetically it would
		// be `image+text->text`, which is the same fact spelled differently — and
		// two spellings of one key is two map entries and a bug.
		assert.equal(transformId({ in: ['image', 'text'], out: ['text'] }), 'text+image->text')
		assert.equal(transformId({ in: ['text', 'image'], out: ['text'] }), 'text+image->text')
	})

	test('duplicate kinds collapse', () => {
		assert.equal(transformId({ in: ['text', 'text'], out: ['image'] }), 'text->image')
	})

	test('round-trips through parse', () => {
		for (const id of Object.keys(TRANSFORMS)) {
			assert.equal(transformId(parseTransform(id as any)), id, id)
		}
	})

	test('every named transform uses only declared kinds', () => {
		for (const id of Object.keys(TRANSFORMS)) {
			const t = parseTransform(id as any)
			for (const k of [...t.in, ...t.out])
				assert.ok((IO_KINDS as readonly string[]).includes(k), `${id}: ${k}`)
		}
	})

	test('the two id spaces cannot collide', () => {
		// The whole reason a flat id space is safe: a feature never contains `->`.
		for (const f of FEATURES) assert.equal(isTransformId(f), false, f)
		for (const t of Object.keys(TRANSFORMS)) assert.ok(isTransformId(t), t)
	})
})

describe('tf — authoring an id from kinds instead of spelling a string', () => {
	// A JS/TS-defined node names its combinations with objects and enum members,
	// because `'text+imgae->text'` is a perfectly good `TransformId` today and
	// fails at RUN time, on the machine of whoever installed the plugin, as a
	// requirement no connection can ever report.
	//
	// ⚠ Most of what `tf` is for cannot be tested here. The runtime body is two
	// string joins and it cannot tell a mistyped kind from a good one — the
	// checking lives entirely in the types, so the negatives are in
	// `tfTypes.assert.ts`. These hold the values that the types claim.

	test('the plain cases', () => {
		assert.equal(tf({ in: [IoKinds.text], out: [IoKinds.text] }), 'text->text')
		assert.equal(
			tf({ in: [IoKinds.text, IoKinds.image], out: [IoKinds.text] }),
			'text+image->text',
		)
	})

	test("the author's order does not matter, and neither does the alphabet", () => {
		// `tf` filters the fixed IO_KINDS tuple rather than sorting what it was
		// handed — at the type level and at run time, the same walk in the same
		// direction. That is why the computed literal and the emitted string
		// cannot drift apart; there is no comparator to keep in step.
		assert.equal(
			tf({ in: [IoKinds.image, IoKinds.text], out: [IoKinds.text] }),
			'text+image->text',
		)
		assert.equal(
			tf({ in: [IoKinds.text, IoKinds.image], out: [IoKinds.text] }),
			'text+image->text',
		)
	})

	test('duplicate kinds collapse', () => {
		assert.equal(tf({ in: [IoKinds.text, IoKinds.text], out: [IoKinds.image] }), 'text->image')
	})

	test('three kinds on a side still order by IO_KINDS', () => {
		assert.equal(
			tf({ in: [IoKinds.audio, IoKinds.image, IoKinds.text], out: [IoKinds.text] }),
			'text+image+audio->text',
		)
	})

	test('a combination core never named is still expressible', () => {
		// D1: the transform space stays OPEN. If this ever throws — or stops
		// compiling, which is the likelier accident — the plugin escape hatch has
		// closed and a novel backend has to wait for a core release.
		const id = tf({ in: [IoKinds.audio], out: [IoKinds.image] })
		assert.equal(id, 'audio->image')
		assert.equal(id in TRANSFORMS, false)
	})

	test('tf and transformId are two faces over one body, never two answers', () => {
		// They are deliberately separate functions rather than an overload pair:
		// as an overload the widened signature silently rescues everything the
		// narrow one exists to reject. Separate, they must still never disagree
		// on a value both accept — that is what this holds.
		for (const id of Object.keys(TRANSFORMS)) {
			const t = parseTransform(id as any)
			assert.equal(tf(t as any), transformId(t), id)
		}
	})

	test('every transform core names is reachable from IoKinds alone', () => {
		// The authoring surface has to be able to say the whole vocabulary. A kind
		// present in IO_KINDS but missing from `IoKinds` would surface here as a
		// transform nobody can declare without falling back to a raw string —
		// which is the exact thing this replaced.
		for (const id of Object.keys(TRANSFORMS)) {
			const t = parseTransform(id as any)
			for (const k of [...t.in, ...t.out])
				assert.equal((IoKinds as Record<string, string>)[k], k, `${id}: ${k}`)
		}
	})
})

describe("what core's own nodes actually require, as shipped", () => {
	// The `tf()` conversion is only worth having if nothing slipped past it, and
	// nothing here would notice on its own: `SlotDecl.requires` stays wide by
	// decision (D1), so a raw hand-typed string in a `requires:` is not a compile
	// error anywhere. This is the only thing that would catch one.

	const shipped = () => {
		const out: { id: string; slot: string; requires: readonly unknown[] }[] = []
		for (const v of Object.values(C as Record<string, any>)) {
			const d = v?.descriptor
			if (!d?.slots) continue
			for (const [slot, s] of Object.entries<any>(d.slots))
				if (s?.requires) out.push({ id: d.id, slot, requires: s.requires })
		}
		return out
	}

	test('every required capability is a canonical id or a declared feature', () => {
		const rows = shipped()
		// If the walk ever stops matching the descriptor shape it would pass
		// vacuously, which is the failure mode of every "check all of X" test.
		assert.ok(rows.length > 0, 'found no requires at all — the walk stopped matching')
		for (const { id, slot, requires } of rows) {
			for (const cap of requires) {
				assert.equal(typeof cap, 'string', `${id}.${slot}: ${String(cap)}`)
				const s = cap as string
				if (isTransformId(s))
					assert.equal(
						transformId(parseTransform(s as any)),
						s,
						`${id}.${slot} requires '${s}', which is not canonical`,
					)
				else
					assert.ok(
						(FEATURES as readonly string[]).includes(s),
						`${id}.${slot} requires '${s}', which is neither a transform nor a feature`,
					)
			}
		}
	})

	test('what reaches the registry is a plain string, not a wrapper', () => {
		// Hash-neutrality, held rather than asserted in a commit message.
		// `typeContentHash` hashes the emitted slots, so `tf()` was only safe to
		// adopt because it returns the same canonical strings the literals did. A
		// change that made it return anything else — an object, a branded value —
		// would silently re-hash every type and force a re-projection at boot.
		for (const { id, slot, requires } of shipped())
			assert.deepEqual(
				requires.map((c) => typeof c),
				requires.map(() => 'string'),
				`${id}.${slot}`,
			)
	})
})

describe('naming, because a person reads these', () => {
	test('transforms and features both get human labels', () => {
		assert.equal(capabilityLabel('text->text'), 'Chat')
		assert.equal(capabilityLabel('text+image->text'), 'Vision')
		assert.equal(capabilityLabel('json_schema'), 'JSON schema')
	})

	test('an unknown id falls back to itself rather than to nothing', () => {
		// A plugin's transform should read as odd, not as blank.
		assert.equal(capabilityLabel('audio+image->video' as any), 'audio+image->video')
	})

	test('only Chat is basic — the first-timer sees one thing', () => {
		const basic = Object.keys(TRANSFORMS).filter((id) => isBasicCapability(id as any))
		assert.deepEqual(basic, ['text->text'])
	})

	test('taglines exist for the transforms and never for features', () => {
		assert.ok(capabilityTagline('text->image'))
		assert.equal(capabilityTagline('json_schema'), undefined)
	})
})

describe('bands — what a grade means depends on the capability', () => {
	test('a capability nobody gave bands is binary', () => {
		// The openness that matters: a plugin introduces a transform and it grades
		// correctly with nothing added to core's table.
		assert.deepEqual(bandsFor('audio->image' as CapabilityId), [BAND.none, BAND.native])
		assert.equal(topGrade('audio->image' as CapabilityId), 1)
	})

	test('the top of a two-band capability is 1 and the top of a three-band one is 2', () => {
		assert.equal(topGrade('text->image'), 1)
		assert.equal(topGrade('tools'), 2)
	})

	test('every emulatable capability HAS an emulated band, and only those do', () => {
		// The two tables are one fact stated once each, and `closure` raises
		// through `gradeOf(id, 'emulated')` — so a key added to EMULATABLE_VIA
		// without a band here would silently stop being emulatable, and a spare
		// `emulated` band here would be a middle grade nothing can ever produce.
		const emulatable = new Set(Object.keys(EMULATABLE_VIA))
		const banded = new Set(
			Object.keys(BANDS).filter((id) =>
				bandsFor(id as CapabilityId).includes(BAND.emulated),
			),
		)
		assert.deepEqual([...banded].sort(), [...emulatable].sort())
	})

	test('a band a capability does not have reads DOWN, never up', () => {
		// `emulated` asked of image generation is a claim nothing can fulfil.
		// Rounding it up to native would put a fabricated picture on screen.
		assert.equal(gradeOf('text->image', BAND.emulated), 0)
		assert.equal(gradeOf('tools', BAND.emulated), 1)
	})

	test('a grade past the top clamps rather than escaping the scale', () => {
		assert.equal(gradeOf('text->image', 7), 1)
		assert.equal(gradeOf('tools', -3), 0)
	})
})

describe('letters — derived at render, relative to the capability itself', () => {
	test("a two-band capability's best is an A, not a B", () => {
		// The reason letters are per-capability. `text->image` at its top is as
		// good as image generation gets, and grading it against some other
		// capability's three-band scale would report a deficiency the protocol
		// does not have.
		assert.equal(gradeLetter('text->image', 1), 'A')
		assert.equal(gradeLetter('tools', 2), 'A')
	})

	test('a supported-but-lesser grade steps down the alphabet', () => {
		assert.equal(gradeLetter('tools', 1), 'B')
	})

	test('grade 0 has no letter at all', () => {
		// 0 is an absence, not a quality — the caller says "Off" instead.
		assert.equal(gradeLetter('tools', 0), undefined)
		assert.equal(gradeLetter('text->image', 0), undefined)
	})
})

describe('closure — declare the strongest thing once', () => {
	test('a strict schema implies the looser forms, at the same BAND', () => {
		// The bug grades make possible, held against. `strict_schema` is binary so
		// its native grade is 1, while `json_schema` and `json_object` have three
		// bands and their native grade is 2. Propagating the NUMBER would write 1
		// into both — which is EMULATED — silently demoting the strongest claim
		// available into the weakest supported one, and labelling the result "On ·
		// by Serene Pub" on a backend doing it natively.
		const out = closure({ strict_schema: 1 })
		assert.equal(out.json_schema, 2)
		assert.equal(out.json_object, 2)
	})

	test('a native grammar emulates the schema forms', () => {
		// This is `jsonSchemaToGbnf` stated as data instead of re-derived inside
		// each adapter that happens to own a grammar. `grammar` is binary, so 1 is
		// its best; the schema forms land on THEIR 1, which is the emulated band —
		// the app is the one doing the work.
		const out = closure({ grammar: 1 })
		assert.equal(out.json_schema, 1)
		assert.equal(out.json_object, 1)
		assert.equal(out.tools, 1)
	})

	test('implication never downgrades something already stronger', () => {
		const out = closure({ grammar: 1, json_object: 2 })
		assert.equal(out.json_object, 2)
	})

	test('a backend with nothing gains nothing', () => {
		assert.deepEqual(closure({}), {})
		assert.deepEqual(closure({ 'text->text': 1 }), { 'text->text': 1 })
	})
})

// The three adapters worth encoding: one that can do everything, one that can do
// text only, and one whose extra abilities depend on the model behind it.
const openaiish: AdapterCapabilities = {
	supports: {
		'text->text': 'native',
		'text+image->text': { unproven: true, until: 'none' },
		'text->image': { unproven: true, until: 'none' },
		json_object: 'native',
		json_schema: { unproven: true, until: 'none' },
		tools: 'native',
		streaming: 'native',
	},
	defaults: ['text->text', 'json_object', 'tools', 'streaming'],
}

const anthropicish: AdapterCapabilities = {
	// No structured output of any kind, and no image generation: the Messages API
	// has no field for either. This is the gate doing its job.
	supports: {
		'text->text': 'native',
		'text+image->text': 'native',
		tools: 'native',
		streaming: 'native',
	},
	defaults: ['text->text', 'text+image->text', 'tools', 'streaming'],
}

describe('resolution — four layers, adapter as the gate', () => {
	test('defaults come on, everything else stays off', () => {
		const out = resolveCapabilities({ adapter: openaiish })
		// 1 is the top of `text->text`'s two bands — not a middling answer.
		assert.equal(out['text->text'], 1)
		assert.equal(out['text->image'], undefined)
	})

	test('a preset ASSERTS a probed capability rather than inheriting its pessimism', () => {
		// `text->image` is declared `{probed, until: 'none'}` — "the protocol can
		// express it; we do not know if this model does". A preset names a
		// specific service, so it knows: `true` means yes, at full strength.
		// Resolving it to the `until` fallback instead would make a preset
		// incapable of ever switching a probed capability on.
		const out = resolveCapabilities({
			adapter: openaiish,
			preset: { 'text->image': true },
		})
		assert.equal(out['text->image'], 1)
	})

	test('but the adapter default alone stays pessimistic', () => {
		// Nobody has asserted anything, so `until` is what an unasked question is
		// worth — and for image generation that is nothing, because no amount of
		// app-side cleverness fakes a picture.
		const out = resolveCapabilities({
			adapter: {
				supports: { 'text->image': { unproven: true, until: 'none' } },
				defaults: ['text->image'],
			},
		})
		assert.equal(out['text->image'], undefined)
	})

	test('a probed capability whose floor is emulated comes on emulated', () => {
		// Tool calling: the app can format and parse it for a model that never
		// heard of tools, so the honest unasked answer is `emulated`, not `none`.
		const out = resolveCapabilities({
			adapter: {
				supports: { tools: { unproven: true, until: 'emulated' } },
				defaults: ['tools'],
			},
		})
		// 1 of `tools`' three bands: supported, and below its own best.
		assert.equal(out.tools, 1)
	})

	test('NOTHING can switch on what the adapter does not support', () => {
		// The property the whole model rests on. Anthropic's API cannot express
		// image generation, so no preset, probe or person may claim it can.
		const out = resolveCapabilities({
			adapter: anthropicish,
			preset: { 'text->image': true, json_schema: 'native' },
			probe: { 'text->image': 1 },
			overrides: { 'text->image': 1, json_schema: 2 },
		})
		assert.equal(out['text->image'], undefined)
		assert.equal(out.json_schema, undefined)
	})

	test('a preset can switch OFF what the adapter defaults on', () => {
		// The documented case: json_object works across the OpenAI-compatible zoo
		// far more widely than json_schema, so a preset turns the stricter one off
		// without the pipeline needing to know why.
		const out = resolveCapabilities({
			adapter: openaiish,
			preset: { json_object: false },
		})
		assert.equal(out.json_object, undefined)
	})

	test('a probe answers only what the adapter said to ask about', () => {
		const out = resolveCapabilities({
			adapter: openaiish,
			preset: { 'text+image->text': true },
			probe: { 'text+image->text': 1 },
		})
		assert.equal(out['text+image->text'], 1)
	})

	test('a probe cannot answer for a capability declared outright', () => {
		// `text->text` is `native`, not `probed`. A probe claiming otherwise is
		// answering a question nobody asked.
		const out = resolveCapabilities({
			adapter: openaiish,
			probe: { 'text->text': 0 },
		})
		assert.equal(out['text->text'], 1)
	})

	test('a user override is final, but still clamped by the adapter', () => {
		const off = resolveCapabilities({
			adapter: openaiish,
			overrides: { 'text->text': false },
		})
		assert.equal(off['text->text'], undefined)

		const on = resolveCapabilities({
			adapter: anthropicish,
			overrides: { 'text->text': 1 },
		})
		assert.equal(on['text->text'], 1)
	})

	test('what is stored is always a grade — never the unproven marker', () => {
		// The reason the declaration is split by position: an adapter may declare
		// "nobody has asked", a connection may only store an answer. Asserted
		// POSITIVELY — every value is a number in range for its own capability —
		// because `notEqual(v, 'probed')` would also pass on an object, a string
		// or an out-of-range number, which is most of what could go wrong.
		const out = resolveCapabilities({
			adapter: openaiish,
			preset: { 'text+image->text': true, json_schema: true },
		})
		assert.ok(Object.keys(out).length > 0, 'resolved nothing — the walk stopped matching')
		for (const [id, v] of Object.entries(out)) {
			assert.equal(typeof v, 'number', id)
			assert.ok(v! > 0 && v! <= topGrade(id as CapabilityId), `${id}: ${v}`)
		}
	})

	test('the composite is the FLOOR of the api and model gradings', () => {
		// The adapter grades the API and the probe grades the model, and neither
		// can promise past the other. `text->text` is declared outright, so no
		// probe is consulted; `text+image->text` is unproven, so the probe decides
		// — and a probe claiming more than the format can express is clamped by
		// the same floor that lets it claim less.
		const modest = resolveCapabilities({
			adapter: openaiish,
			preset: { 'text+image->text': true },
			probe: { 'text+image->text': 0 },
		})
		assert.equal(modest['text+image->text'], undefined)

		const clamped = resolveCapabilities({
			adapter: anthropicish,
			overrides: { 'text->image': 9 },
		})
		assert.equal(clamped['text->image'], undefined)
	})

	test('closure runs last, so an emulation shows up in the result', () => {
		const grammared: AdapterCapabilities = {
			supports: { 'text->text': 'native', grammar: 'native' },
			defaults: ['text->text', 'grammar'],
		}
		const out = resolveCapabilities({ adapter: grammared })
		assert.equal(out.json_schema, 1)
	})
})

describe('satisfies — four answers from one walk', () => {
	const have: CapabilitySet = {
		'text->text': 1,
		'text->image': 1,
		json_object: 1,
		tools: 2,
	}

	test('a met requirement is ok and carries its grade', () => {
		const v = satisfies({ requires: ['text->text'] }, have)
		assert.equal(v.ok, true)
		assert.deepEqual(v.missing, [])
		assert.equal(v.grades['text->text'], 1)
	})

	test('a missing requirement is not ok, and says which', () => {
		const v = satisfies({ requires: ['audio->text'] }, have)
		assert.equal(v.ok, false)
		assert.deepEqual(v.missing, ['audio->text'])
	})

	test('below its own top band satisfies, but is reported as degraded', () => {
		// Proceeding is right — emulation is the app doing the work itself — but
		// silence is not: "why is this slower than the other one" needs an answer.
		const v = satisfies({ requires: ['json_object'] }, have)
		assert.equal(v.ok, true)
		assert.deepEqual(v.degraded, ['json_object'])
	})

	test('a two-band capability at its best is NOT degraded', () => {
		// The whole reason grades are per-capability. `text->image` at 1 is the
		// best image generation there is; the flat enum called that value the
		// middle of three and every reader had to special-case it.
		const v = satisfies({ requires: ['text->image'] }, have)
		assert.equal(v.ok, true)
		assert.deepEqual(v.degraded, [])
		assert.equal(v.grades['text->image'], 1)
	})

	test('an absent optional is listed, and does NOT fail the verdict', () => {
		const v = satisfies({ requires: ['text->text'], optional: ['json_schema'] }, have)
		assert.equal(v.ok, true)
		assert.deepEqual(v.absent, ['json_schema'])
		assert.equal(v.grades.json_schema, undefined)
	})

	test('an explicit grade 0 reads exactly as an absence', () => {
		const v = satisfies({ requires: ['grammar'] }, { ...have, grammar: 0 })
		assert.equal(v.ok, false)
		assert.deepEqual(v.missing, ['grammar'])
	})

	test('a value that is not a number reads as UNSUPPORTED, not as support', () => {
		// This set comes off a loose JSON column in the app, so an unmigrated
		// string can reach here. `!'native'` is false, so a truthiness test alone
		// would grant the capability on the strength of the very value that proves
		// nothing has been migrated.
		const v = satisfies({ requires: ['grammar'] }, {
			...have,
			grammar: 'native' as unknown as number,
		})
		assert.equal(v.ok, false)
		assert.deepEqual(v.missing, ['grammar'])
	})

	test('grades carries only what was asked about', () => {
		// `have` knows about `tools`; the need did not mention it, so a binding
		// cannot read it. Capability access is scoped to what a node declared.
		const v = satisfies({ requires: ['text->text'] }, have)
		assert.equal(v.grades.tools, undefined)
	})

	test('needing nothing is satisfied by anything, including an empty set', () => {
		const v = satisfies({}, {})
		assert.equal(v.ok, true)
	})
})

describe('the publish-time check — what is knowable without a connection', () => {
	// `satisfies` cannot run at publish: the document may be imported onto an
	// instance where nobody has made a connection yet. What IS checkable is
	// whether the declaration is coherent, and each of these is a mistake that
	// would otherwise surface as a slot that silently matches nothing.
	let n = 0
	const declaring = (slot: Record<string, unknown>) => {
		const suffix = `${n++}-${Date.now()}`
		const T = pin(
			describeOracleDefinition({
				id: `demo:cap-check-${suffix}@1`,
				shape: S.textGen,
				effects: 'external',
				slots: { connection: { kind: 'connection', ...slot } as any },
				ports: { in: {}, out: { main: S.text } },
			} as any),
		)
		// Returns the BUILDER, not a published document: `publish` asserts, and
		// these tests are about what the assertion says.
		return spec(`demo:cap-spec-${suffix}@1`, { version: '1.0.0' })
			.inlet('input', C.userMessage.v1())
			.oracle('generate', (T as any).v1())
	}

	test('an unknown feature id is an error naming the valid ones', () => {
		const f = errorsFor(declaring({ requires: ['json_scheme'] }), 'capabilities')
		assert.equal(f.length, 1)
		assert.match(f[0]!.message, /unknown capability/)
		assert.match(f[0]!.fix, /json_schema/)
	})

	test('a well-formed transform this build has never heard of is allowed', () => {
		// A plugin may introduce one. Refusing it would make the id space closed,
		// which is the opposite of what an open transform space is for.
		//
		// ⚠ `image+audio`, not `audio+image`. This case was written the other way
		// round and passed, because the check was `!!lhs && !!rhs` — which also
		// passed 'text->tex' and '->'. Kinds order by IO_KINDS, so `image` leads.
		const f = errorsFor(declaring({ requires: ['image+audio->video'] }), 'capabilities')
		assert.deepEqual(f, [])
	})

	test('a transform spelled out of canonical order is an error naming the spelling', () => {
		// Not pedantry. `transformId()` only ever emits the canonical form and
		// `satisfies()` looks up by exact key, so a mis-ordered id matches nothing,
		// forever — the node is unsatisfiable by any connection however capable.
		// The fix has to name the right spelling or nothing on screen says what
		// differs between two strings with the same words in them.
		const f = errorsFor(declaring({ requires: ['audio+image->video'] }), 'capabilities')
		assert.equal(f.length, 1)
		assert.match(f[0]!.message, /non-canonically/)
		assert.match(f[0]!.fix, /'image\+audio->video'/)
	})

	test('a misspelled kind and an empty side are both errors', () => {
		// The ids the old structural check let through: each is a typo that
		// survived validation and failed on the installing user's machine, as a
		// requirement no connection can ever report.
		for (const bad of ['text->tex', 'txet->text', '->']) {
			const f = errorsFor(declaring({ requires: [bad] }), 'capabilities')
			assert.equal(f.length, 1, `expected '${bad}' to be rejected`)
			assert.match(f[0]!.message, /unknown capability/)
		}
	})

	test('required AND optional is a contradiction, not a stronger requirement', () => {
		// `requires` guarantees presence; `optional` obliges the binding to handle
		// absence. Declaring both makes one of the two branches unreachable.
		const f = errorsFor(
			declaring({ requires: ['json_schema'], optional: ['json_schema'] }),
			'capabilities',
		)
		assert.equal(f.length, 1)
		assert.match(f[0]!.message, /both required and optional/)
	})

	test('capabilities on a non-connection slot are refused', () => {
		const T = pin(
			describeOracleDefinition({
				id: `demo:cap-wrong-slot-${n++}-${Date.now()}@1`,
				shape: S.textGen,
				effects: 'external',
				slots: {
					prompts: {
						kind: 'prompts',
						fields: {},
						requires: ['json_schema'],
					} as any,
				},
				ports: { in: {}, out: { main: S.text } },
			} as any),
		)
		const f = errorsFor(
			spec(`demo:cap-wrong-spec-${n++}-${Date.now()}@1`, { version: '1.0.0' })
				.inlet('input', C.userMessage.v1())
				.oracle('generate', (T as any).v1()),
			'capabilities',
		)
		assert.equal(f.length, 1)
		assert.match(f[0]!.message, /is a prompts slot/)
	})

	test('every capability finding names a fix — the file-wide rule', () => {
		for (const bad of [
			declaring({ requires: ['nope'] }),
			declaring({ requires: ['tools'], optional: ['tools'] }),
		])
			for (const finding of errorsFor(bad, 'capabilities'))
				assert.ok(finding.fix.length > 0, finding.message)
	})
})
