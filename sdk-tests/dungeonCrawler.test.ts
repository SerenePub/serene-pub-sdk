/**
 * 🚧 Dungeon Crawler's foundation (PLAN-dungeon-crawler-2026-10-14): the
 * declaration's shape, its channels and envoys, its slots, its layout's
 * claims and its turn-order spec — what the spec lanes build on. The round
 * script's decision table runs in the app, in the real QuickJS sandbox
 * (`src/lib/server/pipelines/scripts/dungeonCrawlerRound.test.ts`).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { channelDecls, compile, getRuleset, hostStateFor, i18nText, spec, validate, validateSessionLayout } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import * as cat from '../core-catalog/src/index.js'

/** 🚧 Vis Itineris as the host lays it on the inlet (S4, 2026-10-23): its id, rigour, settings and gist. */
const VI_IN = { id: 'core:ruleset/vis-itineris@1', rigour: 'scripts', settings: {}, ...cat.rulesetGistOf(getRuleset('core:ruleset/vis-itineris@1')! as never) }

const g = cat.dungeonCrawlerGenre

test('no lorebook, no lore or scene writes, no scene summary', () => {
	assert.equal(g.id, 'core:genre/dungeon-crawler')
	// Absent is "this genre has no lorebook": no picker, and one is refused.
	assert.equal(g.shape?.lorebook, undefined)
	// 2026-10-17: lore writes allowed — the world lives in the session's
	// notes (the phantom lorebook), not a picked one. Scenes stay off.
	assert.deepEqual(g.shape?.writes, { lore: true, scenes: false })
	assert.equal(g.summarize, undefined)
	assert.deepEqual(g.shape?.greeting, { enabled: false })
	// A persona is only a seed: the new-session form starts with none (2026-10-15).
	assert.deepEqual(g.shape?.personas, { min: 0, preselectDefault: false })
	assert.equal(g.shape?.characters?.min, 0)
	// 🚧 The form says they are companions (2026-10-18, `characters.hint`).
	assert.match(String((g.shape?.characters as any)?.hint?.en), /companions/i)
	// 🚧 RF fix 8: a genre brings no attributes — and adds none.
	assert.equal('customAttributes' in g, false)
	assert.equal(i18nText(g.playerLabel!, 'en'), 'Adventurer')
	assert.deepEqual(g.shape?.turnControls, { advance: true, pick: false, narrate: false, retake: true })
})

test('the layout names its panels apart: Story, Goal & leads, Journal', () => {
	const ws: any = cat.DUNGEON_CRAWLER_LAYOUT.widgetSettings
	assert.equal(ws.messages.title, 'Story')
	assert.equal(ws['annex#journal'].title, 'Goal & leads')
	assert.equal(ws['messages#journal'].channel, cat.TRAVELOGUE_CHANNEL)
})

test('the choices on the sheet read as words: each choice slot labels its options', () => {
	for (const s of [cat.standingOrderSlot, cat.fateSlot, cat.difficultySlot, cat.statModeSlot, cat.goalModeSlot] as any[]) {
		const of = s.config.of as string[]
		assert.equal(typeof s.shape, 'object', s.id)
		assert.deepEqual(s.shape.of, of, s.id)
		assert.deepEqual(s.shape.members.map((m: any) => m.key), of, s.id)
		for (const m of s.shape.members) assert.ok(i18nText(m.label, 'en'), `${s.id} ${m.key}`)
	}
	// 🚧 Dying between Alive and Taken out (PLAN-dc-after-walk2 Q3-8).
	assert.deepEqual(
		(cat.fateSlot as any).shape.members.map((m: any) => i18nText(m.label, 'en')),
		['Alive', 'Dying', 'Taken out', 'Dead'],
	)
})

test('four channels: Story, the Planner lanes, the Journal folio and the table', () => {
	const decls = channelDecls(g.shape!)
	const by = Object.fromEntries(decls.map((d) => [d.slug, d]))
	assert.deepEqual(Object.keys(by).sort(), ['main', cat.PARLEY_CHANNEL, cat.TRAVELOGUE_CHANNEL, 'table'].sort())
	// 🚧 The table (PLAN-rulesets §30): the rolls, in no voice, off the story.
	assert.equal(i18nText(by.table!.label!, 'en'), 'Dice')
	assert.equal(by.table!.role, 'folio')
	assert.equal(by.table!.voice, 'none')
	assert.equal(i18nText(by.main!.label!, 'en'), 'Story')
	assert.equal(by.main!.voice, 'narrator')
	assert.equal(i18nText(by[cat.PARLEY_CHANNEL]!.label!, 'en'), 'Planner')
	assert.equal(by[cat.PARLEY_CHANNEL]!.role, 'conversation')
	assert.equal(i18nText(by[cat.TRAVELOGUE_CHANNEL]!.label!, 'en'), 'Journal')
	assert.equal(by[cat.TRAVELOGUE_CHANNEL]!.role, 'folio')
	assert.equal(by[cat.TRAVELOGUE_CHANNEL]!.voice, 'none')
})

test('the Planner greets on its channel; the Narrator is the default and the fallback', () => {
	const [planner, narrator] = g.envoys!
	assert.equal(planner!.key, cat.DUNGEON_CRAWLER_PLANNER_KEY)
	assert.equal(planner!.greeting?.channel, cat.PARLEY_CHANNEL)
	const words = (i18nText(planner!.greeting!.text, 'en') ?? '').split(/\s+/).length
	assert.ok(words <= 120, `the greeting is ${words} words`)
	assert.equal(narrator!.key, cat.DUNGEON_CRAWLER_NARRATOR_KEY)
	assert.equal(narrator!.default, true)
	assert.equal(narrator!.fallback, true)
	assert.match(narrator!.prompts!.systemPrompt!, /Never decide what a player's character does/)
})

test('the crawl declares no sheet: the host keeps its tools, the place on each hero (RF fix 8)', () => {
	assert.equal('slots' in g, false)
	assert.equal('sheets' in g, false)
	const kept = hostStateFor(g)
	const of = (id: string) => kept.filter((d) => d.slot === id)
	for (const id of [cat.DUNGEON_CRAWLER_SLOT_IDS.standingOrder, cat.DUNGEON_CRAWLER_SLOT_IDS.fate, cat.DUNGEON_CRAWLER_SLOT_IDS.difficulty, cat.DUNGEON_CRAWLER_SLOT_IDS.goalMode])
		assert.deepEqual(of(id).map((d) => d.role), ['tool'], id)
	assert.deepEqual(of(cat.DUNGEON_CRAWLER_SLOT_IDS.clock).map((d) => d.role), ['time'])
	// The party may split: where someone is, is theirs.
	assert.deepEqual(of(cat.DUNGEON_CRAWLER_SLOT_IDS.location).map((d) => [d.role, d.owners]), [['place', ['cast']]])
	// Health, level and class are the rules' — never the host's, never the genre's.
	for (const id of [cat.DUNGEON_CRAWLER_SLOT_IDS.hp, cat.DUNGEON_CRAWLER_SLOT_IDS.level, cat.DUNGEON_CRAWLER_SLOT_IDS.characterClass])
		assert.deepEqual(of(id), [], id)
	assert.equal(cat.standingOrderSlot.default, 'hold')
	assert.equal(cat.difficultySlot.default, 'fair')
})

const s0 = (layout: any) => layout.widgetSettings

test('the layout: the Planner, Story and the planning notes as tabs of the middle, the Planner first; the journal on the right', () => {
	const layout = g.layouts![0]!.preset as any
	// The Planner first: a session opens on its interview, on a phone too, where the sides are hidden.
	assert.deepEqual(layout.panels.middle.primary.tabs, ['messages#parley', 'messages', 'annex#planning-notes'])
	assert.equal(layout.panels.middle.primary.open, undefined, 'absent open is the first tab: the Planner')
	assert.deepEqual(layout.panels.left, [])
	assert.deepEqual(layout.panels.middle.above, [])
	assert.deepEqual(layout.panels.middle.below, [])
	assert.deepEqual(validateSessionLayout(layout).errors, [])
	// 🚧 The Dice tab beside the Journal (2026-10-18): the whole table, no composer.
	assert.deepEqual(layout.panels.right.map((p: any) => p.tabs), [['stats'], ['annex#journal'], ['messages#journal', 'messages#table']])
	assert.deepEqual(s0(layout)['messages#table'], {
		channel: 'table',
		title: 'Dice',
		showComposer: false,
		emptyState: "The rolls and the table's notes show here as the story is played.",
		// 🚧 The crawl's clock as the Story spells it (PLAN-dc-after-walk3 R1-6).
		timeFormat: 'Day {day}, {hh}:{mm}',
	})
	// 🚧 Every player's sheet as the faces strip, the viewer's own first (2026-10-18).
	assert.equal(s0(layout).stats.owners, 'seats')
	assert.equal(s0(layout).stats.arrangement, 'faces')
	const s = layout.widgetSettings
	assert.equal(s['messages#parley'].channel, cat.PARLEY_CHANNEL)
	// Lanes by person on the server (2026-10-17): the copy claims the viewer's own lane.
	assert.equal(s['messages#parley'].channelLane, 'mine')
	assert.deepEqual(s['messages#journal'], {
		channel: cat.TRAVELOGUE_CHANNEL,
		showComposer: false,
		emptyState: 'Your journal fills as the story unfolds.',
		rowKinds: ['did', 'found', 'met', 'changed', 'lead'],
	})
	// 🚧 The copy ticks every kind the ledger writes but `time` (PLAN-sheet-widget-redesign §16; a ticked
	// list since 2026-10-18; time lines off by default since PLAN-dc-after-walk3 R3-5, the walk's #42).
	assert.deepEqual(s['messages#journal'].rowKinds, cat.DUNGEON_CRAWLER_JOURNAL_KINDS.filter((k: string) => k !== 'time'))
	// 🚧 Copy and clock are the copies' settings (owner ruling 2026-10-15), never genre fields.
	assert.match(s.messages.emptyState, /Planner tab/)
	assert.equal(s.messages.timeFormat, 'Day {day}, {hh}:{mm}')
	// 🚧 Story draws the table's rows inline under their anchors (PLAN-rulesets §30).
	assert.equal(s.messages.interleave, 'table')
	assert.equal(s.stats.emptyState, 'Your sheet appears once your character is made.')
	assert.equal(s.stats.timeFormat, 'Day {day}, {hh}:{mm}')
	assert.equal(s['messages#parley'].emptyState, undefined)
	assert.equal(s['annex#journal'].key, `core.${cat.DUNGEON_CRAWLER_ANNEX_KEYS.journal}`)
	assert.equal(s['annex#planning-notes'].key, `core.${cat.DUNGEON_CRAWLER_ANNEX_KEYS.planningNotesRevealed}`)
	// Nothing that reads a lorebook.
	for (const w of ['chronicle', 'places', 'lore-entries']) assert.ok(g.omitWidgets!.includes(w), w)
})

test('the turn order: the scripted strategy over an empty pool, recomputed when the annex moves', () => {
	const doc = cat.dungeonCrawlerTurnOrder.build() as any
	assert.equal(doc.id, cat.DUNGEON_CRAWLER_TURN_ORDER_SPEC_ID)
	const strategy = doc.nodes.find((n: any) => n.key === 'strategy')
	assert.equal(strategy.definitionId, 'core:task/turn-scripted')
	assert.ok(cat.DUNGEON_CRAWLER_TURN_ORDER_EVENTS.includes('core:event/annex-changed@1'))
	for (const e of cat.DUNGEON_CRAWLER_TURN_ORDER_EVENTS) assert.ok(e in g.events, e)
	// Published with the create spec: in the list, bound by the preset.
	assert.ok(cat.TURN_ORDER_BY_GENRE.some((t) => t.genre === g))
	// `member-added` is the welcome's; the lane it opens moves the annex.
	assert.ok(!cat.DUNGEON_CRAWLER_TURN_ORDER_EVENTS.includes('core:event/member-added@1' as any))
	// The round script by seed key at the strategy's `select` point; every channel read.
	const values = doc.presets[0].values
	const chain = values.find((v: any) => v.nodeKey === 'strategy' && v.slot === 'scripts')
	assert.deepEqual(chain.value, { select: [{ seedKey: cat.DUNGEON_CRAWLER_ROUND_SCRIPT.seedKey }] })
	const history = values.find((v: any) => v.nodeKey === 'history' && v.slot === 'params')
	assert.equal(history.value.channel, '*')
})

/* ── The create lane (2026-10-15): specs, preset, scripts ─────────────────── */

const specById = (id: string) => cat.CORE_SPECS.find((x) => x.slug === id)!.build() as any
const presetValues = (doc: any) => doc.presets.find((p: any) => p.default).values as any[]
const named = (doc: any, slot: string) =>
	Object.fromEntries(presetValues(doc).filter((v: any) => v.slot === slot).map((v: any) => [v.nodeKey, v.value]))

test('the genre is published: its pipelines, its preset, both envoys seated', () => {
	const ids = cat.CORE_SPECS.map((x) => x.slug)
	for (const id of [
		cat.DUNGEON_CRAWLER_CREATE_SPEC_ID,
		cat.DUNGEON_CRAWLER_RESPOND_SPEC_ID,
		cat.DUNGEON_CRAWLER_WELCOME_SPEC_ID,
		cat.DUNGEON_CRAWLER_INTERVIEW_SPEC_ID,
		cat.DUNGEON_CRAWLER_ANSWER_FORM_SPEC_ID,
		cat.DUNGEON_CRAWLER_TURN_ORDER_SPEC_ID,
	])
		assert.ok(ids.includes(id), id)
	// Create before anything that declares itself for the genre.
	assert.ok(ids.indexOf(cat.DUNGEON_CRAWLER_CREATE_SPEC_ID) < ids.indexOf(cat.DUNGEON_CRAWLER_RESPOND_SPEC_ID))
	assert.ok(cat.coreExtension().genres!.some((x: any) => x.id === g.id))
	// 🚧 By registration (PLAN-layering D4, 2026-10-20): the preset is the
	// genre's defaults as they stand, and the defaults say what answers what.
	const preset = cat.corePresets().find((p) => p.slug === 'dungeon-crawler-default')!
	assert.equal(preset.registrations, undefined)
	assert.equal(preset.default, true)
	const regs = cat.coreGenreRegistrations()[g.id]!
	const on = (event: string) =>
		regs.filter((r) => r.trigger.family === 'event' && r.trigger.event === event).map((r) => r.pipeline)
	assert.deepEqual(on('core:event/session-created@1'), [cat.DUNGEON_CRAWLER_CREATE_SPEC_ID])
	assert.deepEqual(on('core:event/message-respond@1'), [cat.DUNGEON_CRAWLER_RESPOND_SPEC_ID])
	assert.deepEqual(on('core:event/member-added@1'), [cat.DUNGEON_CRAWLER_WELCOME_SPEC_ID])
	assert.deepEqual(on('core:event/annex-changed@1'), [cat.DUNGEON_CRAWLER_TURN_ORDER_SPEC_ID])
	assert.deepEqual(
		regs.flatMap((r) => (r.trigger.family === 'action' ? [r.trigger.action] : [])),
		[
			cat.DUNGEON_CRAWLER_INTERVIEW_ACTION,
			`${cat.DUNGEON_CRAWLER_REVEAL_SPEC_ID}#reveal`,
			`${cat.DUNGEON_CRAWLER_REST_SPEC_ID}#rest`,
			cat.DUNGEON_CRAWLER_GOAL_ACTION,
			// R50: every core genre registers the four summaries as (unlisted) actions.
			`${cat.SUMMARIZE_WORLD_SPEC_ID}#summarize-world`,
			`${cat.SUMMARIZE_CHARACTER_SPEC_ID}#summarize-character`,
			`${cat.SUMMARIZE_HISTORY_SPEC_ID}#summarize-history`,
			`${cat.SUMMARIZE_SCENE_SPEC_ID}#summarize-scene`,
		],
	)
	assert.deepEqual(preset.defaults?.envoys, ['planner', 'narrator'])
	// The genre's one preset is its default (R22, one default per genre).
	const seedRow = cat.corePresetSeeds().find((x) => x.seedKey === 'core-dungeon-crawler-default')!
	assert.equal(seedRow.isDefault, true)
})

test('create: the rules on the world, the annex keys, a greeted lane per person — by seed key, no model call', () => {
	const doc = specById(cat.DUNGEON_CRAWLER_CREATE_SPEC_ID)
	assert.ok(!doc.nodes.some((n: any) => n.kind === 'oracle'))
	const rules = doc.nodes.find((n: any) => n.key === 'rules')
	const slots = JSON.stringify(rules)
	for (const id of ['core:slot/difficulty@1', 'core:slot/goal-mode@1', 'core:slot/crawl-time@1'])
		assert.ok(slots.includes(id), id)
	// Numbers and dice are the session's rigour (How strict), never the world's (walk 6, 2026-10-17).
	assert.ok(!slots.includes('core:slot/stat-mode@1'))
	assert.ok(slots.includes(cat.DUNGEON_CRAWLER_EPOCH))
	const scripts = named(doc, 'scripts')
	assert.deepEqual(scripts.lanes, [{ seedKey: cat.DUNGEON_CRAWLER_LANES_SCRIPT.seedKey }])
	assert.deepEqual(named(doc, 'params').welcome, { envoy: 'planner' })
	assert.deepEqual(named(doc, 'params').apply, { mode: 'apply' })
	// Core opens each person's lane (`parley` is `lanes: 'personal'`, owner ruling 2026-10-17)…
	const mine = doc.nodes.find((n: any) => n.key === 'opened.greet.planner.seated.lane.item.mine')
	assert.equal(mine.definitionId, 'core:query/channel-lane')
	assert.equal(mine.config.channel, cat.PARLEY_CHANNEL)
	// …and the greeting lands on a lane that ask opened, under the Planner's name.
	const writes = doc.nodes.filter((n: any) => n.definitionId === 'core:outlet/create-message')
	assert.equal(writes.length, 2)
	for (const w of writes) assert.ok(w.key.startsWith('opened.greet.planner.seated.lane.item.fresh.opened.who.'), w.key)
	// No annex lane map: the register is core's.
	assert.doesNotMatch(JSON.stringify(doc.nodes.map((n: any) => n.config)), /dungeon-crawler-lanes/)
	// The create asks nobody a standing order: nobody had a lane before it.
	assert.ok(!doc.nodes.some((n: any) => n.key.startsWith('standing.')))
})

test('welcome: a second person at the table asks the one who played alone their standing order, on their own lane (§14)', () => {
	const doc = specById(cat.DUNGEON_CRAWLER_WELCOME_SPEC_ID)
	assert.deepEqual(validate(doc).filter((f: any) => f.severity === 'error'), [])
	const write = doc.nodes.find((n: any) => n.key === 'standing.asked.planner.seated.player.item.write')
	assert.equal(write.definitionId, 'core:outlet/create-message')
	assert.match(JSON.stringify(write.config.channel), /standing\.asked\.planner\.seated\.player\.item\.lane/)
	assert.match(JSON.stringify(write.config.blocks), /standing\.asked\.planner\.seated\.player\.item\.blocks/)
	assert.equal(write.config.speaker, cat.PLANNER)
	// Its greetings are the create's own tail.
	assert.ok(doc.nodes.some((n: any) => n.key === 'opened.greet.planner.seated.lane.item.fresh.opened.who.player.write'))
})

test('the interview: one action on the form venue, a route per part of the plan, prompts by seed key', () => {
	const doc = specById(cat.DUNGEON_CRAWLER_INTERVIEW_SPEC_ID)
	const action = doc.contributes.actions[0]
	assert.equal(action.key, 'answer')
	assert.deepEqual(action.venue, [{ kind: 'form' }])
	assert.equal(`${doc.id}#${action.key}`, cat.DUNGEON_CRAWLER_INTERVIEW_ACTION)
	const keys = doc.nodes.map((n: any) => n.key)
	for (const k of [
		'route.refused.write',
		'route.world.write',
		'route.rules.changesApplied',
		'route.seat.setSeat',
		'route.ask.put.question.write',
		'route.classes.classWrite',
		'route.classes.choices',
		'route.sheet.sheetWrite',
		'route.sheet.after.seat.setSeat',
		'route.sheet.after.begin.genesisWrite',
		'route.sheet.after.begin.sceneWrite',
	])
		assert.ok(keys.includes(k), k)
	// The sheet's full health is the seat's hp max, configured before its stats are written.
	const pos = (k: string) => doc.nodes.find((n: any) => n.key === k).position
	const health = doc.nodes.find((n: any) => n.key === 'route.sheet.after.seat.health.set.write')
	assert.equal(health.definitionId, 'core:outlet/set-stat-config')
	assert.equal(health.config.slot, 'core:slot/hp@1')
	assert.ok(pos('route.sheet.after.seat.health.set.write') < pos('route.sheet.after.seat.stats.changed.changesApplied'))
	assert.ok(!keys.includes('route.seat.health.set.write'))
	// Three model calls on the Planner's way to the opening, and one prose: ONE each.
	const oracles = doc.nodes.filter((n: any) => n.kind === 'oracle').map((n: any) => n.key)
	assert.deepEqual(oracles.sort(), [
		'route.classes.classWrite',
		'route.sheet.after.begin.genesisWrite',
		'route.sheet.after.begin.sceneWrite',
		'route.sheet.sheetWrite',
	])
	const prompts = named(doc, 'prompts')
	assert.deepEqual(prompts['route.classes.classContext'], { seedKey: cat.DUNGEON_CRAWLER_PROMPT_KEYS.classes })
	assert.deepEqual(prompts['route.sheet.after.begin.genesisContext'], { seedKey: cat.DUNGEON_CRAWLER_PROMPT_KEYS.genesis })
	assert.deepEqual(named(doc, 'sampling')['route.sheet.sheetWrite'], { seedKey: 'sampling-background' })
	for (const key of Object.values(cat.DUNGEON_CRAWLER_PROMPT_KEYS))
		assert.ok(cat.CORE_PROMPTS.some((p) => p.seedKey === key), key)
})

test('the reply: the story and the Planner lanes are two branches; the Planner may edit a sheet', () => {
	const doc = specById(cat.DUNGEON_CRAWLER_RESPOND_SPEC_ID)
	const keys = doc.nodes.map((n: any) => n.key)
	for (const k of [
		'channel.story.say',
		'channel.parley.placeholder',
		'channel.parley.talkWrite',
		'channel.parley.editsWrite',
		'channel.parley.kept.changed.apply',
		'channel.parley.kept.noted.write',
		'channel.parley.kept.said.write',
		'channel.parley.kept.ruled.apply',
		'channel.parley.kept.ruled.shown.line.write',
	])
		assert.ok(keys.includes(k), k)
	// The round's hand-marked annex key is retired (AUDIT B): nothing clears it.
	assert.ok(!keys.includes('channel.story.clear'))
	assert.deepEqual(named(doc, 'scripts')['channel.parley.crib'], [{ seedKey: cat.DUNGEON_CRAWLER_CRIB_SCRIPT.seedKey }])
	assert.deepEqual(named(doc, 'scripts')['channel.parley.edit'], [{ seedKey: cat.DUNGEON_CRAWLER_EDITS_SCRIPT.seedKey }])
	// The edits call runs on every lane line (AUDIT A23: no keyword gate), and what it asked for lands through the handler.
	const node = (k: string) => doc.nodes.find((n: any) => n.key === k)
	assert.equal(node('channel.parley.editsWrite').definitionId, 'core:oracle/generate-json')
	assert.equal(node('channel.parley.kept.ruled.apply').definitionId, 'core:task/ruleset-resolve')
	assert.equal(node('channel.parley.kept.ruled.apply').config.mode, 'apply')
	assert.deepEqual(Object.keys((cat.DUNGEON_CRAWLER_EDITS_FRAME as any).properties), ['standingOrder', 'asks', 'deltas', 'rooms'])
	// 🚧 S1: its grammar laid over the session's rules — the reply schema, then the genre's own (`shape.ts`).
	assert.equal(node('channel.parley.editsShape').definitionId, 'core:task/ruleset-resolve')
	assert.deepEqual(named(doc, 'scripts')['channel.parley.editsSchema'], [{ seedKey: cat.DUNGEON_CRAWLER_SHAPE_SCRIPT.seedKey }])
	assert.match(JSON.stringify(node('channel.parley.editsWrite').config.schema), /channel\.parley\.editsSchema/)
	// Every line anchored to the Planner's reply: deleting it takes them back.
	assert.match(JSON.stringify(node('channel.parley.kept.said.write').config.tableLine), /channel\.parley\.placeholder/)
})

test("the Planner's reply reads its own lane: the history's channel is the run's, the story is background (2026-10-15)", () => {
	const doc = specById(cat.DUNGEON_CRAWLER_RESPOND_SPEC_ID)
	const node = (k: string) => doc.nodes.find((n: any) => n.key === k)
	const lane = node('channel.parley.lane')
	assert.equal(lane.definitionId, 'core:query/session-history')
	// The lane the reply is on, chosen at run time — never the slug's every lane.
	assert.deepEqual(lane.config.channelLane, { __ref: 'data', node: 'input', port: 'channel' })
	assert.deepEqual(named(doc, 'params')['channel.parley.lane'], { limit: 40 })
	// The lane is the conversation of both calls; the story is the talk's background.
	for (const k of ['channel.parley.talkLines', 'channel.parley.editsLines'])
		assert.deepEqual(node(k).config.messages, { __ref: 'data', node: 'channel.parley.lane', port: 'messages' }, k)
	assert.deepEqual(node('channel.parley.talkContext').config.recentStory, { __ref: 'data', node: 'story', port: 'messages' })
	const talk = cat.CORE_PROMPTS.find((p: any) => p.seedKey === cat.DUNGEON_CRAWLER_PROMPT_KEYS.parley) as any
	assert.match(talk.fields.systemPrompt, /\{\{#if recentStory\}\}/)
	assert.doesNotMatch(talk.fields.systemPrompt, /\{\{turnDirection\}\}/)
})

test('every script a spec names is one core seeds', () => {
	const seeded = new Set(cat.CORE_SCRIPTS.map((x) => x.seedKey))
	for (const id of [
		cat.DUNGEON_CRAWLER_CREATE_SPEC_ID,
		cat.DUNGEON_CRAWLER_WELCOME_SPEC_ID,
		cat.DUNGEON_CRAWLER_INTERVIEW_SPEC_ID,
		cat.DUNGEON_CRAWLER_RESPOND_SPEC_ID,
		cat.DUNGEON_CRAWLER_REST_SPEC_ID,
		cat.DUNGEON_CRAWLER_GOAL_SPEC_ID,
		cat.DUNGEON_CRAWLER_TURN_ORDER_SPEC_ID,
	]) {
		for (const v of presetValues(specById(id)).filter((v: any) => v.slot === 'scripts')) {
			const links = Array.isArray(v.value) ? v.value : Object.values(v.value).flat()
			for (const l of links as any[]) assert.ok(seeded.has(l.seedKey), `${id} ${v.nodeKey}: ${l.seedKey}`)
		}
	}
	assert.equal(new Set(cat.CORE_SCRIPTS.map((x) => x.seedKey)).size, cat.CORE_SCRIPTS.length)
})

/* ── The scripts, run as plain functions (the app runs them in QuickJS) ──── */

const runScript = (seedRow: { source: string }, value: unknown) =>
	// eslint-disable-next-line no-new-func
	new Function('value', seedRow.source)(JSON.parse(JSON.stringify(value)))

const K = cat.DUNGEON_CRAWLER_ANNEX_KEYS
const seat = (seatId: number, userId: number, name: string | null, persona: any = null) => ({
	seatId,
	seatUserId: userId,
	seatName: name,
	persona,
	removedAt: null,
})
/** Core's lane register (owner ruling 2026-10-17): the owner on lane 1, the guest on lane 2. */
const REGISTER = { 'user:1': 'parley', 'user:7': 'parley:2' }
const session = (annex: Record<string, unknown> = {}, seats: any[] = [], guests: number[] = [7], register: Record<string, string> = REGISTER) => ({
	sessionId: 7,
	ownerUserId: 1,
	guests,
	cast: { sessionPersonas: seats },
	// What the settings document carries for a genre with a `lanes: 'personal'` channel.
	channelLanes: { [cat.PARLEY_CHANNEL]: register },
	annex: { core: annex },
})

test('lanes: who core opens a lane for, the owner first, each greeted with a first question; nothing twice', () => {
	const made = runScript(cat.DUNGEON_CRAWLER_LANES_SCRIPT, { session: session({}, [], [7], {}) })
	// Core opens the lanes (`core:query/channel-lane@1`): the script names the people, the owner first.
	assert.deepEqual(made.greet.map((g: any) => g.addressee), ['user:1', 'user:7'])
	assert.equal(made.ask, null)
	assert.equal(made.greet[0].owner, true)
	assert.equal(made.greet[0].text, null)
	assert.equal(made.greet[0].blocks[0].referent, cat.DUNGEON_CRAWLER_QUESTIONS.worldShape)
	assert.equal(made.greet[0].blocks[0].addressee, 'user:1')
	assert.ok(made.greet[0].blocks[0].actions.some((a: any) => a.choice === cat.JUST_PLAY_CHOICE))
	// A player's first question is one choice — make the character, or Just play — so answering it closes Just play.
	assert.equal(made.greet[1].owner, false)
	// 🚧 Nobody has answered yet: the world is the owner's to choose, never "being set up" (the 100-turn walk, P0-4).
	assert.match(made.greet[1].text, /The session's owner chooses the world/)
	const underway = runScript(cat.DUNGEON_CRAWLER_LANES_SCRIPT, { session: session({ [K.progress]: { shape: 'dungeon' } }, [], [7], { 'user:1': 'parley' }) })
	assert.match(underway.greet[0].text, /being set up by the session's owner/)
	assert.equal(made.greet[1].blocks.length, 1)
	assert.equal(made.greet[1].blocks[0].referent, cat.DUNGEON_CRAWLER_QUESTIONS.justPlay)
	assert.deepEqual(made.greet[1].blocks[0].actions.map((a: any) => a.choice), [cat.MAKE_CHARACTER_CHOICE, cat.JUST_PLAY_CHOICE])
	// Everyone has a lane in the register: a member event opens nothing.
	assert.deepEqual(runScript(cat.DUNGEON_CRAWLER_LANES_SCRIPT, { session: session({}, [seat(3, 7, 'Bo')]) }), { greet: null, ask: null })
	// A newcomer's seat: only they are greeted; once the world is built, they are told so.
	const joined = runScript(cat.DUNGEON_CRAWLER_LANES_SCRIPT, {
		session: session({ [K.progress]: { built: true } }, [seat(5, 1, 'Ann'), seat(4, 9, null)]),
	})
	assert.deepEqual(joined.greet.map((g: any) => g.addressee), ['user:9'])
	assert.match(joined.greet[0].text, /ready and waiting/)
	// Two had lanes already: everyone before the newcomer was asked their standing order then, or under their sheet.
	assert.equal(joined.ask, null)
	// 🚧 The adventure has ended (PLAN-dc-after-walk2 Q3-7, N16): a newcomer is told so and asked nothing,
	// and the one who played alone is not asked their standing order for a story that tells no more.
	const ended = runScript(cat.DUNGEON_CRAWLER_LANES_SCRIPT, {
		session: session({ [K.progress]: { built: true, ended: true, heroes: { 'user:1': { name: 'Ann', made: true } } } }, [seat(5, 1, 'Ann')], [9], { 'user:1': 'parley' }),
	})
	assert.deepEqual(ended.greet.map((g: any) => g.addressee), ['user:9'])
	assert.match(ended.greet[0].text, /This adventure has ended/)
	assert.doesNotMatch(ended.greet[0].text, /make your character/)
	assert.deepEqual(ended.greet[0].blocks, [])
	assert.equal(ended.ask, null)
})

test('lanes: the table grows past one — the one who played alone is asked their standing order on their own lane (§14)', () => {
	const solo = { 'user:1': 'parley' }
	// Ann's character is made: her sheet stamped her hero (🚧 P0-3).
	const made = { [K.progress]: { heroes: { 'user:1': { name: 'Ann', made: true } } } }
	const grown = runScript(cat.DUNGEON_CRAWLER_LANES_SCRIPT, { session: session(made, [seat(5, 1, 'Ann')], [7], solo) })
	assert.deepEqual(grown.greet.map((g: any) => g.addressee), ['user:7'])
	assert.equal(grown.ask.length, 1)
	assert.equal(grown.ask[0].addressee, 'user:1')
	assert.equal(grown.ask[0].lane, 'parley')
	assert.match(grown.ask[0].text, /joined the table/)
	assert.equal(grown.ask[0].blocks[0].referent, cat.STANDING_ORDER_QUESTION)
	assert.equal(grown.ask[0].blocks[0].addressee, 'user:1')
	assert.equal(grown.ask[0].blocks[0].question, "What does Ann do when you're away?")
	// No character made yet: nothing to ask — their sheet asks it, the table being more than one by then.
	assert.equal(runScript(cat.DUNGEON_CRAWLER_LANES_SCRIPT, { session: session({}, [seat(5, 1, null)], [7], solo) }).ask, null)
	// 🚧 A persona names the seat at creation, but no character is made (the 100-turn walk, B3): the
	// open world question is never superseded by the standing order's.
	const personaSeat = seat(5, 1, null, { id: 9, name: 'Wren Ashdown', userId: 1 })
	assert.equal(runScript(cat.DUNGEON_CRAWLER_LANES_SCRIPT, { session: session({}, [personaSeat], [7], solo) }).ask, null)
	assert.equal(
		runScript(cat.DUNGEON_CRAWLER_LANES_SCRIPT, { session: session({ [K.progress]: { heroes: { 'user:1': { name: 'Wren Ashdown' } } } }, [personaSeat], [7], solo) }).ask,
		null,
	)
	// Nobody new: nobody asked.
	assert.equal(runScript(cat.DUNGEON_CRAWLER_LANES_SCRIPT, { session: session({}, [seat(5, 1, 'Ann')], [], solo) }).ask, null)
	// …and the answer is taken: a guest greeted counts, their seat on its way.
	const answered = runScript(cat.DUNGEON_CRAWLER_INTERVIEW_SCRIPT, {
		session: session({}, [seat(5, 1, 'Ann')], [7], solo), referent: cat.STANDING_ORDER_QUESTION, addressee: 'user:1', choice: 'follow', values: {},
	})
	assert.equal(answered.refusal, null)
	assert.deepEqual(answered.seatChanges, [{ slot: 'core:slot/standing-order@1', value: 'follow' }])
	assert.equal(answered.lane, 'parley')
	// Alone at the table: refused, solo has no round to sit out.
	const alone = runScript(cat.DUNGEON_CRAWLER_INTERVIEW_SCRIPT, {
		session: session({}, [seat(5, 1, 'Ann')], [], solo), referent: cat.STANDING_ORDER_QUESTION, addressee: 'user:1', choice: 'follow', values: {},
	})
	assert.match(alone.refusal, /only one at the table/)
	assert.equal(alone.seatChanges, null)
})

const answer = (referent: string, extra: Record<string, unknown> = {}, annex: Record<string, unknown> = {}, seats: any[] = []) =>
	runScript(cat.DUNGEON_CRAWLER_INTERVIEW_SCRIPT, {
		session: session(annex, seats, [7]),
		referent,
		addressee: 'user:1',
		values: {},
		...extra,
	})

test('the interview: world questions are the owner’s, in order; a name names the seat and asks for classes', () => {
	const shape = answer('world-shape', { choice: 'open-world' })
	assert.equal(shape.world.shape, 'open-world')
	assert.equal(shape.nextBlocks[0].referent, 'difficulty')
	const refused = answer('difficulty', { choice: 'brutal', addressee: 'user:7' })
	assert.ok(refused.refusal)
	assert.equal(refused.worldChanges, null)
	assert.equal(refused.lane, 'parley:2')
	const hard = answer('difficulty', { choice: 'brutal' })
	assert.deepEqual(hard.worldChanges, [{ owner: 'world', slot: 'core:slot/difficulty@1', value: 'brutal' }])
	// The goal mode is the world's slot alone (AUDIT C7: no copy in the bookkeeping);
	// the world's questions answered, any finished sheet may build it (A10).
	const goal = answer('goal-mode', { choice: 'secret' })
	assert.deepEqual(goal.worldChanges, [{ owner: 'world', slot: 'core:slot/goal-mode@1', value: 'secret' }])
	assert.equal(goal.world.goalMode, undefined)
	assert.equal(goal.world.settled, true)
	assert.equal(goal.nextBlocks[0].referent, 'name')
	const blank = answer('name', { values: { name: '  ' } })
	assert.equal(blank.seatName, null)
	assert.equal(blank.nextBlocks[0].referent, 'name')
	const named = answer('name', { values: { name: 'Ann the Bold' } })
	assert.equal(named.seatName, 'Ann the Bold')
	// The answered form shows only "Answered": the table says the name back — a
	// note (a table line, never rerun), not a question (2026-10-16).
	// 🚧 The person's own answer, a table line of kind `answer` their lane's talk reads as theirs (P3-5).
	assert.equal(named.echo, 'Name: Ann the Bold.')
	assert.equal(named.note, null)
	assert.equal(named.next, null)
	// A guest who chose to make their character is asked the name next.
	const make = answer('just-play', { choice: cat.MAKE_CHARACTER_CHOICE, addressee: 'user:7' })
	assert.equal(make.justPlay, false)
	assert.equal(make.nextBlocks[0].referent, 'name')
	// No change that changes nothing: Fair where the world already reads Fair.
	const fair = answer('difficulty', { choice: 'fair', state: { world: { difficulty: 'fair' } } })
	assert.equal(fair.worldChanges, null)
	// How strict was set at creation: the interview never asks "Story or dice?" (walk 6, 2026-10-17).
	assert.equal(fair.nextBlocks[0].referent, 'goal-mode')
	// A Story-or-dice form an older session still holds writes nothing, and goes on to the goal.
	const older = answer('stat-mode', { choice: 'dice' })
	assert.equal(older.nextBlocks[0].referent, 'goal-mode')
	assert.equal(older.worldChanges, null)
	assert.ok(answer('stat-mode', { choice: 'dice', addressee: 'user:7' }).refusal)
	// …nor the slot's default where nothing is stored, nor a standing order already given.
	assert.equal(answer('difficulty', { choice: 'fair', state: { world: {} } }).worldChanges, null)
	const order = answer(cat.STANDING_ORDER_QUESTION, { choice: 'hold', state: { cast: { byId: {} } } }, {}, [seat(5, 1, 'Ann')])
	assert.equal(order.seatChanges, null)
	const follow = answer(cat.STANDING_ORDER_QUESTION, { choice: 'follow', state: { cast: { byId: { 'player_seat:5': { 'standing-order': 'hold' } } } } }, {}, [seat(5, 1, 'Ann')])
	assert.deepEqual(follow.seatChanges, [{ slot: 'core:slot/standing-order@1', value: 'follow' }])
	assert.ok(named.classBrief)
	assert.equal(named.world.heroes['user:1'].name, 'Ann the Bold')
})

test('the interview: a class is written on the seat; the backstory asks the sheet; Just play asks everything', () => {
	const seats = [seat(5, 1, 'Ann')]
	const cls = answer('class', { choice: 'ranger', label: 'Ranger' }, {}, seats)
	assert.equal(cls.seatName, 'Ann')
	assert.deepEqual(cls.seatChanges, [{ slot: 'core:slot/character-class@1', value: 'Ranger' }])
	assert.equal(cls.nextBlocks[0].referent, 'backstory')
	const noName = answer('class', { choice: 'ranger', label: 'Ranger' })
	assert.ok(noName.refusal)
	const together = answer('backstory', { choice: 'together' }, {}, seats)
	assert.equal(together.nextBlocks[0].kind, 'form')
	assert.equal(together.sheetBrief, null)
	const surprise = answer('backstory', { choice: 'surprise' }, {}, seats)
	assert.ok(surprise.sheetBrief)
	assert.equal(surprise.justPlay, false)
	const jp = answer('world-shape', { choice: 'just-play' })
	assert.equal(jp.justPlay, true)
	assert.match(jp.sheetBrief, /difficulty/)
	assert.doesNotMatch(jp.sheetBrief, /story or dice/)
	const guest = answer('just-play', { choice: 'just-play', addressee: 'user:7' })
	assert.equal(guest.justPlay, true)
	assert.equal(guest.isOwner, false)
	assert.doesNotMatch(guest.sheetBrief, /Pick the world's shape/)
})

test('the sheet: stats on the seat, the world on the owner’s Just play, genesis once', () => {
	const json = {
		name: 'Vex', class: 'Hedge-witch', abilities: ['Hex', 'Brew'], gear: ['Staff'], hp: 14, backstory: 'Raised by crows.',
		shape: 'dungeon', difficulty: 'gentle', goalMode: 'secret',
	}
	const plan = { addressee: 'user:1', justPlay: true, isOwner: true, currentName: null }
	const out = runScript(cat.DUNGEON_CRAWLER_SHEET_SCRIPT, { session: session(), plan, json, ruleset: VI_IN })
	assert.equal(out.seatName, 'Vex')
	// No abilities or gear in words: the class's starting kit, pieces of the rules (2026-10-16).
	assert.ok(!out.seatChanges.some((c: any) => c.slot === 'core:slot/abilities@1' || c.slot === 'core:slot/inventory@1'))
	// The kit is the ruleset handler's to hand out, on a seat; this session seats nobody yet, so the
	// kit names the seat to come — the seat step fills it in (🚧 P3-7, the walk's B20: it got none).
	assert.ok(out.kit.deltas.length > 0)
	assert.ok(out.kit.deltas.every((d: any) => d.owner === '<seat>'))
	assert.deepEqual(out.kit.owners, ['session:7'])
	const owned = runScript(cat.DUNGEON_CRAWLER_SHEET_SCRIPT, { session: session(), kit: out.kit, seat: 'player-seat:12' })
	assert.deepEqual(owned.owners, ['session:7', 'player-seat:12'])
	assert.ok(owned.deltas.every((d: any) => d.owner === 'player-seat:12'))
	assert.equal(owned.deltas.length, out.kit.deltas.length)
	// Full health is the seat's hp max (2026-10-15), by Vis Itineris's level-1
	// rule (2026-10-17): the class's hit die plus its Constitution modifier —
	// a hedge-witch takes the wizard's kit, d6 + 2 — never the model's number;
	// and the hero record never carries a second copy of it.
	assert.ok(out.seatChanges.some((c: any) => c.slot === 'core:slot/hp@1' && c.value === 8))
	assert.deepEqual(out.healthConfig, { max: 8 })
	assert.equal(out.world.heroes['user:1'].maxHp, undefined)
	// The six ability scores, the class's: the wizard's Intelligence highest.
	assert.ok(out.seatChanges.some((c: any) => c.slot === 'core:slot/itineris-intelligence@1' && c.value === 16))
	assert.equal(out.seatChanges.filter((c: any) => /^core:slot\/itineris-(strength|dexterity|constitution|intelligence|wisdom|charisma)@1$/.test(c.slot)).length, 6)
	// 🚧 …and its trained skills (owner ruling ★4, after walk #3): the wizard's Arcana and History.
	assert.ok(out.seatChanges.some((c: any) => c.slot === 'core:slot/itineris-skill-training@1' && c.value.includes('arcana')))
	// What happens next is its own line, after the standing order's question.
	assert.equal(out.after, 'Give me a moment to build the world.')
	assert.doesNotMatch(out.text, /Give me a moment/)
	assert.equal(out.blocks[0].referent, cat.STANDING_ORDER_QUESTION)
	assert.ok(out.seatChanges.every((c: any) => !('owner' in c)))
	// Difficulty and goal: whether dice count is the session's rigour, never the model's (walk 6).
	assert.equal(out.worldChanges.length, 2)
	assert.ok(!out.worldChanges.some((c: any) => c.slot === 'core:slot/stat-mode@1'))
	// The goal mode genesis files under: the world's slot, never a bookkeeping copy (AUDIT C7).
	assert.equal(out.goalMode, 'secret')
	assert.equal(out.world.goalMode, undefined)
	assert.ok(out.genesisBrief)
	// Genesis starts: the world is being built (held against a second build), and every made character's Story opens after it.
	assert.equal(typeof out.world.building, 'number')
	assert.deepEqual(out.openStory, ['user:1'])
	assert.equal(out.waiting, false)
	// A guest's Just play before the world's questions are settled: their character only,
	// no world built for them — their Story stays shut, and says why.
	const guest = runScript(cat.DUNGEON_CRAWLER_SHEET_SCRIPT, {
		session: session(), plan: { ...plan, addressee: 'user:7', isOwner: false }, json,
	})
	assert.equal(guest.worldChanges, null)
	assert.equal(guest.genesisBrief, null)
	assert.equal(guest.openStory, null)
	assert.equal(guest.waiting, true)
	assert.equal(guest.after, "We'll begin once the world is ready.")
	// 🚧 Genesis on the FIRST finished sheet (AUDIT A10): once the owner settled the world's questions, a guest's sheet builds it.
	const first = runScript(cat.DUNGEON_CRAWLER_SHEET_SCRIPT, {
		session: session({ [K.progress]: { shape: 'dungeon', settled: true, heroes: { 'user:1': { name: 'Ann' } } } }),
		plan: { ...plan, addressee: 'user:7', isOwner: false },
		json,
	})
	assert.ok(first.genesisBrief)
	assert.match(first.genesisBrief, /Ann/)
	assert.deepEqual(first.openStory, ['user:1', 'user:7'])
	// Genesis once: while one is being built, the next finished sheet waits for it.
	const second = runScript(cat.DUNGEON_CRAWLER_SHEET_SCRIPT, {
		session: session({ [K.progress]: { ...first.world } }),
		plan,
		json,
	})
	assert.equal(second.genesisBrief, null)
	assert.equal(second.waiting, true)
	// The world already built: no second genesis; this person's Story opens.
	const seats = [seat(5, 1, 'Ann'), seat(6, 7, 'Bo')]
	const hall = { cast: { byId: { 'player_seat:5': { location: 'The Hall' } } } }
	const built = runScript(cat.DUNGEON_CRAWLER_SHEET_SCRIPT, {
		session: session({ [K.progress]: { built: true } }, seats), plan, json,
	})
	assert.equal(built.genesisBrief, null)
	assert.deepEqual(built.openStory, ['user:1'])
	assert.match(built.after, /already out there/)
	// Alone in a built world: no "others" (AUDIT E).
	assert.match(runScript(cat.DUNGEON_CRAWLER_SHEET_SCRIPT, { session: session({ [K.progress]: { built: true } }, [], []), plan, json }).after, /The world is waiting/)
	// 🚧 A character made once the world exists stands where a living seat of the party stands now (AUDIT A9).
	const placed = runScript(cat.DUNGEON_CRAWLER_SHEET_SCRIPT, {
		session: session({ [K.progress]: { built: true } }, seats),
		plan: { ...plan, addressee: 'user:7', isOwner: false, justPlay: false, currentName: 'Bo' },
		json,
		state: hall,
	})
	assert.ok(placed.seatChanges.some((c: any) => c.slot === 'core:slot/location@1' && c.value === 'The Hall'))
	// Nobody placed yet: nowhere — the story turn places them.
	assert.ok(!built.seatChanges.some((c: any) => c.slot === 'core:slot/location@1'))
	// An older session whose world document had places counts as built.
	const older = runScript(cat.DUNGEON_CRAWLER_SHEET_SCRIPT, {
		session: session({ [K.legacyWorld]: { rooms: [{ name: 'Gate' }] } }), plan, json,
	})
	assert.equal(older.genesisBrief, null)
})

test("the sheet: a fighter's kit gives Strength 16 — modifier +3 — and d10 + Constitution health (walk 2026-10-17)", () => {
	const plan = { addressee: 'user:1', justPlay: true, isOwner: false, currentName: null }
	const out = runScript(cat.DUNGEON_CRAWLER_SHEET_SCRIPT, { session: session(), plan, json: { name: 'Ann', class: 'Fighter', backstory: '' }, ruleset: VI_IN })
	const score = (a: string) => out.seatChanges.find((c: any) => c.slot === `core:slot/itineris-${a}@1`)?.value
	assert.equal(score('strength'), 16)
	assert.equal(score('constitution'), 14)
	assert.deepEqual(out.healthConfig, { max: 12 })
	// 🚧 The session's ruleset's kits (S4): read off the inlet, never the build's.
	const kits = VI_IN.kits!
	assert.equal(kits.byId.fighter!.maxHp, 12)
	assert.deepEqual(kits.byId.fighter!.abilities[0], { slot: 'core:slot/itineris-strength@1', value: 16 })
	// Every kit is the standard array, its best score raised by one.
	for (const key of kits.order)
		assert.deepEqual(kits.byId[key]!.abilities.map((a) => a.value).sort((a, b) => b - a), [16, 14, 13, 12, 10, 8], key)
	// The derive script, handed those scores, makes the modifier the attack reads.
	const values: Record<string, unknown> = { level: 1 }
	for (const c of out.seatChanges) if (/itineris-/.test(c.slot)) values[c.slot.replace(/^core:slot\/|@1$/g, '')] = c.value
	const derived = runScript(cat.VIS_ITINERIS_DERIVE_SCRIPT, { values, pieces: {} })
	assert.equal(derived.values['strength-mod'], 3)
	assert.equal(derived.values['constitution-mod'], 2)
	// 🚧 RF fix 8: Vis Itineris's own attributes carry the six, wherever it is played — never the genre.
	const vi = getRuleset(cat.VIS_ITINERIS_RULESET_ID)! as any
	for (const a of ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'])
		assert.ok(vi.attributes.some((e: any) => e.slot === `core:slot/itineris-${a}@1`), a)
})

test('the sheet: no name from the model is asked again — never "the Stranger" (walk 2026-10-17)', () => {
	const plan = { addressee: 'user:7', justPlay: true, isOwner: false, currentName: null }
	const out = runScript(cat.DUNGEON_CRAWLER_SHEET_SCRIPT, { session: session(), plan, json: { name: '', class: 'Rogue', backstory: 'Quiet.' } })
	assert.equal(out.seatName, null)
	assert.equal(out.seatChanges, null)
	assert.equal(out.kit, null)
	assert.equal(out.world, null)
	assert.equal(out.text, null)
	assert.equal(out.genesisBrief, null)
	assert.equal(out.next, true)
	assert.match(out.nextText, /name/)
	assert.equal(out.nextBlocks[0].referent, cat.DUNGEON_CRAWLER_QUESTIONS.name)
	assert.equal(out.nextBlocks[0].addressee, 'user:7')
	assert.doesNotMatch(JSON.stringify(out), /Stranger/)
	// The prompt asks for the name always; the sheet's grammar no longer asks for health.
	assert.ok(!('maxHp' in cat.DUNGEON_CRAWLER_SHEET_SCHEMA.properties))
	// A sheet that came back named is filed as before.
	const named = runScript(cat.DUNGEON_CRAWLER_SHEET_SCRIPT, { session: session(), plan, json: { name: 'Wren', class: 'Rogue', backstory: '' } })
	assert.equal(named.seatName, 'Wren')
	assert.equal(named.next, null)
})

test('the sheet: abilities, inventory and stat-mode are no longer kept at all (RF fix 8)', () => {
	const kept = hostStateFor(g).map((d) => d.slot)
	for (const id of cat.DUNGEON_CRAWLER_RETIRED_SLOT_IDS) assert.ok(!kept.includes(id), id)
})

test('genesis: the world filed, a secret goal kept out of the journal', () => {
	// The sheet step's output: the bookkeeping it changed, and the goal mode genesis files under.
	const sheet = { world: { shape: 'dungeon', building: 1, heroes: { 'user:1': { name: 'Vex' } } }, goalMode: 'secret' }
	const json = {
		goal: 'Break the drowned king’s seal.',
		rooms: [{ id: 'gate', name: 'The Gate', description: 'Wet stone.', exits: ['The Hall'] }, { name: '' }],
		npcs: [{ name: 'Moss', description: 'A wary ferryman.' }],
		leads: ['A bell rings below.'],
		notes: 'The king is not dead.',
	}
	const out = runScript(cat.DUNGEON_CRAWLER_GENESIS_SCRIPT, {
		session: session({}, [seat(5, 1, null), seat(6, 7, 'Bo'), seat(8, 9, null)]), sheet, json,
	})
	const world = out.world
	// Where the party starts: the owner's seat (named in this run or not) and every made character, in the first place —
	// on the seats, never a copy in the bookkeeping (AUDIT A9).
	assert.equal(world.here, undefined)
	assert.equal(world.building, undefined)
	assert.deepEqual(out.placements, [
		{ owner: 'player-seat:5', slot: 'core:slot/location@1', value: 'The Gate' },
		{ owner: 'player-seat:6', slot: 'core:slot/location@1', value: 'The Gate' },
	])
	// The world is the session's own lorebook now: one place (the nameless one dropped), one person.
	assert.equal(world.rooms, undefined)
	assert.deepEqual(out.places.map((p: any) => p.name), ['The Gate'])
	assert.deepEqual(out.people, [{ name: 'Moss', content: 'A wary ferryman.' }])
	assert.equal(world.built, true)
	assert.equal(world.heroes['user:1'].name, 'Vex')
	// The journal says what a secret goal is, never the bare word (round 2).
	assert.equal(out.journal.goal, cat.DUNGEON_CRAWLER_SECRET_GOAL_LINE)
	assert.match(out.notes, /Secret goal: Break/)
	// A shared goal leads the notes too.
	const shared = runScript(cat.DUNGEON_CRAWLER_GENESIS_SCRIPT, {
		session: session(), sheet: { world: { shape: 'dungeon' }, goalMode: 'shared' }, json,
	})
	assert.equal(shared.journal.goal, 'Break the drowned king’s seal.')
	assert.match(shared.notes, /^Goal: Break/)
	assert.match(out.openingBrief, /The Gate/)
})

test("crib and edits: the Planner reads its crib; an asked-for edit lands on that player's seat", () => {
	const world = { shape: 'dungeon', heroes: { 'user:7': { name: 'Bo' } } }
	const annex = { [K.progress]: world, [K.planningNotes]: 'The bridge is rotten.' }
	const seats = [seat(3, 1, 'Ann'), seat(4, 7, 'Bo')]
	// Whose lane: core's register on the settings document (`laneWho`).
	const crib = runScript(cat.DUNGEON_CRAWLER_CRIB_SCRIPT, {
		session: session(annex, seats), lane: 'parley:2',
		places: { entries: [{ id: 1, name: 'The Gate' }] }, people: { entries: [{ id: 2, name: 'Moss' }] },
	})
	assert.match(crib.text, /player of Bo/)
	assert.match(crib.text, /The bridge is rotten/)
	assert.match(crib.text, /Places: The Gate\./)
	assert.match(crib.text, /People: Moss\./)
	// What this player may change (`{{canChange}}`): a guest their own character; the standing order at a table of more than one.
	assert.match(crib.canChange, /only their own character, Bo/)
	assert.match(crib.canChange, /standing order/)
	assert.equal(crib.editsDue, undefined, 'no keyword gate (AUDIT A23)')
	const host = runScript(cat.DUNGEON_CRAWLER_CRIB_SCRIPT, { session: session(annex, seats), lane: 'parley' })
	assert.match(host.canChange, /session's host/)
	const alone = runScript(cat.DUNGEON_CRAWLER_CRIB_SCRIPT, { session: session(annex, [seat(3, 1, 'Ann')], []), lane: 'parley' })
	assert.match(alone.canChange, /no standing order/)
	const edits = runScript(cat.DUNGEON_CRAWLER_EDITS_SCRIPT, {
		session: session(annex, seats), lane: 'parley:2', json: { standingOrder: 'flee', asks: [], deltas: [], rooms: [], gear: ['Lantern'] },
	})
	// The standing order on their seat; gear is pieces of the rules, changed in play (2026-10-16).
	assert.deepEqual(edits.changes, [{ owner: 'player-seat:4', slot: 'core:slot/standing-order@1', value: 'flee' }])
	assert.match(edits.said, /Bo will get out of danger/)
	const none = runScript(cat.DUNGEON_CRAWLER_EDITS_SCRIPT, {
		session: session(annex, seats), lane: 'parley:2', json: { standingOrder: '', asks: [], deltas: [], rooms: [] },
	})
	assert.deepEqual(none, { changes: null, notes: null, notesRevealed: null, deltas: null, owners: ['session:7'], said: null })
	// Solo: no standing order to set (§14).
	const solo = runScript(cat.DUNGEON_CRAWLER_EDITS_SCRIPT, {
		session: session(annex, [seat(3, 1, 'Ann')], []), lane: 'parley', json: { standingOrder: 'flee', asks: [], deltas: [], rooms: [] },
	})
	assert.equal(solo.changes, null)
})

test('edits: asks go to the notes under Asks; a guest changes only their own seat; the host adds a way out (PLAN-sheet-widget-redesign §13)', () => {
	const annex = { [K.planningNotes]: 'The bridge is rotten.', [K.planningNotesRevealed]: 'The bridge is rotten.' }
	const seats = [seat(3, 1, 'Ann'), seat(4, 7, 'Bo')]
	const d = (x: Record<string, unknown>) => ({ owner: '', op: 'add', slot: '', repertoire: '', piece: '', value: '', check: '', against: 0, reason: '', ...x })
	const guest = runScript(cat.DUNGEON_CRAWLER_EDITS_SCRIPT, {
		session: session(annex, seats), lane: 'parley:2',
		json: {
			standingOrder: '', asks: ['Introduce an alley'],
			deltas: [d({ owner: 'Bo', op: 'add', repertoire: 'gear', piece: 'Lantern', reason: 'bought one' }), d({ owner: 'player-seat:3', op: 'spend', slot: 'hp', value: '2', reason: 'a hex' })],
			rooms: [{ id: 'gate', name: 'The Gate', description: '', exits: [{ to: 'The Alley', way: 'passage', state: 'open', lockDc: 0, trap: '', trapDc: 0, minutes: 0 }] }],
		},
		places: { entries: [{ id: 50, name: 'The Gate', content: 'Wet stone.', links: [] }] },
	})
	// The ask, tagged by who asked, under one Asks heading — the revealed copy kept in step (A24).
	assert.equal(guest.notes, 'The bridge is rotten.\n\nAsks:\n- [Bo] Introduce an alley')
	assert.equal(guest.notesRevealed, guest.notes)
	// A seat named by its character's name is that seat; another's seat is refused, and a guest's rooms are not read.
	assert.deepEqual(guest.deltas, [{ owner: 'player-seat:4', op: 'add', repertoire: 'gear', piece: 'Lantern', reason: 'bought one' }])
	assert.deepEqual(guest.owners, ['session:7', 'player-seat:4'])
	assert.match(guest.said, /Noted for the story: Introduce an alley/)
	// 🚧 In the table's words (P1-2): whose it is, by name — never the delta's reason pasted in.
	assert.match(guest.said, /Not changed: Ann is not yours to change — only Bo is\./)
	// An ask already noted (a swipe of the reply) is not noted twice.
	const again = runScript(cat.DUNGEON_CRAWLER_EDITS_SCRIPT, {
		session: session({ [K.planningNotes]: guest.notes }, seats), lane: 'parley:2', json: { standingOrder: '', asks: ['Introduce an alley'], deltas: [], rooms: [] },
	})
	assert.equal(again.notes, null)
	// The host: a way out of a place the book holds, as an exits piece on that place (the one exit model, AUDIT A12).
	const host = runScript(cat.DUNGEON_CRAWLER_EDITS_SCRIPT, {
		session: session({}, seats), lane: 'parley',
		json: { standingOrder: '', asks: [], deltas: [], rooms: [{ id: 'gate', name: 'The Gate', description: '', exits: [{ to: 'The Alley', way: 'passage', state: 'open', lockDc: 0, trap: '', trapDc: 0, minutes: 0 }] }] },
		places: { entries: [{ id: 50, name: 'The Gate', content: 'Wet stone.', links: [] }] },
	})
	assert.deepEqual(host.deltas, [
		{ owner: 'location:50', op: 'add', repertoire: 'exits', piece: { kind: 'inline', name: 'Passage to The Alley', description: 'Passage to The Alley', towards: 'The Alley', way: 'passage', state: 'open' }, reason: 'Passage to The Alley' },
	])
	assert.deepEqual(host.owners, ['session:7', 'location:50'])
	// What the handler made of it: a table line on the lane.
	const told = runScript(cat.DUNGEON_CRAWLER_EDITS_SCRIPT, {
		applied: { outcomes: [{ text: 'Bo: Lantern added' }], rejected: [{ reason: 'no such piece' }] },
	})
	assert.equal(told.line, 'Bo: Lantern added\nNot changed: No such piece.')
	assert.deepEqual(runScript(cat.DUNGEON_CRAWLER_EDITS_SCRIPT, { applied: {} }), { line: null })
})

test('read-path: a part of a document, or null', () => {
	assert.deepEqual(runScript(cat.READ_PATH_SCRIPT, { from: { a: { b: [1] } }, path: 'a.b' }), [1])
	assert.equal(runScript(cat.READ_PATH_SCRIPT, { from: { a: 1 }, path: 'a.b' }), null)
})

test('PresetBuilder.scripts: chains by seed key, at a point the node declares or on its scripts slot', () => {
	const build = (point: string) =>
		compile(
			spec('test:spec/chains', { version: '1.0.0' })
				.inlet('input', C.userMessage.v1())
				.task('strategy', ($: any) => C.turnScripted.v1({ candidates: $.input.main, messages: $.input.main }))
				.task('step', ($: any) => C.runScript.v1({ input: $.input.text }))
				.preset('p', { label: 'P', default: true }, (p: any) =>
					p.scripts('strategy', { [point]: [{ seedKey: 'core:script/x' }] }).scripts('step', [{ seedKey: 'core:script/y' }]),
				)
				.build(),
		)
	const errors = (doc: any) => validate(doc).filter((f: any) => f.severity === 'error' && f.law === '12 §3a')
	assert.deepEqual(errors(build('select')), [])
	assert.match(errors(build('elsewhere'))[0]!.message, /declares the points select/)
})
