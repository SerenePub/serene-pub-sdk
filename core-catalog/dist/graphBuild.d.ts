/**
 * Core's narrative-graph build pipeline.
 *
 * Five LLM steps over the scenes of a session, each with its own prompt, connection
 * and sampling config. That structure is not new — `graph_build_configs` already
 * carries it as fifteen columns, three per step. Five Providers is the same
 * statement with the enumeration removed, which is what makes a sixth step a
 * spec change rather than a migration.
 *
 * ## The order is real, so the steps are sequential
 *
 * Pre-filter drops what is not worth graphing *before* the expensive steps run;
 * node resolution decides whether a mentioned name is someone already in the
 * graph; description only runs for the nodes resolution found to be new. Each
 * genuinely depends on the last, so this is a chain rather than an `async`
 * block — declaring it parallel would be faster and wrong.
 *
 * ## It stops at a proposal
 *
 * The final Consumer publishes `write-result@1`, which is deliberately **not**
 * assignable to row ids: under review a proposal is something a person may still
 * reject, and a downstream node that treated it as rows would wire a foreign key
 * to something that may never exist. This is the mechanism behind the rule that
 * a graph build always stops at the Review Proposal screen and never applies
 * itself — enforced by a port shape rather than by a check somebody remembers.
 *
 * ## One configuration hazard worth naming
 *
 * Each step may point at its own sampling config, and a sampling config carries
 * the **context window**. Pointing two steps at configs with different Context
 * Tokens makes a local backend reload the model between every step, which the
 * health probe then reads as a dead server. The steps therefore default to the
 * same config, and diverging is a deliberate act rather than the starting state.
 */
/** @experimental */
export declare const GRAPH_BUILD_SPEC_ID = "core:spec/graph-build";
/** @internal */
export declare const GRAPH_BUILD_VERSION = "1.2.0";
/** @experimental */
export declare const graphBuildSpec: () => import("@serene-pub/sdk").SpecDocument;
//# sourceMappingURL=graphBuild.d.ts.map