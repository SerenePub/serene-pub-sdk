/**
 * Core's shipped prompts (24 T6b) — the catalog is the system of record.
 *
 * The prose is byte-exact what 0.5.3 shipped (extracted from a seeded
 * database, never retyped), and this list is its only record: the app's seed
 * pass reads it, and SP's `seedPrompts.int.test.ts` pins the wording — save
 * one difference it pins by its exact bytes: the narrator's direction clause,
 * which 0.5.3 wrote in code (see the narrator row).
 *
 * ## One row per (node type, slot) pool — not one row per pipeline
 *
 * A prompt follows the NODE that consumes it, so a node reused in another
 * pipeline brings its prompts along. The list used to be one row per spec, and
 * each of those rows was a BUNDLE: the scene summarizer's single entry carried
 * `batch`, `synth`, `name` and `characterExtraction`, four fields belonging to
 * four different node types that only ever travelled together because the spec
 * was the namespace. Split along the declarations, the same 20 bundles are 30
 * rows across 12 pools — and the prose is unchanged, character for character.
 *
 * Two of the old rows collapse into one here. `summarize-scene` and
 * `summarize-history` shipped byte-identical `batch`, `synth` and `name` text
 * under the same name, so in a shared pool they are one row that both specs
 * point at — which is what `defaultForSpecs` is a LIST for. Shipping two
 * identical rows with disambiguated names would be the bundle habit surviving
 * the refactor.
 *
 * `seedKey` is the idempotence key. It must never change, or every install
 * re-seeds a duplicate.
 */
/** @internal */
export interface CorePromptSeed {
    /** The pool: an UNVERSIONED node type id, e.g. `core:task/build-template-context`. */
    nodeType: string;
    /** The pool's second half. `"prompts"` for every core node today. */
    slot: string;
    /**
     * Where it was authored — grouping in the picker, never a permission.
     * Omitted when the row genuinely serves several specs and no one of them
     * is its home.
     */
    createdForSpec?: string;
    /**
     * Spec slugs whose shipped config starts on this row.
     *
     * A list rather than a boolean because a pool serves several specs at once:
     * one `summarize-batch` pool holds the world, character and scene drafting
     * prompts, and the scene row is where both `summarize-scene` and
     * `summarize-history` begin. Empty for the twelve alternative reply prompts
     * — offered, but not where anyone starts.
     */
    defaultForSpecs: string[];
    /** The idempotence key: `pipeline-prompt:<nodeType>:<slot>:<slug>`. */
    seedKey: string;
    name: string;
    /** Field name → prose, exactly as the pool's node declares them. */
    fields: Record<string, string>;
}
/** @internal */
export declare const CORE_PROMPTS: CorePromptSeed[];
//# sourceMappingURL=prompts.d.ts.map