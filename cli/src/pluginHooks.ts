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

import { bindingNameFor, camel, parseDefinitionId } from './codegen.js'

/** A valid JS identifier — what a hook name has to be to survive as a key. */
const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/

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
	__decl?: unknown
	type?: { id?: unknown }
	event?: unknown
	moment?: unknown
	handler?: unknown
	/** A template engine's id, on the synthetic declaration a `templateEngines` entry gets. */
	templateEngine?: string
}

/** @internal */
export type HookDeclKind = 'handler' | 'lifecycle-callback' | 'event-listener' | 'template-engine'

/** @internal One callable, with the name the bundle exports it under. */
export interface HookBinding {
	/**
	 * The declaration itself. Identity, so a caller matches its own walk of
	 * `handlers` against this list without depending on the two orders agreeing.
	 */
	decl: HookDeclLike
	hookName: string
	kind: HookDeclKind
	/** A handler's definition pin — `<id>@<version>`, the manifest's key. */
	definitionId?: string
	/** An event listener's event. */
	event?: string
	/** A lifecycle callback's moment. */
	moment?: string
	/** A template engine's id — the manifest's `templateEngines` key. */
	engineId?: string
	/**
	 * Which declaration of this same event or moment it is, counted in
	 * declaration order. The generated entry finds a listener by event and
	 * this, because an extension may subscribe twice to one event and the
	 * functions are then the only thing telling them apart.
	 */
	nth: number
}

const declKind = (h: HookDeclLike): HookDeclKind | undefined =>
	h?.__decl === 'handler' || h?.__decl === 'lifecycle-callback' || h?.__decl === 'event-listener'
		? h.__decl
		: undefined

/** The function's own name, when it is one a bundle can export it under. */
const ownName = (fn: unknown): string | undefined => {
	const name = typeof fn === 'function' ? (fn as { name?: unknown }).name : undefined
	return typeof name === 'string' && IDENT.test(name) ? name : undefined
}

/** `core:event/message-created@1` → `onMessageCreated`. */
const listenerNameFor = (event: string): string => {
	const name = camel(parseDefinitionId(event).name) || 'event'
	return `on${name.charAt(0).toUpperCase()}${name.slice(1)}`
}

/** `acme.x:template/mustache@1` → `renderMustache`. */
const engineNameFor = (engineId: string): string => {
	const name = camel(parseDefinitionId(engineId).name) || 'template'
	return `render${name.charAt(0).toUpperCase()}${name.slice(1)}`
}

const idOf = (h: HookDeclLike): string | undefined =>
	typeof h.type?.id === 'string' ? h.type.id : undefined

/**
 * Name every callable an extension declares.
 *
 * Deterministic: the same extension names the same hooks whatever order the
 * build runs in, and a collision is broken by a counted suffix rather than by
 * whichever declaration got there first silently winning the other's function.
 * @internal
 */
export function hookBindingsFor(
	hooks: readonly HookDeclLike[] | undefined,
	templateEngines?: Readonly<Record<string, unknown>>,
): HookBinding[] {
	const list = (hooks ?? []).filter((h): h is HookDeclLike => !!h && typeof h === 'object')

	// `nth` in one forward walk, so it is declaration order regardless of the
	// order names are handed out below.
	const seen = new Map<string, number>()
	const nths = list.map((h) => {
		const key = `${String(h.__decl)}|${idOf(h) ?? String(h.event ?? h.moment ?? '')}`
		const n = seen.get(key) ?? 0
		seen.set(key, n + 1)
		return n
	})

	const taken = new Set<string>()
	const unique = (want: string): string => {
		if (!taken.has(want)) {
			taken.add(want)
			return want
		}
		for (let n = 2; ; n++) {
			const candidate = `${want}_${n}`
			if (!taken.has(candidate)) {
				taken.add(candidate)
				return candidate
			}
		}
	}

	const out: HookBinding[] = new Array(list.length)
	// Lifecycle callbacks first: their names are not a preference. The host
	// calls a moment by its own word, so a lifecycle callback that had to take
	// a suffix because a handler's function was called `startup` would simply
	// never run.
	list.forEach((h, i) => {
		if (declKind(h) !== 'lifecycle-callback') return
		const moment = typeof h.moment === 'string' ? h.moment : ''
		out[i] = {
			decl: h,
			kind: 'lifecycle-callback',
			moment,
			nth: nths[i]!,
			hookName: unique(IDENT.test(moment) ? moment : (ownName(h.handler) ?? 'lifecycle')),
		}
	})
	list.forEach((h, i) => {
		const kind = declKind(h)
		if (!kind || kind === 'lifecycle-callback') return
		if (kind === 'handler') {
			const definitionId = idOf(h) ?? ''
			out[i] = {
				decl: h,
				kind,
				definitionId,
				nth: nths[i]!,
				hookName: unique(
					ownName(h.handler) ?? (definitionId ? bindingNameFor(definitionId) : 'handler'),
				),
			}
			return
		}
		const event = typeof h.event === 'string' ? h.event : ''
		out[i] = {
			decl: h,
			kind,
			event,
			nth: nths[i]!,
			hookName: unique(ownName(h.handler) ?? listenerNameFor(event)),
		}
	})
	// Template engines last, in key order: a map, not a list, so each engine is
	// found by its id and the declaration is a synthetic one keyed by it.
	const engines: HookBinding[] = Object.entries(templateEngines ?? {}).map(([engineId, fn]) => ({
		decl: { templateEngine: engineId },
		kind: 'template-engine' as const,
		engineId,
		nth: 0,
		hookName: unique(ownName(fn) ?? engineNameFor(engineId)),
	}))
	return [...out.filter(Boolean), ...engines]
}

/**
 * The module specifier the generated entry imports the author's entry module
 * by: relative to the directory esbuild resolves from, in posix spelling, so a
 * build on Windows produces the same text as a build anywhere else.
 * @internal
 */
export function entrySpecifier(fromDir: string, entryFile: string): string {
	const from = fromDir.replace(/\\/g, '/').replace(/\/+$/, '')
	const to = entryFile.replace(/\\/g, '/')
	const rel = to.startsWith(`${from}/`) ? to.slice(from.length + 1) : to
	return rel.startsWith('.') || rel.startsWith('/') ? rel : `./${rel}`
}

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
export function pluginEntrySource(bindings: readonly HookBinding[], entry: string): string {
	const lines = [
		'// Generated by `serene-pub build` — the sandbox entry (D-6b).',
		'//',
		'// Each export is the function that implements the declaration named beside',
		'// it; the manifest names the same hooks, from the same derivation.',
		`import * as __entry from ${JSON.stringify(entry)}`,
		'',
		'const __ext = (__entry && (__entry.default || __entry.extension)) || __entry',
		'const __hooks = (__ext && __ext.handlers) || []',
		'',
		'function __pick(want, decl, nth) {',
		'\tlet n = 0',
		'\tfor (const h of __hooks) {',
		'\t\tif (!h || h.__decl !== decl) continue',
		'\t\tif (!want(h)) continue',
		'\t\tif (n++ !== nth) continue',
		'\t\tif (typeof h.handler !== "function")',
		'\t\t\tthrow new Error("the declaration is bound to something that is not a function")',
		'\t\treturn h.handler',
		'\t}',
		'\tthrow new Error("this bundle declares no such hook — the manifest and the code disagree")',
		'}',
		'',
		'const __handler = (id) => __pick((h) => h.type && h.type.id === id, "handler", 0)',
		'const __listener = (event, nth) =>',
		'\t__pick((h) => h.event === event, "event-listener", nth)',
		'const __lifecycle = (moment, nth) =>',
		'\t__pick((h) => h.moment === moment, "lifecycle-callback", nth)',
		'function __engine(id) {',
		'\tconst f = __ext && __ext.templateEngines && __ext.templateEngines[id]',
		'\tif (typeof f !== "function")',
		'\t\tthrow new Error("this bundle declares no such template engine — the manifest and the code disagree")',
		'\treturn f',
		'}',
		'',
		'module.exports = {',
		'\thooks: {',
	]
	for (const b of bindings) {
		const key = JSON.stringify(b.hookName)
		if (b.kind === 'handler')
			lines.push(`\t\t${key}: __handler(${JSON.stringify(b.definitionId ?? '')}),`)
		else if (b.kind === 'event-listener')
			lines.push(`\t\t${key}: __listener(${JSON.stringify(b.event ?? '')}, ${b.nth}),`)
		else if (b.kind === 'template-engine')
			lines.push(`\t\t${key}: __engine(${JSON.stringify(b.engineId ?? '')}),`)
		else lines.push(`\t\t${key}: __lifecycle(${JSON.stringify(b.moment ?? '')}, ${b.nth}),`)
	}
	lines.push('\t},', '}', '')
	return lines.join('\n')
}
