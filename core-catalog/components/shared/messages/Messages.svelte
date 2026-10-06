<script lang="ts">
	/**
	 * Core's messages widget as a remote component (C0b): the component
	 * context, as the native widget context, around the very same
	 * `MessagesWidget` the page mounts natively.
	 */
	import { setContext, untrack } from "svelte"
	import type { ComponentContext } from "@serene-pub/sdk/component"
	import { WIDGET_CONTEXT_KEY } from "@serene-pub/core-catalog/conversation"
	import MessagesWidget from "./MessagesWidget.svelte"
	import { widgetRefFromComponent } from "../widgetRef.svelte"

	let { ctx }: { ctx: ComponentContext } = $props()

	// The context is the mount's, handed once: its sections move, it does not.
	setContext(
		WIDGET_CONTEXT_KEY,
		widgetRefFromComponent(
			untrack(() => ctx),
			{ id: "messages", instanceId: "messages", title: "Messages" }
		)
	)
</script>

<MessagesWidget />
