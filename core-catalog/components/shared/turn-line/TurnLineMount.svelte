<script lang="ts">
	/**
	 * Core's turn-line widget as a remote component: the component context, as
	 * the native widget context, around `TurnLineWidget`.
	 */
	import { setContext, untrack } from "svelte"
	import type { ComponentContext } from "@serene-pub/sdk/component"
	import { WIDGET_CONTEXT_KEY } from "@serene-pub/core-catalog/conversation"
	import TurnLineWidget from "./TurnLineWidget.svelte"
	import WidgetBoundary from "../WidgetBoundary.svelte"
	import { widgetRefFromComponent } from "../widgetRef.svelte"

	let { ctx }: { ctx: ComponentContext } = $props()

	// The context is the mount's, handed once: its sections move, it does not.
	setContext(
		WIDGET_CONTEXT_KEY,
		widgetRefFromComponent(
			untrack(() => ctx),
			{ id: "turn-line", instanceId: "turn-line", title: "Turn line" }
		)
	)
</script>

<WidgetBoundary {ctx}><TurnLineWidget /></WidgetBoundary>
