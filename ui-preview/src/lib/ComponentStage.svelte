<script lang="ts">
	/**
	 * An in-document component (10 §2's virtual tier), mounted through the same
	 * three-call ABI core uses — `mount(el, props, ctx)` / `update` / `destroy`
	 * for vanilla, Svelte 5's `mount`/`unmount` for a Svelte default export.
	 *
	 * Two honesties the harness keeps:
	 *
	 *   · **Errors are caught and shown, not swallowed.** Core wraps every ABI
	 *     call in try/catch (10 §7) precisely because a throwing surface must
	 *     not take the page with it; a harness that let the throw escape would
	 *     be teaching the opposite of what ships.
	 *   · **No adapter is faked.** React needs a first-party adapter passing the
	 *     conformance kit before "works with React" is a claim anyone verified,
	 *     and the harness says so rather than half-mounting one.
	 */
	import { mount as svelteMount, unmount as svelteUnmount, untrack } from 'svelte'
	import type { PreviewTarget } from '@serene-pub/sdk'
	import { components } from 'virtual:serene-pub/surfaces'
	import { theme } from './theme.svelte.js'
	import type { Fixtures } from './fixtures.js'

	interface Props {
		target: PreviewTarget
		fixtures: Fixtures
		/** Values from the surface's generated form — what `ctx.settings` is. */
		settings?: Record<string, unknown>
	}
	let { target, fixtures, settings = {} }: Props = $props()

	let host = $state<HTMLDivElement | null>(null)
	let error = $state<string | null>(null)
	let mounted: { destroy: () => void; update?: (p: unknown) => void } | null = null

	/**
	 * The live props object handed to the component at mount, and mutated
	 * afterwards.
	 *
	 * This indirection is the ABI, not a convenience: Svelte 5's `mount()`
	 * reads the props object once, so passing a fresh object on every change
	 * would do nothing at all — the component would render its first values
	 * forever. 10 §7 names the shape ("Svelte 5 via `mount`/`unmount` with a
	 * `$state` props object"), and it is also what makes the recycling
	 * contract real (10 §4): props move, the handle does not, and nothing
	 * remounts because a setting changed.
	 */
	const live = $state<Record<string, unknown>>({})

	/**
	 * What the component receives at render. `settings` is the generated
	 * form's output — component-side settings, which is the only kind that
	 * may reach a browser (12 §6) — and `theme` is the active theme id, which
	 * 10 §6 rules is a prop rather than an event channel.
	 */
	const ctx = $derived({
		...fixtures.ctx,
		settings: { ...((fixtures.ctx.settings as object) ?? {}), ...settings },
		theme: theme.current.theme,
		mode: theme.current.mode,
		surface: target.point
	})
	const incoming = $derived({ ...fixtures.props, ctx })

	$effect(() => {
		const el = host
		const load = components[target.id]
		if (!el || !load) return
		// Named `current`, not `live`: the props object below is `live`, and a
		// shadowing local here silently handed the component `true` as its
		// entire props.
		let current = true
		error = null

		load()
			.then((mod) => {
				if (!current) return
				teardown()
				// The default export, or the module itself for the vanilla ABI's
				// `{ mount, update, destroy }` shape. A named Svelte export is
				// deliberately not guessed at: core mounts what the declaration
				// points to, and a harness that searched for a component core
				// would not find is a harness that lies.
				const exported = (mod.default ?? mod) as any
				if (target.framework === 'react') {
					error =
						'React components need the first-party React adapter, which the harness ' +
						'does not ship yet (10 §7). Preview it as a frame surface, or use Svelte/vanilla.'
					return
				}
				if (typeof exported?.mount === 'function') {
					// Vanilla ABI: the module owns its own root.
					const handle = exported.mount(el, live, ctx)
					mounted = {
						destroy: () => exported.destroy?.(handle),
						update: (p) => exported.update?.(handle, p)
					}
				} else if (typeof exported === 'function') {
					const instance = svelteMount(exported, { target: el, props: live })
					mounted = { destroy: () => svelteUnmount(instance) }
				} else {
					error =
						`${target.entry} exports nothing mountable — expected a Svelte component as ` +
						`the default export, or a { mount, update, destroy } module.`
				}
			})
			.catch((e) => {
				if (current) error = `${e?.message ?? e}`
			})

		return () => {
			current = false
			teardown()
		}
	})

	/**
	 * Prop changes go through `update` where the ABI has one — recycling a
	 * handle instead of destroy-then-mount is the contract (10 §4), and the
	 * harness should exercise the path core takes.
	 *
	 * Deep-read for the same reason the frame stage does it: naming the object
	 * subscribes to the reference, and every edit in the generated settings
	 * form changes a field inside it, not the object itself.
	 */
	const signature = $derived.by(() => {
		try {
			return JSON.stringify(incoming)
		} catch {
			return String(Math.random())
		}
	})

	$effect(() => {
		// Deep-read for the dependency, then fold into the live object the
		// component is already holding. The fold is untracked because diffing
		// keys reads `live` and writing it would otherwise be a read and a
		// write of the same state in one effect — a wedged page, not an error.
		void signature
		untrack(() => {
			for (const k of Object.keys(live)) if (!(k in incoming)) delete live[k]
			Object.assign(live, incoming)
		})
		try {
			mounted?.update?.(live)
		} catch (e) {
			error = `update() threw: ${(e as Error).message}`
		}
	})

	function teardown() {
		try {
			mounted?.destroy()
		} catch (e) {
			error = `destroy() threw: ${(e as Error).message}`
		}
		mounted = null
		if (host) host.innerHTML = ''
	}
</script>

<div class="stage">
	<div class="bar">
		<span class="muted">{target.point}</span>
		<span class="muted">{target.framework ?? 'svelte'}</span>
		<span class="grow"></span>
		<code class="muted">{target.entry}</code>
	</div>
	{#if error}
		<div class="problems">
			<h3>The component did not mount</h3>
			<pre>{error}</pre>
		</div>
	{/if}
	<div class="body"><div bind:this={host} class="mount"></div></div>

	<details class="received">
		<summary>What the component received</summary>
		<pre>{JSON.stringify(live, null, 2)}</pre>
	</details>
</div>

<style>
	.stage {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
	}
	.bar {
		display: flex;
		gap: 0.6rem;
		align-items: center;
		padding: 0.5rem 0.8rem;
		border-bottom: 1px solid var(--line);
	}
	.grow {
		flex: 1;
	}
	.body {
		flex: 1;
		min-height: 0;
		overflow: auto;
		padding: 1.2rem;
	}
	.problems {
		margin: 0.8rem;
	}
	.received {
		border-top: 1px solid currentColor;
		padding: 0 0.8rem 0.6rem;
		max-height: 30vh;
		overflow: auto;
	}
	.received summary {
		cursor: pointer;
		padding: 0.5rem 0;
		font-size: 0.8rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		opacity: 0.7;
	}
	.received pre {
		font-size: 0.74rem;
		margin: 0;
	}
	pre {
		margin: 0;
		white-space: pre-wrap;
	}
</style>
