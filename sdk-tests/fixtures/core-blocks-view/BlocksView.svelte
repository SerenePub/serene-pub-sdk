<script lang="ts">
	import type { ComponentContext } from '@serene-pub/component-client'
	import MessageBlocksView from '../../../core-catalog/components/sessions/messages/MessageBlocksView.svelte'

	// Core's block renderer alone, fed from `props`: `blocks`, and the ids a
	// verdict calls superseded (`stale`; absent = no verdict handed down).
	// `.asked` shows the ids the verdict was asked about since the last feed,
	// in order — the renderer's calls, which its markup does not show.
	let { ctx }: { ctx: ComponentContext } = $props()
	type Fed = { blocks?: unknown[]; stale?: string[] }
	let p = $state<Fed>((ctx.props ?? {}) as Fed)
	$effect(() => ctx.subscribe((s) => s === 'props' && (p = (ctx.props ?? {}) as Fed)))
	const verdict = $derived.by(() => {
		const stale = p.stale
		if (!stale) return undefined
		const asked: string[] = []
		const isStale = (b: { id?: unknown }) => {
			asked.push(String(b.id))
			return stale.includes(String(b.id))
		}
		return { asked, isStale }
	})
	// Read after the renderer drew: it asks while its blocks render.
	let asked = $state('[]')
	$effect(() => {
		asked = JSON.stringify(verdict?.asked ?? [])
	})
</script>

<MessageBlocksView blocks={(p.blocks ?? []) as any[]} onAction={() => {}} isStale={verdict?.isStale} />
<span class="asked" hidden>{asked}</span>
