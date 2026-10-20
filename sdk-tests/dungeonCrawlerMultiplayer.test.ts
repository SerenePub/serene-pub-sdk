/**
 * 🚧 Dungeon Crawler's multiplayer half (PLAN-dungeon-crawler-2026-10-14,
 * features 15–19): the reveal action, the secrets fragment and its script,
 * the standing order's question, and the shared contracts in `names.ts`.
 * The round itself is the round script's decision table, run in the app's
 * QuickJS sandbox (`dungeonCrawlerRound.test.ts`); the roads end to end are
 * the app's `sessions.dungeonCrawlerRounds.int.test.ts`.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { compile, sessionEvents, spec, validate } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import * as cat from '../core-catalog/src/index.js'

const K = cat.DUNGEON_CRAWLER_ANNEX_KEYS
const specById = (id: string) => cat.CORE_SPECS.find((x) => x.slug === id)!.build() as any
const presetValues = (doc: any) => doc.presets.find((p: any) => p.default).values as any[]
const named = (doc: any, slot: string) =>
	Object.fromEntries(presetValues(doc).filter((v: any) => v.slot === slot).map((v: any) => [v.nodeKey, v.value]))
const runScript = (seedRow: { source: string }, value: unknown) =>
	// eslint-disable-next-line no-new-func
	new Function('value', seedRow.source)(JSON.parse(JSON.stringify(value)))
const seat = (seatId: number, userId: number, name: string | null, persona: any = null) => ({
	seatId,
	seatUserId: userId,
	seatName: name,
	persona,
	removedAt: null,
})
/** Core's lane register on the settings document (owner ruling 2026-10-17): whose Planner lane is whose. */
const session = (annex: Record<string, unknown> = {}, seats: any[] = [], guests: number[] = [7]) => ({
	sessionId: 7,
	ownerUserId: 1,
	guests,
	cast: { sessionPersonas: seats },
	channelLanes: { [cat.PARLEY_CHANNEL]: { 'user:1': 'parley', 'user:7': 'parley:2' } },
	annex: { core: annex },
})

test('reveal: an owner-only composer action, published and in the preset, no model call', () => {
	const doc = specById(cat.DUNGEON_CRAWLER_REVEAL_SPEC_ID)
	assert.deepEqual(validate(doc).filter((f: any) => f.severity === 'error'), [])
	const [action] = doc.contributes.actions
	assert.equal(action.key, 'reveal')
	assert.deepEqual(action.venue, [{ kind: 'composer' }])
	assert.deepEqual(action.audience, { see: ['owner'], act: ['owner'] })
	assert.ok(!doc.nodes.some((n: any) => n.kind === 'oracle'))
	const keys = doc.nodes.map((n: any) => n.key)
	for (const k of ['reveal', 'lane', 'route.refused.write', 'route.revealed.copy', 'route.revealed.tell']) assert.ok(keys.includes(k), k)
	assert.deepEqual(named(doc, 'scripts').reveal, [{ seedKey: cat.DUNGEON_CRAWLER_REVEAL_SCRIPT.seedKey }])
	const preset = cat.corePresets().find((p) => p.slug === 'dungeon-crawler-default')!
	assert.ok(preset.actions?.include?.includes(`${cat.DUNGEON_CRAWLER_REVEAL_SPEC_ID}#reveal`))
	// The notice is a side note: it does not end the round.
	const tell = doc.nodes.find((n: any) => n.key === 'route.revealed.tell')
	assert.equal(JSON.stringify(tell).includes('"narration":true'), true)
})

test('reveal script: copies once, a stand-in for no notes, then refuses in the owner lane', () => {
	const first = runScript(cat.DUNGEON_CRAWLER_REVEAL_SCRIPT, { session: session({ [K.planningNotes]: ' The king lives. ' }) })
	assert.equal(first.notes, 'The king lives.')
	assert.equal(first.refusal, null)
	assert.equal(first.lane, 'parley')
	assert.ok(first.notice)
	assert.equal(first.journal, null, 'a shared goal: the journal already says it')
	// A secret goal: the reveal puts the real goal in the journal (round 2).
	const secret = runScript(cat.DUNGEON_CRAWLER_REVEAL_SCRIPT, {
		session: session({
			[K.progress]: { goal: 'Find the drowned king.', goalMode: 'secret' },
			[K.journal]: { goal: cat.DUNGEON_CRAWLER_SECRET_GOAL_LINE, leads: ['A bell rings.'] },
		}),
	})
	assert.deepEqual(secret.journal, { goal: 'Find the drowned king.', leads: ['A bell rings.'] })
	const revealDoc: any = cat.dungeonCrawlerRevealSpec()
	assert.ok(revealDoc.nodes.some((n: any) => n.key === 'route.goal.write'))
	const empty = runScript(cat.DUNGEON_CRAWLER_REVEAL_SCRIPT, { session: session() })
	assert.equal(empty.notes, 'The Planner kept no notes.')
	const again = runScript(cat.DUNGEON_CRAWLER_REVEAL_SCRIPT, {
		session: session({ [K.planningNotes]: 'x', [K.planningNotesRevealed]: 'x' }),
	})
	assert.ok(again.refusal)
	assert.equal(again.notes, null)
	assert.equal(again.lane, 'parley')
})

test('secrets script: by seat ref, card, player or name, to that player lane; nobody else, nothing empty', () => {
	const seats = [seat(3, 7, 'Bo'), seat(4, 1, null, { id: 40, name: 'Kesh', userId: 1 })]
	const go = (secrets: unknown) => runScript(cat.DUNGEON_CRAWLER_SECRETS_SCRIPT, { session: session({}, seats), secrets })
	assert.deepEqual(go(undefined), { deliveries: null })
	assert.deepEqual(go([]), { deliveries: null })
	const out = go([
		{ seat: 'player-seat:3', text: 'The ferryman winks at you.' },
		{ seat: 'character:40', text: 'Your ring is warm.' },
		{ seat: 'user:7', text: 'You hear a bell.' },
		{ seat: 'bo', text: 'By name.' },
		{ seat: 'player-seat:99', text: 'Nobody here.' },
		{ seat: 'player-seat:3', text: '   ' },
	])
	assert.deepEqual(
		out.deliveries.map((d: any) => d.lane),
		['parley:2', 'parley', 'parley:2', 'parley:2'],
	)
	assert.ok(out.deliveries[0].text.endsWith('The ferryman winks at you.'))
})

test('secrets script: told once — a lane already holding the line is not told again (swipe, retry, a repeating Planner)', () => {
	const seats = [seat(3, 7, 'Bo'), seat(4, 1, null, { id: 40, name: 'Kesh', userId: 1 })]
	const secrets = [
		{ seat: 'player-seat:3', text: 'The amulet is cursed.' },
		{ seat: 'character:40', text: 'The amulet is cursed.' },
		{ seat: 'player-seat:3', text: 'The amulet is cursed.' },
	]
	const go = (told: unknown) => runScript(cat.DUNGEON_CRAWLER_SECRETS_SCRIPT, { session: session({}, seats), secrets, told })
	// Nothing told yet: each lane once — the same line twice in one turn is one row.
	assert.deepEqual(go([]).deliveries.map((d: any) => d.lane), ['parley:2', 'parley'])
	// Lane 2 was told already (a swipe re-driving the turn): only lane 1 now.
	const told = [{ id: 9, role: 'assistant', channel: 'parley:2', content: 'For you alone: The amulet is cursed.' }]
	assert.deepEqual(go(told).deliveries.map((d: any) => d.lane), ['parley'])
	// A person's own line saying it is not the Planner telling it.
	assert.deepEqual(go([{ ...told[0], role: 'user' }]).deliveries.length, 2)
	// Both told: nothing to write.
	assert.deepEqual(go([...told, { id: 10, role: 'assistant', channel: 'parley', content: 'For you alone: The amulet is cursed.' }]), { deliveries: null })
})

test('deliverSecrets: a fragment any story branch can carry — script by seed key, one Planner row per secret', () => {
	const w = { scripts: [], prompts: [], params: [], background: [] } as any
	const b: any = spec('test:spec/dc-secrets', { version: '1.0.0', taxonomy: { role: 'primary' } }).inlet('input', C.userMessage.v1(), {
		genre: cat.dungeonCrawlerGenre,
		event: sessionEvents.messageRespond,
	})
	const built = cat.deliverSecrets(b, w, '', { session: ($: any) => $.input.session, secrets: ($: any) => $.input.payload })
	const doc = compile(built.build()) as any
	const keys = doc.nodes.map((n: any) => n.key)
	for (const k of ['told', 'secrets', 'secret.due.list', 'secret.due.one.item.lane', 'secret.due.one.item.line', 'secret.due.one.item.write'])
		assert.ok(keys.includes(k), k)
	assert.deepEqual(w.scripts[0], ['secrets', cat.DUNGEON_CRAWLER_SECRETS_SCRIPT.seedKey])
	// What the lanes were told: the whole Planner channel, every lane.
	assert.deepEqual(
		w.params.find(([k]: [string]) => k === 'told')[1],
		{ channel: cat.PARLEY_CHANNEL, limit: cat.DUNGEON_CRAWLER_SECRETS_TOLD_WINDOW },
	)
	assert.ok(cat.CORE_SCRIPTS.some((x) => x.seedKey === cat.DUNGEON_CRAWLER_SECRETS_SCRIPT.seedKey))
	assert.ok(cat.CORE_SCRIPTS.some((x) => x.seedKey === cat.DUNGEON_CRAWLER_REVEAL_SCRIPT.seedKey))
})

test('the standing order: asked under the sheet, answered on the seat', () => {
	// Two seats at the table: rounds can pass without a player (§14).
	const two = [seat(2, 1, 'Ann'), seat(3, 7, 'Bo')]
	const sheet = runScript(cat.DUNGEON_CRAWLER_SHEET_SCRIPT, {
		session: session({}, two),
		plan: { addressee: 'user:7', currentName: 'Bo' },
		json: { backstory: 'A thief.' },
	})
	assert.equal(sheet.blocks[0].referent, cat.STANDING_ORDER_QUESTION)
	assert.equal(sheet.blocks[0].addressee, 'user:7')
	assert.equal(sheet.blocks[0].question, "What does Bo do when you're away?")
	assert.deepEqual(
		sheet.blocks[0].actions.map((a: any) => a.choice),
		cat.DUNGEON_CRAWLER_STANDING_ORDERS.map((o) => o.key),
	)
	// The slot's own choices, in its order.
	assert.deepEqual(cat.DUNGEON_CRAWLER_STANDING_ORDERS.map((o) => o.key), (cat.standingOrderSlot as any).config.of)
	// 🚧 Solo: no standing order (§14) — the sheet asks nothing, and the slot's row shows only from two seats.
	const solo = runScript(cat.DUNGEON_CRAWLER_SHEET_SCRIPT, {
		session: session({}, [seat(2, 1, 'Ann')], []),
		plan: { addressee: 'user:1', currentName: 'Ann' },
		json: { backstory: '' },
	})
	assert.equal(solo.blocks, null)
	assert.equal((cat.standingOrderSlot as any).minSeats, 2)
	const answer = (choice: string, seats: any[], guests: number[] = [7]) =>
		runScript(cat.DUNGEON_CRAWLER_INTERVIEW_SCRIPT, {
			session: session({}, seats, guests),
			referent: cat.STANDING_ORDER_QUESTION,
			addressee: 'user:7',
			choice,
			values: {},
		})
	const set = answer('fight', two)
	assert.equal(set.seatName, 'Bo')
	assert.deepEqual(set.seatChanges, [{ slot: 'core:slot/standing-order@1', value: 'fight' }])
	assert.equal(set.lane, 'parley:2')
	assert.match(set.note, /Bo will fight/)
	assert.equal(set.nextBlocks, null)
	assert.ok(answer('dance', two).refusal)
	// No character yet: their name first.
	assert.match(answer('hold', []).refusal, /name first/)
	// Alone at the table: no round to sit out.
	const alone = runScript(cat.DUNGEON_CRAWLER_INTERVIEW_SCRIPT, {
		session: session({}, [seat(2, 1, 'Ann')], []), referent: cat.STANDING_ORDER_QUESTION, addressee: 'user:1', choice: 'fight', values: {},
	})
	assert.match(alone.refusal, /only one at the table/)
	assert.equal(alone.seatChanges, null)
	// The interview's sheet line carries the question.
	const doc = specById(cat.DUNGEON_CRAWLER_INTERVIEW_SPEC_ID)
	assert.ok(doc.nodes.some((n: any) => n.key === 'route.sheet.told.said.blocks'))
})

test('the shared contracts: the declared rule, the secrets schema, the split-party sentence', () => {
	assert.match(cat.DUNGEON_CRAWLER_DECLARED_RULE, /since|after the Story's newest reply/)
	assert.deepEqual(cat.DUNGEON_CRAWLER_SECRETS_SCHEMA.items.required, ['seat', 'text'])
	assert.match(cat.DUNGEON_CRAWLER_SPLIT_PARTY_RULE, /different places/)
	assert.match(cat.DUNGEON_CRAWLER_SPLIT_PARTY_RULE, /secrets/)
	// The round script reads the host's rows reading.
	assert.ok(cat.DUNGEON_CRAWLER_ROUND_SCRIPT.source.includes('sentSinceReply'))
})
