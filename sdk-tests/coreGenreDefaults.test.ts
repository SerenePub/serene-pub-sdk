/**
 * 🚧 **Core's genres on registrations** (PLAN-layering D4, lane 3,
 * 2026-10-20): each core genre's defaults are registrations, every preset is
 * changes on them, and Story's and Chat's background work runs as routines.
 *
 *  · **Parity.** What a session of each genre sees is UNCHANGED: under every
 *    preset, the effective registrations' events answer with the spec the
 *    inlet locks and preset bindings answered with before (event → spec),
 *    and the actions are the ones the companion rule offered (every core
 *    preset row carried no include list, so the rule decided).
 *  · **Presets as changes** — Minimal drops the three routines, Rule Based
 *    locks the rigour, Agentic sets the tools — and the **calls per turn**
 *    they imply are the numbers the start cards print.
 *  · **One door.** Every genre's defaults and every preset's effective set
 *    pass `registrationFindings` with no finding: fit, cadence options,
 *    values on nodes the pipelines have.
 *  · **The shared vocabulary** (A19) and the retired task machinery.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
	afterEachTurn,
	effectiveRegistrations,
	genreDefaultsOf,
	getDefinition,
	presetChangesOf,
	register,
	registrationFindings,
	settingValueOf,
	COMMON_VOCABULARY_ID,
	type EffectiveRegistration,
	type GenreDecl,
	type PresetDecl,
	type RegistrationDecl,
} from '@serene-pub/sdk'
import * as SDK from '@serene-pub/sdk'
import {
	CORE_SCRIPTS,
	CORE_SPECS,
	coreGenres,
	corePresets,
	corePresetSeeds,
	rulesets,
	storyRegistrations,
	storyReckoningSpec,
	dungeonCrawlerRegistrations,
} from '@serene-pub/core-catalog'

const TURN_ORDER_NINE = [
	'cast-changed',
	'member-added',
	'member-removed',
	'message-completed',
	'message-deleted',
	'message-edited',
	'message-hidden',
	'session-branched',
	'session-updated',
]
const PLANNER_FOUR = ['message-completed', 'message-deleted', 'message-hidden', 'session-branched']
const ev = (slug: string) => `core:event/${slug}@1`

/**
 * What every preset of each genre resolved to before registrations (lane 3
 * measured it off the 10-19 catalogue: preset bindings + inlet locks + the
 * default save; actions by the companion rule).
 */
const TODAY: Record<string, { events: Record<string, string>; actions: string[] }> = {
	'core:genre/story': {
		events: {
			...Object.fromEntries(TURN_ORDER_NINE.map((e) => [ev(e), 'core:spec/story-turn-order'])),
			[ev('session-created')]: 'core:spec/story-create',
			[ev('message-respond')]: 'core:spec/story-respond',
			[ev('form-addressed')]: 'core:spec/story-answer-form',
			[ev('message-offered')]: 'core:spec/save-message',
		},
		actions: [
			'core:spec/story-advance-time#advance-time',
			'core:spec/story-answer#answer',
			'core:spec/story-ask#ask',
			'core:spec/story-generate-image#generate-image',
			'core:spec/story-illustrate-scene#illustrate-scene',
			'core:spec/story-look#look',
			'core:spec/story-narrate#narrate',
			'core:spec/story-rest#rest',
			'core:spec/story-side-character#narrate-character',
		],
	},
	'core:genre/chat': {
		events: {
			...Object.fromEntries(TURN_ORDER_NINE.map((e) => [ev(e), 'core:spec/assistant-turn-order'])),
			[ev('session-created')]: 'core:spec/assistant-create',
			[ev('message-respond')]: 'core:spec/assistant-respond',
			[ev('form-addressed')]: 'core:spec/assistant-answer-form',
			[ev('message-offered')]: 'core:spec/save-message',
		},
		actions: [],
	},
	'core:genre/guide': {
		events: {
			...Object.fromEntries(TURN_ORDER_NINE.map((e) => [ev(e), 'core:spec/guide-turn-order'])),
			[ev('session-created')]: 'core:spec/guide-create',
			[ev('message-respond')]: 'core:spec/guide-respond',
			[ev('form-addressed')]: 'core:spec/guide-answer-form',
			[ev('message-offered')]: 'core:spec/save-message',
		},
		actions: [],
	},
	/**
	 * 🚧 The Lair, rewritten 2026-10-21 (PLAN-lair-build D7): not the 10-19
	 * parity any more — its reply is `lair-reply`, a seated guest is welcomed
	 * on `member-added`, Time passes left and Roll came (the GM's own, and a
	 * roll form's answer). What every preset sees is its defaults minus what
	 * *Words only* drops (below).
	 */
	'core:genre/lair': {
		events: {
			...Object.fromEntries(PLANNER_FOUR.map((e) => [ev(e), 'core:spec/lair-turn-order'])),
			[ev('session-created')]: 'core:spec/lair-create',
			[ev('message-respond')]: 'core:spec/lair-reply',
			[ev('member-added')]: 'core:spec/lair-welcome',
			[ev('form-addressed')]: 'core:spec/lair-answer-form',
			[ev('message-offered')]: 'core:spec/save-message',
		},
		actions: [
			'core:spec/lair-build-room#build-room',
			'core:spec/lair-file-room#file',
			'core:spec/lair-nudge#nudge',
			'core:spec/lair-reveal#reveal',
			'core:spec/lair-roll#roll',
			'core:spec/lair-roll-answer#answer',
			'core:spec/lair-room-answer#room',
			'core:spec/lair-trap#trap',
			'core:spec/lair-whisper#whisper',
		],
	},
	'core:genre/dungeon-crawler': {
		events: {
			...Object.fromEntries(
				[...PLANNER_FOUR, 'member-removed', 'annex-changed'].map((e) => [ev(e), 'core:spec/dungeon-crawler-turn-order']),
			),
			[ev('session-created')]: 'core:spec/dungeon-crawler-create',
			[ev('message-respond')]: 'core:spec/dungeon-crawler-respond',
			[ev('member-added')]: 'core:spec/dungeon-crawler-welcome',
			[ev('form-addressed')]: 'core:spec/dungeon-crawler-answer-form',
			[ev('message-offered')]: 'core:spec/save-message',
		},
		actions: [
			'core:spec/dungeon-crawler-goal#goal',
			'core:spec/dungeon-crawler-interview#answer',
			'core:spec/dungeon-crawler-rest#rest',
			'core:spec/dungeon-crawler-reveal#reveal',
		],
	},
}

const genres = () => coreGenres() as readonly GenreDecl[]
const defaultsOf = (g: GenreDecl): readonly RegistrationDecl[] => genreDefaultsOf(g)!.registrations
const effective = (p: PresetDecl): EffectiveRegistration[] => {
	const g = genres().find((x) => x.id === p.genre)!
	return effectiveRegistrations(defaultsOf(g), presetChangesOf(p, defaultsOf(g)))
}
const eventsOf = (rs: readonly RegistrationDecl[]) =>
	Object.fromEntries(rs.flatMap((r) => (r.trigger.family === 'event' ? [[r.trigger.event, r.pipeline]] : [])))
/** A summary's action (R50): `#summarize-world`, `#summarize-scene`, … — no listing offers it (`form` venue). */
const SUMMARIZE = /#summarize-(world|character|scene|history)$/
/** The actions a session SEES — not the summaries'. */
const actionsOf = (rs: readonly RegistrationDecl[]) =>
	rs.flatMap((r) => (r.trigger.family === 'action' && !SUMMARIZE.test(r.trigger.action) ? [r.trigger.action] : [])).sort()
/** The summaries a genre registers (R50), by pipeline. */
const summariesOf = (rs: readonly RegistrationDecl[]) =>
	rs.flatMap((r) => (r.trigger.family === 'action' && SUMMARIZE.test(r.trigger.action) ? [r.pipeline] : [])).sort()
const routinesOf = (rs: readonly EffectiveRegistration[]) =>
	Object.fromEntries(rs.flatMap((r) => (r.trigger.family === 'routine' ? [[r.key, r.mode ?? 'full']] : [])))

/**
 * The model calls one turn costs, as the start card counts them: the reply
 * (one), plus every routine that runs once a turn or a round and is not
 * Off. A sweep every N turns and a routine on an event are not per-turn
 * costs; the card says "plus a summary every few turns" in words.
 */
const PER_TURN = new Set(['core:cadence/after-each-turn@1', 'core:cadence/after-each-round@1'])
const callsPerTurn = (rs: readonly EffectiveRegistration[]) =>
	(rs.some((r) => r.trigger.family === 'event' && r.trigger.event === ev('message-respond')) ? 1 : 0) +
	rs.filter((r) => r.trigger.family === 'routine' && PER_TURN.has(r.trigger.cadence.id) && r.mode !== 'off').length

const pipelines = () => {
	const docs = new Map(CORE_SPECS.map((s) => [s.slug, s.build()]))
	return (id: string) => docs.get(id)
}

describe("core's genres on registrations (lane 3)", () => {
	test('every genre states its defaults, and every preset is changes on them', () => {
		assert.deepEqual(genres().map((g) => g.id).sort(), Object.keys(TODAY).sort())
		for (const g of genres()) assert.ok(defaultsOf(g).length > 0, g.id)
		for (const p of corePresets()) {
			// A preset never lists the genre's pipelines again: no bindings, no include list.
			assert.deepEqual(p.bindings, {}, p.slug)
			assert.equal(p.actions, undefined, p.slug)
		}
		// One default preset per genre, marked by the preset itself (R22, A18).
		for (const g of genres())
			assert.equal(corePresets().filter((p) => p.genre === g.id && p.default).length, 1, g.id)
	})

	test("parity: under every preset, the events and actions a session sees are today's", () => {
		/** 🚧 *Words only* (the Lair, D7): no rolls and no rooms — their actions dropped. */
		const DROPPED: Record<string, readonly string[]> = {
			'lair-words-only': [
				'core:spec/lair-build-room#build-room',
				'core:spec/lair-file-room#file',
				'core:spec/lair-roll#roll',
				'core:spec/lair-roll-answer#answer',
				'core:spec/lair-room-answer#room',
			],
		}
		for (const p of corePresets()) {
			const rs = effective(p)
			assert.deepEqual(eventsOf(rs), TODAY[p.genre]!.events, `${p.slug}: events`)
			const dropped = DROPPED[p.slug] ?? []
			assert.deepEqual(actionsOf(rs), TODAY[p.genre]!.actions.filter((a) => !dropped.includes(a)), `${p.slug}: actions`)
		}
		// The seed rows a host on bindings still reads say the same (⏳ to lane 5a).
		for (const seed of corePresetSeeds())
			assert.deepEqual(
				Object.fromEntries(Object.entries(seed.bindings).map(([e, b]) => [e, b.spec])),
				TODAY[seed.genreId]!.events,
				seed.seedKey,
			)
	})

	test('the summaries (R50): every genre registers world, character, history and its own summarize-scene, on the summarize action', () => {
		const shared = ['core:spec/summarize-character', 'core:spec/summarize-history', 'core:spec/summarize-world']
		const scene: Record<string, string> = {
			'core:genre/story': 'core:spec/story-summarize-scene',
			'core:genre/chat': 'core:spec/summarize-scene',
			'core:genre/guide': 'core:spec/guide-summarize-scene',
			'core:genre/lair': 'core:spec/lair-summarize-scene',
			'core:genre/dungeon-crawler': 'core:spec/summarize-scene',
		}
		for (const p of corePresets())
			assert.deepEqual(summariesOf(effective(p)), [...shared, scene[p.genre]!].sort(), `${p.slug}: summaries`)
	})

	test('the routines each preset runs, at the mode it runs them', () => {
		const by = Object.fromEntries(corePresets().map((p) => [p.slug, routinesOf(effective(p))]))
		// 🚧 GM 2026-10-23 (G1 ★5, S3): Story's clock after the rules' Rest — no model call, so Minimal keeps it.
		const afterRest = { 'on-event→story-after-rest': 'full' }
		const living = {
			'after-each-round→story-reckoning': 'full',
			'every-n-turns→story-sweep': 'full',
			'on-event→story-illustrate-new-scene': 'off',
			...afterRest,
		}
		assert.deepEqual(by['story-minimal'], afterRest)
		assert.deepEqual(by['story-living'], living)
		assert.deepEqual(by['story-rule-based'], living)
		assert.deepEqual(by['chat-basic'], { 'every-n-turns→assistant-memory': 'off' })
		assert.deepEqual(by['chat-agentic'], { 'every-n-turns→assistant-memory': 'off' })
		assert.deepEqual(by['guide-default'], {})
		// 🚧 lane G3 (2026-10-23, S3): the crawl's own effects after the rules' Rest.
		assert.deepEqual(by['dungeon-crawler-default'], { 'on-event→dungeon-crawler-after-rest': 'full' })
		// 🚧 The Lair's (D7, 2026-10-21): the keeper after each round at Review, the
		// Castellan's notes, filing the current room Off — the keeper Off on Words only.
		const lair = {
			'after-each-round→lair-keeper': 'review',
			'on-event→lair-scratchpad': 'full',
			'on-event→lair-file-current-room': 'off',
		}
		assert.deepEqual(by['lair-rules'], lair)
		assert.deepEqual(by['lair-rules-and-dice'], lair)
		assert.deepEqual(by['lair-words-only'], { 'after-each-round→lair-keeper': 'off', 'on-event→lair-scratchpad': 'full' })
	})

	test("🚧 S3 (GM, G1 ★5): Story's After a rest answers the rules' Rest — the story clock moves by it", () => {
		const r = storyRegistrations()
		assert.equal(r.afterRest.pipeline, 'core:spec/story-after-rest')
		assert.equal(r.afterRest.trigger.family, 'routine')
		assert.equal((r.afterRest.trigger as any).cadence.options.event, 'core:event/rest-taken@1')
		const doc = pipelines()(r.afterRest.pipeline)!
		const advance = doc.nodes.find((n: any) => n.definitionId === 'core:outlet/advance-story-clock') as any
		assert.equal(advance.config.cause, 'keeper')
		assert.equal(advance.config.onRefusal, 'skip')
		// How long: the rest the rules raised, else their longest; none without minutes (a plain function here; QuickJS in the app).
		const script = CORE_SCRIPTS.find((s: any) => s.seedKey === 'core:script/story-after-rest')!
		const run = (value: unknown) => new Function('value', script.source)(value)
		const rests = [{ id: 'long', label: 'A long rest', minutes: 480 }, { id: 'short', label: 'A short rest', minutes: 60 }]
		const cause = (rest: string) => ({ moment: 'event', payload: { values: { owner: 'character:1', rest } } })
		assert.deepEqual(run({ cause: cause('short'), ruleset: { rests } }), { by: 60, unit: 'minutes' })
		assert.deepEqual(run({ cause: cause(''), ruleset: { rests } }), { by: 480, unit: 'minutes' })
		assert.deepEqual(run({ cause: cause('nap'), ruleset: { rests } }), { by: 0, unit: 'minutes' })
		assert.deepEqual(run({ cause: cause('long'), ruleset: { rests: [{ id: 'long', label: 'Rest', minutes: 0 }] } }), { by: 0, unit: 'minutes' })
		assert.deepEqual(run({ cause: cause('long'), ruleset: {} }), { by: 0, unit: 'minutes' })
	})

	test("🚧 S3: the crawl's Rest steps aside while the rules offer one; After a rest answers theirs", () => {
		const r = dungeonCrawlerRegistrations()
		const rest = r.actions.find((x) => x.pipeline === 'core:spec/dungeon-crawler-rest')!
		// The host's fact, by the function's declaration (`unlessRulesOffer`): never two Rests.
		assert.deepEqual(rest.when, { not: { on: 'rules.invokable.core:function/rest@1', truthy: true } })
		assert.equal(r.afterRest.pipeline, 'core:spec/dungeon-crawler-after-rest')
		assert.equal(r.afterRest.trigger.family, 'routine')
		assert.equal((r.afterRest.trigger as any).cadence.options.event, 'core:event/rest-taken@1')
		assert.ok(SDK.eventById('core:event/rest-taken@1'), 'a declared core event (SDK.coreEvents.restTaken)')
		for (const a of r.actions) if (a !== rest) assert.equal(a.when, undefined, a.pipeline)
	})

	test('presets as changes: Minimal, Rule Based and Agentic state only what differs', () => {
		const r = storyRegistrations()
		const p = (slug: string) => corePresets().find((x) => x.slug === slug)!
		const minimal = p('story-minimal')
		assert.deepEqual([...(minimal.registrations?.drop ?? [])].sort(), [r.reckoning.key, r.sweep.key, r.illustrate.key].sort())
		assert.deepEqual(minimal.registrations?.change, [
			{ key: r.reply.key, values: { reading: { params: { scene: false } } } },
		])
		// R55: no `applyActionChanges` — Rest follows the reckoning, which Minimal drops.
		assert.equal(minimal.settings, undefined)
		// The reply's own setting the change sets exists on the reply (values land on a node it has).
		const reply = pipelines()(r.reply.pipeline)!
		assert.ok(reply.nodes.some((n: { key: string; definitionId: string }) => n.key === 'reading' && n.definitionId === 'core:task/reply-duties'))
		assert.equal(p('story-living').registrations, undefined)
		assert.equal(p('story-living').default, true)
		const ruleBased = p('story-rule-based')
		assert.equal(ruleBased.registrations, undefined)
		assert.deepEqual(settingValueOf(ruleBased.settings!.rigour), { value: 'scripts', lock: true, askAtStart: false })
		assert.deepEqual(p('chat-agentic').settings, { tools: ['web', 'lore', 'image', 'clock', 'calculator', 'history'] })
		assert.equal(p('chat-basic').settings, undefined)
		assert.deepEqual(genreDefaultsOf(genres().find((g) => g.id === 'core:genre/chat'))!.settings, { tools: [] })
	})

	test('the calls per turn each preset implies are the numbers its card prints', () => {
		const want: Record<string, number> = {
			'story-minimal': 1,
			'story-living': 2,
			'story-rule-based': 2,
			'chat-basic': 1,
			'chat-agentic': 1,
			'guide-default': 1,
			// 🚧 The Lair (D7): the plan, and the keeper after each round — Off on
			// Words only. ⚠ Not counted here: one character turn per AI delver who
			// speaks (each a run of the reply, fired by the turn order).
			'lair-words-only': 1,
			'lair-rules': 2,
			'lair-rules-and-dice': 2,
		}
		for (const [slug, n] of Object.entries(want)) {
			const p = corePresets().find((x) => x.slug === slug)!
			assert.equal(callsPerTurn(effective(p)), n, slug)
			// ⏳ Still stated for the card the app prints; it must agree.
			if (p.callsPerTurn !== undefined) assert.equal(p.callsPerTurn, n, `${slug}: stated`)
		}
	})

	test('one door: every genre default and every preset passes registrationFindings clean', () => {
		const pipeline = pipelines()
		for (const g of genres())
			assert.deepEqual(
				registrationFindings(defaultsOf(g), { pipeline, layer: g.id }).map((f) => f.message),
				[],
				g.id,
			)
		for (const p of corePresets())
			assert.deepEqual(registrationFindings(effective(p), { pipeline, layer: p.slug }).map((f) => f.message), [], p.slug)
	})

	test("the reckoning reads only the session, so an administrator may swap its cadence (R12, R36)", () => {
		const doc = storyReckoningSpec()
		const swapped = register(afterEachTurn(), doc)
		assert.deepEqual(
			registrationFindings([swapped], { pipeline: () => doc }).map((f) => f.message),
			[],
		)
		// A routine on the routine inlet, with its duties as its own owner-reached settings.
		assert.equal(doc.nodes[0]!.definitionId, 'core:inlet/routine')
		const duties = doc.nodes.find((n) => n.key === 'duties')!
		assert.equal(duties.definitionId, 'core:task/reckoning-duties')
		const schema = (getDefinition('core:task/reckoning-duties@1')!.slots as any).params.schema
		assert.deepEqual(Object.keys(schema), ['attributes', 'conditions', 'time', 'placesOnMove', 'timedExpiry'])
		for (const d of Object.values(schema) as any[]) assert.equal(d.reach, 'owner')
	})

	test("🚧 S3: Story's Rest steps aside while the rules offer their own (`rules.invokable`, the host's fact)", async () => {
		const { restFunction, storySession, unlessRulesOffer } = await import('@serene-pub/core-catalog')
		const rest = storyRegistrations().actions.find((r) => r.trigger.family === 'action' && r.trigger.action === 'core:spec/story-rest#rest')!
		assert.ok(rest, "Story's Rest is registered")
		// Named by the function's declaration: the path is derived, never typed.
		const leaf = storySession().rules.invokable(restFunction)
		assert.equal(leaf.path, `rules.invokable.${SDK.rulesInvokableSegment(restFunction.id)}`)
		assert.deepEqual(rest.when, { not: { on: leaf.path, truthy: true } })
		assert.deepEqual(rest.when, unlessRulesOffer(storySession(), restFunction))
		// Holds while the rules use no invokable rest; not while they do.
		assert.equal(SDK.evaluateCondition(rest.when, { rules: { invokable: {} } }), true)
		assert.equal(SDK.evaluateCondition(rest.when, {}), true)
		assert.equal(SDK.evaluateCondition(rest.when, { rules: { invokable: { [SDK.rulesInvokableSegment(restFunction.id)]: true } } }), false)
		// Only Rest: every other Story action is registered as it was, with no `when`.
		for (const r of storyRegistrations().actions) if (r !== rest) assert.equal(r.when, undefined, r.key)
		// A package's id with dots reads as one segment.
		assert.equal(SDK.rulesInvokableSegment('acme.pack:function/nap@1'), 'acme_pack:function/nap@1')
	})

	test('every pipeline a registration names is published, and none names a genre (locks → suits)', () => {
		const published = new Set(CORE_SPECS.map((s) => s.slug))
		for (const g of genres()) for (const r of defaultsOf(g)) assert.ok(published.has(r.pipeline), `${g.id}: ${r.pipeline}`)
		for (const s of CORE_SPECS) assert.equal((s.build() as any).input, undefined, s.slug)
	})
})

describe('the shared vocabulary (A19)', () => {
	test('rulesets.common is core:vocabulary/common@1, and both core rulesets play it', () => {
		assert.equal(rulesets.common.id, COMMON_VOCABULARY_ID)
		assert.deepEqual(Object.keys(rulesets.common.world), ['location', 'time', 'weather'])
		assert.deepEqual(Object.keys(rulesets.common.cast), [
			'health',
			'mood',
			'level',
			'class',
			'currency',
			'things',
			'conditions',
			'relationships',
		])
		assert.deepEqual(Object.keys(rulesets.common.location), ['waysOut', 'notes'])
		assert.equal(rulesets.common.cast.health.id, 'core:slot/hp@1')
		assert.equal(rulesets.common.cast.currency.id, 'core:slot/currency@1')
		// 🚧 All three since 2026-10-22 (M3): Wherewithal, the diceless one, plays it too.
		for (const r of [rulesets.core.freeform, rulesets.core.visItineris, rulesets.core.wherewithal]) {
			assert.equal(SDK.getRuleset(r.id)?.plays?.[0], COMMON_VOCABULARY_ID, r.id)
			assert.equal(r.cast.things, rulesets.common.cast.things, r.id)
		}
		assert.equal(rulesets.core.visItineris.cast.spellPoints.id, 'core:slot/itineris-spell-points@1')
		assert.equal(rulesets.core.wherewithal.cast.nerve.id, 'core:slot/wherewithal-nerve@1')
	})

	test("🚧 the genres' rulesets (M3, 2026-10-22): Story recommends Wherewithal; no genre names a ruleset template", () => {
		const story = genres().find((g) => g.id === 'core:genre/story')!
		assert.deepEqual((story.rulesets as { recommended: readonly string[] }).recommended, [
			'core:ruleset/freeform@1',
			'core:ruleset/vis-itineris@1',
			'core:ruleset/wherewithal@1',
		])
		for (const g of genres()) {
			const rs = (g.rulesets ?? {}) as { only?: string[]; recommended?: string[] }
			for (const id of [...(rs.only ?? []), ...(rs.recommended ?? [])]) {
				assert.equal(SDK.isRulesetTemplateId(id), false, `${g.id} names the template ${id}`)
				assert.ok(SDK.getRuleset(id), `${g.id} names ${id}, which is registered`)
			}
			assert.deepEqual(SDK.genreRulesetFindings(g.id, g), [], g.id)
		}
		// Wherewithal decides by its rules, so every rigour Story offers is played.
		const w = SDK.getRuleset('core:ruleset/wherewithal@1')!
		assert.ok(Object.values(SDK.normaliseRuleset(w).conventions.methods).some((m) => m.kind !== 'none'))
	})

	test('the task machinery is retired', () => {
		for (const name of ['resolveTasks', 'taskDue', 'sweepDue', 'TASK_GROUPS', 'normaliseTaskSettings'])
			assert.equal((SDK as Record<string, unknown>)[name], undefined, name)
		assert.equal(getDefinition('core:task/resolve-tasks@1'), undefined)
		for (const g of genres()) assert.equal((g as { tasks?: unknown }).tasks, undefined, g.id)
	})
})
