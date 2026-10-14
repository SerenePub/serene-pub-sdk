<script lang="ts">
	/**
	 * Core's Who's here widget as a remote component (W10): the component
	 * context, as the widget context, around the widget.
	 */
	import { setContext, untrack } from "svelte"
	import type { ComponentContext } from "@serene-pub/sdk/component"
	import { WIDGET_CONTEXT_KEY } from "@serene-pub/core-catalog/widgets"
	import AttendanceWidget from "./AttendanceWidget.svelte"
	import { widgetRefFromComponent } from "../widgetRef.svelte"

	let { ctx }: { ctx: ComponentContext } = $props()

	// The context is the mount's, handed once: its sections move, it does not.
	setContext(
		WIDGET_CONTEXT_KEY,
		widgetRefFromComponent(
			untrack(() => ctx),
			{ id: "attendance", instanceId: "attendance", title: "Who's here" }
		)
	)
</script>

<AttendanceWidget />
