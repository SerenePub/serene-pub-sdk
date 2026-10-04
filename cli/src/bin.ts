#!/usr/bin/env node
/**
 * `serene-pub` — the plugin author's command line.
 *
 * Three verbs, and each one answers a question an author actually asks:
 *
 *   build     what will core see when it installs this? (manifest + documents)
 *   check     what am I doing that core will refuse, and why?
 *   contracts what types does this release give me to pin against?
 *
 * There is deliberately no `publish` and no `install`. Installing an extension is an
 * admin action inside SP, not something a build tool can do to somebody's instance —
 * a CLI that could install would be a CLI that could be scripted into installing.
 */

import { readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises'
import { realpathSync } from 'node:fs'
import { join, resolve, relative } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import {
	compilePlugin,
	scanSource,
	renderFindings,
	cannotDo,
	scanFrameDocument,
	declaredFrameEntries,
	frameEntriesIn,
	matchesGlob,
	DEFAULT_PERMISSION_IGNORES,
	type CompileFinding,
	type SourceFile,
} from './compiler.js'
import { generateContracts } from './codegen.js'
import { componentModuleFindings } from '@serene-pub/sdk'
import { typeSurfaces } from './typeSurfaces.js'

const USAGE = `serene-pub <command>

  build [dir]        package the plugin in [dir] (default: .) into dist/plugin/
  check [dir]        report what core would refuse, without writing anything
  contracts [dir]    generate a /contracts module from the types [dir] registers
  scaffold config <spec-id>    print a config skeleton — the whole option space,
                               commented, defaults shown, (required) marked
  scaffold preset <genre-id>   print a preset skeleton — the genre's event
                               surface with the announced candidates per slot
  create component <slug> [--vanilla] [--widget] [--embed-document] [--dir <pkg>]
                     write a remote component (Svelte, or plain DOM with --vanilla)
                     and print the declarations to add; --widget adds the widget
                     naming it, --embed-document an sp-frame region and its document
  clone <core-slug> [--as <slug>] [--dir <pkg>] [--force]
                     copy a core component's source into components/<as>/
                     (default <as>: my-<core-slug>), paths kept, with a
                     based-on.json recording what was copied; print the
                     component (with basedOn) and widget declarations to add,
                     and what the copy — a plugin's widget — cannot do
  clone --list       the core components a package may copy, with each one's
                     sourceHash
  drift [dir]        hold each component's basedOn.sourceHash against core's
                     source now and list the files core changed since the
                     copy (exits 1 when core moved on)
  drift [dir] --retrofit <slug> [--force]
                     write a based-on.json for a copy made without clone: from
                     core's source at its basedOn.sourceHash when the catalog
                     (or --catalog) still has it, else from the copy as it
                     stands — per-file history starts now, and it says so
  scaffold plugin <dir> --slug vendor.name
                               write a whole buildable package into <dir>:
                               placeholders and comments, no logic. Compose
                               --genre (a genre, its create/reply pair, a preset
                               and a prompt row) · --action (a question and the
                               spec that answers it) · --panel (a widget whose
                               component holds one document) ·
                               --storage (a keyed ctx.storage pair and its grant)
  docs               render an announcement into markdown reference pages —
                     one per genre and pipeline, plus the package index
                     (--html: a self-contained static site instead)
                     (--examples <dir>: run the examples in <dir> and render a
                     page each, output checked against the goldens beside them)
  types              generate typed use() handles from an announcement, so
                     config() autocompletes the target's whole option space
  ui [dir]           run the surface harness: a dev server that renders the UI
                     surfaces this package announces — frames in the same
                     opaque-origin sandbox core mounts them in, components in
                     the host document — with hot reload. (alias: preview)

Options
  --out <dir|file>   where to write (build, contracts, scaffold)
  --ignore <glob>    skip files matching <glob> (check, build; repeatable).
                     Test, example and fixture paths are still read, but never
                     read as the plugin: no permission, no hook count, no
                     sandbox refusal. A stand-in host's commit() is not the
                     plugin's reach, and a test's local handler variable is
                     not a registration.
  --port <n>         harness port (ui). Default: vite's choice
  --host             harness listens on all interfaces (ui)
  --open             open a browser (ui)
  --fixtures <file>  JSON replacing the harness's built-in fixtures (ui)
  --from <src>       scaffold declarations source: an announcement JSON file or
                     URL. Default: the installed @serene-pub/core-catalog.
  --catalog <dir>    clone/drift: a directory of <slug>.source.json files instead
                     of the installed @serene-pub/core-catalog's
  --release <ver>    stamped into the generated contracts banner
  --goldens <dir>    where the examples' goldens live (docs --examples).
                     Default: goldens/ beside the examples
  --update-goldens   record missing goldens and rewrite moved ones instead of
                     failing (docs --examples)
  --json             machine-readable output
`

/**
 * The package's source, and what was left out of it.
 *
 * Two kinds of leaving-out, and they are not the same kind (D-2). A `--ignore`
 * glob drops the file: the author has said it is not the plugin. The default
 * list stops a file being read *as the plugin* — no permission, no hook count,
 * no sandbox refusal — while still linting it, because a `fetch()` in it is
 * still a `fetch()` in the package. Both halves of that were incidents: `check
 * .` answering `core:write · provider:call` off an example's fake ctx, and a
 * test's `for (const handler of …) await handler(…)` counted as eleven
 * registrations against an extension's ten.
 * @internal
 */
export async function sourcesIn(
	dir: string,
	ignore: readonly string[] = [],
): Promise<{ sources: SourceFile[]; ignored: string[] }> {
	const sources: SourceFile[] = []
	const ignored = new Set<string>()
	const walk = async (d: string) => {
		for (const entry of await readdir(d)) {
			if (entry === 'node_modules' || entry === 'dist' || entry.startsWith('.')) continue
			const full = join(d, entry)
			const s = await stat(full)
			if (s.isDirectory()) await walk(full)
			else if (/\.(ts|tsx|js|mjs)$/.test(entry) && !/\.d\.ts$/.test(entry)) {
				const path = relative(dir, full)
				const skipped = ignore.find((g) => matchesGlob(g, path))
				if (skipped) {
					ignored.add(skipped)
					continue
				}
				const muted = DEFAULT_PERMISSION_IGNORES.find((g) => matchesGlob(g, path))
				if (muted) ignored.add(muted)
				sources.push({
					path,
					text: await readFile(full, 'utf8'),
					...(muted ? { permissions: false } : {}),
				})
			}
		}
	}
	await walk(dir)
	return { sources, ignored: [...ignored] }
}

/**
 * The frame documents a package declares, read off disk.
 *
 * The compiler never touches a filesystem — it is text in, findings out, which
 * is what lets a test state a document in three lines — so the paths are
 * resolved here. A document that is not there is not this pass's business:
 * the *shape* of an entry is `surfaceFindings`'s and a missing file is the
 * instance's, and inventing a third opinion would refuse a package mid-move.
 * @internal
 */
export async function frameDocumentsIn(
	dir: string,
	entries: readonly string[],
	ignore: readonly string[] = [],
): Promise<Array<{ path: string; text: string }>> {
	const out: Array<{ path: string; text: string }> = []
	const seen = new Set<string>()
	for (const entry of entries) {
		const path = entry.replace(/^\.\//, '')
		if (seen.has(path) || path.startsWith('/') || path.split('/').includes('..')) continue
		seen.add(path)
		if (ignore.some((g) => matchesGlob(g, path))) continue
		const text = await readFile(resolve(dir, path), 'utf8').catch(() => undefined)
		if (text !== undefined) out.push({ path, text })
	}
	return out
}

/**
 * The dynamic half. The packager reads source statically *and* evaluates the author's
 * entry module to get the built `Extension` — the two halves are cross-checked against
 * each other, which is what catches a hook registered behind an `if` (13 §30).
 *
 * Evaluating here is safe in a way it is not in core: this runs on the author's own
 * machine, on their own code. **Core never does this** — it imports documents, never
 * authoring JS (F6).
 */
async function loadExtension(dir: string): Promise<{ extension: unknown; entry: string }> {
	const { ENTRY_CANDIDATES } = await import('@serene-pub/sdk')
	for (const candidate of ENTRY_CANDIDATES) {
		const p = resolve(dir, candidate)
		try {
			const mod = await import(pathToFileURL(p).href)
			// The path as well as the value: the sandbox bundle is built FROM
			// this module, and guessing the entry a second time could pick a
			// different candidate than the one that actually loaded.
			return { extension: mod.default ?? mod.extension, entry: p }
		} catch (e) {
			if ((e as NodeJS.ErrnoException).code !== 'ERR_MODULE_NOT_FOUND') throw e
		}
	}
	throw new Error(
		`no entry module found in ${dir}. Export your defineExtension(…) result as the default ` +
			`export of src/index.ts or dist/index.js.`,
	)
}

const flag = (argv: string[], name: string) => {
	const i = argv.indexOf(`--${name}`)
	return i === -1 ? undefined : argv[i + 1]
}

/** The repeatable form: every `--name <value>` on the line, in order. */
const flags = (argv: string[], name: string): string[] => {
	const out: string[] = []
	for (let i = 0; i < argv.length; i++) {
		const v = argv[i + 1]
		if (argv[i] === `--${name}` && v !== undefined && !v.startsWith('--')) out.push(v)
	}
	return out
}

/**
 * Said once, and only when something was actually left out — a list of
 * patterns printed on every run is a list nobody reads, and an author who
 * cannot see why `check` stopped reporting a permission has no way to guess.
 */
function reportIgnored(ignored: readonly string[], to: NodeJS.WritableStream): void {
	if (!ignored.length) return
	to.write(`\nignored: ${ignored.join(', ')}\n`)
	to.write(`  (--ignore skips a file; the defaults only stop one being read as the plugin)\n`)
}

/**
 * The sandbox bundle (D-6b) — the code half of the artifact, beside the
 * declarations.
 *
 * One self-contained CJS source assigning `module.exports = { hooks: … }`,
 * which is what every backend evaluates and calls a hook out of by name
 * (`installPluginPackage` reads it at `dist/plugin/bundle.js`). The entry it is
 * built from is generated, not the author's: their module exports an
 * `Extension` whose handlers are declarations, and the sandbox needs the functions
 * under the names the manifest gives them — see `pluginHooks.ts`.
 *
 * `esbuild` is an optional peer, so it is imported here rather than at module
 * scope: every other command runs without it, and only this one needs it.
 * Returns the problem instead of throwing, because a build that fails has to
 * say which half failed and why.
 */
async function buildSandboxBundle(
	dir: string,
	entry: string,
	extension: unknown,
): Promise<{ source?: string; problem?: string }> {
	const { hookBindingsFor, pluginEntrySource, entrySpecifier } = await import('./pluginHooks.js')
	const ext = extension as
		| { handlers?: never[]; templateEngines?: Record<string, unknown> }
		| undefined
	const bindings = hookBindingsFor(ext?.handlers, ext?.templateEngines)
	// Nothing to run. A package that only declares — a genre, pipelines,
	// presets — ships no bundle and is not missing one.
	if (!bindings.length) return {}
	let bundlePlugin: typeof import('./sandbox-bundle.js').bundlePlugin
	try {
		;({ bundlePlugin } = await import('./sandbox-bundle.js'))
	} catch {
		return {
			problem:
				`this package declares ${bindings.length} hook(s) and the bundler is not ` +
				`installed, so its code cannot be packaged: install esbuild ` +
				`(npm i -D esbuild). Without dist/plugin/bundle.js a pub installs ` +
				`the declarations and none of the handlers.`,
		}
	}
	try {
		return {
			source: await bundlePlugin({
				source: pluginEntrySource(bindings, entrySpecifier(dir, entry)),
				resolveDir: dir,
			}),
		}
	} catch (e) {
		return {
			problem: `the sandbox bundle did not build: ${e instanceof Error ? e.message : String(e)}`,
		}
	}
}

/**
 * Build every declared component into `<out>/components/<slug>.js` and point
 * its manifest entry there (the declared path is kept as `source`, the
 * packages it inlines as `bundled`, and the host contract it was built
 * against as `builtAgainst` — F1). Rewrites the manifest's rows in place.
 * esbuild is imported lazily, as the sandbox bundle's is.
 */
async function buildComponents(
	dir: string,
	out: string,
	components: Array<{ slug: string; entry: string; source?: string; bundled?: string[]; builtAgainst?: import('@serene-pub/sdk').ComponentBuiltAgainst }>,
): Promise<{ problem?: string; warnings: string[] }> {
	const warnings: string[] = []
	if (!components.length) return { warnings }
	let bundleComponent: typeof import('./componentBundle.js').bundleComponent
	try {
		;({ bundleComponent } = await import('./componentBundle.js'))
	} catch {
		return {
			warnings,
			problem:
				`this package declares ${components.length} component(s) and the bundler is not ` +
				`installed, so they cannot be built: install esbuild (npm i -D esbuild).`,
		}
	}
	for (const c of components) {
		const source = c.source ?? c.entry
		const outfile = join(out, 'components', `${c.slug}.js`)
		try {
			const b = await bundleComponent({ entry: resolve(dir, source), outfile, root: dir })
			warnings.push(...b.warnings)
			// What a host will judge the module on (C30), judged here first.
			const judged = componentModuleFindings(await readFile(outfile, 'utf8'))
			if (judged.errors.length)
				return { warnings, problem: `component '${c.slug}': ${judged.errors.join('; ')}` }
			warnings.push(...judged.advisories.map((a) => `component '${c.slug}': ${a}`))
			c.source = source
			c.entry = relative(dir, outfile).split('\\').join('/')
			if (b.bundled.length) c.bundled = b.bundled
			// What it assumes of the host (F1): a host that has moved on refuses it by name.
			c.builtAgainst = b.builtAgainst
		} catch (e) {
			return {
				warnings,
				problem: `component '${c.slug}' (${source}) did not build: ${e instanceof Error ? e.message : String(e)}`,
			}
		}
	}
	return { warnings }
}

/**
 * What a build says beyond the file list: the ids an instance must already have,
 * and how completely each preset fills its genre's event surface.
 *
 * Shared by both build paths, so a package that moves its genre onto
 * `defineExtension` (D-1) reads the same report it read from `announce()`. A
 * coverage line is the only place an author sees a slot they left unbound on
 * purpose, so it is not something one of the two paths should have and the other
 * not.
 */
function writeDeclarationReport(
	requires: readonly string[],
	coverage: import('@serene-pub/sdk').CoverageReport | undefined,
): void {
	if (requires.length) {
		process.stdout.write(`\nrequires (enforced at install, never bundled):\n`)
		for (const r of requires) process.stdout.write(`  · ${r}\n`)
	}
	for (const p of coverage?.presets ?? []) {
		process.stdout.write(`\npreset '${p.preset}' → ${p.genre}\n`)
		for (const s of p.slots)
			process.stdout.write(
				`  ${s.event.padEnd(18)} ${s.status}${
					s.binding
						? ` ← ${s.binding.spec}${s.binding.config ? ` @ ${s.binding.config}` : ''}`
						: ''
				}\n`,
			)
	}
	for (const t of coverage?.todos ?? []) process.stdout.write(`todo: ${t.path} — ${t.note}\n`)
}

/**
 * Declaration resolution, shared by scaffold/docs/types (24 §10): an
 * announcement JSON file, an HTTP URL serving one, or the installed
 * @serene-pub/core-catalog. Nothing is guessed.
 */
async function resolveAnnouncement(
	argv: string[],
): Promise<import('@serene-pub/sdk').AnnouncementDocument | null> {
	const from = flag(argv, 'from')
	if (from && /^https?:\/\//.test(from)) {
		const res = await fetch(from)
		if (!res.ok) {
			process.stderr.write(`--from ${from} answered ${res.status}\n`)
			return null
		}
		return (await res.json()) as never
	}
	if (from) return JSON.parse(await readFile(resolve(from), 'utf8'))
	// The specifier is widened to `string` so tsc does not resolve it: core-catalog
	// depends on the cli, so on a clean build the cli compiles before core-catalog's
	// types exist (the same pattern as cloneComponent's catalogMeta).
	const catalog = (await import('@serene-pub/core-catalog' as string).catch(() => null)) as {
		coreAnnouncement(): { document: import('@serene-pub/sdk').AnnouncementDocument }
	} | null
	if (!catalog) {
		process.stderr.write(
			`no --from given and @serene-pub/core-catalog is not installed — ` +
				`add it as a devDependency, or point --from at an announcement JSON.\n`,
		)
		return null
	}
	return catalog.coreAnnouncement().document
}

/** @internal */
export async function main(argv = process.argv.slice(2)): Promise<number> {
	const [cmd, maybeDir] = argv
	const dir = resolve(maybeDir && !maybeDir.startsWith('--') ? maybeDir : '.')
	const json = argv.includes('--json')

	if (!cmd || cmd === '--help' || cmd === '-h') {
		process.stdout.write(USAGE)
		return 0
	}

	if (cmd === 'check') {
		const ignore = flags(argv, 'ignore')
		const { sources, ignored } = await sourcesIn(dir, ignore)
		const scan = scanSource(sources)
		// `check` never evaluates the author's module — that is what makes its
		// answer the same whichever export a package defaults — so the frame
		// documents are the ones the source names, read lexically.
		const documents = await frameDocumentsIn(dir, frameEntriesIn(sources), ignore)
		const findings: CompileFinding[] = [
			...scan.findings,
			...documents.flatMap((d) => scanFrameDocument(d)),
		]
		if (json) {
			process.stdout.write(JSON.stringify({ ...scan, findings }, null, 2) + '\n')
			reportIgnored(ignored, process.stderr)
		} else {
			process.stdout.write(renderFindings(findings) + '\n')
			process.stdout.write(`\npermissions this code would request:\n`)
			for (const p of scan.permissions) process.stdout.write(`  ${p}\n`)
			reportIgnored(ignored, process.stdout)
		}
		return findings.some((f) => f.severity === 'error') ? 1 : 0
	}

	if (cmd === 'build') {
		const ignore = flags(argv, 'ignore')
		const { sources, ignored } = await sourcesIn(dir, ignore)
		const { extension, entry } = await loadExtension(dir)
		// On stderr on both paths, so `--json` output stays parseable.
		reportIgnored(ignored, process.stderr)

		// The announce() path (24 §6): a package whose entry exports an
		// AnnouncementBuilder builds to a declaration artifact — the
		// announcement IS the manifest. External references land in
		// `requires`; nothing external is bundled (24 §10).
		if (
			extension &&
			typeof (extension as any).build === 'function' &&
			(extension as any).identity?.ns
		) {
			// Kept one release: announce() is the serializer behind
			// defineExtension now, not an authoring surface (R48, T1b).
			process.stderr.write(
				`warning: this package's entry exports an announce(…) builder. Declare the package with ` +
					`defineExtension({ … }) instead — the one authoring entry; announce() is internal and ` +
					`this path goes at the SDK 1.0 freeze.\n`,
			)
			const { document, coverage } = (extension as any).build()
			const out = resolve(dir, flag(argv, 'out') ?? 'dist/plugin')
			await mkdir(join(out, 'pipelines'), { recursive: true })
			await writeFile(join(out, 'announcement.json'), JSON.stringify(document, null, 2))
			for (const doc of document.pipelines)
				await writeFile(
					join(out, 'pipelines', `${doc.id.replace(/[:/]/g, '_')}.json`),
					JSON.stringify(doc, null, 2),
				)
			if (json) process.stdout.write(JSON.stringify(document, null, 2) + '\n')
			else {
				process.stdout.write(
					`wrote announcement + ${document.pipelines.length} documents to ` +
						`${relative(process.cwd(), out)}\n`,
				)
				writeDeclarationReport(document.requires, coverage)
			}
			return 0
		}

		// The unified path (D-1): a `defineExtension` result, which since D-1 may
		// carry the genre, surfaces, presets, configs and prompts that only an
		// announcement could carry before. One manifest holds both halves.
		// Both halves name the documents: the evaluated `surfaces` is the
		// statement an instance reads, the lexical pass catches a surface a
		// package declares somewhere this build did not evaluate.
		const frameDocuments = await frameDocumentsIn(
			dir,
			[
				...declaredFrameEntries((extension as { surfaces?: never } | undefined)?.surfaces),
				...frameEntriesIn(sources),
			],
			ignore,
		)
		const r = compilePlugin({ sources, extension: extension as never, frameDocuments })
		if (!r.ok) {
			process.stderr.write(renderFindings(r.findings) + '\n')
			return 1
		}
		// Warnings on a green build still get said — to stderr, so --json output
		// stays parseable. A warning nobody sees is a check that does not exist.
		if (r.findings.length) process.stderr.write(renderFindings(r.findings) + '\n')
		const out = resolve(dir, flag(argv, 'out') ?? 'dist/plugin')
		await mkdir(join(out, 'pipelines'), { recursive: true })
		// Components (§3.5, C3): each declared source becomes one built module
		// the page's UI worker imports; the manifest names the BUILT file.
		const built = await buildComponents(dir, out, r.manifest!.components)
		if (built.problem) {
			process.stderr.write(`✗ ${built.problem}\n`)
			return 1
		}
		for (const w of built.warnings) process.stderr.write(`warning: ${w}\n`)
		await writeFile(join(out, 'manifest.json'), JSON.stringify(r.manifest, null, 2))
		for (const doc of r.documents)
			await writeFile(
				join(out, 'pipelines', `${doc.id.replace(/[:/]/g, '_')}.json`),
				JSON.stringify(doc, null, 2),
			)
		// The code half (D-6b). A package that declares callables and ships no
		// bundle installs its declarations and none of its code — the failure
		// D-6 spent a day finding — so the build fails rather than writing an
		// artifact that cannot work.
		const bundle = await buildSandboxBundle(dir, entry, extension)
		if (bundle.problem) {
			process.stderr.write(`✗ ${bundle.problem}\n`)
			return 1
		}
		if (bundle.source !== undefined) await writeFile(join(out, 'bundle.js'), bundle.source)
		if (json) process.stdout.write(JSON.stringify(r.manifest, null, 2) + '\n')
		else {
			process.stdout.write(
				`wrote ${r.documents.length + (bundle.source === undefined ? 1 : 2)} files to ` +
					`${relative(process.cwd(), out)}\n\n`,
			)
			// Printed on every successful build on purpose. The list of what a plugin
			// *cannot* do is generated from the manifest, so it cannot flatter — and an
			// author who sees it here is not surprised by it on the consent screen.
			process.stdout.write('what this plugin cannot do:\n')
			for (const line of cannotDo(r.manifest!)) process.stdout.write(`  · ${line}\n`)
			writeDeclarationReport(r.manifest!.requires ?? [], r.coverage)
		}
		return 0
	}

	// `scaffold plugin <dir>` writes a tree rather than printing a file, and it
	// reads no announcement — so it forks before the declaration resolution the
	// other two scaffolds share.
	// `create component <slug>` writes a remote component's files into the
	// package in [--dir] (default: .) and prints the declarations to add.
	if (cmd === 'create' && argv[1] === 'component') {
		const slug = argv[2]
		if (!slug || slug.startsWith('--')) {
			process.stderr.write(`create component takes a slug: serene-pub create component who-next --widget\n\n${USAGE}`)
			return 1
		}
		const { writeComponentScaffold, ComponentScaffoldError } = await import('./scaffoldComponent.js')
		try {
			const { files, declarations } = await writeComponentScaffold(resolve(flag(argv, 'dir') ?? '.'), {
				slug,
				vanilla: argv.includes('--vanilla'),
				widget: argv.includes('--widget'),
				embedDocument: argv.includes('--embed-document'),
			})
			for (const f of files) process.stdout.write(`wrote ${f.path}\n`)
			process.stdout.write(`\nadd to your package:\n\n${declarations}\n\nthen: serene-pub build .\n`)
			return 0
		} catch (e) {
			if (!(e instanceof ComponentScaffoldError)) throw e
			process.stderr.write(`${e.message}\n`)
			return 1
		}
	}

	// `clone <core-slug>` copies a core component's source into the package in
	// [--dir] (default: .) and prints the declarations; `clone --list` names
	// what can be copied. `drift [dir]` holds each clone's basedOn against
	// core's source now. All three read core's `<slug>.source.json`.
	if (cmd === 'clone') {
		const mod = await import('./cloneComponent.js')
		const catalogDir = flag(argv, 'catalog')
		const pkgDir = resolve(flag(argv, 'dir') ?? '.')
		try {
			if (argv.includes('--list')) {
				const rows = await mod.listCloneable(pkgDir, { catalogDir })
				if (json) process.stdout.write(JSON.stringify(rows, null, 2) + '\n')
				else {
					process.stdout.write(`core components a package may copy (serene-pub clone <slug>):\n\n`)
					for (const r of rows) {
						process.stdout.write(
							`  ${r.slug.padEnd(16)} ${r.label} · ${r.files} files · ${r.catalogVersion}\n` +
								`  ${''.padEnd(16)} sourceHash ${r.sourceHash}\n`,
						)
						if (r.viewOnly) process.stdout.write(`  ${''.padEnd(16)} view-only in the app — runs on core's trust\n`)
						for (const l of r.loses) process.stdout.write(`  ${''.padEnd(16)} a copy: ${l}\n`)
					}
				}
				return 0
			}
			const slug = argv[1]
			if (!slug || slug.startsWith('--')) {
				process.stderr.write(`clone takes a core component's slug: serene-pub clone stats --as my-stats\n\n${USAGE}`)
				return 1
			}
			const r = await mod.cloneCoreComponent(pkgDir, {
				slug,
				as: flag(argv, 'as'),
				force: argv.includes('--force'),
				catalogDir,
			})
			if (json) {
				process.stdout.write(JSON.stringify(r, null, 2) + '\n')
				return 0
			}
			for (const f of r.written) process.stdout.write(`wrote ${f}\n`)
			if (r.viewOnly || r.loses.length) {
				process.stderr.write(
					`\nwarning: ${
						r.viewOnly
							? `core offers '${slug}' view-only in the app: it runs on core's trust, and a copy never does. `
							: ''
					}Your copy is a plugin's widget, so the host holds it to a plugin's rules:\n`,
				)
				for (const l of r.loses) process.stderr.write(`  · ${l}\n`)
				process.stderr.write(
					`  Mount it with @serene-pub/cli/testing and read view.refused to see each one; ` +
						`do the same work through your own actions.\n`,
				)
			}
			if (r.dependencies.length)
				process.stdout.write(`\nthe copy imports: ${r.dependencies.join(', ')} — your package must depend on each\n`)
			process.stdout.write(`\nadd to your package:\n\n${r.declarations}\n\nthen: serene-pub build .\n`)
			return 0
		} catch (e) {
			if (!(e instanceof mod.CloneError)) throw e
			process.stderr.write(`${e.message}\n`)
			return 1
		}
	}

	if (cmd === 'drift') {
		const mod = await import('./cloneComponent.js')
		try {
			const { extension } = await loadExtension(dir)
			const components = ((extension as { components?: unknown } | undefined)?.components ?? []) as Parameters<
				typeof mod.driftReport
			>[1]
			const retrofit = flag(argv, 'retrofit')
			if (argv.includes('--retrofit')) {
				if (!retrofit || retrofit.startsWith('--')) {
					process.stderr.write(`drift --retrofit takes one of the package's component slugs: serene-pub drift --retrofit my-stats\n`)
					return 1
				}
				const r = await mod.retrofitCloneBase(
					dir,
					components.find((c) => c?.slug === retrofit),
					{ catalogDir: flag(argv, 'catalog'), force: argv.includes('--force') },
				)
				if (json) process.stdout.write(JSON.stringify(r, null, 2) + '\n')
				else process.stdout.write(`wrote ${r.written}\n${r.from === 'copy' ? 'note' : 'from core'}: ${r.note}\n`)
				return 0
			}
			const report = await mod.driftReport(dir, components, { catalogDir: flag(argv, 'catalog') })
			if (json) process.stdout.write(JSON.stringify(report, null, 2) + '\n')
			else process.stdout.write(mod.renderDrift(report))
			// Non-zero when core moved on, so CI can say so; `current` and the
			// entries with nothing to compare are not failures.
			return report.some((e) => e.status === 'behind') ? 1 : 0
		} catch (e) {
			if (!(e instanceof mod.CloneError)) throw e
			process.stderr.write(`${e.message}\n`)
			return 1
		}
	}

	if (cmd === 'scaffold' && argv[1] === 'plugin') {
		const target = argv[2]
		const slug = flag(argv, 'slug')
		if (!target || target.startsWith('--') || !slug) {
			process.stderr.write(
				`scaffold plugin takes a directory and a slug: ` +
					`serene-pub scaffold plugin ./my-plugin --slug vendor.name\n\n${USAGE}`,
			)
			return 1
		}
		const { writeScaffoldedPlugin, ScaffoldError } = await import('./scaffold.js')
		try {
			const files = await writeScaffoldedPlugin(resolve(target), {
				slug,
				genre: argv.includes('--genre'),
				action: argv.includes('--action'),
				panel: argv.includes('--panel'),
				storage: argv.includes('--storage'),
			})
			const where = relative(process.cwd(), resolve(target)) || '.'
			if (json)
				process.stdout.write(
					JSON.stringify(
						files.map((f) => f.path),
						null,
						2,
					) + '\n',
				)
			else {
				process.stdout.write(`wrote ${files.length} files to ${where}\n`)
				for (const file of files) process.stdout.write(`  · ${file.path}\n`)
				process.stdout.write(
					`\nnext:\n  cd ${where}\n  npm install\n  npm run check\n` +
						`  UPDATE_GOLDENS=1 npm test   (records the example's first golden)\n`,
				)
			}
			return 0
		} catch (e) {
			if (!(e instanceof ScaffoldError)) throw e
			process.stderr.write(`${e.message}\n`)
			return 1
		}
	}

	if (cmd === 'scaffold') {
		const [, kind, id] = argv
		if ((kind !== 'config' && kind !== 'preset') || !id) {
			process.stderr.write(
				`scaffold takes 'config <spec-id>', 'preset <genre-id>' or 'plugin <dir> --slug …'\n\n${USAGE}`,
			)
			return 1
		}
		const announcement = await resolveAnnouncement(argv)
		if (!announcement) return 1

		const { scaffoldConfig, scaffoldPreset } = await import('./scaffold.js')
		let text: string
		if (kind === 'preset') {
			text = scaffoldPreset(id, announcement)
		} else {
			const doc = announcement.pipelines.find((p) => p.id === id)
			if (!doc) {
				process.stderr.write(
					`'${id}' is not in this announcement. It ships: ${announcement.pipelines
						.map((p) => p.id)
						.join(', ')}\n`,
				)
				return 1
			}
			text = scaffoldConfig(doc, await typeSurfaces())
		}
		const out = flag(argv, 'out')
		if (out) {
			await writeFile(resolve(out), text)
			process.stdout.write(`wrote ${out}\n`)
		} else process.stdout.write(text)
		return 0
	}

	// Executed examples are their own source: modules that are RUN, not an
	// announcement that is read. Under plain node this needs `.js` examples or
	// a registered TypeScript loader — nothing here compiles TypeScript.
	if (cmd === 'docs' && flag(argv, 'examples')) {
		const dir = resolve(flag(argv, 'examples')!)
		const { renderExampleDocs } = await import('./docsExamples.js')
		const { pages, report } = await renderExampleDocs({
			dir,
			goldensDir: resolve(flag(argv, 'goldens') ?? join(dir, 'goldens')),
			update: argv.includes('--update-goldens'),
		})
		const out = resolve(flag(argv, 'out') ?? 'dist/docs')
		for (const page of pages) {
			const full = join(out, page.path)
			await mkdir(join(full, '..'), { recursive: true })
			await writeFile(full, page.markdown)
		}
		process.stdout.write(
			`wrote ${pages.length} example pages to ${relative(process.cwd(), out)}\n`,
		)
		for (const r of report.filter((x) => x.recorded || x.changed))
			process.stdout.write(`  golden ${r.slug}: ${r.recorded ? 'recorded' : 'rewritten'}\n`)
		return 0
	}

	if (cmd === 'docs') {
		const announcement = await resolveAnnouncement(argv)
		if (!announcement) return 1
		const typeOf = await typeSurfaces()
		const { renderAnnouncementDocs } = await import('./docs.js')
		const pages = renderAnnouncementDocs(announcement, typeOf)
		const out = resolve(flag(argv, 'out') ?? 'dist/docs')
		if (argv.includes('--html')) {
			const { renderSite } = await import('./docsSite.js')
			const site = renderSite(announcement, pages)
			for (const page of site) {
				const full = join(out, page.path)
				await mkdir(join(full, '..'), { recursive: true })
				await writeFile(full, page.html)
			}
			process.stdout.write(
				`wrote ${site.length} pages to ${relative(process.cwd(), out)} — open index.html\n`,
			)
			return 0
		}
		for (const page of pages) {
			const full = join(out, page.path)
			await mkdir(join(full, '..'), { recursive: true })
			await writeFile(full, page.markdown)
		}
		process.stdout.write(`wrote ${pages.length} pages to ${relative(process.cwd(), out)}\n`)
		return 0
	}

	if (cmd === 'types') {
		const announcement = await resolveAnnouncement(argv)
		if (!announcement) return 1
		const { generateTypedHandles } = await import('./typegen.js')
		const text = generateTypedHandles(announcement, await typeSurfaces())
		const out = flag(argv, 'out')
		if (out) {
			await writeFile(resolve(out), text)
			process.stdout.write(`wrote ${out}\n`)
		} else process.stdout.write(text)
		return 0
	}

	if (cmd === 'ui' || cmd === 'preview') {
		// The harness carries SvelteKit and Vite, which is a real install, so
		// it is optional: nobody who only ships pipelines should pay for a
		// frontend toolchain they never launch.
		const harness = await import('@serene-pub/ui-preview/server').catch(() => null)
		if (!harness) {
			process.stderr.write(
				`the surface harness is not installed. Add it to your package:\n\n` +
					`  npm i -D @serene-pub/ui-preview\n\n` +
					`It carries SvelteKit and Vite, so it is a separate install from the CLI — ` +
					`a package that ships no UI never pays for it.\n`,
			)
			return 1
		}
		const portFlag = flag(argv, 'port')
		// Computed before the harness starts: it chdir's into its own root
		// (SvelteKit pins Vite to cwd), so a relative path printed afterwards
		// would be relative to the wrong place.
		const watching = relative(process.cwd(), dir) || '.'
		const server = await harness.startSurfaceHarness({
			packageDir: dir,
			port: portFlag ? Number(portFlag) : undefined,
			host: argv.includes('--host'),
			open: argv.includes('--open'),
			fixtures: flag(argv, 'fixtures'),
		})
		server.printUrls()
		process.stdout.write(`\nwatching ${watching} — ctrl-c to stop\n`)
		// Held open by the server's own handles; the promise never settles, so
		// `main` does not return and the process does not exit under us.
		await new Promise<never>(() => {})
	}

	if (cmd === 'contracts') {
		const { allDefinitions } = await import('@serene-pub/sdk')
		// Imported for its registrations; the value itself is not read here.
		await loadExtension(dir).catch(() => undefined)
		const text = generateContracts(allDefinitions(), { release: flag(argv, 'release') })
		const out = flag(argv, 'out')
		if (out) {
			await writeFile(resolve(out), text)
			process.stdout.write(`wrote ${out}\n`)
		} else process.stdout.write(text)
		return 0
	}

	process.stderr.write(`unknown command '${cmd}'\n\n${USAGE}`)
	return 1
}

/**
 * True when this module is the process entry point (`node bin.js …`), so `main()`
 * runs only when invoked as a script, not when imported (e.g. by tests).
 *
 * `process.argv[1]` is invoked through `node_modules/.bin/serene-pub` — a symlink —
 * for every `npx serene-pub …` and every package.json `"scripts"` entry, while
 * `import.meta.url` always resolves to the real file the symlink points at. Compared
 * raw, those never match, so the guard silently never fires: `main` never runs, and
 * the process exits 0 having done nothing. Both sides are realpath'd first so a
 * symlinked argv[1] still matches. Exported so the guard can be tested against a
 * symlink without spawning a process.
 * @internal
 */
export function isEntryPoint(argv1: string | undefined, moduleUrl: string): boolean {
	if (!argv1) return false
	const real = (p: string) => {
		try {
			return realpathSync(p)
		} catch {
			return p
		}
	}
	return real(fileURLToPath(moduleUrl)) === real(argv1)
}

if (isEntryPoint(process.argv[1], import.meta.url)) {
	main().then(
		(code) => process.exit(code),
		(e) => {
			process.stderr.write(`${(e as Error).message}\n`)
			process.exit(1)
		},
	)
}
