<script lang="ts">
	/**
	 * Core's While you were away widget as a remote component (A7, R23): the
	 * component context, as the widget context, around `RoutineLogWidget`.
	 * It asks the page once its settings have arrived, so its first ask is
	 * spent on this instance's How many.
	 */
	import { setContext, untrack } from "svelte"
	import type { ComponentContext } from "@serene-pub/sdk/component"
	import { WIDGET_CONTEXT_KEY } from "@serene-pub/core-catalog/widgets"
	import RoutineLogWidget from "./RoutineLogWidget.svelte"
	import { widgetRefFromComponent } from "../widgetRef.svelte"

	let { ctx }: { ctx: ComponentContext } = $props()

	let settled = $state(untrack(() => ctx.settings) !== undefined)
	$effect(() =>
		untrack(() => ctx).subscribe((section) => {
			if (section === "settings") settled = true
		})
	)

	// The context is the mount's, handed once: its sections move, it does not.
	setContext(
		WIDGET_CONTEXT_KEY,
		widgetRefFromComponent(
			untrack(() => ctx),
			{ id: "routine-log", instanceId: "routine-log", title: "While you were away" }
		)
	)
</script>

<RoutineLogWidget ready={settled} />
