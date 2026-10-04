# @serene-pub/ui-preview

The surface harness: a SvelteKit dev server that renders the UI surfaces a
package **announces**, with hot reload.

```sh
serene-pub ui .              # in your package
serene-pub ui . --open --port 5180
serene-pub ui . --fixtures ./my-session.json
```

## What it loads

Whatever your entry module's default export declares — its `defineExtension(…)`
result:

```ts
export default defineExtension({
	slug: 'acme.dice',
	name: 'Dice',
	version: '0.1.0',
	surfaces: {
		'session-view': { entry: 'ui/session.html', title: 'Crawl view' },
		page:        { entry: 'ui/index.html',   title: 'Dashboard' },
		panels: [{ id: 'tray', entry: 'ui/tray.html', title: 'Dice tray', channels: ['dice'] }]
	},
	components: [component({
		surface: 'core:surface/settings-section@1',
		slug: 'dice-settings',
		label: 'Dice settings',
		framework: 'svelte',
		entry: 'src/ui/Settings.svelte'
	})]
})
```

Nothing is discovered by scanning a directory. A surface you see in the harness
is a surface an instance would be offered — if the two disagree, one of them is
a bug and this is where you find out.

## What it renders it in

**Frame surfaces** mount in `sandbox="allow-scripts"` with no
`allow-same-origin` — the same opaque-origin sandbox the app uses — and speak
frame protocol v1 over a `MessageChannel`. Channel scoping is enforced
host-side: a panel that declares `channels` receives only those lanes. Both
directions are logged, so "nothing rendered" and "nothing was sent" are
distinguishable.

**Components** mount in the harness's own document through the same ABI core
uses: a Svelte default export, or a `{ mount, update, destroy }` module.

## Generated controls

A component declares its settings in the SDK's settings vocabulary, and the
harness renders the editor for them — you never write one:

```ts
component({
	slug: 'tray',
	label: 'Dice tray',
	framework: 'svelte',
	entry: 'src/Tray.svelte',
	settings: {
		sides:  { type: 'integer', label: 'Sides', default: 20, min: 2, max: 100 },
		style:  { type: 'enum',    label: 'Style', of: ['pips', 'numerals'], default: 'pips' },
		bias:   { type: 'number',  label: 'Bias',  group: 'Advanced',
		          showIf: { field: 'style', equals: 'numerals' } },
	},
})
```

Edits reach the component as `ctx.settings`, the pipe an instance uses, so you
can build and see it against real values. A page or session-view frame is handed
no declared values, so it has no settings pane — only fixtures.

Grouping, ordering and `showIf` behave exactly as they will in an instance,
because they come from the SDK's own `formLayout`/`isVisible`.

`/controls` is the sandbox: every value type this build ships, its control, its
declaration, its live value and its validator's verdict — plus the four-way
registry (factory · validator · control · scaffold) as a table, so a hole is
visible rather than merely asserted by a test.

## Themes

All 24 stock Skeleton themes and a light/dark switch, applied the way the app
applies them — `data-theme` and `data-mode` on `<html>`. The list is read off
the installed `@skeletonlabs/skeleton`, so a Skeleton release that adds a theme
adds it here.

Frames are their own documents and inherit nothing, so they get a **token
stylesheet** instead:

```html
<link rel="stylesheet" href="/@serene-pub/themes.css">
```

```js
port.onmessage = (e) => {
	if (e.data.t !== 'theme') return
	document.documentElement.dataset.theme = e.data.theme
	document.documentElement.dataset.mode  = e.data.mode
}
```

Every stock theme's custom properties, served whole — tokens only, no utility
classes, because your own build owns those. All themes in one document, so a
theme switch is an attribute flip inside your frame: no reload, no lost state.

> Core does not send `{ t: 'theme' }` yet — the harness does, so you can build
> against it. Keep a sane default.

## What each surface point actually receives

Scoped the way core scopes it, read off the three real call sites — so a surface
cannot be built against data an instance will never send it:

| point | receives |
|---|---|
| `panel` | `session`, per-lane `channel` posts (never the whole log), `props` |
| `session-view` | `session`, `messages` |
| `page` | `init` — and nothing else |

Every frame additionally gets the harness-only `theme` message. The stage's
**"Where this harness is not production"** panel lists that and every other
divergence in one place; read it once before you rely on anything.

Entry paths and panel ids are checked against the grammar an instance actually
accepts. Core drops a surface that fails it *silently*, so the harness refuses
to preview one — a surface it showed you there could never exist.

## Two things frames cannot do — here or in production

The harness serves frame documents under core's real CSP, so both of these fail
in the harness exactly as they would after install:

- **No inline `<script>`** — `script-src 'self'`. Load your surface from a file.
- **No `<script type="module">`** — module scripts are always CORS-fetched, and a
  frame is an opaque origin (`Origin: null`) that neither core's plugin-ui route
  nor this harness answers with `Access-Control-Allow-Origin`. Use a classic
  `<script src="…">`; it is not CORS-fetched.

## Hot reload

- Editing a **surface** hot-reloads it. A component is always hot — *"components
  render; they do not participate in a run"* (13 §11).
- Editing a **frame document** reloads that frame, and only that frame.
- Editing **what the package announces** rebuilds the list: which surfaces exist
  may have changed, so the page reloads.

## What it is not

It is not an instance. There is no database, no pipeline run, no install. The
data your surface sees is fixtures you can edit live — which is the point: a
surface can only ever render what the host chose to post it, and developing
against fixtures is what keeps that true.
