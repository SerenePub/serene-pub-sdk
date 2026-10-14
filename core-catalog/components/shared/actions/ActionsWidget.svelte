<script lang="ts">
	/**
	 * Actions (PLAN-core-widgets W8): what can I do right now — the session's
	 * listed actions (`actions.v1`) as real buttons, each with its icon and
	 * name, grouped from fields the listing carries: the turn controls, then
	 * the genre's own, then the ones added to it (`actionsView`, the plain
	 * half; this only draws it).
	 *
	 * A press is `invoke(identity)` — the same door the composer's chips
	 * take, so a core verb reaches the page's own handler and an action that
	 * collects text or recipients opens the page's collect modal before it
	 * fires. A greyed action is greyed, not disabled: `aria-disabled` keeps it
	 * in the tab order, its reason is its `title` and its description
	 * (`actions.reason`), and the click is guarded — as the chips do.
	 *
	 * Drawing a newcomer is meeting it: the widget shows every action at
	 * once, as opening **More** does in the composer, so the identities it
	 * draws wearing the *new* mark are told to the page (`actions-seen`),
	 * once each.
	 *
	 * ⚠ `showWaiting` (the questions waiting on the viewer) is declared and
	 * not drawn: no section this widget reads carries a session's open forms.
	 *
	 * The markup carries no look: each element names what it is in
	 * `data-widget-part`, the size rides on the root's `data-size`, a
	 * newcomer on its button's `data-new`, and the default widget stylesheet
	 * draws them (STYLE-GUIDE §6.16).
	 */
	import { actionsView, readActionsSettings, type ActionsButtonView } from "@serene-pub/core-catalog/actions"
	import { useWidgetContext } from "../context"

	const widget = useWidgetContext()
	const t = (source: string): string => widget?.current.t(source) ?? source
	const uid = $props.id()

	const settings = $derived(
		readActionsSettings(widget?.current.settings?.v1)
	)
	const view = $derived(
		actionsView({
			actions: widget?.current.actions?.v1,
			settings,
			locale: widget?.current.locale?.v1,
			t
		})
	)

	/** An element id from an action's identity (`core#advance` → `core-advance`). */
	const idOf = (identity: string): string => identity.replace(/[^a-zA-Z0-9-]/g, "-")

	/** The newcomers already told to the page — each once. */
	const met = new Set<string>()
	$effect(() => {
		const fresh = view.fresh.filter((k) => !met.has(k))
		if (!fresh.length) return
		for (const k of fresh) met.add(k)
		void widget?.current.request("actions-seen", { keys: fresh })?.catch(() => {})
	})

	/** Why the last press did not go through, this widget's own. */
	let refusal = $state<string | null>(null)

	function press(button: ActionsButtonView): void {
		if (button.disabled) return
		refusal = null
		try {
			widget?.current.invoke(button.identity)
		} catch (e) {
			refusal = e instanceof Error && e.message ? e.message : t("That did not go through. Try again.")
		}
	}
</script>

<div data-widget-part="actions.root" data-size={settings.size}>
	{#if refusal}
		<p data-widget-part="actions.alert" role="alert">{refusal}</p>
	{/if}

	{#if view.empty}
		<div data-widget-part="actions.empty empty" role="status">
			<sp-icon name="mouse-pointer-click" size="20"></sp-icon>
			<span>{view.empty}</span>
		</div>
	{:else}
		{#each view.groups as group (group.key)}
			<div
				data-widget-part="actions.group"
				data-group={group.key}
				role="group"
				aria-labelledby={`actions-${uid}-${group.key}`}
			>
				<p data-widget-part="actions.group-head" id={`actions-${uid}-${group.key}`}>{group.title}</p>
				{#each group.buttons as button (button.identity)}
					<button
						type="button"
						data-widget-part="actions.button"
						data-identity={button.identity}
						data-new={button.isNew ? "" : undefined}
						aria-disabled={button.disabled ? "true" : undefined}
						aria-describedby={button.reason ? `actions-${uid}-reason-${idOf(button.identity)}` : undefined}
						title={button.title}
						onclick={() => press(button)}
					>
						<sp-icon name={button.icon} size="16"></sp-icon>
						<span>{button.name}</span>
						{#if button.reason}
							<span
								data-widget-part="actions.reason"
								id={`actions-${uid}-reason-${idOf(button.identity)}`}
								aria-hidden="true">{button.reason}</span
							>
						{/if}
					</button>
				{/each}
			</div>
		{/each}
	{/if}
</div>
