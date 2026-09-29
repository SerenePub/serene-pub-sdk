/**
 * The hand-written guides under `guides/`, and the promise their code makes.
 *
 * A guide's ` ```playground ` fence is not an illustration. The docs host
 * mounts the playground against it and a reader presses Run, so the claim worth
 * holding is the one the executed examples hold — *the code on the page is code
 * that runs* — and this file holds it through the playground's own path rather
 * than a private one: `runSource` transpiles the fence, evaluates it against the
 * playground module map, builds it, validates it and runs it on the fixture
 * host, exactly as `playground.test.ts` does for the example modules.
 *
 * The fences are extracted by asking the compiler to render the page and
 * reading the carriers back out — the same `<script type="text/plain">` a host
 * reads `textContent` off. A regex of this file's own would decide for itself
 * what "a runnable fence" is and would then pass in silence over a fence the
 * compiler does not recognise, which is a fence no reader can run either.
 * Asking the compiler means the page and the suite agree by construction.
 *
 * A guide with nothing runnable in it is not a failure — prose comes before
 * code, and a draft is allowed to be prose. It says so out loud instead, so
 * "the fences all pass" and "there are no fences" never read the same.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { renderMarkdown } from '@serene-pub/docs'

import { runSource } from '../playground/src/runner.js'

const GUIDES_DIR = join(import.meta.dirname, '..', 'guides')

/**
 * What a host does with a playground fence's carrier: read `textContent`, undo
 * the escaping. The inverse of the compiler's `escapeHtml`, `&amp;` last so an
 * escaped entity in the fence's own text survives the round trip.
 */
function unescapeHtml(value: string): string {
	return value
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&amp;/g, '&')
}

const CARRIER = /class="doc-playground-source">([\s\S]*?)<\/script>/g

interface Guide {
	/** The slug the docs build orders and links by: the filename without `.md`. */
	slug: string
	/** The page's first H1 — what the nav and the search index call it. */
	title?: string
	/** Every playground fence's source, in document order. */
	fences: string[]
}

/** Every `guides/*.md`, rendered once, with its runnable fences recovered. */
async function readGuides(): Promise<Guide[]> {
	const names = (await readdir(GUIDES_DIR))
		.filter((name) => name.toLowerCase().endsWith('.md'))
		.sort()
	const guides: Guide[] = []
	for (const name of names) {
		const markdown = await readFile(join(GUIDES_DIR, name), 'utf8')
		// No highlighter, no image resolver, no pipeline resolver: none of them
		// touch the carrier, and each one costs a build the extraction does not
		// need. The docs build is where a broken link or a missing image fails.
		const rendered = await renderMarkdown(markdown, { path: name })
		guides.push({
			slug: name.replace(/\.md$/i, ''),
			title: rendered.title,
			fences: [...rendered.html.matchAll(CARRIER)].map((match) => unescapeHtml(match[1]!)),
		})
	}
	return guides
}

const guides = await readGuides()

describe('the hand-written guides', () => {
	test('there is at least one, so this suite is proving something', () => {
		assert.ok(guides.length, `no \`.md\` guides under ${GUIDES_DIR}`)
	})
})

for (const guide of guides) {
	describe(`guide ${guide.slug}`, () => {
		test('has an H1', () => {
			assert.ok(
				guide.title,
				`guide ${guide.slug}: no H1 — the nav and the search index take a ` +
					`page's title from its first heading.`,
			)
		})

		if (!guide.fences.length) {
			test('has no runnable fences yet', () => {
				console.log(`guide ${guide.slug}: 0 runnable fences`)
			})
			return
		}

		guide.fences.forEach((source, index) => {
			test(`playground fence ${index} runs`, async () => {
				const run = await runSource(source)
				// `findings` and `error` are both failures here: a fence that
				// does not publish, or throws, is a Run button that gives a
				// reader an error message instead of the page's own claim.
				assert.equal(
					run.status,
					'ok',
					`guide ${guide.slug}, playground fence ${index}: ${run.result}`,
				)
			})
		})
	})
}
