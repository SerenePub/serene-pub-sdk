/**
 * Plugin settings — the schema an extension declares, and the four things core does
 * with it (12 §6).
 *
 * 12 §6 promises "the same schema strategy as node config and review steps — one
 * renderer, three uses." That promise is only real if it is literally the same
 * declaration, so `FieldDecl` here is the same shape node `params` use, plus the two
 * fields that only mean something for plugin settings (`scope`, `side`). An extension
 * author who has written a node's `params` schema already knows this one.
 *
 * One declaration, four uses:
 *
 *   1. **The form** core renders in plugin settings — no UI work by the author.
 *   2. **Validation** of stored values, on save and on update.
 *   3. **The manifest entry**, extracted statically by the compiler — never by running
 *      the author's code (F6, 03 §3).
 *   4. **Typed access** from the extension's own hooks: `settings.values` is inferred,
 *      so `apiKey` is a `SecretValue` and a mistyped key does not compile.
 *
 * ## The `secret` field, and why it is typed
 *
 * The ruling that produced this reads backwards at first. "SP declines custody of plugin
 * secrets" sounds safer than storing them — but an extension keeping credentials in its
 * own data directory has no key and no crypto facility, so the realistic outcome is
 * plaintext on the user's disk, unencrypted *and* unauditable. Declining custody produced
 * the worse result (13 §6).
 *
 * What makes accepting it defensible is that the field is **typed**, which is what lets
 * core mechanically redact it from receipts (F16), exclude it from export (12 §7) and
 * keep it write-only in the UI. A free-form column cannot tell a key from a note.
 */
import type { MediaKind } from './media.js';
import { type I18nText } from './i18n.js';
/** @experimental */
export interface SecretValue {
    readonly $secret: true;
    /** Ciphertext at rest; plaintext exists only inside the owning hook's invocation. */
    readonly value: string;
}
/** @experimental */
export declare const secret: (value: string) => SecretValue;
/** @internal */
export declare const isSecret: (v: unknown) => v is SecretValue;
/**
 * The one field language, for real this time.
 *
 * This file used to claim `FieldDecl` was "the same shape node `params` use,
 * plus `scope` and `side`". It was not: node params (`ParamDecl`) had `share`
 * and `perMember` and no `text`; settings had `text` and neither of the others;
 * one keyed its label `i18n`, the other `label`; and nothing anywhere converted
 * between them. Two languages, one promise, no adapter — so a control that
 * rendered plugin settings could not render node params, and a session mode
 * (whose `fields` are a `SettingsSchema`) could not declare a `share` control
 * that a node beside it could.
 *
 * This type is the merge of both, and `label` is the one display key.
 * @experimental
 */
export type FieldType = 'string' | 'text' | 'number' | 'integer' | 'boolean' | 'enum' | 'string[]' | 'secret'
/** Normalised `Record<string, number>` over `members` — ratios only, always
 *  totalling 100%, so there is no invalid state to explain. Zero is a
 *  member's off switch. */
 | 'share'
/** A plain number per band over `members` — a ceiling, a minimum, a count. */
 | 'perMember'
/**
 * An **independent** `0..1` strength per member, drawn as one bar each.
 *
 * Deliberately not a `share` with the normalisation switched off, and the
 * difference is the whole reason it is its own type. A share divides one
 * finite thing between its members, so raising one member necessarily
 * lowers the others and the total is always 100%. A strength answers "how
 * much does this count" one member at a time: every member may be 1 at
 * once, and turning one up takes nothing away from anything.
 *
 * Drawing them alike would teach the reader the wrong arithmetic — which is
 * exactly the confusion this type exists to prevent where the two sit on one
 * screen. `perMember` is the third of the family and the one with no range
 * at all: a count, a ceiling, a floor.
 */
 | 'strengths'
/**
 * A reference to stored media, by uuid. `accepts` narrows which kinds the
 * picker offers; absent means images, which is what almost every such field
 * wants and what makes the common declaration short.
 */
 | 'media'
/**
 * An **ordered list** of values, each satisfying one declaration (`item`).
 *
 * Ordered, and that is the whole reason it is not `string[]` with a wider
 * element type: the order *is* part of the value. A chain of scripts, the
 * blocks a prompt is assembled from, a fallback sequence of connections —
 * every one of those is a list somebody reorders, and a control that
 * rendered it as a set would drop the one thing being configured.
 *
 * The element declaration is a `FieldDecl` like any other, so a list of
 * numbers, a list of enums and a list of objects are one type rather than
 * three. Which is what keeps this general: node params, genre fields and
 * widget settings all speak this vocabulary, and none of them had a way to
 * say "several of these, in this order" until now.
 */
 | 'list'
/**
 * A fixed-key record whose members are themselves declarations (`fields`).
 *
 * Deliberately **fixed-key**: the members are declared, so a form can be
 * rendered from them and a stored value can be checked against them. A
 * free-form map is `text` with `format: 'json'`, which is what that escape
 * hatch is for — and the difference is exactly whether anything can tell a
 * mistyped key from a deliberate one.
 */
 | 'object';
export type { I18nText } from './i18n.js';
/** One band of a `share` / `perMember` / `strengths` control, or a labelled `enum` choice. @experimental */
export interface MemberDecl {
    /** The key inside the parameter's value object. */
    key: string;
    label?: I18nText;
    description?: I18nText;
    /**
     * Which colour this band takes, as an index rather than a value. The
     * declaration says *which* band this is; the client's palette says what
     * that looks like in the current theme. Out-of-range wraps.
     */
    tone?: number;
}
/** @experimental */
export interface FieldDecl<T extends FieldType = FieldType, O extends readonly string[] = readonly string[]> {
    type: T;
    label?: I18nText;
    description?: I18nText;
    default?: unknown;
    /**
     * One of the few settings people actually change on this node.
     *
     * A panel that lists every declared setting equally makes the reader find
     * the prompt among the thresholds every time. The author knows which few
     * are reached for; a client heuristic would be wrong differently on every
     * plugin. Presentation, not permission — nothing is hidden by it.
     */
    quick?: boolean;
    /**
     * Which lens renders this one field (05 §3), when it is not the slot's.
     *
     * A slot carries a `facet` and every field of it lands there — which is
     * right for a `params` slot of tunables and wrong for the substrate's
     * `settings` slot, whose `review` has always had a heading of its own
     * beside `enabled`'s. Declared on the field rather than special-cased in
     * the panel, so a plugin whose one slot holds a weight and a switch can
     * say the same thing. Absent means the slot's.
     */
    facet?: string;
    /**
     * For `share`, `perMember` and `strengths`: the bands, in render order.
     *
     * For an `enum`: each option's display text — `{ key, label, description? }`,
     * `key` the stored value. Declared **beside** `of` (which keeps the stored
     * values, their order, the inferred value type and the value check) or
     * **instead of** it (`of` is then derived from the keys). It is the one way
     * to say what a stored value like `oldest-first` reads as; a renderer shows
     * an option with no member, or a member with no label, as its value
     * humanised ("Oldest first"), never raw. Optional, and hashed wherever the
     * field's own `label` is — a create spec inlines its genre's fields, so
     * adding or rewording one moves that spec's pin.
     */
    members?: readonly MemberDecl[];
    /**
     * For `secret`: lend it to this package's nodes when they run in another
     * package's pipeline (R63). Off by default — a node you made public runs
     * for other packages without your keys unless you lend them. Either way
     * the code holds a **secret handle**, never the value: `ctx.fetch` fills it
     * in at the network boundary, for your declared hosts only.
     */
    lend?: boolean;
    /**
     * For `list`: the declaration every element satisfies.
     *
     * A separate key rather than reusing `of`, which is an `enum`'s **options**
     * and is typed `readonly string[]` everywhere that reads it. Widening that
     * key to also mean "the element declaration" would make `of` two things at
     * once and break the inference every enum in every contract depends on.
     *
     * `min`/`max` on a `list` are the element **count**, not a numeric range.
     */
    item?: FieldDecl;
    /**
     * For `object`: the member declarations, in render order.
     *
     * A `SettingsSchema` by construction — the same map a plugin's settings, a
     * genre's fields and a node's params are all declared as — so nesting costs
     * no second vocabulary and a renderer that can draw a form can draw a row.
     */
    fields?: Record<string, FieldDecl>;
    /** For `media`: which kinds the picker offers. Absent means `['image']`. */
    accepts?: readonly MediaKind[];
    min?: number;
    max?: number;
    of?: O;
    /** Options sourced from the live connection, e.g. `'connection.voices'` (17 §2b). */
    from?: string;
    /**
     * Blocks activation when unset. The plugin is **not broken** — it is installed,
     * listed, and telling the admin exactly what it is waiting for (§ needsConfiguration).
     */
    required?: boolean;
    /** Who may write it. Admin-only is the right default; display preferences are per-user. */
    scope?: 'pub' | 'user';
    /**
     * `extension` is requestable through the SDK at any time; `component` is fed in at
     * render and arrives through `ctx`. A secret may never be component-side — a
     * component runs in the browser.
     */
    side?: 'extension' | 'component';
    /** Form grouping and ordering. Cosmetic, and cheap to get right now. */
    group?: string;
    /**
     * The four orthogonal decisions about what a field is *for*, following
     * Elasticsearch's `index` / `doc_values` / `store` / `_source` split.
     *
     * They are four because collapsing them into one boolean loses information
     * every system at this job's scale has eventually needed: a field can be
     * worth filtering on and meaningless to sort by, worth putting in front of
     * the model and actively harmful inside an embedding. `priority` is the
     * example that makes it concrete — queryable, sortable, injected, and *not*
     * embedded, because "1" contributes nothing to a cosine and dilutes what
     * does.
     *
     * All four default to off. A field nobody declared queryable is one the
     * projection builds no index for and a filter cannot name — which is the
     * point: **the declaration says `queryable`; the projection picks the
     * strategy.** Leak "this is a column" into the declaration and storage
     * layout becomes a public contract.
     *
     * Read by entry types (`Descriptor.entryShape.fields`); harmless and unset
     * on plugin settings and node params, which have nothing to index.
     */
    queryable?: boolean;
    /** May results be ordered by it. Independent of `queryable`: a filterable
     *  field is not automatically a sensible sort key. */
    sortable?: boolean;
    /** Does its value form part of the text an embedding is computed over. */
    embedded?: boolean;
    /** Does its value reach the model in the assembled prompt. */
    injected?: boolean;
    /** Show only when another field has a given value. One level; not a rules engine. */
    showIf?: {
        field: string;
        equals: unknown;
    };
    /**
     * The field this one narrows: it may hold a value only while that one
     * does, as a day narrows a month (the story-time rule, `storyTimeProblem`).
     * A fact about one stored value, not about a form — so, unlike `showIf`,
     * an entry type's constraint projection makes it part of the type's
     * database CHECK. Names another field of the same schema, never itself;
     * `describeEntryType` refuses either.
     *
     * Read by entry types (`Descriptor.entryShape.fields`); unset on plugin
     * settings and node params.
     */
    narrows?: string;
    /**
     * A node `params` field several nodes of one spec hold **in common**, and
     * therefore resolve at ONE owner's address (R-7 P2, one owner per setting
     * per spec; refined 2026-09-16, plans/30 U3b).
     *
     * Where a node's `params` slot is a reference — `slot.params({ node })` —
     * the executor resolves its fields in two halves: a field marked `shared`
     * is read from the **owner** node's declared default and stored value
     * (the three lore lanes' scan depth is one number for all three); a field
     * left unmarked is the node's **own**, read at its own address even
     * through the reference (each lane's `share` of the window is its own).
     * The panel draws the same line — a shared field renders once, on the
     * owner; an own field renders on every node that declares it.
     *
     * ⚠ It is a property of the *declaration*, not of the spec: the definition
     * says which of its settings are the same setting wherever two of it run
     * side by side, and a spec that references an owner gets exactly those.
     * A spec referencing an owner whose schema marks nothing `shared` has
     * written a reference that resolves nothing, and `validate()` says so.
     * `validate()`'s P2 diagnostic is keyed on it as well: two own-node
     * `params` owners in one spec that both declare a `shared` field under the
     * same name are two addresses for one setting.
     *
     * Unset on plugin settings, genre fields and entry shapes, where there is
     * no second node to share with.
     */
    shared?: boolean;
    /**
     * For `text` fields holding structured data a form cannot decompose: the
     * renderer shows JSON and the submit path parses it back. Produced by
     * `inferSchema` for nested payloads; an author declaring settings should
     * declare real fields instead.
     *
     * `'story-time'` (🚧): a `string` holding a position on the story
     * calendar in its canonical line (`412-03-05 22:30`, `storyTime.ts`) — the
     * field a clock/date stat is declared as (`core:stat-shape/story-time@1`).
     */
    format?: 'json' | 'story-time';
}
/** @public */
export type SettingsSchema = Record<string, FieldDecl>;
/**
 * The label to render, resolved through `i18nText` in `language` — a bare
 * string is itself, a map answers the locale or falls back to `en`.
 * @internal
 */
export declare function fieldLabel(decl: {
    label?: I18nText;
}, language?: string): string | undefined;
/**
 * Every display-text fault in one settings schema (R-20), as sentences that
 * name the field: each field's `label` and its `description`; each
 * `members[]` band's label and description; and the
 * same for a `list`'s `item` and an `object`'s `fields`, recursively. A schema
 * that is not an object is one finding. Run at every door a schema arrives
 * through — `register()` for node params, `genre()` for a shape's fields,
 * a widget's `settings`, `validate()` for a document — so a blank label is
 * refused where the author is and never reaches a form.
 *
 * `of` stays unread: an enum's options are stored values, not display text,
 * and their labels live on `members[]`.
 * @experimental
 */
export declare function settingsSchemaFindings(schema: unknown, where: string): string[];
/** The media kinds a `media` field offers. Images unless it says otherwise. @experimental */
export declare function fieldAccepts(decl: FieldDecl): readonly MediaKind[];
type ValueOf<F> = F extends {
    type: 'secret';
} ? SecretValue : F extends {
    type: 'list';
    item: infer I;
} ? Array<ValueOf<I>> : F extends {
    type: 'object';
    fields: infer M;
} ? M extends SettingsSchema ? SettingsValues<M> : Record<string, unknown> : F extends {
    type: 'enum';
    of: readonly (infer O)[];
} ? O : F extends {
    type: 'boolean';
} ? boolean : F extends {
    type: 'number' | 'integer';
} ? number : F extends {
    type: 'string[]';
} ? string[] : string;
type RequiredKeys<S> = {
    [K in keyof S]: S[K] extends {
        required: true;
    } ? K : never;
}[keyof S];
/** @public */
export type SettingsValues<S extends SettingsSchema> = {
    [K in RequiredKeys<S>]: ValueOf<S[K]>;
} & {
    [K in Exclude<keyof S, RequiredKeys<S>>]?: ValueOf<S[K]>;
};
/** @experimental */
export interface SettingsFinding {
    field?: string;
    severity: 'error' | 'warning';
    message: string;
    /** What to do instead — required, like every other finding in this SDK (15 §1.3). */
    fix: string;
}
/** Mistakes that would otherwise become silent leaks or dead form fields. @experimental */
export declare function checkSchema(schema: SettingsSchema): SettingsFinding[];
/** @internal */
export declare function checkValues(schema: SettingsSchema, values: Record<string, unknown>): SettingsFinding[];
/** @experimental */
export interface Reconciled {
    values: Record<string, unknown>;
    /** Stored values the new schema no longer declares. **Never deleted** (12 §6, 02 §7). */
    orphaned: Array<{
        field: string;
        value: unknown;
        reason: string;
    }>;
    findings: SettingsFinding[];
}
/**
 * What an update does to values that already exist.
 *
 * The rule is the one 12 §5 already applies to a node swap's orphaned slots: **unmigrated
 * values land in diagnostics rather than disappearing.** An author who renames a field
 * and an admin who then downgrades should both get their data back; silently dropping it
 * makes the update irreversible in the one direction that matters.
 * @internal
 */
export declare function reconcile(schema: SettingsSchema, stored: Record<string, unknown>): Reconciled;
/** What the settings form sends back. A secret reports only whether it is set. @internal */
export declare function forClient(schema: SettingsSchema, values: Record<string, unknown>): Record<string, unknown>;
/** What an export carries. Secrets never leave, on the same footing as credentials. @experimental */
export declare function forExport(schema: SettingsSchema, values: Record<string, unknown>): Record<string, unknown>;
/**
 * What the declaring extension's own hook receives — the only place plaintext appears,
 * and only for the extension that owns the field. Same shape as F18's per-call injection
 * of connection material.
 */
/**
 * The handle plugin code holds for a secret setting — never its value (R63).
 * `nonce` is minted by the host per plugin load, so a handle cannot be forged
 * from text that came from anywhere but the host.
 * @experimental
 */
export declare const secretHandle: (key: string, nonce: string) => string;
/** A secret's key, as a handle can carry it. @experimental */
export declare const SECRET_KEY: RegExp;
/**
 * What a hook's `settings` carries (R63): every value, and a **secret handle**
 * in place of each secret — so the plugin's code never holds a key — beside
 * the plaintext the host keeps for the fetch bridge and the scrub, and the
 * keys the package lends to its nodes in other packages' pipelines.
 * @internal
 */
export declare function forOwningHookSplit(schema: SettingsSchema, values: Record<string, unknown>, decrypt: (cipher: string) => string, nonce: string): {
    settings: Record<string, unknown>;
    secrets: Record<string, string>;
    lent: string[];
};
/** What a component receives at render — extension-side fields never reach the browser. @experimental */
export declare function forComponent(schema: SettingsSchema, values: Record<string, unknown>): Record<string, unknown>;
/** @internal */
export type PluginConfigState = {
    state: 'ready';
}
/**
 * Installed, listed, and waiting on the admin — **not `broken`**. The distinction is
 * the difference between filing a bug against the author and typing an API key, and a
 * plugin that silently does nothing is the worst of both.
 */
 | {
    state: 'needs-configuration';
    missing: string[];
    message: string;
};
/** @internal */
export declare function configState(schema: SettingsSchema, values: Record<string, unknown>): PluginConfigState;
/** @experimental */
export interface FormGroup {
    group: string;
    fields: Array<{
        key: string;
        decl: FieldDecl;
    }>;
}
/** Declaration order within a group; group order is first appearance. @experimental */
export declare function formLayout(schema: SettingsSchema): FormGroup[];
/** Is this field currently shown, given the values? One level of `showIf`, no rules engine. @experimental */
export declare const isVisible: (decl: FieldDecl, values: Record<string, unknown>) => boolean;
/** @experimental */
export interface PluginSettings<S extends SettingsSchema> {
    schema: S;
    /** Phantom, for `typeof s.values` in the extension's own code. Never populated. */
    readonly values?: SettingsValues<S>;
    defaults(): Record<string, unknown>;
    layout(): FormGroup[];
    check(values: Record<string, unknown>): SettingsFinding[];
    reconcile(stored: Record<string, unknown>): Reconciled;
    state(values: Record<string, unknown>): PluginConfigState;
    forClient(values: Record<string, unknown>): Record<string, unknown>;
    forExport(values: Record<string, unknown>): Record<string, unknown>;
    forComponent(values: Record<string, unknown>): Record<string, unknown>;
}
/** @experimental */
export declare class SettingsError extends Error {
}
/**
 * Declare a plugin's settings. The compiler extracts this statically into the manifest,
 * so it must be a literal — a schema assembled at runtime cannot be read without running
 * the author's code, which the packager never does (F6, 03 §3).
 * @public
 */
export declare function defineSettings<const S extends SettingsSchema>(schema: S): PluginSettings<S>;
/**
 * A `SettingsSchema` inferred from a payload — the review gate's form producer.
 *
 * One field language for everything a person edits in a generated form: an
 * extension's declared settings, an extension's arbitrary forms, and a paused
 * node's payload all render through the same schema and the same renderer. A
 * review form is therefore 100% defined by the data the node received: a
 * string is a text field, a number is a number field, a flag is a checkbox,
 * and structure a form cannot decompose arrives as JSON rather than being
 * silently dropped — an edit surface that hides part of the payload is a
 * review gate a write can sneak past.
 * @experimental
 */
export declare function inferSchema(payload: unknown): SettingsSchema;
/** The payload as form values — JSON-format fields serialized for editing. @internal */
export declare function valuesForForm(schema: SettingsSchema, payload: unknown): Record<string, unknown>;
/**
 * Fold edited form values back into the payload shape the node expects.
 *
 * The inverse of `valuesForForm`: JSON-format fields parse back (an
 * unparseable edit throws with the field named rather than committing a
 * string where an object stood), untouched keys keep their original values —
 * a form is an edit surface, never a filter.
 * @internal
 */
export declare function applyFormValues(schema: SettingsSchema, payload: unknown, edited: Record<string, unknown>): unknown;
//# sourceMappingURL=settings.d.ts.map