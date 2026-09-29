<script lang="ts">
	/**
	 * Lore entries (PLAN-sdk-1.0 §3.9, R58; R21 port): the session's lorebook
	 * entry by entry, with what this session's rankings made of each, and the
	 * two marks — **Off** and **Pin** — which never force a re-embed.
	 *
	 * It reads its settings alone. Everything else is asked of the page: one
	 * `session-entries` does the search, sort, filter and paging for the
	 * page's own session (the declared `lore` scope is the grant for it), and
	 * `set-entry-marks` sets a mark. The page answers every ask with its own
	 * reply, so which answer to show is this widget's: its latest-ask guard.
	 * A turn that writes the rankings tells it `lore:ranked` (R81), and it
	 * pages again; so does a mark set anywhere else on an entry it shows
	 * (`lore:marked`). The refresh button stays.
	 *
	 * What goes wrong is said here, in this widget (R77) — never a toast every
	 * lore widget shows. The book's owner and admins see the entries; anyone
	 * else is told whose they are, because a widget declaration has no
	 * visibility field of its own.
	 *
	 * The markup carries no look (P3d): its elements carry `lore-entries.*`
	 * widget parts and the default widget stylesheet draws them (STYLE-GUIDE
	 * §6.16). State is the elements' own: a chosen filter is its radio's
	 * `:checked`, a pressed mark its button's `aria-pressed`, an entry turned
	 * off `data-off`.
	 */
	import { untrack } from "svelte"
	import type { SessionEntryV1, WidgetRequests } from "@serene-pub/sdk/component"
	import {
		LORE_ENTRIES_FILTERS,
		LORE_ENTRIES_SORTS,
		createLatestAsk,
		loreEntriesEmptyLine,
		loreEntriesSpan,
		loreEntryName,
		loreEntryReadLine,
		readLoreEntriesSettings,
		type LoreEntriesFilter,
		type LoreEntriesSort
	} from "@serene-pub/core-catalog/lore-entries"
	import { useWidgetContext } from "../shared/context"

	type Answer = WidgetRequests["session-entries"]["result"]
	type Ask = WidgetRequests["session-entries"]["params"]

	/** Whether to ask the page yet: false until the host has posted this instance's settings. */
	let { ready = true }: { ready?: boolean } = $props()

	const widget = useWidgetContext()
	const t = (source: string): string => widget?.current?.t(source) ?? source

	// Primitives, so a push that changes neither asks nothing again.
	const pageSize = $derived(
		readLoreEntriesSettings(widget?.current?.settings?.v1 as Record<string, unknown> | undefined).pageSize
	)
	const settledSort = $derived(
		readLoreEntriesSettings(widget?.current?.settings?.v1 as Record<string, unknown> | undefined).sort
	)

	let query = $state("")
	let sort = $state<LoreEntriesSort | null>(null)
	const effectiveSort = $derived<LoreEntriesSort>(sort ?? settledSort)
	let filter = $state<LoreEntriesFilter>("all")
	let offset = $state(0)

	let answer = $state<Answer | null>(null)
	/** Why the page could not be read, this widget's own. */
	let readError = $state<string | null>(null)
	/** Why a mark did not change, this widget's own. */
	let markError = $state<string | null>(null)

	/** The filter radios' group name: one per mount, so two copies never share a group (F8). */
	const filterGroup = `sp-lore-filter-${Math.random().toString(36).slice(2, 10)}`

	const latest = createLatestAsk()
	const reason = (e: unknown) => (e instanceof Error ? e.message : String(e))

	// The search asks once typing pauses, not once per keystroke.
	let searched = $state("")
	$effect(() => {
		const q = query.trim()
		const timer = setTimeout(() => (searched = q), 250)
		return () => clearTimeout(timer)
	})

	const askParams = (): Ask => ({
		...(searched ? { titleOrKey: searched } : {}),
		sort: effectiveSort,
		filter,
		offset,
		limit: pageSize
	})

	function ask(params: Ask) {
		const ctx = widget?.current
		if (!ctx) return
		const ticket = latest.next()
		ctx.request("session-entries", params).then(
			(res) => {
				if (!latest.isLatest(ticket)) return
				readError = null
				answer = res
				// The page pulls a page that ran past the end back to the last one.
				if (typeof res.offset === "number" && res.offset !== offset) offset = res.offset
			},
			(e) => {
				if (!latest.isLatest(ticket)) return
				readError = reason(e)
			}
		)
	}

	/** Ask again for the page on screen. */
	const refresh = () => untrack(() => ready && ask(askParams()))

	// Each change of the search, sort, filter, page or page size asks again —
	// and a refused mark's line goes with the view it was said over.
	$effect(() => {
		if (!ready) return
		const params = askParams()
		untrack(() => {
			markError = null
			ask(params)
		})
	})

	// A turn wrote the rankings these entries read (R81): ask again.
	$effect(() => untrack(() => widget?.current?.on("lore:ranked", refresh)))

	// A mark changed elsewhere — another widget, another tab — on an entry
	// shown here: ask again, so this list is never the stale one.
	$effect(() =>
		untrack(() =>
			widget?.current?.on("lore:marked", (e) => {
				if (e.kind === "lore:marked" && answer?.rows.some((r) => r.id === e.entryId)) refresh()
			})
		)
	)

	function setFilter(value: LoreEntriesFilter) {
		filter = value
		offset = 0
	}

	async function setMark(row: SessionEntryV1, mark: "off" | "pinned") {
		const ctx = untrack(() => widget?.current)
		if (!ctx) return
		markError = null
		try {
			const now = await ctx.request("set-entry-marks", {
				entryId: row.id,
				...(mark === "off" ? { off: !row.off } : { pinned: !row.pinned })
			})
			if (answer)
				answer = {
					...answer,
					rows: answer.rows.map((r) => (r.id === row.id ? { ...r, off: now.off, pinned: now.pinned } : r))
				}
		} catch (e) {
			markError = t("Not changed: {reason}").replace("{reason}", reason(e))
		}
		// What the filter shows may have moved either way.
		refresh()
	}

	const span = $derived(answer ? loreEntriesSpan(offset, pageSize, answer.total) : null)
	const readLine = (r: SessionEntryV1) => loreEntryReadLine(r, Date.now(), t)
</script>

<div data-widget-part="lore-entries.root" data-widget="lore-entries">
	{#if answer?.ownerOnly}
		<p data-widget-part="lore-entries.note">
			{t("These entries are the lorebook owner's to manage.")}
		</p>
	{:else if answer && answer.lorebookId === null}
		<p data-widget-part="lore-entries.note">{t("This session reads no lorebook.")}</p>
	{:else}
		<div data-widget-part="lore-entries.search-bar toolbar">
			<label data-widget-part="lore-entries.search">
				<span data-widget-part="lore-entries.search-label">{t("Search entries by title or key")}</span>
				<span data-widget-part="lore-entries.search-icon">
					<sp-icon name="search" size="14"></sp-icon>
				</span>
				<input
					type="text"
					data-widget-part="lore-entries.search-input"
					placeholder={answer
						? t("Search {total} entries").replace("{total}", String(answer.total))
						: t("Search entries")}
					value={query}
					oninput={(e) => {
						query = e.currentTarget.value
						offset = 0
					}}
				/>
			</label>
			<button
				type="button"
				data-widget-part="lore-entries.refresh"
				aria-label={t("Refresh")}
				title={t("Refresh")}
				onclick={refresh}
			>
				<sp-icon name="refresh-cw" size="14"></sp-icon>
			</button>
		</div>
		<div data-widget-part="lore-entries.filter-bar toolbar">
			<div data-widget-part="lore-entries.filters" role="radiogroup" aria-label={t("Show")}>
				{#each LORE_ENTRIES_FILTERS as f (f.value)}
					<!-- Chosen is the radio's own `:checked`: the sheet reads it, no state attribute. -->
					<label data-widget-part="lore-entries.filter chip">
						<input
							type="radio"
							data-widget-part="lore-entries.filter-input"
							name={filterGroup}
							value={f.value}
							checked={filter === f.value}
							onchange={() => setFilter(f.value)}
						/>
						{t(f.label)}
					</label>
				{/each}
			</div>
			<span data-widget-part="lore-entries.sort">
				<!-- The combobox's own label is the one visible "Sort" (the host draws it). -->
				<sp-combobox
					data-widget-part="lore-entries.sort-field"
					label={t("Sort")}
					value={effectiveSort}
					onchange={(e: CustomEvent<{ value: string }>) => {
						const next = LORE_ENTRIES_SORTS.find((s) => s.value === e.detail.value)
						if (!next) return
						sort = next.value
						offset = 0
					}}
				>
					{#each LORE_ENTRIES_SORTS as o (o.value)}
						<sp-option value={o.value}>{t(o.label)}</sp-option>
					{/each}
				</sp-combobox>
			</span>
		</div>

		{#if readError}
			<p data-widget-part="lore-entries.alert" role="alert">{readError}</p>
		{/if}
		{#if markError}
			<p data-widget-part="lore-entries.alert" role="alert">{markError}</p>
		{/if}

		<ul data-widget-part="lore-entries.entries list" aria-label={t("Lore entries")}>
			{#each answer?.rows ?? [] as r (r.id)}
				<!-- Pressed marks are the buttons' own `aria-pressed`; an entry turned off is `data-off`. -->
				<li data-widget-part="lore-entries.entry row" data-entry-id={r.id} data-off={r.off ? "" : undefined}>
					<span data-widget-part="lore-entries.entry-text">
						<span data-widget-part="lore-entries.entry-title label">
							{loreEntryName(r, t)}
						</span>
						{#if r.keys.length}
							<span data-widget-part="lore-entries.entry-keys">{r.keys.join(t(", "))}</span>
						{/if}
						<span data-widget-part="lore-entries.entry-read">{readLine(r)}</span>
					</span>
					<span data-widget-part="lore-entries.marks">
						<button
							type="button"
							data-widget-part="lore-entries.pin"
							aria-pressed={r.pinned}
							aria-label={t("Pin {name}").replace("{name}", r.title || t("entry {id}").replace("{id}", String(r.id)))}
							title={r.pinned ? t("Pinned: always read") : t("Pin: always read")}
							onclick={() => setMark(r, "pinned")}
						>
							<sp-icon name="pin" size="14"></sp-icon>
						</button>
						<button
							type="button"
							data-widget-part="lore-entries.off"
							aria-pressed={r.off}
							aria-label={t("Turn {name} off").replace("{name}", r.title || t("entry {id}").replace("{id}", String(r.id)))}
							title={r.off ? t("Off: never read") : t("Turn off: never read")}
							onclick={() => setMark(r, "off")}
						>
							<sp-icon name="circle-off" size="14"></sp-icon>
						</button>
					</span>
				</li>
			{:else}
				{#if answer}
					<li data-widget-part="lore-entries.empty empty">{loreEntriesEmptyLine(query, filter, t)}</li>
				{/if}
			{/each}
		</ul>

		{#if span?.paged}
			<div data-widget-part="lore-entries.pager">
				<button
					type="button"
					data-widget-part="lore-entries.previous"
					disabled={!span.hasPrevious}
					onclick={() => (offset = span.previousOffset)}
				>
					{t("Previous")}
				</button>
				<span data-widget-part="lore-entries.page-count">
					{t("{from}–{to} of {total}")
						.replace("{from}", String(span.from))
						.replace("{to}", String(span.to))
						.replace("{total}", String(span.total))}
				</span>
				<button
					type="button"
					data-widget-part="lore-entries.next"
					disabled={!span.hasNext}
					onclick={() => (offset = span.nextOffset)}
				>
					{t("Next")}
				</button>
			</div>
		{/if}
	{/if}
</div>
