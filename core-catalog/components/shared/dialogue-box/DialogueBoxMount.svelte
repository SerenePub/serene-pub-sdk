<script lang="ts">
	/**
	 * Core's dialogue-box widget as a remote component: the component context,
	 * as the native widget context, around `DialogueBoxWidget`.
	 */
	import { setContext, untrack } from "svelte"
	import type { ComponentContext } from "@serene-pub/sdk/component"
	import { WIDGET_CONTEXT_KEY } from "@serene-pub/core-catalog/conversation"
	import DialogueBoxWidget from "./DialogueBoxWidget.svelte"
	import WidgetBoundary from "../WidgetBoundary.svelte"
	import { widgetRefFromComponent } from "../widgetRef.svelte"

	let { ctx }: { ctx: ComponentContext } = $props()

	// The context is the mount's, handed once: its sections move, it does not.
	setContext(
		WIDGET_CONTEXT_KEY,
		widgetRefFromComponent(
			untrack(() => ctx),
			{ id: "dialogue-box", instanceId: "dialogue-box", title: "Dialogue box" }
		)
	)
</script>

<WidgetBoundary {ctx}><DialogueBoxWidget /></WidgetBoundary>
