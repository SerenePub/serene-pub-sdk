/**
 * The seam between the two docs packages, asserted at COMPILE time.
 *
 * `@serene-pub/docs` used to state this itself, with an `import type` of the
 * CLI's `DocPage`. It cannot any more: the CLI now imports `DocsGraph` from
 * the docs package to answer the ` ```pipeline ` fence, and two packages
 * whose emitted declarations reference each other cannot both be built —
 * whichever is built second reads the other's `.d.ts`, which reads its own,
 * and `tsc` refuses to overwrite one of its own inputs.
 *
 * So the arrow points one way (docs ← cli), `DocsSource.pages` states its
 * shape structurally, and the claim that the shape IS what
 * `renderAnnouncementDocs()` returns lives here — where one `tsc --noEmit`
 * sees both packages' SOURCE, and so proves it against the CLI as written
 * rather than against the CLI as last built.
 *
 * This file is checked and never run. If `DocPage` grows a required field, or
 * `DocsSource.pages` narrows, the assignment below stops compiling.
 */
import type { DocPage } from '@serene-pub/cli'
import type { DocsSource } from '@serene-pub/docs'

type _DocPageFits = DocPage extends { path: string; markdown: string } ? true : never
const _docPageFits: _DocPageFits = true
void _docPageFits

// And the whole of it, the way a docs build actually hands them over.
declare const rendered: DocPage[]
const _pages: NonNullable<DocsSource['pages']> = rendered
void _pages
