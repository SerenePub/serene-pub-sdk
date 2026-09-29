/**
 * Annex fields — every key an owner keeps in the session annex, declared once
 * (owner-approved 2026-09-26; generalised the same day by the owner ruling
 * "one annex declaration per owner").
 *
 * An owner's **annex declaration** is the list of its annex fields: each key
 * it uses, the shape its value must have, who may see it and — optionally —
 * who may set it. It is the single source of truth for that owner's annex
 * document:
 *
 * - a `set-session-annex` step may write only declared keys (refused by name
 *   at `validate()` and the package pass when the keys are literal, and by
 *   the host at the write always);
 * - the audience stored with a value is the declaration's `see`;
 * - a value is checked against the declared `shape` at every write;
 * - `annexSchemaOf(owner)` is the shape, for a template to type
 *   `annex.<owner>.<key>`.
 *
 * `act` present makes the field **settable**: the host offers it as one
 * action (`<owner>:annex#<key>`) and serves every press with ONE core
 * pipeline (`core:spec/set-annex-field`), writing through the same annex
 * write as `set-session-annex`. `act` absent is **pipeline-written only**: no
 * action, and a press is refused.
 *
 * ```ts
 * defineExtension({
 *   slug: 'acme.dice',
 *   // …
 *   annexFields: [
 *     annexField({ key: 'last-roll', shape: { type: 'integer', min: 1, max: 20 }, see: ['person'], act: ['participant'] }),
 *     annexField({ key: 'streak', shape: { type: 'integer' } }), // pipelines write it; nobody sees it
 *   ],
 * })
 * // in the widget:
 * invoke(annexFieldAction('acme.dice', 'last-roll'), { payload: { value: 17 } })
 * ```
 *
 * Declared on the extension (`defineExtension({ annexFields })`): every
 * session the plugin is on, or — with `genre` — that genre's sessions only.
 * The **owner** is the declaring package's slug, never named by the
 * declaration, so a field can only ever describe its own package's document.
 * Core's own keys are core-catalog's `CORE_ANNEX_FIELDS`, under `core`.
 *
 * Never credentials or personal data (R61): a shape holding a `secret`
 * anywhere is refused at the declaration.
 *
 * @experimental 🚧 provisional — the vocabulary (annex field, annex
 * declaration, settable, the `<owner>:annex#<key>` identity) is new with this
 * module.
 */
import { type FieldDecl, type SettingsSchema } from './settings.js';
import { type I18n } from './i18n.js';
import type { VarField } from './template.js';
/** An annex field's key: a lowercase kebab token, the second half of its action identity. @experimental */
export declare const ANNEX_FIELD_KEY: RegExp;
/**
 * The one core pipeline every annex field's press runs. Contributes no
 * action of its own: only the host's door, having judged the press, runs it.
 * @experimental
 */
export declare const ANNEX_FIELD_SPEC_ID = "core:spec/set-annex-field";
/** What an annex field's action identity carries as its spec slug: `<owner>` + this. @experimental */
export declare const ANNEX_FIELD_SLUG_SUFFIX = ":annex";
/** One annex field, as a package declares it. @experimental */
export interface AnnexFieldDecl {
    readonly __decl: 'annex-field';
    /** The annex key the value is stored under, in the owner's document. */
    readonly key: string;
    /** What the value must be — the settings vocabulary's `FieldDecl`, checked by `checkValues`. */
    readonly shape: FieldDecl;
    /**
     * Who may SEE the stored value besides pipelines (R57) — a data
     * audience (participant references). `[]` (the default) is
     * pipelines only (R59): a widget cannot read back a value nobody may see.
     */
    readonly see: readonly string[];
    /**
     * Who may SET it through its ready-made action (`<owner>:annex#<key>`) —
     * the action's `act` audience. Absent: pipeline-written only — no action
     * is offered and a press is refused.
     */
    readonly act?: readonly string[];
    /** The genre id whose sessions offer it; absent is every session the package is on. */
    readonly genre?: string;
    /** What a listing calls the action. Default: the key. */
    readonly label?: I18n;
    readonly description?: I18n;
}
/** What `annexField()` takes. @experimental */
export type AnnexFieldInput = {
    key: string;
    shape: FieldDecl;
    see?: readonly string[];
    act?: readonly string[];
    /** Only this genre's sessions — the genre value (or its id). */
    genre?: {
        readonly id: string;
    } | string;
    label?: I18n;
    description?: I18n;
};
/**
 * Why this is not an annex field, one sentence per fault — `[]` when it is.
 * The host runs it again over a stored manifest, which an older SDK built.
 * @experimental
 */
export declare function annexFieldFindings(raw: unknown, at?: string): string[];
/**
 * Declare an annex field. Throws with every fault at once — an author sees
 * them while writing, never at a press.
 * @experimental
 */
export declare function annexField(d: AnnexFieldInput): AnnexFieldDecl;
/** Faults in a list of fields: each one's, and a key declared twice. @experimental */
export declare function annexFieldListFindings(raw: unknown, at?: string): string[];
/**
 * The action identity a widget invokes to set a field:
 * `annexFieldAction('acme.dice', 'last-roll')` → `acme.dice:annex#last-roll`.
 * @experimental
 */
export declare const annexFieldAction: (owner: string, key: string) => string;
/** Is this spec slug an annex field's (`<owner>:annex`)? @experimental */
export declare const isAnnexFieldSlug: (specSlug: string) => boolean;
/** Take an annex field's identity apart; null for any other identity. @experimental */
export declare function parseAnnexFieldAction(id: unknown): {
    owner: string;
    key: string;
} | null;
/**
 * Why this press's payload cannot be stored under the field, as the
 * validator's sentence — or null when it can. The payload is `{ value }`.
 * @experimental
 */
export declare function annexFieldValueRefusal(field: Pick<AnnexFieldDecl, 'key' | 'shape'>, payload: unknown): string | null;
/**
 * Register an owner's annex declaration — its whole list of annex fields,
 * replacing whatever was registered for it. Checked as a list (a key declared
 * twice is refused); a stored entry an older SDK built is normalised through
 * `annexField()`. Throws with every fault at once. The host's and
 * core-catalog's to call: a package declares on `defineExtension({ annexFields })`.
 * @internal
 */
export declare function declareAnnex(owner: string, fields: readonly unknown[]): readonly AnnexFieldDecl[];
/** Forget an owner's declaration (uninstall, reinstall). @internal */
export declare function _withdrawAnnex(owner: string): void;
/** Every declaration, for a test to put back what it found. @internal */
export declare function _clearAnnexDeclarations(): void;
/** Every owner with a declaration registered in this process, in registration order. @experimental */
export declare const annexOwners: () => string[];
/**
 * An owner's annex declaration as registered in this process, or undefined
 * when the owner is unknown here. @experimental
 */
export declare const annexDeclarationOf: (owner: string) => readonly AnnexFieldDecl[] | undefined;
/**
 * The fields of a declaration in force for a session of `genre`: every
 * unscoped field and the ones scoped to that genre. With no genre — a
 * document judged before it knows its session — every field, whatever genre
 * it is scoped to. Pure. @experimental
 */
export declare function annexFieldsInGenre(fields: readonly AnnexFieldDecl[], genre?: string): AnnexFieldDecl[];
/** Whether a declared field may be set by a person, through its ready-made action. @experimental */
export declare const isSettableAnnexField: (f: Pick<AnnexFieldDecl, 'act'>) => boolean;
/**
 * An owner's annex schema — key → declared shape — for a session of `genre`
 * (or every genre, with none). Undefined when the owner is unknown here; `{}`
 * when it declares nothing. What a typed template reads `annex.<owner>.<key>`
 * against (typed-templates §1b, P6). @experimental
 */
export declare function annexSchemaOf(owner: string, genre?: string): SettingsSchema | undefined;
/**
 * The same schema as a template variable: an `object` whose members are the
 * declared keys, each optional (a key is absent until something writes it).
 * Undefined when the owner is unknown here. @experimental
 */
export declare function annexVarFieldOf(owner: string, genre?: string): VarField | undefined;
/** Whose annex a spec writes by default: the namespace of its id, before the colon. @experimental */
export declare const annexOwnerOfSpec: (specId: string | undefined) => string;
/**
 * The keys a `set-session-annex` step writes, read off its config: the
 * members of a `value` object (literal or assembled from refs). Null when the
 * step wires `value` whole, so its keys are known only at the write. `[]`
 * when it writes nothing. Pure. @experimental
 */
export declare function annexWriteKeysOf(config: Record<string, unknown> | undefined, edgesIntoValue?: readonly string[]): string[] | null;
/** One write to an owner's annex document, as a judge sees it. @experimental */
export interface AnnexWrite {
    owner: string;
    /** The keys written. */
    keys: readonly string[];
    /** The session's genre; undefined judges against every genre's fields. */
    genre?: string;
    /** The values, when known (the host's write): each is held to its declared shape. */
    values?: Record<string, unknown>;
}
/**
 * Why this write is refused under the owner's declaration — one sentence per
 * fault, `[]` when it may be stored. The one judge `validate()`, the package
 * pass and the host's write all quote:
 *
 * - a key the owner does not declare (for this genre) is refused by name;
 * - a value is held to its declared shape (the validator's sentence).
 *
 * `fields` undefined is an owner that declares nothing: every key is refused.
 * @experimental
 */
export declare function annexWriteRefusals(fields: readonly AnnexFieldDecl[] | undefined, w: AnnexWrite): string[];
/**
 * The `set-session-annex` steps of one pipeline that a declaration refuses,
 * judged where the keys are literal — the package pass's and `validate()`'s
 * shared reading. `fieldsOf(owner)` answers undefined for an owner it cannot
 * judge (another package's, unknown here): those steps are left to the host.
 * @internal
 */
export declare function annexStepFindings(spec: {
    id: string;
    input?: {
        genre?: string;
    };
    nodes: ReadonlyArray<{
        key: string;
        definitionId: string;
        config: Record<string, unknown>;
    }>;
    edges?: ReadonlyArray<{
        to: string;
        toPort: string;
    }>;
}, fieldsOf: (owner: string) => readonly AnnexFieldDecl[] | undefined): Array<{
    nodeKey: string;
    owner: string;
    refusals: string[];
}>;
//# sourceMappingURL=annexFields.d.ts.map