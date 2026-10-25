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
	chatGenre,
	storyGenre,
	CORE_HOOK_DECLARATIONS,
	SHOW_SPRITE_SPEC_ID,
	SPRITE_PICKER_NODE_KEY,
	TOOL_LOOP_SPEC_ID,
	toolLoopSpec,
} from '@serene-pub/core-catalog'
import {
	effectiveRegistrations,
	presetChangesOf,
	sessionEvents,
	type RegistrationDecl,
} from '@serene-pub/sdk'

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
			// 🚧 Chat, the plain assistant (2026-10-19): the id kept, the meaning new.
			'core:genre/chat',
			// 🚧 PLAN-dungeon-crawler-2026-10-14, published with its create spec (2026-10-15).
			'core:genre/dungeon-crawler',
			// The guide (R-18, U5g): the pure user/assistant session type.
			'core:genre/guide',
			'core:genre/lair',
			// 🚧 Story (2026-10-19): the roleplay Chat and Adventure, folded.
			'core:genre/story',
		])
		assert.equal(document.pipelines.length, CORE_SPECS.length)
		// Core references nothing it does not ship.
		assert.deepEqual(document.requires, [])
	})

	test('exactly one create pipeline serves each genre, and one respond serves its turn', () => {
		const { document } = coreAnnouncement()
		// 🚧 By registration (PLAN-layering D4, 2026-10-20): a pipeline names
		// no genre — the genre's defaults say which pipeline answers what.
		const registered = (genre: string) =>
			((document.genres.find((g) => g.id === genre)?.defaults?.registrations ?? []) as unknown as RegistrationDecl[])
		const serving = (genre: string, event: string) =>
			registered(genre)
				.filter((r) => r.trigger.family === 'event' && r.trigger.event === event)
				.map((r) => r.pipeline)

		// The genre owns its id; the create pipeline is its required MEMBER, so
		// "exactly one" is the claim that matters — two would make creation
		// ambiguous for every session of that genre.
		assert.deepEqual(serving(storyGenre.id, sessionEvents.sessionCreated), [
			'core:spec/story-create',
		])
		assert.deepEqual(serving(storyGenre.id, sessionEvents.messageRespond), ['core:spec/story-respond'])
		// 🚧 Chat, the assistant (2026-10-19): fresh spec ids, never the roleplay's (§2-7 a).
		assert.deepEqual(serving(chatGenre.id, sessionEvents.sessionCreated), ['core:spec/assistant-create'])
		assert.deepEqual(serving(chatGenre.id, sessionEvents.messageRespond), ['core:spec/assistant-respond'])
		// Actions take any number. Story's nine (2026-10-19): the roleplay
		// Chat's narrate, side character, image, Scene and Time passes, and
		// Adventure's look, rest, ask and answer — each an action registration.
		// 🚧 R50 (2026-10-21): plus the four summaries, each on its own
		// unlisted `summarize-*` action — 13 action registrations, 9 a person presses.
		const storyActions = registered(storyGenre.id).filter((r) => r.trigger.family === 'action')
		assert.equal(storyActions.length, 13)
		assert.equal(storyActions.filter((r) => !/#summarize-(world|character|scene|history)$/.test((r.trigger as { action: string }).action)).length, 9)
		// The answer pipeline (R-15 *Forms*): one per shipped genre, on the
		// optional `form-addressed` event, in every preset's effective set.
		for (const [g, spec0] of [
			[storyGenre, 'core:spec/story-answer-form'],
			[chatGenre, 'core:spec/assistant-answer-form'],
		] as const) {
			const [spec, ...rest] = serving(g.id, sessionEvents.formAddressed)
			assert.equal(rest.length, 0)
			assert.equal(spec, spec0, g.id)
			for (const preset of document.presets.filter((p) => p.genre === g.id))
				assert.ok(
					effectiveRegistrations(registered(g.id), presetChangesOf(preset, registered(g.id))).some(
						(r) => r.trigger.family === 'event' && r.trigger.event === sessionEvents.formAddressed && r.pipeline === spec,
					),
					preset.slug,
				)
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
		// 🚧 The Lair's character turn (rewrite, 2026-10-21): a run whose subject is a delver.
		const LAIR_TURN = 'via.turn.channel.story.pick.picked.'
		// Where each spec places it: on the spine, or in the Lair's character
		// turn — the one branch where a single delver speaks.
		const placed: Record<string, string> = {
			// 🚧 RF fix 3 (2026-10-23): on the spine again, once, after the `reply`
			// junction — never a copy in each of its branches (D7 had one per branch).
			'core:spec/story-respond': '',
			'core:spec/tool-loop': '',
			'core:spec/story-side-character': '',
			'core:spec/guide-respond': '',
			'core:spec/story-narrate': '',
			'core:spec/lair-reply': LAIR_TURN,
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
			assert.equal(into(pick, 'speaker').length, slug === 'core:spec/story-narrate' ? 0 : 1, slug)
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
//
// 2026-10-15 → f0de3a0007234f8e: 🚧 Dungeon Crawler published (the create
// lane) — the genre in `genres`, its six specs, its preset, its five prompt
// rows and the world annex field's `shape` · `goalMode` · `heroes`.
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
		// seeded (STORY_WORLD_LAYOUT, LAIR_LAYOUT, WRITING_ROOM_LAYOUT,
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
		// Chat ships a default layout (`STORY_LAYOUT`, the Author's note
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
		// Moved 2026-10-11 (PLAN-core-widgets §4, the core widgets' default
		// layouts): Adventure's left rail places Chronicle and Lore entries,
		// its strip is `stats#world` (World State is Stats for the world, W7)
		// and Scene Portraits names `who`/`face`/`arrangement` (W6); the
		// Lair's right column is Places, the Castellan's scratchpad (an Annex
		// copy) and the Sanctum. Proven: this document with only Adventure's
		// and the Lair's two layouts put back as they were hashes to the old
		// pin. (was 'bf867f9d8a4a7f9a', a value that included the card strokes
		// S3 move; strokes were paused 2026-10-11 and taken back out of every
		// core spec, so the pre-widgets value is the pre-strokes '1e5447939e19d8b5'.)
		// Moved 2026-10-11 (card strokes paused, owner): the `cardStrokes` step
		// taken back out of every core spec and each semver restored, on top of
		// the widgets move above. Measured from source (core-catalog `src`, not
		// dist), with other lanes' in-flight edits in the tree. (was '433c1df16b0190a3')
		// Moved 2026-10-11 (widget DX, PLAN-widget-api-dx D7): measured from
		// source with the same-day core-widgets work still in flight in the tree.
		// D7's own catalog edit (five widgets' `reads` narrowed) does not move
		// the document — the lane re-measured with those reverted and got this
		// same value — so the move is the in-flight registry work, not proven
		// key by key. (was 'ad7f5fb3f90c5b7a')
		// Moved 2026-10-12 (I12 loadouts): every model-calling oracle gains
		// the additive `loadout` slot, the reply/summary/keeper/image specs'
		// Default configs name their loadouts. Measured with other lanes'
		// in-flight edits in the tree. (was '056b27a677887bca')
		// Moved 2026-10-12 (I7a ComfyUI): the image oracle gains the optional
		// `workflow` slot and `chat-generate-image` wires `slot.workflow()`.
		// Measured with other lanes' in-flight edits in the tree (a `seed`
		// param on the image oracle among them). (was '398ac8b3b1a4c61a')
		// Moved 2026-10-12 (I8 Portrait): `core:spec/character-portrait`
		// joins the catalogue with its two prompt rows (*Portrait, tags* /
		// *Portrait, prose*), the card action inlet gains an optional `count`
		// port (so `sprite-set-fill`'s inlet hash moves too). Measured with
		// other lanes' in-flight edits in the tree; re-measured after the task
		// was named `build-proofs` (R1: *candidate* is retrieval's).
		// (was '4ae849d62002771d')
		// Moved 2026-10-12 (I9 the Scene action): `core:spec/story-illustrate-scene`
		// joins the catalogue with its two scene prompt rows (*Scene prompt
		// 2026-10-12 sweep: Portrait + Sprite set fill name their loadouts; Scene calls carry purposes.
		// from the last lines* / *Scene prompt, prose*), the *Prompt as
		// written* image row also claims it, and three node types are new
		// (`likeness-images`, `clean-image-prompt`, `picture-placement`).
		// Measured with other lanes' in-flight edits in the tree.
		// (was 'bdd4bf494aa1da37')
		// Moved 2026-10-12 (D1 Describe from image): `core:spec/describe-likeness`
		// joins the catalogue with its prompt row (*Describe a likeness*) and a
		// new node type (`core:oracle/describe-image@1`). Measured with other
		// lanes' in-flight edits in the tree (D3's Adventure Scene spec among
		// them). (was '0e95c72e084ffa50')
		// Moved 2026-10-12 (owner ruling: no SillyTavern-copied prompts in the
		// Apache catalog): the twelve alternative reply rows, the two scene
		// prompt rows and *Describe a likeness* carry Serene Pub's own prose
		// and new names under their seed keys. (was '246612caeb56ce1a')
		// Moved 2026-10-13 (live scenes lane A, the genre-owned summarize-scene):
		// four specs (`core:spec/{chat,adventure,guide,lair}-summarize-scene`),
		// two drafting prompt rows (`summarize-scene-transcript`,
		// `lair-summarize-scene`) and each core genre's `summarize`. Proven: this
		// document with those stripped hashes to '6453ce65503a0c9e'; the rest of
		// the move from the old pin is other lanes' in-flight edits in the tree,
		// not this one's — among them the reply prompts cut to four the same day
		// (owner ruling 2026-10-13: ten rows leave, *Writer* merges two,
		// *Roleplay - Brief* joins). (was '5e2d0c2f61a886d1')
		// Moved 2026-10-13 (live scenes reconcile R): `render-transcript@1`
		// takes an `attachments` in-port and its template an `attachments`
		// variable; the four genre summarize-scene specs read the story rows'
		// files and their transcript templates name them after each line.
		// Measured with other lanes' in-flight edits in the tree.
		// (was '09ed8aa6556b283d')
		// Moved 2026-10-13 (live scenes lane D): `core:spec/story-advance-time`
		// and `core:spec/lair-advance-time` (*Time passes…*) join the
		// catalogue; Adventure's *Time passes* collects the clock step and
		// moves the clock after its keeper; Chat's reply gains the reply tick
		// (`tick` + `clock`); `core:task/clock-step@1` is new and the
		// user-message inlet publishes `clockStep`. Measured with other lanes'
		// in-flight edits in the tree. (was '9aa24fd9a318433d')
		// Moved 2026-10-13 (live scenes lane F, ★3 — the keeper's clock
		// proposal): `STORY_KEEPER_SCHEMA` gains the `clock` list; the
		// Adventure keeper, Rest and Time passes prompt rows hold three
		// lists; `resolve-state-changes@1` takes and publishes `clock`;
		// `adventure-respond` and `adventure-rest` gain `keeperStep` and the
		// trusted arm's *Advance story clock*. Measured with other lanes'
		// in-flight edits in the tree. (was '6e8b025dd432a91b')
		// Moved 2026-10-13 (live scenes lane E): every genre's
		// summarize-scene reads its aside rows' files (`asideAttachments`, a
		// second history-attachments@1) and its transcript's `aside` section
		// names them; `render-transcript@1` gains the `asideAttachments` port
		// and its scope says `attachments` in `aside` too. Measured with other
		// lanes' in-flight edits in the tree. (was 'fad55242d83c4d2e')
		// Moved 2026-10-13 (live scenes lane F, after lane E): Adventure's
		// `keeperStep` wires `unless: input.messageId`, so a re-driven reply
		// never moves the clock twice under Trust the narrator. Measured
		// with other lanes' in-flight edits in the tree. (was 'dda557977b636127')
		// Moved 2026-10-13 (measured during the live scenes fix-ups): NOT the
		// fix-ups' aside label — the document hashes to this value with that
		// label stripped too — but other lanes' in-flight edits in the tree.
		// (was 'bb89315ed694e3f9')
		// Moved 2026-10-13 (live scenes §15 G1–G2): Adventure's and the Lair's
		// shapes name their place, and the Lair's summarize-scene carries its
		// boundary trigger. Measured with other lanes' in-flight edits in the
		// tree (lair-advance-time moved under another lane). (was 'cfe2bcaafa2d02ef')
		// That measurement already held live scenes §15 G4–G7 (lane H): every
		// core *Advance story clock* says its `cause` (Adventure's also
		// `onRefusal: 'skip'`), Adventure's `keeperStep` re-drive rule is the
		// extend's prefill, the Time passes keeper context takes `clockStep`,
		// and the *Adventure clock* prompt row reads `{{clockStep}}`.
		// Moved 2026-10-13 (live scenes §15 G12): Chat's reply tick and
		// Chat's / the Lair's *Time passes…* say `onRefusal: 'skip'` (every
		// core clock move now skips a story with no clock). Measured with
		// other lanes' in-flight edits in the tree. (was '6126a10744301919')
		// Moved 2026-10-14 (PLAN-session-panels lane 0): Chat's, Adventure's
		// and the Lair's layouts are written in `panels` only. Proven: with
		// the three presets swapped back for their old-slot literals
		// (`fixtures/core-layouts-old-slots.ts`), the document hashes back to
		// the old pin. (was 'fdf6db9e0c86f24b')
		// Moved 2026-10-15 (Dungeon Crawler's story turn): the respond spec's
		// story branch (Planner → dice → books → Narrator), Rest and the goal
		// action, three prompt rows, the `fate` slot and the world's `rounds`
		// shape. Measured with the multiplayer lane's in-flight edits (rounds,
		// secrets, reveal) in the tree. (was 'f0de3a0007234f8e')
		// Moved 2026-10-15 (DC walkthrough fixes): Dungeon Crawler's layout puts
		// the Planner, Story and Planning notes as tabs of the middle, the
		// Planner first, and the Planner copy drops `composer: minimal`.
		// Proven: with the old layout swapped back the document hashes to
		// '70ea216b576a9757' — the rest is the DC lanes' in-flight genre edits
		// in the tree. (was '3db0d688dfa706ec')
		// Moved 2026-10-15 (DC UX findings): Reveal the planning notes is a
		// quick action, the Planner's greeting says "I'm the {{char}}", the
		// round's books prompt asks for a location change on a move, and the
		// specs hand their scripts the state. Measured with other lanes'
		// in-flight edits in the tree. (was '22f8d3b2ef025d6f')
		// Moved 2026-10-15 (DC round 2): the choice slots label their options,
		// the sheet asks no health (full is the slot's ceiling), the Planner's
		// greeting no longer repeats the first question, Rest is the owner's
		// and writes a journal line, the reveal shows the goal, the layout
		// titles Story and Goal & leads. Measured with other lanes' in-flight
		// edits in the tree. (was '92da7deee881cb6c')
		// Moved 2026-10-15 (formats belong to widgets): Messages and Stats
		// gain `emptyState` and `timeFormat` settings, and the DC layout pins
		// them. Measured with other lanes' in-flight edits in the tree.
		// (was 'd0743f9eb61f2b7e')
		// Moved 2026-10-15 (per-character max HP, `set-stat-config@1`): the DC
		// sheet asks `maxHp` and configures the seat's hp max before its stats,
		// the story turn raises it on a level (`raise.levels.*`), the turn
		// prompt bounds health by the character's own max, and the scripts
		// read it off `state.configs`. Measured with other lanes' in-flight
		// edits in the tree. (was 'f029c80c18245996')
		// Moved 2026-10-15 (DC "processing" feedback): the reply declares a
		// status from its first step (the story read: the Planner is
		// thinking), the story turn's books, dice and ledger say theirs, every
		// DC model call's context/transcript/prompt steps say the call's own,
		// and the Planner lane and genesis say "The Planner is thinking" /
		// "Building the world". Proven: with those reverted the document
		// hashes to the old pin. (was 'f7004767b8ea05c9')
		// Moved 2026-10-15 (a person's message is saved through the pipeline):
		// `core:spec/save-message` is published, `create-message@1` gains
		// `role` and `trayItems`, the `message-offered` inlet and event exist,
		// and every preset binds the save on `message-offered`. Measured with
		// other lanes' in-flight edits in the tree. (was 'd07dc821b82e4d8a')
		// Moved 2026-10-15 (composer states, `set-composer-state@1`): Dungeon
		// Crawler closes a person's Story when their Planner lane opens
		// (`…lane.item.addressee` · `closeStory`) and the applied sheet opens
		// it (`route.sheet.after.story.open`). Measured with other lanes'
		// in-flight edits in the tree. (was 'e3d1faf83c2347b5')
		// Moved 2026-10-16 (Dungeon Crawler wire fixes): the class offer, the
		// sheet, the world, the opening and a new goal are laid out by
		// `DUNGEON_CRAWLER_BRIEF_TEMPLATE` (their brief the last user turn), the
		// interview's acknowledgements are table lines (`route.noted`), and a
		// Planner change's gate takes `always`. Measured with other lanes'
		// in-flight edits in the tree. (was '6f5d6990f579b24a')
		// Moved 2026-10-16 (Honour mode widened): the Dungeon Crawler
		// `honorMode` field's description adds "…and lets players edit their
		// own sheets by hand." Measured with other lanes' in-flight edits in
		// the tree. (was '29834564e2dcc564')
		// Moved 2026-10-16 (🚧 table channel, PLAN-rulesets §30): Dungeon
		// Crawler declares `table` (folio, voice none, Dice); its roll and rest
		// lines are written there, anchored; the Narrator's outcomes are a
		// post-history `{{outcomes}}` field; Messages gains `interleave` and
		// the DC layout pins it on Story. Measured from source with other
		// lanes' in-flight edits in the tree (the rulesets lanes'). (was 'ea87fd60030e72c7')
		// Moved 2026-10-17 (wave-3 join): Dungeon Crawler `writes.lore: true`
		// (its world is the session's notes) and its sheet carries the Vis Itineris
		// ruleset fields (`core:slot/crawl-*@1`); `core:task/ruleset-resolve@1`
		// is no longer provisional. Measured from source: with the writes and
		// slots edits reverted the tree hashes '3b4c6ba6c5a36f1f', not the old
		// pin — W3-B's in-flight edits (the `dungeon-crawler-progress` annex
		// key, …) had already moved it unrecorded. (was 'f341972415739892')
		// Moved 2026-10-17 (ruleset renamed to Vis Itineris, owner ruling): the
		// ruleset, primer, slot (`core:slot/itineris-*@1`), script
		// (`core:script/vis-itineris-*`) and entry-type ids the genres name, the
		// ruleset's description and voice, and one world-delta sentence in the
		// DC Planner round prompt. Measured from source with other lanes'
		// in-flight edits in the tree. (was '7a54239a2b6b767b')
		// Moved 2026-10-17 (DC walk 5, Stats on a ruleset's sheet): the Stats
		// widget's `owners` gains `mine` (the viewer's own seat) and a
		// `hideSlots` setting; a list stat that names a repertoire draws its
		// pieces as cards. The piece kit's compendium import was removed again
		// (§8: the host fills `resolved`), which does not move it. Measured from
		// source with other lanes' in-flight edits in the tree. (was '1a5285a827b93d5e')
		// Moved 2026-10-17 (rulesets W1, SDK contract): Vis Itineris's selectors
		// gain `ability.<a>` checks and lose the bare `attack` / `check` /
		// `damage` d20s (the Dungeon Crawler Planner's check enum), its stats gain
		// `itineris-spell-points`, and its conditions gain Envenomed (the
		// Planner's condition names). Measured from source — core-catalog mapped
		// to src, since the suite reads its stale dist until `sdk:build` — with
		// other lanes' in-flight edits in the tree (the DC genre lane's among
		// them), not proven in isolation. (was '4c3fbd636fae0451')
		// Moved 2026-10-18 (Dungeon Crawler reconcile, W3 + follow-ups): one
		// exit model (ways out inside `world.rooms[].exits[]`, no `exits`
		// repertoire or `exit` on a delta), no `deathsDoor` in the plan, the
		// Planner lane's edits call on every line (`standingOrder`, `asks`,
		// `deltas`, `rooms`) applied through the handler, `parley` a personal
		// lane opened by `core:query/channel-lane@1` (no annex lane map), the
		// round's annex clear gone, the Narrator's row opened before the
		// Planner, the welcome asking the one who played alone their standing
		// order when the table grows (`standing.asked.*`), the journal's six
		// row kinds written through `create-message@1`'s `kind`, and the DC
		// layout's Journal copy naming them (`rowKinds`). Measured from source
		// — core-catalog mapped to src, since the suite reads its stale dist
		// until `sdk:build` — with other lanes' in-flight edits in the tree,
		// not proven in isolation. (was '5fe73a0d3eec1bb4')
		// Moved 2026-10-18 (the Dungeon Crawler 100-turn walk, lane A): the
		// story turn's books round and the Narrator's outcomes as their last
		// user turn (the narrate template), the Planner's calls reading an
		// empty answer as unreadable, the turn's own owners part, the
		// interview's answers said back (`said.echo`) before the changes they
		// file, the sheet's summary first and its kit on the seat it names, a
		// new character's seat retiring the fallen's, End's epilogue on the
		// goal action, and the round, books, door, ledger, crib and edits
		// scripts' new rules (made seats, refusals in words, companions
		// narrative only). Measured with the SDK built from this tree; other
		// lanes' in-flight edits in the tree, not proven in isolation.
		// (was 'ceb2d6681d9f0cd2')
		// Moved 2026-10-18 (the Dungeon Crawler 100-turn walk, lane B — P2-1…P2-6):
		// Vis Itineris's repertoires execute what a piece does (`rollWith`,
		// `harm`, `heal`, `cure`, `consume`; the riders that only said so gone),
		// armour class and the spell-point maximum are `onSheet` derived
		// selectors, the derive script reports `spell-points-max` at a points
		// table, the DC tracks the spell-point pool, a delta carries its
		// `aimedAt`, the books and the sheet are handed the turn's ruleset, and
		// the books prompt's ruleset-dependent sentences are variables
		// (`{{piecesLine}}`, `{{conditionsLine}}`, `{{castingLine}}`,
		// `{{effectsLine}}`). Measured with the SDK built from this tree; other
		// lanes' in-flight edits in the tree, not proven in isolation.
		// (was 'c9cc5e29ea6756ff'; '6502a1bd08a69dee' while a delta's member
		// was still called `target`, renamed `aimedAt` — R1: a mechanic's
		// `target` is a selector)
		// Moved 2026-10-18 (the Dungeon Crawler 100-turn walk, lane C — P4-1…P4-11):
		// the DC genre's characters `hint`, its layout's faces strip (`owners:
		// seats`), Dice tab and ticked Line kinds, the reveal's `confirm`, the
		// spell points' and crawl spell slots' `whenRulesetSetting`, the Stats
		// widget's `seats` owners and Messages' `rowKinds` as a ticked list.
		// Measured with the SDK built from this tree; other lanes' in-flight
		// edits in the tree, not proven in isolation. (was 'b18f063551d28ef0')
		// Moved 2026-10-19 (PLAN-dc-after-walk2, Q0–Q3): the DC story turn's
		// words branch and actor-inferred traverse, the genesis "story has
		// started" line, the lanes greeting of an ended adventure, death saves
		// on the sheet (fate `dying`, `crawl-death-saves`, `shownWhenSet`),
		// health's `words`, Scene Portraits' `playerSeats` / `metPeople` and the
		// DC layout pinning them, the `give-piece` and `load-older` requests.
		// Measured with the SDK built from this tree; other lanes' in-flight
		// edits in the tree, not proven in isolation. (was 'ec2b93ec0f79c872')
		// Moved 2026-10-19 (PLAN-dc-after-walk3, R0–R3): the DC genesis holds
		// the world's ways out as pieces and files the seat's configs at its
		// stats' row; a way out carries its trap's `trapDamage` and
		// `trapCondition` (Vis Itineris's trap its `condition`); the books
		// prompt's `wordsOnly` variant; _At zero health_ relabelled to what is
		// played; the kits' trained skills on the DC sheet; the DC layout's
		// Dice and Planner `timeFormat`, journal kinds without `time`, Scene
		// Portraits' new `barsFor` pinned to `seats`, the skills hidden on the
		// sheet. Measured with the SDK built from this tree; other lanes'
		// in-flight edits in the tree, not proven in isolation. (was 'cf2d55a6238180db')
		// Moved 2026-10-19 (PLAN-genre-restructure R4, lane 1): the Story genre
		// (the roleplay Chat's specs re-homed as `core:spec/story-*`, with the
		// background tasks after the reply — resolve-tasks, the reckoning, the
		// sweep), Adventure retired (its Look, Rest, Ask and Answer under
		// Story), Chat the plain assistant (`core:spec/assistant-*`), Story's
		// three presets and Chat's two, Freeform for the Story ruleset, the
		// genres' `about` / `members` / `uses` / `tasks`, the Guide's `tools`
		// field, the Story goals annex field. Measured with the SDK built from
		// this tree; other lanes' in-flight edits in the tree, not proven in
		// isolation. (was '50ba9f7630734070')
		// Moved 2026-10-19 (PLAN-genre-restructure lane 2): the background
		// tasks wired — story-respond's `tasks` at the head, the `retrieval`
		// junction and the *Read the scene* gate; the reckoning's Review
		// arms, item supply and new places; the sweep's relationships and
		// goal checklist; Chat's tasks, retrieval and memory call;
		// `core:task/turn-unprompted@1` in Story's turn order; the
		// `assistant-memory` prompt row, the Story reply rows' place line,
		// the `story-scene-reading` script; Minimal keeps *Read the
		// lorebook*; *Route whispers* and *Let the storyteller lead* retired.
		// Measured with the SDK built from this tree. (was '6e205f970be70807')
		// Moved 2026-10-20 (PLAN-layering lane 3): core's catalogue on
		// registrations — every genre states its defaults (registrations:
		// create, save, reply, answer form, turn order per event, every action
		// it offers, Story's and Chat's routines) and every preset is changes
		// on them (no bindings, no include lists; `default: true` on each
		// genre's default); every inlet `{ suits }`, no lock; `.defaults()`
		// for every author default preset and the non-default ones gone;
		// Story's reckoning, sweep and new-scene picture and Chat's memory as
		// routine pipelines out of the replies; the replies' `reading` duty
		// and Chat's optional lore lane; the turn order's voices read Story's
		// two new fields; Rest's commit on *Apply a press's changes*; the
		// task machinery retired (genres' `tasks`, the `tasks` field); the
		// shared vocabulary and both core rulesets playing it, with its five
		// new slots. Measured with the SDK built from this tree. (was '6ce14eecafa63328')
		// Moved again 2026-10-21 (lane 8, omni O5/O7/O9/O12): the reply specs'
		// `heard` transcribe step, `generate`'s speech sampling, `save`'s
		// parts; every `generate-text` node naming its speech sampling; the
		// Transcription and Spoken reply loadouts. (was 'a6a23b7d931d5b70')
		// Moved again 2026-10-21 (layering repair 1): the five reply specs'
		// `heard` step declares no status — a declared one shows on every
		// run; the step says *listening* only when it hears.
		// (was 'db56193c51fdb753')
		// Moved again 2026-10-21 (lane F1, R50–R59): every summarize pipeline
		// declares its unlisted `summarize-*` action and every core genre
		// registers its summaries; Story lost `applyActionChanges` (Rest's
		// commit reads the reckoning's mode, `routineModes`); Story's reply
		// offers its prompt choice to the owner (`expose.promptReach`); the
		// turn-ended / round-ended descriptions say lanes, turns by speaker
		// and active speakers. (was '043ba095927b65a8')
		// Moved again 2026-10-21 (Lair rewrite, lane L3): the Lair's genre (the
		// shared vocabulary, the Oracle, the Sanctum's owner audience, its six
		// fields, two layouts), its eighteen specs (`lair-reply` for
		// `lair-respond`, the welcome, three routines, Roll and its answer; Time
		// passes gone), its three presets, its scripts and prompts; Story's
		// reckoning graph built through the shared `reckoningRoutineSpec`
		// (Story's document unchanged). (was '6d1e87b49dceaa32')
		// Moved again 2026-10-21 (Lair rewrite, lane L4): the scratchpad
		// routine's `where` adds `liveRow: true` — the Castellan's Sanctum
		// replies wake it, never a row written whole there (its greeting, a
		// plan row); and `lair-file-current-room`'s two saves are headed
		// apart (two steps of one group never share a heading).
		// (was '70eb71ec58a0ff0c')
		// Moved again 2026-10-21 (Lair rewrite, lane L5): the Lair's party
		// layout is the genre's guests' layout (`forGuests`, described) and
		// carries the Party panel — Turn order and Who's here, titled Party.
		// (was 'a519fa787f4e91c9')
		// Moved again 2026-10-21 (L5, after the walk): the Lair scripts find a
		// check and a difficulty named as the table lists them ("Strength
		// (ability.strength)", "Hard (20)"), and Auto roll's description says
		// "the rules'". (was 'a77d63b5a99ac57e')
		// Moved again 2026-10-22 (lair fix 2): the Castellan's role boundary
		// first and its post-history reminder, the greeting's Narrate line, the
		// Sanctum's reminder at no token trigger, the voice's `currentCharacterId`
		// and reminder, the planner's speakers rule and `lair-turn`'s fallback
		// (the plan as the turn plays it, `played`), the Lair's `main` labelled
		// Story, the Sanctum a tab of the story (LAIR_LAYOUT), and the messages
		// widget's `otherTabsComposer`. Measured with other sessions' in-flight
		// core-catalog edits in the tree, not proven in isolation.
		// (was '25a3d2fe192f392b')
		// Re-pinned 2026-10-22 (rulesets M2): the Lair's *Show dice* field
		// reads *Show outcomes* (id kept), `lair-dice` posts the handler's
		// outcome block for any check method, `lair-call-roll` says why a
		// table with no difficulty to pick has no roll to call. Measured with
		// the tree as it stands. (was 'f1367dad97ae28b3')
		// Moved 2026-10-22 (rulesets M3): Story recommends Wherewithal, core's
		// diceless ruleset; the Lair's *Rules and dice* preset reads *The rules
		// decide* (its description names the d20; slug and seed key kept); Auto
		// roll's description says "When the rules decide". No ruleset document
		// rides the announcement, so Vis Itineris's own move (its check method,
		// tags, amounts — visItineris.test) is not in it. Proven: the
		// announcement with exactly those four strings put back hashes to the
		// old pin. (was '18e1c8f63d93595e')
		// Moved 2026-10-23 (rulesets as functions, merge M1): Story's reply carries the
		// *Replies carry changes* branch and its `reply-changes` mode (respond 1.21.0, in
		// place; lane A2); `reply-duties` gains the `changes` duty and `ruleset-resolve`
		// the `replySchema` out-port (A2), its `event` in-port and `emits` parameter (M1);
		// `core:spec/rules-action` (with `core:inlet/rules-action@1`) joins CORE_SPECS.
		// Measured with the tree as it stands, after every index line. (was '74fdf161d9f4e506')
		// Moved 2026-10-23 (core genres on the seams, merge GM): the genres' copy, `about`s and duty
		// titles (G0); Story's reckoning in the one change grammar, its reply's own mode and owners,
		// Rest beside the rules' own (G1); the Lair's rules row read at run time, *The rules decide*
		// without its Vis Itineris lock, the keeper's lift retired (G2, GM); the crawl on the session's
		// rules — its Planner's grammar, Rest and *After a rest* (G3); Story's *After a rest*, Rest at its
		// own mode, the four events functions raise declared, a check's words (GM). Measured with the
		// tree as it stands, after every index line. (was '9089ce00c0ef63d2')
		// Moved 2026-10-23 (rulesets as functions, repair 1): every `ruleset-resolve` step names its
		// params slot, so its `emits` switch is read (ten specs); Story's changes branch's `message`
		// names its params; the crawl's *After a rest* hands its cause on as the resolve's `event`.
		// (was '7476778a4731d764')
		// Moved 2026-10-23 (RF fix 2): the Lair's voice row says its person outright (speech first,
		// action third, never a narrator's "you") and its reminder whose turn it is; lair-reply places
		// that reminder from the first line (the voice's `prompt` trigger 0); the Lair genre — and the
		// shape lair-create carries — offers the lorebook, never requires it. Proven: with those five
		// values put back in the announcement, it hashes to the old pin. (was '7d742db13f95371d')
		// Moved 2026-10-23 (RF fix 3): Story's reply keeps only its calls inside the `reply` junction
		// and runs ONE tail after it (save, the commit's Apply, the sprite steps) at the top-level keys;
		// the junction hands its words on as `text` (a text-stream and a text agree on text). Recomputed
		// after the final build. (was '7eda3ba7ec59d8c4')
		// Moved 2026-10-23 (RF fix 5): the crawl's Honour mode field reads "Lets players edit their
		// own sheets by hand, and the host delete the latest turn where deleting is on. Off:
		// neither." (deletion needs a pipeline; no core genre registers one). The event, the inlet
		// and the outlet's `taken` port moved nothing here (measured before this one string).
		// Recomputed after the final build. (was 'fa69ee0fccc67348')
		// 🚧 Moved 2026-10-23 (RF fix 8: attributes are the rules'): Story, the Lair and the crawl declare
		// no slots, sheets or `customAttributes`; each genre's `uses` says what it plays best with by tag
		// (`attributes` / `entryTypes` / `zoneTypes`, each with its label and why); the crawl's Planner
		// grammar names health, level and class only where the rules keep them (the gist's `keeps`);
		// Story's sweep reads the world's own values. Measured with the tree as it stands, after the
		// final build. (was '6a8b9f7591e78af0')
		assert.equal(digest.slice(0, 16), '89d536b2365cf8a5')
	})
})
