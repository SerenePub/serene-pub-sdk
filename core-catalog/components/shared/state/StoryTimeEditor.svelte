<script lang="ts">
	/**
	 * A story time's editor, out of the slot control (C9): a year, a month,
	 * a day and a time as hh:mm, saved together on Enter or Save — four
	 * fields, so leaving one of them is not being done. Escape or Cancel
	 * leaves the stored value as it was.
	 *
	 * Saving resolves to the host's refusal or `null` (A21): the editor stays
	 * open with what was typed until the write lands, and a refusal is said in
	 * its own `invalid` line.
	 *
	 * Parts are the slot control's (`stat-slot.year` … `stat-slot.cancel`).
	 */
	import { storyTimeDraftOf, storyTimeDraftValue, type StoryTimeDraft } from "@serene-pub/core-catalog/session-state"
	import type { HostKeyEventDetail } from "@serene-pub/sdk/component"
	import type { SlotRefusal, SlotWriteResult } from "./slotWriter.svelte"

	interface Props {
		value: unknown
		/** The editor's name ("Clock value"). */
		label: string
		t: (source: string) => string
		onsave: (value: string | null) => Promise<SlotWriteResult>
		oncancel: () => void
	}

	let { value, label, t, onsave, oncancel }: Props = $props()

	// svelte-ignore state_referenced_locally
	let draft = $state<StoryTimeDraft>(storyTimeDraftOf(value))
	let invalid = $state<SlotRefusal | null>(null)
	let saving = false

	async function save() {
		if (saving) return
		const next = storyTimeDraftValue(draft)
		if (next === undefined) {
			invalid = {
				text: t("That is not a story time: a year, then a month, a day and a time as hh:mm — each optional, a day only with a month."),
				detail: null
			}
			return
		}
		saving = true
		invalid = null
		try {
			const refused = await onsave(next)
			if (refused) invalid = refused
			else oncancel()
		} finally {
			saving = false
		}
	}

	function onkey(e: CustomEvent<HostKeyEventDetail>) {
		if (e.detail.key === "Enter") void save()
		else if (e.detail.key === "Escape") oncancel()
	}
</script>

<div data-widget-part="stat-slot.editor" role="group" aria-label={label}>
	<!-- svelte-ignore a11y_autofocus -->
	<input
		data-widget-part="stat-slot.year stat-slot.field"
		type="number"
		step="1"
		aria-label={t("Year")}
		placeholder={t("Year")}
		keys="Escape Enter"
		autofocus
		bind:value={draft.year}
		{onkey}
	/>
	<input
		data-widget-part="stat-slot.month stat-slot.field"
		type="number"
		min="1"
		step="1"
		aria-label={t("Month")}
		placeholder={t("Month")}
		keys="Escape Enter"
		bind:value={draft.month}
		{onkey}
	/>
	<input
		data-widget-part="stat-slot.day stat-slot.field"
		type="number"
		min="1"
		step="1"
		aria-label={t("Day")}
		placeholder={t("Day")}
		keys="Escape Enter"
		bind:value={draft.day}
		{onkey}
	/>
	<input
		data-widget-part="stat-slot.clock stat-slot.field"
		type="text"
		aria-label={t("Time of day")}
		placeholder="hh:mm"
		keys="Escape Enter"
		bind:value={draft.time}
		{onkey}
	/>
	{#if invalid}<p data-widget-part="stat-slot.invalid" role="alert" title={invalid.detail ?? undefined}>{invalid.text}</p>{/if}
	<button type="button" data-widget-part="stat-slot.save" onclick={() => void save()}>{t("Save")}</button>
	<button type="button" data-widget-part="stat-slot.cancel" onclick={oncancel}>{t("Cancel")}</button>
</div>
