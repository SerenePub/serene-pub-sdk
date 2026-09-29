/**
 * `serene-pub clone <core-slug>` and `serene-pub drift` (C6): a core
 * component's source, copied into a package with its paths kept, and the
 * question an author asks afterwards — has core moved on since I copied it?
 *
 * The source is core's `dist/components/<slug>.source.json`, which
 * @serene-pub/core-catalog ships beside each built module: every file the
 * component reaches under core's `components/`, and `componentSourceHash`
 * over them. A clone writes those files under `components/<as>/`, records
 * the hash of what it copied in `based-on.json` beside them (one SHA-256 per
 * file — what lets `drift` tell core's changes from the author's own), and
 * PRINTS the declarations to add. It never edits the author's entry module:
 * a tool that rewrites that is a tool nobody trusts twice.
 *
 * Nothing outside the package: every path is `isSafeComponentPath`, lands
 * under `components/<as>/`, and is refused when the nearest directory on
 * disk resolves (through a symlink) anywhere else, or when the file itself is
 * a symlink.
 */
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { access, lstat, mkdir, readFile, readdir, realpath, stat, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import {
	COMPONENT_SLUG,
	WIDGET_REQUEST_ASKERS,
	WIDGET_SCOPED_SECTIONS,
	component as componentDecl,
	widget as widgetDecl,
	type ComponentDecl,
	type WidgetDecl,
} from '@serene-pub/sdk'
import { COMPONENT_COMPILE_LIMITS, componentSourceHash, isSafeComponentPath } from './componentSource.js'

/** @experimental */
export class CloneError extends Error {}

/** @experimental `<slug>.source.json` — core-catalog's `CoreComponentSource`, restated so the CLI builds before the catalog. */
export interface CoreComponentSource {
	slug: string
	framework: ComponentDecl['framework']
	/** One of `files`' keys. */
	entry: string
	/** Relative path (under core's `components/`) → source. */
	files: Record<string, string>
	sourceHash: string
	catalogVersion: string
}

/** @experimental What a clone records beside the files it wrote: the source it copied, one hash per file. */
export interface CloneBase {
	component: string
	catalogVersion: string
	sourceHash: string
	entry: string
	/** Relative path (under the clone's root) → SHA-256 of the copied text. */
	files: Record<string, string>
	/**
	 * Written by `drift --retrofit` for a copy made without `clone`, not at the
	 * copy: `source` — from core's source at the copy's `basedOn.sourceHash`
	 * (as exact as `clone`'s own record); `copy` — that source was not to be
	 * had, so `files` hashes the copy as it stood on `at`, and per-file
	 * history starts then. Absent on a record `clone` wrote.
	 */
	retrofitted?: { from: 'source' | 'copy'; at: string }
}

/** @experimental The clone's record file, beside the files it copied. */
export const CLONE_BASE_FILE = 'based-on.json'

/** What core's own metadata says about its components (read off the installed catalog, when there is one). */
interface CatalogMeta {
	labels: Record<string, string>
	viewOnly: readonly string[]
	widgets: Record<string, WidgetDecl>
}

/** @experimental */
export interface CloneOptions {
	/** A directory of `<slug>.source.json` files, instead of the installed @serene-pub/core-catalog's. */
	catalogDir?: string
}

const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex')
const exists = (p: string) =>
	access(p).then(
		() => true,
		() => false,
	)

/**
 * Where core's `<slug>.source.json` files are: `--catalog`, else the
 * core-catalog the PACKAGE resolves (the version its build would bundle
 * against), else the one this CLI resolves.
 * @internal
 */
export async function coreSourceDir(pkgDir: string, o: CloneOptions = {}): Promise<string> {
	if (o.catalogDir) {
		const dir = resolve(o.catalogDir)
		if (!(await exists(dir))) throw new CloneError(`--catalog ${o.catalogDir} does not exist`)
		return dir
	}
	for (const from of [join(resolve(pkgDir), 'package.json'), import.meta.url]) {
		try {
			const pkg = createRequire(from).resolve('@serene-pub/core-catalog/package.json')
			const dir = join(dirname(pkg), 'dist', 'components')
			if (await exists(dir)) return dir
		} catch {}
	}
	throw new CloneError(
		`@serene-pub/core-catalog is not installed (or not built) — add it as a devDependency, ` +
			`or point --catalog at a directory of <slug>.source.json files`,
	)
}

async function catalogMeta(): Promise<CatalogMeta> {
	const catalog = (await import('@serene-pub/core-catalog' as string).catch(() => null)) as {
		CORE_COMPONENTS?: ComponentDecl[]
		CORE_VIEW_ONLY_COMPONENTS?: readonly string[]
		CORE_WIDGETS?: WidgetDecl[]
	} | null
	const labels: Record<string, string> = {}
	for (const c of catalog?.CORE_COMPONENTS ?? [])
		labels[c.slug] = typeof c.label === 'string' ? c.label : (Object.values(c.label ?? {})[0] as string) ?? c.slug
	const widgets: Record<string, WidgetDecl> = {}
	for (const w of catalog?.CORE_WIDGETS ?? []) if (typeof w.component === 'string') widgets[w.component] = w
	return { labels, viewOnly: catalog?.CORE_VIEW_ONLY_COMPONENTS ?? [], widgets }
}

/** @internal One core component's source, checked: its slug, its entry, its paths and its hash. */
export async function readCoreSource(dir: string, slug: string): Promise<CoreComponentSource> {
	if (!COMPONENT_SLUG.test(slug)) throw new CloneError(`'${slug}' is not a component slug`)
	const at = join(dir, `${slug}.source.json`)
	const text = await readFile(at, 'utf8').catch(() => undefined)
	if (text === undefined) {
		const known = (await listSourceSlugs(dir)).join(', ')
		throw new CloneError(`core has no component '${slug}'${known ? ` — cloneable: ${known}` : ''}`)
	}
	let s: CoreComponentSource
	try {
		s = JSON.parse(text)
	} catch {
		throw new CloneError(`${slug}.source.json is not JSON`)
	}
	if (s?.slug !== slug) throw new CloneError(`${slug}.source.json names component '${s?.slug}'`)
	if (!s.files || typeof s.files !== 'object') throw new CloneError(`${slug}.source.json carries no files`)
	const paths = Object.keys(s.files)
	if (paths.length > COMPONENT_COMPILE_LIMITS.files)
		throw new CloneError(`${slug}.source.json carries ${paths.length} files — more than a component may have`)
	for (const p of paths) {
		if (!isSafeComponentPath(p)) throw new CloneError(`${slug}.source.json names '${p}', which is not a component file path`)
		if (typeof s.files[p] !== 'string') throw new CloneError(`${slug}.source.json: '${p}' is not text`)
	}
	if (!Object.hasOwn(s.files, s.entry)) throw new CloneError(`${slug}.source.json: its entry '${s.entry}' is not among its files`)
	if (componentSourceHash(s.files) !== s.sourceHash)
		throw new CloneError(`${slug}.source.json: its files do not hash to its sourceHash — the file is damaged`)
	return s
}

async function listSourceSlugs(dir: string): Promise<string[]> {
	const names = await readdir(dir).catch(() => [] as string[])
	return names
		.filter((n) => n.endsWith('.source.json'))
		.map((n) => n.slice(0, -'.source.json'.length))
		.filter((s) => COMPONENT_SLUG.test(s))
		.sort()
}

// ── What an untrusted copy cannot do ────────────────────────────────────────

/** Request kinds a file asks, read statically: `request('send', …)`, `requestX('draft', …)`. */
const REQUEST_CALL = /\brequest\w*\(\s*['"]([a-z][a-z0-9-]*)['"]/g

/**
 * What the component's source reaches for that a plugin's widget is refused
 * (the host's `widgetRequestRefusal` and the receiver's rules): the request
 * kinds only core's widgets ask, the kinds a scope gates, `<sp-host-view>`
 * and `autofocus`. A static read — a kind built at runtime is not seen.
 * @experimental
 */
export interface UntrustedReach {
	/** Kinds `WIDGET_REQUEST_ASKERS` marks `'core'`: refused for a plugin's widget, whatever it holds. */
	coreOnly: string[]
	/** Kinds a scope gates: answered only when the widget is granted that scope. */
	scoped: Array<{ kind: string; scope: string }>
	/** Files placing `<sp-host-view>` — core's; a plugin's is refused. */
	hostView: string[]
	/** Files writing `autofocus` — core's to place; a plugin's is dropped. */
	autofocus: string[]
	/**
	 * Scopes whose section the source reads (`….session_full?.v1`): core's
	 * widgets hold every scope, so core's declaration names none — a copy
	 * must declare each, and is reviewed for it.
	 */
	sections: string[]
}

/** @experimental */
export function untrustedReach(files: Readonly<Record<string, string>>): UntrustedReach {
	const kinds = new Set<string>()
	const hostView: string[] = []
	const autofocus: string[] = []
	for (const path of Object.keys(files).sort()) {
		const text = files[path]!
		for (const m of text.matchAll(REQUEST_CALL)) kinds.add(m[1]!)
		if (/sp-host-view/.test(text)) hostView.push(path)
		if (/\bautofocus\b/.test(text)) autofocus.push(path)
	}
	const sections: string[] = []
	for (const [scope, section] of Object.entries(WIDGET_SCOPED_SECTIONS))
		if (Object.values(files).some((t) => new RegExp(`\\.${section}\\??\\.v1\\b`).test(t))) sections.push(scope)
	const coreOnly: string[] = []
	const scoped: Array<{ kind: string; scope: string }> = []
	for (const kind of [...kinds].sort()) {
		if (!Object.hasOwn(WIDGET_REQUEST_ASKERS, kind)) continue
		const askers = WIDGET_REQUEST_ASKERS[kind as keyof typeof WIDGET_REQUEST_ASKERS]
		if (askers === 'core') coreOnly.push(kind)
		else if (typeof askers === 'object') scoped.push({ kind, scope: askers.scope })
	}
	return { coreOnly, scoped, hostView, autofocus, sections }
}

/** @experimental The lines a clone prints about what its copy loses — empty when it loses nothing. */
export function untrustedReachLines(r: UntrustedReach): string[] {
	const out: string[] = []
	if (r.coreOnly.length)
		out.push(`requests only core's widgets may ask are refused: ${r.coreOnly.map((k) => `'${k}'`).join(', ')}`)
	for (const s of r.scoped)
		out.push(`'${s.kind}' is answered only when the widget is granted the '${s.scope}' scope (scopes: ['${s.scope}'])`)
	if (r.sections.length)
		out.push(
			`it reads ${r.sections.map((s) => `'${s}'`).join(', ')} — declared in scopes and granted at review, never held as core's are`,
		)
	if (r.hostView.length) out.push(`<sp-host-view> is core's and is refused (${r.hostView.join(', ')})`)
	if (r.autofocus.length) out.push(`autofocus is core's to place and is dropped (${r.autofocus.join(', ')})`)
	return out
}

/** @internal The packages a component's source imports — what the cloning package must depend on. */
export function importedPackages(files: Readonly<Record<string, string>>): string[] {
	const out = new Set<string>()
	const re = /(?:\bfrom\s*|\bimport\s*\(?\s*)['"]([^'"./][^'"]*)['"]/g
	for (const text of Object.values(files))
		for (const m of text.matchAll(re)) {
			const parts = m[1]!.split('/')
			out.add(parts[0]!.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]!)
		}
	return [...out].sort()
}

// ── clone --list ────────────────────────────────────────────────────────────

/** @experimental */
export interface CloneableComponent {
	slug: string
	label: string
	sourceHash: string
	catalogVersion: string
	files: number
	/** Core offers it view-only in the app (it runs on core's trust); a package may still copy it. */
	viewOnly: boolean
	/** What a package's copy cannot do, as {@link untrustedReachLines} says it. */
	loses: string[]
}

/** @experimental */
export async function listCloneable(pkgDir: string, o: CloneOptions = {}): Promise<CloneableComponent[]> {
	const dir = await coreSourceDir(pkgDir, o)
	const meta = await catalogMeta()
	const out: CloneableComponent[] = []
	for (const slug of await listSourceSlugs(dir)) {
		const s = await readCoreSource(dir, slug)
		out.push({
			slug,
			label: meta.labels[slug] ?? slug,
			sourceHash: s.sourceHash,
			catalogVersion: s.catalogVersion,
			files: Object.keys(s.files).length,
			viewOnly: meta.viewOnly.includes(slug),
			loses: untrustedReachLines(untrustedReach(s.files)),
		})
	}
	return out
}

// ── clone ───────────────────────────────────────────────────────────────────

/** @experimental */
export interface CloneRequest extends CloneOptions {
	/** Core's component slug. */
	slug: string
	/** The copy's slug — its directory under `components/`, its component slug and its widget id. Default `my-<slug>`. */
	as?: string
	/** Overwrite files that are already there. */
	force?: boolean
}

/** @experimental */
export interface CloneResult {
	/** Paths written, relative to the package. */
	written: string[]
	component: ComponentDecl
	widget: WidgetDecl
	/** The declarations to paste, as source. */
	declarations: string
	/** What the copy cannot do, running as a plugin's widget. */
	loses: string[]
	/** Core offers this one view-only in the app. */
	viewOnly: boolean
	/** The packages the copied source imports. */
	dependencies: string[]
}

/** Refuse a target that resolves outside the package, or is a symlink. */
async function assertInside(pkgReal: string, target: string, shown: string) {
	const link = await lstat(target).catch(() => undefined)
	if (link?.isSymbolicLink()) throw new CloneError(`${shown} is a symlink — nothing was written`)
	let probe = dirname(target)
	while (!(await exists(probe))) probe = dirname(probe)
	const real = await realpath(probe)
	const rel = relative(pkgReal, real)
	if (rel.startsWith('..') || isAbsolute(rel))
		throw new CloneError(`${shown} resolves outside the package (through ${probe}) — nothing was written`)
}

const q = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
const list = (xs: readonly string[]) => `[${xs.map(q).join(', ')}]`

/** @experimental */
export async function cloneCoreComponent(pkgDir: string, o: CloneRequest): Promise<CloneResult> {
	const pkg = resolve(pkgDir)
	if (!(await stat(pkg).then((s) => s.isDirectory(), () => false)))
		throw new CloneError(`${pkgDir} is not a directory — --dir names the package to clone into`)
	const as = o.as ?? `my-${o.slug}`
	if (!COMPONENT_SLUG.test(as))
		throw new CloneError(`--as '${as}' is not a component slug — lowercase letters, digits and '-'`)
	const dir = await coreSourceDir(pkg, o)
	const meta = await catalogMeta()
	if ((await listSourceSlugs(dir)).includes(as) || Object.hasOwn(meta.widgets, as))
		throw new CloneError(
			`--as '${as}' is core's component's slug — a layout names core's widget and yours by bare id, so choose another`,
		)
	const source = await readCoreSource(dir, o.slug)

	const root = `components/${as}`
	const pkgReal = await realpath(pkg)
	const planned: Array<{ rel: string; at: string; text: string }> = []
	for (const path of Object.keys(source.files).sort()) {
		const rel = `${root}/${path}`
		// The component path grammar, applied to the whole package-relative path too.
		if (!isSafeComponentPath(path) || !isSafeComponentPath(rel)) throw new CloneError(`'${path}' is not a component file path`)
		const at = resolve(pkg, rel)
		const inside = relative(pkg, at)
		if (inside.startsWith('..') || isAbsolute(inside) || inside.split(sep).join('/') !== rel)
			throw new CloneError(`'${path}' would land outside ${root}/ — nothing was written`)
		planned.push({ rel, at, text: source.files[path]! })
	}
	const base: CloneBase = {
		component: source.slug,
		catalogVersion: source.catalogVersion,
		sourceHash: source.sourceHash,
		entry: source.entry,
		files: Object.fromEntries(Object.keys(source.files).sort().map((p) => [p, sha256(source.files[p]!)])),
	}
	planned.push({ rel: `${root}/${CLONE_BASE_FILE}`, at: resolve(pkg, root, CLONE_BASE_FILE), text: JSON.stringify(base, null, '\t') + '\n' })

	const clashes: string[] = []
	for (const f of planned) {
		await assertInside(pkgReal, f.at, f.rel)
		if (await exists(f.at)) clashes.push(f.rel)
	}
	if (clashes.length && !o.force)
		throw new CloneError(
			`${clashes.length === 1 ? `${clashes[0]} already exists` : `${clashes.length} files already exist (${clashes[0]}, …)`}` +
				` — nothing was written; --force overwrites them`,
		)
	for (const f of planned) {
		await mkdir(dirname(f.at), { recursive: true })
		await assertInside(pkgReal, f.at, f.rel)
		await writeFile(f.at, f.text)
	}

	const coreLabel = meta.labels[o.slug] ?? o.slug
	const label = `${coreLabel} (copy)`
	const entry = `${root}/${source.entry}`
	const component = componentDecl({
		slug: as,
		label,
		entry,
		framework: source.framework,
		basedOn: { component: source.slug, version: source.catalogVersion, sourceHash: source.sourceHash },
	})
	const coreWidget = meta.widgets[o.slug]
	const reach = untrustedReach(source.files)
	const scopes = [
		...new Set([...(coreWidget?.scopes ?? []), ...reach.sections, ...reach.scoped.map((s) => s.scope)]),
	] as string[]
	const reads = (coreWidget?.reads ?? []) as string[]
	const widget = widgetDecl({
		id: as,
		title: label,
		component: as,
		...(scopes.length ? { scopes: scopes as WidgetDecl['scopes'] } : {}),
		...(reads.length ? { reads: reads as WidgetDecl['reads'] } : {}),
	})

	const declarations = [
		`import { component, widget } from '@serene-pub/sdk'`,
		``,
		`// in defineExtension({ … }):`,
		`components: [`,
		`\tcomponent({`,
		`\t\tslug: ${q(as)},`,
		`\t\tlabel: ${q(label)},`,
		`\t\tentry: ${q(entry)},`,
		`\t\tframework: ${q(source.framework)},`,
		`\t\t// what it was copied from — \`serene-pub drift\` compares this with core's current source`,
		`\t\tbasedOn: { component: ${q(source.slug)}, version: ${q(source.catalogVersion)}, sourceHash: ${q(source.sourceHash)} },`,
		`\t}),`,
		`],`,
		``,
		`// and the widget that mounts it — core's widget's scopes and reads; add genres: [yourGenre]`,
		`// to offer it in those genres only, and copy core's settings if your copy reads them:`,
		`widgets: [`,
		`\twidget({`,
		`\t\tid: ${q(as)},`,
		`\t\ttitle: ${q(label)},`,
		`\t\tcomponent: ${q(as)},`,
		...(scopes.length ? [`\t\tscopes: ${list(scopes)},`] : []),
		...(reads.length ? [`\t\treads: ${list(reads)},`] : []),
		`\t}),`,
		`],`,
	].join('\n')

	return {
		written: planned.map((f) => f.rel),
		component,
		widget,
		declarations,
		loses: untrustedReachLines(reach),
		viewOnly: meta.viewOnly.includes(o.slug),
		dependencies: importedPackages(source.files),
	}
}

// ── drift ───────────────────────────────────────────────────────────────────

/** @experimental */
export type FileChange = 'changed' | 'added' | 'removed'

/** @experimental */
export interface DriftEntry {
	/** The package's component slug. */
	slug: string
	/** Core's component it was copied from. */
	upstream: string
	/**
	 * - `current` — `basedOn.sourceHash` is core's source's hash now
	 * - `behind` — core's source has changed since the copy
	 * - `unpinned` — `basedOn` names no `sourceHash`, so there is nothing to compare
	 * - `unknown` — core has no component by that slug any more
	 */
	status: 'current' | 'behind' | 'unpinned' | 'unknown'
	basedOnHash?: string
	coreHash?: string
	coreVersion?: string
	/**
	 * `behind` with the clone's `based-on.json`: what CORE changed since the
	 * copy, each marked when the author edited that file too (merge by hand).
	 * `behind` without it: every file where the copy and core's source differ
	 * now — core's changes and the author's together, not told apart; there
	 * `added` is a file only core has, `removed` one only the copy has.
	 */
	files?: Array<{ path: string; change: FileChange; editedHere?: boolean }>
	/** Whether {@link files} is core's changes alone (a `based-on.json` was found). */
	separated?: boolean
	/**
	 * When the `based-on.json` was retrofitted from the copy itself (`drift
	 * --retrofit` with core's old source not to be had): the day per-file history
	 * starts. {@link files} is then what differs from core now against the
	 * copy as it stood that day (your earlier edits and core's together), and
	 * `editedHere` marks a file edited since.
	 */
	retrofittedAt?: string
	/** The clone's root, relative to the package, when it was found. */
	root?: string
}

async function readTree(root: string): Promise<Record<string, string>> {
	const out: Record<string, string> = {}
	const walk = async (d: string) => {
		for (const name of await readdir(d).catch(() => [] as string[])) {
			const full = join(d, name)
			const s = await lstat(full)
			if (s.isDirectory()) await walk(full)
			else if (s.isFile() && isSafeComponentPath(relative(root, full).split(sep).join('/')))
				out[relative(root, full).split(sep).join('/')] = await readFile(full, 'utf8')
		}
	}
	await walk(root)
	return out
}

/** The clone's root: the directory holding `based-on.json` above the entry, else the entry minus core's entry path. */
async function cloneRoot(pkg: string, entry: string, coreEntry: string): Promise<{ root?: string; base?: CloneBase }> {
	const e = entry.replace(/^\.\//, '')
	let d = dirname(e)
	while (d && d !== '.' && d !== '/') {
		const at = resolve(pkg, d, CLONE_BASE_FILE)
		const inside = relative(pkg, at)
		if (inside.startsWith('..') || isAbsolute(inside)) break
		const text = await readFile(at, 'utf8').catch(() => undefined)
		if (text !== undefined) {
			try {
				return { root: d, base: JSON.parse(text) as CloneBase }
			} catch {
				return { root: d }
			}
		}
		d = dirname(d)
	}
	if (e.endsWith(`/${coreEntry}`)) return { root: e.slice(0, -coreEntry.length - 1) }
	return {}
}

const fileDiff = (from: Record<string, string>, to: Record<string, string>) => {
	const out: Array<{ path: string; change: FileChange }> = []
	for (const p of [...new Set([...Object.keys(from), ...Object.keys(to)])].sort()) {
		if (!Object.hasOwn(to, p)) out.push({ path: p, change: 'removed' })
		else if (!Object.hasOwn(from, p)) out.push({ path: p, change: 'added' })
		else if (from[p] !== to[p]) out.push({ path: p, change: 'changed' })
	}
	return out
}

/**
 * Each of `components` that records a `basedOn`, held against core's
 * current source: whether core moved on, and which files it moved.
 * @experimental
 */
export async function driftReport(
	pkgDir: string,
	components: readonly Pick<ComponentDecl, 'slug' | 'entry' | 'basedOn'>[],
	o: CloneOptions = {},
): Promise<DriftEntry[]> {
	const pkg = resolve(pkgDir)
	const dir = await coreSourceDir(pkg, o)
	const out: DriftEntry[] = []
	for (const c of components) {
		if (!c?.basedOn) continue
		const upstream = c.basedOn.component
		const entry: DriftEntry = { slug: c.slug, upstream, status: 'unknown', basedOnHash: c.basedOn.sourceHash }
		out.push(entry)
		const source = await readCoreSource(dir, upstream).catch(() => undefined)
		if (!source) continue
		entry.coreHash = source.sourceHash
		entry.coreVersion = source.catalogVersion
		if (!c.basedOn.sourceHash) {
			entry.status = 'unpinned'
			continue
		}
		if (c.basedOn.sourceHash === source.sourceHash) {
			entry.status = 'current'
			continue
		}
		entry.status = 'behind'
		const { root, base } = await cloneRoot(pkg, c.entry, source.entry)
		if (root) entry.root = root
		const local = root ? await readTree(resolve(pkg, root)) : undefined
		if (base && base.sourceHash === c.basedOn.sourceHash && base.files && typeof base.files === 'object') {
			if (base.retrofitted?.from === 'copy') entry.retrofittedAt = base.retrofitted.at
			// Three-way: the copy's record against core now says what core changed;
			// the record against the files here says what the author changed.
			const coreNow = Object.fromEntries(Object.entries(source.files).map(([p, t]) => [p, sha256(t)]))
			entry.separated = !entry.retrofittedAt
			entry.files = fileDiff(base.files, coreNow).map((f) => ({
				...f,
				...(local && (Object.hasOwn(local, f.path) ? sha256(local[f.path]!) !== base.files[f.path] : Object.hasOwn(base.files, f.path))
					? { editedHere: true }
					: {}),
			}))
		} else if (local) {
			entry.separated = false
			entry.files = fileDiff(local, source.files)
		}
	}
	return out
}

/** @experimental The report as text, one block per component. */
export function renderDrift(entries: readonly DriftEntry[]): string {
	if (!entries.length) return 'no component in this package records basedOn — nothing was cloned\n'
	const lines: string[] = []
	for (const e of entries) {
		const head = `${e.slug} (from core's '${e.upstream}')`
		if (e.status === 'current') lines.push(`✓ ${head}: current — core's source is the one you copied`)
		else if (e.status === 'unpinned')
			lines.push(`? ${head}: basedOn records no sourceHash — add core's (${e.coreHash}) to compare`)
		else if (e.status === 'unknown') lines.push(`? ${head}: core has no component '${e.upstream}' any more`)
		else {
			lines.push(`⚑ ${head}: core moved on — you copied ${e.basedOnHash?.slice(0, 12)}, core is ${e.coreHash?.slice(0, 12)} (${e.coreVersion})`)
			if (e.files === undefined) lines.push(`    (the copy's files were not found, so which files moved is not known)`)
			else if (e.retrofittedAt) {
				lines.push(
					`    ${CLONE_BASE_FILE} was retrofitted from your copy on ${e.retrofittedAt.slice(0, 10)} — these differ from core now ` +
						`(your edits before then and core's together; per-file history starts then):`,
				)
				const said: Record<FileChange, string> = { changed: 'differs', added: 'core only', removed: 'yours only' }
				for (const f of e.files)
					lines.push(`    ${said[f.change].padEnd(10)} ${f.path}${f.editedHere ? '   ← edited since' : ''}`)
			} else if (e.separated) {
				if (!e.files.length) lines.push(`    no file's text changed (the file set's hash did)`)
				for (const f of e.files)
					lines.push(`    ${f.change.padEnd(7)} ${f.path}${f.editedHere ? '   ← you edited it too: merge by hand' : ''}`)
			} else {
				lines.push(`    no ${CLONE_BASE_FILE} beside the copy — these differ from core now (your edits and core's together):`)
				const said: Record<FileChange, string> = { changed: 'differs', added: 'core only', removed: 'yours only' }
				for (const f of e.files) lines.push(`    ${said[f.change].padEnd(10)} ${f.path}`)
			}
		}
	}
	return lines.join('\n') + '\n'
}

// ── retrofit ────────────────────────────────────────────────────────────────

/** @experimental */
export interface RetrofitResult {
	/** The package's component slug. */
	slug: string
	/** Where the record went, relative to the package. */
	written: string
	/** `source`: from core's source at the copy's `basedOn.sourceHash`; `copy`: from the copy as it stands. */
	from: 'source' | 'copy'
	/** What the author should know about the record — said, never only implied. */
	note: string
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
export async function retrofitCloneBase(
	pkgDir: string,
	c: Pick<ComponentDecl, 'slug' | 'entry' | 'basedOn'> | undefined,
	o: CloneOptions & { force?: boolean; now?: Date } = {},
): Promise<RetrofitResult> {
	if (!c) throw new CloneError(`the package declares no such component — drift --retrofit takes one of its component slugs`)
	if (!c.basedOn) throw new CloneError(`component '${c.slug}' records no basedOn — it is not a copy of core's, so there is nothing to retrofit`)
	const hash = c.basedOn.sourceHash
	if (!hash)
		throw new CloneError(
			`component '${c.slug}': basedOn records no sourceHash — pin the core source it was copied from first, or a record could not say what it is a record of`,
		)
	const pkg = resolve(pkgDir)
	const dir = await coreSourceDir(pkg, o)
	const source = await readCoreSource(dir, c.basedOn.component).catch(() => undefined)
	if (!source) throw new CloneError(`component '${c.slug}': core has no component '${c.basedOn.component}' to hold the copy against`)
	const { root, base } = await cloneRoot(pkg, c.entry, source.entry)
	if (!root)
		throw new CloneError(
			`component '${c.slug}': its entry '${c.entry}' does not end in core's entry path '${source.entry}', so the copy's root is not known — ` +
				`keep the copied paths (as clone does) to retrofit it`,
		)
	const rel = `${root}/${CLONE_BASE_FILE}`
	const at = resolve(pkg, rel)
	await assertInside(await realpath(pkg), at, rel)
	if ((base || (await exists(at))) && !o.force)
		throw new CloneError(`${rel} already exists — nothing was written; --force replaces it`)
	const when = (o.now ?? new Date()).toISOString()
	let record: CloneBase
	let note: string
	if (source.sourceHash === hash) {
		record = {
			component: source.slug,
			catalogVersion: source.catalogVersion,
			sourceHash: source.sourceHash,
			entry: source.entry,
			files: Object.fromEntries(Object.keys(source.files).sort().map((p) => [p, sha256(source.files[p]!)])),
			retrofitted: { from: 'source', at: when },
		}
		note = `written from core's source at ${hash.slice(0, 12)} (${source.catalogVersion}) — drift tells core's changes from yours`
	} else {
		const local = await readTree(resolve(pkg, root))
		delete local[CLONE_BASE_FILE]
		if (!Object.keys(local).length) throw new CloneError(`component '${c.slug}': no files under ${root}/ to retrofit`)
		record = {
			component: c.basedOn.component,
			catalogVersion: c.basedOn.version ?? 'unknown',
			sourceHash: hash,
			entry: source.entry,
			files: Object.fromEntries(Object.keys(local).sort().map((p) => [p, sha256(local[p]!)])),
			retrofitted: { from: 'copy', at: when },
		}
		note =
			`core's source at ${hash.slice(0, 12)} is not in the catalog read (it carries ${source.sourceHash.slice(0, 12)}, ${source.catalogVersion}), ` +
			`so the record is your copy as it stands: per-file history starts now. Edits made before today and core's changes are still ` +
			`listed together; edits from now on are told apart. Point --catalog at the core-catalog you copied from to record it exactly`
	}
	await mkdir(dirname(at), { recursive: true })
	await writeFile(at, JSON.stringify(record, null, '\t') + '\n')
	return { slug: c.slug, written: rel, from: record.retrofitted!.from, note }
}
