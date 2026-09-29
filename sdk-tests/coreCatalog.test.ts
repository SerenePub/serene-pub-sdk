/**
 * @serene-pub/core-catalog (24 §9): core's announcement builds clean — the
 * same validator every plugin passes through, applied to core itself. This is
 * the "core is the first consumer, not a special case" claim, executed.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
	coreAnnouncement,
	CORE_SPECS,
	adventureGenre,
	chatGenre,
	CORE_HOOK_DECLARATIONS,
} from '@serene-pub/core-catalog'
import { sessionEvents } from '@serene-pub/sdk'

describe('the core catalog', () => {
	test('the announcement builds — genres, pipelines, hooks validated as one package', () => {
		const { document } = coreAnnouncement()
		assert.equal(document.identity.ns, 'core')
		// Sorted by id, so this is the shipped list in id order — every genre
		// `coreAnnouncement()` names, not the three core started with.
		//
		// ⚠ Read through the package's `dist`, so a genre written today is
		// absent here until `npm run sdk:build` catches up. `lair`,
		// `writing-room` and `whodunit` each landed that way.
		assert.deepEqual(document.genres.map((g) => g.id).sort(), [
			'core:genre/adventure',
			'core:genre/chat',
			// The guide (R-18, U5g): the pure user/assistant session type.
			'core:genre/guide',
			'core:genre/lair',
			'core:genre/whodunit',
			'core:genre/writing-room',
		])
		assert.equal(document.pipelines.length, CORE_SPECS.length)
		// Core references nothing it does not ship.
		assert.deepEqual(document.requires, [])
	})

	test('exactly one create pipeline serves each genre, and one respond serves its turn', () => {
		const { document } = coreAnnouncement()
		const serving = (genre: string, event: string) =>
			document.pipelines
				.filter((p) => p.input?.genre === genre && p.input?.event === event)
				.map((p) => p.id)

		// The genre owns its id; the create pipeline is its required MEMBER, so
		// "exactly one" is the claim that matters — two would make creation
		// ambiguous for every session of that genre.
		assert.deepEqual(serving(chatGenre.id, sessionEvents.sessionCreated), [
			'core:spec/create-chat',
		])
		assert.deepEqual(serving(chatGenre.id, sessionEvents.messageRespond), ['core:spec/respond'])
		assert.deepEqual(serving(adventureGenre.id, sessionEvents.sessionCreated), [
			'core:spec/adventure-create',
		])
		assert.deepEqual(serving(adventureGenre.id, sessionEvents.messageRespond), [
			'core:spec/adventure-respond',
		])
		// The open slot takes any number: five actions since U5d (look, rest,
		// advance-time, ask, answer), and adding a sixth is a package change
		// rather than a schema one.
		assert.equal(serving(adventureGenre.id, sessionEvents.sessionAction).length, 5)
		// The answer pipeline (R-15 *Forms*): one per shipped genre, on the
		// optional `form-addressed` event, bound by each shipped preset.
		for (const g of [chatGenre, adventureGenre]) {
			const [spec, ...rest] = serving(g.id, sessionEvents.formAddressed)
			assert.equal(rest.length, 0)
			assert.ok(spec?.startsWith('core:spec/answer-form-'), g.id)
			const preset = document.presets.find((p) => p.genre === g.id)
			assert.equal(preset?.bindings[sessionEvents.formAddressed]?.spec, spec)
		}
	})

	test('hook declarations are fully-qualified core ids', () => {
		for (const id of Object.keys(CORE_HOOK_DECLARATIONS)) assert.match(id, /^core:hook\//)
	})
})

// Core's whole announcement, pinned. Core declares itself with
// defineExtension() and is announced through announcementOf(); a change to
// either path that moves a byte of what an instance syncs moves this hash.
// Update it only when the change is meant, and say why in the ledger.
//
// 2026-09-24 → 95253967abe6c0e1: sprites (DESIGN-sprites S1–S4) — the
// `sprites-for` / `pick-sprite-similarity` / `show-sprite` definitions, the
// `sprite-shown` event, `core:spec/show-sprite`, the sprite-set slot, and the
// sprite tail on the five reply specs.
//
// 2026-09-24 → 0a545af37fd47813: R71 — core's genres carry the layouts they
// ship (`layouts: [layout({ slug: 'default', … })]` on Adventure, Lair,
// Writing Room and Whodunit), the same documents `CORE_LAYOUTS_V2` held.
//
// 2026-09-25 → b49563099136c186: R79 — the Inventory widget is removed for
// now, so Adventure's right column is Scene Portraits over Stats (two `grow`
// rows) and Lair's is World State alone (one). Nothing else moved: with the
// two old right columns put back, the document hashes to 0a545af37fd47813.
//
// 2026-09-25 → 13c24606f967b489: Adventure, Lair and Whodunit declare
// `customAttributes: 'allow'` (their sessions may carry in their world's
// attributes and add their own). Nothing else moved: with the three stripped,
// the document hashes to b49563099136c186.
//
// 2026-09-26 → f88133bcfac96928: attributes phase 2 (seeded stat shapes) — core's number and
// choice slots name their catalogue stat shape (`shape:
// 'core:stat-shape/number@1'` / `choice@1`) instead of a bare `type`, which
// is now read off the shape (the frozen declaration still carries it).
// Nothing else moved: with the 15 `shape` keys stripped, the document hashes
// to 13c24606f967b489.
//
// 2026-09-26 → 0cdc848d5ccbefc7: attributes phase 3b (possessions retired onto
// the `inventory` stat) — Adventure and Lair carry `core:slot/inventory@1` on
// their slots and sheets, and Adventure's respond spec reads
// `core:query/item-supply@1` into `keeperResolve.supply` (a unique item is not
// handed out twice). Nothing else moved: a copy of core-catalog/src with those
// three edits reverted hashes to f88133bcfac96928.
//
// 2026-09-26 → 5c5eb8dd78256aee: attributes phase 4 (locations hold stats) —
// `core:slot/inventory@1` applies to `location` too (what is lying in a
// place), and its description and descriptor say so. Nothing else moved: with
// the slot's appliesTo, description and descriptor put back at both places the
// document carries it, the document hashes to 0cdc848d5ccbefc7.
//
// 2026-09-26 → 0bb86ed283ae7bd1: everyone has a name (ruled 2026-09-26) —
// the Guide's mascot and the Writing Room's scribe are marked `fallback: true`,
// the speaker a line nobody claims posts as. Four keys: each genre's
// declaration and its create spec's `meta.genre.envoys`. Nothing else of this
// change moved: with those four keys stripped the document hashes to
// 324a197883393bff — the tree as built just before it, which already carried
// the in-flight location-stat work (another lane's; its own pin is its own).
//
// 2026-09-26 → 5baf5505040715b0: annex fields — core ships its one pipeline
// for every declared annex field, `core:spec/set-annex-field` (an inlet and a
// `core:outlet/set-annex-field@1` write; it contributes no action). Nothing
// else moved: with that one entry filtered out of `pipelines`, the document
// hashes to 0bb86ed283ae7bd1.
//
// 2026-09-27 → aa82290369be2b27: the keeper's item arm renamed `possessions` →
// `inventory` (owner ruling) in the Adventure, Lair and Whodunit keeper
// schemas, the six presets' `path: values,inventory` and the six keeper
// prompts' `- inventory:` line; and Lair's respond spec reads
// `core:query/item-supply@1` into `keep.played.keeperResolve.supply`. Nothing
// else moved: a copy of core-catalog/src with those edits reverted hashes to
// 5baf5505040715b0.
//
// 2026-09-27 → 46814c2129c153b2: B10 (lair pass F7) — the Lair's composer
// actions declare `composerText`: Nudge, Whisper and Build room `required`,
// Trigger trap and Reveal `optional`. Nothing else moved: with those five keys
// stripped, the document hashes to aa82290369be2b27.
//
// 2026-09-27 → 295ed22f64a1839e: B9 (lair pass F6) — the three narrator
// genres (Adventure, Lair, Whodunit) and their turn-order specs recompute on
// message-deleted and message-hidden as well (TURN_ORDER_NARRATOR_EVENTS).
describe("core's announcement (golden)", () => {
	test('the canonical document is unchanged', async () => {
		const { canonicalize } = await import('@serene-pub/sdk')
		const { createHash } = await import('node:crypto')
		const { coreAnnouncement } = await import('@serene-pub/core-catalog')
		const digest = createHash('sha256').update(canonicalize(coreAnnouncement().document)).digest('hex')
		// Moved 2026-09-27 (lair pass B3/B18): the streaming stage and the stage
		// statuses are declared on `expose` (`stream`, `status`). Proven: with those
		// two keys stripped, the document hashes back to the old pin. (was '295ed22f64a1839e')
		// Moved 2026-09-27 (W2 consolidation): streaming is one stage per
		// execution path, so the Writing Room's two branch stages
		// (`turn.manuscript.write`, `turn.talk.say`) both declare `stream`.
		// Proven: with `stream` stripped from those two nodes, the document
		// hashes back to the old pin. (was '3f313155e90ec52b')
		// Moved 2026-09-27 (lair pass B5, owner D5): Lair respond's Plan and
		// Thinking folds (`planSection` over `core:task/list-section@1`, its
		// preset params, `save`'s `thinking` and `sections`). Proven: a copy of
		// core-catalog/src with just those lair.ts edits reverted hashes back to
		// the old pin. (was '236f3d8777bc94f6')
		// Moved 2026-09-27 (lair pass B7, owner D4): the Lair genre declares
		// `messageVerbs: { continue: false }`. Proven: a copy of
		// core-catalog/src without that line hashes back to the old pin.
		// (was '59da4d9405687181')
		// Moved 2026-09-27 (lair pass B11, Lair half): Lair respond wires
		// `$.input.text` into `planContext` and `turn.play.sceneContext` as
		// `direction`, and the Lair planner and narrator prompts render it in a
		// `{{#if direction}}` block. Proven: a copy of core-catalog/src with just
		// those lair.ts and prompts.ts edits reverted hashes back to the old pin.
		// (was '9b524b24aed23645')
		// Moved 2026-09-27 (lair pass B8, owner D2/D3): the Lair genre declares
		// `turnControls` — advance, pick present only in cast style (that
		// present-when retired with the turn style, R12 2026-09-28), narrate.
		// Proven: a copy of core-catalog/src with just that genres.ts block
		// removed hashes back to the old pin. (was '5d2d7e819f1b3ee6')
		// Moved twice 2026-09-27 (lair wave 3). First (R1 rename): the per-turn
		// `direction` port and `{{direction}}` block became `turnDirection` —
		// that edit alone hashed to '649783fe704f6ee3'. Then B12–B14: Lair
		// respond lists the rooms (`gather.rooms`, `exit`, `exitCheck`, the
		// knock's `referent`, `locationEntries` on both contexts), the room
		// answer drafts a named room and sends the party on (`choice.build`,
		// `save.name`, `onward`, `resume`), the knock-build prompt row, and the
		// narrator's turn-style paragraph chosen by `{{#if (eq turnStyle …)}}`
		// (retired with the turn style, R12 2026-09-28).
		// Measured step by step, only these edits between. (was 'bbdff1996adaeb3a')
		// Moved 2026-09-27 (lair pass B17, owner D7a): Trigger trap and Reveal
		// write a streamed Narrator row (placeholder + update with `thinking`),
		// wire the typed text as `turnDirection`, declare their own statuses
		// and plainer descriptions, and their prompt rows render
		// `{{#if turnDirection}}`. Proven: a copy of core-catalog/src with just
		// those lairActions.ts and prompts.ts edits reverted hashes back to the
		// old pin. (was '34dc9fde8770aaef')
		// Moved 2026-09-27 (lair pass B15/B16, owner D1a/D2a): Lair respond's
		// `pick` junction (a picked delver answers alone) and one complete row
		// per speaking delver after the narrator's. Proven: a copy of
		// core-catalog/src with only lair.ts reverted hashes back to the old
		// pin. (was 'b953ae1d1d2e9630')
		// Moved 2026-09-27 (lair pass W-GATE D2/D3): Whisper wires the typed
		// line to `context.turnDirection` and its prompt row renders
		// `{{turnDirection}}`; Answer the door declares `presentWhen` (present
		// only while the knock is open). Proven: a copy of core-catalog/src
		// with just those lairActions.ts and prompts.ts edits reverted hashes
		// back to the old pin. (was 'b7cab48f3c4a85b0')
		// Moved 2026-09-27 (guide grounding): the guide's mascot prompt says
		// excerpts-or-nothing, its envoy description stops claiming it knows the
		// docs, and `guide-respond` 1.2.0 ships the guide's own template as its
		// default preset (`docsExcerpts` band with an `{{else}}` for no match).
		// Proven: the current document with the old prompt and description
		// restored, and guide-respond's version and `guide` preset reverted,
		// hashes back to the old pin. (was '3ee0f77a46d268dc')
		// Moved 2026-09-27 (characterDetail genre field): Chat and Adventure
		// declare `fields.characterDetail` (CHARACTER_DETAIL_FIELD: full / brief /
		// speaker-only). Proven: a copy of core-catalog/src with just those two
		// field lines removed from genres.ts hashes back to the old pin. (was '43ca719a5b1f34eb')
		// Moved 2026-09-28 (the action legend): every contributed action now
		// carries a required `description`, and seven core ones had none —
		// Adventure's Look, Rest and Time passes, Echo, Image, Narrate and Side
		// character. Proven: the current document with just those seven
		// `description` keys deleted hashes back to the old pin. (was '8e03eab18618a7c4')
		// Moved 2026-09-28 (rename, NOMENCLATURE §25): the Lair genre's
		// `messageVerbs: { continue: false }` is `{ extend: false }` (the verb is
		// `core#extend`), in the genre and in lair-create's embedded shape.
		// Proven: the current document with only those two keys renamed back
		// hashes to the old pin. (was 'a8c52910bfc20c1a')
		// Moved 2026-09-28 (enum option labels: `members` beside `of` on genre fields); removing those `members` restores the old pin exactly (was 'ca1e9b6799c03f75').
		// Moved 2026-09-28 (lair re-plan R12, cast only): the Lair genre and
		// lair-create drop `fields.turnStyle` and Pick's present-when; lair-respond's
		// `voices` junction becomes a plain `each`; the Lair scene prompt rows
		// lose their `{{#if (eq turnStyle …)}}` branch; the preset default drops
		// `turnStyle`. R12 alone hashes to '73dc509fa5d1a73d' (the source with
		// R1's whisper `earshot: 'holder'` stripped); with R1's earshot, already
		// in the source from the parallel lane, it is the pin below. Proven by a
		// canonical diff of the pre-change build (dist, '64fe6fb79fbe7a90')
		// against the source: only those keys and R1's one. (was '64fe6fb79fbe7a90')
		// Moved 2026-09-28 (lair re-plan R1, earshot) — the same pin, R1's half:
		// `core:slot/whisper@1` declares `earshot: 'holder'`, carried on the
		// announced slot declaration. Proven: the built announcement with every
		// `earshot: 'holder'` key deleted hashes to '73dc509fa5d1a73d' (R12's
		// alone); no Lair spec document carries it (every lairSpecs() hash is
		// unchanged by the same strip), so no spec pin moves for R1.
		// Moved 2026-09-28 (lair re-plan R2, retake) — measured with R7's
		// in-flight edit already in the source. R2's half: the Lair genre and
		// lair-create's embedded shape declare `turnControls.retake: true`.
		// Proven: the built announcement with those two `retake` keys deleted
		// (and no other `retake` anywhere in it) hashes to '649fe0f1cc12a5ef'.
		// The rest of the move, 'b6cfb196fa36b456' → '649fe0f1cc12a5ef', is NOT
		// R2's: it is R7's lair-respond exit check (`undescribed-name@1`, its
		// own pin moved in lair.test), for that lane to prove against this
		// chain. Core's `retake-quietly` annex field is not in the document.
		// (was 'b6cfb196fa36b456')
		// Moved 2026-09-28 (lair re-plan R4, playerLabel) — measured with R3's
		// in-flight `collects` edit already in the source. R4's half: the Lair
		// genre and lair-create's `genre` row carry `playerLabel`, and the Lair
		// prompt rows say "the {{playerLabel}}" where they said "the dungeon's
		// master" (plus the planner's and the voice's one new clause each).
		// Proven: the built announcement with every `playerLabel` key deleted and
		// those prompt strings reverted hashes to '35dacfc7794c2f2c'. The rest of
		// the move, '3a40c0432bb911fe' → '35dacfc7794c2f2c', is NOT R4's: it is
		// R3's `collects` (its Lair and Whodunit action pins moved too), for that
		// lane to prove against this chain. (was '3a40c0432bb911fe')
		// The same pin, R3's half (lair re-plan R3, `collects`, 2026-09-28):
		// eight actions declare `collects` (the Lair's Nudge, Whisper, Build
		// room, Trigger trap and Reveal, where `composerText` was; Whodunit's
		// Question and Search; Chat's Image), and five descriptions stop saying
		// _Type_. Proven: the built announcement with every `collects` deleted,
		// the Lair's five `composerText` keys restored and the five old
		// descriptions hashes to 'c35c80ff11ee5a78' — R4's half alone, which
		// with R4's proof above closes the chain from '3a40c0432bb911fe'.
		// Moved 2026-09-28 (lair re-plan R6, the Sanctum and the Castellan):
		// the Lair genre's `channels` (the Sanctum, with `label` and
		// `turnControls`) and `envoys` (the Castellan, fallback, greeting),
		// lair-create / lair-respond / lair-turn-order, the new type
		// `core:query/envoy-greeting@1`, and `build-template-context@1`'s
		// `locationEntries` and `recentStory` in-ports. Proven: the sources
		// (sdk, contracts, core-catalog) copied with only R6's edits reverted
		// hash to '572df6a6b7299bbb', and the three Lair spec pins come back
		// with it. (was '572df6a6b7299bbb')
		// Moved 2026-09-28 (lair re-plan R8, the Castellan's turn):
		// lair-respond (the `via` junction, per-branch rows, the beats row,
		// the streamed lead, the spine keeper with `worldRow`), lair-trap,
		// lair-reveal and lair-nudge (the Castellan's), the Lair prompt rows
		// (planner plans the party only; the scene row is the Castellan's
		// narration; the voice may act in the first person and sees the rooms;
		// keeper; trap; reveal), `core#narrate`'s voice-neutral description,
		// the contract ports (`user-message.via`, `list-section.text`,
		// `set-state.worldRow`, `build-side-character-context.locationEntries`)
		// and the new `core:task/split-first@1`. Proven: the sources copied
		// with only R8's edits reverted hash back to '60bb7ed5c6c86d8a', and
		// the four Lair spec pins come back with it. (was '60bb7ed5c6c86d8a')
		// Moved 2026-09-28 (lair re-plan R13, Sanctum talk steers the story,
		// the Castellan's scratchpad): the Lair genre field `sanctumSteers`
		// and the relabelled `trustNarrator`; the Castellan's prompt;
		// lair-create and lair-respond (the steer and talk junctions, the
		// scratchpad read and rewrite); the Lair planner, narration and new
		// scratchpad prompt rows; `session-history@1`'s `unplayedOnly` param;
		// the in-ports `sideTalk` (planner, scene), `scratchpad` (planner,
		// template) and `fields` (template); core's annex field
		// `castellan-scratchpad`. Proven: the sources (sdk, contracts,
		// core-catalog) copied with only R13's edits reverted hash back to
		// '57a3f0ed2674ad2d', and the two Lair spec pins come back with it.
		// (was '57a3f0ed2674ad2d')
		// Moved 2026-09-28 (lair re-plan R9, the knock asks for a description):
		// lair-respond (the one-option knock, `exitProse`, `locationPassage`
		// to the voices), lair-room-answer (collects, the `room` junction:
		// typed verbatim with no review, or drafted behind it), the Lair
		// voice and knock-build prompt rows, the `lair-improvise` row gone,
		// and `build-side-character-context@1`'s `locationPassage` in-port.
		// Proven: the sources (sdk, contracts, core-catalog) copied with only
		// R9's edits reverted hash back to '7c089a472ae03250', and the two
		// Lair spec pins come back with it. (was '7c089a472ae03250')
		// Moved 2026-09-28 (lair re-plan R10, whisper recipients + the R9
		// follow-up): lair-whisper is pure (collects `recipients` with
		// `overwrites`, the one change on `owners` = `input.recipients`, no model
		// step) and its "Lair whisper" prompt row is retired; lair-respond's
		// `exitProse` reads `talkOnly`; `resolve-state-changes@1` gains the
		// `owners` in-port (`participant-refs@1`) and `session-history@1` the
		// `talkOnly` param; `CollectedRecipients.overwrites`. Proven: the
		// sources (sdk, contracts, core-catalog) copied with only R10's edits
		// reverted hash back to '888c2b32cac905cc', and the two Lair spec pins
		// come back with it. (was '888c2b32cac905cc')
		// Moved 2026-09-28 (lair re-plan R11, File as a room): the new spec
		// `core:spec/lair-file-room` (message venue, `world`, collects the
		// room's name, enabled-when on `item.characterLine`), the Lair
		// preset's seventh action and its _Lair file room_ prompt row;
		// `session-history@1`'s `messageId` in-port; `WORLD_ACTION_VENUES`
		// admits `message` (the effects line's verdict now fails on `widget`).
		// Proven: the sources (sdk, contracts, core-catalog) copied with only
		// R11's edits reverted hash back to 'f2b52529af0442f1', and every Lair
		// spec pin comes back with it. (was 'f2b52529af0442f1')
		assert.equal(digest.slice(0, 16), 'fe81e9984c9eead9')
	})
})
