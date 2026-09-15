<script lang="ts">
	/**
	 * The harness shell: what this package announces, on the left; whichever
	 * surface is selected, on the right. The list is the announcement's, never
	 * a directory scan — a surface visible here is a surface an instance would
	 * be offered, or one of the two is wrong and worth finding out now.
	 *
	 * The chrome is themed with the product's own Skeleton tokens rather than
	 * a neutral palette. That is a reversal of an earlier decision, and the
	 * reason is concrete: the controls are styled by Skeleton `@utility`
	 * classes, so the harness has to load that layer to render a generated
	 * form at all. Once it is loaded, dressing the tool in a different palette
	 * than the surface would only make the two harder to compare.
	 */
	import '../app.css'
	import { page } from '$app/state'
	import { manifest, packageDir } from 'virtual:serene-pub/surfaces'
	import { theme } from '$lib/theme.svelte.js'
	import ThemePicker from '$lib/ThemePicker.svelte'

	let { children } = $props()

	// app.html carries a default so the first paint is themed; this makes the
	// persisted choice win from the first frame the client owns.
	$effect(() => theme.apply())

	const frames = $derived(manifest.targets.filter((t) => t.kind === 'frame'))
	const components = $derived(manifest.targets.filter((t) => t.kind === 'component'))
	const withSettings = $derived(manifest.targets.filter((t) => t.settings).length)
	const current = $derived(page.params.id)
</script>

<div class="flex h-screen">
	<nav
		class="bg-surface-50-950 border-surface-200-800 harness-scroll flex w-64 flex-none flex-col overflow-y-auto border-r p-3"
	>
		<div>
			<strong class="block text-base">{manifest.title}</strong>
			<div class="text-surface-600-400 harness-mono text-xs">
				{manifest.id}{manifest.version ? ` @ ${manifest.version}` : ''}
			</div>
		</div>

		<a
			href="/"
			class="mt-3 rounded px-2 py-1 text-sm {page.url.pathname === '/'
				? 'preset-tonal-primary'
				: 'hover:preset-tonal-surface'}">Overview</a
		>
		<a
			href="/controls"
			class="rounded px-2 py-1 text-sm {page.url.pathname === '/controls'
				? 'preset-tonal-primary'
				: 'hover:preset-tonal-surface'}"
		>
			Controls sandbox
		</a>

		{#if frames.length}
			<div class="text-surface-600-400 mt-4 mb-1 text-[0.66rem] tracking-widest uppercase">
				Frame surfaces
			</div>
			{#each frames as t (t.id)}
				<a
					href="/t/{t.id}"
					class="rounded px-2 py-1 leading-tight {current === t.id
						? 'preset-tonal-primary'
						: 'hover:preset-tonal-surface'}"
				>
					<span class="text-sm">{t.label}</span>
					<span class="text-surface-600-400 block text-xs">
						{t.point}{t.settings ? ' · props' : ''}
					</span>
				</a>
			{/each}
		{/if}

		{#if components.length}
			<div class="text-surface-600-400 mt-4 mb-1 text-[0.66rem] tracking-widest uppercase">
				Components
			</div>
			{#each components as t (t.id)}
				<a
					href="/t/{t.id}"
					class="rounded px-2 py-1 leading-tight {current === t.id
						? 'preset-tonal-primary'
						: 'hover:preset-tonal-surface'}"
				>
					<span class="text-sm">{t.label}</span>
					<span class="text-surface-600-400 block text-xs">
						{t.framework ?? 'svelte'}{t.settings ? ' · settings' : ''}
					</span>
				</a>
			{/each}
		{/if}

		{#if !manifest.targets.length}
			<div class="text-surface-600-400 mt-4 mb-1 text-[0.66rem] tracking-widest uppercase">
				Nothing announced
			</div>
			<p class="text-surface-600-400 px-2 text-xs">
				This package announces no UI surfaces yet.
			</p>
		{/if}

		<div class="mt-auto flex flex-col gap-2 pt-4">
			{#if withSettings === 0}
				<p class="text-surface-600-400 text-xs">
					No surface declares settings yet, so there are no generated controls to
					preview. The sandbox still shows every control.
				</p>
			{/if}
			<ThemePicker />
			<div class="text-surface-600-400 harness-mono truncate text-[0.7rem]" title={packageDir}>
				{packageDir}
			</div>
		</div>
	</nav>
	<main class="flex min-w-0 flex-1 flex-col">
		{@render children?.()}
	</main>
</div>
