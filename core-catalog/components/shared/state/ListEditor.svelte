<script lang="ts">
	/**
	 * One list editor (C9, 2026-10-17) for every list stat the slot control
	 * draws: a list of words or lore references, and a list of a ruleset's
	 * pieces. It owns the list's shape — its items in order, what it says
	 * when empty, and, where `controls` is on, each item's move up, move down
	 * and remove (with − and + for a held lore reference) — and leaves what
	 * an item reads as to `item`, and what follows the items (the add field,
	 * the lorebook picker, Add, Done) to `footer`.
	 *
	 * Words name their parts `stat-slot.*`; pieces `piece-card.*` (`parts`),
	 * so a style that drew either before draws it still.
	 */
	import type { Snippet } from "svelte"

	interface Parts {
		/** The editor's own box: `stat-slot.editor` for words, `piece-card.list-root` for pieces. */
		root: string
		list: string
		item: string
		empty: string
	}

	interface Props {
		items: readonly unknown[]
		keyOf: (item: unknown, index: number) => string
		/** The list's name, for its group. */
		label: string
		t: (source: string) => string
		/** What one item reads as. */
		item: Snippet<[unknown, number]>
		/** Draw move, remove (and a reference's − and +) beside each item. */
		controls?: boolean
		/** The item's words, for its controls' names. */
		textOf?: (item: unknown) => string
		/** Does this item step by one (a held lore reference)? */
		steps?: (item: unknown) => boolean
		onmove?: (index: number, by: -1 | 1) => void
		onremove?: (index: number) => void
		onstep?: (index: number, by: -1 | 1) => void
		/** Said when there is nothing; absent, nothing is drawn. */
		empty?: string | null
		footer?: Snippet
		parts: Parts
		/** The list element's own role: a group when it edits, plain when it is read. */
		role?: "group" | null
	}

	let {
		items,
		keyOf,
		label,
		t,
		item,
		controls = false,
		textOf = (x) => String(x),
		steps = () => false,
		onmove,
		onremove,
		onstep,
		empty = null,
		footer,
		parts,
		role = "group"
	}: Props = $props()
</script>

<div data-widget-part={parts.root} role={role ?? undefined} aria-label={role ? label : undefined}>
	{#if items.length}
		<ol data-widget-part="{parts.list} list">
			{#each items as one, i (keyOf(one, i))}
				{@const words = textOf(one)}
				<li data-widget-part="{parts.item} row" data-item-index={i}>
					{@render item(one, i)}
					{#if controls}
						{#if steps(one)}
							<button
								type="button"
								data-widget-part="stat-slot.item-less"
								aria-label={t("One fewer {item}").replace("{item}", words)}
								onclick={() => onstep?.(i, -1)}
							>
								<sp-icon name="minus" size="11"></sp-icon>
							</button>
							<button
								type="button"
								data-widget-part="stat-slot.item-more"
								aria-label={t("One more {item}").replace("{item}", words)}
								onclick={() => onstep?.(i, 1)}
							>
								<sp-icon name="plus" size="11"></sp-icon>
							</button>
						{/if}
						<button
							type="button"
							data-widget-part="stat-slot.item-up"
							disabled={i === 0}
							aria-label={t("Move {item} up").replace("{item}", words)}
							onclick={() => onmove?.(i, -1)}
						>
							<sp-icon name="arrow-up" size="11"></sp-icon>
						</button>
						<button
							type="button"
							data-widget-part="stat-slot.item-down"
							disabled={i === items.length - 1}
							aria-label={t("Move {item} down").replace("{item}", words)}
							onclick={() => onmove?.(i, 1)}
						>
							<sp-icon name="arrow-down" size="11"></sp-icon>
						</button>
						<button
							type="button"
							data-widget-part="stat-slot.item-remove"
							aria-label={t("Remove {item}").replace("{item}", words)}
							onclick={() => onremove?.(i)}
						>
							<sp-icon name="x" size="11"></sp-icon>
						</button>
					{/if}
				</li>
			{/each}
		</ol>
	{:else if empty}
		<p data-widget-part="{parts.empty} empty" data-empty="">{empty}</p>
	{/if}
	{@render footer?.()}
</div>
