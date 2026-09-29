/**
 * Core's answer-a-message pipeline.
 *
 * One file per spec, because a pipeline is content and content grows: the
 * summarize and graph-build specs are several nodes each with their own step
 * prompts, and a single module holding all of them would be a merge conflict
 * waiting for the first person to add a sixth.
 */
/** The spec a session turn runs. @experimental */
export declare const RESPOND_SPEC_ID = "core:spec/respond";
/** @internal */
export declare const RESPOND_VERSION = "1.21.0";
/**
 * Core's answer-a-message pipeline.
 *
 * All five mechanisms since 1.20.0 — keys, names the scene said, meaning,
 * names the scene *described*, and the structural signals that order what they
 * find. Three of the five need nothing installed; the two that read embeddings
 * need a model and both ship switched off, so a first boot runs exactly the
 * zero-cost path it always did.
 * @experimental
 */
export declare const respondSpec: () => import("@serene-pub/sdk").SpecDocument;
//# sourceMappingURL=respond.d.ts.map