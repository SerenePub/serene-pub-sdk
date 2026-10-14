<script lang="ts">
	/**
	 * Places (PLAN-core-widgets W4): where are we, what is around us, where
	 * can we go. The session's places — its lorebook's, on its line, at its
	 * story clock — as a **list** (a side rail) or a **map** (the shared map
	 * canvas), the instance's `view`; **Show the map** / **Show the list**
	 * flips it here for the viewer, until the setting changes.
	 *
	 * - A list row is the place's name, its category (tinted), the faces of
	 *   the cast who stand there, and its ways out as one muted line; the
	 *   place the world's `location` points at is marked **Here**. A press
	 *   opens the place's entry in the lorebook (`open-lore`).
	 * - On the map a press opens the place's detail beside it: its ways,
	 *   each said from the place, what else the book links to it (a keeper),
	 *   who is here, its stats in this session, and **Open entry**.
	 *
	 * The places and ways are asked of the page (`session-places`; the
	 * declared `lore` scope is the grant for it), again whenever the story
	 * moves, a turn ranks the lore, an entry is saved, an event is recorded
	 * or the genre fields change. Who stands where is the session's state
	 * (`scope("session:state")`, the `session:state` grant), read here. The view is
	 * the plain half's (`placesView`); this only draws it and presses.
	 *
	 * Without the `session:state` grant (a plugin's copy an admin was not
	 * asked to grant it, or refused) the places still list, with nobody in
	 * them and no **Here**: one quiet line says why, rather than leave the
	 * rows looking empty of people.
	 *
	 * The markup carries no look (STYLE-GUIDE §6.16): its elements carry
	 * `places.*` widget parts; a category's tint rides on `data-tint`, the
	 * place the scene is at on `data-here`.
	 */
	import { untrack } from "svelte"
	import type { SessionPlacesV1, WidgetEventKind } from "@serene-pub/sdk/component"
	import {
		placeIdOfNode,
		placeNodeId,
		placesView,
		readPlacesSettings,
		type PlacesViewMode
	} from "@serene-pub/core-catalog/places"
	import { scopeNotGranted } from "@serene-pub/core-catalog/widgets"
	import { useWidgetContext } from "../context"
	import MapCanvas from "../map-canvas/MapCanvas.svelte"

	const widget = useWidgetContext()
	const t = (source: string): string => widget?.current?.t(source) ?? source
	const uid = $props.id()

	const settings = $derived(
		readPlacesSettings(widget?.current?.settings?.v1)
	)
	const section = $derived(widget?.current?.scope("session:state"))
	/** The host said this copy does not hold `session:state`: who stands where will never come. */
	const stateNotGranted = $derived(scopeNotGranted(widget?.current, "session:state"))

	let answer = $state<SessionPlacesV1 | null>(null)
	/** Why the page could not be read, or declined a press — this widget's own. */
	let alert = $state<string | null>(null)
	const view = $derived(placesView(answer, section, settings, t))

	/** The view the viewer flipped to here; null follows the instance's setting. */
	let flipped = $state<PlacesViewMode | null>(null)
	const mode = $derived(flipped ?? settings.view)
	// A new setting is a new instruction: the flip yields to it.
	$effect(() => {
		void settings.view
		untrack(() => (flipped = null))
	})

	/** The place whose detail the map shows; null when none. */
	let selected = $state<number | null>(null)
	const detail = $derived(selected == null ? null : (view.rows.find((r) => r.id === selected) ?? null))

	const reason = (e: unknown) => (e instanceof Error ? e.message : String(e))

	// Which answer to show is this widget's: the latest ask's.
	let asked = 0
	function ask() {
		const ctx = untrack(() => widget?.current)
		if (!ctx) return
		const ticket = ++asked
		ctx.request("session-places", {}).then(
			(res) => {
				if (ticket !== asked) return
				answer = res
				alert = null
			},
			(e) => {
				if (ticket !== asked) return
				alert = t("Not read: {reason}").replace("{reason}", reason(e))
			}
		)
	}

	$effect(() => untrack(ask))

	/** What moves the places, or who may see which: ask again, once per burst. */
	const AGAIN: WidgetEventKind[] = [
		"story:moved",
		"lore:ranked",
		"lore:marked",
		"event:recorded",
		"genreFields:changed"
	]
	let timer: ReturnType<typeof setTimeout> | undefined
	$effect(() =>
		untrack(() => {
			const again = () => {
				clearTimeout(timer)
				timer = setTimeout(ask, 150)
			}
			const offs = AGAIN.map((kind) => widget?.current?.on(kind, again))
			return () => {
				clearTimeout(timer)
				for (const off of offs) off?.()
			}
		})
	)

	/** Open a place's entry in the lorebook; the page's refusal is this widget's line. */
	async function openEntry(placeId: number) {
		const ctx = untrack(() => widget?.current)
		if (!ctx) return
		const lorebookId = answer?.lorebookId ?? undefined
		try {
			await ctx.request("open-lore", {
				...(lorebookId != null ? { lorebookId } : {}),
				scope: "places",
				entryId: placeId
			})
		} catch (e) {
			alert = t("Not done: {reason}").replace("{reason}", reason(e))
		}
	}

	function pick(nodeId: string) {
		const id = placeIdOfNode(nodeId)
		selected = id === selected ? null : id
	}

	const names = (faces: { name: string }[]) => faces.map((f) => f.name).join(", ")
</script>

<div data-widget-part="places.root" data-widget="places" data-state={view.state} data-view={mode}>
	{#if alert}
		<p data-widget-part="places.alert" role="alert">{alert}</p>
	{/if}
	{#if stateNotGranted}
		<p data-widget-part="places.grant-note" role="status" data-scope-not-granted="session:state">
			{t("Who stands where isn't shown: this widget has not been granted the session's stats. An administrator can grant it in the extension's permissions.")}
		</p>
	{/if}
	{#if view.state !== "ready"}
		<p data-widget-part="places.empty empty" role="status">{view.empty}</p>
	{:else}
		<div data-widget-part="places.toolbar toolbar">
			<span data-widget-part="places.headline">{view.headline}</span>
			<button
				type="button"
				data-widget-part="places.flip"
				onclick={() => (flipped = mode === "list" ? "map" : "list")}
			>
				<sp-icon name={mode === "list" ? "map" : "list"} size="14"></sp-icon>
				{mode === "list" ? t("Show the map") : t("Show the list")}
			</button>
		</div>

		{#if mode === "list"}
			<ul data-widget-part="places.list list">
				{#each view.rows as r (r.id)}
					<li
						data-widget-part="places.row row"
						data-place-id={r.id}
						data-tint={r.tint ?? undefined}
						data-here={r.here ? "" : undefined}
					>
						<button
							type="button"
							data-widget-part="places.row-open"
							title={t("Open in lorebook")}
							onclick={() => openEntry(r.id)}
						>
							<span data-widget-part="places.name">{r.name}</span>
							{#if r.here}
								<span data-widget-part="places.here chip">{t("Here")}</span>
							{/if}
							{#if r.category}
								<span data-widget-part="places.category chip" data-tint={r.tint ?? undefined}>{r.category}</span>
							{/if}
						</button>
						{#if r.present.length}
							<span
								data-widget-part="places.present"
								role="img"
								aria-label={t("{names} here").replace("{names}", names(r.present))}
							>
								{#each r.present as f (f.ref)}
									<span data-widget-part="places.face" title={f.name}>
										<sp-avatar ref={f.ref} size="sm"></sp-avatar>
									</span>
								{/each}
							</span>
						{/if}
						{#if r.waysOut}
							<p data-widget-part="places.ways">{r.waysOut}</p>
						{/if}
					</li>
				{/each}
			</ul>
		{:else}
			<MapCanvas
				nodes={view.nodes}
				edges={view.edges}
				selected={selected == null ? null : placeNodeId(selected)}
				onPick={pick}
				label={t("Map of the places")}
				{t}
			/>
			{#if detail}
				<section data-widget-part="places.detail card" aria-labelledby="{uid}-detail" data-place-id={detail.id}>
					<header data-widget-part="places.detail-head">
						<h3 id="{uid}-detail" data-widget-part="places.detail-name">{detail.name}</h3>
						{#if detail.here}
							<span data-widget-part="places.here chip">{t("Here")}</span>
						{/if}
						{#if detail.category}
							<span data-widget-part="places.category chip" data-tint={detail.tint ?? undefined}>{detail.category}</span>
						{/if}
						<button
							type="button"
							data-widget-part="places.close"
							aria-label={t("Close")}
							title={t("Close")}
							onclick={() => (selected = null)}
						>
							<sp-icon name="x" size="14"></sp-icon>
						</button>
					</header>
					{#if settings.showWays}
						<h4 data-widget-part="places.detail-heading label">{t("Ways")}</h4>
						{#if detail.ways.length}
							<ul data-widget-part="places.detail-ways list">
								{#each detail.ways as says, i (i)}
									<li>{says}</li>
								{/each}
							</ul>
						{:else}
							<p data-widget-part="places.detail-none empty">{t("No way out of here yet.")}</p>
						{/if}
					{/if}
					{#if detail.linked.length}
						<h4 data-widget-part="places.detail-heading label">{t("Linked")}</h4>
						<ul data-widget-part="places.linked list">
							{#each detail.linked as l (`${l.kind}:${l.id}`)}
								<li data-link-kind={l.kind}>{l.says}</li>
							{/each}
						</ul>
					{/if}
					{#if detail.present.length}
						<h4 data-widget-part="places.detail-heading label">{t("Who is here")}</h4>
						<ul data-widget-part="places.detail-present list">
							{#each detail.present as f (f.ref)}
								<li>
									<span data-widget-part="places.face"><sp-avatar ref={f.ref} size="sm"></sp-avatar></span>
									{f.name}
								</li>
							{/each}
						</ul>
					{/if}
					{#if detail.stats.length}
						<h4 data-widget-part="places.detail-heading label">{t("In this session")}</h4>
						<dl data-widget-part="places.stats">
							{#each detail.stats as s, i (i)}
								<dt data-widget-part="label">{s.label}</dt>
								<dd data-widget-part="value">{s.value}</dd>
							{/each}
						</dl>
					{/if}
					<div data-widget-part="places.detail-actions toolbar">
						<button type="button" data-widget-part="places.open" onclick={() => openEntry(detail.id)}>
							<sp-icon name="external-link" size="14"></sp-icon>
							{t("Open entry")}
						</button>
					</div>
				</section>
			{/if}
		{/if}
	{/if}
</div>
