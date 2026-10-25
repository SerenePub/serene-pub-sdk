/**
 * 🚧 A person's message is saved through the pipeline (owner ruling
 * 2026-10-15): `core:event/message-offered@1`, its inlet, core's default save
 * `core:spec/save-message`, and `preset()` writing that default into every
 * preset that binds nothing of its own on the event.
 */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import {
	announce,
	CORE_EVENTS,
	effectiveRegistrations,
	eventById,
	genre,
	genreDefaultsOf,
	genreHasEvent,
	preset,
	presetChangesOf,
	S,
	SAVE_MESSAGE_SPEC_ID,
	sessionEvents,
	spec,
	use,
} from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import { storyGenre, corePresets, coreGenres, saveMessageSpec } from '@serene-pub/core-catalog'

const g = genre('offered:genre/table', {
	name: { en: 'Table' },
	family: 'chat',
	events: { [sessionEvents.messageRespond]: {} },
})
const create = spec('offered:spec/create', { version: '1.0.0' })
	.inlet('input', C.userMessage.v1(), { genre: g, event: sessionEvents.sessionCreated })
	.build()
/** A genre's own save: refuses, rewrites or routes a message — here, saves it as core's does. */
const ownSave = spec('offered:spec/save', { version: '1.0.0' })
	.inlet('input', C.messageOffered.v1(), { genre: g, event: sessionEvents.messageOffered })
	.outlet('save', ($) =>
		C.createMessage.v1({ text: $.input.text, speaker: $.input.speaker, channel: $.input.channel, role: 'user' }),
	)
	.build()

describe('message-offered — the event', () => {
	test('a declared root action, with its own payload shape', () => {
		const e = CORE_EVENTS.messageOffered
		assert.equal(sessionEvents.messageOffered, 'core:event/message-offered@1')
		assert.equal(eventById(sessionEvents.messageOffered), e)
		assert.equal(e.family, 'action')
		assert.equal(e.declaredRoot, true)
		assert.equal(e.causedBy, undefined)
		assert.equal(e.payload, S.messageOffered)
		assert.equal(S.messageOffered, 'core:shape/message-offered@1')
	})

	test('the inlet publishes the payload taken apart', () => {
		const out = Object.keys((C.messageOffered as any).descriptor.ports.out).sort()
		assert.deepEqual(out, [
			'cause',
			'channel',
			'main',
			'person',
			'replyTo',
			'session',
			'sessionId',
			'sessionScope',
			'speaker',
			'text',
			'trayItemIds',
		])
		assert.equal(C.messageOffered.id, 'core:inlet/message-offered@1')
	})

	test('create-message takes a person row: role and tray items', () => {
		const ins = (C.createMessage as any).descriptor.ports.in
		assert.ok('role' in ins)
		assert.ok('trayItems' in ins)
	})

	test('every genre has it, listed or not — no genre declaration moved', () => {
		assert.equal(sessionEvents.messageOffered in g.events, false)
		assert.equal(genreHasEvent(g, sessionEvents.messageOffered), true)
		assert.equal(genreHasEvent(g, sessionEvents.formAddressed), false)
	})
})

describe('preset() — the default save', () => {
	test('binds core:spec/save-message when the preset binds nothing on message-offered', () => {
		const p = preset({ slug: 'table', genre: g, label: 'Table', bindings: [create] })
		assert.deepEqual(p.bindings[sessionEvents.messageOffered], { spec: SAVE_MESSAGE_SPEC_ID })
		assert.equal(SAVE_MESSAGE_SPEC_ID, 'core:spec/save-message')
	})

	test("a genre's own save wins", () => {
		const p = preset({ slug: 'table', genre: g, label: 'Table', bindings: [create, ownSave] })
		assert.deepEqual(p.bindings[sessionEvents.messageOffered], { spec: 'offered:spec/save' })
	})

	test("another package's save, named with use(), wins too", () => {
		const p = preset({
			slug: 'modded',
			genre: use('core:genre/story'),
			label: 'Modded',
			bindings: [{ spec: use('acme:spec/chat-save'), events: [sessionEvents.messageOffered] }],
		})
		assert.deepEqual(p.bindings[sessionEvents.messageOffered], { spec: 'acme:spec/chat-save' })
	})

	test('a package with the default builds clean — the binding is no install requirement', () => {
		const p = { slug: 'table', genre: g, label: 'Table', bindings: [create] }
		const { document, coverage } = announce({ ns: 'offered', author: 'T', title: 'Offered' })
			.genres({ g })
			.pipelines(create)
			.presets(p)
			.build()
		assert.deepEqual(document.presets[0]!.bindings[sessionEvents.messageOffered], { spec: SAVE_MESSAGE_SPEC_ID })
		assert.ok(!(document.requires ?? []).includes(SAVE_MESSAGE_SPEC_ID))
		const slot = coverage.presets[0]!.slots.find((s) => s.event === sessionEvents.messageOffered)
		assert.equal(slot?.status, 'bound-external')
	})

	test('a package with its own save builds clean', () => {
		const p = { slug: 'table', genre: g, label: 'Table', bindings: [create, ownSave] }
		const { document } = announce({ ns: 'offered', author: 'T', title: 'Offered' })
			.genres({ g })
			.pipelines(create, ownSave)
			.presets(p)
			.build()
		assert.deepEqual(document.presets[0]!.bindings[sessionEvents.messageOffered], { spec: 'offered:spec/save' })
	})
})

describe('core:spec/save-message', () => {
	test('one create-message, role user, wired from the inlet; no lock, every genre', () => {
		const doc = saveMessageSpec() as any
		assert.equal(doc.id, SAVE_MESSAGE_SPEC_ID)
		assert.equal(doc.input?.genre, undefined)
		assert.equal(doc.input?.event, undefined)
		const kinds = doc.nodes.map((n: any) => `${n.definitionId}@${n.definitionVersion}`)
		assert.deepEqual(kinds, ['core:inlet/message-offered@1', 'core:outlet/create-message@1'])
		const save = doc.nodes.find((n: any) => n.key === 'save')
		assert.equal(save.config.role, 'user')
	})

	test("every core preset shows the save — the one it registers is core's default", () => {
		// 🚧 By registration (PLAN-layering D4, 2026-10-20): each genre's
		// defaults register the save on `message-offered`, and no preset drops it.
		const genres = coreGenres()
		for (const p of corePresets()) {
			const defaults = genreDefaultsOf(genres.find((g) => g.id === p.genre))!.registrations
			const saves = effectiveRegistrations(defaults, presetChangesOf(p, defaults)).filter(
				(r) => r.trigger.family === 'event' && r.trigger.event === sessionEvents.messageOffered,
			)
			assert.deepEqual(saves.map((r) => r.pipeline), [SAVE_MESSAGE_SPEC_ID], p.slug)
		}
		assert.ok(corePresets().some((p) => p.genre === storyGenre.id))
	})
})
