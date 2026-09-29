/**
 * `serene-pub clone` / `clone --list` / `drift` (C6): a core component's
 * source copied into a package with its paths kept, the declaration it
 * prints, and the report of what core changed since.
 *
 * The package is a bare directory under `tmpdir()`: nothing here resolves
 * `@serene-pub/sdk` from it (the drift package's entry is a plain object),
 * so the workspace-only rule `scaffoldPlugin.test.ts` states does not bite.
 * Core's source comes from the built `@serene-pub/core-catalog`, or — where
 * a test needs core to have moved — a copy of it under `--catalog`.
 */

import { test, describe, after } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { cp, mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, unlink, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'

import { main } from '@serene-pub/cli/bin'
import {
	cloneCoreComponent,
	driftReport,
	retrofitCloneBase,
	listCloneable,
	renderDrift,
	CloneError,
	CLONE_BASE_FILE,
	type CoreComponentSource,
} from '@serene-pub/cli'
import { componentSourceHash } from '@serene-pub/cli/component-source'
import { component, widget, componentFindings, packageWidgetFindings, type ComponentDecl, type WidgetDecl } from '@serene-pub/sdk'

const CATALOG = join(dirname(createRequire(import.meta.url).resolve('@serene-pub/core-catalog/package.json')), 'dist', 'components')
const coreSource = async (slug: string, dir = CATALOG): Promise<CoreComponentSource> =>
	JSON.parse(await readFile(join(dir, `${slug}.source.json`), 'utf8'))

const made: string[] = []
const scratch = async (name: string) => {
	const d = await mkdtemp(join(tmpdir(), `serene-pub-clone-${name}-`))
	made.push(d)
	return d
}
after(async () => {
	for (const d of made) await rm(d, { recursive: true, force: true })
})

/** Run the CLI with stdout/stderr captured. */
async function cli(argv: string[]): Promise<{ code: number; out: string; err: string }> {
	let out = ''
	let err = ''
	const o = process.stdout.write.bind(process.stdout)
	const e = process.stderr.write.bind(process.stderr)
	process.stdout.write = ((s: string) => ((out += s), true)) as never
	process.stderr.write = ((s: string) => ((err += s), true)) as never
	try {
		return { code: await main(argv), out, err }
	} finally {
		process.stdout.write = o
		process.stderr.write = e
	}
}

const tree = async (root: string): Promise<string[]> => {
	const out: string[] = []
	const walk = async (d: string, pre: string) => {
		for (const n of await readdir(d)) {
			const full = join(d, n)
			if ((await stat(full)).isDirectory()) await walk(full, `${pre}${n}/`)
			else out.push(`${pre}${n}`)
		}
	}
	await walk(root, '')
	return out.sort()
}

/** A `--catalog` directory: core's sources, copied, so a test can move core on. */
async function catalogCopy(): Promise<string> {
	const d = await scratch('catalog')
	for (const n of await readdir(CATALOG)) if (n.endsWith('.source.json')) await cp(join(CATALOG, n), join(d, n))
	return d
}
async function moveCore(dir: string, slug: string, edit: (files: Record<string, string>) => void) {
	const s = await coreSource(slug, dir)
	edit(s.files)
	s.sourceHash = componentSourceHash(s.files)
	await writeFile(join(dir, `${slug}.source.json`), JSON.stringify(s))
	return s
}

describe('serene-pub clone', () => {
	test('writes every source file under components/<as>/ with its path kept, and a based-on.json', async () => {
		const pkg = await scratch('pkg')
		const { code, out } = await cli(['clone', 'stats', '--as', 'my-stats', '--dir', pkg])
		assert.equal(code, 0)
		const src = await coreSource('stats')
		const expected = [...Object.keys(src.files).map((p) => `components/my-stats/${p}`), `components/my-stats/${CLONE_BASE_FILE}`].sort()
		assert.deepEqual(await tree(pkg), expected, 'the source files and the record — nothing else, nowhere else')
		for (const [p, text] of Object.entries(src.files))
			assert.equal(await readFile(join(pkg, 'components/my-stats', p), 'utf8'), text, p)
		const base = JSON.parse(await readFile(join(pkg, 'components/my-stats', CLONE_BASE_FILE), 'utf8'))
		assert.equal(base.sourceHash, src.sourceHash)
		assert.equal(base.component, 'stats')
		assert.deepEqual(Object.keys(base.files).sort(), Object.keys(src.files).sort())
		assert.match(out, new RegExp(`sourceHash: '${src.sourceHash}'`))
		assert.match(out, /entry: 'components\/my-stats\/sessions\/stats\/stats\.ts'/)
	})

	test('--as defaults to my-<slug>', async () => {
		const pkg = await scratch('pkg')
		const r = await cloneCoreComponent(pkg, { slug: 'lore-entries' })
		assert.equal(r.component.slug, 'my-lore-entries')
		assert.ok(r.written.every((p) => p.startsWith('components/my-lore-entries/')))
	})

	test('the printed declaration, evaluated, passes the SDK declaration findings', async () => {
		for (const slug of ['stats', 'messages', 'lore-entries', 'scene-portraits', 'world-state']) {
			const pkg = await scratch('decl')
			const r = await cloneCoreComponent(pkg, { slug, as: `copy-of-${slug}` })
			// Drop the import line; the rest is object-literal members with comments.
			const body = r.declarations.split('\n').filter((l) => !l.startsWith('import ')).join('\n')
			const decl = new Function('component', 'widget', `return ({\n${body}\n})`)(component, widget) as {
				components: ComponentDecl[]
				widgets: WidgetDecl[]
			}
			assert.deepEqual(componentFindings(decl.components), [], slug)
			assert.deepEqual(packageWidgetFindings(decl.widgets, decl.components), [], slug)
			const src = await coreSource(slug)
			assert.deepEqual(decl.components[0]!.basedOn, {
				component: slug,
				version: src.catalogVersion,
				sourceHash: src.sourceHash,
			})
			assert.equal(decl.components[0]!.entry, `components/copy-of-${slug}/${src.entry}`)
			assert.equal(decl.widgets[0]!.component, `copy-of-${slug}`)
			// The structured result is the same declaration.
			assert.deepEqual(componentFindings([r.component]), [])
			assert.deepEqual(r.component.basedOn, decl.components[0]!.basedOn)
		}
	})

	test("messages: allowed as a package copy, with a warning naming what a plugin's widget cannot do", async () => {
		const pkg = await scratch('messages')
		const { code, err, out } = await cli(['clone', 'messages', '--as', 'question-log', '--dir', pkg])
		assert.equal(code, 0)
		assert.match(err, /view-only in the app/)
		for (const kind of ['send', 'draft', 'fire-turn', 'summarize']) assert.match(err, new RegExp(`'${kind}'`))
		assert.match(err, /<sp-host-view> is core's/)
		assert.match(err, /autofocus is core's/)
		assert.doesNotMatch(err, /'open-character'/, "a kind any widget asks is not listed as lost")
		// Core's widget holds every scope; the copy declares the one its source reads.
		assert.match(out, /scopes: \['session:full'\]/)
		assert.match(out, /the copy imports: .*@serene-pub\/core-catalog/)
	})

	test('refuses to overwrite unless --force, and writes nothing when it refuses', async () => {
		const pkg = await scratch('overwrite')
		assert.equal((await cli(['clone', 'stats', '--as', 'my-stats', '--dir', pkg])).code, 0)
		const src = await coreSource('stats')
		const one = join(pkg, 'components/my-stats', src.entry)
		const other = join(pkg, 'components/my-stats', Object.keys(src.files).find((p) => p !== src.entry)!)
		await writeFile(one, '// mine\n')
		await unlink(other)
		const again = await cli(['clone', 'stats', '--as', 'my-stats', '--dir', pkg])
		assert.equal(again.code, 1)
		assert.match(again.err, /already exist.*--force/)
		assert.equal(await readFile(one, 'utf8'), '// mine\n', 'an existing file is untouched')
		await assert.rejects(stat(other), 'a missing file is not written either — all or nothing')
		assert.equal((await cli(['clone', 'stats', '--as', 'my-stats', '--dir', pkg, '--force'])).code, 0)
		assert.equal(await readFile(one, 'utf8'), src.files[src.entry])
	})

	test('refuses traversal: a bad --as, a source path out of the tree, a symlink out of the package', async () => {
		const pkg = await scratch('traversal')
		for (const as of ['../evil', 'a/b', 'Evil', '.hidden'])
			await assert.rejects(cloneCoreComponent(pkg, { slug: 'stats', as }), CloneError, as)
		await assert.rejects(cloneCoreComponent(pkg, { slug: '../stats' }), CloneError)
		await assert.rejects(cloneCoreComponent(pkg, { slug: 'stats', as: 'messages' }), /core's component's slug/)

		// A source.json naming a path outside the tree, with an honest hash.
		const cat = await catalogCopy()
		for (const bad of ['../../outside.ts', '/abs.ts', 'a/../../b.ts', 'a\\b.ts']) {
			await moveCore(cat, 'stats', (f) => {
				f[bad] = 'export {}\n'
			})
			await assert.rejects(cloneCoreComponent(pkg, { slug: 'stats', catalogDir: cat }), /not a component file path/, bad)
			await moveCore(cat, 'stats', (f) => {
				delete f[bad]
			})
		}
		// A damaged file: the hash does not match its files.
		const s = await coreSource('stats', cat)
		s.files[s.entry] += '\n// tampered\n'
		await writeFile(join(cat, 'stats.source.json'), JSON.stringify(s))
		await assert.rejects(cloneCoreComponent(pkg, { slug: 'stats', catalogDir: cat }), /damaged/)
		assert.deepEqual(await tree(pkg), [], 'nothing was written by any refusal')

		// components/ is a symlink to a directory outside the package.
		const outside = await scratch('outside')
		await symlink(outside, join(pkg, 'components'))
		await assert.rejects(cloneCoreComponent(pkg, { slug: 'stats' }), /outside the package/)
		assert.deepEqual(await tree(outside), [])
	})

	test('--list names every core component with its sourceHash', async () => {
		const rows = await listCloneable(await scratch('list'))
		const slugs = (await readdir(CATALOG)).filter((n) => n.endsWith('.source.json')).map((n) => n.slice(0, -12)).sort()
		assert.deepEqual(rows.map((r) => r.slug), slugs)
		for (const r of rows) assert.equal(r.sourceHash, (await coreSource(r.slug)).sourceHash)
		const messages = rows.find((r) => r.slug === 'messages')!
		assert.equal(messages.viewOnly, true)
		assert.ok(messages.loses.some((l) => l.includes("'send'")))
		assert.equal(rows.find((r) => r.slug === 'stats')!.viewOnly, false)

		const { code, out } = await cli(['clone', '--list'])
		assert.equal(code, 0)
		for (const r of rows) assert.match(out, new RegExp(`${r.slug}[\\s\\S]*sourceHash ${r.sourceHash}`))
	})
})

describe('serene-pub drift', () => {
	const sha = (t: string) => createHash('sha256').update(t, 'utf8').digest('hex')

	async function clonedPackage(cat: string) {
		const pkg = await scratch('drift')
		const r = await cloneCoreComponent(pkg, { slug: 'stats', as: 'my-stats', catalogDir: cat })
		// The package's entry, as `drift` loads it: a plain object is enough.
		await writeFile(join(pkg, 'index.js'), `export default ${JSON.stringify({ components: [r.component] })}\n`)
		return { pkg, r }
	}

	test('current when core has not moved', async () => {
		const cat = await catalogCopy()
		const { pkg, r } = await clonedPackage(cat)
		const [e] = await driftReport(pkg, [r.component], { catalogDir: cat })
		assert.equal(e!.status, 'current')
		assert.equal((await cli(['drift', pkg, '--catalog', cat])).code, 0)
	})

	test("behind: lists the files core changed, added and removed, and flags the ones edited here too", async () => {
		const cat = await catalogCopy()
		const { pkg, r } = await clonedPackage(cat)
		const src = await coreSource('stats', cat)
		const [a, b, c] = Object.keys(src.files).filter((p) => p !== src.entry).sort()
		const moved = await moveCore(cat, 'stats', (f) => {
			f[a!] += '\n// core moved\n'
			f[b!] += '\n// core moved\n'
			delete f[c!]
			f['sessions/stats/added.ts'] = 'export const added = 1\n'
		})
		// The author edited b too, and an untouched file stays unflagged.
		await writeFile(join(pkg, 'components/my-stats', b!), '// mine\n')

		const [e] = await driftReport(pkg, [r.component], { catalogDir: cat })
		assert.equal(e!.status, 'behind')
		assert.equal(e!.coreHash, moved.sourceHash)
		assert.equal(e!.basedOnHash, src.sourceHash)
		assert.equal(e!.separated, true)
		assert.equal(e!.root, 'components/my-stats')
		assert.deepEqual(
			e!.files,
			[
				{ path: a!, change: 'changed' },
				{ path: b!, change: 'changed', editedHere: true },
				{ path: c!, change: 'removed' },
				{ path: 'sessions/stats/added.ts', change: 'added' },
			].sort((x, y) => (x.path < y.path ? -1 : 1)),
		)
		assert.match(renderDrift([e!]), /merge by hand/)

		const run = await cli(['drift', pkg, '--catalog', cat])
		assert.equal(run.code, 1, 'drift exits 1 when core moved on — a CI step can say so')
		assert.match(run.out, new RegExp(`changed ${a!.replace(/[.]/g, '\\.')}`))
	})

	test("without based-on.json it lists where the copy and core differ now, and says it cannot tell them apart", async () => {
		const cat = await catalogCopy()
		const { pkg, r } = await clonedPackage(cat)
		await unlink(join(pkg, 'components/my-stats', CLONE_BASE_FILE))
		const src = await coreSource('stats', cat)
		const edited = Object.keys(src.files).find((p) => p !== src.entry)!
		await moveCore(cat, 'stats', (f) => {
			f[edited] += '\n// core moved\n'
		})
		const [e] = await driftReport(pkg, [r.component], { catalogDir: cat })
		assert.equal(e!.status, 'behind')
		assert.equal(e!.separated, false)
		assert.equal(e!.root, 'components/my-stats', 'found by the entry path, core entry stripped')
		assert.deepEqual(e!.files, [{ path: edited, change: 'changed' }])
		assert.match(renderDrift([e!]), /your edits and core's together/)
		assert.equal(sha(src.files[edited]!), sha(await readFile(join(pkg, 'components/my-stats', edited), 'utf8')))
	})

	/** A copy made before `clone` wrote a record: the files, no based-on.json. */
	async function recordlessCopy(cat: string) {
		const got = await clonedPackage(cat)
		await unlink(join(got.pkg, 'components/my-stats', CLONE_BASE_FILE))
		return got
	}

	test('--retrofit with the copied source still in the catalog: the exact record, three-way at once', async () => {
		const cat = await catalogCopy()
		const { pkg, r } = await recordlessCopy(cat)
		const src = await coreSource('stats', cat)
		const [a, b] = Object.keys(src.files).filter((p) => p !== src.entry).sort()
		await writeFile(join(pkg, 'components/my-stats', b!), '// mine, before the record\n')
		const now = new Date('2026-09-26T12:00:00Z')
		const got = await retrofitCloneBase(pkg, r.component, { catalogDir: cat, now })
		assert.equal(got.from, 'source')
		assert.equal(got.written, `components/my-stats/${CLONE_BASE_FILE}`)
		const base = JSON.parse(await readFile(join(pkg, got.written), 'utf8'))
		assert.equal(base.sourceHash, src.sourceHash)
		assert.deepEqual(base.retrofitted, { from: 'source', at: now.toISOString() })
		assert.equal(base.files[b!], sha(src.files[b!]!), 'the record is core source, not the edited copy')

		// Core moves a and b: b is flagged as edited here too, even though the edit predates the record.
		await moveCore(cat, 'stats', (f) => {
			f[a!] += '\n// core moved\n'
			f[b!] += '\n// core moved\n'
		})
		const [e] = await driftReport(pkg, [r.component], { catalogDir: cat })
		assert.equal(e!.separated, true)
		assert.equal(e!.retrofittedAt, undefined)
		assert.deepEqual(e!.files, [
			{ path: a!, change: 'changed' },
			{ path: b!, change: 'changed', editedHere: true },
		])
	})

	test("--retrofit when core has moved past the copy: the record is the copy as it stands, and drift says history starts then", async () => {
		const cat = await catalogCopy()
		const { pkg, r } = await recordlessCopy(cat)
		const src = await coreSource('stats', cat)
		const [a, b, c] = Object.keys(src.files).filter((p) => p !== src.entry).sort()
		// Core moved before the record was made — its source at the copied hash is gone.
		await moveCore(cat, 'stats', (f) => {
			f[a!] += '\n// core moved\n'
		})
		const now = new Date('2026-09-26T12:00:00Z')
		const run = await cli(['drift', pkg, '--catalog', cat, '--retrofit', 'my-stats'])
		assert.equal(run.code, 0, run.err)
		assert.match(run.out, /wrote components\/my-stats\/based-on\.json/)
		assert.match(run.out, /note: .*per-file history starts now/)
		const base = JSON.parse(await readFile(join(pkg, 'components/my-stats', CLONE_BASE_FILE), 'utf8'))
		assert.equal(base.sourceHash, src.sourceHash, 'keeps the hash the copy records, never core now')
		assert.equal(base.retrofitted.from, 'copy')
		assert.equal(base.files[CLONE_BASE_FILE], undefined)
		assert.equal(base.files[b!], sha(src.files[b!]!))

		// Edited after the record: flagged. Moved in core since: listed.
		await moveCore(cat, 'stats', (f) => {
			f[c!] += '\n// core moved again\n'
		})
		await writeFile(join(pkg, 'components/my-stats', c!), '// mine, after the record\n')
		const [e] = await driftReport(pkg, [r.component], { catalogDir: cat })
		assert.equal(e!.status, 'behind')
		assert.equal(e!.separated, false)
		assert.equal(e!.retrofittedAt, base.retrofitted.at)
		assert.deepEqual(e!.files, [
			{ path: a!, change: 'changed' },
			{ path: c!, change: 'changed', editedHere: true },
		])
		assert.match(renderDrift([e!]), /retrofitted from your copy on \d{4}-\d\d-\d\d .*per-file history starts then/)
		assert.match(renderDrift([e!]), /edited since/)
		void now
	})

	test('--retrofit refuses: an existing record without --force, an unpinned basedOn, an unknown slug', async () => {
		const cat = await catalogCopy()
		const { pkg, r } = await clonedPackage(cat)
		await assert.rejects(retrofitCloneBase(pkg, r.component, { catalogDir: cat }), /already exists — nothing was written; --force/)
		const forced = await retrofitCloneBase(pkg, r.component, { catalogDir: cat, force: true })
		assert.equal(forced.from, 'source')
		const { sourceHash: _h, ...unpinned } = r.component.basedOn!
		await assert.rejects(
			retrofitCloneBase(pkg, { ...r.component, basedOn: unpinned }, { catalogDir: cat, force: true }),
			/records no sourceHash/,
		)
		const missing = await cli(['drift', pkg, '--catalog', cat, '--retrofit', 'nope'])
		assert.equal(missing.code, 1)
		assert.match(missing.err, /declares no such component/)
	})

	test('unpinned and unknown upstreams are reported, not failed', async () => {
		const pkg = await scratch('drift-misc')
		const entries = await driftReport(pkg, [
			{ slug: 'a', entry: 'components/a/x.ts', basedOn: { component: 'stats', version: '0' } },
			{ slug: 'b', entry: 'components/b/x.ts', basedOn: { component: 'gone-now', version: '0', sourceHash: 'f'.repeat(64) } },
			{ slug: 'c', entry: 'components/c/x.ts' },
		])
		assert.deepEqual(
			entries.map((e) => [e.slug, e.status]),
			[
				['a', 'unpinned'],
				['b', 'unknown'],
			],
		)
	})
})
