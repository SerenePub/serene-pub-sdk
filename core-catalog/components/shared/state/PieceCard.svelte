<script lang="ts">
	/**
	 * 🚧 One **piece** of a ruleset's list — a weapon, a potion, a feature —
	 * as a **piece row** with its details in a popout (PLAN-sheet-widget §3,
	 * 2026-10-17). The shared piece control: Stats draws it for a list stat
	 * that holds pieces (`config.repertoire`); a card's or a place's editor
	 * can draw the same one.
	 *
	 * The row is one line, a button: the piece's name, `×n` when more than one
	 * is held, its **brief** (the first two facts its piece shape declares,
	 * joined with " · "), and a chevron. Nothing else is inline.
	 *
	 * Pressing it opens `piece-card.detail`, an `sp-popover` on the row: a
	 * head (name, count, where it came from), every fact, the description,
	 * the rules under a small "Rules" label, the traits — and, when the viewer
	 * may change it (`editable`), **Edit**, **Give to…** and **Remove**. Edit
	 * flips the popover's body to the form (`PieceForm`); Save and Cancel go
	 * back to the detail. Escape closes it, and the host returns focus to the
	 * row. The list keeps ONE detail open at a time (`open`), and only the
	 * open row draws a body, so a sheet of forty pieces holds one detail, not
	 * forty.
	 *
	 * **Give to…** lists `targets`: another seat or cast member that carries
	 * the same stat, or a place ("Drop at …"). A target the viewer may write
	 * is given at once; any other is **offered** ("Offer to …", owner ruling
	 * ★4, 2026-10-19) and waits for its player to accept — the widget asks
	 * `give-piece` either way (`ongive`), and the host decides. A stack (`×n`)
	 * asks how many first ("How many", one by default): the walk's whole ×2
	 * vanished at one press.
	 *
	 * A locked stat (`locked`) shows a small lock in the head and no buttons;
	 * a reading viewer the same detail with no buttons.
	 *
	 * Parts are the shared control's own, `piece-card.<part>` (STYLE-GUIDE
	 * §6.16): a style draws a piece once for every widget.
	 */
	import { pieceBrief, pieceViewOf, type GiveTarget, type PieceContext } from "@serene-pub/core-catalog/session-state"
	import PieceForm from "./PieceForm.svelte"
	import type { SlotRefusal, SlotWriteResult } from "./slotWriter.svelte"

	type SlotPiece = Parameters<typeof pieceViewOf>[0]

	interface Props {
		piece: SlotPiece
		/** The repertoire the piece is held in, when known: its shape decides facts and form. */
		ctx?: PieceContext
		t: (source: string) => string
		/** May the viewer change it? Absent or false: the detail alone, no buttons. */
		editable?: boolean
		/** The stat is locked (`config.lock`): a small lock, no buttons. */
		locked?: boolean
		/** Is this row's detail the list's open one? */
		open?: boolean
		onopenchange?: (open: boolean) => void
		/** The piece as saved, or `null` to remove it; resolves to the refusal or `null`. */
		onchange?: (piece: SlotPiece | null) => Promise<SlotWriteResult>
		/** Where it may be given (`giveTargets`). */
		targets?: readonly GiveTarget[]
		/** Give (or offer) `count` of this piece to `target`; resolves to the refusal or `null`. */
		ongive?: (target: GiveTarget, count: number) => Promise<SlotWriteResult>
	}

	let {
		piece,
		ctx = {},
		t,
		editable = false,
		locked = false,
		open = false,
		onopenchange,
		onchange,
		targets = [],
		ongive
	}: Props = $props()

	// Remembered by value (C10): a push that re-sends this piece unchanged keeps the reading.
	let view = $derived(pieceViewOf(piece, ctx, t))
	let brief = $derived(pieceBrief(view))
	let editing = $state(false)
	let refusal = $state<SlotRefusal | null>(null)
	let acts = $derived(editable && !locked)
	let offers = $derived(targets.some((x) => !x.direct))
	/** How many of a stack to give; one unless the viewer says otherwise. */
	let giveCount = $state<number | null>(1)
	let giving = $derived(Math.min(view.count, Math.max(1, Math.trunc(Number(giveCount) || 1))))

	const GIVE = "give:"

	function toggle(next: boolean) {
		if (!next) {
			editing = false
			refusal = null
		}
		onopenchange?.(next)
	}

	async function save(next: SlotPiece): Promise<SlotWriteResult> {
		const refused = (await onchange?.(next)) ?? null
		if (!refused) editing = false
		return refused
	}

	async function remove() {
		refusal = null
		const refused = (await onchange?.(null)) ?? null
		if (refused) refusal = refused
		else toggle(false)
	}

	async function give(e: CustomEvent<{ value: string }>) {
		const key = e.detail.value.startsWith(GIVE) ? e.detail.value.slice(GIVE.length) : null
		const target = targets.find((x) => x.owner.key === key)
		if (!target || !ongive) return
		refusal = null
		const refused = await ongive(target, giving)
		if (refused) refusal = refused
		else {
			giveCount = 1
			toggle(false)
		}
	}

	const targetText = (x: GiveTarget) =>
		x.place
			? t("Drop at {place}").replace("{place}", x.owner.label)
			: x.direct
				? x.owner.label
				: t("Offer to {name}").replace("{name}", x.owner.label)
</script>

<sp-popover
	data-widget-part="piece-card.detail"
	placement="bottom-start"
	label={view.name}
	{open}
	onopen-change={(e: CustomEvent<{ open: boolean }>) => toggle(e.detail.open)}
>
	<button
		slot="trigger"
		type="button"
		data-widget-part="piece-card.row row"
		data-piece-form={view.form}
		data-unresolved={view.unresolved ? "" : undefined}
		aria-haspopup="dialog"
		aria-label={t("{item}, details").replace("{item}", view.count > 1 ? `${view.name} ×${view.count}` : view.name)}
	>
		<span data-widget-part="piece-card.name">{view.name}</span>
		{#if view.count > 1}
			<span data-widget-part="piece-card.count chip" title={t("How many are held")}>×{view.count}</span>
		{/if}
		{#if brief}<span data-widget-part="piece-card.brief">{brief}</span>{/if}
		<sp-icon name="chevron-right" size="12"></sp-icon>
	</button>
	{#if open}
		<div data-widget-part="piece-card.detail-panel" role="group" aria-label={view.name}>
			{#if editing}
				<PieceForm {piece} {ctx} {t} onsave={save} oncancel={() => (editing = false)} />
			{:else}
				<header data-widget-part="piece-card.detail-head card-head">
					<span data-widget-part="piece-card.name">{view.name}</span>
					{#if view.count > 1}
						<span data-widget-part="piece-card.count chip" title={t("How many are held")}>×{view.count}</span>
					{/if}
					{#if locked}
						<span data-widget-part="piece-card.lock" title={t("Locked")}><sp-icon name="lock" size="11" label={t("Locked")}></sp-icon></span>
					{/if}
				</header>
				{#if view.from}
					<p data-widget-part="piece-card.from">{view.from}</p>
				{/if}
				{#if view.facts.length}
					<ul data-widget-part="piece-card.facts list">
						{#each view.facts as fact (fact.key)}
							<li data-widget-part="piece-card.fact" data-field={fact.key}>
								<span data-widget-part="piece-card.fact-label label">{fact.label}</span>
								{#if fact.text}<span data-widget-part="piece-card.fact-value value">{fact.text}</span>{/if}
							</li>
						{/each}
					</ul>
				{/if}
				{#if view.description}
					<p data-widget-part="piece-card.description">{view.description}</p>
				{/if}
				{#if view.prose}
					<p data-widget-part="piece-card.prose-label label">{t("Rules")}</p>
					<p data-widget-part="piece-card.prose">{view.prose}</p>
				{/if}
				{#if view.traits.length}
					<ul data-widget-part="piece-card.traits" aria-label={t("Traits")}>
						{#each view.traits as trait, i (`${i}:${trait}`)}
							<li data-widget-part="piece-card.trait chip">{trait}</li>
						{/each}
					</ul>
				{/if}
				{#if refusal}
					<p data-widget-part="piece-card.invalid" role="alert" title={refusal.detail ?? undefined}>{refusal.text}</p>
				{/if}
				{#if acts}
					<div data-widget-part="piece-card.actions toolbar">
						<button
							type="button"
							data-widget-part="piece-card.edit"
							aria-label={t("Edit {item}").replace("{item}", view.name)}
							onclick={() => {
								refusal = null
								editing = true
							}}
						>
							<sp-icon name="pencil" size="11"></sp-icon>
							<span>{t("Edit")}</span>
						</button>
						{#if targets.length && view.count > 1}
							<label data-widget-part="piece-card.give-count">
								<span>{t("How many")}</span>
								<input type="number" min="1" max={view.count} step="1" bind:value={giveCount} />
								<span>{t("of {n}").replace("{n}", String(view.count))}</span>
							</label>
						{/if}
						{#if targets.length}
							<sp-menu data-widget-part="piece-card.give" label={t("Give {item} to…").replace("{item}", view.name)} onselect={give}>
								<button slot="trigger" type="button" data-widget-part="piece-card.give-open">
									<sp-icon name="hand-helping" size="11"></sp-icon>
									<span>{t("Give to…")}</span>
								</button>
								{#each targets as target (target.owner.key)}
									<sp-menu-item
										value="{GIVE}{target.owner.key}"
										data-widget-part="piece-card.give-target"
										data-owner-key={target.owner.key}
										data-give={target.direct ? "direct" : "offer"}
									>
										<sp-icon name={target.place ? "map-pin" : "user-round"} size="12"></sp-icon>
										<span>{targetText(target)}</span>
									</sp-menu-item>
								{/each}
								{#if offers}
									<sp-menu-item value="note" disabled="" data-widget-part="piece-card.give-note">
										{t("An offer waits until its player accepts it.")}
									</sp-menu-item>
								{/if}
							</sp-menu>
						{/if}
						<button
							type="button"
							data-widget-part="piece-card.remove"
							aria-label={t("Remove {item}").replace("{item}", view.name)}
							onclick={() => void remove()}
						>
							<sp-icon name="trash-2" size="11"></sp-icon>
							<span>{t("Remove")}</span>
						</button>
					</div>
				{/if}
			{/if}
		</div>
	{/if}
</sp-popover>
