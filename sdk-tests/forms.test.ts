/**
 * Forms and the effects line (plans/29 R-15 *Forms* · *The line* · *The
 * review gate*; R-21 (5); 09-B B9, F39; plans/30 U5d, 2026-09-17).
 *
 * What is pinned:
 *
 *  1. **A form is a block with an addressee.** `choices` and `form` blocks
 *     carry `addressee`, `question` and `id`; the validator refuses an
 *     addressed question whose options carry no keys, a repeated key, an
 *     addressee that is not a participant reference, and an addressed form
 *     with no question.
 *  2. **The host's readers.** `formBlocksOf` / `findFormBlock` locate forms
 *     through groups; `undeclaredBlockFunctions` names the functions a spec
 *     declares no action for; `assignBlockIds` stamps ids and keeps given
 *     ones; `formAnswerSchema` is an enum of the option keys for `choices`
 *     and the field schema for `form`; `formFireOf` turns an answer into the
 *     fire a click would make, and refuses an answer naming no option.
 *  3. **The effects line.** A `world` action may declare only the composer,
 *     session-settings, admin and review venues, and an `act` audience of
 *     the owner or an admin — refused at construction, in `validate()` and in
 *     `announce.build()`; a block naming a `world` action is found by
 *     `worldBlockFunctions`.
 *  4. **Review fields.** Every shipped effectful definition declares
 *     `review.fields`; a new one without them registers with a finding
 *     (`definitionFindings`) and `validate()` warns on every placement.
 *  5. **`answer-form@1` belongs on `form-addressed@1`.** Placed under any
 *     other inlet it is refused by `validate()`.
 *  6. **The events exist.** `form-addressed` is a data event caused by the
 *     two message writes; `form-answered` is caused by `answer-form`; the
 *     genre surface offers `formAddressed` and every shipped preset binds it.
 */

import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
	allDefinitions,
	announce,
	AnnouncementError,
	assignBlockIds,
	blockFunctionsOf,
	checkMessageBlocks,
	compile,
	CORE_EVENTS,
	definitionFindings,
	describeOutletDefinition,
	effectsOf,
	findFormBlock,
	formAnswerSchema,
	formBlocksOf,
	formFireOf,
	pin,
	reviewFieldsFinding,
	S,
	sessionEvents,
	spec,
	stampBlockActions,
	undeclaredBlockFunctions,
	validate,
	WORLD_ACTION_VENUES,
	worldBlockFunctions,
	type MessageBlock,
	type SpecDocument,
} from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import { chatGenre, coreAnnouncement, CORE_SPECS } from '@serene-pub/core-catalog'

const CHAT = chatGenre.id

const asked = (over: Record<string, unknown> = {}): MessageBlock =>
	({
		kind: 'choices',
		addressee: 'character:12',
		question: 'Will you come to the festival?',
		actions: [
			{ fn: 'answer', label: 'Yes', choice: 'yes' },
			{ fn: 'answer', label: 'Maybe', choice: 'maybe' },
		],
		...over,
	}) as MessageBlock

const action = (over: Record<string, unknown> = {}) => ({
	key: 'answer',
	function: 'answer',
	genre: CHAT,
	venue: { kind: 'message' },
	label: { en: 'Answer' },
	...over,
})

const actionSpec = (id: string, actions: Array<Record<string, unknown>>) =>
	spec(id, { version: '1.0.0', contributes: { actions: actions as any } })
		.inlet('input', C.userMessage.v1(), { genre: chatGenre, event: sessionEvents.sessionAction })
		.outlet('save', ($) => C.createMessage.v1({ text: $.input.text }))

describe('R-15 · a form is a block with an addressee', () => {
	test('an addressed question with keyed options is clean', () => {
		assert.deepEqual(checkMessageBlocks([asked()]), [])
	})

	test('an addressed question needs a key on every option, distinct', () => {
		const missing = checkMessageBlocks([
			asked({ actions: [{ fn: 'answer', label: 'Yes' }] }),
		])
		assert.ok(missing.some((f) => f.path === 'blocks[0].actions[0].choice'))
		const repeated = checkMessageBlocks([
			asked({
				actions: [
					{ fn: 'answer', label: 'Yes', choice: 'yes' },
					{ fn: 'answer', label: 'Yes again', choice: 'yes' },
				],
			}),
		])
		assert.ok(repeated.some((f) => /repeats the option key/.test(f.message)))
		// Unaddressed buttons need no keys: they are what they were.
		assert.deepEqual(
			checkMessageBlocks([{ kind: 'choices', actions: [{ fn: 'go', label: 'Go' }] }]),
			[],
		)
	})

	test('the addressee is a participant reference and the question is required once addressed', () => {
		const bad = checkMessageBlocks([asked({ addressee: 'Tom' })])
		assert.ok(bad.some((f) => f.path === 'blocks[0].addressee'))
		const silent = checkMessageBlocks([asked({ question: undefined })])
		assert.ok(silent.some((f) => f.path === 'blocks[0].question'))
	})

	test('a form block is addressed the same way', () => {
		const f = checkMessageBlocks([
			{
				kind: 'form',
				fn: 'rsvp',
				addressee: 'envoy:mascot',
				question: 'How many?',
				fields: { count: { type: 'integer', min: 0 } },
			},
		])
		assert.deepEqual(f, [])
	})
})

describe('R-15 · the host reads forms off a tree', () => {
	test('forms are found through groups, and by id', () => {
		const tree: MessageBlock[] = [
			{ kind: 'md', text: 'A crossroads.' },
			{ kind: 'group', blocks: [asked({ id: 'q1' })] },
			{ kind: 'form', fn: 'rsvp', id: 'f1', fields: {} },
		]
		assert.deepEqual(
			formBlocksOf(tree).map((b) => b.id),
			['q1', 'f1'],
		)
		assert.equal(findFormBlock(tree, 'f1')?.kind, 'form')
		assert.equal(findFormBlock(tree, 'nope'), undefined)
		assert.deepEqual(blockFunctionsOf(tree), ['answer', 'rsvp'])
	})

	test('a function the spec declares no action for is named; a declared one is stamped', () => {
		const doc = compile(actionSpec('core:spec/festival', [action()]).build())
		assert.deepEqual(undeclaredBlockFunctions([asked()], doc), [])
		assert.deepEqual(
			undeclaredBlockFunctions([{ kind: 'form', fn: 'grant', fields: {} }], doc),
			['grant'],
		)
		const [stamped] = stampBlockActions([asked()], doc) as Array<
			Extract<MessageBlock, { kind: 'choices' }>
		>
		assert.deepEqual(
			stamped!.actions.map((a) => a.action),
			['core:spec/festival#answer', 'core:spec/festival#answer'],
		)
	})

	test('ids are stamped where absent and kept where given', () => {
		let n = 0
		const out = assignBlockIds([asked({ id: 'kept' }), { kind: 'group', blocks: [asked()] }], () =>
			`b${++n}`,
		)
		assert.equal((out[0] as any).id, 'kept')
		assert.equal((out[1] as any).blocks[0].id, 'b1')
	})

	test('the answer schema is an enum of the keys, or the field schema', () => {
		assert.deepEqual(formAnswerSchema(asked() as any), {
			type: 'object',
			properties: { choice: { type: 'string', enum: ['yes', 'maybe'] } },
			required: ['choice'],
			additionalProperties: false,
		})
		const form = formAnswerSchema({
			kind: 'form',
			fn: 'rsvp',
			fields: {
				count: { type: 'integer', min: 0, max: 4, required: true },
				mood: { type: 'enum', of: ['glad', 'wary'] },
				tags: { type: 'string[]' },
			},
		})
		assert.deepEqual(form, {
			type: 'object',
			properties: {
				count: { type: 'integer', minimum: 0, maximum: 4 },
				mood: { type: 'string', enum: ['glad', 'wary'] },
				tags: { type: 'array', items: { type: 'string' } },
			},
			required: ['count'],
			additionalProperties: false,
		})
	})

	test('an answer becomes the fire a click would make, or nothing', () => {
		const block = stampBlockActions(
			[asked()],
			compile(actionSpec('core:spec/festival', [action()]).build()),
		)[0] as any
		assert.deepEqual(formFireOf(block, { choice: 'maybe' }), {
			fn: 'answer',
			action: 'core:spec/festival#answer',
			payload: { choice: 'maybe' },
			label: 'Maybe',
		})
		assert.equal(formFireOf(block, { choice: 'never' }), null)
		assert.equal(formFireOf(block, 'maybe'), null)
		const form = { kind: 'form', fn: 'rsvp', action: 'x#rsvp', fields: {} } as any
		assert.deepEqual(formFireOf(form, { count: 2 }), {
			fn: 'rsvp',
			action: 'x#rsvp',
			payload: { count: 2 },
		})
	})
})

describe('R-15 · the effects line', () => {
	test("a 'world' action may not live in a message venue — at construction", () => {
		assert.throws(
			() => actionSpec('core:spec/grant', [action({ key: 'grant', function: 'grant', effects: 'world' })]),
			(e: Error) =>
				/'world' action may not appear in the 'message' venue/.test(e.message) &&
				WORLD_ACTION_VENUES.every((v) => e.message.includes(v)),
		)
		for (const kind of ['extra', 'widget'])
			assert.throws(
				() =>
					actionSpec('core:spec/grant', [
						action({ key: 'grant', function: 'grant', effects: 'world', venue: { kind } }),
					]),
				/'world' action may not appear/,
			)
	})

	test("a 'world' action's audience is the owner's or an admin's", () => {
		assert.throws(
			() =>
				actionSpec('core:spec/grant', [
					action({
						key: 'grant',
						function: 'grant',
						effects: 'world',
						venue: { kind: 'composer' },
						audience: { see: ['participant'], act: ['participant'] },
					}),
				]),
			/audience\.act names 'participant'/,
		)
		// The allowed shape compiles: composer, owner (the default) or admin.
		const doc = compile(
			actionSpec('core:spec/grant', [
				action({
					key: 'grant',
					function: 'grant',
					effects: 'world',
					venue: [{ kind: 'composer' }, { kind: 'review' }],
					audience: { see: ['participant'], act: ['owner', 'admin'] },
				}),
			]).build(),
		)
		assert.deepEqual(validate(doc).filter((f) => f.severity === 'error'), [])
	})

	test('a document from any other source gets the same answer in validate() and announce.build()', () => {
		const doc = compile(actionSpec('core:spec/grant', [action({ key: 'grant', function: 'grant' })]).build())
		// Patched after the builder saw it — an import, a hand-written JSON.
		const patched: SpecDocument = {
			...doc,
			contributes: { actions: [{ ...(doc.contributes as any).actions[0], effects: 'world' }] } as any,
		}
		const findings = validate(patched).filter((f) => f.law === 'R-15' && f.severity === 'error')
		assert.ok(findings.some((f) => /'world' action may not appear in the 'message' venue/.test(f.message)))
		assert.throws(
			() =>
				announce({ ns: 'core', author: 'a', title: 't', repo: 'r', summary: 's' })
					.genres({ chatGenre })
					.pipelines(patched)
					.build(),
			(e: Error) =>
				e instanceof AnnouncementError &&
				/'world' action may not appear in the 'message' venue/.test(e.message),
		)
	})

	test("a block naming a 'world' action is found; an unknown effects value is refused", () => {
		const doc = compile(
			actionSpec('core:spec/grant', [
				action({ key: 'grant', function: 'grant', effects: 'world', venue: { kind: 'composer' } }),
				action(),
			]).build(),
		)
		assert.deepEqual(worldBlockFunctions([asked(), { kind: 'form', fn: 'grant', fields: {} }], doc), ['grant'])
		assert.deepEqual(worldBlockFunctions([asked()], doc), [])
		assert.equal(effectsOf({ effects: 'world' }), 'world')
		assert.equal(effectsOf({}), 'fiction')
		assert.throws(
			() => actionSpec('core:spec/grant', [action({ effects: 'cosmic' })]),
			/'effects' is one of fiction, world/,
		)
	})
})

describe('R-15 · review fields are declared on every shipped effectful definition', () => {
	test('every registered effectful core definition declares review.fields', () => {
		// The catalog's compile registers everything the specs pin.
		coreAnnouncement()
		const effectful = allDefinitions().filter(
			(d) => d.effects === 'write' || d.effects === 'external',
		)
		assert.ok(effectful.length > 20)
		const missing = effectful.filter((d) => reviewFieldsFinding(d)).map((d) => d.id)
		assert.deepEqual(missing, [])
		assert.deepEqual(definitionFindings().filter((f) => /^core:/.test(f)), [])
		// The table, as declared: identity fields are never among them.
		const fields = (id: string) =>
			allDefinitions().find((d) => d.id === id)?.review?.fields
		assert.deepEqual(fields('core:outlet/create-message@1'), ['text'])
		assert.deepEqual(fields('core:outlet/update-message@1'), ['text'])
		assert.deepEqual(fields('core:outlet/delete-message@1'), [])
		assert.deepEqual(fields('core:outlet/answer-form@1'), ['answer'])
		assert.deepEqual(fields('core:oracle/generate-text@1'), [])
		assert.deepEqual(fields('core:oracle/generate-image@1'), ['prompt', 'negative'])
		assert.deepEqual(fields('core:outlet/create-lore-entry@1'), ['name', 'content'])
	})

	test('a new effectful definition without them registers with a finding, and validate() warns', () => {
		const loose = pin(
			describeOutletDefinition({
				id: 'acme:outlet/loose-write@1',
				effects: 'write',
				timeoutMs: 1000,
				ports: { in: { text: S.text }, out: { main: S.writeResult } },
			}),
		)
		assert.match(
			definitionFindings('acme:outlet/loose-write@1')[0] ?? '',
			/declares effects: 'write' and no review\.fields/,
		)
		const doc = compile(
			spec('acme:spec/loose', { version: '1.0.0' })
				.inlet('input', C.userMessage.v1(), { genre: chatGenre, event: sessionEvents.sessionAction })
				.outlet('save', ($) => loose.v1({ text: $.input.text }))
				.build(),
		)
		const warnings = validate(doc).filter((f) => f.severity === 'warning' && f.law === 'R-15')
		assert.ok(warnings.some((f) => f.nodeKey === 'save' && /no review\.fields/.test(f.message)))
	})
})

describe('R-15 · answer-form@1 belongs on form-addressed@1', () => {
	test('the shipped answer pipelines place it where it belongs', () => {
		for (const entry of CORE_SPECS.filter((s) => s.slug.startsWith('core:spec/answer-form-'))) {
			const doc: SpecDocument = entry.build()
			// R-15's own findings only: the gather-chain shape finding the
			// validator raises on every shipped spec reading
			// `$.gather.<chain>.read.messages` (guide-respond has it too) is
			// not this unit's.
			assert.deepEqual(
				validate(doc).filter((f) => f.severity === 'error' && f.law === 'R-15'),
				[],
				entry.slug,
			)
			assert.equal(doc.input?.event, sessionEvents.formAddressed)
			assert.ok(doc.nodes.some((n) => n.key === 'answer' && n.definitionId === 'core:outlet/answer-form'))
		}
	})

	test('placed under any other inlet it is refused', () => {
		const doc = compile(
			spec('acme:spec/sneaky', { version: '1.0.0' })
				.inlet('input', C.userMessage.v1(), { genre: chatGenre, event: sessionEvents.sessionAction })
				.outlet('answer', ($) =>
					C.answerForm.v1({
						form: $.input.payload,
						answer: $.input.payload,
						messageId: $.input.messageId,
					}),
				)
				.build(),
		)
		const errors = validate(doc).filter((f) => f.severity === 'error')
		assert.ok(
			errors.some(
				(f) =>
					f.nodeKey === 'answer' &&
					/only a pipeline on core:inlet\/form-addressed@1 has a form to answer/.test(f.message),
			),
		)
	})
})

describe('R-15 · the events and the surface', () => {
	test('form-addressed is caused by the message writes; form-answered by answer-form', () => {
		assert.equal(CORE_EVENTS.formAddressed.family, 'data')
		assert.deepEqual(CORE_EVENTS.formAddressed.causedBy, [
			'core:outlet/create-message',
			'core:outlet/update-message',
		])
		assert.equal(CORE_EVENTS.formAddressed.payload, S.formAddressed)
		assert.deepEqual(CORE_EVENTS.formAnswered.causedBy, ['core:outlet/answer-form'])
		assert.equal(sessionEvents.formAddressed, 'core:event/form-addressed@1')
	})

	test('every shipped genre offers the event, optional, and every shipped preset binds it', () => {
		const { document } = coreAnnouncement()
		for (const g of document.genres) {
			const decl = g.events?.[sessionEvents.formAddressed]
			assert.ok(decl, g.id)
			assert.equal(decl!.required ?? false, false)
		}
		for (const p of document.presets)
			assert.match(p.bindings[sessionEvents.formAddressed]?.spec ?? '', /^core:spec\/answer-form-/)
	})
})
