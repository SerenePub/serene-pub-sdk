<script lang="ts">
	/**
	 * 🚧 A list stat that holds a ruleset's pieces (`config.repertoire` —
	 * Weapons, Gear, Features…), drawn as a **piece row** per piece
	 * (`PieceCard`, PLAN-sheet-widget §3) through the one list editor
	 * (`ListEditor`, C9). Compact draws the names on one line.
	 *
	 * One detail at a time: the list keeps which row's popout is open, so
	 * opening another closes the first and only the open row draws a body.
	 *
	 * Writable: each row's popout edits, gives or removes its piece, and
	 * **Add** opens a blank piece's form in line under the list (it has no row
	 * to anchor a popout to). Every change writes the whole list, through the
	 * slot control's `onset`, and resolves to the host's refusal or `null`
	 * (A21) — the form stays open with its draft on a refusal. Read-only
	 * (another player's sheet, a locked or retired stat): the rows and their
	 * details alone.
	 *
	 * An item that is not a piece (a word left from before the list named its
	 * repertoire) reads as itself.
	 */
	import {
		blankPiece,
		isSlotPiece,
		listItemText,
		listItemsOf,
		listWithPieceAt,
		pieceContextOf,
		pieceKeyOf,
		shownValueText,
		type GiveTarget,
		type SlotWriteValue
	} from "@serene-pub/core-catalog/session-state"
	import type { SessionStateOwnerV1, SessionStateSlotV1 } from "@serene-pub/core-catalog/widgets"
	import ListEditor from "./ListEditor.svelte"
	import PieceCard from "./PieceCard.svelte"
	import PieceForm from "./PieceForm.svelte"
	import type { SlotWriteResult } from "./slotWriter.svelte"

	type SlotPiece = Parameters<typeof pieceKeyOf>[0]

	interface Props {
		slot: SessionStateSlotV1
		config: Record<string, unknown>
		value: unknown
		t: (source: string) => string
		writable: boolean
		/** The stat is locked (`config.lock`): rows show a lock in their detail, nothing is offered. */
		locked?: boolean
		density?: "compact" | "full"
		onset: (value: SlotWriteValue) => Promise<SlotWriteResult>
		/** The repertoires in force (the section's, else the owner row's): each one's name and piece shape. */
		repertoires?: SessionStateOwnerV1["repertoires"]
		/** Where a piece of this list may be given. */
		targets?: readonly GiveTarget[]
		ongive?: (index: number, target: GiveTarget, count: number) => Promise<SlotWriteResult>
	}

	let {
		slot,
		config,
		value,
		t,
		writable,
		locked = false,
		density = "full",
		onset,
		repertoires,
		targets = [],
		ongive
	}: Props = $props()

	let ctx = $derived(pieceContextOf(config, repertoires))
	let items = $derived(listItemsOf(value))
	let adding = $state(false)
	/** The open row's key — one detail at a time. */
	let openKey = $state<string | null>(null)

	const keyOf = (item: unknown, i: number) =>
		isSlotPiece(item as never) ? pieceKeyOf(item as SlotPiece, i) : `${i}:${String(item)}`

	const write = (index: number) => async (piece: SlotPiece | null): Promise<SlotWriteResult> => {
		const refused = await onset(listWithPieceAt(value, index, piece) as SlotWriteValue)
		if (!refused) {
			adding = false
			if (piece === null) openKey = null
		}
		return refused
	}
</script>

{#snippet row(item: unknown, i: number)}
	{#if isSlotPiece(item as never)}
		{@const key = keyOf(item, i)}
		<PieceCard
			piece={item as SlotPiece}
			{ctx}
			{t}
			editable={writable}
			{locked}
			open={openKey === key}
			onopenchange={(open) => (openKey = open ? key : openKey === key ? null : openKey)}
			onchange={write(i)}
			{targets}
			ongive={ongive ? (target, count) => ongive(i, target, count) : undefined}
		/>
	{:else}
		<span data-widget-part="piece-card.word label">{listItemText(item as never, t)}</span>
	{/if}
{/snippet}

{#snippet footer()}
	{#if adding}
		<PieceForm piece={blankPiece()} {ctx} {t} onsave={write(items.length)} oncancel={() => (adding = false)} />
	{:else if writable && !locked}
		<button
			type="button"
			data-widget-part="piece-card.add"
			aria-label={t("Add to {label}").replace("{label}", slot.label)}
			onclick={() => (adding = true)}
		>
			<sp-icon name="plus" size="11"></sp-icon>
			<span>{t("Add")}</span>
		</button>
	{/if}
{/snippet}

{#if density === "compact"}
	<span data-widget-part="piece-card.names value" data-empty={items.length ? undefined : ""}>
		{items.length ? shownValueText(slot, value, t) : t("none")}
	</span>
{:else}
	<ListEditor
		{items}
		{keyOf}
		label={slot.label}
		{t}
		item={row}
		empty={adding ? null : t("none")}
		{footer}
		parts={{ root: "piece-card.list-root", list: "piece-card.list", item: "piece-card.item", empty: "piece-card.empty" }}
	/>
{/if}
