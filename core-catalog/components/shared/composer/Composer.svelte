<script lang="ts">
	/**
	 * Core's composer widget as a remote component: the component context, as
	 * the native widget context, around `ComposerWidget`.
	 */
	import { setContext, untrack } from "svelte"
	import type { ComponentContext } from "@serene-pub/sdk/component"
	import { WIDGET_CONTEXT_KEY } from "@serene-pub/core-catalog/conversation"
	import ComposerWidget from "./ComposerWidget.svelte"
	import WidgetBoundary from "../WidgetBoundary.svelte"
	import { widgetRefFromComponent } from "../widgetRef.svelte"

	let { ctx }: { ctx: ComponentContext } = $props()

	// The context is the mount's, handed once: its sections move, it does not.
	setContext(
		WIDGET_CONTEXT_KEY,
		widgetRefFromComponent(
			untrack(() => ctx),
			{ id: "composer", instanceId: "composer", title: "Composer" }
		)
	)
</script>

<WidgetBoundary {ctx}><ComposerWidget /></WidgetBoundary>
