<script lang="ts">
	/**
	 * Every stock Skeleton theme, and the light/dark switch.
	 *
	 * The list is read off the installed `@skeletonlabs/skeleton` rather than
	 * written down, so a Skeleton release that adds a theme adds it here too.
	 * SP maintains no token compatibility of any kind (RESEARCH §7b) — the
	 * token surface is whatever Skeleton version core currently ships — and a
	 * hardcoded list would be exactly the artifact that ruling refuses.
	 */
	import { themes } from 'virtual:serene-pub/surfaces'
	import { theme } from './theme.svelte.js'

	const label = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)
</script>

<div class="flex items-center gap-2">
	<label class="sr-only" for="harness-theme">Theme</label>
	<select
		id="harness-theme"
		class="select w-full text-xs"
		value={theme.current.theme}
		onchange={(e) => theme.set({ theme: e.currentTarget.value })}
	>
		{#each themes as t (t)}
			<option value={t}>{label(t)}</option>
		{/each}
		{#if !themes.length}
			<option value={theme.current.theme}>{label(theme.current.theme)}</option>
		{/if}
	</select>
	<button
		type="button"
		class="btn btn-sm preset-tonal"
		title="Switch between light and dark"
		aria-pressed={theme.current.mode === 'dark'}
		onclick={() => theme.toggleMode()}
	>
		{theme.current.mode === 'dark' ? '🌙' : '☀️'}
	</button>
</div>

<style>
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
	}
</style>
