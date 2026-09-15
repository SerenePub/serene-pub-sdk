/**
 * Which tokenizer a run budgets with — the ids, the resolution, and the one
 * thing that makes the whole arrangement work: **loading is asynchronous,
 * counting is not.**
 *
 * ## The problem this file exists to dissolve
 *
 * `RunOptions.countTokens` is `(v: unknown) => number`, strictly synchronous,
 * because the allocation and wire-measurement loops decide what fits while
 * walking candidates — a loop that awaited per candidate would be a different
 * loop, and a much slower one, at exactly the moment somebody's context is
 * biggest. A host's real tokenizers, meanwhile, are async: not because
 * *counting* is async but because **loading** a 55 MB merge table is.
 *
 * So the two are separated. `loadTokenizer` is awaited **once**, before the run
 * starts, and hands back a plain synchronous function. Nothing downstream of
 * that point knows a tokenizer was ever loaded. The executor passes an *id*
 * rather than a function, so which tokenizer a run used is a fact recorded in
 * configuration rather than a closure a host happened to build.
 *
 * ## Why the data-bearing loaders are registered rather than imported here
 *
 * The SDK has **no dependencies**, deliberately — nothing in `src/` imports
 * anything outside it. Real tokenizers are the opposite of that: the four
 * packages a host needs for the twelve ids below are ~69 MB on disk, and an
 * author who installed `@serene-pub/sdk` to write one node type has no business
 * downloading a BPE merge table. There is also a hard mechanical reason: this
 * package is consumed by a host through a `file:` link, so a bare specifier
 * written *here* resolves against **this** package's tree, not the host's, and
 * would simply not be found.
 *
 * So the split runs along the line of what needs data:
 *
 *   - The four **ratio** counters need no data and live here, defined below.
 *     They are the fallbacks a host gets for free.
 *   - The eight **data-bearing** ones are registered by the host with
 *     `defineTokenizer`, the same seam `defineWireFormat` already is: the SDK
 *     owns the id, the resolution, the caching and the degradation; the host
 *     owns the one `import()` that has to happen where the package actually is.
 *
 * A host that registers nothing still resolves every id it asks for — to the
 * rough estimate, with a sentence saying so. Budgeting degrades; it never
 * fails.
 */

import { countableText, roughTokens } from './preview.js'

/**
 * Counting, after loading. Takes `unknown` because a wire payload is not always
 * a string and a counter must not be the thing that decides it should have been.
 */
export type TokenCount = (value: unknown) => number

/**
 * One tokenizer a host can offer.
 *
 * `load` may be async and is awaited at most once per id per process — the
 * result is what gets called sixty times while a context is allocated, so it
 * must be resident by then rather than resolved per block.
 */
export interface TokenizerDefinition {
	/** The id core stores and passes — `connections.token_counter`'s vocabulary. */
	id: string
	/** Resolve whatever data this needs and return the synchronous counter. */
	load(): Promise<TokenCount> | TokenCount
}

/** A tokenizer that is resident and ready to count. */
export interface LoadedTokenizer {
	/** What was asked for. Kept even when it could not be honoured. */
	requested: string
	/** What is actually counting — `ROUGH_TOKENIZER_ID` when the request degraded. */
	id: string
	/** Synchronous, always. The awaiting already happened. */
	count: TokenCount
	/**
	 * Set only when `requested` could not be honoured, and phrased for a
	 * receipt: a run whose budgeting quietly fell back to an estimate must say
	 * so, because the numbers are the whole point of the receipt.
	 */
	degraded?: string
}

/** What `count` is when nothing better could be resolved. */
export const ROUGH_TOKENIZER_ID = 'rough'

/**
 * A counter that is nothing but a characters-per-token ratio.
 *
 * Four of the twelve ids are this and only this — a model family whose real
 * tokenizer either is not distributable or is not worth 13 MB to approximate
 * within a few percent. Written once here rather than four times, because a
 * ratio copied is a ratio that drifts.
 */
const ratio =
	(charsPerToken: number): TokenCount =>
	(value) =>
		Math.ceil(countableText(value).length / charsPerToken)

/**
 * The ids this SDK knows, and which of them it can satisfy unaided.
 *
 * ⚠ These four ratios are shared with a host's own estimator surface (Serene
 * Pub's `TokenCounterManager`), and the two must agree: a person who picks
 * "Estimate" in a connection form and a pipeline that budgets for that same
 * connection are naming one thing. Nothing here can enforce that from inside
 * the SDK — the host's suite is where that equality is asserted.
 */
const definitions = new Map<string, TokenizerDefinition>([
	['estimate', { id: 'estimate', load: () => ratio(3.4) }],
	['anthropic-claude', { id: 'anthropic-claude', load: () => ratio(3.6) }],
	['gemini', { id: 'gemini', load: () => ratio(4) }],
	['gemma', { id: 'gemma', load: () => ratio(3.5) }],
])

/**
 * Ids the SDK names but cannot satisfy on its own.
 *
 * Declared rather than left implicit so that "nobody registered a loader for
 * GPT-4o" and "GPT-4o is not a tokenizer this build has ever heard of" are two
 * different sentences. They are two different problems — a host wiring bug and
 * a typo in a column — and a single "unknown tokenizer" for both is how the
 * first one goes uninvestigated for a release.
 */
const HOST_PROVIDED = [
	'openai-gpt2',
	'openai-gpt3.5',
	'openai-gpt4',
	'openai-gpt4o',
	'llama',
	'llama3',
	'mistral',
	'cohere',
] as const

/** Every id this SDK will answer to, whether or not a loader is registered. */
export const TOKENIZER_IDS: readonly string[] = [...definitions.keys(), ...HOST_PROVIDED]

/**
 * In-flight and settled loads, keyed by id.
 *
 * The PROMISE is cached rather than its value, so sixty blocks arriving before
 * the first load settles share one load instead of racing to build the same
 * merge table sixty times. A rejected load is evicted (see `loadTokenizer`) —
 * caching a failure forever would mean one transient import error degrades
 * every run until the process restarts.
 */
const loading = new Map<string, Promise<TokenCount>>()

/**
 * Offer a tokenizer, or replace one.
 *
 * **Replaces rather than throwing on a duplicate**, unlike `defineWireFormat`.
 * A wire format is authored once in a module that is imported once; a tokenizer
 * loader is registered by a host whose dev server re-evaluates modules on every
 * edit, and a registry that throws there poisons the process for the rest of the
 * session. The trade is that a plugin can shadow a host's loader for an id —
 * which is a real risk and a deliberate one: the alternative was worse, and a
 * shadowing loader still cannot change what the id *means*, only how it loads.
 */
export function defineTokenizer(t: TokenizerDefinition): TokenizerDefinition {
	definitions.set(t.id, t)
	// A redefinition supersedes whatever the previous one had already loaded.
	loading.delete(t.id)
	return t
}

/** Every id that currently has a loader — the registered ones plus the built-ins. */
export const registeredTokenizers = (): string[] => [...definitions.keys()]

/**
 * Resolve an id to something that can count, and never fail.
 *
 * The three ways this degrades are three different sentences on purpose. An
 * absent id is not a problem at all (a host that never configured one gets the
 * estimate silently); an unregistered id is a wiring gap worth naming; a loader
 * that threw is an environment problem worth naming *with its own message*,
 * because "gpt-tokenizer is not installed" and "this Android build cannot parse
 * that regex" want different fixes.
 */
export async function loadTokenizer(id: string | null | undefined): Promise<LoadedTokenizer> {
	const requested = typeof id === 'string' ? id.trim() : ''
	// No id is not a degradation. It is a host that has not been asked to pick
	// one, and the rough estimate is exactly what it has always used.
	if (!requested) return { requested, id: ROUGH_TOKENIZER_ID, count: roughTokens }

	const def = definitions.get(requested)
	if (!def) {
		const known = (TOKENIZER_IDS as string[]).includes(requested)
		return {
			requested,
			id: ROUGH_TOKENIZER_ID,
			count: roughTokens,
			degraded: known
				? `no loader is registered for tokenizer '${requested}', so this run budgeted ` +
					`with the rough estimate. The host registers data-bearing tokenizers with ` +
					`defineTokenizer() — see @serene-pub/sdk/tokenizers.`
				: `'${requested}' is not a tokenizer this build recognises, so this run budgeted ` +
					`with the rough estimate. Known ids: ${TOKENIZER_IDS.join(', ')}.`,
		}
	}

	try {
		let pending = loading.get(requested)
		if (!pending) {
			// Wrapped in Promise.resolve so a synchronous `load` — every built-in
			// ratio is one — takes the same path as an async import rather than a
			// second one that could diverge.
			pending = Promise.resolve().then(() => def.load())
			loading.set(requested, pending)
		}
		const count = await pending
		if (typeof count !== 'function')
			throw new Error(
				`its load() resolved to ${typeof count} rather than a counting function`,
			)
		return { requested, id: requested, count }
	} catch (e) {
		// Evicted so the next run retries. A tokenizer that failed to load
		// because a file was momentarily unreadable should not doom the process.
		loading.delete(requested)
		return {
			requested,
			id: ROUGH_TOKENIZER_ID,
			count: roughTokens,
			degraded:
				`tokenizer '${requested}' could not be loaded, so this run budgeted with the ` +
				`rough estimate: ${(e as Error).message}`,
		}
	}
}
