<script lang="ts">
	import type { ComponentContext } from '@serene-pub/component-client'

	// Declared `reads: ['attendance', 'viewer']`: the page sends this widget
	// those two sections and nothing else, so it never redraws for a message.
	let { ctx }: { ctx: ComponentContext } = $props()

	const me = $derived(ctx.viewer?.userId ?? null)
	// The owner and every guest are listed; `here` is who has it open now.
	const here = $derived((ctx.attendance?.people ?? []).filter((p) => p.here))
	const typing = $derived(here.filter((p) => p.typing && p.userId !== me).map((p) => p.name))
</script>

<div class="space-y-2 p-3">
	<p class="text-sm font-semibold">{ctx.t('Here now')}</p>
	{#if !ctx.attendance}
		<p class="text-sm text-surface-600-400">{ctx.t('Loading…')}</p>
	{:else if here.length === 0}
		<p class="text-sm text-surface-600-400">{ctx.t('No one has this session open.')}</p>
	{:else}
		<ul class="text-sm">
			{#each here as person (person.userId)}
				<li data-widget-part="acme.widget-examples:who-is-here.person" class="flex items-center gap-2">
					<sp-avatar ref={`user:${person.userId}`} size="sm"></sp-avatar>
					{person.name}
					{#if person.userId === me}<span data-widget-part="acme.widget-examples:who-is-here.you" class="text-surface-600-400">({ctx.t('you')})</span>{/if}
					{#if person.role === 'owner'}<sp-icon name="crown" size="12" label={ctx.t('Owner')}></sp-icon>{/if}
				</li>
			{/each}
		</ul>
		<p data-widget-part="acme.widget-examples:who-is-here.typing" class="text-xs italic text-surface-600-400" aria-live="polite">
			{typing.length ? `${typing.join(', ')} ${ctx.t(typing.length === 1 ? 'is typing…' : 'are typing…')}` : ''}
		</p>
	{/if}
</div>
