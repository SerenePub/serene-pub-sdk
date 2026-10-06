/**
 * `@serene-pub/docs` — the docs compiler.
 *
 * The claims worth holding still are the ones a reader would notice breaking:
 * an anchor that has been bookmarked, a link between two pages that came from
 * different repos, and a screenshot that got 4MB heavier without anyone
 * noticing. So the dialect helpers are pinned against GitHub's own slug rule,
 * which is the rule the corpus was written against, and the compile is
 * asserted to FAIL — loudly, naming the offender — rather than to emit a site
 * with a dead link in it.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Jimp } from 'jimp'

import {
	compileDocs,
	createDocsHighlighter,
	loadMarkdownDir,
	renderDocsGraph,
	renderMarkdown,
	rewriteDocHref,
	slugifyHeading,
	type CompileDocsOptions,
	type DocsGraph,
	type DocsManifest,
	type DocsSearchEntry,
} from '@serene-pub/docs'

/**
 * What a host does with a playground fence's carrier: read `textContent`, undo
 * the escaping. Spelled out here rather than imported so the test states the
 * host's half of the contract instead of reusing the compiler's own half.
 */
function unescapeHtml(value: string): string {
	return value
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&amp;/g, '&')
}

/** A temp workspace per test, removed however the test ends. */
async function inTempDir<T>(run: (dir: string) => Promise<T>): Promise<T> {
	const dir = await mkdtemp(join(tmpdir(), 'sp-docs-'))
	try {
		return await run(dir)
	} finally {
		await rm(dir, { recursive: true, force: true })
	}
}

async function writeDoc(dir: string, path: string, markdown: string): Promise<void> {
	const target = join(dir, path)
	await mkdir(join(target, '..'), { recursive: true })
	await writeFile(target, markdown, 'utf8')
}

/** A solid PNG of the given size, so the image tests own their fixture. */
async function writePng(target: string, width: number, height: number): Promise<void> {
	await mkdir(join(target, '..'), { recursive: true })
	await new Jimp({ width, height, color: 0xcc3344ff }).write(target as `${string}.png`)
}

const out = (dir: string) => join(dir, 'out')
const assetsOut = (dir: string) => join(dir, 'out', 'assets')

function baseOptions(dir: string, sources: CompileDocsOptions['sources']): CompileDocsOptions {
	return {
		version: '0.6.0-test',
		sources,
		out: out(dir),
		assetsOut: assetsOut(dir),
		assetsBase: '/docs/assets',
	}
}

const readManifest = async (dir: string): Promise<DocsManifest> =>
	JSON.parse(await readFile(join(out(dir), 'manifest.json'), 'utf8'))

const readSearch = async (dir: string): Promise<DocsSearchEntry[]> =>
	JSON.parse(await readFile(join(out(dir), 'search.json'), 'utf8'))

const readPage = (dir: string, slug: string) =>
	readFile(join(out(dir), 'pages', `${slug}.html`), 'utf8')

const exists = (path: string): Promise<boolean> =>
	stat(path).then(
		() => true,
		() => false,
	)

const inode = async (path: string): Promise<number> => (await stat(path)).ino

describe('the docs dialect', () => {
	test('slugifyHeading is GitHub’s rule — underscores kept, each space a hyphen', () => {
		assert.equal(slugifyHeading('Getting Started'), 'getting-started')

		// The corpus lived on GitHub for a year, and GitHub does not treat `_`
		// as punctuation. The anchor a year of guides link is the one with the
		// underscores still in it.
		assert.equal(
			slugifyHeading('`SERENE_PUB_DATA_DIR` is the one exception'),
			'serene_pub_data_dir-is-the-one-exception',
		)
		// TypeDoc emits the same shape, and its re-export lists link them.
		assert.equal(slugifyHeading('slot_value'), 'slot_value')
		assert.equal(slugifyHeading('band_order'), 'band_order')

		// Inline code and emphasis markers are gone; what they wrapped stays.
		assert.equal(slugifyHeading('Why it *moved* out?'), 'why-it-moved-out')

		// Each space becomes ONE hyphen, so a removed `&` leaves two behind.
		// Every one of these is an anchor already written into the guides.
		assert.equal(
			slugifyHeading('Portable & Self-Contained Setup'),
			'portable--self-contained-setup',
		)
		assert.equal(
			slugifyHeading('OpenAI Session & Compatible Endpoint Presets'),
			'openai-session--compatible-endpoint-presets',
		)
		assert.equal(
			slugifyHeading('Prompt Configs & Summarization Config'),
			'prompt-configs--summarization-config',
		)

		// An apostrophe — either one — is dropped, never hyphenated.
		assert.equal(slugifyHeading('Database won\u2019t open'), 'database-wont-open')
		assert.equal(slugifyHeading("Database won't open"), 'database-wont-open')

		// Stateless: a fresh slugger per call, so no `-1` leaks between callers.
		// De-duplication is a page's business, not a helper's.
		assert.equal(slugifyHeading('Notes'), 'notes')
		assert.equal(slugifyHeading('Notes'), 'notes')
	})

	test('a heading’s text is plain, but its id still comes from the raw markdown', async () => {
		const raw = '`input` — input (`core:inlet/user-message@1`)'
		const rendered = await renderMarkdown(`# T\n\n## ${raw}\n\nBody.\n`, { path: 'index.md' })
		const heading = rendered.headings[1]
		// The backticks are gone from what a reader sees in the outline…
		assert.equal(heading.text, 'input — input (core:inlet/user-message@1)')
		// …but the id is still GitHub's slug of the untouched source, so a
		// bookmarked anchor keeps landing.
		assert.equal(heading.id, slugifyHeading(raw))
		assert.match(rendered.html, new RegExp(`<h2 id="${heading.id}">`))
	})

	test('repeated headings get -1, -2 ids from the page’s slugger, first keeps the bare one', async () => {
		const rendered = await renderMarkdown('# Setup\n\n## Notes\n\n## Notes\n\n## Notes\n', {
			path: 'index.md',
		})
		assert.deepEqual(
			rendered.headings.map((heading) => heading.id),
			['setup', 'notes', 'notes-1', 'notes-2'],
		)
		assert.match(rendered.html, /<h2 id="notes-1">Notes<\/h2>/)
	})

	test('rewriteDocHref keeps its one-argument form, and gains a contextual one', () => {
		// The app still calls it this way; flat slugs, `/docs` hardcoded.
		assert.equal(
			rewriteDocHref('./characters.md#creator-wizard'),
			'/docs/characters#creator-wizard',
		)
		assert.equal(rewriteDocHref('characters.md'), '/docs/characters')
		assert.equal(rewriteDocHref('#somewhere'), '#somewhere')
		assert.equal(rewriteDocHref('https://example.com/x.md'), 'https://example.com/x.md')

		// With a context: nested paths, a source prefix, a chosen link base.
		assert.equal(
			rewriteDocHref('pipelines/core_spec_chat-respond.md', { path: 'index.md', prefix: 'sdk' }),
			'/docs/sdk/pipelines/core_spec_chat-respond',
		)
		assert.equal(
			rewriteDocHref('./characters.md#creator-wizard', { path: 'sessions.md' }),
			'/docs/characters#creator-wizard',
		)
		assert.equal(
			rewriteDocHref('../characters.md', { path: 'guides/setup.md' }),
			'/docs/characters',
		)
		assert.equal(
			rewriteDocHref('characters.md', { path: 'index.md', linkBase: '/help' }),
			'/help/characters',
		)
		assert.equal(rewriteDocHref('#local', { path: 'index.md', prefix: 'sdk' }), '#local')
	})

	test('an absolute http(s) link opens in a new window; a link between pages does not', async () => {
		const rendered = await renderMarkdown(
			'# T\n\n[canon](https://github.com/doolijb/serene-pub/blob/main/NOMENCLATURE.md#9-session) ' +
				'[plain](http://example.com/a?b=1&c=2) <https://example.org/bare> ' +
				'[page](characters.md#tags) [here](#t) [rooted](/docs/sessions) [mail](mailto:a@example.com)\n',
			{ path: 'index.md' },
		)
		const NEW_WINDOW = ' target="_blank" rel="noopener noreferrer"'
		assert.ok(
			rendered.html.includes(
				`<a href="https://github.com/doolijb/serene-pub/blob/main/NOMENCLATURE.md#9-session"${NEW_WINDOW}>canon</a>`,
			),
			rendered.html,
		)
		assert.ok(rendered.html.includes(`<a href="http://example.com/a?b=1&amp;c=2"${NEW_WINDOW}>plain</a>`), rendered.html)
		assert.ok(rendered.html.includes(`<a href="https://example.org/bare"${NEW_WINDOW}>`), rendered.html)
		assert.ok(rendered.html.includes('<a href="/docs/characters#tags">page</a>'), rendered.html)
		assert.ok(rendered.html.includes('<a href="#t">here</a>'), rendered.html)
		assert.ok(rendered.html.includes('<a href="/docs/sessions">rooted</a>'), rendered.html)
		assert.ok(rendered.html.includes('<a href="mailto:a@example.com">mail</a>'), rendered.html)
	})

	test('admonitions carry their kind, their title and markdown bodies', async () => {
		const rendered = await renderMarkdown(
			'# T\n\n:::warning Mind the gap\nBody with **bold**.\n:::\n\n:::note\nUntitled.\n:::\n',
			{ path: 'index.md' },
		)
		assert.match(
			rendered.html,
			/<aside class="doc-admonition doc-admonition-warning" role="note"><p class="doc-admonition-title">Mind the gap<\/p><p>Body with <strong>bold<\/strong>\.<\/p>/,
		)
		// No title given → the kind, capitalised.
		assert.match(
			rendered.html,
			/doc-admonition-note" role="note"><p class="doc-admonition-title">Note<\/p>/,
		)
	})

	test('a playground fence carries its own source beside the highlighted block', async () => {
		const highlighter = await createDocsHighlighter(['ts'])
		try {
			const rendered = await renderMarkdown('# T\n\n```playground ts\nconst x = 1\n```\n', {
				path: 'index.md',
				highlight: (code, lang) => highlighter.render(code, lang),
			})
			assert.match(
				rendered.html,
				/<div class="doc-playground" data-playground data-lang="ts">/,
			)
			// The source carrier is the FIRST child: the host reads it without
			// having to know anything about what the highlighter emitted.
			assert.match(
				rendered.html,
				/data-lang="ts"><script type="text\/plain" class="doc-playground-source">const x = 1<\/script>/,
			)
			assert.match(rendered.html, /--shiki-dark/)
			assert.match(rendered.html, /<\/pre><\/div>/)
		} finally {
			highlighter.dispose()
		}
	})

	test('a fence body cannot close its own source carrier', async () => {
		const body = "const evil = '</script><img onerror=1>'"
		const rendered = await renderMarkdown(`# T\n\n\`\`\`playground ts\n${body}\n\`\`\`\n`, {
			path: 'index.md',
		})
		const carrier = /class="doc-playground-source">([\s\S]*?)<\/script>/.exec(rendered.html)
		assert.ok(carrier, 'the carrier is still one element')
		// Escaped, so nothing in the body is markup — and the one sequence that
		// would end the element even unhighlighted is neutralised on top.
		assert.ok(!carrier[1]!.includes('</script'))
		assert.ok(!carrier[1]!.includes('<img'))
		// What the host gets back is the fence's text, once unescaped.
		assert.equal(unescapeHtml(carrier[1]!), body)
	})

	test('a fence carries both themes as CSS variables; an unknown language stays plain', async () => {
		const highlighter = await createDocsHighlighter(['ts'])
		try {
			const rendered = await renderMarkdown(
				'# T\n\n```ts\nconst x = 1\n```\n\n```nosuchlang\nraw & <text>\n```\n',
				{ path: 'index.md', highlight: (code, lang) => highlighter.render(code, lang) },
			)
			assert.match(rendered.html, /--shiki-light:/)
			assert.match(rendered.html, /--shiki-dark:/)
			assert.match(rendered.html, /<pre><code>raw &amp; &lt;text&gt;<\/code><\/pre>/)
		} finally {
			highlighter.dispose()
		}
	})

	test('a table is wrapped for horizontal scrolling, its own markup untouched', async () => {
		const rendered = await renderMarkdown('# T\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n', {
			path: 'index.md',
		})
		assert.match(rendered.html, /<div class="doc-table">\s*<table>/)
		assert.match(rendered.html, /<\/table>\s*<\/div>/)
		// The table itself renders exactly as marked's own default would.
		assert.match(
			rendered.html,
			/<thead>\s*<tr>\s*<th>A<\/th>\s*<th>B<\/th>\s*<\/tr>\s*<\/thead>/,
		)
		assert.match(rendered.html, /<tbody><tr>\s*<td>1<\/td>\s*<td>2<\/td>\s*<\/tr>\s*<\/tbody>/)
	})
})

describe('compiling a docs site', () => {
	test('two sources compile into one reading order, and cross-link', async () => {
		await inTempDir(async (dir) => {
			const appDir = join(dir, 'app')
			await writeDoc(
				appDir,
				'pipelines.md',
				'# Pipelines\n\nWhat a pipeline is.\n\nThe shipped one is documented in ' +
					'[the catalog](sdk/pipelines/core_spec_chat-respond.md#steps).\n',
			)
			await writeDoc(appDir, 'sessions.md', '# Sessions\n\nA session holds messages.\n')

			const report = await compileDocs(
				baseOptions(dir, [
					{ id: 'app', group: 'Using Serene Pub', dir: appDir },
					{
						id: 'sdk',
						group: 'SDK',
						prefix: 'sdk',
						banner: 'Plugin modding is only available in 0.7 previews.',
						pages: [
							{
								path: 'index.md',
								markdown: '# Serene Pub core\n\nWhat core ships.\n',
							},
							{
								path: 'pipelines/core_spec_chat-respond.md',
								markdown:
									'# core:spec/chat-respond\n\nVersion 1.\n\n## Steps\n\nThe nodes.\n',
							},
						],
					},
				]),
			)

			assert.equal(report.pagesWritten, 4)
			assert.deepEqual(report.warnings, [])
			assert.deepEqual(report.manifest.nav, [
				{ group: 'Using Serene Pub', source: 'app', pages: ['pipelines', 'sessions'] },
				{
					group: 'SDK',
					source: 'sdk',
					pages: ['sdk/index', 'sdk/pipelines/core_spec_chat-respond'],
				},
			])

			// The cross-repo link lands on the prefixed slug, anchor and all.
			const pipelines = await readPage(dir, 'pipelines')
			assert.match(pipelines, /href="\/docs\/sdk\/pipelines\/core_spec_chat-respond#steps"/)

			// A nested slug is a nested file.
			const respond = await readPage(dir, 'sdk/pipelines/core_spec_chat-respond')
			assert.match(respond, /<h2 id="steps">Steps<\/h2>/)

			const manifest = await readManifest(dir)
			assert.equal(manifest.version, '0.6.0-test')
			assert.equal(manifest.linkBase, '/docs')
			assert.equal(manifest.pages['sdk/index'].source, 'sdk')
			assert.equal(manifest.pages['sdk/index'].order, 0)
			assert.equal(manifest.pages['sessions'].order, 1)
			assert.equal(manifest.pages['pipelines'].title, 'Pipelines')
			assert.equal(manifest.pages['pipelines'].description, 'What a pipeline is.')
			assert.ok(manifest.pages['pipelines'].bytes > 0)
			assert.deepEqual(manifest.sources['sdk'], {
				group: 'SDK',
				banner: 'Plugin modding is only available in 0.7 previews.',
			})
		})
	})

	test('a banner is prepended to its own source’s pages and to nobody else’s', async () => {
		await inTempDir(async (dir) => {
			const appDir = join(dir, 'app')
			await writeDoc(appDir, 'sessions.md', '# Sessions\n\nA session holds messages.\n')

			await compileDocs(
				baseOptions(dir, [
					{ id: 'app', group: 'Using Serene Pub', dir: appDir },
					{
						id: 'sdk',
						group: 'SDK',
						prefix: 'sdk',
						banner: 'Plugin modding is only available in 0.7 previews.',
						pages: [{ path: 'index.md', markdown: '# Core\n\nWhat core ships.\n' }],
					},
				]),
			)

			const sdkIndex = await readPage(dir, 'sdk/index')
			assert.ok(
				sdkIndex.startsWith(
					'<aside class="doc-banner" role="note">Plugin modding is only available in 0.7 previews.</aside>',
				),
			)
			const sessions = await readPage(dir, 'sessions')
			assert.ok(!sessions.includes('doc-banner'))
		})
	})

	test('`order` is the reading order, and a page missing from it warns', async () => {
		await inTempDir(async (dir) => {
			const appDir = join(dir, 'app')
			await writeDoc(appDir, 'alpha.md', '# Alpha\n\nFirst.\n')
			await writeDoc(appDir, 'beta.md', '# Beta\n\nSecond.\n')
			await writeDoc(appDir, 'gamma.md', '# Gamma\n\nThird.\n')

			const report = await compileDocs(
				baseOptions(dir, [
					{
						id: 'app',
						group: 'Using Serene Pub',
						dir: appDir,
						order: ['gamma', 'alpha'],
					},
				]),
			)

			assert.deepEqual(report.manifest.nav[0].pages, ['gamma', 'alpha', 'beta'])
			assert.equal(report.manifest.pages['gamma'].order, 0)
			assert.equal(report.manifest.pages['beta'].order, 2)
			assert.equal(report.warnings.length, 1)
			assert.match(report.warnings[0], /`beta`/)
			assert.match(report.warnings[0], /`order`/)
			// A missing slug is a warning, never a failure: the site still builds.
			assert.equal(report.pagesWritten, 3)
		})
	})

	test('a grouped `order` fills several nav groups from one source, in order', async () => {
		await inTempDir(async (dir) => {
			const appDir = join(dir, 'app')
			for (const slug of ['alpha', 'beta', 'gamma', 'delta', 'omega'])
				await writeDoc(appDir, `${slug}.md`, `# ${slug}\n\nA page.\n`)

			const report = await compileDocs(
				baseOptions(dir, [
					{
						id: 'app',
						group: 'Using Serene Pub',
						dir: appDir,
						order: [
							{ group: 'Start here', pages: ['gamma', 'alpha'] },
							{ group: 'Not written yet', pages: ['nope'] },
							{ group: 'Guides', pages: ['delta', 'alpha'] },
						],
					},
					{
						id: 'sdk',
						group: 'SDK',
						prefix: 'sdk',
						pages: [{ path: 'index.md', markdown: '# Core\n\nWhat core ships.\n' }],
					},
				]),
			)

			// Declared groups in order, the empty one dropped, then the trailing
			// catch-all under the source's own `group` — then the next source.
			assert.deepEqual(report.manifest.nav, [
				{ group: 'Start here', source: 'app', pages: ['gamma', 'alpha'] },
				{ group: 'Guides', source: 'app', pages: ['delta'] },
				{ group: 'Using Serene Pub', source: 'app', pages: ['beta', 'omega'] },
				{ group: 'SDK', source: 'sdk', pages: ['sdk/index'] },
			])
			// `order` on a page is still its position within its SOURCE.
			assert.equal(report.manifest.pages['gamma'].order, 0)
			assert.equal(report.manifest.pages['delta'].order, 2)
			assert.equal(report.manifest.pages['omega'].order, 4)
			assert.deepEqual(report.manifest.sources['app'], { group: 'Using Serene Pub' })

			assert.equal(report.warnings.length, 4)
			assert.match(report.warnings[0], /`nope`, which has no page/)
			assert.match(report.warnings[1], /`alpha` more than once/)
			assert.match(report.warnings[2], /`beta`.*missing from `order`/)
			assert.match(report.warnings[3], /`omega`.*missing from `order`/)
		})
	})

	test('a grouped `order` appends unlisted pages to a declared group named like the source', async () => {
		await inTempDir(async (dir) => {
			const appDir = join(dir, 'app')
			for (const slug of ['alpha', 'beta', 'gamma'])
				await writeDoc(appDir, `${slug}.md`, `# ${slug}\n\nA page.\n`)

			const report = await compileDocs(
				baseOptions(dir, [
					{
						id: 'app',
						group: 'Reference',
						dir: appDir,
						order: [
							{ group: 'Reference', pages: ['gamma'] },
							{ group: 'Guides', pages: ['alpha'] },
						],
					},
				]),
			)
			assert.deepEqual(report.manifest.nav, [
				{ group: 'Reference', source: 'app', pages: ['gamma', 'beta'] },
				{ group: 'Guides', source: 'app', pages: ['alpha'] },
			])
		})
	})

	test('a grouped `order` refuses a duplicate group name or a mix of slugs and groups', async () => {
		await inTempDir(async (dir) => {
			const appDir = join(dir, 'app')
			await writeDoc(appDir, 'alpha.md', '# Alpha\n\nFirst.\n')

			await assert.rejects(
				compileDocs(
					baseOptions(dir, [
						{
							id: 'app',
							group: 'Using Serene Pub',
							dir: appDir,
							order: [
								{ group: 'Guides', pages: ['alpha'] },
								{ group: 'Guides', pages: [] },
							],
						},
					]),
				),
				/declares the group `Guides` twice/,
			)
			await assert.rejects(
				compileDocs(
					baseOptions(dir, [
						{
							id: 'app',
							group: 'Using Serene Pub',
							dir: appDir,
							order: ['alpha', { group: 'Guides', pages: [] }] as never,
						},
					]),
				),
				/mixes slugs and groups/,
			)
		})
	})

	test('search.json is one entry per heading, with previews capped at 180 chars and search text at 1200', async () => {
		await inTempDir(async (dir) => {
			const appDir = join(dir, 'app')
			const long = 'word '.repeat(120).trim()
			await writeDoc(
				appDir,
				'sessions.md',
				`# Sessions\n\nIntro line.\n\n## Long section\n\n${long}\n\n## Short\n\nTiny.\n`,
			)

			await compileDocs(baseOptions(dir, [{ id: 'app', group: 'App', dir: appDir }]))

			const search = await readSearch(dir)
			assert.deepEqual(
				search.map((entry) => entry.anchor),
				['sessions', 'long-section', 'short'],
			)
			assert.deepEqual(search[0], {
				slug: 'sessions',
				anchor: 'sessions',
				title: 'Sessions',
				depth: 1,
				preview: 'Intro line.',
				text: 'Intro line.',
			})
			for (const entry of search) assert.ok(entry.preview.length <= 180, entry.preview)
			// The search text is the same body, longer: the long section keeps
			// all 599 characters the 180-char preview cut.
			for (const entry of search) assert.ok(entry.text.length <= 1200, entry.text)
			assert.equal(search[1].text, long)
			// Cut at a word boundary, not mid-word: what's left (minus the
			// ellipsis) is a clean, unbroken prefix of the source text.
			const longPreview = search[1].preview
			assert.ok(longPreview.endsWith('…'), longPreview)
			assert.ok(long.startsWith(longPreview.slice(0, -1)), longPreview)
		})
	})

	test('a long description is cut at a word boundary, not mid-word', async () => {
		await inTempDir(async (dir) => {
			const appDir = join(dir, 'app')
			const para =
				'This paragraph rambles on through turn order, regeneration, branching ' +
				'timelines, and quite a bit more filler text so that it comfortably runs ' +
				'past the two hundred character description limit the compiler enforces.'
			assert.ok(para.length > 200)
			await writeDoc(appDir, 'sessions.md', `# Sessions\n\n${para}\n`)

			await compileDocs(baseOptions(dir, [{ id: 'app', group: 'App', dir: appDir }]))
			const manifest = await readManifest(dir)
			const description = manifest.pages['sessions'].description

			assert.ok(description.length <= 200, description)
			assert.ok(description.endsWith('…'), description)
			// No dangling space or punctuation was left just before the ellipsis.
			assert.ok(!/[\s,;:—-]…$/.test(description), description)
			// What's left (minus the ellipsis) is an unbroken prefix of the
			// source paragraph — the cut landed on a word boundary, never mid-word.
			assert.ok(para.startsWith(description.slice(0, -1)), description)
		})
	})
})

describe('writing the docs-dist', () => {
	test('a page dropped from the source is pruned on the next compile', async () => {
		await inTempDir(async (dir) => {
			const appDir = join(dir, 'app')
			await writeDoc(appDir, 'sessions.md', '# Sessions\n\nA session holds messages.\n')
			await writeDoc(appDir, 'nested/aside.md', '# Aside\n\nA nested page.\n')

			const options = () => baseOptions(dir, [{ id: 'app', group: 'App', dir: appDir }])
			await compileDocs(options())
			assert.equal(await exists(join(out(dir), 'pages', 'nested', 'aside.html')), true)

			await rm(join(appDir, 'nested'), { recursive: true, force: true })
			const second = await compileDocs(options())

			assert.equal(second.pagesWritten, 1)
			assert.deepEqual(Object.keys(second.manifest.pages), ['sessions'])
			// A page the manifest no longer names must not still be servable…
			assert.equal(await exists(join(out(dir), 'pages', 'nested', 'aside.html')), false)
			// …nor the directory that existed only to hold it.
			assert.equal(await exists(join(out(dir), 'pages', 'nested')), false)
			// The page that stayed was overwritten in place, never removed.
			assert.match(await readPage(dir, 'sessions'), /A session holds messages/)
		})
	})

	test('prune reaches into pages/ and the assets dir, and stops at the root of out/', async () => {
		await inTempDir(async (dir) => {
			const appDir = join(dir, 'app')
			await writeDoc(appDir, 'sessions.md', '# Sessions\n\nA session holds messages.\n')
			const options = () => baseOptions(dir, [{ id: 'app', group: 'App', dir: appDir }])
			await compileDocs(options())

			await writeFile(join(out(dir), 'pages', 'stowaway.html'), 'not mine', 'utf8')
			await writeFile(join(assetsOut(dir), 'deadbeef.webp'), 'not mine', 'utf8')
			await writeFile(join(out(dir), '.gitignore'), '*\n', 'utf8')

			await compileDocs(options())

			assert.equal(await exists(join(out(dir), 'pages', 'stowaway.html')), false)
			assert.equal(await exists(join(assetsOut(dir), 'deadbeef.webp')), false)
			// `out/` itself belongs to whoever consumes the docs-dist. Emptying
			// it is how a consumer's own file disappeared on every build.
			assert.equal(await readFile(join(out(dir), '.gitignore'), 'utf8'), '*\n')
		})
	})

	test('out, out/pages and the assets dir keep their inode across two compiles', async () => {
		await inTempDir(async (dir) => {
			const appDir = join(dir, 'app')
			await writePng(join(dir, 'shots', 'box.png'), 40, 20)
			await writeDoc(appDir, 'sessions.md', '# Sessions\n\n![A red box](../shots/box.png)\n')
			const options = () => baseOptions(dir, [{ id: 'app', group: 'App', dir: appDir }])

			await compileDocs(options())
			const dirs = [out(dir), join(out(dir), 'pages'), assetsOut(dir)]
			const before = await Promise.all(dirs.map(inode))

			await compileDocs(options())
			const after = await Promise.all(dirs.map(inode))

			// Not a filesystem curiosity. A watcher holds its watch on the
			// inode, so `rm -rf` + `mkdir` hands the same path back with a new
			// one and the watcher is left staring at a directory nothing will
			// ever write to again — which is how the dev server stopped seeing
			// its own docs-dist mid-session.
			assert.deepEqual(after, before)
		})
	})
})

describe('what stops a docs compile', () => {
	test('a link to a page no source has is named and fails the compile', async () => {
		await inTempDir(async (dir) => {
			const appDir = join(dir, 'app')
			await writeDoc(
				appDir,
				'sessions.md',
				'# Sessions\n\nSee [the missing page](./nope.md).\n',
			)

			await assert.rejects(
				compileDocs(baseOptions(dir, [{ id: 'app', group: 'App', dir: appDir }])),
				(error: Error) => {
					assert.match(error.message, /Docs compile failed/)
					assert.match(error.message, /`\.\/nope\.md`/)
					assert.match(error.message, /`sessions`/)
					assert.match(error.message, /not in any source/)
					return true
				},
			)
		})
	})

	test('a link to a heading the target page does not have is named and fails', async () => {
		await inTempDir(async (dir) => {
			const appDir = join(dir, 'app')
			await writeDoc(appDir, 'characters.md', '# Characters\n\n## Creator wizard\n\nSteps.\n')
			await writeDoc(
				appDir,
				'sessions.md',
				'# Sessions\n\nSee [the wizard](./characters.md#creator-wizrd).\n',
			)

			await assert.rejects(
				compileDocs(baseOptions(dir, [{ id: 'app', group: 'App', dir: appDir }])),
				(error: Error) => {
					assert.match(error.message, /creator-wizrd/)
					assert.match(error.message, /has no heading id/)
					return true
				},
			)
			// The anchor that DOES exist is the one the app's slugify produces.
			await compileDocs(
				baseOptions(dir, [
					{
						id: 'app',
						group: 'App',
						pages: [
							{
								path: 'characters.md',
								markdown: '# Characters\n\n## Creator wizard\n\nSteps.\n',
							},
							{
								path: 'sessions.md',
								markdown:
									'# Sessions\n\nSee [it](./characters.md#creator-wizard).\n',
							},
						],
					},
				]),
			)
		})
	})

	test('a bare `#anchor` is checked against the page that wrote it, and lands', async () => {
		await inTempDir(async (dir) => {
			const appDir = join(dir, 'app')
			await writeDoc(
				appDir,
				'setup.md',
				'# Setup\n\nJump to [the exception](#serene_pub_data_dir-is-the-one-exception).\n\n' +
					'## `SERENE_PUB_DATA_DIR` is the one exception\n\nIt is.\n',
			)

			await compileDocs(baseOptions(dir, [{ id: 'app', group: 'App', dir: appDir }]))

			const html = await readPage(dir, 'setup')
			// Checked, but never rewritten: a same-page anchor is already the
			// href a reader needs.
			assert.match(html, /href="#serene_pub_data_dir-is-the-one-exception"/)
			assert.match(html, /<h2 id="serene_pub_data_dir-is-the-one-exception">/)
		})
	})

	test('a bare `#anchor` no heading on the page has is named and fails', async () => {
		await inTempDir(async (dir) => {
			const appDir = join(dir, 'app')
			await writeDoc(
				appDir,
				'nested/setup.md',
				'# Setup\n\nJump to [the old place](#the-old-title).\n\n## The new title\n\nBody.\n',
			)

			await assert.rejects(
				compileDocs(
					baseOptions(dir, [{ id: 'app', group: 'App', prefix: 'sdk', dir: appDir }]),
				),
				(error: Error) => {
					// The page is named twice on purpose: the one that wrote the
					// link IS the one the anchor had to land on.
					assert.match(
						error.message,
						/`sdk\/nested\/setup` links `#the-old-title` — page `sdk\/nested\/setup` has no heading id `the-old-title`\./,
					)
					return true
				},
			)
		})
	})

	test('a link inside a fenced block is not a link, so it cannot fail the compile', async () => {
		await inTempDir(async (dir) => {
			const markdown =
				'# Sessions\n\n```md\n[nope](./gone.md#missing) and [also nope](#not-a-heading)\n```\n'
			const appDir = join(dir, 'app')
			await writeDoc(appDir, 'sessions.md', markdown)

			// Nothing to check: marked never tokenises inside a fence, so
			// neither href is ever collected.
			const rendered = await renderMarkdown(markdown, { path: 'sessions.md' })
			assert.deepEqual(rendered.links, [])

			const report = await compileDocs(
				baseOptions(dir, [{ id: 'app', group: 'App', dir: appDir }]),
			)
			assert.equal(report.pagesWritten, 1)
		})
	})

	test('a referenced image that is not on disk is named and fails', async () => {
		await inTempDir(async (dir) => {
			const appDir = join(dir, 'app')
			await writeDoc(appDir, 'sessions.md', '# Sessions\n\n![Missing](../shots/gone.png)\n')

			await assert.rejects(
				compileDocs(baseOptions(dir, [{ id: 'app', group: 'App', dir: appDir }])),
				(error: Error) => {
					assert.match(error.message, /gone\.png/)
					assert.match(error.message, /does not exist/)
					return true
				},
			)
		})
	})
})

describe('images', () => {
	test('a PNG is downscaled, encoded to webp, hashed and wrapped in a figure', async () => {
		await inTempDir(async (dir) => {
			const appDir = join(dir, 'app')
			await writePng(join(dir, 'shots', 'box.png'), 600, 300)
			await writeDoc(
				appDir,
				'sessions.md',
				'# Sessions\n\n![A red box](../shots/box.png){w=300}\n\n' +
					'And again, unsized: ![A red box](../shots/box.png)\n',
			)

			const report = await compileDocs({
				...baseOptions(dir, [{ id: 'app', group: 'App', dir: appDir }]),
				image: { maxWidth: 200, quality: 70 },
			})

			// Same file, converted once: the mtime+size cache is what makes a
			// screenshot shared across six pages cost one decode.
			assert.equal(report.assetsWritten, 1)
			assert.equal(report.manifest.assets.count, 1)
			assert.ok(report.manifest.assets.bytes > 0)

			const html = await readPage(dir, 'sessions')
			const figure = html.match(
				/<figure class="doc-figure" style="max-width:300px"><img src="(\/docs\/assets\/([0-9a-f]{16}\.webp))" alt="A red box" width="200" height="100" loading="lazy" decoding="async"><figcaption>A red box<\/figcaption><\/figure>/,
			)
			assert.ok(figure, html)

			// The second reference is inline, so it is an <img> with no figure
			// wrapper around it — a <figure> inside a <p> is not HTML.
			assert.match(
				html,
				/<p>And again, unsized: <img src="\/docs\/assets\/[0-9a-f]{16}\.webp"/,
			)

			// The hash in the src is a file that was actually written.
			const bytes = await readFile(join(assetsOut(dir), figure![2]))
			assert.equal(bytes.subarray(0, 4).toString('latin1'), 'RIFF')
			assert.equal(bytes.subarray(8, 12).toString('latin1'), 'WEBP')
			assert.ok(bytes.byteLength < 600 * 300 * 4)
		})
	})

	test('an empty caption means no figcaption and an empty alt', async () => {
		await inTempDir(async (dir) => {
			const appDir = join(dir, 'app')
			await writePng(join(dir, 'shots', 'box.png'), 40, 20)
			await writeDoc(appDir, 'sessions.md', '# Sessions\n\n![](../shots/box.png)\n')

			await compileDocs(baseOptions(dir, [{ id: 'app', group: 'App', dir: appDir }]))
			const html = await readPage(dir, 'sessions')
			assert.match(html, /alt=""/)
			assert.ok(!html.includes('<figcaption>'))
			// Under maxWidth, so it keeps its own size.
			assert.match(html, /width="40" height="20"/)
		})
	})

	test('going over the asset budget fails the compile and says by how much', async () => {
		await inTempDir(async (dir) => {
			const appDir = join(dir, 'app')
			await writePng(join(dir, 'shots', 'box.png'), 600, 300)
			await writeDoc(appDir, 'sessions.md', '# Sessions\n\n![A red box](../shots/box.png)\n')

			await assert.rejects(
				compileDocs({
					...baseOptions(dir, [{ id: 'app', group: 'App', dir: appDir }]),
					assetBudgetBytes: 16,
				}),
				(error: Error) => {
					assert.match(error.message, /over the 16 byte budget/)
					return true
				},
			)
		})
	})
})

describe('pipeline graphs', () => {
	/** Four steps in a line — an inlet, a read, a call, a write. */
	const demoGraph = (id: string, title: string): DocsGraph => ({
		id,
		title,
		nodes: [
			{
				key: 'input',
				kind: 'inlet',
				label: 'input',
				sublabel: 'core:inlet/user-message',
			},
			{
				key: 'gather',
				kind: 'query',
				label: 'gather',
				sublabel: 'core:query/session-history',
			},
			{
				key: 'respond',
				kind: 'oracle',
				label: 'respond',
				sublabel: 'core:oracle/chat',
			},
			{
				key: 'write',
				kind: 'outlet',
				label: 'write',
				sublabel: 'core:outlet/create-message',
			},
		],
		edges: [
			{ from: 'input', to: 'gather' },
			{ from: 'gather', to: 'respond' },
			{ from: 'respond', to: 'write' },
		],
	})

	const fencePage = (...ids: string[]) => ({
		path: 'pipelines/demo.md',
		markdown:
			'# Demo\n\nThe map:\n\n' + ids.map((id) => '```pipeline ' + id + '\n```\n').join('\n'),
	})

	test('a fence becomes one figure per node, edge and kind', async () => {
		await inTempDir(async (dir) => {
			await compileDocs({
				...baseOptions(dir, [
					{
						id: 'sdk',
						group: 'SDK',
						prefix: 'sdk',
						pages: [fencePage('core:spec/demo')],
					},
				]),
				resolvers: {
					pipeline: (id) =>
						id === 'core:spec/demo' ? demoGraph(id, 'core:spec/demo') : null,
				},
			})

			const html = await readPage(dir, 'sdk/pipelines/demo')
			assert.equal(html.match(/class="doc-graph-node /g)?.length, 4)
			assert.equal(html.match(/<path class="doc-graph-edge"/g)?.length, 3)

			// The accessible name, and the caption under the drawing.
			assert.match(html, /<svg role="img" aria-labelledby="core-spec-demo-title"/)
			assert.match(html, /<title id="core-spec-demo-title">core:spec\/demo<\/title>/)
			assert.match(html, /<figcaption>core:spec\/demo<\/figcaption>/)

			// The kind is the styling surface, so every one of them reaches
			// the page as its own class.
			for (const kind of ['inlet', 'query', 'oracle', 'outlet'])
				assert.match(html, new RegExp(`doc-graph-node doc-graph-node-${kind}"`))
			assert.match(html, /<text class="doc-graph-sublabel"/)

			// Nothing in the drawing decides a colour: the host does.
			const figure = html.slice(html.indexOf('<figure class="doc-graph">'))
			assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(figure), figure.slice(0, 400))
			assert.match(figure, /stroke="currentColor"/)
		})
	})

	test('a fence no resolver answers names the page and the id, and fails', async () => {
		await inTempDir(async (dir) => {
			const options = baseOptions(dir, [
				{ id: 'sdk', group: 'SDK', prefix: 'sdk', pages: [fencePage('core:spec/nope')] },
			])

			await assert.rejects(
				compileDocs({ ...options, resolvers: { pipeline: () => null } }),
				(error: Error) => {
					assert.match(error.message, /Docs compile failed/)
					assert.match(error.message, /`sdk\/pipelines\/demo`/)
					assert.match(error.message, /embeds pipeline `core:spec\/nope`/)
					assert.match(error.message, /no resolver \/ unknown id/)
					return true
				},
			)

			// No resolver at all is the same fact, not a quietly blank page.
			await assert.rejects(compileDocs(options), (error: Error) => {
				assert.match(error.message, /embeds pipeline `core:spec\/nope`/)
				return true
			})
		})
	})

	test('two graphs on one page define their own marker and title ids', async () => {
		await inTempDir(async (dir) => {
			await compileDocs({
				...baseOptions(dir, [
					{
						id: 'sdk',
						group: 'SDK',
						prefix: 'sdk',
						pages: [fencePage('core:spec/demo', 'core:spec/other')],
					},
				]),
				resolvers: { pipeline: (id) => demoGraph(id, id) },
			})

			const html = await readPage(dir, 'sdk/pipelines/demo')
			assert.equal(html.match(/<figure class="doc-graph">/g)?.length, 2)
			assert.match(html, /<marker id="core-spec-demo-arrow"/)
			assert.match(html, /<marker id="core-spec-other-arrow"/)
			assert.match(html, /marker-end="url\(#core-spec-demo-arrow\)"/)
			assert.match(html, /marker-end="url\(#core-spec-other-arrow\)"/)
			assert.match(html, /aria-labelledby="core-spec-other-title"/)
		})
	})

	test('a label too wide for its card is cut, and keeps the whole of itself in a title', async () => {
		const svg = await renderDocsGraph({
			id: 'core:spec/demo',
			nodes: [
				{
					key: 'gather.relationshipsPerspectives.read',
					kind: 'query',
					label: 'gather.relationshipsPerspectives.read',
					sublabel: 'core:query/relationships-perspectives',
				},
			],
			edges: [],
		})

		assert.match(svg, /<title>gather\.relationshipsPerspectives\.read — /)
		assert.match(svg, />gather\.relationshipsPerspec…</)
		// No title means no `title`: the caption falls back to the id.
		assert.match(svg, /<figcaption>core:spec\/demo<\/figcaption>/)
	})
})

describe('loading a generated markdown tree', () => {
	test('every .md under the directory comes back, nested paths and all', async () => {
		await inTempDir(async (dir) => {
			const api = join(dir, 'api')
			await writeDoc(api, 'index.md', '# API\n')
			await writeDoc(api, 'sdk/src/document.md', '# document\n')
			await writeDoc(api, 'sdk/src.md', '# src\n')
			await writeDoc(api, 'notes.txt', 'not markdown')

			// Depth-first over sorted directory entries, exactly as the
			// compiler's own `dir` sources walk: `src/` is recursed where its
			// name sorts, which is before the sibling file `src.md`.
			const pages = await loadMarkdownDir(api)
			assert.deepEqual(
				pages.map((p) => p.path),
				['index.md', 'sdk/src/document.md', 'sdk/src.md'],
			)
			assert.equal(pages[2]!.markdown, '# src\n')
		})
	})

	test('a prefix is prepended to every path, and the pages compile as a source', async () => {
		await inTempDir(async (dir) => {
			const api = join(dir, 'api')
			await writeDoc(api, 'index.md', '# API\n\nSee [document](sdk/document.md).\n')
			await writeDoc(api, 'sdk/document.md', '# document\n')

			const pages = await loadMarkdownDir(api, { prefix: 'api' })
			assert.deepEqual(
				pages.map((p) => p.path),
				['api/index.md', 'api/sdk/document.md'],
			)

			const report = await compileDocs(
				baseOptions(dir, [{ id: 'sdk', group: 'SDK', prefix: 'sdk', pages }]),
			)
			assert.deepEqual(report.manifest.nav[0]!.pages, [
				'sdk/api/index',
				'sdk/api/sdk/document',
			])
			assert.match(
				await readPage(dir, 'sdk/api/index'),
				/href="\/docs\/sdk\/api\/sdk\/document"/,
			)
		})
	})

	test('a directory that was never generated throws rather than compiling to nothing', async () => {
		await inTempDir(async (dir) => {
			await assert.rejects(loadMarkdownDir(join(dir, 'never-built')))
		})
	})
})
