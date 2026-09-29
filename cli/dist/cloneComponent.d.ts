import { type ComponentDecl, type WidgetDecl } from '@serene-pub/sdk';
/** @experimental */
export declare class CloneError extends Error {
}
/** @experimental `<slug>.source.json` — core-catalog's `CoreComponentSource`, restated so the CLI builds before the catalog. */
export interface CoreComponentSource {
    slug: string;
    framework: ComponentDecl['framework'];
    /** One of `files`' keys. */
    entry: string;
    /** Relative path (under core's `components/`) → source. */
    files: Record<string, string>;
    sourceHash: string;
    catalogVersion: string;
}
/** @experimental What a clone records beside the files it wrote: the source it copied, one hash per file. */
export interface CloneBase {
    component: string;
    catalogVersion: string;
    sourceHash: string;
    entry: string;
    /** Relative path (under the clone's root) → SHA-256 of the copied text. */
    files: Record<string, string>;
    /**
     * Written by `drift --retrofit` for a copy made without `clone`, not at the
     * copy: `source` — from core's source at the copy's `basedOn.sourceHash`
     * (as exact as `clone`'s own record); `copy` — that source was not to be
     * had, so `files` hashes the copy as it stood on `at`, and per-file
     * history starts then. Absent on a record `clone` wrote.
     */
    retrofitted?: {
        from: 'source' | 'copy';
        at: string;
    };
}
/** @experimental The clone's record file, beside the files it copied. */
export declare const CLONE_BASE_FILE = "based-on.json";
/** @experimental */
export interface CloneOptions {
    /** A directory of `<slug>.source.json` files, instead of the installed @serene-pub/core-catalog's. */
    catalogDir?: string;
}
/**
 * Where core's `<slug>.source.json` files are: `--catalog`, else the
 * core-catalog the PACKAGE resolves (the version its build would bundle
 * against), else the one this CLI resolves.
 * @internal
 */
export declare function coreSourceDir(pkgDir: string, o?: CloneOptions): Promise<string>;
/** @internal One core component's source, checked: its slug, its entry, its paths and its hash. */
export declare function readCoreSource(dir: string, slug: string): Promise<CoreComponentSource>;
/**
 * What the component's source reaches for that a plugin's widget is refused
 * (the host's `widgetRequestRefusal` and the receiver's rules): the request
 * kinds only core's widgets ask, the kinds a scope gates, `<sp-host-view>`
 * and `autofocus`. A static read — a kind built at runtime is not seen.
 * @experimental
 */
export interface UntrustedReach {
    /** Kinds `WIDGET_REQUEST_ASKERS` marks `'core'`: refused for a plugin's widget, whatever it holds. */
    coreOnly: string[];
    /** Kinds a scope gates: answered only when the widget is granted that scope. */
    scoped: Array<{
        kind: string;
        scope: string;
    }>;
    /** Files placing `<sp-host-view>` — core's; a plugin's is refused. */
    hostView: string[];
    /** Files writing `autofocus` — core's to place; a plugin's is dropped. */
    autofocus: string[];
    /**
     * Scopes whose section the source reads (`….session_full?.v1`): core's
     * widgets hold every scope, so core's declaration names none — a copy
     * must declare each, and is reviewed for it.
     */
    sections: string[];
}
/** @experimental */
export declare function untrustedReach(files: Readonly<Record<string, string>>): UntrustedReach;
/** @experimental The lines a clone prints about what its copy loses — empty when it loses nothing. */
export declare function untrustedReachLines(r: UntrustedReach): string[];
/** @internal The packages a component's source imports — what the cloning package must depend on. */
export declare function importedPackages(files: Readonly<Record<string, string>>): string[];
/** @experimental */
export interface CloneableComponent {
    slug: string;
    label: string;
    sourceHash: string;
    catalogVersion: string;
    files: number;
    /** Core offers it view-only in the app (it runs on core's trust); a package may still copy it. */
    viewOnly: boolean;
    /** What a package's copy cannot do, as {@link untrustedReachLines} says it. */
    loses: string[];
}
/** @experimental */
export declare function listCloneable(pkgDir: string, o?: CloneOptions): Promise<CloneableComponent[]>;
/** @experimental */
export interface CloneRequest extends CloneOptions {
    /** Core's component slug. */
    slug: string;
    /** The copy's slug — its directory under `components/`, its component slug and its widget id. Default `my-<slug>`. */
    as?: string;
    /** Overwrite files that are already there. */
    force?: boolean;
}
/** @experimental */
export interface CloneResult {
    /** Paths written, relative to the package. */
    written: string[];
    component: ComponentDecl;
    widget: WidgetDecl;
    /** The declarations to paste, as source. */
    declarations: string;
    /** What the copy cannot do, running as a plugin's widget. */
    loses: string[];
    /** Core offers this one view-only in the app. */
    viewOnly: boolean;
    /** The packages the copied source imports. */
    dependencies: string[];
}
/** @experimental */
export declare function cloneCoreComponent(pkgDir: string, o: CloneRequest): Promise<CloneResult>;
/** @experimental */
export type FileChange = 'changed' | 'added' | 'removed';
/** @experimental */
export interface DriftEntry {
    /** The package's component slug. */
    slug: string;
    /** Core's component it was copied from. */
    upstream: string;
    /**
     * - `current` — `basedOn.sourceHash` is core's source's hash now
     * - `behind` — core's source has changed since the copy
     * - `unpinned` — `basedOn` names no `sourceHash`, so there is nothing to compare
     * - `unknown` — core has no component by that slug any more
     */
    status: 'current' | 'behind' | 'unpinned' | 'unknown';
    basedOnHash?: string;
    coreHash?: string;
    coreVersion?: string;
    /**
     * `behind` with the clone's `based-on.json`: what CORE changed since the
     * copy, each marked when the author edited that file too (merge by hand).
     * `behind` without it: every file where the copy and core's source differ
     * now — core's changes and the author's together, not told apart; there
     * `added` is a file only core has, `removed` one only the copy has.
     */
    files?: Array<{
        path: string;
        change: FileChange;
        editedHere?: boolean;
    }>;
    /** Whether {@link files} is core's changes alone (a `based-on.json` was found). */
    separated?: boolean;
    /**
     * When the `based-on.json` was retrofitted from the copy itself (`drift
     * --retrofit` with core's old source not to be had): the day per-file history
     * starts. {@link files} is then what differs from core now against the
     * copy as it stood that day (your earlier edits and core's together), and
     * `editedHere` marks a file edited since.
     */
    retrofittedAt?: string;
    /** The clone's root, relative to the package, when it was found. */
    root?: string;
}
/**
 * Each of `components` that records a `basedOn`, held against core's
 * current source: whether core moved on, and which files it moved.
 * @experimental
 */
export declare function driftReport(pkgDir: string, components: readonly Pick<ComponentDecl, 'slug' | 'entry' | 'basedOn'>[], o?: CloneOptions): Promise<DriftEntry[]>;
/** @experimental The report as text, one block per component. */
export declare function renderDrift(entries: readonly DriftEntry[]): string;
/** @experimental */
export interface RetrofitResult {
    /** The package's component slug. */
    slug: string;
    /** Where the record went, relative to the package. */
    written: string;
    /** `source`: from core's source at the copy's `basedOn.sourceHash`; `copy`: from the copy as it stands. */
    from: 'source' | 'copy';
    /** What the author should know about the record — said, never only implied. */
    note: string;
}
/**
 * `serene-pub drift --retrofit <slug>`: a `based-on.json` for a copy made
 * before `clone` wrote one, so `drift` can tell core's changes from the
 * author's.
 *
 * The record is honest or it is useless. When core's source at the copy's
 * recorded `basedOn.sourceHash` can be read — the catalog `drift` reads (the
 * installed @serene-pub/core-catalog, or `--catalog` pointed at an older
 * one's `dist/components/`) still carries that hash — the record is written
 * from it, exactly as `clone` would have, and drift is three-way at once.
 * Otherwise (usual: a catalog ships only its current source) the record is
 * written from the copy's files as they stand, keeping `basedOn.sourceHash`
 * and saying `retrofitted: { from: 'copy' }`: drift cannot separate edits made
 * before today from core's, and says so, but every edit from here on is told
 * apart. Never from core's CURRENT source when it is not the one copied —
 * that would report the author's own edits as core's, and core's changes as
 * none.
 * @experimental
 */
export declare function retrofitCloneBase(pkgDir: string, c: Pick<ComponentDecl, 'slug' | 'entry' | 'basedOn'> | undefined, o?: CloneOptions & {
    force?: boolean;
    now?: Date;
}): Promise<RetrofitResult>;
//# sourceMappingURL=cloneComponent.d.ts.map