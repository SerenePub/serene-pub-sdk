/**
 * Loadouts (I12; DESIGN-image-generation §11–§13): the declaration grammar,
 * `slot.loadout`, a preset naming one, the write matrix, the additive slot
 * on every model-calling oracle, and core's set.
 */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
	WRITE_MATRIX,
	isLoadoutId,
	isLoadoutRef,
	loadoutDeclProblems,
	mayWrite,
	parseLoadoutId,
	slot,
} from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import { CORE_LOADOUT, CORE_LOADOUTS, coreSpec } from '@serene-pub/core-catalog'

describe('loadout ids', () => {
	test('shipped ids carry a major; a pub id does not', () => {
		assert.ok(isLoadoutId('core:loadout/extraction@1'))
		assert.ok(isLoadoutId('acme.rp:loadout/extract@2'))
		assert.ok(isLoadoutId('pub:loadout/my-reply'))
		assert.ok(!isLoadoutId('core:template/x@1'))
		assert.deepEqual(parseLoadoutId('acme.rp:loadout/extract@2'), {
			owner: 'acme.rp',
			name: 'extract',
			major: 2,
		})
		assert.equal(parseLoadoutId('pub:loadout/mine')?.major, null)
	})

	test('slot.loadout is a value, and refuses a malformed id', () => {
		assert.deepEqual(slot.loadout('core:loadout/reply@1'), { id: 'core:loadout/reply@1' })
		assert.ok(isLoadoutRef(slot.loadout('core:loadout/reply@1')))
		assert.throws(() => slot.loadout('core:loadout/Not Valid' as 'x:loadout/y'), /not a loadout id/)
	})
})

describe('a shipped declaration', () => {
	const good = {
		id: 'acme.rp:loadout/extract@1',
		name: 'Extract',
		description: 'Low temperature, schema door.',
		transform: 'text->text' as const,
		sampling: 'sampling-extraction',
	}
	test('a good one is clean', () => {
		assert.deepEqual(loadoutDeclProblems(good, 'acme.rp'), [])
	})
	test('another namespace, a reserved one, a missing major, a pair', () => {
		assert.equal(loadoutDeclProblems(good, 'other.pkg').length, 1)
		assert.match(
			loadoutDeclProblems({ ...good, id: 'core:loadout/extract@1' }, 'acme.rp')[0]!,
			/reserved/,
		)
		assert.match(
			loadoutDeclProblems({ ...good, id: 'acme.rp:loadout/extract' }, 'acme.rp')[0]!,
			/not a loadout id/,
		)
		assert.match(
			loadoutDeclProblems({ ...good, connection: 3 } as never, 'acme.rp')[0]!,
			/carries a pair/,
		)
		assert.match(loadoutDeclProblems({ ...good, tier: 'huge' as never }, 'acme.rp')[0]!, /tier/)
	})
})

describe('where a loadout may be named', () => {
	test('config only — a session never picks one', () => {
		// PLAN-layering D5: an administrator's preset or a genre's defaults name it; ⏳ `config` reads as `preset`.
		assert.deepEqual(WRITE_MATRIX.loadout, ['preset', 'genre'])
		assert.equal(mayWrite('loadout', 'session'), false)
		assert.equal(mayWrite('loadout', 'config'), true)
	})

	test('every model-calling oracle declares the additive loadout slot', () => {
		for (const o of [
			C.generateText,
			C.generateWithTools,
			C.generateJson,
			C.speak,
			C.generateImage,
			C.summarizeBatch,
			C.summarizeSynth,
			C.nameEntry,
			C.extractCast,
			C.turnAdvise,
		])
			assert.equal(o.descriptor.slots?.loadout?.kind, 'loadout', o.descriptor.id)
		// An MCP server is not a model: no loadout there.
		assert.equal(C.mcpTool.descriptor.slots?.loadout, undefined)
	})
})

describe("core's set", () => {
	// O12 (2026-10-21): + Transcription (`audio->text`) and Spoken reply
	// (`text->text+audio`), both defaults of their transforms, both unfilled.
	test('thirteen declarations, every one clean, seven defaults', () => {
		assert.equal(CORE_LOADOUTS.length, 13)
		for (const d of CORE_LOADOUTS) assert.deepEqual(loadoutDeclProblems(d, 'core'), [], d.id)
		assert.deepEqual(
			CORE_LOADOUTS.filter((d) => d.defaultFor).map((d) => d.transform).sort(),
			['audio->text', 'text->audio', 'text->embedding', 'text->entities', 'text->image', 'text->text', 'text->text+audio'],
		)
	})

	test("a reply spec's Default config names the Reply loadout", () => {
		const doc = coreSpec('core:spec/story-respond')!.build() as {
			presets?: { default?: boolean; values: { nodeKey: string; slot: string; value: unknown }[] }[]
		}
		const def = doc.presets?.find((p) => p.default)
		assert.deepEqual(
			def?.values.find((v) => v.slot === 'loadout'),
			// 🚧 D7 (2026-10-23, A2): the reply's prose branch; its `changes` branch runs on the same loadout.
			{ nodeKey: 'reply.prose.generate', slot: 'loadout', value: { id: CORE_LOADOUT.reply } },
		)
	})
})
