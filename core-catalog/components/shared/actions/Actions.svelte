<script lang="ts">
	/**
	 * Core's Actions widget as a remote component (W8): the component
	 * context, as the widget context, around the widget.
	 */
	import { setContext, untrack } from "svelte"
	import type { ComponentContext } from "@serene-pub/sdk/component"
	import { WIDGET_CONTEXT_KEY } from "@serene-pub/core-catalog/widgets"
	import ActionsWidget from "./ActionsWidget.svelte"
	import { widgetRefFromComponent } from "../widgetRef.svelte"

	let { ctx }: { ctx: ComponentContext } = $props()

	// The context is the mount's, handed once: its sections move, it does not.
	setContext(
		WIDGET_CONTEXT_KEY,
		widgetRefFromComponent(
			untrack(() => ctx),
			{ id: "actions", instanceId: "actions", title: "Actions" }
		)
	)
</script>

<ActionsWidget />
