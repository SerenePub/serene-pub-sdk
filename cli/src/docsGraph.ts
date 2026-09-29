/**
 * The resolver the docs compiler asks for a pipeline's drawing.
 *
 * `specGraphOf` itself has moved to `@serene-pub/docs`: it is pure, and the
 * browser playground draws the document it just ran with it — which it cannot
 * do through this package, because this package is Node. It is re-exported
 * here because it was this module's export first and every caller names it.
 */
import type { AnnouncementDocument } from '@serene-pub/sdk'
import { specGraphOf, type DocsGraph } from '@serene-pub/docs'

/** @internal Re-exported from `@serene-pub/docs`, where it is declared (and tagged). */
export { specGraphOf }

/**
 * The resolver `compileDocs({ resolvers: { pipeline } })` wants, over one
 * package's announcement: an id it announces draws, anything else is null and
 * fails the compile naming the page that asked.
 *
 * The announcement is the source, and it is enough: `announce()` compiles every
 * builder chain on its way into `.document`, so `AnnouncementDocument` already
 * carries `SpecDocument[]` — the same bytes a package ships. Nothing here needs
 * `CORE_SPECS[].build()`, which would re-derive documents the announcement is
 * already holding and could disagree with them.
 * @internal
 */
export function pipelineResolver(
	announcement: AnnouncementDocument,
): (id: string) => DocsGraph | null {
	const byId = new Map(announcement.pipelines.map((doc) => [doc.id, doc]))
	return (id: string) => {
		const doc = byId.get(id)
		return doc ? specGraphOf(doc) : null
	}
}
