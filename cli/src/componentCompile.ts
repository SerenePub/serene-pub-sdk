/**
 * The component compiler (§3.5, C6 P0): ONE build a component's source goes
 * through, whether it is a package's files on disk (`serene-pub build`,
 * `bundleComponent`, core's own components) or an admin's files in memory
 * (the app's in-app authoring). Two front doors, one compiler — the CLI and
 * the app cannot drift.
 *
 * - The bundler and Svelte's compiler are INJECTED: this module imports
 *   neither at run time, so a host picks its own esbuild (native, or wasm
 *   later) and its own Svelte, and the fingerprint says which.
 * - Authored files live in a virtual namespace: nothing the author wrote is
 *   ever read from disk, and nothing is written (`write: false`).
 * - `mode: 'in-app'` is the strict one. A specifier with a `.`/`..` segment
 *   past its relative prefix, a backslash, a NUL, a URL or scheme, an
 *   absolute path or an import attribute is refused; a relative import stays
 *   inside the virtual root; a bare one must be on `COMPONENT_IMPORTS` and
 *   RESOLVE to a file of that package's own directory (realpath, no nested
 *   `node_modules`); every file loaded is `.svelte`, `.ts`, `.js` or `.mjs`.
 *   Every refusal names the list.
 * - In every mode nothing resolves into `@remote-dom` (the host's renderer)
 *   or the component client's worker runtime.
 */
import type * as Esbuild from 'esbuild'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { readFile, realpath } from 'node:fs/promises'
import { dirname, isAbsolute, join, posix, relative, resolve } from 'node:path'
import { COMPONENT_IMPORTS, componentImportFinding, componentModuleFindings, currentBuiltAgainst, type ComponentBuiltAgainst } from '@serene-pub/sdk'
import { COMPONENT_COMPILE_LIMITS, SAFE_PATH, hasDotSegment, isSafeComponentPath, componentSourceHash } from './componentSource.js'

export { COMPONENT_COMPILE_LIMITS, isSafeComponentPath, componentSourceHash, builtAgainstOfFingerprint } from './componentSource.js'

/* ── the injected toolchain ─────────────────────────────────────────────── */

/** @internal The parts of esbuild the compiler calls — native esbuild satisfies it. */
export type ComponentBundler = Pick<typeof Esbuild, 'build' | 'transform' | 'version'>
/** @internal The parts of `svelte/compiler` the compiler calls. */
export type ComponentSvelteCompiler = Pick<typeof import('svelte/compiler'), 'compile' | 'compileModule' | 'VERSION'>

/**
 * Bumped whenever this compiler's output for the same input can change —
 * a host recompiles every stored component whose fingerprint differs.
 * @internal
 */
export const COMPONENT_COMPILER_REVISION = 1


/* ── the path grammar ───────────────────────────────────────────────────── */

const SVELTE_FILE = /\.svelte(\.(ts|js))?$/


/** A bare specifier's grammar: `name` or `@scope/name`, then plain segments. */
const BARE = /^(@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*(\/[a-zA-Z0-9_-][a-zA-Z0-9._-]*)*$/
/** A relative specifier: `./` or `../…/`, then the UI-path grammar. */
const RELATIVE = /^(\.\/|(\.\.\/)+)/
/** Files an in-app build may load, authored or resolved. */
const LOADABLE = /\.(svelte|ts|js|mjs)$/

const LIST = COMPONENT_IMPORTS.map((p) => `'${p}'`).join(', ')
const RELATIVELY = 'a component imports its own files relatively'
/**
 * Every in-app refusal names what IS allowed — said once: a finding that
 * already ends on the lead-in (an absolute path or URL) only gains the list.
 */
const namingTheList = (text: string) =>
	text.includes(LIST)
		? text
		: text.endsWith(RELATIVELY)
			? `${text}, and only ${LIST}`
			: `${text} — ${RELATIVELY}, and only ${LIST}`

const packageName = (bare: string) => {
	const parts = bare.split('/')
	return bare.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]!
}

/* ── the shared build ───────────────────────────────────────────────────── */

/** @internal The virtual namespace authored files live in. */
export const COMPONENT_SOURCE_NAMESPACE = 'sp-component'
const RENDERER = /[\\/]@remote-dom[\\/]/
const RESOLVING = Symbol('sp-component-resolving')

const inside = (file: string, dir: string) => {
	const r = relative(dir, file)
	return r !== '' && !r.startsWith('..') && !isAbsolute(r)
}

/** The nearest `package.json` above `file`, and its name. */
async function packageAt(file: string, cache: Map<string, string | null>): Promise<string | null> {
	let dir = dirname(file)
	const seen: string[] = []
	for (;;) {
		if (cache.has(dir)) return settle(cache.get(dir)!)
		seen.push(dir)
		const name = await readFile(join(dir, 'package.json'), 'utf8').then(
			(t) => (JSON.parse(t) as { name?: string }).name ?? null,
			() => undefined,
		)
		if (name !== undefined) return settle(name)
		const up = dirname(dir)
		if (up === dir) return settle(null)
		dir = up
	}
	function settle(name: string | null) {
		for (const d of seen) cache.set(d, name)
		return name
	}
}

/** The directory of the package named `name` that `file` belongs to, or null. */
async function ownPackageDir(file: string, name: string): Promise<string | null> {
	let dir = dirname(file)
	for (;;) {
		const found = await readFile(join(dir, 'package.json'), 'utf8').then(
			(t) => (JSON.parse(t) as { name?: string }).name ?? null,
			() => null,
		)
		if (found === name) return dir
		const up = dirname(dir)
		if (up === dir) return null
		dir = up
	}
}

/** @internal Where the authored source comes from: the virtual files, or a package on disk. */
export type ComponentSourceHost =
	| { kind: 'virtual'; files: ReadonlyMap<string, string>; resolveFrom: string }
	| {
			kind: 'disk'
			/** The package the component belongs to. */
			root: string
			/** Path aliases (`{ $lib: '/abs/src/lib' }`), as the package's own build resolves them. */
			alias?: Record<string, string>
	  }

/** @internal One file a split build wrote (in memory): its name relative to `outdir`, and what it imports. */
export interface ComponentBuildOutput {
	/** Relative to `outdir`, forward slashes (`stats.js`, `shared-AB12CD34.js`). */
	file: string
	code: string
	/** The entry's name when this file is an entry's module. */
	entry?: string
	/** The other outputs it imports, relative to `outdir`, and how. */
	imports: Array<{ file: string; kind: Esbuild.ImportKind | 'file-loader' }>
}

/** @internal The one build both front doors run. Throws esbuild's failure as-is. */
export async function runComponentBuild(opts: {
	host: ComponentSourceHost
	/**
	 * Absolute on disk; the virtual path in memory. A map of name → absolute
	 * entry is a SPLIT build: every entry in one run, what they share in
	 * `shared-<hash>.js` chunks they import relatively — core's own
	 * components only (one owner's worker loads them all); disk and
	 * `package` mode only, with `outdir`.
	 */
	entry: string | Record<string, string>
	mode: 'in-app' | 'package'
	framework?: 'svelte' | 'vanilla'
	esbuild: ComponentBundler
	svelte?: ComponentSvelteCompiler
	/** Disk only: the path the module will be written to (esbuild names inputs relative to it). */
	outfile?: string
	/** A split build only: the directory its outputs are named for (nothing is written). */
	outdir?: string
}): Promise<{
	code: string
	bundled: string[]
	warnings: string[]
	inputs: string[]
	/** A split build's every output (entries and chunks), in esbuild's order. */
	outputs?: ComponentBuildOutput[]
	/** A split build's entries → every source file each reaches, absolute and sorted. */
	entryInputs?: Record<string, string[]>
}> {
	const { host, mode, esbuild } = opts
	const virtual = host.kind === 'virtual'
	const inApp = mode === 'in-app'
	const split = typeof opts.entry !== 'string'
	if (split && (virtual || inApp || !opts.outdir))
		throw new Error('a split component build is disk, package mode and an outdir only — an in-app build is one self-contained module')
	const root = host.kind === 'virtual' ? host.resolveFrom : host.root
	const alias = host.kind === 'disk' ? (host.alias ?? {}) : {}
	const NS = COMPONENT_SOURCE_NAMESPACE
	const bundled = new Set<string>()
	const warnings: string[] = []
	const names = new Map<string, string | null>()
	/** A file of the author's own — not a dependency's, wherever that is linked from. */
	const ownOnDisk = (file: string) => inside(file, root) && !/[\\/]node_modules[\\/]/.test(relative(root, file))
	const mine = (args: { importer: string; namespace: string }) =>
		virtual ? args.namespace === NS : ownOnDisk(args.importer)
	const refuse = (text: string) => ({ errors: [{ text: inApp ? namingTheList(text) : text }] })

	let svelteCompiler: ComponentSvelteCompiler | null | undefined = opts.svelte
	const loadSvelte = async (): Promise<ComponentSvelteCompiler | null> => {
		if (svelteCompiler !== undefined) return svelteCompiler
		try {
			svelteCompiler = (await import('svelte/compiler')) as ComponentSvelteCompiler
		} catch {
			svelteCompiler = null
		}
		return svelteCompiler
	}
	const read = async (path: string, namespace: string) =>
		namespace === NS && host.kind === 'virtual' ? host.files.get(path)! : readFile(path, 'utf8')

	/** A virtual relative import, resolved the way esbuild resolves one on disk. */
	const resolveVirtual = (importer: string, spec: string): string | { escapes: true } | undefined => {
		if (host.kind !== 'virtual') return undefined
		const joined = posix.normalize(posix.join(posix.dirname(importer), spec))
		// The virtual root is the whole world: nothing above it exists.
		if (joined === '..' || joined.startsWith('../') || joined.startsWith('/')) return { escapes: true }
		const tries = [joined, `${joined}.ts`, `${joined}.js`, `${joined}/index.ts`, `${joined}/index.js`]
		if (joined.endsWith('.js')) tries.push(joined.slice(0, -3) + '.ts')
		return tries.find((t) => host.files.has(t))
	}

	/** The worker runtime's own file, resolved once — no component reaches it. */
	let workerRuntime: string | null | undefined
	const isWorkerRuntime = async (path: string, build: Esbuild.PluginBuild) => {
		if (workerRuntime === undefined) {
			const r = await build.resolve('@serene-pub/component-client/worker-runtime', {
				kind: 'import-statement',
				resolveDir: root,
				importer: join(root, 'package.json'),
				pluginData: { [RESOLVING]: true },
			})
			workerRuntime = r.errors.length || !r.path ? null : await realpath(r.path).catch(() => r.path)
		}
		if (!workerRuntime) return false
		return path === workerRuntime || (await realpath(path).catch(() => path)) === workerRuntime
	}

	const guard: Esbuild.Plugin = {
		name: 'sp-component-imports',
		setup(build) {
			build.onResolve({ filter: /.*/ }, async (args) => {
				if (args.kind === 'entry-point')
					return virtual ? { path: args.path, namespace: NS } : undefined
				if (args.pluginData?.[RESOLVING]) return undefined
				const authored = mine(args)
				// What the author wrote is judged as written (URLs, absolute paths,
				// traversal, the renderer by name)…
				if (authored) {
					const refused = componentImportFinding(args.path, { bundled: !inApp })
					if (refused) return refuse(refused)
					if (inApp) {
						if (args.with && Object.keys(args.with).length)
							return refuse(
								`'${args.path}' carries an import attribute (with { ${Object.entries(args.with)
									.map(([k, v]) => `${k}: '${v}'`)
									.join(', ')} }) — a component imports modules, never raw files`,
							)
						const rel = RELATIVE.exec(args.path)
						const rest = rel ? args.path.slice(rel[0].length) : args.path
						if (rel ? !SAFE_PATH.test(rest) || hasDotSegment(rest) : !BARE.test(args.path))
							return refuse(`'${args.path}' is not a plain import path`)
					}
					if (virtual && RELATIVE.test(args.path)) {
						const found = resolveVirtual(args.importer, args.path)
						if (typeof found === 'object') return refuse(`'${args.path}' reaches past the component's own files`)
						if (!found) return refuse(`'${args.path}' is not one of the component's files`)
						return { path: found, namespace: NS }
					}
				}
				// …and every import by where it LANDS: a tsconfig path, a package
				// `imports` alias or a symlink can name one thing and reach another.
				// One Svelte, the package's own, for its compiled components and
				// for the component client alike: two runtimes cannot share a mount.
				const svelte = args.path === 'svelte' || args.path.startsWith('svelte/')
				const aliased = Object.entries(alias).find(([key]) => args.path === key || args.path.startsWith(key + '/'))
				const target = aliased ? aliased[1] + args.path.slice(aliased[0].length) : args.path
				const fromVirtual = args.namespace === NS
				const r = await build.resolve(target, {
					kind: args.kind,
					importer: svelte || fromVirtual ? join(root, 'package.json') : args.importer,
					resolveDir: svelte || fromVirtual ? root : args.resolveDir,
					with: args.with,
					pluginData: { [RESOLVING]: true },
				})
				if (r.errors.length) return { errors: r.errors }
				if (RENDERER.test(r.path))
					return refuse(`'${args.path}' resolves into @remote-dom — the host's renderer is never part of a component`)
				if (!r.external && r.path && (await isWorkerRuntime(r.path, build)))
					return refuse(
						`'${args.path}' resolves into the component client's worker runtime — a component is started by it, never imports it`,
					)
				if (inApp) {
					if (r.external || r.namespace !== 'file' || !LOADABLE.test(r.path))
						return refuse(`'${args.path}' resolves to '${r.path}', which is not a module a component may load`)
					if (authored) {
						// A listed name is not enough: the file it lands on must be that
						// package's OWN file, not a sibling's, a parent's or a nested dependency's.
						const pkg = packageName(args.path)
						const real = await realpath(r.path).catch(() => null)
						const dir = real && (await ownPackageDir(real, pkg))
						const realDir = dir && (await realpath(dir).catch(() => null))
						if (!real || !realDir || !inside(real, realDir) || /[\\/]node_modules[\\/]/.test(relative(realDir, real)))
							return refuse(`'${args.path}' resolves outside the package '${pkg}'`)
					}
				}
				// What the author imports by a listed name is the kit, not a
				// third-party package carried along (`@serene-pub/sdk/component`
				// lands in the SDK's own files, and is not "bundling the SDK").
				const listed = COMPONENT_IMPORTS.some((p) =>
					p.endsWith('/*') ? args.path.startsWith(p.slice(0, -1)) : args.path === p,
				)
				if (authored && !listed && !r.external && !(virtual ? false : ownOnDisk(r.path))) {
					const name = await packageAt(r.path, names)
					if (name && !COMPONENT_IMPORTS.some((p) => (p.endsWith('/*') ? name.startsWith(p.slice(0, -1)) : name === p)))
						bundled.add(name)
				}
				return {
					path: r.path,
					namespace: r.namespace,
					external: r.external,
					sideEffects: r.sideEffects,
					suffix: r.suffix,
					pluginData: r.pluginData,
				}
			})
			build.onLoad({ filter: /\.svelte$/ }, async (args) => {
				if (opts.framework === 'vanilla' && args.namespace === NS)
					return { errors: [{ text: `'${args.path}' is a Svelte component and this component's framework is vanilla` }] }
				const svelteC = await loadSvelte()
				if (!svelteC)
					return {
						errors: [{ text: `'${args.path}' is a Svelte component and svelte is not installed — npm i -D svelte` }],
					}
				const source = await read(args.path, args.namespace)
				let out: ReturnType<ComponentSvelteCompiler['compile']>
				try {
					out = svelteC.compile(source, { filename: args.path, generate: 'client', css: 'external' })
				} catch (e) {
					return { errors: [svelteError(e, args.path, args.namespace)] }
				}
				if (out.css?.code?.trim())
					warnings.push(
						`${args.path}: its <style> is dropped — a component styles itself with classes ` +
							`(styles are not in the host-element vocabulary; a widget skin does the rest)`,
					)
				for (const w of out.warnings) warnings.push(`${args.path}: ${w.message}`)
				return { contents: out.js.code, loader: 'js', resolveDir: args.namespace === NS ? root : dirname(args.path) }
			})
			// A rune module (`store.svelte.ts`): its `$state` is compiled too, or
			// it reaches the worker as a call to nothing.
			build.onLoad({ filter: /\.svelte\.(js|ts)$/ }, async (args) => {
				if (opts.framework === 'vanilla' && args.namespace === NS)
					return { errors: [{ text: `'${args.path}' is a Svelte module and this component's framework is vanilla` }] }
				const svelteC = await loadSvelte()
				if (!svelteC)
					return { errors: [{ text: `'${args.path}' is a Svelte module and svelte is not installed — npm i -D svelte` }] }
				let source = await read(args.path, args.namespace)
				if (args.path.endsWith('.ts')) {
					try {
						source = (await esbuild.transform(source, { loader: 'ts', sourcefile: args.path, target: 'es2022' })).code
					} catch (e) {
						const failure = e as { errors?: Esbuild.Message[] }
						if (!failure.errors) throw e
						return {
							errors: failure.errors.map((m) => ({
								text: m.text,
								location: m.location && { ...m.location, file: args.path, namespace: args.namespace },
							})),
						}
					}
				}
				let out: ReturnType<ComponentSvelteCompiler['compileModule']>
				try {
					out = svelteC.compileModule(source, { filename: args.path, generate: 'client' })
				} catch (e) {
					return { errors: [svelteError(e, args.path, args.namespace)] }
				}
				for (const w of out.warnings) warnings.push(`${args.path}: ${w.message}`)
				return { contents: out.js.code, loader: 'js', resolveDir: args.namespace === NS ? root : dirname(args.path) }
			})
			if (host.kind === 'virtual')
				build.onLoad({ filter: /\.(ts|js)$/, namespace: NS }, (args) => ({
					contents: host.files.get(args.path)!,
					loader: args.path.endsWith('.ts') ? 'ts' : 'js',
					resolveDir: root,
				}))
		},
	}
	const result = await esbuild.build({
		metafile: true,
		entryPoints: typeof opts.entry === 'string' ? [opts.entry] : opts.entry,
		...(virtual
			? { absWorkingDir: root }
			: split
				? { outdir: opts.outdir, entryNames: '[name]', chunkNames: 'shared-[hash]', splitting: true }
				: { outfile: opts.outfile }),
		write: false,
		bundle: true,
		format: 'esm',
		platform: 'browser',
		target: 'es2022',
		conditions: ['svelte', 'browser'],
		mainFields: ['svelte', 'browser', 'module', 'main'],
		plugins: [guard],
		logLevel: 'silent',
		legalComments: 'none',
	})
	const inputs = Object.keys(result.metafile?.inputs ?? {})
	if (typeof opts.entry !== 'string') {
		const outdir = resolve(opts.outdir!)
		const metaOut = new Map(
			Object.entries(result.metafile!.outputs).map(([out, meta]) => [resolve(process.cwd(), out), meta]),
		)
		const rel = (abs: string) => relative(outdir, abs).split('\\').join('/')
		const byInput = new Map(Object.entries(opts.entry).map(([name, file]) => [resolve(file), name]))
		const onDisk = (key: string) => resolve(process.cwd(), key.replace(/^[^:]+:/, ''))
		const outputs: ComponentBuildOutput[] = (result.outputFiles ?? []).map((f) => {
			const meta = metaOut.get(resolve(f.path))
			const entry = meta?.entryPoint ? byInput.get(onDisk(meta.entryPoint)) : undefined
			return {
				file: rel(resolve(f.path)),
				code: f.text,
				...(entry ? { entry } : {}),
				imports: (meta?.imports ?? []).map((i) => ({ file: rel(resolve(process.cwd(), i.path)), kind: i.kind })),
			}
		})
		// Every source an entry reaches, as its own single build would list it:
		// the import graph walked from the entry, not the bytes that survived.
		const graph = result.metafile!.inputs
		const entryInputs: Record<string, string[]> = {}
		for (const [key] of Object.entries(graph)) {
			const name = byInput.get(onDisk(key))
			if (!name) continue
			const seen = new Set<string>()
			const walk = (k: string) => {
				if (seen.has(k) || !graph[k]) return
				seen.add(k)
				for (const i of graph[k]!.imports) if (!i.external) walk(i.path)
			}
			walk(key)
			entryInputs[name] = [...seen].map(onDisk).sort()
		}
		return { code: '', bundled: [...bundled].sort(), warnings, inputs, outputs, entryInputs }
	}
	const code = result.outputFiles?.find((f) => f.path.endsWith('.js'))?.text ?? result.outputFiles?.[0]?.text ?? ''
	// A computed `import(x)` gets past any build: the worker's CSP is what
	// refuses it at run time, and an author should hear that before then.
	if (/\bimport\s*\(/.test(code))
		warnings.push(
			`${opts.entry}: the module still imports at run time (\`import(…)\`) — a component's ` +
				`UI worker loads nothing but the app's own files, so bundle what it needs`,
		)
	return { code, bundled: [...bundled].sort(), warnings, inputs }
}

/* ── the split front door (core's own components) ───────────────────────── */

/** @internal A split build's shared chunk file name. */
export const COMPONENT_CHUNK_FILE = /^shared-[A-Za-z0-9_-]+\.js$/

/** @internal */
export interface ComponentSetBuild {
	/**
	 * Served name → code: an entry by its name (`stats`), a chunk by its file
	 * (`shared-….js`). Only what an entry reaches by a static `import` is
	 * here; a chunk esbuild left for a dynamic `import()` it then shook out
	 * (which nothing loads) is not.
	 */
	modules: Record<string, string>
	/** Entry → every source file it was built from, absolute and sorted — its own single build's inputs. */
	inputs: Record<string, string[]>
	/** Third-party packages inlined into the set, by name. */
	bundled: string[]
	/** Said, not fatal (Svelte's warnings, a dropped `<style>`). */
	warnings: string[]
}

/**
 * Build a set of ONE owner's components together (core's, C7 unit M): each
 * entry one module, what they share in `shared-<hash>.js` chunks the entries
 * import relatively, so the owner's one UI worker loads Svelte's runtime and
 * the helpers once. The same build, guard and loaders as every other
 * component (`package` mode); nothing is written — the caller writes
 * `modules` into `outdir`.
 *
 * Every served module is judged as a host judges it (`componentModuleFindings`)
 * and may reach another only by a static `import`; a finding, a run-time
 * `import(…)` or an output that is neither an entry nor a chunk throws.
 *
 * Never for a plugin or an authored component: their modules stay
 * self-contained, and nothing here is loaded by another owner's worker (R35).
 * @internal
 */
export async function buildComponentSet(opts: {
	/** The package the components belong to. */
	root: string
	/** Name → the entry's source, absolute. A name is what serves it (`/core-ui/<name>`). */
	entries: Record<string, string>
	/** The directory the modules will be served from (output names are relative to it). */
	outdir: string
	esbuild: ComponentBundler
	svelte?: ComponentSvelteCompiler
	alias?: Record<string, string>
}): Promise<ComponentSetBuild> {
	const built = await runComponentBuild({
		host: { kind: 'disk', root: opts.root, alias: opts.alias },
		entry: opts.entries,
		outdir: opts.outdir,
		mode: 'package',
		esbuild: opts.esbuild,
		svelte: opts.svelte,
	})
	const outputs = new Map(built.outputs!.map((o) => [o.file, o]))
	const modules: Record<string, string> = {}
	const reach = (file: string) => {
		const out = outputs.get(file)
		if (!out) throw new Error(`component set: no output ${file}`)
		const name = out.entry ?? file
		if (Object.hasOwn(modules, name)) return
		if (!out.entry && !COMPONENT_CHUNK_FILE.test(file)) throw new Error(`component set: unexpected output ${file}`)
		const { errors } = componentModuleFindings(out.code)
		if (errors.length) throw new Error(`component set: ${file} would be refused: ${errors.join('; ')}`)
		if (/\bimport\s*\(/.test(out.code)) throw new Error(`component set: ${file} imports at run time`)
		modules[name] = out.code
		for (const i of out.imports) {
			if (i.kind !== 'import-statement') throw new Error(`component set: ${file} imports ${i.file} by ${i.kind}`)
			reach(i.file)
		}
	}
	for (const name of Object.keys(opts.entries)) {
		const out = built.outputs!.find((o) => o.entry === name)
		if (!out) throw new Error(`component set: no module for ${name}`)
		reach(out.file)
	}
	return { modules, inputs: built.entryInputs!, bundled: built.bundled, warnings: built.warnings }
}

/** A thrown Svelte `CompileError` as an esbuild message at the authored line. */
function svelteError(e: unknown, file: string, namespace: string): Esbuild.PartialMessage {
	const err = e as { message?: string; start?: { line: number; column: number } }
	const text = String(err?.message ?? e).split('\n')[0]!
	return err?.start
		? { text, location: { file, namespace, line: err.start.line, column: err.start.column, lineText: '' } }
		: { text }
}

/* ── the source hash ────────────────────────────────────────────────────── */


/* ── the fingerprint ────────────────────────────────────────────────────── */

/** `name`'s `package.json` version as Node would find it from `from`, or `none`. */
function versionFrom(name: string, from: string): string {
	let dir = resolve(from)
	for (;;) {
		for (const candidate of [join(dir, 'node_modules', name, 'package.json'), join(dir, 'package.json')]) {
			if (!existsSync(candidate)) continue
			try {
				const pkg = JSON.parse(readFileSync(realpathSync(candidate), 'utf8')) as { name?: string; version?: string }
				if (pkg.name === name) return pkg.version ?? 'none'
			} catch {
				/* unreadable: keep looking */
			}
		}
		const up = dirname(dir)
		if (up === dir) return 'none'
		dir = up
	}
}

/**
 * What a compiled component depends on besides its source: the compiler's
 * revision, the bundler, Svelte's compiler, and the runtime packages inlined
 * into every module (Svelte, the SDK, the component client, the controls),
 * as resolved from `resolveFrom`. A host stores it beside each artifact and
 * recompiles wherever it differs.
 * @internal
 */
export function toolchainFingerprint(
	opts: { esbuild?: Pick<ComponentBundler, 'version'>; svelte?: Pick<ComponentSvelteCompiler, 'VERSION'> | null; resolveFrom?: string } = {},
): string {
	const from = opts.resolveFrom ?? process.cwd()
	const svelteRuntime = versionFrom('svelte', from)
	const against = componentBuiltAgainst(from)
	return [
		`compiler@${COMPONENT_COMPILER_REVISION}`,
		// The host contract the module assumes (F1) — `builtAgainstOfFingerprint` reads these back.
		`widget-protocol@${against.widgetProtocol}`,
		`host-elements@${against.hostElements}`,
		`esbuild@${opts.esbuild?.version ?? versionFrom('esbuild', from)}`,
		`svelte-compiler@${opts.svelte ? opts.svelte.VERSION : svelteRuntime}`,
		`svelte@${svelteRuntime}`,
		`sdk@${versionFrom('@serene-pub/sdk', from)}`,
		`component-client@${versionFrom('@serene-pub/component-client', from)}`,
		`controls@${versionFrom('@serene-pub/controls', from)}`,
	].join(' ')
}

/**
 * @internal The packager and the in-app compile record it; read it off their output.
 *
 * What a module built from `resolveFrom` is built against (F1): the widget
 * protocol and host-element vocabulary of the SDK the CLI runs (the one the
 * component client it bundles was released with), and the SDK and
 * component-client versions as resolved from `resolveFrom`, for the reader.
 * The packager writes it on each manifest component entry; the in-app
 * compile returns it (and the fingerprint carries it).
 */
export function componentBuiltAgainst(resolveFrom: string = process.cwd()): ComponentBuiltAgainst {
	const v = (name: string) => {
		const found = versionFrom(name, resolveFrom)
		return found === 'none' ? undefined : found
	}
	return currentBuiltAgainst({ sdk: v('@serene-pub/sdk'), componentClient: v('@serene-pub/component-client') })
}

/* ── the in-memory front door ───────────────────────────────────────────── */

/** @internal Where a compile error sits in the AUTHORED file: line 1-based, column 0-based (esbuild's). */
export interface ComponentCompileError {
	file: string
	line: number
	column: number
	text: string
}

/** @internal */
export interface ComponentCompileResult {
	/** The self-contained ES module; `''` when `errors` is not empty. */
	code: string
	/** SHA-256 of `code`, hex; `''` when `errors` is not empty. */
	hash: string
	/** Said, not fatal: a `<style>` dropped, a run-time `import()`, Svelte's own warnings. Sorted. */
	warnings: string[]
	errors: ComponentCompileError[]
	/** `toolchainFingerprint()` of the toolchain that built it. */
	fingerprint: string
	/** The host contract it was built against (F1) — what a host judges before mounting it. */
	builtAgainst: ComponentBuiltAgainst
}

/** @internal */
export interface CompileComponentSourceOptions {
	/** Relative path → source. Paths follow `isSafeComponentPath`. */
	files: Record<string, string>
	/** One of `files`' keys. */
	entry: string
	framework: 'svelte' | 'vanilla'
	/**
	 * `in-app`: imports held to `COMPONENT_IMPORTS`, confined as the module
	 * header says. `package`: a CLI build's rules — other packages may be
	 * bundled (and are listed in warnings).
	 */
	mode: 'in-app' | 'package'
	/** The bundler, injected (`import * as esbuild from 'esbuild'`). */
	esbuild: ComponentBundler
	/** Svelte's compiler, injected; loaded from this package's own `svelte` when omitted. */
	svelte?: ComponentSvelteCompiler
	/** Where `svelte` and the allowlisted packages resolve from (absolute); `process.cwd()` when omitted. */
	resolveFrom?: string
	/** A host may LOWER `COMPONENT_COMPILE_LIMITS`; a higher value is ignored. */
	limits?: Partial<Record<keyof typeof COMPONENT_COMPILE_LIMITS, number>>
}

const bytes = (s: string) => Buffer.byteLength(s, 'utf8')
const at = (file: string, text: string): ComponentCompileError => ({ file, line: 0, column: 0, text })

/** @internal Compile a component from in-memory source. Never throws for the author's mistakes: they come back in `errors`. */
export async function compileComponentSource(opts: CompileComponentSourceOptions): Promise<ComponentCompileResult> {
	const resolveFrom = resolve(opts.resolveFrom ?? process.cwd())
	const fingerprint = toolchainFingerprint({ esbuild: opts.esbuild, svelte: opts.svelte ?? null, resolveFrom })
	const builtAgainst = componentBuiltAgainst(resolveFrom)
	const failed = (errors: ComponentCompileError[], warnings: string[] = []): ComponentCompileResult => ({
		code: '',
		hash: '',
		warnings: [...warnings].sort(),
		errors,
		fingerprint,
		builtAgainst,
	})
	const L = Object.fromEntries(
		Object.entries(COMPONENT_COMPILE_LIMITS).map(([k, v]) => {
			const lower = opts.limits?.[k as keyof typeof COMPONENT_COMPILE_LIMITS]
			return [k, typeof lower === 'number' && lower >= 0 ? Math.min(v, lower) : v]
		}),
	) as Record<keyof typeof COMPONENT_COMPILE_LIMITS, number>
	const entries = Object.entries(opts.files ?? {})
	const errors: ComponentCompileError[] = []
	if (entries.length > L.files) errors.push(at('', `${entries.length} files — a component has at most ${L.files}`))
	let total = 0
	for (const [path, source] of entries) {
		if (typeof source !== 'string') {
			errors.push(at(path, `'${path}' is not text`))
			continue
		}
		if (!isSafeComponentPath(path))
			errors.push(
				at(
					path,
					`'${path}' is not a component file path — plain relative segments of [A-Za-z0-9._-], no '.' or '..', ending .svelte, .ts or .js`,
				),
			)
		else if (opts.framework === 'vanilla' && SVELTE_FILE.test(path))
			errors.push(at(path, `'${path}' is a Svelte file and this component's framework is vanilla`))
		const size = bytes(source)
		total += size
		if (size > L.fileBytes) errors.push(at(path, `'${path}' is ${size} bytes — a file is at most ${L.fileBytes}`))
	}
	if (total > L.sourceBytes) errors.push(at('', `${total} bytes of source — a component is at most ${L.sourceBytes}`))
	if (!Object.prototype.hasOwnProperty.call(opts.files ?? {}, opts.entry))
		errors.push(at(opts.entry, `the entry '${opts.entry}' is not one of the component's files`))
	if (errors.length) return failed(errors)

	let built: Awaited<ReturnType<typeof runComponentBuild>>
	try {
		built = await runComponentBuild({
			host: { kind: 'virtual', files: new Map(entries), resolveFrom },
			entry: opts.entry,
			mode: opts.mode,
			framework: opts.framework,
			esbuild: opts.esbuild,
			svelte: opts.svelte,
		})
	} catch (e) {
		const failure = e as { errors?: Esbuild.Message[]; warnings?: Esbuild.Message[] }
		if (!failure.errors) return failed([at('', String((e as Error)?.message ?? e))])
		return failed(failure.errors.map(located))
	}
	const warnings = [...built.warnings]
	if (built.bundled.length) warnings.push(`the module bundles ${built.bundled.join(', ')}`)
	const size = bytes(built.code)
	if (size > L.outputBytes)
		return failed([at(opts.entry, `the built module is ${size} bytes — a component is at most ${L.outputBytes}`)], warnings)
	return {
		code: built.code,
		hash: createHash('sha256').update(built.code).digest('hex'),
		warnings: warnings.sort(),
		errors: [],
		fingerprint,
		builtAgainst,
	}
}

/** An esbuild message at the authored file (the virtual namespace stripped). */
function located(m: Esbuild.Message): ComponentCompileError {
	const loc = m.location
	if (!loc) return at('', m.text)
	const prefix = `${COMPONENT_SOURCE_NAMESPACE}:`
	const file = loc.file.startsWith(prefix) ? loc.file.slice(prefix.length) : loc.file
	return { file, line: loc.line, column: loc.column, text: m.text }
}
