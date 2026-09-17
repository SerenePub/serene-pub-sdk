/**
 * The graph bundle: elkjs and the docs compiler's drawing, in their own IIFE.
 *
 * elkjs is 1.4MB of transpiled Java. A reader who opens a page, presses Run and
 * reads the receipt must never fetch it, so it lives behind the Graph tab and
 * arrives the first time somebody selects it.
 *
 * The drawing itself is the docs compiler's, unmodified: the same 220×58 cards
 * and the same class names the app's own guides style, so a graph here and a
 * graph there read as one picture rather than two. Every stroke it emits is
 * `currentColor`; `styles.css` is the only place any of it gets a colour.
 */
import { renderDocsGraph } from '@serene-pub/docs/graph'
import { specGraphOf } from '@serene-pub/docs/spec-graph'
import type { SpecDocument } from '@serene-pub/sdk'

window.__serenePubPlayground = {
	...window.__serenePubPlayground,
	graph: {
		renderDocumentGraph: (doc: unknown) => renderDocsGraph(specGraphOf(doc as SpecDocument)),
	},
}
