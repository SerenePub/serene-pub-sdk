/**
 * 🚧 Composer states (owner ruling 2026-10-15): a genre opens and closes a
 * person's composer per channel lane through `core:outlet/set-composer-state@1`;
 * the state is the session row's document, read by the send door and handed
 * to the composer as `ConversationComposerV1.closed`. Pinned here: the
 * outlet's shape, the document's rules, the envelope's field, the composer's
 * sentences, the `rerunnable` verdict in the verb table, and Dungeon
 * Crawler's use (Story closed until a character is made).
 */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
	applyComposerState,
	composerClosedOn,
	composerClosedPlaceholder,
	composerClosedRefusal,
	composerClosureFor,
	composerClosuresFor,
	readComposerStates,
	getDefinition,
	RUN_KINDS,
	type RunKind,
	i18nText,
	type ConversationComposerV1,
	type ConversationLineV1,
} from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import * as cat from '../core-catalog/src/index.js'
import { coreVerbState, type VerbContext } from '../core-catalog/src/shared/ui/conversation/index.js'

describe('the outlet', () => {
	test("set-composer-state@1: channel, open, reason, person in; the write and the document out; review edits the reason", () => {
		assert.ok(C.setComposerState)
		const d = getDefinition('core:outlet/set-composer-state@1')!
		assert.ok(d, 'registered')
		assert.equal(d.kind, 'outlet')
		assert.equal(d.effects, 'write')
		assert.equal(i18nText(d.i18n!.name!, 'en'), 'Open or close the composer')
		assert.deepEqual(Object.keys(d.ports.in ?? {}).sort(), ['channel', 'open', 'person', 'reason'])
		assert.deepEqual(Object.keys(d.ports.out ?? {}).sort(), ['main', 'states'])
		assert.equal(d.ports.in!.channel, 'core:shape/text@1')
		assert.equal(d.ports.out!.main, 'core:shape/write-result@1')
		assert.deepEqual(d.review?.fields, ['reason'])
		// It writes no message: no message-created, so the live-row law never counts it.
		assert.equal(d.causesEvent, undefined)
	})
})

describe('the document', () => {
	const closeStory = applyComposerState({}, { channel: 'main', open: false, reason: 'Make your character first.', person: 'user:7' })

	test('a close for one person closes their lane alone, with its reason; absent is open', () => {
		assert.deepEqual(closeStory, { main: { 'user:7': { open: false, reason: 'Make your character first.' } } })
		assert.deepEqual(composerClosureFor(closeStory, 'main', 7), { open: false, reason: 'Make your character first.' })
		assert.equal(composerClosureFor(closeStory, 'main', 8), null)
		assert.equal(composerClosureFor(closeStory, 'parley', 7), null)
		assert.equal(composerClosureFor({}, 'main', 7), null)
	})

	test('a lane is canonical: lane 1 is the bare slug, and closing parley:2 leaves parley open', () => {
		const s = applyComposerState({}, { channel: 'parley:2', open: false })
		assert.ok(composerClosureFor(s, 'parley:2', 3))
		assert.equal(composerClosureFor(s, 'parley', 3), null)
		const one = applyComposerState({}, { channel: 'parley:1', open: false })
		assert.deepEqual(Object.keys(one), ['parley'])
	})

	test('everyone, the owner included; * closes every channel; the most specific reason wins', () => {
		let s = applyComposerState({}, { channel: '*', open: false, reason: 'The world is being built.' })
		assert.equal(composerClosureFor(s, 'main', 1)?.reason, 'The world is being built.')
		assert.equal(composerClosureFor(s, 'parley:4', 99)?.reason, 'The world is being built.')
		s = applyComposerState(s, { channel: 'main', open: false, reason: 'Yours.', person: 'user:1' })
		assert.equal(composerClosureFor(s, 'main', 1)?.reason, 'Yours.')
		assert.equal(composerClosureFor(s, 'main', 2)?.reason, 'The world is being built.')
	})

	test("opening for one person clears theirs and never overrides a close for everyone; opening for everyone clears the lane", () => {
		let s = applyComposerState(closeStory, { channel: 'main', open: false, person: 'user:8' })
		s = applyComposerState(s, { channel: 'main', open: true, person: 'user:7' })
		assert.equal(composerClosureFor(s, 'main', 7), null)
		assert.ok(composerClosureFor(s, 'main', 8))
		const all = applyComposerState({}, { channel: 'main', open: false })
		assert.ok(composerClosureFor(applyComposerState(all, { channel: 'main', open: true, person: 'user:7' }), 'main', 7))
		assert.deepEqual(applyComposerState(s, { channel: 'main', open: true }), {})
		assert.deepEqual(applyComposerState(closeStory, { channel: '*', open: true }), {})
	})

	test("a person who is not user:<id> changes nothing; the input document is never touched", () => {
		assert.deepEqual(applyComposerState(closeStory, { channel: 'main', open: false, person: 'character:3' }), closeStory)
		const before = JSON.stringify(closeStory)
		applyComposerState(closeStory, { channel: 'main', open: true })
		assert.equal(JSON.stringify(closeStory), before)
	})
})

describe('the envelope and the sentences', () => {
	test("composer.closed is the viewer's closures by channel, * kept; a lane reads its own, else *'s", () => {
		const s = applyComposerState(
			applyComposerState({}, { channel: 'main', open: false, reason: 'Make your character first.', person: 'user:7' }),
			{ channel: '*', open: false, person: 'user:9' },
		)
		const mine = composerClosuresFor(s, 7)
		assert.deepEqual(mine, { main: { reason: 'Make your character first.' } })
		assert.deepEqual(composerClosuresFor(s, 8), {})
		assert.deepEqual(composerClosedOn(composerClosuresFor(s, 9), 'parley:3'), {})
		assert.equal(composerClosedOn(mine, 'parley'), undefined)
		// The field is optional on the composer envelope; a line's `rerunnable` too.
		const composer: Pick<ConversationComposerV1, 'closed'> = { closed: mine }
		const line: Pick<ConversationLineV1, 'controllable' | 'rerunnable'> = { controllable: false, rerunnable: true }
		assert.ok(composer.closed && line.rerunnable)
	})

	test('the placeholder says what it waits on; the refusal repeats it', () => {
		assert.equal(composerClosedPlaceholder({ reason: 'Make your character on the Planner tab first.' }), 'Waiting: Make your character on the Planner tab first.')
		assert.equal(composerClosedPlaceholder({}), "You can't send here yet.")
		assert.equal(composerClosedRefusal({ reason: 'Make your character first.' }), "You can't send here yet. Make your character first.")
	})

	test('🚧 a closure that waits on nothing (an archived session) says its reason alone (sprint 2)', () => {
		const sentence = 'This session is archived. Its owner can unarchive it to play on.'
		assert.equal(composerClosedPlaceholder({ reason: sentence, waits: false }), sentence)
		assert.equal(composerClosedRefusal({ reason: sentence, waits: false }), sentence)
		assert.equal(composerClosedPlaceholder({ waits: false }), "You can't send here yet.")
		const kept = { '*': { '*': { open: false as const, reason: 'R.', waits: false as const } } }
		assert.deepEqual(readComposerStates(kept), kept)
		assert.deepEqual(readComposerStates({ main: { '*': { open: false, waits: true } } }), { main: { '*': { open: false } } })
		assert.deepEqual(composerClosuresFor(kept, null), { '*': { reason: 'R.', waits: false } })
		assert.equal('waits' in (applyComposerState({}, { channel: 'main', open: false, reason: 'R.' }).main?.['*'] ?? {}), false)
		assert.deepEqual(RUN_KINDS, ['reply', 'action', 'routine', 'maintenance'])
		const k: RunKind = 'routine'
		assert.equal(k, 'routine')
	})
})

describe('rerunnable', () => {
	const ctx = (over: Partial<VerbContext>): VerbContext => ({
		msg: { id: 2, role: 'assistant', content: 'Hi', characterId: 4, isGenerating: false },
		isLastMessage: true,
		editing: false,
		hasGeneratingMessage: false,
		canControl: false,
		canAct: true,
		action: { name: 'X', act: ['item'] },
		...over,
	})

	test('swipe, retry and extend read the rerun verdict; edit, hide and delete the line’s own', () => {
		const c = ctx({ canControl: false, canRerun: true })
		for (const k of ['swipe', 'retry', 'extend']) assert.equal(coreVerbState(k, c).disabled, false, k)
		for (const k of ['edit', 'hide', 'delete']) assert.equal(coreVerbState(k, c).disabled, true, k)
		// Absent reads as controllable, as before.
		for (const k of ['swipe', 'retry', 'edit']) assert.equal(coreVerbState(k, ctx({ canControl: true })).disabled, false, k)
	})
})

describe("Dungeon Crawler's Story waits for a character", () => {
	const specById = (id: string) => cat.CORE_SPECS.find((x) => x.slug === id)!.build() as any

	test('an opened lane closes its person’s Story, with the reason', () => {
		for (const id of [cat.DUNGEON_CRAWLER_CREATE_SPEC_ID, cat.DUNGEON_CRAWLER_WELCOME_SPEC_ID]) {
			const doc = specById(id)
			const close = doc.nodes.find((n: any) => n.definitionId === 'core:outlet/set-composer-state')
			assert.ok(close, id)
			// Closed only on a lane core's ask OPENED (`core:query/channel-lane@1`): a person who had one is not closed again.
			assert.equal(close.key, 'opened.greet.planner.seated.lane.item.fresh.opened.closeStory')
			assert.match(JSON.stringify(close.config.person), /opened\.greet\.planner\.seated\.lane\.item\.addressee/)
			assert.equal(close.config.channel, cat.DUNGEON_CRAWLER_STORY_CHANNEL)
			assert.equal(close.config.open, false)
			assert.equal(close.config.reason, cat.DUNGEON_CRAWLER_STORY_WAITING)
			assert.equal(cat.DUNGEON_CRAWLER_STORY_WAITING, 'Make your character on the Planner tab first.')
		}
	})

	test('the applied sheet opens it once there is a story — for whom the sheet says; made before the world, it says why it waits', () => {
		const doc = specById(cat.DUNGEON_CRAWLER_INTERVIEW_SPEC_ID)
		// 🚧 AUDIT A10: never on the sheet alone. The sheet script names whose Story opens (`openStory`):
		// this person's once the world stands; every made character's when this sheet built it, after genesis.
		const people = doc.nodes.find((n: any) => n.key === 'route.sheet.after.story.people')
		assert.equal(people.config.input.path, 'openStory')
		const open = doc.nodes.find((n: any) => n.key === 'route.sheet.after.story.person.item.open')
		assert.ok(open)
		assert.equal(open.definitionId, 'core:outlet/set-composer-state')
		assert.equal(open.config.channel, cat.DUNGEON_CRAWLER_STORY_CHANNEL)
		assert.equal(open.config.open, true)
		assert.ok(doc.edges.some((e: any) => e.from === 'route.sheet.after.story.person.$item' && e.to === open.key && e.toPort === 'person'))
		const pos = (k: string) => doc.nodes.find((n: any) => n.key === k).position
		assert.ok(pos('route.sheet.after.begin.genesisWrite') < pos(open.key), 'opened after the world is built')
		// Made, but no world yet: shut for the person who answered, with the reason.
		const shut = doc.nodes.find((n: any) => n.key === 'route.sheet.after.waiting.shut')
		assert.equal(shut.config.open, false)
		assert.equal(shut.config.reason, cat.DUNGEON_CRAWLER_STORY_WAITING_FOR_WORLD)
		assert.ok(doc.edges.some((e: any) => e.from === 'answer' && e.to === shut.key && e.toPort === 'person'))
	})
})
