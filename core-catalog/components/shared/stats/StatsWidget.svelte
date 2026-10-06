<script lang="ts">
	/**
	 * The Stats widget: one card per cast member, one row per slot they carry
	 * (R21).
	 *
	 * Values come from the session's one resolved read (the `session_state`
	 * section), so this widget never resolves anything itself — which layer a
	 * number came from is a question for the cast member's page, not for the
	 * playing surface. What it does own is the drawing: a bounded integer is a
	 * bar, an enum a chip, text a line, a boolean a toggle, and a derived or
	 * retired slot is greyed because there is nothing to write.
	 *
	 * A genre that declares no slots gets an empty state that says so rather
	 * than a card of blanks — a newcomer in a chat session never sees a bar.
	 * Writes `set-attribute-value`, whose refusal is this widget's own line
	 * (R77).
	 *
	 * The markup carries no look: each element names what it is in
	 * `data-widget-part` (`stats.card card`, …), density rides on
	 * `data-density`, and the default widget stylesheet draws them
	 * (STYLE-GUIDE §6.16).
	 */
	import { statsView } from "@serene-pub/core-catalog/session-state"
	import { useWidgetContext } from "../context"
	import SlotControl from "../state/SlotControl.svelte"
	import { createSlotWriter } from "../state/slotWriter.svelte"
	import { createEntryFinder } from "../state/entryFinder"

	const widget = useWidgetContext()
	const writer = createSlotWriter(widget)
	const t = (source: string) => widget?.current.t(source) ?? source
	// A list's lorebook picker (phase 3c) searches through `session-entries`.
	const findEntries = createEntryFinder(widget, t)

	let section = $derived(widget?.current.session_state?.v1)
	let settings = $derived((widget?.current.settings.v1 ?? {}) as Record<string, unknown>)
	// Not granted `session:state` (a plugin's copy an admin was not asked to,
	// or refused): the section will never come — said, not waited for.
	let view = $derived(statsView(section, settings, widget?.current.grants?.includes("session:state")))
</script>

<div data-widget-part="stats.root" data-state-widget="stats">
	{#if section?.error}
		<p data-widget-part="stats.alert" role="alert">{section.error}</p>
	{/if}
	{#if writer.error}
		<p data-widget-part="stats.alert" role="alert">{writer.error}</p>
	{/if}

	{#if view.status === "not-granted"}
		<div data-widget-part="stats.empty empty" role="status" data-scope-not-granted="session:state">
			<sp-icon name="lock" size="20"></sp-icon>
			<span>
				{t("This widget has not been granted the session's stats. An administrator can grant it in the extension's permissions.")}
			</span>
		</div>
	{:else if view.status === "loading"}
		<div data-widget-part="stats.empty empty" role="status">
			<sp-icon name="heart-pulse" size="20"></sp-icon>
			<span>{t("Loading the cast's stats…")}</span>
		</div>
	{:else if view.status === "failed"}
		<!-- The first read was refused: the alert above is the whole story. -->
	{:else if view.status === "none-declared"}
		<div data-widget-part="stats.empty empty">
			<sp-icon name="heart-pulse" size="20"></sp-icon>
			<span>
				{t(
					"Nothing in this session declares stats. A genre, an extension or an administrator adds them, and they show up here."
				)}
			</span>
		</div>
	{:else if view.status === "no-members"}
		<div data-widget-part="stats.empty empty">
			<sp-icon name="heart-pulse" size="20"></sp-icon>
			<span>
				{view.members === "pick"
					? t("No cast member matches the names in this widget's settings.")
					: t(
							"No one in the cast has a stat in play yet. Set one on a cast member's page, or let the story change one."
						)}
			</span>
		</div>
	{:else}
		{@const density = view.density}
		{#each view.members as member (member.owner.key)}
			<section data-widget-part="stats.card card" data-owner-key={member.owner.key} aria-label={member.owner.label}>
				<header data-widget-part="stats.card-head card-head">
					<sp-icon name="user-round" size="13"></sp-icon>
					<span data-widget-part="stats.card-name">{member.owner.label}</span>
				</header>
				{#if !member.slots.length}
					<p data-widget-part="stats.card-note">{t("No stats to show for this member.")}</p>
				{:else}
					<div data-widget-part="stats.card-body list" data-density={density}>
						{#each member.slots as shown (shown.slot.slotId)}
							<SlotControl
								slot={shown.slot}
								{density}
								config={shown.config}
								value={shown.value}
								{t}
								{findEntries}
								onset={(next) => void writer.set(member.owner, shown.slot.slotId, next)}
							/>
						{/each}
					</div>
				{/if}
			</section>
		{/each}
	{/if}
</div>
