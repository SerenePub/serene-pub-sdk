/**
 * Validation — the Fixed Ledger laws that can be checked statically.
 *
 * Every finding names what to do instead (15 §1.3). A prohibition without a stated
 * alternative is a bug, and there is a test asserting exactly that.
 */
import { type SpecDocument } from './document.js';
import { type TemplateChecking } from './templateFit.js';
/** @experimental */
export interface Finding {
    law: string;
    severity: 'error' | 'warning';
    nodeKey?: string;
    message: string;
    /** What to do instead — required for every error. */
    fix: string;
}
/**
 * What `validate()` is handed beyond the document. @experimental
 */
export interface ValidateOptions {
    /**
     * The template checker, for law T1's name check (typed templates P5):
     * `{ check: checkTemplateSourceReport }` from `@serene-pub/sdk/template-check`,
     * plus the host's vocabulary. A value rather than an import because the
     * checker carries the engines and this module is on the dependency-free
     * barrel. Absent, T1 still refuses scope collisions, forbidden kinds and a
     * band with no variable; it does not read template sources.
     */
    templates?: TemplateChecking;
}
/** @experimental */
export declare function validate(doc: SpecDocument, options?: ValidateOptions): Finding[];
/**
 * The streaming step and the step status, as declared on `expose` (lair
 * pass B3/B18; owner D6 and D5, 2026-09-27).
 *
 * Which oracle streams into the reply is **declared**, never inferred: the
 * inference it replaced skipped every oracle inside a clause and streamed the
 * Lair's planner JSON into the row. What a declaration can still get wrong is
 * refused here, each with the fix:
 *
 *  · **a JSON step never streams** — a step whose `main` out-port is not a
 *    streaming shape (`generate-json`, whose `main` is `core:shape/json@1`)
 *    would write its document into the row a person is reading;
 *  · **one per execution path** — a run has one live row, and two streams
 *    interleave or concatenate into it. Two steps that can never run in the
 *    same execution may each stream (W2, 2026-09-27): they sit in different
 *    branches of one junction whose predicates are mutually exclusive — one
 *    is the `otherwise`, or both are `equals` on the same path with different
 *    literals. The runtime streams whichever one runs. Anything weaker (a
 *    `truthy`, an `equalsPath`, two different paths) could fire both, so it
 *    is refused, and so is a step on the spine beside one in a branch;
 *  · **never in an each or a loop** — the step would stream once per pass
 *    into the same row;
 *  · **an oracle** — only an oracle has a model's tokens to stream.
 *
 * A step status is display text (R-20).
 * @internal
 */
export declare function streamingStepFindings(doc: SpecDocument): Finding[];
/** @experimental */
export declare function assertValid(doc: SpecDocument, options?: ValidateOptions): void;
/**
 * The R-20 findings over one stored document: presets, and the genre
 * declaration a create pipeline carries. Read as `unknown` throughout — a
 * document may have come from anywhere — so a wrong shape is a sentence,
 * never a throw.
 * @experimental
 */
export declare function documentDisplayTextFindings(doc: SpecDocument): string[];
//# sourceMappingURL=validate.d.ts.map