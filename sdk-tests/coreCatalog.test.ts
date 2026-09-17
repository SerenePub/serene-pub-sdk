/**
 * @serene-pub/core-catalog (24 §9): core's announcement builds clean — the
 * same validator every plugin passes through, applied to core itself. This is
 * the "core is the first consumer, not a special case" claim, executed.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
	coreAnnouncement,
	CORE_SPECS,
	adventureGenre,
	chatGenre,
	CORE_HOOK_DECLARATIONS,
} from '@serene-pub/core-catalog'
import { sessionEvents } from '@serene-pub/sdk'

describe('the core catalog', () => {
	test('the announcement builds — genres, pipelines, hooks validated as one package', () => {
		const { document } = coreAnnouncement()
		assert.equal(document.identity.ns, 'core')
		assert.deepEqual(document.genres.map((g) => g.id).sort(), [
			'core:genre/adventure',
			'core:genre/chat',
			// The guide (R-18, U5g): the pure user/assistant session type.
			'core:genre/guide',
		])
		assert.equal(document.pipelines.length, CORE_SPECS.length)
		// Core references nothing it does not ship.
		assert.deepEqual(document.requires, [])
	})

	test('exactly one create pipeline serves each genre, and one respond serves its turn', () => {
		const { document } = coreAnnouncement()
		const serving = (genre: string, event: string) =>
			document.pipelines
				.filter((p) => p.input?.genre === genre && p.input?.event === event)
				.map((p) => p.id)

		// The genre owns its id; the create pipeline is its required MEMBER, so
		// "exactly one" is the claim that matters — two would make creation
		// ambiguous for every session of that genre.
		assert.deepEqual(serving(chatGenre.id, sessionEvents.sessionCreated), [
			'core:spec/create-chat',
		])
		assert.deepEqual(serving(chatGenre.id, sessionEvents.messageRespond), ['core:spec/respond'])
		assert.deepEqual(serving(adventureGenre.id, sessionEvents.sessionCreated), [
			'core:spec/adventure-create',
		])
		assert.deepEqual(serving(adventureGenre.id, sessionEvents.messageRespond), [
			'core:spec/adventure-respond',
		])
		// The open slot takes any number: five actions since U5d (look, rest,
		// advance-time, ask, answer), and adding a sixth is a package change
		// rather than a schema one.
		assert.equal(serving(adventureGenre.id, sessionEvents.sessionAction).length, 5)
		// The answer pipeline (R-15 *Forms*): one per shipped genre, on the
		// optional `form-addressed` event, bound by each shipped preset.
		for (const g of [chatGenre, adventureGenre]) {
			const [spec, ...rest] = serving(g.id, sessionEvents.formAddressed)
			assert.equal(rest.length, 0)
			assert.ok(spec?.startsWith('core:spec/answer-form-'), g.id)
			const preset = document.presets.find((p) => p.genre === g.id)
			assert.equal(preset?.bindings[sessionEvents.formAddressed]?.spec, spec)
		}
	})

	test('hook declarations are fully-qualified core ids', () => {
		for (const id of Object.keys(CORE_HOOK_DECLARATIONS)) assert.match(id, /^core:hook\//)
	})
})
