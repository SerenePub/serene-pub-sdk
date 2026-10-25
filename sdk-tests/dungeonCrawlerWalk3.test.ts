/**
 * 🚧 Dungeon Crawler after walk #3 (PLAN-dc-after-walk3-2026-10-19) — what
 * the walk found half-built, pinned at the genre's own level: the scripts run
 * as plain functions, the prompt rows, the layout and the widget readers (the
 * app runs the scripts in QuickJS; the end-to-end paths are
 * `sessions.dungeonCrawlerWalk3.int.test.ts`).
 *
 *  - R2-2: genesis holds the world's ways out as `exits` pieces from the
 *    start, so the crib names each exactly before any re-listing;
 *  - R2-1 (★2): a trap carries its own effect — the dice it deals and the
 *    condition it leaves — on the way's piece; a table of words asks for neither;
 *  - ★4: a kit's trained skills, written at creation and tracked by the sheet;
 *  - R2-3: the books prompt's words variant (`wordsOnly`);
 *  - R2-4 (★1): _At zero health_ offers what the crawl plays;
 *  - R1-6 / R3-3 / R3-5: the layout's Dice clock, journal kinds and Scene
 *    Portraits bars; `barsFor: seats` draws none for a companion.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getRuleset } from '@serene-pub/sdk'
import * as cat from '../core-catalog/src/index.js'
import { readScenePortraitsSettings, statBarsOf } from '../core-catalog/src/shared/ui/scene-portraits/portraits.js'

const runScript = (seedRow: { source: string }, value: unknown) =>
	// eslint-disable-next-line no-new-func
	new Function('value', seedRow.source)(JSON.parse(JSON.stringify(value)))
const row = (key: string) => cat.CORE_PROMPTS.find((p) => p.seedKey === key)!.fields as Record<string, string>

const K = cat.DUNGEON_CRAWLER_ANNEX_KEYS
const MIRA = { seatId: 4, seatUserId: 1, seatName: 'Mira', persona: null, removedAt: null }
const session = () => ({
	sessionId: 7,
	ownerUserId: 1,
	guests: [],
	cast: { sessionPersonas: [MIRA], characters: [] },
	channelLanes: { [cat.PARLEY_CHANNEL]: { 'user:1': 'parley' } },
	annex: { core: { [K.progress]: { shape: 'dungeon', built: true, heroes: { 'user:1': { name: 'Mira', made: true } } } } },
})
/** A way out as the Planner writes it: every member, empty for none. */
const exit = (over: Record<string, unknown>) => ({ to: '', way: 'door', state: 'open', lockDc: 0, trap: '', trapDc: 0, trapDamage: '', trapCondition: '', minutes: 0, ...over })
const ROOMS = [
	{
		id: 'gate',
		name: 'The Sunken Gate',
		description: 'Wet stone.',
		exits: [
			exit({ to: 'The Hall', way: 'gate' }),
			exit({ to: 'The Vault', state: 'locked', lockDc: 15, trap: 'poison needle', trapDc: 12, trapDamage: '1d4 poison', trapCondition: 'Poisoned' }),
		],
	},
	{ id: 'hall', name: 'The Hall', description: 'Pillars.', exits: [exit({ to: 'The Sunken Gate' })] },
]
/** The places as written, as `core:query/lorebook-entries@1` lists them. */
const PLACES = { entries: [{ id: 50, name: 'The Sunken Gate', content: 'Wet stone.', links: [] }, { id: 51, name: 'The Hall', content: 'Pillars.', links: [] }] }

test("R2-2: genesis, handed the places as written, holds the world's ways out as exits pieces on the places they leave", () => {
	const out = runScript(cat.DUNGEON_CRAWLER_GENESIS_SCRIPT, { session: session(), json: { rooms: ROOMS }, places: PLACES, state: {} })
	assert.deepEqual(Object.keys(out), ['ways'])
	assert.deepEqual(out.ways.owners, ['location:50', 'location:51'])
	const pieces = out.ways.deltas.map((d: any) => [d.owner, d.op, d.repertoire, d.piece.name])
	assert.deepEqual(pieces, [
		['location:50', 'add', 'exits', 'Gate to The Hall'],
		['location:50', 'add', 'exits', 'Door to The Vault'],
		['location:51', 'add', 'exits', 'Door to The Sunken Gate'],
	])
	// R2-1 (★2): the trap carries its own effect, the condition by its name.
	const vault = out.ways.deltas[1].piece
	assert.deepEqual(vault.trap, { name: 'poison needle', dc: 12, damage: '1d4 poison', condition: 'poisoned' })
	assert.equal(vault.description, 'Door to The Vault, locked', 'no trap in words a player reads')
	// Its first call (no places) still files the world, never the ways.
	const filed = runScript(cat.DUNGEON_CRAWLER_GENESIS_SCRIPT, { session: session(), sheet: {}, json: { goal: 'G.', rooms: ROOMS, npcs: [], leads: [], notes: '' }, state: {} })
	assert.equal(filed.ways, undefined)
	assert.ok(filed.places?.length)
})

test('R2-2: with the pieces held, the crib names each way out exactly before any re-listing, and a re-listing as it stands is no change', () => {
	const held = runScript(cat.DUNGEON_CRAWLER_GENESIS_SCRIPT, { session: session(), json: { rooms: ROOMS }, places: PLACES, state: {} }).ways.deltas
	const byPlace: Record<string, unknown[]> = {}
	for (const d of held) (byPlace[String(d.owner).slice('location:'.length)] ??= []).push(d.piece)
	const state = {
		world: { difficulty: 'fair', 'crawl-time': '1-01-01 08:00' },
		cast: { byId: { 'player_seat:4': { hp: 12, level: 1, 'character-class': 'Rogue', location: 'The Sunken Gate' } } },
		locations: { byId: Object.fromEntries(Object.entries(byPlace).map(([id, list]) => [id, { 'crawl-exits': list }])) },
		configs: {},
	}
	const books = runScript(cat.DUNGEON_CRAWLER_BOOKS_SCRIPT, { session: session(), state, story: [{ role: 'user', content: 'I look.', speaker: 'player-seat:4' }], places: PLACES, people: [], fallen: [], log: [] })
	assert.match(books.crib, /- The Sunken Gate \[location:50\]: Wet stone\. Ways out: Gate to The Hall \(open\); Door to The Vault \(locked; trapped: poison needle\)\./)
	assert.match(books.crib, /- The Hall \[location:51\]: Pillars\. Ways out: Door to The Sunken Gate \(open\)\./)
	// The Planner's first re-listing of the gate, as it stands: nothing to add.
	const again = runScript(cat.DUNGEON_CRAWLER_GENESIS_SCRIPT, { session: session(), json: { rooms: ROOMS }, places: PLACES, state })
	assert.equal(again.ways, null)
})

test('R2-1 (★2): the exit grammar asks for the trap\'s dice and condition; a table of words asks for neither, nor any difficulty', () => {
	// 🚧 Laid at run time over the session's rules (S4): counted under Vis Itineris, words where the rules decide nothing.
	const viIn = { id: 'core:ruleset/vis-itineris@1', ...cat.rulesetGistOf(getRuleset('core:ruleset/vis-itineris@1')! as never) }
	const exitOf = (ruleset: unknown) =>
		runScript(cat.DUNGEON_CRAWLER_SHAPE_SCRIPT, { shape: null, ruleset, want: 'genesis' }).properties.rooms.items.properties.exits.items
	const counted = exitOf(viIn)
	assert.ok(counted.required.includes('trapDamage') && counted.required.includes('trapCondition'))
	const words = exitOf({ ...viIn, decides: false })
	for (const k of ['lockDc', 'trapDc', 'trapDamage', 'trapCondition']) {
		assert.equal(words.properties[k], undefined, k)
		assert.ok(!words.required.includes(k), k)
	}
	assert.ok(words.required.includes('trap'))
	// Vis Itineris's trap piece names the condition it leaves beside its damage.
	const vi = getRuleset('core:ruleset/vis-itineris@1')!
	const exits = (vi.repertoires ?? []).find((r: any) => r.id === 'exits') as any
	assert.ok(exits.piece.fields.trap.fields.condition, 'trap.condition')
	assert.ok(exits.piece.fields.trap.fields.damage, 'trap.damage')
	// The prompts that write ways out ask for both.
	assert.match(row(cat.DUNGEON_CRAWLER_PROMPT_KEYS.genesis).systemPrompt, /trapDamage: the harm the trap deals, like 1d6, or empty, trapCondition:/)
})

test("★4: a kit's trained skills — the rogue's Sleight of hand — are written at creation, on a field the sheet tracks and does not draw", () => {
	// 🚧 The session's ruleset's kits, as the inlet carries them (S4, 2026-10-23).
	const kits = cat.rulesetGistOf(getRuleset('core:ruleset/vis-itineris@1')! as never).kits!
	assert.deepEqual(kits.byId.rogue!.skills, [{ slot: 'core:slot/itineris-skill-training@1', value: ['sleight-of-hand', 'stealth', 'acrobatics', 'perception'] }])
	for (const key of kits.order) assert.ok(kits.byId[key]!.skills[0]?.value.length, key)
	// 🚧 RF fix 8: Vis Itineris's own attribute, never the genre's sheet.
	assert.ok((getRuleset('core:ruleset/vis-itineris@1') as any).attributes.some((a: any) => a.slot === 'core:slot/itineris-skill-training@1'))
	// The sheet script spells them for itself, and pushes them with the scores.
	const sheet = cat.DUNGEON_CRAWLER_SHEET_SCRIPT.source
	assert.match(sheet, /function kitSkillChanges\(key\)/)
	assert.match(sheet, /var trained = kitSkillChanges\(kitKey\);/)
	const stats = cat.DUNGEON_CRAWLER_LAYOUT.widgetSettings!.stats as Record<string, unknown>
	assert.ok((stats.hideSlots as string[]).includes('itineris-skill-training'))
})

test('R2-3: the books prompt at a table of words — no check, no difficulty, no field names of numbers, no "0 health"', () => {
	const turn = row(cat.DUNGEON_CRAWLER_PROMPT_KEYS.turn).systemPrompt
	assert.match(turn, /\{\{#unless wordsOnly\}\}\{\{#if diceRolled\}\}check: the check/)
	assert.match(turn, /\{\{\/unless\}\}reason: a few words \}/)
	// 🚧 A way out keeps its numbers where the rules decide and keep a way out of their own (S4).
	assert.match(turn, /\{\{#if exitsInWords\}\}trap: in a few words, or empty, minutes\{\{else\}\}lockDc, trap, trapDc, trapDamage/)
	assert.match(turn, /\{\{#if wordsOnly\}\}a character the round brings down stands at death's door, which decides\{\{else\}\}/)
	const fields = (decides: boolean) =>
		runScript(cat.DUNGEON_CRAWLER_RULESET_FIELDS_SCRIPT, { blocks: [], facts: { rigour: decides ? 'scripts' : 'prose' }, books: { decides, seats: [] }, state: {} })
	assert.equal(fields(false).wordsOnly, 'yes')
	assert.equal(fields(true).wordsOnly, '')
})

test('R2-4 (★1): At zero health offers only what the crawl plays — one roll at death\'s door (the default), or death saves', () => {
	// Vis Itineris's own settings part (it is registered in the sections since 2026-10-23).
	const dying = (cat.VIS_ITINERIS_SETTINGS as any).dying
	assert.equal(dying.default, 'dying-1-4')
	const labels = dying.choices.map((c: any) => c.label.en)
	assert.deepEqual(labels, ["One roll at death's door", 'Death saves'])
	assert.doesNotMatch(JSON.stringify(cat.VIS_ITINERIS_SETTINGS) + JSON.stringify(cat.VIS_ITINERIS_PRESETS), /Dying 1–4|dying 1–4/)
	// 🚧 …and the fall rule's reference plays the saves by that option (★I).
	assert.deepEqual(cat.VIS_ITINERIS_AT_ZERO_HEALTH_RULE.savesWhen, { option: 'dying', is: 'death-saves' })
})

test('R1-6 / R3-5 / R3-3: the Dice and Planner copies spell the crawl\'s clock; time lines start off; Scene Portraits bars only the heroes', () => {
	const s = cat.DUNGEON_CRAWLER_LAYOUT.widgetSettings as Record<string, Record<string, unknown>>
	assert.equal(s['messages#table'].timeFormat, 'Day {day}, {hh}:{mm}')
	assert.equal(s['messages#parley'].timeFormat, 'Day {day}, {hh}:{mm}')
	assert.ok(!(s['messages#journal'].rowKinds as string[]).includes('time'))
	assert.equal(s['scene-portraits'].barsFor, 'seats')
	assert.equal(readScenePortraitsSettings(s['scene-portraits']).barsFor, 'seats')
	assert.equal(readScenePortraitsSettings({}).barsFor, 'everyone')
	assert.equal(readScenePortraitsSettings({ barsFor: 'nobody' }).barsFor, 'everyone')
	// A companion keeps no sheet: under `seats` it draws no bars; a player seat does.
	const hp = { slotId: 'core:slot/hp@1', qualifiedKey: 'hp', label: 'Health', type: 'number', field: { type: 'number' } }
	const state: any = {
		slots: [hp],
		owners: [
			{ key: 'tamsin', kind: 'session_cast', id: 30, label: 'Brother Tamsin', configs: { 'core:slot/hp@1': { min: 0, max: 10 } } },
			{ key: 'player_seat:4', kind: 'player_seat', id: 4, label: 'Mira', seat: true, configs: { 'core:slot/hp@1': { min: 0, max: 10 } } },
		],
		resolved: { world: {}, cast: { tamsin: { hp: 10 }, 'player_seat:4': { hp: 7 } } },
	}
	assert.equal(statBarsOf(state, 'tamsin').length, 1)
	assert.equal(statBarsOf(state, 'tamsin', 3, 'seats').length, 0)
	assert.equal(statBarsOf(state, 'player_seat:4', 3, 'seats').length, 1)
})
