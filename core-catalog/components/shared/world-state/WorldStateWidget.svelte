<script lang="ts">
	/**
	 * The World State widget: the session's world slots, editable (R21).
	 *
	 * The same values a template reads as `state.world.*` and the conditions
	 * vocabulary reads for layout rules — so what is edited here is what the
	 * model is told and what a rule fires on, which is why it is worth one
	 * strip above the messages rather than a page somewhere else.
	 *
	 * A world slot belongs to the session's own owner, so an edit is a
	 * session-layer deviation: the world's own answer is untouched, and clearing
	 * one goes back to inheriting it. Reads the `session_state` section and its
	 * settings (`layout`, `slots`, `pickSlots`); writes `set-attribute-value`,
	 * whose refusal is this widget's own line (R77).
	 *
	 * 🚧 A location holding state (attributes phase 4) is drawn as a place
	 * under the world's slots — only one with a value in play.
	 *
	 * The markup carries no look: each element names what it is in
	 * `data-widget-part` (`world-state.place`, …), the layout rides on
	 * `data-layout`, and the default widget stylesheet draws them
	 * (STYLE-GUIDE §6.16).
	 */
	import { worldStateView } from "@serene-pub/core-catalog/session-state"
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
	// Not granted `session:state`: the section will never come — said, not waited for.
	let view = $derived(worldStateView(section, settings, widget?.current.grants?.includes("session:state")))
</script>

<div
	data-widget-part="world-state.root"
	data-layout={view.layout === "strip" ? "strip" : "list"}
	data-state-widget="world-state"
	data-owner-key="world"
>
	{#if section?.error}
		<p data-widget-part="world-state.alert" role="alert">{section.error}</p>
	{/if}
	{#if writer.error}
		<p data-widget-part="world-state.alert" role="alert">{writer.error}</p>
	{/if}

	{#if view.status === "not-granted"}
		<div data-widget-part="world-state.empty empty" role="status" data-scope-not-granted="session:state">
			<sp-icon name="lock" size="16"></sp-icon>
			<span>
				{t("This widget has not been granted the session's stats. An administrator can grant it in the extension's permissions.")}
			</span>
		</div>
	{:else if view.status === "loading"}
		<div data-widget-part="world-state.empty empty" role="status">
			<sp-icon name="cloud-sun" size="16"></sp-icon>
			<span>{t("Loading the world's stats…")}</span>
		</div>
	{:else if view.status === "failed"}
		<!-- The first read was refused: the alert above is the whole story. -->
	{:else if view.status === "empty"}
		<div data-widget-part="world-state.empty empty">
			<sp-icon name="cloud-sun" size="16"></sp-icon>
			<span>
				{view.reason === "none-shown"
					? t("This session's world declares no stats to show here.")
					: t("Nothing in this session declares world stats. A genre or an extension adds them.")}
			</span>
		</div>
	{:else}
		{@const owner = view.owner}
		{#each view.slots as shown (shown.slot.slotId)}
			<SlotControl
				slot={shown.slot}
				density={view.layout === "strip" ? "compact" : "full"}
				config={shown.config}
				value={shown.value}
				{t}
				{findEntries}
				onset={(next) => void writer.set(owner, shown.slot.slotId, next)}
			/>
		{/each}
		<!-- Phase 4: each location in play, under the world's own slots. -->
		{#each view.places as place (place.owner.key)}
			<section data-widget-part="world-state.place" data-owner-key={place.owner.key} aria-label={place.owner.label}>
				<header data-widget-part="world-state.place-head">
					<sp-icon name="map-pin" size="13"></sp-icon>
					<span data-widget-part="world-state.place-name">{place.owner.label}</span>
				</header>
				{#each place.slots as shown (shown.slot.slotId)}
					<SlotControl
						slot={shown.slot}
						density={view.layout === "strip" ? "compact" : "full"}
						config={shown.config}
						value={shown.value}
						{t}
						{findEntries}
						onset={(next) => void writer.set(place.owner, shown.slot.slotId, next)}
					/>
				{/each}
			</section>
		{/each}
	{/if}
</div>
