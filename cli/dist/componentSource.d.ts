/**
 * The pure half of the component compiler (C6): its limits, its authored-path
 * grammar and its source hash — with no toolchain types. A host that only
 * stores and validates authored source imports this subpath
 * (`@serene-pub/cli/component-source`), never `…/component-compile`, whose
 * declarations name `svelte/compiler`: a file-linked SDK resolves that from
 * its own tree, and a second Svelte's types break every `Snippet` in the
 * host's own type check.
 */
/** @internal What one in-memory compile may take and give (bytes are UTF-8). */
export declare const COMPONENT_COMPILE_LIMITS: {
    readonly files: 64;
    readonly fileBytes: number;
    readonly sourceBytes: number;
    readonly outputBytes: number;
};
/** @internal The app's `isSafeUiPath` grammar (frameHost.ts), mirrored. */
export declare const SAFE_PATH: RegExp;
/** @internal */
export declare const hasDotSegment: (path: string) => boolean;
/**
 * Whether `path` may name an authored file: the app's UI-path grammar (no
 * `.`/`..` segment, no backslash, no leading slash, nothing outside
 * `[A-Za-z0-9._-]`) and one of the compiler's loaders — `.svelte`,
 * `.svelte.ts`/`.svelte.js`, `.ts`, `.js`.
 * @internal
 */
export declare function isSafeComponentPath(path: string): boolean;
/**
 * A component's source, hashed: SHA-256 (hex) over each file's relative
 * path and its own SHA-256, in path order — the same files give the same
 * hash whatever order they were listed in. Core's `<slug>.source.json`
 * carries it, and a clone's `basedOn.sourceHash` records the one it was
 * cloned from.
 * @internal
 */
export declare function componentSourceHash(files: Readonly<Record<string, string>>): string;
/**
 * @internal Core's app reads it (the authored-component offer path).
 *
 * What a component compiled in-app was built against (F1), read back from
 * its toolchain fingerprint (`toolchainFingerprint`: `widget-protocol@<n>
 * host-elements@<major.minor> … sdk@<v> component-client@<v>`) — so a host
 * that stores only the fingerprint beside an artifact judges it with
 * `componentBuiltAgainstFinding` like a package's manifest entry. `null` for
 * a fingerprint from before the record (no `widget-protocol@` token):
 * judged compatible, as a manifest entry without `builtAgainst` is.
 */
export declare function builtAgainstOfFingerprint(fingerprint: string | null | undefined): {
    widgetProtocol: number;
    hostElements: string;
    sdk?: string;
    componentClient?: string;
} | null;
//# sourceMappingURL=componentSource.d.ts.map