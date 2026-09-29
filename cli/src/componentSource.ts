/**
 * The pure half of the component compiler (C6): its limits, its authored-path
 * grammar and its source hash — with no toolchain types. A host that only
 * stores and validates authored source imports this subpath
 * (`@serene-pub/cli/component-source`), never `…/component-compile`, whose
 * declarations name `svelte/compiler`: a file-linked SDK resolves that from
 * its own tree, and a second Svelte's types break every `Snippet` in the
 * host's own type check.
 */

import { createHash } from 'node:crypto'

/** @internal What one in-memory compile may take and give (bytes are UTF-8). */
export const COMPONENT_COMPILE_LIMITS = {
	files: 64,
	fileBytes: 256 * 1024,
	sourceBytes: 1024 * 1024,
	outputBytes: 3 * 1024 * 1024,
} as const

/** @internal The app's `isSafeUiPath` grammar (frameHost.ts), mirrored. */
export const SAFE_PATH = /^[a-zA-Z0-9_-][a-zA-Z0-9._-]*(\/[a-zA-Z0-9._-]+)*$/
/** @internal */
export const hasDotSegment = (path: string) => path.split('/').some((seg) => seg === '.' || seg === '..')
const AUTHORED_EXT = /\.(svelte|ts|js)$/

/**
 * Whether `path` may name an authored file: the app's UI-path grammar (no
 * `.`/`..` segment, no backslash, no leading slash, nothing outside
 * `[A-Za-z0-9._-]`) and one of the compiler's loaders — `.svelte`,
 * `.svelte.ts`/`.svelte.js`, `.ts`, `.js`.
 * @internal
 */
export function isSafeComponentPath(path: string): boolean {
	return SAFE_PATH.test(path) && !hasDotSegment(path) && AUTHORED_EXT.test(path)
}

/**
 * A component's source, hashed: SHA-256 (hex) over each file's relative
 * path and its own SHA-256, in path order — the same files give the same
 * hash whatever order they were listed in. Core's `<slug>.source.json`
 * carries it, and a clone's `basedOn.sourceHash` records the one it was
 * cloned from.
 * @internal
 */
export function componentSourceHash(files: Readonly<Record<string, string>>): string {
	const h = createHash('sha256')
	for (const path of Object.keys(files).sort())
		h.update(`${path}\n${createHash('sha256').update(files[path]!, 'utf8').digest('hex')}\n`)
	return h.digest('hex')
}

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
export function builtAgainstOfFingerprint(fingerprint: string | null | undefined): {
	widgetProtocol: number
	hostElements: string
	sdk?: string
	componentClient?: string
} | null {
	if (typeof fingerprint !== 'string') return null
	const tokens = new Map<string, string>()
	for (const t of fingerprint.split(/\s+/)) {
		const at = t.lastIndexOf('@')
		if (at > 0) tokens.set(t.slice(0, at), t.slice(at + 1))
	}
	const protocol = tokens.get('widget-protocol')
	if (protocol === undefined) return null
	const version = (name: string) => {
		const v = tokens.get(name)
		return v && v !== 'none' ? v : undefined
	}
	const sdk = version('sdk')
	const componentClient = version('component-client')
	return {
		widgetProtocol: /^\d+$/.test(protocol) ? Number(protocol) : NaN,
		hostElements: tokens.get('host-elements') ?? '',
		...(sdk ? { sdk } : {}),
		...(componentClient ? { componentClient } : {}),
	}
}
