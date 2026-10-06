<script lang="ts">
	/**
	 * Core's Lore entries widget as a remote component (R21): the component
	 * context, as the native widget context, around `LoreEntriesWidget`.
	 *
	 * The widget asks the page for its first page only once its settings
	 * have arrived: the page posts a widget's settings (it reads them) right
	 * after it says ready, and an ask made before would be spent on the
	 * declared defaults instead of this instance's sort and page size.
	 */
	import { setContext, untrack } from "svelte"
	import type { ComponentContext } from "@serene-pub/sdk/component"
	import { WIDGET_CONTEXT_KEY } from "@serene-pub/core-catalog/widgets"
	import LoreEntriesWidget from "./LoreEntriesWidget.svelte"
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
			{ id: "lore-entries", instanceId: "lore-entries", title: "Lore entries" }
		)
	)
</script>

<LoreEntriesWidget ready={settled} />
