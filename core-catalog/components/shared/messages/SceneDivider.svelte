<script lang="ts">
	import type { HostKeyEventDetail } from "@serene-pub/sdk/component"
	import { useConversation } from "./conversation.svelte"
	import type { SceneDivider } from "./sceneMarks"

	/**
	 * 🚧 A **scene divider** (PROPOSAL-live-scenes §7, §14 C): the line in the
	 * log where a scene begins — its colour, its name, the day it opened on,
	 * how many lines it holds and whose faces speak in it. The lane's open
	 * scene reads *since …* and carries the open mark.
	 *
	 * Where the viewer may place scene boundaries (the dossier's
	 * `sceneBoundaries`), its name renames it and its ⋯ menu holds *End
	 * scene* (the open scene), *Summarize* (a closed one, unless the
	 * session's summaries are off — 🚧 *Review summary* while its finished
	 * run waits in `review`, as its *Ready to review* does), *Open in
	 * lorebook* and, for a live
	 * scene, 🚧 *Move start up / down one line*, *Reopen scene* (the lane's
	 * last scene, closed) and *Remove boundary* (lane E: it joins the scene
	 * before, or, the lane's first, goes). A live scene's divider also drags
	 * (`sp-drag-handle`): dropped between two lines, the scene starts at the
	 * later one. Anyone else opens it in the lorebook by its name. Every
	 * press is one of the conversation's scene verbs; a refusal is said here,
	 * under the divider.
	 *
	 * The last scene of a completed history entry with no entry after it
	 * (`startsEntry`) offers *Start a new entry* in the same ⋯ menu, to
	 * anyone — the menu is drawn for it even where the viewer places no
	 * boundaries (polish parity L1, 2026-10-24: it was a row of its own).
	 */
	interface Props {
		divider: SceneDivider
		/** The scene's colour, as `--sp-scene` on the item. */
		color: string
		/** Drawn hidden: its first line is on another lane than the log shows. */
		hidden?: boolean
		/** The log's order: a drag's gap reads the other way round newest-first. */
		order?: "oldest-first" | "newest-first"
		/** The last scene of a completed history entry with none after it: *Start a new entry*. */
		startsEntry?: boolean
	}

	let { divider, color, hidden = false, order = "oldest-first", startsEntry = false }: Props = $props()

	const conv = useConversation()
	const scene = $derived(divider.scene)
	const name = $derived(scene.name?.trim() ? scene.name : "Scene")
	const canEdit = $derived(conv.scenes.boundaries)
	const refusal = $derived(
		conv.scenes.refusal?.at === "scene" && conv.scenes.refusal.id === scene.id
			? conv.scenes.refusal.text
			: null
	)
	const lines = $derived(`${divider.lineCount} ${divider.lineCount === 1 ? "line" : "lines"}`)
	/** *since Day 12 · 9 lines* for the open scene, *Day 12 · 9 lines* for a closed one. */
	const facts = $derived(
		divider.dateLabel
			? `${divider.open ? "since " : ""}${divider.dateLabel} · ${lines}`
			: lines
	)
	const summarizing = $derived(scene.summaryStatus === "running")
	/**
	 * 🚧 Its run finished and waits for the person (§15 G8): *Ready to
	 * review*, which opens that run's review — the host's answer to the same
	 * `summarize` a *Summarize* sends.
	 */
	const reviewing = $derived(scene.summaryStatus === "review")
	/**
	 * 🚧 A summary a moved boundary left behind (lane E): a live scene with
	 * summary text whose status went back to `none`.
	 */
	const summaryStale = $derived(
		divider.live && scene.summaryStatus === "none" && !!(scene as { hasSummary?: boolean }).hasSummary
	)
	const summarizes = $derived(conv.scenes.summarizes)

	/**
	 * Who is in it, by face. 🚧 Its cast, when the page sends one (lane E) —
	 * and, while it is the open scene, whoever else speaks in its loaded
	 * lines, since its cast is written when it closes; else the distinct
	 * speakers of its loaded lines.
	 */
	const faces = $derived.by(() => {
		const seen = new Set<string>()
		const out: Array<{ key: string; name: string; face: string | null }> = []
		const cast = (scene as { cast?: Array<{ ref: string | null; name: string; face: string | null }> }).cast
		for (const m of cast ?? []) {
			const key = m.ref ?? `name:${m.name}`
			if (seen.has(key)) continue
			seen.add(key)
			out.push({ key, name: m.name, face: m.face })
		}
		if (cast && !divider.open) return out
		for (const id of divider.rowIds) {
			const speaker = conv.line(id).speaker
			const key = speaker.ref ?? `name:${speaker.name}`
			if (!speaker.ref || seen.has(key)) continue
			seen.add(key)
			out.push({ key, name: speaker.name, face: speaker.face })
		}
		return out
	})
	const shownFaces = $derived(faces.slice(0, 4))

	let menuOpen = $state(false)
	let renaming = $state(false)
	let draft = $state("")

	/** A new history entry, after the one this scene closes. */
	const startEntry = () =>
		void conv.request("open-lore", {
			scope: "history",
			create: true,
			lorebookId: (scene as { lorebookId?: number }).lorebookId
		})

	const openInLore = () =>
		void conv.request("open-lore", {
			scope: "scenes",
			sceneId: scene.id,
			entryId: scene.historyEntryId ?? undefined,
			lorebookId: (scene as { lorebookId?: number }).lorebookId
		})

	function startRename() {
		draft = scene.name ?? ""
		renaming = true
	}
	async function commitRename() {
		if (!renaming) return
		renaming = false
		const next = draft.trim()
		if (next === (scene.name ?? "").trim()) return
		await conv.scenes.rename(scene.id, next || null)
	}
	function onRenameKey(e: CustomEvent<HostKeyEventDetail>) {
		if (e.detail.key === "Enter") void commitRename()
		else if (e.detail.key === "Escape") renaming = false
	}

	/** Close the menu, then press. */
	const press = (fn: () => unknown) => () => {
		menuOpen = false
		void fn()
	}
	/** A boundary press, held while another is in flight. */
	const boundary = (fn: () => unknown) => (e: Event) =>
		conv.scenes.busy ? e.preventDefault() : press(fn)()

	/**
	 * 🚧 The divider dropped between two lines (`sp-drag-handle`'s `move`,
	 * lane E): the scene starts at the later line in conversation order —
	 * the one after the gap oldest-first, before it newest-first. A drop
	 * where it already starts, or off the log, does nothing; the host
	 * judges the rest, and its refusal is said here.
	 */
	function onDragMove(e: CustomEvent<{ prev?: string | null; next?: string | null }>) {
		const key = order === "newest-first" ? e.detail?.prev : e.detail?.next
		const to = Number(key)
		if (!key || !Number.isInteger(to) || to === scene.openedAtMessageId) return
		void conv.scenes.moveStart(scene.id, to)
	}
</script>

<!-- A `messages.log-item` like the history marker: the divider's parts are
     `messages.scene-*` (STYLE-GUIDE §6.16), drawn by the default sheet. Its
     colour rides `--sp-scene`, as the scene's rows carry it. -->
<li
	data-widget-part="messages.log-item messages.scene-divider"
	role="presentation"
	style="--sp-scene: {color}"
	data-scene={scene.id}
	data-swatch={divider.swatch}
	data-open={divider.open ? "" : undefined}
	data-summary={scene.summaryStatus}
	{hidden}
>
	<div data-widget-part="messages.scene-divider-body">
		{#if canEdit && divider.live}
			<!-- 🚧 Drag to move where the scene starts (lane E). Pointer only:
			     the menu's *Move start up / down one line* is the same move. -->
			<sp-drag-handle
				data-widget-part="messages.scene-drag"
				along="messages.message-row"
				label="Drag to move where {name} starts"
				disabled={conv.scenes.busy || undefined}
				onmove={onDragMove}
			>
				<span data-widget-part="messages.scene-grip">
					<sp-icon name="grip-vertical" size="14"></sp-icon>
				</span>
			</sp-drag-handle>
		{/if}
		<span data-widget-part="messages.scene-swatch" aria-hidden="true"></span>
		{#if renaming}
			<!-- svelte-ignore a11y_autofocus -->
			<input
				data-widget-part="messages.scene-name-field"
				type="text"
				aria-label="Scene name"
				placeholder="Scene"
				keys="Escape Enter"
				autofocus
				bind:value={draft}
				onblur={() => void commitRename()}
				onkey={onRenameKey}
			/>
		{:else if canEdit}
			<button
				type="button"
				data-widget-part="messages.scene-title messages.scene-name"
				title="Rename this scene"
				onclick={startRename}
			>
				<sp-icon name="film" size="14"></sp-icon>
				{name}
			</button>
		{:else}
			<button
				type="button"
				data-widget-part="messages.scene-title"
				title="Open scene in lorebook"
				onclick={openInLore}
			>
				<sp-icon name="film" size="14"></sp-icon>
				{name}
			</button>
		{/if}
		{#if divider.open}
			<span data-widget-part="messages.scene-title-state">open</span>
		{/if}
		<!-- Who speaks in it rides the facts' tooltip too: the default sheet
		     keeps the row to swatch · name · count · ⋯ and draws no faces. -->
		<span
			data-widget-part="messages.scene-facts"
			title={faces.length ? `${facts} · ${faces.map((f) => f.name).join(", ")}` : undefined}
		>{facts}</span>
		{#if summarizing}
			<span data-widget-part="messages.scene-summary" role="status">Summarizing…</span>
		{:else if reviewing}
			{#if canEdit}
				<button
					type="button"
					data-widget-part="messages.scene-summary messages.scene-summary-review"
					title="Its summary is ready: open the review to apply or discard it"
					onclick={() => conv.scenes.summarize(scene.id)}
				>
					<sp-icon name="eye" size="12"></sp-icon>
					<span data-widget-part="messages.scene-summary-label">Ready to review</span>
				</button>
			{:else}
				<span data-widget-part="messages.scene-summary" title="Its summary waits for the session's owner to review it">
					Ready to review
				</span>
			{/if}
		{:else if scene.summaryStatus === "done"}
			<span data-widget-part="messages.scene-summary" title="Summarized into the lorebook">
				<sp-icon name="check" size="12"></sp-icon>
				<span data-widget-part="messages.scene-summary-label">Summarized</span>
			</span>
		{:else if scene.summaryStatus === "failed"}
			<span data-widget-part="messages.scene-summary">Summary failed</span>
		{:else if summaryStale}
			<span
				data-widget-part="messages.scene-summary messages.scene-summary-stale"
				title="Its boundaries moved since it was summarized: the summary is kept, and reads the old lines"
			>
				Summary out of date
			</span>
		{/if}
		{#if shownFaces.length}
			<span data-widget-part="messages.scene-faces" title="Who speaks in it: {faces.map((f) => f.name).join(', ')}">
				{#each shownFaces as f (f.key)}
					{#if f.face}
						<img data-widget-part="messages.scene-face" src={f.face} alt={f.name} />
					{:else}
						<span data-widget-part="messages.scene-face" role="img" aria-label={f.name}>
							{f.name.charAt(0).toUpperCase()}
						</span>
					{/if}
				{/each}
				{#if faces.length > shownFaces.length}
					<span data-widget-part="messages.scene-faces-more">+{faces.length - shownFaces.length}</span>
				{/if}
			</span>
		{/if}
		{#if canEdit || startsEntry}
			<!-- `sp-popover` (§3.5): the host's positioned panel; the rows wear
			     the message menu's parts beside their own, so they read as one
			     family of menus. -->
			<span data-widget-part="messages.scene-menu">
				<sp-popover
					placement="bottom-end"
					label="Scene options"
					open={menuOpen}
					onopen-change={(e: CustomEvent<{ open: boolean }>) => (menuOpen = e.detail.open)}
				>
					<button
						slot="trigger"
						type="button"
						data-widget-part="messages.scene-menu-button messages.message-icon-button"
						aria-label="Options for {name}"
					>
						<sp-icon name="ellipsis" size="16"></sp-icon>
					</button>
					<div data-widget-part="messages.scene-menu-panel messages.message-options-panel">
						<article data-widget-part="messages.scene-menu-list messages.message-options-list">
							{#if startsEntry}
								<button
									type="button"
									data-widget-part="messages.scene-option messages.message-option"
									title="Start a new history entry after this one"
									onclick={press(startEntry)}
								>
									<sp-icon name="calendar-plus" size="16"></sp-icon>
									<span>Start a new entry</span>
								</button>
								{#if canEdit}
									<hr data-widget-part="messages.scene-menu-divider messages.message-options-divider" />
								{/if}
							{/if}
							{#if canEdit}
								{#if divider.open}
									<button
										type="button"
										data-widget-part="messages.scene-option messages.message-option"
										title="End this scene at the newest line"
										aria-disabled={conv.scenes.busy}
										onclick={boundary(() => conv.scenes.endAt(scene.id))}
									>
										<sp-icon name="flag-off" size="16"></sp-icon>
										<span>End scene</span>
									</button>
								{:else if summarizes}
									<button
										type="button"
										data-widget-part="messages.scene-option messages.message-option"
										title={summarizing
											? "Summarize — it is being summarized now"
											: reviewing
												? "Open its summary's review, to apply or discard it"
												: "Summarize this scene into the lorebook"}
										aria-disabled={summarizing}
										onclick={(e) =>
											summarizing ? e.preventDefault() : press(() => conv.scenes.summarize(scene.id))()}
									>
										<sp-icon name={reviewing ? "eye" : "sparkles"} size="16"></sp-icon>
										<span>{reviewing ? "Review summary" : "Summarize"}</span>
									</button>
								{/if}
								<button
									type="button"
									data-widget-part="messages.scene-option messages.message-option"
									title="Open this scene in the lorebook"
									onclick={press(openInLore)}
								>
									<sp-icon name="external-link" size="16"></sp-icon>
									<span>Open in lorebook</span>
								</button>
								{#if divider.live}
									{#if divider.startEarlier !== null || divider.startLater !== null || divider.reopens}
										<hr data-widget-part="messages.scene-menu-divider messages.message-options-divider" />
									{/if}
									{#if divider.startEarlier !== null}
										{@const to = divider.startEarlier}
										<button
											type="button"
											data-widget-part="messages.scene-option messages.message-option"
											title="Start this scene one line earlier"
											aria-disabled={conv.scenes.busy}
											onclick={boundary(() => conv.scenes.moveStart(scene.id, to))}
										>
											<sp-icon name="arrow-up" size="16"></sp-icon>
											<span>Move start up one line</span>
										</button>
									{/if}
									{#if divider.startLater !== null}
										{@const to = divider.startLater}
										<button
											type="button"
											data-widget-part="messages.scene-option messages.message-option"
											title="Start this scene one line later; the line before leaves it"
											aria-disabled={conv.scenes.busy}
											onclick={boundary(() => conv.scenes.moveStart(scene.id, to))}
										>
											<sp-icon name="arrow-down" size="16"></sp-icon>
											<span>Move start down one line</span>
										</button>
									{/if}
									{#if divider.reopens}
										<button
											type="button"
											data-widget-part="messages.scene-option messages.message-option"
											title="Open this scene again: it runs on to the newest line"
											aria-disabled={conv.scenes.busy}
											onclick={boundary(() => conv.scenes.reopen(scene.id))}
										>
											<sp-icon name="flag" size="16"></sp-icon>
											<span>Reopen scene</span>
										</button>
									{/if}
									<hr data-widget-part="messages.scene-menu-divider messages.message-options-divider" />
									<button
										type="button"
										data-widget-part="messages.scene-option messages.message-option"
										data-verb="delete"
										title="Remove this boundary: it joins the scene before it, or its lines stay outside any scene"
										aria-disabled={conv.scenes.busy}
										onclick={boundary(() => conv.scenes.remove(scene.id))}
									>
										<sp-icon name="scissors" size="16"></sp-icon>
										<span>Remove boundary</span>
									</button>
								{/if}
							{/if}
						</article>
					</div>
				</sp-popover>
			</span>
		{/if}
	</div>
	{#if refusal}
		<p data-widget-part="messages.scene-refusal" role="alert">
			<span data-widget-part="messages.scene-refusal-text">{refusal}</span>
			<button
				type="button"
				data-widget-part="messages.scene-refusal-dismiss messages.message-icon-button"
				aria-label="Dismiss"
				onclick={() => conv.scenes.dismiss()}
			>
				<sp-icon name="x" size="14"></sp-icon>
			</button>
		</p>
	{/if}
</li>
