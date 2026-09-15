/**
 * announce() — the ONE authoring surface (24 §6).
 *
 * A package is an announcement: identity first, then everything it declares —
 * genres, hook declarations, pipelines, configs, presets. Plugins compile the
 * announcement via the CLI (the announcement IS the manifest); SP core
 * authors the same announcement in-repo and compiles it at boot/seed. One
 * validator, one document shape, one hash discipline.
 *
 * The builder hands authors a **context-bound toolkit**: value kinds, genres
 * and hooks minted through it are namespaced under the package id, so
 * collision with core or another package is impossible by construction.
 *
 * Cross-package references are ids with the referenced thing's owner in them
 * (`use()` handles compile down to these). Referencing something external is
 * allowed and recorded; what the instance enforces at install is the
 * requirement, not the bundle (24 §10).
 */
import type { BuiltSpec } from './builder.js';
import { type SpecDocument } from './document.js';
/** announce() accepts pipelines built or already compiled — one shape lands. */
export type AnnouncedSpec = BuiltSpec | SpecDocument;
/**
 * A reference to something another package ships (24 §10): an id plus an
 * optional semver range. `use()` handles compile to references in the
 * document and requirements in the manifest — never a bundle. The
 * fully-typed form (option autocomplete off the published declaration
 * artifact's generated .d.ts) rides the artifact work; this is the
 * reference primitive both share.
 */
export interface ExternalRef {
    readonly kind: 'external-ref';
    /** The referenced id, range stripped — what documents store. */
    readonly id: string;
    /** The semver range the manifest requires, e.g. '^2'. */
    readonly range?: string;
}
/**
 * An external reference carrying its target's option space in the type —
 * what the generated typings (`serene-pub types`) produce, so a config over
 * another package's pipeline autocompletes node → slot → field (24 T7b).
 * The phantom never exists at runtime; the document still stores the id.
 */
export interface TypedExternalRef<T> extends ExternalRef {
    readonly __options?: T;
}
/** Three-level partial: node → slot → fields, all optional — deltas only. */
export type PartialValues<T> = {
    [N in keyof T]?: {
        [S in keyof T[N]]?: T[N][S] extends Record<string, unknown> ? Partial<T[N][S]> : T[N][S];
    };
};
export declare function use(ref: string): ExternalRef;
import { type GenreDecl, type GenreProps } from './genres.js';
import { type ValueToolkit } from './values.js';
import type { ComponentDecl } from './extension.js';
import { type SurfacesDecl } from './surfaces.js';
export interface PackageIdentity {
    /** The package namespace every declared id lives under — `core`, `acme.dice`. */
    ns: string;
    author: string;
    title: string;
    repo?: string;
    summary?: string;
    description?: string;
}
/**
 * A hook *declaration* (24 §11): identity, event, contract, ordering. The
 * implementation lives with its capabilities — core's in core, a plugin's in
 * its sandboxed bundle — and boot/install binds implementation to declared id
 * with a completeness check.
 */
export interface HookDeclaration {
    event: string;
    description?: unknown;
    /** Ordering constraints against other hook ids. */
    before?: string[];
    after?: string[];
}
/**
 * A shipped prompt (24 T6b): authored prose for one NODE's prompts slot,
 * selectable wherever that node is used. The slug is the stable identity an
 * instance's seed pass matches on; the label is display.
 *
 * Keyed by the node rather than by a spec, because a prompt follows the node it
 * was written for: a pipeline that reuses somebody's summarize step inherits
 * the prompts written for it, and one built from other nodes is offered none of
 * them. Spec scoping said the same thing less precisely and cost the reuse.
 */
export interface PromptDecl {
    /**
     * The pool: an UNVERSIONED node type id (`core:task/build-template-context`),
     * which may belong to another package. Unversioned so a node's @1 → @2 does
     * not strand the prose written for it.
     */
    nodeType: string;
    /**
     * The pool's second half — which prompts slot on that node. A type may
     * declare more than one, each with its own field set.
     */
    slot: string;
    slug: string;
    label: string;
    /** Field name → prose, exactly as that slot declares them. */
    fields: Record<string, string>;
}
/** A named configuration: a typed delta over a spec's author defaults (24 §7). */
export interface ConfigDecl {
    /** The spec it configures — may be external (another package's id). */
    spec: string;
    slug: string;
    label: string;
    description?: string;
    /** nodeKey → slot → value. Only deviations; everything else inherits. */
    values: Record<string, Record<string, unknown>>;
}
/**
 * Author a config against a spec handle (announced or external). With a
 * BuiltSpec handle the node keys are validated at announce-compile; with a
 * bare id they are recorded and verified by the instance that has the spec.
 */
export declare function config<T = Record<string, Record<string, unknown>>>(spec: BuiltSpec | TypedExternalRef<T> | ExternalRef | string, slug: string, meta: {
    label: string;
    description?: string;
}, values: PartialValues<T>): ConfigDecl;
/** One event slot's binding: which pipeline answers, with which config. */
export interface PresetBinding {
    spec: string;
    /** A config slug of that spec. Absent = the spec's shipped default. */
    config?: string;
}
/**
 * What a preset pre-fills the creation form with (23 §9).
 *
 * Every key optional and every key advisory: the form applies the ones it
 * recognises, type-checks each, and ignores the rest — so a preset written
 * against a newer genre than the instance has can still be started, and a
 * genre's own fields ride along in `genreFields` rather than growing this
 * shape a key at a time.
 */
export interface PresetDefaults {
    name?: string;
    scenario?: string;
    groupReplyStrategy?: string;
    lorebookId?: number | null;
    tags?: string[];
    /** The genre's declared fields, by key. */
    genreFields?: Record<string, unknown>;
}
/**
 * A preset populates a genre's event slots (24 §1): for each event the genre
 * declares, which pipeline variant answers it, with which config.
 */
export interface PresetDecl {
    slug: string;
    genre: string;
    label: string;
    description?: string;
    bindings: Record<string, PresetBinding>;
    /** For the open `session-action` slot: which actions come along. */
    actions?: {
        include: string[];
    };
    /** What starting from this preset pre-fills the creation form with. */
    defaults?: PresetDefaults;
    /**
     * Whether the instance should offer this preset the moment the package is
     * enabled. **Absent means no**, and that is the interesting half.
     *
     * A preset is what a non-admin picks from, so a package that installed one
     * straight into everybody's picker would be deciding, on the administrator's
     * behalf, what this instance offers. So the projection lands it disabled and
     * an administrator switches it on — the same shape as a declared permission,
     * which is also announced by the package and granted by the instance.
     *
     * Setting it is a request, not a grant: an instance is free to ignore it,
     * and an administrator who has already disabled a preset keeps that decision
     * across upgrades.
     */
    enabled?: boolean;
}
type BindingInput = BuiltSpec | ExternalRef | string | [BuiltSpec | ExternalRef | string, ConfigDecl | string];
export declare function preset(slug: string, props: {
    genre: GenreDecl | string;
    label: string;
    description?: string;
    bindings: Record<string, BindingInput>;
    actions?: {
        include: Array<BuiltSpec | ExternalRef | string>;
    };
    defaults?: PresetDefaults;
    /** Ask the instance to offer this preset immediately. See `PresetDecl.enabled`. */
    enabled?: boolean;
}): PresetDecl;
/** The compiled announcement — the package's declaration artifact (24 §10). */
export interface AnnouncementDocument {
    schemaVersion: 1;
    identity: PackageIdentity;
    genres: GenreDecl[];
    /** Fully-qualified hook id → declaration. */
    hooks: Record<string, HookDeclaration>;
    pipelines: SpecDocument[];
    prompts: PromptDecl[];
    configs: ConfigDecl[];
    presets: PresetDecl[];
    /**
     * Frame surfaces this package ships (20 §12, 21 §7) — the documents an
     * instance mounts in opaque-origin iframes. Absent means the package has
     * no UI of its own, which is the common case.
     */
    surfaces?: SurfacesDecl;
    /** In-document components (10 §2, virtual tier). */
    components: ComponentDecl[];
    /** Ids referenced but not declared here — the instance enforces these at install. */
    requires: string[];
}
/** One event slot's standing in a preset, for the coverage report (24 §7). */
export interface CoverageSlot {
    event: string;
    required: boolean;
    binding?: PresetBinding;
    /**
     * `bound` — filled and verified against the announced spec's input lock;
     * `bound-external` — filled by a reference this package cannot verify
     * (the instance will); `unbound` — an optional slot left empty;
     * `MISSING` — a required slot left empty (also a build error).
     */
    status: 'bound' | 'bound-external' | 'unbound' | 'MISSING';
}
export interface CoverageReport {
    presets: Array<{
        preset: string;
        genre: string;
        slots: CoverageSlot[];
    }>;
    /** Deliberate holes: `todo()` sentinels found in config values. */
    todos: Array<{
        path: string;
        note: string;
    }>;
}
export declare class AnnouncementBuilder {
    readonly identity: PackageIdentity;
    /** The context-bound value toolkit — custom kinds mint under this package. */
    readonly v: ValueToolkit;
    private _genres;
    private _hooks;
    private _pipelines;
    private _configs;
    private _presets;
    private _prompts;
    private _surfaces;
    private _components;
    constructor(identity: PackageIdentity);
    /** Context sugar: mints `${ns}:genre/${name}` so the id cannot be mistyped. */
    genre(name: string, props: GenreProps): GenreDecl;
    genres(map: Record<string, GenreDecl>): this;
    /** Declarations only — implementations bind by id per trust domain (24 §11). */
    hooks(map: Record<string, HookDeclaration>): this;
    pipelines(...specs: AnnouncedSpec[]): this;
    configs(...configs: ConfigDecl[]): this;
    prompts(...prompts: PromptDecl[]): this;
    presets(...presets: PresetDecl[]): this;
    /**
     * The frame surfaces this package ships (20 §12): documents mounted in
     * opaque-origin iframes. Declared, never discovered — an instance renders
     * what the manifest says and `serene-pub preview` renders the same list,
     * so a surface a modder previewed is a surface an instance will offer.
     */
    surfaces(decl: SurfacesDecl): this;
    /** In-document components (10 §2, virtual tier) — code trust at install. */
    components(...components: ComponentDecl[]): this;
    /**
     * Validate the announcement as a whole and compile it to the document.
     * Errors carry exact paths — the teaching-error pattern (15 §1.3).
     */
    build(): {
        document: AnnouncementDocument;
        coverage: CoverageReport;
    };
}
/** Build refusal that still carries the coverage — the report is the error's context. */
export declare class AnnouncementError extends Error {
    readonly errors: string[];
    readonly coverage: CoverageReport;
    constructor(errors: string[], coverage: CoverageReport);
}
export declare function announce(identity: PackageIdentity): AnnouncementBuilder;
export {};
//# sourceMappingURL=announce.d.ts.map