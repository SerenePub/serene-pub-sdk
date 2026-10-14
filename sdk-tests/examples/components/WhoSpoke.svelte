<script lang="ts">
	import type { ComponentContext } from '@serene-pub/component-client'

	let { ctx }: { ctx: ComponentContext } = $props()

	// `ctx` is reactive: this redraws when the page posts new messages.
	const rows = $derived(
		(ctx.messages ?? [])
			.slice(-3)
			.reverse()
			.map((m) => ({ id: m.id, who: m.speakerLabel ?? m.role })),
	)
</script>

<div class="space-y-2 p-3">
	<p class="text-sm font-semibold">Who spoke last</p>
	<ol class="text-sm">
		{#each rows as row (row.id)}
			<li>{row.who}</li>
		{/each}
	</ol>
	<button type="button" class="btn preset-tonal" onclick={() => ctx.invoke('advance')}>
		<sp-icon name="play" size="14"></sp-icon>
		Continue
	</button>
</div>
