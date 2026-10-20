/**
 * 🚧 Dungeon Crawler's story turn (PLAN-dungeon-crawler-2026-10-14, features
 * 4–14; on the ruleset handler since 2026-10-16, PLAN-rulesets §25, §26, §30):
 * the respond spec's `channel.story` branch — the books, the handler's
 * `resolve`, the hidden Planner's one JSON call, the handler's `apply`,
 * death's door, the books kept, the world written to the session's own
 * lorebook, the Narrator — and Rest and the goal action; then their scripts,
 * run as plain functions with `Math.random` stubbed (the app runs them in
 * QuickJS on the run's seeded stream:
 * `src/lib/server/pipelines/scripts/dungeonCrawlerStory.test.ts`).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getRuleset, validate } from '@serene-pub/sdk'
import * as cat from '../core-catalog/src/index.js'

const specById = (id: string) => cat.CORE_SPECS.find((x) => x.slug === id)!.build() as any
const presetValues = (doc: any) => doc.presets.find((p: any) => p.default).values as any[]
const named = (doc: any, slot: string) =>
	Object.fromEntries(presetValues(doc).filter((v: any) => v.slot === slot).map((v: any) => [v.nodeKey, v.value]))

test("the story turn: books, resolve, the Planner (retried once), apply, death's door, the books, the world, the Narrator", () => {
	const doc = specById(cat.DUNGEON_CRAWLER_RESPOND_SPEC_ID)
	// ⏳ `core:task/ruleset-resolve@1` is bound in the app (rulesets wave 2) but
	// its contract still says provisional; the R-2 finding goes once it does not.
	assert.deepEqual(
		validate(doc).filter((f: any) => f.severity === 'error' && !(f.law === 'R-2' && /ruleset-resolve/.test(f.message))),
		[],
	)
	const story = doc.nodes.filter((n: any) => n.key.startsWith('channel.story.'))
	const oracles = story.filter((n: any) => n.kind === 'oracle').map((n: any) => n.key)
	// Two calls a turn; the third only when the plan came back unreadable.
	// 🚧 The words branch's calls too (PLAN-dc-after-walk2 Q2-3): a table of words is asked its own way.
	assert.deepEqual(oracles.sort(), [
		'channel.story.plan.fresh.again.retry.replanWrite',
		'channel.story.plan.fresh.planWrite',
		'channel.story.plan.words.again.retry.replanWrite',
		'channel.story.plan.words.planWrite',
		'channel.story.say',
	])
	const keys = story.map((n: any) => n.key)
	for (const k of [
		'channel.story.books',
		'channel.story.plan.fresh.resolve',
		'channel.story.plan.fresh.fields',
		'channel.story.plan.fresh.checked',
		'channel.story.turn',
		'channel.story.placeholder',
		'channel.story.rolled.planned.apply',
		'channel.story.rolled.planned.after',
		'channel.story.door',
		'channel.story.stakes.shown.write',
		'channel.story.ledger',
		'channel.story.sheet.changed.apply',
		'channel.story.replay.deltas.apply',
		'channel.story.lorePlaces.new.place.item.write',
		'channel.story.lorePeople.new.person.item.write',
		'channel.story.loreFallen.new.cairn.item.write',
		'channel.story.filed.kept.write',
		'channel.story.save',
		'channel.story.after.journal.line.item.write',
		'channel.story.after.lanes.line.item.write',
	])
		assert.ok(keys.includes(k), k)
	// The round's hand-marked annex key is retired (AUDIT B): nothing clears it.
	assert.ok(!keys.includes('channel.story.clear'))
	// The genre rolls nothing of its own: no dice step.
	assert.ok(!keys.includes('channel.story.dice'))
	const node = (k: string) => doc.nodes.find((n: any) => n.key === k)
	const at = (k: string) => node(k).position
	// The handler, twice: resolve before the Planner, apply once the Narrator's row is open.
	assert.equal(node('channel.story.plan.fresh.resolve').definitionId, 'core:task/ruleset-resolve')
	assert.equal(node('channel.story.plan.fresh.resolve').config.mode, 'resolve')
	assert.equal(node('channel.story.rolled.planned.apply').definitionId, 'core:task/ruleset-resolve')
	assert.equal(node('channel.story.rolled.planned.apply').config.mode, 'apply')
	assert.match(JSON.stringify(node('channel.story.rolled.planned.apply').config.deltas), /channel\.story\.rolled\.planned\.deltas/)
	assert.match(JSON.stringify(node('channel.story.plan.fresh.resolve').config.owners), /channel\.story\.owners/)
	assert.ok(at('channel.story.plan.fresh.resolve') < at('channel.story.plan.fresh.planWrite'))
	// 🚧 The Narrator's row opens FIRST (AUDIT A11): a line sent while the Planner thinks comes after a reply, never lost.
	assert.ok(at('channel.story.placeholder') < at('channel.story.plan.fresh.resolve'))
	assert.ok(at('channel.story.placeholder') < at('channel.story.plan.fresh.planWrite'))
	assert.ok(at('channel.story.placeholder') < at('channel.story.rolled.planned.apply'))
	assert.ok(at('channel.story.rolled.planned.apply') < at('channel.story.door'))
	assert.ok(at('channel.story.door') < at('channel.story.stakes.shown.write'))
	// The Planner's prompt row names the handler's blocks: its context takes the fields.
	assert.match(JSON.stringify(node('channel.story.plan.fresh.planContext').config.fields), /channel\.story\.plan\.fresh\.fields/)
	const scripts = named(doc, 'scripts')
	assert.deepEqual(scripts['channel.story.books'], [{ seedKey: cat.DUNGEON_CRAWLER_BOOKS_SCRIPT.seedKey }])
	assert.deepEqual(scripts['channel.story.plan.fresh.fields'], [{ seedKey: cat.DUNGEON_CRAWLER_RULESET_FIELDS_SCRIPT.seedKey }])
	assert.deepEqual(scripts['channel.story.turn'], [{ seedKey: cat.DUNGEON_CRAWLER_TURN_SCRIPT.seedKey }])
	assert.deepEqual(scripts['channel.story.door'], [{ seedKey: cat.DUNGEON_CRAWLER_DOOR_SCRIPT.seedKey }])
	assert.deepEqual(scripts['channel.story.ledger'], [{ seedKey: cat.DUNGEON_CRAWLER_LEDGER_SCRIPT.seedKey }])
	const prompts = named(doc, 'prompts')
	assert.deepEqual(prompts['channel.story.plan.fresh.planContext'], { seedKey: cat.DUNGEON_CRAWLER_PROMPT_KEYS.turn })
	assert.deepEqual(prompts['channel.story.context'], { seedKey: cat.DUNGEON_CRAWLER_PROMPT_KEYS.narrate })
	assert.deepEqual(named(doc, 'sampling')['channel.story.plan.fresh.planWrite'], { seedKey: 'sampling-background' })
	// The genre's own fields, applied and filed at the Narrator's row.
	const params = named(doc, 'params')
	assert.deepEqual(params['channel.story.sheet.changed.apply'], { mode: 'apply' })
	assert.match(JSON.stringify(node('channel.story.sheet.changed.apply').config.worldRow), /channel\.story\.placeholder/)
	const raise = node('channel.story.raise.levels.seat.item.write')
	assert.equal(raise.definitionId, 'core:outlet/set-stat-config')
	assert.match(JSON.stringify(raise.config.worldRow), /channel\.story\.placeholder/)
	assert.ok(at('channel.story.raise.levels.seat.item.write') < at('channel.story.sheet.changed.apply'))
	// The world, in the session's own lorebook: places with their links, people, cairns.
	assert.equal(node('channel.story.lorePlaces.new.place.item.write').definitionId, 'core:outlet/create-lore-entry')
	assert.deepEqual(params['channel.story.lorePlaces.new.place.item.write'], { entryType: 'core:entry/location' })
	assert.deepEqual(params['channel.story.lorePeople.new.person.item.write'], { entryType: 'core:entry/character-lore' })
	assert.deepEqual(params['channel.story.loreFallen.new.cairn.item.write'], { entryType: 'core:entry/history' })
	assert.match(JSON.stringify(node('channel.story.lorePlaces.new.place.item.write').config.links), /lorePlaces\.new\.place\.item\.links/)
	assert.ok(at('channel.story.lorePlaces.new.place.item.write') < at('channel.story.lorePeople.new.person.item.write'))
	// The bookkeeping, not the world: one annex write of `progress` and the journal.
	assert.match(JSON.stringify(node('channel.story.filed.kept.write').config), /dungeon-crawler-progress/)
	assert.doesNotMatch(JSON.stringify(doc.nodes.map((n: any) => n.config)), /dungeon-crawler-world/)
	// The reads: the story (⏳ old table lines still left out), the lorebook, the journal.
	assert.deepEqual(params.story, { channel: 'main', limit: 30, tableLines: false })
	assert.deepEqual(params.places, { entryTypes: ['core:entry/location'], withLinks: true })
	assert.deepEqual(params.people, { entryTypes: ['core:entry/character-lore'] })
	// The fallen and the Journal folio are the story turn's own reads: the Planner's talk never needed them (AUDIT C7).
	assert.deepEqual(params['channel.story.fallen'], { entryTypes: ['core:entry/history'] })
	assert.deepEqual(params['channel.story.log'], { channel: 'travelogue', limit: cat.DUNGEON_CRAWLER_CRIB_ROUNDS })
	assert.equal(params.fallen, undefined)
	assert.ok(!doc.nodes.some((n: any) => n.key === 'channel.parley.fallen' || n.key === 'channel.parley.log'))
	// The table's line: no voice, anchored to the Narrator's row.
	const stakes = node('channel.story.stakes.shown.write')
	assert.equal(stakes.config.channel, 'table')
	assert.equal(stakes.config.speaker, undefined)
	assert.match(JSON.stringify(stakes.config.tableLine), /channel\.story\.placeholder/)
	assert.equal(node('channel.story.placeholder').config.tableLine, undefined)
	// The journal's lines are anchored to the turn's row too, so a retake takes them; 🚧 each carries its kind (§16).
	const logged = node('channel.story.after.journal.line.item.write')
	assert.equal(logged.config.channel, 'travelogue')
	assert.match(JSON.stringify(logged.config.tableLine), /channel\.story\.placeholder/)
	assert.match(JSON.stringify(logged.config.kind), /channel\.story\.after\.journal\.line\.item\.kind/)
	assert.equal(logged.config.speaker, undefined)
	// The outcomes reach the Narrator as `{{outcomes}}`, after the history (§30 amendment).
	assert.match(JSON.stringify(node('channel.story.context').config.fields), /channel\.story\.outcomes/)
	const narrate = cat.CORE_PROMPTS.find((p) => p.seedKey === cat.DUNGEON_CRAWLER_PROMPT_KEYS.narrate)!.fields as Record<string, string>
	assert.doesNotMatch(narrate.systemPrompt, /outcomes/)
	assert.match(narrate.postHistoryInstructions, /^\{\{#if outcomes\}\}Outcomes this round:\n\{\{outcomes\}\}/)
	const turnRow = cat.CORE_PROMPTS.find((p) => p.seedKey === cat.DUNGEON_CRAWLER_PROMPT_KEYS.turn)!.fields as Record<string, string>
	for (const v of ['rulesetVoice', 'rulesetSheet', 'rulesetPieces', 'rulesetTies', 'rigourLine'])
		assert.match(turnRow.systemPrompt, new RegExp(`\\{\\{${v}\\}\\}`), v)
	assert.match(turnRow.systemPrompt, /- deltas:/)
	assert.doesNotMatch(turnRow.systemPrompt, /- checks:/)
})

test("the deltas schema: generated from Vis Itineris and the genre's fields, every member required", () => {
	const delta = cat.DUNGEON_CRAWLER_DELTA_SCHEMA as any
	assert.deepEqual([...delta.required].sort(), Object.keys(delta.properties).sort())
	assert.deepEqual(delta.properties.op.enum, ['add', 'spend', 'set', 'remove', 'hit', 'use', 'traverse'])
	const slots: string[] = delta.properties.slot.enum
	for (const k of ['', 'hp', 'level', 'location', 'itineris-strength']) assert.ok(slots.includes(k), k)
	// Never the standing order, the fate, the clock or the table's rules.
	for (const k of ['standing-order', 'fate', 'crawl-time', 'difficulty']) assert.ok(!slots.includes(k), k)
	// 🚧 Never `exits`: a way out is written inside its place (`world.rooms[].exits`, AUDIT A12 — one exit model).
	assert.deepEqual(delta.properties.repertoire.enum, ['', 'weapons', 'armour', 'gear', 'consumables', 'spells', 'spell-slots', 'features', 'conditions'])
	assert.equal(delta.properties.exit, undefined)
	const checks: string[] = delta.properties.check.enum
	for (const k of ['', 'attack.melee', 'skill.athletics', 'save.dexterity']) assert.ok(checks.includes(k), k)
	assert.ok(!checks.includes('strength-mod'))
	const turn = cat.DUNGEON_CRAWLER_TURN_SCHEMA as any
	// Who stands at death's door is not the Planner's to say (AUDIT A7): every seat the turn leaves at 0 rolls.
	assert.deepEqual(turn.required, ['deltas', 'world', 'clock', 'narratorBrief', 'roundSummary', 'secrets'])
	assert.equal(turn.properties.deathsDoor, undefined)
	assert.equal(turn.properties.checks, undefined)
	assert.equal(turn.properties.changes, undefined)
	// A place carries its ways out (`DUNGEON_CRAWLER_EXIT_SCHEMA`), every member required.
	const room = turn.properties.world.properties.rooms.items
	assert.equal(room, cat.DUNGEON_CRAWLER_ROOM_SCHEMA)
	assert.equal(room.properties.exits.items, cat.DUNGEON_CRAWLER_EXIT_SCHEMA)
	const exit = cat.DUNGEON_CRAWLER_EXIT_SCHEMA as any
	assert.deepEqual([...exit.required].sort(), Object.keys(exit.properties).sort())
	// The Planner's talk proposes the same shapes: its deltas, and (the host's) places with their ways out.
	const edits = cat.DUNGEON_CRAWLER_EDITS_SCHEMA as any
	assert.equal(edits.properties.deltas.items, cat.DUNGEON_CRAWLER_DELTA_SCHEMA)
	assert.equal(edits.properties.rooms.items, cat.DUNGEON_CRAWLER_ROOM_SCHEMA)
})

test('Rest and the goal: an action each, no model call on Rest, one on a new goal', () => {
	const rest = specById(cat.DUNGEON_CRAWLER_REST_SPEC_ID)
	assert.equal(rest.contributes.actions[0].key, 'rest')
	assert.ok(!rest.nodes.some((n: any) => n.kind === 'oracle'))
	assert.match(JSON.stringify(rest.nodes.find((n: any) => n.key === 'rested.said.applied').config.worldRow), /rested\.said\.write/)
	const told = rest.nodes.find((n: any) => n.key === 'rested.said.write')
	assert.equal(told.config.channel, 'table')
	assert.equal(told.config.speaker, undefined)
	assert.match(JSON.stringify(told.config.tableLine), /rested\.said\.anchor/)
	assert.deepEqual(named(rest, 'params').head, { channel: 'main', limit: 1 })
	assert.deepEqual(rest.contributes.actions[0].audience, { see: ['owner'], act: ['owner'] })
	// The rest's own journal line, on the folio, anchored to Story's newest line.
	const logged = rest.nodes.find((n: any) => n.key === 'rested.logged.write')
	assert.match(JSON.stringify(logged.config), /travelogue/)
	assert.match(JSON.stringify(logged.config.tableLine), /rested\.logged\.anchor/)
	assert.doesNotMatch(JSON.stringify(rest.nodes.map((n: any) => n.config)), /dungeon-crawler-world/)
	const goal = specById(cat.DUNGEON_CRAWLER_GOAL_SPEC_ID)
	assert.equal(`${goal.id}#${goal.contributes.actions[0].key}`, cat.DUNGEON_CRAWLER_GOAL_ACTION)
	assert.deepEqual(goal.contributes.actions[0].venue, [{ kind: 'form' }])
	// A new goal's call; 🚧 and End's epilogue, the Narrator closing the adventure at once (P3-3).
	assert.deepEqual(goal.nodes.filter((n: any) => n.kind === 'oracle').map((n: any) => n.key).sort(), ['route.closing.say', 'route.renew.goalWrite'])
	assert.deepEqual(named(goal, 'params').places, { entryTypes: ['core:entry/location'] })
	assert.doesNotMatch(JSON.stringify(goal.nodes.map((n: any) => n.config)), /dungeon-crawler-world/)
	const seeded = new Set(cat.CORE_SCRIPTS.map((x) => x.seedKey))
	for (const s of [
		cat.DUNGEON_CRAWLER_BOOKS_SCRIPT,
		cat.DUNGEON_CRAWLER_RULESET_FIELDS_SCRIPT,
		cat.DUNGEON_CRAWLER_PLAN_SCRIPT,
		cat.DUNGEON_CRAWLER_TURN_SCRIPT,
		cat.DUNGEON_CRAWLER_DOOR_SCRIPT,
		cat.DUNGEON_CRAWLER_LEDGER_SCRIPT,
		cat.DUNGEON_CRAWLER_REST_SCRIPT,
		cat.DUNGEON_CRAWLER_GOAL_SCRIPT,
	])
		assert.ok(seeded.has(s.seedKey), s.seedKey)
	assert.ok(!seeded.has('core:script/dungeon-crawler-dice'))
	assert.equal(cat.DUNGEON_CRAWLER_SLOT_IDS.fate, 'core:slot/fate@1')
	assert.equal(cat.fateSlot.default, 'alive')
})

/* ── The scripts, as plain functions ───────────────────────────────────── */

/** Run a script with `Math.random` answering `rolls` (d20 faces) in turn. */
const runScript = (row: { source: string }, value: unknown, rolls: number[] = []) => {
	const real = Math.random
	const queue = rolls.slice()
	Math.random = () => ((queue.shift() ?? 10) - 1) / 20 + 0.001
	try {
		// eslint-disable-next-line no-new-func
		return new Function('value', row.source)(JSON.parse(JSON.stringify(value ?? null)))
	} finally {
		Math.random = real
	}
}

const K = cat.DUNGEON_CRAWLER_ANNEX_KEYS
const session = (annex: Record<string, unknown> = {}) => ({
	sessionId: 7,
	ownerUserId: 1,
	guests: [],
	cast: { sessionPersonas: [{ seatId: 4, seatUserId: 1, seatName: 'Mira', persona: null, removedAt: null }], characters: [] },
	// Core's lane register, as the settings document carries it (owner ruling 2026-10-17).
	channelLanes: { [cat.PARLEY_CHANNEL]: { 'user:1': 'parley' } },
	annex: { core: { ...annex } },
})
/** The session's state; `hpMax` the seat's full health, its hp slot's configuration in force (`state.configs`). */
const state = (seat: Record<string, unknown> = {}, world: Record<string, unknown> = {}, hpMax = 20) => ({
	world: { difficulty: 'fair', 'crawl-time': '1-01-01 08:00', ...world },
	cast: {
		byId: {
			'player_seat:4': { hp: 12, level: 1, 'character-class': 'Ranger', location: 'The Sunken Gate', ...seat },
		},
	},
	configs: { 'player_seat:4': { 'core:slot/hp@1': { min: 0, max: hpMax } } },
})
const PROGRESS = {
	shape: 'dungeon',
	goal: 'Find the drowned king.',
	built: true,
	// Mira's sheet is applied: her hero is made (🚧 P0-5 — a named seat not made is not in the round).
	heroes: { 'user:1': { name: 'Mira', made: true } },
}
/** The session's own lorebook, as `core:query/lorebook-entries@1` lists it. */
const PLACES = {
	entries: [
		{ id: 50, name: 'The Sunken Gate', content: 'Wet stone.', links: [{ id: 1, to: { entryId: 51, name: 'The Hall' }, linkType: 'leads to' }] },
		{ id: 51, name: 'The Hall', content: 'Pillars in black water.', links: [{ id: 1, to: { entryId: 50, name: 'The Sunken Gate' }, linkType: 'leads to' }] },
	],
}
const PEOPLE = { entries: [{ id: 60, name: 'Moss', content: 'A ferryman.' }] }
const FALLEN = { entries: [{ id: 70, name: null, content: 'Here lies Bram, who fell in the Hall.' }] }
const LOG = [
	{ id: 5, role: 'assistant', content: 'The party came to the gate.', channel: 'travelogue' },
	{ id: 6, role: 'assistant', content: 'Mira found a bell rope.', channel: 'travelogue' },
]
const story = [
	{ id: 10, role: 'assistant', content: 'The gate groans.', speaker: 'envoy:narrator' },
	{ id: 11, role: 'user', content: 'I climb the wall.', speaker: 'player-seat:4' },
]
const delta = (d: Record<string, unknown>) => ({
	owner: '', op: 'add', slot: '', repertoire: '', piece: '', value: '', check: '', against: 0, reason: '',
	...d,
})
/** A way out, inside its place (`DUNGEON_CRAWLER_EXIT_SCHEMA`). */
const exit = (e: Record<string, unknown>) => ({ to: '', way: 'door', state: 'open', lockDc: 0, trap: '', trapDc: 0, minutes: 0, ...e })
const PLAN = {
	deltas: [
		delta({ owner: 'player-seat:4', op: 'use', check: 'skill.athletics', against: 14, reason: 'climb the wall' }),
		delta({ owner: 'player-seat:4', op: 'spend', slot: 'hp', value: '3', reason: 'scraped hands' }),
		delta({ owner: 'player-seat:4', op: 'set', slot: 'fate', value: 'dead' }),
	],
	world: {
		rooms: [{ id: 'stair', name: 'The Stair', description: 'Steps into the dark.', exits: ['The Hall', 'The Crypt'] }, { id: 'crypt', name: 'The Crypt', description: 'Cold.', exits: [] }],
		npcs: [{ name: 'Moss', description: 'A ferryman.', mood: 'wary' }, { name: 'Ila', description: 'A drowned priestess.', mood: 'calm' }],
		leads: ['A bell rings below.'],
		goalProgress: 'closer',
		notes: '',
	},
	clock: { minutes: 90 },
	narratorBrief: 'Mira tries the wall.',
	roundSummary: 'Mira went for the wall.',
	secrets: [],
}

const books = (annex: Record<string, unknown> = { [K.progress]: PROGRESS }, messageId?: number, seat?: Record<string, unknown>) =>
	runScript(cat.DUNGEON_CRAWLER_BOOKS_SCRIPT, {
		session: session(annex), state: state(seat), story, messageId, places: PLACES, people: PEOPLE, fallen: FALLEN, log: LOG,
	})

test('books: the world from the lorebook, the story so far from the journal, the owners and actions the handler reads', () => {
	const b = books()
	assert.equal(b.fresh, true)
	assert.equal(b.redo, false)
	assert.equal(b.seats[0].ref, 'player-seat:4')
	assert.equal(b.seats[0].maxHp, 20)
	assert.match(b.brief, /Mira \(player-seat:4, Ranger, level 1, health 12\/20, at The Sunken Gate\): declared “I climb the wall\.”/)
	// The places, each with its entry for a delta to name, and its ways out.
	assert.match(b.crib, /- The Sunken Gate \[location:50\]: Wet stone\. Ways out: The Hall\./)
	assert.match(b.crib, /People:\n- Moss: A ferryman\./)
	assert.match(b.crib, /The fallen: Here lies Bram/)
	assert.match(b.crib, /The story so far, oldest first:\n- The party came to the gate\.\n- Mira found a bell rope\./)
	// Whose rules are read: the session, the live seat, the place it stands in.
	assert.deepEqual(b.owners, ['session:7', 'player-seat:4', 'location:50'])
	assert.deepEqual(b.actions, [{ owner: 'player-seat:4', text: 'I climb the wall.' }])
	// No declaration: the standing order is the action.
	const quiet = runScript(cat.DUNGEON_CRAWLER_BOOKS_SCRIPT, {
		session: session({ [K.progress]: PROGRESS }), state: state({ 'standing-order': 'follow' }), story: story.slice(0, 1), places: PLACES,
	})
	assert.deepEqual(quiet.actions, [{ owner: 'player-seat:4', text: 'follow' }])
	assert.equal(b.clockBase, '1-01-01 08:00')
	// No lorebook of its own yet: an empty world, and still a turn.
	const bare = runScript(cat.DUNGEON_CRAWLER_BOOKS_SCRIPT, { session: session({ [K.progress]: PROGRESS }), state: state(), story })
	assert.doesNotMatch(bare.crib, /Places:/)
	assert.deepEqual(bare.owners, ['session:7', 'player-seat:4'])
})

test('books: an older session — its world document read for the bookkeeping only, its places never', () => {
	const legacy = {
		shape: 'open-world', goal: 'Old goal.', heroes: { 'user:1': { name: 'Mira' } },
		rooms: [{ id: 'gate', name: 'Old Gate', description: '', exits: [] }], rounds: [{ row: 1, text: 'old round' }],
		lastTurn: { row: 9, before: {} },
	}
	const b = runScript(cat.DUNGEON_CRAWLER_BOOKS_SCRIPT, { session: session({ [K.legacyWorld]: legacy }), state: state(), story })
	assert.match(b.crib, /an open world/)
	assert.match(b.crib, /The goal: Old goal\./)
	assert.doesNotMatch(b.crib, /Old Gate/)
	assert.doesNotMatch(b.crib, /old round/)
	assert.equal(b.base.progress.rooms, undefined)
	assert.equal(b.base.progress.lastTurn, undefined)
})

test("the plan check: deltas in the handler's shape; the fate refused; a way out written out; leads are hooks", () => {
	const out = runScript(cat.DUNGEON_CRAWLER_PLAN_SCRIPT, { json: PLAN })
	assert.equal(out.ok, true)
	// The fate is no delta's (death's door alone): refused.
	assert.deepEqual(out.plan.deltas, [
		{ owner: 'player-seat:4', op: 'use', check: 'skill.athletics', against: 14, reason: 'climb the wall' },
		{ owner: 'player-seat:4', op: 'spend', slot: 'hp', value: 3, reason: 'scraped hands' },
	])
	// A way out is written out inside its place (one exit model, AUDIT A12); a bare name (an older answer) is `{ to }`.
	assert.deepEqual(out.plan.world.rooms[0], {
		id: 'stair', name: 'The Stair', description: 'Steps into the dark.',
		exits: [
			// 🚧 A trap's own effect, empty for none (PLAN-dc-after-walk3 R2-1, ★2).
			{ to: 'The Hall', way: '', state: '', lockDc: 0, trap: '', trapDc: 0, trapDamage: '', trapCondition: '', minutes: 0 },
			{ to: 'The Crypt', way: '', state: '', lockDc: 0, trap: '', trapDc: 0, trapDamage: '', trapCondition: '', minutes: 0 },
		],
	})
	const door = runScript(cat.DUNGEON_CRAWLER_PLAN_SCRIPT, {
		json: { ...PLAN, world: { ...PLAN.world, rooms: [{ id: 'hall', name: 'The Hall', description: '', exits: [exit({ to: 'The Vault', state: 'locked', lockDc: 15, trap: 'Needle', trapDc: 12, minutes: 1 }), exit({ to: '', way: '' })] }] } },
	})
	assert.deepEqual(door.plan.world.rooms[0].exits, [{ to: 'The Vault', way: 'door', state: 'locked', lockDc: 15, trap: 'Needle', trapDc: 12, trapDamage: '', trapCondition: '', minutes: 1 }])
	const summary = "Jandir spoke with Zyloth's ghost, but his spirit was consumed by darkness before he could fully relay the information about the Celestial Scepter fragments."
	const leads = runScript(cat.DUNGEON_CRAWLER_PLAN_SCRIPT, {
		json: { ...PLAN, roundSummary: 'Mira went for the wall.', world: { ...PLAN.world, leads: [summary, 'Find the second scepter fragment', 'Mira went for the wall.'] } },
	})
	assert.deepEqual(leads.plan.world.leads, ['Find the second scepter fragment'])
	assert.ok(cat.DUNGEON_CRAWLER_LEAD_WORDS >= 10)
	assert.match((cat.DUNGEON_CRAWLER_TURN_SCHEMA as any).properties.world.properties.leads.description, /hooks/)
	assert.deepEqual(runScript(cat.DUNGEON_CRAWLER_PLAN_SCRIPT, { json: { nope: 1 } }), { ok: false, retry: true, plan: null })
})

test('the turn: the first usable plan, else the retry; its deltas for the handler', () => {
	const b = books()
	const first = runScript(cat.DUNGEON_CRAWLER_PLAN_SCRIPT, { json: PLAN })
	const t = runScript(cat.DUNGEON_CRAWLER_TURN_SCRIPT, { books: b, first })
	assert.equal(t.plan.narratorBrief, 'Mira tries the wall.')
	// The check and the cost; the new rooms are the book's to write, never deltas.
	assert.equal(t.deltas.length, 2)
	const retried = runScript(cat.DUNGEON_CRAWLER_TURN_SCRIPT, { books: b, first: { ok: false }, again: { ...PLAN, deltas: [] } })
	assert.equal(retried.plan.narratorBrief, 'Mira tries the wall.')
	assert.equal(retried.deltas, null)
	assert.deepEqual(runScript(cat.DUNGEON_CRAWLER_TURN_SCRIPT, { books: b, first: { ok: false }, again: { nope: 1 } }), {
		plan: null, deltas: null, owners: b.owners, refused: null, traversals: null,
	})
	// A re-telling plans nothing.
	assert.equal(runScript(cat.DUNGEON_CRAWLER_TURN_SCRIPT, { books: { ...b, fresh: false }, first }).plan, null)
})

test('the turn: a way out of a place the book holds is an exits piece on that place, and a door that locks is the same door (one exit model, AUDIT A12)', () => {
	const b = books()
	const withRooms = (rooms: unknown[]) => runScript(cat.DUNGEON_CRAWLER_PLAN_SCRIPT, { json: { ...PLAN, deltas: [], world: { ...PLAN.world, rooms } } })
	const locked = exit({ to: 'The Hall', state: 'locked', lockDc: 15 })
	// Where the party stands (The Sunken Gate, location:50): the way out lands on that place — never on the world.
	const here = runScript(cat.DUNGEON_CRAWLER_TURN_SCRIPT, { books: b, first: withRooms([{ id: 'gate', name: 'The Sunken Gate', description: '', exits: [locked] }]) })
	assert.equal(here.deltas.length, 1)
	assert.equal(here.deltas[0].owner, 'location:50')
	assert.equal(here.deltas[0].op, 'add')
	assert.equal(here.deltas[0].repertoire, 'exits')
	// Where it leads (`towards`, required of every exit): the place the lorebook holds by that name.
	assert.deepEqual(here.deltas[0].piece, { kind: 'inline', name: 'Door to The Hall', description: 'Door to The Hall, locked', towards: 'location:51', way: 'door', state: 'locked', lockDc: 15 })
	assert.deepEqual(here.owners, ['session:7', 'player-seat:4', 'location:50'])
	// The turn runs on that plan: the handler applies the way out, and a swipe files it again (no roll).
	assert.deepEqual(here.plan.deltas, here.deltas)
	// A place nobody stands in: resolved this turn all the same.
	const there = runScript(cat.DUNGEON_CRAWLER_TURN_SCRIPT, { books: b, first: withRooms([{ id: 'hall', name: 'The Hall', description: '', exits: [exit({ to: 'The Vault', trap: 'Needle', trapDc: 12, minutes: 2 })] }]) })
	assert.equal(there.deltas[0].owner, 'location:51')
	assert.deepEqual(there.deltas[0].piece, { kind: 'inline', name: 'Door to The Vault', description: 'Door to The Vault', towards: 'The Vault', way: 'door', state: 'open', trap: { name: 'Needle', dc: 12 }, travelMinutes: 2 })
	assert.deepEqual(there.owners, ['session:7', 'player-seat:4', 'location:50', 'location:51'])
	// The place already holds a way by that name: taken off first.
	const held = { ...state(), locations: { byId: { 50: { name: 'The Sunken Gate', 'crawl-exits': [{ kind: 'inline', name: 'Door to The Hall', way: 'door', state: 'open' }] } } } }
	const relocked = runScript(cat.DUNGEON_CRAWLER_TURN_SCRIPT, {
		books: b, state: held, first: withRooms([{ id: 'gate', name: 'The Sunken Gate', description: '', exits: [locked] }]),
	})
	assert.deepEqual(relocked.deltas.map((d: any) => [d.op, d.owner, typeof d.piece === 'string' ? d.piece : d.piece.state]), [
		['remove', 'location:50', 'Door to The Hall'],
		['add', 'location:50', 'locked'],
	])
	// A room the book does not hold yet is a new place for the lorebook (the ledger's), never a delta.
	assert.equal(runScript(cat.DUNGEON_CRAWLER_TURN_SCRIPT, { books: b, first: withRooms([{ id: 'vault', name: 'The Vault', description: '', exits: [locked] }]) }).deltas, null)
})

test("the ruleset fields: the handler's blocks by name, and how this table plays", () => {
	const blocks = {
		voice: { text: 'Dice are rolled for you.' },
		sheet: { text: 'Mira — weapons: Longbow' },
		pieces: { text: 'Longbow — two hands' },
	}
	const scripted = runScript(cat.DUNGEON_CRAWLER_RULESET_FIELDS_SCRIPT, { blocks, facts: { rigour: 'scripts' } })
	assert.equal(scripted.rulesetVoice, 'Dice are rolled for you.')
	assert.equal(scripted.rulesetSheet, 'Mira — weapons: Longbow')
	assert.equal(scripted.rulesetPieces, 'Longbow — two hands')
	assert.equal(scripted.rulesetTies, '')
	assert.match(scripted.rigourLine, /^The table rolls the dice, never you\. Propose deltas, never totals/)
	const prose = runScript(cat.DUNGEON_CRAWLER_RULESET_FIELDS_SCRIPT, { blocks: {}, facts: { rigour: 'prose' } })
	assert.equal(scripted.diceRolled, 'yes')
	// At prose: nothing rolled, no dice in the prompts — but a change by an amount still counts (walk 6, 2026-10-17).
	assert.match(prose.rigourLine, /^Nothing is rolled at this table/)
	assert.match(prose.rigourLine, /add, spend/)
	assert.equal(prose.diceRolled, '')
})

/** The handler's `apply` out-ports, as the spec hands them on. */
const applied = (outcomes: Array<Record<string, unknown>>, rigour = 'scripts', explain: unknown[] = []) => ({
	blocks: outcomes.length ? { outcomes: { text: outcomes.map((o) => `- ${o.text}`).join('\n') } } : {},
	facts: { rigour },
	outcomes,
	explain,
	rejected: [],
})

test("death's door: a seat the rules left at 0 rolls; fair kills, gentle takes out; prose shows no numbers; the table line", () => {
	const b = books()
	const turn = { plan: runScript(cat.DUNGEON_CRAWLER_PLAN_SCRIPT, { json: { ...PLAN, deltas: [] } }).plan }
	const struck = applied(
		[
			{ owner: 'player-seat:4', kind: 'check', text: 'Mira — use (save.dexterity): Failure', check: { selector: 'save.dexterity', natural: 3, total: 5, against: 15 } },
			{ owner: 'player-seat:4', kind: 'effect', text: 'Mira: Health −12' },
		],
		'scripts',
		[
			{ target: 'player-seat:4.save.dexterity', total: 5, text: '5 = d20 3 + dexterity-mod 2 vs 15', terms: [{ value: 3, origin: { kind: 'roll', ref: 'd20' } }, { value: 2, origin: { kind: 'base', ref: 'dexterity-mod' } }] },
			{ target: 'player-seat:4.armour-class', total: 13, text: 'armour-class 13 = …', terms: [{ value: 13, origin: { kind: 'derived', ref: 'x' } }] },
		],
	)
	const after = state({ hp: 0 })
	const dead = runScript(cat.DUNGEON_CRAWLER_DOOR_SCRIPT, { session: session(), books: b, turn, applied: struck, after }, [4])
	assert.deepEqual(dead.deaths.map((d: any) => [d.seat, d.outcome]), [['player-seat:4', 'dead']])
	// A check's line ends with how its number was reached; the sheet's own derivations stay out.
	// 🚧 The fold's head is death's door, then the rolls, then the rest (P4-7, 2026-10-18).
	assert.equal(
		dead.line,
		"☠ Mira at death's door: d20 4 vs DC 10 — dead\n⚄ Mira — use (save.dexterity): Failure — 5 = d20 3 + dexterity-mod 2 vs 15\n⚄ Mira: Health −12",
	)
	const gentle = runScript(cat.DUNGEON_CRAWLER_DOOR_SCRIPT, {
		session: session(), books: { ...b, rules: { difficulty: 'gentle' } }, turn, applied: applied([], 'prose'), after,
	}, [4])
	assert.deepEqual(gentle.deaths.map((d: any) => d.outcome), ['taken-out'])
	assert.equal(gentle.line, "☠ Mira at death's door — taken out")
	assert.equal(runScript(cat.DUNGEON_CRAWLER_DOOR_SCRIPT, { session: session(), books: b, turn, applied: struck, after }, [10]).deaths[0].outcome, 'survives')
	// Nobody at 0, nothing applied: no line.
	const calm = runScript(cat.DUNGEON_CRAWLER_DOOR_SCRIPT, { session: session(), books: b, turn, applied: applied([]), state: state() })
	assert.deepEqual(calm.deaths, [])
	assert.equal(calm.line, null)

	// The books: fate dead, health 0, a cairn for the lorebook, an arrival, the player's lane offered a new character.
	const ledger = runScript(cat.DUNGEON_CRAWLER_LEDGER_SCRIPT, {
		session: session({ [K.progress]: PROGRESS }), books: b, turn, door: dead, applied: struck, after, row: 20,
	})
	assert.deepEqual(
		ledger.changes.filter((c: any) => c.owner === 'player-seat:4').map((c: any) => [c.slot, c.value]),
		[['core:slot/fate@1', 'dead']],
	)
	assert.deepEqual(ledger.fallen, [{ name: 'Mira', content: 'Here lies Mira, Ranger, level 1, who fell in The Sunken Gate.' }])
	assert.equal(ledger.progress.arrivals[0].who, 'user:1')
	assert.equal(ledger.laneLines[0].lane, 'parley')
	assert.equal(ledger.laneLines[0].blocks[0].referent, cat.DUNGEON_CRAWLER_QUESTIONS.newCharacter)
	assert.match(ledger.narrator.outcomes, /Mira is dead/)
	assert.match(ledger.narrator.outcomes, /What the rules decided[^\n]*\n- Mira — use \(save\.dexterity\): Failure\n- Mira: Health −12/)
	// Out of the round from now on: the round script reads it off the bookkeeping.
	assert.deepEqual(ledger.progress.fates, { 'player-seat:4': 'dead' })
	// Surviving: back on 1 health.
	const lives = runScript(cat.DUNGEON_CRAWLER_DOOR_SCRIPT, { session: session(), books: b, turn, applied: struck, after }, [10])
	const saved = runScript(cat.DUNGEON_CRAWLER_LEDGER_SCRIPT, {
		session: session({ [K.progress]: PROGRESS }), books: b, turn, door: lives, applied: struck, after, row: 20,
	})
	assert.deepEqual(saved.changes.filter((c: any) => c.slot === 'core:slot/hp@1').map((c: any) => c.value), [1])
	assert.equal(saved.progress.fates, undefined)
	assert.equal(saved.fallen, null)
})

test('ledger: the clock, the world for the lorebook, the journal, the telling a swipe re-tells — no snapshot', () => {
	const b = books()
	const turn = runScript(cat.DUNGEON_CRAWLER_TURN_SCRIPT, { books: b, first: runScript(cat.DUNGEON_CRAWLER_PLAN_SCRIPT, { json: PLAN }) })
	const ap = applied([{ owner: 'player-seat:4', kind: 'check', text: 'Mira — use (skill.athletics): Failure' }])
	const d = runScript(cat.DUNGEON_CRAWLER_DOOR_SCRIPT, { session: session(), books: b, turn, applied: ap, after: state() })
	const out = runScript(cat.DUNGEON_CRAWLER_LEDGER_SCRIPT, {
		session: session({ [K.progress]: PROGRESS }), books: b, turn, door: d, applied: ap, after: state(), row: 30,
	})
	// The genre's own fields only: the clock. The deltas were the handler's.
	assert.deepEqual(out.changes, [{ owner: 'world', slot: 'core:slot/crawl-time@1', value: '1-01-01 09:30' }])
	// New places, each carrying the ways out to places that exist by then; known people skipped.
	assert.deepEqual(out.places, [
		{ name: 'The Stair', content: 'Steps into the dark.', links: [{ to: 'The Hall', linkType: 'leads to', reverseLinkType: 'leads to' }] },
		{ name: 'The Crypt', content: 'Cold.', links: [{ to: 'The Stair', linkType: 'leads to', reverseLinkType: 'leads to' }] },
	])
	assert.deepEqual(out.people, [{ name: 'Ila', content: 'A drowned priestess. Mood: calm.' }])
	assert.deepEqual(out.journal.leads, ['A bell rings below.'])
	assert.equal(out.travelogue, 'Mira went for the wall.')
	// 🚧 The Journal's lines by kind (§16): the summary, what was found and met, the time, the new lead — no model call.
	assert.deepEqual(out.journalLines, [
		{ kind: 'did', text: 'Mira went for the wall.' },
		{ kind: 'found', text: 'Found The Stair.' },
		{ kind: 'found', text: 'Found The Crypt.' },
		{ kind: 'met', text: 'Met Ila.' },
		{ kind: 'time', text: 'Day 1, 08:00 \u2192 Day 1, 09:30.' },
		{ kind: 'lead', text: 'New lead: A bell rings below.' },
	])
	for (const l of out.journalLines) assert.ok((cat.DUNGEON_CRAWLER_JOURNAL_KINDS as readonly string[]).includes(l.kind), l.kind)
	// What the rules decided is the OUTCOMES, never the brief (§30 amendment).
	assert.match(out.narrator.outcomes, /Mira — use \(skill\.athletics\): Failure/)
	assert.doesNotMatch(out.brief, /rules decided/)
	// No snapshot: only the telling a swipe of this row re-tells.
	assert.deepEqual(Object.keys(out.progress).sort(), ['built', 'goal', 'heroes', 'lastTelling', 'shape'])
	// The deltas a swipe files again: those that need no roll (the check stays as it fell).
	assert.deepEqual(out.progress.lastTelling, {
		row: 30, brief: 'Mira tries the wall.', outcomes: out.narrator.outcomes,
		changes: out.changes, raises: null, replay: turn.deltas.filter((d: any) => d.op !== 'use'),
	})
	assert.deepEqual(out.progress.lastTelling.replay.map((d: any) => d.op), ['spend'])

	// A swipe of that row: nothing planned, rolled or written; the same telling.
	const filed = { [K.progress]: out.progress, [K.journal]: out.journal }
	const swiped = runScript(cat.DUNGEON_CRAWLER_BOOKS_SCRIPT, {
		session: session(filed), state: state(), story: [...story, { id: 30, role: 'assistant', content: 'You slip.' }], messageId: 30, places: PLACES,
	})
	assert.equal(swiped.redo, true)
	assert.equal(swiped.fresh, false)
	assert.equal(swiped.told.brief, 'Mira tries the wall.')
	const again = runScript(cat.DUNGEON_CRAWLER_LEDGER_SCRIPT, { session: session(filed), books: swiped, row: 30 })
	// A swipe takes back what the turn wrote at its row: filed again, the dice not rolled twice.
	assert.deepEqual(again.changes, out.changes)
	assert.deepEqual(again.replay, out.progress.lastTelling.replay)
	assert.equal(again.progress, null)
	assert.equal(again.places, null)
	assert.equal(again.people, null)
	assert.equal(again.travelogue, null)
	assert.equal(again.journalLines, null)
	assert.equal(again.brief, 'Mira tries the wall.')
	assert.equal(again.narrator.outcomes, out.narrator.outcomes)
	// After a retake the row is gone: the next press is a fresh turn (the
	// lorebook's rows and the state went with the row, by the host's cascade).
	const next = runScript(cat.DUNGEON_CRAWLER_BOOKS_SCRIPT, { session: session(filed), state: state(), story, places: PLACES })
	assert.equal(next.fresh, true)
})

test('ledger: a way out that leads to a new place says the door and how it stands on the link (walk 6, 2026-10-17)', () => {
	// The way out is written inside the new place (one exit model, AUDIT A12): no delta of its own.
	const vault = { id: 'vault', name: 'The Vault', description: 'Behind the iron door.', exits: [exit({ to: 'The Sunken Gate', state: 'locked', lockDc: 15 })] }
	const plan = { ...PLAN, deltas: [], world: { ...PLAN.world, rooms: [vault], npcs: [] } }
	const b = books()
	const turn = runScript(cat.DUNGEON_CRAWLER_TURN_SCRIPT, { books: b, first: runScript(cat.DUNGEON_CRAWLER_PLAN_SCRIPT, { json: plan }) })
	assert.equal(turn.deltas, null)
	const told = (rigour: string) =>
		runScript(cat.DUNGEON_CRAWLER_LEDGER_SCRIPT, { session: session({ [K.progress]: PROGRESS }), books: b, turn, door: {}, applied: applied([], rigour), after: state(), row: 34 }).places
	assert.deepEqual(told('scripts'), [
		{ name: 'The Vault', content: 'Behind the iron door.', links: [{ to: 'The Sunken Gate', linkType: 'leads to', reverseLinkType: 'leads to', description: 'Door, locked (DC 15)' }] },
	])
	// Words only: the state, never the number.
	assert.equal(told('prose')[0].links[0].description, 'Door, locked')
})

test('ledger: a place already in the book is not written again; ⏳ a new way between two known places is not written', () => {
	const plan = { ...PLAN, deltas: [], world: { ...PLAN.world, rooms: [{ id: 'gate', name: 'The Sunken Gate', description: '', exits: ['The Hall', 'The Well'] }], npcs: [] } }
	const placesWithWell = { entries: [...PLACES.entries, { id: 52, name: 'The Well', content: 'Deep.', links: [] }] }
	const bw = runScript(cat.DUNGEON_CRAWLER_BOOKS_SCRIPT, { session: session({ [K.progress]: PROGRESS }), state: state(), story, places: placesWithWell })
	const turn = runScript(cat.DUNGEON_CRAWLER_TURN_SCRIPT, { books: bw, first: runScript(cat.DUNGEON_CRAWLER_PLAN_SCRIPT, { json: plan }) })
	const out = runScript(cat.DUNGEON_CRAWLER_LEDGER_SCRIPT, { session: session({ [K.progress]: PROGRESS }), books: bw, turn, door: {}, row: 31, state: state() })
	assert.equal(out.places, null)
	assert.equal(out.links, undefined)
})

test('ledger: a level the handler applied raises the full health — the hp max, then the health', () => {
	const b = books()
	const turn = runScript(cat.DUNGEON_CRAWLER_TURN_SCRIPT, { books: b, first: runScript(cat.DUNGEON_CRAWLER_PLAN_SCRIPT, { json: { ...PLAN, deltas: [] } }) })
	const out = runScript(cat.DUNGEON_CRAWLER_LEDGER_SCRIPT, {
		session: session({ [K.progress]: PROGRESS }), books: b, turn, door: {}, applied: applied([{ text: 'Mira: Level +1' }]), after: state({ level: 2 }), row: 32,
	})
	assert.deepEqual(out.raises, [{ owner: 'player-seat:4', slot: 'core:slot/hp@1', config: { max: 20 + cat.DUNGEON_CRAWLER_HP_PER_LEVEL } }])
	assert.deepEqual(out.changes.filter((c: any) => c.owner === 'player-seat:4'), [
		{ owner: 'player-seat:4', slot: 'core:slot/hp@1', value: 12 + cat.DUNGEON_CRAWLER_HP_PER_LEVEL },
	])
})

test('ledger at prose: the handler recorded words, nothing rolled — the Narrator is told to keep numbers out', () => {
	const b = books()
	const turn = runScript(cat.DUNGEON_CRAWLER_TURN_SCRIPT, {
		books: b,
		first: runScript(cat.DUNGEON_CRAWLER_PLAN_SCRIPT, { json: { ...PLAN, deltas: [delta({ owner: 'player-seat:4', op: 'set', slot: 'hp', value: 'bruised' })] } }),
	})
	const ap = applied([{ owner: 'player-seat:4', kind: 'effect', text: 'Mira: Health is now bruised' }], 'prose')
	const d = runScript(cat.DUNGEON_CRAWLER_DOOR_SCRIPT, { session: session(), books: b, turn, applied: ap, after: state() })
	// Words only: no die on the table's line (walk 6, 2026-10-17).
	assert.equal(d.line, 'Mira: Health is now bruised')
	const out = runScript(cat.DUNGEON_CRAWLER_LEDGER_SCRIPT, { session: session({ [K.progress]: PROGRESS }), books: b, turn, door: d, applied: ap, after: state(), row: 33 })
	assert.match(out.brief, /keeps no numbers: tell every result in words/)
	assert.doesNotMatch(out.brief, /dice|roll/)
	assert.doesNotMatch(out.narrator.outcomes, /leave the numbers/)
	assert.equal(out.narrator.diceRolled, '')
})

test('goal reached: the Narrator closes the arc, the owner is asked; carry on, new goal, end', () => {
	const b = books()
	const turn = runScript(cat.DUNGEON_CRAWLER_TURN_SCRIPT, {
		books: b, first: runScript(cat.DUNGEON_CRAWLER_PLAN_SCRIPT, { json: { ...PLAN, deltas: [], world: { ...PLAN.world, goalProgress: 'reached' } } }),
	})
	const out = runScript(cat.DUNGEON_CRAWLER_LEDGER_SCRIPT, { session: session({ [K.progress]: PROGRESS }), books: b, turn, door: {}, row: 40, state: state() })
	assert.equal(out.progress.goalReached, 40)
	assert.match(out.narrator.outcomes, /reached their goal/)
	assert.deepEqual(out.laneLines[0].blocks[0].actions.map((a: any) => [a.action, a.choice]), [
		[cat.DUNGEON_CRAWLER_GOAL_ACTION, 'continue'],
		[cat.DUNGEON_CRAWLER_GOAL_ACTION, 'new-goal'],
		[cat.DUNGEON_CRAWLER_GOAL_ACTION, 'end'],
	])
	const s = session({ [K.progress]: out.progress, [K.journal]: { goal: 'Find the drowned king.', leads: [] } })
	assert.match(runScript(cat.DUNGEON_CRAWLER_GOAL_SCRIPT, { session: s, choice: 'continue', addressee: 'user:2' }).text, /owner's to decide/)
	assert.equal(runScript(cat.DUNGEON_CRAWLER_GOAL_SCRIPT, { session: s, choice: 'continue', addressee: 'user:1' }).world.goalDone, true)
	const ended = runScript(cat.DUNGEON_CRAWLER_GOAL_SCRIPT, { session: s, choice: 'end', addressee: 'user:1' })
	assert.equal(ended.world.ended, true)
	const asked = runScript(cat.DUNGEON_CRAWLER_GOAL_SCRIPT, { session: s, choice: 'new-goal', addressee: 'user:1', places: PLACES, log: LOG })
	assert.match(asked.brief, /new one/)
	assert.match(asked.crib, /Places: The Sunken Gate, The Hall\./)
	// The preamble's one crib builder (AUDIT C7): the story so far as the Journal folio tells it.
	assert.match(asked.crib, /The story so far, oldest first:\n- The party came to the gate\./)
	const filed = runScript(cat.DUNGEON_CRAWLER_GOAL_SCRIPT, {
		session: s, addressee: 'user:1', filing: true, json: { goal: 'Ring the bell.', leads: ['The bell tower.'], notes: 'It wakes something.' },
	})
	assert.deepEqual(filed.journal, { goal: 'Ring the bell.', leads: ['The bell tower.'] })
	assert.equal(filed.world.goalReached, null)
	// Ended: the next turn plans nothing, and the Narrator gives an epilogue.
	const over = books({ [K.progress]: ended.world })
	assert.equal(over.fresh, false)
	const quiet = runScript(cat.DUNGEON_CRAWLER_TURN_SCRIPT, { books: over })
	const epilogue = runScript(cat.DUNGEON_CRAWLER_LEDGER_SCRIPT, { session: session({ [K.progress]: ended.world }), books: over, turn: quiet, door: {}, row: 41, state: state() })
	assert.equal(epilogue.changes, null)
	assert.match(epilogue.narrator.outcomes, /epilogue/)
})

test("rest: full health (the seat's own max), the taken-out back up, eight hours, a journal line", () => {
	const out = runScript(cat.DUNGEON_CRAWLER_REST_SCRIPT, {
		session: session({ [K.progress]: { ...PROGRESS, fates: { 'player-seat:4': 'taken-out' } } }),
		state: state({ hp: 0, fate: 'taken-out' }, { 'crawl-time': '1-01-31 20:00' }),
	})
	assert.deepEqual(out.changes, [
		{ owner: 'player-seat:4', slot: 'core:slot/hp@1', value: 20 },
		{ owner: 'player-seat:4', slot: 'core:slot/fate@1', value: 'alive' },
		{ owner: 'world', slot: 'core:slot/crawl-time@1', value: '1-02-01 04:00' },
	])
	// Back in the round: the mirror the round script reads, emptied.
	assert.deepEqual(out.progress.fates, {})
	assert.match(out.line, /Mira recovers/)
	assert.equal(out.journal, 'The party rests. Day 31, 20:00 → Day 32, 04:00.')
	const dead = runScript(cat.DUNGEON_CRAWLER_REST_SCRIPT, {
		session: session({ [K.progress]: { ...PROGRESS, fates: { 'player-seat:4': 'dead' } } }),
		state: state({ hp: 0, fate: 'dead' }),
	})
	assert.equal(dead.changes.length, 1)
	// The dead stay dead, and out of the round: the mirror is unchanged, nothing to keep.
	assert.equal(dead.progress, null)
	const hardy = runScript(cat.DUNGEON_CRAWLER_REST_SCRIPT, { session: session({ [K.progress]: PROGRESS }), state: state({ hp: 3 }, {}, 26) })
	assert.deepEqual(hardy.changes[0], { owner: 'player-seat:4', slot: 'core:slot/hp@1', value: 26 })
})

test("a new character after a death: the interview asks the name again; the sheet makes them alive, with their class's kit", () => {
	const doc = session({ [K.progress]: PROGRESS })
	const press = (st: unknown) => runScript(cat.DUNGEON_CRAWLER_INTERVIEW_SCRIPT, {
		session: doc, referent: cat.DUNGEON_CRAWLER_QUESTIONS.newCharacter, choice: cat.DUNGEON_CRAWLER_QUESTIONS.newCharacter, addressee: 'user:1', state: st,
	})
	// The fate row decides (AUDIT A8): dead, the name is asked again…
	const plan = press(state({ hp: 0, fate: 'dead' }))
	assert.equal(plan.nextBlocks[0].referent, cat.DUNGEON_CRAWLER_QUESTIONS.name)
	// …alive (a retake undid the death), the form still standing in the lane is refused — no living kit wiped.
	const alive = press(state())
	assert.match(alive.refusal, /alive and still in the story/)
	assert.equal(alive.nextBlocks, null)
	// Their arrival is owed near where Mira fell (death.ts).
	const owed = [{ who: 'user:1', fallen: 'Mira', where: 'The Hall', left: 2 }]
	const sheet = runScript(cat.DUNGEON_CRAWLER_SHEET_SCRIPT, {
		session: session({ [K.progress]: { ...PROGRESS, arrivals: owed, heroes: { 'user:1': { name: 'Ash', class: 'Priest' } } } }),
		plan: { addressee: 'user:1', currentName: 'Ash' },
		json: { backstory: '' },
		state: state({ hp: 0, fate: 'dead', level: 3, location: '', 'crawl-weapons': [{ kind: 'compendium', compendiumId: 'core:ruleset/vis-itineris@1', pieceId: 'longbow', version: '1.0.0' }] }),
	})
	// The fallen hero's bow goes before the newcomer's kit comes.
	assert.deepEqual(sheet.kit.deltas[0], { owner: 'player-seat:4', repertoire: 'weapons', op: 'remove', piece: 'longbow' })
	assert.ok(sheet.seatChanges.some((c: any) => c.slot === 'core:slot/fate@1' && c.value === 'alive'))
	assert.ok(sheet.seatChanges.some((c: any) => c.slot === 'core:slot/level@1' && c.value === 1))
	// A cleric's health: d8 + Constitution 14's +2 (Vis Itineris's level-1 rule, 2026-10-17).
	assert.ok(sheet.seatChanges.some((c: any) => c.slot === 'core:slot/hp@1' && c.value === 10))
	assert.ok(sheet.seatChanges.some((c: any) => c.slot === 'core:slot/itineris-wisdom@1' && c.value === 16))
	// A priest takes the cleric's kit: deltas for the ruleset handler — compendium
	// pieces by id, the features written out — on the seat, never a list of words.
	assert.deepEqual(sheet.kit.owners, ['session:7', 'player-seat:4'])
	const spells = sheet.kit.deltas.filter((d: any) => d.repertoire === 'spells')
	assert.deepEqual(spells.map((d: any) => d.piece), ['sacred-flame', 'light', 'cure-wounds', 'detect-magic'])
	assert.deepEqual(spells[0], { owner: 'player-seat:4', repertoire: 'spells', op: 'add', piece: 'sacred-flame', reason: "Cleric's kit" })
	assert.equal(sheet.kit.deltas.find((d: any) => d.repertoire === 'features').piece.name, 'Turn the dead')
	assert.ok(!sheet.seatChanges.some((c: any) => /abilities|inventory|crawl-/.test(c.slot)))
	// What they carry, know and can do — by repertoire, never one list (AUDIT E).
	assert.match(sheet.text, /They carry: Mace, Chain shirt, Shield/)
	assert.match(sheet.text, /They know: /)
	assert.match(sheet.text, /They can: Turn the dead/)
	// The kit is pieces on the seat: the hero record keeps no copy (AUDIT B).
	assert.equal(sheet.world.heroes['user:1'].kit, undefined)
	// Made once the world exists: placed where their arrival was owed — nobody else of the party stands anywhere (AUDIT A9); no second genesis.
	assert.ok(sheet.seatChanges.some((c: any) => c.slot === 'core:slot/location@1' && c.value === 'The Hall'))
	assert.deepEqual(sheet.openStory, ['user:1'])
	assert.deepEqual(cat.kitDeltas('ranger', 'x').map((d: any) => d.piece).slice(0, 2), ['longbow', 'spear'])
	assert.equal(sheet.genesisBrief, null)
	// The seat's hp max (20 in the fixture) becomes the cleric's.
	assert.deepEqual(sheet.healthConfig, { max: 10 })
	// The model's number is not the health (2026-10-17): the class's is; at
	// the max already in force nothing is configured.
	const hardy = runScript(cat.DUNGEON_CRAWLER_SHEET_SCRIPT, {
		session: session({ [K.progress]: { ...PROGRESS, heroes: { 'user:1': { name: 'Ash', class: 'Priest' } } } }),
		plan: { addressee: 'user:1', currentName: 'Ash' }, json: { maxHp: 26, backstory: '' }, state: state({ hp: 0, fate: 'dead', level: 3 }, {}, 10),
	})
	assert.equal(hardy.healthConfig, null)
	assert.ok(hardy.seatChanges.some((c: any) => c.slot === 'core:slot/hp@1' && c.value === 10))
})

test("genesis: the bookkeeping, and the world for the session's own lorebook — places with their ways out, people", () => {
	const out = runScript(cat.DUNGEON_CRAWLER_GENESIS_SCRIPT, {
		session: session({ [K.progress]: { shape: 'dungeon', building: 1, heroes: { 'user:1': { name: 'Mira' } } } }),
		sheet: {},
		json: {
			goal: 'Wake the drowned king.',
			rooms: [
				{ id: 'gate', name: 'The Sunken Gate', description: 'Wet stone.', exits: ['The Hall'] },
				{ id: 'hall', name: 'The Hall', description: 'Pillars.', exits: ['The Sunken Gate', 'The Well'] },
				{ id: 'well', name: 'The Well', description: 'Deep.', exits: [] },
			],
			npcs: [{ name: 'Moss', description: 'A ferryman.' }],
			leads: ['Find the bell.'],
			notes: 'The king is awake.',
		},
		// The goal mode is the world's slot (AUDIT C7: no bookkeeping copy).
		state: state({ location: '' }, { 'goal-mode': 'secret' }),
	})
	assert.deepEqual(out.places, [
		{ name: 'The Sunken Gate', content: 'Wet stone.', links: [] },
		{ name: 'The Hall', content: 'Pillars.', links: [{ to: 'The Sunken Gate', linkType: 'leads to', reverseLinkType: 'leads to' }] },
		{ name: 'The Well', content: 'Deep.', links: [{ to: 'The Hall', linkType: 'leads to', reverseLinkType: 'leads to' }] },
	])
	assert.deepEqual(out.people, [{ name: 'Moss', content: 'A ferryman.' }])
	assert.equal(out.world.built, true)
	// Built: no longer being built; where the party stands is the seats' (AUDIT A9), never a copy here.
	assert.equal(out.world.building, undefined)
	assert.equal(out.world.here, undefined)
	assert.equal(out.world.rooms, undefined)
	assert.deepEqual(out.journal, { goal: cat.DUNGEON_CRAWLER_SECRET_GOAL_LINE, leads: ['Find the bell.'] })
	assert.equal(out.notes, 'Secret goal: Wake the drowned king.\nThe king is awake.')
	assert.deepEqual(out.placements, [{ owner: 'player-seat:4', slot: 'core:slot/location@1', value: 'The Sunken Gate' }])
})

test("the journal: a line near-identical to the previous one on the folio is not written (owner screenshot 2026-10-15)", () => {
	const SEEN =
		'Mira encountered the spectral form of Zyloth, who warned of an ancient evil resurging and tasked her with finding the scattered pieces of the Celestial Scepter.'
	const AGAIN =
		'Mira spoke with the ghost of Zyloth, who warned of an ancient evil resurging and tasked her with finding the scattered pieces of the Celestial Scepter.'
	const turn = (prior: string | null, summary: string) => {
		const b = runScript(cat.DUNGEON_CRAWLER_BOOKS_SCRIPT, {
			session: session({ [K.progress]: PROGRESS }), state: state(), story,
			log: prior ? [{ id: 1, role: 'assistant', content: prior }] : [],
		})
		const t = runScript(cat.DUNGEON_CRAWLER_TURN_SCRIPT, { books: b, first: runScript(cat.DUNGEON_CRAWLER_PLAN_SCRIPT, { json: { ...PLAN, deltas: [], roundSummary: summary } }) })
		return runScript(cat.DUNGEON_CRAWLER_LEDGER_SCRIPT, { session: session({ [K.progress]: PROGRESS }), books: b, turn: t, door: {}, row: 30, state: state() })
	}
	assert.equal(turn(null, SEEN).travelogue, SEEN)
	assert.equal(turn(SEEN, AGAIN).travelogue, null)
	assert.equal(turn(AGAIN, 'Mira left the gatehouse for the drowned hall.').travelogue, 'Mira left the gatehouse for the drowned hall.')
	assert.equal(turn('Summary 2.', 'Summary 3.').travelogue, 'Summary 3.')
	assert.equal(turn('Summary 2.', 'summary 2').travelogue, null)
	// 🚧 Every kind is a row (§16): the previous round's summary is followed by its other lines, and still holds.
	const b = runScript(cat.DUNGEON_CRAWLER_BOOKS_SCRIPT, {
		session: session({ [K.progress]: PROGRESS }), state: state(), story,
		log: [SEEN, 'Found The Hall.', 'Day 1, 08:00 \u2192 Day 1, 08:30.', 'New lead: The bell.'].map((content, i) => ({ id: i + 1, role: 'assistant', content })),
	})
	const t = runScript(cat.DUNGEON_CRAWLER_TURN_SCRIPT, { books: b, first: runScript(cat.DUNGEON_CRAWLER_PLAN_SCRIPT, { json: { ...PLAN, deltas: [], roundSummary: AGAIN } }) })
	const out = runScript(cat.DUNGEON_CRAWLER_LEDGER_SCRIPT, { session: session({ [K.progress]: PROGRESS }), books: b, turn: t, door: {}, row: 30, state: state() })
	assert.equal(out.travelogue, null)
	assert.ok(!out.journalLines.some((l: any) => l.kind === 'did'))
})

test("the starting kits: every compendium id is a row of the slice; six kits; a class no kit names takes the fighter's", () => {
	const rows = getRuleset('core:ruleset/vis-itineris@1')!.compendium!.rows as Record<string, readonly { id: string }[]>
	assert.equal(Object.keys(cat.DUNGEON_CRAWLER_KITS).length, 6)
	for (const [key, kit] of Object.entries(cat.DUNGEON_CRAWLER_KITS))
		for (const rep of ['weapons', 'armour', 'gear', 'consumables', 'spells'] as const)
			for (const id of kit[rep]) assert.ok(rows[rep]!.some((r) => r.id === id), `${key}: ${rep}/${id}`)
	assert.equal(cat.kitKeyFor('Hedge Wizard'), 'wizard')
	assert.equal(cat.kitKeyFor('Tomb robber'), 'fighter')
	assert.equal(cat.kitKeyFor('Archer of the Vale'), 'ranger')
	// Every kit field is one of the genre's ruleset fields.
	const fields = new Set(cat.DUNGEON_CRAWLER_RULESET_SLOTS.map((s: any) => s.id))
	for (const key of Object.keys(cat.DUNGEON_CRAWLER_KITS)) for (const c of cat.kitChanges(key)) assert.ok(fields.has(c.slot), c.slot)
	assert.equal((cat.crawlExitsSlot.config as any)?.repertoire, 'core:ruleset/vis-itineris@1#exits')
	assert.deepEqual([...cat.crawlExitsSlot.appliesTo!], ['location'])
	assert.deepEqual([...cat.crawlFusesSlot.appliesTo!], ['world'])
})

test('the prompts: the Narrator never writes a roll line; the Planner summarises only what is new (2026-10-15)', () => {
	const fields = (key: string) => cat.CORE_PROMPTS.find((p) => p.seedKey === key)!.fields as Record<string, string>
	assert.match(fields(cat.DUNGEON_CRAWLER_PROMPT_KEYS.narrate).systemPrompt, /Never write dice, DCs or roll results: the roll lines are the table's/)
	assert.match(fields(cat.DUNGEON_CRAWLER_PROMPT_KEYS.turn).systemPrompt, /roundSummary: what is NEW this round, in one past-tense sentence/)
	assert.doesNotMatch(fields(cat.DUNGEON_CRAWLER_PROMPT_KEYS.sheet).systemPrompt, /- abilities:|- gear:/)
	assert.doesNotMatch(fields(cat.DUNGEON_CRAWLER_PROMPT_KEYS.edits).systemPrompt, /- abilities:|- gear:/)
})
