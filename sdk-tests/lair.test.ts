/**
 * The **Lair** genre (rewritten 2026-10-21, PROPOSAL-lair-rewrite R1–R13,
 * PLAN-lair-build D3–D10) — the reverse dungeon crawl: the session's owner is
 * the dungeon's game master, an AI party (and any seated guests) delve into it.
 *
 * Four claims, each a way the genre could be wrong while still compiling:
 *
 *  · the **declaration** says what the rewrite rules — unopinionated (the
 *    shared vocabulary and the GM's two tools), a Castellan and an Oracle, a
 *    Sanctum only the owner sees, guests as participants;
 *  · every pipeline **builds and validates** and hashes to a recorded pin;
 *    the genre's defaults, routines and three presets pass the one door;
 *  · the turn **behaves** — executed against the fixture host: the plan, the
 *    checks by the table's mode (asked as roll forms, rolled at once, or told
 *    in words), the plan row and what it hands on, a character turn, the
 *    knock, Narrate and the Sanctum;
 *  · the **scripts** do what their docs say, run as plain functions (the app
 *    runs them in QuickJS), and the blocks they write pass the SDK's checks.
 *
 * ⚠ **Imported from `../core-catalog/src`, not from `@serene-pub/core-catalog`**:
 * the package's `main` is a build behind the source.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
	afterEachTurn,
	canonicalHash,
	channelAudience,
	channelDecls,
	checkMessageBlocks,
	drawnWidgetIds,
	effectiveRegistrations,
	envoyFindings,
	evaluateEnabledWhen,
	formFireOf,
	genre,
	genreDefaultsOf,
	getDefinition,
	jsonSchemaOf,
	LOREBOOK_REQUIRED_RETIRED,
	lorebookShapeFindings,
	ok,
	presetChangesOf,
	register,
	registrationFindings,
	resolveTurnControls,
	rollBlockBands,
	rulesetSections,
	run,
	sameName,
	sessionEvents,
	settingValueOf,
	TURN_CONTROLS,
	validate,
	widgetOfInstance,
	worldBlockFunctions,
	hostStateFor,
} from '@serene-pub/sdk'
import type { Bindings, ConfigWorld, GenreDecl, SpecDocument } from '@serene-pub/sdk'

import * as cat from '../core-catalog/src/index.js'
import { CORE_PROMPTS, LAIR_PROMPT_KEYS } from '../core-catalog/src/seed/prompts.js'
import { lairGenre, LAIR_CASTELLAN_REMINDER, LAIR_GENRE_ID, POST_HISTORY_TOKEN_TRIGGER } from '../core-catalog/src/registry/genres.js'
import { LAIR_LAYOUT, LAIR_PARTY_LAYOUT } from '../core-catalog/src/registry/layouts.js'
import { freeformRuleset, rulesets, visItinerisRuleset, wherewithalRuleset } from '../core-catalog/src/registry/rulesets.js'
import { locationEntryType } from '../core-catalog/src/registry/entries.js'
import { itemValuesOf } from '../core-catalog/src/shared/ui/conversation/itemValues.js'
import { bindings, world } from './helpers.js'

const {
	CORE_SPECS,
	CORE_SCRIPTS,
	CORE_WIDGETS,
	corePresets,
	corePresetSeeds,
	coreGenres,
	lairRegistrations,
	LAIR_REPLY_SPEC_ID,
	LAIR_BUILD_ROOM_SPEC_ID,
	LAIR_FILE_ROOM_SPEC_ID,
	LAIR_ROOM_ANSWER_SPEC_ID,
	LAIR_ROLL_SPEC_ID,
	LAIR_ROLL_ANSWER_SPEC_ID,
	LAIR_ROLL_ANSWER_ACTION,
	LAIR_KEEPER_SPEC_ID,
	LAIR_SCRATCHPAD_SPEC_ID,
	STORY_RECKONING_SPEC_ID,
	LAIR_FILE_CURRENT_ROOM_SPEC_ID,
	LAIR_WELCOME_SPEC_ID,
	LAIR_PLAN_SHAPE,
	LAIR_PLAN_SCHEMA,
	LAIR_ROOM_DRAFT_SCHEMA,
	lairRulesRow,
} = cat

/* ── fixtures ──────────────────────────────────────────────────────────── */

const doc = (slug: string): SpecDocument => CORE_SPECS.find((s) => s.slug === slug)!.build()
const replyDoc = () => doc(LAIR_REPLY_SPEC_ID)

/** The author preset, in the shape the executor reads it from — and every key it names is a node. */
function authorDefaultsOf(d: SpecDocument): ConfigWorld['authorDefaults'] {
	const out: Record<string, Record<string, unknown>> = {}
	const keys = new Set(d.nodes.map((n) => n.key))
	for (const preset of d.presets ?? [])
		for (const v of preset.values ?? []) {
			assert.ok(keys.has(v.nodeKey), `preset names '${v.nodeKey}', which is not a node`)
			out[v.nodeKey] ??= {}
			out[v.nodeKey]![v.slot] = v.value
		}
	return out as ConfigWorld['authorDefaults']
}
const presetValue = (d: SpecDocument, key: string, slot = 'params') =>
	(d.presets ?? []).find((p) => p.default)?.values.find((v) => v.nodeKey === key && v.slot === slot)?.value

/** The value at a dotted path. */
const at = (value: unknown, path?: string): unknown => {
	if (!path) return value
	let cur: any = value
	for (const seg of path.split('.')) {
		if (cur == null) return undefined
		cur = cur[seg]
	}
	return cur
}

const band = (key: string) => ({ sourceKey: key, items: [] as string[], weight: 0.2, minInclude: 0, priority: 'normal' })

/** The rooms the listing holds (B13) — the party are in the first. */
const ROOMS = [
	{ id: 1, name: 'The Old Well', content: 'Exits: down → The Stair' },
	{ id: 2, name: 'The Stair', content: 'Exits: up → The Old Well' },
]

/** Three AI delvers, and Ann — a guest's seat, her persona. */
const CAST = {
	sessionCharacters: [
		{ character: { id: 11, name: 'Verity' } },
		{ character: { id: 12, name: 'Brask' } },
		{ character: { id: 13, name: 'Oln' } },
	],
	sessionPersonas: [{ seatId: 3, seatUserId: 7, persona: { id: 21, name: 'Ann', userId: 7 } }],
}

const FIELDS = {
	tone: 'grim',
	roomsLayer: true,
	sanctumSteers: true,
	askBeforeRolling: true,
	autoRoll: false,
	showDice: true,
}
const sessionDoc = (fields: Record<string, unknown> = {}) => ({
	sessionId: 1,
	ownerUserId: 1,
	fields: { ...FIELDS, ...fields },
	cast: CAST,
})
/**
 * The inlet's `ruleset` as the host carries it (S4, 2026-10-23): the id, the
 * rigour, the settings — and the row read off the ruleset's sections
 * (`lairRulesRow`, what the app's `sessionRulesetInput` spreads beside them).
 * No table is baked into a script: the row is all a script knows.
 */
const VIS = (rigour = 'mechanics') => ({ id: visItinerisRuleset.id, rigour, settings: {}, ...lairRulesRow(visItinerisRuleset) })
const FREEFORM = { id: freeformRuleset.id, rigour: 'mechanics', settings: {}, ...lairRulesRow(freeformRuleset) }

/** A seeded script, by its seed key, run as a plain function (the app runs it in QuickJS). */
const scriptOf = (seedKey: string) => CORE_SCRIPTS.find((s) => s.seedKey === seedKey)!
const runScript = (seedKey: string, value: unknown) =>
	// eslint-disable-next-line no-new-func
	new Function('value', scriptOf(seedKey).source)(JSON.parse(JSON.stringify(value ?? null)))

/**
 * `core:task/run-script@1`, as the host runs it — the seeded row the node's
 * preset names. A binding is not told its node, so the stand-in knows each
 * script by what its step hands it (each step's input names are its own).
 */
const scriptFor = (input: Record<string, unknown>): string => {
	const has = (k: string) => k in input
	if (has('from') && has('path')) return 'core:script/read-path'
	if (has('outcomes')) return 'core:script/lair-dice'
	if (has('plan') && has('table')) return 'core:script/lair-turn'
	if (has('draft')) return 'core:script/lair-room'
	if (has('recipients')) return 'core:script/lair-call-roll'
	if (has('referent')) return 'core:script/lair-roll'
	if (has('payload')) return 'core:script/lair-welcome'
	if (has('session') && has('ruleset')) return 'core:script/lair-table'
	throw new Error(`no Lair script takes ${Object.keys(input).join(', ')}`)
}

/** What the ruleset handler answers: every check rolled a natural 12 for a 15. */
const ROLLED = (deltas: any[]) => ({
	outcomes: deltas.map((d) => ({
		owner: d.owner,
		kind: 'check',
		text: `${d.owner} — ${d.check}`,
		check: { selector: d.check, natural: 12, total: 15, against: d.against, band: 'success', five: 'success', label: 'Success' },
	})),
	explain: deltas.map((d) => ({ target: `${d.owner}.${d.check}`, total: 15, terms: [], text: `d20 12 + 3 = 15 vs ${d.against}` })),
})

/** What the Castellan's annex view holds (R13): its scratchpad. */
const SCRATCHPAD = 'The Sunken Vault waits two rooms north.'

/**
 * The stand-ins this genre needs on top of `helpers.ts`. Each answers the
 * ports its definition declares and nothing else, so what a test reads off
 * the receipt is what the graph actually carried.
 */
const lairBindings = (json: unknown, over: Bindings = {}): Bindings =>
	bindings({
		'core:inlet/routine@1': async (i: any) => ok(i),
		'core:inlet/session-event@1': async (i: any) => ok(i),
		'core:query/world-lore@1': async () => ok({ main: band('world'), hits: band('world') }),
		/** Keyed on `speaker` (W1): a receipt says which delver's private lore each voice was handed. */
		'core:query/character-lore@1': async (i: any) => {
			const key = `char:${i?.speaker ?? 'scope'}`
			return ok({ main: band(key), hits: band(key) })
		},
		'core:query/history-entries@1': async () => ok({ main: band('hist'), hits: band('hist') }),
		'core:query/session-cast@1': async () => ok({ main: CAST, cast: CAST }),
		'core:query/session-state@1': async () =>
			ok({
				main: { world: { location: 'The Old Well' }, cast: {} },
				state: { world: { location: 'The Old Well' }, cast: {} },
				version: 7,
			}),
		'core:query/lorebook-entries@1': async () => ok({ main: ROOMS, entries: ROOMS }),
		/** R7: the entry lookup only, on the SDK's name rule (the prose lookup is the app binding's). */
		'core:task/undescribed-name@1': async (i: any) => {
			const held = at(i?.name, i?.params?.path)
			const names = (v: unknown) =>
				(!!v && typeof v === 'object' && typeof (v as any).entryId === 'number') ||
				(typeof v === 'string' && v.trim() !== '')
			const raw = names(held) ? held : i?.fallbackName
			const listed = [...(i?.locationEntries ?? []), ...(i?.entries ?? [])]
			const ref = raw && typeof raw === 'object' ? (raw as any).entryId : undefined
			const name = typeof raw === 'string' ? raw.trim() : ''
			const hit = listed.find((e: any) => (ref !== undefined ? e?.id === ref : sameName(e?.name, name)))
			const undescribed = name && !hit ? name : ''
			const out = { undescribed, describedBy: hit ? 'entry' : '', entryId: hit?.id ?? null, passage: '' }
			return ok({ main: out, ...out })
		},
		'core:task/concat-candidates@1': async (i: any) => ok({ main: i.sources ?? [], candidates: i.sources ?? [] }),
		'core:task/query-windows@1': async () => ok({ main: [], current: [], recent: [] }),
		'core:query/entity-search@1': async () => ok({ main: [], hits: [], messages: [] }),
		'core:query/mention-spans@1': async () => ok({ main: [], mentions: [], texts: [] }),
		'core:query/entity-link@1': async (i: any) => ok({ main: [], candidates: i?.candidates ?? [], links: [] }),
		'core:query/cast-presences@1': async () => ok({ main: [], at: null }),
		'core:task/card-strokes@1': async (i: any) => ok({ main: i?.cast, cast: i?.cast }),
		'core:task/eligibility@1': async (i: any) =>
			ok({ main: i?.candidates ?? [], candidates: i?.candidates ?? [], diagnostics: {} }),
		'core:task/build-planner-context@1': async () => ok({ main: {}, templateContext: { who: 'planner' }, seedName: '' }),
		'core:task/build-scene-context@1': async () => ok({ main: {}, templateContext: { who: 'narrator' }, seedName: 'Narrator' }),
		/** It publishes `speaker` (W1), the way the app's binding does, by name or by id. */
		'core:task/build-side-character-context@1': async (i: any) => {
			const byId = i?.sideCharacter?.characterId
			const seat = CAST.sessionCharacters.find((c) =>
				byId != null ? c.character.id === byId : c.character.name === String(i?.sideCharacter?.name ?? ''),
			)
			const name = seat?.character.name ?? String(i?.sideCharacter?.name ?? '')
			return ok({
				main: {},
				templateContext: { who: name || '?' },
				seedName: name || '?',
				speaker: seat ? `character:${seat.character.id}` : null,
			})
		},
		'core:task/build-template-context@1': async (i: any) =>
			ok({ main: {}, templateContext: { who: i?.speaker ?? 'context' }, seedName: '' }),
		/** The assembled prompt, carrying **whose** context built it. */
		'core:task/assemble@2': async (i: any) => {
			const context = { who: i?.templateContext?.who ?? '?', budget: i?.budget ?? 0 }
			return ok({ main: context, context })
		},
		'core:task/prose-transcript@1': async () => ok({ main: [], messages: [] }),
		'core:task/process-messages@1': async (i: any) => ok({ main: [], messages: [], seedName: i?.seedName }),
		'core:oracle/generate-json@1': async (i: any) => {
			const value = at(json, i?.params?.path)
			return ok({
				main: json,
				json,
				value,
				items: Array.isArray(value) ? value : value == null ? [] : [value],
				text: JSON.stringify(json),
			})
		},
		'core:task/parse-json@1': async (i: any) => {
			const d = JSON.parse(String(i?.text ?? '{}'))
			const value = at(d, i?.params?.path)
			return ok({ main: d, json: d, value, items: Array.isArray(value) ? value : value == null ? [] : [value] })
		},
		'core:task/join-text@1': async (i: any) => {
			const path = i?.params?.path ?? 'text'
			const sep = i?.params?.separator ?? '\n\n'
			const text = (Array.isArray(i?.items) ? i.items : [])
				.map((e: any) => (path && e && typeof e === 'object' ? e[path] : e))
				.filter((t: unknown) => typeof t === 'string' && t.length > 0)
				.join(sep)
			return ok({ main: text, text })
		},
		'core:task/run-script@1': async (i: any) => ok({ main: runScript(scriptFor(i?.input ?? {}), i?.input) }),
		'core:task/ruleset-resolve@1': async (i: any) => {
			const r = ROLLED(Array.isArray(i?.deltas) ? i.deltas : [])
			return ok({ blocks: {}, facts: {}, outcomes: r.outcomes, explain: r.explain, rejected: [] })
		},
		'core:task/pair@1': async (i: any) => {
			const [a, b] = [i?.params?.firstKey ?? 'first', i?.params?.secondKey ?? 'second']
			return ok({
				main: {
					...(i?.first !== undefined ? { [a]: i.first } : {}),
					...(i?.second !== undefined ? { [b]: i.second } : {}),
				},
			})
		},
		'core:task/make-choices@1': async (i: any) => {
			const options = (i?.json?.options ?? []) as Array<{ key: string; label: string }>
			const blocks = [
				{
					kind: 'choices',
					question: i?.json?.question ?? '',
					...(i?.referent ? { referent: i.referent } : {}),
					...(typeof i?.vantage === 'string' && i.vantage.trim() ? { vantage: i.vantage.trim() } : {}),
					addressee: i?.addressee ?? null,
					actions: options.map((o) => ({ fn: i?.fn, action: i?.action, label: o.label, choice: o.key })),
				},
			]
			return ok({ main: blocks, blocks, text: i?.json?.question ?? '', addressee: i?.addressee ?? null })
		},
		'core:task/read-answer@1': async (i: any) =>
			ok({
				main: i?.payload ?? {},
				choice: i?.payload?.choice ?? null,
				label: i?.payload?.label ?? null,
				addressee: 'owner',
				characterId: null,
				question: '',
				referent: i?.form?.referent ?? null,
				vantage: i?.form?.vantage ?? null,
				values: i?.payload ?? {},
			}),
		'core:query/resolve-state-changes@1': async (i: any) =>
			ok({ main: i?.changes ?? [], changes: i?.changes ?? [], refused: [] }),
		'core:task/set-state@1': async (i: any) =>
			ok({ main: i?.params?.mode ?? 'propose', applied: [], proposed: i?.changes ?? [], refused: [] }),
		'core:outlet/update-message@1': async (i: any, ctx: any) => {
			const row = await ctx.commit({ text: i.text, blocks: i.blocks })
			return ok({ main: row.id, messageId: row.id })
		},
		'core:outlet/create-message@1': async (i: any, ctx: any) => {
			const row = await ctx.commit({ text: i.text, channel: i.channel, speaker: i.speaker })
			return ok({ main: row.id, messageId: row.id })
		},
		'core:outlet/create-lore-entry@1': async (i: any, ctx: any) => {
			const row = await ctx.commit({ name: i.name, content: i.content })
			return ok({ main: row.id, entryId: row.id })
		},
		/** R13: the annex's AI view — the scratchpad only for the Castellan's own reference. */
		'core:query/session-annex@1': async (i: any) =>
			ok({ main: i?.view === 'ai' && i?.speaker === 'envoy:castellan' ? { 'castellan-scratchpad': SCRATCHPAD } : {} }),
		'core:outlet/set-session-annex@1': async (i: any) => ok({ main: { ok: true }, annex: i?.value }),
		'core:query/turn-plan@1': async () => ok({ main: { plan: json }, plan: json }),
		...over,
	})

/** One ordinary plan: a beat, two of the party with something to say, nothing risky. */
const PLAN = {
	beats: ['The well shaft opens into the dark.'],
	speakers: [
		{ name: 'Verity', intent: 'sound the depth' },
		{ name: 'Brask', intent: 'complain about it' },
	],
	risks: [] as Array<Record<string, string>>,
	unknownExit: '',
	knockQuestion: '',
	worldHints: { location: 'The Old Well' },
}

/** The same turn, with Verity trying a lock and Ann — a guest's delver — climbing. */
const RISKY = {
	...PLAN,
	speakers: [...PLAN.speakers, { name: 'Ann', intent: 'climb down' }],
	risks: [
		{ who: 'Verity', attempt: 'pick the lock', check: 'skill.sleight-of-hand', difficulty: 'hard' },
		{ who: 'Ann', attempt: 'climb down the shaft', check: 'Athletics', difficulty: '' },
	],
}

/** The same turn, with the party walking into a room nobody built. */
const KNOCK_PLAN = {
	...PLAN,
	speakers: [],
	unknownExit: 'The Drowned Hall',
	knockQuestion: 'The stair goes down to the Drowned Hall. Is there a Drowned Hall?',
}

const takeTurn = async (
	plan: unknown = PLAN,
	over: Bindings = {},
	o: { characterId?: number | null; fields?: Record<string, unknown>; via?: string; channel?: string; ruleset?: unknown } = {},
) => {
	const d = replyDoc()
	const session = sessionDoc(o.fields)
	return (await run(d, {
		world: { ...world, authorDefaults: authorDefaultsOf(d) },
		input: {
			text: 'send them down the shaft',
			messageId: null,
			characterId: o.characterId ?? null,
			via: o.via ?? 'pick',
			channel: o.channel ?? 'main',
			sessionScope: { sessionId: 1 },
			fields: session.fields,
			session,
			ruleset: o.ruleset ?? FREEFORM,
		},
		seed: 'lair',
		triggerSource: 'ui',
		bindings: lairBindings(plan, over),
	})) as any
}

const ran = (receipt: any, key: string) => receipt.nodes.some((n: any) => n.nodeKey === key && n.result === 'ok')
const node = (receipt: any, key: string) => receipt.nodes.find((n: any) => n.nodeKey === key)
const order = (receipt: any) => receipt.nodes.map((n: any) => n.nodeKey) as string[]
/** The named params of a node's input — its declared defaults left out. */
const params = (receipt: any, key: string, ...names: string[]) =>
	Object.fromEntries(names.map((k) => [k, node(receipt, key).input.params?.[k]]))
const saying = (said: string[]): Bindings => ({
	'core:oracle/generate-text@1': async (i: any) => {
		const who = i?.context?.who ?? '?'
		said.push(who)
		return ok({ main: `<${who}>`, text: `<${who}>`, reasoning: `${who} weighs it` })
	},
})

const S = 'via.turn.channel.story.pick'
const PLANNED = `${S}.planned`
/** A character turn: a run whose subject is a delver. */
const CT = `${S}.picked`
const DOOR = `${PLANNED}.door`
const PLAY = `${DOOR}.play`

/* ── the declaration ────────────────────────────────────────────────────── */

describe('the Lair genre declares the reverse crawl, rewritten (R1–R13)', () => {
	test('the GM is never in the scene; guests join as participants; the dungeon is offered, never required', () => {
		const shape = lairGenre.shape!
		assert.equal(lairGenre.id, LAIR_GENRE_ID)
		assert.deepEqual(shape.characters, { min: 1 })
		// R4, D5: a person's seat is a delver they play — none preselected.
		assert.deepEqual(shape.personas, { min: 0, preselectDefault: false })
		// RF fix 2 (2026-10-23): a session may always start without a book — its own (the phantom lorebook) is the dungeon.
		assert.equal(shape.lorebook, 'optional')
		assert.equal(shape.composer, 'text')
		assert.equal(shape.voice, 'narrator')
		assert.equal(shape.greeting?.enabled, false)
		assert.deepEqual(shape.writes, { lore: true, scenes: true })
		assert.deepEqual(lairGenre.playerLabel, { en: 'Dungeon Master' })
	})

	/** D8: no stats, items or races of its own; 🚧 RF fix 8: no slots or sheet either — the host keeps the GM's two tools. */
	test('unopinionated (D8, RF fix 8): no slots, no sheet — the whisper and the direction are the host’s tool state, ⏳ what someone carries the host’s list', () => {
		assert.equal('slots' in lairGenre, false)
		assert.equal('sheets' in lairGenre, false)
		const kept = hostStateFor(lairGenre)
		assert.deepEqual(
			kept.map((d) => [d.slot, d.role]),
			[
				['core:slot/location@1', 'place'],
				['core:slot/inventory@1', 'carried'],
				['core:slot/direction@1', 'tool'],
				['core:slot/whisper@1', 'tool'],
			],
		)
		for (const gone of ['floor', 'gold', 'stamina', 'trust', 'weather', 'time-of-day', 'hp', 'mood'])
			assert.ok(!kept.some((d) => d.slot === `core:slot/${gone}@1`), gone)
	})

	test('the ruleset decides (R2, D8): it needs nothing, plays better with dice, conditions and casting', () => {
		assert.equal(lairGenre.uses?.dice, 'optional')
		assert.deepEqual(lairGenre.uses?.verbs, [])
		// 🚧 RF fix 8: what it plays best with, by tag — all optional, so every ruleset fits.
		const o = lairGenre.uses?.optional
		assert.deepEqual([o?.attributes?.map((e) => e.tag), o?.entryTypes?.map((e) => e.tag), o?.zoneTypes?.map((e) => e.tag)], [['health'], ['condition'], ['inventory']])
		assert.equal(o?.conditions, true)
		assert.equal(o?.casting, true)
		for (const e of [...(o?.attributes ?? []), ...(o?.entryTypes ?? []), ...(o?.zoneTypes ?? [])]) assert.ok(e.label && e.why, e.tag)
		// 🚧 2026-10-23 (AUDIT-core-genres Lair 2): Wherewithal recommended too — its roll forms are pinned below.
		assert.deepEqual(lairGenre.rulesets, {
			recommended: [freeformRuleset.id, visItinerisRuleset.id, wherewithalRuleset.id],
			default: freeformRuleset.id,
		})
		assert.deepEqual(lairGenre.rigour, { options: ['prose', 'mechanics', 'scripts'], default: 'mechanics' })
	})

	test('two envoys (D4): the Castellan — default, fallback, greeting on the Sanctum — and the Oracle', () => {
		const [castellan, oracle] = lairGenre.envoys!
		assert.equal(lairGenre.envoys!.length, 2)
		assert.equal(castellan!.key, 'castellan')
		assert.equal(castellan!.default, true)
		assert.equal(castellan!.fallback, true)
		assert.equal(castellan!.speaks, 'in-turn')
		assert.equal(castellan!.greeting?.channel, 'sanctum')
		assert.match(castellan!.prompts?.systemPrompt ?? '', /talking with the \{\{playerLabel\}\}/)
		// 🚧 lair fix 2 (2026-10-22): the role boundary FIRST — a 14B model read it
		// seventh and narrated — and the reminder after the talk repeats it.
		const first = (castellan!.prompts?.systemPrompt ?? '').split('\n\n')[0]!
		assert.match(first, /never narrate the story/)
		assert.match(first, /never write a line, an action or a thought for anyone in the party/)
		assert.match(first, /pressing Narrate plays it/)
		assert.equal(castellan!.prompts?.postHistoryInstructions, LAIR_CASTELLAN_REMINDER)
		assert.match(LAIR_CASTELLAN_REMINDER, /Do not narrate, and do not write for anyone in the party/)
		// Every variable the talk reads is still there.
		for (const v of ['char', 'playerLabel', 'characterNames', 'knownLocations', 'locationEntry', 'recentStory', 'sanctumSteers', 'scratchpad'])
			assert.ok((castellan!.prompts?.systemPrompt ?? '').includes(`{{${v}}}`) || (castellan!.prompts?.systemPrompt ?? '').includes(`{{#if ${v}}}`), v)
		// …and the reminder lands from the Sanctum's first line (no token trigger there).
		assert.equal((presetValue(doc(LAIR_REPLY_SPEC_ID), 'via.turn.channel.sanctum.prompt') as any)?.postHistoryTokenTrigger, 0)
		// The Oracle: mechanics only — no prompt, no greeting, never seated by default.
		assert.equal(oracle!.key, 'oracle')
		assert.deepEqual(oracle!.name, { en: 'Oracle' })
		assert.equal(oracle!.speaks, 'in-turn')
		assert.equal(oracle!.default, undefined)
		assert.equal(oracle!.fallback, undefined)
		assert.equal(oracle!.greeting, undefined)
		assert.equal(oracle!.prompts, undefined)
		assert.match(String((oracle!.image as string) ?? ''), /^data:image\/svg\+xml/)
	})

	test('the GM’s levers (D7): tone, the rooms layer, Sanctum steering and the three check settings', () => {
		const f = lairGenre.shape?.fields as Record<string, any>
		assert.deepEqual(Object.keys(f).sort(), ['askBeforeRolling', 'autoRoll', 'roomsLayer', 'sanctumSteers', 'showDice', 'tone'])
		assert.deepEqual(
			Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.default])),
			{ tone: 'grounded', roomsLayer: true, sanctumSteers: true, askBeforeRolling: true, autoRoll: false, showDice: true },
		)
		// Every one the owner's (a genre field's default reach), none model plumbing.
		for (const [k, v] of Object.entries(f)) assert.notEqual(v.reach, 'admin', k)
		// 🚧 2026-10-23 (PLAN-genres-seams): no setting is named for dice; the ids are kept ⏳.
		assert.equal(f.askBeforeRolling.label.en, 'Ask me before each check')
		assert.equal(f.autoRoll.label.en, 'Decide checks at once')
		assert.equal(f.showDice.label.en, 'Show outcomes', 'the field id kept, its words for any check method (M2, 2026-10-22)')
		// The shared declaration (S6): any genre opts in by the same object.
		assert.equal(f.showDice, cat.SHOW_OUTCOMES_FIELD)
		// The retired two (D11): partySpeech and trustNarrator.
		assert.equal(f.partySpeech, undefined)
		assert.equal(f.trustNarrator, undefined)
	})

	test('the Sanctum is the GM’s alone (D6): `audience: owner`, and main is everyone’s', () => {
		assert.equal(channelAudience(lairGenre.shape, 'sanctum'), 'owner')
		assert.equal(channelAudience(lairGenre.shape, 'main'), 'all')
		const decls = channelDecls(lairGenre.shape)
		assert.deepEqual(decls.map((d) => d.slug), ['main', 'sanctum'])
		assert.deepEqual(decls[1]!.label, { en: 'Sanctum' })
		// 🚧 lair fix 2: the story's channel tab reads Story.
		assert.deepEqual(decls[0]!.label, { en: 'Story' })
	})

	test('two layouts: the GM’s (the Sanctum a tab of the story, the scratchpad beside it) and the party’s (neither) — the guests’ layout, with the Party panel', () => {
		const known = new Set(CORE_WIDGETS.map((w) => w.id))
		const [gm, party] = lairGenre.layouts!
		assert.equal(gm!.slug, 'default')
		assert.equal(gm!.preset, LAIR_LAYOUT)
		assert.equal(gm!.forGuests, undefined)
		// 🚧 lair fix 2: no copy claims the Sanctum, so the story shows it as a tab.
		assert.deepEqual(drawnWidgetIds(gm!.preset), ['messages', 'stats', 'places', 'annex#castellan'])
		assert.deepEqual(gm!.preset.widgetSettings?.messages, { otherTabsComposer: 'minimal' })
		assert.equal(party!.slug, 'party')
		assert.equal(party!.preset, LAIR_PARTY_LAYOUT)
		// 🚧 L5: what a guest's first open copies (D6).
		assert.equal(party!.forGuests, true)
		assert.deepEqual(drawnWidgetIds(party!.preset), ['messages', 'stats', 'places', 'turn-order', 'attendance'])
		// The Party panel: Turn order and Who's here as its tabs, where the GM's Sanctum sits.
		const partyPanel = party!.preset.panels!.right.find((p) => p.title === 'Party')
		assert.deepEqual(partyPanel?.tabs, ['turn-order', 'attendance'])
		for (const l of [gm!, party!]) for (const id of drawnWidgetIds(l.preset)) assert.ok(known.has(widgetOfInstance(id)), id)
	})

	test('the event surface: forms included, a seat taken', () => {
		assert.equal(lairGenre.events[sessionEvents.messageRespond]?.required, true)
		assert.equal(lairGenre.events[sessionEvents.sessionAction]?.open, true)
		assert.ok(sessionEvents.formAddressed in lairGenre.events)
		assert.ok(sessionEvents.memberAdded in lairGenre.events)
	})
})

/* ── the declared shapes (D1) ──────────────────────────────────────────── */

describe('what the models answer in is declared, and asked for through jsonSchemaOf (D1)', () => {
	test('the plan: the shape, strict — beats, speakers, risks, the knock and where', () => {
		assert.deepEqual(LAIR_PLAN_SCHEMA, jsonSchemaOf({ kind: 'form', fn: 'answer', fields: LAIR_PLAN_SHAPE }))
		const s = LAIR_PLAN_SCHEMA as any
		assert.deepEqual(Object.keys(s.properties), ['beats', 'speakers', 'risks', 'unknownExit', 'knockQuestion', 'worldHints'])
		assert.deepEqual(s.required, Object.keys(s.properties))
		assert.equal(s.additionalProperties, false)
		assert.equal(s.properties.beats.items.type, 'string')
		assert.deepEqual(Object.keys(s.properties.risks.items.properties), ['who', 'attempt', 'check', 'difficulty'])
		assert.equal(s.properties.risks.maxItems, 4)
		assert.deepEqual(s.properties.speakers.items.required, ['name', 'intent'])
		// The reply asks for exactly this.
		const write = replyDoc().nodes.find((n) => n.key === `${PLANNED}.planWrite`)!
		assert.deepEqual((write.config as any).schema, LAIR_PLAN_SCHEMA)
	})

	test("a room draft: its body, its ways out, and the place entry type's own fields — never its priority", () => {
		const s = LAIR_ROOM_DRAFT_SCHEMA as any
		assert.deepEqual(Object.keys(s.properties), ['content', 'exits', 'fields'])
		assert.deepEqual(s.required, ['content', 'exits', 'fields'])
		assert.deepEqual(s.properties.fields, jsonSchemaOf(locationEntryType, { omit: ['priority'] }))
		assert.ok('category' in s.properties.fields.properties)
		assert.ok(!('priority' in s.properties.fields.properties))
	})

	/**
	 * 🚧 S4 (2026-10-23): what the rules decide is read off the session's
	 * ruleset — its sections' deciding references and outcome words, every
	 * label the ruleset's — at run time, by the host, for the inlet. No table
	 * of core's rulesets, no genre words for a check (no d20 vocabulary), no
	 * order but the ruleset's own.
	 */
	test("🚧 Vis Itineris read off its sections: its way and checks in its order and words, its bands, its outcome words", () => {
		const vis = lairRulesRow(visItinerisRuleset)
		assert.equal(vis.dice, true)
		assert.deepEqual(vis.bands, rollBlockBands(visItinerisRuleset))
		assert.equal(vis.band, 'medium')
		// The ruleset's order: its way first (a check by its own name, in the way's words), then its checks as it lists them.
		assert.deepEqual(vis.checks.slice(0, 3), [
			{ key: 'die', label: 'Roll a d20' },
			{ key: 'save.strength', label: 'Strength save' },
			{ key: 'ability.strength', label: 'Strength' },
		])
		const keys = vis.checks.map((c) => c.key)
		for (const k of ['skill.stealth', 'ability.strength', 'save.dexterity', 'attack.melee', 'initiative']) assert.ok(keys.includes(k), k)
		// A tally, a worked-out value and a module decide nothing: never a check.
		for (const k of ['damage', 'proficiency', 'strength-mod', 'vis-itineris-derive']) assert.ok(!keys.includes(k), k)
		// 🚧 Its checks in its own words (a check reference's `label`, GM 2026-10-23, G2 ★1) — no genre vocabulary.
		assert.equal(vis.checks.find((c) => c.key === 'attack.melee')!.label, 'Melee attack')
		assert.equal(vis.checks.find((c) => c.key === 'skill.sleight-of-hand')!.label, 'Sleight of hand')
		// A check the ruleset gives no words is its key read plainly.
		const unsaid = lairRulesRow({ ...visItinerisRuleset, functions: rulesetSections(visItinerisRuleset).functions!.map((f: any) => (f.options?.label ? { ...f, options: { ...f.options, label: undefined } } : f)) })
		assert.equal(unsaid.checks.find((c) => c.key === 'skill.sleight-of-hand')!.label, 'Sleight of hand skill')
		assert.deepEqual(vis.methods, ['die-target'])
		assert.deepEqual(
			vis.outcomes,
			(rulesetSections(visItinerisRuleset).outcomes ?? []).map((o: any) => ({ id: o.id, label: o.label.en, five: o.five })),
		)
		assert.deepEqual(vis.outcomes.map((o) => o.label), ['Critical failure', 'Failure', 'Success', 'Critical success'])
	})

	test('🚧 Freeform decides nothing: no checks, no bands, no ways — its outcome words still read', () => {
		const free = lairRulesRow(freeformRuleset)
		assert.deepEqual([free.dice, free.checks, free.bands, free.band, free.methods], [false, [], [], null, []])
		assert.ok(free.outcomes.length > 0)
	})

	test("🚧 Wherewithal (M3, 2026-10-22): a roll form offers only its contest — the one way that holds bands — in the way's own words", () => {
		const w = lairRulesRow(wherewithalRuleset)
		assert.deepEqual(w.checks, [{ key: 'contest', label: 'Mettle against mettle' }])
		assert.deepEqual(w.bands.map((b) => b.id), ['slight', 'even', 'steep', 'towering'])
		assert.equal(w.band, 'even')
		assert.equal(w.dice, true)
		// In the sections' order (2026-10-23): the default way first.
		assert.deepEqual(w.methods, ['none', 'bid', 'compare'])
		assert.deepEqual(w.outcomes.map((o) => o.id), ['ruin', 'short', 'cost', 'carried', 'clean'])
	})

	test('🚧 a ruleset made on the pub, from scratch, with one comparison: first class — its check, its bands, its words', () => {
		const pub = {
			id: 'acme:ruleset/odds@1',
			name: { en: 'Odds' },
			attributes: [{ id: 'nerve', name: { en: 'Nerve' }, kind: 'number', bounds: { min: 0, max: 6 }, prose: 'Steadiness.' }],
			functions: [
				{
					ref: 'core:function/compare@1',
					key: 'face-down',
					options: {
						label: { en: 'Nerve against the odds' },
						modifierOf: 'nerve',
						bands: [
							{ id: 'even', label: { en: 'Even odds' }, target: 3, default: true },
							{ id: 'long', label: { en: 'Long odds' }, target: 6 },
						],
					},
				},
			],
			outcomes: [
				{ id: 'folds', label: { en: 'Folds' }, five: 'fail' },
				{ id: 'holds', label: { en: 'Holds' }, five: 'success' },
			],
		}
		assert.deepEqual(lairRulesRow(pub), {
			dice: true,
			checks: [{ key: 'face-down', label: 'Nerve against the odds' }],
			bands: [
				{ id: 'even', label: 'Even odds', target: 3 },
				{ id: 'long', label: 'Long odds', target: 6 },
			],
			band: 'even',
			methods: ['compare'],
			outcomes: [
				{ id: 'folds', label: 'Folds', five: 'fail' },
				{ id: 'holds', label: 'Holds', five: 'success' },
			],
		})
		// From scratch, nothing added: it decides nothing.
		assert.deepEqual(lairRulesRow({ id: 'acme:ruleset/blank@1', name: { en: 'Blank' } }), { dice: false, checks: [], bands: [], band: null, methods: [], outcomes: [] })
	})

	test('🚧 an archetype read the same way (romance: its confession); a check whose way holds no bands is told in words', () => {
		const romance = (cat.RULESET_TEMPLATES as any[]).find((t) => /romance/.test(t.id))!
		const r = lairRulesRow(romance.ruleset ?? romance)
		assert.deepEqual(r.checks.map((c) => c.key), ['confess'])
		assert.equal(r.band, 'even')
		// The spend and the judgement hold no difficulty to pick: their checks are never put to a form.
		assert.deepEqual(r.methods, ['compare', 'bid', 'none'])
		// A pool of dice holds none either: no form at all.
		const pool = (cat.RULESET_TEMPLATES as any[]).find((t) => /dice-pool/.test(t.id))!
		assert.deepEqual(lairRulesRow(pool.ruleset ?? pool).checks, [])
	})

	test('🚧 no table is baked: a script handed only a ruleset id decides nothing, and one handed a row plays it', () => {
		for (const seed of CORE_SCRIPTS.filter((x) => /^core:script\/lair-/.test(x.seedKey))) {
			assert.ok(!/vis-itineris|Sleight of hand|Very easy/.test(seed.source), `${seed.seedKey} spells a ruleset`)
			assert.ok(!/var RULES\b/.test(seed.source), `${seed.seedKey} bakes a table`)
		}
		const mode = (ruleset: unknown) => runScript('core:script/lair-table', { ruleset, session: sessionDoc() }).mode
		assert.equal(mode({ id: visItinerisRuleset.id, rigour: 'mechanics', settings: {} }), 'none')
		assert.equal(mode(VIS('mechanics')), 'ask')
	})
})

/* ── the pipelines ──────────────────────────────────────────────────────── */

/** Every spec this genre ships, by slug. */
const lairSpecs = () => CORE_SPECS.filter((s) => /core:spec\/lair-/.test(s.slug))

/**
 * `slug` → the document's canonical hash: a moved pin is shippable and still
 * has to be deliberate. Re-pinned 2026-10-21 (the rewrite, lane L3): every
 * Lair document is new or moved; `lair-respond` and `lair-advance-time` left.
 */
const PUBLISHED: Record<string, string> = {
	// L5 (2026-10-21): Auto roll's description says "the rules' usual difficulty" (§28: no SDK noun in a label). (was '8a34738f8b52d')
	// M2 (2026-10-22): Show dice → Show outcomes (the field id kept), in the genre shape the create spec carries. (was '9eeaaa394f17f')
	// M3 (2026-10-22): Auto roll's description says "When the rules decide", never "Under Rules and dice". (was '799554471956d')
	// Genres GM (2026-10-23): the Lair's relabels and its recommended rulesets in the genre shape it carries (G0, S7). (was 'c46bd3f8d3a77')
	// RF fix 2 (2026-10-23): the genre shape it carries offers the lorebook, never requires it ('required' retired). (was '1cb73ccca537ee')
	'core:spec/lair-create': '1a7932ed813f14',
	// Genres GM (2026-10-23): *Deciding the checks* as the status (G0, S7). (was '18ab1e1e72aac4')
	// Repair 1 (2026-10-23): its `ruleset-resolve` step(s) name the params slot — the `emits` switch is read. (was '5cbe8f5325b1b')
	// RF fix 2 (2026-10-23): the voice's reminder lands from the first line — its `prompt` step's trigger is 0. (was 'ee12352ed2052')
	'core:spec/lair-reply': 'c4fe814f1e089',
	'core:spec/lair-welcome': '1bf873c4b48d0b',
	// Genres GM (2026-10-23): *Keep the books* (G0), the one change grammar (G1, S1), the lift and its step retired (GM). (was '123fac28db816a')
	// Repair 1 (2026-10-23): its `ruleset-resolve` step(s) name the params slot — the `emits` switch is read. (was '13f43d1c42809')
	'core:spec/lair-keeper': '1e7e03116e5d3d',
	'core:spec/lair-scratchpad': '8ffdc89f6eb8',
	// L4 (2026-10-21): its two saves headed apart — 'File the room, for your review' / 'File the room as drafted'. (was '507d5063e77de')
	'core:spec/lair-file-current-room': '567f7947865d0',
	'core:spec/lair-build-room': '7d6ab54d3173c',
	'core:spec/lair-room-answer': '3d7d4cce10e94',
	'core:spec/lair-file-room': '638ab8005cf0e',
	'core:spec/lair-whisper': '8e2c522cf5ea9',
	'core:spec/lair-nudge': '1f6e668013b7c1',
	'core:spec/lair-trap': '1b7dac15d70c7f',
	'core:spec/lair-reveal': '1e25c31a42adad',
	'core:spec/lair-roll': '196c24d8b373b6',
	// Genres GM (2026-10-23): *Deciding the check* as the status (G0, S7). (was '10e23e3a75024')
	// Repair 1 (2026-10-23): its `ruleset-resolve` step(s) name the params slot — the `emits` switch is read. (was '180b95879690f1')
	'core:spec/lair-roll-answer': '132974277207e4',
	'core:spec/lair-answer-form': 'e03c023079828',
	'core:spec/lair-turn-order': 'f6801bd2a7aac',
	'core:spec/lair-summarize-scene': '249eb28ab0204',
}

describe('the Lair pipelines', () => {
	test('eighteen specs, and every one builds and validates clean', () => {
		assert.deepEqual(lairSpecs().map((s) => s.slug).sort(), Object.keys(PUBLISHED).sort())
		for (const entry of lairSpecs()) {
			const errors = validate(entry.build()).filter((f) => f.severity === 'error')
			assert.deepEqual(errors.map((e) => `${e.law} ${e.nodeKey ?? ''} ${e.message}`), [], entry.slug)
		}
		// The old reply and Time passes left.
		for (const gone of ['core:spec/lair-respond', 'core:spec/lair-advance-time'])
			assert.ok(!CORE_SPECS.some((s) => s.slug === gone), gone)
	})

	test('each document hashes to its recorded pin', () => {
		const drifted = lairSpecs()
			.map((e) => [e.slug, canonicalHash(e.build())] as const)
			.filter(([slug, hash]) => PUBLISHED[slug] !== hash)
			.map(([slug, hash]) => `${slug}: recorded ${PUBLISHED[slug]}, code ${hash}`)
		assert.deepEqual(drifted, [], 'a shipped Lair document changed — record the new hash in the same commit')
	})

	/**
	 * One live row per EXECUTION PATH (F7): each branch opens the row it fills
	 * — the narration, the Sanctum talk, the knock, a character turn — and the
	 * branches are exclusive. The roll row, the dice row and the plan row are
	 * COMPLETE rows: never generating.
	 */
	test('one live row per execution path; the roll, dice and plan rows are complete rows', () => {
		const d = replyDoc()
		const writes = d.nodes.filter((n) => n.kind === 'outlet')
		assert.deepEqual(writes.map((n) => n.key), [
			'via.narrate.placeholder',
			'via.narrate.save',
			'via.turn.channel.sanctum.placeholder',
			'via.turn.channel.sanctum.save',
			`${CT}.placeholder`,
			`${CT}.save`,
			`${CT}.spriteShow`,
			`${DOOR}.knock.placeholder`,
			`${DOOR}.knock.save`,
			`${PLAY}.checks.asked.write`,
			`${PLAY}.checks.rolled.shown.some.write`,
			`${PLAY}.plan.posted.write`,
		])
		const fed = (key: string, port: string) =>
			d.edges.some((e) => e.to === key && e.toPort.split('.')[0] === port) ||
			(d.nodes.find((n) => n.key === key)?.config as any)?.[port] != null
		for (const key of [`${PLAY}.checks.asked.write`, `${PLAY}.checks.rolled.shown.some.write`, `${PLAY}.plan.posted.write`])
			for (const port of ['generating', 'row']) assert.ok(!fed(key, port), `${key} ${port}`)
		// The reply keeps no books and rewrites no scratchpad: those are routines now (D7).
		assert.ok(!d.nodes.some((n) => /keep|keeper|padWrite|padKeep|party\.speaks/.test(n.key)))
		assert.ok(!d.nodes.some((n) => n.definitionId === 'core:task/set-state' || n.definitionId === 'core:outlet/set-session-annex'))
	})

	test('the mechanics are the Oracle’s, the plan the Castellan’s (D4)', () => {
		const d = replyDoc()
		const cfg = (key: string) => d.nodes.find((n) => n.key === key)!.config as any
		assert.equal(cfg(`${DOOR}.knock.placeholder`).speaker, 'envoy:oracle')
		assert.equal(cfg(`${PLAY}.checks.asked.write`).speaker, 'envoy:oracle')
		assert.equal(cfg(`${PLAY}.checks.rolled.shown.some.write`).speaker, 'envoy:oracle')
		assert.equal(cfg(`${PLAY}.plan.posted.write`).speaker, 'envoy:castellan')
		assert.equal(cfg(`${PLAY}.plan.posted.write`).channel, 'sanctum')
		assert.equal(cfg(`${PLAY}.checks.asked.write`).channel, 'main')
		assert.equal(cfg('via.narrate.placeholder').speaker, 'envoy:castellan')
	})

	test('every action spec but the drafting and rolling ones writes on the spine (01 §4)', () => {
		const clausal = new Set([
			LAIR_REPLY_SPEC_ID,
			'core:spec/lair-create',
			LAIR_WELCOME_SPEC_ID,
			LAIR_ROOM_ANSWER_SPEC_ID,
			LAIR_FILE_ROOM_SPEC_ID,
			LAIR_ROLL_SPEC_ID,
			LAIR_ROLL_ANSWER_SPEC_ID,
			LAIR_SCRATCHPAD_SPEC_ID,
			LAIR_FILE_CURRENT_ROOM_SPEC_ID,
			LAIR_KEEPER_SPEC_ID,
		])
		for (const entry of lairSpecs()) {
			if (clausal.has(entry.slug)) continue
			for (const n of entry.build().nodes as SpecDocument['nodes'])
				if (n.kind === 'outlet') assert.equal(n.clauseId, undefined, `${entry.slug} ${n.key}`)
		}
	})

	test('every script a Lair spec names is seeded, once', () => {
		const seeded = new Set(CORE_SCRIPTS.map((s) => s.seedKey))
		assert.equal(seeded.size, CORE_SCRIPTS.length)
		for (const entry of lairSpecs())
			for (const v of (entry.build().presets ?? []).flatMap((p: any) => p.values as any[]).filter((v: any) => v.slot === 'scripts'))
				for (const l of v.value as Array<{ seedKey: string }>) assert.ok(seeded.has(l.seedKey), `${entry.slug} ${v.nodeKey}: ${l.seedKey}`)
	})
})

/* ── the genre's defaults and its three presets (D7) ───────────────────── */

const lairDecl = () => (coreGenres() as readonly GenreDecl[]).find((g) => g.id === LAIR_GENRE_ID)!
const defaultsOf = () => genreDefaultsOf(lairDecl())!.registrations
const effectiveOf = (slug: string) => {
	const p = corePresets().find((x) => x.slug === slug)!
	return effectiveRegistrations(defaultsOf(), presetChangesOf(p, defaultsOf()))
}
const actionsOf = (rs: readonly any[]) =>
	rs.flatMap((r) => (r.trigger.family === 'action' && !/#summarize-/.test(r.trigger.action) ? [r.trigger.action] : [])).sort()
const routinesOf = (rs: readonly any[]) =>
	Object.fromEntries(rs.flatMap((r) => (r.trigger.family === 'routine' ? [[r.key, r.mode ?? 'full']] : [])))

describe("the Lair's defaults: registrations, routines, presets (D7)", () => {
	test('the spine, the welcome, the turn order, the actions and three routines', () => {
		const r = lairRegistrations()
		assert.equal(r.reply.pipeline, LAIR_REPLY_SPEC_ID)
		assert.equal(r.welcome.pipeline, LAIR_WELCOME_SPEC_ID)
		assert.equal((r.welcome.trigger as any).event, sessionEvents.memberAdded)
		assert.deepEqual(actionsOf(defaultsOf()), [
			'core:spec/lair-build-room#build-room',
			'core:spec/lair-file-room#file',
			'core:spec/lair-nudge#nudge',
			'core:spec/lair-reveal#reveal',
			'core:spec/lair-roll#roll',
			'core:spec/lair-roll-answer#answer',
			'core:spec/lair-room-answer#room',
			'core:spec/lair-trap#trap',
			'core:spec/lair-whisper#whisper',
		])
		assert.deepEqual(routinesOf(effectiveOf('lair-rules')), {
			'after-each-round→lair-keeper': 'review',
			'on-event→lair-scratchpad': 'full',
			'on-event→lair-file-current-room': 'off',
		})
		// The scratchpad listens for the Castellan's Sanctum replies only —
		// a live row finished, never a row written whole (L4).
		assert.deepEqual((r.scratchpad.trigger as any).cadence.options, {
			event: sessionEvents.messageCompleted,
			where: {
				all: [
					{ on: 'channel', equals: 'sanctum' },
					{ on: 'speaker', equals: 'envoy:castellan' },
					{ on: 'liveRow', equals: true },
				],
			},
		})
		assert.equal((r.fileCurrentRoom.trigger as any).cadence.options.event, sessionEvents.sceneOpened)
	})

	test('three presets — Words only, Rules (the default, the old seed key), The rules decide (the old slug)', () => {
		const lair = corePresets().filter((p) => p.genre === LAIR_GENRE_ID)
		assert.deepEqual(lair.map((p) => p.slug), ['lair-words-only', 'lair-rules', 'lair-rules-and-dice'])
		assert.deepEqual(lair.filter((p) => p.default).map((p) => p.slug), ['lair-rules'])
		const seeds = corePresetSeeds().filter((s) => s.genreId === LAIR_GENRE_ID)
		assert.deepEqual(
			seeds.map((s) => [s.seedKey, s.isDefault]),
			[
				['core-lair-words-only', false],
				['core-lair-default', true],
				['core-lair-rules-and-dice', false],
			],
		)
	})

	test('Words only: no rolls, no rooms, the keeper Off — words, locked', () => {
		const p = corePresets().find((x) => x.slug === 'lair-words-only')!
		const r = lairRegistrations()
		assert.deepEqual(
			[...(p.registrations?.drop ?? [])].sort(),
			[...r.roll, ...r.buildRoom, ...r.fileRoom, ...r.roomAnswer, r.fileCurrentRoom].map((x) => x.key).sort(),
		)
		assert.deepEqual(p.registrations?.change, [{ key: r.keeper.key, mode: 'off' }])
		assert.deepEqual(settingValueOf(p.settings!.rigour as any), { value: 'prose', lock: true, askAtStart: false })
		assert.deepEqual(settingValueOf(p.settings!.roomsLayer as any), { value: false, lock: true, askAtStart: false })
		const eff = effectiveOf('lair-words-only')
		assert.deepEqual(actionsOf(eff), [
			'core:spec/lair-nudge#nudge',
			'core:spec/lair-reveal#reveal',
			'core:spec/lair-trap#trap',
			'core:spec/lair-whisper#whisper',
		])
		assert.deepEqual(routinesOf(eff), { 'after-each-round→lair-keeper': 'off', 'on-event→lair-scratchpad': 'full' })
	})

	test('The rules decide: scripts, locked — no ruleset locked (★F, ruled 2026-10-23); Decide checks at once off on the form', () => {
		const p = corePresets().find((x) => x.slug === 'lair-rules-and-dice')!
		assert.equal(p.registrations, undefined)
		// The rules follow the session, never the genre: the start form picks rules that decide (as Story's Rule Based).
		assert.deepEqual(Object.keys(p.settings!), ['rigour'])
		assert.deepEqual(settingValueOf(p.settings!.rigour as any), { value: 'scripts', lock: true, askAtStart: false })
		assert.ok(!/Vis Itineris|d20|dice/i.test(String(p.description)), 'the description names no ruleset and no die')
		assert.equal((p.defaults as any).genreFields.autoRoll, false)
		assert.deepEqual(actionsOf(effectiveOf('lair-rules-and-dice')), actionsOf(defaultsOf()))
	})

	test('one door: the defaults and every preset pass registrationFindings clean', () => {
		const docs = new Map(CORE_SPECS.map((s) => [s.slug, s.build()]))
		const pipeline = (id: string) => docs.get(id)
		assert.deepEqual(registrationFindings(defaultsOf(), { pipeline, layer: LAIR_GENRE_ID }).map((f) => f.message), [])
		for (const slug of ['lair-words-only', 'lair-rules', 'lair-rules-and-dice'])
			assert.deepEqual(registrationFindings(effectiveOf(slug), { pipeline, layer: slug }).map((f) => f.message), [], slug)
	})
})

/* ── the turn, executed ─────────────────────────────────────────────────── */

describe('a Lair turn', () => {
	/**
	 * A planned turn at a table that rolls nothing (Freeform): the plan, the
	 * plan row in the Sanctum carrying the turn plan, and nobody speaks in
	 * this run — each named delver then takes a character turn of their own.
	 */
	test('a planned turn, nothing rolled: the plan row hands on the turns, nobody speaks, no books kept here', async () => {
		const said: string[] = []
		const receipt = await takeTurn(PLAN, saying(said))
		assert.equal(receipt.outcome, 'ok')
		assert.deepEqual(said, [])
		const row = node(receipt, `${PLAY}.plan.posted.write`)
		assert.deepEqual(
			[row.input.channel, row.input.speaker, row.input.text],
			['sanctum', 'envoy:castellan', '- The well shaft opens into the dark.'],
		)
		assert.deepEqual(row.input.turnPlan.plan, PLAN)
		// 🚧 lair fix 2: the turn plan is the plan as the turn plays it.
		assert.deepEqual(node(receipt, `${PLAY}.played`).output.main, PLAN)
		// Nobody a person plays, and nothing to wait on.
		assert.equal(row.input.turnPlan.waits ?? null, null)
		assert.equal(row.input.turnPlan.rolls ?? null, null)
		assert.ok(!ran(receipt, `${PLAY}.checks.asked.write`))
		assert.ok(!ran(receipt, `${PLAY}.checks.rolled.apply`))
		for (const n of receipt.nodes) assert.notEqual(n.input?.generating, true, n.nodeKey)
		// The table's mode, from the script: Freeform rolls nothing.
		assert.equal(node(receipt, `${PLANNED}.table`).output.main.mode, 'none')
	})

	test('🚧 a plan naming nobody (lair fix 2): the plan row hands a turn to every AI delver', async () => {
		const receipt = await takeTurn({ ...PLAN, speakers: [] })
		assert.equal(receipt.outcome, 'ok')
		const row = node(receipt, `${PLAY}.plan.posted.write`)
		assert.deepEqual(
			row.input.turnPlan.plan.speakers.map((s: any) => s.name),
			['Verity', 'Brask', 'Oln'],
		)
	})

	test('the planner is handed the table: no checks at a table that rolls nothing, the players by name', async () => {
		const receipt = await takeTurn(PLAN)
		const fields = node(receipt, `${PLANNED}.planContext`).input.fields
		assert.equal(fields.tone, 'grim')
		assert.equal(fields.checks, '')
		assert.equal(fields.players, 'Ann')
		assert.equal(fields.roomsLayer, true)
		assert.equal(node(receipt, `${PLANNED}.planContext`).input.turnDirection, 'send them down the shaft')
	})

	/**
	 * **Rules** (D3): at a table that rolls (Vis Itineris, `mechanics`), each
	 * risky attempt is a roll form under the Oracle, addressed to the GM — and
	 * the plan row says the turns wait on that row.
	 */
	test('Rules: one roll form per risky attempt, addressed to the GM, and the turns wait on the roll row', async () => {
		const receipt = await takeTurn(RISKY, {}, { ruleset: VIS('mechanics') })
		assert.equal(receipt.outcome, 'ok')
		const asked = node(receipt, `${PLAY}.checks.asked.write`)
		assert.equal(asked.result, 'ok')
		assert.deepEqual([asked.input.channel, asked.input.speaker], ['main', 'envoy:oracle'])
		assert.match(asked.input.text, /The rules call for rolls: Verity — pick the lock; Ann — climb down the shaft\./)
		const forms = asked.input.blocks
		assert.deepEqual(checkMessageBlocks(forms), [])
		assert.equal(forms.length, 2)
		const [lock, climb] = forms
		assert.deepEqual(
			[lock.kind, lock.addressee, lock.fn, lock.action, lock.stat, lock.band, lock.by, lock.referent, lock.vantage],
			['roll', 'owner', 'answer', LAIR_ROLL_ANSWER_ACTION, 'skill.sleight-of-hand', 'hard', 'character:11', 'Verity', 'pick the lock'],
		)
		assert.deepEqual(lock.bands, rollBlockBands(visItinerisRuleset))
		// A check named in words finds its key; no difficulty is the usual one.
		assert.deepEqual([climb.stat, climb.band, climb.by], ['skill.athletics', 'medium', 'character:21'])
		// The plan row, after the roll row: the turns wait on it, and Ann is a person's.
		const row = node(receipt, `${PLAY}.plan.posted.write`)
		assert.deepEqual(row.input.turnPlan.rolls, asked.output.messageId)
		assert.deepEqual(row.input.turnPlan.waits, ['character:21'])
		assert.ok(order(receipt).indexOf(`${PLAY}.checks.asked.write`) < order(receipt).indexOf(`${PLAY}.plan.posted.write`))
		// Nothing rolled yet: the dice are the GM's call.
		assert.ok(!ran(receipt, `${PLAY}.checks.rolled.apply`))
		// The planner was told the table's checks and bands.
		const fields = node(receipt, `${PLANNED}.planContext`).input.fields
		assert.match(fields.checks, /Sleight of hand \(skill\.sleight-of-hand\)/)
		assert.match(fields.bands, /Medium \(15\), the usual/)
	})

	test("a roll form's answer is the fire the roll answer takes (formFireOf)", async () => {
		const receipt = await takeTurn(RISKY, {}, { ruleset: VIS('mechanics') })
		const [lock] = node(receipt, `${PLAY}.checks.asked.write`).input.blocks
		assert.deepEqual(formFireOf(lock, { check: true, stat: 'skill.stealth', band: 'easy' }), {
			fn: 'answer',
			action: LAIR_ROLL_ANSWER_ACTION,
			payload: { check: true, stat: 'skill.stealth', band: 'easy', target: 10 },
			label: 'Stealth — Easy',
		})
		assert.equal(formFireOf(lock, { check: false })?.label, 'No check')
	})

	test('Ask me before each check off, Decide checks at once off: the risky moments are told in words', async () => {
		const receipt = await takeTurn(RISKY, {}, { ruleset: VIS('mechanics'), fields: { askBeforeRolling: false } })
		assert.equal(receipt.outcome, 'ok')
		assert.ok(!ran(receipt, `${PLAY}.checks.asked.write`))
		assert.ok(!ran(receipt, `${PLAY}.checks.rolled.apply`))
		assert.equal(node(receipt, `${PLAY}.plan.posted.write`).input.turnPlan.rolls ?? null, null)
	})

	/**
	 * **The rules decide, Decide checks at once** (D7; `autoRoll`): every check rolled at once by the
	 * ruleset handler, the dice under the Oracle — and nothing waits.
	 */
	test('The rules decide with Decide checks at once: the handler rolls each at once, and the Oracle posts the dice', async () => {
		const receipt = await takeTurn(RISKY, {}, { ruleset: VIS('scripts'), fields: { autoRoll: true } })
		assert.equal(receipt.outcome, 'ok')
		const apply = node(receipt, `${PLAY}.checks.rolled.apply`)
		assert.equal(apply.definitionId, 'core:task/ruleset-resolve@1')
		assert.equal(apply.input.mode, 'apply')
		assert.deepEqual(apply.input.owners, ['character:11', 'character:21'])
		assert.deepEqual(apply.input.deltas, [
			{ owner: 'character:11', op: 'use', check: 'skill.sleight-of-hand', against: 20, reason: 'pick the lock' },
			{ owner: 'character:21', op: 'use', check: 'skill.athletics', against: 15, reason: 'climb down the shaft' },
		])
		const shown = node(receipt, `${PLAY}.checks.rolled.shown.some.write`)
		assert.deepEqual([shown.input.channel, shown.input.speaker], ['main', 'envoy:oracle'])
		assert.deepEqual(checkMessageBlocks(shown.input.blocks), [])
		assert.deepEqual(shown.input.blocks[0], {
			kind: 'dice',
			stat: 'Sleight of hand',
			rolled: 15,
			outcome: 'Success',
			faces: [12],
			against: 20,
			five: 'success',
			explain: 'd20 12 + 3 = 15 vs 20',
			by: 'character:11',
		})
		assert.equal(shown.input.text.split('\n')[0], 'Verity — Sleight of hand: 15 against 20. Success.')
		assert.ok(!ran(receipt, `${PLAY}.checks.asked.write`))
		assert.equal(node(receipt, `${PLAY}.plan.posted.write`).input.turnPlan.rolls ?? null, null)
	})

	test('auto roll is the scripts table’s alone: at Rules it still asks', async () => {
		const receipt = await takeTurn(RISKY, {}, { ruleset: VIS('mechanics'), fields: { autoRoll: true } })
		assert.ok(ran(receipt, `${PLAY}.checks.asked.write`))
		assert.ok(!ran(receipt, `${PLAY}.checks.rolled.apply`))
	})

	test('prose rigour rolls nothing, whatever the plan calls risky', async () => {
		const receipt = await takeTurn(RISKY, {}, { ruleset: VIS('prose') })
		assert.ok(!ran(receipt, `${PLAY}.checks.asked.write`))
		assert.ok(!ran(receipt, `${PLAY}.checks.rolled.apply`))
		assert.equal(node(receipt, `${PLANNED}.planContext`).input.fields.checks, '')
	})

	/** The party knocks (B13; R9; D4): one Oracle question on main, addressed to the owner — nothing played. */
	test('the party knocks: the Oracle asks the GM to describe the room — nothing played, nothing rolled', async () => {
		const receipt = await takeTurn({ ...KNOCK_PLAN, risks: RISKY.risks }, {}, { ruleset: VIS('mechanics') })
		assert.equal(receipt.outcome, 'ok')
		assert.ok(!ran(receipt, `${PLAY}.plan.posted.write`))
		assert.ok(!ran(receipt, `${PLAY}.checks.asked.write`))
		const placeholder = node(receipt, `${DOOR}.knock.placeholder`)
		assert.deepEqual([placeholder.input.channel, placeholder.input.speaker], ['main', 'envoy:oracle'])
		const save = node(receipt, `${DOOR}.knock.save`)
		assert.equal(save.input.text, KNOCK_PLAN.knockQuestion)
		const block = save.input.blocks[0]
		assert.equal(block.kind, 'choices')
		assert.equal(block.addressee, 'owner')
		assert.equal(block.referent, 'The Drowned Hall')
		assert.equal(block.vantage, 'The Old Well')
		assert.deepEqual(block.actions.map((a: any) => [a.choice, a.label, a.fn, a.action]), [
			['describe', 'Describe The Drowned Hall…', 'room', `${LAIR_ROOM_ANSWER_SPEC_ID}#room`],
		])
		// The block may name a world action because it is addressed to the owner (L1).
		const answer = doc(LAIR_ROOM_ANSWER_SPEC_ID)
		assert.deepEqual(worldBlockFunctions([block], answer), [])
		assert.deepEqual(worldBlockFunctions([{ ...block, addressee: 'character:11' }], answer), ['room'])
	})

	test('an exit the dungeon already holds never knocks (B13)', async () => {
		const receipt = await takeTurn({ ...KNOCK_PLAN, speakers: PLAN.speakers, unknownExit: '  the stair ' })
		assert.ok(ran(receipt, `${PLAY}.plan.posted.write`))
		assert.ok(!ran(receipt, `${DOOR}.knock.save`))
	})

	/** R10: the rooms layer off (*Words only*): nothing is checked, and nothing knocks. */
	test('the rooms layer off: no exit check, and a plan walking into the unknown is played', async () => {
		const receipt = await takeTurn({ ...KNOCK_PLAN, speakers: PLAN.speakers }, {}, { fields: { roomsLayer: false } })
		assert.equal(receipt.outcome, 'ok')
		assert.ok(!ran(receipt, `${PLANNED}.rooms.on.exitCheck`))
		assert.ok(!ran(receipt, `${DOOR}.knock.save`))
		assert.ok(ran(receipt, `${PLAY}.plan.posted.write`))
		assert.equal(node(receipt, `${PLANNED}.planContext`).input.fields.roomsLayer, false)
	})

	test('the exit check reads the rooms, the whole book and every channel’s recent prose (R7, R9)', async () => {
		const d = replyDoc()
		assert.deepEqual(presetValue(d, `${PLANNED}.rooms.on.exitProse`), { channel: '*', limit: 40, talkOnly: true })
		assert.deepEqual(presetValue(d, `${PLANNED}.rooms.on.exitCheck`), { channels: ['main', 'sanctum'] })
		const receipt = await takeTurn(KNOCK_PLAN)
		const check = node(receipt, `${PLANNED}.rooms.on.exitCheck`)
		assert.deepEqual(check.input.locationEntries, ROOMS)
		assert.deepEqual(check.input.entries, ROOMS)
		assert.ok(check.input.messages)
		assert.equal(node(receipt, 'gather.rooms.read').input.params.withLinks, true)
	})

	test('a room described in prose never knocks, and the plan row carries its paragraph (R9)', async () => {
		const PASSAGE = 'The Drowned Hall is a long vault under black water.'
		const receipt = await takeTurn({ ...KNOCK_PLAN, speakers: PLAN.speakers }, {
			'core:task/undescribed-name@1': async () =>
				ok({ main: {}, undescribed: '', describedBy: 'prose', entryId: null, passage: PASSAGE }),
		})
		assert.ok(!ran(receipt, `${DOOR}.knock.save`))
		assert.equal(node(receipt, `${PLAY}.plan.posted.write`).input.turnPlan.locationPassage, PASSAGE)
	})

	/**
	 * **A character turn** (owner ruling 2026-09-30, kept): one delver, the
	 * standing plan, their own streamed row, their own lore and face — and,
	 * since the rewrite, no books: the keeper routine reads the round.
	 */
	test('a character turn: one delver, the standing plan, their own row, lore and face — and no books', async () => {
		const said: string[] = []
		const receipt = await takeTurn(PLAN, saying(said), { characterId: 12 })
		assert.equal(receipt.outcome, 'ok')
		assert.deepEqual(said, ['Brask'])
		assert.equal(node(receipt, `${CT}.plan`).definitionId, 'core:query/turn-plan@1')
		assert.deepEqual(node(receipt, `${CT}.context`).input.plan, PLAN)
		assert.deepEqual(node(receipt, `${CT}.context`).input.sideCharacter, { characterId: 12 })
		const placeholder = node(receipt, `${CT}.placeholder`)
		assert.deepEqual([placeholder.input.generating, placeholder.input.channel, placeholder.input.speaker], [true, 'main', 'character:12'])
		assert.equal(node(receipt, `${CT}.save`).input.text, '<Brask>')
		assert.equal(node(receipt, `${CT}.lore`).input.speaker, 'character:12')
		for (const key of ['search', 'entities', 'link', 'eligible']) assert.equal(node(receipt, `${CT}.${key}`).input.speaker, 'character:12', key)
		assert.equal(node(receipt, `${CT}.rank`).input.shownElsewhere, 1)
		assert.ok(ran(receipt, `${CT}.spriteShow`))
		// No plan, and no books in the reply.
		assert.ok(!receipt.nodes.some((n: any) => String(n.nodeKey).startsWith(`${PLANNED}.`) && n.result === 'ok'))
		assert.ok(!receipt.nodes.some((n: any) => /keeper/.test(n.nodeKey)))
		assert.deepEqual(receipt.nodes.filter((n: any) => n.input?.generating === true).map((n: any) => n.nodeKey), [`${CT}.placeholder`])
	})

	/**
	 * 🚧 RF fix 2 (2026-10-23): "the character responds as if they are the
	 * narrator, using 'you'". The owner's turn sent the voice's system prompt
	 * and the GM's one line, and nothing after it: on the chat wire the seed
	 * line is dropped, no cue follows a user turn in a party of one, and the
	 * reminder waited for 3000 tokens of history. The fixture's assemble lays
	 * the voice's own row out as the app does — the system prompt, the
	 * history, then the reminder only when the step's trigger lets it through
	 * — so what the character call (`say`) received is what is asserted.
	 */
	test("🚧 a character turn's prompt (RF fix 2): the voice's own row, its person said outright, its reminder from the first line — no narrator's \"you\"", async () => {
		const voiceRow = CORE_PROMPTS.find(
			(p) => p.nodeType === 'core:task/build-side-character-context' && (p.defaultForSpecs ?? []).includes(LAIR_REPLY_SPEC_ID),
		)!
		assert.equal(voiceRow.name, 'Lair voice')
		const render = (text: string, vars: Record<string, string>) =>
			text
				.replace(/\{\{#if (\w+)\}\}([\s\S]*?)(?:\{\{else\}\}([\s\S]*?))?\{\{\/if\}\}/g, (_m, v: string, yes: string, no?: string) => (vars[v] ? yes : (no ?? '')))
				.replace(/\{\{(\w+)\}\}/g, (_m, v: string) => vars[v] ?? '')
		const heard: any[] = []
		const receipt = await takeTurn(
			PLAN,
			{
				'core:task/assemble@2': async (i: any) => {
					const vars = { char: i?.templateContext?.who ?? '?', playerLabel: 'Dungeon Master', location: 'The Old Well', characterNames: 'Verity, Brask', stateSummary: 'Brask: hp 9.' }
					// The history is one GM line — far below the 3000 tokens the reminder used to wait for.
					const placed = (i?.params?.postHistoryTokenTrigger ?? POST_HISTORY_TOKEN_TRIGGER) === 0
					const context = {
						who: vars.char,
						system: render(voiceRow.fields.systemPrompt ?? '', vars),
						history: ['Dungeon Master: The floor gives way and Brask tumbles into the dark.'],
						reminder: placed ? render(voiceRow.fields.postHistoryInstructions ?? '', vars) : null,
					}
					return ok({ main: context, context })
				},
				'core:oracle/generate-text@1': async (i: any) => {
					heard.push(i?.context)
					return ok({ main: '<line>', text: '<line>' })
				},
			},
			{ characterId: 12 },
		)
		assert.equal(receipt.outcome, 'ok')
		assert.equal(node(receipt, `${CT}.context`).definitionId, 'core:task/build-side-character-context@1')
		assert.deepEqual(params(receipt, `${CT}.prompt`, 'postHistoryTokenTrigger'), { postHistoryTokenTrigger: 0 })
		assert.equal(heard.length, 1)
		const [prompt] = heard
		assert.equal(prompt.who, 'Brask')
		// The person, said outright: speech first, action third, no "you" narration.
		assert.match(prompt.system, /what Brask says, in quotes and in the first person/)
		assert.match(prompt.system, /what Brask does while saying it, in the third person, by name/)
		assert.match(prompt.system, /Never narrate in the second person/)
		// The reminder, after the GM's line: whose turn it is, in the same person.
		assert.ok(prompt.reminder, 'the reminder is placed from the first line')
		assert.match(prompt.reminder, /it is Brask's turn, and only Brask's, at The Old Well/)
		assert.match(prompt.reminder, /in the first person, and what Brask does, in the third: never narration to a "you"/)
		// No narrator's framing reaches the character call: not the GM's lines as told to "you", not the Castellan's or the planner's prompt.
		for (const text of [prompt.system, prompt.reminder])
			assert.doesNotMatch(
				text,
				/telling you what happens|the world around you|You are the Castellan|steward of a dungeon|narrate what happens next|plan the party's next moment/i,
			)
	})

	for (const channel of ['main', 'sanctum'])
		test(`Narrate from ${channel}: one streamed Castellan row on main`, async () => {
			const said: string[] = []
			const receipt = await takeTurn(PLAN, saying(said), { via: 'narrate', channel })
			assert.equal(receipt.outcome, 'ok')
			assert.deepEqual(said, ['narrator'])
			const placeholder = node(receipt, 'via.narrate.placeholder')
			assert.deepEqual([placeholder.input.generating, placeholder.input.channel, placeholder.input.speaker], [true, 'main', 'envoy:castellan'])
			assert.equal(node(receipt, 'via.narrate.save').input.text, '<narrator>')
			assert.ok(!receipt.nodes.some((n: any) => String(n.nodeKey).startsWith('via.turn.') && n.result === 'ok'))
		})

	test("a Sanctum line is the Castellan talking: one streamed reply, its notes in front of it — no rewrite here", async () => {
		const said: string[] = []
		const receipt = await takeTurn(PLAN, saying(said), { via: 'voice', channel: 'sanctum' })
		assert.equal(receipt.outcome, 'ok')
		assert.deepEqual(said, ['envoy:castellan'])
		const T = 'via.turn.channel.sanctum'
		assert.equal(node(receipt, `${T}.context`).input.speaker, 'envoy:castellan')
		assert.equal(node(receipt, `${T}.context`).input.scratchpad, SCRATCHPAD)
		assert.deepEqual(params(receipt, `${T}.talk`, 'channel', 'unplayedOnly'), { channel: 'sanctum', unplayedOnly: false })
		assert.deepEqual(params(receipt, `${T}.story`, 'channel', 'limit'), { channel: 'main', limit: 12 })
		assert.ok(!receipt.nodes.some((n: any) => String(n.nodeKey).startsWith(`${T}.pad`) && n.nodeKey !== `${T}.pad`))
		assert.ok(!receipt.nodes.some((n: any) => String(n.nodeKey).startsWith('via.turn.channel.story.') && n.result === 'ok'))
	})

	test('Sanctum talk steers the story (R13): on, the planner reads the talk and the notes; off, neither', async () => {
		const on = await takeTurn(PLAN, {}, { fields: { sanctumSteers: true } })
		assert.deepEqual(params(on, `${PLANNED}.steer.on.talk`, 'channel', 'unplayedOnly', 'limit'), { channel: 'sanctum', unplayedOnly: true, limit: 12 })
		assert.equal(node(on, `${PLANNED}.planContext`).input.scratchpad, SCRATCHPAD)
		const off = await takeTurn(PLAN, {}, { fields: { sanctumSteers: false } })
		assert.ok(!ran(off, `${PLANNED}.steer.on.talk`))
		assert.equal(node(off, `${PLANNED}.planContext`).input.scratchpad, undefined)
	})
})

/* ── the scripts, run as plain functions ─────────────────────────────── */

describe("the Lair's scripts (the app runs them in QuickJS)", () => {
	const ACTION = { id: LAIR_ROLL_ANSWER_ACTION, fn: 'answer' }

	test('lair-table: the mode by rigour, dice and the GM’s settings', () => {
		const mode = (ruleset: unknown, fields: Record<string, unknown> = {}) =>
			runScript('core:script/lair-table', { ruleset, session: sessionDoc(fields) }).mode
		assert.equal(mode(FREEFORM), 'none')
		assert.equal(mode(VIS('prose')), 'none')
		assert.equal(mode(VIS('mechanics')), 'ask')
		assert.equal(mode(VIS('mechanics'), { askBeforeRolling: false }), 'none')
		assert.equal(mode(VIS('scripts')), 'ask')
		assert.equal(mode(VIS('scripts'), { autoRoll: true }), 'auto')
		assert.equal(mode(VIS('mechanics'), { autoRoll: true }), 'ask')
		// Any ruleset rolls what the inlet carries, and nothing it does not (S4: no table is baked).
		const plugin = { id: 'acme:ruleset/dice@1', rigour: 'mechanics', dice: true, checks: [{ key: 'luck', label: 'Luck' }], bands: [{ id: 'hard', label: 'Hard', target: 12 }] }
		assert.equal(mode(plugin), 'ask')
		assert.equal(mode({ id: 'acme:ruleset/dice@1', rigour: 'mechanics' }), 'none')
		const t = runScript('core:script/lair-table', { ruleset: plugin, session: sessionDoc() })
		assert.deepEqual([t.fields.checks, t.fields.bands, t.fields.players], ['Luck (luck)', 'Hard (12)', 'Ann'])
	})

	test('lair-turn: beats, who waits, and nothing to roll when the mode is none', () => {
		const out = runScript('core:script/lair-turn', {
			plan: RISKY,
			table: { mode: 'none' },
			session: sessionDoc(),
			ruleset: VIS(),
			action: ACTION,
		})
		assert.deepEqual(out, {
			plan: RISKY,
			beats: '- The well shaft opens into the dark.',
			waits: ['character:21'],
			askForms: null,
			askText: null,
			autoDeltas: null,
			autoOwners: null,
		})
	})

	/**
	 * 🚧 lair fix 2 (2026-10-22): a party of one answered `speakers: []` to a
	 * GM line and nothing was written. The GM asked for a turn: when the plan
	 * names nobody in the party, every AI delver takes one, in cast order.
	 */
	test('lair-turn: a plan naming nobody in the party hands a turn to every AI delver, in cast order', () => {
		const turn = (plan: unknown, cast: unknown = CAST) =>
			runScript('core:script/lair-turn', {
				plan,
				table: { mode: 'none' },
				session: { ...sessionDoc(), cast },
				ruleset: VIS(),
				action: ACTION,
			})
		const AI = [
			{ name: 'Verity', intent: '' },
			{ name: 'Brask', intent: '' },
			{ name: 'Oln', intent: '' },
		]
		// Empty: the AI delvers, never the seated player's (Ann waits for her player only when named).
		const empty = turn({ ...PLAN, speakers: [] })
		assert.deepEqual(empty.plan.speakers, AI)
		assert.equal(empty.waits, null)
		assert.equal(empty.beats, '- The well shaft opens into the dark.')
		// Names the party lacks count as nobody.
		assert.deepEqual(turn({ ...PLAN, speakers: [{ name: 'The wyrm', intent: 'roar' }] }).plan.speakers, AI)
		// No beats either: one line each, so the plan row still posts and hands the turns on.
		assert.equal(turn({ ...PLAN, beats: [], speakers: [] }).beats, '- Verity takes a turn.\n- Brask takes a turn.\n- Oln takes a turn.')
		// A party of one: that one (owner's walk, 2026-10-22).
		const one = { sessionCharacters: [{ character: { id: 1, name: 'Suzume Akagane', nickname: 'Suzume' } }], sessionPersonas: [] }
		assert.deepEqual(turn({ ...PLAN, speakers: [] }, one).plan.speakers, [{ name: 'Suzume Akagane', intent: '' }])
		// Cast order is the seats' `position` when they carry one.
		const placed = {
			sessionCharacters: [
				{ position: 2, character: { id: 11, name: 'Verity' } },
				{ position: 0, character: { id: 13, name: 'Oln' } },
				{ position: 1, character: { id: 12, name: 'Brask', enabled: true } },
				{ position: 3, enabled: false, character: { id: 14, name: 'Sleeping Sal' } },
			],
			sessionPersonas: [],
		}
		assert.deepEqual(turn({ ...PLAN, speakers: [] }, placed).plan.speakers.map((s: any) => s.name), ['Oln', 'Brask', 'Verity'])
		// A plan that names somebody is the plan, untouched — a seated player alone included.
		assert.deepEqual(turn(PLAN).plan, PLAN)
		const annAlone = turn({ ...PLAN, speakers: [{ name: 'Ann', intent: 'look around' }] })
		assert.deepEqual(annAlone.plan.speakers, [{ name: 'Ann', intent: 'look around' }])
		assert.deepEqual(annAlone.waits, ['character:21'])
		// Nobody to hand a turn to: nothing, as before.
		const empty0 = turn({ ...PLAN, beats: [], speakers: [] }, { sessionCharacters: [], sessionPersonas: [] })
		assert.deepEqual([empty0.plan.speakers, empty0.beats], [[], null])
	})

	test('lair-turn: an attempt by nobody seated is skipped; a check nobody knows is not auto-rolled', () => {
		const plan = { ...RISKY, risks: [{ who: 'Nobody', attempt: 'x', check: 'skill.stealth', difficulty: '' }, { who: 'Oln', attempt: 'juggle', check: 'juggling', difficulty: 'easy' }] }
		const auto = runScript('core:script/lair-turn', { plan, table: { mode: 'auto' }, session: sessionDoc(), ruleset: VIS('scripts'), action: ACTION })
		assert.equal(auto.autoDeltas, null)
		const ask = runScript('core:script/lair-turn', { plan, table: { mode: 'ask' }, session: sessionDoc(), ruleset: VIS(), action: ACTION })
		// The GM is offered a check anyway — the first in the ruleset's order (its way, a bare roll) — and picks.
		assert.deepEqual(ask.askForms.map((f: any) => [f.by, f.stat, f.band]), [['character:13', 'die', 'easy']])
		assert.deepEqual(checkMessageBlocks(ask.askForms), [])
	})

	test('lair-turn: a check and a difficulty named as the table lists them — "Strength (key)", "Hard (20)" — are found (L5 walk)', () => {
		// The planner copies the table's words: the label and the key in brackets.
		const plan = {
			...RISKY,
			risks: [{ who: 'Verity', attempt: 'force the gate', check: 'Athletics (skill.athletics)', difficulty: 'Hard (20)' }],
		}
		const ask = runScript('core:script/lair-turn', { plan, table: { mode: 'ask' }, session: sessionDoc(), ruleset: VIS(), action: ACTION })
		assert.deepEqual(ask.askForms.map((f: any) => [f.stat, f.band]), [['skill.athletics', 'hard']])
		// A label alone, or the key alone, as before.
		const byLabel = runScript('core:script/lair-turn', {
			plan: { ...plan, risks: [{ ...plan.risks[0], check: 'Athletics', difficulty: 'Very hard' }] },
			table: { mode: 'ask' },
			session: sessionDoc(),
			ruleset: VIS(),
			action: ACTION,
		})
		assert.deepEqual(byLabel.askForms.map((f: any) => [f.stat, f.band]), [['skill.athletics', 'very-hard']])
		// 🚧 S4: a check's plain name — the last part of its key — finds it when it names one check alone.
		// Vis Itineris's own words come first (GM 2026-10-23, G2 ★1): "Strength" is its ability check.
		const auto = (check: string) =>
			runScript('core:script/lair-turn', {
				plan: { ...plan, risks: [{ ...plan.risks[0], check }] },
				table: { mode: 'auto' },
				session: sessionDoc(),
				ruleset: VIS('scripts'),
				action: ACTION,
			}).autoDeltas
		assert.equal(auto('sleight of hand')[0].check, 'skill.sleight-of-hand')
		assert.equal(auto('Strength')[0].check, 'ability.strength')
		// With no words of the ruleset's, "Strength" names a save and an ability check: nobody's, nothing decided at once.
		const unsaid = { ...VIS('scripts'), checks: VIS('scripts').checks.map((c: any) => ({ key: c.key, label: c.key })) }
		const bare = runScript('core:script/lair-turn', { plan: { ...plan, risks: [{ ...plan.risks[0], check: 'Strength' }] }, table: { mode: 'auto' }, session: sessionDoc(), ruleset: unsaid, action: ACTION })
		assert.equal(bare.autoDeltas, null)
		assert.equal(auto('Strength save')[0].check, 'save.strength')
	})

	test('lair-dice: outcomes as dice blocks, a line each; nothing rolled says so', () => {
		const r = ROLLED([{ owner: 'character:12', check: 'save.dexterity', against: 10 }])
		const out = runScript('core:script/lair-dice', { ...r, ruleset: VIS(), session: sessionDoc() })
		assert.deepEqual(checkMessageBlocks(out.blocks), [])
		assert.equal(out.blocks[0].stat, 'Dexterity save')
		assert.equal(out.text, 'Brask — Dexterity save: 15 against 10. Success.')
		const none = runScript('core:script/lair-dice', { outcomes: [], explain: [], ruleset: VIS(), session: sessionDoc() })
		assert.deepEqual(none, { blocks: null, text: 'Nothing was rolled: it goes as the story says.' })
	})

	test("🚧 lair-dice: a check the handler left unworded reads in the ruleset's own outcome words (S4)", () => {
		const unworded = {
			owner: 'character:12',
			kind: 'check',
			text: 'Brask — save.dexterity',
			check: { selector: 'save.dexterity', natural: 3, total: 4, against: 10, band: 'failure', five: 'fail' },
		}
		const vis = runScript('core:script/lair-dice', { outcomes: [unworded], explain: [], ruleset: VIS(), session: sessionDoc() })
		assert.equal(vis.blocks[0].outcome, 'Failure')
		// By its step on the five when the id is none of the ruleset's: Wherewithal's words.
		const wherewithal = { id: wherewithalRuleset.id, rigour: 'mechanics', settings: {}, ...lairRulesRow(wherewithalRuleset) }
		const ww = runScript('core:script/lair-dice', { outcomes: [unworded], explain: [], ruleset: wherewithal, session: sessionDoc() })
		assert.equal(ww.blocks[0].outcome, 'It falls short')
		assert.equal(ww.text, 'Brask — save.dexterity: 4 against 10. It falls short.')
	})

	test('🚧 lair-dice: the handler\'s outcome block, any check method — passed through, named as the table names the check, a line each (M2, 2026-10-22)', () => {
		const pool = {
			owner: 'character:12',
			kind: 'check',
			text: 'Brask — use (Dexterity save): Success',
			check: { selector: 'save.dexterity', total: 2, band: 'success', five: 'success', label: 'Success', method: 'dice-pool', methodKey: 'pool' },
			block: { kind: 'dice', method: 'dice-pool', stat: 'Dex save', rolled: 2, faces: [6, 2, 5], pool: { size: 3, successes: 2, successOn: 5 }, outcome: 'Success', five: 'success', by: 'character:12' },
		}
		const judged = {
			owner: 'character:12',
			kind: 'check',
			text: 'Brask — use: As the story tells',
			check: { selector: '', method: 'none', methodKey: null },
			block: { kind: 'dice', method: 'none', stat: 'use', outcome: 'As the story tells', by: 'character:12' },
		}
		const bid = {
			owner: 'character:12',
			kind: 'check',
			text: 'Brask — use (Nerve): Success',
			check: { selector: 'nerve', total: 2, band: 'success', five: 'success', label: 'Success', method: 'bid', methodKey: 'risk' },
			block: { kind: 'dice', method: 'bid', stat: 'Nerve', rolled: 2, outcome: 'Success', five: 'success', by: 'character:12' },
		}
		const out = runScript('core:script/lair-dice', { outcomes: [pool, judged, bid], explain: [], ruleset: VIS(), session: sessionDoc() })
		assert.deepEqual(checkMessageBlocks(out.blocks), [])
		assert.equal(out.blocks.length, 3)
		assert.equal(out.blocks[0].stat, 'Dexterity save', 'the table names the check')
		assert.deepEqual(out.blocks[0].pool, { size: 3, successes: 2, successOn: 5 })
		assert.equal(out.blocks[1].method, 'none')
		assert.equal(out.blocks[1].rolled, undefined)
		assert.equal(
			out.text,
			['Brask — Dexterity save: 2 successes on 3 dice. Success.', 'Brask — use: As the story tells.', 'Brask — Nerve: spent 2. Success.'].join('\n'),
		)
	})

	test('🚧 lair-call-roll: rules that decide checks with no difficulty to pick refuse politely, saying why (M2)', () => {
		const pool = { id: 'acme:ruleset/pool@1', rigour: 'mechanics', dice: false, checks: [], bands: [], band: null, methods: ['dice-pool'] }
		const none = runScript('core:script/lair-call-roll', { recipients: ['character:12'], text: 'force the gate', session: sessionDoc(), ruleset: pool, action: ACTION })
		assert.equal(none.forms, null)
		assert.match(none.text, /without a difficulty to pick/)
	})

	test('lair-roll: a check is one use against the band, at mechanics or higher; No check is a line', () => {
		const roll = (payload: unknown, rigour = 'mechanics') =>
			runScript('core:script/lair-roll', { payload, referent: 'Verity', vantage: 'pick the lock', session: sessionDoc(), ruleset: VIS(rigour) })
		assert.deepEqual(roll({ check: true, stat: 'skill.stealth', band: 'easy', target: 10 }), {
			rolled: true,
			deltas: [{ owner: 'character:11', op: 'use', check: 'skill.stealth', reason: 'pick the lock', against: 10 }],
			owners: ['character:11'],
			rigour: 'mechanics',
			said: null,
		})
		assert.equal(roll({ check: true, stat: 'skill.stealth', band: 'hard' }, 'scripts').deltas[0].against, 20)
		assert.equal(roll({ check: true, stat: 'skill.stealth', band: 'hard' }, 'scripts').rigour, 'scripts')
		assert.deepEqual(roll({ check: false, stat: 'skill.stealth', band: 'easy' }), {
			rolled: null,
			deltas: null,
			owners: null,
			rigour: null,
			said: 'Verity — pick the lock: no roll. It goes as the story says.',
		})
	})

	test('lair-call-roll: one form per delver picked; a table that rolls nothing says so', () => {
		const out = runScript('core:script/lair-call-roll', {
			recipients: ['character:12', 'persona:21'],
			text: 'force the gate',
			session: sessionDoc(),
			ruleset: VIS(),
			action: ACTION,
		})
		assert.deepEqual(checkMessageBlocks(out.forms), [])
		assert.deepEqual(out.forms.map((f: any) => [f.by, f.band, f.addressee, f.referent]), [
			['character:12', 'medium', 'owner', 'Brask'],
			['character:21', 'medium', 'owner', 'Ann'],
		])
		assert.equal(out.text, 'The Dungeon Master calls for rolls: Brask, Ann — force the gate.')
		const none = runScript('core:script/lair-call-roll', { recipients: ['character:12'], text: '', session: sessionDoc(), ruleset: FREEFORM, action: ACTION })
		assert.equal(none.forms, null)
		assert.match(none.text, /roll nothing/)
	})

	test('lair-room: the body with its Exits line, the fields, a link per way to a room the book holds', () => {
		const out = runScript('core:script/lair-room', {
			draft: {
				content: 'A long vault under black water.',
				exits: [
					{ way: 'north', to: 'The Old Well' },
					{ way: 'down', to: 'The Sunken Vault' },
					{ way: 'up', to: 'the stair' },
				],
				fields: { category: 'Floor 2' },
			},
			name: 'The Drowned Hall',
			rooms: ROOMS,
			here: 2,
		})
		assert.deepEqual(out, {
			name: 'The Drowned Hall',
			content: 'A long vault under black water.\n\nExits: north → The Old Well, down → The Sunken Vault, up → the stair',
			fields: { category: 'Floor 2' },
			// The Stair is where the party stand: the knock's own step links it, both ways.
			links: [{ to: 1, linkType: 'leads north to', reverseLinkType: 'leads to' }],
		})
	})

	test('lair-welcome: a person’s seat is told to the GM; a delver the GM added is nobody to announce', () => {
		assert.match(runScript('core:script/lair-welcome', { payload: { ref: 'persona:21' }, session: sessionDoc() }).text, /^Ann has joined the table/)
		assert.equal(runScript('core:script/lair-welcome', { payload: { ref: 'character:11' }, session: sessionDoc() }).text, null)
		assert.equal(runScript('core:script/lair-welcome', { payload: { ref: 'envoy:oracle' }, session: sessionDoc() }).text, null)
	})

})

/* ── the routines (D7) ─────────────────────────────────────────────────── */

describe("the Lair's routines: the keeper, the scratchpad, filing the current room", () => {
	test("the keeper is Story's reckoning, on the Lair's prompt, reading the inlet's ruleset, filing no places, moving no clock", () => {
		const d = doc(LAIR_KEEPER_SPEC_ID)
		assert.equal(d.nodes[0]!.definitionId, 'core:inlet/routine')
		assert.equal(d.nodes.find((n) => n.key === 'duties')!.definitionId, 'core:task/reckoning-duties')
		// The rooms are the GM's, and so is the story clock (the Lair gets no model-driven time).
		assert.deepEqual(presetValue(d, 'duties'), { placesOnMove: false, time: false })
		assert.deepEqual(presetValue(d, 'reckon.on.reckonContext', 'prompts'), { seedKey: LAIR_PROMPT_KEYS.keeper })
		// The crib and the sort read the inlet's ruleset, as Story's do: the one change grammar
		// counts `mechanics` and `scripts` alike, so the Lair's own lift was retired (GM, 2026-10-23).
		assert.equal(d.nodes.find((n) => n.key === 'reckon.on.tableRules'), undefined)
		const story = doc(STORY_RECKONING_SPEC_ID)
		for (const key of ['reckon.on.crib', 'reckon.on.reckoned'])
			assert.deepEqual(d.nodes.find((n) => n.key === key)!.config, story.nodes.find((n) => n.key === key)!.config, key)
		// It reads only the session, so the owner may run it after each turn instead (R12, R36).
		assert.deepEqual(registrationFindings([register(afterEachTurn(), d)], { pipeline: () => d }).map((f) => f.message), [])
	})

	const routineRun = async (spec: string, input: Record<string, unknown>, json: unknown, over: Bindings = {}, reviewer?: (r: any) => Promise<any>) => {
		const d = doc(spec)
		return (await run(d, {
			world: { ...world, authorDefaults: authorDefaultsOf(d) },
			input: { sessionScope: { sessionId: 1 }, session: sessionDoc(), ruleset: FREEFORM, ...input },
			seed: 'lair-routine',
			triggerSource: 'ui',
			bindings: lairBindings(json, over),
			...(reviewer ? { reviewer } : {}),
		} as any)) as any
	}

	test("the scratchpad: the exchange just had, rewritten into the Castellan's notes — nothing written for an empty answer", async () => {
		const wrote = await routineRun(LAIR_SCRATCHPAD_SPEC_ID, { routine: { mode: 'full' } }, { scratchpad: 'Vault: two rooms north.' })
		assert.equal(wrote.outcome, 'ok')
		assert.deepEqual(params(wrote, 'talk', 'channel', 'limit'), { channel: 'sanctum', limit: 4 })
		assert.equal(node(wrote, 'notesContext').input.scratchpad, SCRATCHPAD)
		assert.equal(node(wrote, 'notesContext').input.speaker, 'envoy:castellan')
		assert.deepEqual(node(wrote, 'kept.written.write').input.value, { 'castellan-scratchpad': 'Vault: two rooms north.' })
		const kept = await routineRun(LAIR_SCRATCHPAD_SPEC_ID, { routine: { mode: 'full' } }, { scratchpad: '' })
		assert.equal(kept.outcome, 'ok')
		assert.ok(!ran(kept, 'kept.written.write'))
	})

	const PASSAGE = 'The Drowned Hall is a long vault under black water, its far door rusted open.'
	const inProse: Bindings = {
		'core:task/undescribed-name@1': async () => {
			const out = { undescribed: '', describedBy: 'prose', entryId: null, passage: PASSAGE }
			return ok({ main: out, ...out })
		},
		'core:query/session-state@1': async () =>
			ok({ main: {}, state: { world: { location: 'The Drowned Hall' }, cast: {} }, version: 7 }),
	}
	const DRAFT = { content: 'A long vault.', exits: [{ way: 'up', to: 'The Stair' }], fields: { category: '' } }

	test('filing the current room: a room only prose describes is drafted and filed — held for review on Review', async () => {
		const reviewed: string[] = []
		const d = doc(LAIR_FILE_CURRENT_ROOM_SPEC_ID)
		assert.deepEqual(presetValue(d, 'described.prose.mode.held.save', 'settings'), { review: 'on' })
		assert.equal(presetValue(d, 'described.prose.mode.written.save', 'settings'), undefined)
		const held = await routineRun(LAIR_FILE_CURRENT_ROOM_SPEC_ID, { routine: { mode: 'review' } }, DRAFT, inProse, async (r: any) => {
			reviewed.push(r.nodeKey)
			return { action: 'approve' }
		})
		assert.equal(held.outcome, 'ok')
		assert.deepEqual(reviewed, ['described.prose.mode.held.save'])
		const save = node(held, 'described.prose.mode.held.save')
		assert.equal(save.input.name, 'The Drowned Hall')
		assert.equal(save.input.content, 'A long vault.\n\nExits: up → The Stair')
		assert.deepEqual(save.input.links, [{ to: 2, linkType: 'leads up to', reverseLinkType: 'leads to' }])
		assert.equal(node(held, 'described.prose.draftContext').input.turnDirection, PASSAGE)
		const written = await routineRun(LAIR_FILE_CURRENT_ROOM_SPEC_ID, { routine: { mode: 'full' } }, DRAFT, inProse)
		assert.ok(ran(written, 'described.prose.mode.written.save'))
	})

	test('filing the current room: a room the book holds, or nothing describes, files nothing', async () => {
		const receipt = await routineRun(LAIR_FILE_CURRENT_ROOM_SPEC_ID, { routine: { mode: 'full' } }, DRAFT)
		assert.equal(receipt.outcome, 'ok')
		assert.ok(!receipt.nodes.some((n: any) => String(n.nodeKey).startsWith('described.') && n.result === 'ok'))
	})

	test('the welcome tells the GM in the Sanctum when a person’s seat joins, and nobody else', async () => {
		const d = doc(LAIR_WELCOME_SPEC_ID)
		const welcome = async (ref: string) =>
			(await run(d, {
				world: { ...world, authorDefaults: authorDefaultsOf(d) },
				input: { payload: { ref, change: 'added' }, session: sessionDoc(), sessionScope: { sessionId: 1 } },
				seed: 'lair-welcome',
				triggerSource: 'ui',
				bindings: lairBindings({}),
			})) as any
		const seat = await welcome('persona:21')
		const write = node(seat, 'told.seated.write')
		assert.deepEqual([write.input.channel, write.input.speaker], ['sanctum', 'envoy:castellan'])
		assert.match(write.input.text, /^Ann has joined the table/)
		assert.ok(!ran(await welcome('character:12'), 'told.seated.write'))
	})
})

/* ── the rolls (D3) ─────────────────────────────────────────────────── */

describe('Roll and the roll answer: the dice are the ruleset’s, the call the GM’s, the voice the Oracle’s', () => {
	const answer = async (payload: unknown, ruleset: unknown = VIS('mechanics')) => {
		const d = doc(LAIR_ROLL_ANSWER_SPEC_ID)
		return (await run(d, {
			world: { ...world, authorDefaults: authorDefaultsOf(d) },
			input: {
				payload,
				form: { kind: 'roll', referent: 'Verity', vantage: 'pick the lock', addressee: 'owner' },
				presser: 'user:1',
				sessionScope: { sessionId: 1 },
				session: sessionDoc(),
				ruleset,
			},
			seed: 'lair-roll',
			triggerSource: 'ui',
			bindings: lairBindings({}),
		})) as any
	}

	test('the answer is a form-venue action the GM presses; Roll is the GM’s composer press, collecting who and what', () => {
		const [a] = (doc(LAIR_ROLL_ANSWER_SPEC_ID).contributes as any).actions
		assert.deepEqual([a.key, a.venue, a.audience.act], ['answer', [{ kind: 'form' }], ['owner']])
		assert.equal(`${LAIR_ROLL_ANSWER_SPEC_ID}#answer`, LAIR_ROLL_ANSWER_ACTION)
		const [r] = (doc(LAIR_ROLL_SPEC_ID).contributes as any).actions
		assert.deepEqual([r.key, r.venue, r.audience.act], ['roll', [{ kind: 'composer' }], ['owner']])
		assert.deepEqual(Object.keys(r.collects), ['recipients', 'text'])
		assert.equal(r.collects.recipients.min, 1)
	})

	test('a check: the ruleset handler rolls it, and the Oracle posts the dice on main', async () => {
		const receipt = await answer({ check: true, stat: 'skill.stealth', band: 'easy', target: 10 })
		assert.equal(receipt.outcome, 'ok')
		const apply = node(receipt, 'result.rolled.apply')
		assert.deepEqual(
			[apply.input.mode, apply.input.rigour, apply.input.owners, apply.input.deltas],
			['apply', 'mechanics', ['character:11'], [{ owner: 'character:11', op: 'use', check: 'skill.stealth', reason: 'pick the lock', against: 10 }]],
		)
		const write = node(receipt, 'result.rolled.shown.dice.write')
		assert.deepEqual([write.input.channel, write.input.speaker], ['main', 'envoy:oracle'])
		assert.equal(write.input.blocks[0].kind, 'dice')
		assert.equal(write.input.text, 'Verity — Stealth: 15 against 10. Success.')
	})

	test('No check: one Oracle line, nothing rolled', async () => {
		const receipt = await answer({ check: false, stat: 'skill.stealth', band: 'easy' })
		assert.ok(!ran(receipt, 'result.rolled.apply'))
		const write = node(receipt, 'result.told.write')
		assert.deepEqual([write.input.speaker, write.input.text], ['envoy:oracle', 'Verity — pick the lock: no roll. It goes as the story says.'])
		assert.equal(write.input.blocks, undefined)
	})

	test('the GM’s Roll: the Oracle puts a roll form per delver; at a table that rolls nothing, a word in the Sanctum', async () => {
		const press = async (ruleset: unknown) => {
			const d = doc(LAIR_ROLL_SPEC_ID)
			return (await run(d, {
				world: { ...world, authorDefaults: authorDefaultsOf(d) },
				input: { recipients: ['character:12'], text: 'force the gate', sessionScope: { sessionId: 1 }, session: sessionDoc(), ruleset },
				seed: 'lair-roll',
				triggerSource: 'ui',
				bindings: lairBindings({}),
			})) as any
		}
		const asked = await press(VIS())
		const write = node(asked, 'posted.asked.write')
		assert.deepEqual([write.input.channel, write.input.speaker], ['main', 'envoy:oracle'])
		assert.deepEqual(write.input.blocks.map((b: any) => [b.kind, b.by, b.action]), [['roll', 'character:12', LAIR_ROLL_ANSWER_ACTION]])
		const none = await press(FREEFORM)
		const said = node(none, 'posted.none.write')
		assert.deepEqual([said.input.channel, said.input.speaker], ['sanctum', 'envoy:castellan'])
	})
})

/* ── the rooms (D2, D10) ───────────────────────────────────────────── */

describe('a room is a place, drafted as one JSON answer, its ways to known rooms linked in its own commit', () => {
	/** Every room write, by spec: *Build room*'s one, the knock answer's two, *File as a room*'s. */
	const roomWrites: Array<[string, string]> = [
		[LAIR_BUILD_ROOM_SPEC_ID, 'save'],
		[LAIR_ROOM_ANSWER_SPEC_ID, 'room.typed.save'],
		[LAIR_ROOM_ANSWER_SPEC_ID, 'room.drafted.save'],
		[LAIR_FILE_ROOM_SPEC_ID, 'room.new.save'],
	]

	test('every room write declares the location entry type, and only the typed room skips the gate', () => {
		for (const [slug, key] of roomWrites) {
			const d = doc(slug)
			assert.deepEqual(presetValue(d, key), { entryType: 'core:entry/location' }, key)
			assert.deepEqual(presetValue(d, key, 'settings'), { review: key === 'room.typed.save' ? 'off' : 'on' }, `${slug} ${key}`)
		}
	})

	test("every draft asks the room draft's schema, and its write takes the fields and links the script made", () => {
		const drafts: Array<[string, string, string]> = [
			[LAIR_BUILD_ROOM_SPEC_ID, 'write', 'save'],
			[LAIR_ROOM_ANSWER_SPEC_ID, 'room.drafted.write', 'room.drafted.save'],
			[LAIR_FILE_ROOM_SPEC_ID, 'room.new.write', 'room.new.save'],
		]
		for (const [slug, write, save] of drafts) {
			const d = doc(slug)
			const w = d.nodes.find((n) => n.key === write)!
			assert.equal(w.definitionId, 'core:oracle/generate-json', slug)
			assert.deepEqual((w.config as any).schema, LAIR_ROOM_DRAFT_SCHEMA, slug)
			const into = (port: string) => d.edges.find((e) => e.to === save && e.toPort === port)
			for (const port of ['content', 'fields', 'links']) assert.ok(into(port), `${slug} ${save}.${port}`)
			const scripts = (d.presets ?? []).flatMap((p) => p.values).filter((v) => v.slot === 'scripts').flatMap((v) => v.value as any[])
			assert.ok(scripts.some((l) => l.seedKey === 'core:script/lair-room'), slug)
		}
		// The typed room is the GM's own words: no draft, no links of the script's.
		const answer = doc(LAIR_ROOM_ANSWER_SPEC_ID)
		assert.ok(!answer.edges.some((e) => e.to === 'room.typed.save' && e.toPort === 'links'))
	})

	const answerRun = async (text: string, location: unknown = 'The Old Well') => {
		const d = doc(LAIR_ROOM_ANSWER_SPEC_ID)
		const links: any[] = []
		const state = { world: { location }, cast: {} }
		const receipt = (await run(d, {
			world: { ...world, authorDefaults: authorDefaultsOf(d) },
			input: { text, payload: { choice: 'describe' }, form: { referent: 'The Drowned Hall' }, presser: 'user:1', sessionScope: { sessionId: 1 } },
			seed: 'lair-answer',
			triggerSource: 'ui',
			reviewer: async () => ({ action: 'approve' }),
			bindings: lairBindings(
				{ content: 'A long vault.', exits: [{ way: 'up', to: 'The Old Well' }, { way: 'down', to: 'The Stair' }], fields: { category: 'Floor 2' } },
				{
					'core:query/session-state@1': async () => ok({ main: state, state, version: 7 }),
					'core:outlet/link-lore-entries@1': async (i: any, ctx: any) => {
						links.push(i)
						const row = await ctx.commit({ from: i.from, to: i.to })
						return ok({ main: row.id, linkId: row.id })
					},
				},
			),
		} as any)) as any
		return { receipt, links }
	}

	test('the knock answered with nothing typed: the draft, its fields, a link to a known room — the party’s room left to the link step', async () => {
		const { receipt, links } = await answerRun('')
		assert.equal(receipt.outcome, 'ok')
		const save = node(receipt, 'room.drafted.save')
		assert.equal(save.input.name, 'The Drowned Hall')
		assert.deepEqual(save.input.fields, { category: 'Floor 2' })
		assert.equal(save.input.content, 'A long vault.\n\nExits: up → The Old Well, down → The Stair')
		// The Old Well is where the party stand: linked both ways by `link`, not twice.
		assert.deepEqual(save.input.links, [{ to: 2, linkType: 'leads down to', reverseLinkType: 'leads to' }])
		assert.equal(links.length, 1)
		assert.equal(links[0].to, 1)
		assert.ok(ran(receipt, 'resume'))
	})

	test('the knock answered in words: saved verbatim, unreviewed, then linked to the party’s room', async () => {
		const { receipt, links } = await answerRun('A vaulted hall, knee-deep in black water.')
		const save = node(receipt, 'room.typed.save')
		assert.equal(save.input.content, 'A vaulted hall, knee-deep in black water.')
		assert.equal(links.length, 1)
		assert.ok(!ran(receipt, 'room.drafted.write'))
	})

	test('a location naming no room saves the room unlinked, and the story still goes on', async () => {
		const { receipt, links } = await answerRun('A hall.', 'somewhere in the dark')
		assert.equal(links.length, 0)
		assert.ok(ran(receipt, 'resume'))
	})

	test("the room prompts ask for JSON in the draft's three members", () => {
		for (const name of ['Lair build room', 'Lair knock build', 'Lair file room', 'Lair: file the current room']) {
			const row = CORE_PROMPTS.find((p) => p.name === name)!
			assert.ok(row, name)
			const text = `${row.fields.systemPrompt}\n${row.fields.postHistoryInstructions}`
			for (const member of ['content', 'exits', 'fields']) assert.match(text, new RegExp(`\\b${member}\\b`), `${name}: ${member}`)
		}
	})
})

/* ── kept: File as a room, Trap and Reveal, Whisper, the door's presence ─ */

describe('File as a room: a room described in a message reaches the lorebook through review (R11)', () => {
	const fileDoc = () => doc(LAIR_FILE_ROOM_SPEC_ID)
	const action = () => ((fileDoc().contributes as any).actions as any[])[0]
	const item = (row: Record<string, unknown>) => itemValuesOf({ id: 1, ...row } as any, { isNewest: false, mine: true })
	const judge = (row: Record<string, unknown>) => evaluateEnabledWhen(action().enabledWhen, { item: item(row) })

	test("declared on a message's ⋮: world, the owner's, collecting the room's name", () => {
		const a = action()
		assert.deepEqual([a.key, a.venue, a.effects, a.audience.act], ['file', [{ kind: 'message' }], 'world', ['owner']])
		assert.equal(judge({ role: 'user', channel: 'sanctum' }).enabled, true)
		assert.equal(judge({ role: 'assistant', channel: 'main', metadata: { speaker: 'envoy:castellan' } }).enabled, true)
		const delver = judge({ role: 'assistant', characterId: 7, metadata: { speaker: 'character:7' } })
		assert.equal(delver.enabled, false)
		assert.match((delver as any).reason.en, /a delver's line is theirs/)
	})

	test('a name already in the book: nothing filed, and the Castellan says so on the Sanctum', () => {
		const said = fileDoc().nodes.find((n) => n.key === 'room.exists.said')!
		assert.equal((said.config as any).channel, 'sanctum')
		assert.equal((said.config as any).speaker, 'envoy:castellan')
	})
})

describe("Trigger trap and Reveal write the Castellan's row, streamed (B17; R8)", () => {
	for (const [slug, key, status] of [
		['core:spec/lair-trap', 'trap', 'Springing a trap'],
		['core:spec/lair-reveal', 'reveal', 'Revealing'],
	] as const)
		test(`${key}: a placeholder the write streams into, finished by one update`, () => {
			const d = doc(slug)
			assert.deepEqual(
				d.nodes.filter((n) => n.kind === 'outlet').map((n) => [n.key, n.definitionId]),
				[
					['placeholder', 'core:outlet/create-message'],
					['save', 'core:outlet/update-message'],
				],
			)
			assert.equal((d.nodes.find((n) => n.key === 'placeholder') as any).config.speaker, 'envoy:castellan')
			assert.deepEqual((d.nodes.find((n) => n.key === 'write') as any).expose, { stream: true, status })
		})
})

describe('Whisper collects its recipients and writes each one, with no model call (R10)', () => {
	test('it collects who hears it and what it says, and writes no message', () => {
		const d = doc('core:spec/lair-whisper')
		const [a] = (d.contributes as any).actions
		assert.deepEqual(a.collects, {
			recipients: { label: { en: 'Who hears it' }, min: 1, overwrites: 'core:slot/whisper@1' },
			text: { need: 'required', label: { en: 'What do you whisper?' } },
		})
		assert.deepEqual(
			d.nodes.map((n: any) => n.definitionId).sort(),
			['core:inlet/user-message', 'core:query/resolve-state-changes', 'core:query/session-state', 'core:task/set-state'],
		)
	})
})

describe("Nudge: the GM's standing direction, written with no model call", () => {
	test("it collects the direction and applies it on the world's direction slot", async () => {
		const d = doc('core:spec/lair-nudge')
		assert.ok(!d.nodes.some((n) => n.kind === 'oracle'))
		const receipt = (await run(d, {
			world: { ...world, authorDefaults: authorDefaultsOf(d) },
			input: { text: 'the ceiling drips', sessionScope: { sessionId: 1 } },
			seed: 'lair-nudge',
			triggerSource: 'ui',
			bindings: lairBindings({}),
		})) as any
		assert.equal(receipt.outcome, 'ok')
		assert.deepEqual(node(receipt, 'resolve').input.changes, [{ owner: 'world', slot: 'direction', value: 'the ceiling drips' }])
		assert.equal(node(receipt, 'apply').input.params.mode, 'apply')
	})
})

describe('Answer the door is present only while a knock is open (W-GATE D3)', () => {
	test("presentWhen reads the open form's action — its own identity", () => {
		const pw = ((doc(LAIR_ROOM_ANSWER_SPEC_ID).contributes as any).actions[0]).presentWhen
		assert.equal(pw[0].on, 'session.openForm.action')
		assert.equal(pw[0].equals, `${LAIR_ROOM_ANSWER_SPEC_ID}#room`)
		assert.equal(evaluateEnabledWhen(pw, { session: { openForm: { action: `${LAIR_ROOM_ANSWER_SPEC_ID}#room` } } }).enabled, true)
		assert.equal(evaluateEnabledWhen(pw, { session: { openForm: null } }).enabled, false)
	})
})

/* ── the prompts ─────────────────────────────────────────────────────── */

describe("the Lair's prompts (rewritten 2026-10-21)", () => {
	const row = (name: string) => CORE_PROMPTS.find((p) => p.name === name)!

	test('the planner asks for risks against the table’s checks, waits on players, and knocks only with rooms', () => {
		const text = row('Lair planner').fields.systemPrompt ?? ''
		assert.match(text, /\{\{#if checks\}\}/)
		assert.match(text, /\{\{checks\}\}/)
		assert.match(text, /\{\{bands\}\}/)
		assert.match(text, /\{\{#if players\}\}/)
		assert.match(text, /\{\{#if roomsLayer\}\}/)
		assert.match(text, /- risks:/)
		assert.match(text, /From here/)
		assert.deepEqual(row('Lair planner').defaultForSpecs, [LAIR_REPLY_SPEC_ID])
	})

	test('the voice and the narration honour the Oracle’s dice', () => {
		assert.match(row('Lair voice').fields.systemPrompt ?? '', /Oracle/)
		assert.match(row('Lair Castellan narration').fields.systemPrompt ?? '', /Oracle/)
	})

	test('the routines’ rows are named by seed key and default for no spec', () => {
		for (const key of Object.values(LAIR_PROMPT_KEYS)) {
			const p = CORE_PROMPTS.find((x) => x.seedKey === key)!
			assert.ok(p, key)
			assert.deepEqual(p.defaultForSpecs, [], key)
		}
		assert.match(row('Lair: keep the books').fields.systemPrompt ?? '', /Propose no check of your own/)
	})

	test("the party call's row is gone with the party speech; every Lair row names the GM by {{playerLabel}}", () => {
		assert.equal(CORE_PROMPTS.some((p) => /lair-party/.test(p.seedKey)), false)
		assert.equal(CORE_PROMPTS.some((p) => (p.defaultForSpecs ?? []).includes('core:spec/lair-respond')), false)
		for (const p of CORE_PROMPTS.filter((x) => /^Lair/.test(x.name)))
			assert.doesNotMatch(`${p.fields.systemPrompt ?? ''}\n${p.fields.postHistoryInstructions ?? ''}`, /dungeon's master/i, p.name)
		for (const name of ['Lair planner', 'Lair voice', 'Lair knock build', 'Lair trap', 'Lair reveal'])
			assert.match(`${row(name).fields.systemPrompt}\n${row(name).fields.postHistoryInstructions}`, /\{\{playerLabel\}\}/, name)
	})
})

/* ── the Sanctum, the greeting, playerLabel (kept) ──────────────────── */

describe('the Sanctum and the Castellan (R6), kept', () => {
	test('the Sanctum offers Continue and Narrate, never Pick or Regenerate the turn', () => {
		const main = resolveTurnControls(lairGenre.shape, 'main')
		const table = resolveTurnControls(lairGenre.shape, 'sanctum')
		assert.deepEqual(
			TURN_CONTROLS.map((t) => [t, main[t].offered, table[t].offered]),
			[
				['advance', true, true],
				['pick', true, false],
				['narrate', true, true],
				['retake', true, false],
			],
		)
	})

	test('the create spec writes the greeting on the Sanctum, under the Castellan, with no model call', () => {
		const d = doc('core:spec/lair-create') as any
		const write = d.nodes.find((n: any) => n.key === 'greet.greets.write')
		assert.deepEqual([write.config.channel, write.config.speaker], ['sanctum', 'envoy:castellan'])
		assert.ok(!d.nodes.some((n: any) => n.kind === 'oracle'))
		assert.deepEqual(d.genre.playerLabel, { en: 'Dungeon Master' })
		assert.deepEqual(d.genre.envoys.map((e: any) => e.key), ['castellan', 'oracle'])
	})

	test('the greeting introduces the game, the Oracle’s rolls and the Sanctum as the GM’s alone', () => {
		const text = (lairGenre.envoys![0]!.greeting!.text as { en: string }).en
		assert.match(text, /reverse dungeon/)
		assert.match(text, /the Oracle asks you to call it/)
		assert.match(text, /Only you see it/)
		assert.match(text, /To begin/)
	})

	test('the Lair turn order reads every channel, so a Sanctum line is answered there', () => {
		assert.deepEqual(authorDefaultsOf(doc('core:spec/lair-turn-order'))!.history?.params, { channel: '*' })
	})

	test("⏳ lorebook 'required' is retired (RF fix 2): accepted for one release, read as optional, warned on declare", () => {
		assert.deepEqual(lorebookShapeFindings({ lorebook: 'optional' }, 'x'), [])
		assert.deepEqual(lorebookShapeFindings(undefined, 'x'), [])
		const [finding, ...more] = lorebookShapeFindings({ lorebook: 'required' }, 'acme.rp:genre/booked.shape.lorebook')
		assert.deepEqual(more, [])
		assert.equal(finding!.law, LOREBOOK_REQUIRED_RETIRED)
		assert.equal(finding!.law, 'lorebook-required-retired')
		assert.equal(finding!.severity, 'warning')
		const warned: string[] = []
		const warn = console.warn
		console.warn = (...args: unknown[]) => void warned.push(args.join(' '))
		try {
			const g = genre('acme.rp:genre/booked', { name: { en: 'B' }, family: 'rp', shape: { lorebook: 'required', composer: 'text' } })
			assert.equal(g.shape?.lorebook, 'optional')
			assert.equal(g.shape?.composer, 'text')
		} finally {
			console.warn = warn
		}
		assert.equal(warned.length, 1)
		assert.match(warned[0]!, /lorebook-required-retired: acme\.rp:genre\/booked\.shape\.lorebook: 'required' is retired/)
		// No core genre still says it.
		for (const g of coreGenres()) assert.notEqual((g.shape as { lorebook?: string } | undefined)?.lorebook, 'required', g.id)
	})

	test('a persona-less genre may declare a playerLabel; one whose personas.min ≥ 1 may not', () => {
		assert.deepEqual(genre('acme.rp:genre/labelled', { name: { en: 'L' }, family: 'rp', playerLabel: 'Game Master' }).playerLabel, { en: 'Game Master' })
		assert.throws(
			() => genre('acme.rp:genre/persona-labelled', { name: { en: 'P' }, family: 'rp', shape: { personas: { min: 1 } }, playerLabel: { en: 'GM' } }),
			/playerLabel.*persona/,
		)
	})

	test("an envoy greeting is refused on a channel the genre does not declare, and on an action's envoy", () => {
		assert.throws(
			() =>
				genre('acme.rp:genre/greet-nowhere', {
					name: 'G',
					family: 'rp',
					shape: { channels: ['main', 'side'] } as any,
					envoys: [{ key: 'host', name: 'Host', greeting: { text: 'Hello.', channel: 'elsewhere' } } as any],
				}),
			/greeting\.channel 'elsewhere' is not a channel this genre declares/,
		)
		assert.match(
			envoyFindings({ key: 'host', name: 'Host', greeting: { text: 'Hi.' } }, 'contributes.actions[roll].envoy', 'action').join('\n'),
			/an action's envoy cannot declare a greeting/,
		)
	})

	test('undescribed-name@1 declares `path`, empty by default', () => {
		const schema = (getDefinition('core:task/undescribed-name@1')!.slots?.params as any)?.schema ?? {}
		assert.equal(schema.path?.default, '')
	})
})
