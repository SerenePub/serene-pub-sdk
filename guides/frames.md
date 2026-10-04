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
3. **Nothing external loads.** No fonts, no CDN, no `fetch`. The frame's whole world is its own
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

- **A document in a widget** (`sp-frame`) gets `props`, the theme and the language, and its
  saved `state`. Your component reads the session and passes the document what it needs in
  `props`.
- **A session-view frame** also gets the `session`, its `messages`, the session's `actions` and
  its `event`s.
- **A page** gets the theme and the language.

The table lists every message a frame can receive. Widget data (settings, size, granted scopes)
never reaches a frame: your component reads it from `ctx` and passes on what the document needs.

| Message | What it carries |
| --- | --- |
| `init` | `{ protocol, surface, payload? }`: which kind of frame this is, with the port. |
| `props` | What the component or opener passed in. |
| `session` | The session's `{ id, name }`. |
| `messages`, `message`, `channel` | A page of the log, one new message, or one channel's messages. |
| `event`, `actions` | A session event; the actions the session offers. |
| `annex`, `turn-order`, `viewer` | The viewer's view of the annex; who speaks next; who is looking. |
| `theme`, `locale` | The theme id and `light` / `dark` mode, to set on your own `<html>`; the viewer's language. |
| `suspend`, `resume` | The frame went off screen, or came back. |
| `page`, `response`, `strings` | Answers to your `request` and `translate`. |
| `state` | The view state you saved last, on the next mount. |

### What a frame can send

| Message | What it does |
| --- | --- |
| `ready` | You have booted. Serene Pub answers with everything it holds. |
| `invoke` | `{ key, messageId?, payload? }`: press an action by its identity, `<spec id>#<key>` (`core#extend` for one of Serene Pub's own). A bare key works while only one action has it. This is how a frame *does* anything. |
| `request` | Ask for a page of a channel's messages, or anything else a widget may ask for. Answered with `page` or `response`, or declined. |
| `translate` | Ask for your English strings in the viewer's language. Answered with `strings`. |
| `save-state` | Keep a little view state (a scroll position, an open tab), up to 16 KB. It comes back as `state` on the next mount, until the page is reloaded. |
| `error` | Something broke. `fatal: true` asks Serene Pub to say so instead of showing a blank frame. |

The older `action` message (`{ fn, … }`) still works but will be removed: send `invoke`.

A press that changes a message (hide, retry, extend, delete, edit, swipe) needs a person in the
frame right now: a real, recent click or key press with the frame focused. A press on load or on
a timer is refused with a warning. The server still checks every press against the viewer's own
permissions, exactly as it does a click in the app.

## What a frame can never do

A frame never writes a message and never reaches storage. It draws what it is sent and presses
actions by name. That is why hidden state is safe: an opponent's fleet can be in your plugin's
storage while the board is on screen, because the board is drawn from what the frame is sent and
the fleet is never sent. See [Storage](storage.md) and [Channels](channels.md).

## Size and settings

A document in a widget gets no settings and no layout of its own. Size it with CSS to fill the
`sp-frame`, and pass anything it should know (a setting, a zoom level) in `props`. Your component
reads its own settings and size from `ctx`; see [Widgets](widgets.md#what-it-is-handed).
