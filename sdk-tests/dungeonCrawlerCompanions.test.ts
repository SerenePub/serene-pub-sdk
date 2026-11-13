/**
 * 🚧 Dungeon Crawler companions, seen, killed and revived by the story
 * (bench-L3, owner ★4 2026-11-10): `companionsOf` reads the host's
 * `cast.sessionCharacters`; a companion the Planner names in
 * `fallenCompanions` is benched and marked deceased through the genre's own
 * ledger and wiring, one named in `revivedCompanions` is brought back; a swipe's
 * redo files the same fates once. Heroes keep `death.ts`.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as cat from '../core-catalog/src/index.js'

const specById = (id: string) => cat.CORE_SPECS.find((x) => x.slug === id)!.build() as any
const runScript = (row: { source: string }, value: unknown) =>
	// eslint-disable-next-line no-new-func
	new Function('value', row.source)(JSON.parse(JSON.stringify(value ?? null)))
const K = cat.DUNGEON_CRAWLER_ANNEX_KEYS

const crow = (id: number, name: string, extra: Record<string, unknown> = {}) => ({
	character: { id, name },
	ref: `seated-member:${id + 100}`,
	castMemberId: id + 100,
	enabled: true,
	removedAt: null,
	position: 0,
	absorbedAliases: [],
	...extra,
})
const PROGRESS = { shape: 'dungeon', goal: 'Find the drowned king.', built: true, heroes: { 'user:1': { name: 'Mira', made: true } } }
const session = (rows: unknown[], progress: Record<string, unknown> = PROGRESS) => ({
	sessionId: 7,
	ownerUserId: 1,
	guests: [],
	cast: { sessionPersonas: [{ seatId: 4, seatUserId: 1, seatName: 'Mira', persona: null, removedAt: null }], sessionCharacters: rows },
	channelLanes: { [cat.PARLEY_CHANNEL]: { 'user:1': 'parley' } },
	annex: { core: { [K.progress]: progress } },
})
const state = () => ({
	world: { difficulty: 'fair', 'crawl-time': '1-01-01 08:00' },
	cast: { byId: { 'player_seat:4': { hp: 12, level: 1, 'character-class': 'Ranger', location: 'The Sunken Gate' } } },
	configs: { 'player_seat:4': { 'core:slot/hp@1': { min: 0, max: 20 } } },
})
const VI = { id: 'words', rigour: 'prose', settings: {}, chance: false, bands: [] }
const story = [
	{ id: 10, role: 'assistant', content: 'The gate groans.', speaker: 'envoy:narrator' },
	{ id: 11, role: 'user', content: 'I climb the wall.', speaker: 'player-seat:4' },
]
const PLAN = {
	deltas: [],
	world: { rooms: [], npcs: [], leads: [], goalProgress: 'none', notes: '' },
	clock: { minutes: 10 },
	narratorBrief: 'Mira goes on.',
	roundSummary: 'Mira went on.',
	secrets: [],
}
const books = (sess: any, messageId?: number) =>
	runScript(cat.DUNGEON_CRAWLER_BOOKS_SCRIPT, { session: sess, state: state(), story, messageId, places: { entries: [] }, people: { entries: [] }, log: [], ruleset: VI })
const ledgerOf = (sess: any, plan: Record<string, unknown>, row = 20) => {
	const b = books(sess)
	const turn = { plan: runScript(cat.DUNGEON_CRAWLER_PLAN_SCRIPT, { json: { ...PLAN, ...plan } }).plan }
	const ap = { blocks: {}, facts: { rigour: 'prose' }, outcomes: [], explain: [], rejected: [] }
	const door = runScript(cat.DUNGEON_CRAWLER_DOOR_SCRIPT, { session: sess, books: b, turn, applied: ap, after: state() })
	return runScript(cat.DUNGEON_CRAWLER_LEDGER_SCRIPT, { session: sess, books: b, turn, door, applied: ap, after: state(), row })
}

test('companionsOf reads sessionCharacters: a travelling companion is named; a benched and a removed one are not', () => {
	const b = books(session([crow(30, 'Brother Tamsin'), crow(31, 'Ivo', { enabled: false }), crow(32, 'Neve', { removedAt: '2026-11-10' })]))
	assert.match(b.brief, /Companions travelling with the party[^]*\n- Brother Tamsin/)
	assert.match(b.brief, /name them in fallenCompanions/)
	assert.doesNotMatch(b.brief, /Ivo|Neve/)
})

test('a companion dies: benched and marked deceased, kept in progress.fallen, named in a sentence of its own', () => {
	const ledger = ledgerOf(session([crow(30, 'Brother Tamsin')]), { fallenCompanions: ['brother tamsin', 'Nobody', 'Brother Tamsin'] })
	assert.deepEqual(ledger.companionFates, [
		{ seat: 'seated-member:130', benched: true, member: 'seated-member:130', changes: { nodeState: 'deceased' } },
	])
	assert.deepEqual(ledger.progress.fallen, [
		{ name: 'Brother Tamsin', where: 'The Sunken Gate', seat: 'seated-member:130', castMemberId: 130, companion: true },
	])
	assert.deepEqual(ledger.progress.lastTelling.companionFates, ledger.companionFates)
	assert.match(ledger.narrator.outcomes, /Brother Tamsin is dead\. Name Brother Tamsin's death plainly, in a sentence of its own/)
	assert.equal(ledger.deceased, null)
})

test('a redo files the fates once: the books carry them in told, the swipe returns the same list and appends nothing', () => {
	const sess = session([crow(30, 'Brother Tamsin')])
	const first = ledgerOf(sess, { fallenCompanions: ['Brother Tamsin'] })
	const b = books(session([crow(30, 'Brother Tamsin', { enabled: false })], first.progress), 20)
	// The progress' lastTelling row is 20, so message 20 is its redo.
	assert.equal(b.redo, true)
	assert.deepEqual(b.told.companionFates, first.companionFates)
	const again = runScript(cat.DUNGEON_CRAWLER_LEDGER_SCRIPT, { session: sess, books: b, row: 20 })
	assert.deepEqual(again.companionFates, first.companionFates)
	assert.equal(again.progress, null)
})

test('a revival: the benched companion is brought back from progress.fallen; a hero is never revived here', () => {
	const fallen = [
		{ name: 'Brother Tamsin', where: 'The Sunken Gate', seat: 'seated-member:130', castMemberId: 130, companion: true },
		{ name: 'Mira', where: 'The Hall', seat: 'player-seat:4', castMemberId: 31 },
	]
	const sess = session([crow(30, 'Brother Tamsin', { enabled: false })], { ...PROGRESS, fallen })
	assert.match(books(sess).brief, /Fallen companions the story could bring back to life[^]*Brother Tamsin; name any it does in revivedCompanions/)
	assert.doesNotMatch(books(sess).brief, /bring back to life[^\n]*Mira/)
	const ledger = ledgerOf(sess, { revivedCompanions: ['brother tamsin', 'Mira'] })
	assert.deepEqual(ledger.companionFates, [
		{ seat: 'seated-member:130', benched: false, member: 'seated-member:130', changes: { nodeState: 'active' } },
	])
	assert.deepEqual(ledger.progress.fallen, [fallen[1]])
	assert.match(ledger.narrator.outcomes, /Brother Tamsin is alive again: the story brought them back\. Tell how, plainly\./)
})

test('the spec: each companion fate benches the seat, then marks the cast member', () => {
	const doc = specById(cat.DUNGEON_CRAWLER_RESPOND_SPEC_ID)
	const node = (k: string) => doc.nodes.find((n: any) => n.key === k)
	assert.equal(node('channel.story.companions.fates.companion.item.bench').definitionId, 'core:outlet/set-seat-bench')
	assert.equal(node('channel.story.companions.fates.companion.item.state').definitionId, 'core:outlet/update-cast-member')
})
