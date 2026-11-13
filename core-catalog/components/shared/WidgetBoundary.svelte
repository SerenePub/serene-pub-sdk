<script lang="ts">
	/**
	 * The one boundary every core widget host draws its widget inside.
	 *
	 * Why (playtest item 15): a widget whose Svelte render threw after mount
	 * went blank with nothing on screen — the worker reports a throw at mount
	 * and in a handler, not one in a render. Here the throw is caught, said to
	 * the page as a fatal report over the widget port (the page answers with
	 * its own "This widget stopped" overlay), and one plain sentence is drawn.
	 *
	 * A handler's throw is not this boundary's: the worker reports it.
	 */
	import type { Snippet } from "svelte"
	import type { ComponentContext } from "@serene-pub/sdk/component"

	let { ctx, children }: { ctx: ComponentContext; children: Snippet } = $props()

	function report(error: unknown) {
		const message = error instanceof Error ? error.message : String(error)
		const where =
			error instanceof Error && error.stack
				? "\n" + error.stack.split("\n").slice(1, 7).join("\n")
				: ""
		try {
			ctx.error(message + where, true)
		} catch {
			// A closed port has nobody to tell.
		}
	}
</script>

<svelte:boundary onerror={report}>
	{@render children()}
	{#snippet failed()}
		<p role="alert">This widget stopped and can't show anything.</p>
	{/snippet}
</svelte:boundary>
