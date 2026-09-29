<script lang="ts">
	import type { ComponentContext } from '@serene-pub/component-client'
	import { widgetRefFromComponent } from '../../../core-catalog/components/sessions/shared/widgetRef.svelte'

	// The conversation's own view of its context, and the view state it keeps.
	let { ctx }: { ctx: ComponentContext } = $props()
	const ref = widgetRefFromComponent(ctx, { id: 'messages', instanceId: 'messages', title: 'Messages' })
	const held = $derived(JSON.stringify((ref.current as unknown as { state?: unknown }).state ?? null))
</script>

<p class="held">{held}</p>
<button
	type="button"
	class="save"
	onclick={() => (ref.current as unknown as { saveState(s: unknown): void }).saveState({ enterHint: 'seen' })}
>save</button>
