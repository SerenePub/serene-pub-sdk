# @serene-pub/docs

The docs compiler. It takes documentation from more than one place — the markdown a
human wrote in the app repo, and the pages `@serene-pub/cli`'s `renderAnnouncementDocs()`
renders straight out of a package's announcement — and emits **one reading order** over
all of it: an article body per page, a manifest that _is_ the nav, and a flat search index.

It refuses to emit any of it while a link, an anchor or an image is broken. That is the
point of the package: reference docs generated from declarations and prose written by
hand drift apart quietly, and a dead anchor is invisible until a reader clicks it.

```ts
import { compileDocs } from '@serene-pub/docs'
import { renderAnnouncementDocs, typeSurfaces } from '@serene-pub/cli'
import { coreAnnouncement } from '@serene-pub/core-catalog'

const typeOf = await typeSurfaces()
const report = await compileDocs({
	version: '0.6.0',
	sources: [
		{ id: 'app', group: 'Using Serene Pub', dir: 'docs' },
		{
			id: 'sdk',
			group: 'SDK',
			prefix: 'sdk',
			pages: renderAnnouncementDocs(coreAnnouncement().document, typeOf),
			banner: 'Plugin modding is only available in 0.7 previews.',
		},
	],
	out: 'static/docs',
	assetsOut: 'static/docs/assets',
	assetsBase: '/docs/assets',
})
```

This package is **build-time only**. A consumer serves the output; it never imports the
compiler, and so never carries marked, shiki, jimp or the wasm webp encoder into a
runtime bundle. There are no native dependencies anywhere in that stack — decode and
resize are pure JS, the webp encoder is WASM.

## The dialect

CommonMark with GFM tables, plus eight things:

1. **Headings** get `id`s from **GitHub's slug rule** (`github-slugger`), one slugger per
   page: the text is lowercased, the punctuation GitHub removes is removed — `_` and `-`
   are not punctuation to it, and inline code and emphasis markers go while their
   contents stay — and **each space becomes one `-`**, so an `&` removed from between two
   spaces leaves two hyphens. A repeated heading gets `-1`, `-2`. So
   ``### `SERENE_PUB_DATA_DIR` is the one exception`` is
   `#serene_pub_data_dir-is-the-one-exception`, `## Prompt Configs & Summarization Config`
   is `#prompt-configs--summarization-config`, and `## Database won't open` is
   `#database-wont-open`. This is not a preference: the guides lived on GitHub for a year
   and link each other with these anchors, and TypeDoc's markdown emits the same shape
   (`#slot_value`, `#band_order`). Readers have bookmarked them; they do not move.
2. **Links** to a relative `.md` file resolve against the current page's path inside its
   source, then map to slug + `linkBase`. `./characters.md#creator-wizard` from an app
   page becomes `/docs/characters#creator-wizard`; `pipelines/core_spec_respond.md` from
   the `sdk` catalog index becomes `/docs/sdk/pipelines/core_spec_respond`. Offsite links
   pass through untouched, and so does a bare `#anchor` — but a bare `#anchor` is still
   **checked**, against the heading ids of the page that wrote it.
3. **Code fences** are highlighted by shiki with both themes baked into the same markup
   as `--shiki-light` / `--shiki-dark` CSS variables, so the consumer keeps the
   light/dark decision. An unknown language falls back to an escaped `<pre><code>`.
4. **Playground fences** — ` ```playground ` with an optional language after the word —
   are a normal highlighted block wrapped in
   `<div class="doc-playground" data-playground data-lang="ts">`, with the fence's own
   text carried ahead of it as
   `<script type="text/plain" class="doc-playground-source">`. The host reads
   `textContent` off that element and **HTML-unescapes it** — the body is escaped, and a
   literal `</script` in it is additionally written `<\/script` so a fence can never
   close its own carrier. The highlighted markup is for reading; the carrier is what
   gets run, because recovering source out of shiki's spans is right until the first
   fence the highlighter styles in a way nobody predicted. Nothing on the page itself is
   interactive: a host mounts `@serene-pub/playground` — a sandboxed iframe that
   transpiles and runs what it is handed — against the wrapper.
5. **Admonitions** — a block from `:::note`, `:::tip` or `:::warning` (optional title
   after the kind) to a closing `:::` — render as
   `<aside class="doc-admonition doc-admonition-{kind}" role="note">` with a
   `<p class="doc-admonition-title">`. The body is markdown.
6. **Images** — `![Caption](relative/path.png)` with an optional trailing `{w=800}` —
   resolve against the source file, decode (PNG/JPEG/GIF first frame/WebP), downscale to
   `maxWidth`, and encode to webp named by the sha256 of the output bytes. A standalone
   image is a `<figure class="doc-figure">` with a `<figcaption>`; one sitting inside a
   sentence is a bare `<img>`, because a `<figure>` inside a `<p>` is not HTML. `.svg`
   is copied verbatim.
7. **Banners** — a source's `banner` is prepended to every one of its pages as
   `<aside class="doc-banner" role="note">`.
8. **Pipeline fences** — ` ```pipeline core:spec/chat-respond ` (the id is the info string
   after the word; the body is ignored and is usually empty) — become an inline SVG of
   that pipeline, laid out by [elkjs](https://github.com/kieler/elkjs)'s `layered`
   algorithm with the same 220×58 cards and spacings the app's pipeline map uses, so the
   drawing here and the drawing there read as the same picture. The compiler does not
   know what a pipeline is: it asks `resolvers.pipeline`, below.

Nothing is sanitised. All of this is first-party content; everything the dialect itself
interpolates is escaped here.

## The output contract

````ts
export interface DocsSource {
	/** 'app' | 'sdk' | any id. Recorded per page; drives banners. */
	id: string
	/** Nav group heading shown to readers. */
	group: string
	/** Either a directory of markdown files… */
	dir?: string
	/** …or pre-rendered markdown pages (e.g. from @serene-pub/cli renderAnnouncementDocs). `path` is like 'pipelines/core_spec_respond.md'. */
	pages?: { path: string; markdown: string }[]
	/** Slug prefix for every page of this source, e.g. 'sdk' → slug 'sdk/pipelines/core_spec_respond'. Omit for none. */
	prefix?: string
	/** Explicit reading order of slugs (without prefix). A page absent from it is appended alphabetically AND reported as a warning. */
	order?: string[]
	/** Prepended to every page of this source as <aside class="doc-banner" role="note">. */
	banner?: string
	/** Optional repo link and commit shown in the manifest for this source. */
	repo?: { url: string; commit?: string }
}

export interface CompileDocsOptions {
	version: string // product version recorded in the manifest
	sources: DocsSource[]
	/** Where pages/*.html, manifest.json, search.json go. Created/emptied. */
	out: string
	/** Where converted image assets go (a directory). Created/emptied. */
	assetsOut: string
	/** URL base the emitted <img src> uses, e.g. '/docs/assets'. */
	assetsBase: string
	/** URL base for page links, default '/docs'. rewriteDocHref('./x.md#a') → `${linkBase}/x#a`. */
	linkBase?: string
	/** Max image width in px (default 1200) and webp quality (default 80). */
	image?: { maxWidth?: number; quality?: number }
	/** Fails the compile if converted assets exceed this. Default 6 * 1024 * 1024. */
	assetBudgetBytes?: number
	/** Shiki languages to load. Default: ['ts','js','json','bash','yaml','html','css','svelte','markdown','liquid','sql']. */
	languages?: string[]
	/** Answers a ```pipeline <id> fence. null — or no resolver — fails the compile. */
	resolvers?: { pipeline?: (id: string) => DocsGraph | null }
}

export interface DocsGraphNode {
	key: string
	kind: string // inlet | query | task | oracle | outlet | … — a CSS class suffix
	label: string
	sublabel?: string
}
export interface DocsGraphEdge {
	from: string // a node `key`; an edge naming a key no node has is dropped
	to: string
	label?: string
}
export interface DocsGraph {
	id: string // the fence's id; also slugged into every id the SVG defines
	title?: string // the <figcaption> and the SVG's accessible name. Defaults to `id`
	nodes: DocsGraphNode[]
	edges: DocsGraphEdge[]
	direction?: 'DOWN' | 'RIGHT' // ELK's layout direction, default 'DOWN'
}

export interface DocsManifest {
	version: string
	generatedAt: string // ISO
	linkBase: string
	sources: Record<
		string,
		{ group: string; banner?: string; repo?: { url: string; commit?: string } }
	>
	nav: { group: string; source: string; pages: string[] }[] // slugs, in reading order
	pages: Record<string, DocsPageMeta>
	assets: { count: number; bytes: number; budgetBytes: number }
}
export interface DocsPageMeta {
	slug: string // 'getting-started' or 'sdk/pipelines/core_spec_respond'
	title: string // first H1, else slug
	description: string // first paragraph after H1, inline markdown stripped, ≤200 chars
	source: string
	order: number // position within its source's nav
	headings: { id: string; text: string; depth: number }[]
	bytes: number // size of pages/<slug>.html
}
/** search.json: flat array, one entry per heading, mirroring the app's existing DocSection. */
export interface DocsSearchEntry {
	slug: string
	anchor: string
	title: string
	depth: number
	preview: string
}

export interface CompileDocsReport {
	manifest: DocsManifest
	warnings: string[] // e.g. slug missing from `order`
	pagesWritten: number
	assetsWritten: number
}
export function compileDocs(opts: CompileDocsOptions): Promise<CompileDocsReport>
````

Output files: `${out}/manifest.json`, `${out}/search.json`, `${out}/pages/<slug>.html`
(nested dirs for slugs with `/`; article body only, no `<html>`/`<body>`), and
`${assetsOut}/<contenthash>.webp` (and `.svg` copied verbatim).

**The compile fails**, with one error naming every offender, on: a link to a `.md` page
that is not in any source; a link whose anchor has no matching heading id on the page it
points at — including a bare `#anchor`, whose page is the one that wrote it; a referenced
image file that does not exist or cannot be decoded; a ` ```pipeline ` fence no resolver
answers; two pages that compile to the same slug; and converted assets over the budget. **Warnings**, which
do not stop it: a page missing from its source's `order`, and an `order` entry with no
page. Nothing is written until everything has been rendered and proved — a failed
compile leaves the previous output alone rather than a half-empty directory a server
would happily serve.

Also exported, because the app shares them: `slugifyHeading`, `stripInlineMarkdown`,
`rewriteDocHref` (the app's one-argument form, and a contextual two-argument one),
`resolveDocLink` and `renderMarkdown`.

And `loadMarkdownDir(dir, { prefix })`, which reads every `.md` under a directory
into `{ path, markdown }` pages with paths relative to `dir`. `DocsSource.dir`
already reads a directory, but it reads it as _the_ source; this is for markdown a
**generator** wrote — the TypeDoc API reference the SDK build leaves in
`docs/generated/api` — which has to be handed to a source that also carries a
prefix, a banner and a repo link. It does not swallow a missing directory: "the
generator never ran" and "it generated nothing" are different facts, and only the
caller knows which one is survivable.

## Pipeline graphs

`resolvers.pipeline` is the whole of the contract: given the fence's id, hand back a
`DocsGraph` or `null`. It is **synchronous and total** — the compiler has already
collected every fence on the page before it renders a line of it, and a `null` is not a
blank space but a named offender in the same error a broken link raises
(`` `sdk/pipelines/core_spec_respond` embeds pipeline `core:spec/nope` — no resolver /
unknown id. ``). That is deliberate: a generated catalog page that silently lost its map
looks finished.

`@serene-pub/cli` ships the resolver for a package's own announcement —
`pipelineResolver(announcement)` — and `specGraphOf(specDocument)` if you are assembling
one by hand.

Each fence becomes:

```html
<figure class="doc-graph">
	<svg
		role="img"
		aria-labelledby="core-spec-chat-respond-title"
		viewBox="0 0 W H"
		width="W"
		height="H"
	>
		<title id="core-spec-chat-respond-title">core:spec/chat-respond</title>
		<defs><marker id="core-spec-chat-respond-arrow">…</marker></defs>
		<path class="doc-graph-edge" d="…" marker-end="url(#core-spec-chat-respond-arrow)" />
		<text class="doc-graph-edge-label">…</text>
		<g class="doc-graph-node doc-graph-node-query" transform="translate(x,y)">
			<title>the full label, when the card's was cut</title>
			<rect rx="8" />
			<text>key</text>
			<text class="doc-graph-sublabel">type id</text>
		</g>
	</svg>
	<figcaption>core:spec/chat-respond</figcaption>
</figure>
```

Every id the SVG defines is prefixed with a slug of the graph's id, so two graphs on one
page never share a marker or an `aria-labelledby` target — which also means the **id is
what has to be unique on a page**, not merely present.

The `<svg>` carries a `viewBox` and matching `width`/`height`, so it is the host that
decides whether a wide graph scrolls or scales — `.doc-graph { overflow-x: auto }` or
`.doc-graph svg { max-width: 100%; height: auto }`. Core's `core:spec/chat-respond` lays out
at about 2400×1360, so this is not a hypothetical: style it or it will overrun the
column, exactly as a wide `.doc-table` does.

**There are no colours in it.** Every stroke and fill is `currentColor` or `none`, set as
presentation attributes so any CSS rule beats them, because the app and the standalone
site theme these pages differently. The classes are the styling surface, and they are all
of it: `.doc-graph`, `.doc-graph-node`, `.doc-graph-node-{kind}` (`kind` slugged —
`inlet`, `query`, `task`, `oracle`, `outlet`, …), `.doc-graph-sublabel`,
`.doc-graph-edge`, `.doc-graph-edge-label`. Labels over 28 characters are cut with an `…`
and the full text goes in a `<title>` inside the node.

## Licence

Apache-2.0.
