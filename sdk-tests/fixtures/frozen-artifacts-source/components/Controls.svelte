<script lang="ts">
	// sp-* elements: tabs (change), a switch (change), a badge; a plain input with keys.
	import type { ComponentContext } from '@serene-pub/component-client'
	let { ctx }: { ctx: ComponentContext } = $props()
	let tab = $state('one')
	let on = $state(false)
	let draft = $state('')
	let heard = $state<string[]>([])
	const onkey = (e: CustomEvent<{ key: string }>) => {
		heard = [...heard, e.detail.key]
		if (e.detail.key === 'Enter') ctx.invoke('commit', { payload: { text: draft } })
	}
</script>

<div class="controls">
	<sp-tabs value={tab} label="Pages" onchange={(e: CustomEvent<{ value: string }>) => (tab = e.detail.value)}>
		<sp-tab value="one">One</sp-tab>
		<sp-tab value="two">Two</sp-tab>
		<sp-tab-panel value="one"><p class="panel-one">first page</p></sp-tab-panel>
		<sp-tab-panel value="two"><p class="panel-two">second page</p></sp-tab-panel>
	</sp-tabs>
	<p class="tab">tab: {tab}</p>
	<sp-switch class="toggle" label="Loud" checked={on} onchange={(e: CustomEvent<{ checked: boolean }>) => (on = e.detail.checked)}></sp-switch>
	<sp-badge class="state" tone={on ? 'success' : 'neutral'}>{on ? 'on' : 'off'}</sp-badge>
	<input class="field" keys="Enter Escape" bind:value={draft} {onkey} />
	<p class="heard">{heard.join(' ')}</p>
</div>
