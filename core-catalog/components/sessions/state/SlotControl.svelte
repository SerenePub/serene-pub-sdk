<script lang="ts">
	/**
	 * One attribute slot, drawn as what it is and edited in place — shared by
	 * core's World State and Stats widgets (R21).
	 *
	 * The slot's STAT SHAPE decides the control (`slotKind`: its field, or its
	 * type when the host predates shapes), and the configuration in force
	 * decides its bounds: a bounded number is a bar, a choice is a chip over a
	 * closed set (an `sp-menu` on the chip), a list opens to its items — add,
	 * remove, move up and down — a story time is read through the calendar
	 * and opens to its year, month, day and time, text is a line, a boolean is
	 * a toggle. A derived slot is computed on every read and a retired one
	 * takes nothing new, so both are shown greyed and never offered.
	 *
	 * Every edit here is the USER's, which is the one writer with authority: it
	 * applies at once (`set-attribute-value`) rather than waiting at the review
	 * gate. Nothing is applied optimistically — the new value arrives as a
	 * `session_state` push, so what is drawn a beat later is the resolver's
	 * answer and not this component's guess. A list is written whole, its
	 * items in order.
	 *
	 * A number or text field commits on Enter, and Escape puts the stored
	 * value back (R80: the field's `keys`). Leaving the field commits what was
	 * typed, and only closes it when nothing was — never a write of the value
	 * already stored. A text field also commits on `change`; a number field
	 * does not, because the browser raises `change` on every spinner step and
	 * a person may step several times before they are done. A list's new item
	 * is added on Enter; a story time is saved on Enter or its Save button —
	 * it has four fields, so leaving one of them is not being done.
	 *
	 * A list that takes lore references (one not closed over words) also
	 * picks from the session's lorebook (phase 3c): item entries first, then
	 * the rest of the book, with how many to add — Enter in the count field
	 * adds, Escape closes the picker. A held reference reads "Name ×N" and
	 * steps up and down; one fewer than one takes it out.
	 *
	 * The markup carries no look. A shared control owns its parts under its own
	 * name, so every element here is `stat-slot.<part>` in `data-widget-part`
	 * (with a generic part where the element truly is one): a style draws a
	 * slot once for every widget, and scopes it to one through the widget's
	 * root (STYLE-GUIDE §6.16). A slot's state is its own `data-*` or ARIA,
	 * never a part: `data-density`, `data-retired`, `data-slot-shape`,
	 * `data-empty` (nothing to show), `aria-pressed` (a switch on, a row
	 * chosen), `role="alert"` (refused).
	 */
	import type { SessionStateSlotV1 } from "@serene-pub/core-catalog/widgets"
	import {
		barView,
		enumValues,
		listItemKeyOf,
		listItemRef,
		listItemText,
		listItemsOf,
		listMoved,
		countDraftFor,
		listWithAdded,
		listWithRefAdded,
		listWithRefStep,
		listWithout,
		numberDraftFor,
		pickableEntries,
		slotTakesLoreRefs,
		type PickableEntry,
		shownValueText,
		slotIsWhole,
		slotKind,
		slotWritable,
		storyTimeDraftOf,
		storyTimeDraftValue,
		textDraftValue,
		type SlotWriteValue,
		type StoryTimeDraft
	} from "@serene-pub/core-catalog/session-state"
	import type { HostKeyEventDetail } from "@serene-pub/sdk/component"
	import type { EntryFinder, EntryFinds } from "./entryFinder"

	interface Props {
		slot: SessionStateSlotV1
		/** The configuration in force for this owner: bounds, options, a list's limits. */
		config: Record<string, unknown>
		value: unknown
		/** Compact drops the label into the control's own line. */
		density?: "compact" | "full"
		/** The widget's language. */
		t: (source: string) => string
		/** `null` clears this layer, so the read inherits again. */
		onset: (value: SlotWriteValue) => void
		/** Searches the session's lorebook for a list's picker; absent, a list adds words only. */
		findEntries?: EntryFinder
	}

	let { slot, config, value, density = "full", t, onset, findEntries }: Props = $props()

	/** A menu item's value for "not set" — never an option's, which are `opt:`-prefixed. */
	const CLEAR = "clear"

	let editing = $state(false)
	let numberDraft = $state<number | null>(null)
	let textDraft = $state("")
	let itemDraft = $state("")
	let timeDraft = $state<StoryTimeDraft>({ year: "", month: "", day: "", time: "" })
	/** Why the editor's last attempt wrote nothing — a list over its limit, a time that is not one. */
	let invalid = $state<string | null>(null)
	/** The drafts as the field opened, so leaving it untouched writes nothing. */
	let numberOpened: number | null = null
	let textOpened = ""

	// The lorebook picker, inside a list's editor.
	let picking = $state(false)
	let pickWords = $state("")
	let pickCount = $state<number | null>(1)
	let pickFound = $state<EntryFinds | null>(null)
	let pickChosen = $state<number | null>(null)
	let pickBusy = $state(false)
	/** The newest search owns the list: an older answer that lands late is dropped. */
	let searches = 0

	let kind = $derived(slotKind(slot))
	let bar = $derived(kind === "number" ? barView(value, config as { min?: number; max?: number }) : null)
	let options = $derived(enumValues(config))
	let items = $derived(listItemsOf(value))
	let canPick = $derived(!!findEntries && slotTakesLoreRefs(config))
	let offered = $derived<PickableEntry[]>(pickFound ? pickableEntries(value, pickFound.pages) : [])
	let offeredItems = $derived(offered.filter((e) => e.item))
	let offeredOthers = $derived(offered.filter((e) => !e.item))
	let chosen = $derived(offered.find((e) => e.entryId === pickChosen) ?? null)
	let writable = $derived(slotWritable(slot))
	let shown = $derived(shownValueText(slot, value, t))
	let notSet = $derived(t("not set"))
	let fieldLabel = $derived(t("{label} value").replace("{label}", slot.label))
	let editLabel = $derived(t("{label}, edit").replace("{label}", slot.label))
	let barEditLabel = $derived(
		bar ? t("{label} {value}, edit").replace("{label}", slot.label).replace("{value}", bar.label) : editLabel
	)

	function open() {
		if (!writable) return
		numberDraft = numberOpened = typeof value === "number" ? value : null
		textDraft = textOpened = value === undefined || value === null ? "" : String(value)
		itemDraft = ""
		timeDraft = storyTimeDraftOf(value)
		invalid = null
		picking = false
		editing = true
	}

	/** One commit per edit: Enter and `change` may both arrive for one. */
	function commitNumber() {
		if (!editing) return
		editing = false
		const next = numberDraftFor(numberDraft, config as { min?: number; max?: number }, slotIsWhole(slot))
		if (next !== undefined) onset(next)
	}

	function commitText() {
		if (!editing) return
		editing = false
		onset(textDraftValue(textDraft, config as { maxLength?: unknown }))
	}

	/** Enter commits; Escape leaves the stored value as it was. */
	function onkey(e: CustomEvent<HostKeyEventDetail>, commit: () => void) {
		if (e.detail.key === "Enter") commit()
		else if (e.detail.key === "Escape") editing = false
	}

	/** Leaving the field: commit what was typed, or just close it. */
	function onblur(unchanged: boolean, commit: () => void) {
		if (!editing) return
		if (unchanged) editing = false
		else commit()
	}

	function pick(e: CustomEvent<{ value: string }>) {
		const v = e.detail.value
		if (v === CLEAR) onset(null)
		else if (v.startsWith("opt:")) onset(v.slice(4))
	}

	// ── A list: every change writes the whole list, and the editor stays open ──

	function addItem() {
		const edit = listWithAdded(value, itemDraft, config)
		if (!edit) return
		if (edit.refusal) {
			invalid = edit.refusal
			return
		}
		invalid = null
		itemDraft = ""
		onset(edit.value)
	}

	function onItemKey(e: CustomEvent<HostKeyEventDetail>) {
		if (e.detail.key === "Enter") addItem()
		else if (e.detail.key === "Escape") editing = false
	}

	// ── A list's lorebook picker: choose an entry, say how many, add ──

	async function search() {
		if (!findEntries) return
		const mine = ++searches
		pickBusy = true
		try {
			const found = await findEntries(pickWords)
			if (mine !== searches) return
			pickFound = found
			if (pickChosen !== null && !found.pages.some((p) => p.some((r) => r.id === pickChosen))) pickChosen = null
		} catch (e) {
			if (mine !== searches) return
			pickFound = { pages: [], notice: e instanceof Error ? e.message : String(e) }
		} finally {
			if (mine === searches) pickBusy = false
		}
	}

	function openPicker() {
		picking = true
		pickWords = ""
		pickCount = 1
		pickChosen = null
		pickFound = null
		invalid = null
		void search()
	}

	function closePicker() {
		picking = false
		pickChosen = null
	}

	function addPicked() {
		if (!chosen) {
			invalid = t("Choose an entry to add first.")
			return
		}
		const count = countDraftFor(pickCount)
		if (count === undefined) {
			invalid = t("How many is a whole number, 1 or more.")
			return
		}
		const edit = listWithRefAdded(value, chosen.entryId, count, config)
		if (edit.refusal) {
			invalid = edit.refusal
			return
		}
		invalid = null
		pickCount = 1
		onset(edit.value)
	}

	function onPickKey(e: CustomEvent<HostKeyEventDetail>, enter: () => void) {
		if (e.detail.key === "Enter") enter()
		else if (e.detail.key === "Escape") closePicker()
	}

	// ── A story time: four fields, saved together ──

	function commitTime() {
		if (!editing) return
		const next = storyTimeDraftValue(timeDraft)
		if (next === undefined) {
			invalid = t("That is not a story time: a year, then a month, a day and a time as hh:mm — each optional, a day only with a month.")
			return
		}
		editing = false
		invalid = null
		onset(next)
	}

	function onTimeKey(e: CustomEvent<HostKeyEventDetail>) {
		if (e.detail.key === "Enter") commitTime()
		else if (e.detail.key === "Escape") editing = false
	}
</script>

<div
	data-widget-part="stat-slot.root row"
	data-density={density}
	data-slot-id={slot.slotId}
	data-slot-type={slot.type}
	data-slot-shape={kind}
	data-retired={slot.retired ? "" : undefined}
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
	</span>

	<div data-widget-part="stat-slot.control">
		{#if kind === "boolean" && writable}
			<button
				type="button"
				data-widget-part="stat-slot.chip chip"
				aria-pressed={value === true}
				onclick={() => onset(value === true ? false : true)}
			>
				{value === undefined ? notSet : shown}
			</button>
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
				bind:value={numberDraft}
				onblur={() => onblur(numberDraft === numberOpened, commitNumber)}
				onkey={(e: CustomEvent<HostKeyEventDetail>) => onkey(e, commitNumber)}
			/>
		{:else if editing && kind === "list"}
			<div data-widget-part="stat-slot.editor" role="group" aria-label={fieldLabel}>
				{#if items.length}
					<ol data-widget-part="stat-slot.items list">
						{#each items as item, i (listItemKeyOf(item, i))}
							{@const itemText = listItemText(item, t)}
							{@const ref = listItemRef(item)}
							<li data-widget-part="stat-slot.item row" data-item-index={i}>
								<span data-widget-part="stat-slot.item-text label">{itemText}</span>
								{#if ref}
									<button
										type="button"
										data-widget-part="stat-slot.item-less"
										aria-label={t("One fewer {item}").replace("{item}", itemText)}
										onclick={() => onset(listWithRefStep(value, ref.entryId, -1))}
									>
										<sp-icon name="minus" size="11"></sp-icon>
									</button>
									<button
										type="button"
										data-widget-part="stat-slot.item-more"
										aria-label={t("One more {item}").replace("{item}", itemText)}
										onclick={() => onset(listWithRefStep(value, ref.entryId, 1))}
									>
										<sp-icon name="plus" size="11"></sp-icon>
									</button>
								{/if}
								<button
									type="button"
									data-widget-part="stat-slot.item-up"
									disabled={i === 0}
									aria-label={t("Move {item} up").replace("{item}", itemText)}
									onclick={() => onset(listMoved(value, i, -1))}
								>
									<sp-icon name="arrow-up" size="11"></sp-icon>
								</button>
								<button
									type="button"
									data-widget-part="stat-slot.item-down"
									disabled={i === items.length - 1}
									aria-label={t("Move {item} down").replace("{item}", itemText)}
									onclick={() => onset(listMoved(value, i, 1))}
								>
									<sp-icon name="arrow-down" size="11"></sp-icon>
								</button>
								<button
									type="button"
									data-widget-part="stat-slot.item-remove"
									aria-label={t("Remove {item}").replace("{item}", itemText)}
									onclick={() => onset(listWithout(value, i))}
								>
									<sp-icon name="x" size="11"></sp-icon>
								</button>
							</li>
						{/each}
					</ol>
				{:else}
					<p data-widget-part="stat-slot.items-empty empty">{t("Nothing in the list yet.")}</p>
				{/if}
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
				{#if canPick && !picking}
					<button type="button" data-widget-part="stat-slot.pick-open" onclick={openPicker}>
						<sp-icon name="book-open" size="12"></sp-icon>
						<span>{t("Add from the lorebook")}</span>
					</button>
				{:else if canPick}
					<div
						data-widget-part="stat-slot.picker"
						role="group"
						aria-label={t("Add to {label} from the lorebook").replace("{label}", slot.label)}
					>
						<!-- svelte-ignore a11y_autofocus -->
						<input
							data-widget-part="stat-slot.pick-search stat-slot.field"
							type="text"
							aria-label={t("Search the lorebook")}
							placeholder={t("Search by name or key, then Enter")}
							keys="Escape Enter"
							autofocus
							bind:value={pickWords}
							onkey={(e: CustomEvent<HostKeyEventDetail>) => onPickKey(e, () => void search())}
						/>
						{#if !pickFound}
							<p data-widget-part="stat-slot.pick-status" role="status">{t("Searching the lorebook…")}</p>
						{:else if pickFound.notice}
							<p data-widget-part="stat-slot.pick-status" role="status">{pickFound.notice}</p>
						{:else if !offered.length}
							<p data-widget-part="stat-slot.pick-status" role="status">{t("Nothing in the lorebook matches.")}</p>
						{:else}
							{#each [{ heading: t("Items"), rows: offeredItems, group: "items" }, { heading: t("Other entries"), rows: offeredOthers, group: "others" }] as part (part.group)}
								{#if part.rows.length}
									<p data-widget-part="stat-slot.pick-heading">{part.heading}</p>
									<ul data-widget-part="stat-slot.pick-list list" aria-label={part.heading} data-pick-group={part.group}>
										{#each part.rows as entry (entry.entryId)}
											<li>
												<button
													type="button"
													data-widget-part="stat-slot.pick-entry row"
													data-entry-id={entry.entryId}
													aria-pressed={pickChosen === entry.entryId}
													onclick={() => (pickChosen = pickChosen === entry.entryId ? null : entry.entryId)}
												>
													<span data-widget-part="stat-slot.pick-title label">{entry.title}</span>
													{#if entry.held}
														<span data-widget-part="stat-slot.pick-held">{t("held ×{n}").replace("{n}", String(entry.held))}</span>
													{/if}
												</button>
											</li>
										{/each}
									</ul>
								{/if}
							{/each}
						{/if}
						{#if pickBusy && pickFound}
							<p data-widget-part="stat-slot.pick-status" role="status">{t("Searching the lorebook…")}</p>
						{/if}
						<div data-widget-part="stat-slot.pick-add toolbar">
							<input
								data-widget-part="stat-slot.pick-count stat-slot.field"
								type="number"
								min="1"
								step="1"
								aria-label={chosen ? t("How many {item} to add").replace("{item}", chosen.title) : t("How many to add")}
								keys="Escape Enter"
								bind:value={pickCount}
								onkey={(e: CustomEvent<HostKeyEventDetail>) => onPickKey(e, addPicked)}
							/>
							<button type="button" data-widget-part="stat-slot.pick-confirm" disabled={!chosen} onclick={addPicked}>
								{chosen ? t("Add {item}").replace("{item}", chosen.title) : t("Add")}
							</button>
							<button type="button" data-widget-part="stat-slot.pick-close" onclick={closePicker}>{t("Close")}</button>
						</div>
					</div>
				{/if}
				{#if invalid}<p data-widget-part="stat-slot.invalid" role="alert">{invalid}</p>{/if}
				<button type="button" data-widget-part="stat-slot.done" onclick={() => (editing = false)}>{t("Done")}</button>
			</div>
		{:else if editing && kind === "story-time"}
			<div data-widget-part="stat-slot.editor" role="group" aria-label={fieldLabel}>
				<!-- svelte-ignore a11y_autofocus -->
				<input
					data-widget-part="stat-slot.year stat-slot.field"
					type="number"
					step="1"
					aria-label={t("Year")}
					placeholder={t("Year")}
					keys="Escape Enter"
					autofocus
					bind:value={timeDraft.year}
					onkey={onTimeKey}
				/>
				<input
					data-widget-part="stat-slot.month stat-slot.field"
					type="number"
					min="1"
					step="1"
					aria-label={t("Month")}
					placeholder={t("Month")}
					keys="Escape Enter"
					bind:value={timeDraft.month}
					onkey={onTimeKey}
				/>
				<input
					data-widget-part="stat-slot.day stat-slot.field"
					type="number"
					min="1"
					step="1"
					aria-label={t("Day")}
					placeholder={t("Day")}
					keys="Escape Enter"
					bind:value={timeDraft.day}
					onkey={onTimeKey}
				/>
				<input
					data-widget-part="stat-slot.clock stat-slot.field"
					type="text"
					aria-label={t("Time of day")}
					placeholder="hh:mm"
					keys="Escape Enter"
					bind:value={timeDraft.time}
					onkey={onTimeKey}
				/>
				{#if invalid}<p data-widget-part="stat-slot.invalid" role="alert">{invalid}</p>{/if}
				<button type="button" data-widget-part="stat-slot.save" onclick={commitTime}>{t("Save")}</button>
				<button type="button" data-widget-part="stat-slot.cancel" onclick={() => (editing = false)}>{t("Cancel")}</button>
			</div>
		{:else if editing}
			<!-- svelte-ignore a11y_autofocus -->
			<input
				data-widget-part="stat-slot.field"
				type="text"
				aria-label={fieldLabel}
				keys="Escape Enter"
				autofocus
				bind:value={textDraft}
				onchange={commitText}
				onblur={() => onblur(textDraft === textOpened, commitText)}
				onkey={(e: CustomEvent<HostKeyEventDetail>) => onkey(e, commitText)}
			/>
		{:else if bar}
			<button
				type="button"
				data-widget-part="stat-slot.bar"
				disabled={!writable}
				aria-label={barEditLabel}
				onclick={open}
			>
				<span data-widget-part="stat-slot.track meter">
					<span data-widget-part="stat-slot.fill" style:--sp-fill="{bar.percent}%"></span>
				</span>
				<span data-widget-part="stat-slot.bar-value value">{bar.label}</span>
			</button>
		{:else if kind === "choice" && writable}
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
						<span>{option}</span>
					</sp-menu-item>
				{/each}
			</sp-menu>
		{:else if kind === "choice"}
			<button
				type="button"
				data-widget-part="stat-slot.chip chip"
				data-empty={value == null ? "" : undefined}
				disabled
				aria-label={editLabel}
			>
				{shown || notSet}
			</button>
		{:else if kind === "list"}
			<!-- A list reads as its items; opening it edits them. -->
			<button
				type="button"
				data-widget-part="stat-slot.line value"
				data-empty={items.length ? undefined : ""}
				disabled={!writable}
				aria-label={editLabel}
				onclick={open}
			>
				{items.length ? shown : value === undefined ? notSet : t("none")}
			</button>
		{:else}
			<button
				type="button"
				data-widget-part="stat-slot.line value"
				data-empty={value === undefined ? "" : undefined}
				disabled={!writable}
				aria-label={editLabel}
				onclick={open}
			>
				{shown || notSet}
			</button>
		{/if}
	</div>
</div>
