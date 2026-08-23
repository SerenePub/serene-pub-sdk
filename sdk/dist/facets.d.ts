/**
 * What *kind* of setting something is, as a declaration.
 *
 * A slot already carries a `facet` — `prompts`, `weights`, `review` — and the
 * configuration panel groups on it, because a facet names a kind and never a
 * node key, a count or an order (05 §0a). What the panel did *not* have was any
 * way to know a facet's heading, its position, or whether it leads the panel or
 * sits behind the tuning door. All three lived in a hardcoded list in the
 * client.
 *
 * That list had the failure mode a hardcoded list always has: it was not a
 * fallback, it was the filter. Options were matched *into* it, so a facet the
 * client had never heard of — a plugin's `retrieval`, say — matched no group
 * and rendered **nowhere**. Settings that existed, were writable, and were
 * invisible.
 *
 * So a facet is declared here, and the client renders what it is sent. An
 * undeclared facet still gets a group of its own rather than disappearing:
 * unknown is not the same as absent, and the panel should say so.
 */
import type { I18n } from './descriptors.js';
export interface FacetDecl {
    id: string;
    /**
     * The heading it renders under.
     *
     * **Two facets sharing a heading are one group.** That is how `connection`
     * and `sampling` become a single "Model" section — they are different kinds
     * of setting and the same question to the person reading. Merging by
     * heading keeps that in data rather than in a client-side pairing.
     */
    i18n: I18n;
    /** Lower sorts first. A group takes the lowest order of its members. */
    order: number;
    /**
     * Leads the panel, rather than sitting behind the tuning door.
     *
     * The split is about audience, not importance: this panel is for people who
     * do not need to know what a pipeline is, and per-step weights belong in
     * the builder. They stay reachable either way.
     */
    simple?: boolean;
}
export declare function defineFacet(decl: FacetDecl): FacetDecl;
export declare const getFacet: (id: string) => FacetDecl | undefined;
export declare const allFacets: () => FacetDecl[];
export declare function _clearFacets(): void;
//# sourceMappingURL=facets.d.ts.map