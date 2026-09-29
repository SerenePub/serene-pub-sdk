/**
 * What a component may import (§3.5, R23, R35).
 *
 * A component's source imports `svelte`, the component client and the
 * unstyled controls — and places `sp-*` elements (`hostElements.ts`). It
 * never imports `@remote-dom/*`: the generated worker bootstrap installs the
 * polyfill and the host owns the receiver, so the renderer can be swapped
 * without a modder rebuilding anything.
 *
 * Enforced three times, and this list is the first:
 *
 * 1. **Compile** — the CLI and the in-app compiler resolve a bare specifier
 *    against this list only; relative imports inside the package are fine.
 *    Anything else is a compile error that names the list.
 * 2. **Package** — a CLI build may bundle a third-party dependency into the
 *    package's own module (the worker is the security, not the list), but the
 *    built package carries no `@remote-dom/*`, no hand-written worker and no
 *    unresolved bare specifier.
 * 3. **Runtime** — the worker's own CSP and the bootstrap's stripped network
 *    globals.
 *
 * Preact, the React alias and `htm` arrive after 1.0 (R35); the list grows,
 * it never shrinks.
 */
/**
 * Bare specifiers a component may import. A trailing `/*` admits subpaths.
 *
 * The last six are experimental (C6 P1, owner ruling 2026-09-25 Q4): the
 * SDK's component subpath and core's UI kit — the helpers core's own
 * components are written against — so a clone of a core component compiles
 * in-app from its source, and a CLI modder has the same kit. Each names ONE
 * module (no `/*`): nothing else of the SDK's or core-catalog's is admitted.
 * @experimental
 */
export declare const COMPONENT_IMPORTS: readonly ['svelte', 'svelte/*', '@serene-pub/component-client', '@serene-pub/component-client/*', '@serene-pub/controls', '@serene-pub/sdk/component', '@serene-pub/core-catalog/conversation', '@serene-pub/core-catalog/lore-entries', '@serene-pub/core-catalog/scene-portraits', '@serene-pub/core-catalog/session-state', '@serene-pub/core-catalog/widgets'];
/**
 * Specifiers no component may import, however it is built — the renderer is
 * the host's (R23), and so is the worker runtime that installs it.
 * @experimental
 */
export declare const COMPONENT_FORBIDDEN_IMPORTS: readonly ['@remote-dom/*', '@serene-pub/component-client/worker-runtime'];
/**
 * Why a component may not import this specifier, or `undefined` if it may.
 * `bundled: true` is the CLI's package step, which may inline third-party
 * code; everything else (the in-app compiler, a clone) may not.
 * @experimental
 */
export declare function componentImportFinding(specifier: string, opts?: {
    bundled?: boolean;
}): string | undefined;
//# sourceMappingURL=componentImports.d.ts.map