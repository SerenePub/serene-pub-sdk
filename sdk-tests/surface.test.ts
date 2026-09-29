/**
 * F1 · the 1.0 surface audit (R37): every export a published package's public
 * entry points reach carries EXACTLY ONE TSDoc stability tag — `@public`,
 * `@experimental` or `@internal` — and a golden lists the `@public` names per
 * package, so growing or shrinking the frozen surface is a visible diff.
 *
 * ── The rules for tagging (PLAN-HISTORY-turn-order F1; PLAN-sdk-1.0 R37) ──
 *
 *  1. Anything PLAN-sdk-1.0 §4 marks 🚧, or any vocabulary still ⏳ (or 🚧)
 *     in NOMENCLATURE.md, is `@experimental`.
 *  2. A symbol only core's app or core-catalog uses is `@internal`.
 *     (`@internal` is left out of the API reference: typedoc.json sets
 *     `excludeInternal`.)
 *  3. When unsure, tag `@experimental` — never `@public`. `@public` is the
 *     1.0 freeze: it is a promise, and the golden below is where the owner
 *     reads it.
 *
 * Where the tag goes: on the declaration's own doc comment (for a `const`,
 * the comment above the `export const` statement), e.g.
 * `/** @experimental What it does… *\/`. A re-export inherits the tag of the
 * declaration it resolves to — tag the original, not the barrel. The
 * exceptions, where no TS declaration exists to carry it: a Svelte component
 * (tag its `import X from './X.svelte'` line, or a single-name
 * `export { default as X } from './X.svelte'`) and `export * as ns from`
 * (tag that statement). Overloads and a same-named value+type pair may repeat
 * the tag; two DIFFERENT stability tags on one export is a failure.
 *
 * ── How exports are enumerated ──
 *
 * Each package's `package.json` `exports` map (every subpath) is read; each
 * `types` target is mapped from `dist/*.d.ts` back to its `src/*.ts` (the tags
 * live in source, and source is what other agents edit — no build needed),
 * and every `@serene-pub/*` specifier is `paths`-mapped to source the same
 * way. One TypeScript 5 program (the classic compiler API — the repo's
 * TypeScript 7 ships none, so this borrows the copy nested under api-docs for
 * TypeDoc) then asks the checker for `getExportsOfModule` of each entry, so
 * `export *`, renames and cross-package re-exports all resolve. Subpaths that
 * are not TypeScript (`./package.json`, core-catalog's `./components/*`
 * compiled bundles) are skipped.
 *
 * ── The files ──
 *
 *  goldens/surface-public.json    package → subpath → sorted `@public` names.
 *  goldens/surface-public-leaks.json  package → subpath → `@public` name →
 *     the `@experimental` / `@internal` symbols its declared signature names.
 *     Asserted EXACTLY: a new leak fails (promote the referenced type or
 *     demote the public symbol — the owner's call), and a fixed one fails
 *     until the golden shrinks. It only ever shrinks.
 *
 * Every export is tagged: the untagged ratchet (surface-untagged.json) was
 * emptied and retired 2026-09-26 — an untagged export now simply fails.
 *
 * ── What a leak is ──
 *
 * Freezing a `@public` symbol freezes nothing if its signature names an
 * unfrozen type. So for each `@public` export the check walks the declaration
 * it resolves to — a function's parameters, return type and type parameters;
 * an interface's, type alias's or class's members and heritage (never bodies,
 * initializers or `private` members); a variable's annotation — and asks the
 * checker what every type reference / `typeof` there resolves to. Where the
 * type is not written (an unannotated `const`, an inferred return), the
 * inferred type is walked instead, stopping at the first NAMED type. Any
 * referenced symbol declared in a published package's source and tagged
 * `@experimental` or `@internal` is a leak. Not transitive: a referenced
 * `@public` type is checked as its own export.
 *
 * Regenerate after tagging: `SURFACE_UPDATE=1 npx tsx --test surface.test.ts`
 * rewrites the public golden and SHRINKS the leak golden (drops fixed
 * entries; never adds). `SURFACE_LEAKS_INIT=1` rebuilds the leak golden from
 * scratch — only for the initial snapshot, never to hide a new leak.
 */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const goldensDir = join(here, 'goldens')
const publicGoldenPath = join(goldensDir, 'surface-public.json')
const leaksPath = join(goldensDir, 'surface-public-leaks.json')

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ts: any = createRequire(join(root, 'api-docs', 'package.json'))('typescript')

/** The published packages, by directory. component-client is public: it is not private and exports what a remote component imports. */
const PACKAGES = ['sdk', 'contracts', 'controls', 'core-catalog', 'cli', 'conformance', 'component-client'] as const

const STABILITY = ['public', 'experimental', 'internal'] as const
type Stability = (typeof STABILITY)[number]

type Surface = Record<string, Record<string, string[]>>

interface Entry {
	pkg: string
	subpath: string
	file: string
}

/** A `types` target in dist, mapped back to the source file that declares it. */
function sourceOf(pkgDir: string, target: string): string | undefined {
	const abs = resolve(pkgDir, target)
	if (/\/dist\/.*\.d\.ts$/.test(abs)) {
		const base = abs.replace('/dist/', '/src/').replace(/\.d\.ts$/, '')
		for (const ext of ['.ts', '.tsx', '.mts']) if (existsSync(base + ext)) return base + ext
		return existsSync(abs) ? abs : undefined
	}
	if (/\.(d\.)?[mc]?tsx?$/.test(abs)) return existsSync(abs) ? abs : undefined
	return undefined
}

function typesTarget(value: unknown): string | undefined {
	if (typeof value === 'string') return value
	if (value && typeof value === 'object') {
		const v = value as Record<string, unknown>
		return typesTarget(v.types ?? v.import ?? v.default)
	}
	return undefined
}

function entries(): { list: Entry[]; paths: Record<string, string[]> } {
	const list: Entry[] = []
	const paths: Record<string, string[]> = {}
	for (const dir of PACKAGES) {
		const pkgDir = join(root, dir)
		const pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'))
		for (const [subpath, value] of Object.entries(pkg.exports as Record<string, unknown>)) {
			if (subpath.includes('*')) continue // compiled bundles, not TS modules
			const target = typesTarget(value)
			if (!target) continue
			const file = sourceOf(pkgDir, target)
			if (!file) continue
			list.push({ pkg: pkg.name, subpath, file })
			paths[subpath === '.' ? pkg.name : `${pkg.name}/${subpath.slice(2)}`] = [file]
		}
	}
	return { list, paths }
}

/** A declaration inside `declare module '*.svelte'` (a shim) says nothing about the export. */
function inWildcardShim(node: any): boolean {
	for (let n = node; n; n = n.parent) {
		if (ts.isModuleDeclaration(n) && ts.isStringLiteral(n.name) && n.name.text.includes('*')) return true
	}
	return false
}

/** The node a doc comment can sit on for this declaration. */
function commentHost(decl: any): any[] {
	if (ts.isImportClause(decl)) return [decl.parent]
	if (ts.isNamespaceImport(decl)) return [decl.parent.parent]
	if (ts.isNamespaceExport(decl)) return [decl.parent]
	// A single-name `import { X }` / `export { X }` statement may carry it; a list may not.
	if (ts.isImportSpecifier(decl) && decl.parent.elements.length === 1) return [decl, decl.parent.parent.parent]
	if (ts.isExportSpecifier(decl) && decl.parent.elements.length === 1) return [decl, decl.parent.parent]
	return [decl]
}

function stabilityTags(checker: any, exported: any): Set<Stability> {
	const found = new Set<Stability>()
	const visit = (decls: any[] | undefined) => {
		for (const decl of decls ?? []) {
			if (inWildcardShim(decl)) continue
			for (const host of commentHost(decl)) {
				for (const tag of ts.getJSDocTags(host) as any[]) {
					const name = tag.tagName.text as Stability
					if ((STABILITY as readonly string[]).includes(name)) found.add(name)
				}
			}
		}
	}
	let sym = exported
	const seen = new Set<any>()
	while (sym && !seen.has(sym)) {
		seen.add(sym)
		visit(sym.declarations)
		if (!(sym.flags & ts.SymbolFlags.Alias)) break
		sym = checker.getImmediateAliasedSymbol(sym)
	}
	return found
}

interface Row {
	pkg: string
	subpath: string
	name: string
	tags: Stability[]
	/** `Name @tag` for each unfrozen symbol a `@public` export's signature names. */
	leaks: string[]
}

/** Published packages' source directories — only symbols declared here carry our tags. */
const SOURCE_DIRS = PACKAGES.map((d) => join(root, d) + '/')
function isOurs(file: string): boolean {
	return !file.includes('/node_modules/') && SOURCE_DIRS.some((d) => file.startsWith(d))
}

/** The unfrozen symbols a `@public` export's declared signature references. */
function leaksOf(checker: any, exported: any): string[] {
	let target = exported
	if (target.flags & ts.SymbolFlags.Alias) target = checker.getAliasedSymbol(target)
	const found = new Set<string>()
	const seenSyms = new Set<any>([target])

	const judge = (sym: any) => {
		if (!sym || seenSyms.has(sym)) return
		seenSyms.add(sym)
		const resolved = sym.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(sym) : sym
		if (resolved === target) return
		if (resolved.flags & ts.SymbolFlags.TypeParameter) return
		const decls: any[] = resolved.declarations ?? []
		if (!decls.some((d) => isOurs(d.getSourceFile().fileName))) return
		const tags = stabilityTags(checker, sym)
		for (const t of tags) if (t !== 'public') found.add(`${resolved.name} @${t}`)
	}

	// The inferred type, where nothing is written: stop at the first named type.
	const seenTypes = new Set<any>()
	const NAMED = ts.SymbolFlags.Interface | ts.SymbolFlags.Class | ts.SymbolFlags.Enum | ts.SymbolFlags.TypeAlias
	const visitType = (t: any, depth: number) => {
		if (!t || depth > 8 || seenTypes.has(t)) return
		seenTypes.add(t)
		if (t.aliasSymbol) {
			judge(t.aliasSymbol)
			for (const a of t.aliasTypeArguments ?? []) visitType(a, depth + 1)
			return
		}
		if (t.flags & ts.TypeFlags.UnionOrIntersection) {
			for (const m of t.types) visitType(m, depth + 1)
			return
		}
		if (t.flags & ts.TypeFlags.TypeParameter) return
		if (!(t.flags & ts.TypeFlags.Object)) return
		const sym = t.symbol
		if (sym && sym.flags & NAMED) {
			judge(sym)
			if (t.objectFlags & ts.ObjectFlags.Reference) for (const a of checker.getTypeArguments(t)) visitType(a, depth + 1)
			return
		}
		if (t.objectFlags & ts.ObjectFlags.Reference && t.target !== t) {
			for (const a of checker.getTypeArguments(t)) visitType(a, depth + 1)
		}
		for (const p of checker.getPropertiesOfType(t) as any[]) {
			const decl = p.valueDeclaration ?? p.declarations?.[0]
			if (decl && ts.getCombinedModifierFlags(decl) & (ts.ModifierFlags.Private | ts.ModifierFlags.Protected)) continue
			if (typeof p.escapedName === 'string' && p.escapedName.startsWith('__#')) continue
			visitType(checker.getTypeOfSymbol(p), depth + 1)
		}
		for (const kind of [ts.SignatureKind.Call, ts.SignatureKind.Construct]) {
			for (const sig of checker.getSignaturesOfType(t, kind) as any[]) visitSignature(sig, depth + 1)
		}
		for (const info of (checker.getIndexInfosOfType?.(t) ?? []) as any[]) visitType(info.type, depth + 1)
	}
	const visitSignature = (sig: any, depth: number) => {
		for (const p of sig.parameters as any[]) visitType(checker.getTypeOfSymbol(p), depth)
		visitType(checker.getReturnTypeOfSignature(sig), depth)
	}

	// The written signature.
	const visitNode = (node: any) => {
		if (!node) return
		if (ts.isBlock(node) || ts.isJSDoc?.(node)) return
		if (ts.isTypeReferenceNode(node)) judge(checker.getSymbolAtLocation(node.typeName))
		else if (ts.isExpressionWithTypeArguments(node)) judge(checker.getSymbolAtLocation(node.expression))
		else if (ts.isTypeQueryNode(node)) judge(checker.getSymbolAtLocation(node.exprName))
		else if (ts.isImportTypeNode(node) && node.qualifier) judge(checker.getSymbolAtLocation(node.qualifier))
		if (
			(ts.isPropertyDeclaration(node) || ts.isMethodDeclaration(node) || ts.isGetAccessor(node) || ts.isSetAccessor(node) || ts.isConstructorDeclaration(node)) &&
			(ts.getCombinedModifierFlags(node) & (ts.ModifierFlags.Private | ts.ModifierFlags.Protected) || (node.name && ts.isPrivateIdentifier(node.name)))
		)
			return
		if (ts.isFunctionLike(node) && !node.type && !ts.isConstructorDeclaration(node) && !ts.isSetAccessor(node)) {
			const sig = checker.getSignatureFromDeclaration(node)
			if (sig) visitType(checker.getReturnTypeOfSignature(sig), 0)
		}
		if ((ts.isPropertyDeclaration(node) || ts.isVariableDeclaration(node)) && !node.type) {
			visitType(checker.getTypeAtLocation(node.name), 0)
		}
		ts.forEachChild(node, (child: any) => {
			if (child === node.initializer && !ts.isParameter(node)) return
			if (ts.isParameter(node) && child === node.initializer) return
			if (child === node.body) return
			visitNode(child)
		})
	}

	for (const decl of target.declarations ?? []) {
		if (inWildcardShim(decl)) continue
		if (!isOurs(decl.getSourceFile().fileName)) continue
		if (ts.isImportClause(decl) || ts.isNamespaceImport(decl) || ts.isNamespaceExport(decl) || ts.isSourceFile(decl)) continue
		visitNode(decl)
	}
	return [...found].sort()
}

function scan(): Row[] {
	const { list, paths } = entries()
	const program = ts.createProgram({
		rootNames: list.map((e) => e.file),
		options: {
			target: ts.ScriptTarget.ES2022,
			module: ts.ModuleKind.ESNext,
			moduleResolution: ts.ModuleResolutionKind.Bundler,
			allowJs: false,
			skipLibCheck: true,
			noEmit: true,
			types: ['node'],
			baseUrl: root,
			paths,
		},
	})
	const checker = program.getTypeChecker()
	const rows: Row[] = []
	for (const e of list) {
		const sf = program.getSourceFile(e.file)
		assert.ok(sf, `${e.pkg} ${e.subpath}: ${e.file} is not in the program`)
		const mod = checker.getSymbolAtLocation(sf)
		if (!mod) continue // a script with no exports (e.g. a bin)
		for (const sym of checker.getExportsOfModule(mod) as any[]) {
			const name = sym.escapedName === 'default' ? 'default' : (sym.name as string)
			const tags = [...stabilityTags(checker, sym)].sort() as Stability[]
			const leaks = tags.length === 1 && tags[0] === 'public' ? leaksOf(checker, sym) : []
			rows.push({ pkg: e.pkg, subpath: e.subpath, name, tags, leaks })
		}
	}
	return rows
}

function group(rows: Row[], keep: (r: Row) => boolean): Surface {
	const out: Surface = {}
	for (const r of rows) {
		if (!keep(r)) continue
		;((out[r.pkg] ??= {})[r.subpath] ??= []).push(r.name)
	}
	for (const pkg of Object.keys(out)) for (const sp of Object.keys(out[pkg])) out[pkg][sp].sort()
	return sortKeys(out)
}

function sortKeys(s: Surface): Surface {
	const out: Surface = {}
	for (const pkg of Object.keys(s).sort()) {
		out[pkg] = {}
		for (const sp of Object.keys(s[pkg]).sort()) out[pkg][sp] = s[pkg][sp]
	}
	return out
}

function flat(s: Surface): Set<string> {
	const out = new Set<string>()
	for (const [pkg, subs] of Object.entries(s)) for (const [sp, names] of Object.entries(subs)) for (const n of names) out.add(`${pkg} ${sp} ${n}`)
	return out
}

function unflat(keys: Iterable<string>): Surface {
	const out: Surface = {}
	for (const k of keys) {
		const [pkg, sp, name] = k.split(' ')
		;((out[pkg] ??= {})[sp] ??= []).push(name)
	}
	for (const pkg of Object.keys(out)) for (const sp of Object.keys(out[pkg])) out[pkg][sp].sort()
	return sortKeys(out)
}

function readJson(path: string): Surface | undefined {
	return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as Surface) : undefined
}

type Leaks = Record<string, Record<string, Record<string, string[]>>>

/** `pkg subpath name` → `Ref @tag` pairs, as flat keys (a key per leak). */
function flatLeaks(l: Leaks): Set<string> {
	const out = new Set<string>()
	for (const [pkg, subs] of Object.entries(l))
		for (const [sp, names] of Object.entries(subs)) for (const [n, refs] of Object.entries(names)) for (const r of refs) out.add(`${pkg}\t${sp}\t${n}\t${r}`)
	return out
}

function unflatLeaks(keys: Iterable<string>): Leaks {
	const tmp: Leaks = {}
	for (const k of keys) {
		const [pkg, sp, n, r] = k.split('\t')
		;(((tmp[pkg] ??= {})[sp] ??= {})[n] ??= []).push(r)
	}
	const out: Leaks = {}
	for (const pkg of Object.keys(tmp).sort()) {
		out[pkg] = {}
		for (const sp of Object.keys(tmp[pkg]).sort()) {
			out[pkg][sp] = {}
			for (const n of Object.keys(tmp[pkg][sp]).sort()) out[pkg][sp][n] = tmp[pkg][sp][n].sort()
		}
	}
	return out
}

function writeJson(path: string, value: unknown) {
	mkdirSync(dirname(path), { recursive: true })
	writeFileSync(path, JSON.stringify(value, null, '\t') + '\n')
}

const rows = scan()
const untaggedNow = flat(group(rows, (r) => r.tags.length === 0))
const publicNow = group(rows, (r) => r.tags.length === 1 && r.tags[0] === 'public')
const leaksNow = new Set(rows.flatMap((r) => r.leaks.map((l) => `${r.pkg}\t${r.subpath}\t${r.name}\t${l}`)))
const readLeaks = (): Leaks | undefined => (existsSync(leaksPath) ? (JSON.parse(readFileSync(leaksPath, 'utf8')) as Leaks) : undefined)

if (process.env.SURFACE_UPDATE || process.env.SURFACE_LEAKS_INIT) {
	writeJson(publicGoldenPath, publicNow)
	const old = readLeaks()
	const next = process.env.SURFACE_LEAKS_INIT || !old ? leaksNow : new Set([...flatLeaks(old)].filter((k) => leaksNow.has(k)))
	writeJson(leaksPath, unflatLeaks(next))
}

// The summary the tagging lanes read.
{
	const counts: Record<string, Record<Stability | 'untagged' | 'conflict', number>> = {}
	for (const r of rows) {
		const c = (counts[r.pkg] ??= { public: 0, experimental: 0, internal: 0, untagged: 0, conflict: 0 })
		if (r.tags.length === 0) c.untagged++
		else if (r.tags.length > 1) c.conflict++
		else c[r.tags[0]]++
	}
	const lines = Object.entries(counts).map(
		([pkg, c]) =>
			`  ${pkg.padEnd(28)} public ${String(c.public).padStart(4)}  experimental ${String(c.experimental).padStart(4)}  internal ${String(c.internal).padStart(4)}  untagged ${String(c.untagged).padStart(4)}${c.conflict ? `  CONFLICT ${c.conflict}` : ''}`,
	)
	console.log(`surface audit (F1) — ${rows.length} exports\n${lines.join('\n')}`)
}

describe('F1 · the 1.0 surface audit (R37)', () => {
	test('the published entry points resolve to a non-empty surface', () => {
		for (const dir of PACKAGES) {
			const name = JSON.parse(readFileSync(join(root, dir, 'package.json'), 'utf8')).name
			assert.ok(
				rows.some((r) => r.pkg === name),
				`${name} exports nothing — its package.json exports no longer map to source`,
			)
		}
	})

	test('no export carries two different stability tags', () => {
		const twice = rows.filter((r) => r.tags.length > 1).map((r) => `${r.pkg} ${r.subpath} ${r.name}: @${r.tags.join(' @')}`)
		assert.deepEqual(twice, [], 'exactly ONE of @public/@experimental/@internal per export')
	})

	test('every export is tagged', () => {
		assert.deepEqual(
			[...untaggedNow].sort(),
			[],
			'untagged exports — tag them (@experimental when unsure, never @public; see the header of surface.test.ts)',
		)
	})

	test('a @public signature names no @experimental / @internal symbol, beyond the golden', () => {
		const golden = flatLeaks(readLeaks() ?? {})
		const fresh = [...leaksNow].filter((k) => !golden.has(k)).sort()
		assert.deepEqual(
			fresh,
			[],
			'a frozen signature names an unfrozen symbol — promote the referenced symbol or demote the @public one (owner decides); never grow goldens/surface-public-leaks.json to hide it',
		)
		const fixed = [...golden].filter((k) => !leaksNow.has(k)).sort()
		assert.deepEqual(fixed, [], 'fixed or gone — shrink goldens/surface-public-leaks.json (SURFACE_UPDATE=1)')
	})

	test('the @public surface matches the golden (the owner reads this diff)', () => {
		const golden = readJson(publicGoldenPath)
		assert.ok(golden, 'goldens/surface-public.json is missing — SURFACE_UPDATE=1 writes it')
		assert.deepEqual(publicNow, sortKeys(golden), 'the frozen surface moved — SURFACE_UPDATE=1 and let the owner read the diff')
	})
})
