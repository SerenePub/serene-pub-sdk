/**
 * The bundle's hook names, and the entry module that exports them (D-6b).
 *
 * A sandbox calls a plugin's code by **name**: `module.exports.hooks[hookName]`
 * (QuickJsSandbox / SesWorkerSandbox `buildProgram`), and the app learns the
 * name from the stored manifest — `hooks.nodeHandlers` for a node definition's
 * handler, `hooks.eventListeners[].hook` for an event listener, the moment
 * itself for a lifecycle callback. Nothing is discovered at runtime, on either
 * side.
 *
 * So the manifest and the bundle have to agree about a name that the *author*
 * never wrote down: `handler(tallyDefinition, tallyHandler)` names a definition
 * and a function, not an export. This module is the one derivation both halves
 * of a build read — `compilePlugin` writes these names into the manifest and
 * `serene-pub build` generates an entry module that exports exactly them — so
 * the two cannot drift apart by construction rather than by a test.
 *
 * The name is the author's own function name wherever that is usable, because
 * it is what they will read back in an invocation log and in the admin monitor;
 * it falls back to a name derived from what the hook answers (the definition's
 * binding name, `on<Event>`), so an inline arrow still gets one. Lifecycle
 * callbacks are the exception and get no choice: the host calls them by their
 * **moment** (`manager.callHook(id, 'startup', …)`), so the moment is the name.
 *
 * Kept dependency-free — `serene-pub build` reads it with esbuild absent, and
 * only fails to write the bundle.
 */
/**
 * One entry of an extension's `handlers` array, read **structurally**.
 *
 * The packager already treats these as `any` (they are three different
 * declaration types in one array, and a package may have been built against an
 * older SDK); naming the shape here keeps the reads in one place instead of
 * spreading casts across two files.
 * @internal
 */
export interface HookDeclLike {
    __decl?: unknown;
    type?: {
        id?: unknown;
    };
    event?: unknown;
    moment?: unknown;
    handler?: unknown;
    /** A template engine's id, on the synthetic declaration a `templateEngines` entry gets. */
    templateEngine?: string;
}
/** @internal */
export type HookDeclKind = 'handler' | 'lifecycle-callback' | 'event-listener' | 'template-engine';
/** @internal One callable, with the name the bundle exports it under. */
export interface HookBinding {
    /**
     * The declaration itself. Identity, so a caller matches its own walk of
     * `handlers` against this list without depending on the two orders agreeing.
     */
    decl: HookDeclLike;
    hookName: string;
    kind: HookDeclKind;
    /** A handler's definition pin — `<id>@<version>`, the manifest's key. */
    definitionId?: string;
    /** An event listener's event. */
    event?: string;
    /** A lifecycle callback's moment. */
    moment?: string;
    /** A template engine's id — the manifest's `templateEngines` key. */
    engineId?: string;
    /**
     * Which declaration of this same event or moment it is, counted in
     * declaration order. The generated entry finds a listener by event and
     * this, because an extension may subscribe twice to one event and the
     * functions are then the only thing telling them apart.
     */
    nth: number;
}
/**
 * Name every callable an extension declares.
 *
 * Deterministic: the same extension names the same hooks whatever order the
 * build runs in, and a collision is broken by a counted suffix rather than by
 * whichever declaration got there first silently winning the other's function.
 * @internal
 */
export declare function hookBindingsFor(hooks: readonly HookDeclLike[] | undefined, templateEngines?: Readonly<Record<string, unknown>>): HookBinding[];
/**
 * The module specifier the generated entry imports the author's entry module
 * by: relative to the directory esbuild resolves from, in posix spelling, so a
 * build on Windows produces the same text as a build anywhere else.
 * @internal
 */
export declare function entrySpecifier(fromDir: string, entryFile: string): string;
/**
 * The entry module a plugin bundle is built from.
 *
 * It imports the author's entry, finds each declared callable **by what it
 * answers** — a definition id, an event, a moment — and exports it under the
 * name the manifest gives it. Found by identity rather than by position so a
 * reordered declaration cannot silently swap two handlers, and a lookup that
 * comes up empty throws while the bundle is being *loaded*, which every backend
 * reports as a load failure rather than as a hook that mysteriously does
 * nothing.
 *
 * Nothing is externalised: the sandbox has no module resolution at all — the
 * whole bundle is evaluated as one CJS source with `module`/`exports` handed to
 * it — so the SDK's runtime helpers (`ok`, `err`, the shapes) and every pure-JS
 * dependency are inlined here or are not there at call time.
 * @internal
 */
export declare function pluginEntrySource(bindings: readonly HookBinding[], entry: string): string;
//# sourceMappingURL=pluginHooks.d.ts.map