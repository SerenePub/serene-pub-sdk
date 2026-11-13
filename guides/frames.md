# Frames

A **frame** is a plain HTML document your plugin ships, which Serene Pub shows in a sandboxed
iframe and talks to with `postMessage`. Use one when you need a real browser page: a charting
library, a rich-text editor, a game board with its own CSS. For everything else, a
[widget component](widgets.md) is simpler.

## Where a frame can go

- **Inside a widget**, with an `<sp-frame>` element in your component. This is the usual way to
  put a frame in a session: the component reads the session and hands the document what it
  needs. See [Widgets](widgets.md#embed-a-document). Battleship's board and Twenty Questions'
  Tally both work this way.
- **A page of its own**, outside any session, at `/x/<your plugin id>`. Battleship's *Fleet
  records* is one.
- **In place of the message list**, for sessions of a genre that asks for it. This is a total
  conversion: your document draws the session, with its own log and its own input. The genre
  names your plugin in its shape (`shape: { view: 'acme.board' }`).

The last two are declared under `surfaces`:

<!-- prelude:
import type { SurfacesDecl } from '@serene-pub/sdk'
-->
```ts
// defineExtension({ …, surfaces })
const surfaces: SurfacesDecl = {
	page: { entry: 'ui/records.html', title: 'Fleet records' },
	'session-view': { entry: 'ui/session.html', title: 'Battleship' },
}
```

A frame is never a widget on its own: a widget always names a component, and the component
places the document with an `<sp-frame>`, reads the session and chooses what the document is
sent. Even when the document is the whole widget, the component is one `<sp-frame>` and a few
lines of glue; `serene-pub create component <slug> --embed-document` writes them. The older
`surfaces.panels` list and the widget `surface` shortcut are gone, and a build refuses both.

## The sandbox, and what it refuses

The iframe has `sandbox="allow-scripts"` and no origin of its own, and its document is served
with a content-security policy of `script-src 'self'`. Three things catch everyone once:

1. **An inline `<script>` is refused, silently.** The page renders and nothing happens. Put the
   script in a file beside the document. Inline `<style>` is fine.
2. **A `<form>` cannot submit.** Use a button and a key handler.
3. **Nothing external loads.** No fonts, no CDN. The one exception is `fetch`, and only GET:
   a frame may fetch its own package's assets and its own served storage (see below), nothing
   else; a POST, or a fetch of any other address, is refused. The frame's whole world is its own
   files and the messages Serene Pub sends it.

`npx serene-pub ui .` serves your frames under the same policy, so you find these out before an
install does.

## Talking to Serene Pub

Serene Pub posts `init` first, carrying a `MessagePort`; everything after that goes over the
port. Answer with `ready`, and the host sends you everything it holds. Both message types,
`HostFrameMessage` and `FrameHostMessage`, are exported from `@serene-pub/sdk`. `init` carries
the protocol version, `FRAME_PROTOCOL` (2 today).

Ignore any message you do not recognise: a `switch` on `t` with no `default` is the right shape,
and it keeps your frame working when a message is added.

<!-- prelude:
import type { FrameHostMessage, HostFrameMessage } from '@serene-pub/sdk'
declare function draw(props: unknown): void
-->
```ts
let port: MessagePort | null = null

window.addEventListener('message', (e: MessageEvent) => {
	const m = e.data as HostFrameMessage
	if (m?.t !== 'init' || !e.ports[0]) return
	port = e.ports[0]
	port.onmessage = (ev: MessageEvent<HostFrameMessage>) => {
		switch (ev.data.t) {
			case 'props':
				draw(ev.data.props)
				break
		}
	}
	port.postMessage({ t: 'ready' } satisfies FrameHostMessage)
})

// Later, when a person presses your button:
const guess = () =>
	port?.postMessage({ t: 'invoke', key: 'acme.board:spec/move#move', payload: { cell: 'B4' } } satisfies FrameHostMessage)
```

### What Serene Pub sends

What arrives depends on where the frame is:

- **A document in a widget** (`sp-frame`) gets `props`, the theme and the language, its
  saved `state`, and `assetsBase`. Your component reads the session and passes the document what
  it needs in `props`. Its requests go to its component, except `file-pick` and `file-save`
  (below), which it may ask itself: the person's click is in the document.
- **A session-view frame** also gets the `session`, its `messages`, the session's `actions` and
  its `event`s.
- **A page** gets the theme and the language.

The table lists every message a frame can receive. Widget data (settings, size, granted scopes)
never reaches a frame: your component reads it from `ctx` and passes on what the document needs.

| Message | What it carries |
| --- | --- |
| `init` | `{ protocol, surface, payload?, assetsBase?, fullscreen? }`: which kind of frame this is, with the port; `assetsBase` is where the package's `assets` are served (see below); `fullscreen` is true when the session is already in full screen. |
| `props` | What the component or opener passed in. |
| `session` | The session's `{ id, name }`. |
| `messages`, `message`, `channel` | A page of the log, one new message, or one channel's messages. |
| `event`, `actions` | A session event; the actions the session offers. |
| `annex`, `turn-order`, `viewer`, `attendance` | The viewer's view of the annex; who speaks next; who is looking; who has the session open. |
| `theme`, `locale` | The theme id and `light` / `dark` mode, to set on your own `<html>`; the viewer's language. |
| `suspend`, `resume` | The frame went off screen, or came back. |
| `page`, `response`, `strings` | Answers to your `request` and `translate`. |
| `state` | The view state you saved last, on the next mount. |

### What a frame can send

| Message | What it does |
| --- | --- |
| `ready` | You have booted. Serene Pub answers with everything it holds. |
| `invoke` | `{ key, messageId?, payload?, requestId? }`: press an action by its identity, `<spec id>#<key>` (`core#extend` for one of Serene Pub's own). A bare key works while only one action has it. This is how a frame *does* anything. Add a `requestId` to hear the answer as a `response`: a plugin action's result, or a session action's run outcome when the run ends (below). |
| `request` | Ask for a page of a channel's messages, or anything else a widget may ask for. Answered with `page` or `response`, or declined. |
| `translate` | Ask for your English strings in the viewer's language. Answered with `strings`. |
| `save-state` | Keep a little view state (a scroll position, an open tab), up to 256 KB (`SAVE_STATE_MAX_BYTES`). It comes back as `state` on the next mount, until the page is reloaded. |
| `error` | Something broke. `fatal: true` asks Serene Pub to say so instead of showing a blank frame. |

The older `action` message (`{ fn, … }`) still works but will be removed: send `invoke`.

#### When a press's run ends

Pressing a session action starts a run, and the run can end in four ways: `ok`, `halt` (a step stopped
it on purpose — a refusal, nothing to write; not an error), `err`, or `cancelled` (somebody pressed Stop).
A frame hears it twice:

- **The answer to its own press.** An `invoke` that carries a `requestId` is answered when the run ends,
  not when the press is sent: `ok` with `{ runId }`, or with `{ runId, halted: true, reason }` when the run
  halted — `reason` is the sentence to show. A run that errored, and a press refused before any run started
  (the session is answering someone, the viewer may not press it), answer `ok: false` with that sentence as
  `error`; a Stop answers `ok: false` with `error: 'cancelled'`. Serene Pub's own verbs (`core#extend`) run
  no run and answer `{}` at once, as does a press that asks the person first (a confirm, a collect dialog).
  The result's type is `WidgetInvokeResult`.
- **Every run's end, as an event** — `{ kind: 'run:ended', runId, outcome, reason? }` — whoever pressed,
  so a board can redraw when anybody's move lands or is refused. `reason` rides on `halt` and `err`.

While a person's line is being answered — from the moment it is sent until the reply's run ends —
Serene Pub refuses every session-level press with "Wait for the reply to finish." Keep your own
controls disabled for that stretch, and show the sentence if a press comes back with it.

A press that changes a message (hide, retry, extend, delete, edit, swipe) needs a person in the
frame right now: a real, recent click or key press with the frame focused. A press on load or on
a timer is refused with a warning. The server still checks every press against the viewer's own
permissions, exactly as it does a click in the app.

## Which API when: `ui`, `session` and `applet`

Everything a frame or component can use of Serene Pub belongs to one of three front-end APIs. Which ones a mount holds
depends on where it is:

| API | What it is | Messages and requests | Who holds it |
|---|---|---|---|
| `ui` | Serene Pub's own chrome. No data. | `notify`, `session-fullscreen`, `file-pick`, `file-save`, `translate`, `save-state`; the theme, locale and viewer; `open-session` and `open-sessions` (they open Serene Pub's own screens) | every mount |
| `session` | The session the mount is in. | Its sections (messages, channels, annex, actions, turn order, attendance, scoped sections), its verbs (`invoke`, `action`) and the rest of the requests (`messages`, `send`, `session-entries`…) | a widget placed in a session; an applet while it is mounted in one |
| `applet` | The person's library and the pub, outside any one session. | `library-characters`, `library-lorebooks`, `library-sessions`, `update-session`, `user-annex`, `plugin-storage`; `create-session` and `delete-session` (Serene Pub's own start form and confirm take the press) | an applet (its genre's `applet: true`) |

An `applet` request also needs the grant it uses, as the manifest's `permissions.applet` group compiles it:
`applet:characters:read` (or `:write`), `applet:lorebooks:read` (or `:write`), `applet:sessions:<genre id>` for each of the
package's own genres, `applet:annex:user`, and `storage` or `storage-per-user` for `plugin-storage`.

A request outside the mount's APIs is refused with a sentence (`'library-characters' is an applet request: a widget placed
in a session cannot ask it`). Each request is still bounded by what the package was granted and by what the person looking at
it may do. Except `user-annex`, the navigation and `applet` requests are declared now and answered from a later update. Until then they
are refused with "not available yet". The SDK lists every kind's API in `WIDGET_REQUEST_APIS`; `frontEndApiRefusal(kind, apis)`
is the host's check.

## An applet: your frame outside any session

A genre whose frame is a whole game (a launcher with New game, Continue and Load) can ask to be listed as an
**applet**. Add `applet: true` to its shape, beside `view`:

<!-- prelude:
import { genre } from '@serene-pub/sdk'
-->
```ts
export const life = genre('acme.life:genre/life', {
	name: { en: 'Life' },
	family: 'simulation',
	shape: { view: 'acme.life', fullscreen: 'propose', applet: true },
})
```

Serene Pub then lists your plugin once under **Apps** in the Sessions view, however many of your genres say so,
named by your `session-view` surface's `title`. `view` must be your own package and you must declare that surface;
`serene-pub build` refuses it otherwise (`E_APPLET_WITHOUT_FRAME`). Opening
that row mounts your session-view frame **without a session**, full screen. The frame holds the `ui` and `applet` APIs, so
it gets no session sections and presses no session verbs. Your own plugin actions (`invoke('world.load')`) still work.
From there it starts and opens ordinary sessions of your genres through Serene Pub's own screens:

- `create-session { genre, fields, lorebookId?, persona? }` opens Serene Pub's start form with your genre's declared fields filled
  in. The person presses Start; when nothing is left to ask, the form is one confirm.
- `open-sessions { genre? }` opens the Sessions list filtered to your genres; `open-session { sessionId }` opens one the
  person can open.
- `delete-session { sessionId }` asks Serene Pub to show its own delete confirm for one of the person's sessions of your
  genres.
- `library-sessions` lists the person's sessions of your genres and `update-session` changes one; both arrive in a later
  update and are refused with "not available yet" until then.

`persona: { name, description? }` (at most 80 and 2,000 characters) makes the start form offer that player as a new persona
the person may keep or swap for one of their own; the card is created only when they press Start, and is theirs. A shape
that says `castFromLorebook: { field: 'examples' }` seats the attached lorebook's own people, card or not, as the new session's
characters when its `examples` switch field is on (never someone drawn with a persona card; for a lorebook that comes with a
package, all of its people).

Each needs the matching grant in `permissions.applet` (`sessions: { genres: [...] }` for the session requests). Pressing
Sessions › New and choosing your genre opens the launcher; the plain start form stays one click away ("Use the start
form"). An existing session of your genre opens straight into the session, never through the launcher. The same frame
is mounted again inside each session, holding `ui`, `session` and `applet`. Read which one it is from `init`: a mount
without a session gets no `session` section. `init`'s `mount` reads `applet` in both places (`widget` for a frame placed
in a session, `page` for a plugin page; absent from older hosts); whether a session is mounted is still told by the
`session` section. From M3 on, `init` also says `inSession`: `true` on a session page (the `session` section follows), `false` for the launcher, so a frame need not wait to see which section arrives first.

Give the applet a card with `appletCard`. It is shown on the Apps view, on Home and on the launcher's loading screen.
The poster is shown 16:9 and cropped (1280×720 is recommended); the logo is an optional small square mark over its lower-left;
the blurb is one line of at most 160 characters. Both pictures live under your `assets` folder.

```ts nocheck a fragment: the rest of the declaration is the one above
defineExtension({
  assets: { dir: 'assets' },
  appletCard: { poster: 'assets/card/poster.png', logo: 'assets/card/logo.png', blurb: { en: '…' } },
})
```

`serene-pub check` refuses a picture outside `assets` (`E_APPLET_CARD_OUTSIDE_ASSETS`), a picture that is not in the package
(`E_APPLET_CARD_MISSING`), a longer blurb (`E_APPLET_CARD_BLURB_LONG`) and a card with no applet genre (`E_APPLET_CARD_WITHOUT_APPLET`).

## What a frame can never do

A frame never writes a message and never reaches storage. It draws what it is sent and presses
actions by name. That is why hidden state is safe: an opponent's fleet can be in your plugin's
storage while the board is on screen, because the board is drawn from what the frame is sent and
the fleet is never sent. See [Storage](storage.md) and [Channels](channels.md).

## Size and settings

A document in a widget gets no settings and no layout of its own. Size it with CSS to fill the
`sp-frame`, and pass anything it should know (a setting, a zoom level) in `props`. Your component
reads its own settings and size from `ctx`; see [Widgets](widgets.md#what-it-is-handed).

## Full screen, notices, files and package content

🚧 Provisional. These are the seams a frame, or the widget that places it, uses to reach past the
iframe: the screen, the toaster, the person's files, and the package's own content. A frame sends
each `request` below as `{ t: 'request', requestId, what, params }` and hears the answer as
`response`; a widget makes the same call with `ctx.request(kind, params)`.

### Full screen

A person puts a session in full screen with the corner control or a key, and the app hides its
header and rail. Your frame can ask for it, and hears when it changes:

- **`session-fullscreen`** with `{ on?: boolean }` enters or leaves; leave `on` out to toggle. It
  is a request, not an order: the viewer's choice wins, and the app refuses it unless a click or
  key press just happened in the frame.
- **`fullscreen`** is a session event, `{ kind: 'fullscreen', on }`, that arrives as an `event`
  message on every change. `init` carries `fullscreen: true` when the frame boots into a session
  already in full screen, so it needs no earlier event to know.
- **`SessionShape.fullscreen: 'propose'`** is the genre's side. On a genre that declares a
  session `view`, the first open of a session of that genre enters full screen once and says
  "Press Esc to leave full screen." After that the viewer's own choice is remembered and wins.
  There is no `'lock'`.

```ts nocheck a frame's glue, run in the document with the port from init
let inFullScreen = false
port.onmessage = (ev) => {
	const m = ev.data
	if (m.t === 'init') inFullScreen = m.fullscreen === true
	if (m.t === 'event' && m.event.kind === 'fullscreen') inFullScreen = m.event.on
}

document.querySelector('#expand')?.addEventListener('click', () =>
	port.postMessage({ t: 'request', requestId: 'fs1', what: 'session-fullscreen', params: { on: !inFullScreen } }),
)
```

### A notice

**`notify`** puts a line in the app's one toaster: `{ kind: 'info' | 'success' | 'warning', text,
sticky? }`, where `text` is an i18n string. `sticky: true` also keeps it in the Activity panel for
the rest of the page's life (Activity rows are held in the browser and are gone after a reload).
A widget may notify at most once every two seconds; the rest are dropped with a console note.
`action` is accepted but not drawn yet.

```ts nocheck a frame's glue, run in the document with the port from init
port.postMessage({
	t: 'request',
	requestId: 'n1',
	what: 'notify',
	params: { kind: 'success', text: 'Saved to your library.', sticky: true },
})
```

### What a frame can keep: the limit

`save-state` is view state, not storage, and its cap is now `SAVE_STATE_MAX_BYTES` (256 KB of
JSON). Past the cap the save is
refused. Keep anything the story depends on in the plugin's [storage](storage.md).

### Plugin actions: work outside a session

A **plugin action** is a named piece of work a package offers outside any session: save a draft
world, import a file, read a list. It is not a session action (a press in a session's actions
list). Declare it under `pluginActions`: the name, the parameters it takes, and the `handler`,
the id of a `query` or an `outlet` definition that your package implements.

<!-- prelude:
import type { ExtensionDecl } from '@serene-pub/sdk'
-->
```ts
// defineExtension({ …, pluginActions })
const pluginActions: ExtensionDecl['pluginActions'] = {
	'world.save': {
		params: { name: { type: 'string' }, body: { type: 'text' } },
		handler: 'acme.worlds:outlet/save-world',
	},
}
```

Call it by name. A widget or a plugin page (`/x/<your plugin id>`) calls `ctx.invoke('world.save',
{ payload: { name, body } })`. A frame sends an `invoke` with `key: 'world.save'` and a `payload`,
and adds a `requestId` to hear the result: the `response` carries the handler's `out.main` as
`result`, or `ok: false` with the sentence the person would read. The parameters are checked
against `params` first, and the call runs for whoever is signed in. A session action of the same
name is found first, so pick names with a dot that a session action will not use.

### File pick and file save

A frame cannot read a file from disk, and it should not have to. **`file-pick`** with
`{ accept, action }` opens the app's own file picker, limited to the types in `accept`
(`['image/png', '.json']`), and sends the chosen file to the plugin action `action` as
`{ name, mime, bytes }`, where `bytes` is base64. The frame is answered with nothing, never the
bytes. Add `target` (🚧 M2a) to say what the file is for, `'summer/portrait'` to place a picture
on one world's field; the host never reads it and passes it to the action as `input.target`. It
needs a click in the extension first. A file larger than the plugin's storage quota is refused
with a sentence that names both sizes.

**`file-save`** with `{ name, mime, source }` offers a download. `source` is `storage:<path>`, a
file the package has shared with `permissions.storage.serve` (see below), or `handler:<action>`,
a plugin action that answers the text to save, or `{ bytes }` in base64.
The action is invoked with `{ name, mime, target? }`, where `name` and `mime` are only the
suggestion, and `target` (🚧 M2a, the same optional pointer as above, `'summer:zip'`) tells it
which world or form to build. It may answer `{ bytes, name?, mime? }` (a `FileSaveAnswer`): a
non-empty `name` or `mime` replaces the suggestion, and only the file name part of `name` is
kept. A `target` is at most 512 characters.

An action receives everything the frame sent. Declaring `target` in the action's `params` is
optional: it is only needed to have the value checked (for example `{ type: 'string' }`); an
undeclared key reaches the handler unchecked.

Every frame of a plugin may ask both: a session-view frame, a plugin page, and (🚧 M2a) a
document in a widget's `sp-frame`, which asks the app directly for these two and its component
for everything else.

```ts nocheck a frame's glue, run in the document with the port from init
// Import: the file goes to the 'world.import' plugin action, not to this frame.
port.postMessage({ t: 'request', requestId: 'pick1', what: 'file-pick', params: { accept: ['.json'], action: 'world.import', target: 'summer' } })

// Export: the 'world.export' action is told { name, mime, target } and builds that world's file.
port.postMessage({
	t: 'request',
	requestId: 'save1',
	what: 'file-save',
	params: { name: 'summer.json', mime: 'application/json', source: 'handler:world.export', target: 'summer:json' },
})
```

Both are an extension's own: core's frames are refused.

### Content in the package: `assets`

Declare `assets: { dir: 'assets' }` to ship images, audio, fonts and data beside `ui/`; the
packager carries the folder into the zip. The files are kept on disk and served read-only. A
frame reads its own at `assetsBase`, which `init` carries (`/plugin-assets/<id>/<version>/`);
append the path inside the folder (a handler reads the same files with `ctx.package.read`, see
[Storage](storage.md)). The version in the address is the installed one, so a stale
page gets a 404 and never the wrong file. An asset loads in an `<img>`, `<audio>`, `<video>` or
`@font-face` like any file of the document. A frame can also `fetch` it (GET only), which is
how a data file such as JSON reaches a frame without being carried in the page's own bundle.

```ts nocheck a frame's glue, run in the document with the port from init
let assetsBase = ''
port.onmessage = (ev) => {
	if (ev.data.t === 'init') {
		assetsBase = ev.data.assetsBase ?? ''
		document.querySelector('img#hero').src = `${assetsBase}assets/img/hero.png`
	}
}
```

### Sharing storage files with your own frames: `permissions.storage.serve`

Your plugin's storage is private to its handlers. To let its own frames read some of it, list
globs under `storage.serve`; the files in them are then served read-only at
`/plugin-data/<id>/<path>`, with no directory listing. Anything outside the globs answers 404.
`file-save` with `storage:` reads through the same door. The admin sees the grant on the
install review.

🚧 (M2a) A frame may `fetch` these files: its policy opens GET on its own plugin's
`/plugin-assets/<id>/` and `/plugin-data/<id>/` and on nothing else of the app.
`serene-pub check` and `build` accept a `fetch` in a script under `ui/` when its address is one of
those two doors: built on `assetsBase`, or written as a path starting `/plugin-assets/<id>/` or
`/plugin-data/<id>/`. Any other `fetch` is refused with `E_DIRECT_NETWORK`.

```ts nocheck a frame's glue: read JSON the plugin served or shipped
const world = await (await fetch(`${assetsBase}assets/worlds/one.json`)).json()
const saved = await (await fetch('/plugin-data/acme.worlds/saves/one.json')).json()
// Another plugin's door, the app's API, or any POST: refused by the browser.
```

### Sound: `permissions.media.autoplay`

A frame cannot start sound by itself unless the plugin asks. With `media: { autoplay: true }` the
frame may play audio after the person's first click or key press in it; without it the frame's
document is answered `Permissions-Policy: autoplay=()`.

<!-- prelude:
import type { DeclaredPermissions } from '@serene-pub/sdk'
-->
```ts
const permissions: DeclaredPermissions = {
	storage: { quotaBytes: 8 * 1024 * 1024, serve: ['worlds/**'] },
	media: { autoplay: true },
}
```

### Your strings: `lang/<locale>.json` and `ctx.t`

A widget writes its words in English and asks for them with `ctx.t('Saved to your library.')`.
The viewer sees, in order: the plugin's own catalog for their language, then the app's
translation, then your English. Ship a catalog as `lang/<locale>.json` in the package, a flat
object from the English source to the translation, with `{0}`, `{1}` for values you pass after the
text:

```json
{ "Saved {0} worlds.": "Se guardaron {0} mundos." }
```

The packager always carries the `lang/` folder. `serene-pub check` counts each catalog's keys,
the ones nothing in your source names, and the `t('…')` strings the catalog lacks. A frame asks
with `translate` and hears `strings`, as before.
