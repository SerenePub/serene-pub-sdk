/**
 * Executed examples (15 §1.6) — the pages in `examples/`, and the goldens that
 * stop them drifting.
 *
 * Three claims are worth holding, and each one is a way the feature could fail
 * quietly rather than loudly:
 *
 *   · the page really is the module — the fence holds the file's own text,
 *     byte for byte, so nobody can "improve" an example into something that
 *     does not compile;
 *   · two runs produce the same bytes — otherwise the golden is noise and the
 *     first person to see a diff learns to ignore it;
 *   · a moved output fails LOUDLY, naming the example — a `GoldenMismatch`,
 *     not a page that silently rewrote itself on the next build.
 *
 * The committed goldens are checked here too, so drift in the executor fails
 * `npm test` rather than reaching a reader.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { renderExampleDocs } from '@serene-pub/cli'
import { GoldenMismatch, type Golden } from '@serene-pub/sdk/testing'

const EXAMPLES_DIR = join(import.meta.dirname, 'examples')
const GOLDENS_DIR = join(EXAMPLES_DIR, 'goldens')

/** The examples are `.ts`; this suite runs under tsx, which can import one. */
const load = (path: string) => import(path)

const SLUGS = ['echo-reply', 'retrieved-reply', 'spoken-reply']

/** A temp goldens directory per test, removed however the test ends. */
async function inTempGoldens<T>(run: (dir: string) => Promise<T>): Promise<T> {
	const dir = await mkdtemp(join(tmpdir(), 'sp-examples-'))
	try {
		return await run(dir)
	} finally {
		await rm(dir, { recursive: true, force: true })
	}
}

describe('executed examples', () => {
	test('each example builds, validates, runs, and renders its own source', async () => {
		await inTempGoldens(async (goldensDir) => {
			const { pages, report } = await renderExampleDocs({
				dir: EXAMPLES_DIR,
				goldensDir,
				update: true,
				load,
			})

			assert.equal(pages.length, SLUGS.length)
			assert.deepEqual(
				report.map((r) => r.slug),
				SLUGS,
			)
			// Nothing was there, so every golden is a first recording.
			assert.ok(report.every((r) => r.recorded && !r.changed))

			for (const [i, slug] of SLUGS.entries()) {
				const page = pages[i]!
				const source = await readFile(join(EXAMPLES_DIR, `${slug}.example.ts`), 'utf8')
				const mod = (await load(join(EXAMPLES_DIR, `${slug}.example.ts`))) as any

				assert.equal(page.path, `examples/${slug}.md`)
				assert.ok(
					page.markdown.startsWith(`# ${mod.example.title}\n`),
					`${slug}: the page opens with the example's title`,
				)
				// The fence holds the file, not a paraphrase of it — and it is
				// a playground fence, because a page whose code was executed
				// to make it is a page whose code a reader can execute too.
				assert.ok(
					page.markdown.includes('```playground ts\n' + source.trimEnd() + '\n```'),
					`${slug}: the code block is the module's own text, runnable`,
				)
				assert.match(page.markdown, /## What it produces/)
				assert.match(page.markdown, /outcome ok/)
				assert.match(page.markdown, /## Golden/)
				assert.ok(page.markdown.includes(`${slug}.golden.json`))
			}

			// Every node the run recorded is on the page, in order.
			assert.match(
				pages[0]!.markdown,
				/▸ input[\s\S]*▸ history[\s\S]*▸ generate[\s\S]*▸ save/,
			)
			// The sampler the adapter could not carry is named, not dropped.
			assert.match(pages[1]!.markdown, /ignored samplers: mirostat_tau/)
		})
	})

	test('a second run records nothing and renders the same bytes', async () => {
		await inTempGoldens(async (goldensDir) => {
			const first = await renderExampleDocs({
				dir: EXAMPLES_DIR,
				goldensDir,
				update: true,
				load,
			})
			const second = await renderExampleDocs({ dir: EXAMPLES_DIR, goldensDir, load })

			assert.ok(second.report.every((r) => !r.recorded && !r.changed))
			assert.deepEqual(
				second.pages.map((p) => p.markdown),
				first.pages.map((p) => p.markdown),
			)
		})
	})

	test('a moved output is a GoldenMismatch naming the example', async () => {
		await inTempGoldens(async (goldensDir) => {
			await renderExampleDocs({ dir: EXAMPLES_DIR, goldensDir, update: true, load })

			const path = join(goldensDir, 'retrieved-reply.golden.json')
			const golden = JSON.parse(await readFile(path, 'utf8')) as Golden
			golden.nodes[golden.nodes.length - 1]!.output = { messageId: 'row:something-else' }
			await writeFile(path, JSON.stringify(golden, null, '\t') + '\n')

			await assert.rejects(
				() => renderExampleDocs({ dir: EXAMPLES_DIR, goldensDir, load }),
				(e: unknown) => {
					assert.ok(e instanceof GoldenMismatch)
					assert.equal(e.name, 'retrieved-reply')
					// The diff is the message, so a reader sees what moved.
					assert.match(e.message, /row:something-else/)
					return true
				},
			)
		})
	})

	test('a missing golden names --update-goldens rather than recording silently', async () => {
		await inTempGoldens(async (goldensDir) => {
			await assert.rejects(
				() => renderExampleDocs({ dir: EXAMPLES_DIR, goldensDir, load }),
				/--update-goldens/,
			)
		})
	})

	test('the committed goldens still match — drift fails the suite', async () => {
		const { pages, report } = await renderExampleDocs({
			dir: EXAMPLES_DIR,
			goldensDir: GOLDENS_DIR,
			load,
		})
		assert.equal(pages.length, SLUGS.length)
		assert.ok(report.every((r) => !r.recorded && !r.changed))
	})
})
