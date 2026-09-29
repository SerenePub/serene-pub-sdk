/**
 * `/contracts` generation (04 §2, §4b).
 *
 * Every SP release publishes frozen, generated type declarations. This is the generator:
 * descriptors in, a TypeScript module out. In core the input is `pipeline_definition_registry` rows; here
 * it is the in-memory registry, which is the same data.
 *
 * **The binding name is derived, never chosen.** It is the camelCase of the id's name
 * segment, and nothing else. That rule exists because the alternative was discovered by
 * writing it out: eleven of thirty-five hand-written names did not match their ids —
 * `generateText` for `text-gen`, `speak` for `tts`, `savePluginData` for `plugin-data`.
 * A generator with a hand-maintained alias table is a generator that drifts, and the drift
 * lands on plugin authors who imported a name that no longer exists.
 *
 * So the naming convention is enforced here rather than documented:
 *
 * - **Shapes are nouns** — what a thing *is*. They double as connection kinds (F17), so
 *   they read as categories: `text-gen`, `embeddings`, `row-ids`, `allocated-context`.
 * - **Task / Provider / Consumer types are verb phrases** — they *do* something:
 *   `generate-text`, `embed-text`, `render-image`, `create-message`, `assemble`.
 * - **Query types name their source** — a Query is chosen by what it returns, which is
 *   what a user tuning "how much should lore matter" is looking at: `session-history`,
 *   `world-lore`, `lorebook-triggers`.
 *
 * Renaming `core:oracle/text-gen@1` to `core:oracle/generate-text@1` also removed a
 * collision worth naming: it was the same string as `core:shape/text-gen@1`, the operation
 * and the category spelled identically in different namespaces.
 */
import type { Descriptor } from "@serene-pub/sdk";
/** @internal `'core:query/session-history@2'` → `{ ns: 'core', kind: 'query', name: 'session-history', version: 2 }` */
export declare function parseDefinitionId(id: string): {
    ns: string;
    kind?: string;
    name: string;
    version: number;
};
/** @internal */
export declare const camel: (s: string) => string;
/** @internal The one and only rule. */
export declare const bindingNameFor: (id: string) => string;
/** @internal */
export interface DerivationProblem {
    id: string;
    given: string;
    expected: string;
}
/**
 * Check a hand-written contracts module against the rule. Run in CI: the moment a name
 * stops being derivable, generation would need an alias table, and that is the failure.
 * @internal
 */
export declare function checkDerivable(entries: Array<{
    name: string;
    id: string;
}>): DerivationProblem[];
/** @internal */
export interface NameCollision {
    name: string;
    ids: string[];
}
/**
 * Two ids that derive to one name.
 *
 * The derivation is namespace-blind on purpose — `core:task/assemble@2` reads as
 * `assemble`, not `coreAssemble` — and the cost is that
 * `core:task/rank-semantic@1` and `chariot.recall:rank-semantic@1` both want to
 * be `rankSemantic`. Generation would emit the same export twice and the second
 * would win silently.
 *
 * Found the way these things are found: adding a core ranker whose name segment a
 * plugin example already used. Reported as its own problem rather than folded
 * into `checkDerivable`, because the fix is different — a collision is resolved
 * by renaming a *type*, not by renaming a binding.
 * @internal
 */
export declare function checkUnique(entries: Array<{
    id: string;
}>): NameCollision[];
/** @experimental */
export interface GenerateOptions {
    /** Written into the banner so a stale file is obvious in a diff. */
    release?: string;
    /** Import specifier for the SDK itself. */
    sdk?: string;
}
/**
 * Emit a contracts module. Descriptors are emitted as data plus a `pin()` call, so the
 * generated file is readable and diffable rather than a blob — a plugin author reading
 * `/contracts` to find out what ports a node has should be able to.
 * @experimental
 */
export declare function generateContracts(types: Descriptor[], opts?: GenerateOptions): string;
/**
 * The manifest's view of a node definition: what an admin's audit screen and the
 * install-time permission check read, without loading any code (10 §10.2).
 * @internal
 */
export interface DefinitionSummary {
    id: string;
    binding: string;
    kind: string;
    version: number;
    ports: {
        in: string[];
        out: string[];
    };
    slots: string[];
    effects?: string;
    causesEvent?: string;
    public?: boolean;
    declaresRandomness?: boolean;
    timeoutMs?: number;
    /**
     * The **declaration** this summarizes, verbatim (D-6b).
     *
     * Everything above is a summary — port *names*, slot *names* — which is
     * what an audit screen shows and not enough to register the definition. An
     * instance projects a plugin's definitions into `pipeline_definition_registry`
     * the way it projects core's, and that projection is over the descriptor:
     * port shapes, slot declarations, the session shape, the entry shape. A row
     * built from names alone would declare ports no edge could be checked
     * against and a form with no fields in it.
     *
     * Carried inside the summary rather than in a second list beside it,
     * because two lists of definitions are two things that can disagree about
     * which definitions a package has. A descriptor is data: the instance reads
     * it exactly as it reads the pipeline documents, and never evaluates the
     * plugin to get it (F6).
     */
    declaration?: Descriptor;
}
/** @internal */
export declare const summarizeDefinition: (d: Descriptor) => DefinitionSummary;
//# sourceMappingURL=codegen.d.ts.map