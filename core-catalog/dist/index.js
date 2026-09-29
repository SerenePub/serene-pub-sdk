/**
 * @serene-pub/core-catalog — core's announcement (24 §9).
 *
 * The genres, pipelines and hook declarations Serene Pub ships, as a
 * publishable package: SP core boot-seeds from it (the app's
 * `src/lib/server/pipelines/specs/*` are thin re-exports of this package),
 * conformance consumes it as fixtures, and modders import it for typed
 * references — `import { respond, chatGenre } from "@serene-pub/core-catalog"`.
 *
 * Moving the documents here is what makes core the first consumer of the
 * announce path rather than a special case: one validator, one document
 * shape, one hash discipline for core and plugins alike. The remaining
 * shipped prompts and the default preset ride the announcement too (T6b);
 * the shipped default configs stay derived (declarations + default author
 * preset + ref defaults) — there is no hand-authored config data to carry.
 */
import { announcementOf, defineExtension, } from '@serene-pub/sdk';
import { CORE_PROMPTS } from './prompts.js';
import { corePresetInputs } from './presets.js';
import { adventureGenre, chatGenre, guideGenre } from './genres.js';
import { lairGenre } from './genres.js';
/* ── Writing Room (plans/genres §2; U2) ──────────────────────────────── */
import { writingRoomGenre } from './genres.js';
import { WRITING_ROOM_CREATE_SPEC_ID, WRITING_ROOM_RESPOND_SPEC_ID, writingRoomCreateSpec, writingRoomRespondSpec, } from './writingRoom.js';
import { WRITING_ROOM_ADD_TO_BIBLE_SPEC_ID, WRITING_ROOM_BRAINSTORM_SPEC_ID, WRITING_ROOM_CONTINUE_SPEC_ID, WRITING_ROOM_CRITIQUE_SPEC_ID, WRITING_ROOM_EXPAND_SPEC_ID, WRITING_ROOM_EXPORT_SPEC_ID, WRITING_ROOM_REWRITE_SPEC_ID, WRITING_ROOM_TIGHTEN_SPEC_ID, writingRoomAddToBibleSpec, writingRoomBrainstormSpec, writingRoomContinueSpec, writingRoomCritiqueSpec, writingRoomExpandSpec, writingRoomExportSpec, writingRoomRewriteSpec, writingRoomTightenSpec, } from './writingRoomActions.js';
import { CREATE_CHAT_SPEC_ID, createChatSpec } from './createChat.js';
import { CREATE_GUIDE_SPEC_ID, createGuideSpec, GUIDE_RESPOND_SPEC_ID, guideRespondSpec, } from './guide.js';
import { ADVENTURE_CREATE_SPEC_ID, ADVENTURE_RESPOND_SPEC_ID, adventureCreateSpec, adventureRespondSpec, } from './adventure.js';
import { ADVENTURE_ADVANCE_TIME_SPEC_ID, ADVENTURE_ANSWER_SPEC_ID, ADVENTURE_ASK_SPEC_ID, ADVENTURE_LOOK_SPEC_ID, ADVENTURE_REST_SPEC_ID, adventureAdvanceTimeSpec, adventureAnswerSpec, adventureAskSpec, adventureLookSpec, adventureRestSpec, } from './adventureActions.js';
import { ANSWER_FORM_ADVENTURE_SPEC_ID, ANSWER_FORM_CHAT_SPEC_ID, ANSWER_FORM_GUIDE_SPEC_ID, ANSWER_FORM_LAIR_SPEC_ID, ANSWER_FORM_WHODUNIT_SPEC_ID, ANSWER_FORM_WRITING_ROOM_SPEC_ID, answerFormAdventureSpec, answerFormChatSpec, answerFormGuideSpec, answerFormLairSpec, answerFormWhodunitSpec, answerFormWritingRoomSpec, } from './answerForm.js';
import { LAIR_CREATE_SPEC_ID, LAIR_RESPOND_SPEC_ID, lairCreateSpec, lairRespondSpec, } from './lair.js';
import { LAIR_BUILD_ROOM_SPEC_ID, LAIR_FILE_ROOM_SPEC_ID, LAIR_NUDGE_SPEC_ID, LAIR_REVEAL_SPEC_ID, LAIR_ROOM_ANSWER_SPEC_ID, LAIR_TRAP_SPEC_ID, LAIR_WHISPER_SPEC_ID, lairBuildRoomSpec, lairFileRoomSpec, lairNudgeSpec, lairRevealSpec, lairRoomAnswerSpec, lairTrapSpec, lairWhisperSpec, } from './lairActions.js';
/* ── Whodunit (plans/genres §4; U4) ──────────────────────────────────── */
import { whodunitGenre } from './genres.js';
import { WHODUNIT_CREATE_SPEC_ID, WHODUNIT_RESPOND_SPEC_ID, whodunitCreateSpec, whodunitRespondSpec, } from './whodunit.js';
import { WHODUNIT_ACCUSE_SPEC_ID, WHODUNIT_ANSWER_SPEC_ID, WHODUNIT_QUESTION_SPEC_ID, WHODUNIT_SEARCH_SPEC_ID, WHODUNIT_VERDICT_SPEC_ID, whodunitAccuseSpec, whodunitAnswerSpec, whodunitQuestionSpec, whodunitSearchSpec, whodunitVerdictSpec, } from './whodunitActions.js';
import { RESPOND_SPEC_ID, respondSpec } from './respond.js';
import { TURN_ORDER_BY_GENRE } from './turnOrder.js';
import { NARRATE_SPEC_ID, narrateSpec } from './narrate.js';
import { NARRATE_CHARACTER_SPEC_ID, narrateCharacterSpec } from './narrateCharacter.js';
import { ECHO_SPEC_ID, echoSpec } from './echo.js';
import { CORE_ANNEX_FIELDS, SET_ANNEX_FIELD_SPEC_ID, setAnnexFieldSpec } from './annexField.js';
import { BUILTIN_BRANCH_SPEC_ID, BUILTIN_DELETE_SPEC_ID, BUILTIN_EDIT_SPEC_ID, BUILTIN_HIDE_SPEC_ID, BUILTIN_SWIPE_SPEC_ID, builtinBranchSpec, builtinDeleteSpec, builtinEditSpec, builtinHideSpec, builtinSwipeSpec, } from './builtins.js';
import { TOOL_LOOP_SPEC_ID, toolLoopSpec } from './toolLoop.js';
import { SHOW_SPRITE_SPEC_ID, showSpriteSpec } from './sprites.js';
import { GENERATE_IMAGE_SPEC_ID, generateImageSpec } from './generateImage.js';
import { GRAPH_BUILD_SPEC_ID, graphBuildSpec } from './graphBuild.js';
import { SUMMARIZE_CHARACTER_SPEC_ID, SUMMARIZE_HISTORY_SPEC_ID, SUMMARIZE_SCENE_SPEC_ID, SUMMARIZE_WORLD_SPEC_ID, summarizeCharacterSpec, summarizeHistorySpec, summarizeSceneSpec, summarizeWorldSpec, } from './summarize.js';
export * from './genres.js';
/**
 * The attribute slots core's genres bring.
 *
 * ⚠ A load-bearing re-export, on the same terms as `./entries.js` below:
 * declaring a slot REGISTERS it, and nothing imports these by value. Without
 * the module being reached, the Adventure genre would name seven declarations
 * that this process has never heard of.
 */
/** Core's catalogue of stat shapes — declared before the slots that name them. */
export * from './statShapes.js';
export * from './slots.js';
/**
 * Core's entry types (Part 1). Declaring one **registers** it, which is the
 * fact-about-the-code route node types take — so this re-export is what puts
 * them in `allDefinitions()` for the boot sync.
 *
 * ⚠ That makes this module the one in the package with a load-bearing side
 * effect, and the package says `sideEffects: false`. `./dist/entries.js` is
 * listed as the exception in package.json, because nothing imports these by
 * value: without it a bundler is entitled to drop the module, and a dropped
 * declaration is three missing registry rows with nothing to report them.
 */
export * from './entries.js';
export * from './prompts.js';
export * from './presets.js';
export * from './createChat.js';
export * from './guide.js';
export * from './adventure.js';
export * from './adventureActions.js';
export * from './lair.js';
export * from './lairActions.js';
export * from './writingRoom.js';
export * from './writingRoomActions.js';
/* ── Whodunit (plans/genres §4; U4) ──────────────────────────────────── */
export * from './whodunit.js';
export * from './whodunitActions.js';
export * from './answerForm.js';
export * from './respond.js';
export * from './turnOrder.js';
export * from './narrate.js';
export * from './narrateCharacter.js';
export * from './echo.js';
export * from './annexField.js';
export * from './builtins.js';
export * from './sprites.js';
export * from './toolLoop.js';
export * from './generateImage.js';
export * from './graphBuild.js';
export * from './summarize.js';
export * from './ui/sessions/widgets.js';
export * from './ui/sessions/looks.js';
export * from './ui/sessions/layouts.js';
/**
 * The pipelines core ships — one registry rather than a list of builders
 * beside a map of display names (two collections that had to agree). `name`
 * is what a person calls the thing; a list showing `core:spec/respond` is a
 * list of identifiers, not of things.
 * @experimental
 */
export const CORE_SPECS = [
    // First, deliberately: the genre's create pipeline must exist before
    // anything that declares itself for the genre (24 §3).
    { slug: CREATE_CHAT_SPEC_ID, name: 'Create chat', build: createChatSpec },
    /**
     * The Adventure genre, in the same order and for the same reason: its
     * create pipeline exists before anything that declares itself for it.
     */
    {
        slug: ADVENTURE_CREATE_SPEC_ID,
        name: 'Create adventure',
        build: adventureCreateSpec,
    },
    {
        slug: ADVENTURE_RESPOND_SPEC_ID,
        name: 'Adventure turn',
        build: adventureRespondSpec,
    },
    { slug: ADVENTURE_LOOK_SPEC_ID, name: 'Look', build: adventureLookSpec },
    { slug: ADVENTURE_REST_SPEC_ID, name: 'Rest', build: adventureRestSpec },
    {
        slug: ADVENTURE_ADVANCE_TIME_SPEC_ID,
        name: 'Time passes',
        build: adventureAdvanceTimeSpec,
    },
    /** The worked form (R-15 *Forms*; U5d): the narrator asks, the cast answers. */
    { slug: ADVENTURE_ASK_SPEC_ID, name: 'Ask', build: adventureAskSpec },
    { slug: ADVENTURE_ANSWER_SPEC_ID, name: 'Answer', build: adventureAnswerSpec },
    /**
     * The Lair genre (plans/genres §3), create first for the reason above: the
     * genre's declaration rides `meta.genre` on the create spec's version row,
     * so nothing that declares itself for the genre can be published before the
     * genre exists.
     */
    { slug: LAIR_CREATE_SPEC_ID, name: 'Create lair', build: lairCreateSpec },
    { slug: LAIR_RESPOND_SPEC_ID, name: 'Lair turn', build: lairRespondSpec },
    { slug: LAIR_BUILD_ROOM_SPEC_ID, name: 'Build room', build: lairBuildRoomSpec },
    /** What the knock's options fire — in no listing; see `lairActions.ts`. */
    { slug: LAIR_ROOM_ANSWER_SPEC_ID, name: 'Answer the door', build: lairRoomAnswerSpec },
    /** A room described in a message, filed through review (R11) — on a message's ⋮. */
    { slug: LAIR_FILE_ROOM_SPEC_ID, name: 'File as a room', build: lairFileRoomSpec },
    { slug: LAIR_WHISPER_SPEC_ID, name: 'Whisper', build: lairWhisperSpec },
    { slug: LAIR_NUDGE_SPEC_ID, name: 'Nudge', build: lairNudgeSpec },
    { slug: LAIR_TRAP_SPEC_ID, name: 'Trigger trap', build: lairTrapSpec },
    { slug: LAIR_REVEAL_SPEC_ID, name: 'Reveal', build: lairRevealSpec },
    /**
     * The Writing Room (plans/genres §2; U2), create first for the reason
     * above. Its one reply serves both channels — a junction on the trigger's
     * channel decides whether the turn is a page of the book or a line of the
     * conversation about it.
     */
    {
        slug: WRITING_ROOM_CREATE_SPEC_ID,
        name: 'Create writing room',
        build: writingRoomCreateSpec,
    },
    {
        slug: WRITING_ROOM_RESPOND_SPEC_ID,
        name: 'Writing room turn',
        build: writingRoomRespondSpec,
    },
    { slug: WRITING_ROOM_CONTINUE_SPEC_ID, name: 'Continue', build: writingRoomContinueSpec },
    { slug: WRITING_ROOM_REWRITE_SPEC_ID, name: 'Rewrite', build: writingRoomRewriteSpec },
    { slug: WRITING_ROOM_EXPAND_SPEC_ID, name: 'Expand', build: writingRoomExpandSpec },
    { slug: WRITING_ROOM_TIGHTEN_SPEC_ID, name: 'Tighten', build: writingRoomTightenSpec },
    { slug: WRITING_ROOM_BRAINSTORM_SPEC_ID, name: 'Brainstorm', build: writingRoomBrainstormSpec },
    {
        slug: WRITING_ROOM_CRITIQUE_SPEC_ID,
        name: 'Critique this passage',
        build: writingRoomCritiqueSpec,
    },
    {
        slug: WRITING_ROOM_ADD_TO_BIBLE_SPEC_ID,
        name: 'Add to bible',
        build: writingRoomAddToBibleSpec,
    },
    { slug: WRITING_ROOM_EXPORT_SPEC_ID, name: 'Export manuscript', build: writingRoomExportSpec },
    /**
     * The guide genre (R-18, U5g): create first, for the reason above; its
     * reply answers as the genre's envoy.
     */
    { slug: CREATE_GUIDE_SPEC_ID, name: 'Create guide session', build: createGuideSpec },
    { slug: GUIDE_RESPOND_SPEC_ID, name: 'Guide reply', build: guideRespondSpec },
    { slug: RESPOND_SPEC_ID, name: 'Session reply', build: respondSpec },
    /**
     * The answer pipelines (R-15 *Forms*; U5d): one graph, published once
     * per shipped genre because a preset binds a spec locked to its genre.
     * After every genre's create spec, for the reason those come first.
     */
    { slug: ANSWER_FORM_CHAT_SPEC_ID, name: 'Answer a form (chat)', build: answerFormChatSpec },
    {
        slug: ANSWER_FORM_ADVENTURE_SPEC_ID,
        name: 'Answer a form (adventure)',
        build: answerFormAdventureSpec,
    },
    { slug: ANSWER_FORM_GUIDE_SPEC_ID, name: 'Answer a form (guide)', build: answerFormGuideSpec },
    { slug: ANSWER_FORM_LAIR_SPEC_ID, name: 'Answer a form (lair)', build: answerFormLairSpec },
    {
        slug: ANSWER_FORM_WRITING_ROOM_SPEC_ID,
        name: 'Answer a form (writing room)',
        build: answerFormWritingRoomSpec,
    },
    {
        slug: ANSWER_FORM_WHODUNIT_SPEC_ID,
        name: 'Answer a form (whodunit)',
        build: answerFormWhodunitSpec,
    },
    { slug: NARRATE_SPEC_ID, name: 'World narration', build: narrateSpec },
    // The other half of the narrator split (ruling 2026-09-07). A NEW spec,
    // not a bump: the 0.6 freeze forbids moving an existing semver and says
    // nothing about publishing a new slug.
    {
        slug: NARRATE_CHARACTER_SPEC_ID,
        name: 'Side character narration',
        build: narrateCharacterSpec,
    },
    { slug: ECHO_SPEC_ID, name: 'Echo', build: echoSpec },
    /** Every annex field's write (2026-09-26) — contributes no action; the host's door runs it. */
    { slug: SET_ANNEX_FIELD_SPEC_ID, name: 'Set annex field', build: setAnnexFieldSpec },
    /**
     * The built-in writes (R-15): one one-node spec per message verb core
     * implements, published like every other so a delete is a receipted,
     * gate-eligible run pinning a hash. Bound to no genre — they serve all.
     */
    { slug: BUILTIN_DELETE_SPEC_ID, name: 'Delete message', build: builtinDeleteSpec },
    { slug: BUILTIN_HIDE_SPEC_ID, name: 'Hide message', build: builtinHideSpec },
    { slug: BUILTIN_EDIT_SPEC_ID, name: 'Edit message', build: builtinEditSpec },
    { slug: BUILTIN_SWIPE_SPEC_ID, name: 'Swipe message', build: builtinSwipeSpec },
    { slug: BUILTIN_BRANCH_SPEC_ID, name: 'Branch session', build: builtinBranchSpec },
    /**
     * A person's pick of a line's sprite (DESIGN-sprites §6) — not a built-in
     * (its outlet is also placed by the reply specs' sprite tail), but run the
     * same way: one receipted action per press, emitting `sprite-shown`.
     */
    { slug: SHOW_SPRITE_SPEC_ID, name: 'Change sprite', build: showSpriteSpec },
    /**
     * The tool-loop reference (20 §9). Published like the others so the
     * integration suite runs it against a seeded database — an example nobody
     * runs is an example that is already wrong — and bound to no genre, so it
     * is never offered in a person's composer.
     */
    {
        slug: TOOL_LOOP_SPEC_ID,
        name: 'Tool loop (reference)',
        build: toolLoopSpec,
    },
    {
        slug: GENERATE_IMAGE_SPEC_ID,
        name: 'Generate image',
        build: generateImageSpec,
    },
    {
        slug: SUMMARIZE_WORLD_SPEC_ID,
        name: 'Summarize: world lore',
        build: summarizeWorldSpec,
    },
    {
        slug: SUMMARIZE_CHARACTER_SPEC_ID,
        name: 'Summarize: character lore',
        build: summarizeCharacterSpec,
    },
    {
        slug: SUMMARIZE_SCENE_SPEC_ID,
        name: 'Summarize: scene',
        build: summarizeSceneSpec,
    },
    {
        slug: SUMMARIZE_HISTORY_SPEC_ID,
        name: 'Summarize: history entry',
        build: summarizeHistorySpec,
    },
    {
        slug: GRAPH_BUILD_SPEC_ID,
        name: 'Narrative graph build',
        build: graphBuildSpec,
    },
    /* ── Whodunit (plans/genres §4; U4) ──────────────────────────────────
     *
     * Create first, for the reason the Lair block states: the genre's
     * declaration rides `meta.genre` on the create spec's version row, so
     * nothing that declares itself for the genre can be published before the
     * genre exists.
     *
     * The two pairs are listed together — the picker and what its options fire
     * — because neither half means anything alone. `whodunit-answer` and
     * `whodunit-verdict` are in no listing (the `form` venue); they are here so
     * the blocks that carry them have an identity the host can hold a press to.
     */
    { slug: WHODUNIT_CREATE_SPEC_ID, name: 'Create whodunit', build: whodunitCreateSpec },
    { slug: WHODUNIT_RESPOND_SPEC_ID, name: 'Whodunit turn', build: whodunitRespondSpec },
    { slug: WHODUNIT_QUESTION_SPEC_ID, name: 'Question', build: whodunitQuestionSpec },
    { slug: WHODUNIT_ANSWER_SPEC_ID, name: 'Answer a question', build: whodunitAnswerSpec },
    { slug: WHODUNIT_SEARCH_SPEC_ID, name: 'Search', build: whodunitSearchSpec },
    { slug: WHODUNIT_ACCUSE_SPEC_ID, name: 'Accuse', build: whodunitAccuseSpec },
    { slug: WHODUNIT_VERDICT_SPEC_ID, name: 'Verdict', build: whodunitVerdictSpec },
    /**
     * Turn order as state (PLAN-turn-order §4.5), one spec per genre (R27,
     * §4.14): built by the public `turnOrderSpec()`, the same call a plugin
     * genre makes. They run no model and write no message — five reads and a
     * `jsonb_set` — and every surface that used to ask "who is next" renders
     * what they wrote. Last, because each one's lock names its genre and a
     * spec cannot be published before its genre's create pipeline (24 §3).
     */
    ...TURN_ORDER_BY_GENRE.map(({ spec, genre, build }) => ({
        slug: spec,
        name: `Turn order (${typeof genre.name === 'string' ? genre.name : genre.name.en})`,
        build,
    })),
];
/** Lookup by slug, for a caller holding an id that wants the display name. @experimental */
export const coreSpec = (slug) => CORE_SPECS.find((s) => s.slug === slug);
/**
 * Core's hook declarations (24 §11): identity, event, contract, ordering —
 * the referenceable half. Implementations live in SP core with their
 * capabilities (DB access, transactions) and bind to these ids at boot; the
 * boot completeness check refuses a declared hook with no implementation and
 * an implementation with no declaration.
 *
 * Empty today, deliberately: core's script *sites* are declared on the node
 * types in @serene-pub/contracts (`slots.scripts.accepts`), and core has no
 * in-process hook implementations yet. The first one added lands here and in
 * core's implementation registry in the same commit, or boot refuses.
 * @internal
 */
export const CORE_HOOK_DECLARATIONS = {};
/**
 * The announcement — the whole package as one validated declaration (24 §6).
 * Compiled lazily for the same registry-sync reason as `CoreSpec.build`.
 * @experimental
 */
export function coreAnnouncement() {
    return announcementOf(coreExtension());
}
/**
 * Core, declared the way any package declares itself — one `defineExtension`
 * call, every reference a value. Built on each call, never at module scope,
 * for the same registry-sync reason as `CoreSpec.build`.
 * @experimental
 */
export const coreExtension = () => defineExtension({
    slug: 'core',
    name: 'Serene Pub core',
    // Required of every package; core's is not announced (it ships with the app).
    version: '0.6.0',
    description: 'The genres and pipelines Serene Pub ships.',
    author: 'Serene Pub',
    repo: 'https://github.com/doolijb/serene-pub',
    genres: [chatGenre, adventureGenre, guideGenre, lairGenre, writingRoomGenre, whodunitGenre],
    pipelines: CORE_SPECS.map((s) => s.build()),
    prompts: CORE_PROMPTS.map((p) => ({
        nodeType: p.nodeType,
        slot: p.slot,
        // The announcement-level identity is the bare slug; the seed
        // pass's idempotence key wraps it (see prompts.ts). Unique
        // within a pool, not globally — `summarize-scene-default`
        // names a row in three of them.
        slug: p.seedKey.split(':').at(-1),
        label: p.name,
        fields: p.fields,
    })),
    presets: corePresetInputs(),
    // Core's annex declaration (ruling 2026-09-26) — every key a core
    // pipeline keeps in `annex.core`. Not part of the announcement.
    annexFields: [...CORE_ANNEX_FIELDS],
    // The hooks core defines, by bare key: the announcement namespaces
    // them, so strip the prefix it will re-add.
    hooks: Object.fromEntries(Object.entries(CORE_HOOK_DECLARATIONS).map(([id, decl]) => [id.replace(/^core:hook\//, ''), decl])),
});
//# sourceMappingURL=index.js.map