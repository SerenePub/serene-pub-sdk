/**
 * The frame's entry point: mount the playground, then speak the host protocol.
 *
 * The order matters and is the whole of the handshake. The message listener is
 * installed before anything else, because a host that has already embedded this
 * document may post the moment it sees `ready` — and `ready` is posted last, so
 * by the time anyone can answer, there is something to answer with. A `load`
 * that somehow arrives earlier is held rather than dropped.
 *
 * What leaves this frame: `ready` once, a content height whenever it changes,
 * and whether a run is in flight. Nothing else. What this frame reads: the code
 * and the theme the host sends. It never touches `location`, cookies, storage
 * or the network — there is no `fetch` in the bundle, and the opaque origin it
 * runs in would not give it anything useful if there were.
 */

import './styles.css'

import { loadBundle } from './lazyBundle.js'
import {
	parseHostMessage,
	type FrameMessage,
	type LoadMessage,
	type PlaygroundTheme,
} from './protocol.js'
import { useTranspiler } from './runner.js'
import { createPlayground, type Playground } from './ui.js'

/**
 * How source gets compiled in a browser: sucrase as a classic script, fetched
 * on the first Run.
 *
 * Installed here, first thing, because `runner.ts`'s default is an `import()`
 * of the package — right under node, where the suite runs it, and impossible
 * here, where a module fetch from an opaque origin is CORS-blocked.
 */
useTranspiler(async (source) => (await loadBundle('sucrase')).transpile(source))

/**
 * Both sides post to `"*"`.
 *
 * `sandbox="allow-scripts"` without `allow-same-origin` puts this document on
 * an **opaque origin**, which serialises to the string `"null"` — not a valid
 * `targetOrigin`, so a stricter address is not available to either side. The
 * protocol is built around that: nothing secret travels, and everything
 * arriving is validated rather than trusted.
 */
function post(message: FrameMessage): void {
	if (window.parent === window) return
	window.parent.postMessage(message, '*')
}

let playground: Playground | undefined
/** A `load` that beat the mount. Held, because dropping it is a blank editor. */
let pending: LoadMessage | undefined
let theme: PlaygroundTheme = 'light'

function apply(message: LoadMessage): void {
	theme = message.theme
	playground!.setTheme(theme)
	playground!.load(message.code, message.lang)
	if (message.autorun) playground!.run()
}

window.addEventListener('message', (event: MessageEvent) => {
	const message = parseHostMessage(event.data)
	if (!message) return
	if (message.t === 'playground:theme') {
		theme = message.theme
		playground?.setTheme(theme)
		return
	}
	if (!playground) {
		pending = message
		return
	}
	apply(message)
})

const root = document.getElementById('playground')
if (!root) throw new Error('#playground is missing from index.html')

playground = createPlayground(root, {
	onRunState: (running) => post({ t: 'playground:state', running }),
})
playground.setTheme(theme)

if (pending) {
	apply(pending)
	pending = undefined
}

/**
 * The host sizes its iframe to whatever this reports — which is why the mount
 * root is measured and NOT `documentElement`.
 *
 * A frame's `<html>` is stretched to the frame. Report its height and the
 * number is whatever the host last set, so the box can grow and can never
 * shrink again: open the Graph pane once and the iframe stays tall forever.
 * The mounted element is the actual content, and `body` carries no margin
 * (`styles.css`), so its box IS the document's height.
 *
 * Deduplicated, because a ResizeObserver fires for every frame of a pane
 * expanding and a host that resizes on each one visibly judders.
 */
let lastHeight = -1
function reportHeight(): void {
	const px = Math.ceil(root!.getBoundingClientRect().height)
	if (px === lastHeight) return
	lastHeight = px
	post({ t: 'playground:height', px })
}

new ResizeObserver(reportHeight).observe(root)
reportHeight()

post({ t: 'playground:ready', v: 1 })
