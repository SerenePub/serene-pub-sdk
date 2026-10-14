<script lang="ts">
	/**
	 * Turn order (PLAN-core-widgets W1): whose turn it is, who follows, and
	 * may I change that — the session's stored turn order (`turnOrder.v1`),
	 * drawn as a list to look at.
	 *
	 * The head line means what the composer's *Who is due next* line means
	 * (the same `order[0]`, named from the same candidates, in the same
	 * words); then one row per prepared turn — face, name, chip (*Due* ·
	 * *Then* · *You*); then **Continue** (`fire-turn`, on the head's channel)
	 * and **Pick who speaks** (`pick-turn`), and the strategy in force. It
	 * never hides while a draft exists, unlike the composer's line: it is for
	 * looking while someone else writes. Everything it shows is worked out in
	 * the plain half (`turnOrderView`); this only draws it.
	 *
	 * A control the viewer may not press is greyed with its reason as its
	 * title, never hidden. A request the page declines is this widget's own
	 * line (R77).
	 *
	 * The markup carries no look: each element names what it is in
	 * `data-widget-part` (`turn-order.row row`, …), the row's chip state rides
	 * on `data-state`, and the default widget stylesheet draws them
	 * (STYLE-GUIDE §6.16). With `showBenched` (W6) the benched characters
	 * follow the order as rows of their own (`turn-order.benched`,
	 * `data-state="benched"`).
	 */
	import type { ViewerV1 } from "@serene-pub/sdk/component"
	import {
		readTurnOrderSettings,
		turnOrderView,
		type TurnRowView
	} from "@serene-pub/core-catalog/turn-order"
	import { useWidgetContext } from "../context"

	const NOBODY: ViewerV1 = { userId: null, isAdmin: false, isGuest: false }

	const widget = useWidgetContext()
	const t = (source: string): string => widget?.current.t(source) ?? source

	const settings = $derived(
		readTurnOrderSettings(widget?.current.settings?.v1)
	)
	const view = $derived(
		turnOrderView({
			turnOrder: widget?.current.turnOrder?.v1,
			characters: widget?.current.scope("characters"),
			viewer: widget?.current.viewer?.v1 ?? NOBODY,
			actions: widget?.current.actions?.v1,
			settings,
			locale: widget?.current.locale?.v1,
			t
		})
	)

	/** Why the page declined the last press, this widget's own. */
	let refusal = $state<string | null>(null)

	async function press(ask: () => Promise<unknown> | undefined): Promise<void> {
		refusal = null
		try {
			await ask()
		} catch (e) {
			refusal = e instanceof Error && e.message ? e.message : t("That did not go through. Try again.")
		}
	}

	const onContinue = () =>
		press(() =>
			widget?.current.request(
				"fire-turn",
				view.continueTurn.channel ? { channel: view.continueTurn.channel } : {}
			)
		)
	const onPick = () => press(() => widget?.current.request("pick-turn", {}))
</script>

{#snippet turnRow(row: TurnRowView)}
	<li
		data-widget-part="turn-order.row row"
		data-state={row.state}
		data-kind={row.kind}
		data-channel={row.channel}
		data-ref={row.ref ?? undefined}
	>
		{#if settings.faces}
			{#if row.face}
				<img data-widget-part="turn-order.face" src={row.face} alt="" />
			{:else}
				<span data-widget-part="turn-order.face" data-blank="">
					<sp-icon
						name={row.kind === "voice" ? "book-open-text" : row.kind === "envoy" ? "sparkles" : "user-round"}
						size="14"
					></sp-icon>
				</span>
			{/if}
		{/if}
		<span data-widget-part="turn-order.name">{row.name}</span>
		<span data-widget-part="turn-order.state chip">{row.chip}</span>
	</li>
{/snippet}

<div data-widget-part="turn-order.root" data-status={view.status} data-faces={settings.faces ? "" : undefined}>
	{#if refusal}
		<p data-widget-part="turn-order.alert" role="alert">{refusal}</p>
	{/if}

	{#if view.status === "empty"}
		<div data-widget-part="turn-order.empty empty" role="status">
			<sp-icon name="list-ordered" size="20"></sp-icon>
			<span>{view.empty}</span>
		</div>
	{:else}
		<p data-widget-part="turn-order.head" role="status">
			{#if view.headFace}
				<img data-widget-part="turn-order.face" src={view.headFace} alt="" />
			{:else if view.headIsVoice}
				<sp-icon name="book-open-text" size="18" data-widget-part="turn-order.voice"></sp-icon>
			{/if}
			<span data-widget-part="turn-order.head-text">{view.head}</span>
		</p>

		{#if view.rows.length}
			<ol data-widget-part="turn-order.list list" aria-label={t("Turn order")}>
				{#each view.rows as row (row.key)}
					{@render turnRow(row)}
				{/each}
			</ol>
		{/if}
	{/if}

	{#if view.benched.length}
		<!-- 🚧 W6: who is in the session but out of the turns (`showBenched`). -->
		<ul data-widget-part="turn-order.benched list" aria-label={t("Benched")}>
			{#each view.benched as row (row.key)}
				{@render turnRow(row)}
			{/each}
		</ul>
	{/if}

	<div data-widget-part="turn-order.controls toolbar">
		<button
			type="button"
			data-widget-part="turn-order.pick"
			disabled={!view.pick.enabled}
			title={view.pick.reason ?? t("Pick who speaks")}
			onclick={onPick}
		>
			<sp-icon name="users" size="14"></sp-icon>
			<span>{t("Pick who speaks")}</span>
		</button>
		<button
			type="button"
			data-widget-part="turn-order.continue"
			disabled={!view.continueTurn.enabled}
			title={view.continueTurn.reason ?? t("Continue")}
			aria-label={view.continueTurn.label}
			onclick={onContinue}
		>
			<sp-icon name="play" size="14"></sp-icon>
			<span>{t("Continue")}</span>
		</button>
	</div>

	{#if view.strategy}
		<p data-widget-part="turn-order.strategy">{view.strategy}</p>
	{/if}
</div>
