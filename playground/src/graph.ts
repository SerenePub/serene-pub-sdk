/**
 * The Graph pane's drawing — one call, and a lazily-fetched bundle behind it.
 *
 * elkjs and the docs compiler's renderer live in their own classic script
 * (`graphBundle.ts`), fetched the first time somebody selects the Graph tab.
 * Everything about why that is a classic script rather than an `import()` is in
 * `lazyBundle.ts`.
 */
import type { SpecDocument } from '@serene-pub/sdk'

import { loadBundle } from './lazyBundle.js'

/** One compiled document → a `<figure class="doc-graph">` holding an inline SVG. */
export async function renderDocumentGraph(doc: SpecDocument): Promise<string> {
	const graph = await loadBundle('graph')
	return graph.renderDocumentGraph(doc)
}
