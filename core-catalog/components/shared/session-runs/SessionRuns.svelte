<script lang="ts">
	/**
	 * Core's Runs widget as a remote component (lay-R): the component
	 * context, as the widget context, around `SessionRunsWidget`. It reads no
	 * settings, so there is nothing to wait for.
	 */
	import { setContext, untrack } from "svelte"
	import type { ComponentContext } from "@serene-pub/sdk/component"
	import { WIDGET_CONTEXT_KEY } from "@serene-pub/core-catalog/widgets"
	import SessionRunsWidget from "./SessionRunsWidget.svelte"
	import WidgetBoundary from "../WidgetBoundary.svelte"
	import { widgetRefFromComponent } from "../widgetRef.svelte"

	let { ctx }: { ctx: ComponentContext } = $props()

	// The context is the mount's, handed once: its sections move, it does not.
	setContext(
		WIDGET_CONTEXT_KEY,
		widgetRefFromComponent(
			untrack(() => ctx),
			{ id: "session-runs", instanceId: "session-runs", title: "Runs" }
		)
	)
</script>

<WidgetBoundary {ctx}><SessionRunsWidget /></WidgetBoundary>
