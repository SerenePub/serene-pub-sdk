/**
 * The Vite half of the surface harness.
 *
 * 13 §11 draws the line this plugin sits on: *"loading, watching and
 * cache-busting are the host's job — it owns the module cache, the watcher and
 * the process."* Here the host is Vite, and that is the whole reason the
 * harness is a Vite plugin rather than a bespoke loader: the module cache, the
 * watcher and the invalidation already exist and are better than anything
 * written for this. The SDK stays a pure reader (`previewManifest`), exactly as
 * `devOverlay` takes an already-evaluated extension rather than a path.
 *
 * What crosses into the browser is one virtual module:
 *
 *   virtual:serene-pub/surfaces
 *     manifest    what the package announces, read tolerantly
 *     frames      target id → dev URL of the frame document
 *     components  target id → () => import(…), a real static import expression
 *                 so Vite analyses it and Svelte HMR applies
 *     fixtures    the data the harness pushes down the frame channel
 *
 * ## What is hot, and what reloads
 *
 * `dev.ts` already ruled this and the harness does not get a second opinion:
 * **a component is always hot** — "components render; they do not participate
 * in a run" — so a component edit is Svelte HMR and nothing else. The one
 * thing that cannot be hot-patched is the *declaration set*: if the announce
 * file changes, which surfaces exist may have changed, so the virtual module
 * is invalidated and the page reloads. Editing a surface's code never triggers
 * that; editing what the package announces always does.
 */
import { existsSync } from 'node:fs'
import { readFile, readdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve, isAbsolute, dirname, join } from 'node:path'
import type { Plugin, ViteDevServer, ModuleNode } from 'vite'
import { ENTRY_CANDIDATES, previewManifest, type PreviewManifest } from '@serene-pub/sdk'

const VIRTUAL = 'virtual:serene-pub/surfaces'
const RESOLVED = '\0' + VIRTUAL

export interface SurfacesPluginOptions {
	/** The package being previewed. */
	pluginDir: string
	/** Optional JSON file replacing the built-in fixtures. */
	fixtures?: string
	/** Resolved `@serene-pub/controls` root — required, see vite.config.ts. */
	controlsDir: string
}

/** Where the harness serves the frame-tier token stylesheet. */
export const THEME_CSS_PATH = '/@serene-pub/themes.css'

/**
 * Core's frame CSP (`frameHost.frameCsp`), with the one relaxation a dev
 * server cannot do without: `connect-src` has to reach Vite's HMR socket, and
 * `script-src` has to admit the client module Vite injects. Everything else is
 * production's, on purpose — a harness that served frames with no CSP at all
 * (as this one previously did) would let an author build against inline
 * scripts that core will refuse the day they install.
 */
function frameCsp(): string {
	return [
		"default-src 'none'",
		"script-src 'self'",
		"style-src 'self' 'unsafe-inline'",
		"img-src 'self' data: blob:",
		"font-src 'self' data:",
		"media-src 'self' blob:",
		// Production is `connect-src <granted hosts>` or `'none'`; dev must
		// additionally reach the HMR socket or nothing hot-reloads.
		"connect-src 'self' ws: wss:",
		"form-action 'none'",
		"base-uri 'none'",
	].join('; ')
}

/**
 * The stock Skeleton themes, read off the installed package rather than
 * listed here. A new Skeleton release adds a theme and the picker grows one;
 * nothing in this repo has to be edited to keep up, which is the only way a
 * list like this stays true.
 */
async function themeNames(themesDir: string | undefined): Promise<string[]> {
	if (!themesDir) return []
	try {
		return (await readdir(themesDir))
			.filter((f) => f.endsWith('.css'))
			.map((f) => f.slice(0, -4))
			.sort()
	} catch {
		return []
	}
}

/** The installed Skeleton package's themes directory, if it is resolvable. */
function skeletonThemesDir(from: string): string | undefined {
	try {
		const require = createRequire(join(from, 'noop.js'))
		return join(
			dirname(require.resolve('@skeletonlabs/skeleton/package.json')),
			'src',
			'themes',
		)
	} catch {
		return undefined
	}
}

/**
 * One separator convention for every path comparison. Vite reports watcher and
 * module-graph paths with forward slashes on every platform; Node's `resolve`
 * uses backslashes on Windows. Comparing the two raw meant a Windows harness
 * silently never matched, and so never noticed a single change.
 */
const posix = (p: string) => p.replace(/\\/g, '/')

/** `/@fs/<abs>` — how Vite serves a file outside its root. */
const fsUrl = (abs: string) =>
	'/@fs' +
	abs.replace(/\\/g, '/').replace(/^\/?/, '/').split('/').map(encodeURIComponent).join('/')

function findEntry(dir: string): string | undefined {
	for (const candidate of ENTRY_CANDIDATES) {
		const p = resolve(dir, candidate)
		if (existsSync(p)) return p
	}
	return undefined
}

/**
 * Every file the announcement was built from. Kept so a save can be classified
 * — declaration change (reload) or surface code (HMR) — instead of reloading
 * the page on every keystroke in the package, which is the failure mode that
 * makes people turn a harness off.
 */
function declarationFiles(server: ViteDevServer, entry: string): Set<string> {
	// Stored posix-normalised, because that is how they are looked up.
	const files = new Set<string>()
	const root = server.moduleGraph.getModulesByFile(entry)
	const walk = (mod: ModuleNode, depth: number) => {
		if (!mod.file || depth > 24) return
		const key = posix(mod.file)
		if (files.has(key)) return
		files.add(key)
		for (const dep of mod.importedModules) walk(dep, depth + 1)
	}
	for (const mod of root ?? []) walk(mod, 0)
	return files
}

export function serenePubSurfaces(options: SurfacesPluginOptions): Plugin {
	const pluginDir = resolve(options.pluginDir)
	const themesDir = skeletonThemesDir(import.meta.dirname ?? process.cwd())
	let server: ViteDevServer | undefined
	let declFiles = new Set<string>()
	let themeCss: string | undefined

	return {
		name: 'serene-pub:surfaces',
		enforce: 'pre',

		configureServer(s) {
			server = s
			// The package is outside the harness's root, so chokidar is not
			// watching it yet. Without this the harness is a snapshot.
			s.watcher.add(pluginDir)

			/**
			 * The frame-tier token stylesheet (RESEARCH §7b: *"a core-served
			 * token stylesheet (iframe tier)"*).
			 *
			 * Tokens only — every stock theme's custom-property block, served
			 * whole, plus the four lines of `color-scheme` that make
			 * `light-dark()` resolve. Deliberately **no utilities**: linking
			 * the harness's compiled Tailwind into a frame would make rules
			 * appear that the plugin's own build never emitted, so a surface
			 * would look styled here and unstyled after install — 10 §6's
			 * exact misdiagnosis. And deliberately no hand-written token
			 * list: §7b refuses an SP-published token artifact, so this ships
			 * the theme files or it ships nothing.
			 *
			 * All themes in one document on purpose: the frame links it once
			 * and a theme switch is an attribute flip inside the frame — no
			 * refetch, no new `src`, and therefore no reload. Reloading is the
			 * one thing the frame tier is built not to do (21 §4).
			 */
			s.middlewares.use(THEME_CSS_PATH, async (_req, res) => {
				if (!themeCss) {
					try {
						if (!themesDir) throw new Error('@skeletonlabs/skeleton is not installed')
						const files = (await readdir(themesDir))
							.filter((f) => f.endsWith('.css'))
							.sort()
						if (!files.length) throw new Error(`no theme files in ${themesDir}`)
						const blocks = await Promise.all(
							files.map((f) => readFile(join(themesDir, f), 'utf8')),
						)
						themeCss =
							`/* Serene Pub — frame token stylesheet.\n` +
							`   Every stock Skeleton theme's custom properties, served whole.\n` +
							`   Apply one with data-theme="<name>" on your root element.\n` +
							`\n` +
							`   WHAT THIS GIVES YOU: the theme's palette — --color-primary-500,\n` +
							`   --color-surface-50..950, the contrast tokens, and the rest of the\n` +
							`   ramp. These follow the THEME.\n` +
							`\n` +
							`   WHAT IT DOES NOT: the semantic mode-aware tokens Skeleton builds\n` +
							`   on top with light-dark() live in its base layer, which is written\n` +
							`   in Tailwind at-rules and cannot be served as plain CSS. Compiling\n` +
							`   it here would also drag in utility classes your own build never\n` +
							`   emitted, which is worse than not having it.\n` +
							`\n` +
							`   So MODE IS YOURS. data-mode is set on your root and color-scheme\n` +
							`   follows it; pick your own sides of the ramp:\n` +
							`\n` +
							`     body                 { background: var(--color-surface-50)  }\n` +
							`     [data-mode="dark"] body { background: var(--color-surface-950) }\n` +
							`\n` +
							`   Tokens only: no utility classes, because your own build owns\n` +
							`   those (10 §6). */\n` +
							`:root { color-scheme: light }\n` +
							`[data-mode="dark"] { color-scheme: dark }\n` +
							blocks.join('\n')
					} catch (e) {
						// A missing or restructured Skeleton is a frame with no
						// tokens, not a dead dev server — and the message belongs
						// in the stylesheet, where the author is already looking
						// when the styling is absent.
						themeCss =
							`/* Serene Pub — no theme tokens available.\n` +
							`   ${(e as Error).message}\n` +
							`   Frames render with their own defaults only. */\n`
					}
				}
				res.setHeader('Content-Type', 'text/css; charset=utf-8')
				// A frame is an opaque origin and sends no credentials; the
				// stylesheet must therefore be reachable without one, exactly
				// as core's plugin-ui route is.
				res.setHeader('Cache-Control', 'no-cache')
				res.end(themeCss)
			})

			/**
			 * Frame documents get core's CSP. Vite would otherwise serve them
			 * bare, and "it worked in the harness" would stop meaning anything
			 * the first time an author leaned on an inline <script> — which
			 * core's `script-src 'self'` refuses.
			 */
			s.middlewares.use((req, res, next) => {
				const url = req.url ?? ''
				if (url.startsWith('/@fs') && /\.html(\?|$)/.test(url))
					res.setHeader('Content-Security-Policy', frameCsp())
				next()
			})
		},

		resolveId(id) {
			if (id === VIRTUAL) return RESOLVED
		},

		async load(id) {
			if (id !== RESOLVED) return
			const entry = findEntry(pluginDir)
			let manifest: PreviewManifest
			if (!entry) {
				manifest = {
					id: 'unknown',
					title: pluginDir,
					targets: [],
					problems: [
						`no entry module in ${pluginDir} — the harness looks for ` +
							ENTRY_CANDIDATES.join(', '),
					],
				}
			} else if (!server) {
				// Config-time load (build, or a probe before the server exists).
				manifest = { id: 'unknown', title: pluginDir, targets: [], problems: [] }
			} else {
				try {
					const mod = await server.ssrLoadModule(entry)
					manifest = previewManifest(
						mod.default ?? (mod as Record<string, unknown>).extension,
					)
				} catch (e) {
					// A syntax error in the announce file must show *in the
					// harness*, not as a blank page and a terminal nobody is
					// looking at.
					manifest = {
						id: 'unknown',
						title: pluginDir,
						targets: [],
						problems: [`could not load ${entry}:\n${(e as Error).message}`],
					}
				} finally {
					// Recorded even when the load threw, and always including the
					// entry itself. A syntax error produces no module graph, so a
					// success-only record would leave the harness unable to notice
					// the fix — the one save that matters most would be ignored.
					declFiles = declarationFiles(server, entry)
					declFiles.add(posix(entry))
				}
			}

			const frames: Record<string, string> = {}
			const components: string[] = []
			for (const t of manifest.targets) {
				const abs = isAbsolute(t.entry) ? t.entry : resolve(pluginDir, t.entry)
				if (!existsSync(abs)) {
					manifest.problems.push(
						`${t.id}: '${t.entry}' does not exist — declared entries are resolved ` +
							`from the package root (${pluginDir})`,
					)
					continue
				}
				if (t.kind === 'frame') frames[t.id] = fsUrl(abs)
				else
					components.push(
						`\t${JSON.stringify(t.id)}: () => import(${JSON.stringify(fsUrl(abs))}),`,
					)
			}

			let fixtures: unknown = null
			if (options.fixtures) {
				try {
					fixtures = JSON.parse(await readFile(resolve(options.fixtures), 'utf8'))
				} catch (e) {
					manifest.problems.push(
						`--fixtures ${options.fixtures}: ${(e as Error).message}`,
					)
				}
			}

			return [
				`export const manifest = ${JSON.stringify(manifest)}`,
				`export const packageDir = ${JSON.stringify(pluginDir)}`,
				`export const themes = ${JSON.stringify(await themeNames(themesDir))}`,
				`export const themeCssPath = ${JSON.stringify(THEME_CSS_PATH)}`,
				`export const frames = ${JSON.stringify(frames)}`,
				`export const fixtureOverride = ${JSON.stringify(fixtures)}`,
				// Written as real import() expressions, not a path string handed
				// to a variable import — that is what puts these in Vite's graph
				// and gets them Svelte HMR instead of a page reload.
				`export const components = {\n${components.join('\n')}\n}`,
			].join('\n')
		},

		handleHotUpdate({ file, server: s }) {
			// Compared in one separator convention. Vite hands watcher paths
			// with forward slashes even on Windows, while `resolve()` produces
			// backslashes there — so a raw `startsWith` never matched and the
			// harness silently stopped noticing any change at all.
			if (!posix(file).startsWith(posix(pluginDir))) return
			// A declaration change can add or remove surfaces, so the list the
			// harness is rendering may no longer be the list that exists.
			if (declFiles.has(posix(file))) {
				const mod = s.moduleGraph.getModuleById(RESOLVED)
				if (mod) s.moduleGraph.invalidateModule(mod)
				s.ws.send({ type: 'full-reload' })
				return []
			}
			// Frame documents are their own browsing context; Vite's HMR client
			// inside them handles their own modules, but an edit to the .html
			// itself needs the frame reloaded, and only that frame.
			if (file.endsWith('.html')) {
				s.ws.send({ type: 'custom', event: 'serene-pub:frame-changed', data: { file } })
				return []
			}
			// Everything else is surface code: hot by ruling (dev.ts).
		},
	}
}
