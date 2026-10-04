/**
 * The **Lair** genre (plans/genres-and-showcase-plugins §3, U3) — the reverse
 * dungeon crawler: the person is the dungeon, the AI is the party.
 *
 * Three claims, and each is a way the genre could be wrong while still
 * compiling:
 *
 *  · the **declaration** says what the plan says — no personas, a required
 *    lorebook, lore and scenes written on purpose, and no turn-style field
 *    (the Lair is cast only, R12);
 *  · every pipeline **builds and validates**, and its document hashes to a
 *    recorded value, so an edit to a shipped graph is a deliberate change to a
 *    pin rather than a silent one;
 *  · the turn **behaves** — executed against the fixture host, a turn gives
 *    one voice call per character the planner named, and a planner that names a room the dungeon does not hold
 *    halts the turn with a form addressed to the **owner** instead of
 *    narrating it.
 *
 * ⚠ **Imported from `../core-catalog/src`, not from `@serene-pub/core-catalog`.**
 * The package's `main` is `./dist/index.js`, so the published entry point is a
 * build behind the source, and this lane may not run one. Importing the source
 * directly is what lets a new genre be tested the day it is written; every
 * other suite keeps importing the package, and `node --test` runs each file in
 * its own process, so the two never meet.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
	canonicalHash,
	channelDecls,
	checkFoldedSections,
	drawnWidgetIds,
	widgetOfInstance,
	envoyFindings,
	evaluateEnabledWhen,
	genre,
	getDefinition,
	ok,
	resolveTurnControls,
	run,
	sameName,
	sectionItemsOf,
	sessionEvents,
	TURN_CONTROLS,
	validate,
	worldBlockFunctions,
} from '@serene-pub/sdk'
import type { Bindings, ConfigWorld, SpecDocument } from '@serene-pub/sdk'

import { corePresets, CORE_SPECS, CORE_WIDGETS } from '../core-catalog/src/index.js'
import { CORE_PROMPTS } from '../core-catalog/src/prompts.js'
import { lairGenre, LAIR_GENRE_ID } from '../core-catalog/src/genres.js'
import { LAIR_RESPOND_SPEC_ID } from '../core-catalog/src/lair.js'
import {
	LAIR_BUILD_ROOM_SPEC_ID,
	LAIR_FILE_ROOM_SPEC_ID,
	LAIR_ROOM_ANSWER_SPEC_ID,
} from '../core-catalog/src/lairActions.js'
import { itemValuesOf } from '../core-catalog/src/ui/sessions/conversation/itemValues.js'
import { LAIR_LAYOUT } from '../core-catalog/src/ui/sessions/layouts.js'
import { bindings, world } from './helpers.js'

/* ── the declaration ────────────────────────────────────────────────────── */

describe('the Lair genre declares the reverse crawler', () => {
	test('nobody plays a person, and the dungeon is required', () => {
		const shape = lairGenre.shape!
		assert.equal(lairGenre.id, LAIR_GENRE_ID)
		assert.deepEqual(shape.characters, { min: 1 })
		// The whole inversion: the master is not in the scene.
		assert.deepEqual(shape.personas, { min: 0, max: 0 })
		assert.equal(shape.lorebook, 'required')
		assert.equal(shape.composer, 'text')
		assert.equal(shape.voice, 'narrator')
		assert.equal('turnOrder' in shape, false, 'no Turn order control: the planner decides (R28 retired the shape key)')
		assert.equal(shape.greeting?.enabled, false)
	})

	test('it writes lore and scenes on purpose (R-B)', () => {
		assert.deepEqual(lairGenre.shape?.writes, { lore: true, scenes: true })
	})

	/**
	 * R6 (owner F1/F2 2026-09-28): `voice: 'narrator'` stays — the null entry
	 * is the pipeline's own voice — and that voice is the Castellan, the
	 * genre's fallback envoy, which also talks in the Sanctum.
	 */
	test('the own voice is the Castellan: the fallback envoy, seated by default, with a greeting', () => {
		assert.equal(lairGenre.shape?.voice, 'narrator')
		assert.equal(lairGenre.envoys?.length, 1)
		const castellan = lairGenre.envoys![0]!
		assert.equal(castellan.key, 'castellan')
		assert.deepEqual(castellan.name, { en: 'Castellan' })
		assert.equal(castellan.fallback, true)
		assert.equal(castellan.default, true)
		assert.equal(castellan.speaks, 'in-turn')
		assert.equal(castellan.greeting?.channel, 'sanctum')
		assert.match(castellan.prompts?.systemPrompt ?? '', /talking with the \{\{playerLabel\}\}/)
	})

	/** R12 (owner 2026-09-28): the Lair is cast only — no turn style, and Pick is simply present. */
	test('cast only: no turnStyle field, and Pick has no present-when', () => {
		assert.equal((lairGenre.shape?.fields as any)?.turnStyle, undefined)
		// R13 (2026-09-28): `sanctumSteers`, on by default.
		assert.deepEqual(Object.keys(lairGenre.shape?.fields ?? {}).sort(), ['partySpeech', 'sanctumSteers', 'tone', 'trustNarrator'])
		assert.deepEqual(lairGenre.shape?.turnControls, { advance: true, pick: true, narrate: true, retake: true })
	})

	test('Adventure’s two fields, carried over', () => {
		assert.ok(lairGenre.shape?.fields?.tone)
		assert.ok(lairGenre.shape?.fields?.trustNarrator)
		// Relabelled 2026-09-28 (R8 follow-up): the person is the narrator,
		// so the field trusts the Castellan's bookkeeping. The key is the
		// stored value's, and Adventure's and Whodunit's keepers read it too.
		assert.equal(
			(lairGenre.shape?.fields?.trustNarrator as any)?.label?.en,
			"Apply the Castellan's stat changes without asking",
		)
	})

	test('it brings Adventure’s cast slots, the dungeon’s own, and no sky', () => {
		const ids = (lairGenre.slots ?? []).map((s) => s.id)
		for (const id of [
			'core:slot/hp@1',
			'core:slot/stamina@1',
			'core:slot/mood@1',
			'core:slot/trust@1',
			'core:slot/location@1',
			'core:slot/floor@1',
			'core:slot/gold@1',
		])
			assert.ok(ids.includes(id), id)
		// A dungeon has no weather and no hour of the day.
		assert.ok(!ids.includes('core:slot/weather@1'))
		assert.ok(!ids.includes('core:slot/time-of-day@1'))
		// The two carriers the steering actions write.
		assert.ok(ids.includes('core:slot/direction@1'))
		assert.ok(ids.includes('core:slot/whisper@1'))
		assert.deepEqual(
			(lairGenre.sheets ?? []).map((s) => s.id),
			['core:sheet/lair@1'],
		)
	})

	test('the event surface is the standard one, forms included', () => {
		assert.equal(lairGenre.events[sessionEvents.messageRespond]?.required, true)
		assert.equal(lairGenre.events[sessionEvents.sessionAction]?.open, true)
		assert.ok(sessionEvents.formAddressed in lairGenre.events)
	})
})

/* ── the pipelines ──────────────────────────────────────────────────────── */

/** Every spec this genre ships, by slug — the catalog is the source of truth. */
const lairSpecs = () => CORE_SPECS.filter((s) => /lair/.test(s.slug))

/**
 * `slug` → the document's canonical hash, recorded the way the app's
 * `specHashes.test.ts` records one: a moved pin is shippable and still has to
 * be deliberate.
 */
const PUBLISHED: Record<string, string> = {
	// Moved 2026-09-21 (PLAN-turn-order A1): `shape.speakerStrategies: []`
	// became no key — `SessionShape.turnOrder` replaces it and a planner
	// genre declares none (was 'e019e7c56f43c').
	// And 2026-09-27 (lair pass B9): the genre's events gained
	// message-deleted and message-hidden (was '14053b92f897da').
	// And 2026-09-27 (lair pass B7, owner D4): the genre declares
	// `messageVerbs: { continue: false }` — no prefill continue. Proven: a
	// copy of core-catalog/src without that line hashes back to the old pin.
	// (was 'c72c2e0357622')
	// B8: the genre's `turnControls` (was '1fb1f11424fcae').
	// Moved 2026-09-28 (rename, NOMENCLATURE §25): `messageVerbs: { continue:
	// false }` is now `{ extend: false }` (the verb is `core#extend`). Proven:
	// a copy of core-catalog/src with only that key reverted hashes back to
	// the old pin. (was '13a122e59e48b8')
	// Moved 2026-09-28 (choice labels): the genre's enum fields gained
	// `members` — each option's display label beside its stored `of` value.
	// Proven: deleting every enum's `members` hashes back to the old pin.
	// (was '4cc43f9196f51')
	// Moved 2026-09-28 (lair re-plan R12, cast only): the embedded Lair shape
	// drops `fields.turnStyle` and Pick's present-when (`turnControls.pick:
	// true`). Proven: a canonical diff of the pre-change build (dist) against
	// the source shows exactly those two keys and nothing else. (was 'db68e32f7f418')
	// Moved 2026-09-28 (lair re-plan R2, retake): the embedded Lair shape
	// declares `turnControls.retake: true`. Proven: the built document with
	// that one key deleted hashes back to the old pin. (was '599f52f417f68')
	// Moved 2026-09-28 (lair re-plan R4, playerLabel): the create spec's
	// `genre` row carries `playerLabel: { en: 'Dungeon Master' }`. Proven: the
	// built document with `genre.playerLabel` deleted hashes back to the old
	// pin. (was '12208c611c679e')
	// Moved 2026-09-28 (lair re-plan R6): the genre row carries the
	// Castellan (`envoys`) and the Sanctum (`channels`), and the spec reads
	// and writes the Castellan's greeting (`welcome`, `greet.greets.write`,
	// preset `lair`). Proven by reverting only R6's edits in a copy of the sources (sdk, contracts, core-catalog) and hashing: every R6 pin and the golden come back. (was '114844f1333859')
	// Moved 2026-09-28 (lair re-plan R13): the embedded Lair shape declares
	// `fields.sanctumSteers` (on by default) and relabels `trustNarrator`
	// (_Apply the Castellan's stat changes without asking_), and the
	// Castellan's system prompt says whether Sanctum talk steers and reads
	// its `{{scratchpad}}`. Proven: a copy of sdk, contracts and core-catalog
	// sources with only R13's edits reverted hashes back to every old pin and
	// the golden. (was '1bc219796d240b')
	// Moved 2026-09-30 (party speech, owner ruling): the genre's shape
	// declares `fields.partySpeech` (_How the party speak_). Proven: a copy of
	// sdk, contracts and core-catalog sources with only this lane's edits
	// reverted hashes back to this old pin and lair-respond's. (was 'cd14c9acfe99c')
	// Moved 2026-09-30 (Lair character turns, owner ruling: "they are
	// character turns, not first delver, later delver"): the embedded shape's
	// `partySpeech` description says each delver takes a turn of their own.
	// Proven: a copy of core-catalog/src with only this lane's edits reverted
	// (lair.ts, turnOrder.ts, genres.ts) hashes back to every old Lair pin. (was '17398a61457451')
	'core:spec/lair-create': 'b41ea5ad6054d',
	// Moved 2026-09-17 (W1): the voices `each` gained a per-speaker
	// character-lore lane, its own pool and its own rank, so a delver reads
	// their own private lore instead of the whole party's.
	// Moved 2026-09-27 (owner rulings): the keeper's item arm is `inventory`
	// (was `possessions`: schema property, `required`, preset path
	// `values,inventory`), and Lair checks item supply like Adventure — a
	// `keep.played.itemSupply` query wired onto `keeperResolve.supply`.
	// Proven: a copy of core-catalog/src with the rename (and Lair's supply wiring) reverted hashes back to the old pin. (was '4f1008e05a481')
	// Moved 2026-09-27 (lair pass B3/B18): the streaming stage and the stage
	// statuses are declared on `expose` (`stream`, `status`). Proven: with those
	// two keys stripped, the document hashes back to the old pin. (was '922d63165f241')
	// Moved 2026-09-27 (lair pass B5, owner D5): the Plan and Thinking folds —
	// a `planSection` node (`core:task/list-section@1` over `planWrite.json`),
	// its preset params (`beats,speakers`, kind `plan`, label `Plan`), and
	// `save` wiring `thinking` (from `turn.play.scene`) and `sections`. Proven:
	// a copy of core-catalog/src with just those edits reverted hashes back to
	// the old pin. (was '65d55afd66146')
	// Moved 2026-09-27 (lair pass B11, Lair half): `direction: $.input.text`
	// on `planContext` and `turn.play.sceneContext`. Proven: a copy of
	// core-catalog/src with just those two wires reverted hashes back to the
	// old pin. (was 'd4d32992afafb')
	// Moved twice 2026-09-27 (lair wave 3). First (R1): `direction` →
	// `turnDirection` on `planContext` and `turn.play.sceneContext` — that
	// rename alone hashed to '10254b22ea51d'. Then B12/B13: `gather.rooms`
	// (lorebook-entries, location entries), `exit` + `exitCheck`
	// (then `unlisted-name@1`, now `undescribed-name@1`) routing the `turn` junction, the knock's `referent`,
	// `locationEntries` on both contexts. Measured step by step with only
	// these edits between. (was '1517a24e807bc2')
	// Moved 2026-09-27 (lair pass B15/B16, owner D1a/D2a): the turn is a
	// `pick` junction on `input.characterId` — `picked` (the delver answers
	// alone, streamed, no planner/narrator/keeper) or `planned` (every node
	// that was on the spine, now under `channel.story.pick.planned.`); the voices run after
	// `save` and write one complete row each (`voices…line`, `said`), the
	// play branch reads `speaking`, and the keeper reads `reply`. Proven: a
	// copy of core-catalog/src with only lair.ts reverted hashes back to the
	// old pin. (was '2629bfa0a7e2d')
	// Moved 2026-09-28 (lair re-plan R12, cast only): the `voices` junction on
	// `turnStyle` is a plain `each` in `planned` — `channel.story.pick.planned.voices.cast.
	// speakers.item.*` → `channel.story.pick.planned.voices.item.*`, the branch's `joined`
	// node gone, `voiceLines` reading the `each`'s values; later positions
	// shift by one. Proven: a canonical diff of the pre-change build (dist)
	// against the source shows only that clause, its nodes and edges, and the
	// position shift. (was '1c883db7b28f29')
	// Moved 2026-09-28 (lair re-plan R7): `exitCheck` is
	// `core:task/undescribed-name@1` (was `unlisted-name@1`), reading
	// `locationEntries` (the rooms), `entries` (a new `gather.lorebook`
	// listing, every entry type), `messages` (`gather.history`) and its params;
	// the junction and the knock's `referent` read `undescribed`. Proven: a copy
	// of core-catalog/src with only those lair.ts edits reverted (and the old
	// definition stubbed) hashes back to the old pin. (was '1721382a7b9fbd')
	// Moved 2026-09-28 (lair re-plan R6): the `channel` junction — the
	// Castellan's `channel.sanctum` branch, the story at `channel.story.*` —
	// and the placeholder on `$.input.channel`. Proven with the pins above.
	// (was '5d97100fa4cfe')
	// Moved 2026-09-28 (lair re-plan R8, the Castellan's turn): `via`
	// junction first (`via.narrate` — the Castellan's narration on `main` —
	// or `via.turn`, holding R6's `channel` junction); every branch opens its
	// own row (F7 per execution path); the planned turn's `door` junction
	// (was `turn`): the knock (a Castellan question row) or the play — beats
	// as the Sanctum row's body (`beats` list-section `text`,
	// `plan.posted.write`), the lead delver (`party` split-first,
	// `lead.speaks.*`, streamed), the rest (`voices`), `partyLines`/`reply`;
	// the narrator scene step, `planSection`, `turnText` and the spine
	// `placeholder`/`save` retired; the keeper on the spine (`played`,
	// `reply`, `keep.played.*`) with `set-state.worldRow` = the beats row;
	// voices and the lead read `locationEntries`. Proven: a copy of sdk, contracts and core-catalog sources with only R8's edits reverted (lair.ts's respond spec restored, lairActions.ts, actions.ts, the contract ports and `split-first@1`, prompts.ts) hashes back to every old pin and the golden. (was '1c6d397bcec39f')
	// Moved 2026-09-28 (lair re-plan R13, Sanctum talk steers the story):
	// `gather.scratchpad` (the Castellan's AI view of the annex); the planner's
	// `planned.steer` junction on `sanctumSteers` (`talk`, an `unplayedOnly`
	// Sanctum read, and `pad`) feeding `planContext.sideTalk`/`scratchpad`;
	// the narration's `asked` pair and `talk` junction (`pressed` · `steered`
	// · `none`) feeding `context.sideTalk`; the Sanctum branch's `pad`, its
	// context's `fields`/`scratchpad`, and the scratchpad rewrite after the
	// reply (`padExchange` … `padKeep.kept.write`, a `set-session-annex` of
	// `castellan-scratchpad`); their preset params and Background sampling.
	// Proven with the lair-create pin above. (was '101726d7537e82')
	// Moved 2026-09-28 (lair re-plan R9, the knock asks for a description):
	// the knock's one option `describe`, labelled by `door.knock.named` +
	// `door.knock.describeLabel` (was `KNOCK_OPTIONS`, build · improvise); the
	// prose check's union read `planned.exitProse` (`channel: '*'`, 40) feeding
	// `exitCheck.messages`, with `channels: ['main', 'sanctum']`; the lead's
	// and the voices' `locationPassage` = `exitCheck.passage`. Proven: a copy
	// of the sdk, contracts and core-catalog sources with only R9's edits
	// reverted (contracts index.ts, lair.ts, lairActions.ts, prompts.ts put
	// back as they were before R9) hashes back to this old pin, to
	// lair-room-answer's and to the golden. (was '1926a1f0104ff7')
	// Moved 2026-09-28 (lair re-plan R10's fold-in of the R9 follow-up): the
	// `exitProse` read takes `talkOnly: true`, so the Sanctum's beats row is
	// never read as a room's description. Proven: a copy of
	// sdk+contracts+core-catalog with only R10's edits reverted hashes back to
	// this old pin, lair-whisper's and the golden. (was 'a4efff601d22a')
	// Moved 2026-09-29 (places plan B6): the rooms read's preset asks
	// `withLinks: true`, so each room carries its ways out for
	// `{{locationEntry}}`'s "From here:" block. Proven: a copy of
	// core-catalog/src with only B6's lair.ts, lairActions.ts and prompts.ts
	// edits reverted hashes back to this old pin and to lair-room-answer's.
	// (was '91b5f45f61cf3')
	// Moved 2026-09-30 (plan A27 P5, the "fall back" default): the knock reads the
	// planner's `worldHints.location` (`door.knock.vantage`, `parse-json@1`,
	// its preset path) onto `make-choices@1`'s new `vantage` port. Proven: a
	// copy of core-catalog/src with only P5's lair.ts and lairActions.ts
	// edits reverted hashes back to this old pin, to lair-room-answer's and
	// to the golden. (was '17adaaa371d25')
	// Moved 2026-09-30 (config grouping, catalog lane): the model calls carry
	// `expose.label` and `expose.purpose` (the settings group's heading and
	// the sentence under it), and steps whose headings repeated within one
	// group carry an `expose.label`. Proven: a copy of core-catalog/src with
	// only this lane's edits reverted hashes back to this old pin and to the
	// golden. (was '1280f739cee9f1')
	// Moved 2026-09-30 (party speech, owner ruling: no lead delver): the
	// story picks who speaks first (`pick` ends in `split-first@1` on both
	// branches), the knock-or-play `door` follows it, and the play's
	// `speech` junction runs each delver as one Voices call (`each.first`
	// streamed, `each.voices` on its prompt, model and sampling) or the
	// Castellan for the party (`castellan.party`, the scene surface's new
	// `partySpeakers` port, its own prompt row named by the preset); the
	// picked branch's own voice steps are gone. Proven: a copy of sdk,
	// contracts and core-catalog sources with only this lane's edits
	// reverted hashes back to this old pin and lair-create's. (was '18c218a4d5c165')
	// Moved 2026-09-30 (Lair character turns, owner ruling: "they are
	// character turns, not first delver, later delver"): a planned turn voices
	// nobody — the plan row hands its turns on (`turns` junction,
	// `create-message@1`'s `turnPlan`); each delver's line is one character
	// turn (`speech.each.character.turn`, keyed on `input.characterId`: the
	// standing plan off `core:query/turn-plan@1`, their own lore, their own
	// streamed row, and their own books — `resolve-state-changes@1`'s `keeps`
	// naming them, on the State-keeper's settings); the Castellan's keeper
	// keeps the world's (`keeps: 'world'`); the Castellan speaking for the
	// party reads the party's reach (`build-scene-context@1`'s `placeSight`).
	// Proven: a copy of core-catalog/src with only this lane's edits reverted
	// (lair.ts, turnOrder.ts, genres.ts) hashes back to every old Lair pin. (was '15357b92b9b0b')
	// Moved 2026-10-01 (owner ruling: the post-history reminder's trigger ships
	// at 0.5.3's 3000 in the genre): the default preset sets
	// `postHistoryTokenTrigger` on every assemble step. Proven: the built
	// core-catalog with only these preset values stripped hashes back to the
	// old pin. (was '10ec4773396315')
	// Moved 2026-10-02 (owner ruling: whoever writes a delver's line keeps
	// that delver's stats): the party call's `speakers` step, and the
	// Castellan keeper's `keeps` naming the world and the delvers it voiced.
	// Proven: a copy of core-catalog/src with only these two edits to lair.ts
	// reverted hashes back to the old pin. (was '1e50c2c3a93641')
	// Moved 2026-10-02 (lorebooks Wave 8 — C2/C3, the room rule): the vector and entity arms (R3) on the spine and per delver turn (the
	// delver as `speaker`), a `presences` read and an `eligible` step before
	// every ranker (C2), the room rule's `place` step and `shownElsewhere`
	// on every ranker, statuses on the two embeds, and the party call's arms
	// searching as the Castellan.
	// Measured with other lanes' in-flight core-catalog edits in the tree,
	// not proven in isolation. (was '49be755914342')
	// Moved 2026-10-02 (composer attachments phase 4, PLAN §3.5): a
	// `history-attachments` read on the gathered history and on the Sanctum
	// talk, and a `place-attachments` step before each voice's prompt
	// (Sanctum, narrate, character turn, party) on that voice's own pair.
	// Measured with other lanes' in-flight edits in the tree. (was '1934de4b58c1bb')
	// Moved 2026-10-03 (owner note 39): the port `thinking` -> `reasoning` on
	// generate-text / update-message, so `save` wires `reasoning`. Measured
	// with other lanes' in-flight core-catalog edits in the tree. (was '1c71b226eaa76a')
	// Moved 2026-10-03 (history window): every history read in the Lair wires
	// `budget: $.contextBudget.available`. (was 'a3874a2f8cc28')
	'core:spec/lair-respond': '13506ae2e7456',
	// Moved twice on 2026-09-17. First (L3, contracts batch 2): `params:
	// slot.params()` on the `create-lore-entry` node, which now declares an
	// `entryType` parameters slot — a slot the spec never NAMES is not a config
	// key, so the control would render and the run would never read it. Then by
	// the Lair finish lane: the spec gained the preset it had been missing, so
	// the review gate its docblock promised is real (`resolvePosition` defaults
	// an undeclared position to `off`), and the entry type is a **location**.
	// (was '15ceae616882db', then '94ce032b7c0b')
	// Every action spec below moved 2026-09-17 (plans/31 V2): `contributes.actions[].function`
	// is retired — the key is the identity — so the compiled document lost one field.
	// (was, in order: 1ff57339179b3e · 174f312cdf8f4b · 23fc20cb37f9a · da05ebe7ebbf5 · 459fa9f4e70c · 44fb0d3f52e5c)
	// Moved 2026-09-27 (lair pass B3/B18): the streaming stage and the stage
	// statuses are declared on `expose` (`stream`, `status`). Proven: with those
	// two keys stripped, the document hashes back to the old pin. (was '164975f16c6c17')
	// Moved 2026-09-28 (lair re-plan R3): `composerText: 'required'` became
	// `collects: { text: { need: 'required', label: 'Room name' } }`, and the
	// description says _Name it_ (was _Type its name_). Proven: the built document
	// with `collects` deleted, `composerText` restored and the old description
	// hashes back to the old pin. (was '147519b9d27469')
	// Moved 2026-09-30 (plan A28): the draft is shown the dungeon's rooms —
	// `gather.rooms` (a location listing, its preset) into `context`'s
	// `locationEntries` — and the room's name, `input.text` on `turnDirection`.
	// Proven: a copy of core-catalog/src with only this lane's edits reverted hashes back to the old pin. (was '160737b487903c')
	// Moved 2026-10-02 (lorebooks Wave 8 — C2/C3, the room rule): a `presences` read and an `eligible` step before `rank` (C2), and the
	// room rule's `place` step (+ preset `path`) wired as `shownElsewhere`.
	// Measured with other lanes' in-flight core-catalog edits in the tree,
	// not proven in isolation. (was '1756e1be2ceb54')
	// Moved 2026-10-03 (attachments follow-ups, owner ruling): the transcript's files are
	// read (`attachments`) and placed for the model call (`attached`) before `prompt`;
	// a transcript with no files renders byte for byte as before. (was '1f69f3eeb34e18')
	'core:spec/lair-build-room': '12bcd383afd725',
	// New 2026-09-28 (lair re-plan R11): File as a room — a message-venue
	// `world` action that reads its row by id (`session-history@1`
	// `messageId`), checks the name against the book, and drafts a location
	// behind the review gate or says on the Sanctum that it is already filed.
	// Proven: a copy of sdk+contracts+core-catalog with only R11's edits
	// reverted has no such spec and hashes the golden back to
	// 'f2b52529af0442f1'; every other Lair pin is unmoved.
	// Moved 2026-09-30 (plan A28): `gather.lore` reads as the Castellan
	// (`speaker: 'envoy:castellan'`), never with no speaker. Proven: a copy of core-catalog/src with only this lane's edits reverted hashes back to the old pin.
	// (was '2e1e00db48eec')
	// Moved 2026-09-30 (plan A28 review): the draft reads the book's public
	// half — `gather.worldLore` and `gather.historyEntries` in place of
	// `gather.lore` (lorebook-triggers as the Castellan) — so no character
	// lore, a played persona's included, reaches a room. Proven: a copy of
	// core-catalog/src with only this fix-up's edits (lairActions.ts,
	// whodunitActions.ts) reverted hashes back to the old pin.
	// (was 'f93786f4c28b1')
	// Moved 2026-09-30 (config grouping, catalog lane): the model calls carry
	// `expose.label` and `expose.purpose` (the settings group's heading and
	// the sentence under it), and steps whose headings repeated within one
	// group carry an `expose.label`. Proven: a copy of core-catalog/src with
	// only this lane's edits reverted hashes back to this old pin and to the
	// golden. (was '1f779b5c86196a')
	// Moved 2026-10-02 (lorebooks Wave 8 — C2/C3, the room rule): a `presences` read and an `eligible` step before `rank` (C2), and the
	// room rule's `place` step (+ preset `path`) wired as `shownElsewhere`.
	// Measured with other lanes' in-flight core-catalog edits in the tree,
	// not proven in isolation. (was '626f077468ed5')
	// Moved 2026-10-03 (attachments follow-ups, owner ruling): the transcript's files are
	// read (`attachments`) and placed for the model call (`attached`) before `prompt`;
	// a transcript with no files renders byte for byte as before. (was 'e7dab423b1f49')
	'core:spec/lair-file-room': '15e4a1a9fb7c47',
	// Moved twice on 2026-09-17. First (L1): the knock's options write the
	// room — the one write-class outlet is `create-lore-entry` (was
	// `create-message`), the build branch drafts the room's layout, and a preset
	// turns the review gate on. Then by the Lair finish lane: the room files as
	// a **location** (L3). (was '1c5e452458312a', then '3899346f4eb21')
	// Moved 2026-09-27 (lair pass B3/B18): the streaming stage and the stage
	// statuses are declared on `expose` (`stream`, `status`). Proven: with those
	// two keys stripped, the document hashes back to the old pin. (was '334691209cc9f')
	// Moved 2026-09-27 (lair pass B12): the build branch drafts the room with
	// the model (`choice.build.*`, was a fixed template), `save.name` is the
	// block's `referent`, and `onward` + `resume` write the master's line after
	// the gate. Only these edits moved it. (was '1460f968fd6d09')
	// Moved 2026-09-27 (lair pass W-GATE D3): the action declares
	// `presentWhen` — present only while a knock is open
	// (`session.openForm.action`). Proven: a copy of core-catalog/src with
	// just that edit reverted hashes back to the old pin. (was '1463350a023f68')
	// Moved 2026-09-28 (lair re-plan R9): the action collects optional text
	// (_Describe the room_) and says so; the `choice` junction (build ·
	// improvise) became `room` on `input.text` — `room.typed.save` (content =
	// the typed text, review off) · `room.drafted.*` (the Castellan's draft,
	// review on); the preset names both saves. Proven with the lair-respond
	// pin above. (was '18a1fa33f65921')
	// Moved 2026-09-29 (places plan B6): Answer the door links the new room
	// to the room the party stand in — `gather.rooms` (a location listing),
	// `here` (`undescribed-name@1` over `gather.state.read.state` at `path:
	// 'world.location'`), and the `link` junction on `here.entryId` whose
	// `resolved` branch is `link-lore-entries@1` from `room.entryId`, `leads
	// to` both ways; their preset values. Proven with the lair-respond pin
	// above. (was '15f936dc559f84')
	// Moved 2026-09-30 (plan A27 P5): `here` takes `fallbackName` from
	// `answer.vantage`. Proven with the lair-respond pin above.
	// (was 'ea7e0ac0ac269')
	// Moved 2026-09-30 (plan A28): `gather.lore` reads as the Castellan, and
	// the drafted branch's `context` takes `gather.rooms.read.entries` as
	// `locationEntries`. Proven: a copy of core-catalog/src with only this lane's edits reverted hashes back to the old pin. (was 'acb2d1c54207b')
	// Moved 2026-09-30 (plan A28 review): the draft reads `gather.worldLore`
	// and `gather.historyEntries` in place of `gather.lore`, so no character
	// lore reaches a room. Proven with the lair-file-room pin above.
	// (was '16343d5b03a3ac')
	// Moved 2026-09-30 (config grouping, catalog lane): the model calls carry
	// `expose.label` and `expose.purpose` (the settings group's heading and
	// the sentence under it), and steps whose headings repeated within one
	// group carry an `expose.label`. Proven: a copy of core-catalog/src with
	// only this lane's edits reverted hashes back to this old pin and to the
	// golden. (was '7ff1efdd3c37a')
	// Moved 2026-10-02 (lorebooks Wave 8 — C2/C3, the room rule): a `presences` read and an `eligible` step before `rank` (C2), and the
	// room rule's `place` step (+ preset `path`) wired as `shownElsewhere`.
	// Measured with other lanes' in-flight core-catalog edits in the tree,
	// not proven in isolation. (was '1688d15ea113ef')
	// Moved 2026-10-03 (attachments follow-ups, owner ruling): the transcript's files are
	// read (`attachments`) and placed for the model call (`attached`) before `prompt`;
	// a transcript with no files renders byte for byte as before. (was 'b3f5009baca91')
	'core:spec/lair-room-answer': 'aeba7feeb1b33',
	// Moved 2026-09-27 (lair pass B3/B18): the streaming stage and the stage
	// statuses are declared on `expose` (`stream`, `status`). Proven: with those
	// two keys stripped, the document hashes back to the old pin. (was '1c2a2e148f7f4e')
	// Moved 2026-09-27 (lair pass W-GATE D2): the typed line is wired to
	// `context.turnDirection`. Proven: a copy of core-catalog/src with just
	// that edit reverted hashes back to the old pin. (was 'be6bf430fc3bd')
	// Moved 2026-09-28 (lair re-plan R3): `composerText: 'required'` became
	// `collects.text` ('What do you whisper?'). Proven: the built document with
	// `collects` deleted and `composerText` restored hashes back to the old pin.
	// (was '4ea205316b7e6')
	// Moved 2026-09-28 (lair re-plan R10, whisper recipients): the action
	// collects `recipients` (Who hears it, min 1, overwrites the whisper slot)
	// beside its text, a new description, and the graph is pure — inlet,
	// state, `resolve` (the one change, `owners` = `input.recipients`) and
	// `apply`; the model call (gather, context, prompt, write, said) and its
	// preset values are gone. Proven: a copy of sdk+contracts+core-catalog
	// with only R10's edits reverted hashes back to the old pin.
	// (was '76066b2c2a5ab')
	'core:spec/lair-whisper': '17cf2e37e34e6',
	// Moved 2026-09-28 (lair re-plan R3): `composerText: 'required'` became
	// `collects.text` ('Direction the party should feel'). Proven: the built
	// document with `collects` deleted and `composerText` restored hashes back to
	// the old pin. (was '16413e137630d4')
	// Moved 2026-09-28 (lair re-plan R8): the description tells the Castellan,
	// not the narrator. Proven: a copy of sdk, contracts and core-catalog sources with only R8's edits reverted (lair.ts's respond spec restored, lairActions.ts, actions.ts, the contract ports and `split-first@1`, prompts.ts) hashes back to every old pin and the golden. (was '1877bfe4e0a7c3')
	'core:spec/lair-nudge': '21b5bb80f5a13',
	// Moved 2026-09-27 (lair pass B3/B18): the streaming stage and the stage
	// statuses are declared on `expose` (`stream`, `status`). Proven: with those
	// two keys stripped, the document hashes back to the old pin. (was '13c47a285b09c5')
	// Moved 2026-09-27 (lair pass B17, owner D7a): the row is a streamed
	// Narrator row — `placeholder` (create, generating) + `save` (update, with
	// `thinking`), the typed text wired to `context.turnDirection`, the status
	// 'Springing a trap', and the new description. Proven: a copy of
	// core-catalog/src with just those edits reverted hashes back to the old
	// pin. (was '1a76572366c955')
	// Moved 2026-09-28 (lair re-plan R3): `composerText: 'optional'` became
	// `collects.text` ('What is the trap?', ifEmpty 'The room decides.'), and the
	// description says _Say what the trap is, or leave it to the room_. Proven: the
	// built document with `collects` deleted, `composerText` restored and the old
	// description hashes back to the old pin. (was '13037fcf38e983')
	// Moved 2026-09-28 (lair re-plan R8): the row is the Castellan's
	// (`placeholder.speaker: 'envoy:castellan'`) and the description says the
	// Castellan tells what it cost. Proven: a copy of sdk, contracts and core-catalog sources with only R8's edits reverted (lair.ts's respond spec restored, lairActions.ts, actions.ts, the contract ports and `split-first@1`, prompts.ts) hashes back to every old pin and the golden. (was '7908780de567e')
	// Moved 2026-10-01 (post-history trigger, owner ruling): a default preset ships
	// `postHistoryTokenTrigger: 3000` on `prompt`. Proven: a copy of core-catalog/src with
	// only this change reverted hashes back to the old pin. (was '5d480cd988aac')
	// Moved 2026-10-02 (lorebooks Wave 8 — C2/C3, the room rule): a `presences` read and an `eligible` step before `rank` (C2), in the
	// Castellan's action builder.
	// Measured with other lanes' in-flight core-catalog edits in the tree,
	// not proven in isolation. (was '435ec04f9e98')
	// Moved 2026-10-03 (owner note 39): the port `thinking` -> `reasoning` on
	// generate-text / update-message, so `save` wires `reasoning`. Measured
	// with other lanes' in-flight core-catalog edits in the tree. (was 'b0bed56a5f13d')
	// Moved 2026-10-03 (attachments follow-ups, owner ruling): the transcript's files are
	// read (`attachments`) and placed for the model call (`attached`) before `prompt`;
	// a transcript with no files renders byte for byte as before. This copy was already stale before the edit (the app's pin read 2cd46fc610e39 — an earlier lane recorded it there only). (was '132d6d7d30e21c')
	'core:spec/lair-trap': '15e6228b78c851',
	// Moved 2026-09-27 (lair pass B3/B18): the streaming stage and the stage
	// statuses are declared on `expose` (`stream`, `status`). Proven: with those
	// two keys stripped, the document hashes back to the old pin. (was '194ea02b271eb3')
	// Moved 2026-09-27 (lair pass B17, owner D7a): as the trap — placeholder +
	// update with `thinking`, `turnDirection`, status 'Revealing', new
	// description. Proven the same way. (was '1a6fea0495e3bc')
	// Moved 2026-09-28 (lair re-plan R3): as the trap — `collects.text` ('What
	// do they notice?'), description _Say what they notice, or leave it to the
	// room_. Proven the same way. (was '1c5849cac7c2d2')
	// Moved 2026-09-28 (lair re-plan R8): the row is the Castellan's
	// (`placeholder.speaker: 'envoy:castellan'`). Proven: a copy of sdk, contracts and core-catalog sources with only R8's edits reverted (lair.ts's respond spec restored, lairActions.ts, actions.ts, the contract ports and `split-first@1`, prompts.ts) hashes back to every old pin and the golden. (was '14a4a433b3e291')
	// Moved 2026-10-01 (post-history trigger, owner ruling): a default preset ships
	// `postHistoryTokenTrigger: 3000` on `prompt`. Proven: a copy of core-catalog/src with
	// only this change reverted hashes back to the old pin. (was '87fe755438456')
	// Moved 2026-10-02 (lorebooks Wave 8 — C2/C3, the room rule): a `presences` read and an `eligible` step before `rank` (C2), in the
	// Castellan's action builder.
	// Measured with other lanes' in-flight core-catalog edits in the tree,
	// not proven in isolation. (was '53192d1eaa51e')
	// Moved 2026-10-03 (owner note 39): the port `thinking` -> `reasoning` on
	// generate-text / update-message, so `save` wires `reasoning`. Measured
	// with other lanes' in-flight core-catalog edits in the tree. (was '1e20019e4ba718')
	// Moved 2026-10-03 (attachments follow-ups, owner ruling): the transcript's files are
	// read (`attachments`) and placed for the model call (`attached`) before `prompt`;
	// a transcript with no files renders byte for byte as before. This copy was already stale before the edit (the app's pin read 177a82bd12699e — an earlier lane recorded it there only). (was '1a79a7dcd1eb46')
	'core:spec/lair-reveal': '130237fa29fa50',
	// Moved 2026-09-27 (lair pass B3/B18): the streaming stage and the stage
	// statuses are declared on `expose` (`stream`, `status`). Proven: with those
	// two keys stripped, the document hashes back to the old pin. (was '15c9296cf3ab70')
	// Moved 2026-10-03 (attachments follow-ups, owner ruling): the transcript's files are
	// read (`attachments`) and placed for the model call (`attached`) before `prompt`;
	// a transcript with no files renders byte for byte as before. Plus `{{{attachments}}}` in ANSWER_FORM_TEMPLATE's message loop. (was '1c32eb6a456349')
	'core:spec/answer-form-lair': 'd5cd2911aa349',
	// Its own turn order since the modder pass (R27, 2026-09-23).
	// Moved 2026-09-27 (lair pass B9): it recomputes on message-deleted and
	// message-hidden too (was '6bc2842fd6676').
	// Moved 2026-09-28 (lair re-plan R6): the genre (channels, envoys) and the
	// history preset `channel: '*'`. Proven with the pins above. (was '1a9cbfafa790bf')
	// Moved 2026-09-30 (Lair character turns): the pool admits the active
	// delvers (`characters: 'active'`), so the turns a standing plan prepares
	// are kept at the write. Proven: a copy of core-catalog/src with only this lane's edits reverted
	// (lair.ts, turnOrder.ts, genres.ts) hashes back to every old Lair pin. (was '1bee84716ce1fa')
	'core:spec/lair-turn-order': 'c0edd4e6d3d23',
}

describe('the Lair pipelines', () => {
	test('eleven specs, and every one builds and validates clean', () => {
		const slugs = lairSpecs().map((s) => s.slug)
		assert.deepEqual(slugs.sort(), Object.keys(PUBLISHED).sort())
		for (const entry of lairSpecs()) {
			const errors = validate(entry.build()).filter((f) => f.severity === 'error')
			assert.deepEqual(
				errors.map((e) => `${e.law} ${e.nodeKey ?? ''} ${e.message}`),
				[],
				entry.slug,
			)
		}
	})

	test('each document hashes to its recorded pin', () => {
		const drifted = lairSpecs()
			.map((e) => [e.slug, canonicalHash(e.build())] as const)
			.filter(([slug, hash]) => PUBLISHED[slug] !== hash)
			.map(([slug, hash]) => `${slug}: recorded ${PUBLISHED[slug]}, code ${hash}`)
		assert.deepEqual(
			drifted,
			[],
			'a shipped Lair document changed — record the new hash in the same commit',
		)
	})

	/**
	 * R8 (owner F2/F4, 2026-09-28): one live row per EXECUTION PATH (F7 as
	 * amended). Each branch opens the row it fills — the Castellan's
	 * narration, its Sanctum talk, the knock, and, after the beats row, the
	 * party in the session's party speech (owner ruling 2026-09-30): the
	 * Castellan's lines for the party (the picked delver's row on a pick), or
	 * a character turn's line — and the branches are mutually exclusive. The
	 * beats row is a COMPLETE row: never generating, never a claimed row.
	 */
	test('one live row per execution path; the beats row is a complete row', () => {
		const doc = respondDoc()
		const writes = doc.nodes.filter((n) => n.kind === 'outlet')
		const DOOR = 'via.turn.channel.story.door'
		const SPEECH = `${DOOR}.play.speech`
		assert.deepEqual(writes.map((n) => n.key), [
			'via.narrate.placeholder',
			'via.narrate.save',
			'via.turn.channel.sanctum.placeholder',
			'via.turn.channel.sanctum.save',
			// R13: the scratchpad rewrite — an annex write, never a row.
			'via.turn.channel.sanctum.padKeep.kept.write',
			`${DOOR}.knock.placeholder`,
			`${DOOR}.knock.save`,
			`${DOOR}.play.plan.posted.write`,
			`${SPEECH}.castellan.party.speaks.row.picked.placeholder`,
			`${SPEECH}.castellan.party.speaks.row.turn.placeholder`,
			`${SPEECH}.castellan.party.speaks.save`,
			`${SPEECH}.each.character.turn.placeholder`,
			`${SPEECH}.each.character.turn.save`,
		])
		const fed = (key: string, port: string) =>
			doc.edges.some((e) => e.to === key && e.toPort.split('.')[0] === port) ||
			(doc.nodes.find((n) => n.key === key)?.config as any)?.[port] != null
		for (const port of ['generating', 'row'])
			assert.ok(!fed(`${DOOR}.play.plan.posted.write`, port), `plan row ${port}`)
		// The beats row is the Castellan's, on the Sanctum.
		const beats = doc.nodes.find((n) => n.key === `${DOOR}.play.plan.posted.write`)!
		assert.equal((beats.config as any).channel, 'sanctum')
		assert.equal((beats.config as any).speaker, 'envoy:castellan')
		// No narrator scene step, and no Plan fold (R8 retired both).
		assert.ok(!doc.nodes.some((n) => /scene|planSection|turnText/.test(n.key)))
		// And no lead (owner ruling 2026-09-30): no step is named for one.
		assert.ok(!doc.nodes.some((n) => /\blead\b|picked\.say/.test(n.key)))
	})

	/**
	 * Was "every write-class outlet is on the spine (01 §4)" until 2026-09-27:
	 * W1b (owner 2026-09-23) lets a clause write, in declaration order, and the
	 * respond spec now does (B15/B16). The action specs still write on the
	 * spine only.
	 */
	test('every action spec writes on the spine (01 §4)', () => {
		for (const entry of lairSpecs()) {
			// The respond spec's clauses write (W1b), and so does the create
			// spec's greeting (R6): written only when the Castellan has one —
			// and the room answer's (R9): the typed room or the drafted one —
			// and File as a room's (R11): the new room, or the Sanctum note.
			if (
				entry.slug === LAIR_RESPOND_SPEC_ID ||
				entry.slug === 'core:spec/lair-create' ||
				entry.slug === LAIR_ROOM_ANSWER_SPEC_ID ||
				entry.slug === LAIR_FILE_ROOM_SPEC_ID
			)
				continue
			for (const node of entry.build().nodes as SpecDocument['nodes'])
				if (node.kind === 'outlet') assert.equal(node.clauseId, undefined, node.key)
		}
	})

	test('the preset binds every required event and carries the seven actions', () => {
		const preset = corePresets().find((p) => p.genre === LAIR_GENRE_ID)!
		assert.equal(preset.slug ?? 'lair-default', 'lair-default')
		assert.ok(preset.bindings[sessionEvents.sessionCreated])
		assert.ok(preset.bindings[sessionEvents.messageRespond])
		// Optional in the surface, bound here: this genre puts forms to people.
		assert.ok(preset.bindings[sessionEvents.formAddressed])
		// Seven since R11 (2026-09-28): File as a room, on a message's ⋮.
		assert.deepEqual(preset.actions?.include?.length, 7)
		assert.deepEqual((preset.defaults as any)?.genreFields, { tone: 'grounded', trustNarrator: false })
	})

	test('the genre ships its layout, and it names only widgets core has', () => {
		// Core's own list, never a copy: a copy kept `inventory` after R79 removed it.
		const known = new Set(CORE_WIDGETS.map((w) => w.id))
		const [shipped] = lairGenre.layouts!
		// The genre's default IS the shipped session layout: one format.
		assert.equal(shipped!.slug, 'default')
		assert.equal(shipped!.preset, LAIR_LAYOUT)
		const placed = drawnWidgetIds(shipped!.preset)
		// The room list is `world-state` until a map widget exists — see the
		// note in layouts.ts. Naming one core does not ship would put a
		// labelled placeholder in every Lair session.
		for (const id of placed) assert.ok(known.has(widgetOfInstance(id)), id)
		assert.deepEqual(placed, ['messages', 'stats', 'world-state', 'messages#sanctum'])
	})
})

/* ── the turn, executed ─────────────────────────────────────────────────── */

const respondDoc = (): SpecDocument =>
	CORE_SPECS.find((s) => s.slug === LAIR_RESPOND_SPEC_ID)!.build()

/**
 * The author preset, in the shape the executor reads it from.
 *
 * The host projects a document's `.preset()` into the config chain's author
 * layer; `ConfigWorld.authorDefaults` is that layer. Deriving it from the
 * document rather than restating it is what makes this an assertion as well as
 * a fixture: a preset naming a node key that does not exist would configure
 * nothing, and the `path` parameters below are what make the voices iterate and
 * the knock find its question.
 */
function authorDefaultsOf(doc: SpecDocument): ConfigWorld['authorDefaults'] {
	const out: Record<string, Record<string, Record<string, unknown>>> = {}
	const keys = new Set(doc.nodes.map((n) => n.key))
	for (const preset of doc.presets ?? [])
		for (const v of preset.values ?? []) {
			assert.ok(keys.has(v.nodeKey), `preset names '${v.nodeKey}', which is not a node`)
			out[v.nodeKey] ??= {}
			out[v.nodeKey]![v.slot] = v.value as Record<string, unknown>
		}
	return out
}

/** The value at a dotted path — what `generate-json`'s `path` parameter selects. */
const at = (value: unknown, path?: string): unknown => {
	if (!path) return value
	let cur: any = value
	for (const seg of path.split('.')) {
		if (cur == null) return undefined
		cur = cur[seg]
	}
	return cur
}

const band = (key: string) => ({
	sourceKey: key,
	items: [] as string[],
	weight: 0.2,
	minInclude: 0,
	priority: 'normal',
})

/** The rooms the listing holds (B13) — the party are in the first. */
const ROOMS = [
	{ id: 1, name: 'The Old Well', content: 'Exits: down → The Stair' },
	{ id: 2, name: 'The Stair', content: 'Exits: up → The Old Well' },
]

/** A dungeon with two rooms in it and three delvers standing in one. */
const CAST = {
	sessionCharacters: [
		{ character: { id: 11, name: 'Verity' } },
		{ character: { id: 12, name: 'Brask' } },
		{ character: { id: 13, name: 'Oln' } },
	],
}

/**
 * The stand-ins this genre needs on top of `helpers.ts` — the state substrate,
 * the four context surfaces, the two JSON readers and the two writes. Each
 * answers the ports its definition declares and nothing else, so what a test
 * reads off the receipt is what the graph actually carried.
 */
const lairBindings = (plan: unknown, over: Bindings = {}): Bindings =>
	bindings({
		'core:query/world-lore@1': async () => ok({ main: band('world'), hits: band('world') }),
		/**
		 * ⚠ Keyed on `speaker` (W1): the stand-in answers a band named after
		 * whoever the read was for, so a receipt says which delver's private lore
		 * each voice was handed. The real gate is the host's; what this proves is
		 * that the graph carries a different subject per iteration.
		 */
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
		// B13: the rooms the dungeon holds, listed — the one the party stand in
		// among them.
		'core:query/lorebook-entries@1': async () => ok({ main: ROOMS, entries: ROOMS }),
		/**
		 * R7: the entry lookup only, on the SDK's name rule — the prose lookup
		 * is the app binding's and is tested there (`undescribedName.test.ts`).
		 */
		'core:task/undescribed-name@1': async (i: any) => {
			// B6: the name at `path` inside `name`; a lore reference is its entry.
			// A27: naming nothing there, `fallbackName` is read in its place.
			const held = at(i?.name, i?.params?.path)
			const names = (v: unknown) =>
				(!!v && typeof v === 'object' && typeof (v as any).entryId === 'number') ||
				(typeof v === 'string' && v.trim() !== '')
			const raw = names(held) ? held : i?.fallbackName
			const listed = [...(i?.locationEntries ?? []), ...(i?.entries ?? [])]
			const ref = raw && typeof raw === 'object' ? (raw as any).entryId : undefined
			const name = typeof raw === 'string' ? raw.trim() : ''
			const hit = listed.find((e: any) =>
				ref !== undefined ? e?.id === ref : sameName(e?.name, name),
			)
			const undescribed = name && !hit ? name : ''
			return ok({
				main: undescribed,
				undescribed,
				describedBy: hit ? 'entry' : '',
				entryId: hit?.id ?? null,
				passage: '',
			})
		},
		'core:task/concat-candidates@1': async (i: any) =>
			ok({ main: i.sources ?? [], candidates: i.sources ?? [] }),
		/**
		 * The two arms (R3, 2026-10-02) and the gates before every ranker
		 * (C2): stand-ins that find nothing and pass every candidate through,
		 * so what these tests read off a receipt is the genre's own wiring.
		 * Who each arm searched for is on its `speaker` input; the real
		 * scoping is the host's and is tested there.
		 */
		'core:task/query-windows@1': async () => ok({ main: [], current: [], recent: [] }),
		'core:query/entity-search@1': async () => ok({ main: [], hits: [], messages: [] }),
		'core:query/mention-spans@1': async () => ok({ main: [], mentions: [], texts: [] }),
		'core:query/entity-link@1': async (i: any) =>
			ok({ main: [], candidates: i?.candidates ?? [], links: [] }),
		'core:query/cast-presences@1': async () => ok({ main: [], at: null }),
		'core:task/eligibility@1': async (i: any) =>
			ok({ main: i?.candidates ?? [], candidates: i?.candidates ?? [], diagnostics: {} }),
		'core:task/build-planner-context@1': async () =>
			ok({ main: {}, templateContext: { who: 'planner' }, seedName: '' }),
		'core:task/build-scene-context@1': async () =>
			ok({ main: {}, templateContext: { who: 'narrator' }, seedName: 'Narrator' }),
		/**
		 * ⚠ It publishes `speaker` (W1), the way the app's binding does: the
		 * name is matched against the cast ONCE, here, and the reference is what
		 * the voice's own lore lane is wired to. A name the cast does not hold is
		 * `null` — a genuine side character is nobody.
		 */
		'core:task/build-side-character-context@1': async (i: any) => {
			// By name (a planner's speaker) or by id (a pick, B15) — the app's
			// binding resolves both against the seated cast.
			const byId = i?.sideCharacter?.characterId
			const seat = CAST.sessionCharacters.find((c) =>
				byId != null
					? c.character.id === byId
					: c.character.name === String(i?.sideCharacter?.name ?? ''),
			)
			const name = seat?.character.name ?? String(i?.sideCharacter?.name ?? '')
			return ok({
				main: {},
				templateContext: { who: name || '?' },
				seedName: name || '?',
				speaker: seat ? `character:${seat.character.id}` : null,
			})
		},
		'core:task/build-keeper-context@1': async () =>
			ok({ main: {}, templateContext: { who: 'keeper' }, seedName: '' }),
		'core:task/build-template-context@1': async () =>
			ok({ main: {}, templateContext: { who: 'context' }, seedName: '' }),
		'core:task/build-narrator-context@1': async () =>
			ok({ main: {}, templateContext: { who: 'narrator' }, seedName: 'Narrator' }),
		/**
		 * The assembled prompt, carrying **whose** context built it — the one
		 * fact these tests read off a model call, since a stand-in has no model
		 * to ask. `helpers.ts`'s own stub answers the allocation and drops the
		 * context, which is what every other suite needs and not what this one
		 * does.
		 */
		'core:task/assemble@2': async (i: any) => {
			const context = { who: i?.templateContext?.who ?? '?', budget: i?.budget ?? 0 }
			return ok({ main: context, context })
		},
		'core:task/prose-transcript@1': async () => ok({ main: [], messages: [] }),
		'core:task/process-messages@1': async (i: any) =>
			ok({ main: [], messages: [], seedName: i?.seedName }),
		'core:oracle/generate-json@1': async (i: any) => {
			const value = at(plan, i?.params?.path)
			return ok({
				main: plan,
				json: plan,
				value,
				items: Array.isArray(value) ? value : value == null ? [] : [value],
				text: JSON.stringify(plan),
			})
		},
		'core:task/parse-json@1': async (i: any) => {
			const doc = JSON.parse(String(i?.text ?? '{}'))
			const value = at(doc, i?.params?.path)
			return ok({
				main: doc,
				json: doc,
				value,
				items: Array.isArray(value) ? value : value == null ? [] : [value],
			})
		},
		'core:task/join-text@1': async (i: any) => {
			const path = i?.params?.path ?? 'text'
			const sep = i?.params?.separator ?? '\n\n'
			const text = (Array.isArray(i?.items) ? i.items : [])
				.map((e: any) => (path ? e?.[path] : e))
				.filter((t: unknown) => typeof t === 'string' && t.length > 0)
				.join(sep)
			return ok({ main: text, text })
		},
		// The real reading and the write's own checks (B5): what the host runs.
		'core:task/list-section@1': async (i: any) => {
			const items = sectionItemsOf(i?.json, i?.params?.path ?? '')
			const sections =
				checkFoldedSections(
					items.length
						? [{ kind: i?.params?.kind ?? 'notes', label: i?.params?.label ?? 'Notes', items }]
						: [],
				).sections ?? []
			const text = items.map((line) => `- ${line}`).join('\n')
			return ok({ main: sections, sections, text })
		},
		// R8: the first and the rest — the contract's rules, as the host's.
		'core:task/split-first@1': async (i: any) => {
			const items = Array.isArray(i?.items) ? i.items : i?.items == null ? [] : [i.items]
			const [first, ...rest] = items
			return ok({ main: { first, rest }, ...(first !== undefined ? { first } : {}), rest })
		},
		'core:task/make-choices@1': async (i: any) => {
			const options = (i?.json?.options ?? []) as Array<{ key: string; label: string }>
			const blocks = [
				{
					kind: 'choices',
					question: i?.json?.question ?? '',
					...(i?.referent ? { referent: i.referent } : {}),
					...(typeof i?.vantage === 'string' && i.vantage.trim()
						? { vantage: i.vantage.trim() }
						: {}),
					// The port wins over the document's addressee, by contract.
					addressee: i?.addressee ?? i?.json?.addressee ?? null,
					actions: options.map((o) => ({
						fn: i?.fn,
						action: i?.action,
						label: o.label,
						choice: o.key,
					})),
				},
			]
			return ok({
				main: blocks,
				blocks,
				text: i?.json?.question ?? '',
				addressee: i?.addressee ?? null,
			})
		},
		'core:task/read-answer@1': async (i: any) =>
			ok({
				main: i?.payload ?? {},
				choice: i?.payload?.choice ?? null,
				label: i?.payload?.label ?? null,
				addressee: 'owner',
				characterId: null,
				question: '',
				values: i?.payload ?? {},
			}),
		// 2026-09-27: Lair reads item supply like Adventure does.
		'core:query/item-supply@1': async () => ok({ main: SUPPLY, supply: SUPPLY }),
		'core:query/resolve-state-changes@1': async (i: any) =>
			ok({ main: i?.changes ?? [], changes: i?.changes ?? [], refused: [] }),
		'core:task/set-state@1': async (i: any) =>
			ok({
				main: i?.params?.mode ?? 'propose',
				applied: i?.params?.mode === 'apply' ? i?.changes : [],
				proposed: i?.params?.mode === 'apply' ? [] : i?.changes,
				refused: [],
			}),
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
		/**
		 * R13: the annex's AI view — the scratchpad only for the Castellan's
		 * own reference, as the host's audience filter answers.
		 */
		'core:query/session-annex@1': async (i: any) =>
			ok({ main: i?.view === 'ai' && i?.speaker === 'envoy:castellan' ? SCRATCHPAD_VIEW : {} }),
		'core:task/pair@1': async (i: any) => {
			const [a, b] = [i?.params?.firstKey ?? 'first', i?.params?.secondKey ?? 'second']
			return ok({
				main: {
					...(i?.first !== undefined ? { [a]: i.first } : {}),
					...(i?.second !== undefined ? { [b]: i.second } : {}),
				},
			})
		},
		'core:outlet/set-session-annex@1': async (i: any) => ok({ main: { ok: true }, annex: i?.value }),
		/**
		 * The standing plan a character turn reads back (owner ruling
		 * 2026-09-30): the plan this turn's stand-in planner answers, as the
		 * plan row would have stored it. Which row stands is the host's.
		 */
		'core:query/turn-plan@1': async () => ok({ main: { plan }, plan }),
		...over,
	})

/** What the Castellan's annex view holds (R13): its scratchpad. */
const SCRATCHPAD = 'The Sunken Vault waits two rooms north.'
const SCRATCHPAD_VIEW = { 'castellan-scratchpad': SCRATCHPAD }

/** One ordinary plan: three beats, two of the party with something to say. */
const PLAN = {
	beats: ['The well shaft opens into the dark.'],
	speakers: [
		{ name: 'Verity', intent: 'sound the depth' },
		{ name: 'Brask', intent: 'complain about it' },
	],
	unknownExit: '',
	knockQuestion: '',
	worldHints: { location: 'The Old Well' },
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
	// A delver picked by the turn control (B15) — null is the Castellan's turn.
	characterId: number | null = null,
	// Extra keys on the session's fields, as a stored session might carry them.
	extraFields: Record<string, unknown> = {},
	// How the turn was reached (R8): `narrate` is the Narrate press.
	via = 'pick',
	channel = 'main',
) => {
	const doc = respondDoc()
	return (await run(doc, {
		world: { ...world, authorDefaults: authorDefaultsOf(doc) },
		input: {
			text: 'send them down the shaft',
			messageId: null,
			characterId,
			via,
			channel,
			sessionScope: { sessionId: 1 },
			fields: { tone: 'grim', trustNarrator: false, ...extraFields },
		},
		seed: 'lair',
		triggerSource: 'ui',
		bindings: lairBindings(plan, over),
	})) as any
}

const ran = (receipt: any, key: string) =>
	receipt.nodes.some((n: any) => n.nodeKey === key && n.result === 'ok')

/** What the item-supply stand-in answers: one unique item, already held. */
const SUPPLY = [
	{ entryId: 41, name: 'The Crown', supply: 'unique', limit: 1, held: 1, remaining: 0, holders: [] },
]

const S = 'via.turn.channel.story.pick'
const DOOR = 'via.turn.channel.story.door'
const PLAY = `${DOOR}.play`
/** Each delver speaks: a character turn, on a run whose subject is a delver. */
const CT = `${PLAY}.speech.each.character.turn`
/** The Castellan speaks for the party. */
const PARTY = `${PLAY}.speech.castellan.party.speaks`
const node = (receipt: any, key: string) => receipt.nodes.find((n: any) => n.nodeKey === key)
/** Whose books the Castellan's keeper keeps, read flat with its absent items dropped. */
const kept = (receipt: any) =>
	[node(receipt, 'keep.played.keeperResolve').input.keeps].flat(Infinity).filter((k: unknown) => k != null)
const nodes = (receipt: any, key: string) => receipt.nodes.filter((n: any) => n.nodeKey === key)
const saying = (said: string[]) => ({
	'core:oracle/generate-text@1': async (i: any) => {
		const who = i?.context?.who ?? '?'
		said.push(who)
		return ok({ main: `<${who}>`, text: `<${who}>`, reasoning: `${who} weighs it` })
	},
})

describe('a Lair turn', () => {
	test("the keeper's resolver reads the item supply, so Lair's genre enforces it (2026-09-27)", async () => {
		const receipt = await takeTurn(PLAN)
		assert.equal(receipt.outcome, 'ok')
		const resolve = node(receipt, 'keep.played.keeperResolve')
		assert.ok(resolve, 'the keeper resolver ran')
		assert.deepEqual(resolve.input.supply, SUPPLY)
	})

	/**
	 * R8, and the owner's ruling of 2026-09-30 ("they are character turns"):
	 * while each delver speaks, a planned turn is the Castellan's run — the
	 * planner, the beats row in the Sanctum, the keeper — and NOBODY speaks in
	 * it. The beats row is the plan row: it carries the turns it hands on, in
	 * the plan's order, and each named delver then takes a character turn of
	 * their own. The Castellan's keeper keeps the world's books alone.
	 */
	test('a planned turn while each delver speaks: the plan row hands on the turns, nobody speaks, and the keeper keeps the world', async () => {
		const said: string[] = []
		const receipt = await takeTurn(PLAN, saying(said))
		assert.equal(receipt.outcome, 'ok')
		// No voice in the Castellan's run: every line is a character turn.
		assert.deepEqual(said, [])
		assert.ok(!ran(receipt, `${CT}.say`))
		// The beats row: the Castellan's, on the Sanctum, the list as its body —
		// and the plan it hands on, with the speakers in the plan's order.
		const beats = node(receipt, `${PLAY}.plan.posted.write`)
		assert.equal(beats.result, 'ok')
		assert.deepEqual(
			[beats.input.channel, beats.input.speaker, beats.input.text],
			['sanctum', 'envoy:castellan', '- The well shaft opens into the dark.'],
		)
		assert.deepEqual(beats.input.turnPlan, { plan: PLAN, locationPassage: '' })
		// No live row: nothing streamed.
		for (const n of receipt.nodes) assert.notEqual(n.input?.generating, true, n.nodeKey)
		// The keeper ran ONCE, over the beats, keeping the world's books only;
		// its changes are filed at the beats row (`worldRow`).
		const keeper = nodes(receipt, 'keep.played.keeperContext')
		assert.equal(keeper.length, 1)
		assert.equal(keeper[0].input.reply, '- The well shaft opens into the dark.')
		assert.deepEqual(kept(receipt), ['world'])
		const propose = node(receipt, 'keep.played.commit.reviewed.propose')
		assert.deepEqual(propose.input.worldRow, beats.output.messageId)
		// And neither the pick branch nor the narration ran.
		assert.ok(!receipt.nodes.some((n: any) => String(n.nodeKey).startsWith(`${S}.picked.`) && n.result === 'ok'))
		assert.ok(!receipt.nodes.some((n: any) => String(n.nodeKey).startsWith('via.narrate.') && n.result === 'ok'))
	})

	/**
	 * R8: Narrate is the Castellan fired — from either composer, the
	 * narration lands on `main`; no planner and no voices.
	 */
	for (const channel of ['main', 'sanctum'])
		test(`Narrate from ${channel}: one streamed Castellan row on main, and the keeper`, async () => {
			const said: string[] = []
			const receipt = await takeTurn(PLAN, saying(said), null, {}, 'narrate', channel)
			assert.equal(receipt.outcome, 'ok')
			assert.deepEqual(said, ['narrator'])
			const placeholder = node(receipt, 'via.narrate.placeholder')
			assert.deepEqual(
				[placeholder.input.generating, placeholder.input.channel, placeholder.input.speaker],
				[true, 'main', 'envoy:castellan'],
			)
			const save = node(receipt, 'via.narrate.save')
			assert.equal(save.input.text, '<narrator>')
			assert.equal(save.input.reasoning, 'narrator weighs it')
			// Narrate adds no direction.
			assert.equal(node(receipt, 'via.narrate.context').input.turnDirection, undefined)
			assert.ok(!receipt.nodes.some((n: any) => String(n.nodeKey).startsWith('via.turn.') && n.result === 'ok'))
			assert.equal(nodes(receipt, 'keep.played.keeperWrite').length, 1)
			assert.equal(node(receipt, 'keep.played.keeperContext').input.reply, '<narrator>')
			// The Castellan's keeper: the world's books, never a delver's.
			assert.deepEqual(kept(receipt), ['world'])
		})

	test('Narrate is routed ahead of the channel, and the narration step streams', () => {
		const doc = respondDoc()
		const say = doc.nodes.find((n) => n.key === 'via.narrate.say')!
		assert.equal((say.expose as any)?.stream, true)
		assert.equal((say.expose as any)?.status, 'The Castellan narrates')
		const turn = doc.nodes.find((n) => n.key === `${CT}.say`)!
		assert.equal((turn.expose as any)?.stream, true)
		const planner = doc.nodes.find((n) => n.key === `${S}.planned.planWrite`)!
		assert.equal((planner.expose as any)?.status, 'The Castellan is planning the turn')
		assert.equal((planner.expose as any)?.stream, undefined)
	})

	/**
	 * **A character turn** (owner ruling 2026-09-30): a run whose subject is
	 * a delver — fired off the turn order by the standing plan, or by Pick
	 * who speaks — plays that delver's one turn: no planner, no beats and no
	 * Castellan keeper. It reads the standing plan, streams the delver's line
	 * into their own row, reads only their private lore, and keeps only their
	 * own books.
	 */
	test('a character turn: one delver, the standing plan, their own streamed row, their own lore and their own books', async () => {
		const said: string[] = []
		const receipt = await takeTurn(PLAN, saying(said), 12)
		assert.equal(receipt.outcome, 'ok')
		assert.deepEqual(said, ['Brask'])
		// The plan it plays from, read back — and handed to the voice.
		const plan = node(receipt, `${CT}.plan`)
		assert.equal(plan?.definitionId, 'core:query/turn-plan@1')
		assert.deepEqual(node(receipt, `${CT}.context`).input.plan, PLAN)
		// Their own row, streamed, finished.
		const placeholder = node(receipt, `${CT}.placeholder`)
		assert.deepEqual(
			[placeholder.input.generating, placeholder.input.channel, placeholder.input.speaker],
			[true, 'main', 'character:12'],
		)
		const save = node(receipt, `${CT}.save`)
		assert.equal(save.input.text, '<Brask>')
		assert.equal(save.input.reasoning, 'Brask weighs it')
		assert.deepEqual(save.input.target, placeholder.output.messageId)
		// Their own private lore, and nobody else's.
		assert.equal(node(receipt, `${CT}.lore`).input.speaker, 'character:12')
		const sources = node(receipt, `${CT}.pool`).input.sources as any[]
		assert.deepEqual(
			sources.map((b: any) => b?.sourceKey).filter((k: string) => String(k).startsWith('char:')),
			['char:character:12'],
		)
		// Their own books: the keeper over their line, keeping them alone.
		assert.equal(node(receipt, `${CT}.keeperContext`).input.reply, '<Brask>')
		assert.equal(node(receipt, `${CT}.keeperResolve`).input.keeps, 'character:12')
		assert.ok(ran(receipt, `${CT}.commit.reviewed.propose`))
		// Nothing planned, and the Castellan kept no books.
		assert.ok(!receipt.nodes.some((n: any) => String(n.nodeKey).startsWith(`${S}.planned.`) && n.result === 'ok'))
		assert.ok(!ran(receipt, `${PLAY}.plan.posted.write`))
		assert.ok(!ran(receipt, 'keep.played.keeperWrite'))
		// Exactly one live row.
		assert.deepEqual(
			receipt.nodes.filter((n: any) => n.input?.generating === true).map((n: any) => n.nodeKey),
			[`${CT}.placeholder`],
		)
	})

	test('a trusted session applies a character turn’s own changes, on the keeper’s apply mode', async () => {
		const receipt = await takeTurn(PLAN, saying([]), 12, { trustNarrator: true })
		assert.equal(receipt.outcome, 'ok')
		assert.equal(node(receipt, `${CT}.commit.trusted.apply`)?.output?.main, 'apply')
	})

	/**
	 * **How the party speak** (owner ruling 2026-09-30): the session's
	 * `partySpeech`. Each delver speaking is a character turn per delver; the
	 * Castellan speaking for the party is ONE call for them all, as nobody's
	 * voice.
	 */
	test('the party speech is a quick session field: each delver speaks by default, or the Castellan for the party', () => {
		const field = (lairGenre.shape?.fields as any)?.partySpeech
		assert.equal(field?.type, 'enum')
		assert.deepEqual(field?.of, ['each', 'castellan'])
		assert.equal(field?.default, 'each')
		assert.equal(field?.quick, true)
		assert.deepEqual(
			field?.members?.map((m: any) => m.label.en),
			['Each delver speaks', 'Castellan speaks for the party'],
		)
	})

	for (const fields of [{}, { partySpeech: 'each' }])
		test(`each delver speaks (${JSON.stringify(fields)}): the plan row hands on every named delver, and no party call`, async () => {
			const said: string[] = []
			const receipt = await takeTurn(PLAN, saying(said), null, fields)
			assert.equal(receipt.outcome, 'ok')
			assert.deepEqual(said, [])
			assert.deepEqual(
				node(receipt, `${PLAY}.plan.posted.write`).input.turnPlan.plan.speakers,
				PLAN.speakers,
			)
			assert.ok(!ran(receipt, `${PARTY}.say`))
		})

	/**
	 * No first and no later (owner ruling 2026-09-30): every delver's line is
	 * the SAME step — one prompt, one model, one sampling, one set of
	 * everything — and its books run on the state-keeper's settings.
	 */
	test('one character turn: no first or later step anywhere, and its books on the state-keeper', () => {
		const doc = respondDoc()
		const speech = doc.nodes.filter((n) => n.key.startsWith(`${PLAY}.speech.each.`))
		assert.ok(speech.length > 0)
		for (const n of doc.nodes)
			assert.ok(!/\.first\.|\bvoices\b|\blater\b|\bvoiceLines\b/.test(n.key), n.key)
		for (const n of doc.nodes) {
			const label = String((n.expose as any)?.label ?? '')
			assert.ok(!/\b(first|later|further)\b/i.test(label), `${n.key}: ${label}`)
		}
		assert.ok(!doc.clauses.some((c: any) => c.kind === 'each' && String(c.id).startsWith(PLAY)))
		const nodeAt = (key: string) => doc.nodes.find((n) => n.key === key)!
		const ref = (key: string, slot: string) => (nodeAt(key).config as any)?.[slot]
		// One model call for the delver's line, labelled for the turn shape.
		const says = doc.nodes.filter((n) => n.kind === 'oracle' && n.key.startsWith(`${PLAY}.speech.each.`))
		assert.deepEqual(says.map((n) => n.key), [`${CT}.say`, `${CT}.keeperWrite`])
		assert.equal((nodeAt(`${CT}.say`).expose as any)?.label, 'Character turn')
		assert.match(String((nodeAt(`${CT}.say`).expose as any)?.purpose), /each delver speaks/i)
		// The books: the state-keeper's prompt, model and sampling, by reference.
		assert.equal(ref(`${CT}.keeperContext`, 'prompts')?.ofNode, 'keep.played.keeperContext')
		assert.equal(ref(`${CT}.keeperWrite`, 'connection')?.ofNode, 'keep.played.keeperWrite')
		assert.equal(ref(`${CT}.keeperWrite`, 'sampling')?.ofNode, 'keep.played.keeperWrite')
		assert.equal((nodeAt(`${CT}.keeperWrite`).expose as any)?.purpose, undefined)
	})

	test('the Castellan speaks for the party: ONE streamed call for every named delver, in the Castellan\'s row, with no character lore', async () => {
		const said: string[] = []
		const receipt = await takeTurn(PLAN, saying(said), null, { partySpeech: 'castellan' })
		assert.equal(receipt.outcome, 'ok')
		assert.deepEqual(said, ['narrator'])
		assert.ok(!ran(receipt, `${CT}.say`))
		// No character turns follow: the plan row hands on none.
		assert.equal(node(receipt, `${PLAY}.plan.posted.write`).input.turnPlan, undefined)
		// Its row: the Castellan's, on main, opened after the beats.
		const placeholder = node(receipt, `${PARTY}.row.turn.placeholder`)
		assert.deepEqual(
			[placeholder.input.generating, placeholder.input.channel, placeholder.input.speaker],
			[true, 'main', 'envoy:castellan'],
		)
		const order = receipt.nodes.map((n: any) => n.nodeKey)
		assert.ok(order.indexOf(`${PLAY}.plan.posted.write`) < order.indexOf(`${PARTY}.row.turn.placeholder`))
		assert.equal(node(receipt, `${PARTY}.save`).input.text, '<narrator>')
		// Every named delver, in the plan's order — the first, then the rest.
		assert.deepEqual(node(receipt, `${PARTY}.context`).input.partySpeakers, [
			PLAN.speakers[0],
			[PLAN.speakers[1]],
		])
		// The party's reach: the room they stand in and the rooms one way on.
		assert.equal(node(receipt, `${PARTY}.context`).input.placeSight, 'reach')
		// Lore everyone may know: no character lore lane in its pool.
		const sources = node(receipt, `${PARTY}.pool`).input.sources as any[]
		assert.ok(sources.length > 0)
		assert.ok(!sources.some((b: any) => String(b?.sourceKey ?? '').startsWith('char:')))
		assert.ok(!receipt.nodes.some((n: any) => n.definitionId === 'core:query/character-lore@1' && String(n.nodeKey).startsWith(PLAY)))
		// The keeper reads the beats and the party's lines — and keeps the world's
		// books and those of every delver whose line it wrote.
		assert.equal(
			node(receipt, 'keep.played.keeperContext').input.reply,
			'- The well shaft opens into the dark.\n\n<narrator>',
		)
		assert.deepEqual(kept(receipt), ['world', PLAN.speakers[0], PLAN.speakers[1]])
		const say = respondDoc().nodes.find((n) => n.key === `${PARTY}.say`)!
		assert.equal((say.expose as any)?.stream, true)
	})

	test("the Castellan speaks for the party, picked: that delver's line alone, in their own row, and nothing plans", async () => {
		const said: string[] = []
		const receipt = await takeTurn(PLAN, saying(said), 12, { partySpeech: 'castellan' })
		assert.equal(receipt.outcome, 'ok')
		assert.deepEqual(said, ['narrator'])
		const placeholder = node(receipt, `${PARTY}.row.picked.placeholder`)
		assert.deepEqual(
			[placeholder.input.generating, placeholder.input.characterId],
			[true, 12],
		)
		assert.ok(!ran(receipt, `${PARTY}.row.turn.placeholder`))
		assert.ok(!ran(receipt, `${CT}.say`))
		assert.deepEqual(node(receipt, `${PARTY}.context`).input.partySpeakers, [{ characterId: 12 }, []])
		assert.deepEqual(node(receipt, `${PARTY}.save`).input.target, placeholder.output.messageId)
		assert.ok(!receipt.nodes.some((n: any) => String(n.nodeKey).startsWith(`${S}.planned.`) && n.result === 'ok'))
		assert.ok(!ran(receipt, 'keep.played.keeperWrite'))
	})

	test('the party call starts on its own shipped prompt, which renders whose lines it writes', () => {
		const preset = (respondDoc().presets ?? []).find((p) => p.default)!
		const named = preset.values.find((v) => v.nodeKey === `${PARTY}.context` && v.slot === 'prompts')
		assert.deepEqual(named?.value, {
			seedKey: 'pipeline-prompt:core:task/build-scene-context:prompts:lair-party',
		})
		const row = CORE_PROMPTS.find((p) => p.seedKey === (named?.value as any).seedKey)!
		assert.equal(row.nodeType, 'core:task/build-scene-context')
		assert.deepEqual(row.defaultForSpecs, [])
		assert.match(String(row.fields.systemPrompt), /\{\{partySpeakers\}\}/)
	})

	/**
	 * R12 (owner 2026-09-28): the Lair is cast only. A session stored before
	 * that may still carry `turnStyle: 'narrator'` in its fields; nothing reads
	 * it.
	 */
	test("a stored turnStyle: 'narrator' is inert — the party still take their own turns", async () => {
		const receipt = await takeTurn(PLAN, saying([]), null, { turnStyle: 'narrator' })
		assert.equal(receipt.outcome, 'ok')
		assert.deepEqual(
			node(receipt, `${PLAY}.plan.posted.write`).input.turnPlan.plan.speakers,
			PLAN.speakers,
		)
		assert.ok(!ran(receipt, `${PARTY}.say`))
	})

	test("B11: the master's line reaches the planner as direction; a character turn's row carries the line alone", async () => {
		const planned = await takeTurn(PLAN, saying([]))
		const input = (key: string) => node(planned, key)?.input
		assert.equal(input(`${S}.planned.planContext`)?.turnDirection, 'send them down the shaft')
		assert.equal(input(`${S}.planned.planContext`)?.direction, undefined)
		const receipt = await takeTurn(PLAN, saying([]), 11)
		const save = node(receipt, `${CT}.save`)
		assert.equal(save.input.sections, undefined)
		assert.ok(!String(save.input.text).includes('{'))
		assert.ok(!String(save.input.text).includes('sound the depth'))
	})

	test('the party knocks: one Castellan question on main, addressed to the owner — nothing played', async () => {
		const receipt = await takeTurn(KNOCK_PLAN)

		assert.equal(receipt.outcome, 'ok')
		// No beats, nobody spoke, and nothing was kept.
		assert.ok(!ran(receipt, `${PLAY}.plan.posted.write`))
		assert.ok(!ran(receipt, `${CT}.say`))
		assert.ok(!ran(receipt, `${PARTY}.say`))
		assert.ok(!ran(receipt, 'keep.played.keeperWrite'))

		const placeholder = node(receipt, `${DOOR}.knock.placeholder`)
		assert.deepEqual(
			[placeholder.input.channel, placeholder.input.speaker],
			['main', 'envoy:castellan'],
		)
		const save = node(receipt, `${DOOR}.knock.save`)
		assert.equal(save.result, 'ok')
		assert.equal(save.input.text, KNOCK_PLAN.knockQuestion)
		// No fold: the Plan is retired, and nobody narrated.
		assert.equal(save.input.sections, undefined)
		assert.equal(save.input.reasoning, undefined)

		const block = save.input.blocks[0]
		assert.equal(block.kind, 'choices')
		// The form is put to the person who owns the session, not to anybody
		// in the dungeon.
		assert.equal(block.addressee, 'owner')
		// One option (R9): describe the room — its label names it.
		assert.deepEqual(
			block.actions.map((a: any) => [a.choice, a.label]),
			[['describe', 'Describe The Drowned Hall…']],
		)
		for (const action of block.actions) {
			assert.equal(action.fn, 'room')
			assert.equal(action.action, `${LAIR_ROOM_ANSWER_SPEC_ID}#room`)
		}
		/**
		 * And the block may name it, although it is a `world` action (L1) —
		 * because of the addressee above and nothing else.
		 */
		const answerDoc = CORE_SPECS.find((e) => e.slug === LAIR_ROOM_ANSWER_SPEC_ID)!.build()
		assert.deepEqual(worldBlockFunctions([block], answerDoc), [])
		assert.deepEqual(
			worldBlockFunctions([{ ...block, addressee: 'character:11' }], answerDoc),
			['room'],
		)
	})

	test('the knock carries the room it asks about as the block referent (B12)', async () => {
		const receipt = await takeTurn(KNOCK_PLAN)
		const save = node(receipt, `${DOOR}.knock.save`)
		assert.equal(save.input.blocks[0].referent, 'The Drowned Hall')
	})

	test('the knock carries where the planner says the party stand as the block vantage (A27)', async () => {
		const receipt = await takeTurn({ ...KNOCK_PLAN, worldHints: { location: 'The Stair' } })
		const vantage = node(receipt, `${DOOR}.knock.vantage`)
		assert.equal(vantage?.definitionId, 'core:task/parse-json@1')
		assert.equal(vantage?.input?.params?.path, 'worldHints.location')
		const save = node(receipt, `${DOOR}.knock.save`)
		assert.equal(save.input.blocks[0].vantage, 'The Stair')
	})

	test('an exit the dungeon already holds never knocks (B13)', async () => {
		const receipt = await takeTurn({
			...KNOCK_PLAN,
			speakers: PLAN.speakers,
			unknownExit: '  the stair ',
			knockQuestion: 'Is there a Stair?',
		})
		assert.equal(receipt.outcome, 'ok')
		assert.ok(ran(receipt, `${PLAY}.plan.posted.write`), 'the turn was not played')
		assert.ok(!ran(receipt, `${DOOR}.knock.save`), 'a known room knocked')
	})

	test('the planner and every character turn are handed every room, whatever was ranked (B13; R8)', async () => {
		const receipt = await takeTurn(PLAN)
		const input = (key: string) => node(receipt, key)?.input
		assert.deepEqual(input(`${S}.planned.planContext`)?.locationEntries, ROOMS)
		for (const id of [11, 12]) {
			const turn = await takeTurn(PLAN, {}, id)
			assert.deepEqual(node(turn, `${CT}.context`)?.input?.locationEntries, ROOMS)
		}
		const rooms = node(receipt, 'gather.rooms.read')
		assert.deepEqual(rooms?.input?.params?.entryTypes, ['core:entry/location'])
	})

	/**
	 * **The rooms come with their ways out** (places plan B6, 2026-09-29): the
	 * listing asks `withLinks`, so each room carries its lore links said from
	 * the room, and `{{locationEntry}}` writes them under the room's body as
	 * "From here:" — the graph, not a typed `Exits:` line, is what the planner
	 * and the voices read the ways on from.
	 */
	test('B6: the rooms read asks for each room’s links', async () => {
		const receipt = await takeTurn(PLAN)
		assert.equal(node(receipt, 'gather.rooms.read')?.input?.params?.withLinks, true)
		// Only the rooms: the whole-book read the knock checks names against
		// has no use for them.
		assert.notEqual(node(receipt, 'gather.lorebook.read')?.input?.params?.withLinks, true)
	})

	test('the exit check reads the rooms, the whole book and the history (R7)', async () => {
		const receipt = await takeTurn(KNOCK_PLAN)
		const check = node(receipt, `${S}.planned.exitCheck`)
		assert.equal(check?.definitionId, 'core:task/undescribed-name@1')
		assert.deepEqual(check?.input?.locationEntries, ROOMS)
		assert.deepEqual(check?.input?.entries, ROOMS)
		assert.ok(check?.input?.messages, 'the exit check was handed no history')
		assert.ok(!node(receipt, 'gather.lorebook.read')?.input?.params?.entryTypes?.length)
		assert.equal(check?.output?.undescribed, 'The Drowned Hall')
	})

	/**
	 * **Each delver reads their own private lore** (W1, ruled 2026-09-17) —
	 * each in their own character turn.
	 */
	test('two character turns, two lore lanes, two speakers', async () => {
		const lanes: any[] = []
		for (const id of [11, 12]) lanes.push(...nodes(await takeTurn(PLAN, {}, id), `${CT}.lore`))
		const receipt = await takeTurn()
		assert.equal(lanes.length, PLAN.speakers.length)
		assert.deepEqual(
			lanes.map((n: any) => n.input.speaker),
			['character:11', 'character:12'],
		)
		assert.deepEqual(
			lanes.map((n: any) => n.output.main.sourceKey),
			['char:character:11', 'char:character:12'],
		)
		// The shared gather's own character-lore lane has no speaker wired.
		assert.equal(node(receipt, 'gather.characterLore.read').input.speaker, undefined)
	})

	/**
	 * C3 (R3, 2026-10-02): each delver's meaning and name arms search as that
	 * delver — the leak guard, since the spine's own arms carry every
	 * member's private lore — and the gate before their ranker judges for
	 * them too.
	 */
	test('each character turn searches by meaning and by name as its own delver (C3)', async () => {
		for (const id of [11, 12]) {
			const receipt = await takeTurn(PLAN, {}, id)
			for (const key of ['search', 'entities', 'link', 'eligible'])
				assert.equal(node(receipt, `${CT}.${key}`).input.speaker, `character:${id}`, key)
		}
		const receipt = await takeTurn()
		// The spine's arms are the run's: no speaker wired.
		assert.equal(node(receipt, 'semantic.arm.search').input.speaker, undefined)
		assert.equal(node(receipt, 'gather.entities.read').input.speaker, undefined)
	})

	test("the party call's arms search as the Castellan: no member's private lore (C3)", async () => {
		const receipt = await takeTurn(PLAN, {}, null, { partySpeech: 'castellan' })
		for (const key of ['search', 'entities'])
			assert.equal(node(receipt, `${PARTY}.${key}`).input.speaker, 'envoy:castellan', key)
		assert.equal(node(receipt, `${PARTY}.rank`).input.shownElsewhere, 1)
	})

	/**
	 * The room rule (2026-10-02): the room `{{locationEntry}}` shows — the
	 * world's location, by the one room rule — reaches every ranker as
	 * `shownElsewhere`, so the prompt reads it once.
	 */
	test('every ranker is handed the room the place slot shows (the room rule)', async () => {
		const receipt = await takeTurn(PLAN, {}, 11)
		const place = node(receipt, 'place')
		assert.equal(place.input.params.path, 'world.location')
		assert.equal(place.output.entryId, 1)
		assert.equal(node(receipt, 'rank').input.shownElsewhere, 1)
		assert.equal(node(receipt, `${CT}.rank`).input.shownElsewhere, 1)
	})

	test('a plan naming nobody posts its beats, hands on no turn, and the Castellan keeps the world', async () => {
		const said: string[] = []
		const receipt = await takeTurn({ ...PLAN, speakers: [] }, saying(said))
		assert.equal(receipt.outcome, 'ok')
		assert.deepEqual(said, [])
		const beats = node(receipt, `${PLAY}.plan.posted.write`)
		assert.deepEqual(beats.input.turnPlan.plan.speakers, [])
		assert.ok(!ran(receipt, `${CT}.placeholder`))
		// The beats were played: the world's books are kept over them.
		assert.ok(ran(receipt, 'keep.played.keeperWrite'))
		assert.deepEqual(kept(receipt), ['world'])
	})
})

/* ── R9: described in the story or in the Sanctum ─────────────────────── */

describe('R9: a room described in prose — the story or the Sanctum — never knocks', () => {
	const PASSAGE =
		'The Drowned Hall is a long vault under black water, its pillars furred with weed and its far door rusted open.'
	/** The check answering "described in prose", as the app binding does for a qualifying paragraph. */
	const describedInProse: Bindings = {
		'core:task/undescribed-name@1': async () =>
			ok({ main: '', undescribed: '', describedBy: 'prose', entryId: null, passage: PASSAGE }),
	}

	test('the check reads the union of channels and counts the story and the Sanctum', () => {
		const doc = respondDoc()
		const preset = (doc.presets ?? []).find((p) => p.default)!
		const value = (key: string) =>
			preset.values.find((v) => v.nodeKey === key && v.slot === 'params')?.value
		// Talk only off `main` (R10's fold-in): the Sanctum's beats row is
		// the Castellan's plan, never a room's description.
		assert.deepEqual(value(`${S}.planned.exitProse`), { channel: '*', limit: 40, talkOnly: true })
		assert.deepEqual(value(`${S}.planned.exitCheck`), { channels: ['main', 'sanctum'] })
		const into = doc.edges.find(
			(e) => e.to === `${S}.planned.exitCheck` && e.toPort === 'messages',
		)
		assert.equal(into?.from, `${S}.planned.exitProse`)
	})

	test('prose-described: the party walk in, the plan row carries the paragraph, and a character turn reads it', async () => {
		const receipt = await takeTurn(
			{ ...KNOCK_PLAN, speakers: PLAN.speakers },
			describedInProse,
		)
		assert.equal(receipt.outcome, 'ok')
		assert.ok(!ran(receipt, `${DOOR}.knock.save`), 'a described room knocked')
		assert.ok(ran(receipt, `${PLAY}.plan.posted.write`), 'the turn was not played')
		assert.equal(node(receipt, `${PLAY}.plan.posted.write`).input.turnPlan.locationPassage, PASSAGE)
		// The character turn reads it back off the standing plan.
		const turn = await takeTurn(PLAN, {
			'core:query/turn-plan@1': async () =>
				ok({ main: {}, plan: PLAN, locationPassage: PASSAGE }),
		}, 11)
		assert.equal(node(turn, `${CT}.context`)?.input?.locationPassage, PASSAGE)
	})

	test('the Lair voice row renders {{locationPassage}}', () => {
		const row = CORE_PROMPTS.find((p) => p.name === 'Lair voice')!
		assert.match(String(row.fields.systemPrompt), /\{\{#if locationPassage\}\}/)
	})
})

/* ── the knock's answer, which writes the room ────────────────────────── */

describe("the knock's answer writes the room (L1; R9)", () => {
	const answerDoc = (): SpecDocument =>
		CORE_SPECS.find((e) => e.slug === LAIR_ROOM_ANSWER_SPEC_ID)!.build()

	/**
	 * The lore entry — typed, or the Castellan's draft — then, only once it
	 * has landed, the master's own line sending the party on (B12,
	 * 2026-09-27): written as the presser, so it is a send and the story
	 * resumes.
	 */
	test('the lore entry, typed or drafted, then the master’s own line after it', () => {
		const doc = answerDoc()
		const outlets = doc.nodes.filter((n) => n.kind === 'outlet')
		assert.deepEqual(
			outlets.map((n) => `${n.key}:${n.definitionId}`),
			[
				'room.typed.save:core:outlet/create-lore-entry',
				'room.drafted.save:core:outlet/create-lore-entry',
				// B6: the way between the new room and the party's room.
				'link.resolved.write:core:outlet/link-lore-entries',
				'resume:core:outlet/create-message',
			],
		)
		const into = (node: string, port: string) =>
			doc.edges.find((e) => e.to === node && e.toPort === port)
		assert.equal(into('resume', 'speaker')?.from, 'input')
		assert.equal(into('resume', 'speaker')?.fromPort, 'presser')
		// The room is named after the door the party knocked at, either way.
		for (const save of ['room.typed.save', 'room.drafted.save']) {
			assert.equal(into(save, 'name')?.from, 'answer', save)
			assert.equal(into(save, 'name')?.fromPort, 'referent', save)
		}
	})

	test('R9: typed text is the room verbatim; nothing typed is the Castellan’s draft', () => {
		const doc = answerDoc()
		const into = (node: string, port: string) =>
			doc.edges.find((e) => e.to === node && e.toPort === port)
		// The junction routes on what the press collected: both writes are its.
		assert.equal((doc.nodes.find((n) => n.key === 'room.typed.save') as any).clauseId, 'room')
		assert.equal((doc.nodes.find((n) => n.key === 'room.drafted.save') as any).clauseId, 'room')
		assert.deepEqual(
			[into('room.typed.save', 'content')?.from, into('room.typed.save', 'content')?.fromPort],
			['input', 'text'],
		)
		assert.deepEqual(
			[into('room.drafted.save', 'content')?.from, into('room.drafted.save', 'content')?.fromPort],
			['room.drafted.write', 'text'],
		)
		// The improvise branch is gone, and so is its row.
		assert.ok(!doc.nodes.some((n) => n.key.includes('improvise')))
		assert.equal(
			CORE_PROMPTS.find((p) => p.name === 'Lair improvise'),
			undefined,
		)
	})

	test('R9: the action collects the description, optional — empty is the Castellan’s draft', () => {
		const room = ((answerDoc().contributes as any).actions as any[]).find((a) => a.key === 'room')
		assert.deepEqual(room.collects, {
			text: {
				need: 'optional',
				label: { en: 'Describe the room' },
				ifEmpty: { en: 'The Castellan drafts it for you to review.' },
			},
		})
		assert.match(room.description.en, /Describe the room/)
	})

	test("the action is declared `world`, in the composer venue — `form` stays fiction-only", () => {
		const actions = (answerDoc().contributes as any).actions as any[]
		const room = actions.find((a) => a.key === 'room')
		assert.equal(room.effects, 'world')
		assert.deepEqual(room.venue, [{ kind: 'composer' }])
		// A world action's audience may name only the owner or an admin.
		assert.deepEqual(room.audience.act, ['owner'])
	})

	test('only the draft parks at the review gate: the typed room is the master’s own words (R9)', () => {
		const preset = (answerDoc().presets ?? []).find((p) => p.default)!
		assert.deepEqual(
			preset.values.map((v) => `${v.nodeKey}.${v.slot}`),
			[
				'room.typed.save.settings',
				'room.drafted.save.settings',
				'room.typed.save.params',
				'room.drafted.save.params',
				'onward.params',
				// B6: the rooms listed, where the party stand in the state, and
				// the link's words.
				'gather.rooms.read.params',
				'here.params',
				// The room rule: the room the place slot shows.
				'place.params',
				'link.resolved.write.params',
			],
		)
		assert.deepEqual(preset.values[0]!.value, { review: 'off' })
		assert.deepEqual(preset.values[1]!.value, { review: 'on' })
		// The link is not gated: the master judged the room, and the way back
		// to where the party stand is not a second question.
		assert.ok(
			!preset.values.some((v) => v.nodeKey === 'link.resolved.write' && v.slot === 'settings'),
		)
	})
})

/* ── Answer the door links the new room (places plan B6, 2026-09-29) ───── */

/**
 * **The new room joins the room the party stand in, both ways** — but only
 * when that room resolves (places plan §11, correction #11). The party's
 * location is the world's `location` stat, which is usually words: a name
 * nothing in the dungeon answers to must never fail the door, so the room is
 * then saved unlinked.
 *
 * The resolution is the Lair's own name rule, `undescribed-name@1` over the
 * rooms listed, reading the name at `world.location` inside the session's
 * state (its `path`); the link is `link-lore-entries@1` in a junction on the
 * room it found, after the room's own write.
 */
describe('Answer the door links the new room to the room the party stand in (B6)', () => {
	const answerDoc = (): SpecDocument =>
		CORE_SPECS.find((e) => e.slug === LAIR_ROOM_ANSWER_SPEC_ID)!.build()
	const into = (doc: SpecDocument, node: string, port: string) =>
		doc.edges.find((e) => e.to === node && e.toPort === port)
	const from = (doc: SpecDocument, node: string, port: string) => {
		const e = into(doc, node, port)
		return e ? `${e.from}.${e.fromPort}` : undefined
	}
	const presetOf = (doc: SpecDocument, key: string, slot = 'params') =>
		(doc.presets ?? [])
			.find((p) => p.default)!
			.values.find((v) => v.nodeKey === key && v.slot === slot)?.value

	test('undescribed-name@1 declares `path`, empty by default', () => {
		const doc = answerDoc()
		const here = doc.nodes.find((n) => n.key === 'here')!
		assert.equal(here.definitionId, 'core:task/undescribed-name')
		assert.equal((here as any).config?.params?.slot, 'params')
		const decl = getDefinition('core:task/undescribed-name@1')!
		const schema = (decl.slots?.params as any)?.schema ?? {}
		assert.equal(schema.path?.type, 'string')
		assert.equal(schema.path?.default, '')
	})

	test('the rooms are listed, and where the party stand is read off the state', () => {
		const doc = answerDoc()
		assert.equal(
			doc.nodes.find((n) => n.key === 'gather.rooms.read')?.definitionId,
			'core:query/lorebook-entries',
		)
		assert.deepEqual(presetOf(doc, 'gather.rooms.read'), { entryTypes: ['core:entry/location'] })
		assert.equal(from(doc, 'here', 'name'), 'gather.state.read.state')
		// A27: else the room the knock's planner named, off the block.
		assert.equal(from(doc, 'here', 'fallbackName'), 'answer.vantage')
		assert.equal(from(doc, 'here', 'locationEntries'), 'gather.rooms.read.entries')
		assert.equal(into(doc, 'here', 'entries'), undefined, 'only a room is somewhere the party stand')
		assert.deepEqual(presetOf(doc, 'here'), { path: 'world.location' })
	})

	test('one link, both ways, from the room written to the room found — after the write, before the line', () => {
		const doc = answerDoc()
		const link = doc.nodes.find((n) => n.key === 'link.resolved.write')!
		assert.equal(link.definitionId, 'core:outlet/link-lore-entries')
		assert.equal((link as any).clauseId, 'link')
		const clause = (doc.clauses as any[]).find((c) => c.id === 'link')
		assert.equal(clause.kind, 'junction')
		assert.deepEqual([clause.on.node, clause.on.port], ['here', 'entryId'])
		// Whichever branch wrote the room: the junction publishes its write.
		assert.equal(from(doc, 'link.resolved.write', 'from'), 'room.entryId')
		assert.equal(from(doc, 'link.resolved.write', 'to'), 'here.entryId')
		assert.deepEqual(presetOf(doc, 'link.resolved.write'), {
			linkType: 'leads to',
			reverseLinkType: 'leads to',
		})
		const at = (key: string) => doc.nodes.find((n) => n.key === key)!.position
		assert.ok(at('link.resolved.write') > at('room.drafted.save'))
		assert.ok(at('link.resolved.write') < at('resume'))
		// Still not the entry's own `links`: that would fail the room with a
		// name nothing answers to.
		for (const save of ['room.typed.save', 'room.drafted.save'])
			assert.equal(into(doc, save, 'links'), undefined, save)
		const errors = validate(doc).filter((f) => f.severity === 'error')
		assert.deepEqual(errors.map((e) => `${e.law} ${e.nodeKey ?? ''} ${e.message}`), [])
	})

	/**
	 * Answer the door, executed: a typed room, the party standing at
	 * `location`, the knock's planner having said `vantage`.
	 */
	const answer = async (location: unknown, vantage: unknown = null) => {
		const doc = answerDoc()
		const links: any[] = []
		const state = { world: { location }, cast: {} }
		const receipt = (await run(doc, {
			world: { ...world, authorDefaults: authorDefaultsOf(doc) },
			input: {
				text: 'A vaulted hall, knee-deep in black water.',
				payload: { choice: 'describe' },
				presser: 'user:1',
				sessionScope: { sessionId: 1 },
			},
			seed: 'lair-answer',
			triggerSource: 'ui',
			bindings: lairBindings(PLAN, {
				'core:task/read-answer@1': async (i: any) =>
					ok({
						main: i?.payload ?? {},
						choice: 'describe',
						referent: 'The Drowned Hall',
						vantage,
						values: i?.payload ?? {},
					}),
				'core:query/session-state@1': async () => ok({ main: state, state, version: 7 }),
				'core:outlet/link-lore-entries@1': async (i: any, ctx: any) => {
					links.push(i)
					const row = await ctx.commit({ from: i.from, to: i.to })
					return ok({ main: row.id, linkId: row.id })
				},
			}),
		})) as any
		return { receipt, links }
	}

	test('the party’s room resolves: the room is written, then linked to it both ways', async () => {
		const { receipt, links } = await answer('The Old Well')
		assert.equal(receipt.outcome, 'ok')
		assert.ok(ran(receipt, 'room.typed.save'))
		assert.equal(links.length, 1)
		const [link] = links
		assert.equal(link.to, 1, 'the Old Well, by id')
		assert.equal(link.from?.status, 'committed', 'the room’s own write result')
		assert.deepEqual(
			[link.params?.linkType, link.params?.reverseLinkType],
			['leads to', 'leads to'],
		)
		assert.ok(ran(receipt, 'resume'))
	})

	test('a location naming no room saves the room unlinked, and the story still goes on', async () => {
		const { receipt, links } = await answer('somewhere in the dark')
		assert.equal(receipt.outcome, 'ok')
		assert.ok(ran(receipt, 'room.typed.save'))
		assert.equal(links.length, 0)
		assert.ok(!ran(receipt, 'link.resolved.write'))
		assert.ok(ran(receipt, 'resume'))
	})

	test('no location at all is no room: unlinked', async () => {
		const { receipt, links } = await answer(undefined)
		assert.equal(receipt.outcome, 'ok')
		assert.equal(links.length, 0)
		assert.ok(ran(receipt, 'resume'))
	})

	test('a location set to a place entry is that room, by its id', async () => {
		const { links } = await answer({ entryId: 2, name: 'The Stair' })
		assert.equal(links.length, 1)
		assert.equal(links[0].to, 2)
	})

	test('no location: the room the knock’s planner named (A27)', async () => {
		const { receipt, links } = await answer(undefined, 'The Stair')
		assert.equal(receipt.outcome, 'ok')
		assert.equal(links.length, 1)
		assert.equal(links[0].to, 2)
	})

	test('the world’s location wins over the planner’s hint (A27)', async () => {
		const { links } = await answer('The Old Well', 'The Stair')
		assert.equal(links.length, 1)
		assert.equal(links[0].to, 1)
	})

	/**
	 * The planner reads the ways on from the graph: the room's "From here:"
	 * lines, which `{{locationEntry}}` carries under its body. A room written
	 * before links has only its `Exits:` line, so that still counts — as the
	 * room's own words, never as the only source.
	 */
	test('the Lair planner reads the ways on from “From here”, and an older room’s exits', () => {
		const row = CORE_PROMPTS.find((p) => p.name === 'Lair planner')!
		const text = row.fields.systemPrompt ?? ''
		assert.match(text, /From here/)
		assert.doesNotMatch(text, /its exits are the ways on/)
		// Review round: From here also says what the room is inside, holds
		// or hides, and a room may have no list at all — the planner is told
		// both rather than that every line there is a way on.
		assert.match(text, /inside, holds or hides is not a way out/)
		assert.match(text, /when it lists From here/)
	})
})

/* ── a room is a place ────────────────────────────────────────── */

/**
 * **Both room writes file a `core:entry/location`** (L3, contracts batch 2).
 *
 * The outlet used to write world lore whatever ran, because nothing on the
 * declaration could say otherwise; `entryType` is that sentence made true, and
 * a room filed as world lore is a room no reader can ask the map for. Bare id,
 * the way a listing spells one — the version is the row's own column.
 *
 * ⚠ **And the exits are still prose.** `create-lore-entry@1` takes a `links`
 * port that would write the edges in the same transaction, and neither spec
 * wires it: the exits arrive as a line inside a drafted room and nothing in the
 * bound catalogue turns text into a list of names. The rooms are the map's
 * nodes with no edges yet — stated here so the absence is a recorded decision
 * rather than an oversight.
 */
describe('a room is a place, and its exits are not links yet', () => {
	/** Every room write, by spec: *Build room*'s one, the knock answer's two (R9). */
	const roomWrites: Array<[string, string]> = [
		[LAIR_BUILD_ROOM_SPEC_ID, 'save'],
		[LAIR_ROOM_ANSWER_SPEC_ID, 'room.typed.save'],
		[LAIR_ROOM_ANSWER_SPEC_ID, 'room.drafted.save'],
		// File as a room (R11): the Castellan's draft from a message, gated.
		[LAIR_FILE_ROOM_SPEC_ID, 'room.new.save'],
	]

	test('every room write declares the location entry type', () => {
		for (const [slug, key] of roomWrites) {
			const doc: SpecDocument = CORE_SPECS.find((e) => e.slug === slug)!.build()
			const preset = (doc.presets ?? []).find((p) => p.default)!
			const params = preset.values.find((v) => v.nodeKey === key && v.slot === 'params')
			assert.deepEqual(params?.value, { entryType: 'core:entry/location' }, key)
			// The setting is live rather than rendered-and-unread: the node names
			// its own parameters slot, which is what makes a preset value reach it.
			const save = doc.nodes.find((n) => n.key === key)!
			assert.equal(save.definitionId, 'core:outlet/create-lore-entry', key)
			assert.equal(
				(save as any).config?.params?.slot,
				'params',
				`${slug} ${key}: the params slot is not wired`,
			)
		}
	})

	test('the gate is on for every drafted room, so no draft lands unseen — the typed room is off (R9)', () => {
		for (const [slug, key] of roomWrites) {
			const doc: SpecDocument = CORE_SPECS.find((e) => e.slug === slug)!.build()
			const preset = (doc.presets ?? []).find((p) => p.default)!
			const settings = preset.values.find(
				(v) => v.nodeKey === key && v.slot === 'settings',
			)
			// Without this, `resolvePosition` defaults the position to `off` and
			// the drafted room lands with nobody having read it — which is what
			// *Build room* did until 2026-09-17 while its docblock said otherwise.
			assert.deepEqual(
				settings?.value,
				{ review: key === 'room.typed.save' ? 'off' : 'on' },
				`${slug} ${key}`,
			)
		}
	})

	test('no write wires `links` — the exits are still the content’s line', () => {
		for (const [slug, key] of roomWrites) {
			const doc: SpecDocument = CORE_SPECS.find((e) => e.slug === slug)!.build()
			assert.ok(
				!doc.edges.some((e) => e.to === key && e.toPort === 'links'),
				`${slug}: something wired links — update this test and the docblocks`,
			)
		}
	})
})

/* ── File as a room (lair re-plan R11, 2026-09-28) ──────────────────── */

describe('File as a room: a room described in a message reaches the lorebook through review (R11)', () => {
	const doc = (): SpecDocument => CORE_SPECS.find((e) => e.slug === LAIR_FILE_ROOM_SPEC_ID)!.build()
	const action = () => ((doc().contributes as any).actions as any[])[0]
	const into = (d: SpecDocument, node: string, port: string) =>
		d.edges.find((e) => e.to === node && e.toPort === port)
	/** The row's `item` document, as both sides build it. */
	const item = (row: Record<string, unknown>) =>
		itemValuesOf({ id: 1, ...row } as any, { isNewest: false, mine: true })
	const judge = (row: Record<string, unknown>) =>
		evaluateEnabledWhen(action().enabledWhen, { item: item(row) })

	test("declared on a message's ⋮: world, the owner's, collecting the room's name", () => {
		const a = action()
		assert.equal(a.key, 'file')
		assert.deepEqual(a.venue, [{ kind: 'message' }])
		assert.equal(a.effects, 'world')
		assert.deepEqual(a.audience.act, ['owner'])
		assert.equal(a.label.en, 'File as a room')
		assert.deepEqual(a.collects, {
			text: { need: 'required', label: { en: 'Room name' }, placeholder: { en: 'The Sunken Vault' } },
		})
		assert.deepEqual(
			a.enabledWhen.map((p: any) => [p.on, p.equals]),
			[
				['item.characterLine', false],
				['item.hidden', false],
				['item.generating', false],
			],
		)
		// And the Lair offers it.
		const preset = corePresets().find((p) => p.genre === LAIR_GENRE_ID)!
		assert.ok(
			(preset.actions?.include ?? []).some(
				(i: any) => (i.spec?.slug ?? i.spec?.id ?? i.spec) === LAIR_FILE_ROOM_SPEC_ID && i.key === 'file',
			) ||
				JSON.stringify(preset.actions?.include ?? []).includes(LAIR_FILE_ROOM_SPEC_ID),
		)
	})

	test("offered on the person's rows and the Castellan's, main and Sanctum alike", () => {
		// The person's persona-less line (the Lair has no persona): main and Sanctum.
		assert.equal(judge({ role: 'user', channel: 'main' }).enabled, true)
		assert.equal(judge({ role: 'user', channel: 'sanctum' }).enabled, true)
		// The Castellan's narration on main, and its Sanctum reply (R8: `envoy:castellan`).
		const castellan = { role: 'assistant', metadata: { speaker: 'envoy:castellan' } }
		assert.equal(judge({ ...castellan, channel: 'main' }).enabled, true)
		assert.equal(judge({ ...castellan, channel: 'sanctum' }).enabled, true)
		// A reply nobody in particular spoke (a stored pre-R8 narrator row).
		assert.equal(judge({ role: 'assistant', isNarratorResponse: true }).enabled, true)
	})

	test("refused on a delver's row, with the reason", () => {
		const v = judge({ role: 'assistant', characterId: 7, metadata: { speaker: 'character:7' } })
		assert.equal(v.enabled, false)
		assert.match((v as any).reason.en, /a delver's line is theirs, not the dungeon's plan/)
		// Hidden or still being written: not yet, and said so.
		assert.equal(judge({ role: 'user', isHidden: true }).enabled, false)
		assert.equal(judge({ role: 'assistant', isGenerating: true, metadata: { speaker: 'envoy:castellan' } }).enabled, false)
	})

	test('reads the pressed row by id, and checks the name against the book — never the prose', () => {
		const d = doc()
		const row = into(d, 'gather.row.read', 'messageId')
		assert.deepEqual([row?.from, row?.fromPort], ['input', 'messageId'])
		assert.deepEqual([into(d, 'check', 'name')?.from, into(d, 'check', 'name')?.fromPort], ['input', 'text'])
		assert.deepEqual(into(d, 'check', 'locationEntries')?.from, 'gather.rooms.read')
		assert.deepEqual(into(d, 'check', 'entries')?.from, 'gather.lorebook.read')
		// The row being filed is prose, and would describe its own room.
		assert.equal(into(d, 'check', 'messages'), undefined)
		// The draft's transcript is that one row.
		assert.deepEqual(
			[into(d, 'room.new.lines', 'messages')?.from, into(d, 'room.new.lines', 'messages')?.fromPort],
			['gather.row.read', 'messages'],
		)
		const preset = (d.presets ?? []).find((p) => p.default)!
		assert.deepEqual(
			preset.values.find((v) => v.nodeKey === 'gather.rooms.read')?.value,
			{ entryTypes: ['core:entry/location'] },
		)
	})

	test('a new name: drafted by the Castellan, named as typed, and held at the review gate', () => {
		const d = doc()
		const outlets = d.nodes.filter((n) => n.kind === 'outlet')
		assert.deepEqual(
			outlets.map((n) => `${n.key}:${n.definitionId}`),
			['room.new.save:core:outlet/create-lore-entry', 'room.exists.said:core:outlet/create-message'],
		)
		for (const o of outlets) assert.equal((o as any).clauseId, 'room', o.key)
		assert.deepEqual(
			[into(d, 'room.new.save', 'name')?.from, into(d, 'room.new.save', 'name')?.fromPort],
			['check', 'undescribed'],
		)
		assert.deepEqual(into(d, 'room.new.save', 'content')?.from, 'room.new.write')
		// The name reaches the draft; the other rooms are named to it.
		assert.deepEqual(into(d, 'room.new.context', 'turnDirection')?.fromPort, 'undescribed')
		assert.deepEqual(into(d, 'room.new.context', 'locationEntries')?.from, 'gather.rooms.read')
		const oracle = d.nodes.filter((n) => n.kind === 'oracle').map((n) => n.key)
		assert.deepEqual(oracle, ['room.new.write'])
		const row = CORE_PROMPTS.find((p) => (p.defaultForSpecs ?? []).includes(LAIR_FILE_ROOM_SPEC_ID))!
		assert.equal(row.name, 'Lair file room')
		assert.match(String(row.fields.systemPrompt), /\{\{turnDirection\}\}/)
		assert.match(String(row.fields.systemPrompt), /Exits:/)
	})

	test('a name already in the book: nothing filed, and the Castellan says so on the Sanctum', () => {
		const d = doc()
		const said = d.nodes.find((n) => n.key === 'room.exists.said')!
		assert.equal((said.config as any).channel, 'sanctum')
		assert.equal((said.config as any).speaker, 'envoy:castellan')
		assert.deepEqual(into(d, 'room.exists.said', 'text')?.from, 'room.exists.note')
	})
})

/* ── Trigger trap and Reveal (lair pass B17, owner D7a, 2026-09-27) ───── */

describe("Trigger trap and Reveal write the Castellan's row, streamed (B17; R8)", () => {
	const narratorActions = [
		{ slug: 'core:spec/lair-trap', key: 'trap', status: 'Springing a trap' },
		{ slug: 'core:spec/lair-reveal', key: 'reveal', status: 'Revealing' },
	]
	for (const a of narratorActions) {
		const doc = (): SpecDocument => CORE_SPECS.find((e) => e.slug === a.slug)!.build()

		test(`${a.key}: a placeholder the write streams into, finished by one update`, () => {
			const d = doc()
			const outlets = d.nodes.filter((n) => n.kind === 'outlet')
			assert.deepEqual(
				outlets.map((n) => [n.key, n.definitionId]),
				[
					['placeholder', 'core:outlet/create-message'],
					['save', 'core:outlet/update-message'],
				],
			)
			// Not a `narration` row: the Castellan's, by name (R8).
			assert.ok(!d.edges.some((e) => e.to === 'placeholder' && e.toPort === 'narration'))
			const placeholder = d.nodes.find((n) => n.key === 'placeholder') as any
			assert.equal(placeholder.config.speaker, 'envoy:castellan')
			const write = d.nodes.find((n) => n.key === 'write') as any
			assert.deepEqual(write.expose, { stream: true, status: a.status })
			// The narrator's reasoning lands in the row's Reasoning fold (the B5 pattern).
			assert.ok(
				d.edges.some(
					(e: any) => e.to === 'save' && e.toPort === 'reasoning' && e.from === 'write',
				),
			)
		})

		test(`${a.key}: what the master typed is the prompt's turnDirection`, () => {
			const d = doc()
			assert.ok(
				d.edges.some(
					(e: any) =>
						e.from === 'input' &&
						e.fromPort === 'text' &&
						e.to === 'context' &&
						e.toPort === 'turnDirection',
				),
			)
			const action = (d.contributes as any).actions[0]
			assert.equal(action.collects.text.need, 'optional')
			assert.deepEqual(action.collects.text.ifEmpty, { en: 'The room decides.' })
			// Says what it does, and what the collected text is for.
			assert.match(action.description.en, /room/)
			assert.match(action.description.en, /or leave it to the room/)
		})
	}
})

/* ── W-GATE D2 / D3 (lair pass, 2026-09-27) ───────────────────────────── */

/**
 * R10 (owner ruling 5, 2026-09-28): the Whisper collects who hears it, and
 * writes its one line on each recipient's `core:slot/whisper@1` — pure, no
 * model call. Supersedes W-GATE D2 (the typed line in the whisper's prompt):
 * there is no prompt, and the "Lair whisper" row is retired.
 */
describe('Whisper collects its recipients and writes each one, with no model call (R10)', () => {
	const doc = (): SpecDocument =>
		CORE_SPECS.find((e) => e.slug === 'core:spec/lair-whisper')!.build()

	test('it collects who hears it (at least one, overwriting the whisper slot) and what it says', () => {
		const [a] = (doc().contributes as any).actions
		assert.deepEqual(a.collects, {
			recipients: { label: { en: 'Who hears it' }, min: 1, overwrites: 'core:slot/whisper@1' },
			text: { need: 'required', label: { en: 'What do you whisper?' } },
		})
	})

	test('no model step: an inlet, the state, the resolve and the write', () => {
		const d = doc()
		assert.deepEqual(
			d.nodes.map((n: any) => n.definitionId).sort(),
			[
				'core:inlet/user-message',
				'core:query/resolve-state-changes',
				'core:query/session-state',
				'core:task/set-state',
			],
		)
	})

	test('the recipients are the owners of the one change, and the typed line its value', () => {
		const d = doc()
		assert.ok(
			d.edges.some(
				(e: any) =>
					e.from === 'input' && e.fromPort === 'recipients' && e.to === 'resolve' && e.toPort === 'owners',
			),
		)
	})

	test("the 'Lair whisper' prompt row is retired", () => {
		assert.equal(CORE_PROMPTS.some((p) => p.name === 'Lair whisper'), false)
		assert.equal(
			CORE_PROMPTS.some((p) => (p.defaultForSpecs ?? []).includes('core:spec/lair-whisper')),
			false,
		)
	})
})

describe("Answer the door is present only while a knock is open (W-GATE D3)", () => {
	const action = () =>
		(CORE_SPECS.find((e) => e.slug === LAIR_ROOM_ANSWER_SPEC_ID)!.build().contributes as any)
			.actions[0]

	test("presentWhen reads the open form's action — its own identity", () => {
		const pw = action().presentWhen
		assert.equal(pw.length, 1)
		assert.equal(pw[0].on, 'session.openForm.action')
		assert.equal(pw[0].equals, `${LAIR_ROOM_ANSWER_SPEC_ID}#room`)
		assert.match(pw[0].reason.en, /no door to answer/)
	})

	test('present-when holds with the knock open and not without it', () => {
		const pw = action().presentWhen
		assert.equal(
			evaluateEnabledWhen(pw, {
				session: { openForm: { action: `${LAIR_ROOM_ANSWER_SPEC_ID}#room` } },
			}).enabled,
			true,
		)
		assert.equal(evaluateEnabledWhen(pw, { session: { openForm: null } }).enabled, false)
		assert.equal(
			evaluateEnabledWhen(pw, {
				session: { openForm: { action: 'core:spec/other#answer' } },
			}).enabled,
			false,
		)
	})
})

/* ── playerLabel (lair re-plan R4, owner ruling 3, 2026-09-28) ─────────── */

describe('playerLabel: what a person’s persona-less line is called (R4)', () => {
	test('the Lair declares "Dungeon Master"', () => {
		assert.deepEqual(lairGenre.playerLabel, { en: 'Dungeon Master' })
	})

	test('the create spec carries it on the genre row the host reads', () => {
		const doc = CORE_SPECS.find((e) => e.slug === 'core:spec/lair-create')!.build() as any
		assert.deepEqual(doc.genre.playerLabel, { en: 'Dungeon Master' })
	})

	test('unstated is absent, so every other genre hashes as it did', () => {
		const plain = genre('acme.rp:genre/no-label', { name: { en: 'Plain' }, family: 'chat' })
		assert.equal('playerLabel' in plain, false)
	})

	test('a persona-less genre may declare one, as display text', () => {
		const g = genre('acme.rp:genre/labelled', {
			name: { en: 'Labelled' },
			family: 'rp',
			shape: { personas: { min: 0, max: 0 } },
			playerLabel: 'Game Master',
		})
		assert.deepEqual(g.playerLabel, { en: 'Game Master' })
	})

	test('refused for a genre whose personas.min ≥ 1: no line would ever carry it', () => {
		assert.throws(
			() =>
				genre('acme.rp:genre/persona-labelled', {
					name: { en: 'Persona' },
					family: 'rp',
					shape: { personas: { min: 1 } },
					playerLabel: { en: 'Game Master' },
				}),
			/playerLabel.*persona/,
		)
	})

	test('refused when blank', () => {
		assert.throws(
			() =>
				genre('acme.rp:genre/blank-label', {
					name: { en: 'Blank' },
					family: 'rp',
					playerLabel: { en: '  ' },
				}),
			/playerLabel/,
		)
	})

	test('the Lair rows that name the person render {{playerLabel}}, never "the dungeon’s master"', () => {
		for (const name of ['Lair planner', 'Lair voice', 'Lair knock build', 'Lair trap', 'Lair reveal']) {
			const row = CORE_PROMPTS.find((p) => p.name === name)!
			const text = `${row.fields.systemPrompt ?? ''}\n${row.fields.postHistoryInstructions ?? ''}`
			assert.match(text, /\{\{playerLabel\}\}/, name)
		}
		for (const row of CORE_PROMPTS.filter((p) => p.name.startsWith('Lair ')))
			assert.doesNotMatch(
				`${row.fields.systemPrompt ?? ''}\n${row.fields.postHistoryInstructions ?? ''}`,
				/dungeon's master/i,
				row.name,
			)
	})
})

/* ── R6: the Sanctum, the Castellan and its greeting ───────────────────── */

describe('the Sanctum and the Castellan (R6)', () => {
	test('the Sanctum is a declared channel with a label, and no Pick or Regenerate', () => {
		const decls = channelDecls(lairGenre.shape)
		assert.deepEqual(
			decls.map((d) => d.slug),
			['main', 'sanctum'],
		)
		const sanctum = decls.find((d) => d.slug === 'sanctum')!
		assert.deepEqual(sanctum.label, { en: 'Sanctum' })
		assert.equal(sanctum.role, 'conversation')
		// The genre's voice, so `main` reads exactly as before (no channel
		// shapes a prompt differently).
		assert.equal(sanctum.voice, 'narrator')
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
		// A lane of the Sanctum is the Sanctum.
		assert.equal(resolveTurnControls(lairGenre.shape, 'sanctum:2').pick.offered, false)
	})

	test('a channel label and turn controls are refused on the terms the genre is', () => {
		const shape = (channel: object) => ({ channels: ['main', { slug: 'side', ...channel }] }) as any
		assert.throws(
			() => genre('acme.rp:genre/bad-label', { name: 'B', family: 'rp', shape: shape({ label: ' ' }) }),
			/channel 'side' label/,
		)
		assert.throws(
			() =>
				genre('acme.rp:genre/bad-controls', {
					name: 'B',
					family: 'rp',
					shape: shape({ turnControls: { dance: true } }),
				}),
			/turnControls\.dance: not a turn control/,
		)
	})

	test('the create spec reads the greeting and writes it on the Sanctum, under the Castellan', () => {
		const doc = CORE_SPECS.find((e) => e.slug === 'core:spec/lair-create')!.build() as SpecDocument
		const welcome = doc.nodes.find((n) => n.key === 'welcome')!
		assert.equal(welcome.definitionId, 'core:query/envoy-greeting')
		const write = doc.nodes.find((n) => n.key === 'greet.greets.write')!
		assert.equal(write.definitionId, 'core:outlet/create-message')
		assert.equal((write.config as any).channel, 'sanctum')
		assert.equal((write.config as any).speaker, 'envoy:castellan')
		assert.ok(doc.edges.some((e) => e.from === 'welcome' && e.to === 'greet.greets.write'))
		// The preset names the envoy the query reads.
		assert.deepEqual(authorDefaultsOf(doc)!.welcome?.params, { envoy: 'castellan' })
		// And no node calls a model: creation stays model-free.
		assert.ok(!doc.nodes.some((n) => n.kind === 'oracle'))
		// The genre row the host reads the speakers off carries the Castellan.
		assert.equal((doc as any).genre.envoys?.[0]?.key, 'castellan')
	})

	test('the greeting introduces the game, names the master, and invites a start', () => {
		const text = (lairGenre.envoys![0]!.greeting!.text as { en: string }).en
		assert.match(text, /\{\{playerLabel\}\}/)
		assert.match(text, /\{\{#if characterNames\}\}\{\{characterNames\}\}/)
		assert.match(text, /reverse dungeon/)
		assert.match(text, /You are the narrator/)
		assert.match(text, /Sanctum/)
		assert.match(text, /To begin/)
	})

	test('a Sanctum line is the Castellan talking: one streamed reply, and nothing of the story runs', async () => {
		const said: string[] = []
		const doc = respondDoc()
		const receipt = (await run(doc, {
			world: { ...world, authorDefaults: authorDefaultsOf(doc) },
			input: {
				text: 'What if the stair floods?',
				messageId: null,
				characterId: null,
				via: 'voice',
				channel: 'sanctum',
				sessionScope: { sessionId: 1 },
				fields: { tone: 'grim', trustNarrator: false },
			},
			seed: 'lair',
			triggerSource: 'ui',
			bindings: lairBindings(PLAN, {
				'core:task/build-template-context@1': async (i: any) =>
					ok({ main: {}, templateContext: { who: i?.speaker ?? '?' }, seedName: 'Castellan' }),
				'core:oracle/generate-text@1': async (i: any) => {
					said.push(i?.context?.who ?? '?')
					return ok({ main: 'A flood would suit it.', text: 'A flood would suit it.' })
				},
			}),
		})) as any
		assert.equal(receipt.outcome, 'ok')
		assert.deepEqual(said, ['envoy:castellan'])
		const context = receipt.nodes.find((n: any) => n.nodeKey === 'via.turn.channel.sanctum.context')
		assert.equal(context.input.speaker, 'envoy:castellan')
		assert.deepEqual(context.input.locationEntries, ROOMS)
		assert.ok(context.input.state, 'the state reaches the Castellan (earshot-filtered by the host)')
		// Two reads: the Sanctum as the conversation, the story's last 12 rows.
		const talk = receipt.nodes.find((n: any) => n.nodeKey === 'via.turn.channel.sanctum.talk')
		const story = receipt.nodes.find((n: any) => n.nodeKey === 'via.turn.channel.sanctum.story')
		assert.equal(talk.input.params.channel, 'sanctum')
		assert.deepEqual(
			[story.input.params.channel, story.input.params.limit],
			['main', 12],
		)
		const save = receipt.nodes.find((n: any) => n.nodeKey === 'via.turn.channel.sanctum.save')
		assert.equal(save.result, 'ok')
		assert.equal(save.input.text, 'A flood would suit it.')
		assert.ok(
			!receipt.nodes.some(
				(n: any) => String(n.nodeKey).startsWith('via.turn.channel.story.') && n.result === 'ok',
			),
			'no planner, no voices, no keeper',
		)
	})

	test("the Sanctum reply streams, the story's steps as before", () => {
		const doc = respondDoc()
		const say = doc.nodes.find((n) => n.key === 'via.turn.channel.sanctum.say')!
		assert.equal((say.expose as any)?.stream, true)
	})

	test('the Lair turn order reads every channel, so a Sanctum line is answered there', () => {
		const doc = CORE_SPECS.find((e) => e.slug === 'core:spec/lair-turn-order')!.build() as SpecDocument
		assert.deepEqual(authorDefaultsOf(doc)!.history?.params, { channel: '*' })
	})
})

/**
 * R13 (owner F3/QB 2026-09-28): _Sanctum talk steers the story_. The switch
 * is the genre field `sanctumSteers` (on by default — the host applies the
 * declared default; these runs state it). What the talk read returns is the
 * host's (`unplayedOnly`, tested in the app); here, which reads run, with
 * which params, and what reaches the builders.
 */
describe('Sanctum talk steers the story (R13)', () => {
	const STEER = `${S}.planned.steer.on`
	const TALK_PARAMS = { channel: 'sanctum', unplayedOnly: true, limit: 12 }

	test('declared: a quick boolean, on by default, labelled for the person', () => {
		const f = (lairGenre.shape?.fields as any)?.sanctumSteers
		assert.equal(f.type, 'boolean')
		assert.equal(f.default, true)
		assert.equal(f.quick, true)
		assert.equal(f.label.en, 'Sanctum talk steers the story')
		assert.match(f.description.en, /brainstorming/)
		// The Castellan's own instructions say which mode it is in.
		const prompt = lairGenre.envoys![0]!.prompts!.systemPrompt as string
		assert.match(prompt, /\{\{#if sanctumSteers\}\}What you two settle here shapes the next turn\.\{\{else\}\}This is brainstorming\./)
		assert.match(prompt, /\{\{#if scratchpad\}\}/)
	})

	test("on: the planner reads the unplayed talk and the Castellan's scratchpad", async () => {
		const receipt = await takeTurn(PLAN, {}, null, { sanctumSteers: true })
		assert.equal(receipt.outcome, 'ok')
		const talk = node(receipt, `${STEER}.talk`)
		assert.equal(talk.result, 'ok')
		assert.deepEqual(
			[talk.input.params.channel, talk.input.params.unplayedOnly, talk.input.params.limit],
			[TALK_PARAMS.channel, TALK_PARAMS.unplayedOnly, TALK_PARAMS.limit],
		)
		const planContext = node(receipt, `${S}.planned.planContext`)
		assert.ok(planContext.input.sideTalk, 'the talk reaches the planner')
		assert.equal(planContext.input.scratchpad, SCRATCHPAD)
		// The party and the books are wired to neither.
		for (const n of receipt.nodes.filter((x: any) =>
			/(character\.turn|party\.speaks)\.context$|keep\.played\.keeperContext$/.test(x.nodeKey),
		)) {
			assert.equal(n.input.sideTalk, undefined, n.nodeKey)
			assert.equal(n.input.scratchpad, undefined, n.nodeKey)
		}
	})

	test('off: the planner reads neither', async () => {
		const receipt = await takeTurn(PLAN, {}, null, { sanctumSteers: false })
		assert.equal(receipt.outcome, 'ok')
		assert.ok(!ran(receipt, `${STEER}.talk`))
		const planContext = node(receipt, `${S}.planned.planContext`)
		assert.equal(planContext.input.sideTalk, undefined)
		assert.equal(planContext.input.scratchpad, undefined)
	})

	for (const [pressedOn, steers, branch] of [
		['main', false, 'none'],
		['main', true, 'steered'],
		['sanctum', false, 'pressed'],
		['sanctum', true, 'pressed'],
	] as const)
		test(`Narrate pressed on ${pressedOn}, steering ${steers ? 'on' : 'off'}: the ${branch} read answers`, async () => {
			const receipt = await takeTurn(PLAN, {}, null, { sanctumSteers: steers }, 'narrate', pressedOn)
			assert.equal(receipt.outcome, 'ok')
			const read = node(receipt, `via.narrate.talk.${branch}.read`)
			assert.equal(read.result, 'ok')
			assert.deepEqual(
				read.input.params.limit,
				branch === 'none' ? 0 : TALK_PARAMS.limit,
				'a window of none when nothing crosses',
			)
			assert.equal(read.input.params.unplayedOnly, true)
			// Handed on through the junction to the narration's context.
			assert.ok(node(receipt, 'via.narrate.context').input.sideTalk !== undefined)
		})

	test("a Sanctum reply rewrites the Castellan's scratchpad; an answer without one writes nothing", async () => {
		const doc = respondDoc()
		const sanctumRun = async (answer: unknown) =>
			(await run(doc, {
				world: { ...world, authorDefaults: authorDefaultsOf(doc) },
				input: {
					text: 'Put a vault two rooms north.',
					messageId: null,
					characterId: null,
					via: 'voice',
					channel: 'sanctum',
					sessionScope: { sessionId: 1 },
					fields: { tone: 'grim', trustNarrator: false, sanctumSteers: true },
				},
				seed: 'lair',
				triggerSource: 'ui',
				bindings: lairBindings(answer),
			})) as any
		const T = 'via.turn.channel.sanctum'
		const wrote = await sanctumRun({ scratchpad: 'Vault: two rooms north.' })
		assert.equal(wrote.outcome, 'ok')
		// It talks with its notes in front of it …
		assert.equal(node(wrote, `${T}.context`).input.scratchpad, SCRATCHPAD)
		// … and rewrites them after the reply, from the exchange just had.
		const exchange = node(wrote, `${T}.padExchange`)
		assert.deepEqual([exchange.input.params.channel, exchange.input.params.limit], ['sanctum', 4])
		assert.ok(
			wrote.nodes.findIndex((n: any) => n.nodeKey === `${T}.save`) <
				wrote.nodes.findIndex((n: any) => n.nodeKey === `${T}.padWrite`),
			'the rewrite follows the saved reply',
		)
		const write = node(wrote, `${T}.padKeep.kept.write`)
		assert.equal(write.result, 'ok')
		assert.deepEqual(write.input.value, { 'castellan-scratchpad': 'Vault: two rooms north.' })
		// An answer with no scratchpad leaves the notes as they were.
		const kept = await sanctumRun(PLAN)
		assert.equal(kept.outcome, 'ok')
		assert.ok(!ran(kept, `${T}.padKeep.kept.write`))
	})
})

describe('an envoy greeting is refused where it cannot mean what it says (R6)', () => {
	const shape = { channels: ['main', 'side'] } as any
	const envoy = (greeting: unknown) =>
		({ key: 'host', name: 'Host', greeting }) as any

	test('a channel the genre does not declare', () => {
		assert.throws(
			() =>
				genre('acme.rp:genre/greet-nowhere', {
					name: 'G',
					family: 'rp',
					shape,
					envoys: [envoy({ text: 'Hello.', channel: 'elsewhere' })],
				}),
			/greeting\.channel 'elsewhere' is not a channel this genre declares/,
		)
	})

	test('an empty text', () => {
		assert.throws(
			() =>
				genre('acme.rp:genre/greet-blank', {
					name: 'G',
					family: 'rp',
					shape,
					envoys: [envoy({ text: '  ' })],
				}),
			/greeting\.text/,
		)
	})

	test("an action's envoy", () => {
		assert.match(
			envoyFindings(envoy({ text: 'Hi.' }), 'contributes.actions[roll].envoy', 'action').join('\n'),
			/an action's envoy cannot declare a greeting/,
		)
	})

	test('a declared channel, or none (main), is accepted', () => {
		const g = genre('acme.rp:genre/greet-side', {
			name: 'G',
			family: 'rp',
			shape,
			envoys: [envoy({ text: 'Hello.', channel: 'side' })],
		})
		assert.equal(g.envoys?.[0]?.greeting?.channel, 'side')
		assert.doesNotThrow(() =>
			genre('acme.rp:genre/greet-main', {
				name: 'G',
				family: 'rp',
				envoys: [envoy({ text: 'Hello.' })],
			}),
		)
	})
})
