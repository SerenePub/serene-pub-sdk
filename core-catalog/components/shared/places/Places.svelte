<script lang="ts">
	/**
	 * Core's Places widget as a remote component (W4): the component
	 * context, as the widget context, around `PlacesWidget`.
	 */
	import { setContext, untrack } from "svelte"
	import type { ComponentContext } from "@serene-pub/sdk/component"
	import { WIDGET_CONTEXT_KEY } from "@serene-pub/core-catalog/widgets"
	import PlacesWidget from "./PlacesWidget.svelte"
	import { widgetRefFromComponent } from "../widgetRef.svelte"

	let { ctx }: { ctx: ComponentContext } = $props()

	// The context is the mount's, handed once: its sections move, it does not.
	setContext(
		WIDGET_CONTEXT_KEY,
		widgetRefFromComponent(
			untrack(() => ctx),
			{ id: "places", instanceId: "places", title: "Places" }
		)
	)
</script>

<PlacesWidget />
