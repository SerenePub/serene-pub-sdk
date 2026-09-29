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
	envoyFindings,
	evaluateEnabledWhen,
	genre,
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
import { coreLayoutPreset } from '../core-catalog/src/ui/sessions/layouts.js'
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
		assert.deepEqual(Object.keys(lairGenre.shape?.fields ?? {}).sort(), ['sanctumSteers', 'tone', 'trustNarrator'])
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
	'core:spec/lair-create': 'cd14c9acfe99c',
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
	'core:spec/lair-respond': '91b5f45f61cf3',
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
	'core:spec/lair-build-room': '160737b487903c',
	// New 2026-09-28 (lair re-plan R11): File as a room — a message-venue
	// `world` action that reads its row by id (`session-history@1`
	// `messageId`), checks the name against the book, and drafts a location
	// behind the review gate or says on the Sanctum that it is already filed.
	// Proven: a copy of sdk+contracts+core-catalog with only R11's edits
	// reverted has no such spec and hashes the golden back to
	// 'f2b52529af0442f1'; every other Lair pin is unmoved.
	'core:spec/lair-file-room': '2e1e00db48eec',
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
	'core:spec/lair-room-answer': '15f936dc559f84',
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
	'core:spec/lair-trap': '5d480cd988aac',
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
	'core:spec/lair-reveal': '87fe755438456',
	// Moved 2026-09-27 (lair pass B3/B18): the streaming stage and the stage
	// statuses are declared on `expose` (`stream`, `status`). Proven: with those
	// two keys stripped, the document hashes back to the old pin. (was '15c9296cf3ab70')
	'core:spec/answer-form-lair': '1c32eb6a456349',
	// Its own turn order since the modder pass (R27, 2026-09-23).
	// Moved 2026-09-27 (lair pass B9): it recomputes on message-deleted and
	// message-hidden too (was '6bc2842fd6676').
	// Moved 2026-09-28 (lair re-plan R6): the genre (channels, envoys) and the
	// history preset `channel: '*'`. Proven with the pins above. (was '1a9cbfafa790bf')
	'core:spec/lair-turn-order': '1bee84716ce1fa',
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
	 * narration, its Sanctum talk, the picked delver, the knock, the lead
	 * delver after the beats row — and the branches are mutually exclusive.
	 * The beats row and the rest of the party are COMPLETE rows: never
	 * generating, never a claimed row.
	 */
	test('one live row per execution path; the beats row and the rest of the party are complete rows', () => {
		const doc = respondDoc()
		const writes = doc.nodes.filter((n) => n.kind === 'outlet')
		const STORY = 'via.turn.channel.story.pick'
		assert.deepEqual(writes.map((n) => n.key), [
			'via.narrate.placeholder',
			'via.narrate.save',
			'via.turn.channel.sanctum.placeholder',
			'via.turn.channel.sanctum.save',
			// R13: the scratchpad rewrite — an annex write, never a row.
			'via.turn.channel.sanctum.padKeep.kept.write',
			`${STORY}.picked.placeholder`,
			`${STORY}.picked.save`,
			`${STORY}.planned.door.knock.placeholder`,
			`${STORY}.planned.door.knock.save`,
			`${STORY}.planned.door.play.plan.posted.write`,
			`${STORY}.planned.door.play.lead.speaks.placeholder`,
			`${STORY}.planned.door.play.lead.speaks.save`,
			`${STORY}.planned.door.play.voices.item.line`,
		])
		const fed = (key: string, port: string) =>
			doc.edges.some((e) => e.to === key && e.toPort.split('.')[0] === port) ||
			(doc.nodes.find((n) => n.key === key)?.config as any)?.[port] != null
		for (const complete of [
			`${STORY}.planned.door.play.plan.posted.write`,
			`${STORY}.planned.door.play.voices.item.line`,
		])
			for (const port of ['generating', 'row']) assert.ok(!fed(complete, port), `${complete}.${port}`)
		assert.ok(fed(`${STORY}.planned.door.play.voices.item.line`, 'speaker'))
		// The beats row is the Castellan's, on the Sanctum.
		const beats = doc.nodes.find((n) => n.key === `${STORY}.planned.door.play.plan.posted.write`)!
		assert.equal((beats.config as any).channel, 'sanctum')
		assert.equal((beats.config as any).speaker, 'envoy:castellan')
		// No narrator scene step, and no Plan fold (R8 retired both).
		assert.ok(!doc.nodes.some((n) => /scene|planSection|turnText/.test(n.key)))
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

	test('the genre ships a layout, and it names only widgets core has', () => {
		// Core's own list, never a copy: a copy kept `inventory` after R79 removed it.
		const known = new Set(CORE_WIDGETS.map((w) => w.id))
		const legacy = coreLayoutPreset(LAIR_GENRE_ID)
		assert.ok(legacy, 'no shipped layout')
		const v2 = lairGenre.layouts![0]!
		const zones = (v2.preset.layout as any).zones as Record<string, any>
		const placed = Object.values(zones).flatMap((z: any) =>
			(z.units ?? []).map((u: any) => u.widget),
		)
		// The room list is `world-state` until a map widget exists — see the
		// note in layouts.ts. Naming one core does not ship would put a
		// labelled placeholder in every Lair session.
		for (const id of placed) assert.ok(known.has(id), id)
		assert.ok(placed.includes('messages'))
		assert.ok(placed.includes('world-state'))
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
			const name = typeof i?.name === 'string' ? i.name.trim() : ''
			const hit = [...(i?.locationEntries ?? []), ...(i?.entries ?? [])].find((e: any) =>
				sameName(e?.name, name),
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
		// R8: the lead and the rest — the contract's rules, as the host's.
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
const PLAY = `${S}.planned.door.play`
const node = (receipt: any, key: string) => receipt.nodes.find((n: any) => n.nodeKey === key)
const nodes = (receipt: any, key: string) => receipt.nodes.filter((n: any) => n.nodeKey === key)
const saying = (said: string[]) => ({
	'core:oracle/generate-text@1': async (i: any) => {
		const who = i?.context?.who ?? '?'
		said.push(who)
		return ok({ main: `<${who}>`, text: `<${who}>`, thinking: `${who} weighs it` })
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
	 * R8 (owner F2/F4, 2026-09-28): a turn is the Castellan's run — the
	 * planner, the beats row in the Sanctum, the lead delver (streamed), the
	 * rest of the party, the keeper. Nothing narrates.
	 */
	test('a turn: the beats row in the Sanctum, then the lead, then the rest — and no narrator', async () => {
		const said: string[] = []
		const receipt = await takeTurn(PLAN, saying(said))
		assert.equal(receipt.outcome, 'ok')
		// One call per named speaker — and nobody else.
		assert.deepEqual(said, ['Verity', 'Brask'])
		// The beats row: the Castellan's, on the Sanctum, the list as its body.
		const beats = node(receipt, `${PLAY}.plan.posted.write`)
		assert.equal(beats.result, 'ok')
		assert.deepEqual(
			[beats.input.channel, beats.input.speaker, beats.input.text],
			['sanctum', 'envoy:castellan', '- The well shaft opens into the dark.'],
		)
		// The lead: their own row, opened after the beats, streamed, finished.
		const placeholder = node(receipt, `${PLAY}.lead.speaks.placeholder`)
		assert.deepEqual(
			[placeholder.input.generating, placeholder.input.channel, placeholder.input.speaker],
			[true, 'main', 'character:11'],
		)
		const leadSave = node(receipt, `${PLAY}.lead.speaks.save`)
		assert.equal(leadSave.input.text, '<Verity>')
		assert.equal(leadSave.input.thinking, 'Verity weighs it')
		// The rest: complete rows, each the delver's — the lead is not among them.
		const lines = nodes(receipt, `${PLAY}.voices.item.line`)
		assert.deepEqual(
			lines.map((n: any) => [n.input.text, n.input.speaker]),
			[['<Brask>', 'character:12']],
		)
		const order = receipt.nodes.map((n: any) => n.nodeKey)
		const at = (k: string) => order.indexOf(k)
		assert.ok(at(`${PLAY}.plan.posted.write`) < at(`${PLAY}.lead.speaks.placeholder`))
		assert.ok(at(`${PLAY}.lead.speaks.save`) < at(`${PLAY}.voices.item.line`))
		// No live row before the lead's: nothing else opened one.
		for (const n of receipt.nodes)
			if (n.input?.generating === true)
				assert.equal(n.nodeKey, `${PLAY}.lead.speaks.placeholder`)
		// The keeper ran ONCE, over the beats and every line; the world's
		// changes are filed at the beats row (`worldRow`).
		const keeper = nodes(receipt, 'keep.played.keeperContext')
		assert.equal(keeper.length, 1)
		assert.equal(
			keeper[0].input.reply,
			'- The well shaft opens into the dark.\n\n<Verity>\n\n<Brask>',
		)
		assert.equal(nodes(receipt, 'keep.played.keeperWrite').length, 1)
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
			assert.equal(save.input.thinking, 'narrator weighs it')
			// Narrate adds no direction.
			assert.equal(node(receipt, 'via.narrate.context').input.turnDirection, undefined)
			assert.ok(!receipt.nodes.some((n: any) => String(n.nodeKey).startsWith('via.turn.') && n.result === 'ok'))
			assert.equal(nodes(receipt, 'keep.played.keeperWrite').length, 1)
			assert.equal(node(receipt, 'keep.played.keeperContext').input.reply, '<narrator>')
		})

	test('Narrate is routed ahead of the channel, and the narration step streams', () => {
		const doc = respondDoc()
		const say = doc.nodes.find((n) => n.key === 'via.narrate.say')!
		assert.equal((say.expose as any)?.stream, true)
		assert.equal((say.expose as any)?.status, 'The Castellan narrates')
		const lead = doc.nodes.find((n) => n.key === `${PLAY}.lead.speaks.say`)!
		assert.equal((lead.expose as any)?.stream, true)
		const planner = doc.nodes.find((n) => n.key === `${S}.planned.planWrite`)!
		assert.equal((planner.expose as any)?.status, 'The Castellan is planning the turn')
		assert.equal((planner.expose as any)?.stream, undefined)
	})

	/**
	 * B15 (owner D2a, 2026-09-27): Pick who speaks is a delver-only turn. The
	 * picked delver answers alone into their own row — no planner, no beats,
	 * no voices and no keeper.
	 */
	test('a pick: the picked delver answers alone, and nothing plans', async () => {
		const said: string[] = []
		const receipt = await takeTurn(PLAN, saying(said), 12)
		assert.equal(receipt.outcome, 'ok')
		assert.deepEqual(said, ['Brask'])
		const save = node(receipt, `${S}.picked.save`)
		assert.equal(save.result, 'ok')
		assert.equal(save.input.text, '<Brask>')
		assert.equal(save.input.thinking, 'Brask weighs it')
		assert.equal(node(receipt, `${S}.picked.lore`).input.speaker, 'character:12')
		assert.ok(!receipt.nodes.some((n: any) => String(n.nodeKey).startsWith(`${S}.planned.`) && n.result === 'ok'))
		assert.ok(!ran(receipt, 'keep.played.keeperWrite'))
	})

	/**
	 * R12 (owner 2026-09-28): the Lair is cast only. A session stored before
	 * that may still carry `turnStyle: 'narrator'` in its fields; nothing reads
	 * it.
	 */
	test("a stored turnStyle: 'narrator' is inert — the party still speak for themselves", async () => {
		const said: string[] = []
		const receipt = await takeTurn(PLAN, saying(said), null, { turnStyle: 'narrator' })
		assert.equal(receipt.outcome, 'ok')
		assert.deepEqual(said, ['Verity', 'Brask'])
	})

	test("B11: the master's line reaches the planner as direction; the lead's row carries the line alone", async () => {
		const receipt = await takeTurn(PLAN, saying([]))
		const input = (key: string) => node(receipt, key)?.input
		assert.equal(input(`${S}.planned.planContext`)?.turnDirection, 'send them down the shaft')
		assert.equal(input(`${S}.planned.planContext`)?.direction, undefined)
		const save = node(receipt, `${PLAY}.lead.speaks.save`)
		assert.equal(save.input.sections, undefined)
		assert.ok(!String(save.input.text).includes('{'))
		assert.ok(!String(save.input.text).includes('sound the depth'))
	})

	test('the party knocks: one Castellan question on main, addressed to the owner — nothing played', async () => {
		const receipt = await takeTurn(KNOCK_PLAN)

		assert.equal(receipt.outcome, 'ok')
		// No beats, nobody spoke, and nothing was kept.
		assert.ok(!ran(receipt, `${PLAY}.plan.posted.write`))
		assert.ok(!ran(receipt, `${PLAY}.lead.speaks.say`))
		assert.ok(!ran(receipt, `${PLAY}.voices.item.say`))
		assert.ok(!ran(receipt, 'keep.played.keeperWrite'))

		const placeholder = node(receipt, `${S}.planned.door.knock.placeholder`)
		assert.deepEqual(
			[placeholder.input.channel, placeholder.input.speaker],
			['main', 'envoy:castellan'],
		)
		const save = node(receipt, `${S}.planned.door.knock.save`)
		assert.equal(save.result, 'ok')
		assert.equal(save.input.text, KNOCK_PLAN.knockQuestion)
		// No fold: the Plan is retired, and nobody narrated.
		assert.equal(save.input.sections, undefined)
		assert.equal(save.input.thinking, undefined)

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
		const save = node(receipt, `${S}.planned.door.knock.save`)
		assert.equal(save.input.blocks[0].referent, 'The Drowned Hall')
	})

	test('an exit the dungeon already holds never knocks (B13)', async () => {
		const receipt = await takeTurn({
			...KNOCK_PLAN,
			speakers: PLAN.speakers,
			unknownExit: '  the stair ',
			knockQuestion: 'Is there a Stair?',
		})
		assert.equal(receipt.outcome, 'ok')
		assert.ok(ran(receipt, `${PLAY}.lead.speaks.say`), 'the turn was not played')
		assert.ok(!ran(receipt, `${S}.planned.door.knock.save`), 'a known room knocked')
	})

	test('the planner and every voice are handed every room, whatever was ranked (B13; R8)', async () => {
		const receipt = await takeTurn(PLAN)
		const input = (key: string) => node(receipt, key)?.input
		assert.deepEqual(input(`${S}.planned.planContext`)?.locationEntries, ROOMS)
		assert.deepEqual(input(`${PLAY}.lead.speaks.context`)?.locationEntries, ROOMS)
		for (const v of nodes(receipt, `${PLAY}.voices.item.context`))
			assert.deepEqual(v.input.locationEntries, ROOMS)
		const rooms = node(receipt, 'gather.rooms.read')
		assert.deepEqual(rooms?.input?.params?.entryTypes, ['core:entry/location'])
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
	 * the lead in its own branch, the rest in the `each`.
	 */
	test('two voices, two lore lanes, two speakers', async () => {
		const receipt = await takeTurn()
		const lanes = [
			...nodes(receipt, `${PLAY}.lead.speaks.lore`),
			...nodes(receipt, `${PLAY}.voices.item.lore`),
		]
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

	test('a plan naming nobody posts its beats and voices nobody', async () => {
		const said: string[] = []
		const receipt = await takeTurn({ ...PLAN, speakers: [] }, saying(said))
		assert.equal(receipt.outcome, 'ok')
		assert.deepEqual(said, [])
		assert.ok(ran(receipt, `${PLAY}.plan.posted.write`))
		assert.ok(!ran(receipt, `${PLAY}.lead.speaks.placeholder`))
		// Nothing was played, so nothing is kept.
		assert.ok(!ran(receipt, 'keep.played.keeperWrite'))
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

	test('prose-described: the party walk in, and the paragraph reaches every voice', async () => {
		const receipt = await takeTurn(
			{ ...KNOCK_PLAN, speakers: PLAN.speakers },
			describedInProse,
		)
		assert.equal(receipt.outcome, 'ok')
		assert.ok(!ran(receipt, `${S}.planned.door.knock.save`), 'a described room knocked')
		assert.ok(ran(receipt, `${PLAY}.lead.speaks.say`), 'the turn was not played')
		assert.equal(node(receipt, `${PLAY}.lead.speaks.context`)?.input?.locationPassage, PASSAGE)
		for (const v of nodes(receipt, `${PLAY}.voices.item.context`))
			assert.equal(v.input?.locationPassage, PASSAGE)
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
			],
		)
		assert.deepEqual(preset.values[0]!.value, { review: 'off' })
		assert.deepEqual(preset.values[1]!.value, { review: 'on' })
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
			// The narrator's reasoning folds as Thinking (the B5 pattern).
			assert.ok(
				d.edges.some(
					(e: any) => e.to === 'save' && e.toPort === 'thinking' && e.from === 'write',
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
			/(lead\.speaks|voices\.item)\.context$|keep\.played\.keeperContext$/.test(x.nodeKey),
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
