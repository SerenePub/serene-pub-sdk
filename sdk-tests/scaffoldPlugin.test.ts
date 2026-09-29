/**
 * `serene-pub scaffold plugin` (24 §7, D-5) — the package it writes, held to the
 * same bar a shipped one is.
 *
 * A scaffold is the first thing an author runs, and a scaffold that does not
 * compile is worse than none: the first thing they learn is that the tool lies,
 * and every finding afterwards is one they suspect. So nothing here asserts on
 * the *text* of a template. Each test takes what the scaffold wrote, hands it to
 * the packager the command line hands a real package to, and refuses a single
 * finding — error or warning.
 *
 * The flags compose, and the combinations are where a generator actually breaks:
 * a field emitted for one flag and referenced by another, an import kept when
 * its section was dropped. Every combination is compiled, not a sample.
 *
 * ⚠ The tree is written **inside this workspace**, not `tmpdir()`. A package
 * outside it resolves `@serene-pub/sdk` to the built dist rather than the sources
 * under test — two SDK instances, two definition registries, and a failure that
 * has nothing to do with what is being tested. `fixtures/unified-plugin` says the
 * same thing in its own docblock and for the same reason.
 */

import { test, describe, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'

import { main } from '@serene-pub/cli/bin'
import {
	compilePlugin,
	declaredFrameEntries,
	matchesGlob,
	renderExampleDocs,
	renderFindings,
	scaffoldPlugin,
	DEFAULT_PERMISSION_IGNORES,
	type CompileResult,
	type SourceFile,
} from '@serene-pub/cli'

/** Everything this suite writes, removed however it ends. */
const ROOT = join(import.meta.dirname, '.scaffolded')

after(async () => {
	await rm(ROOT, { recursive: true, force: true })
})

/* ── Driving the command line ───────────────────────────────────────────── */

/** Scaffold one package under a name of its own, so no two share a slug. */
async function scaffold(name: string, flags: readonly string[]): Promise<string> {
	const dir = join(ROOT, name)
	await rm(dir, { recursive: true, force: true })
	// `--json` for the quiet path: sixteen packages' worth of file listings is
	// not what a failing assertion should be buried under.
	const code = await main([
		'scaffold',
		'plugin',
		dir,
		'--slug',
		`demo.${name}`,
		...flags,
		'--json',
	])
	assert.equal(code, 0, `scaffold ${flags.join(' ')} exited ${code}`)
	return dir
}

/**
 * The source files the packager reads, gathered the way `bin.ts` gathers them —
 * including the default permission mutes, so a stand-in host's `ctx.commit` in
 * `examples/fixtures.ts` is linted without being counted as this plugin's reach.
 */
async function sourcesIn(dir: string): Promise<SourceFile[]> {
	const out: SourceFile[] = []
	const walk = async (d: string) => {
		for (const entry of await readdir(d)) {
			if (entry === 'node_modules' || entry === 'dist' || entry.startsWith('.')) continue
			const full = join(d, entry)
			if ((await stat(full)).isDirectory()) await walk(full)
			else if (/\.(ts|tsx|js|mjs)$/.test(entry) && !/\.d\.ts$/.test(entry)) {
				const path = relative(dir, full)
				const muted = DEFAULT_PERMISSION_IGNORES.some((g) => matchesGlob(g, path))
				out.push({
					path,
					text: await readFile(full, 'utf8'),
					...(muted ? { permissions: false } : {}),
				})
			}
		}
	}
	await walk(dir)
	return out
}

/** The packager's own answer about a scaffolded directory — both halves, plus the frames. */
async function compileScaffolded(dir: string): Promise<CompileResult> {
	const sources = await sourcesIn(dir)
	const mod = (await import(pathToFileURL(join(dir, 'src', 'index.ts')).href)) as {
		default: import('@serene-pub/sdk').Extension
	}
	const extension = mod.default
	const frameDocuments = await Promise.all(
		declaredFrameEntries(extension.surfaces).map(async (entry) => ({
			path: entry,
			text: await readFile(join(dir, entry), 'utf8'),
		})),
	)
	return compilePlugin({ sources, extension, frameDocuments })
}

/** Nothing at all — not an error, and not a warning either. */
const assertClean = (name: string, r: CompileResult) => {
	assert.equal(r.findings.length, 0, `${name} is not clean:\n${renderFindings(r.findings)}`)
	assert.equal(r.ok, true, `${name} did not compile`)
}

/* ── 105 · what the scaffold writes ─────────────────────────────────────── */

describe('105 · scaffold plugin writes a package the packager accepts', () => {
	/**
	 * Every combination, because a generator breaks between flags rather than
	 * inside one. Sixteen packages is cheap; the bug it catches — an import kept
	 * when its section was dropped — is a scaffold nobody can build.
	 */
	const FLAGS = ['genre', 'action', 'panel', 'storage'] as const
	const combinations = Array.from({ length: 1 << FLAGS.length }, (_, mask) =>
		FLAGS.filter((_f, i) => mask & (1 << i)),
	)

	for (const combination of combinations) {
		const name = combination.length ? combination.join('-') : 'base'
		test(`${name} compiles with no findings`, async () => {
			const dir = await scaffold(
				name,
				combination.map((f) => `--${f}`),
			)
			assertClean(name, await compileScaffolded(dir))
		})
	}

	test('the base scaffold is the file list it promises, and nothing else', async () => {
		const files = (await scaffoldPlugin({ slug: 'demo.base-list' })).map((f) => f.path)
		assert.deepEqual(files, [
			'.gitignore',
			'README.md',
			'examples/first-run.example.ts',
			'examples/fixtures.ts',
			'examples/goldens/.gitkeep',
			'package.json',
			'src/index.ts',
			'test/announcement.test.ts',
			'test/example.test.ts',
			'tsconfig.check.json',
			'tsconfig.json',
			'vitest.config.ts',
		])
	})

	test('each flag adds its own files and takes none away', async () => {
		const base = new Set((await scaffoldPlugin({ slug: 'demo.f-base' })).map((f) => f.path))
		const added = async (flag: 'genre' | 'action' | 'panel' | 'storage') => {
			const files = (await scaffoldPlugin({ slug: `demo.f-${flag}`, [flag]: true })).map(
				(f) => f.path,
			)
			for (const b of base) assert.ok(files.includes(b), `--${flag} dropped ${b}`)
			return files.filter((f) => !base.has(f))
		}
		assert.deepEqual(await added('genre'), [
			'src/genre.ts',
			'src/specs/create.ts',
			'src/specs/respond.ts',
		])
		assert.deepEqual(await added('action'), ['src/specs/answer.ts', 'src/specs/ask.ts'])
		assert.deepEqual(await added('panel'), ['ui/panel.html', 'ui/panel.js'])
		assert.deepEqual(await added('storage'), ['src/storage.ts'])
	})
})

describe('105 · what the built manifest carries', () => {
	test('the whole scaffold builds to one manifest holding every half', async () => {
		const dir = await scaffold('whole', ['--genre', '--action', '--panel', '--storage'])
		const out = join(dir, 'dist', 'plugin')
		assert.equal(await main(['build', dir, '--out', out]), 0)

		// `bundle.js` beside them: the scaffold declares handlers, so the build
		// packages the code that implements them (D-6b).
		assert.deepEqual((await readdir(out)).sort(), ['bundle.js', 'manifest.json', 'pipelines'])
		const m = JSON.parse(await readFile(join(out, 'manifest.json'), 'utf8'))

		// the code half
		assert.equal(m.slug, 'demo.whole')
		assert.deepEqual(
			m.nodeDefinitions.map((d: { id: string }) => d.id),
			[
				'demo.whole:task/echo@1',
				'demo.whole:outlet/save-note@1',
				'demo.whole:outlet/read-note@1',
			],
		)

		// the declaration half
		assert.deepEqual(
			m.genres.map((g: { id: string }) => g.id),
			['demo.whole:genre/whole'],
		)
		assert.deepEqual(
			m.presets.map((p: { slug: string }) => p.slug),
			['whole'],
		)
		assert.deepEqual(
			m.prompts.map((p: { slug: string }) => p.slug),
			['whole-default'],
		)
		assert.deepEqual(m.surfaces.panels, [
			{ id: 'panel', entry: 'ui/panel.html', title: 'Whole', channels: ['main'] },
		])
		// A quota is declared, because no call site carries one.
		assert.ok(m.permissions.includes('storage:1048576'))
		// The inlet lock is the only subscription a pipeline has, and it is a
		// permission: a pipeline that runs on every message is a side effect.
		assert.ok(m.permissions.includes('event:core:event/message-respond@1'))

		// one document per declared pipeline, and every one under the slug
		assert.deepEqual((await readdir(join(out, 'pipelines'))).sort(), [
			'demo.whole_spec_answer.json',
			'demo.whole_spec_ask.json',
			'demo.whole_spec_create-session.json',
			'demo.whole_spec_respond.json',
		])
	})

	test('an action with no genre of its own requires the genre it serves', async () => {
		const dir = await scaffold('borrowed', ['--action'])
		const out = join(dir, 'dist', 'plugin')
		assert.equal(await main(['build', dir, '--out', out]), 0)
		const m = JSON.parse(await readFile(join(out, 'manifest.json'), 'utf8'))
		// Never bundled: an id this package references and does not declare is
		// enforced at install.
		assert.deepEqual(m.requires, ['core:genre/chat'])
	})
})

describe('105 · the example the scaffold ships really runs', () => {
	test('it builds, validates, runs on the fixture host, and records its first golden', async () => {
		const dir = await scaffold('runnable', ['--genre', '--panel'])
		const goldens = await mkdtemp(join(tmpdir(), 'sp-scaffold-goldens-'))
		try {
			const { pages, report } = await renderExampleDocs({
				dir: join(dir, 'examples'),
				goldensDir: goldens,
				// The scaffold ships an empty `goldens/`, and says so: the first
				// run is a deliberate `UPDATE_GOLDENS=1 npm test`.
				update: true,
				load: (path) => import(pathToFileURL(path).href),
			})
			assert.deepEqual(
				report.map((r) => r.slug),
				['first-run'],
			)
			assert.ok(report[0]!.recorded, 'the first run records the golden')
			assert.match(pages[0]!.markdown, /outcome ok/)
			// The package's own node really ran; the stand-ins are core's.
			assert.match(
				pages[0]!.markdown,
				/▸ input[\s\S]*▸ history[\s\S]*▸ echo[\s\S]*▸ speak[\s\S]*▸ save/,
			)
		} finally {
			await rm(goldens, { recursive: true, force: true })
		}
	})
})

describe('105 · what the scaffold refuses', () => {
	test('a slug that is not a slug, in the words defineExtension uses', async () => {
		await assert.rejects(
			() => scaffoldPlugin({ slug: 'Not A Slug' }),
			/is not a valid plugin slug/,
		)
	})

	test('a directory that already holds one of the files, rather than overwriting it', async () => {
		const dir = await scaffold('twice', [])
		assert.equal(
			await main(['scaffold', 'plugin', dir, '--slug', 'demo.twice']),
			1,
			'a second scaffold over the same directory is refused',
		)
		// And the first one is still there, unchanged.
		assert.match(await readFile(join(dir, 'src', 'index.ts'), 'utf8'), /demo\.twice/)
	})

	test('a call with no slug at all', async () => {
		assert.equal(await main(['scaffold', 'plugin', join(ROOT, 'no-slug')]), 1)
	})
})
