/**
 * Does this template fit this node? (typed templates P5, 2026-09-27)
 *
 * The refusals of design §4, in one place: a template is checked against the
 * typed scope of the node that renders it (`templateScopeReport`), and a name
 * or path nothing there supplies is REFUSED — at selection (the host), at a
 * spec's save and publish (law T1, `validate()`), and at packaging (a plugin's
 * shipped template seeds). Warnings never refuse, and nor does anything while
 * a producer upstream declares no types (`untyped`): its keys may still
 * arrive, so the checker only warns (owner Q6: refuse new selections and new
 * saves; a stored row becomes a notice, never a retroactive refusal).
 *
 * ## The checker is a value
 *
 * The checker parses with the real engines (`@serene-pub/sdk/template-check`,
 * which carries `handlebars` and `liquidjs`); this module is on the barrel,
 * which stays dependency-free. So every door here takes the checker as an
 * argument — `{ check: checkTemplateSourceReport }` — and a caller without one
 * gets the checker-free half of T1 (scope collisions, forbidden kinds, a band
 * with no variable) and no name check. One way to check; the engines stay
 * where they were imported on purpose.
 *
 * ## What refuses
 *
 * `SCOPE_FINDING_KINDS` — `unknown-name` and `unknown-path` at error
 * severity. A syntax finding and an unknown helper depend on the host's
 * vocabulary (its helpers, its Liquid tags), which a spec document and a
 * package do not carry; a host that passes its own vocabulary may widen
 * `refuse`.
 * @experimental
 */
import { type BandSource } from './bands.js';
import type { DocEdge, DocNode } from './document.js';
import type { TemplateValue } from './engines.js';
import type { TemplateCheckOptions, TemplateFinding, TemplateFindingKind, TemplateScope, TemplateSourceCheck } from './template.js';
import type { TemplateSeed } from './templateIds.js';
import { type ScopeSource, type TemplateScopeEnv } from './templateScopeAt.js';
/** `checkTemplateSourceReport` from `@serene-pub/sdk/template-check`, as a value. @experimental */
export type TemplateSourceChecker = (engine: string, source: string, scope: TemplateScope, options?: TemplateCheckOptions) => TemplateSourceCheck;
/** How to check a template's names: the checker, the host's vocabulary, what refuses. @experimental */
export interface TemplateChecking {
    check: TemplateSourceChecker;
    /** The host's helpers and Liquid vocabulary. `untyped` is filled in per node. */
    options?: TemplateCheckOptions;
    /** Error findings of these kinds refuse. Default: {@link SCOPE_FINDING_KINDS}. */
    refuse?: readonly TemplateFindingKind[];
}
/** What a scope decides — a name or a path nothing supplies. @experimental */
export declare const SCOPE_FINDING_KINDS: readonly TemplateFindingKind[];
/** @experimental */
export interface TemplateFit {
    /** False when the checker could not read the engine — nothing was judged. */
    checked: boolean;
    /** Producers whose keys reach the template undeclared; non-empty means nothing refuses. */
    untyped: string[];
    /** Error findings of a refusing kind. Non-empty: refuse, with {@link templateFitSentence}. */
    refusals: TemplateFinding[];
    /** Everything else the checker said. Shown, never refused. */
    warnings: TemplateFinding[];
}
type Doc = {
    nodes: readonly DocNode[];
    edges: readonly DocEdge[];
    input?: {
        genre?: string;
    };
};
/**
 * Check `template` against the typed scope of its template slot at `nodeKey`.
 * Throws what `templateScopeReport` throws — a root two declarers claim, a
 * forbidden kind — because then the document is wrong, not the template.
 * @experimental
 */
export declare function templateFit(doc: Doc, nodeKey: string, template: TemplateValue, checking: TemplateChecking, env?: TemplateScopeEnv): TemplateFit;
/**
 * The refusal, in the design's words:
 *
 * > 'speakPrompt' can't render 'Riddle layout': it uses `secretEntri`, which
 * > nothing supplies here. Did you mean `secretEntry`? Available: …
 *
 * `where` names the step (a node key); `what` names the template (its name, or
 * "the 'x' preset's template").
 * @experimental
 */
export declare function templateFitSentence(where: string, what: string, refusals: readonly TemplateFinding[]): string;
/** The finding shape `validate()` returns — structural, so this module does not import it. */
interface LawFinding {
    law: string;
    severity: 'error' | 'warning';
    nodeKey?: string;
    message: string;
    fix: string;
}
type Describe = (node: DocNode) => (ScopeSource & BandSource) | undefined;
/**
 * Law T1 over one document (design §4.2):
 *
 * - a root two declarers claim at a template node, or a forbidden kind in its
 *   scope — refused, naming both declarers (`templateScopeReport`);
 * - a band reaching a `rendersBands` slot whose variable is not registered —
 *   refused (a band with no variable renders under a name nothing declares);
 * - with `checking`: every template source the document carries (a node's
 *   configured value, each preset's) is checked against the typed scope of
 *   the slot it fills, and a name or path nothing supplies is refused.
 *
 * Also law T2 (P6, `annexPortFindings`): the annex in-port.
 *
 * Errors only: a warning is the editor's and the receipt's to say.
 * @experimental
 */
export declare function templateLawFindings(doc: Doc & {
    presets?: ReadonlyArray<{
        slug: string;
        values: ReadonlyArray<{
            nodeKey: string;
            slot: string;
            value: unknown;
        }>;
    }>;
}, checking?: TemplateChecking, env?: Omit<TemplateScopeEnv, 'slot'>): LawFinding[];
/** The one query that may feed a template's annex in-port, and the view it must read. @experimental */
export declare const TEMPLATE_ANNEX_QUERY = "core:query/session-annex";
/** @experimental */
export declare const TEMPLATE_ANNEX_VIEW = "template";
/**
 * Law T2 (typed templates P6, owner ruling Q1): a template node's `annex`
 * in-port is fed only by `core:query/session-annex@1` reading `view:
 * 'template'` — every declared key of every owner in scope, and nothing a
 * declaration does not cover — and a template-view read feeds nothing but
 * such a port. Either half broken would put undeclared data into a prompt, or
 * the prompt's data somewhere a prompt is not. Errors only.
 * @experimental
 */
export declare function annexPortFindings(doc: Doc, describe?: Describe): LawFinding[];
/** One refused seed: which, where, and the sentence. @experimental */
export interface TemplateSeedFinding {
    /** The seed's template id. */
    template: string;
    /** The spec and node it was checked at. */
    specId: string;
    nodeKey: string;
    message: string;
    fix: string;
}
/**
 * Check a package's `context template` seeds (`TemplateSeed` kind
 * `template`) against every node of its own specs that renders them — the
 * seed's pool is the node definition, so each such node is a place it can be
 * selected. A seed no spec of the package places is left to the host, whose
 * selection check sees the spec that selects it.
 * @experimental
 */
export declare function templateSeedFindings(seeds: readonly TemplateSeed[], documents: ReadonlyArray<Doc & {
    id: string;
}>, checking: TemplateChecking, env?: Omit<TemplateScopeEnv, 'slot'>): TemplateSeedFinding[];
export {};
//# sourceMappingURL=templateFit.d.ts.map