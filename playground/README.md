# `@serene-pub/playground`

One static document — `dist/index.html` plus its assets — that transpiles and runs SDK
pipeline code in the browser. It is a **playground**: it runs _inside_ a sandbox, it is
not one.

It is the interactive half of a ` ```playground ` fence (`@serene-pub/docs`, dialect rule
4). The page carries the fence's source; this document carries the editor and the
runtime.

## What it runs, and what it cannot reach

A program may import exactly five things — `@serene-pub/sdk`, `@serene-pub/sdk/testing`,
`@serene-pub/contracts`, `@serene-pub/core-catalog`, and the suite's fixture host as
`../helpers.js` or `./helpers.js`. `@serene-pub/cli` resolves to `{}`, because an example
imports only its `Example` _type_ and the TypeScript transform erases that before the map
is ever asked. Anything else is an error naming the specifier and listing what exists.

There is no `fetch` in the bundle, no `location`, no cookies and no storage. The only
thing that leaves is a `postMessage` to the parent.

Two shapes of program run:

- **`export const example`** — `{ slug, title, summary, build(), run(ctx) }`, the shape
  every page under Examples uses. Built, validated, then run with the **same seed and
  clock the docs generator uses** (`makeExampleRunCtx`, `@serene-pub/sdk/testing`), so an
  unedited example produces the page's own output, byte for byte. `sdk-tests/playground.test.ts`
  asserts exactly that.
- **`export default` (or `export const spec`)** — a `SpecBuilder`, `BuiltSpec` or
  `SpecDocument`. Built and validated; then run against the fixture host on a trivial
  input **only if every node's definition has a fixture hook**. When one does not, the
  Result pane says so and names the definition, because a run that halts on an unbound
  node says more about the harness than about the pipeline.

## Embedding it

```html
<iframe src="/docs/playground/index.html" sandbox="allow-scripts" title="Playground"></iframe>
```

Never `allow-same-origin`: the frame is an opaque origin, which is the security boundary
and the reason nothing a reader pastes can touch the site's DOM, cookies or storage.
`event.origin` is the string `"null"` on both sides, so both post to `"*"`.

Frame → host: `{ t: "playground:ready", v: 1 }` once; `{ t: "playground:height", px }`
whenever the content height changes; `{ t: "playground:state", running }`.

Host → frame, after `ready`: `{ t: "playground:load", v: 1, lang: "ts" | "js", code, theme: "light" | "dark", autorun? }`,
and `{ t: "playground:theme", theme }` later. Unknown messages are ignored; a `load` that
beats the mount is queued.

### Why classic scripts, and why the build is hand-rolled

**No `<script type="module">`, and no inline `<script>`.** Both are frame rules this SDK
already states — `ui-preview/README.md`, "Two things frames cannot do" — and they apply
here for the same reasons. A module script, and every `import()` inside one, is _always_
fetched in CORS mode; an opaque origin sends `Origin: null`; and no static host answers
that with `Access-Control-Allow-Origin`. Verified in Chromium: in a sandboxed frame a
classic `<script src>` and a stylesheet load fine, a module script fails with a CORS
error and the frame renders as a blank box with no other symptom. Inline scripts are out
under core's `script-src 'self'`.

So the output is three **classic IIFE bundles** built by esbuild, not an ES-module graph.
A classic bundle cannot code-split, so the split is by hand: the entry ships on load, and
each optional bundle hangs its API on `window.__serenePubPlayground.<name>` and is fetched
by injecting a `<script src="./assets/…">` and awaiting its `load` event
(`src/lazyBundle.ts`). A failed load says so in the Result pane; it is not cached, so the
button works again on the next try.

That single global is the whole interface a lazy bundle has — a classic script has no
exports — which is why there is exactly one of them, named, documented and typed
(`src/globals.d.ts`).

## Building

`npm run build` (from the SDK root, which builds this last) or
`npm run build -w @serene-pub/playground`: `tsc --noEmit`, then `node build.mjs`. Output
lands in `playground/dist/`, gitignored. Every URL is relative — the document is served
under `/docs/playground/` on more than one host, and a root-relative path resolves against
nothing at all on an opaque origin.

`build.mjs` builds the two lazy bundles first (the entry has to be handed their
content-hashed names, frozen in as `__PLAYGROUND_ASSETS__`), then the entry, then writes
`dist/index.html` from `index.template.html`.

`npm run dev` watches `src/` and serves `dist/` on `http://127.0.0.1:5180` — deliberately
with **no CORS header of any kind**, because the failure this build exists to prevent only
shows up on a server that sets none. With no host posting a `load`, the editor opens
empty, which is the honest state rather than a fake one.

Bundles, as built:

| bundle                                                               | raw     | gzip   | fetched                            |
| -------------------------------------------------------------------- | ------- | ------ | ---------------------------------- |
| `entry` — CodeMirror, SDK, contracts, core catalog, fixture host, UI | 734 KB  | 237 KB | on load                            |
| `styles`                                                             | 4.4 KB  | 1.4 KB | on load                            |
| `sucrase`                                                            | 206 KB  | 47 KB  | first Run                          |
| `graph` — elkjs + the docs graph renderer                            | 1.46 MB | 442 KB | first time the Graph tab is opened |
