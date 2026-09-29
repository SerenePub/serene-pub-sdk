<script lang="ts">
	/**
	 * A mini bar row: one owner's bounded stats, read-only.
	 *
	 * Read-only on purpose. This sits under a portrait, where the pointer is
	 * already doing something else, and a bar you can nudge by a stray click
	 * is a stat nobody can trust. Editing lives in the Stats widget.
	 *
	 * Only slots whose configuration declares both ends of a range are drawn
	 * (`statBarsOf`): everything else is not a bar, and this row has no room
	 * to say what it is.
	 */
	import type { StatBarRow } from "@serene-pub/core-catalog/scene-portraits"

	interface Props {
		/** The owner key the resolved state files these values under. */
		ownerKey: string
		rows: StatBarRow[]
	}
	let { ownerKey, rows }: Props = $props()
</script>

{#if rows.length}
	<div data-widget-part="scene-portraits.bars list" data-state-bars={ownerKey}>
		{#each rows as row (row.slotId)}
			<div
				data-widget-part="scene-portraits.bar row"
				title="{row.label} {row.bar.label}"
				aria-label="{row.label} {row.bar.label}"
			>
				<span data-widget-part="scene-portraits.bar-label label">{row.label}</span>
				<span data-widget-part="scene-portraits.bar-track meter">
					<span
						data-widget-part="scene-portraits.bar-fill"
						style="--sp-fill: {row.bar.percent}%"
					></span>
				</span>
			</div>
		{/each}
	</div>
{/if}
