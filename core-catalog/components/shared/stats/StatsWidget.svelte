<script lang="ts">
	/**
	 * The Stats widget: the session's stats for every owner that holds them —
	 * the world, the cast, the places — as cards, a list or a strip (R21; W7).
	 *
	 * Values come from the session's one resolved read (the `session_state`
	 * section), so this widget never resolves anything itself — which layer a
	 * number came from is a question for the owner's page, not for the
	 * playing surface. What it does own is the drawing: a bounded integer is a
	 * bar, an enum a chip, text a line, a boolean a toggle, and a derived or
	 * retired slot is greyed because there is nothing to write. Whose stats,
	 * which ones and how they are laid out are its settings (`owners`,
	 * `castScope`, `slots`, `arrangement`, `density`; `statsView`).
	 *
	 * A cards arrangement draws a card per owner. A list or a strip is World
	 * State's drawing, moved here: the world's own slots bare, then each
	 * other owner as a line — its name, then its slots. `owners: all` heads
	 * each kind (world → cast → places) with a group.
	 *
	 * World State is this widget now (an alias, W7): its ⏳ module wraps this
	 * one with the settings it implies and its own name, which rides on
	 * `data-state-widget`.
	 *
	 * A genre that declares no slots gets an empty state that says so rather
	 * than a card of blanks — a newcomer in a chat session never sees a bar.
	 * Writes `set-attribute-value`, whose refusal is this widget's own line
	 * (R77).
	 *
	 * 🚧 With `trail` (the default), a button at the end of each stat's row
	 * opens its **stat trail** in a popover (F2): the changes this session
	 * made to it, newest first — what it was, what it became, who changed it
	 * and when — asked by `stat-trail` when opened. Anyone may read it; a
	 * derived stat has none, so it gets no button.
	 *
	 * The markup carries no look: each element names what it is in
	 * `data-widget-part` (`stats.card card`, `stats.strip`, …), the
	 * arrangement rides on `data-arrangement` and density on `data-density`,
	 * and the default widget stylesheet draws them (STYLE-GUIDE §6.16).
	 */
	import type { SessionStateOwnerV1, SessionStateSlotV1 } from "@serene-pub/core-catalog/widgets"
	import {
		statsSettingsOf,
		statsView,
		statTrailByText,
		statTrailRows,
		type SlotWriteValue,
		type StatsOwnerGroup,
		type StatsShownOwner,
		type StatTrailRow
	} from "@serene-pub/core-catalog/session-state"
	import { useWidgetContext } from "../context"
	import SlotControl from "../state/SlotControl.svelte"
	import { createSlotWriter } from "../state/slotWriter.svelte"
	import { createEntryFinder } from "../state/entryFinder"

	let {
		implied = {}
	}: {
		/**
		 * Settings an alias implies, laid UNDER the host's (World State's
		 * wrapper: `owners: world`, `arrangement: strip`).
		 */
		implied?: Record<string, unknown>
	} = $props()

	const widget = useWidgetContext()
	const writer = createSlotWriter(widget)
	const t = (source: string) => widget?.current.t(source) ?? source
	// A list's lorebook picker (phase 3c) searches through `session-entries`.
	const findEntries = createEntryFinder(widget, t)

	let section = $derived(widget?.current.scope("session:state"))
	let settings = $derived.by(() => {
		const raw = widget?.current.settings.v1 ?? {}
		// ⏳ A key written the old way overrides what the alias implies for its
		// new one: World State's stored `layout: list` is the arrangement, not
		// the implied strip (`statsSettingsOf` reads it).
		const under = { ...implied }
		if (raw.layout !== undefined) delete under.arrangement
		return { ...under, ...raw }
	})
	// Not granted `session:state` (a plugin's copy an admin was not asked to,
	// or refused): the section will never come — said, not waited for.
	let view = $derived(statsView(section, settings, widget?.current.grants?.includes("session:state")))
	/** The widget's own name — `stats`, or `world-state` through its wrapper. */
	let identity = $derived(widget?.current.widget?.id ?? "stats")
	let worldOnly = $derived(view.owners === "world")
	/** A strip is one line across the top: its slots read compact. */
	let slotDensity = $derived<"compact" | "full">(view.arrangement === "strip" ? "compact" : view.density)
	// The world is `Globe` (NOMENCLATURE §22: the world door), never the
	// narrator's `CloudSun`, which World State had borrowed.
	let emptyIcon = $derived(worldOnly ? "globe" : "heart-pulse")
	let emptyIconSize = $derived(view.arrangement === "cards" ? "20" : "16")

	// A kind's head: the world's door, the characters', the places' lens (§22).
	const GROUP_ICON: Record<StatsOwnerGroup, string> = { world: "globe", cast: "users-round", places: "map" }
	const OWNER_ICON: Record<StatsOwnerGroup, string> = { world: "globe", cast: "user-round", places: "map-pin" }
	const groupLabel = (kind: StatsOwnerGroup) =>
		kind === "world" ? t("World") : kind === "cast" ? t("Cast") : t("Places")

	/** What `nothing-shown` says, by whose stats the widget draws. */
	function nothingShown(): string {
		switch (view.owners) {
			case "world":
				return t("This session's world declares no stats to show here.")
			case "places":
				return t("No place has a stat in play yet.")
			case "all":
				return t("Nothing in this session has a stat in play yet.")
			case "pick":
				return t("Nothing in this session matches the names in this widget's settings.")
			default:
				return t(
					"No one in the cast has a stat in play yet. Set one on a cast member's page, or let the story change one."
				)
		}
	}

	const write = (owner: SessionStateOwnerV1, slotId: string) => (next: SlotWriteValue) =>
		void writer.set(owner, slotId, next)

	/* ── the stat trail (F2) ───────────────────────────────────────────── */

	/** How many changes one trail asks for. */
	const TRAIL_LIMIT = 20
	let offersTrail = $derived(statsSettingsOf(settings).trail)
	/** Whose trail is open: `<owner key>|<slot id>`; null for none. */
	let trailFor = $state<string | null>(null)
	/** The open trail as it stands: asked, answered, or refused (said in the popover, R77). */
	let trail = $state<{ status: "loading" | "shown" | "failed"; rows: StatTrailRow[]; error: string | null }>({
		status: "loading",
		rows: [],
		error: null
	})
	/** Counts asks, so an answer to one closed since is dropped. */
	let trailAsked = 0
	const trailKey = (owner: SessionStateOwnerV1, slotId: string) => `${owner.key}|${slotId}`
	const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e ?? t("Something went wrong")))

	/** Open (and ask for) one stat's trail, or close it. */
	async function toggleTrail(owner: SessionStateOwnerV1, slot: SessionStateSlotV1, open: boolean) {
		const key = trailKey(owner, slot.slotId)
		if (!open) {
			if (trailFor === key) trailFor = null
			return
		}
		trailFor = key
		trail = { status: "loading", rows: [], error: null }
		const asked = ++trailAsked
		try {
			const res = (await widget?.current.request("stat-trail", {
				owner: { kind: owner.kind, id: owner.id },
				slotId: slot.slotId,
				limit: TRAIL_LIMIT
			})) as { changes?: unknown } | undefined
			if (asked !== trailAsked) return
			trail = { status: "shown", rows: statTrailRows(slot, res?.changes, t), error: null }
		} catch (e) {
			if (asked !== trailAsked) return
			trail = { status: "failed", rows: [], error: messageOf(e) }
		}
	}

	const whenText = (at: number) =>
		at > 0 ? new Date(at).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" }) : ""
</script>

{#snippet trailOf(owner: SessionStateOwnerV1, slot: SessionStateSlotV1)}
	{@const key = trailKey(owner, slot.slotId)}
	<!-- `sp-popover` (§3.5): the button is the trigger, the changes the panel. -->
	<sp-popover
		data-widget-part="stats.trail"
		placement="bottom-end"
		label={t("Changes to {label}").replace("{label}", slot.label)}
		open={trailFor === key}
		onopen-change={(e: CustomEvent<{ open: boolean }>) => toggleTrail(owner, slot, e.detail.open)}
	>
		<button
			slot="trigger"
			type="button"
			data-widget-part="stats.trail-open"
			aria-label={t("How {label} changed").replace("{label}", slot.label)}
			title={t("Changes")}
		>
			<sp-icon name="history" size="12"></sp-icon>
		</button>
		<div data-widget-part="stats.trail-panel">
			<header data-widget-part="stats.trail-head card-head">
				<sp-icon name="history" size="14"></sp-icon>
				<span>{slot.label} · {owner.label}</span>
			</header>
			{#if trailFor === key && trail.status === "loading"}
				<p data-widget-part="stats.trail-note" role="status">{t("Reading the changes…")}</p>
			{:else if trailFor === key && trail.status === "failed"}
				<p data-widget-part="stats.trail-note" role="alert">{trail.error}</p>
			{:else if trailFor === key && !trail.rows.length}
				<p data-widget-part="stats.trail-note empty">{t("No changes in this session yet.")}</p>
			{:else if trailFor === key}
				<ol data-widget-part="stats.trail-list list" aria-label={t("Changes to {label}").replace("{label}", slot.label)}>
					{#each trail.rows as row (row.key)}
						<li
							data-widget-part="stats.trail-row row"
							data-by={row.by}
							data-message-id={row.messageId ?? undefined}
						>
							<span data-widget-part="stats.trail-value value">
								{row.from ? `${row.from} → ${row.to}` : row.to}
							</span>
							<span data-widget-part="stats.trail-by label">
								{statTrailByText(row.by, t)}{row.at ? ` · ${whenText(row.at)}` : ""}
							</span>
						</li>
					{/each}
				</ol>
			{/if}
		</div>
	</sp-popover>
{/snippet}

{#snippet slotsOf(shown: StatsShownOwner, density: "compact" | "full")}
	{#each shown.slots as one (one.slot.slotId)}
		<SlotControl
			slot={one.slot}
			{density}
			config={one.config}
			value={one.value}
			{t}
			{findEntries}
			onset={write(shown.owner, one.slot.slotId)}
		>
			{#snippet trail()}
				{#if offersTrail && one.slot.type !== "derived"}
					{@render trailOf(shown.owner, one.slot)}
				{/if}
			{/snippet}
		</SlotControl>
	{/each}
{/snippet}

{#snippet ownerOf(shown: StatsShownOwner)}
	{#if view.arrangement === "cards"}
		<section
			data-widget-part="stats.card card"
			data-owner-key={shown.owner.key}
			data-owner-group={shown.group}
			aria-label={shown.owner.label}
		>
			<header data-widget-part="stats.card-head card-head">
				<sp-icon name={OWNER_ICON[shown.group]} size="13"></sp-icon>
				<span data-widget-part="stats.card-name">{shown.owner.label}</span>
			</header>
			{#if !shown.slots.length}
				<p data-widget-part="stats.card-note">
					{shown.group === "cast" ? t("No stats to show for this member.") : t("No stats to show here.")}
				</p>
			{:else}
				<div data-widget-part="stats.card-body list" data-density={view.density}>
					{@render slotsOf(shown, view.density)}
				</div>
			{/if}
		</section>
	{:else if shown.group === "world"}
		<!-- The world is the scene: its own slots need no name over them. -->
		{@render slotsOf(shown, slotDensity)}
	{:else}
		<section
			data-widget-part="stats.strip"
			data-owner-key={shown.owner.key}
			data-owner-group={shown.group}
			aria-label={shown.owner.label}
		>
			<header data-widget-part="stats.strip-head">
				<sp-icon name={OWNER_ICON[shown.group]} size="13"></sp-icon>
				<span data-widget-part="stats.strip-name">{shown.owner.label}</span>
			</header>
			{@render slotsOf(shown, slotDensity)}
		</section>
	{/if}
{/snippet}

<div
	data-widget-part="stats.root"
	data-state-widget={identity}
	data-arrangement={view.arrangement}
	data-owners={view.owners}
	data-owner-key={worldOnly ? "world" : undefined}
>
	{#if section?.error}
		<p data-widget-part="stats.alert" role="alert">{section.error}</p>
	{/if}
	{#if writer.error}
		<p data-widget-part="stats.alert" role="alert">{writer.error}</p>
	{/if}

	{#if view.status === "not-granted"}
		<div data-widget-part="stats.empty empty" role="status" data-scope-not-granted="session:state">
			<sp-icon name="lock" size={emptyIconSize}></sp-icon>
			<span>
				{t("This widget has not been granted the session's stats. An administrator can grant it in the extension's permissions.")}
			</span>
		</div>
	{:else if view.status === "loading"}
		<div data-widget-part="stats.empty empty" role="status">
			<sp-icon name={emptyIcon} size={emptyIconSize}></sp-icon>
			<span>
				{worldOnly
					? t("Loading the world's stats…")
					: view.owners === "cast"
						? t("Loading the cast's stats…")
						: t("Loading the session's stats…")}
			</span>
		</div>
	{:else if view.status === "failed"}
		<!-- The first read was refused: the alert above is the whole story. -->
	{:else if view.status === "none-declared"}
		<div data-widget-part="stats.empty empty">
			<sp-icon name={emptyIcon} size={emptyIconSize}></sp-icon>
			<span>
				{worldOnly
					? t("Nothing in this session declares world stats. A genre or an extension adds them.")
					: t(
							"Nothing in this session declares stats. A genre, an extension or an administrator adds them, and they show up here."
						)}
			</span>
		</div>
	{:else if view.status === "nothing-shown"}
		<div data-widget-part="stats.empty empty">
			<sp-icon name={emptyIcon} size={emptyIconSize}></sp-icon>
			<span>{nothingShown()}</span>
		</div>
	{:else if view.status === "shown"}
		{#each view.groups as group (group.kind)}
			{#if view.owners === "all"}
				<section data-widget-part="stats.group" data-owner-group={group.kind} aria-label={groupLabel(group.kind)}>
					<header data-widget-part="stats.group-head">
						<sp-icon name={GROUP_ICON[group.kind]} size="13"></sp-icon>
						<span>{groupLabel(group.kind)}</span>
					</header>
					{#each group.owners as shown (shown.owner.key)}
						{@render ownerOf(shown)}
					{/each}
				</section>
			{:else}
				{#each group.owners as shown (shown.owner.key)}
					{@render ownerOf(shown)}
				{/each}
			{/if}
		{/each}
	{/if}
</div>
