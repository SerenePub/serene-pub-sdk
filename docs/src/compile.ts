/**
 * `compileDocs` — markdown from several places in, one reading order out.
 *
 * The compile is a two-pass job and has to be: a link's anchor cannot be
 * checked until every page has been rendered and every heading id is known.
 * So nothing is written until everything has been rendered and proved. A
 * compile that fails leaves the previous output alone rather than a half-empty
 * directory that a server would happily serve.
 *
 * Every broken link, missing image and unresolvable anchor is collected and
 * reported TOGETHER. Failing on the first one turns a docs pass into a dozen
 * rebuilds.
 *
 * The write itself is write-then-prune, never empty-then-write. `out` used to
 * be `rm -rf`'d and recreated, which is only invisible if nothing is reading
 * the tree — and something is: the app's dev server watches `out`, and a reader
 * landing between the `rm` and the writes saw a manifest naming pages that were
 * not on disk ("that documentation page is not in this build"). Two compiles
 * overlapping made it worse than a flicker, one `rmdir`-ing what the other was
 * still writing into: `ENOTEMPTY`. So `out`, `out/pages` and `assetsOut` are
 * never removed, every file is overwritten in place, whatever this compile did
 * not write is pruned afterwards, and `manifest.json` and `search.json` land
 * last — after every page and asset they name is already readable.
 */
import { mkdir, readdir, readFile, rm, rmdir, stat, writeFile } from 'node:fs/promises'
import { dirname, join, resolve, sep } from 'node:path'
import { AssetConverter, type ConvertedAsset } from './images.js'
import { createDocsHighlighter } from './highlight.js'
import { renderDocsGraph } from './graph.js'
import { navOrder, type SourcePage } from './manifest.js'
import { docTitle, renderMarkdown, type DocHeading } from './dialect.js'
import {
	DEFAULT_ASSET_BUDGET_BYTES,
	DEFAULT_DOC_LANGUAGES,
	DEFAULT_LINK_BASE,
	DEFAULT_MAX_WIDTH,
	DEFAULT_QUALITY,
	type CompileDocsOptions,
	type CompileDocsReport,
	type DocsManifest,
	type DocsPageMeta,
	type DocsSearchEntry,
	type DocsSource,
} from './types.js'

/** An href the compiler has no business converting: offsite, or already rooted. */
const OFFSITE_IMAGE = /^(?:[a-z][a-z0-9+.-]*:|\/\/|\/|data:)/i

interface RenderedPage extends SourcePage {
	html: string
	headings: DocHeading[]
	previews: Record<string, string>
	links: { href: string; slug: string; anchor: string }[]
	/** The first paragraph after the H1, as the renderer already computed it. */
	description: string
}

export async function compileDocs(opts: CompileDocsOptions): Promise<CompileDocsReport> {
	const linkBase = (opts.linkBase ?? DEFAULT_LINK_BASE).replace(/\/+$/, '')
	const budgetBytes = opts.assetBudgetBytes ?? DEFAULT_ASSET_BUDGET_BYTES
	const maxWidth = opts.image?.maxWidth ?? DEFAULT_MAX_WIDTH
	const quality = opts.image?.quality ?? DEFAULT_QUALITY

	const offenders: string[] = []
	const warnings: string[] = []

	// ── 1. Gather every page, and settle the reading order per source. ──
	const seenSourceIds = new Set<string>()
	const bySource: { source: DocsSource; pages: SourcePage[] }[] = []
	for (const source of opts.sources) {
		if (seenSourceIds.has(source.id))
			throw new Error(`Two docs sources share the id \`${source.id}\`.`)
		seenSourceIds.add(source.id)
		bySource.push({ source, pages: await collectPages(source) })
	}

	const ordered: SourcePage[] = []
	const navGroups: DocsManifest['nav'] = []
	const pagesBySlug = new Map<string, SourcePage>()
	for (const { source, pages } of bySource) {
		const settled = navOrder(source, pages)
		warnings.push(...settled.warnings)
		for (const page of settled.ordered) {
			const clash = pagesBySlug.get(page.slug)
			if (clash) {
				offenders.push(
					`two pages compile to the slug \`${page.slug}\`: ` +
						`\`${clash.source.id}:${clash.path}\` and \`${source.id}:${page.path}\`.`,
				)
				continue
			}
			pagesBySlug.set(page.slug, page)
			ordered.push(page)
		}
		navGroups.push({
			group: source.group,
			source: source.id,
			pages: settled.ordered.map((page) => page.slug),
		})
	}

	// ── 2. Render everything, converting images as they are met. ──
	const converter = new AssetConverter({ maxWidth, quality })
	const assets = new Map<string, Buffer>()
	const highlighter = await createDocsHighlighter(opts.languages ?? DEFAULT_DOC_LANGUAGES)

	const rendered: RenderedPage[] = []
	try {
		for (const page of ordered) {
			const result = await renderMarkdown(page.markdown, {
				path: page.path,
				prefix: page.source.prefix,
				linkBase,
				banner: page.source.banner,
				assetsBase: opts.assetsBase,
				highlight: (code, lang) => highlighter.render(code, lang),
				resolvePipeline: async (id) => {
					const graph = opts.resolvers?.pipeline?.(id) ?? null
					if (!graph) {
						offenders.push(
							`\`${page.slug}\` embeds pipeline \`${id}\` — no resolver / ` +
								`unknown id.`,
						)
						return null
					}
					return await renderDocsGraph(graph)
				},
				resolveImage: async (href) => {
					const asset = await convertImage(page, href, converter, offenders)
					if (asset) assets.set(asset.file, asset.bytes)
					return asset
						? { file: asset.file, width: asset.width, height: asset.height }
						: null
				},
			})
			rendered.push({ ...page, ...result })
		}
	} finally {
		highlighter.dispose()
	}

	// ── 3. Prove every cross-page link lands, before anything is written. ──
	const headingIds = new Map<string, Set<string>>()
	for (const page of rendered)
		headingIds.set(page.slug, new Set(page.headings.map((heading) => heading.id)))

	for (const page of rendered) {
		for (const link of page.links) {
			const target = headingIds.get(link.slug)
			if (!target) {
				offenders.push(
					`\`${page.slug}\` links \`${link.href}\` — slug \`${link.slug}\` is not in any source.`,
				)
				continue
			}
			if (link.anchor && !target.has(link.anchor)) {
				offenders.push(
					`\`${page.slug}\` links \`${link.href}\` — page \`${link.slug}\` has no ` +
						`heading id \`${link.anchor}\`.`,
				)
			}
		}
	}

	let assetBytes = 0
	for (const bytes of assets.values()) assetBytes += bytes.byteLength
	if (assetBytes > budgetBytes) {
		offenders.push(
			`converted assets are ${assetBytes} bytes, over the ${budgetBytes} byte budget ` +
				`(${assets.size} files).`,
		)
	}

	if (offenders.length) {
		throw new Error(
			`Docs compile failed — ${offenders.length} problem${offenders.length === 1 ? '' : 's'}:\n` +
				offenders.map((line) => `  • ${line}`).join('\n'),
		)
	}

	// ── 4. Write in place, then prune what this compile did not write. ──
	const pagesOut = join(opts.out, 'pages')
	await mkdir(pagesOut, { recursive: true })
	await mkdir(opts.assetsOut, { recursive: true })

	const writtenAssets = new Set<string>()
	for (const [file, bytes] of assets) {
		await writeFile(join(opts.assetsOut, file), bytes)
		writtenAssets.add(file)
	}

	const writtenPages = new Set<string>()
	const orderWithinSource = new Map<string, number>()
	const pageMeta: Record<string, DocsPageMeta> = {}
	const search: DocsSearchEntry[] = []

	for (const page of rendered) {
		const relative = page.slug.split('/').join(sep) + '.html'
		const target = join(pagesOut, relative)
		await mkdir(dirname(target), { recursive: true })
		const html = page.html
		await writeFile(target, html, 'utf8')
		writtenPages.add(relative)

		const position = orderWithinSource.get(page.source.id) ?? 0
		orderWithinSource.set(page.source.id, position + 1)

		pageMeta[page.slug] = {
			slug: page.slug,
			title: docTitle(page.markdown, page.slug),
			description: page.description,
			source: page.source.id,
			order: position,
			headings: page.headings,
			bytes: Buffer.byteLength(html, 'utf8'),
		}

		for (const heading of page.headings) {
			search.push({
				slug: page.slug,
				anchor: heading.id,
				title: heading.text,
				depth: heading.depth,
				preview: page.previews[heading.id] ?? '',
			})
		}
	}

	const manifest: DocsManifest = {
		version: opts.version,
		generatedAt: new Date().toISOString(),
		linkBase,
		sources: Object.fromEntries(
			opts.sources.map((source) => [
				source.id,
				{
					group: source.group,
					...(source.banner ? { banner: source.banner } : {}),
					...(source.repo ? { repo: source.repo } : {}),
				},
			]),
		),
		nav: navGroups,
		pages: pageMeta,
		assets: { count: assets.size, bytes: assetBytes, budgetBytes },
	}

	// Only ever below `pages/` and inside `assetsOut`: the rest of `out` is the
	// consumer's to own, and emptying it is how a stray `.gitignore` or an
	// editor's scratch file used to disappear on every build.
	await prune(pagesOut, writtenPages, { emptyDirs: true })
	await prune(opts.assetsOut, writtenAssets, { emptyDirs: false })

	// Last, deliberately: the manifest is the reader's index, and every page
	// and asset it names is on disk by the time it names them.
	await writeFile(join(opts.out, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8')
	await writeFile(join(opts.out, 'search.json'), JSON.stringify(search, null, 2), 'utf8')

	return { manifest, warnings, pagesWritten: rendered.length, assetsWritten: assets.size }
}

async function collectPages(source: DocsSource): Promise<SourcePage[]> {
	const made = (path: string, markdown: string, file?: string): SourcePage => {
		const bareSlug = path.replace(/\.md$/i, '')
		return {
			source,
			path,
			bareSlug,
			slug: source.prefix ? `${source.prefix}/${bareSlug}` : bareSlug,
			markdown,
			file,
		}
	}

	const pages: SourcePage[] = []
	if (source.pages) for (const page of source.pages) pages.push(made(page.path, page.markdown))

	if (source.dir) {
		const root = resolve(source.dir)
		for (const file of await markdownFilesIn(root)) {
			const path = file
				.slice(root.length + 1)
				.split(sep)
				.join('/')
			pages.push(made(path, await readFile(file, 'utf8'), file))
		}
	}

	if (!source.pages && !source.dir)
		throw new Error(`Docs source \`${source.id}\` has neither \`dir\` nor \`pages\`.`)
	return pages
}

async function markdownFilesIn(dir: string): Promise<string[]> {
	const found: string[] = []
	const entries = await readdir(dir, { withFileTypes: true })
	for (const entry of entries.sort((a, b) => (a.name < b.name ? -1 : 1))) {
		const full = join(dir, entry.name)
		if (entry.isDirectory()) found.push(...(await markdownFilesIn(full)))
		else if (entry.name.toLowerCase().endsWith('.md')) found.push(full)
	}
	return found
}

async function convertImage(
	page: SourcePage,
	href: string,
	converter: AssetConverter,
	offenders: string[],
): Promise<ConvertedAsset | null> {
	if (OFFSITE_IMAGE.test(href)) return null
	if (!page.file) {
		offenders.push(
			`\`${page.slug}\` references the image \`${href}\`, but its source has no \`dir\` — ` +
				`a rendered page cannot carry relative images.`,
		)
		return null
	}
	const absolute = resolve(dirname(page.file), href.split(/[?#]/)[0])
	try {
		await stat(absolute)
	} catch {
		offenders.push(
			`\`${page.slug}\` references the image \`${href}\` — ${absolute} does not exist.`,
		)
		return null
	}
	try {
		return await converter.convert(absolute)
	} catch (cause) {
		offenders.push(
			`\`${page.slug}\` references the image \`${href}\` — ${absolute} could not be ` +
				`converted: ${(cause as Error).message}`,
		)
		return null
	}
}

/**
 * Delete everything under `dir` that this compile did not write.
 *
 * `keep` holds paths relative to `dir`, separator-joined the way `join` builds
 * them. `dir` itself is never removed — that is the whole point; a consumer
 * watching it keeps watching the same directory across every compile.
 *
 * `emptyDirs` removes subdirectories left with nothing in them, which is only
 * wanted below `pages/`, where a directory exists solely because a nested slug
 * needed one. The assets directory is flat and shares its parent with whatever
 * else the consumer serves, so nothing there is rmdir'd.
 */
async function prune(
	dir: string,
	keep: Set<string>,
	{ emptyDirs }: { emptyDirs: boolean },
): Promise<void> {
	/** Returns whether `current` is empty once its extras are gone. */
	const walk = async (current: string, prefix: string): Promise<boolean> => {
		let entries
		try {
			entries = await readdir(current, { withFileTypes: true })
		} catch {
			return false
		}
		let kept = 0
		for (const entry of entries) {
			const full = join(current, entry.name)
			const relative = prefix ? prefix + sep + entry.name : entry.name
			if (entry.isDirectory()) {
				const empty = await walk(full, relative)
				if (empty && emptyDirs) {
					// force: a concurrent writer may have refilled it; leaving
					// a directory standing is never worth failing a compile.
					await rmdir(full).catch(() => {})
					continue
				}
				kept++
			} else if (keep.has(relative)) {
				kept++
			} else {
				await rm(full, { force: true })
			}
		}
		return kept === 0
	}
	await walk(dir, '')
}
