/**
 * 🚧 What core stopped shipping, as data the host reads (2026-10-19,
 * PLAN-genre-restructure R4): the genres that left core, by the stems their
 * shipped rows used — what the app's `boot/retiredGenres.ts` culls — and the
 * ids the restructure renamed, old → new, for the app's migration to re-key
 * stored rows by. Nothing here registers anything.
 */

/** A genre core no longer ships, and the stems its shipped rows used. @experimental */
export interface RetiredCoreGenre {
	genreId: string
	/** The stem every one of its spec slugs starts with: `core:spec/<stem>-…`. */
	specStem: string
	/** Specs of its that do not share the stem. */
	otherSpecs: readonly string[]
	/** The stem its shipped prompt rows' seed keys use: `…:prompts:<stem>-…`. */
	promptStem: string
}

/**
 * 🚧 Core's retired genres. **Adventure** folded into Story 2026-10-19: its
 * Look, Rest, Ask and Answer moved to Story under `core:spec/story-*`, its
 * reply (planner, narrator, voices, keeper), its Time passes and its answer
 * form were retired — Story's reply is the roleplay Chat's (ruled).
 * @experimental
 */
export const RETIRED_CORE_GENRES: readonly RetiredCoreGenre[] = Object.freeze([
	Object.freeze({ genreId: 'core:genre/adventure', specStem: 'adventure', otherSpecs: Object.freeze([]), promptStem: 'adventure' }),
])

/** One id the restructure renamed. @experimental */
export interface RenamedCoreId {
	readonly kind: 'genre' | 'spec' | 'prompt-seed' | 'preset-seed' | 'ruleset' | 'primer' | 'entry-type' | 'sheet' | 'script-seed'
	readonly from: string
	readonly to: string
}

/**
 * 🚧 Every id the 2026-10-19 restructure renamed, old → new — what a stored
 * row may still name. Spec slugs keep their rows (the roleplay specs are
 * Story's); the Freeform ruleset's derived entry types and repertoire
 * addresses follow its id. `core:genre/chat` is NOT here: it keeps its id
 * with the new meaning (the assistant), and its 0.6 sessions move to
 * `core:genre/story` — by migration ordering, never by alias (§2-7).
 * @experimental
 */
export const RENAMED_CORE_IDS: readonly RenamedCoreId[] = Object.freeze([
	// The roleplay Chat's specs — Story's now.
	...[
		'create',
		'respond',
		'narrate',
		'side-character',
		'generate-image',
		'illustrate-scene',
		'advance-time',
		'answer-form',
		'turn-order',
		'summarize-scene',
	].map((s) => ({ kind: 'spec' as const, from: `core:spec/chat-${s}`, to: `core:spec/story-${s}` })),
	// Adventure's actions — Story's now (their old rows are culled; these seed fresh).
	...['look', 'rest', 'ask', 'answer'].map((s) => ({ kind: 'spec' as const, from: `core:spec/adventure-${s}`, to: `core:spec/story-${s}` })),
	{ kind: 'genre', from: 'core:genre/adventure', to: 'core:genre/story' },
	{
		kind: 'prompt-seed',
		from: 'pipeline-prompt:core:oracle/turn-advise:prompts:chat-turn-order-default',
		to: 'pipeline-prompt:core:oracle/turn-advise:prompts:story-turn-order-default',
	},
	{
		kind: 'prompt-seed',
		from: 'pipeline-prompt:core:task/build-keeper-context:prompts:adventure-rest',
		to: 'pipeline-prompt:core:task/build-keeper-context:prompts:story-rest',
	},
	{
		kind: 'prompt-seed',
		from: 'pipeline-prompt:core:task/build-scene-context:prompts:adventure-look',
		to: 'pipeline-prompt:core:task/build-scene-context:prompts:story-look',
	},
	{
		kind: 'prompt-seed',
		from: 'pipeline-prompt:core:task/build-narrator-context:prompts:adventure-ask',
		to: 'pipeline-prompt:core:task/build-narrator-context:prompts:story-ask',
	},
	{ kind: 'preset-seed', from: 'core-chat-default', to: 'core-story-minimal' },
	{ kind: 'preset-seed', from: 'core-adventure-default', to: 'core-story-living' },
	{ kind: 'ruleset', from: 'core:ruleset/story@1', to: 'core:ruleset/freeform@1' },
	{ kind: 'primer', from: 'core:primer/story@1', to: 'core:primer/freeform@1' },
	{ kind: 'entry-type', from: 'core:entry/story.things@1', to: 'core:entry/freeform.things@1' },
	{ kind: 'entry-type', from: 'core:entry/story.conditions@1', to: 'core:entry/freeform.conditions@1' },
	{ kind: 'sheet', from: 'core:sheet/adventure@1', to: 'core:sheet/story@1' },
])
