/**
 * What a Handlebars reference can reach, at one point in a template.
 *
 * Typed templates P4. The template checker (`@serene-pub/sdk/template-check`)
 * and a host's editor assist both need the same three answers — what `../`
 * climbs to, what a block param is bound to, and what one `{{#each}}` element
 * is — and when they were two copies they drifted: the assist treated an
 * `{{#if}}` as a new context, so a root name inside one was "unknowable". This
 * module is the one reading; it has no dependencies, so an editor that only
 * scans tags (it sees half-typed source, which no parser accepts) can use it
 * without the parser the checker carries.
 *
 * **Conservative by construction**: whatever the schema cannot speak to — an
 * `'any'` root, a record's author-chosen key, a subexpression's result —
 * resolves as *unchecked*, never as wrong.
 */
import type { PathResolution, TemplateScope, VarDecl, VarField } from './template.js';
/**
 * One Handlebars context and the names visible in it.
 *
 * A reach with no `context` and no `parent` is the root, where a name resolves
 * against the declared scope. Not a plugin frame (the sandboxed iframe a
 * widget renders in) — the word is `reach` precisely so the two never meet.
 * @experimental
 */
export interface HandlebarsReach {
    /** What `this` is here, when the schema says. */
    context?: VarField;
    /** The context is real but unknowable — check nothing against it. */
    unchecked: boolean;
    /** `as |a b|` bindings visible here: the value's type, or undefined (an index, a key). */
    params: ReadonlyMap<string, VarField | undefined>;
    /** The context `../` climbs to. Only `{{#each}}`/`{{#with}}` add one. */
    parent?: HandlebarsReach;
}
/** The root: names resolve against the scope. @experimental */
export declare const rootHandlebarsReach: () => HandlebarsReach;
/**
 * A path as Handlebars reads it: `../this.[extra lore].note` climbs one
 * context, is scoped (no helper, no block param), and walks
 * `['extra lore', 'note']`.
 * @experimental
 */
export interface HandlebarsPath {
    /** How many `../` it climbs. */
    depth: number;
    /** Written `this.`/`./` — never a block param. */
    scoped: boolean;
    /** `@index`, `@root.x` — Handlebars' own frame data, never the scope's. */
    data: boolean;
    /** The segments after the climb, brackets unwrapped. Empty = `this`. */
    parts: string[];
}
/**
 * Read a written path the way Handlebars' parser does, for a caller that only
 * has the text (an editor scanning tags). The checker reads the parser's own
 * AST instead and builds the same shape from it.
 * @experimental
 */
export declare function handlebarsPath(expr: string): HandlebarsPath;
/**
 * What a path resolved to.
 *
 * - `unchecked` — nothing can be said (off the top of the climb, frame data,
 *   an unknowable context). Never a finding.
 * - `unknown-root` — a root name the scope does not have. `available` is what
 *   it does have.
 * - `resolved` — `resolution` is the walk of `rest` from `base`; `ok: false`
 *   is a path the schema positively contradicts. `label` is the name the
 *   walk's messages start from (`c`, `characters`, `this`).
 * @experimental
 */
export type HandlebarsPathResolution = {
    kind: 'unchecked';
} | {
    kind: 'unknown-root';
    root: string;
    available: string[];
} | {
    kind: 'resolved';
    base: VarDecl | undefined;
    label: string;
    rest: string[];
    resolution: PathResolution;
};
/**
 * Resolve a path within a reach — Handlebars' own order: `../` climbs first; a
 * block param only answers an unscoped, unclimbed name; the root answers from
 * the scope; any other context answers from its type.
 * @experimental
 */
export declare function resolveHandlebarsPath(path: HandlebarsPath, reach: HandlebarsReach, scope: TemplateScope): HandlebarsPathResolution;
/** What a path's value is, as a declaration — undefined when unknowable. @experimental */
export declare function typeOfHandlebarsPath(path: HandlebarsPath, reach: HandlebarsReach, scope: TemplateScope): VarDecl | undefined;
/** A declaration that is a walkable field — not `'any'`, not the legacy name list. @experimental */
export declare function asVarField(decl: VarDecl | undefined): VarField | undefined;
/**
 * The reach a block's body sees.
 *
 * Only `each` and `with` move the context, and only they give `../` a step to
 * climb; `if`, `unless` and every other block helper keep the reach they were
 * opened in (plus any `as |x|` names, unchecked). `each` binds its first param
 * to one element and the second to the index or key; `with` binds it to the
 * value itself.
 *
 * An `{{else}}` branch of `each`/`with` runs in the reach the block was opened
 * in — the caller keeps that one, it is not this.
 * @experimental
 */
export declare function enterHandlebarsBlock(reach: HandlebarsReach, helper: string, target: VarDecl | undefined, blockParams?: readonly string[]): HandlebarsReach;
/**
 * The nearest name, when there is an obviously-nearest one — the "did you
 * mean" half of a finding.
 *
 * Deliberately tight: within one edit for a name of four characters or fewer,
 * two otherwise. A wrong guess sends someone to change a line that was
 * correct, which costs more than saying nothing. Ties resolve alphabetically,
 * so the answer is stable.
 * @experimental
 */
export declare function nearestName(typed: string, available: readonly string[]): string | undefined;
//# sourceMappingURL=handlebarsReach.d.ts.map