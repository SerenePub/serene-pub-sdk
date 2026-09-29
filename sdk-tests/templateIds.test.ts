/**
 * Template ids, and the templates an extension ships under them (R19).
 *
 * Before this, an extension could ship `pipelines` and had no way at all to
 * ship a template row one of them references — so a plugin's pipeline started
 * on core's prompt, written for core's pipeline, or on nothing. And a spec
 * added to somebody else's genre had no stable name for that genre's prompt
 * except a bare `seedKey`, which carries no owner: nobody can version one and
 * anybody can collide with one.
 *
 * What is pinned here:
 *
 *  1. **The grammar.** `owner:template/name@major`, the attribute slot id's
 *     grammar exactly one kind segment over, and `parseTemplateId` splits it.
 *  2. **Ownership is refused at authoring time**, with the same sentence a
 *     foreign node definition gets — including `core:`, which no plugin may
 *     claim even if it manages to call itself `core`.
 *  3. **Each kind is held to its own shape.** A prompts row's `body` is field
 *     name → prose and has no engine; a context template and a variable layout
 *     carry a source and MUST say what language it is in, because a stored
 *     template keeps the language it was authored in and a Liquid source in a
 *     Handlebars slot renders `{% %}` at the model as prose.
 *  4. **The id is the sync key**, so two entries under one id are refused here
 *     rather than racing to be the row on every enable.
 *
 * ⚠ Validation here is ADVISORY. Install stores a manifest verbatim, so the
 * instance applies `templateSeedProblems` again where the row is written —
 * which is why the rule is exported rather than inlined into `defineExtension`.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
	defineExtension,
	ExtensionError,
	isTemplateId,
	parseTemplateId,
	templateSeedProblems,
	TEMPLATE_ID,
	type TemplateSeed,
} from '@serene-pub/sdk'

const SLUG = 'chariot.dice-tray'

const base = { slug: SLUG, name: 'Dice Tray', version: '1.2.0' }

const withTemplates = (...templates: TemplateSeed[]) =>
	defineExtension({ ...base, templates })

const prompt = (over: Partial<TemplateSeed> = {}): TemplateSeed => ({
	id: `${SLUG}:template/table-narration@1`,
	kind: 'prompts',
	nodeDefinitionId: 'core:task/build-template-context',
	slot: 'prompts',
	body: { systemPrompt: 'Narrate the roll.' },
	label: 'Table narration',
	...over,
})

describe('the template id grammar', () => {
	test('it is the attribute slot id one kind over', () => {
		assert.ok(TEMPLATE_ID.test('core:template/pipeline-context-template-core-default@1'))
		assert.ok(TEMPLATE_ID.test('chariot.dice-tray:template/table-narration@2'))
		assert.ok(isTemplateId('a:template/b@10'))
	})

	test('it refuses what would make an id ambiguous', () => {
		for (const bad of [
			'chariot.dice-tray:template/Table-Narration@1', // capitals
			'chariot.dice-tray:template/table_narration@1', // underscore
			'chariot.dice-tray:template/table-narration', // unpinned
			'chariot.dice-tray:slot/table-narration@1', // another kind
			'template/table-narration@1', // no owner
			'chariot.dice-tray:template/-leading@1',
		])
			assert.equal(isTemplateId(bad), false, bad)
	})

	test('parseTemplateId splits the three parts, and nothing else', () => {
		assert.deepEqual(parseTemplateId('chariot.dice-tray:template/table-narration@3'), {
			owner: 'chariot.dice-tray',
			name: 'table-narration',
			major: 3,
		})
		assert.equal(parseTemplateId('core:slot/mood@1'), null)
		assert.equal(parseTemplateId(undefined), null)
	})
})

describe('an extension ships templates beside its pipelines', () => {
	test('a well-formed declaration is carried onto the extension as written', () => {
		const ext = withTemplates(prompt())
		assert.equal(ext.templates?.length, 1)
		assert.equal(ext.templates?.[0]!.id, `${SLUG}:template/table-narration@1`)
	})

	test('all three kinds are shippable — a prompt, a context template, a variable layout', () => {
		const ext = withTemplates(
			prompt(),
			{
				id: `${SLUG}:template/table-context@1`,
				kind: 'template',
				nodeDefinitionId: 'core:task/assemble',
				engine: 'core:template/handlebars@1',
				body: '{{{instructions}}}',
			},
			{
				id: `${SLUG}:template/dice-cast@1`,
				kind: 'variables',
				variableId: 'core:var/characters@1',
				engine: 'core:template/handlebars@1',
				body: '{{{json characters 2}}}',
			},
		)
		assert.equal(ext.templates?.length, 3)
	})

	test('a template under someone else’s namespace is refused, and says why it matters', () => {
		assert.throws(
			() => withTemplates(prompt({ id: 'acme.other:template/table-narration@1' })),
			(e: Error) =>
				e instanceof ExtensionError &&
				/ownership is what lets an update replace your rows/i.test(e.message),
		)
	})

	test('`core:` is reserved, and saying so is not the same as saying “foreign”', () => {
		assert.throws(
			() => withTemplates(prompt({ id: 'core:template/table-narration@1' })),
			/claims the 'core' namespace, which is reserved/,
		)
	})

	test('an id that is not an id names the shape it should have had', () => {
		assert.throws(
			() => withTemplates(prompt({ id: `${SLUG}:template/table narration` })),
			/is not a template id/,
		)
	})

	test('two entries under one id are refused — the id is the sync key', () => {
		assert.throws(
			() => withTemplates(prompt(), prompt({ label: 'Another' })),
			/duplicate template id/,
		)
	})
})

describe('each kind is held to its own shape', () => {
	test('a prompts row carries fields, not a source, and declares no engine', () => {
		assert.throws(() => withTemplates(prompt({ body: 'Narrate the roll.' })), /field name → prose/)
		assert.throws(
			() => withTemplates(prompt({ engine: 'core:template/handlebars@1' })),
			/Prompts are authored text fields/,
		)
	})

	test('a prompts row names both halves of its pool', () => {
		assert.throws(() => withTemplates(prompt({ nodeDefinitionId: undefined })), /names no nodeDefinitionId/)
		assert.throws(() => withTemplates(prompt({ slot: undefined })), /names no slot/)
	})

	test('a context template must say what language its source is in', () => {
		assert.throws(
			() =>
				withTemplates({
					id: `${SLUG}:template/table-context@1`,
					kind: 'template',
					nodeDefinitionId: 'core:task/assemble',
					body: '{{{instructions}}}',
				}),
			/declares no engine/,
		)
	})

	test('a variable layout is keyed by what it renders, never by a node', () => {
		assert.throws(
			() =>
				withTemplates({
					id: `${SLUG}:template/dice-cast@1`,
					kind: 'variables',
					nodeDefinitionId: 'core:task/assemble',
					engine: 'core:template/handlebars@1',
					body: '{{{json characters 2}}}',
				}),
			/names no variableId/,
		)
	})

	test('an unknown kind is named with the three that exist', () => {
		assert.throws(
			() => withTemplates(prompt({ kind: 'prompt' as never })),
			/'prompts', 'template' or 'variables'/,
		)
	})
})

describe('the rule is exported, because the instance has to apply it again', () => {
	test('templateSeedProblems is the one statement of it', () => {
		// Install stores a manifest verbatim; author-side validation is advisory.
		assert.deepEqual(templateSeedProblems(prompt(), SLUG), [])
		const problems = templateSeedProblems(prompt({ id: 'acme.other:template/x@1' }), SLUG)
		assert.equal(problems.length, 1)
		assert.match(problems[0]!, /sits under namespace 'acme.other'/)
	})

	test('it accumulates rather than stopping at the first thing wrong', () => {
		const problems = templateSeedProblems(
			{ id: 'nope', kind: 'template', body: 42 as never },
			SLUG,
		)
		assert.ok(problems.length >= 3, problems.join(' | '))
	})
})
