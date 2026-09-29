/**
 * The guides' plain TypeScript fences, type-checked against the SDK source.
 *
 * `guides.test.ts` runs every ` ```playground ` fence. A plain ` ```ts ` fence
 * is never run, and until this file it was never compiled either — which is how
 * a guide came to teach APIs that do not exist. This file holds the smaller
 * promise a plain fence can make: *every name it uses exists, with the shape it
 * is used at*.
 *
 * ── How ──
 *
 * Every ` ```ts ` / ` ```typescript ` fence in `guides/*.md` (a ` ```playground `
 * fence is guides.test.ts's) becomes one in-memory module, and all of them are
 * checked in ONE TypeScript 5 program — the classic compiler API, borrowed from
 * api-docs/node_modules exactly as surface.test.ts does, since the repo's
 * TypeScript 7 ships none. Options are sdk-tests/tsconfig.json's; every
 * `@serene-pub/*` specifier (each `exports` subpath of each package) is
 * `paths`-mapped to its `src` file, so no build is needed. Each error is
 * reported as `guides/<file>.md:<line>` of the fence line that caused it.
 *
 * One check the compiler cannot make: a pinned node's config (`C.x.v1({ … })`)
 * is `Record<string, unknown>` to it, so a port that does not exist compiles.
 * The in-ports are in the descriptor's TYPE, though, so every literal key of a
 * config object is also held to its node's in-ports and slot names.
 *
 * ── The convention (the only two things a guide author needs) ──
 *
 *  1. ` ```ts nocheck <reason> ` — a deliberate fragment or pseudo-code: a
 *     builder chain that starts mid-expression, a manifest excerpt, a handler
 *     body. Skipped. The reason is REQUIRED (the test fails without one), so a
 *     skip always says why a reader cannot paste it. The docs compiler reads
 *     only the first info word as the language, so it still highlights as ts.
 *
 *  2. A hidden prelude: an HTML comment on the line(s) directly above the
 *     fence, whose body starts with `prelude:` —
 *
 *         <!-- prelude:
 *         import { S } from '@serene-pub/sdk'
 *         declare const myGenre: import('@serene-pub/sdk').GenreDecl
 *         -->
 *         ```ts
 *
 *     Its text is compiled before the fence (invisible on the rendered page),
 *     for the imports and `declare`s a snippet leans on from earlier in the
 *     guide. Prefer declaring a thing's real SDK type over `any`; `any` checks
 *     nothing.
 *
 * Each fence is its own module (an `export {}` is appended), so top-level
 * `await` works and fences never see each other's names. A module a plugin
 * project installs but this repo does not (`vitest`) is shimmed as `any`: the
 * check is of the SDK surface, not of the test runner's.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const GUIDES_DIR = join(root, 'guides')

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ts: any = createRequire(join(root, 'api-docs', 'package.json'))('typescript')

/** The published packages, by directory — the same set surface.test.ts reads. */
const PACKAGES = ['sdk', 'contracts', 'controls', 'core-catalog', 'cli', 'conformance', 'component-client', 'docs']

/** Plugin-project dependencies this repo does not install, checked as `any`. */
const SHIMS = `declare module 'vitest' {
	export const test: any, it: any, describe: any, expect: any, vi: any, beforeEach: any, afterEach: any
}
`

function typesTarget(value: unknown): string | undefined {
	if (typeof value === 'string') return value
	if (value && typeof value === 'object') {
		const v = value as Record<string, unknown>
		return typesTarget(v.types ?? v.import ?? v.default)
	}
	return undefined
}

/** Every `@serene-pub/<pkg>[/<subpath>]` → its source file. */
function packagePaths(): Record<string, string[]> {
	const paths: Record<string, string[]> = {}
	for (const dir of PACKAGES) {
		const pkgDir = join(root, dir)
		if (!existsSync(join(pkgDir, 'package.json'))) continue
		const pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'))
		for (const [subpath, value] of Object.entries((pkg.exports ?? {}) as Record<string, unknown>)) {
			if (subpath.includes('*')) continue
			const target = typesTarget(value)
			if (!target || !/\.(d\.)?[mc]?tsx?$/.test(target)) continue
			const abs = resolve(pkgDir, target)
			const base = abs.replace('/dist/', '/src/').replace(/\.d\.ts$/, '')
			const file = ['.ts', '.tsx', '.mts'].map((e) => base + e).find(existsSync) ?? (existsSync(abs) ? abs : undefined)
			if (file) paths[subpath === '.' ? pkg.name : `${pkg.name}/${subpath.slice(2)}`] = [file]
		}
	}
	return paths
}

interface Snippet {
	/** `guides/<name>.md` */
	guide: string
	/** 1-based markdown line of the fence's first code line. */
	firstLine: number
	prelude: string
	code: string
	/** The virtual file the snippet is compiled as. */
	fileName: string
}

interface Skipped {
	where: string
	reason: string
}

/** The slot names a config may key by (`slot.connection()` and friends), beside its in-ports. */
const SLOT_KEYS = new Set(['connection', 'sampling', 'prompts', 'template', 'params', 'variables'])

/** The keys of a pinned node's config literal that its descriptor's type does not declare. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function unknownConfigKeys(checker: any, pinned: any, config: any): { key: string; at: number; id: string }[] {
	const descriptor = checker.getTypeAtLocation(pinned).getProperty('descriptor')
	if (!descriptor) return []
	const dType = checker.getTypeOfSymbolAtLocation(descriptor, pinned)
	const idSym = dType.getProperty('id')
	const idType = idSym && checker.getTypeOfSymbolAtLocation(idSym, pinned)
	const id = idType?.isStringLiteral?.() ? idType.value : checker.typeToString(dType)
	const portsSym = dType.getProperty('ports')
	const inSym = portsSym && checker.getTypeOfSymbolAtLocation(portsSym, pinned).getProperty('in')
	const inType = inSym && checker.getNonNullableType(checker.getTypeOfSymbolAtLocation(inSym, pinned))
	// No in-ports declared, or only the generic `PortDecl` index: nothing to hold the keys to.
	if (!inType || checker.getIndexInfosOfType(inType).length) return []
	const allowed = new Set<string>([...SLOT_KEYS, ...inType.getProperties().map((p: { name: string }) => p.name)])
	const slotsSym = dType.getProperty('slots')
	if (slotsSym) {
		const slots = checker.getNonNullableType(checker.getTypeOfSymbolAtLocation(slotsSym, pinned))
		for (const p of slots.getProperties()) allowed.add(p.name)
	}
	const out: { key: string; at: number; id: string }[] = []
	for (const prop of config.properties) {
		const name = prop.name && (ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name)) ? prop.name.text : undefined
		if (name && !allowed.has(name)) out.push({ key: name, at: prop.getStart(), id })
	}
	return out
}

const FENCE_OPEN = /^(\s*)(`{3,}|~{3,})(.*)$/

function extract(): { snippets: Snippet[]; skipped: Skipped[] } {
	const snippets: Snippet[] = []
	const skipped: Skipped[] = []
	const names = readdirSync(GUIDES_DIR).filter((n) => n.endsWith('.md')).sort()
	for (const name of names) {
		const guide = `guides/${name}`
		const lines = readFileSync(join(GUIDES_DIR, name), 'utf8').split('\n')
		for (let i = 0; i < lines.length; i++) {
			const open = FENCE_OPEN.exec(lines[i]!)
			if (!open) continue
			const marker = open[2]!
			const words = open[3]!.trim().split(/\s+/).filter(Boolean)
			let end = i + 1
			while (end < lines.length && !new RegExp(`^\\s*${marker[0]}{${marker.length},}\\s*$`).test(lines[end]!)) end++
			const body = lines.slice(i + 1, end)
			const fenceLine = i + 1
			i = end
			const lang = (words[0] ?? '').toLowerCase()
			if (lang !== 'ts' && lang !== 'typescript') continue
			if (words[1] === 'nocheck') {
				skipped.push({ where: `${guide}:${fenceLine}`, reason: words.slice(2).join(' ') })
				continue
			}
			snippets.push({
				guide,
				firstLine: fenceLine + 1,
				prelude: preludeAbove(lines, fenceLine - 1),
				code: body.join('\n'),
				fileName: join(here, '__guide_snippets__', `${name}.${fenceLine}.ts`),
			})
		}
	}
	return { snippets, skipped }
}

/** The `<!-- prelude: … -->` comment ending on the line directly above index `fence` (0-based). */
function preludeAbove(lines: string[], fence: number): string {
	const last = fence - 1
	if (last < 0 || !lines[last]!.trimEnd().endsWith('-->')) return ''
	let start = last
	while (start >= 0 && !lines[start]!.includes('<!--')) start--
	if (start < 0) return ''
	const text = lines.slice(start, last + 1).join('\n')
	const m = /^\s*<!--\s*prelude:([\s\S]*?)-->\s*$/.exec(text)
	return m ? m[1]!.replace(/^\n/, '') : ''
}

const { snippets, skipped } = extract()

test('every nocheck fence says why', () => {
	const bare = skipped.filter((s) => !s.reason).map((s) => s.where)
	assert.deepEqual(bare, [], 'a ```ts nocheck fence needs a reason after `nocheck`')
})

test('every plain ts fence in guides/ type-checks against the SDK', () => {
	assert.ok(snippets.length > 0, 'no ```ts fences found under guides/ — did the extraction break?')

	const config = ts.getParsedCommandLineOfConfigFile(join(here, 'tsconfig.json'), {}, {
		...ts.sys,
		onUnRecoverableConfigFileDiagnostic: (d: unknown) => {
			throw new Error(ts.flattenDiagnosticMessageText((d as { messageText: unknown }).messageText, '\n'))
		},
	})
	const options = {
		...config.options,
		paths: { ...config.options.paths, ...packagePaths() },
		baseUrl: undefined,
		noEmit: true,
		noUnusedLocals: false,
		noUnusedParameters: false,
	}

	const shimName = join(here, '__guide_snippets__', 'shims.d.ts')
	const virtual = new Map<string, { text: string; snippet?: Snippet; preludeLines: number }>()
	virtual.set(shimName, { text: SHIMS, preludeLines: 0 })
	for (const s of snippets) {
		const head = s.prelude ? s.prelude.replace(/\n?$/, '\n') : ''
		virtual.set(s.fileName, {
			text: `${head}${s.code}\nexport {}\n`,
			snippet: s,
			preludeLines: head ? head.split('\n').length - 1 : 0,
		})
	}

	const host = ts.createCompilerHost(options, true)
	const baseGetSourceFile = host.getSourceFile.bind(host)
	const baseFileExists = host.fileExists.bind(host)
	const baseReadFile = host.readFile.bind(host)
	host.getSourceFile = (fileName: string, lang: unknown, ...rest: unknown[]) => {
		const v = virtual.get(fileName)
		return v ? ts.createSourceFile(fileName, v.text, lang, true) : baseGetSourceFile(fileName, lang, ...rest)
	}
	host.fileExists = (fileName: string) => virtual.has(fileName) || baseFileExists(fileName)
	host.readFile = (fileName: string) => virtual.get(fileName)?.text ?? baseReadFile(fileName)

	const program = ts.createProgram({ rootNames: [...virtual.keys()], options, host })
	const errors: string[] = []
	for (const [fileName, v] of virtual) {
		const sf = program.getSourceFile(fileName)
		const diags = [...program.getSyntacticDiagnostics(sf), ...program.getSemanticDiagnostics(sf)]
		for (const d of diags) {
			const message = ts.flattenDiagnosticMessageText(d.messageText, '\n  ')
			if (!v.snippet) {
				errors.push(`(shim) ${message}`)
				continue
			}
			const { line } = sf.getLineAndCharacterOfPosition(d.start ?? 0)
			const where =
				line < v.preludeLines
					? `${v.snippet.guide}:${v.snippet.firstLine - 1} (prelude line ${line + 1})`
					: `${v.snippet.guide}:${v.snippet.firstLine + line - v.preludeLines}`
			errors.push(`${where} TS${d.code}: ${message}`)
		}
	}
	// A pinned node's config is `Record<string, unknown>` to the compiler, so a
	// port that does not exist (`options` on make-choices) type-checks. Read the
	// in-ports off the descriptor's type instead and name any literal key that
	// is neither an in-port nor a slot.
	const checker = program.getTypeChecker()
	for (const [fileName, v] of virtual) {
		const snippet = v.snippet
		if (!snippet) continue
		const sf = program.getSourceFile(fileName)
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const visit = (node: any): void => {
			if (
				ts.isCallExpression(node) &&
				ts.isPropertyAccessExpression(node.expression) &&
				/^v\d+$/.test(node.expression.name.text) &&
				node.arguments[0] &&
				ts.isObjectLiteralExpression(node.arguments[0])
			) {
				const unknown = unknownConfigKeys(checker, node.expression.expression, node.arguments[0])
				for (const { key, at, id } of unknown) {
					const { line } = sf.getLineAndCharacterOfPosition(at)
					errors.push(
						`${snippet.guide}:${snippet.firstLine + line - v.preludeLines} ` +
							`'${key}' is not an in-port or slot of ${id}`,
					)
				}
			}
			ts.forEachChild(node, visit)
		}
		visit(sf)
	}
	assert.deepEqual(errors, [], `guide fences that do not type-check:\n${errors.join('\n')}`)
})
