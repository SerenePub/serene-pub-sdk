/**
 * A narration's direction reaches its prompt (genre uplift C2, 2026-09-29).
 *
 * Chat's Narrate stored what the person typed beside the row
 * (`create-message.instructions`, wired from `$.input.text`) and handed it to
 * nothing that renders a prompt, so every direction was shown back and never
 * sent — 0.5.3 had appended it as _Additional focus for this response: …_.
 * The same held for a side character's instructions (the narrator modal's
 * other half). (Whodunit's Search took the same wiring; it is a showcase
 * plugin now, and its suite holds that half.)
 *
 * Structural, from the source: the action says what it collects, each spec
 * wires its inlet's `text` to its context builder's `turnDirection`, the two
 * narrator builders declare that port, and each shipped row renders it inside
 * `{{#if turnDirection}}` — nothing at all on an undirected turn. The prompt
 * itself is rendered by the app's binding and asserted there
 * (`sessions.narrateDirection.int.test.ts`).
 */

import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import '@serene-pub/contracts'
import { getDefinition, S, type SpecDocument } from '@serene-pub/sdk'

import { CORE_PROMPTS, CORE_SPECS } from '../core-catalog/src/index.js'
import { NARRATE_SPEC_ID } from '../core-catalog/src/narrate.js'
import { NARRATE_CHARACTER_SPEC_ID } from '../core-catalog/src/narrateCharacter.js'

const docFor = (slug: string): SpecDocument => CORE_SPECS.find((s) => s.slug === slug)!.build()

/** 0.5.3's words for it (`compilePrompt`'s `extraInstructions`), as a row renders them. */
const FOCUS = '{{#if turnDirection}}\n\nAdditional focus for this response: {{turnDirection}}{{/if}}'

const row = (seedKey: string) => {
	const found = CORE_PROMPTS.find((p) => p.seedKey === seedKey)
	assert.ok(found, `no shipped row ${seedKey}`)
	return found!.fields as Record<string, string>
}

describe("Chat's Narrate collects what should happen next", () => {
	test('optional text, with a label, a placeholder and what an empty one does', () => {
		const actions = ((docFor(NARRATE_SPEC_ID).contributes as { actions?: any[] } | undefined)?.actions ?? []) as any[]
		const action = actions.find((a) => a.key === 'narrate')
		assert.ok(action, 'narrate no longer contributes its action')
		assert.deepEqual(action!.collects, {
			text: {
				need: 'optional',
				label: { en: 'What should happen next?' },
				placeholder: { en: 'The storm breaks over the harbour.' },
				ifEmpty: { en: 'The narrator decides.' },
			},
		})
	})
})

describe('the collected text is the context builder’s turn direction', () => {
	for (const [slug, builder] of [
		[NARRATE_SPEC_ID, 'core:task/build-narrator-context'],
		[NARRATE_CHARACTER_SPEC_ID, 'core:task/build-side-character-context'],
	] as const)
		test(`${slug}: input.text → context.turnDirection`, () => {
			const doc = docFor(slug)
			const context = (doc.nodes as any[]).find((n) => n.key === 'context')
			assert.equal(context?.definitionId, builder)
			const edge = doc.edges.find((e) => e.to === 'context' && e.toPort === 'turnDirection')
			assert.ok(edge, `${slug} hands its context no turn direction`)
			assert.equal(edge!.from, 'input')
			assert.equal(edge!.fromPort, 'text')
		})

	test('both narrator builders declare the port', () => {
		for (const id of ['core:task/build-narrator-context@1', 'core:task/build-side-character-context@1']) {
			const d = getDefinition(id)
			assert.ok(d, `${id} is not registered`)
			assert.equal(d!.ports.in?.turnDirection, S.text, `${id} lacks turnDirection`)
		}
	})
})

describe('each shipped row renders it, and nothing when it is blank', () => {
	test("the world narrator: 0.5.3's focus line, at the top and beside the seed", () => {
		const f = row('pipeline-prompt:core:task/build-narrator-context:prompts:narrator-default')
		assert.ok(f.systemPrompt!.endsWith(FOCUS), 'systemPrompt')
		assert.ok(f.postHistoryInstructions!.endsWith(FOCUS), 'postHistoryInstructions')
	})

	test('a side character: the same line, in the same two places', () => {
		const f = row('pipeline-prompt:core:task/build-side-character-context:prompts:side-character-default')
		assert.ok(f.systemPrompt!.endsWith(FOCUS), 'systemPrompt')
		assert.ok(f.postHistoryInstructions!.endsWith(FOCUS), 'postHistoryInstructions')
	})
})
