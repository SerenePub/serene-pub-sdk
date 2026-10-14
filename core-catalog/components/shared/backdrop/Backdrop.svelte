<script lang="ts">
	/**
	 * Core's Backdrop widget as a remote component: the component context,
	 * as the widget context, around the widget.
	 */
	import { setContext, untrack } from "svelte"
	import type { ComponentContext } from "@serene-pub/sdk/component"
	import { WIDGET_CONTEXT_KEY } from "@serene-pub/core-catalog/widgets"
	import BackdropWidget from "./BackdropWidget.svelte"
	import { widgetRefFromComponent } from "../widgetRef.svelte"

	let { ctx }: { ctx: ComponentContext } = $props()

	// The context is the mount's, handed once: its sections move, it does not.
	setContext(
		WIDGET_CONTEXT_KEY,
		widgetRefFromComponent(
			untrack(() => ctx),
			{ id: "backdrop", instanceId: "backdrop", title: "Backdrop" }
		)
	)
</script>

<BackdropWidget />
