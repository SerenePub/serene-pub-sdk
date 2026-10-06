/**
 * The public widget types against what a host actually posts (F1).
 *
 * `messages.v1` is the session's rows forwarded as stored less the host's
 * bookkeeping (`MESSAGE_HOST_FIELDS`, stripped by `projectMessageRow`), and `actions.v1` is the `sessions:actions` listing. Before F1 the SDK
 * described neither truthfully: `generationStatus` was typed a string (a
 * plugin printing it drew "[object Object]"), `activeRevisions` a count,
 * `metadata.swipes` `{ current }`, `embedding` a status object, a failed
 * run's connection name/model non-null, and `WidgetAction` had no
 * `enabled` / `reason` / `itemPredicates`.
 *
 * The fixtures below are recorded host payloads — a message row exactly as
 * core's `session_messages` row + wire enrichment serialises (every column,
 * the host-internal ones included), and one listed action as core's
 * `SessionAction` lists it. This file is compiled by the suite's `tsc
 * --noEmit` before it runs, so each fixture being assigned to the public type
 * WITHOUT a cast is the type-level half; the `@ts-expect-error` lines keep
 * the old lies from coming back (each fails the build if its error stops
 * happening). The runtime half checks the recorded values have the shapes
 * the types name, through the SDK's own readers.
 *
 * The app holds the other end: `src/lib/shared/widgets/messageV1.test.ts`
 * assigns its own row type, serialised, to `MessageV1`.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
	MESSAGE_HOST_FIELDS,
	projectMessageRow,
	type MessageHostField,
	evaluateEnabledWhen,
	isStatusText,
	renderStatusText,
	type ActionsV1,
	type MessageV1,
	type WidgetAction,
} from '@serene-pub/sdk'
import type { RowAction } from '../core-catalog/src/shared/ui/conversation/messageVerbState.js'

/** A generating assistant row with two swipes and a failed earlier run, as `sessions:get` sends it. */
const recordedRow = {
	id: 41,
	sessionId: 7,
	userId: 2,
	characterId: 3,
	personaId: null,
	role: 'assistant',
	channel: 'main',
	isNarratorResponse: false,
	content: 'The door creaks open.',
	createdAt: '2026-09-25',
	updatedAt: '2026-09-25T18:04:11.201Z',
	isEdited: false,
	metadata: {
		swipes: {
			currentIdx: 1,
			history: ['The door is locked.', 'The door creaks open.'],
			reasoningHistory: [null, 'They asked twice.'],
			spriteHistory: [null, { set: 'default', label: 'smile' }],
		},
		sprite: { set: 'default', label: 'smile' },
		reasoning: 'They asked twice.',
		answersForm: { messageId: 39, blockId: 'q1' },
	},
	isGenerating: true,
	generationStage: null,
	generationStatus: { i18n: { en: '{speaker} is typing' }, vars: { speaker: 'Bell' } },
	generationOutcome: null,
	error: {
		message: 'The model stopped answering.',
		code: 'connection-failed',
		connection: { id: 4, name: null, model: null, type: 'koboldcpp', detail: 'ECONNRESET' },
	},
	queueItemId: '6f1c1f56-3d4c-4a3f-9d0e-2b0f5d1e9a11',
	isHidden: false,
	debugMeta: null,
	embedding: [0.0125, -0.33, 0.9],
	embeddingModel: 'all-MiniLM-L6-v2',
	embeddingSourceHash: '3f1d8a0c5b7e2a94',
	embedTextHash: '3f1d8a0c5b7e2a94',
	vectorizedAt: '2026-09-25T18:04:12.000Z',
	parts: [
		{ id: 90, messageId: 41, step: 0, revision: 1, ordinal: 0, type: 'core:markdown', content: 'The door creaks open.', data: null },
		{ id: 91, messageId: 41, step: 0, revision: 1, ordinal: 1, type: 'core:section', content: null, data: { blocks: [] } },
	],
	activeRevisions: { '0': 1 },
	kind: 'core:reply',
	speakerLabel: 'Bell',
	extras: {},
	version: null,
}

/** One message-venue action as `sessions:actions` lists it: greyed, with an `item.*` predicate. */
const recordedAction = {
	key: 'summarize',
	specSlug: 'acme-tools',
	name: 'Summarize',
	description: 'Sum up the scene so far',
	icon: 'scroll',
	slash: 'summarize',
	quick: false,
	audience: { see: ['participant'], act: ['owner'] },
	venue: 'message',
	origin: 'companion' as const,
	floor: false,
	canAct: true,
	itemGated: false,
	isNew: true,
	enabled: false,
	reason: { i18n: { en: 'Not while {speaker} is away' }, vars: { speaker: 'Bell' } },
	itemPredicates: [{ on: 'item.hidden', equals: false, reason: { en: 'Unhide it first' } }],
}

test('a recorded host row is a MessageV1 — no cast', () => {
	const m: MessageV1 = recordedRow
	// The old lies, pinned shut: each line fails the build if it compiles.
	// @ts-expect-error — generationStatus is StatusText, not a string
	const asString: string | null | undefined = m.generationStatus
	// @ts-expect-error — activeRevisions is per step, not a count
	const asCount: number | undefined = m.activeRevisions
	// @ts-expect-error — swipes has no `current`; it is `currentIdx`
	const current: number | undefined = m.metadata?.swipes?.current
	// @ts-expect-error — the connection's name may be null
	const name: string | undefined = m.error?.connection?.name
	void [asString, asCount, current, name]

	assert.ok(isStatusText(m.generationStatus), 'generationStatus is a StatusText')
	assert.equal(renderStatusText(m.generationStatus!), 'Bell is typing')
	assert.deepEqual(m.activeRevisions, { '0': 1 })
	const swipes = m.metadata!.swipes!
	assert.equal(typeof swipes.currentIdx, 'number')
	assert.ok(swipes.history.every((h) => typeof h === 'string'))
	assert.equal(m.error!.connection!.name, null)
	const shown = m.parts!.filter((p) => p.step === 0 && p.revision === m.activeRevisions!['0'])
	assert.deepEqual(shown.map((p) => p.type), ['core:markdown', 'core:section'])
	// `embedding` is a vector on the STORED row — host bookkeeping the type
	// leaves unnamed, and the host strips before posting (below).
	assert.ok(Array.isArray(m.embedding))
})

test('a row survives the wire: the JSON a frame receives reads the same', () => {
	const m = JSON.parse(JSON.stringify(recordedRow)) as MessageV1
	assert.equal(renderStatusText(m.generationStatus!), 'Bell is typing')
	assert.equal(m.metadata?.swipes?.history[m.metadata.swipes.currentIdx!], m.content)
})

test('a listed action is a WidgetAction with its enabled-when verdict — and core reads it as a RowAction', () => {
	const a: WidgetAction = recordedAction
	const venues: ActionsV1 = { message: { primary: [], overflow: [a] } }
	// Core's verb table reads the SDK type directly; no widening of its own.
	const row: RowAction = venues.message.overflow[0]
	assert.equal(row.enabled, false)
	assert.equal(renderStatusText(a.reason!), 'Not while Bell is away')
	const onRow = evaluateEnabledWhen(a.itemPredicates!, { item: { hidden: true } })
	assert.equal(onRow.enabled, false)
})

test('a minimal row (id, role, content) is still a MessageV1', () => {
	const m: MessageV1 = { id: 1, role: 'user', content: 'hi' }
	assert.equal(m.generationStatus, undefined)
})

/** The keys an interface names — its index signature left out. */
type NamedKeys<T> = keyof { [K in keyof T as string extends K ? never : number extends K ? never : K]: T[K] }

test('the host-field list and MessageV1 agree: none is named, each is the doc comment\'s', () => {
	// Type-level: a host field MessageV1 named would be one a widget is
	// promised and never sent — this stops compiling.
	const noneNamed: [Extract<MessageHostField, NamedKeys<MessageV1>>] extends [never] ? true : false = true
	assert.equal(noneNamed, true)
	// The doc comment's "Withheld" paragraph names exactly the list.
	const src = readFileSync(new URL('../sdk/src/widgets.ts', import.meta.url), 'utf8')
	const doc = /\/\*\*((?:(?!\*\/)[\s\S])*)\*\/\s*export interface MessageV1\b/.exec(src)?.[1] ?? ''
	const withheld = /Withheld,[\s\S]*?(?=\n\s*\*\s*\n|$)/.exec(doc)?.[0] ?? ''
	assert.ok(withheld, 'MessageV1 has a "Withheld" paragraph')
	const named = [...withheld.matchAll(/`([A-Za-z]+)`/g)].map((m) => m[1]).sort()
	assert.deepEqual(named, [...MESSAGE_HOST_FIELDS].sort())
	// And each is a real column: the recorded host row carries every one.
	for (const field of MESSAGE_HOST_FIELDS) assert.ok(Object.hasOwn(recordedRow, field), field)
})

test('projectMessageRow strips exactly the host fields, and leaves the row alone', () => {
	const before = JSON.stringify(recordedRow)
	const posted = projectMessageRow(recordedRow)
	for (const field of MESSAGE_HOST_FIELDS) assert.equal(Object.hasOwn(posted, field), false, field)
	const kept = Object.keys(recordedRow).filter((k) => !(MESSAGE_HOST_FIELDS as readonly string[]).includes(k))
	assert.deepEqual(Object.keys(posted), kept)
	assert.equal(JSON.stringify(recordedRow), before, 'the stored row is not mutated')
	const m: MessageV1 = posted
	assert.equal(m.content, recordedRow.content)
	assert.equal(projectMessageRow(null), null)
})
