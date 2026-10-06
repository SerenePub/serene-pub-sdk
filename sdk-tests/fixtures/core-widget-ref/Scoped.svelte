<script lang="ts">
	import type { ComponentContext } from '@serene-pub/component-client'
	import { widgetRefFromComponent } from '../../../core-catalog/components/shared/widgetRef.svelte'

	// A core widget's view of the scoped sections its host granted — read off
	// the context the shared helper builds, by the SDK's one table.
	let { ctx }: { ctx: ComponentContext } = $props()
	const ref = widgetRefFromComponent(ctx, { id: 'stats', instanceId: 'stats', title: 'Stats' })
	const state = $derived(ref.current.session_state?.v1)
	const cast = $derived(ref.current.characters?.v1)
</script>

<p class="state">{state ? `session ${state.sessionId}, ${state.slots.length} slots` : 'no state'}</p>
<p class="cast">{cast ? cast.members.map((m) => m.name).join(', ') : 'no cast'}</p>
