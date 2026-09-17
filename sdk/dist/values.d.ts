/**
 * The value-type system (24 §8).
 *
 * Authoring goes through a toolkit facade — `v.integer({})`, `v.weights({})`,
 * `v.stackedBar({})` — for ergonomics and dot-discoverability; the output is
 * always **frozen plain data** in single-key typed serialization:
 *
 *     v.integer({ min: 0, max: 4096 })  →  { "integer@1": { min: 0, max: 4096 } }
 *
 * The key IS the type id, versioned exactly like node types: `integer@2` is a
 * new key, never a mutated schema under the old one. Package-minted kinds
 * serialize namespaced (`acme.dice:roll@1`) via a context-bound toolkit, so
 * collision with core or another package is impossible by construction.
 * Unknown keys degrade safely: consumers render a read-only fallback and
 * refuse writes to types they cannot validate.
 *
 * Constraints come in two tiers, both pure data (24 §8):
 *  - T1 declarative: min/max/step/pattern/options; group: sumTo/normalize.
 *  - T2 predicates: `requiredWhen`/`visibleWhen`/`enabledWhen`, reusing the
 *    route-predicate shape ({path, equals, truthy}) — declarations that read
 *    as sentences, renderable without running anything.
 * T3 (validator code) is deliberately absent.
 *
 * Four consumers key off the same id — factory (here), validator (here),
 * control renderer (@serene-pub/controls), scaffold printer (cli) — and a
 * conformance canary asserts no shipped type is missing any of the four.
 */
/** One condition over sibling values — the route-predicate shape (20 §10). */
export interface ValuePredicate {
    /** Dot path into the sibling value map. */
    path: string;
    /** Fires when the value strictly equals this literal. */
    equals?: unknown;
    /** Fires when the value is truthy. */
    truthy?: boolean;
}
/** Fields every declaration may carry, regardless of kind. */
export interface ValueCommon {
    label?: unknown;
    description?: unknown;
    /**
     * No shipped default — a config MUST supply this value. Requiredness is
     * what makes "missing" a fact the coverage report can state (24 §7).
     */
    required?: boolean;
    requiredWhen?: ValuePredicate;
    visibleWhen?: ValuePredicate;
    enabledWhen?: ValuePredicate;
}
/**
 * A value declaration in single-key form: exactly one key, which is the
 * versioned type id; the payload is that type's own schema.
 */
export type ValueDecl = {
    readonly [definitionId: string]: Record<string, unknown>;
};
/** The one key of a declaration — its type id. Throws on malformed decls. */
export declare function valueKind(decl: ValueDecl): string;
export declare function assertValueTypeId(id: string): void;
export interface IntegerProps extends ValueCommon {
    min?: number;
    max?: number;
    step?: number;
    default?: number;
}
export interface NumberProps extends ValueCommon {
    min?: number;
    max?: number;
    step?: number;
    default?: number;
}
export interface WeightsProps extends ValueCommon {
    /** Part name → author-default weight. The parts are the group. */
    parts: Record<string, number>;
    /**
     * The pinned sum (100 for percents, 1 for fractions). Absent = free
     * weights; add `normalize: true` when the consumer reads them normalized.
     */
    total?: number;
    step?: number;
    /** Per-part floor/ceiling. */
    min?: number;
    max?: number;
    normalize?: boolean;
    /** Which control edits this — presentation, not domain. */
    control?: 'stacked-bar' | 'sliders';
}
export interface SelectProps extends ValueCommon {
    /**
     * A closed set. `description` is part of the option because the control
     * shows it under the picker — a stored value like `rag` is not a word
     * anybody chose to read, and the place to say what it means is the
     * declaration, not the host.
     */
    options: ReadonlyArray<string | {
        value: string;
        label?: unknown;
        description?: unknown;
    }>;
    default?: string;
}
export interface RankingProps extends ValueCommon {
    /** The orderable set; the value is a permutation of it. */
    options: ReadonlyArray<string>;
    default?: ReadonlyArray<string>;
}
export interface TextProps extends ValueCommon {
    minLength?: number;
    maxLength?: number;
    /** Anchored ECMAScript regex source. */
    pattern?: string;
    default?: string;
    multiline?: boolean;
}
export interface BooleanProps extends ValueCommon {
    default?: boolean;
}
/** A prompts-ref slot: the value is a reference to a shipped/named prompt. */
export interface PromptProps extends ValueCommon {
}
export interface ValueToolkit {
    integer(props?: IntegerProps): ValueDecl;
    number(props?: NumberProps): ValueDecl;
    /** Sugar: a number in [0, 1] with a 0.01 step. */
    fraction(props?: Omit<NumberProps, 'min' | 'max'>): ValueDecl;
    weights(props: WeightsProps): ValueDecl;
    /** Sugar: weights rendered as a stacked bar. */
    stackedBar(props: Omit<WeightsProps, 'control'>): ValueDecl;
    select(options: SelectProps['options'] | SelectProps, props?: Omit<SelectProps, 'options'>): ValueDecl;
    ranking(options: RankingProps['options'], props?: Omit<RankingProps, 'options'>): ValueDecl;
    text(props?: TextProps): ValueDecl;
    boolean(props?: BooleanProps): ValueDecl;
    prompt(props?: PromptProps): ValueDecl;
    /**
     * A package-minted kind. With a context-bound toolkit the id is prefixed
     * with the package namespace automatically; the bare toolkit refuses,
     * because an unprefixed custom kind could shadow a future core one.
     */
    custom(kind: string, version: number, props: Record<string, unknown>): ValueDecl;
}
/**
 * Construct a toolkit. `ns` is the declaring package's namespace — the
 * context-bound form `announce()` hands authors — and prefixes every custom
 * kind. The bare exported `v` has no namespace and mints no custom kinds.
 */
export declare function makeValueToolkit(ns?: string): ValueToolkit;
/** The bare toolkit: core kinds only, no custom minting. */
export declare const v: ValueToolkit;
type Validator = (schema: Record<string, unknown>, value: unknown) => string[];
/**
 * Validators for the shipped kinds, keyed by type id. Kept beside the
 * factories so adding a kind is one edit — the conformance canary refuses a
 * factory output whose kind has no validator here.
 */
export declare const valueValidators: Record<string, Validator>;
/**
 * Validate one value against its declaration. Unknown type ids refuse —
 * a consumer must never accept a write it cannot check (24 §8).
 */
export declare function validateValue(declaration: ValueDecl, value: unknown): string[];
/**
 * A deliberate hole (24 §7): type-checks wherever a value goes, so authoring
 * can continue — but the coverage report lists it as a named gap, and
 * validation refuses it like any other unknown.
 */
export declare function todo(note: string): {
    'todo@1': {
        note: string;
    };
};
export declare const isTodo: (value: unknown) => value is {
    'todo@1': {
        note: string;
    };
};
/** Every kind the bare toolkit can mint — the registry the canary checks. */
export declare const shippedValueKinds: readonly string[];
/**
 * The bridge from the settings-schema vocabulary (`{type:'integer', …}` on
 * node-type slots) to value declarations (24 T6c). Derived at read, never
 * stored — no document or hash changes — so panels and controls can speak
 * the value-decl contract while the schemas migrate underneath at their own
 * pace. Unknown entry types map to nothing, and the caller keeps its
 * legacy rendering for them.
 */
export declare function valueDeclOf(entry: unknown): ValueDecl | null;
export {};
//# sourceMappingURL=values.d.ts.map