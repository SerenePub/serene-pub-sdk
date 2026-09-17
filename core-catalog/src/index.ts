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
import { announce, type AnnouncementDocument, type CoverageReport } from '@serene-pub/sdk'
import { CORE_PROMPTS } from './prompts.js'
import { CORE_PRESETS } from './presets.js'
import { adventureGenre, chatGenre, guideGenre } from './genres.js'
import { CREATE_CHAT_SPEC_ID, createChatSpec } from './createChat.js'
import {
	CREATE_GUIDE_SPEC_ID,
	createGuideSpec,
	GUIDE_RESPOND_SPEC_ID,
	guideRespondSpec,
} from './guide.js'
import {
	ADVENTURE_CREATE_SPEC_ID,
	ADVENTURE_RESPOND_SPEC_ID,
	adventureCreateSpec,
	adventureRespondSpec,
} from './adventure.js'
import {
	ADVENTURE_ADVANCE_TIME_SPEC_ID,
	ADVENTURE_ANSWER_SPEC_ID,
	ADVENTURE_ASK_SPEC_ID,
	ADVENTURE_LOOK_SPEC_ID,
	ADVENTURE_REST_SPEC_ID,
	adventureAdvanceTimeSpec,
	adventureAnswerSpec,
	adventureAskSpec,
	adventureLookSpec,
	adventureRestSpec,
} from './adventureActions.js'
import {
	ANSWER_FORM_ADVENTURE_SPEC_ID,
	ANSWER_FORM_CHAT_SPEC_ID,
	ANSWER_FORM_GUIDE_SPEC_ID,
	answerFormAdventureSpec,
	answerFormChatSpec,
	answerFormGuideSpec,
} from './answerForm.js'
import { RESPOND_SPEC_ID, respondSpec } from './respond.js'
import { NARRATE_SPEC_ID, narrateSpec } from './narrate.js'
import {
	NARRATE_CHARACTER_SPEC_ID,
	narrateCharacterSpec,
} from './narrateCharacter.js'
import { ECHO_SPEC_ID, echoSpec } from './echo.js'
import {
	BUILTIN_BRANCH_SPEC_ID,
	BUILTIN_DELETE_SPEC_ID,
	BUILTIN_EDIT_SPEC_ID,
	BUILTIN_HIDE_SPEC_ID,
	BUILTIN_SWIPE_SPEC_ID,
	builtinBranchSpec,
	builtinDeleteSpec,
	builtinEditSpec,
	builtinHideSpec,
	builtinSwipeSpec,
} from './builtins.js'
import { TOOL_LOOP_SPEC_ID, toolLoopSpec } from './toolLoop.js'
import { GENERATE_IMAGE_SPEC_ID, generateImageSpec } from './generateImage.js'
import { GRAPH_BUILD_SPEC_ID, graphBuildSpec } from './graphBuild.js'
import {
	SUMMARIZE_CHARACTER_SPEC_ID,
	SUMMARIZE_HISTORY_SPEC_ID,
	SUMMARIZE_SCENE_SPEC_ID,
	SUMMARIZE_WORLD_SPEC_ID,
	summarizeCharacterSpec,
	summarizeHistorySpec,
	summarizeSceneSpec,
	summarizeWorldSpec,
} from './summarize.js'

export * from './genres.js'
/**
 * The attribute slots core's genres bring.
 *
 * ⚠ A load-bearing re-export, on the same terms as `./entries.js` below:
 * declaring a slot REGISTERS it, and nothing imports these by value. Without
 * the module being reached, the Adventure genre would name seven declarations
 * that this process has never heard of.
 */
export * from './slots.js'
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
export * from './entries.js'
export * from './prompts.js'
export * from './presets.js'
export * from './createChat.js'
export * from './guide.js'
export * from './adventure.js'
export * from './adventureActions.js'
export * from './answerForm.js'
export * from './respond.js'
export * from './narrate.js'
export * from './narrateCharacter.js'
export * from './echo.js'
export * from './builtins.js'
export * from './toolLoop.js'
export * from './generateImage.js'
export * from './graphBuild.js'
export * from './summarize.js'
export * from './ui/sessions/widgets.js'
export * from './ui/sessions/layouts.js'

export interface CoreSpec {
	slug: string
	name: string
	/**
	 * Compiled lazily. Compiling resolves type pins against the registry, and
	 * boot syncs that registry first — building at module scope would run the
	 * compile before the sync, and before the conflict check that decides
	 * whether these types mean what this build thinks they mean.
	 */
	build: () => any
}

/**
 * The pipelines core ships — one registry rather than a list of builders
 * beside a map of display names (two collections that had to agree). `name`
 * is what a person calls the thing; a list showing `core:spec/respond` is a
 * list of identifiers, not of things.
 */
export const CORE_SPECS: CoreSpec[] = [
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
]

/** Lookup by slug, for a caller holding an id that wants the display name. */
export const coreSpec = (slug: string): CoreSpec | undefined =>
	CORE_SPECS.find((s) => s.slug === slug)

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
 */
export const CORE_HOOK_DECLARATIONS: Record<
	string,
	{ event: string; description?: unknown; before?: string[]; after?: string[] }
> = {}

/**
 * The announcement — the whole package as one validated declaration (24 §6).
 * Compiled lazily for the same registry-sync reason as `CoreSpec.build`.
 */
export function coreAnnouncement(): {
	document: AnnouncementDocument
	coverage: CoverageReport
} {
	return announce({
		ns: 'core',
		author: 'Serene Pub',
		title: 'Serene Pub core',
		repo: 'https://github.com/doolijb/serene-pub',
		summary: 'The genres and pipelines Serene Pub ships.',
	})
		.genres({ chatGenre, adventureGenre, guideGenre })
		.hooks(
			Object.fromEntries(
				Object.entries(CORE_HOOK_DECLARATIONS).map(([id, decl]) => [
					// Declarations are stored fully-qualified; announce()
					// namespaces bare keys, so strip the prefix it will re-add.
					id.replace(/^core:hook\//, ''),
					decl,
				]),
			),
		)
		.pipelines(...CORE_SPECS.map((s) => s.build()))
		.prompts(
			...CORE_PROMPTS.map((p) => ({
				nodeType: p.nodeType,
				slot: p.slot,
				// The announcement-level identity is the bare slug; the seed
				// pass's idempotence key wraps it (see prompts.ts). Unique
				// within a pool, not globally — `summarize-scene-default`
				// names a row in three of them.
				slug: p.seedKey.split(':').at(-1)!,
				label: p.name,
				fields: p.fields,
			})),
		)
		.presets(...CORE_PRESETS)
		.build()
}
