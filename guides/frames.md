# Frames

A plugin's own interface is a **frame**: a plain HTML document Serene Pub mounts in a sandboxed
iframe and talks to over `postMessage`. There are three places a frame can go:

- **`session-view`** replaces the whole message section for a genre that names it. This is a
  total conversion: the play surface of a board game, with its own log and its own input.
- A **widget** joins the session layout beside the core widgets — Stats, World State, the
  portraits. A frame widget is a widget whose `surface` is a frame: it is declared with the same
  `WidgetDecl` a component widget uses, with the channels it views, its settings, and where a fresh
  drop puts it.
- **`page`** is a standalone route under the plugin's own path, outside any session.

<!-- prelude:
import type { SurfacesDecl } from '@serene-pub/sdk'
-->
```ts
// defineExtension({ …, surfaces })
const surfaces: SurfacesDecl = {
	'session-view': { entry: 'ui/session.html', title: 'Battleship' },
	page: { entry: 'ui/records.html', title: 'Fleet records' },
}
```

A widget is declared once, as a `WidgetDecl` with `surface: { kind: 'frame', pluginId, entry }`,
next to its `channels`, `settings` and `placement`. The older `surfaces.panels[]` list is still
read — the host turns each entry into that same declaration with `panelToWidgetDecl` — but it is
deprecated and goes away one release from now. Declare a widget, not a panel.

A widget a plugin declares for itself is seated in every session under a namespaced id,
`<pluginId>:<panelId>` (`pluginWidgetId` and `parsePluginWidgetId` in the SDK), so two packages
that both call a panel `map` never collide and a saved layout still knows whose widget it holds. A
widget a genre declares in its own shape keeps the plain id it was given. When your plugin opens
one of its own widgets with a `surface:open` intent, name the bare panel id; the host qualifies it,
and refuses to open another plugin's.

## The sandbox, and what it refuses

The iframe is `sandbox="allow-scripts"` with an opaque origin, and its document is served under
a content-security policy of `script-src 'self'`. Three consequences catch everyone once:

1. **An inline `<script>` is refused, silently.** The markup renders and nothing happens. Put
   the script in a file beside the document. Inline `<style>` is fine.
2. **A `<form>` cannot submit.** There is no `allow-forms`. Use a button and a key handler.
3. **Nothing external loads.** No fonts, no CDN, no fetch from the frame. The frame's whole
   world is its files and the messages the host sends.

`npx serene-pub ui .` serves your surfaces under the same policy, which is how you find these
out before an install does.

## The protocol

The host posts `init` first, carrying a `MessagePort`; everything after rides the port. `init`
names the protocol, **2**, which is the number `FRAME_PROTOCOL` in the SDK. Both message unions,
`HostFrameMessage` and `FrameHostMessage`, are exported from `@serene-pub/sdk`, and the host is
compiled against them, so what is listed there is what is sent. Unknown kinds must be ignored: a
`switch` on `t` with no `default` is the right shape, and it is how a frame stays compatible when
a member is added.

| host → frame | meaning |
| --- | --- |
| `init` | `{ protocol: 2, surface, payload? }` — which surface this is, with the port |
| `session` | the session's `{ id, name }` |
| `messages` / `message` | a page of the log, or one new row, as `MessageV1` (`id`, `role`, `content`, `channel`, the speaker, timestamps, flags) |
| `channel` | one channel's messages, for each channel the widget declared |
| `props` | the payload the opener passed — the envelope's `props.v1` |
| `settings` | this instance's effective settings — every declared field defaulted, with the person's changes over it. Widgets only |
| `style` | the skin the widget wears: `{ css, vars }`. Keep one `<style id="sp-widget-style">` and replace it; set `vars` on `<html>`. An empty `css` still arrives when a style is taken off. Widgets only |
| `layout` | where the widget sits — `layout.v1`: its tier, which edges of its zone it touches, what chrome the host paints, and its measured `box.px`. Re-sent on every change and on reload. Widgets only |
| `event` | one host event, the same union a component widget subscribes to with `on`, scoped to the widget's channels. Widgets only |
| `actions` | the session's actions per venue — `actions.v1`. Widgets only |
| `theme` | the host's active theme id and `light` / `dark` mode, on ready and on change. Apply them to your own `<html>` and let your own stylesheet resolve them |
| `suspend` / `resume` | the frame is off screen, or back |
| `page` | the answer to a `request`, echoing its `requestId` |
| `state` | the view state you last saved, on the next mount. Serene Pub keeps none today, so none arrives |

| frame → host | meaning |
| --- | --- |
| `ready` | the frame has booted; the host answers with everything above it holds |
| `invoke` | `{ key, messageId?, payload? }` — fire an action by its identity, `<spec slug>#<key>` (`acme:spec/roll#roll`, or `core#extend` for one of Serene Pub's own verbs). A bare key is accepted while only one action carries it. This is how a frame *does* anything |
| `action` | the older `{ fn, messageId?, payload? }` spelling of the same fire. Still routed, deprecated, gone one release from now — use `invoke` |
| `error` | something broke; `fatal: true` tells the host to say so instead of showing a blank. The host logs it against the plugin |
| `request` | ask for a page of a channel's messages. A host may decline silently — a request is not a grant, and Serene Pub declines today |
| `save-state` | small view state the host returns as `state` on the next mount. The host may cap or drop it, and Serene Pub drops it today |

The actions a frame invokes that change a message — hide, regenerate, extend, delete, edit,
swipe — are gated on a person being in the frame right now: a real, recent activation with the
frame holding the page's focus. An invoke on load or on a timer is refused with a warning. That is
a mitigation, not a permission check: the server judges every fire against the viewer's own
permissions, exactly as it does for a click on the message row.

A frame never writes a message and never reaches storage. It renders what it is sent and it
fires actions by name. That is the boundary, and it is why an opponent's hidden fleet can be on the
server while the board is on screen: the board is a message on a channel the frame views; the
fleet is not. See [Storage](storage).

## Sizing and settings

A widget declares `settings` in the SDK's one field language, and the host delivers their values
as the `settings` message — defaults filled, the person's changes over them, re-sent when they
change. That is the same `settings.v1` a component widget reads off its context. A `session-view` or
`page` frame has no instance to resolve settings for and receives none; read what you need off the
`session` message and the messages themselves, and keep a default for when nothing arrives.

Size comes from the `layout` message: `box.px` is the measured box, `tier` says how roomy the
session is, and `edges` says which sides of the zone the widget touches. The cell counts on that
message are advisory and belong to the interim grid; do not lay out by them.
