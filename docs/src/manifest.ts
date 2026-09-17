/**
 * Reading order.
 *
 * A docs site's nav is an editorial decision, not an alphabetical accident —
 * which is why `order` is explicit and why a page missing from it is a WARNING
 * rather than a silent tail entry. The app learned this the expensive way:
 * `indexOf` returns -1 for an unlisted doc, so "android" and "troubleshooting"
 * sorted *ahead* of "getting-started" and that is what a new reader saw first.
 */
import type { DocsSource } from './types.js'

export interface SourcePage {
	source: DocsSource
	/** Path inside the source, posix, e.g. 'pipelines/core_spec_respond.md'. */
	path: string
	/** Slug without the source's prefix — what `order` is written in. */
	bareSlug: string
	/** Full slug, prefix included. */
	slug: string
	markdown: string
	/** Absolute path on disk for a `dir` source; images resolve against its folder. */
	file?: string
}

const byBareSlug = (a: SourcePage, b: SourcePage) => (a.bareSlug < b.bareSlug ? -1 : 1)

export function navOrder(
	source: DocsSource,
	pages: SourcePage[],
): { ordered: SourcePage[]; warnings: string[] } {
	if (!source.order?.length) return { ordered: [...pages].sort(byBareSlug), warnings: [] }

	const remaining = new Map(pages.map((page) => [page.bareSlug, page]))
	const ordered: SourcePage[] = []
	const warnings: string[] = []

	for (const slug of source.order) {
		const page = remaining.get(slug)
		if (!page) {
			warnings.push(
				`\`order\` for source \`${source.id}\` lists \`${slug}\`, which has no page.`,
			)
			continue
		}
		remaining.delete(slug)
		ordered.push(page)
	}

	const appended = [...remaining.values()].sort(byBareSlug)
	for (const page of appended) {
		warnings.push(
			`\`${page.bareSlug}\` (source \`${source.id}\`) is missing from \`order\` — ` +
				`appended alphabetically.`,
		)
	}
	ordered.push(...appended)
	return { ordered, warnings }
}
