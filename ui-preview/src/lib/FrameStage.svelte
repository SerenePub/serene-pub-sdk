<script lang="ts">
	/**
	 * A frame surface, in the sandbox it will actually live in.
	 *
	 * This is the host half of frame protocol v1, and it is deliberately the
	 * *same* protocol the app's `PluginFrame.svelte` speaks — the message union
	 * is declared once in the SDK (`HostFrameMessage`/`FrameHostMessage`) and
	 * both hosts pin to it, so a surface that works here is not working against
	 * a friendlier harness. In particular the harness keeps the two properties
	 * that make the sandbox mean something:
	 *
	 *   · `sandbox="allow-scripts"` with **no** `allow-same-origin` — opaque
	 *     origin, no cookies, no DOM reach into the harness.
	 *   · channel scoping — a panel that declares `channels` receives only
	 *     those lanes' messages, one post each, never the whole log. Enforced
	 *     host-side, here as in core, because a surface must not be able to
	 *     discover that the harness was lenient about it.
	 *
	 * The one thing the harness adds is visibility: every message in both
	 * directions is logged, because "the frame did nothing" is otherwise
	 * indistinguishable from "the frame never got the post".
	 */
	import { onDestroy, untrack } from 'svelte'
	import type { FramePoint, PreviewTarget } from '@serene-pub/sdk'
	import { themeCssPath } from 'virtual:serene-pub/surfaces'
	import { theme } from './theme.svelte.js'
	import type { Fixtures } from './fixtures.js'

	interface Props {
		target: PreviewTarget
		src: string
		fixtures: Fixtures
		/** Declared props when the surface declares them; fixtures otherwise. */
		props: Record<string, unknown>
		/** Bumped by the harness to force a document reload. */
		reloadKey: number
	}
	let { target, src, fixtures, props, reloadKey }: Props = $props()

	type LogEntry = { dir: 'down' | 'up'; t: string; detail: string; at: string }

	let frame = $state<HTMLIFrameElement | null>(null)
	let port: MessagePort | null = null
	let ready = $state(false)
	let lastSuspended = false
	let suspended = $state(false)
	let log = $state<LogEntry[]>([])

	const surface = $derived<FramePoint>(target.point as FramePoint)
	const channels = $derived(target.channels ?? [])

	const stamp = () => new Date().toISOString().slice(11, 23)

	function record(dir: 'down' | 'up', t: string, detail: unknown) {
		// `untrack` is load-bearing, not tidy. `record` runs inside the push
		// effect and appending reads the existing log — a read and a write of
		// the same state in one effect, which is an infinite loop. The symptom
		// is not an error but a wedged page, so it is worth naming here.
		untrack(() => appendLog(dir, t, detail))
	}

	function appendLog(dir: 'down' | 'up', t: string, detail: unknown) {
		log = [
			{ dir, t, detail: typeof detail === 'string' ? detail : JSON.stringify(detail), at: stamp() },
			...log
		].slice(0, 200)
	}

	function post(msg: Record<string, unknown>) {
		try {
			// `$state.snapshot` is load-bearing, not tidiness: the fixtures are
			// reactive state, and a Svelte proxy is not structured-cloneable —
			// every post would be dropped. Core hands `PluginFrame` plain rows
			// off the wire, so this is the harness matching core's shape rather
			// than the frame having to tolerate the harness's.
			port?.postMessage($state.snapshot(msg))
			record('down', String(msg.t), summarise(msg))
		} catch (e) {
			// The guard stays even so: a fixture file is the modder's, and a
			// DataCloneError that killed the rest of the push would look like
			// the surface ignoring messages it never received.
			record('down', String(msg.t), `DROPPED — uncloneable: ${(e as Error).message}`)
		}
	}

	function summarise(msg: Record<string, unknown>): string {
		if (msg.t === 'channel') return `${msg.channel}: ${(msg.messages as unknown[]).length} message(s)`
		if (msg.t === 'messages') return `${(msg.messages as unknown[]).length} message(s)`
		if (msg.t === 'props') return Object.keys(msg.props as object).join(', ')
		return ''
	}

	function handleLoad() {
		// A fresh channel per document load — a reloaded frame must never
		// receive a stale port. `lastSuspended` resets with it: a reloaded
		// document has never been told to idle, so leaving the flag set would
		// let a running frame sit behind a UI that says "suspended".
		port?.close()
		ready = false
		lastSuspended = false
		const channel = new MessageChannel()
		port = channel.port1
		port.onmessage = (e) => {
			const m = e.data
			if (!m || typeof m !== 'object') return
			if (m.t === 'ready') {
				// No `push()` here. `ready` is read inside `push`, which runs
				// inside the effect, so flipping it re-runs the effect and the
				// batch goes out once. Calling it here as well posted the whole
				// batch twice on every reload — invisible except as a doubled
				// channel log, which is exactly the thing the log is for.
				ready = true
				record('up', 'ready', '')
			} else if (m.t === 'action' && typeof m.fn === 'string') {
				record(
					'up',
					'action',
					`${m.fn}${typeof m.messageId === 'number' ? ` #${m.messageId}` : ''} ${
						m.payload ? JSON.stringify(m.payload) : ''
					}`
				)
			} else {
				record('up', String(m.t ?? '?'), 'not a protocol v1 message — the host ignores it')
			}
		}
		frame?.contentWindow?.postMessage({ t: 'init', protocol: 1, surface }, '*', [channel.port2])
		record('down', 'init', `surface=${surface}`)
	}

	/**
	 * What the host posts, scoped by surface point — because core scopes it,
	 * and a harness that fed every frame everything would be teaching a surface
	 * to depend on data an instance never sends it.
	 *
	 * Read off the three real call sites rather than invented:
	 *
	 *   `panel`        Panel.svelte passes session, channels, messages, props —
	 *                  and the channel-declaring case receives per-lane posts
	 *                  only, never the whole log.
	 *   `session-view` sessions/[id] passes session and messages. No props: the
	 *                  prop is not passed, so PluginFrame's `!== undefined`
	 *                  guard means `{t:'props'}` is never posted at all.
	 *   `page`         routes/x/[...rest] passes src, title and surface only.
	 *                  A page frame receives `init` and nothing else, ever.
	 *
	 * `theme` is the one message the harness adds, and it is marked as such
	 * everywhere it appears.
	 */
	function push() {
		// `ready` is read first, unconditionally, and that ordering is the
		// whole reason the first batch arrives at all. `!port || !ready`
		// short-circuits: on the very first run `port` is still null, so
		// `ready` was never read, so the effect never depended on it, so
		// flipping it later re-ran nothing. The frame sat there having said
		// `ready` to a host that had stopped listening.
		const isReady = ready
		if (!port || !isReady) return

		if (surface === 'panel' || surface === 'session-view')
			post({ t: 'session', session: fixtures.session })

		if (surface === 'panel' && channels.length) {
			// Panel scoping: only this panel's lanes, one post each. Enforced
			// host-side here as in core, so a surface cannot discover that the
			// harness was the lenient one.
			for (const ch of channels)
				post({
					t: 'channel',
					channel: ch,
					messages: fixtures.messages.filter((m) => (m.channel ?? 'main') === ch)
				})
		} else if (surface === 'panel' || surface === 'session-view') {
			post({ t: 'messages', messages: fixtures.messages })
		}

		if (surface === 'panel') post({ t: 'props', props })

		// The active theme, as data (10 §6). A frame is its own document, so it
		// inherits no custom properties from ours — it applies the id and the
		// mode to its own root and lets the token stylesheet it linked resolve
		// them. Core does not send this yet; the harness does, so a surface can
		// be built against it.
		post({ t: 'theme', theme: theme.current.theme, mode: theme.current.mode })
	}

	/**
	 * Re-feed on any change to what the host would post — the frame renders
	 * what core chose to send it, which is the whole privacy story: it can
	 * only ever scrape this.
	 *
	 * The signature is a deep read, and it has to be. Naming `props` in the
	 * effect subscribes to the *reference*, not to the fields inside it, and
	 * the deep read that does happen — `$state.snapshot` in `post` — is
	 * specifically designed **not** to create dependencies. Without this, a
	 * declared prop edited in the generated form changes the form and nothing
	 * else: the value is right, the frame never hears about it.
	 */
	const signature = $derived.by(() => {
		try {
			return JSON.stringify({
				session: fixtures.session,
				messages: fixtures.messages,
				props,
				surface,
				theme: theme.current,
			})
		} catch {
			// Unserialisable fixtures are the modder's business and `post`
			// already reports the drop; re-pushing every tick beats going deaf.
			return String(Math.random())
		}
	})

	$effect(() => {
		void signature
		push()
	})

	$effect(() => {
		const s = suspended
		if (!port || !ready) return
		if (s !== lastSuspended) {
			lastSuspended = s
			post({ t: s ? 'suspend' : 'resume' })
		}
	})

	onDestroy(() => port?.close())
</script>

<div class="stage">
	<div class="bar">
		<span class="pill" class:on={ready}>{ready ? 'ready' : 'waiting for ready'}</span>
		<span class="muted">{surface}</span>
		{#if channels.length}
			<!-- Stated, not toggled. This was a switch, and the off position
			     posted `{t:'messages'}` to a channel-declaring panel — a shape
			     core's scoping path never sends. A control that can only ever
			     produce a lie about production is worth deleting. -->
			<span
				class="pill on"
				title="Declared channels. This panel receives only these lanes, one post each — never the whole log."
			>
				channels: {channels.join(', ')}
			</span>
		{/if}
		<button aria-pressed={suspended} onclick={() => (suspended = !suspended)}>
			{suspended ? 'suspended' : 'suspend'}
		</button>
		<span class="grow"></span>
		<code class="muted" title="Served under core's frame CSP, with connect-src widened to reach Vite's HMR socket — the one dev relaxation."
			>{target.entry}</code
		>
	</div>

	<details class="hint">
		<summary>Theming this frame</summary>
		<p>
			A frame is its own document under an opaque origin, so it inherits nothing from the
			page around it. Link the harness's token stylesheet and apply what arrives on the
			channel — the same two attributes the app sets on its own root:
		</p>
		<pre><code>{`<link rel="stylesheet" href="${themeCssPath}">`}</code></pre>
		<pre><code>{`port.onmessage = (e) => {
  if (e.data.t !== 'theme') return
  document.documentElement.dataset.theme = e.data.theme
  document.documentElement.dataset.mode  = e.data.mode
}`}</code></pre>
		<p>
			The stylesheet carries every stock theme's custom properties and nothing else — no
			utility classes, because your own build owns those. That means the
			<em>palette</em> follows the theme automatically, but the light/dark
			<em>mapping</em> is yours: Skeleton builds that on top with <code>light-dark()</code>
			in a base layer written in Tailwind at-rules, which cannot be served as plain CSS.
			Pick your own sides of the ramp:
		</p>
		<pre><code>{`body                    { background: var(--color-surface-50)  }
[data-mode="dark"] body { background: var(--color-surface-950) }`}</code></pre>
		<p>
			Two constraints this frame enforces because production does. It is served under
			core's CSP (<code>script-src 'self'</code>), so an <em>inline</em> script is
			blocked — load your surface from a file. And a frame is an
			<strong>opaque origin</strong>, so it sends <code>Origin: null</code> and a
			<code>&lt;script type="module"&gt;</code> — which is always CORS-fetched — is
			refused, because neither core's plugin-ui route nor this harness answers with
			<code>Access-Control-Allow-Origin</code>. Use a classic
			<code>&lt;script src="…"&gt;</code>; it is not CORS-fetched and loads fine.
		</p>
	</details>

	<details class="hint">
		<summary>Where this harness is not production</summary>
		<p>
			Everything the harness does differently, in one place, because a fidelity tool that
			hid its own divergences would be the worst kind:
		</p>
		<ul>
			<li>
				<strong><code>{'{ t: "theme" }'}</code> is harness-only.</strong> Core does not send it.
				Read it defensively and keep a default.
			</li>
			<li>
				<strong>Declared props are harness-only.</strong> Core's <code>surfacesOf</code> drops
				<code>settings</code>, and the panel host posts a fixed
				<code>{'{ panelId, title }'}</code>. Nothing persists a value an admin sets.
			</li>
			<li>
				<strong><code>{themeCssPath}</code> is harness-only.</strong> Core serves nothing at
				that URL. Guard the link, or ship your own tokens, until it does.
			</li>
			<li>
				<strong>Declared <code>channels</code> are harness-only for a plugin panel.</strong>
				<code>surfacesOf</code> narrows a stored surface to <code>{'{ entry, title }'}</code>,
				so a panel's declared lanes do not survive install today.
			</li>
			<li>
				<strong><code>connect-src</code> is wider here.</strong> Production grants only the
				hosts your manifest declares; this frame also reaches Vite's HMR socket, because
				otherwise nothing hot-reloads.
			</li>
			<li>
				<strong>Your files go through Vite.</strong> Core serves the installed bytes verbatim,
				hash and all. A transform that only happens in dev is a difference you should not
				build on.
			</li>
		</ul>
		<p>
			What is <em>not</em> different, deliberately: the sandbox attributes, the CSP's other
			directives, protocol v1's message shapes, and which messages each surface point
			receives — a <code>page</code> frame gets <code>init</code> and nothing else here,
			exactly as in the app.
		</p>
	</details>

	<div class="body" class:suspended>
		{#key reloadKey}
			<iframe
				bind:this={frame}
				{src}
				title={target.label}
				sandbox="allow-scripts"
				onload={handleLoad}
			></iframe>
		{/key}
	</div>

	<details class="log" open>
		<summary>Channel log <span class="muted">({log.length})</span></summary>
		<ol>
			{#each log as e}
				<li class={e.dir}>
					<span class="at">{e.at}</span>
					<span class="arrow">{e.dir === 'down' ? '→' : '←'}</span>
					<strong>{e.t}</strong>
					<span class="muted">{e.detail}</span>
				</li>
			{/each}
			{#if !log.length}
				<li class="muted">
					Nothing yet. A surface joins the conversation by posting <code>{'{ t: "ready" }'}</code>
					back through the port it receives in <code>init</code>.
				</li>
			{/if}
		</ol>
	</details>
</div>

<style>
	.stage {
		display: flex;
		flex-direction: column;
		min-height: 0;
		flex: 1;
	}
	.bar {
		display: flex;
		gap: 0.5rem;
		align-items: center;
		padding: 0.5rem 0.8rem;
		border-bottom: 1px solid var(--line);
	}
	.grow {
		flex: 1;
	}
	.pill {
		font-size: 0.74rem;
		border: 1px solid var(--line);
		border-radius: 999px;
		padding: 0.1rem 0.55rem;
		color: var(--muted);
	}
	.pill.on {
		color: var(--accent);
		border-color: var(--accent);
	}
	.body {
		flex: 1;
		min-height: 0;
		background: var(--panel);
	}
	.body.suspended {
		opacity: 0.55;
	}
	iframe {
		width: 100%;
		height: 100%;
		border: 0;
		display: block;
	}
	.hint {
		border-top: 1px solid var(--line, currentColor);
		padding: 0 0.8rem 0.6rem;
		font-size: 0.8rem;
	}
	.hint summary {
		cursor: pointer;
		padding: 0.5rem 0;
		font-size: 0.8rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		opacity: 0.7;
	}
	.hint pre {
		overflow-x: auto;
		font-size: 0.74rem;
	}
	.log {
		border-top: 1px solid var(--line);
		max-height: 34vh;
		overflow-y: auto;
		padding: 0 0.8rem 0.6rem;
	}
	summary {
		cursor: pointer;
		padding: 0.5rem 0;
		font-size: 0.8rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--muted);
	}
	ol {
		list-style: none;
		margin: 0;
		padding: 0;
		font-family: ui-monospace, Menlo, monospace;
		font-size: 0.76rem;
	}
	li {
		display: flex;
		gap: 0.5rem;
		padding: 0.1rem 0;
	}
	li.up strong {
		color: var(--accent);
	}
	.at {
		color: var(--muted);
	}
	.arrow {
		width: 1ch;
	}
</style>
