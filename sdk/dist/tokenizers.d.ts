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
/**
 * Counting, after loading. Takes `unknown` because a wire payload is not always
 * a string and a counter must not be the thing that decides it should have been.
 */
export type TokenCount = (value: unknown) => number;
/**
 * One tokenizer a host can offer.
 *
 * `load` may be async and is awaited at most once per id per process — the
 * result is what gets called sixty times while a context is allocated, so it
 * must be resident by then rather than resolved per block.
 */
export interface TokenizerDefinition {
    /** The id core stores and passes — `connections.token_counter`'s vocabulary. */
    id: string;
    /** Resolve whatever data this needs and return the synchronous counter. */
    load(): Promise<TokenCount> | TokenCount;
}
/** A tokenizer that is resident and ready to count. */
export interface LoadedTokenizer {
    /** What was asked for. Kept even when it could not be honoured. */
    requested: string;
    /** What is actually counting — `ROUGH_TOKENIZER_ID` when the request degraded. */
    id: string;
    /** Synchronous, always. The awaiting already happened. */
    count: TokenCount;
    /**
     * Set only when `requested` could not be honoured, and phrased for a
     * receipt: a run whose budgeting quietly fell back to an estimate must say
     * so, because the numbers are the whole point of the receipt.
     */
    degraded?: string;
}
/** What `count` is when nothing better could be resolved. */
export declare const ROUGH_TOKENIZER_ID = "rough";
/** Every id this SDK will answer to, whether or not a loader is registered. */
export declare const TOKENIZER_IDS: readonly string[];
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
export declare function defineTokenizer(t: TokenizerDefinition): TokenizerDefinition;
/** Every id that currently has a loader — the registered ones plus the built-ins. */
export declare const registeredTokenizers: () => string[];
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
export declare function loadTokenizer(id: string | null | undefined): Promise<LoadedTokenizer>;
//# sourceMappingURL=tokenizers.d.ts.map