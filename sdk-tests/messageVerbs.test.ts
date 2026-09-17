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
} from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import {
	builtinDeleteSpec,
	builtinHideSpec,
	builtinEditSpec,
	builtinSwipeSpec,
	builtinBranchSpec,
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
		const d = getDefinition('core:outlet/create-lore-entry@1')
		assert.ok(d)
		assert.equal(d.review, undefined)
		const schema = reviewSchemaFor(d, { name: 'The Gate', content: 'Sealed.' })
		assert.deepEqual(Object.keys(schema).sort(), ['content', 'name'])
		assert.deepEqual(undeclaredReviewFields(d, { anything: 1 }), [])
	})
})
