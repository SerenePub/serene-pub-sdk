<script lang="ts">
	/**
	 * Annex (PLAN-core-widgets W9): what the pipeline knows that I may see —
	 * one declared annex key, by its label, from the viewer's own view of the
	 * annex (`annex.v1`). Text is prose, a number or a choice one row, a list
	 * chips, an object a row per member. Everything it shows is worked out in
	 * the plain half (`annexWidgetView`); this only draws it.
	 *
	 * Never silent: with no key picked, nothing written, or nothing the
	 * viewer may see, it says which, in one line.
	 *
	 * **Edit** is the Session data list's: a text field the host lists as the
	 * viewer's to set gets an Edit button, which opens the text in place;
	 * Save presses the field's ready-made action (`<owner>:annex#<key>`) with
	 * `{ value }` — the same door and the same write. The new value comes
	 * back through `annex.v1`; a refusal is the page's to say.
	 *
	 * The markup carries no look: each element names what it is in
	 * `data-widget-part` (`annex.prose`, `annex.row row`, …), the state and
	 * the drawn shape ride on the root's `data-state` and `data-shape`, and
	 * the default widget stylesheet draws them (STYLE-GUIDE §6.16).
	 */
	import {
		annexWidgetFieldsFrom,
		annexWidgetView,
		readAnnexWidgetSettings
	} from "@serene-pub/core-catalog/annex"
	import { useWidgetContext } from "../context"

	const widget = useWidgetContext()
	const t = (source: string): string => widget?.current.t(source) ?? source
	const uid = $props.id()

	const settings = $derived(
		readAnnexWidgetSettings(widget?.current.settings?.v1)
	)
	const view = $derived(
		annexWidgetView({
			annex: widget?.current.annex?.v1,
			fields: annexWidgetFieldsFrom(widget?.current.actions?.v1),
			key: settings.key,
			viewer: widget?.current.viewer?.v1,
			locale: widget?.current.locale?.v1,
			t
		})
	)

	/** The editor, open, and its text. */
	let editing = $state(false)
	let draft = $state("")
	/** Why the last Save did not go through, this widget's own. */
	let refusal = $state<string | null>(null)

	// Another key picked: an open editor was for the old one. Keyed on the
	// identity alone, so a value pushed while someone types leaves it open.
	const identity = $derived(view.identity)
	$effect(() => {
		void identity
		editing = false
	})

	function startEdit(): void {
		draft = view.draft
		refusal = null
		editing = true
	}

	function save(): void {
		if (!identity) return
		refusal = null
		try {
			widget?.current.invoke(identity, { payload: { value: draft } })
			editing = false
		} catch (e) {
			refusal = e instanceof Error && e.message ? e.message : t("That did not go through. Try again.")
		}
	}
</script>

<div
	data-widget-part="annex.root"
	data-state={view.state}
	data-shape={view.state === "value" ? view.shape : undefined}
	role="group"
	aria-label={view.title}
>
	{#if refusal}
		<p data-widget-part="annex.alert" role="alert">{refusal}</p>
	{/if}

	{#if settings.showLabel && view.state !== "pick"}
		<p data-widget-part="annex.label label">{view.title}</p>
	{/if}

	{#if editing && identity}
		<div data-widget-part="annex.editor">
			<textarea
				id={`annex-${uid}-text`}
				data-widget-part="annex.text"
				aria-label={view.title}
				bind:value={draft}
			></textarea>
			<div data-widget-part="annex.editor-actions toolbar">
				<button type="button" data-widget-part="annex.cancel" onclick={() => (editing = false)}>
					{t("Cancel")}
				</button>
				<button type="button" data-widget-part="annex.save" onclick={save}>
					{t("Save")}
				</button>
			</div>
		</div>
	{:else if view.state === "value"}
		<div data-widget-part="annex.value value">
			{#if view.drawn.as === "prose"}
				<p data-widget-part="annex.prose">{view.drawn.text}</p>
			{:else if view.drawn.as === "chips"}
				<ul data-widget-part="annex.chips list" aria-label={view.title}>
					{#each view.drawn.chips as chip, i (i)}
						<li data-widget-part="annex.chip chip">{chip}</li>
					{/each}
				</ul>
			{:else}
				<dl data-widget-part="annex.rows list">
					{#each view.drawn.rows as row (row.key)}
						<div data-widget-part="annex.row row" data-key={row.key}>
							<dt data-widget-part="annex.row-label label">{row.label}</dt>
							{#if row.items}
								<dd data-widget-part="annex.row-value value">
									{#if row.items.length}
										<ul data-widget-part="annex.row-items">
											{#each row.items as item, i (i)}
												<li data-widget-part="annex.row-item">{item}</li>
											{/each}
										</ul>
									{:else}
										—
									{/if}
								</dd>
							{:else}
								<dd data-widget-part="annex.row-value value">{row.text}</dd>
							{/if}
						</div>
					{/each}
				</dl>
			{/if}
		</div>
	{:else}
		<div data-widget-part="annex.empty empty" role="status">
			<sp-icon name="clipboard-list" size="20"></sp-icon>
			<span>{view.empty}</span>
		</div>
	{/if}

	{#if view.canEdit && !editing}
		<button
			type="button"
			data-widget-part="annex.edit"
			aria-label={`${t("Edit")} ${view.title}`}
			onclick={startEdit}
		>
			<sp-icon name="pencil" size="14"></sp-icon>
			<span>{t("Edit")}</span>
		</button>
	{/if}
</div>
