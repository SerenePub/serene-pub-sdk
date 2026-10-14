<script lang="ts">
	/**
	 * Core's Turn order widget as a remote component (W1): the component
	 * context, as the widget context, around the widget.
	 */
	import { setContext, untrack } from "svelte"
	import type { ComponentContext } from "@serene-pub/sdk/component"
	import { WIDGET_CONTEXT_KEY } from "@serene-pub/core-catalog/widgets"
	import TurnOrderWidget from "./TurnOrderWidget.svelte"
	import { widgetRefFromComponent } from "../widgetRef.svelte"

	let { ctx }: { ctx: ComponentContext } = $props()

	// The context is the mount's, handed once: its sections move, it does not.
	setContext(
		WIDGET_CONTEXT_KEY,
		widgetRefFromComponent(
			untrack(() => ctx),
			{ id: "turn-order", instanceId: "turn-order", title: "Turn order" }
		)
	)
</script>

<TurnOrderWidget />
