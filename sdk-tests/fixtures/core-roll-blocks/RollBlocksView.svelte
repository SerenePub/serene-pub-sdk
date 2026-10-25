<script lang="ts">
	import type { ComponentContext } from '@serene-pub/component-client'
	import MessageBlocksView from '../../../core-catalog/components/shared/messages/MessageBlocksView.svelte'

	// Core's block renderer alone, for the roll form and the dice (Lair
	// rewrite D3), fed from `props`: `blocks`, and `mine` — whether the
	// viewer may answer a form put to its addressee (absent: every form
	// shows its controls). `.fired` is every press the renderer handed up,
	// in order, as JSON — what the page would fire.
	let { ctx }: { ctx: ComponentContext } = $props()
	type Fed = { blocks?: unknown[]; mine?: boolean }
	const p = $derived((ctx.props ?? {}) as Fed)
	let fired = $state<unknown[]>([])
	const onAction = (fn: string, payload?: Record<string, unknown>, action?: string, blockId?: string) => {
		fired = [...fired, { fn, payload, action, blockId }]
	}
	const canAnswer = $derived(p.mine === undefined ? undefined : () => p.mine === true)
</script>

<MessageBlocksView blocks={(p.blocks ?? []) as any[]} {onAction} {canAnswer} />
<span class="fired" hidden>{JSON.stringify(fired)}</span>
