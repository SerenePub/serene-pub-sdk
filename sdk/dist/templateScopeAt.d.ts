/**
 * What a template can reference at one node of one document, typed (typed
 * templates P3, 2026-09-27).
 *
 * ```ts
 * const scope = templateScopeAt(doc, 'prompt', { genre: 'showcase.twenty-questions:genre/game' })
 * scope.characters          // { type: 'string', … } — the context builder's port schema
 * scope.secretEntry         // { type: 'string', … } — a band declared upstream
 * scope.annex.fields['showcase.twenty-questions'].fields.secret // the annex declaration
 * ```
 *
 * The scope is the union, checked for collisions, of:
 *
 * | Root | Where it comes from |
 * |---|---|
 * | the node's own names | the template slot's static `variables` — Assemble's are what `render()` supplies |
 * | the `prompts` slot's fields | `slotToVarField`, followed through a slot reference (`slot.prompts({ node })`, an envoy's) |
 * | the context builder's keys | the declared out-port schema (`Descriptor.portSchemas`) of whatever feeds a template-context in-port |
 * | one per declared band | `rendersAt` over the node's `variables` slot — the laid-out string |
 * | `annex` | every declared annex key of every owner in scope (`annexVarFieldOf`), as `annex.<owner>.<key>` — only where the node's `annex` in-port is wired (P6) |
 * | `state` | the builder's `state`, re-typed from the genre's attribute slots |
 *
 * **Order is `render()`'s.** The node's own names are the last word — Assemble
 * spreads the prompts and the context first and writes its own after, so a
 * builder's placeholder `sessionMessages` is superseded, not a collision.
 * Anything else two declarers both claim is refused naming both
 * (`BandCollisionError`), because a template reading it would get one or the
 * other depending on spread order.
 *
 * **Safe (owner ruling Q1, 2026-09-27).** Everything rendered into the context
 * may be in scope, and nothing dangerous is ever declared: annex declarations
 * refuse secrets at write time (R61). What this refuses on top is the
 * *kinds* no template may reach by any door — a secret, connection / sampling
 * / endpoint / model identity (R53), debug metadata, embeddings — by name,
 * anywhere in the tree (`ForbiddenTemplateFieldError`).
 *
 * The runtime value of `annex` arrives on the node's `annex` in-port, from
 * `core:query/session-annex@1` with `view: 'template'` (P6, law T2); the
 * scope carries it only where that port is wired.
 * @experimental
 */
import { type AttributeSlotDecl } from './attributes.js';
import { type BandSource } from './bands.js';
import { type SlotDecl } from './descriptors.js';
import type { DocEdge, DocNode } from './document.js';
import { type TemplateScope, type VarField } from './template.js';
import { type VariableDecl } from './variables.js';
/**
 * What `templateScopeAt` needs from a node's definition. A `Descriptor`
 * satisfies it, and so does a registry row read as `{ slots, ports, bands:
 * policy.bands, portSchemas: policy.portSchemas }` — so a host answers from
 * rows without loading a plugin (F6).
 * @experimental
 */
export interface ScopeSource extends BandSource {
    slots?: Record<string, SlotDecl>;
    portSchemas?: {
        out?: Record<string, VarField>;
    };
}
/** @experimental */
export interface TemplateScopeEnv {
    /** Which template slot. Default: the node's first `template` slot. */
    slot?: string;
    /** A node's definition. Default: the registry in this process. */
    describe?: (node: DocNode) => ScopeSource | undefined;
    /** A registered variable, for a band's description. Default: `getVariable`. */
    variable?: (id: string) => VariableDecl | undefined;
    /** The session genre. Default: the document's inlet genre. */
    genre?: string;
    /** The annex owners in scope. Default: every owner declared in this process. */
    owners?: readonly string[];
    /** An owner's annex as a template variable. Default: `annexVarFieldOf`. */
    annexOf?: (owner: string, genre?: string) => VarField | undefined;
    /** The attribute slots `state` is typed from. Default: `genreSlots(genre)`. */
    slots?: readonly AttributeSlotDecl[];
}
/** @experimental */
export interface TemplateScopeReport {
    scope: TemplateScope;
    /** Who declared each root — `'context' (core:task/build-template-context@1).templateContext`. */
    declarers: Record<string, string>;
    /**
     * Producers feeding a template-context in-port with no declared schema:
     * their keys reach the template untyped, so a checker must not refuse an
     * unknown root while this is non-empty. Not a finding — `portSchemas` is
     * optional, and a port without one is `'any'`, as every port was.
     */
    untyped: string[];
    /** What is wrong but not fatal — each names the fix. */
    findings: string[];
}
/** A kind no template may reach by any door (typed templates §1 "safe" iv, R53). @experimental */
export declare class ForbiddenTemplateFieldError extends Error {
}
/**
 * Names that ARE a forbidden kind, compared case-blind: a connection, sampling,
 * endpoint or model identity (R53), debug metadata, embeddings, a secret value.
 * Deliberately names rather than shapes — a `VarField` has no kind for any of
 * these, which is exactly why one would arrive disguised as a `string`.
 * @experimental
 */
export declare const FORBIDDEN_TEMPLATE_NAMES: readonly string[];
/**
 * The scope, who declared each root, and what is untyped or wrong.
 * Throws `BandCollisionError` on a root two declarers claim, and
 * `ForbiddenTemplateFieldError` on a forbidden kind.
 * @experimental
 */
export declare function templateScopeReport(doc: {
    nodes: readonly DocNode[];
    edges: readonly DocEdge[];
    input?: {
        genre?: string;
    };
}, nodeKey: string, env?: TemplateScopeEnv): TemplateScopeReport;
/** The in-port a template node reads the annex on (P6). @experimental */
export declare const TEMPLATE_ANNEX_PORT = "annex";
/**
 * The typed scope of a template slot at `nodeKey` — see the module note.
 * Throws on a root collision (naming both declarers) and on a forbidden kind.
 * @experimental
 */
export declare function templateScopeAt(doc: {
    nodes: readonly DocNode[];
    edges: readonly DocEdge[];
    input?: {
        genre?: string;
    };
}, nodeKey: string, env?: TemplateScopeEnv): TemplateScope;
//# sourceMappingURL=templateScopeAt.d.ts.map