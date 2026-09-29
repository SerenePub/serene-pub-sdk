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
	type ScopeValues,
	type VarValue,
} from '@serene-pub/sdk'
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

	test('a key another definition declares with a different variable is refused, naming both', () => {
		assert.throws(
			() =>
				describeTaskDefinition({
					id: 'bandtest:task/rival@1',
					bands: { clue: varOtherClue },
					ports: { out: { candidates: S.candidates } },
				}),
			(e: Error) =>
				/'bandtest:task\/rival@1' declares band 'clue' as 'bandtest:var\/other-clue@1'/.test(e.message) &&
				/'bandtest:task\/pick-clue@1' already declares 'clue' as 'bandtest:var\/clue@1'/.test(e.message),
		)
	})

	test('a key a registered variable already renders is refused, naming both', () => {
		const v = definePluginVariable(PLUGIN, {
			id: 'bandtest:var/characters@1',
			scope: { characters: 'any' },
			sample: null,
		})
		assert.throws(
			() =>
				describeTaskDefinition({
					id: 'bandtest:task/shadow@1',
					bands: { characters: v },
					ports: { out: { candidates: S.candidates } },
				}),
			/'bandtest:task\/shadow@1' declares band 'characters' as 'bandtest:var\/characters@1', which collides with 'core:var\/characters@1'/,
		)
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

	test("Assemble's variables slot is open, and renders characterLore raw", () => {
		assert.deepEqual(C.assemble.descriptor.slots?.variables?.rendersBands, {
			from: 'candidates',
			raw: ['characterLore'],
		})
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
