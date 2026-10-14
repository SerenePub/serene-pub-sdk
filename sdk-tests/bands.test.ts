/**
 * Typed templates P1 + P2 (2026-09-27): bands as template variables.
 *
 * A source declares the bands it publishes (`Descriptor.bands`), each with the
 * registered variable that lays it out. Declared, a band is a top-level
 * template name — so the key is an identifier, its variable's scope names it,
 * and it means one thing: every refusal here names the fix, and a collision
 * names both declarers. Assemble's `variables` slot is open
 * (`rendersBands`): `rendersAt` is its own `renders` plus every band declared
 * upstream of `candidates`, followed through concatenation and ranking.
 *
 * The compile-time half is the `@ts-expect-error` lines: the suite runs
 * `tsc --noEmit` first, so one of them compiling cleanly fails the build.
 */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import {
	BandCollisionError,
	S,
	bandsReaching,
	compile,
	definePluginVariable,
	genre,
	defineVariable,
	describeTaskDefinition,
	getVariable,
	isBandKey,
	pin,
	rendersAt,
	sessionEvents,
	slotToVarField,
	spec,
	varCharacterLore,
	varHistory,
	varRecalledLines,
	varWorldLore,
	templateLawFindings,
	variableSeedFindings,
	variablesOf,
	type ScopeValues,
	type VarValue,
} from '@serene-pub/sdk'
import { checkTemplateSourceReport } from '@serene-pub/sdk/template-check'
import * as C from '@serene-pub/contracts'

const PLUGIN = 'bandtest'

const varClue = definePluginVariable(PLUGIN, {
	id: 'bandtest:var/clue@1',
	i18n: { name: { en: 'Clue' } },
	scope: { clue: { type: 'record', of: { type: 'string' } } },
	sample: { 'The Brass Clock': 'It rings when nobody winds it.' },
})

const varOtherClue = definePluginVariable(PLUGIN, {
	id: 'bandtest:var/other-clue@1',
	scope: { clue: { type: 'record', of: { type: 'string' } } },
	sample: {},
})

/** A plugin source: candidates out, one declared band. */
const pickClue = pin(
	describeTaskDefinition({
		id: 'bandtest:task/pick-clue@1',
		timeoutMs: 500,
		bands: { clue: varClue },
		ports: { in: {}, out: { main: S.json, candidates: S.candidates } },
	}),
)

/** The same key as `pick-clue`, under a different variable. */
const rivalClue = pin(
	describeTaskDefinition({
		id: 'bandtest:task/rival@1',
		timeoutMs: 500,
		bands: { clue: varOtherClue },
		ports: { in: {}, out: { main: S.json, candidates: S.candidates } },
	}),
)

/** A plugin's own data set under core's `characterLore` key. */
const varPluginCharacterLore = definePluginVariable(PLUGIN, {
	id: 'bandtest:var/character-lore@1',
	scope: { characterLore: { type: 'record', of: { type: 'string' } } },
	sample: { Oath: 'Sworn at the gate.' },
})
const pluginCharacterLore = pin(
	describeTaskDefinition({
		id: 'bandtest:task/plugin-character-lore@1',
		timeoutMs: 500,
		bands: { characterLore: varPluginCharacterLore },
		ports: { in: {}, out: { main: S.json, candidates: S.candidates } },
	}),
)

describe('P2 · a band declaration is refused at definition, naming the fix', () => {
	test('a non-identifier key is refused, and the refusal suggests the identifier', () => {
		const v = definePluginVariable(PLUGIN, {
			id: 'bandtest:var/secret-entry@1',
			scope: { secretEntry: { type: 'string' } },
			sample: 'x',
		})
		assert.throws(
			() =>
				describeTaskDefinition({
					id: 'bandtest:task/dashed@1',
					bands: { 'secret-entry': v },
					ports: { out: { candidates: S.candidates } },
				}),
			/band 'secret-entry'.*identifier.*Rename it 'secretEntry'/s,
		)
		assert.equal(isBandKey('secretEntry'), true)
		assert.equal(isBandKey('secret-entry'), false)
		assert.equal(isBandKey('2nd'), false)
	})

	test('an undeclared key — its variable’s scope does not name it — is refused', () => {
		assert.throws(
			() =>
				describeTaskDefinition({
					id: 'bandtest:task/undeclared@1',
					bands: { hint: varClue },
					ports: { out: { candidates: S.candidates } },
				}),
			/band 'hint'.*scope does not declare 'hint'.*it declares 'clue'/s,
		)
	})

	test('a variable that was never registered is refused', () => {
		assert.throws(
			() =>
				describeTaskDefinition({
					id: 'bandtest:task/unregistered@1',
					bands: {
						ghost: { id: 'bandtest:var/ghost@1', scope: { ghost: 'any' }, sample: null },
					},
					ports: { out: { candidates: S.candidates } },
				}),
			/'bandtest:var\/ghost@1', which is not registered.*definePluginVariable/s,
		)
	})

	test('a key another definition declares with a different variable is accepted (owner ruling 2026-10-13, ★1)', () => {
		// One meaning per key is a per-document rule now: two definitions may
		// each mean their own `clue`, and only meeting in one template's scope
		// is refused — see "two sources meaning one key differently" below.
		// Declared here, after `pick-clue` already holds `clue` as another variable.
		assert.doesNotThrow(() =>
			describeTaskDefinition({
				id: 'bandtest:task/second-rival@1',
				bands: { clue: varOtherClue },
				ports: { out: { candidates: S.candidates } },
			}),
		)
		assert.equal(rivalClue.descriptor.bands?.clue, varOtherClue)
	})

	test('a key a core variable already renders is accepted at definition (★1)', () => {
		assert.equal(pluginCharacterLore.descriptor.bands?.characterLore, varPluginCharacterLore)
	})

	test('an Assemble-own name is refused', () => {
		const v = definePluginVariable(PLUGIN, {
			id: 'bandtest:var/budget@1',
			scope: { budget: 'any' },
			sample: null,
		})
		assert.throws(
			() =>
				describeTaskDefinition({
					id: 'bandtest:task/budget@1',
					bands: { budget: v },
					ports: { out: { candidates: S.candidates } },
				}),
			/collides with Assemble's own 'budget'/,
		)
	})
})

describe("P2 · core's three are declared bands", () => {
	test('the lore queries declare worldLore, characterLore and history with core’s variables', () => {
		assert.deepEqual(Object.keys(C.lorebookTriggers.descriptor.bands ?? {}).sort(), [
			'characterLore',
			'history',
			'worldLore',
		])
		assert.equal(C.worldLore.descriptor.bands?.worldLore, varWorldLore)
		assert.equal(C.characterLore.descriptor.bands?.characterLore, varCharacterLore)
		assert.equal(C.historyEntries.descriptor.bands?.history, varHistory)
		assert.equal(getVariable('core:var/character-lore@1'), varCharacterLore)
	})

	test("Assemble's variables slot is open, and lays characterLore out like its siblings", () => {
		assert.deepEqual(C.assemble.descriptor.slots?.variables?.rendersBands, { from: 'candidates' })
		assert.equal(
			C.assemble.descriptor.slots?.variables?.renders?.characterLore,
			'core:var/character-lore@1',
		)
	})
})

const bandGenre = genre('bandtest:genre/table', {
	name: { en: 'Table' },
	family: 'chat',
	events: { [sessionEvents.messageRespond]: { required: true } },
})

/** The Twenty Questions shape: lore + a plugin source, concatenated, ranked, assembled. */
const bandedSpec = () =>
	spec('bandtest:spec/respond', { version: '1.0.0' })
		.inlet('input', C.userMessage.v1(), { genre: bandGenre, event: sessionEvents.messageRespond })
		.query('lore', ($) => C.lorebookTriggers.v1({ scope: $.input.sessionScope }))
		.task('pick', () => pickClue.v1({}))
		.task('pool', ($) => C.concatCandidates.v1({ sources: [$.lore.hits, $.pick.candidates] as never }))
		.task('rank', ($) => C.rankHybrid.v1({ candidates: $.pool.candidates }))
		.task('prompt', ($) =>
			C.assemble.v2({ candidates: $.rank.candidates, decisions: $.rank.decisions }),
		)
		.build()

describe('P2 · Assemble’s renders is open', () => {
	test('it includes every band declared upstream of candidates, through concat and rank', () => {
		const doc = compile(bandedSpec())
		const reaching = bandsReaching(doc, 'prompt', 'candidates')
		assert.deepEqual(Object.keys(reaching).sort(), ['characterLore', 'clue', 'history', 'worldLore'])
		assert.match(reaching.clue!.declarer, /'pick' \(bandtest:task\/pick-clue@1\)/)

		const renders = rendersAt(doc, 'prompt', C.assemble.descriptor.slots!.variables!)
		assert.deepEqual(renders, {
			worldLore: 'core:var/world-lore@1',
			characterLore: 'core:var/character-lore@1',
			history: 'core:var/history@1',
			currentDate: 'core:var/current-date@1',
			clue: 'bandtest:var/clue@1',
		})
	})

	test('two upstream declarers naming one band differently are refused, naming both', () => {
		const doc = compile(bandedSpec())
		const describe = (n: { key: string; definitionId: string }) =>
			n.key === 'lore'
				? { ports: {}, bands: { clue: 'bandtest:var/other-clue@1' } }
				: n.key === 'pick'
					? { ports: {}, bands: { clue: 'bandtest:var/clue@1' } }
					: n.key === 'pool'
						? { ports: { in: { sources: S.candidates } } }
						: { ports: { in: { candidates: S.candidates } } }
		assert.throws(
			() => bandsReaching(doc, 'prompt', 'candidates', describe as never),
			(e: Error) =>
				e instanceof BandCollisionError &&
				/'lore' \(core:query\/lorebook-triggers@1\) as 'bandtest:var\/other-clue@1'/.test(e.message) &&
				/'pick' \(bandtest:task\/pick-clue@1\) as 'bandtest:var\/clue@1'/.test(e.message),
		)
	})

	test("a band declared under a different variable than the node's own is refused", () => {
		const doc = compile(bandedSpec())
		assert.throws(
			() =>
				rendersAt(doc, 'prompt', {
					renders: { clue: 'core:var/world-lore@1' },
					rendersBands: { from: 'candidates' },
				}),
			/band 'clue' declared by 'pick'.*collides with 'prompt''s own 'clue'/,
		)
	})
})

describe('P1 · typed values', () => {
	test('VarValue types a sample; a wrong one does not compile', () => {
		const lore: VarValue<typeof varWorldLore.scope.worldLore> = { 'The Ashguard': 'Riders.' }
		// @ts-expect-error — a record of strings, not of numbers
		const wrong: VarValue<typeof varWorldLore.scope.worldLore> = { 'The Ashguard': 1 }
		const date: ScopeValues<{ d: { type: 'object'; fields: { year: { type: 'number' }; month: { type: 'number'; optional: true } } } }> = {
			d: { year: 412 },
		}
		assert.ok(lore && wrong && date)
	})

	test('defineVariable checks its sample against its scope (compile time)', () => {
		const never = () =>
			defineVariable({
				id: 'bandtest:var/never@1',
				scope: { n: { type: 'number' } },
				// @ts-expect-error — the sample must be a number
				sample: 'seven',
			})
		assert.equal(typeof never, 'function')
	})

	test('slotToVarField types a prompts or parameters slot, leaving secrets out', () => {
		assert.deepEqual(slotToVarField({ kind: 'prompts', fields: { system: { type: 'text' } } }), {
			type: 'object',
			fields: { system: { type: 'string' } },
		})
		assert.deepEqual(
			slotToVarField({
				kind: 'parameters',
				schema: {
					topK: { type: 'integer' },
					names: { type: 'string[]' },
					apiKey: { type: 'secret' },
				},
			}),
			{
				type: 'object',
				fields: { topK: { type: 'number' }, names: { type: 'list', of: { type: 'string' } } },
			},
		)
		assert.equal(slotToVarField({ kind: 'template' }), undefined)
	})
})

describe('recalled lines · a band carried on one out-port (bandPorts, 2026-09-27)', () => {
	test('entity-search declares recalledLines with core’s variable, carried on messages alone', () => {
		assert.equal(C.entitySearch.descriptor.bands?.recalledLines, varRecalledLines)
		assert.deepEqual(C.entitySearch.descriptor.bandPorts, { recalledLines: ['messages'] })
		assert.equal(getVariable('core:var/recalled-lines@1'), varRecalledLines)
	})

	const recallSpec = (port: 'main' | 'messages') =>
		spec('bandtest:spec/recall', { version: '1.0.0' })
			.inlet('input', C.userMessage.v1(), { genre: bandGenre, event: sessionEvents.messageRespond })
			.query('entities', ($) => C.entitySearch.v1({ scope: $.input.sessionScope }))
			.task('pool', ($) => C.concatCandidates.v1({ sources: [$.entities[port]] as never }))
			.task('rank', ($) => C.rankHybrid.v1({ candidates: $.pool.candidates }))
			.task('prompt', ($) =>
				C.assemble.v2({ candidates: $.rank.candidates, decisions: $.rank.decisions }),
			)
			.build()

	test('wired through messages, the band reaches Assemble and its variables slot renders it', () => {
		const doc = compile(recallSpec('messages'))
		assert.deepEqual(Object.keys(bandsReaching(doc, 'prompt', 'candidates')), ['recalledLines'])
		const renders = rendersAt(doc, 'prompt', C.assemble.descriptor.slots!.variables!)
		assert.equal(renders.recalledLines, 'core:var/recalled-lines@1')
	})

	test('wired through main only — as every shipped spec is — it does not reach Assemble', () => {
		const doc = compile(recallSpec('main'))
		assert.deepEqual(bandsReaching(doc, 'prompt', 'candidates'), {})
		const renders = rendersAt(doc, 'prompt', C.assemble.descriptor.slots!.variables!)
		assert.equal('recalledLines' in renders, false)
	})

	test('a bandPorts key that is not a declared band is refused, naming the fix', () => {
		assert.throws(
			() =>
				describeTaskDefinition({
					id: 'bandtest:task/stray-port@1',
					bandPorts: { clue: ['candidates'] },
					ports: { out: { candidates: S.candidates } },
				}),
			/names band 'clue' in bandPorts but does not declare it in bands/,
		)
	})

	test('a bandPorts port that is not a declared out-port is refused, naming the ports it has', () => {
		assert.throws(
			() =>
				describeTaskDefinition({
					id: 'bandtest:task/wrong-port@1',
					bands: { clue: varClue },
					bandPorts: { clue: ['elsewhere'] },
					ports: { out: { candidates: S.candidates } },
				}),
			/band 'clue' is carried on 'elsewhere', which is not an out-port it declares \(it declares 'candidates'\)/,
		)
	})
})

const rendersGenre = genre('bandtest:genre/renders', {
	name: { en: 'Renders' },
	family: 'chat',
	events: { [sessionEvents.messageRespond]: { required: true } },
})

/** A plugin source feeding Assemble, with or without core's lore beside it. */
const pluginLoreSpec = (opts: { withCoreLore: boolean; renders?: Record<string, string> }) => {
	const s = spec(opts.withCoreLore ? 'bandtest:spec/both-lore' : 'bandtest:spec/own-lore', { version: '1.0.0' })
		.inlet('input', C.userMessage.v1(), { genre: rendersGenre, event: sessionEvents.messageRespond })
	const withSources = opts.withCoreLore
		? s
				.query('lore', ($) => C.lorebookTriggers.v1({ scope: $.input.sessionScope }))
				.task('mine', () => pluginCharacterLore.v1({}))
				.task('pool', ($) => C.concatCandidates.v1({ sources: [$.lore.hits, $.mine.candidates] as never }))
		: s
				.task('mine', () => pluginCharacterLore.v1({}))
				.task('pool', ($) => C.concatCandidates.v1({ sources: [$.mine.candidates] as never }))
	return withSources
		.task('rank', ($) => C.rankHybrid.v1({ candidates: $.pool.candidates }))
		.task(
			'prompt',
			($) => C.assemble.v2({ candidates: $.rank.candidates, decisions: $.rank.decisions }),
			opts.renders ? { renders: opts.renders } : undefined,
		)
		.build()
}

describe('one key, one variable — per template scope (owner ruling 2026-10-13, ★1)', () => {
	test('two sources meaning one key differently are refused where they meet, naming both', () => {
		const doc = compile(
			spec('bandtest:spec/rivals', { version: '1.0.0' })
				.inlet('input', C.userMessage.v1(), { genre: bandGenre, event: sessionEvents.messageRespond })
				.task('pick', () => pickClue.v1({}))
				.task('rival', () => rivalClue.v1({}))
				.task('pool', ($) => C.concatCandidates.v1({ sources: [$.pick.candidates, $.rival.candidates] as never }))
				.task('rank', ($) => C.rankHybrid.v1({ candidates: $.pool.candidates }))
				.task('prompt', ($) => C.assemble.v2({ candidates: $.rank.candidates, decisions: $.rank.decisions }))
				.build(),
		)
		assert.throws(
			() => bandsReaching(doc, 'prompt', 'candidates'),
			(e: Error) =>
				e instanceof BandCollisionError &&
				/'pick' \(bandtest:task\/pick-clue@1\)/.test(e.message) &&
				/'rival' \(bandtest:task\/rival@1\)/.test(e.message),
		)
	})

	test("a plugin's characterLore beside core's is refused where they meet, naming both", () => {
		const doc = compile(pluginLoreSpec({ withCoreLore: true }))
		assert.throws(
			() => rendersAt(doc, 'prompt', C.assemble.descriptor.slots!.variables!),
			(e: Error) =>
				e instanceof BandCollisionError &&
				/'lore' \(core:query\/lorebook-triggers@1\) as 'core:var\/character-lore@1'/.test(e.message) &&
				/'mine' \(bandtest:task\/plugin-character-lore@1\) as 'bandtest:var\/character-lore@1'/.test(e.message),
		)
	})

	test("a plugin's characterLore alone, with Assemble still meaning core's, is refused naming the spec-level fix", () => {
		const doc = compile(pluginLoreSpec({ withCoreLore: false }))
		assert.throws(
			() => rendersAt(doc, 'prompt', C.assemble.descriptor.slots!.variables!),
			(e: Error) =>
				e instanceof BandCollisionError &&
				/renders: \{ characterLore: 'bandtest:var\/character-lore@1' \}/.test(e.message),
		)
	})
})

describe("a spec's renders: what a placement's key means (owner rulings 2026-10-13, ★2 ★5)", () => {
	test('re-points the key at the spec’s variable, and the band then agrees', () => {
		const doc = compile(
			pluginLoreSpec({ withCoreLore: false, renders: { characterLore: 'bandtest:var/character-lore@1' } }),
		)
		const prompt = doc.nodes.find((n) => n.key === 'prompt')!
		assert.deepEqual(prompt.renders, { characterLore: 'bandtest:var/character-lore@1' })
		const renders = rendersAt(doc, 'prompt', C.assemble.descriptor.slots!.variables!)
		assert.equal(renders.characterLore, 'bandtest:var/character-lore@1')
		assert.equal(renders.worldLore, 'core:var/world-lore@1')
	})

	test('a node that states none carries no renders key, so its document hashes as it did', () => {
		const doc = compile(pluginLoreSpec({ withCoreLore: false }))
		for (const n of doc.nodes) assert.equal('renders' in n, false, n.key)
	})

	test('saying a key means what its definition already says is not stored', () => {
		const doc = compile(pluginLoreSpec({ withCoreLore: false, renders: { worldLore: 'core:var/world-lore@1' } }))
		assert.equal('renders' in doc.nodes.find((n) => n.key === 'prompt')!, false)
	})

	test('is stated as a declaration or its id', () => {
		const doc = compile(pluginLoreSpec({ withCoreLore: false, renders: { characterLore: varPluginCharacterLore.id } }))
		assert.equal(doc.nodes.find((n) => n.key === 'prompt')!.renders?.characterLore, varPluginCharacterLore.id)
	})

	test('a key the definition does not render is refused — a spec says what a key means, never adds one', () => {
		assert.throws(
			() => pluginLoreSpec({ withCoreLore: false, renders: { secretEntry: varPluginCharacterLore.id } }),
			/node 'prompt': renders names 'secretEntry', which 'core:task\/assemble@2' does not render/,
		)
	})

	test('a variable whose scope does not declare the key is refused', () => {
		assert.throws(
			() => pluginLoreSpec({ withCoreLore: false, renders: { history: varPluginCharacterLore.id } }),
			/renders 'history' as 'bandtest:var\/character-lore@1', whose scope does not declare 'history'/,
		)
	})

	test('an unregistered variable is refused', () => {
		assert.throws(
			() => pluginLoreSpec({ withCoreLore: false, renders: { characterLore: 'bandtest:var/nobody@1' } }),
			/'bandtest:var\/nobody@1', which is not registered/,
		)
	})

	test('law T1 says the same of a document that did not come from the builder', () => {
		const doc = compile(pluginLoreSpec({ withCoreLore: false }))
		const edited = {
			...doc,
			nodes: doc.nodes.map((n) =>
				n.key === 'prompt' ? { ...n, renders: { secretEntry: 'bandtest:var/clue@1', history: 'bandtest:var/clue@1' } } : n,
			),
		}
		const t1 = templateLawFindings(edited).filter((f) => f.nodeKey === 'prompt')
		assert.ok(t1.some((f) => /renders 'secretEntry', which 'core:task\/assemble' does not render/.test(f.message)), JSON.stringify(t1))
		assert.ok(t1.some((f) => /renders 'history' as 'bandtest:var\/clue@1', whose scope does not declare 'history'/.test(f.message)), JSON.stringify(t1))
	})
})

describe('static renders are checked at definition, like bands (2026-10-13)', () => {
	const withRenders = (id: string, renders: Record<string, string>) => () =>
		describeTaskDefinition({
			id,
			slots: { variables: { kind: 'variables', renders } },
			ports: { in: {}, out: { main: S.json } },
		} as never)

	test('an unregistered variable is refused', () => {
		assert.throws(withRenders('bandtest:task/r-ghost@1', { ghost: 'bandtest:var/ghost@1' }), /slot 'variables' renders 'ghost' as 'bandtest:var\/ghost@1', which is not registered/)
	})

	test('a key the variable’s scope does not declare is refused', () => {
		assert.throws(withRenders('bandtest:task/r-scope@1', { hint: 'bandtest:var/clue@1' }), /renders 'hint' as 'bandtest:var\/clue@1', whose scope does not declare 'hint'.*it declares 'clue'/s)
	})

	test('an Assemble-own name is refused', () => {
		const v = definePluginVariable(PLUGIN, { id: 'bandtest:var/r-budget@1', scope: { budget: 'any' }, sample: null })
		assert.throws(withRenders('bandtest:task/r-budget@1', { budget: v.id }), /renders 'budget', which collides with Assemble's own 'budget'/)
	})

	test('a plugin variable under its own key is accepted', () => {
		assert.doesNotThrow(withRenders('bandtest:task/r-ok@1', { clue: 'bandtest:var/clue@1' }))
	})
})

describe('variable layout seeds are linted against their variable (2026-10-13, ★4)', () => {
	const checking = { check: checkTemplateSourceReport }
	const seed = (id: string, variableId: string, body: string) => ({
		id,
		kind: 'variables' as const,
		variableId,
		engine: 'core:template/handlebars@1',
		body,
	})

	test("a package's layout for a core variable that reads only its scope passes", () => {
		assert.deepEqual(
			variableSeedFindings([seed('bandtest:template/prose-cast@1', 'core:var/characters@1', '{{#each characters}}{{name}}{{/each}}')], checking),
			[],
		)
	})

	test('a layout reading a name its variable does not declare is an error, naming it', () => {
		const [f] = variableSeedFindings([seed('bandtest:template/typo@1', 'core:var/characters@1', '{{#each character}}{{name}}{{/each}}')], checking)
		assert.equal(f?.severity, 'error')
		assert.match(f!.message, /character/)
	})

	test("a variable not registered here is a warning — nothing can see its scope", () => {
		const [f] = variableSeedFindings([seed('bandtest:template/elsewhere@1', 'other:var/thing@1', '{{{thing}}}')], checking)
		assert.equal(f?.severity, 'warning')
	})
})

describe('a variable named only in a renders travels in the manifest (variablesOf, 2026-10-13)', () => {
	const varOnlyNamed = definePluginVariable(PLUGIN, {
		id: 'bandtest:var/only-named@1',
		scope: { onlyNamed: { type: 'string' } },
		sample: 'x',
	})
	const varSpecNamed = definePluginVariable(PLUGIN, {
		id: 'bandtest:var/spec-named@1',
		scope: { characterLore: { type: 'record', of: { type: 'string' } } },
		sample: {},
	})
	const namedByRenders = describeTaskDefinition({
		id: 'bandtest:task/named-by-renders@1',
		slots: { variables: { kind: 'variables', renders: { onlyNamed: varOnlyNamed.id, characters: 'core:var/characters@1' } } },
		ports: { in: {}, out: { main: S.json } },
	} as never)

	test("a definition's static renders and a pipeline node's renders both reach it — own namespace only", () => {
		const ids = variablesOf({
			slug: PLUGIN,
			handlers: [{ __decl: 'handler', type: namedByRenders } as never],
			pipelines: [pluginLoreSpec({ withCoreLore: false, renders: { characterLore: varSpecNamed.id } })],
		}).map((v) => v.id)
		assert.ok(ids.includes(varOnlyNamed.id), JSON.stringify(ids))
		assert.ok(ids.includes(varSpecNamed.id), JSON.stringify(ids))
		assert.ok(!ids.includes('core:var/characters@1'), 'core variables never travel')
	})

	test('without the slug nothing is collected by id — a namespace cannot be guessed', () => {
		assert.deepEqual(
			variablesOf({ handlers: [{ __decl: 'handler', type: namedByRenders } as never] }).map((v) => v.id),
			[],
		)
	})
})

describe('a Liquid variable layout using the instance’s filters is not refused at packaging', () => {
	test('`jsonValue`, which the packager does not know, is a parse finding — never a refusal', () => {
		assert.deepEqual(
			variableSeedFindings(
				[
					{
						id: 'bandtest:template/liquid-cast@1',
						kind: 'variables',
						variableId: 'core:var/characters@1',
						engine: 'core:template/liquid@1',
						body: '{% for c in characters %}{{ c.name | jsonValue }}{% endfor %}',
					},
				],
				{ check: checkTemplateSourceReport },
			),
			[],
		)
	})
})
