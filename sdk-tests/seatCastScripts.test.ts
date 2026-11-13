/**
 * 🚧 Seat-cast S3, the genre scripts (lane s27-S3G): the sandbox scripts of
 * the Story reckoning, the Dungeon Crawler and the Lair read the identity the
 * host fills on the cast — a seat row's `ref` · `castMemberId` · `cardId`, the
 * same three on a `state.cast.byId` entry, `castMemberId` on a message — and
 * look an entry up by its `ref`; they no longer build a reference from a card
 * id or parse a card id out of one. ⏳ A host from before S3 fills none of it:
 * the card form is the fallback, removed in S5.
 *
 * Every switched script is run on three shapes of the same table:
 *
 *  · **today** — rows with none of the three fields (a host before S3);
 *  · **S3** — the card form with the fields filled (`character:<cardId>`,
 *    `byId` still keyed by card id) — the output is today's, to the word;
 *  · **S4** — member references (`seated-member:<id>`), a carded player seat
 *    as `player-seat:<id>`, `byId` keyed by member.
 *
 * And the collision: card ids and member ids share one number range, so the
 * entry under `"3"` may be someone else's — a card-form fallback must never
 * read it.
 *
 * Scripts run as plain functions (the app runs them in QuickJS).
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { getRuleset } from '@serene-pub/sdk'
import * as cat from '../core-catalog/src/index.js'
import { STORY_PREAMBLE } from '../core-catalog/src/shared/reckoning.js'
import { DUNGEON_CRAWLER_PREAMBLE } from '../core-catalog/src/genres/dungeon-crawler/preamble.js'
import { visItinerisRuleset } from '../core-catalog/src/registry/rulesets.js'

const K = cat.DUNGEON_CRAWLER_ANNEX_KEYS
const scriptOf = (seedKey: string) => cat.CORE_SCRIPTS.find((s) => s.seedKey === seedKey)!
/** A script's answer, as the sandbox hands it back: JSON (an undefined member is no member). */
const json = <T>(x: T): T => JSON.parse(JSON.stringify(x ?? null))
const runRow = (row: { source: string }, value: unknown) =>
	// eslint-disable-next-line no-new-func
	json(new Function('value', row.source)(json(value)))
const runScript = (seedKey: string, value: unknown) => runRow(scriptOf(seedKey), value)
/** The preamble's own functions, handed back by name. */
const preambleOf = (preamble: string, names: string[]) =>
	// eslint-disable-next-line no-new-func
	new Function('value', `${preamble}\nreturn { ${names.map((n) => `${n}: ${n}`).join(', ')} }`)(
		{},
	) as Record<string, (...a: any[]) => any>
const said = (actions: Array<{ owner: string; text: string }>) =>
	actions.filter((a) => a.text !== 'hold')
const without = <T extends object>(o: T, ...keys: string[]): T => {
	const copy: any = { ...o }
	for (const k of keys) delete copy[k]
	return copy
}

/* ── The Story reckoning: Vell (a card, ref 3), Mira (a player's card 5) and Guest (a card-less seat) ── */

type Shape = 'today' | 'S3' | 'S4'
const ID = (shape: Shape, row: Record<string, unknown>, ids: Record<string, unknown>) =>
	shape === 'today' ? row : { ...row, ...ids }

const storyCast = (shape: Shape) => ({
	sessionId: 9,
	cast: {
		sessionCharacters: [
			ID(
				shape,
				{ enabled: true, position: 0, character: { id: 3, name: 'Vell' } },
				{
					ref: shape === 'S3' ? 'character:3' : 'seated-member:7',
					castMemberId: 7,
					cardId: 3,
				},
			),
		],
		sessionPersonas: [
			ID(
				shape,
				{ enabled: true, seatId: 4, seatName: 'Mira', persona: { id: 5, name: 'Mira' } },
				{
					ref: shape === 'S3' ? 'character:5' : 'player-seat:4',
					castMemberId: 8,
					cardId: 5,
				},
			),
			ID(
				shape,
				{ enabled: true, seatId: 6, seatName: 'Guest', persona: null },
				{ ref: 'player-seat:6', castMemberId: shape === 'S3' ? null : 9, cardId: null },
			),
		],
	},
})
const entry = (shape: Shape, bag: Record<string, unknown>, ids: Record<string, unknown>) =>
	shape === 'today' ? bag : { ...bag, ...ids }
const storyState = (shape: Shape) => ({
	world: {},
	slots: [],
	cast: {
		byId:
			shape === 'S4'
				? {
						'seated_member:7': entry(
							shape,
							{ mood: 'wary', gold: 5 },
							{ ref: 'seated-member:7', castMemberId: 7, cardId: 3 },
						),
						'seated_member:8': entry(
							shape,
							{ mood: 'giddy', gold: 7 },
							{ ref: 'player-seat:4', castMemberId: 8, cardId: 5 },
						),
						'seated_member:9': entry(
							shape,
							{ mood: 'calm', gold: 9 },
							{ ref: 'player-seat:6', castMemberId: 9, cardId: null },
						),
					}
				: {
						'3': entry(
							shape,
							{ mood: 'wary', gold: 5 },
							{ ref: 'character:3', castMemberId: 7, cardId: 3 },
						),
						'5': entry(
							shape,
							{ mood: 'giddy', gold: 7 },
							{ ref: 'character:5', castMemberId: 8, cardId: 5 },
						),
						'player_seat:6': entry(
							shape,
							{ mood: 'calm', gold: 9 },
							{ ref: 'player-seat:6', castMemberId: null, cardId: null },
						),
					},
	},
})
const refsOf = (shape: Shape) =>
	shape === 'S4'
		? ['seated-member:7', 'player-seat:4', 'player-seat:6']
		: ['character:3', 'character:5', 'player-seat:6']
const cribOf = (
	shape: Shape,
	state: unknown = storyState(shape),
	session: unknown = storyCast(shape),
) =>
	runScript('core:script/story-reckon-crib', {
		session,
		state,
		history: [],
		blocks: {},
		ruleset: {},
		modes: { attributes: 'full' },
		places: [],
		schema: {},
	})
const TODAY_CRIB = [
	'The world [world]: nothing tracked yet.',
	'- Vell [character:3]: mood: wary; gold: 5.',
	'- Mira [character:5] (played by a person): mood: giddy; gold: 7.',
	'- Guest [player-seat:6] (played by a person): mood: calm; gold: 9.',
].join('\n')

describe('Story reckoning: whose sheet a line reads', () => {
	test("today's data: each person's sheet by the card form, owners by reference", () => {
		const out = cribOf('today')
		assert.equal(out.crib, TODAY_CRIB)
		assert.deepEqual(out.owners, ['session:9', 'character:3', 'character:5', 'player-seat:6'])
	})

	test('S3 card form: the same words, and the host-filled identity is not printed on a sheet', () => {
		const out = cribOf('S3')
		assert.equal(out.crib, TODAY_CRIB)
		assert.doesNotMatch(out.crib, /castMemberId|cardId|ref:/)
		assert.deepEqual(out.owners, ['session:9', 'character:3', 'character:5', 'player-seat:6'])
	})

	test("S4 shape: member references and member-keyed entries read the right person's sheet", () => {
		const out = cribOf('S4')
		assert.equal(
			out.crib,
			[
				'The world [world]: nothing tracked yet.',
				'- Vell [seated-member:7]: mood: wary; gold: 5.',
				'- Mira [player-seat:4] (played by a person): mood: giddy; gold: 7.',
				'- Guest [player-seat:6] (played by a person): mood: calm; gold: 9.',
			].join('\n'),
		)
		assert.deepEqual(out.owners, [
			'session:9',
			'seated-member:7',
			'player-seat:4',
			'player-seat:6',
		])
	})

	test('the collision: the entry under "3" is member 3\'s, so a card-form reference "character:3" never reads it', () => {
		// Person A is member 3 (no card); person B is card 3 on a host before S3 (no ref on the row, no entry of its own).
		const session = {
			sessionId: 9,
			cast: {
				sessionCharacters: [
					{
						enabled: true,
						position: 0,
						character: { id: 90, name: 'Ash' },
						ref: 'seated-member:3',
						castMemberId: 3,
						cardId: 90,
					},
					{ enabled: true, position: 1, character: { id: 3, name: 'Bram' } },
				],
				sessionPersonas: [],
			},
		}
		const state = {
			world: {},
			slots: [],
			cast: {
				byId: {
					'3': {
						ref: 'seated-member:3',
						castMemberId: 3,
						cardId: 90,
						mood: 'Ash is wary',
					},
				},
			},
		}
		const out = cribOf('today', state, session)
		assert.match(out.crib, /- Ash \[seated-member:3\]: mood: Ash is wary\./)
		assert.match(out.crib, /- Bram \[character:3\]: nothing tracked yet\./)
	})

	test('what a reply adds to is counted from the right sheet (the reckon script)', () => {
		const reply = (owner: string) => ({
			json: {
				changes: [
					{
						owner,
						changes: 'attribute',
						attribute: 'gold',
						entryType: '',
						op: 'add',
						value: '2',
						name: '',
						reason: 'a purse',
					},
				],
				clock: [],
				place: [],
			},
			modes: { attributes: 'full' },
			ruleset: {},
			supply: [],
			places: [],
			schema: {},
		})
		for (const shape of ['today', 'S3', 'S4'] as Shape[]) {
			const [vell, mira, guest] = refsOf(shape)
			const at = (ref: string) =>
				runScript('core:script/story-reckon', { ...reply(ref), state: storyState(shape) })
					.words
			assert.deepEqual(at(vell!), [{ owner: vell, slot: 'gold', value: 7 }], shape)
			assert.deepEqual(at(mira!), [{ owner: mira, slot: 'gold', value: 9 }], shape)
			assert.deepEqual(at(guest!), [{ owner: guest, slot: 'gold', value: 11 }], shape)
		}
		// The collision: "character:3" is not the entry under "3" when that entry is member 3's.
		const state = {
			world: {},
			slots: [],
			cast: { byId: { '3': { ref: 'seated-member:3', gold: 5 } } },
		}
		assert.equal(
			runScript('core:script/story-reckon', { ...reply('character:3'), state }).words,
			null,
		)
		assert.deepEqual(
			runScript('core:script/story-reckon', { ...reply('seated-member:3'), state }).words,
			[{ owner: 'seated-member:3', slot: 'gold', value: 7 }],
		)
	})

	test("peopleOf: the seat's ref and cast member ride along; none filled reads the card form", () => {
		const { peopleOf } = preambleOf(STORY_PREAMBLE, ['peopleOf'])
		assert.deepEqual(json(peopleOf(storyCast('today'))), [
			{ ref: 'character:3', name: 'Vell', plays: false },
			{ ref: 'character:5', name: 'Mira', plays: true },
			{ ref: 'player-seat:6', name: 'Guest', plays: true },
		])
		assert.deepEqual(json(peopleOf(storyCast('S4'))), [
			{ ref: 'seated-member:7', name: 'Vell', plays: false, castMemberId: 7 },
			{ ref: 'player-seat:4', name: 'Mira', plays: true, castMemberId: 8 },
			{ ref: 'player-seat:6', name: 'Guest', plays: true, castMemberId: 9 },
		])
	})
})

describe('Story sweep: who said a numbered line', () => {
	const sweep = (shape: Shape, history: unknown[]) =>
		runScript('core:script/story-sweep-crib', {
			session: storyCast(shape),
			state: storyState(shape),
			modes: { 'scene-moved-on': 'full' },
			check: { due: true, lines: history.map((_, i) => 100 + i) },
			history: history.map((h, i) => ({ id: 100 + i, ...(h as object) })),
		}).crib as string
	const rows = [
		{ role: 'assistant', content: 'The door opens.', characterId: 3 },
		{ role: 'user', content: 'I step in.', personaId: 5 },
		{ role: 'user', content: 'I follow.' },
		{ role: 'assistant', content: 'Dust falls.' },
	]

	test("today's data: the card form names the person, a user's line a player, the rest the narrator", () => {
		assert.match(
			sweep('today', rows),
			/\[1\] Vell: The door opens\.\n\[2\] Mira: I step in\.\n\[3\] A player: I follow\.\n\[4\] The narrator: Dust falls\./,
		)
	})

	test('S3: rows that also carry the cast member name the same people', () => {
		const withMember = [
			{ ...rows[0], castMemberId: 7 },
			{ ...rows[1], castMemberId: 8 },
			rows[2],
			rows[3],
		]
		assert.match(
			sweep('S3', withMember),
			/\[1\] Vell: The door opens\.\n\[2\] Mira: I step in\.\n\[3\] A player: I follow\.\n\[4\] The narrator: Dust falls\./,
		)
	})

	test('S4: the cast member names the person, whatever the card (and a card-less seat has a name too)', () => {
		const out = sweep('S4', [
			{ role: 'assistant', content: 'The door opens.', castMemberId: 7 },
			{ role: 'user', content: 'I step in.', castMemberId: 8 },
			{ role: 'user', content: 'I follow.', castMemberId: 9 },
			{ role: 'assistant', content: 'Dust falls.' },
		])
		assert.match(
			out,
			/\[1\] Vell: The door opens\.\n\[2\] Mira: I step in\.\n\[3\] Guest: I follow\.\n\[4\] The narrator: Dust falls\./,
		)
	})

	// 2026-11-05 s27-S3G (supervisor, after the scope review): a line stamped with a
	// cast member nobody seats is never named by its card once the seats carry their
	// members — the card may now be somebody else's — so it reads as the role words.
	test('a cast member nobody seated is never named by its card; the role words', () => {
		const out = sweep('S3', [
			{ role: 'assistant', content: 'The door opens.', castMemberId: 99, characterId: 3 },
			{ role: 'assistant', content: 'Dust falls.', castMemberId: 99 },
		])
		assert.match(out, /\[1\] The narrator: The door opens\.\n\[2\] The narrator: Dust falls\./)
	})
})

/* ── The Dungeon Crawler: Mira (a card-less seat) and Bo (a seat with card 8) ── */

const MIRA_SEAT = { seatId: 4, seatUserId: 1, seatName: 'Mira', persona: null, removedAt: null }
const BO_SEAT = {
	seatId: 5,
	seatUserId: 7,
	seatName: 'Bo',
	persona: { id: 8, name: 'Bo', userId: 7 },
	removedAt: null,
}
const crawlerSeats = (shape: Shape) => [
	ID(shape, MIRA_SEAT, { ref: 'player-seat:4', castMemberId: 11, cardId: null }),
	ID(shape, BO_SEAT, {
		ref: shape === 'S3' ? 'character:8' : 'player-seat:5',
		castMemberId: 12,
		cardId: 8,
	}),
]
const crawlerRefs = (shape: Shape) =>
	shape === 'S4' ? ['player-seat:4', 'player-seat:5'] : ['player-seat:4', 'character:8']
const bag = (x: Record<string, unknown> = {}) => ({
	hp: 12,
	level: 1,
	'character-class': 'Wizard',
	location: 'The Sunken Gate',
	...x,
})
const HP = 'core:slot/hp@1'
const crawlerState = (shape: Shape, fates: { mira?: string; bo?: string } = {}) => {
	const mira = bag({ fate: fates.mira ?? 'alive' }),
		bo = bag({ hp: 9, fate: fates.bo ?? 'alive' })
	const keys = shape === 'S4' ? ['seated_member:11', 'seated_member:12'] : ['player_seat:4', '8']
	const refs = crawlerRefs(shape)
	return {
		world: { difficulty: 'fair' },
		cast: {
			byId: {
				[keys[0]!]: entry(shape, mira, { ref: refs[0], castMemberId: 11, cardId: null }),
				[keys[1]!]: entry(shape, bo, { ref: refs[1], castMemberId: 12, cardId: 8 }),
			},
		},
		locations: { byId: {} },
		configs: {
			[keys[0]!]: { [HP]: { min: 0, max: 20 } },
			[keys[1]!]: { [HP]: { min: 0, max: 15 } },
		},
	}
}
// 🚧 One `sessionCharacters` row as the host fills it (bench-L3, 2026-11-11).
const sc = (c: any) => ({
	character: { id: c.id, name: c.name },
	ref: c.ref ?? `character:${c.id}`,
	castMemberId: c.castMemberId ?? null,
	enabled: true,
	removedAt: null,
	position: 0,
	absorbedAliases: [],
})
const crawlerSession = (shape: Shape, characters?: unknown[]) => ({
	sessionId: 7,
	ownerUserId: 1,
	guests: [7],
	cast: {
		sessionPersonas: crawlerSeats(shape),
		// Moved 2026-11-11 (bench-L3): the host's real shape, `sessionCharacters` rows (was `characters`).
		sessionCharacters: characters ?? [
			sc({ id: 30, name: 'Brother Tamsin' }),
			// Bo's own card, listed as a cast character too: a seat is no companion.
			sc(ID(shape, { id: 8, name: 'Bo' }, { ref: crawlerRefs(shape)[1], castMemberId: 12 })),
		],
	},
	channelLanes: {},
	annex: {
		core: {
			[K.progress]: {
				shape: 'dungeon',
				built: true,
				heroes: {
					'user:1': { name: 'Mira', made: true },
					'user:7': { name: 'Bo', made: true },
				},
			},
		},
	},
})
const rulesetIn = (id: string, rigour: string, settings: Record<string, string> = {}) => ({
	id,
	rigour,
	settings,
	chance: id.includes('vis-itineris'),
	bands: [],
	...cat.rulesetGistOf(getRuleset(id)! as never, settings),
})
const VI_IN = rulesetIn('core:ruleset/vis-itineris@1', 'scripts', {
	casting: 'slots',
	dying: 'dying-1-4',
})
const PLACES = { entries: [{ id: 50, name: 'The Sunken Gate', content: 'Wet stone.', links: [] }] }
const books = (shape: Shape, story: unknown[], state: unknown = crawlerState(shape)) =>
	runRow(cat.DUNGEON_CRAWLER_BOOKS_SCRIPT, {
		session: crawlerSession(shape),
		state,
		story,
		places: PLACES,
		people: [],
		fallen: [],
		log: [],
		ruleset: VI_IN,
	})
const SAID = [
	{ role: 'user', content: 'I act.', speaker: 'player-seat:4' },
	{ role: 'user', content: 'I too.', personaId: 8 },
]

describe('Dungeon Crawler: seats, sheets and companions', () => {
	test("today's data: card form refs, sheets under the card-form keys, the companion who is no seat", () => {
		const b = books('today', SAID)
		assert.deepEqual(
			b.seats.map((s: any) => [s.ref, s.name, s.hp, s.maxHp, s.user]),
			[
				['player-seat:4', 'Mira', 12, 20, 1],
				['character:8', 'Bo', 9, 15, 7],
			],
		)
		assert.deepEqual(b.actions, [
			{ owner: 'player-seat:4', text: 'I act.' },
			{ owner: 'character:8', text: 'I too.' },
		])
		assert.match(
			b.brief,
			/- Mira \(player-seat:4, Wizard, level 1, health 12\/20, at The Sunken Gate\): declared “I act\.”\./,
		)
		assert.match(
			b.brief,
			/- Bo \(character:8, Wizard, level 1, health 9\/15, at The Sunken Gate\): declared “I too\.”\./,
		)
		assert.match(b.brief, /\n- Brother Tamsin(\n|$)/)
		assert.doesNotMatch(b.brief, /\n- Bo(\n|$)/)
	})

	test("S3 card form: the books are today's, to the word (the cast member only rides on each seat)", () => {
		const today = books('today', SAID),
			s3 = books('S3', SAID)
		assert.equal(s3.brief, today.brief)
		assert.equal(s3.crib, today.crib)
		assert.deepEqual(s3.actions, today.actions)
		assert.deepEqual(s3.owners, today.owners)
		assert.deepEqual(
			s3.seats.map((s: any) => without(s, 'castMemberId')),
			today.seats,
		)
		assert.deepEqual(
			s3.seats.map((s: any) => s.castMemberId),
			[11, 12],
		)
	})

	test("S4 shape: member-keyed sheets and configs are the right seat's, the carded player seat is player-seat:5", () => {
		const b = books('S4', [
			{ role: 'user', content: 'I act.', speaker: 'player-seat:4' },
			{ role: 'user', content: 'I too.', speaker: 'player-seat:5' },
		])
		assert.deepEqual(
			b.seats.map((s: any) => [s.ref, s.name, s.hp, s.maxHp, s.castMemberId]),
			[
				['player-seat:4', 'Mira', 12, 20, 11],
				['player-seat:5', 'Bo', 9, 15, 12],
			],
		)
		assert.match(
			b.brief,
			/- Bo \(player-seat:5, Wizard, level 1, health 9\/15, at The Sunken Gate\): declared “I too\.”\./,
		)
		// Bo's own cast-character row carries the seat's ref and member: no companion.
		assert.doesNotMatch(b.brief, /\n- Bo(\n|$)/)
		assert.match(b.brief, /\n- Brother Tamsin(\n|$)/)
	})

	test('the collision: card 8 on a host before S3 never reads the sheet filed under "8" for member 8', () => {
		const state = crawlerState('today')
		;(state.cast.byId as any)['8'] = {
			ref: 'seated-member:8',
			hp: 1,
			level: 9,
			'character-class': 'Barbarian',
		}
		const b = books('today', SAID, state)
		const bo = b.seats.find((s: any) => s.ref === 'character:8')
		assert.notEqual(bo.hp, 1)
		assert.notEqual(bo.level, 9)
		assert.notEqual(bo['class'], 'Barbarian')
	})

	test('companionsOf: a row names itself by its ref; a seat is told by ref or by cast member', () => {
		const { companionsOf } = preambleOf(DUNGEON_CRAWLER_PREAMBLE, ['companionsOf'])
		const seats = crawlerSeats('S4') // refs player-seat:4 and player-seat:5, members 11 and 12
		const at = (characters: unknown[]) =>
			companionsOf({ cast: { sessionPersonas: seats, sessionCharacters: characters.map(sc) } })
		assert.deepEqual(at([{ id: 30, name: 'Tamsin' }]), [
			{ ref: 'character:30', name: 'Tamsin', castMemberId: null },
		])
		assert.deepEqual(
			at([{ id: 30, name: 'Tamsin', ref: 'seated-member:20', castMemberId: 20 }]),
			[{ ref: 'seated-member:20', name: 'Tamsin', castMemberId: 20 }],
		)
		assert.deepEqual(at([{ id: 8, name: 'Bo', ref: 'player-seat:5' }]), [])
		assert.deepEqual(at([{ id: 8, name: 'Bo', ref: 'seated-member:12', castMemberId: 12 }]), [])
		// Today's data: the seat with card 8 is character:8.
		assert.deepEqual(
			companionsOf({
				cast: {
					sessionPersonas: crawlerSeats('today'),
					sessionCharacters: [
						sc({ id: 8, name: 'Bo' }),
						sc({ id: 31, name: 'Ivo' }),
					],
				},
			}),
			[{ ref: 'character:31', name: 'Ivo', castMemberId: null }],
		)
	})

	test('stateKeyOf: the entry whose ref it is; the card form only when the entry under it has no ref of its own', () => {
		const { stateKeyOf } = preambleOf(DUNGEON_CRAWLER_PREAMBLE, ['stateKeyOf'])
		const byId = {
			'3': { ref: 'seated-member:3' },
			'seated_member:7': { ref: 'seated-member:7' },
			'5': { mood: 'x' },
			'player_seat:6': {},
			'seated_member:9': { ref: 'player-seat:2' },
		}
		assert.equal(stateKeyOf('seated-member:7', byId), 'seated_member:7')
		assert.equal(stateKeyOf('player-seat:2', byId), 'seated_member:9')
		assert.equal(stateKeyOf('character:5', byId), '5')
		assert.equal(stateKeyOf('player-seat:6', byId), 'player_seat:6')
		assert.equal(stateKeyOf('character:3', byId), 'character:3') // 3 is member 3's, not card 3's
		assert.equal(stateKeyOf('character:4', byId), '4') // no entry yet: the card-form key
		assert.equal(stateKeyOf('character:4', undefined), '4')
	})

	test("ucNow and dropUnchanged read the owner's entry by its ref", () => {
		const { ucNow, dropUnchanged } = preambleOf(DUNGEON_CRAWLER_PREAMBLE, [
			'ucNow',
			'dropUnchanged',
		])
		for (const shape of ['today', 'S3', 'S4'] as Shape[]) {
			const state = crawlerState(shape),
				bo = crawlerRefs(shape)[1]!
			assert.equal(ucNow(state, bo, HP), 9, shape)
			assert.deepEqual(
				dropUnchanged(
					[
						{ owner: bo, slot: HP, value: 9 },
						{ owner: bo, slot: HP, value: 4 },
					],
					state,
					null,
				),
				[{ owner: bo, slot: HP, value: 4 }],
				shape,
			)
		}
		// The collision: member 8's entry is not card 8's.
		const state = { cast: { byId: { '8': { ref: 'seated-member:8', hp: 77 } } } }
		assert.notEqual(ucNow(state, 'character:8', HP), 77)
	})
})

describe('Dungeon Crawler: who is declared, who is in the round', () => {
	const round = (
		shape: Shape,
		declared: string[],
		fates: { mira?: string; bo?: string } = {},
		state: unknown = crawlerState(shape, fates),
	) => {
		const ctx = { session: crawlerSession(shape), state }
		const selection = { sentSinceReply: { main: declared }, voiceEntries: [] }
		// eslint-disable-next-line no-new-func
		return new Function('selection', 'ctx', cat.DUNGEON_CRAWLER_ROUND_SCRIPT.source)(
			selection,
			JSON.parse(JSON.stringify(ctx)),
		).order as unknown[]
	}
	const READY = [{ ref: null, via: 'voice' }]

	test("today's data: the round is ready when every living seat has declared, by the card form or the seat", () => {
		assert.deepEqual(round('today', ['player-seat:4', 'character:8']), READY)
		assert.deepEqual(round('today', ['user:1', 'user:7']), READY)
		assert.deepEqual(round('today', ['player-seat:4']), [])
		// A dead seat is out of the round: it is read off the fate row under the card-form key.
		assert.deepEqual(round('today', ['player-seat:4'], { bo: 'dead' }), READY)
	})

	test('S3 card form: the same answers', () => {
		assert.deepEqual(round('S3', ['player-seat:4', 'character:8']), READY)
		assert.deepEqual(round('S3', ['player-seat:4']), [])
		assert.deepEqual(round('S3', ['player-seat:4'], { bo: 'dead' }), READY)
	})

	test('S4 shape: a seat declared as its ref; the dead one is read off the member-keyed entry', () => {
		assert.deepEqual(round('S4', ['player-seat:4', 'player-seat:5']), READY)
		assert.deepEqual(round('S4', ['player-seat:4']), [])
		assert.deepEqual(round('S4', ['player-seat:4'], { bo: 'dead' }), READY)
		assert.deepEqual(round('S4', ['player-seat:5'], { mira: 'taken-out' }), READY)
		// ⏳ A declaration stamped before the flip (the card form) still counts for a seat with a card.
		assert.deepEqual(round('S4', ['player-seat:4', 'character:8']), READY)
		// But a number that is not the seat's card (Bo is seat 5, card 8) is nobody's: never the wrong person.
		assert.deepEqual(round('S4', ['player-seat:4', 'character:5']), [])
		assert.deepEqual(round('S4', ['player-seat:4', 'character:12']), [])
	})

	test("the collision: member 8's fate row never takes card 8 out of the round", () => {
		const state = crawlerState('today')
		;(state.cast.byId as any)['8'] = { ref: 'seated-member:8', fate: 'dead', hp: 1 }
		assert.deepEqual(round('today', ['player-seat:4'], {}, state), []) // Bo (card 8) is alive and has not declared
		assert.deepEqual(round('today', ['player-seat:4', 'character:8'], {}, state), READY)
	})
})

describe('Dungeon Crawler: whose line it was', () => {
	const bookBy = (shape: Shape, line: Record<string, unknown>) =>
		said(books(shape, [{ role: 'user', content: 'I act.', ...line }]).actions)

	test("today's data: the speaker, then the card, then the player", () => {
		assert.deepEqual(bookBy('today', { speaker: 'player-seat:4' }), [
			{ owner: 'player-seat:4', text: 'I act.' },
		])
		assert.deepEqual(bookBy('today', { personaId: 8 }), [
			{ owner: 'character:8', text: 'I act.' },
		])
		assert.deepEqual(bookBy('today', { userId: 7 }), [{ owner: 'character:8', text: 'I act.' }])
	})

	test('S4 shape: the cast member picks the seat, ahead of the card and the player', () => {
		assert.deepEqual(bookBy('S4', { castMemberId: 11 }), [
			{ owner: 'player-seat:4', text: 'I act.' },
		])
		assert.deepEqual(bookBy('S4', { castMemberId: 12 }), [
			{ owner: 'player-seat:5', text: 'I act.' },
		])
		// The speaker still wins; a member nobody seated falls through to the player.
		assert.deepEqual(bookBy('S4', { speaker: 'player-seat:4', castMemberId: 12 }), [
			{ owner: 'player-seat:4', text: 'I act.' },
		])
		assert.deepEqual(bookBy('S4', { castMemberId: 99, userId: 7 }), [
			{ owner: 'player-seat:5', text: 'I act.' },
		])
	})

	test('S3 card form: a line carrying its card and its cast member reads as before', () => {
		assert.deepEqual(bookBy('S3', { personaId: 8, castMemberId: 12 }), [
			{ owner: 'character:8', text: 'I act.' },
		])
	})
})

describe('Dungeon Crawler: the turn script reads a fate and a pool through the lookup', () => {
	const delta = (d: Record<string, unknown>) => ({
		owner: '',
		op: 'add',
		slot: '',
		repertoire: '',
		piece: '',
		value: '',
		check: '',
		against: 0,
		reason: '',
		...d,
	})
	const plan = (deltas: unknown[]) =>
		runRow(cat.DUNGEON_CRAWLER_PLAN_SCRIPT, {
			json: {
				deltas,
				world: { rooms: [], npcs: [], leads: [], goalProgress: 'none', notes: '' },
				clock: { minutes: 5 },
				narratorBrief: 'On.',
				roundSummary: '',
				secrets: [],
			},
		})
	const turn = (shape: Shape, state: unknown) =>
		runRow(cat.DUNGEON_CRAWLER_TURN_SCRIPT, {
			session: crawlerSession(shape),
			books: books(
				shape,
				[{ role: 'user', content: 'I act.', speaker: crawlerRefs(shape)[0] }],
				state,
			),
			first: plan([
				delta({
					owner: crawlerRefs(shape)[1],
					op: 'spend',
					slot: 'hp',
					value: '4',
					reason: 'a blow',
				}),
			]),
			state,
		})
	test('a spend on the carded seat lands on its own sheet in each shape', () => {
		for (const shape of ['today', 'S3', 'S4'] as Shape[]) {
			const t = turn(shape, crawlerState(shape))
			assert.deepEqual(
				t.deltas?.[0],
				{
					owner: crawlerRefs(shape)[1],
					op: 'spend',
					slot: 'hp',
					value: 4,
					reason: 'a blow',
				},
				shape,
			)
		}
	})
})

describe('Dungeon Crawler: a new character is offered only to a seat whose fate row says dead', () => {
	const Q = cat.DUNGEON_CRAWLER_QUESTIONS
	const press = (shape: Shape, addressee: string, state: unknown) =>
		runRow(cat.DUNGEON_CRAWLER_INTERVIEW_SCRIPT, {
			session: crawlerSession(shape),
			referent: Q.newCharacter,
			choice: Q.newCharacter,
			addressee,
			state,
		})

	test('in each shape: dead, the name is asked again; alive, the press is refused', () => {
		for (const shape of ['today', 'S3', 'S4'] as Shape[]) {
			assert.equal(
				press(shape, 'user:7', crawlerState(shape, { bo: 'dead' })).nextBlocks[0].referent,
				Q.name,
				shape,
			)
			assert.match(
				press(shape, 'user:7', crawlerState(shape)).refusal,
				/alive and still in the story/,
				shape,
			)
			assert.equal(
				press(shape, 'user:1', crawlerState(shape, { mira: 'dead' })).nextBlocks[0]
					.referent,
				Q.name,
				shape,
			)
		}
	})

	test("the collision: member 8's dead fate row is not card 8's, so the press is refused", () => {
		const state = crawlerState('today')
		;(state.cast.byId as any)['8'] = { ref: 'seated-member:8', fate: 'dead', hp: 0 }
		assert.match(press('today', 'user:7', state).refusal, /alive and still in the story/)
	})
})

describe("Dungeon Crawler: a long rest gives back the right seat's spent spell slots", () => {
	const slot = { name: 'Level 1', level: 1, max: 2, used: 1 }
	const rest = (shape: Shape, state: any) =>
		runRow(cat.DUNGEON_CRAWLER_REST_SCRIPT, {
			session: crawlerSession(shape),
			state,
			ruleset: VI_IN,
		}).deltas
	const withSlots = (shape: Shape) => {
		const state = crawlerState(shape)
		const key = shape === 'S4' ? 'seated_member:12' : '8'
		state.cast.byId[key]['crawl-spell-slots'] = [slot]
		return state
	}

	test("in each shape: the carded seat's slots are rewritten under its own reference", () => {
		for (const shape of ['today', 'S3', 'S4'] as Shape[]) {
			const bo = crawlerRefs(shape)[1]
			assert.deepEqual(
				rest(shape, withSlots(shape)),
				[
					{ owner: bo, op: 'remove', repertoire: 'spell-slots', piece: 'Level 1' },
					{
						owner: bo,
						op: 'add',
						repertoire: 'spell-slots',
						piece: { ...slot, used: 0 },
						reason: 'A long rest',
					},
				],
				shape,
			)
		}
	})

	test("the collision: member 8's spent slots are not card 8's", () => {
		const state = crawlerState('today')
		;(state.cast.byId as any)['8'] = { ref: 'seated-member:8', 'crawl-spell-slots': [slot] }
		assert.equal(rest('today', state), null)
	})
})

/* ── The Lair ── */

describe('Lair: a roller is a person by reference', () => {
	const lairCast = (shape: Shape) => ({
		sessionCharacters: [
			ID(
				shape,
				{ character: { id: 12, name: 'Brask' } },
				{
					ref: shape === 'S3' ? 'character:12' : 'seated-member:5',
					castMemberId: 5,
					cardId: 12,
				},
			),
		],
		sessionPersonas: [
			ID(
				shape,
				{ seatId: 3, seatUserId: 7, persona: { id: 21, name: 'Ann', userId: 7 } },
				{
					ref: shape === 'S3' ? 'character:21' : 'player-seat:3',
					castMemberId: 6,
					cardId: 21,
				},
			),
			ID(
				shape,
				{ seatId: 8, seatUserId: 9, seatName: 'Cob', persona: null },
				{ ref: 'player-seat:8', castMemberId: 10, cardId: null },
			),
		],
	})
	const VIS = {
		id: visItinerisRuleset.id,
		rigour: 'mechanics',
		settings: {},
		...cat.lairRulesRow(visItinerisRuleset),
	}
	const dice = (shape: Shape, owner: string) =>
		runScript('core:script/lair-dice', {
			outcomes: [
				{
					owner,
					kind: 'check',
					text: 'x',
					check: {
						selector: 'save.dexterity',
						natural: 12,
						total: 15,
						against: 10,
						band: 'success',
						five: 'success',
						label: 'Success',
					},
				},
			],
			explain: [],
			ruleset: VIS,
			session: { sessionId: 1, ownerUserId: 1, fields: {}, cast: lairCast(shape) },
		})

	test("today's data: the card form names the delver and is the block's roller", () => {
		const out = dice('today', 'character:12')
		assert.equal(out.text, 'Brask — Dexterity save: 15 against 10. Success.')
		assert.equal(out.blocks[0].by, 'character:12')
		assert.equal(
			dice('today', 'player-seat:8').text,
			'Cob — Dexterity save: 15 against 10. Success.',
		)
		assert.equal(dice('today', 'player-seat:8').blocks[0].by, 'player-seat:8')
		// The seat key a persona seat goes by besides.
		assert.match(dice('today', 'persona:21').text, /^Ann — /)
	})

	test('S3 card form: the same line', () => {
		assert.equal(dice('S3', 'character:12').text, dice('today', 'character:12').text)
		assert.equal(dice('S3', 'character:12').blocks[0].by, 'character:12')
		assert.equal(
			dice('S3', 'character:21').text,
			'Ann — Dexterity save: 15 against 10. Success.',
		)
	})

	test('S4 shape: a member reference names the delver and is accepted as the roller; a carded player seat is player-seat:<id>', () => {
		const out = dice('S4', 'seated-member:5')
		assert.equal(out.text, 'Brask — Dexterity save: 15 against 10. Success.')
		assert.equal(out.blocks[0].by, 'seated-member:5')
		assert.equal(
			dice('S4', 'player-seat:3').text,
			'Ann — Dexterity save: 15 against 10. Success.',
		)
		assert.equal(dice('S4', 'player-seat:3').blocks[0].by, 'player-seat:3')
		// An unknown kind of reference is no roller.
		assert.equal(dice('S4', 'envoy:gm').blocks[0].by, undefined)
	})

	test('the collision: card 5 is not member 5', () => {
		// Brask is member 5 (card 12); a reference "character:5" is a card no one has seated.
		const out = dice('S4', 'character:5')
		assert.doesNotMatch(out.text, /^Brask/)
	})

	test("a turn waits for the person who plays a delver, named by the seat row's ref", () => {
		const plan = {
			speakers: [
				{ name: 'Brask', intent: 'scout' },
				{ name: 'Ann', intent: 'climb down' },
			],
			beats: [],
			risks: [],
		}
		const waits = (shape: Shape) =>
			runScript('core:script/lair-turn', {
				plan,
				table: { mode: 'none' },
				session: { sessionId: 1, ownerUserId: 1, fields: {}, cast: lairCast(shape) },
				ruleset: VIS,
				action: { id: cat.LAIR_ROLL_ANSWER_ACTION, fn: 'answer' },
			}).waits
		assert.deepEqual(waits('today'), ['character:21'])
		assert.deepEqual(waits('S3'), ['character:21'])
		assert.deepEqual(waits('S4'), ['player-seat:3'])
	})
})

describe('Dungeon Crawler: a benched seat is not in play (owner 2026-11-10)', () => {
	test('liveSeats and seatOf leave out a seat with enabled false, and a removed one', () => {
		const fns = preambleOf(DUNGEON_CRAWLER_PREAMBLE, ['liveSeats', 'seatOf'])
		const seat = (seatId: number, userId: number, extra: Record<string, unknown> = {}) => ({
			seatId,
			seatName: `Seat ${seatId}`,
			seatUserId: userId,
			persona: null,
			removedAt: null,
			enabled: true,
			...extra,
		})
		const doc = {
			cast: {
				sessionPersonas: [
					seat(1, 10, { enabled: false }),
					seat(2, 11, { removedAt: '2026-11-10T00:00:00Z' }),
					seat(3, 12),
					seat(4, 13, { enabled: undefined }),
				],
			},
		}
		assert.deepEqual(
			fns.liveSeats(doc).map((s: { seatId: number }) => s.seatId),
			[3, 4],
		)
		assert.equal(fns.seatOf(doc, 10), null)
		assert.equal(fns.seatOf(doc, 11), null)
		assert.equal(fns.seatOf(doc, 12)?.seatId, 3)
	})
})
