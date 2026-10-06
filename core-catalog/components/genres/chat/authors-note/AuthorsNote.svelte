<script lang="ts">
	/**
	 * Core's Author's note widget as a remote component (2026-10-02, AN1):
	 * the component context, as the native widget context, around
	 * `AuthorsNoteWidget`. It reads no section at all — everything is asked
	 * of the page — so it asks as soon as it mounts.
	 */
	import { setContext, untrack } from "svelte"
	import type { ComponentContext } from "@serene-pub/sdk/component"
	import { WIDGET_CONTEXT_KEY } from "@serene-pub/core-catalog/widgets"
	import AuthorsNoteWidget from "./AuthorsNoteWidget.svelte"
	import { widgetRefFromComponent } from "../../../shared/widgetRef.svelte"

	let { ctx }: { ctx: ComponentContext } = $props()

	// The context is the mount's, handed once: its sections move, it does not.
	setContext(
		WIDGET_CONTEXT_KEY,
		widgetRefFromComponent(
			untrack(() => ctx),
			{ id: "authors-note", instanceId: "authors-note", title: "Author's note" }
		)
	)
</script>

<AuthorsNoteWidget />
