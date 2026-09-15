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
export interface SecretValue {
    readonly $secret: true;
    /** Ciphertext at rest; plaintext exists only inside the owning hook's invocation. */
    readonly value: string;
}
export declare const secret: (value: string) => SecretValue;
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
 * `ParamDecl` is now an alias of this type and the union is the merge of both.
 * `label` is canonical; `i18n` is accepted as the historical alias so every
 * existing contract keeps compiling. Read either through `fieldLabel()` rather
 * than reaching for a key.
 */
export type FieldType = 'string' | 'text' | 'number' | 'integer' | 'boolean' | 'enum' | 'string[]' | 'secret'
/** Normalised `Record<string, number>` over `members` — ratios only, always
 *  totalling 100%, so there is no invalid state to explain. Zero is a
 *  member's off switch. */
 | 'share'
/** A plain number per band over `members` — a ceiling, a floor, a count. */
 | 'perMember'
/**
 * A reference to stored media, by uuid. `accepts` narrows which kinds the
 * picker offers; absent means images, which is what almost every such field
 * wants and what makes the common declaration short.
 */
 | 'media';
export type I18nText = string | ({
    en: string;
} & Record<string, string>);
/** One band of a `share` / `perMember` control, or a labelled `enum` choice. */
export interface MemberDecl {
    /** The key inside the parameter's value object. */
    key: string;
    label?: I18nText;
    /** @deprecated alias of `label`. */
    i18n?: I18nText;
    description?: I18nText;
    /**
     * Which colour this band takes, as an index rather than a value. The
     * declaration says *which* band this is; the client's palette says what
     * that looks like in the current theme. Out-of-range wraps.
     */
    tone?: number;
}
export interface FieldDecl<T extends FieldType = FieldType, O extends readonly string[] = readonly string[]> {
    type: T;
    label?: I18nText;
    /**
     * @deprecated alias of `label`, kept so the contracts that were written
     * against the node-params spelling keep compiling. `fieldLabel()` reads
     * whichever is present.
     */
    i18n?: I18nText;
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
     * For `share` and `perMember`: the bands, in render order. An `enum` may
     * use this **instead of** `of`, and should whenever the stored values are
     * not what a person should read — `of` is derived from the keys, so
     * nothing that reads `of` has to learn about this.
     */
    members?: readonly MemberDecl[];
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
    scope?: 'instance' | 'user';
    /**
     * `extension` is requestable through the SDK at any time; `component` is fed in at
     * render and arrives through `ctx`. A secret may never be component-side — a
     * component runs in the browser.
     */
    side?: 'extension' | 'component';
    /** Form grouping and ordering. Cosmetic, and cheap to get right now. */
    group?: string;
    /** Show only when another field has a given value. One level; not a rules engine. */
    showIf?: {
        field: string;
        equals: unknown;
    };
    /**
     * For `text` fields holding structured data a form cannot decompose: the
     * renderer shows JSON and the submit path parses it back. Produced by
     * `inferSchema` for nested payloads; an author declaring settings should
     * declare real fields instead.
     */
    format?: 'json';
}
export type SettingsSchema = Record<string, FieldDecl>;
/**
 * @deprecated `ParamDecl` and `FieldDecl` are one type. The alias remains so
 * `descriptors.ts` and every contract written against node params keep
 * compiling; new code should say `FieldDecl`.
 */
export type ParamDecl = FieldDecl;
/** The label to render, from whichever key the author used. */
export declare function fieldLabel(decl: {
    label?: I18nText;
    i18n?: I18nText;
}): I18nText | undefined;
/** The media kinds a `media` field offers. Images unless it says otherwise. */
export declare function fieldAccepts(decl: FieldDecl): readonly MediaKind[];
type ValueOf<F> = F extends {
    type: 'secret';
} ? SecretValue : F extends {
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
export type SettingsValues<S extends SettingsSchema> = {
    [K in RequiredKeys<S>]: ValueOf<S[K]>;
} & {
    [K in Exclude<keyof S, RequiredKeys<S>>]?: ValueOf<S[K]>;
};
export interface SettingsFinding {
    field?: string;
    severity: 'error' | 'warning';
    message: string;
    /** What to do instead — required, like every other finding in this SDK (15 §1.3). */
    fix: string;
}
/** Mistakes that would otherwise become silent leaks or dead form fields. */
export declare function checkSchema(schema: SettingsSchema): SettingsFinding[];
export declare function checkValues(schema: SettingsSchema, values: Record<string, unknown>): SettingsFinding[];
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
 */
export declare function reconcile(schema: SettingsSchema, stored: Record<string, unknown>): Reconciled;
/** What the settings form sends back. A secret reports only whether it is set. */
export declare function forClient(schema: SettingsSchema, values: Record<string, unknown>): Record<string, unknown>;
/** What an export carries. Secrets never leave, on the same footing as credentials. */
export declare function forExport(schema: SettingsSchema, values: Record<string, unknown>): Record<string, unknown>;
/**
 * What the declaring extension's own hook receives — the only place plaintext appears,
 * and only for the extension that owns the field. Same shape as F18's per-call injection
 * of connection material.
 */
export declare function forOwningHook(schema: SettingsSchema, values: Record<string, unknown>, decrypt: (cipher: string) => string): Record<string, unknown>;
/** What a component receives at render — extension-side fields never reach the browser. */
export declare function forComponent(schema: SettingsSchema, values: Record<string, unknown>): Record<string, unknown>;
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
export declare function configState(schema: SettingsSchema, values: Record<string, unknown>): PluginConfigState;
export interface FormGroup {
    group: string;
    fields: Array<{
        key: string;
        decl: FieldDecl;
    }>;
}
/** Declaration order within a group; group order is first appearance. */
export declare function formLayout(schema: SettingsSchema): FormGroup[];
/** Is this field currently shown, given the values? One level of `showIf`, no rules engine. */
export declare const isVisible: (decl: FieldDecl, values: Record<string, unknown>) => boolean;
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
    forOwningHook(values: Record<string, unknown>, decrypt: (c: string) => string): Record<string, unknown>;
}
export declare class SettingsError extends Error {
}
/**
 * Declare a plugin's settings. The compiler extracts this statically into the manifest,
 * so it must be a literal — a schema assembled at runtime cannot be read without running
 * the author's code, which the packager never does (F6, 03 §3).
 */
export declare function defineSettings<const S extends SettingsSchema>(schema: S): PluginSettings<S>;
/** Back-compat alias for the earlier name. */
export declare const validateSettingsSchema: (s: SettingsSchema) => string[];
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
 */
export declare function inferSchema(payload: unknown): SettingsSchema;
/** The payload as form values — JSON-format fields serialized for editing. */
export declare function valuesForForm(schema: SettingsSchema, payload: unknown): Record<string, unknown>;
/**
 * Fold edited form values back into the payload shape the node expects.
 *
 * The inverse of `valuesForForm`: JSON-format fields parse back (an
 * unparseable edit throws with the field named rather than committing a
 * string where an object stood), untouched keys keep their original values —
 * a form is an edit surface, never a filter.
 */
export declare function applyFormValues(schema: SettingsSchema, payload: unknown, edited: Record<string, unknown>): unknown;
export {};
