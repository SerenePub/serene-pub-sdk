<script lang="ts">
	/**
	 * One attribute slot, drawn as what it is and edited in place — core's
	 * Stats widget's row (R21), and any widget's that draws a stat.
	 *
	 * The slot's STAT SHAPE decides the control (`slotKind`: its field, or its
	 * type when the host predates shapes), and the configuration in force
	 * decides its bounds: a bounded number is a bar, a choice is a chip over a
	 * closed set (an `sp-menu` on the chip), a list opens to its items
	 * (`ListEditor`: add, remove, move up and down, and the lorebook picker,
	 * `LorePicker`), a story time opens to its year, month, day and time
	 * (`StoryTimeEditor`), text is a line, a boolean is a toggle.
	 *
	 * One read-only branch (C9, 2026-10-17): a slot the viewer cannot write —
	 * another player's sheet, a derived or retired stat, a locked one — is
	 * drawn as plain words (spans, never disabled buttons), its bar a meter.
	 * A locked slot (`config.lock`, `slotLocked`) also shows a small lock.
	 *
	 * Every edit here is the USER's, which is the one writer with authority: it
	 * applies at once (`set-attribute-value`) rather than waiting at the review
	 * gate. Nothing is applied optimistically — the new value arrives as a
	 * `session_state` push. A write resolves to the host's refusal or `null`
	 * (A21): an editor closes only once its write lands, and a refusal keeps
	 * the draft and is said in the row's own `invalid` line, in plain words.
	 *
	 * A number or text field commits on Enter, and Escape puts the stored
	 * value back (R80: the field's `keys`). Leaving the field commits what was
	 * typed, and only closes it when nothing was. A text field also commits on
	 * `change`; a number field does not, because the browser raises `change`
	 * on every spinner step.
	 *
	 * 🚧 A list that holds a ruleset's pieces (`config.repertoire` — Weapons,
	 * Gear, Features) draws a piece row per piece (`PieceList`, `PieceCard`),
	 * and its row is **stacked** (`data-stacked`): the label a heading on its
	 * own line, the trail at that line's end, the pieces full width under it.
	 *
	 * The markup carries no look. A shared control owns its parts under its own
	 * name, `stat-slot.<part>` (STYLE-GUIDE §6.16). A slot's state is its own
	 * `data-*` or ARIA, never a part: `data-density`, `data-retired`,
	 * `data-slot-shape`, `data-stacked`, `data-locked`, `data-empty`,
	 * `aria-pressed`, `role="alert"` (refused).
	 *
	 * A widget may put something of its own at the end of the row — Stats'
	 * **stat trail** (F2) — through `trail`; it carries that widget's parts.
	 */
	import type { Snippet } from "svelte"
	import type { SessionStateOwnerV1, SessionStateSlotV1 } from "@serene-pub/core-catalog/widgets"
	import {
		barView,
		choiceOptionText,
		enumValues,
		listItemKeyOf,
		listItemRef,
		listItemText,
		listItemsOf,
		listMoved,
		listWithAdded,
		listWithRefStep,
		listWithout,
		numberDraftFor,
		slotHoldsPieces,
		slotLocked,
		slotTakesLoreRefs,
		shownValueText,
		slotIsWhole,
		slotKind,
		slotWritable,
		textDraftValue,
		type GiveTarget,
		type SlotWriteValue
	} from "@serene-pub/core-catalog/session-state"
	import type { HostKeyEventDetail } from "@serene-pub/sdk/component"
	import type { EntryFinder } from "./entryFinder"
	import ListEditor from "./ListEditor.svelte"
	import LorePicker from "./LorePicker.svelte"
	import PieceList from "./PieceList.svelte"
	import StoryTimeEditor from "./StoryTimeEditor.svelte"
	import type { SlotRefusal, SlotWriteResult } from "./slotWriter.svelte"

	interface Props {
		slot: SessionStateSlotV1
		/** The configuration in force for this owner: bounds, options, a list's limits, its `lock`. */
		config: Record<string, unknown>
		value: unknown
		/** Compact drops the label into the control's own line. */
		density?: "compact" | "full"
		/** The widget's language. */
		t: (source: string) => string
		/** `null` clears this layer, so the read inherits again. Resolves to the refusal, or `null` once written. */
		onset: (value: SlotWriteValue) => Promise<SlotWriteResult>
		/** Searches the session's lorebook for a list's picker; absent, a list adds words only. */
		findEntries?: EntryFinder
		/** The asking widget's own end of the row (Stats' stat trail); absent, none. */
		trail?: Snippet
		/** 🚧 The copy's `timeFormat` for a story-time stat (`formatStoryTimeAs`); absent, the calendar's spelling. */
		timeFormat?: string | null
		/** 🚧 Not the viewer's to write (another player's seat): drawn, never edited. */
		readonly?: boolean
		/** 🚧 The repertoires in force, for a list of pieces (`PieceList`). */
		repertoires?: SessionStateOwnerV1["repertoires"]
		/** 🚧 Where a piece of this list may be given (`giveTargets`). */
		targets?: readonly GiveTarget[]
		ongive?: (index: number, target: GiveTarget, count: number) => Promise<SlotWriteResult>
	}

	let {
		slot,
		config,
		value,
		density = "full",
		t,
		onset,
		findEntries,
		trail,
		timeFormat = null,
		readonly = false,
		repertoires,
		targets,
		ongive
	}: Props = $props()

	/** A menu item's value for "not set" — never an option's, which are `opt:`-prefixed. */
	const CLEAR = "clear"

	let editing = $state(false)
	let numberDraft = $state<number | null>(null)
	let textDraft = $state("")
	let itemDraft = $state("")
	/** Why the last write wrote nothing — the host's refusal, a list over its limit. */
	let invalid = $state<SlotRefusal | null>(null)
	let picking = $state(false)
	/** A write is on its way: Enter, `change` and blur may all arrive for one edit. */
	let committing = false
	/** The drafts as the field opened, so leaving it untouched writes nothing. */
	let numberOpened: number | null = null
	let textOpened = ""

	let kind = $derived(slotKind(slot))
	let bar = $derived(kind === "number" ? barView(value, config as { min?: number; max?: number }) : null)
	let options = $derived(enumValues(config))
	let items = $derived(listItemsOf(value))
	/** 🚧 A list of a ruleset's pieces (`config.repertoire`): a row per piece, never one line of words. */
	let holdsPieces = $derived(kind === "list" && slotHoldsPieces(config))
	let locked = $derived(slotLocked(config))
	let canPick = $derived(!!findEntries && slotTakesLoreRefs(config))
	let writable = $derived(!readonly && !locked && slotWritable(slot))
	let shown = $derived(shownValueText(slot, value, t, null, timeFormat))
	/**
	 * 🚧 A list of word items — a thing and what it is, "Chain shirt — A shirt
	 * of rings." — one to a line (PLAN-dc-after-walk3 R3-5, the walk's polish:
	 * a Story sheet's gear ran together as "clothing., Shield — …").
	 */
	let itemLines = $derived.by(() => {
		if (kind !== "list" || items.length < 2) return null
		const lines = items.map((i) => listItemText(i, t))
		return lines.some((x) => /\s—\s/.test(x)) ? lines : null
	})
	// 🚧 One word for a stat that holds nothing, a choice's and a list's alike
	// (PLAN-dc-after-walk2 Q3-6, the walk's #45: Class "not set" beside a
	// list's "none"); the menu's clearing item says the same.
	let notSet = $derived(t("none"))
	let fieldLabel = $derived(t("{label} value").replace("{label}", slot.label))
	let editLabel = $derived(t("{label}, edit").replace("{label}", slot.label))

	/** One write, its answer kept: `null` clears the row's line, a refusal says it. */
	async function write(next: SlotWriteValue): Promise<SlotWriteResult> {
		invalid = null
		const refused = await onset(next)
		invalid = refused
		return refused
	}

	function open() {
		if (!writable) return
		numberDraft = numberOpened = typeof value === "number" ? value : null
		textDraft = textOpened = value === undefined || value === null ? "" : String(value)
		itemDraft = ""
		invalid = null
		picking = false
		editing = true
	}

	/** Write `next`, and close the field only once it lands. */
	async function commit(next: SlotWriteValue | undefined) {
		if (!editing || committing) return
		if (next === undefined) {
			editing = false
			return
		}
		committing = true
		try {
			if (!(await write(next))) editing = false
		} finally {
			committing = false
		}
	}

	const commitNumber = () =>
		commit(numberDraftFor(numberDraft, config as { min?: number; max?: number }, slotIsWhole(slot)))
	const commitText = () => commit(textDraftValue(textDraft, config as { maxLength?: unknown }))

	/** Enter commits; Escape leaves the stored value as it was. */
	function onkey(e: CustomEvent<HostKeyEventDetail>, done: () => void) {
		if (e.detail.key === "Enter") done()
		else if (e.detail.key === "Escape") {
			editing = false
			invalid = null
		}
	}

	/** Leaving the field: commit what was typed, or just close it. */
	function onblur(unchanged: boolean, done: () => void) {
		if (!editing || committing) return
		if (unchanged) editing = false
		else done()
	}

	function pick(e: CustomEvent<{ value: string }>) {
		const v = e.detail.value
		if (v === CLEAR) void write(null)
		else if (v.startsWith("opt:")) void write(v.slice(4))
	}

	// ── A list of words: every change writes the whole list; the editor stays open ──

	async function addItem() {
		const edit = listWithAdded(value, itemDraft, config)
		if (!edit) return
		if (edit.refusal) {
			invalid = { text: edit.refusal, detail: null }
			return
		}
		if (!(await write(edit.value))) itemDraft = ""
	}

	function onItemKey(e: CustomEvent<HostKeyEventDetail>) {
		if (e.detail.key === "Enter") void addItem()
		else if (e.detail.key === "Escape") editing = false
	}

	const itemText = (item: unknown) => listItemText(item as never, t)
</script>

{#snippet refusalLine()}
	{#if invalid}<p data-widget-part="stat-slot.invalid" role="alert" title={invalid.detail ?? undefined}>{invalid.text}</p>{/if}
{/snippet}

{#snippet word(item: unknown)}
	<span data-widget-part="stat-slot.item-text label">{itemText(item)}</span>
{/snippet}

{#snippet wordsFooter()}
	<!-- svelte-ignore a11y_autofocus -->
	<input
		data-widget-part="stat-slot.add stat-slot.field"
		type="text"
		aria-label={t("Add to {label}").replace("{label}", slot.label)}
		placeholder={t("Add an item, then Enter")}
		keys="Escape Enter"
		autofocus
		bind:value={itemDraft}
		onkey={onItemKey}
	/>
	{#if canPick && findEntries && !picking}
		<button type="button" data-widget-part="stat-slot.pick-open" onclick={() => ((picking = true), (invalid = null))}>
			<sp-icon name="book-open" size="12"></sp-icon>
			<span>{t("Add from the lorebook")}</span>
		</button>
	{:else if canPick && findEntries}
		<LorePicker label={slot.label} {value} {config} {findEntries} {t} onadd={write} onclose={() => (picking = false)} />
	{/if}
	{@render refusalLine()}
	<button type="button" data-widget-part="stat-slot.done" onclick={() => (editing = false)}>{t("Done")}</button>
{/snippet}

<div
	data-widget-part="stat-slot.root row"
	data-density={density}
	data-slot-id={slot.slotId}
	data-slot-type={slot.type}
	data-slot-shape={kind}
	data-retired={slot.retired ? "" : undefined}
	data-stacked={holdsPieces && density === "full" ? "" : undefined}
	data-locked={locked ? "" : undefined}
>
	<span data-widget-part="stat-slot.label label" title={slot.description ?? slot.label}>
		{slot.label}
		{#if slot.required}
			<span data-widget-part="stat-slot.required" role="img" aria-label={t("required")} title={t("required")}>*</span>
		{/if}
		{#if slot.retired}
			<sp-icon name="archive" size="10" label={t("retired")}></sp-icon>
		{:else if kind === "derived"}
			<sp-icon name="sigma" size="10"></sp-icon>
		{/if}
		{#if locked}
			<span data-widget-part="stat-slot.lock" title={t("Locked: only the story changes this")}>
				<sp-icon name="lock" size="10" label={t("locked")}></sp-icon>
			</span>
		{/if}
	</span>

	<div data-widget-part="stat-slot.control">
		{#if holdsPieces}
			<PieceList
				{slot}
				{config}
				{value}
				{t}
				writable={!readonly && slotWritable(slot)}
				{locked}
				{density}
				onset={write}
				{repertoires}
				{targets}
				{ongive}
			/>
		{:else if !writable}
			<!-- Read-only: words, never a disabled control. -->
			{#if bar}
				<span data-widget-part="stat-slot.bar" role="img" aria-label="{slot.label} {bar.label}">
					<span data-widget-part="stat-slot.track meter">
						<span data-widget-part="stat-slot.fill" style:--sp-fill="{bar.percent}%"></span>
					</span>
					<span data-widget-part="stat-slot.bar-value value">{bar.label}</span>
				</span>
			{:else if kind === "choice" || kind === "boolean"}
				<span
					data-widget-part="stat-slot.chip chip"
					data-empty={value == null ? "" : undefined}
					aria-pressed={kind === "boolean" ? value === true : undefined}
				>
					{shown || notSet}
				</span>
			{:else}
				<span data-widget-part="stat-slot.line value" data-empty={value === undefined || (kind === "list" && !items.length) ? "" : undefined}>
					{#if itemLines}{#each itemLines as line, j (j)}{#if j > 0}<br />{/if}{line}{/each}{:else}{kind === "list" ? (items.length ? shown : t("none")) : shown || notSet}{/if}
				</span>
			{/if}
		{:else if kind === "boolean"}
			<button
				type="button"
				data-widget-part="stat-slot.chip chip"
				aria-pressed={value === true}
				onclick={() => void write(value === true ? false : true)}
			>
				{value === undefined ? notSet : shown}
			</button>
			{@render refusalLine()}
		{:else if editing && kind === "number"}
			<!-- svelte-ignore a11y_autofocus -->
			<input
				data-widget-part="stat-slot.field"
				type="number"
				aria-label={fieldLabel}
				min={(config as { min?: number }).min}
				max={(config as { max?: number }).max}
				step={slotIsWhole(slot) ? "1" : "any"}
				keys="Escape Enter"
				autofocus
				aria-invalid={invalid ? "true" : undefined}
				bind:value={numberDraft}
				onblur={() => onblur(numberDraft === numberOpened, commitNumber)}
				onkey={(e: CustomEvent<HostKeyEventDetail>) => onkey(e, commitNumber)}
			/>
			{@render refusalLine()}
		{:else if editing && kind === "list"}
			<ListEditor
				{items}
				keyOf={(item, i) => listItemKeyOf(item as never, i)}
				label={fieldLabel}
				{t}
				item={word}
				controls
				textOf={itemText}
				steps={(item) => !!listItemRef(item as never)}
				onmove={(i, by) => void write(listMoved(value, i, by))}
				onremove={(i) => void write(listWithout(value, i))}
				onstep={(i, by) => {
					const ref = listItemRef(items[i]!)
					if (ref) void write(listWithRefStep(value, ref.entryId, by))
				}}
				empty={t("Nothing in the list yet.")}
				footer={wordsFooter}
				parts={{ root: "stat-slot.editor", list: "stat-slot.items", item: "stat-slot.item", empty: "stat-slot.items-empty" }}
			/>
		{:else if editing && kind === "story-time"}
			<StoryTimeEditor {value} label={fieldLabel} {t} onsave={write} oncancel={() => (editing = false)} />
		{:else if editing}
			<!-- svelte-ignore a11y_autofocus -->
			<input
				data-widget-part="stat-slot.field"
				type="text"
				aria-label={fieldLabel}
				keys="Escape Enter"
				autofocus
				aria-invalid={invalid ? "true" : undefined}
				bind:value={textDraft}
				onchange={commitText}
				onblur={() => onblur(textDraft === textOpened, commitText)}
				onkey={(e: CustomEvent<HostKeyEventDetail>) => onkey(e, commitText)}
			/>
			{@render refusalLine()}
		{:else if bar}
			<button
				type="button"
				data-widget-part="stat-slot.bar"
				aria-label={t("{label} {value}, edit").replace("{label}", slot.label).replace("{value}", bar.label)}
				onclick={open}
			>
				<span data-widget-part="stat-slot.track meter">
					<span data-widget-part="stat-slot.fill" style:--sp-fill="{bar.percent}%"></span>
				</span>
				<span data-widget-part="stat-slot.bar-value value">{bar.label}</span>
			</button>
			{@render refusalLine()}
		{:else if kind === "choice"}
			<!-- The chip opens the closed set; picking one writes it. -->
			<sp-menu label={fieldLabel} onselect={pick}>
				<button
					slot="trigger"
					type="button"
					data-widget-part="stat-slot.chip chip"
					data-empty={value == null ? "" : undefined}
					aria-label={editLabel}
				>
					{shown || notSet}
				</button>
				<sp-menu-item value={CLEAR} data-widget-part="stat-slot.option" data-empty="">{notSet}</sp-menu-item>
				{#each options as option (option)}
					<sp-menu-item value="opt:{option}" data-widget-part="stat-slot.option">
						{#if value === option}<sp-icon name="check" size="12" label={t("current")}></sp-icon>{/if}
						<span>{choiceOptionText(slot, option)}</span>
					</sp-menu-item>
				{/each}
			</sp-menu>
			{@render refusalLine()}
		{:else}
			<!-- Text, a list, a story time: the line reads as the value; opening it edits. -->
			<button
				type="button"
				data-widget-part="stat-slot.line value"
				data-empty={value === undefined || (kind === "list" && !items.length) ? "" : undefined}
				aria-label={editLabel}
				onclick={open}
			>
				{#if itemLines}{#each itemLines as line, j (j)}{#if j > 0}<br />{/if}{line}{/each}{:else}{kind === "list" ? (items.length ? shown : t("none")) : shown || notSet}{/if}
			</button>
			{@render refusalLine()}
		{/if}
	</div>
	{@render trail?.()}
</div>
