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
	SHOW_SPRITE_SPEC_ID,
	SPRITE_PICKER_NODE_KEY,
	TOOL_LOOP_SPEC_ID,
	toolLoopSpec,
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
		// absent here until `npm run sdk:build` catches up. `lair` landed
		// that way. (Writing Room and Whodunit were core genres until
		// 2026-09-30 and are showcase plugins now.)
		assert.deepEqual(document.genres.map((g) => g.id).sort(), [
			'core:genre/adventure',
			'core:genre/chat',
			// The guide (R-18, U5g): the pure user/assistant session type.
			'core:genre/guide',
			'core:genre/lair',
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
			'core:spec/chat-create',
		])
		assert.deepEqual(serving(chatGenre.id, sessionEvents.messageRespond), ['core:spec/chat-respond'])
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
		// optional `form-addressed` event, bound by each shipped preset —
		// named genre first, like every genre pipeline (2026-10-05).
		for (const g of [chatGenre, adventureGenre]) {
			const [spec, ...rest] = serving(g.id, sessionEvents.formAddressed)
			assert.equal(rest.length, 0)
			assert.equal(spec, `core:spec/${g.id.split('/').at(-1)}-answer-form`, g.id)
			const preset = document.presets.find((p) => p.genre === g.id)
			assert.equal(preset?.bindings[sessionEvents.formAddressed]?.spec, spec)
		}
	})

	/**
	 * Sprites in-pipeline (owner rulings 2026-10-05): every reply spec writes
	 * the sprite step out itself, after `save` — the picker, handed the
	 * reply's own text, then the outlet recording the pick as the picker's.
	 * Nothing appends hidden nodes any more (`withSpriteTail`, retired), and
	 * Adventure, Narrate and the Lair carry it too: seven, not five. The
	 * tool-loop reference is one of the seven though it left `CORE_SPECS`
	 * (2026-10-05): an example of a reply writes the step like a reply.
	 */
	test('seven reply specs write the sprite step in, after save, with the text passed in', () => {
		const specs = [...CORE_SPECS, { slug: TOOL_LOOP_SPEC_ID, build: toolLoopSpec }]
		const LAIR_TURN = 'via.turn.channel.story.door.play.speech.each.character.turn.'
		// Where each spec places it: on the spine, or in the Lair's character
		// turn — the one branch where a single delver speaks.
		const placed: Record<string, string> = {
			'core:spec/chat-respond': '',
			'core:spec/tool-loop': '',
			'core:spec/chat-side-character': '',
			'core:spec/guide-respond': '',
			'core:spec/adventure-respond': '',
			'core:spec/chat-narrate': '',
			'core:spec/lair-respond': LAIR_TURN,
		}
		const carrying = specs.filter((s) =>
			(s.build().nodes as any[]).some((n) => n.definitionId === 'core:oracle/pick-sprite'),
		).map((s) => s.slug)
		assert.deepEqual(carrying.sort(), Object.keys(placed).sort())

		for (const [slug, at] of Object.entries(placed)) {
			const doc = specs.find((s) => s.slug === slug)!.build() as any
			const nodes = doc.nodes as any[]
			const at_ = (key: string) => nodes.findIndex((n) => n.key === `${at}${key}`)
			const pick = nodes[at_(SPRITE_PICKER_NODE_KEY)]
			const show = nodes[at_('spriteShow')]
			assert.equal(pick?.definitionId, 'core:oracle/pick-sprite', slug)
			assert.equal(pick.expose?.session, true, `${slug}: the picker is a session setting`)
			assert.equal(show?.definitionId, 'core:outlet/show-sprite', slug)
			assert.equal(show.config.source, 'picker', slug)
			assert.ok(at_('save') < at_(SPRITE_PICKER_NODE_KEY), `${slug}: after save`)
			assert.ok(at_(SPRITE_PICKER_NODE_KEY) < at_('spriteShow'), slug)
			const into = (node: any, port: string) =>
				(doc.edges as any[]).filter((e) => e.to === node.key && e.toPort === port)
			// The reply's text, from the step that produced it — never the
			// saved row's id for a host to re-read.
			const [text] = into(pick, 'text')
			assert.ok(text, `${slug}: the picker is handed the text`)
			assert.equal(text.fromPort, 'text', slug)
			assert.notEqual(text.from, `${at}save`, slug)
			// Whose line: wired wherever the line has a speaker — not on a
			// narration, which is nobody's.
			assert.equal(into(pick, 'speaker').length, slug === 'core:spec/chat-narrate' ? 0 : 1, slug)
			assert.equal(into(show, 'target')[0]?.from, `${at}save`, slug)
			assert.equal(into(show, 'pick')[0]?.from, pick.key, slug)
			assert.ok(
				!nodes.some((n) => /spriteTail/.test(n.key) || n.definitionId === 'core:query/sprites-for'),
				`${slug}: no hidden tail`,
			)
		}

		// A person's pick says so in its own document.
		const person = CORE_SPECS.find((s) => s.slug === SHOW_SPRITE_SPEC_ID)!.build() as any
		const write = (person.nodes as any[]).find((n) => n.definitionId === 'core:outlet/show-sprite')
		assert.equal(write.config.source, 'person')
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
// sprite tail on the five reply specs. (2026-10-05: the tail is retired; seven
// reply specs write the step in — see the pin below and the test above.)
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
		// Moved 2026-09-29 (genre uplift C2, a narration's direction reaches
		// the prompt): `narrate` collects optional text and wires
		// `context.turnDirection: $.input.text`, as do `narrate-character` and
		// `whodunit-search`; the Narrator and Side Character rows end both
		// texts with the `{{#if turnDirection}}` focus clause, and Whodunit
		// search names what the detective is looking for. Proven: this
		// document with only those three specs' edge/config/collects and the
		// five clauses removed hashes back to the old pin. (was 'fe81e9984c9eead9')
		// Moved 2026-09-29 (places plan B6, prompts and the Lair): lair-respond's
		// rooms read asks `withLinks`; lair-room-answer links the new room to the
		// room the party stand in (`gather.rooms`, `here`, the `link` junction,
		// their preset values); the Lair planner row reads the ways on from
		// "From here" (and an older room's own exits). Proven: this document
		// built from a copy of core-catalog/src with only B6's lair.ts,
		// lairActions.ts and prompts.ts edits reverted hashes back to the old
		// pin, and both Lair spec pins come back with it. (was 'b3b647e03d5f3988')
		// Moved 2026-09-29 (places plan, B6 review round): the Lair planner row
		// no longer calls every line under From here a way on — a line saying
		// what the room is inside, holds or hides is not one, and a room may
		// list none. Prompt text only: no spec pin moved. Proven: core-catalog
		// rebuilt with only that sentence reverted hashes back to the old pin.
		// (was 'da4e95b335f602bd')
		// Moved 2026-09-29 (layout plan brief 1, one format): the four core
		// genres' `layouts[0].preset` is the session layout they have always
		// seeded (ADVENTURE_LAYOUT, LAIR_LAYOUT, WRITING_ROOM_LAYOUT,
		// WHODUNIT_LAYOUT) instead of a LayoutDoc v2 twin, less the retired
		// grid `required` flag. Measured with other lanes' in-flight source
		// already in the tree. Brief 1's half, proven: this document with every
		// genre's old `layouts` put back (and nothing else touched) hashes to
		// '52d8e0065d7a08ad'. The rest of the move, '857dc07f24ca4a1f' →
		// '52d8e0065d7a08ad', is NOT brief 1's: it is the genre lanes'
		// in-flight core-catalog edits (adventure-respond's relationship
		// gather and its presets, new nodes on respond, narrate and
		// narrate-character, the two Adventure prompt rows), built into dist
		// for the first time by this build — for those lanes to prove against
		// this chain. (was '857dc07f24ca4a1f')
		// Part of that rest, proven (genre uplift F1, 2026-09-29, Search by
		// meaning is Automatic): `core:task/query-windows@1` gains a
		// `connection` slot and `searchByMeaning` becomes `auto | on | off`
		// (default `auto`); respond, narrate and narrate-character wire
		// `queries.connection: slot.connectionOf('semantic.arm.embed')` — a
		// config key on an existing node, no new node. contracts/src and
		// core-catalog/src copied with only F1's edits reverted hash to
		// '738060d6a01c90d9', and with them to this pin: F1 is exactly
		// '738060d6a01c90d9' → 'e2b6164acdf06fc2'.
		// Moved 2026-09-30 (plan A27 P5, the "fall back" default): Lair respond's
		// knock reads the planner's location hint onto its block
		// (`door.knock.vantage` and its preset path), and the room answer's
		// `here` falls back to it (`fallbackName` from `answer.vantage`).
		// Proven: a copy of core-catalog/src with only those lair.ts and
		// lairActions.ts edits reverted hashes back to 'e2b6164acdf06fc2'.
		// Moved 2026-09-30 (plan A28, genres lane): the Guide reads its
		// lorebook (`gather.worldLore`, pooled into `lore`; the template places
		// it), Whodunit's Answer reads the answering suspect's own private
		// lore, the Lair's room drafts read the rooms listing and read the book
		// as the Castellan, Adventure's respond lists its places
		// (`gather.rooms`, `locationEntries` on the planner, scene and voices),
		// and five prompt rows say so. Proven: a copy of core-catalog/src with
		// only those five files' edits reverted (guide.ts, whodunitActions.ts,
		// lairActions.ts, adventure.ts, prompts.ts) hashes back to
		// '16bcfe24b2a75317'.
		// Moved 2026-09-30 (plan A28 review, genres fix-up): Whodunit's Answer
		// carries the pressed option's reference into the side-character fact
		// (`{ name, ref }`), and the Lair's Answer the door and File as a room
		// read world lore and history lanes in place of lorebook-triggers.
		// Proven: a copy of core-catalog/src with only those two files' edits
		// reverted (whodunitActions.ts, lairActions.ts) hashes back to
		// '226e55f04d5c6bc9'.
		// Moved 2026-09-30 (config grouping, catalog lane): every model call of a
		// multi-call spec carries `expose.label` and `expose.purpose`, steps whose
		// headings repeated within one group carry an `expose.label`, and the
		// "Adventure look" prompt row claims `adventure-look`. Proven: a copy of
		// core-catalog/src with only this lane's edits reverted (adventure.ts,
		// adventureActions.ts, whodunit.ts, whodunitActions.ts, writingRoom.ts,
		// writingRoomActions.ts, summarize.ts, graphBuild.ts, toolLoop.ts,
		// respond.ts, narrate.ts, narrateCharacter.ts, lair.ts, lairActions.ts,
		// prompts.ts) hashes back to 'e96661d516b98d2c'.
		// Moved 2026-09-30 (Lair party speech, owner ruling: no lead delver):
		// lair-respond's `pick` → `door` → `speech` shape, the Lair genre's
		// `partySpeech` field (lair-create carries the shape), the
		// "Lair Castellan speaks for the party" prompt row, and
		// `build-scene-context@1`'s `partySpeakers` in-port. Proven: a copy of
		// sdk, contracts and core-catalog sources with only this lane's edits
		// reverted (lair.ts, genres.ts, prompts.ts, contracts/src/index.ts)
		// hashes back to 'be3332b6a160c022'.
		// Moved 2026-09-30 (Whodunit and Writing Room to showcase plugins,
		// owner ruling): their two genres, 21 specs, 17 prompt rows and two
		// presets leave core's announcement — removal only. Proven: the
		// pre-move core-catalog/src hashes to '84ba48697b47ed1a'; the moved
		// tree with the Lair lane's two specs (lair-respond, lair-turn-order)
		// put back as they stood hashes to '30da74d6ecbe1e0a', and every other
		// entry is unchanged. (was '84ba48697b47ed1a')
		// Moved 2026-09-30 (Lair character turns, owner ruling: "they are
		// character turns, not first delver, later delver"): lair-respond,
		// lair-create and lair-turn-order — see their pins in lair.test.ts.
		// Proven: a copy of core-catalog/src with only this lane's edits
		// reverted (lair.ts, turnOrder.ts, genres.ts) hashes to
		// '30da74d6ecbe1e0a', and every Lair spec pin comes back with it. The
		// rest of the move, '84ba48697b47ed1a' → '30da74d6ecbe1e0a', is NOT
		// this lane's: measured with other lanes' in-flight core-catalog edits
		// already in the tree — the Whodunit and Writing Room move to showcase
		// plugins among them — for those lanes to prove against this chain.
		// (was '84ba48697b47ed1a')
		// Moved 2026-10-01 (owner ruling: the post-history reminder's trigger
		// ships at 0.5.3's 3000 in the genre): respond, guide-respond,
		// adventure-respond and lair-respond set `postHistoryTokenTrigger` on
		// their default preset's assemble steps. Proven: the built core-catalog
		// with only those preset values stripped hashes back to the old pin.
		// (was 'a3818c34d7fa03b4')
		// Moved 2026-10-01 (post-history trigger): respond's default preset is
		// `default` / "Default", and narrate-character, adventure-look, lair-trap
		// and lair-reveal ship the 3000 trigger on a default preset.
		// Proven: a copy of core-catalog/src with only this change reverted
		// hashes back to the old pin. (was '576ae15d245ef27c')
		// Moved 2026-10-01 (owner: the Guide's envoy is Serene): her name, face,
		// manner and declared greeting in genres.ts, and create-guide 1.1.0 writing
		// that greeting. Proven: a copy of core-catalog/src with only guide.ts and
		// genres.ts reverted hashes back to the old pin. (was '4b1e7c1fa9bccafb')
		// Moved 2026-10-02 (owner ruling: whoever writes a delver's line keeps
		// that delver's stats): lair-respond — see its pin in lair.test.ts.
		// Proven: a copy of core-catalog/src with only that lair.ts edit
		// reverted hashes back to the old pin. (was '831c0be7f7661697')
		// Moved 2026-10-02 (owner note 35: Echo deleted): `core:spec/echo` is
		// gone from the pipelines. Proven: the current document with HEAD's
		// compiled echo spec re-inserted before `set-annex-field` hashes back to
		// the old pin. (was 'de302582b8bd4c9c')
		// Moved 2026-10-02 (owner ruling AN1: the author's note, Chat only):
		// Chat declares the `authorsNote` field (create-chat inlines it),
		// respond's `context` step wires `fields: $.input.fields`, and
		// Adventure, Guide and the Lair omit the new `authors-note` widget.
		// Measured with other lanes' in-flight core-catalog edits in the
		// tree, not proven in isolation. (was '8ff90757ee9d17dc')
		// Moved 2026-10-02 (lorebooks Wave 8): `core:task/eligibility@1` and
		// `core:query/cast-presences@1` declared (C2/R4), a `speaker` in-port
		// on vector-search / entity-search / entity-link (C3), entity-search's
		// and mention-spans' caps on by default (R5 / A23(b)), rank-hybrid's
		// `shownElsewhere` in-port (the room rule), and every core spec that
		// ranks rewired: an `eligible` step before each ranker, Adventure's
		// and the Lair's arms, the room rule's `place` step. Measured with
		// other lanes' in-flight core-catalog edits in the tree (the
		// attachments lane's among them), not proven in isolation.
		// (was '8286666b6a6dafa5')
		// Moved 2026-10-02 (composer attachments phase 4, PLAN §3.5): respond,
		// guide-respond, adventure-respond (narrator and voices), narrate,
		// narrate-character and lair-respond (each voice) read
		// `core:query/history-attachments@1` and place each line's files with
		// `core:task/place-attachments@1` before the prompt. Measured with other
		// lanes' in-flight core-catalog edits in the tree, not proven in
		// isolation. (was '0d5224c2cec22dc6')
		// Moved 2026-10-03 (owner note 39): the port `thinking` -> `reasoning`
		// on generate-text (out) / update-message (in), and every core save
		// rewired to its oracle's `reasoning`. Measured with other lanes'
		// in-flight core-catalog edits in the tree. (was '9618918e548f1445')
		// Moved 2026-10-03 (owner ruling: Look onto the scene builder):
		// adventure-look's `context` is `build-scene-context@1` with the
		// `gather.rooms` listing and the room rule's `place` step, its preset
		// ships their values, and the "Adventure look" prompt row moved to the
		// scene pool (place paragraph and `narratorName` added). Proven: a copy
		// of core-catalog/src with only this lane's edits reverted
		// (adventureActions.ts, prompts.ts) hashes to 'a23aaeb3730bfdd2'; the
		// move from '39d1843db69b2389' to that is other lanes' in-flight edits,
		// not this one's. Note 44's default swap (`defaultForSpecs`) is not in
		// the announcement. (was '39d1843db69b2389')
		// Part of that rest (owner ruling 2026-10-03, author's note lane):
		// Chat ships a default layout (`CHAT_LAYOUT`, the Author's note
		// unpinned in the right rail). Proven: this document with Chat's
		// `layouts` key deleted hashes to '131c93dcb85f970d'.
		// Moved 2026-10-03 (attachments follow-ups, owner ruling): the action
		// specs (answer forms, tool loop, Adventure Look/Rest/Advance time/Ask,
		// Lair Build room/room answer/File room/Trap/Reveal) read and place the
		// transcript's files; summarize wires `attachments` into `batches`;
		// guide's and the answer form's templates render `{{{attachments}}}`;
		// the tool loop's renders the conversation. Measured with other lanes'
		// in-flight core-catalog edits in the tree (lair-respond's pin also
		// moved, not this lane's), not proven in isolation. (was '3a1f2c6f91880298')
		// Moved 2026-10-05 (sprites in-pipeline, owner rulings D-a/D-b/D-c):
		// `withSpriteTail` retired — seven reply specs write `spritePick`
		// (`core:oracle/pick-sprite@1`, handed the reply's text) and
		// `spriteShow` after `save`; `show-sprite` takes `source` (`'person'`
		// in `core:spec/show-sprite`); `sprites-for` and
		// `pick-sprite-similarity` removed; `embed-text` declares no
		// `connection` slot, so the five `semantic.arm.queries` wire their own
		// embedding slot (`slot.connection()`). Measured on a tree whose only
		// other change was CI config, so the move is exactly this lane's.
		// (was 'dcb14e231bc6c551')
		// Moved 2026-10-05 (catalogue rulings C3/C4): ten spec ids renamed
		// genre first (`respond` → `chat-respond`, `answer-form-<genre>` →
		// `<genre>-answer-form`, …), so every binding and prompt naming them
		// moved with them; turn order ×4 and summarize ×4 claim
		// `role: 'maintenance'`; `set-annex-field` has no inlet lock; the
		// tool-loop reference and its prompt row left the catalogue. Proven:
		// this document with the ids mapped back, the roles and the lock
		// restored, and `toolLoopSpec()` and `TOOL_LOOP_PROMPT` put back in
		// place hashes to the old pin. (was 'e559d5d35cad1828')
		assert.equal(digest.slice(0, 16), '1e5447939e19d8b5')
	})
})
