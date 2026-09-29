/**
 * Message verbs — the floors, the opt-in built-ins and the five built-in
 * specs (R-15, ruled 2026-09-15; plans/30 U5b, review W7/W8/C1).
 *
 * What is pinned:
 *
 *  1. **The floors are unrepresentable.** `genre()` and a definition's
 *     `sessionShape` (`register`, through `describeInletDefinition`) refuse
 *     `stop`, `branch` or `edit: false` with a sentence, and accept
 *     `delete`, `hide` or `swipe: false` — the opt-ins a genre may switch off.
 *  2. **The five built-in specs compile**, and each is one inlet straight
 *     into one outlet — nothing between a person's request and the write.
 *  3. **A built-in outlet belongs to its own spec.** `validate()` refuses the
 *     five outlets in any other document, with a sentence naming the future
 *     manifest permission (W8).
 *  4. **Identity is not reviewable.** Each built-in outlet declares
 *     `review.fields`, the form `reviewSchemaFor` builds carries no `target`,
 *     `fromMessage` or `index`, and a submission naming one is reported by
 *     `undeclaredReviewFields` (C1). Absent a declaration the form is the
 *     whole payload, as it always was.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
	genre,
	describeInletDefinition,
	getDefinition,
	spec,
	compile,
	validate,
	reviewSchemaFor,
	undeclaredReviewFields,
	BUILTIN_SPEC_IDS,
	BUILTIN_OUTLET_IDS,
	isBuiltInOutlet,
	isBuiltInSpec,
	MESSAGE_VERB_FLOORS,
	MESSAGE_VERB_BUILT_INS,
	S,
	resolveTurnControls,
	turnControlPresent,
	assertTurnControls,
	TURN_CONTROLS,
} from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import {
	builtinDeleteSpec,
	builtinHideSpec,
	builtinEditSpec,
	builtinSwipeSpec,
	builtinBranchSpec,
	chatGenre,
	adventureGenre,
	lairGenre,
} from '@serene-pub/core-catalog'

describe('the floors are unrepresentable', () => {
	test('genre() refuses stop, branch and edit: false with a sentence', () => {
		for (const floor of MESSAGE_VERB_FLOORS) {
			assert.throws(
				() =>
					genre(`test.floors:genre/${floor}`, {
						name: { en: 'Floors' },
						family: 'test',
						shape: { messageVerbs: { [floor]: false } } as any,
					}),
				new RegExp(`${floor}: false.*floors — present in every genre, never switched off`),
			)
		}
	})

	test("a definition's sessionShape is refused on the same terms", () => {
		for (const floor of MESSAGE_VERB_FLOORS) {
			assert.throws(
				() =>
					describeInletDefinition({
						id: `test.floors:inlet/${floor}@1`,
						i18n: { name: { en: 'Floors' } },
						sessionShape: { messageVerbs: { [floor]: false } } as any,
						ports: { out: { main: S.json } },
					}),
				/floors — present in every genre, never switched off/,
			)
			// Refused before the id was claimed: it is not in the registry.
			assert.equal(getDefinition(`test.floors:inlet/${floor}@1`), undefined)
		}
	})

	test('delete, hide and swipe: false are accepted — the opt-ins a genre may switch off', () => {
		const off = Object.fromEntries(MESSAGE_VERB_BUILT_INS.map((v) => [v, false]))
		assert.deepEqual(Object.keys(off).sort(), ['delete', 'hide', 'swipe'])
		const g = genre('test.floors:genre/final', {
			name: { en: 'Final' },
			family: 'test',
			shape: { messageVerbs: off },
		})
		assert.deepEqual(g.shape?.messageVerbs, off)
		assert.doesNotThrow(() =>
			describeInletDefinition({
				id: 'test.floors:inlet/final@1',
				i18n: { name: { en: 'Final' } },
				sessionShape: { messageVerbs: off },
				ports: { out: { main: S.json } },
			}),
		)
	})
})

describe('the five built-in specs', () => {
	const specs = {
		delete: builtinDeleteSpec,
		hide: builtinHideSpec,
		edit: builtinEditSpec,
		swipe: builtinSwipeSpec,
		branch: builtinBranchSpec,
	} as const

	test('each compiles clean, under its declared id, as one inlet straight into one outlet', () => {
		for (const [kind, build] of Object.entries(specs) as Array<
			[keyof typeof specs, () => ReturnType<typeof compile>]
		>) {
			const doc = build()
			assert.equal(doc.id, BUILTIN_SPEC_IDS[kind])
			const errors = validate(doc).filter((f) => f.severity === 'error')
			assert.deepEqual(errors, [], `${kind}: ${errors.map((e) => e.message).join('; ')}`)
			const inlets = doc.nodes.filter((n) => n.kind === 'inlet')
			const outlets = doc.nodes.filter((n) => n.kind === 'outlet')
			assert.equal(inlets.length, 1, `${kind} has one inlet`)
			assert.equal(outlets.length, 1, `${kind} has one outlet`)
			assert.equal(doc.nodes.length, 2, `${kind} has nothing between`)
			assert.equal(`${inlets[0]!.definitionId}@${inlets[0]!.definitionVersion}`, C.builtInRequest.id)
			assert.equal(
				`${outlets[0]!.definitionId}@${outlets[0]!.definitionVersion}`,
				BUILTIN_OUTLET_IDS[kind],
			)
		}
	})

	test('the outlet ids the SDK names are registered write outlets', () => {
		for (const id of Object.values(BUILTIN_OUTLET_IDS)) {
			const d = getDefinition(id)
			assert.ok(d, `${id} is registered`)
			assert.equal(d.kind, 'outlet')
			assert.equal(d.effects, 'write')
			assert.ok(isBuiltInOutlet(id))
		}
		assert.equal(isBuiltInOutlet('core:outlet/create-message@1'), false)
		for (const id of Object.values(BUILTIN_SPEC_IDS)) assert.ok(isBuiltInSpec(id))
		assert.equal(isBuiltInSpec('core:spec/respond'), false)
	})
})

describe('a built-in outlet belongs to its own spec (W8)', () => {
	test('validate() refuses delete-message in any other document, naming the future permission', () => {
		const doc = compile(
			spec('acme.tidy:spec/sweep', { version: '1.0.0' })
				.inlet('input', C.builtInRequest.v1())
				.outlet('write', ($) => C.deleteMessage.v1({ target: $.input.target }))
				.build(),
		)
		const found = validate(doc).filter((f) => f.law === 'R-15')
		assert.equal(found.length, 1)
		assert.equal(found[0]!.severity, 'error')
		assert.equal(found[0]!.nodeKey, 'write')
		assert.match(found[0]!.message, /built-in write/)
		assert.match(found[0]!.message, /core:spec\/builtin-\*/)
		assert.match(found[0]!.fix, /manifest permission/)
	})

	test('the five built-in documents themselves pass', () => {
		for (const build of [
			builtinDeleteSpec,
			builtinHideSpec,
			builtinEditSpec,
			builtinSwipeSpec,
			builtinBranchSpec,
		])
			assert.deepEqual(
				validate(build()).filter((f) => f.law === 'R-15'),
				[],
			)
	})
})

describe('identity is not reviewable (C1)', () => {
	const declared = {
		delete: [],
		hide: ['hidden'],
		edit: ['text'],
		swipe: ['text'],
		branch: ['title'],
	} as const

	test('each built-in outlet declares its reviewable fields, and no identity field is among them', () => {
		for (const [kind, fields] of Object.entries(declared)) {
			const d = getDefinition(BUILTIN_OUTLET_IDS[kind as keyof typeof declared])!
			assert.deepEqual([...d.review!.fields], [...fields], kind)
			for (const identity of ['target', 'fromMessage', 'index'])
				assert.ok(!d.review!.fields.includes(identity), `${kind} never offers ${identity}`)
		}
	})

	test('the form a reviewer sees for a delete has no target; for an edit only the text', () => {
		const del = reviewSchemaFor(getDefinition(BUILTIN_OUTLET_IDS.delete), {
			target: { id: 41 },
		})
		assert.deepEqual(del, {})
		const edit = reviewSchemaFor(getDefinition(BUILTIN_OUTLET_IDS.edit), {
			target: { id: 41 },
			text: 'The gate is new.',
		})
		assert.deepEqual(Object.keys(edit), ['text'])
		const swipe = reviewSchemaFor(getDefinition(BUILTIN_OUTLET_IDS.swipe), {
			target: { id: 41 },
			index: 2,
		})
		assert.deepEqual(swipe, {})
	})

	test('a submission naming an undeclared field is reported; a declared one is not', () => {
		const d = getDefinition(BUILTIN_OUTLET_IDS.edit)
		assert.deepEqual(undeclaredReviewFields(d, { target: 99, text: 'x' }), ['target'])
		assert.deepEqual(undeclaredReviewFields(d, { text: 'x' }), [])
		assert.deepEqual(undeclaredReviewFields(d, undefined), [])
		assert.deepEqual(undeclaredReviewFields(getDefinition(BUILTIN_OUTLET_IDS.delete), { target: 99 }), [
			'target',
		])
	})

	test('absent a declaration, the whole payload is the form and nothing is undeclared', () => {
		// Every core definition declares its fields since U5d (the review-fields
		// rule, `sdk-tests/forms.test.ts`), so the inference fallback is shown
		// on a definition with none — the shape a plugin's gets.
		const d = { id: 'acme:outlet/loose@1', effects: 'write', review: undefined } as const
		const schema = reviewSchemaFor(d, { name: 'The Gate', content: 'Sealed.' })
		assert.deepEqual(Object.keys(schema).sort(), ['content', 'name'])
		assert.deepEqual(undeclaredReviewFields(d, { anything: 1 }), [])
		// And the lore entry's write, which used to be the example here,
		// now declares exactly the two.
		assert.deepEqual(getDefinition('core:outlet/create-lore-entry@1')?.review?.fields, [
			'name',
			'content',
		])
	})
})

describe("the prefill extend and the turn control are switched separately (lair pass B7, D4)", () => {
	const verbs = (g: { shape?: unknown }) =>
		((g.shape as { messageVerbs?: Record<string, boolean> } | undefined)?.messageVerbs ?? {})

	const offered = (g: { shape?: unknown }) =>
		Object.fromEntries(
			Object.entries(resolveTurnControls(g.shape)).map(([k, v]) => [k, v.offered]),
		)

	test('the Lair switches the prefill extend off and keeps the turn control', () => {
		assert.equal(verbs(lairGenre).extend, false)
		assert.equal(resolveTurnControls(lairGenre.shape).advance.offered, true)
	})

	test('Chat and Adventure still offer both, and keep their turn controls (B8)', () => {
		for (const g of [chatGenre, adventureGenre]) {
			assert.notEqual(verbs(g).extend, false, g.id)
			for (const t of TURN_CONTROLS)
				assert.deepEqual(resolveTurnControls(g.shape)[t].presentWhen, [], `${g.id} ${t}`)
		}
		// Chat: Continue and Pick; its narrator is the narrate spec, not a turn.
		assert.deepEqual(offered(chatGenre), { advance: true, pick: true, narrate: false, retake: false })
		// Adventure: a narrator genre, so the narrator is a turn to hand over.
		assert.deepEqual(offered(adventureGenre), { advance: true, pick: true, narrate: true, retake: false })
	})

	test('resolveTurnControls: undeclared is the shape default, only an explicit false takes one away', () => {
		const withCast = { characters: { min: 0 } }
		assert.deepEqual(offered({ shape: undefined }), { advance: true, pick: true, narrate: false, retake: false })
		assert.deepEqual(offered({ shape: { ...withCast, turnControls: 'nope' } }), {
			advance: true,
			pick: true,
			narrate: false,
			retake: false,
		})
		assert.deepEqual(offered({ shape: { ...withCast, turnControls: { advance: false } } }), {
			advance: false,
			pick: true,
			narrate: false,
			retake: false,
		})
		// No character system (Guide): nobody to continue as or pick.
		assert.deepEqual(offered({ shape: { characters: { min: 0, max: 0 } } }), {
			advance: false,
			pick: false,
			narrate: false,
			retake: false,
		})
		// A narrator: the narrator's turn is on unless declared off.
		assert.deepEqual(offered({ shape: { ...withCast, voice: 'narrator' } }), {
			advance: true,
			pick: true,
			narrate: true,
			retake: false,
		})
		assert.equal(
			offered({ shape: { ...withCast, voice: 'narrator', turnControls: { narrate: false } } }).narrate,
			false,
		)
	})
})

describe('turn controls carry a presence condition (lair pass B8, D2/D3)', () => {
	// Present-when is core machinery with no shipped user since the Lair went
	// cast only (R12, 2026-09-28): a synthetic genre shape carries the case.
	const inX = { session: { fields: { mode: 'x' } } }
	const inY = { session: { fields: { mode: 'y' } } }
	const synthetic = {
		characters: { min: 0 },
		voice: 'narrator',
		turnControls: {
			advance: true,
			pick: {
				presentWhen: {
					on: 'session.fields.mode',
					equals: 'x',
					reason: { en: 'Pick who speaks is for mode x.' },
				},
			},
			narrate: true,
		},
	}

	test('a control with a present-when is present while it holds, hidden with its reason while not', () => {
		const p = resolveTurnControls(synthetic as any)
		assert.deepEqual(turnControlPresent(p, 'advance', inY), { present: true })
		assert.deepEqual(turnControlPresent(p, 'narrate', inY), { present: true })
		assert.deepEqual(turnControlPresent(p, 'pick', inX), { present: true })
		const hidden = turnControlPresent(p, 'pick', inY)
		assert.equal(hidden.present, false)
		assert.match(String((hidden as any).reason?.en), /mode x/)
		assert.doesNotThrow(() => assertTurnControls(synthetic as any, 'synthetic'))
	})

	test('the Lair: Continue, Pick and Narrate all present (cast only, R12)', () => {
		const p = resolveTurnControls(lairGenre.shape)
		for (const doc of [inX, inY, { session: { fields: { turnStyle: 'narrator' } } }]) {
			assert.deepEqual(turnControlPresent(p, 'advance', doc), { present: true })
			assert.deepEqual(turnControlPresent(p, 'pick', doc), { present: true })
			assert.deepEqual(turnControlPresent(p, 'narrate', doc), { present: true })
		}
	})

	test('a control the genre does not offer is absent with no reason', () => {
		const p = resolveTurnControls(chatGenre.shape)
		assert.deepEqual(turnControlPresent(p, 'narrate', inX), { present: false, reason: null })
	})

	test('a declaration is judged: unknown control, bad value, item.* present-when', () => {
		assert.throws(() => assertTurnControls({ turnControls: { dance: true } } as any, 'x'), /not a turn control/)
		assert.throws(() => assertTurnControls({ turnControls: { pick: 'yes' } } as any, 'x'), /presentWhen/)
		assert.throws(
			() =>
				assertTurnControls(
					{ turnControls: { pick: { presentWhen: { on: 'item.role', equals: 'user', reason: 'x' } } } } as any,
					'x',
				),
			/acts on no row/,
		)
		assert.doesNotThrow(() => assertTurnControls(lairGenre.shape, 'lair'))
	})
})
