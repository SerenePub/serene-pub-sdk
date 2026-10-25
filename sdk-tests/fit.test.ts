import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { genreUsesFindings, playsBestWith, playsBestWithLine, rulesetFit, rulesetProvides, ratingGroupOf, RULESET_RATINGS } from '@serene-pub/sdk'

const diceRuleset: any = {
	id: 'acme:ruleset/dice@1',
	stats: [{ id: 'core:slot/hp@1' }, { id: 'core:slot/crawl-conditions@1' }, { id: 'core:slot/spell-slots@1' }],
	repertoires: [
		{ id: 'weapons', mechanics: [{ verb: 'harm' }, { verb: 'rollWith', target: 'x', from: ['a'] }] },
		{ id: 'conditions', piece: {} },
		{ id: 'spells', mechanics: [{ verb: 'consume' }] },
	],
	conventions: { dice: { die: 20 } },
}
const cardsRuleset: any = {
	id: 'acme:ruleset/cards@1',
	stats: [{ id: 'core:slot/hp@1' }],
	repertoires: [{ id: 'weapons', mechanics: [{ verb: 'harm' }, { verb: 'heal' }] }],
	conventions: {},
}

describe('rulesetProvides', () => {
	test('derives slots, verbs, pieces, conditions, casting and dice from a declaration', () => {
		const p = rulesetProvides(diceRuleset)
		assert.deepEqual([...p.slots].sort(), ['crawl-conditions', 'hp', 'spell-slots'])
		assert.deepEqual([...p.verbs].sort(), ['consume', 'harm', 'rollWith'])
		assert.equal(p.conditions, true)
		assert.equal(p.casting, true)
		assert.equal(p.dice, true)
	})
	test('a missing declaration provides nothing', () => {
		const p = rulesetProvides(null)
		assert.equal(p.slots.size, 0)
		assert.equal(p.dice, false)
	})
})

describe('🚧 rulesetProvides reads check methods and repertoire tags (2026-10-22)', () => {
	test('chance and methods come from the check methods; ⏳ dice is one die-target method', () => {
		const p = rulesetProvides(diceRuleset)
		assert.deepEqual(p.methods, ['die-target'])
		assert.equal(p.chance, true)
		assert.equal(p.tagged, false, 'no repertoire declares tags: conditions and casting are guessed')
		assert.ok(p.tags.has('condition') && p.tags.has('casting') && p.tags.has('weapon'))
		const none = rulesetProvides(cardsRuleset)
		assert.deepEqual(none.methods, [])
		assert.equal(none.chance, false)
		assert.equal(none.dice, false)
	})
	test('a diceless ruleset provides no chance; cards are chance without dice', () => {
		const diceless: any = {
			id: 'acme:ruleset/threads@1',
			stats: [],
			repertoires: [],
			conventions: {
				methods: { risk: { kind: 'bid', resource: 'nerve', costs: [] }, contest: { kind: 'compare' }, judged: { kind: 'none' } },
				defaultMethod: 'judged',
			},
		}
		const p = rulesetProvides(diceless)
		assert.deepEqual(p.methods, ['bid', 'compare', 'none'])
		assert.equal(p.chance, false)
		assert.equal(p.dice, false)
		const cards = rulesetProvides({ ...diceless, conventions: { methods: { draw: { kind: 'card-draw', ranks: 13 } } } })
		assert.equal(cards.chance, true)
		assert.equal(cards.dice, false)
	})
	test('declared tags are all that is read: no guessing from names once any repertoire says them', () => {
		const tagged: any = {
			...diceRuleset,
			repertoires: [
				{ id: 'weapons', tags: ['weapon'] },
				{ id: 'conditions' },
				{ id: 'troubles', tags: ['condition'] },
				{ id: 'spells', tags: [] },
			],
		}
		const p = rulesetProvides(tagged)
		assert.equal(p.tagged, true)
		assert.equal(p.conditions, true, 'troubles is tagged condition')
		assert.equal(p.casting, false, "spells says it is not casting, and the slots' names are not read")
		assert.deepEqual([...p.tags].sort(), ['condition', 'weapon'])
		const fit = rulesetFit({ uses: { verbs: ['harm'], casting: true } }, tagged)
		assert.equal(fit.rating, 'incompatible')
	})
})

describe('rulesetFit', () => {
	test('a genre with no uses rates every ruleset Great', () => {
		assert.equal(rulesetFit({}, diceRuleset).rating, 'great')
		assert.equal(rulesetFit(null, cardsRuleset).rating, 'great')
	})
	// 🚧 RF fix 8: a genre plays best with things by tag; one the rules lack is played in words — never a lock.
	const hp = { tag: 'hp', label: 'a health', why: 'Hits hurt by it.' }
	const sanity = { tag: 'sanity', label: 'a nerve to lose', why: 'Horror wears it down.' }
	test('everything native is Perfect; dice never count unless required', () => {
		const genre = { uses: { verbs: ['harm'], attributes: [hp], conditions: true, dice: 'optional' as const } }
		assert.equal(rulesetFit(genre, diceRuleset).rating, 'perfect')
		assert.match(rulesetFit(genre, diceRuleset).reason, /everything it plays best with is here/)
		// Diceless cards: conditions resolve in words — one words row ⇒ Good.
		const f = rulesetFit(genre, cardsRuleset)
		assert.equal(f.rating, 'good')
		assert.match(f.reason, /conditions — told in words/)
	})
	test('a thing it plays best with that the rules lack is played in words — never Incompatible', () => {
		const genre = { uses: { verbs: ['harm'], attributes: [hp, sanity] } }
		const f = rulesetFit(genre, diceRuleset)
		assert.equal(f.rating, 'good')
		assert.match(f.reason, /a nerve to lose — told in words/)
		assert.deepEqual(f.inWords.map((r) => [r.kind, r.key, r.label, r.why]), [['attribute', 'sanity', 'a nerve to lose', 'Horror wears it down.']])
	})
	test('an attribute of a kind that does not fit is played in words; an attribute is found by its tag or its id', () => {
		const rules: any = { id: 'acme:ruleset/words@1', attributes: [{ id: 'vigour', name: { en: 'Vigour' }, kind: 'label', of: ['hale', 'hurt'], tags: ['health'], prose: 'How hale.' }] }
		const health = { tag: 'health', kinds: ['number', 'pool', 'tally'], label: 'a health-like number', why: 'Hits hurt by it.' }
		assert.equal(rulesetFit({ uses: { verbs: [], attributes: [health] } }, rules).rows[0]!.met, 'words')
		const counted: any = { ...rules, attributes: [{ ...rules.attributes[0], kind: 'number', of: undefined }] }
		assert.equal(rulesetFit({ uses: { verbs: [], attributes: [health] } }, counted).rows[0]!.met, 'native')
		assert.equal(rulesetFit({ uses: { verbs: [], attributes: [{ ...health, tag: 'vigour' }] } }, counted).rows[0]!.met, 'native', 'its id is a tag')
	})
	test('every session has somewhere to keep what someone carries: an inventory zone is always met', () => {
		const inventory = { tag: 'inventory', label: 'somewhere to keep what they carry', why: 'Things stay with them.' }
		for (const r of [diceRuleset, cardsRuleset, { id: 'acme:ruleset/empty@1', name: { en: 'Empty' } }])
			assert.equal(rulesetFit({ uses: { verbs: [], zoneTypes: [inventory] } }, r as any).rows[0]!.met, 'native')
	})
	test('optional uses never move the rating; unused extras are listed neutrally', () => {
		const genre = { uses: { verbs: ['harm'], optional: { attributes: [sanity], casting: true } } }
		const f = rulesetFit(genre, diceRuleset)
		assert.equal(f.rating, 'perfect')
		assert.ok(f.rows.some((r) => r.key === 'sanity' && !r.required && r.met === 'words'))
		assert.ok(f.unused.includes('conditions'))
	})
	test('what it plays best with, as the picker lists it — required first, each label once', () => {
		const genre = { uses: { verbs: [], attributes: [hp], optional: { attributes: [sanity, hp] } } }
		assert.deepEqual(playsBestWith(genre).map((e) => e.label), ['a health', 'a nerve to lose'])
		assert.equal(playsBestWithLine(genre), 'Plays best with a health and a nerve to lose.')
		assert.equal(playsBestWithLine({ uses: { verbs: 'any' } }), '')
	})
	test('a genre names no slot and no ruleset’s list any more: refused, with what to say instead', () => {
		const found = genreUsesFindings({ verbs: [], slots: ['hp'], pieces: ['weapons'], optional: { slots: ['mood'] } })
		assert.equal(found.length, 3)
		assert.match(found[0]!, /names no slot any more.*attributes: \[\{ tag: 'health'/)
		assert.match(found[1]!, /names no ruleset's repertoire any more.*entryTypes/)
		assert.deepEqual(genreUsesFindings({ verbs: [], attributes: [{ tag: 'Health', label: '', why: 'x' }] }).length, 2)
	})
	test('an open grammar takes whatever the ruleset provides', () => {
		const f = rulesetFit({ uses: { verbs: 'any', dice: 'optional' } }, cardsRuleset)
		assert.equal(f.rating, 'perfect')
		assert.deepEqual(f.unused, [])
	})
	test('mostly words is Poor', () => {
		const genre = { uses: { verbs: ['harm', 'cure', 'consume'], conditions: true } }
		const f = rulesetFit(genre, cardsRuleset)
		assert.equal(f.rating, 'poor')
		assert.equal(ratingGroupOf('poor'), 1)
	})
	test('the six ratings and their four bands', () => {
		assert.deepEqual([...RULESET_RATINGS], ['incompatible', 'poor', 'ok', 'good', 'great', 'perfect'])
		assert.deepEqual(RULESET_RATINGS.map(ratingGroupOf), [0, 1, 2, 2, 3, 3])
	})
})

// ── PLAN-layering D3 (lane 1, 2026-10-20): registration fit — fitOf ───────────
import {
	fitOf,
	entitiesRead,
	inletPortsRead,
	triggerCarries,
	coreEvents,
	CORE_EVENTS,
	sessionEvents,
	allEvents,
	everyNTurns,
	afterEachScene,
	onEvent,
	timelineCron,
	schedule,
	whenValue,
	compile,
	eventById,
} from '@serene-pub/sdk'
import { onRoutine, onSessionEvent, onUserMessage } from './registrationFixtures.js'

const reply = onUserMessage('lane1:spec/fit-reply', ['speaker', 'text'], 'Story reply')
const ev = (id: string) => ({ family: 'event' as const, event: id })

describe('fitOf · events (R4)', () => {
	test('the ruled sentence: a reply reads the speaker; scene-opened carries none', () => {
		assert.deepEqual(fitOf(reply, ev(sessionEvents.messageRespond)), { ok: true })
		const misfit = fitOf(reply, ev(sessionEvents.sceneOpened))
		assert.deepEqual(misfit, {
			ok: false,
			missing: ['speaker'],
			sentence: 'Story reply reads the speaker; scene-opened carries none.',
		})
	})

	test('fit reads the graph: the ports the steps read, not the inlet', () => {
		assert.deepEqual(inletPortsRead(reply), ['speaker', 'text'])
		// `text` stands for nothing (optional by contract), `speaker` for the speaker.
		assert.deepEqual(entitiesRead(reply), ['speaker'])
		const quiet = onUserMessage('lane1:spec/fit-quiet', ['text'])
		assert.deepEqual(fitOf(quiet, ev(sessionEvents.sceneOpened)), { ok: true })
	})

	test('a compiled document is judged the same as the spec — named by its slug, which is all a document keeps', () => {
		const doc = fitOf(compile(reply), ev(sessionEvents.sceneOpened))
		assert.deepEqual(doc, {
			ok: false,
			missing: ['speaker'],
			sentence: 'Fit reply reads the speaker; scene-opened carries none.',
		})
	})

	test('a session-event pipeline reading the session fits every session event', () => {
		const p = onSessionEvent('lane1:spec/fit-events', ['session', 'payload'])
		for (const id of [sessionEvents.castChanged, sessionEvents.turnEnded, sessionEvents.storyClockMoved])
			assert.deepEqual(fitOf(p, ev(id)), { ok: true }, id)
		// A card's event carries no session.
		assert.equal(fitOf(p, ev('core:event/media-offered@1')).ok, false)
	})
})

describe('fitOf · actions carry the session, the presser and the speaker', () => {
	const pressed = onUserMessage('lane1:spec/fit-press', ['presser', 'speaker'])
	const recipients = onUserMessage('lane1:spec/fit-recipients', ['recipients'])
	test('a press fits a pipeline reading who pressed and whose turn it is', () => {
		assert.deepEqual(fitOf(pressed, { family: 'action', action: 'lane1:spec/fit-press#go' }), { ok: true })
	})
	test('recipients only when the action collects them', () => {
		const bare = fitOf(recipients, { family: 'action', action: 'x:spec/y#z' })
		assert.equal(bare.ok, false)
		assert.deepEqual((bare as { missing: string[] }).missing, ['cast-member'])
		assert.deepEqual(
			fitOf(recipients, { family: 'action', action: 'x:spec/y#z' }, { action: { collects: { recipients: { label: 'Who' } } } }),
			{ ok: true },
		)
	})
	test('a message-venue action carries the message', () => {
		assert.ok(triggerCarries({ family: 'action', action: 'x:spec/y#z' }, { action: { venue: [{ kind: 'message' }] } }).includes('message'))
		assert.ok(!triggerCarries({ family: 'action', action: 'x:spec/y#z' }, { action: { venue: { kind: 'composer' } } }).includes('message'))
	})
})

describe('fitOf · routines (R9, R12)', () => {
	const readsClock = onRoutine('lane1:spec/fit-clock', ['clock'])
	const readsCast = onRoutine('lane1:spec/fit-cast', ['castMember'])
	const readsScene = onRoutine('lane1:spec/fit-scene', ['scene'])
	const readsSlot = onRoutine('lane1:spec/fit-slot', ['slot'])
	const routine = (cadence: ReturnType<typeof everyNTurns>) => ({ family: 'routine' as const, cadence })

	test('the cadence decides what the cause carries', () => {
		assert.deepEqual(fitOf(readsClock, routine(timelineCron({ every: 1, unit: 'days' }))), { ok: true })
		const no = fitOf(readsClock, routine(everyNTurns({ n: 5 })))
		assert.equal(no.ok, false)
		assert.match((no as { sentence: string }).sentence, /reads the story clock; every-n-turns carries none\./)
		assert.deepEqual(fitOf(readsScene, routine(afterEachScene())), { ok: true })
		assert.deepEqual(fitOf(readsSlot, routine(whenValue({ when: { on: 'state.world.hp', lt: 1 } }))), { ok: true })
	})

	test('onEvent carries what its event carries; a story-clock schedule carries the clock', () => {
		assert.deepEqual(fitOf(readsCast, routine(onEvent(coreEvents.castChanged))), { ok: true })
		assert.equal(fitOf(readsCast, routine(onEvent(coreEvents.sessionUpdated))).ok, false)
		assert.deepEqual(fitOf(readsClock, routine(schedule({ clock: 'story', at: { daily: '09:00' } }))), { ok: true })
		assert.equal(fitOf(readsClock, routine(schedule({ clock: 'system', at: { daily: '09:00' } }))).ok, false)
	})

	test('the family must match the inlet', () => {
		const r = fitOf(reply, routine(everyNTurns({ n: 5 })))
		assert.equal(r.ok, false)
		assert.match((r as { sentence: string }).sentence, /a routine starts a pipeline through the routine inlet \(core:inlet\/routine@1\)/)
		const e = fitOf(readsClock, ev(sessionEvents.messageRespond))
		assert.match((e as { sentence: string }).sentence, /takes routines only/)
	})
})

describe('A1 · every core event states what it carries', () => {
	test('each one, truthfully named', () => {
		for (const e of allEvents().filter((x) => !x.slug.includes(':'))) assert.ok(Array.isArray(e.carries), `${e.slug} states no carries`)
		assert.deepEqual(CORE_EVENTS.messageRespond.carries, ['session', 'message', 'speaker', 'actor'])
		assert.deepEqual(CORE_EVENTS.castChanged.carries, ['session', 'cast-member'])
		assert.deepEqual(CORE_EVENTS.scheduleTick.carries, [])
	})

	test('the five session moments are core events, data family, with what they carry', () => {
		const moments: Record<string, string[]> = {
			'core:event/turn-ended@1': ['session', 'message', 'speaker'],
			'core:event/round-ended@1': ['session'],
			'core:event/scene-opened@1': ['session', 'scene'],
			'core:event/scene-closed@1': ['session', 'scene'],
			'core:event/story-clock-moved@1': ['session', 'clock'],
		}
		for (const [id, carries] of Object.entries(moments)) {
			const def = eventById(id)
			assert.ok(def, id)
			assert.equal(def!.family, 'data')
			assert.deepEqual(def!.carries, carries, id)
			assert.ok(def!.declaredRoot || def!.causedBy?.length, `${id} is caused or a declared root`)
		}
		assert.equal(coreEvents.turnEnded, CORE_EVENTS.turnEnded)
		assert.equal(sessionEvents.storyClockMoved, 'core:event/story-clock-moved@1')
	})
})

// ── 🚧 Core's rulesets against core's genres (M3, 2026-10-22) ────────────────

describe("🚧 core's rulesets against core's genres, read by tags and check methods", () => {
	test('Wherewithal fits Story and the Lair perfectly; the crawl, built on Vis Itineris, poorly; Chat asks for nothing', async () => {
		const cat = await import('../core-catalog/src/index.js')
		const SDK = await import('@serene-pub/sdk')
		const g = (id: string) => SDK.getGenre(id)!
		const fits = (r: any) => Object.fromEntries(['story', 'lair', 'dungeon-crawler', 'chat'].map((k) => [k, rulesetFit(g(`core:genre/${k}`), r).rating]))
		assert.deepEqual(fits(cat.wherewithalRuleset), { story: 'perfect', lair: 'perfect', 'dungeon-crawler': 'poor', chat: 'great' })
		assert.deepEqual(fits(cat.visItinerisRuleset), { story: 'perfect', lair: 'perfect', 'dungeon-crawler': 'perfect', chat: 'great' })
		// The crawl's missing pieces are told in words, never refused: no chance is asked of a ruleset.
		const crawl = rulesetFit(g('core:genre/dungeon-crawler'), cat.wherewithalRuleset)
		assert.ok(!crawl.rows.some((r) => r.required && r.met === 'missing'), JSON.stringify(crawl.rows))
		assert.deepEqual(crawl.rows.filter((r) => r.kind === 'conditions').map((r) => r.met), ['native'])
		// Read by tags: conditions from `troubles`, no casting; by methods: no chance.
		const p = rulesetProvides(cat.wherewithalRuleset)
		assert.deepEqual([p.conditions, p.casting, p.chance, p.tagged], [true, false, false, true])
	})
})
