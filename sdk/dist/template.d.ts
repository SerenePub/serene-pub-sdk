/**
 * A minimal template engine, enough to demonstrate variable awareness (16 §4).
 *
 * Supports `{{ a.b.c }}` and `{% for x in items %}…{% endfor %}`. Not Jinja — just
 * enough surface to answer the question the docs make a promise about: *can the editor
 * tell an author which variables exist, and flag one that doesn't?*
 *
 * ⚠ Writing this surfaced a correction to 16 §4 — see `templateScope`.
 */
import type { I18n } from './descriptors.js';
export interface TemplateRef {
    /** The root identifier, e.g. `message` in `{{ message.author.name }}`. */
    root: string;
    path: string[];
    /** True when the reference is inside a loop and bound by it. */
    bound: boolean;
    dynamic: boolean;
}
/**
 * Extract top-level variable references. Loop-bound names are marked so they are not
 * reported as unknown, and anything computed is marked dynamic rather than verified —
 * an editor that promises correctness and lets a typo through is worse than one that
 * says what it checks (16 §4).
 */
export declare function extractRefs(src: string): TemplateRef[];
/** Render. Missing values become empty strings — templates never throw at run time. */
export declare function render(src: string, baseScope: Record<string, unknown>): string;
/**
 * ⚠ CORRECTION TO 16 §4.
 *
 * The docs say template variable awareness "falls out of typed ports with no new
 * mechanism." Building it shows that is only true for the **assembly** template, whose
 * scope really is its input ports.
 *
 * A **source** template renders one *item* out of a collection — one lorebook entry, one
 * message — and the item's shape lives *inside* the port's payload, not on the port. No
 * amount of port typing recovers it.
 *
 * So the template slot must **declare its own variable scope**. That is one extra field on
 * the descriptor, not a new mechanism, but the docs currently claim something that isn't
 * quite true and would have been discovered by the first plugin author who tried it.
 */
/**
 * The kinds a declared value can be.
 *
 * Deliberately closed and deliberately small. This is not JSON Schema: an
 * editor has to *walk* this to offer completions, and every case it cannot walk
 * is a case where the author is back to guessing. Six kinds cover every value
 * core renders, and a seventh should have to earn its place by naming the
 * variable that needs it.
 */
export type VarType = 'string' | 'number' | 'boolean'
/** A fixed set of named fields — `fields`. */
 | 'object'
/** A positional collection — `of` describes an element. */
 | 'list'
/** Keyed by author-chosen strings — `of` describes a value. */
 | 'record';
export interface VarField {
    type: VarType;
    /** Shown in the editor's completion list and on hover. */
    description?: I18n;
    /** `object` — the fields it carries. */
    fields?: Record<string, VarField>;
    /** `list` / `record` — the shape of each entry. */
    of?: VarField;
    /**
     * May be absent, or present and null.
     *
     * The two are one flag rather than two because a template cannot tell them
     * apart: `{{ this.personality }}` renders empty either way. What the author
     * needs to know is "do not promise this will be here", and that is the same
     * answer for a dropped key and a null one.
     */
    optional?: boolean;
}
/**
 * What one root name in a template's scope is.
 *
 * The two legacy forms stay valid, and stay *meaningfully* valid rather than
 * being quietly coerced:
 *
 * - `'any'` means unchecked. It is what every variable said before schemas
 *   existed and it is still the honest answer for a value whose shape genuinely
 *   varies.
 * - `string[]` is a bare list of field names, untyped and unnested.
 *
 * Neither is an error. A plugin published against the old form keeps working
 * across this upgrade, which is the whole reason they survive — lint can nudge
 * an author toward a real schema, but an upgrade that broke every third-party
 * node's declaration to buy nothing but tidiness is not a trade worth making.
 */
export type VarDecl = VarField | 'any' | string[];
export type TemplateScope = Record<string, VarDecl>;
export declare function templateScope(decl: {
    variables?: TemplateScope;
} | undefined): TemplateScope;
export interface TemplateFinding {
    severity: 'error' | 'warning';
    message: string;
    fix: string;
}
export declare function checkTemplate(src: string, scope: TemplateScope): TemplateFinding[];
/**
 * Walking a path against a schema.
 *
 * The whole point of widening `TemplateScope` was to be able to answer "is
 * `{{ this.nickanme }}` a field?" — and answering it needs one rule the
 * name-only lint never had to state: **what may go unchecked stays unchecked**.
 * A declaration that says `'any'`, a legacy `string[]`, a record's
 * author-chosen key — none of those can be verified, and reporting them would
 * put a red squiggle under working templates. A lint that cries wolf gets
 * turned off, and then it catches nothing at all.
 *
 * So `ok: false` is reserved for a path the schema positively contradicts.
 * Everything else resolves, with `checked` saying whether the answer means
 * anything downstream.
 */
export interface PathResolution {
    ok: boolean;
    /** The type at the end of the path, when one is known. */
    field?: VarField;
    /** Whether the schema could actually speak to this path. */
    checked: boolean;
    /** The segment that failed. */
    at?: string;
    /** What does exist there, when that is a listable answer. */
    available?: string[];
    message?: string;
}
/**
 * Resolve `path` against a declared type.
 *
 * `list` is the interesting case. A list is reached by *position*, so
 * `characters.name` is not a near-miss to be corrected — it is a category
 * error, and saying so is the whole reason the old flattened `string[]` form
 * had to go: it accepted exactly that and rejected `characters.0.name`.
 */
export declare function resolvePath(decl: VarDecl | undefined, path: readonly string[], base?: string): PathResolution;
export declare function elementOf(decl: VarDecl | undefined): VarField | undefined;
/**
 * Does a value match a declared schema?
 *
 * This exists so a `sample` and its `scope` cannot drift apart. A sample is not
 * decoration: it is what the layout editor renders a live preview against, so a
 * sample whose shape is wrong shows the author a preview that works and a chat
 * that doesn't — a lie told at exactly the moment they are trusting the tool.
 * The declaration and the example of it have to be checkable against each
 * other, and this is the check.
 *
 * Findings are errors, not warnings, and an undeclared key is one of them. A
 * sample carrying a field the schema omits means the schema is incomplete, and
 * an incomplete schema is a completion list missing an entry the author needs —
 * silently, with no way to tell it apart from a field that truly is not there.
 */
export declare function checkValue(value: unknown, field: VarField, path?: string): string[];
/**
 * Check every key of a scope against the values a declaration samples for it.
 *
 * Legacy declarations are skipped rather than guessed at. `'any'` means
 * unchecked by definition, and a bare `string[]` carries no types to check
 * against — pretending otherwise would fail honest declarations that simply
 * predate the schema.
 */
export declare function checkScopeSample(values: Record<string, unknown>, scope: TemplateScope, label?: string): string[];
//# sourceMappingURL=template.d.ts.map