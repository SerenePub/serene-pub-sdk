/**
 * 🚧 Dungeon Crawler after the 100-turn walk (PLAN-dc-after-walk100-2026-10-18,
 * lane A: P0, P1, P3) — what the walk found unplayable, silent or confusing,
 * pinned at the genre's own level: the specs' wiring, the prompt rows and the
 * scripts run as plain functions (the app runs them in QuickJS; the
 * end-to-end paths are `sessions.dungeonCrawlerWalk100.int.test.ts`).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as cat from '../core-catalog/src/index.js'

const specById = (id: string) => cat.CORE_SPECS.find((x) => x.slug === id)!.build() as any
const presetValues = (doc: any) => doc.presets.find((p: any) => p.default).values as any[]
const named = (doc: any, slot: string) =>
	Object.fromEntries(presetValues(doc).filter((v: any) => v.slot === slot).map((v: any) => [v.nodeKey, v.value]))
const row = (key: string) => cat.CORE_PROMPTS.find((p) => p.seedKey === key)!.fields as Record<string, string>

const runScript = (seedRow: { source: string }, value: unknown) =>
	// eslint-disable-next-line no-new-func
	new Function('value', seedRow.source)(JSON.parse(JSON.stringify(value)))

test('P0-1: the story turn ends on a user turn — the round is the books call’s last turn; the Narrator’s outcomes and reminder before its seed', () => {
	const doc = specById(cat.DUNGEON_CRAWLER_RESPOND_SPEC_ID)
	const templates = named(doc, 'template')
	// The Planner's books, first ask and retry alike: the brief template, the round last.
	for (const node of ['channel.story.plan.fresh.planPrompt', 'channel.story.plan.fresh.again.retry.replanPrompt'])
		assert.equal(templates[node]?.source, cat.DUNGEON_CRAWLER_BRIEF_TEMPLATE, node)
	const turn = row(cat.DUNGEON_CRAWLER_PROMPT_KEYS.turn)
	assert.doesNotMatch(turn.systemPrompt, /\{\{turnDirection\}\}/)
	assert.match(turn.postHistoryInstructions, /^\{\{turnDirection\}\}\n\nRemember: one JSON object holding the round's books/)
	// The Narrator: the story, then the post-history (outcomes, reminder) as a user turn, then the seed.
	const narrate = templates['channel.story.prompt']?.source as string
	assert.equal(narrate, cat.DUNGEON_CRAWLER_NARRATE_TEMPLATE)
	const reminder = narrate.indexOf('{{{postHistoryInstructions}}}')
	assert.ok(narrate.lastIndexOf('{{#userBlock}}', reminder) > narrate.indexOf('{{/each}}'), 'the reminder is a user block after the story')
	assert.ok(narrate.indexOf('(eq id -2)', reminder) > reminder, 'the seed line is drawn after it')
	assert.match(narrate, /\{\{#unless \(eq id -2\)\}\}/)
	// The other calls of the turn kept their layout (the brief template where they had it).
	assert.equal(templates['channel.parley.talkPrompt'], undefined)
})

test('P0-1: a round nobody spoke in says so — Continue resolves it from the standing orders', () => {
	const seat = { seatId: 5, seatUserId: 1, seatName: 'Ann', persona: null, removedAt: null }
	const session = { sessionId: 7, ownerUserId: 1, guests: [], cast: { sessionPersonas: [seat] }, annex: { core: {} } }
	const books = (story: unknown[]) => runScript(cat.DUNGEON_CRAWLER_BOOKS_SCRIPT, { session, state: {}, story, places: [], people: [], fallen: [], log: [] })
	assert.match(books([{ role: 'assistant', content: 'The water stills.' }]).brief, /Nobody new declared this round: resolve it from each character's standing order\./)
	assert.doesNotMatch(
		books([{ role: 'assistant', content: 'The water stills.' }, { role: 'user', content: 'I wade in.', userId: 1 }]).brief,
		/Nobody new declared/,
	)
})

/* ── Fixtures: Mira on seat 4 (the owner's), Bo on seat 5 (a guest's), Tamsin a companion ── */

const K = cat.DUNGEON_CRAWLER_ANNEX_KEYS
const MIRA = { seatId: 4, seatUserId: 1, seatName: 'Mira', persona: null, removedAt: null }
const BO = { seatId: 5, seatUserId: 7, seatName: 'Bo', persona: null, removedAt: null }
const session = (annex: Record<string, unknown> = {}, seats: any[] = [MIRA], extra: Record<string, unknown> = {}) => ({
	sessionId: 7,
	ownerUserId: 1,
	guests: [7],
	cast: { sessionPersonas: seats, characters: [{ id: 30, name: 'Brother Tamsin' }] },
	channelLanes: { [cat.PARLEY_CHANNEL]: { 'user:1': 'parley', 'user:7': 'parley:2' } },
	annex: { core: { ...annex } },
	...extra,
})
const made = (heroes: Record<string, unknown> = { 'user:1': { name: 'Mira', made: true } }) => ({ [K.progress]: { shape: 'dungeon', built: true, heroes } })
const bag = (x: Record<string, unknown> = {}) => ({ hp: 12, level: 1, 'character-class': 'Wizard', location: 'The Sunken Gate', ...x })
const state = (seats: Record<string, unknown> = { 'player_seat:4': bag() }, locations: Record<string, unknown> = {}) => ({
	world: { difficulty: 'fair', 'crawl-time': '1-01-01 08:00' },
	cast: { byId: seats },
	locations: { byId: locations },
	configs: { 'player_seat:4': { 'core:slot/hp@1': { min: 0, max: 20 } } },
})
const PLACES = { entries: [{ id: 50, name: 'The Sunken Gate', content: 'Wet stone.', links: [] }, { id: 51, name: 'The Vault', content: 'Dark.', links: [] }] }
const delta = (d: Record<string, unknown>) => ({ owner: '', op: 'add', slot: '', repertoire: '', piece: '', value: '', check: '', against: 0, reason: '', ...d })
const planOf = (deltas: unknown[]) =>
	runScript(cat.DUNGEON_CRAWLER_PLAN_SCRIPT, {
		json: { deltas, world: { rooms: [], npcs: [], leads: [], goalProgress: 'none', notes: '' }, clock: { minutes: 5 }, narratorBrief: 'On.', roundSummary: '', secrets: [] },
	})
const booksOf = (s: any, st: any, story: unknown[] = [{ role: 'user', content: 'I act.', speaker: 'player-seat:4' }]) =>
	runScript(cat.DUNGEON_CRAWLER_BOOKS_SCRIPT, { session: s, state: st, story, places: PLACES, people: [], fallen: [], log: [] })
const turnOf = (s: any, st: any, deltas: unknown[]) =>
	runScript(cat.DUNGEON_CRAWLER_TURN_SCRIPT, { session: s, books: booksOf(s, st), first: planOf(deltas), state: st })

test('P0-5: a named seat whose character is not made is neither waited for nor in the round', () => {
	const s = session(made(), [MIRA, BO])
	const st = state({ 'player_seat:4': bag(), 'player_seat:5': { hp: 20 } })
	const b = booksOf(s, st)
	assert.deepEqual(b.actions, [{ owner: 'player-seat:4', text: 'I act.' }])
	assert.ok(!b.owners.includes('player-seat:5'))
	assert.doesNotMatch(b.brief, /player-seat:5/)
	assert.match(b.brief, /Still making their character, not in the story yet: Bo\./)
	// Once Bo's sheet is applied, Bo is in it.
	const both = booksOf(session(made({ 'user:1': { name: 'Mira', made: true }, 'user:7': { name: 'Bo', made: true } }), [MIRA, BO]), st)
	assert.ok(both.owners.includes('player-seat:5'))
})

test("P1-1: deltas normalised before the handler refuses them — names, an overkill blow, an unchecked use, a companion", () => {
	const s = session(made())
	const st = state({ 'player_seat:4': bag({ hp: 6, 'crawl-consumables': [{ kind: 'compendium', pieceId: 'potion-of-healing', uses: 1 }] }) })
	const t = turnOf(s, st, [
		delta({ owner: 'Mira', op: 'spend', slot: 'hp', value: '99', reason: 'the ogre' }),
		delta({ owner: 'player-seat:4', op: 'use', piece: 'potion-of-healing', reason: 'drinks it' }),
		delta({ owner: 'Brother Tamsin', op: 'spend', slot: 'hp', value: '3', reason: 'takes a blow' }),
	])
	// By name, and brought to what is left (owner ruling 2026-10-18): death's door decides from there.
	assert.deepEqual(t.deltas[0], { owner: 'player-seat:4', op: 'spend', slot: 'hp', value: 6, reason: 'the ogre' })
	// 🚧 A use with no check stays a use on the kits' ruleset (lane B, owner ruling ★4): the handler
	// executes it — heals, cures — and spends what it uses up. Off it (Story), the piece is spent in words.
	assert.deepEqual(t.deltas[1], { owner: 'player-seat:4', op: 'use', piece: 'potion-of-healing', reason: 'drinks it' })
	const storyBooks = runScript(cat.DUNGEON_CRAWLER_BOOKS_SCRIPT, {
		session: s, state: st, story: [{ role: 'user', content: 'I act.', speaker: 'player-seat:4' }], places: PLACES, people: [], fallen: [], log: [],
		ruleset: { id: 'core:ruleset/freeform@1', rigour: 'prose', settings: {} },
	})
	// 🚧 A table of words is asked in its own branch (PLAN-dc-after-walk2 Q2-3): its answer is `firstWords`.
	const inWords = runScript(cat.DUNGEON_CRAWLER_TURN_SCRIPT, { session: s, books: storyBooks, firstWords: planOf([delta({ owner: 'player-seat:4', op: 'use', piece: 'potion-of-healing', reason: 'drinks it' })]), state: st })
	assert.deepEqual(inWords.deltas[0], { owner: 'player-seat:4', op: 'spend', repertoire: 'consumables', piece: 'potion-of-healing', reason: 'drinks it' })
	// A companion is narrative only: refused, in words.
	assert.equal(t.deltas.length, 2)
	assert.match(t.refused[0].words, /^Not changed: Brother Tamsin travels with the party in the story only/)
})

test('P1-2: every refused change is a table line in human words, and the Narrator is told it did not happen', () => {
	const s = session(made())
	const st = state()
	const b = booksOf(s, st)
	const turn = runScript(cat.DUNGEON_CRAWLER_TURN_SCRIPT, { session: s, books: b, first: planOf([]), state: st })
	const rejected = [
		{ delta: { owner: 'player-seat:4', op: 'hit', piece: 'longsword', check: 'attack.melee' }, reason: 'unknown-piece', why: 'Mira holds nothing called "longsword" to hit.' },
		{ delta: { owner: 'player-seat:4', op: 'set', slot: 'core:slot/hp@1', value: 40 }, reason: 'set-on-ruleset-value', why: 'x', proposalId: 12 },
		{ delta: { owner: 'Juniper', op: 'add', slot: 'character-class', value: 'Fighter' }, reason: 'unknown-owner', why: 'y' },
	]
	const door = runScript(cat.DUNGEON_CRAWLER_DOOR_SCRIPT, { session: s, books: b, turn, applied: { facts: { rigour: 'scripts' }, outcomes: [], explain: [], rejected }, after: st, state: st })
	assert.match(door.line, /Not changed: Mira doesn't carry a longsword\./)
	assert.match(door.line, /Not changed: Mira's health changes by an amount, never set outright — the change waits for the session owner's review\./)
	assert.match(door.line, /Not changed: Juniper isn't anyone this round's changes can reach\./)
	assert.doesNotMatch(door.line, /unknown-|set-on-ruleset-value/)
	const ledger = runScript(cat.DUNGEON_CRAWLER_LEDGER_SCRIPT, { session: s, books: b, turn, door, applied: { facts: { rigour: 'scripts' }, blocks: {}, outcomes: [] }, after: st, state: st, row: 99 })
	assert.match(ledger.narrator.outcomes, /These did NOT happen — never tell them as done[^]*Mira doesn't carry a longsword/)
})

test('P1-3: the Planner talk knows the player — their reference, their sheet, how the table plays', () => {
	const s = session(made({ 'user:1': { name: 'Mira', class: 'Wizard', made: true } }))
	const st = state({ 'player_seat:4': bag({ hp: 6, 'crawl-conditions': [{ kind: 'compendium', pieceId: 'poisoned' }], 'crawl-spell-slots': [{ kind: 'inline', name: 'Level 1', level: 1, max: 2, used: 1 }] }) })
	const crib = runScript(cat.DUNGEON_CRAWLER_CRIB_SCRIPT, { session: s, lane: 'parley', places: PLACES, people: [], state: st, ruleset: { id: 'core:ruleset/vis-itineris@1', rigour: 'scripts' } })
	assert.match(crib.text, /Their character's sheet: Mira \(player-seat:4, Wizard, level 1, health 6\/20, armour class 10, at The Sunken Gate\); conditions: Poisoned; spell slots level 1: 1 of 2 left\./)
	// 🚧 …and the rules' options it plays (PLAN-dc-after-walk2 Q2-4).
	assert.match(crib.text, /This table: plays Vis Itineris; the table rolls the dice in the open and keeps the numbers; difficulty fair; at zero health: one roll at death's door decides; spells: spell slots, one a spell, back after a long rest\./)
	assert.match(crib.canChange, /Their own character's reference — a change's owner — is player-seat:4 \(Mira\)\./)
	// An edit the model left ownerless is the asking player's own character.
	const edits = runScript(cat.DUNGEON_CRAWLER_EDITS_SCRIPT, { session: s, lane: 'parley', state: st, places: PLACES, json: { standingOrder: '', asks: [], deltas: [delta({ owner: '', op: 'add', repertoire: 'consumables', piece: 'potion-of-healing', reason: 'bought' })], rooms: [] } })
	assert.equal(edits.deltas[0].owner, 'player-seat:4')
})

test('P1-4: a traverse names the way by the place that holds it; a success opens a locked way', () => {
	const s = session(made())
	const door = { kind: 'inline', name: 'Door to The Vault', way: 'door', state: 'locked', lockDc: 15, towards: 'location:51' }
	const st = state(undefined, { 50: { 'crawl-exits': [door] } })
	const t = turnOf(s, st, [delta({ owner: 'Mira', op: 'traverse', piece: 'door to the vault', check: 'skill.sleight-of-hand', against: 0, reason: 'picks the lock' })])
	assert.equal(t.deltas[0].owner, 'location:50')
	assert.equal(t.deltas[0].piece, 'Door to The Vault')
	assert.equal(t.deltas[0].against, 15)
	assert.ok(t.owners.includes('location:50'))
	const b = booksOf(s, st)
	const outcomes = [{ owner: 'location:50', kind: 'check', text: 'The Sunken Gate — traverse Door to The Vault (Sleight of hand): Success', check: { selector: 'skill.sleight-of-hand', five: 'success' } }]
	const doorStep = runScript(cat.DUNGEON_CRAWLER_DOOR_SCRIPT, { session: s, books: b, turn: t, applied: { facts: { rigour: 'scripts' }, outcomes, explain: [], rejected: [] }, after: st, state: st })
	const ledger = runScript(cat.DUNGEON_CRAWLER_LEDGER_SCRIPT, { session: s, books: b, turn: t, door: doorStep, applied: { facts: { rigour: 'scripts' }, blocks: {}, outcomes }, after: st, state: st, row: 99 })
	assert.deepEqual(ledger.replay.map((d: any) => [d.op, d.owner, typeof d.piece === 'string' ? d.piece : d.piece.state]), [
		['remove', 'location:50', 'Door to The Vault'],
		['add', 'location:50', 'open'],
	])
	assert.equal(ledger.replay[1].piece.lockDc, undefined)
	// A failure leaves it locked.
	const failed = [{ ...outcomes[0], check: { selector: 'skill.sleight-of-hand', five: 'fail' } }]
	assert.equal(runScript(cat.DUNGEON_CRAWLER_LEDGER_SCRIPT, { session: s, books: b, turn: t, door: doorStep, applied: { facts: { rigour: 'scripts' }, blocks: {}, outcomes: failed }, after: st, state: st, row: 99 }).replay, null)
	// The Planner is told how.
	assert.match(row(cat.DUNGEON_CRAWLER_PROMPT_KEYS.turn).systemPrompt, /op traverse: owner the place that holds the way \[location:<id>\], piece the way's name exactly as that place lists it/)
})

test('P1-8: a spell at no slot left is refused in words, and the sheet block says the slots left', () => {
	const s = session(made())
	const st = state({ 'player_seat:4': bag({ 'crawl-spell-slots': [{ kind: 'inline', name: 'Level 1', level: 1, max: 2, used: 2 }] }) })
	const t = turnOf(s, st, [delta({ owner: 'player-seat:4', op: 'spend', repertoire: 'spell-slots', piece: '1', reason: 'Magic missile' })])
	assert.equal(t.deltas, null)
	assert.match(t.refused[0].words, /^Not changed: Mira has no first-level slot left: the spell fails \(Magic missile\)\.$/)
	const fields = runScript(cat.DUNGEON_CRAWLER_RULESET_FIELDS_SCRIPT, { blocks: [{ key: 'sheet', text: 'Mira — Level: 1' }], facts: { rigour: 'scripts' }, books: booksOf(s, st), state: st })
	assert.match(fields.rulesetSheet, /^Mira — Level: 1\nMira — spell slots level 1: 0 of 2 left\. A spell of a level with none left cannot be cast\.$/)
})

test('P3-1 / P3-6: a new character after a death is a NEW seat; a persona names the seat and skips the name question', () => {
	const st = state({ 'player_seat:4': bag({ fate: 'dead', hp: 0 }) })
	const named = runScript(cat.DUNGEON_CRAWLER_INTERVIEW_SCRIPT, {
		session: session(made()), referent: cat.DUNGEON_CRAWLER_QUESTIONS.name, addressee: 'user:1', values: { name: 'Tobin' }, state: st,
	})
	assert.equal(named.retireSeat, 'player-seat:4')
	assert.equal(named.seatName, 'Tobin')
	// A fresh hero: nothing of the fallen's carries over, and not made until its sheet.
	assert.deepEqual(named.world.heroes['user:1'], { name: 'Tobin' })
	// A living seat's name answer retires nothing.
	assert.equal(runScript(cat.DUNGEON_CRAWLER_INTERVIEW_SCRIPT, { session: session(made()), referent: cat.DUNGEON_CRAWLER_QUESTIONS.name, addressee: 'user:1', values: { name: 'Mira' }, state: state() }).retireSeat, null)
	// A persona's seat: the world settled, the name is the persona's — the class is offered at once.
	const wren = { seatId: 4, seatUserId: 1, seatName: null, persona: { id: 9, name: 'Wren Ashdown', userId: 1 }, removedAt: null }
	const settled = runScript(cat.DUNGEON_CRAWLER_INTERVIEW_SCRIPT, {
		session: session({}, [wren]), referent: cat.DUNGEON_CRAWLER_QUESTIONS.goalMode, addressee: 'user:1', choice: 'secret', label: 'Keep it secret', values: {}, state: {},
	})
	assert.equal(settled.next, null)
	assert.equal(settled.seatName, 'Wren Ashdown')
	assert.match(settled.classBrief, /The character is called Wren Ashdown/)
	assert.equal(settled.note, 'Name: Wren Ashdown, from your persona.')
	assert.equal(settled.echo, 'Keep it secret.')
})

test('P3-3: the goal reached is shown and told to every lane; End has the Narrator close it now', () => {
	const s = session({ [K.progress]: { shape: 'dungeon', built: true, goal: 'Find the drowned king.', heroes: { 'user:1': { name: 'Mira', made: true } } }, [K.journal]: { goal: cat.DUNGEON_CRAWLER_SECRET_GOAL_LINE, leads: [] } }, [MIRA, BO])
	const st = state()
	const b = booksOf(s, st)
	const plan = runScript(cat.DUNGEON_CRAWLER_PLAN_SCRIPT, {
		json: { deltas: [], world: { rooms: [], npcs: [], leads: [], goalProgress: 'reached', notes: '' }, clock: { minutes: 5 }, narratorBrief: 'Won.', roundSummary: '', secrets: [] },
	})
	const turn = runScript(cat.DUNGEON_CRAWLER_TURN_SCRIPT, { session: s, books: b, first: plan, state: st })
	const door = runScript(cat.DUNGEON_CRAWLER_DOOR_SCRIPT, { session: s, books: b, turn, applied: { facts: {}, outcomes: [], explain: [], rejected: [] }, after: st, state: st })
	const ledger = runScript(cat.DUNGEON_CRAWLER_LEDGER_SCRIPT, { session: s, books: b, turn, door, applied: { facts: {}, blocks: {}, outcomes: [] }, after: st, state: st, row: 99 })
	assert.equal(ledger.journal.goal, 'Find the drowned king.')
	const guestLine = ledger.laneLines.find((l: any) => l.lane === 'parley:2')
	assert.match(guestLine.text, /^The goal is reached: Find the drowned king\./)
	assert.ok(ledger.laneLines.some((l: any) => l.lane === 'parley' && l.blocks?.[0]?.referent === 'goal'))
	const ended = runScript(cat.DUNGEON_CRAWLER_GOAL_SCRIPT, { session: s, choice: cat.DUNGEON_CRAWLER_GOAL_CHOICES.end, addressee: 'user:1', state: st })
	assert.match(ended.epilogue, /^The adventure is over, its goal reached: Find the drowned king\. Give the party a short epilogue/)
	const doc = specById(cat.DUNGEON_CRAWLER_GOAL_SPEC_ID)
	assert.equal(named(doc, 'template')['route.closing.prompt'].source, cat.DUNGEON_CRAWLER_NARRATE_TEMPLATE)
	assert.deepEqual(named(doc, 'prompts')['route.closing.context'], { seedKey: cat.DUNGEON_CRAWLER_PROMPT_KEYS.narrate })
})

test('P3-4 / P3-7: genesis hears the difficulty, the backstories and the companions; Just play with no class gets one, and its kit', () => {
	const plan = { addressee: 'user:1', justPlay: true, isOwner: true, currentName: null }
	const out = runScript(cat.DUNGEON_CRAWLER_SHEET_SCRIPT, {
		session: session({}, []), plan, json: { name: 'Juniper', class: '', backstory: 'A sellsword owed a debt.', shape: 'dungeon', difficulty: 'brutal', goalMode: 'shared' }, state: { world: {} },
	})
	const cls = out.seatChanges.find((c: any) => c.slot === 'core:slot/character-class@1')
	assert.ok(cls && cls.value, 'a class is chosen')
	assert.ok(out.kit.deltas.length > 0)
	assert.match(out.genesisBrief, /\nDifficulty: brutal\./)
	assert.match(out.genesisBrief, /Their backstories, to hook the world on:\n- Juniper: A sellsword owed a debt\./)
	assert.match(out.genesisBrief, /Travelling with them, voiced by the Narrator: Brother Tamsin\./)
	const filed = runScript(cat.DUNGEON_CRAWLER_GENESIS_SCRIPT, {
		session: session({}, []), sheet: out, json: { goal: 'G.', rooms: [{ id: 'a', name: 'The Gate', description: 'Stone.', exits: [] }], npcs: [], leads: [], notes: '' }, state: {},
	})
	assert.match(filed.openingBrief, /Travelling with them: Brother Tamsin — name them in the scene\./)
})

test('P3-8: no difficulty and no trap shows on the table line before a check is made on it', () => {
	const s = session(made())
	const st = state()
	const b = booksOf(s, st)
	const vault = { kind: 'inline', name: 'Door to The Vault', way: 'door', state: 'locked', lockDc: 15, trap: { name: 'poison needle', dc: 12 } }
	const turn = { plan: { deltas: [{ owner: 'location:50', op: 'add', repertoire: 'exits', piece: vault }] } }
	const outcomes = [{ owner: 'location:50', kind: 'effect', text: 'The Sunken Gate: Door to The Vault, locked (DC 15), trapped — poison needle (DC 12)' }]
	const door = runScript(cat.DUNGEON_CRAWLER_DOOR_SCRIPT, { session: s, books: b, turn, applied: { facts: { rigour: 'scripts' }, outcomes, explain: [], rejected: [] }, after: st, state: st })
	assert.equal(door.line, '⚄ The Sunken Gate: Door to The Vault, locked')
})

test('P3-9: companions are narrative only — the Planner is told so, by name, with no reference to target', () => {
	const b = booksOf(session(made()), state())
	assert.match(b.brief, /Companions travelling with the party, voiced by the Narrator — narrative only: no sheet keeps their health or their things, so propose no delta for them[^]*\n- Brother Tamsin/)
	assert.doesNotMatch(b.brief, /character:30/)
})

test('P3-5: every answer the player presses is their line on their lane — the interview says it back', () => {
	const ans = (referent: string, extra: Record<string, unknown>) =>
		runScript(cat.DUNGEON_CRAWLER_INTERVIEW_SCRIPT, { session: session({}, []), referent, addressee: 'user:1', values: {}, state: {}, ...extra })
	assert.equal(ans(cat.DUNGEON_CRAWLER_QUESTIONS.worldShape, { choice: 'dungeon', label: 'A dungeon' }).echo, 'A dungeon.')
	assert.equal(ans(cat.DUNGEON_CRAWLER_QUESTIONS.difficulty, { choice: 'fair', label: 'Fair' }).echo, 'Fair.')
	assert.equal(ans(cat.DUNGEON_CRAWLER_QUESTIONS.name, { values: { name: 'Ann' } }).echo, 'Name: Ann.')
	// The interview writes it as a table line of kind `answer`, said for the person who pressed.
	const doc = specById(cat.DUNGEON_CRAWLER_INTERVIEW_SPEC_ID)
	const echo = doc.nodes.find((n: any) => n.key === 'said.echo.write')
	assert.equal(echo.config.kind, 'answer')
	assert.equal(echo.config.tableLine, true)
	assert.deepEqual(echo.config.speaker, { __ref: 'data', node: 'answer', port: 'addressee' })
})

test("P0-4: the guest's greeting says where the world stands now; the sheet's changes are filed at the summary on the person's own lane", () => {
	const doc = specById(cat.DUNGEON_CRAWLER_INTERVIEW_SPEC_ID)
	const node = (k: string) => doc.nodes.find((n: any) => n.key === k)
	const at = (k: string) => node(k).position
	// The summary first, then the seat and its stats — filed at the summary's row.
	assert.ok(at('route.sheet.told.said.write') < at('route.sheet.after.seat.setSeat'))
	assert.match(JSON.stringify(node('route.sheet.after.seat.stats.changed.changesApplied').config.worldRow), /route\.sheet\.told\.said\.write/)
	// An answer's own changes are filed at its echo, on the person's lane.
	assert.ok(at('said.echo.write') < at('route.seat.setSeat'))
	assert.match(JSON.stringify(node('route.rules.changesApplied').config.worldRow), /said\.echo\.write/)
	// The kit is handed out on the seat this run named.
	assert.match(JSON.stringify(node('route.sheet.after.seat.kit.given.owned').config.input), /route\.sheet\.after\.seat\.setSeat/)
	// A new character's seat replaces the fallen's (P3-1).
	assert.match(JSON.stringify(node('route.seat.setSeat').config.retire), /route\.seat\.retire/)
})

/* ── Lane B (P2, owner rulings ★4, ★7, ★10) ── */

const VI = { id: 'core:ruleset/vis-itineris@1', rigour: 'scripts', settings: { casting: 'slots', dying: 'dying-1-4' } }
const STORY_RS = { id: 'core:ruleset/freeform@1', rigour: 'prose', settings: {} }
const booksIn = (s: any, st: any, ruleset: unknown) =>
	runScript(cat.DUNGEON_CRAWLER_BOOKS_SCRIPT, { session: s, state: st, story: [{ role: 'user', content: 'I act.', speaker: 'player-seat:4' }], places: PLACES, people: [], fallen: [], log: [], ruleset })
const fieldsIn = (b: any, rigour = 'scripts') =>
	runScript(cat.DUNGEON_CRAWLER_RULESET_FIELDS_SCRIPT, { blocks: [], facts: { rigour }, books: b, state: state() })

test('P2-1: a hit or a use keeps who it is aimed at — a seat or a place by reference, a companion or a foe by name', () => {
	const s = session(made())
	const st = state()
	const t = runScript(cat.DUNGEON_CRAWLER_TURN_SCRIPT, {
		session: s,
		books: booksIn(s, st, VI),
		first: planOf([
			{ ...delta({ owner: 'Mira', op: 'hit', piece: 'dagger', check: 'attack.melee', against: 12 }), aimedAt: 'Brother Tamsin' },
			{ ...delta({ owner: 'Mira', op: 'hit', piece: 'dagger', check: 'attack.melee', against: 12 }), aimedAt: 'the goblin' },
			{ ...delta({ owner: 'Mira', op: 'use', piece: 'potion-of-healing' }), aimedAt: 'Mira' },
		]),
		state: st,
	})
	assert.deepEqual(t.deltas.map((d: any) => d.aimedAt), ['Brother Tamsin', 'the goblin', 'player-seat:4'])
	// The Planner is told the table executes what a piece does.
	assert.match(fieldsIn(booksIn(s, st, VI)).effectsLine, /^Weapons, draughts and spells do what they say when used, so never add a health change for them yourself/)
})

test('P2-3: the sheet line says the armour class — Vis Itineris\'s one rule over the armour held', () => {
	const s = session(made({ 'user:1': { name: 'Mira', class: 'Fighter', made: true } }))
	const armour = [
		{ kind: 'compendium', compendiumId: 'core:ruleset/vis-itineris@1', pieceId: 'chain-mail', version: '1.1.0' },
		{ kind: 'compendium', compendiumId: 'core:ruleset/vis-itineris@1', pieceId: 'shield', version: '1.1.0' },
	]
	const st = state({ 'player_seat:4': bag({ 'crawl-armour': armour, 'itineris-dexterity': 13 }) })
	const crib = runScript(cat.DUNGEON_CRAWLER_CRIB_SCRIPT, { session: s, lane: 'parley', places: PLACES, people: [], state: st, ruleset: VI })
	// Chain mail 16 (no Dexterity), a shield +2.
	assert.match(crib.text, /health 12\/20, armour class 18, at The Sunken Gate/)
	// Words only: no armour class.
	const words = runScript(cat.DUNGEON_CRAWLER_CRIB_SCRIPT, { session: s, lane: 'parley', places: PLACES, people: [], state: st, ruleset: { ...VI, rigour: 'prose' } })
	assert.doesNotMatch(words.text, /armour class/)
})

test('P2-4: Casting — spell points: the kit fills a pool, no slots; the books spend the spell; a slot spend is refused in words', () => {
	const plan = { addressee: 'user:1', justPlay: false, isOwner: true, currentName: 'Mira' }
	const s = session(made({ 'user:1': { name: 'Mira', class: 'Wizard' } }))
	const sheetUnder = (ruleset: unknown) => runScript(cat.DUNGEON_CRAWLER_SHEET_SCRIPT, { session: s, plan, json: { name: 'Mira', class: 'Wizard', backstory: 'Bookish.' }, state: state(), ruleset })
	const points = sheetUnder({ ...VI, settings: { casting: 'points' } })
	assert.ok(!points.kit.deltas.some((d: any) => d.repertoire === 'spell-slots'))
	assert.deepEqual(points.seatChanges.find((c: any) => c.slot === 'core:slot/itineris-spell-points@1'), { slot: 'core:slot/itineris-spell-points@1', value: 4 })
	const slots = sheetUnder(VI)
	assert.ok(slots.kit.deltas.some((d: any) => d.repertoire === 'spell-slots'))
	assert.equal(slots.seatChanges.find((c: any) => c.slot === 'core:slot/itineris-spell-points@1'), undefined)
	// The books' prompt lines follow the choice.
	const st = state()
	const pb = booksIn(s, st, { ...VI, settings: { casting: 'points' } })
	assert.equal(pb.casting, 'points')
	const f = fieldsIn(pb)
	assert.match(f.castingLine, /spend the spell \(repertoire spells, op spend, piece the spell's name\): it costs its level in spell points/)
	assert.doesNotMatch(f.piecesLine, /spell-slots|spell slot/)
	const t = runScript(cat.DUNGEON_CRAWLER_TURN_SCRIPT, {
		session: s, books: pb, first: planOf([delta({ owner: 'player-seat:4', op: 'spend', repertoire: 'spell-slots', piece: '1', reason: 'Bless' })]), state: st,
	})
	assert.equal(t.deltas, null)
	assert.match(t.refused[0].words, /^Not changed: this table plays spell points, not slots — Mira spends the spell itself/)
	// Too few points, in words.
	assert.equal(
		runScript(cat.DUNGEON_CRAWLER_EDITS_SCRIPT, {
			session: s, lane: 'parley', places: PLACES,
			applied: { outcomes: [], rejected: [{ delta: { owner: 'player-seat:4', op: 'spend', repertoire: 'spells', piece: 'fireball' }, reason: 'not-enough', why: 'x' }] },
		}).line,
		"Not changed: Mira hasn't the spell points left to cast fireball.",
	)
})

test('P2-4: At zero health — Death saves: a bare d20 a round, tallied in the books, until stable, dead or back up', () => {
	const s = session(made())
	const fallen = state({ 'player_seat:4': bag({ hp: 0 }) })
	const b = { ...booksIn(s, state(), { ...VI, settings: { dying: 'death-saves' } }), fresh: true }
	assert.equal(b.deathSaves, true)
	const turn = { plan: planOf([]).plan }
	const doorWith = (face: number, tally?: { passed: number; failed: number }) => {
		const s2 = tally ? session({ [K.progress]: { shape: 'dungeon', built: true, heroes: { 'user:1': { name: 'Mira', made: true } }, deathSaves: { 'player-seat:4': tally } } }) : s
		const real = Math.random
		Math.random = () => (face - 1) / 20 + 0.001
		try {
			return runScript(cat.DUNGEON_CRAWLER_DOOR_SCRIPT, { session: s2, books: b, turn, applied: { facts: { rigour: 'scripts' }, outcomes: [], explain: [], rejected: [] }, after: fallen, state: fallen })
		} finally {
			Math.random = real
		}
	}
	const pass = doorWith(14)
	assert.deepEqual(pass.deaths[0], { seat: 'player-seat:4', name: 'Mira', user: 1, roll: 14, dc: 10, saves: true, passed: 1, failed: 0, outcome: 'dying' })
	assert.equal(pass.line, "☠ Mira at death's door: death save d20 14 vs 10 — still dying (1 pass, 0 failures)")
	assert.equal(doorWith(20).deaths[0].outcome, 'survives')
	assert.equal(doorWith(1, { passed: 0, failed: 1 }).deaths[0].outcome, 'dead')
	assert.equal(doorWith(12, { passed: 2, failed: 2 }).deaths[0].outcome, 'stable')
	// The ledger keeps the tally while they lie dying, and tells the Narrator a heal would save them.
	const ledger = runScript(cat.DUNGEON_CRAWLER_LEDGER_SCRIPT, { session: s, books: b, turn, door: pass, applied: { facts: { rigour: 'scripts' }, blocks: {}, outcomes: [] }, after: fallen, state: fallen, row: 9 })
	assert.deepEqual(ledger.progress.deathSaves, { 'player-seat:4': { passed: 1, failed: 0 } })
	assert.match(ledger.narrator.outcomes, /Mira lies dying at death's door, 1 pass, 0 failures so far/)
	// 🚧 The sheet says it (PLAN-dc-after-walk2 Q3-8, N15): Fate is Dying, the tally in words beside it.
	const changeAt = (out: any, slot: string) => (out.changes ?? []).find((c: any) => c.slot === slot)
	assert.deepEqual(changeAt(ledger, 'core:slot/fate@1'), { owner: 'player-seat:4', slot: 'core:slot/fate@1', value: 'dying' })
	assert.deepEqual(changeAt(ledger, 'core:slot/crawl-death-saves@1'), {
		owner: 'player-seat:4',
		slot: 'core:slot/crawl-death-saves@1',
		value: '1 pass, 0 failures',
	})
	// Healed while dying: up again — alive, the tally emptied, the books' reckoning dropped.
	const healed = state({ 'player_seat:4': bag({ hp: 3, fate: 'dying', 'crawl-death-saves': '1 pass, 0 failures' }) })
	const s3 = session({ [K.progress]: { shape: 'dungeon', built: true, heroes: { 'user:1': { name: 'Mira', made: true } }, deathSaves: { 'player-seat:4': { passed: 1, failed: 0 } } } })
	const back = runScript(cat.DUNGEON_CRAWLER_LEDGER_SCRIPT, { session: s3, books: b, turn, door: { deaths: [], line: '' }, applied: { facts: { rigour: 'scripts' }, blocks: {}, outcomes: [] }, after: healed, state: healed, row: 9 })
	assert.deepEqual(changeAt(back, 'core:slot/fate@1'), { owner: 'player-seat:4', slot: 'core:slot/fate@1', value: 'alive' })
	assert.deepEqual(changeAt(back, 'core:slot/crawl-death-saves@1'), { owner: 'player-seat:4', slot: 'core:slot/crawl-death-saves@1', value: '' })
	assert.equal(back.progress?.deathSaves, undefined)
	// Stable is taken out; the tally goes.
	const stable = doorWith(12, { passed: 2, failed: 2 })
	const kept = runScript(cat.DUNGEON_CRAWLER_LEDGER_SCRIPT, { session: s, books: b, turn, door: stable, applied: { facts: { rigour: 'scripts' }, blocks: {}, outcomes: [] }, after: fallen, state: fallen, row: 9 })
	assert.deepEqual((kept.changes ?? []).find((c: any) => c.slot === 'core:slot/fate@1'), { owner: 'player-seat:4', slot: 'core:slot/fate@1', value: 'taken-out' })
	assert.equal(kept.progress.deathSaves, undefined)
	// Fair and Brutal otherwise keep their one roll.
	const oneRoll = runScript(cat.DUNGEON_CRAWLER_DOOR_SCRIPT, { session: s, books: { ...booksIn(s, state(), VI), fresh: true }, turn, applied: { facts: { rigour: 'scripts' }, outcomes: [], explain: [], rejected: [] }, after: fallen, state: fallen })
	assert.equal(oneRoll.deaths[0].saves, undefined)
	assert.match(oneRoll.line, /^☠ Mira at death's door: d20 \d+ vs DC 10 — (survives|dead)$/)
})

test('P2-6: under the Story ruleset the books name no Vis Itineris word, the kit keeps no slots, a use is spent in words', () => {
	const s = session(made())
	const st = state()
	const b = booksIn(s, st, STORY_RS)
	assert.equal(b.kit, false)
	const f = fieldsIn(b, 'prose')
	const said = [f.piecesLine, f.conditionsLine, f.castingLine, f.effectsLine].join(' ')
	assert.doesNotMatch(said, /spell-slots|spell slot|Prone|Restrained|Envenomed|attack\.|Vis Itineris/)
	assert.equal(f.castingLine, '')
	assert.equal(f.effectsLine, '')
	assert.match(f.conditionsLine, /add it as a condition in a word or two/)
	const plan = { addressee: 'user:1', justPlay: false, isOwner: true, currentName: 'Mira' }
	const sheet = runScript(cat.DUNGEON_CRAWLER_SHEET_SCRIPT, { session: session(made({ 'user:1': { name: 'Mira', class: 'Wizard' } })), plan, json: { name: 'Mira', class: 'Wizard', backstory: 'B.' }, state: st, ruleset: STORY_RS })
	assert.ok(!sheet.kit.deltas.some((d: any) => d.repertoire === 'spell-slots'))
	assert.ok(sheet.kit.deltas.some((d: any) => d.repertoire === 'spells'), 'the spells are still kept, in words, by the handler')
})

test('P4-7: a slot spent reads "Level 1 slots 2 → 1"; the fold opens on death\'s door; a way listed again as it stands changes nothing', () => {
	const s = session(made())
	// A slot spent: the turn rewrites the level's piece; the table says what happened.
	const st = state({ 'player_seat:4': bag({ 'crawl-spell-slots': [{ kind: 'inline', name: 'Level 1', level: 1, max: 2, used: 0 }] }) })
	const t = turnOf(s, st, [delta({ owner: 'player-seat:4', op: 'spend', repertoire: 'spell-slots', piece: '1', reason: 'Magic missile' })])
	assert.deepEqual(t.deltas.map((d: any) => [d.op, d.repertoire]), [['remove', 'spell-slots'], ['add', 'spell-slots']])
	const outcomes = [
		{ owner: 'player-seat:4', kind: 'effect', text: 'Mira no longer has Level 1' },
		{ owner: 'player-seat:4', kind: 'effect', text: 'Mira gains Level 1' },
	]
	const spent = runScript(cat.DUNGEON_CRAWLER_DOOR_SCRIPT, {
		session: s, books: booksOf(s, st), turn: { plan: t.plan }, applied: { facts: { rigour: 'scripts' }, outcomes, explain: [], rejected: [] }, after: st, state: st,
	})
	assert.equal(spent.line, '⚄ Mira: Level 1 slots 2 → 1')

	// A way out the book already holds, listed again exactly as it stands: no delta, no "gained" line.
	const room = { id: 'r1', name: 'The Sunken Gate', description: 'Wet stone.', exits: [{ to: 'The Vault', way: 'door', state: 'locked', lockDc: 15, trap: '', trapDc: 0, minutes: 0 }] }
	const plan = runScript(cat.DUNGEON_CRAWLER_PLAN_SCRIPT, {
		json: { deltas: [], world: { rooms: [room], npcs: [], leads: [], goalProgress: 'none', notes: '' }, clock: { minutes: 5 }, narratorBrief: 'On.', roundSummary: '', secrets: [] },
	})
	const fresh = runScript(cat.DUNGEON_CRAWLER_TURN_SCRIPT, { session: s, books: booksOf(s, state()), first: plan, state: state() })
	const added = (fresh.deltas ?? []).filter((d: any) => d.repertoire === 'exits')
	assert.equal(added.length, 1, 'a new way is written')
	const held = state({ 'player_seat:4': bag() }, { 50: { name: 'The Sunken Gate', 'crawl-exits': [added[0].piece] } })
	const again = runScript(cat.DUNGEON_CRAWLER_TURN_SCRIPT, { session: s, books: booksOf(s, held), first: plan, state: held })
	assert.deepEqual((again.deltas ?? []).filter((d: any) => d.repertoire === 'exits'), [], 'the same way again changes nothing')
	// A way that changed (now open) is still rewritten.
	const opened = runScript(cat.DUNGEON_CRAWLER_PLAN_SCRIPT, {
		json: { deltas: [], world: { rooms: [{ ...room, exits: [{ ...room.exits[0], state: 'open', lockDc: 0 }] }], npcs: [], leads: [], goalProgress: 'none', notes: '' }, clock: { minutes: 5 }, narratorBrief: 'On.', roundSummary: '', secrets: [] },
	})
	const changed = runScript(cat.DUNGEON_CRAWLER_TURN_SCRIPT, { session: s, books: booksOf(s, held), first: opened, state: held })
	assert.deepEqual((changed.deltas ?? []).filter((d: any) => d.repertoire === 'exits').map((d: any) => d.op), ['remove', 'add'])
})
