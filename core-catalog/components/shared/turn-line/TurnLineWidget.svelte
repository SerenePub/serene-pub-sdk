<script lang="ts">
	/**
	 * The `turn-line` widget's component (owner R8 2026-11-05): what the last
	 * run did and who is next, one row, beside the log and the composer it
	 * was drawn between. It owns a conversation of its own that follows the
	 * Messages copy it belongs to (`followTarget`): same rows, same dossier,
	 * the lane that copy shows. Reads its `nextUp` setting off the widget
	 * context.
	 */
	import { useWidgetContext } from "../context"
	import TurnLine from "../messages/TurnLine.svelte"
	import { createConversation, setConversation } from "../messages/conversation.svelte"
	import { readTurnLineSettings } from "./settings"

	const ctx = useWidgetContext()
	const conversation = ctx ? setConversation(createConversation(ctx, { followTarget: true })) : null
	const settings = $derived(readTurnLineSettings(ctx?.current.settings.v1 as Record<string, unknown> | undefined))
</script>

<!-- The widget's parts (`turn-line.*`, STYLE-GUIDE §6.16): no look here. -->
{#if conversation && !conversation.noLane}
	<div data-widget-part="turn-line.root">
		<TurnLine nextUp={settings.nextUp} />
	</div>
{/if}
