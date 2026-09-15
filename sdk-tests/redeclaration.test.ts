/**
 * Re-declaring the same thing is not a conflict.
 *
 * Every registry in the SDK refuses a second declaration under an id it already
 * holds, and that refusal is right for the case it was written for: two
 * *different* declarations claiming one id means one of them silently wins, and
 * which one depends on load order. It was wrong for the case nobody had in mind
 * — a module re-evaluating with the same source, which is what a dev server's
 * hot reload does every time an app file importing `@serene-pub/contracts` is
 * saved. The declarations were byte-identical; the registry threw on the first
 * id anyway, the reload failed, and the server retried in a loop.
 *
 * So the rule is content, not arrival: identical is accepted and replaces the
 * entry, different still throws, and the message now names both hashes so the
 * author can see that the two declarations really do differ.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
	describeTaskType,
	describeEntryType,
	getType,
	allTypes,
	defineFacet,
	getFacet,
	allFacets,
	defineVariable,
	getVariable,
	defineScriptType,
	getScriptType,
	defineEvent,
	getEvent,
	allEvents,
	defineEngine,
	getEngine,
	defineWireFormat,
	getWireFormat,
	type AllocatedContext,
	type TemplateEngine,
	type WireFormat,
} from '@serene-pub/sdk'

const TEXT = 'core:shape/text@1'
const JSON_SHAPE = 'core:shape/json@1'

/** The refusal has to show its working: two hashes, and they must differ. */
const namesBothHashes = (message: string): boolean => {
	const m = /registered ([0-9a-f]+), redeclared ([0-9a-f]+)/.exec(message)
	return !!m && m[1] !== m[2]
}

describe('re-declaration is idempotent when the declaration is identical', () => {
	test('a descriptor declared twice does not throw, and the registry holds one entry', () => {
		const declare = () =>
			describeTaskType({
				id: 'test:task/same@1',
				i18n: { name: { en: 'Same' } },
				ports: { in: { text: TEXT }, out: { text: TEXT } },
			})
		const first = declare()
		const second = declare()
		assert.equal(allTypes().filter((t) => t.id === 'test:task/same@1').length, 1)
		// The *second* object is what the registry keeps. Returning the first
		// would hand a re-evaluated module a descriptor from the module it
		// replaced — see the display-text case below for what that costs.
		assert.equal(getType('test:task/same@1'), second)
		assert.notEqual(first, second)
	})

	test('a different descriptor under an existing id still throws, naming both hashes', () => {
		describeTaskType({ id: 'test:task/drift@1', ports: { out: { text: TEXT } } })
		assert.throws(
			() =>
				describeTaskType({
					id: 'test:task/drift@1',
					ports: { out: { text: JSON_SHAPE } },
				}),
			(e: Error) =>
				/duplicate type id: test:task\/drift@1/.test(e.message) &&
				namesBothHashes(e.message),
		)
		// Refused, so the first declaration is still what the registry holds.
		assert.equal(getType('test:task/drift@1')!.ports.out!.text, TEXT)
	})

	test('display text is not content — a relabelled re-declaration is accepted, and its label wins', () => {
		describeTaskType({ id: 'test:task/label@1', i18n: { name: { en: 'Before' } }, ports: {} })
		describeTaskType({ id: 'test:task/label@1', i18n: { name: { en: 'After' } }, ports: {} })
		assert.deepEqual(getType('test:task/label@1')!.i18n!.name, { en: 'After' })
	})

	/**
	 * The word `title` means two opposite things inside one `Descriptor`, and
	 * this pins the half that is contract.
	 *
	 * `PanelDecl.title` is a heading and would be display text; `EntryRoles.title`
	 * is *which field* the engine reads as a row's display title, and moving it
	 * changes what an untouched install does — an `@N+1` on purpose. So `title`
	 * is deliberately not in the descriptor registry's display list. Anyone
	 * tempted to add it, to free the panel heading, fails here first.
	 */
	test('a field role named `title` is contract, not display text', () => {
		describeEntryType({
			id: 'core:entry/redeclaration-probe@1',
			roles: { title: 'name' },
			sourceKind: 'worldLore',
		})
		assert.throws(
			() =>
				describeEntryType({
					id: 'core:entry/redeclaration-probe@1',
					roles: { title: 'heading' },
					sourceKind: 'worldLore',
				}),
			(e: Error) =>
				/duplicate type id: core:entry\/redeclaration-probe@1/.test(e.message) &&
				namesBothHashes(e.message),
		)
		assert.equal(getType('core:entry/redeclaration-probe@1')!.entryShape!.roles.title, 'name')
	})

	test('a facet', () => {
		const declare = () => defineFacet({ id: 'test:facet', i18n: { en: 'Test' }, order: 99 })
		declare()
		declare()
		assert.equal(allFacets().filter((f) => f.id === 'test:facet').length, 1)
		assert.equal(getFacet('test:facet')!.order, 99)
		assert.throws(
			() => defineFacet({ id: 'test:facet', i18n: { en: 'Test' }, order: 98 }),
			(e: Error) =>
				/duplicate facet: test:facet/.test(e.message) && namesBothHashes(e.message),
		)
	})

	test('a variable', () => {
		const declare = () =>
			defineVariable({
				id: 'test:var/thing@1',
				scope: { thing: 'any' },
				sample: { thing: 'x' },
			})
		declare()
		declare()
		assert.equal(getVariable('test:var/thing@1')!.id, 'test:var/thing@1')
		assert.throws(
			() =>
				defineVariable({
					id: 'test:var/thing@1',
					scope: { thing: 'any' },
					sample: { thing: 'y' },
				}),
			(e: Error) =>
				/duplicate variable id: test:var\/thing@1/.test(e.message) &&
				namesBothHashes(e.message),
		)
	})

	test('a script type', () => {
		const declare = () =>
			defineScriptType({
				id: 'test:script:text/twice@1',
				blastRadius: { en: 'none' },
				semantics: 'transform',
				ports: { in: { text: TEXT }, out: { text: TEXT } },
			})
		declare()
		declare()
		assert.equal(getScriptType('test:script:text/twice@1')!.semantics, 'transform')
		assert.throws(
			() =>
				defineScriptType({
					id: 'test:script:text/twice@1',
					blastRadius: { en: 'none' },
					semantics: 'verdict',
					ports: { in: { text: TEXT }, out: { text: TEXT } },
				}),
			(e: Error) =>
				/duplicate script type id: test:script:text\/twice@1/.test(e.message) &&
				namesBothHashes(e.message),
		)
	})

	/**
	 * `blastRadius` is the badge the script panel shows — display text, and
	 * `ScriptTypeDecl` says so in as many words. It sits beside `i18n` rather
	 * than inside it because it is required on every type and `i18n` is not, so
	 * the generic strip never saw it: re-badging a script threw `duplicate
	 * script type id` and put the reload loop straight back.
	 */
	test('a script type re-badged — blastRadius is display text, and the fresher wording wins', () => {
		defineScriptType({
			id: 'test:script:text/badge@1',
			blastRadius: { en: 'Rewrites content' },
			semantics: 'transform',
			ports: { in: { text: TEXT }, out: { text: TEXT } },
		})
		defineScriptType({
			id: 'test:script:text/badge@1',
			blastRadius: { en: 'Rewrites the reply before you see it' },
			semantics: 'transform',
			ports: { in: { text: TEXT }, out: { text: TEXT } },
		})
		assert.deepEqual(getScriptType('test:script:text/badge@1')!.blastRadius, {
			en: 'Rewrites the reply before you see it',
		})
	})

	test('a script type whose ports moved still throws, however it is badged', () => {
		defineScriptType({
			id: 'test:script:text/drift@1',
			blastRadius: { en: 'Rewrites content' },
			semantics: 'transform',
			ports: { in: { text: TEXT }, out: { text: TEXT } },
		})
		assert.throws(
			() =>
				defineScriptType({
					id: 'test:script:text/drift@1',
					blastRadius: { en: 'Rewrites content, but differently worded' },
					semantics: 'transform',
					ports: { in: { text: TEXT }, out: { text: JSON_SHAPE } },
				}),
			(e: Error) =>
				/duplicate script type id: test:script:text\/drift@1/.test(e.message) &&
				namesBothHashes(e.message),
		)
		// Refused, so the first declaration is still what the registry holds.
		assert.equal(getScriptType('test:script:text/drift@1')!.ports.out.text, TEXT)
	})

	/**
	 * `label` is what `SettingsSchema` calls the canonical display key (`i18n`
	 * is its deprecated alias), so a field label two levels down inside a slot
	 * is exactly the "editing a label" case hash.ts promises will not put the
	 * loop back.
	 */
	test('a descriptor whose slot field was relabelled — display text, however deep it sits', () => {
		describeTaskType({
			id: 'test:task/deep-label@1',
			ports: {},
			slots: {
				params: {
					kind: 'parameters',
					schema: { topK: { type: 'integer', label: 'Top K' } },
				},
			},
		})
		describeTaskType({
			id: 'test:task/deep-label@1',
			ports: {},
			slots: {
				params: {
					kind: 'parameters',
					schema: { topK: { type: 'integer', label: 'How many to keep' } },
				},
			},
		})
		assert.equal(
			getType('test:task/deep-label@1')!.slots!.params!.schema!.topK!.label,
			'How many to keep',
		)
		// The schema itself is still contract.
		assert.throws(
			() =>
				describeTaskType({
					id: 'test:task/deep-label@1',
					ports: {},
					slots: {
						params: {
							kind: 'parameters',
							schema: { topK: { type: 'number', label: 'How many to keep' } },
						},
					},
				}),
			(e: Error) =>
				/duplicate type id: test:task\/deep-label@1/.test(e.message) &&
				namesBothHashes(e.message),
		)
	})

	test('an event — and the re-declaration does not burn a second id', () => {
		const declare = () =>
			defineEvent({
				slug: 'test-happened',
				version: 1,
				family: 'data',
				affectsUser: true,
				description: 'A test happened.',
			})
		const first = declare()
		const second = declare()
		assert.equal(allEvents().filter((e) => e.slug === 'test-happened').length, 1)
		// The sequence is the row identity core seeds against, so an identical
		// re-declaration must not consume one.
		assert.equal(second.id, first.id)
		assert.equal(getEvent('test-happened')!.id, first.id)
		assert.throws(
			() =>
				defineEvent({
					slug: 'test-happened',
					version: 2,
					family: 'data',
					affectsUser: true,
					description: 'A test happened.',
				}),
			(e: Error) =>
				/duplicate event slug 'test-happened'/.test(e.message) &&
				namesBothHashes(e.message),
		)
	})

	test('a template engine — whose content is functions JSON cannot see', () => {
		const declare = (): TemplateEngine =>
			defineEngine({
				id: 'test:template/echo@1',
				label: 'Echo',
				render: (source) => source,
				extract: () => [],
				check: () => [],
				costProfile: (source, count) => ({
					fixed: count(source),
					perIteration: {},
					exact: true,
				}),
			})
		declare()
		declare()
		assert.equal(getEngine('test:template/echo@1')!.render('hi', {}), 'hi')
		assert.throws(
			() =>
				defineEngine({
					id: 'test:template/echo@1',
					label: 'Echo',
					render: (source) => source.toUpperCase(),
					extract: () => [],
					check: () => [],
					costProfile: (source, count) => ({
						fixed: count(source),
						perIteration: {},
						exact: true,
					}),
				}),
			(e: Error) =>
				/duplicate template engine id: test:template\/echo@1/.test(e.message) &&
				namesBothHashes(e.message),
		)
	})

	test('a template engine renamed in the language picker — its label is display text', () => {
		const render = (source: string) => source
		defineEngine({
			id: 'test:template/relabel@1',
			label: 'Echo',
			render,
			extract: () => [],
			check: () => [],
			costProfile: (source, count) => ({
				fixed: count(source),
				perIteration: {},
				exact: true,
			}),
		})
		defineEngine({
			id: 'test:template/relabel@1',
			label: 'Echo (verbatim)',
			render,
			extract: () => [],
			check: () => [],
			costProfile: (source, count) => ({
				fixed: count(source),
				perIteration: {},
				exact: true,
			}),
		})
		assert.equal(getEngine('test:template/relabel@1')!.label, 'Echo (verbatim)')
	})

	test('a wire format renamed in the picker — same reason', () => {
		const format = (ctx: AllocatedContext) => ctx.blocks.map((b) => b.rendered).join('\n')
		defineWireFormat({ id: 'test:wire/relabel@1', label: 'None', format, overhead: () => 0 })
		defineWireFormat({
			id: 'test:wire/relabel@1',
			label: 'Plain concatenation',
			format,
			overhead: () => 0,
		})
		assert.equal(getWireFormat('test:wire/relabel@1')!.label, 'Plain concatenation')
	})

	test('a wire format — same reason', () => {
		const declare = (): WireFormat =>
			defineWireFormat({
				id: 'test:wire/none@1',
				label: 'None',
				format: (ctx) => ctx.blocks.map((b) => b.rendered).join('\n'),
				overhead: () => 0,
			})
		declare()
		declare()
		assert.equal(
			getWireFormat('test:wire/none@1')!.overhead({} as any, () => 0),
			0,
		)
		assert.throws(
			() =>
				defineWireFormat({
					id: 'test:wire/none@1',
					label: 'None',
					format: (ctx) => ctx.blocks.map((b) => b.rendered).join(' '),
					overhead: () => 0,
				}),
			(e: Error) =>
				/duplicate wire format id: test:wire\/none@1/.test(e.message) &&
				namesBothHashes(e.message),
		)
	})
})
