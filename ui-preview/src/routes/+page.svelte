<script lang="ts">
	import { manifest } from 'virtual:serene-pub/surfaces'
	import Problems from '$lib/Problems.svelte'
</script>

<div class="wrap">
	<h1>Surface harness</h1>
	<p class="muted">
		Rendering what <code>{manifest.id}</code> announces. Edit a surface and it hot-reloads;
		edit what the package <em>announces</em> and the list rebuilds.
	</p>

	<Problems problems={manifest.problems} />

	{#if manifest.targets.length}
		<div class="grid">
			{#each manifest.targets as t (t.id)}
				<a class="card" href="/t/{t.id}">
					<strong>{t.label}</strong>
					<span class="muted">{t.kind === 'frame' ? t.point : (t.framework ?? 'svelte')}</span>
					<code>{t.entry}</code>
					<span class="muted src">declared in {t.source}</span>
				</a>
			{/each}
		</div>
	{:else}
		<div class="none">
			<p>This package announces no UI surfaces.</p>
			<p class="muted">Add one to your entry module:</p>
			<pre><code>{`export default announce({ ns: 'acme.dice', … })
	.surfaces({
		panels: [{ id: 'tray', entry: 'ui/tray.html', title: 'Dice tray' }]
	})`}</code></pre>
			<p class="muted">
				A frame surface is a document mounted in an opaque-origin iframe. A component is
				code the host mounts in its own document — declared with <code>component(…)</code> and
				passed to <code>.components(…)</code>.
			</p>
		</div>
	{/if}
</div>

<style>
	.wrap {
		padding: 2rem 2.4rem;
		max-width: 60rem;
		overflow-y: auto;
	}
	h1 {
		margin: 0 0 0.3rem;
		font-size: 1.4rem;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
		gap: 0.8rem;
		margin-top: 1.4rem;
	}
	.card {
		display: grid;
		gap: 0.25rem;
		border: 1px solid var(--line);
		border-radius: 9px;
		padding: 0.8rem 0.9rem;
		background: var(--panel);
		color: var(--ink);
	}
	.card:hover {
		border-color: var(--accent);
		text-decoration: none;
	}
	.card code {
		font-size: 0.76rem;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.src {
		font-size: 0.72rem;
	}
	.none pre {
		background: var(--code);
		padding: 0.9rem 1rem;
		border-radius: 8px;
		overflow-x: auto;
	}
</style>
