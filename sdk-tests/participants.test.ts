/**
 * Participant references (plans/29 R-15 *audience*, R-18 (3), R-21 (4);
 * ruled 2026-09-15, built 2026-09-16 as U5a).
 *
 * What is pinned: the grammar round-trips and refuses what is not a
 * reference; an audience is two lists of it; the inlet's `speaker` port is a
 * participant reference — `character:<id>` for a library character and
 * `envoy:<slug>` for a genre's envoy, through the same port — and a turn
 * strategy carries the reference through beside the bare id; and the host's
 * `portrayals` reach the receipt pinned before the first node.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
	PARTICIPANT_ROLES,
	parseParticipantRef,
	formatParticipantRef,
	isParticipantRef,
	S,
	getShape,
	assignable,
	spec,
	compile,
	run,
	ok,
	halt,
	type Audience,
	type ParticipantRef,
	type Portrayals,
} from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import { world } from './helpers.js'

describe('the grammar', () => {
	test('every role parses to itself and formats back', () => {
		for (const role of PARTICIPANT_ROLES) {
			const parsed = parseParticipantRef(role)
			assert.deepEqual(parsed, { kind: role })
			assert.equal(formatParticipantRef(parsed), role)
		}
		assert.deepEqual([...PARTICIPANT_ROLES], ['owner', 'admin', 'participant', 'person', 'ai', 'item', 'run-owner'])
	})

	test('user, character and envoy round-trip', () => {
		const cases: Array<[ParticipantRef, ReturnType<typeof parseParticipantRef>]> = [
			['user:3', { kind: 'user', id: '3' }],
			['character:12', { kind: 'character', id: '12' }],
			['envoy:mascot', { kind: 'envoy', slug: 'mascot' }],
			// An action's envoy is namespaced like a slash name (R-18 (1)).
			['envoy:chariot.dice-tray.master', { kind: 'envoy', slug: 'chariot.dice-tray.master' }],
		]
		for (const [text, parsed] of cases) {
			assert.deepEqual(parseParticipantRef(text), parsed)
			assert.equal(formatParticipantRef(parsed), text)
			assert.equal(isParticipantRef(text), true)
		}
		// Whitespace around a reference is not part of it.
		assert.deepEqual(parseParticipantRef('  owner '), { kind: 'owner' })
	})

	test('what is not a reference is refused, with a sentence', () => {
		const bad: unknown[] = [
			'',
			'nobody',
			'user:',
			'user:a b',
			'character:',
			'envoy:',
			'envoy:-leading-dash',
			'envoy:has space',
			'persona:3',
			'owner:1',
			42,
			null,
			undefined,
			{ kind: 'owner' },
		]
		for (const raw of bad) {
			assert.equal(isParticipantRef(raw), false, `${String(raw)} is not a reference`)
			assert.throws(() => parseParticipantRef(raw), Error, `${String(raw)} throws`)
		}
		assert.throws(() => parseParticipantRef('character: '), /no readable id/)
		// Ids are opaque to the SDK — the host narrows them at its seam.
		assert.deepEqual(parseParticipantRef('character:Tom'), { kind: 'character', id: 'Tom' })
		assert.throws(() => parseParticipantRef('persona:3'), /'persona:' is not a kind/)
		assert.throws(() => parseParticipantRef('owner:1'), /'owner:' is not a kind/)
	})

	test('an audience is two lists of references, and the shape exists', () => {
		const audience: Audience = {
			see: ['participant', 'character:4', 'envoy:mascot'],
			act: ['owner', 'user:2', 'item', 'run-owner'],
		}
		for (const ref of [...audience.see, ...audience.act]) assert.ok(isParticipantRef(ref))
		assert.equal(S.participantRef, 'core:shape/participant-ref@1')
		assert.ok(getShape(S.participantRef))
		// A reference is a name, not a row: it does not flow into a port
		// that wants the bare id, and the bare id does not flow into it.
		assert.equal(assignable(S.participantRef, S.rowIds), false)
		assert.equal(assignable(S.rowIds, S.participantRef), false)
		assert.equal(assignable(S.participantRef, S.json), true)
	})
})

describe('the inlet publishes `speaker` as a reference', () => {
	const strategyDoc = compile(
		spec('test:spec/speaker-through', { version: '1.0.0' })
			.inlet('input', C.userMessage.v1())
			.task('speaker', ($: any) =>
				C.turnManual.v1({
					cast: $.input.main,
					messages: $.input.main,
					speaker: $.input.speaker,
					characterId: $.input.characterId,
				}),
			)
			.build(),
	)

	// The host's turn-strategy implementation, reduced to the seam under test:
	// the reference in wins and rides out beside the bare id it implies.
	const bindings = {
		'core:inlet/user-message@1': async (input: any) => ok(input),
		'core:task/turn-manual@1': async (input: any) => {
			const speaker: string | null = input?.speaker ?? null
			const characterId =
				speaker?.startsWith('character:') ? Number(speaker.slice('character:'.length)) : null
			return ok({
				main: { speaker, characterId, strategy: 'manual', via: speaker ? 'pick' : 'strategy' },
				speaker,
				characterId,
				strategy: 'manual',
			})
		},
	}

	test('the inlet declares the port, and the strategy takes it in and publishes it out', () => {
		assert.equal(C.userMessage.descriptor.ports.out!.speaker, S.participantRef)
		assert.equal(C.sideCharacterTurn.descriptor.ports.out!.speaker, S.participantRef)
		// The side-character fact moved off the word: it is `sideCharacter`
		// on the inlet and on both of its consumers.
		assert.equal(C.sideCharacterTurn.descriptor.ports.out!.sideCharacter, S.json)
		assert.equal(C.buildSideCharacterContext.descriptor.ports.in!.sideCharacter, S.json)
		assert.equal(C.createMessage.descriptor.ports.in!.sideCharacter, S.json)
		assert.equal('speaker' in C.buildSideCharacterContext.descriptor.ports.in!, false)
		// `create-message` takes the reference beside the fact since U5g: an
		// envoy's row has no `characterId`, so the reference is its identity.
		assert.equal(C.createMessage.descriptor.ports.in!.speaker, S.participantRef)
		assert.equal(C.buildTemplateContext.descriptor.ports.in!.speaker, S.participantRef)
		// ⚠ The strategies declare NO `speaker` port, in either direction,
		// since PLAN-turn-order A6 (§4.4): an explicit pick never enters a
		// strategy — it fires the prepared entry — and what a strategy
		// publishes is an ORDER, not a speaker. `turn-none` is deleted (§7).
		for (const t of [
			C.turnRoundRobin,
			C.turnUserSplit,
			C.turnRandom,
			C.turnScripted,
			C.turnManual,
			C.turnNarrator,
		]) {
			assert.equal('speaker' in t.descriptor.ports.in!, false)
			assert.equal('characterId' in t.descriptor.ports.in!, false)
			assert.equal(t.descriptor.ports.in!.candidates, S.turnCandidates)
			assert.equal(t.descriptor.ports.out!.main, S.turnEntries)
			assert.equal(t.descriptor.ports.out!.order, S.turnEntries)
		}
		// `session-created` names no speaker, and so gains no port.
		assert.equal('speaker' in C.sessionCreated.descriptor.ports.out!, false)
	})

	test('a character turn: `character:<id>` arrives, and the bare id rides beside it', async () => {
		const receipt = await run(strategyDoc, {
			world,
			bindings,
			input: { main: {}, text: 'hi', speaker: 'character:12', characterId: 12 },
			seed: 'speaker:character',
		})
		assert.equal(receipt.outcome, 'ok')
		const inlet = receipt.nodes.find((n) => n.nodeKey === 'input')!
		assert.equal((inlet.output as any).speaker, 'character:12')
		const speaker = receipt.nodes.find((n) => n.nodeKey === 'speaker')!
		assert.equal((speaker.input as any).speaker, 'character:12')
		assert.deepEqual(speaker.output, {
			main: { speaker: 'character:12', characterId: 12, strategy: 'manual', via: 'pick' },
			speaker: 'character:12',
			characterId: 12,
			strategy: 'manual',
		})
	})

	test('an envoy turn: `envoy:<slug>` arrives through the SAME port, with no row behind it', async () => {
		// Envoys do not exist as data yet (U5g); the grammar and the port
		// already admit them, which is what R-18 (3) asks of an inlet.
		const receipt = await run(strategyDoc, {
			world,
			bindings,
			input: { main: {}, text: 'hi', speaker: 'envoy:mascot', characterId: null },
			seed: 'speaker:envoy',
		})
		assert.equal(receipt.outcome, 'ok')
		const speaker = receipt.nodes.find((n) => n.nodeKey === 'speaker')!
		assert.equal((speaker.output as any).speaker, 'envoy:mascot')
		assert.equal((speaker.output as any).characterId, null)
	})
})

describe('the receipt pins who portrays whom', () => {
	const portrayals: Portrayals = {
		'character:12': { by: 'ai' },
		'character:7': { by: 'person', userId: '3' },
		owner: { by: 'person', userId: '3' },
		'run-owner': { by: 'person', userId: '3' },
		'envoy:mascot': { by: 'ai' },
	}
	// An inlet has no invocation to halt in, so the first node after it is
	// where the run can be stopped at the door.
	const doc = compile(
		spec('test:spec/portrayals-pinned', { version: '1.0.0' })
			.inlet('input', C.userMessage.v1())
			.task('speaker', ($: any) =>
				C.turnManual.v1({
					cast: $.input.main,
					messages: $.input.main,
					speaker: $.input.speaker,
					characterId: $.input.characterId,
				}),
			)
			.build(),
	)
	const passing = {
		'core:inlet/user-message@1': async (input: any) => ok(input),
		'core:task/turn-manual@1': async (input: any) =>
			ok({ main: {}, speaker: input?.speaker ?? null, characterId: null, strategy: 'manual' }),
	}

	test('`portrayals` given to `run` is on the receipt from construction, untouched by the run', async () => {
		// The first node halts, so nothing past the inlet ever ran: a map on
		// THIS receipt got there when the receipt was built, not from a node.
		const receipt = await run(doc, {
			world,
			bindings: {
				...passing,
				'core:task/turn-manual@1': async () => halt('stopping at the door'),
			},
			input: { main: {}, text: 'hi', speaker: 'character:12' },
			seed: 'portrayals',
			portrayals,
		})
		assert.equal(receipt.outcome, 'halt')
		assert.equal(receipt.haltNodeKey, 'speaker')
		assert.deepEqual(receipt.portrayals, portrayals)
	})

	test('and absent when the host resolved nobody — no session behind the run, or a pre-call preview', async () => {
		const bare = await run(doc, {
			world,
			bindings: passing,
			input: { main: {}, text: 'hi' },
			seed: 'portrayals:none',
		})
		assert.equal(bare.outcome, 'ok')
		assert.equal('portrayals' in bare, false)
		// The executor does not derive one either: a preview with none given
		// carries none, rather than an empty map that reads as "nobody".
		const preview = await run(doc, {
			world,
			bindings: passing,
			input: { main: {}, text: 'hi' },
			seed: 'portrayals:preview',
			preview: { atNode: 'speaker' },
		})
		assert.equal(preview.outcome, 'halt')
		assert.equal('portrayals' in preview, false)
	})
})
