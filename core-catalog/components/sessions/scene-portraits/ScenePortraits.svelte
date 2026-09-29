<script lang="ts">
	/**
	 * Core's Scene Portraits widget as a remote component (R21): the
	 * component context, as the widget context core's widgets read, around
	 * the widget itself.
	 */
	import { setContext, untrack } from "svelte"
	import type { ComponentContext } from "@serene-pub/sdk/component"
	import { WIDGET_CONTEXT_KEY } from "@serene-pub/core-catalog/widgets"
	import ScenePortraitsWidget from "./ScenePortraitsWidget.svelte"
	import { widgetRefFromComponent } from "../shared/widgetRef.svelte"

	let { ctx }: { ctx: ComponentContext } = $props()

	// The context is the mount's, handed once: its sections move, it does not.
	setContext(
		WIDGET_CONTEXT_KEY,
		widgetRefFromComponent(
			untrack(() => ctx),
			{ id: "scene-portraits", instanceId: "scene-portraits", title: "Scene Portraits" }
		)
	)
</script>

<ScenePortraitsWidget />
