<script lang="ts">
	/**
	 * A form, from a schema — the one renderer behind every generated form.
	 *
	 * The schema is the SDK's `SettingsSchema`: the language extensions
	 * declare plugin settings in, the language `inferSchema` produces from a
	 * paused node's payload, the language a surface declares its props in, and
	 * the language arbitrary extension forms arrive in. One renderer for all
	 * of them is the point (12 §6, "one renderer, three uses") — a control
	 * fixed here is fixed for review pauses, plugin settings, surface props
	 * and extension forms at once.
	 *
	 * Grouping and visibility come from the SDK (`formLayout`, `isVisible`)
	 * rather than being re-derived here, so "declaration order within a group,
	 * group order by first appearance" and "one level of showIf, no rules
	 * engine" are stated once and obeyed everywhere.
	 *
	 * No field list and no domain knowledge: this renders whatever arrives.
	 * Submission, persistence, and folding values back into a payload
	 * (`applyFormValues`) belong to the host surface.
	 */
	import { formLayout, isVisible, type SettingsSchema } from '@serene-pub/sdk'
	import FieldControl from './FieldControl.svelte'

	interface Props {
		schema: SettingsSchema
		/**
		 * Edited in place; the host owns persistence. Defaulted so a host that
		 * has not seeded its map yet renders an empty form rather than
		 * throwing halfway down somebody's settings page.
		 */
		values?: Record<string, unknown>
		readonly?: boolean
		idPrefix?: string
		/** Called after every committed field, with the field that moved. */
		onchange?: (key: string, next: unknown) => void
	}

	let {
		schema,
		values = $bindable({}),
		readonly = false,
		idPrefix = 'sf',
		onchange,
	}: Props = $props()

	const groups = $derived(formLayout(schema))

	/**
	 * Show a group heading unless it is the synthetic one.
	 *
	 * `formLayout` names every ungrouped field's bucket `General`, so
	 * "hide the heading when there is only one group" hid an author's own
	 * `group: 'Advanced'` too — the one case where they had asked for it. The
	 * question is not how many groups there are, it is whether the author
	 * chose the name.
	 */
	const DEFAULT_GROUP = 'General'
	const showHeading = (group: string) =>
		group !== DEFAULT_GROUP || groups.length > 1

	function commit(key: string, next: unknown) {
		// `undefined` is a clear, not a write of undefined: the number and text
		// controls use it to mean "back to the inherited value", and a form
		// that stored the key anyway would turn an inherit into an override.
		if (next === undefined) delete values[key]
		else values[key] = next
		onchange?.(key, next)
	}
</script>

<div class="controls-form flex flex-col gap-3">
	{#each groups as g (g.group)}
		{#if showHeading(g.group)}
			<p class="controls-group text-xs font-semibold uppercase">{g.group}</p>
		{/if}
		{#each g.fields as { key, decl } (key)}
			{#if isVisible(decl, values)}
				<FieldControl
					name={key}
					decl={decl as Record<string, any>}
					value={values[key]}
					{readonly}
					{idPrefix}
					oncommit={(next) => commit(key, next)}
				/>
			{/if}
		{/each}
	{/each}
	{#if !groups.length}
		<p class="controls-muted text-xs">This schema declares no fields.</p>
	{/if}
</div>

<style>
	.controls-group {
		opacity: 0.65;
		letter-spacing: 0.08em;
		margin-block-start: 0.4rem;
	}
	.controls-muted {
		opacity: 0.65;
	}
</style>
