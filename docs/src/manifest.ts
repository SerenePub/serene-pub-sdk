/**
 * Reading order.
 *
 * A docs site's nav is an editorial decision, not an alphabetical accident —
 * which is why `order` is explicit and why a page missing from it is a WARNING
 * rather than a silent tail entry. The app learned this the expensive way:
 * `indexOf` returns -1 for an unlisted doc, so "android" and "troubleshooting"
 * sorted *ahead* of "getting-started" and that is what a new reader saw first.
 */
import type { DocsOrderGroup, DocsSource } from './types.js'

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

/** One settled nav group: a heading and its pages, in reading order. */
export interface SettledGroup {
	group: string
	pages: SourcePage[]
}

/** A flat `order` is one group headed by the source's own `group`. */
function orderGroups(source: DocsSource): DocsOrderGroup[] {
	const order = source.order ?? []
	if (order.every((entry): entry is string => typeof entry === 'string'))
		return [{ group: source.group, pages: order }]
	if (order.some((entry) => typeof entry === 'string'))
		throw new Error(
			`\`order\` for source \`${source.id}\` mixes slugs and groups — ` +
				`it is either a list of slugs or a list of groups.`,
		)
	const seen = new Set<string>()
	for (const { group } of order as DocsOrderGroup[]) {
		if (seen.has(group))
			throw new Error(
				`\`order\` for source \`${source.id}\` declares the group \`${group}\` twice.`,
			)
		seen.add(group)
	}
	return order as DocsOrderGroup[]
}

/**
 * Settle a source's reading order: its pages in order, and the nav groups
 * they fall into.
 *
 * A flat `order` (or none) gives one group headed `source.group`. A grouped
 * `order` gives one group per declared group, in declaration order; a group
 * none of whose pages exist is left out of the nav (each missing slug still
 * warns). Unlisted pages are appended alphabetically, with a warning, to the
 * group headed `source.group` — a declared one of that name, or a new
 * trailing one — so they land at the end and say so.
 */
export function navOrder(
	source: DocsSource,
	pages: SourcePage[],
): { ordered: SourcePage[]; groups: SettledGroup[]; warnings: string[] } {
	if (!source.order?.length) {
		const ordered = [...pages].sort(byBareSlug)
		return { ordered, groups: [{ group: source.group, pages: ordered }], warnings: [] }
	}

	const remaining = new Map(pages.map((page) => [page.bareSlug, page]))
	const listed = new Set<string>()
	const groups: SettledGroup[] = []
	const warnings: string[] = []

	for (const declared of orderGroups(source)) {
		const settled: SettledGroup = { group: declared.group, pages: [] }
		for (const slug of declared.pages) {
			if (listed.has(slug)) {
				warnings.push(
					`\`order\` for source \`${source.id}\` lists \`${slug}\` more than once; ` +
						`the first place wins.`,
				)
				continue
			}
			listed.add(slug)
			const page = remaining.get(slug)
			if (!page) {
				warnings.push(
					`\`order\` for source \`${source.id}\` lists \`${slug}\`, which has no page.`,
				)
				continue
			}
			remaining.delete(slug)
			settled.pages.push(page)
		}
		groups.push(settled)
	}

	const appended = [...remaining.values()].sort(byBareSlug)
	for (const page of appended) {
		warnings.push(
			`\`${page.bareSlug}\` (source \`${source.id}\`) is missing from \`order\` — ` +
				`appended alphabetically.`,
		)
	}
	if (appended.length) {
		const home = groups.find((g) => g.group === source.group)
		if (home) home.pages.push(...appended)
		else groups.push({ group: source.group, pages: appended })
	}

	const nonEmpty = groups.filter((g) => g.pages.length > 0)
	return { ordered: nonEmpty.flatMap((g) => g.pages), groups: nonEmpty, warnings }
}
