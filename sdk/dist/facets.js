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
import { refuseUnlessIdentical } from './hash.js';
const facets = new Map();
export function defineFacet(decl) {
    const existing = facets.get(decl.id);
    if (existing)
        refuseUnlessIdentical(existing, decl, `duplicate facet: ${decl.id}`);
    facets.set(decl.id, decl);
    return decl;
}
export const getFacet = (id) => facets.get(id);
export const allFacets = () => [...facets.values()].sort((a, b) => a.order - b.order);
export function _clearFacets() {
    facets.clear();
}
// ── Core's facets ───────────────────────────────────────────────────────────
//
// The order and headings the panel shipped with, now stated where the slots
// that reference them can be read beside them.
defineFacet({ id: 'prompts', i18n: { en: 'Prompt' }, order: 0, simple: true });
defineFacet({ id: 'connection', i18n: { en: 'Model' }, order: 1, simple: true });
/** Shares "Model" with `connection` — one question, two slots. */
defineFacet({ id: 'sampling', i18n: { en: 'Model' }, order: 2, simple: true });
defineFacet({ id: 'variables', i18n: { en: 'Layout' }, order: 3 });
defineFacet({ id: 'templates', i18n: { en: 'Template' }, order: 4 });
defineFacet({ id: 'weights', i18n: { en: 'Tuning' }, order: 5 });
defineFacet({ id: 'review', i18n: { en: 'Review' }, order: 6, simple: true });
/** `context-budget` and friends declare a bare `parameters` slot. */
defineFacet({ id: 'params', i18n: { en: 'Tuning' }, order: 5 });
//# sourceMappingURL=facets.js.map