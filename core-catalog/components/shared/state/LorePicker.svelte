<script lang="ts">
	/**
	 * A list's lorebook picker (phase 3c), out of the slot control (C9): the
	 * session's lorebook searched by title or key — item entries first, then
	 * the rest of the book — one chosen, with how many to add. Enter in the
	 * search searches, Enter in the count adds, Escape closes.
	 *
	 * Adding writes the whole list through `onadd`, which resolves to the
	 * host's refusal or `null` (A21): the count stays as typed until the
	 * write lands, and a refusal is said in this picker's own `invalid` line.
	 *
	 * Parts are the slot control's (`stat-slot.pick-*`, STYLE-GUIDE §6.16).
	 */
	import {
		countDraftFor,
		listWithRefAdded,
		pickableEntries,
		type PickableEntry,
		type SlotWriteValue
	} from "@serene-pub/core-catalog/session-state"
	import type { HostKeyEventDetail } from "@serene-pub/sdk/component"
	import type { EntryFinder, EntryFinds } from "./entryFinder"
	import type { SlotWriteResult } from "./slotWriter.svelte"

	interface Props {
		/** The list's label, for the picker's own name. */
		label: string
		value: unknown
		config: Record<string, unknown>
		findEntries: EntryFinder
		t: (source: string) => string
		onadd: (value: SlotWriteValue) => Promise<SlotWriteResult>
		onclose: () => void
	}

	let { label, value, config, findEntries, t, onadd, onclose }: Props = $props()

	let words = $state("")
	let count = $state<number | null>(1)
	let found = $state<EntryFinds | null>(null)
	let chosenId = $state<number | null>(null)
	let busy = $state(false)
	let invalid = $state<{ text: string; detail: string | null } | null>(null)
	/** The newest search owns the list: an older answer that lands late is dropped. */
	let searches = 0

	let offered = $derived<PickableEntry[]>(found ? pickableEntries(value, found.pages) : [])
	let offeredItems = $derived(offered.filter((e) => e.item))
	let offeredOthers = $derived(offered.filter((e) => !e.item))
	let chosen = $derived(offered.find((e) => e.entryId === chosenId) ?? null)

	async function search() {
		const mine = ++searches
		busy = true
		try {
			const next = await findEntries(words)
			if (mine !== searches) return
			found = next
			if (chosenId !== null && !next.pages.some((p) => p.some((r) => r.id === chosenId))) chosenId = null
		} catch (e) {
			if (mine !== searches) return
			found = { pages: [], notice: e instanceof Error ? e.message : String(e) }
		} finally {
			if (mine === searches) busy = false
		}
	}

	async function add() {
		if (!chosen) {
			invalid = { text: t("Choose an entry to add first."), detail: null }
			return
		}
		const n = countDraftFor(count)
		if (n === undefined) {
			invalid = { text: t("How many is a whole number, 1 or more."), detail: null }
			return
		}
		const edit = listWithRefAdded(value, chosen.entryId, n, config)
		if (edit.refusal) {
			invalid = { text: edit.refusal, detail: null }
			return
		}
		invalid = null
		const refused = await onadd(edit.value as SlotWriteValue)
		if (refused) invalid = refused
		else count = 1
	}

	function onkey(e: CustomEvent<HostKeyEventDetail>, enter: () => void) {
		if (e.detail.key === "Enter") enter()
		else if (e.detail.key === "Escape") onclose()
	}

	// Opened: search the whole book at once.
	void search()
</script>

<div data-widget-part="stat-slot.picker" role="group" aria-label={t("Add to {label} from the lorebook").replace("{label}", label)}>
	<!-- svelte-ignore a11y_autofocus -->
	<input
		data-widget-part="stat-slot.pick-search stat-slot.field"
		type="text"
		aria-label={t("Search the lorebook")}
		placeholder={t("Search by name or key, then Enter")}
		keys="Escape Enter"
		autofocus
		bind:value={words}
		onkey={(e: CustomEvent<HostKeyEventDetail>) => onkey(e, () => void search())}
	/>
	{#if !found}
		<p data-widget-part="stat-slot.pick-status" role="status">{t("Searching the lorebook…")}</p>
	{:else if found.notice}
		<p data-widget-part="stat-slot.pick-status" role="status">{found.notice}</p>
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
								aria-pressed={chosenId === entry.entryId}
								onclick={() => (chosenId = chosenId === entry.entryId ? null : entry.entryId)}
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
	{#if busy && found}
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
			bind:value={count}
			onkey={(e: CustomEvent<HostKeyEventDetail>) => onkey(e, () => void add())}
		/>
		<button type="button" data-widget-part="stat-slot.pick-confirm" disabled={!chosen} onclick={() => void add()}>
			{chosen ? t("Add {item}").replace("{item}", chosen.title) : t("Add")}
		</button>
		<button type="button" data-widget-part="stat-slot.pick-close" onclick={onclose}>{t("Close")}</button>
	</div>
	{#if invalid}
		<p data-widget-part="stat-slot.invalid" role="alert" title={invalid.detail ?? undefined}>{invalid.text}</p>
	{/if}
</div>
