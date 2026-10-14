/**
 * What a component may import.
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
 * Preact, the React alias and `htm` arrive after 1.0; the list grows,
 * it never shrinks.
 * @ruling §3.5, R23, R35, R35
 */

/**
 * Bare specifiers a component may import. A trailing `/*` admits subpaths.
 *
 * The last eight are experimental: the
 * SDK's component subpath and core's UI kit — the helpers core's own
 * components are written against — so a clone of a core component compiles
 * in-app from its source, and a CLI modder has the same kit. Each names ONE
 * module (no `/*`): nothing else of the SDK's or core-catalog's is admitted.
 * @experimental
 * @ruling C6 P1, owner ruling 2026-09-25 Q4
 */
export const COMPONENT_IMPORTS = [
	'svelte',
	'svelte/*',
	'@serene-pub/component-client',
	'@serene-pub/component-client/*',
	'@serene-pub/controls',
	'@serene-pub/sdk/component',
	'@serene-pub/core-catalog/conversation',
	'@serene-pub/core-catalog/lore-entries',
	'@serene-pub/core-catalog/scene-portraits',
	'@serene-pub/core-catalog/session-state',
	'@serene-pub/core-catalog/widgets',
	// 🚧 2026-10-02 (AN1): the author's note widget's plain half — appended,
	// so the list only grows.
	'@serene-pub/core-catalog/authors-note',
	// 🚧 2026-10-10 (W1): the turn order widget's plain half — appended.
	'@serene-pub/core-catalog/turn-order',
	// 🚧 2026-10-11 (W8): the actions widget's plain half — appended.
	'@serene-pub/core-catalog/actions',
	// 🚧 2026-10-11 (W9): the annex widget's plain half — appended.
	'@serene-pub/core-catalog/annex',
	// 🚧 2026-10-11 (W2): the album widget's plain half — appended.
	'@serene-pub/core-catalog/album',
	// 🚧 2026-10-11 (W3): the chronicle widget's plain half — appended.
	'@serene-pub/core-catalog/chronicle',
	// 🚧 2026-10-11 (W4): the places widget's plain half — appended.
	'@serene-pub/core-catalog/places',
	// 🚧 2026-10-11 (W10): the Who's here widget's plain half — appended.
	'@serene-pub/core-catalog/attendance',
	// 🚧 2026-10-12 (DESIGN-image-generation §6.4): the backdrop widget's plain half — appended.
	'@serene-pub/core-catalog/backdrop',
] as const

/**
 * Specifiers no component may import, however it is built — the renderer is
 * the host's, and so is the worker runtime that installs it.
 * @experimental
 * @ruling R23
 */
export const COMPONENT_FORBIDDEN_IMPORTS = ['@remote-dom/*', '@serene-pub/component-client/worker-runtime'] as const

const matches = (specifier: string, pattern: string) =>
	pattern.endsWith('/*')
		? specifier.startsWith(pattern.slice(0, -1))
		: specifier === pattern

/** A relative path inside the package — the package's own business. */
const isPath = (specifier: string) => specifier.startsWith('./') || specifier.startsWith('../')

/**
 * A `.` or `..` segment anywhere but a relative specifier's leading `./` or
 * `../…/` — `svelte/../../x` names a listed package and reaches past it.
 */
function componentSpecifierTraverses(specifier: string): boolean {
	const segments = specifier.split('/')
	let i = 0
	if (segments[0] === '.') i = 1
	else while (segments[i] === '..') i++
	return segments.slice(i).some((s) => s === '.' || s === '..')
}

/**
 * Why a component may not import this specifier, or `undefined` if it may.
 * `bundled: true` is the CLI's package step, which may inline third-party
 * code; everything else (the in-app compiler, a clone) may not.
 * @experimental
 */
export function componentImportFinding(
	specifier: string,
	opts: { bundled?: boolean } = {},
): string | undefined {
	// Anywhere in the specifier: `./node_modules/@remote-dom/core` is the same renderer.
	if (specifier === '@serene-pub/component-client/worker-runtime')
		return `'${specifier}' is the host's worker runtime — a component is started by it, never imports it`
	if (COMPONENT_FORBIDDEN_IMPORTS.some((p) => matches(specifier, p)) || specifier.includes('@remote-dom/'))
		return (
			`'${specifier}' is the host's renderer — a component never imports it; ` +
			`place sp-* elements and let the host mirror them (R23)`
		)
	// In every mode: a listed prefix (`svelte/*`) is not a licence to walk out of it.
	if (specifier.includes('\0') || specifier.includes('\\'))
		return `'${specifier.replace(/\0/g, '\\0')}' holds a NUL or a backslash — a component's imports are plain forward-slash paths`
	if (componentSpecifierTraverses(specifier))
		return `'${specifier}' has a '.' or '..' segment past its start — a component's imports never walk out of what they name`
	if (specifier.startsWith('/') || /^[a-z]+:/i.test(specifier))
		return `'${specifier}' is an absolute path or URL — a component imports its own files relatively`
	if (isPath(specifier)) return undefined
	if (COMPONENT_IMPORTS.some((p) => matches(specifier, p))) return undefined
	if (opts.bundled) return undefined
	return (
		`'${specifier}' is not something a component may import — ` +
		`the list is ${COMPONENT_IMPORTS.map((p) => `'${p}'`).join(', ')}` +
		` (a CLI build may bundle other packages into the component's own module)`
	)
}
