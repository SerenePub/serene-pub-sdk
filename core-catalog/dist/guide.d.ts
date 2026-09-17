export declare const CREATE_GUIDE_SPEC_ID = "core:spec/create-guide";
export declare const CREATE_GUIDE_VERSION = "1.0.0";
/**
 * The guide's create pipeline — the genre's one required member (24 §3).
 *
 * The same two nodes as `create-chat`, and with no characters to greet with
 * they write nothing: creation is still a run, with a receipt saying so, and
 * a genre that later seats a greeting-bearing envoy has the node to do it in.
 * The genre's declaration — envoys included — rides `meta.genre` on the
 * version row, which is where the host reads "which speakers does this genre
 * bring" from (`listSessionGenres`).
 */
export declare const createGuideSpec: () => import("@serene-pub/sdk").SpecDocument;
export declare const GUIDE_RESPOND_SPEC_ID = "core:spec/guide-respond";
export declare const GUIDE_RESPOND_VERSION = "1.0.0";
/** The guide's reply: the envoy answers, grounded in the docs. */
export declare const guideRespondSpec: () => import("@serene-pub/sdk").SpecDocument;
//# sourceMappingURL=guide.d.ts.map