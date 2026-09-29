/**
 * A minimal template engine, enough to demonstrate variable awareness (16 §4).
 *
 * Supports `{{ a.b.c }}` and `{% for x in items %}…{% endfor %}`. Not Jinja — just
 * enough surface to answer the question the docs make a promise about: *can the editor
 * tell an author which variables exist, and flag one that doesn't?*
 *
 * ⚠ Writing this surfaced a correction to 16 §4 — see `templateScope`.
 */
import type { I18n, SlotDecl } from './descriptors.js';
import type { FieldDecl } from './settings.js';
/** @experimental */
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
 * @experimental
 */
export declare function extractRefs(src: string): TemplateRef[];
/** Render. Missing values become empty strings — templates never throw at run time. @experimental */
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
 * @experimental
 */
export type VarType = 'string' | 'number' | 'boolean'
/** A fixed set of named fields — `fields`. */
 | 'object'
/** A positional collection — `of` describes an element. */
 | 'list'
/** Keyed by author-chosen strings — `of` describes a value. */
 | 'record';
/** @experimental */
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
 * @experimental
 */
export type VarDecl = VarField | 'any' | string[];
/** @experimental */
export type TemplateScope = Record<string, VarDecl>;
/** @experimental */
export declare function templateScope(decl: {
    variables?: TemplateScope;
} | undefined): TemplateScope;
/**
 * What a template check found wrong.
 *
 * `checkTemplate` (the mini engine) fills the first three; the source checker
 * (`@serene-pub/sdk/template-check`) fills the rest too — which name, where in
 * the source, and what was there instead.
 * @experimental
 */
export interface TemplateFinding {
    severity: 'error' | 'warning';
    message: string;
    fix: string;
    kind?: TemplateFindingKind;
    /** The root name (or helper) the finding is about, as the template spells it. */
    name?: string;
    /** The whole reference as written — `characters.nmae`, `../injectionsByIndx`. */
    path?: string;
    /** 1-based, as both engines report it. */
    line?: number;
    column?: number;
    /** 0-based offsets of the reference in the source. */
    start?: number;
    end?: number;
    /** The enclosing tag (`{{ … }}`), when the engine reports one. */
    tag?: {
        start: number;
        end: number;
    };
    /** What does exist where the name was looked up. */
    available?: string[];
    /** The nearest of `available`, when one is near enough to say "did you mean". */
    suggestion?: string;
}
/**
 * - `syntax` — the source does not parse (always an error).
 * - `unknown-name` — a root the scope does not have.
 * - `unknown-path` — a field the declared type contradicts.
 * - `unknown-helper` — a Handlebars helper nobody registered.
 * @experimental
 */
export type TemplateFindingKind = 'syntax' | 'unknown-name' | 'unknown-path' | 'unknown-helper';
/**
 * What a host's engines register, as names — the checker's input
 * (`@serene-pub/sdk/template-check`). Declared here, on the barrel, so a
 * dependency-free module can take a checker as a value without importing the
 * engines (typed templates P5).
 * @experimental
 */
export interface TemplateCheckOptions {
    /** Handlebars helpers the host registers beyond the built-ins. */
    helpers?: Iterable<string>;
    /** What the host's Liquid instance registers — the checker parses with the same vocabulary. */
    liquid?: {
        /** `{% name %}…{% endname %}` tags; `key: value` arguments are read as expressions. */
        blockTags?: Iterable<string>;
        /** Filters beyond Liquid's own. Filters are strict: an unknown one does not parse. */
        filters?: Iterable<string>;
        /** Tags refused at parse time, each with the sentence that says why. */
        refusedTags?: Readonly<Record<string, string>>;
        /** Characters one parse may consume. */
        parseLimit?: number;
    };
    /**
     * `templateScopeReport().untyped` — producers whose keys reach the template
     * undeclared. Non-empty: name and path findings are warnings.
     */
    untyped?: readonly string[];
}
/** @experimental */
export interface TemplateSourceCheck {
    /**
     * False when nothing was looked at — an engine this checker does not read
     * (a plugin's), or an analyser that failed on a source that parsed. An
     * empty `findings` then means "not checked", never "clean".
     */
    checked: boolean;
    findings: TemplateFinding[];
}
/** @experimental */
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
 * @experimental
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
 * @internal
 */
export declare function resolvePath(decl: VarDecl | undefined, path: readonly string[], base?: string): PathResolution;
/** @internal */
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
 * @experimental
 */
export declare function checkValue(value: unknown, field: VarField, path?: string): string[];
/**
 * Check every key of a scope against the values a declaration samples for it.
 *
 * Legacy declarations are skipped rather than guessed at. `'any'` means
 * unchecked by definition, and a bare `string[]` carries no types to check
 * against — pretending otherwise would fail honest declarations that simply
 * predate the schema.
 * @experimental
 */
export declare function checkScopeSample(values: Record<string, unknown>, scope: TemplateScope, label?: string): string[];
/** An object's fields as TS: optional ones may be absent or null (see `VarField.optional`). */
type ObjectValue<Fs> = {
    -readonly [K in keyof Fs as Fs[K] extends {
        optional: true;
    } ? never : K]: VarValue<Fs[K]>;
} & {
    -readonly [K in keyof Fs as Fs[K] extends {
        optional: true;
    } ? K : never]?: VarValue<Fs[K]> | null;
};
/**
 * The TypeScript type of a value a declaration describes.
 *
 * `VarValue<{ type: 'record', of: { type: 'string' } }>` is
 * `Record<string, string>`. A declaration written as a literal (or `as const`)
 * types exactly; one widened to `VarField` — or `'any'` — is `unknown`, which
 * is the honest answer for a shape the compiler cannot see. What makes a
 * variable's `sample` and a layout's in-code fallback compile-checked.
 * @experimental
 */
export type VarValue<F> = F extends 'any' ? unknown : F extends readonly string[] ? {
    [K in F[number]]?: unknown;
} : F extends {
    type: 'string';
} ? string : F extends {
    type: 'number';
} ? number : F extends {
    type: 'boolean';
} ? boolean : F extends {
    type: 'list';
    of: infer O;
} ? VarValue<O>[] : F extends {
    type: 'record';
    of: infer O;
} ? Record<string, VarValue<O>> : F extends {
    type: 'object';
    fields: infer Fs;
} ? ObjectValue<Fs> : unknown;
/** Every root of a template scope, typed — `ScopeValues<typeof decl.scope>`. @experimental */
export type ScopeValues<S extends TemplateScope> = {
    -readonly [K in keyof S]: VarValue<S[K]>;
};
/**
 * A `FieldDecl`, in the template type language — `undefined` for what never enters a template.
 * @internal
 */
export declare function fieldToVarField(f: FieldDecl | undefined): VarField | undefined;
/**
 * What a slot's configured value looks like to a template, as a `VarField`.
 *
 * `prompts` — an object of the authored text fields, each a string.
 * `parameters` / `settings` — an object of the declared schema's fields, typed
 * from the field language; a `secret` field is left out, because a secret
 * never enters a template's scope. Every other kind (a template, a connection,
 * a variables slot) is not a value a template reads, and is `undefined`.
 * @experimental
 */
export declare function slotToVarField(slot: SlotDecl): VarField | undefined;
export {};
//# sourceMappingURL=template.d.ts.map