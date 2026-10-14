<script lang="ts">
	/**
	 * Core's Chronicle widget as a remote component (W3): the component
	 * context, as the widget context, around `ChronicleWidget`.
	 *
	 * The widget asks the page only once its settings have arrived: the page
	 * posts a widget's settings (it reads them) right after it says ready,
	 * and an ask made before would be spent on the declared Earlier count
	 * instead of this instance's.
	 */
	import { setContext, untrack } from "svelte"
	import type { ComponentContext } from "@serene-pub/sdk/component"
	import { WIDGET_CONTEXT_KEY } from "@serene-pub/core-catalog/widgets"
	import ChronicleWidget from "./ChronicleWidget.svelte"
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
			{ id: "chronicle", instanceId: "chronicle", title: "Chronicle" }
		)
	)
</script>

<ChronicleWidget ready={settled} />
