<script lang="ts">
	/**
	 * Chronicle (PLAN-core-widgets W3): when are we in the story, and what
	 * has the lorebook recorded of this session. Top to bottom: the story
	 * clock, **Now** (the history entry the session reads), that entry's
	 * scenes from this session, and **Earlier**, folded.
	 *
	 * It reads its settings, the viewer and the session; everything else is
	 * asked of the page. One `history-entries` reads it all (the declared
	 * `lore` scope is the grant for it), and it asks again whenever the page
	 * says `story:moved` — a clock moved by a pipeline or the settings, an
	 * entry added in the lorebook, a scene captured — and after each of its
	 * own presses. The view is the plain half's (`chronicleView`); this only
	 * draws it and presses.
	 *
	 * Writes are the session owner's: the clock's step, *Move the clock…*
	 * and *Follow the line's present* (`set-story-clock`), *Start new history
	 * entry* (`start-history-entry`, then the new entry opens in the
	 * lorebook), *Summarize scene* (`summarize` with no lines: the
	 * conversation's selection starts) and *Extend graph* (`extend-graph`).
	 * A guest reads the clock alone. What the page declines is said here
	 * (R77), never a toast.
	 *
	 * 🚧 Live scenes (§7, lane D): under the clock, the **Open scene** card —
	 * its name, since when, its lines, its proposed cast with each one's
	 * evidence, *Close scene* (`scene-close`) and *Close and summarize* (the
	 * close, then `summarize-scenes` naming it). Each scene row carries its
	 * summary dot (none · running · review · done · failed) and *Summarize*
	 * (`summarize-scenes` naming it) — 🚧 or, while its finished run waits
	 * in `review` (§15 G8), *Ready to review* (`summarize` naming the scene:
	 * the host opens that run's review); *Summarize all (N)* asks for every
	 * scene with no summary yet. While a scene is open it asks again when a
	 * line arrives, so its line count keeps up.
	 *
	 * The markup carries no look (STYLE-GUIDE §6.16): its elements carry
	 * `chronicle.*` widget parts; a scene's colour rides on its swatch's
	 * `data-swatch`, an entry that says nothing yet on `data-blank`. Earlier
	 * folds in the host's accordion (`sp-accordion`), as the author's
	 * note's Advanced does.
	 */
	import { untrack } from "svelte"
	import type { HistoryEntriesV1, WidgetRequests } from "@serene-pub/sdk/component"
	import {
		chronicleClockDraft,
		chronicleClockFromDraft,
		chronicleView,
		readChronicleSettings,
		type ChronicleClockDraft
	} from "@serene-pub/core-catalog/chronicle"
	import { useWidgetContext } from "../context"

	/** Whether to ask the page yet: false until the host has posted this instance's settings. */
	let { ready = true }: { ready?: boolean } = $props()

	const widget = useWidgetContext()
	const t = (source: string): string => widget?.current?.t(source) ?? source
	const uid = $props.id()

	const settings = $derived(
		readChronicleSettings(widget?.current?.settings?.v1)
	)
	// Primitives, so a push that changes neither asks nothing again.
	const earlierCount = $derived(settings.earlierCount)
	const sessionId = $derived(widget?.current?.session?.v1?.id ?? null)

	let answer = $state<HistoryEntriesV1 | null>(null)
	/** Why the page could not be read, or declined a press — this widget's own. */
	let alert = $state<string | null>(null)
	/** A press in flight: its controls wait. */
	let busy = $state<string | null>(null)

	const view = $derived(chronicleView(answer, settings, widget?.current?.viewer?.v1, t))

	const reason = (e: unknown) => (e instanceof Error ? e.message : String(e))

	// Which answer to show is this widget's: the latest ask's.
	let asked = 0
	function ask() {
		const ctx = untrack(() => widget?.current)
		if (!ctx) return
		const ticket = ++asked
		const params: WidgetRequests["history-entries"]["params"] = {
			earlierLimit: untrack(() => earlierCount)
		}
		ctx.request("history-entries", params).then(
			(res) => {
				if (ticket !== asked) return
				answer = res
			},
			(e) => {
				if (ticket !== asked) return
				alert = t("Not read: {reason}").replace("{reason}", reason(e))
			}
		)
	}

	// The session, or how many earlier entries to show, moved: ask again.
	$effect(() => {
		if (!ready) return
		void sessionId
		void earlierCount
		untrack(() => {
			alert = null
			ask()
		})
	})

	// The story moved somewhere else (R81's shape): ask again, once per burst.
	let timer: ReturnType<typeof setTimeout> | undefined
	$effect(() =>
		untrack(() => {
			const off = widget?.current?.on("story:moved", () => {
				clearTimeout(timer)
				timer = setTimeout(() => ready && ask(), 150)
			})
			return () => {
				clearTimeout(timer)
				off?.()
			}
		})
	)

	/** Press `kind` with `params`; the page's refusal is this widget's line. */
	async function press<K extends keyof WidgetRequests>(
		name: string,
		kind: K,
		params: WidgetRequests[K]["params"]
	): Promise<WidgetRequests[K]["result"] | undefined> {
		const ctx = untrack(() => widget?.current)
		if (!ctx || busy) return undefined
		busy = name
		alert = null
		try {
			return await ctx.request(kind, params)
		} catch (e) {
			alert = t("Not done: {reason}").replace("{reason}", reason(e))
			return undefined
		} finally {
			busy = null
		}
	}

	// A line arrived while a scene is open: its count moved. Asked again
	// once per burst, and only while the card is showing.
	let lineTimer: ReturnType<typeof setTimeout> | undefined
	$effect(() =>
		untrack(() => {
			const off = widget?.current?.on("message:created", () => {
				if (!answer?.openScene) return
				clearTimeout(lineTimer)
				lineTimer = setTimeout(() => ready && ask(), 800)
			})
			return () => {
				clearTimeout(lineTimer)
				off?.()
			}
		})
	)

	// ── the open scene and the summaries (live scenes §7) ──────────────────
	/** Close the open scene; with `summarize`, then summarize it in the background. */
	async function closeOpenScene(sceneId: number, summarize: boolean) {
		const closed = await press(summarize ? "close-summarize" : "close", "scene-close", { sceneId })
		if (!closed) return
		if (summarize) await press("summarize", "summarize-scenes", { sceneIds: [sceneId] })
		ask()
	}

	/** Summarize `sceneIds` in the background — or, with none, every scene with no summary yet. */
	async function summarizeScenes(sceneIds?: number[]) {
		const done = await press("summarize", "summarize-scenes", sceneIds ? { sceneIds } : {})
		if (done) ask()
	}

	// ── the clock ────────────────────────────────────────────────────────────
	let moving = $state(false)
	let draft = $state<ChronicleClockDraft>(chronicleClockDraft(null))
	let formProblem = $state<string | null>(null)

	function openMove() {
		draft = chronicleClockDraft(answer?.clock.present)
		formProblem = null
		moving = !moving
	}

	async function moveClock(params: WidgetRequests["set-story-clock"]["params"], name: string) {
		const clock = await press(name, "set-story-clock", params)
		if (!clock) return false
		if (answer) answer = { ...answer, clock }
		ask()
		return true
	}

	/** Set the clock to the form's date (Set the clock, or Enter in a field). */
	async function submitMove() {
		const read = chronicleClockFromDraft(draft)
		if (read.problem !== undefined) {
			formProblem = t(read.problem)
			return
		}
		formProblem = null
		if (await moveClock({ to: read.to }, "move")) moving = false
	}

	const FIELDS: { key: keyof ChronicleClockDraft; label: string }[] = [
		{ key: "year", label: "Year" },
		{ key: "month", label: "Month" },
		{ key: "day", label: "Day" },
		{ key: "hour", label: "Hour" },
		{ key: "minute", label: "Minute" }
	]

	// ── the entries and scenes ───────────────────────────────────────────────
	function openEntry(entryId?: number) {
		const lorebookId = answer?.lorebookId ?? undefined
		void press("open", "open-lore", {
			...(lorebookId != null ? { lorebookId } : {}),
			scope: "history",
			...(entryId != null ? { entryId } : {})
		})
	}

	function openScene(sceneId: number) {
		const lorebookId = answer?.lorebookId ?? undefined
		void press("open", "open-lore", {
			...(lorebookId != null ? { lorebookId } : {}),
			scope: "scenes",
			sceneId
		})
	}

	async function startEntry() {
		const made = await press("start", "start-history-entry", {})
		if (!made) return
		ask()
		// The new entry opens in the lorebook, ready to write — the pane's
		// old behaviour, and only for the press made here.
		openEntry(made.entryId)
	}
</script>

<div data-widget-part="chronicle.root" data-widget="chronicle" data-state={view.state}>
	{#if view.state === "no-book"}
		<p data-widget-part="chronicle.empty empty">{view.empty}</p>
	{:else}
		{#if alert}
			<p data-widget-part="chronicle.alert" role="alert">{alert}</p>
		{/if}

		{#if view.clock}
			<section data-widget-part="chronicle.clock" aria-label={t("Story clock")}>
				<div data-widget-part="chronicle.clock-head">
					<span data-widget-part="chronicle.clock-date">{view.clock.date}</span>
					{#if view.clock.behind}
						<span data-widget-part="chronicle.behind chip" title={view.clock.behindTitle}>
							{view.clock.behind}
						</span>
					{/if}
				</div>
				<p data-widget-part="chronicle.clock-note">{view.clock.note}</p>
				{#if view.clock.canMove}
					<div data-widget-part="chronicle.clock-controls toolbar">
						{#if view.clock.step}
							{@const step = view.clock.step}
							<button
								type="button"
								data-widget-part="chronicle.step"
								disabled={!!busy}
								onclick={() => moveClock({ by: step.by, unit: step.unit }, "step")}
							>
								<sp-icon name="chevron-right" size="14"></sp-icon>
								{step.label}
							</button>
						{/if}
						<button
							type="button"
							data-widget-part="chronicle.move"
							aria-expanded={moving}
							disabled={!!busy}
							onclick={openMove}
						>
							<sp-icon name="calendar-clock" size="14"></sp-icon>
							{t("Move the clock…")}
						</button>
						{#if view.clock.canFollow}
							<button
								type="button"
								data-widget-part="chronicle.follow"
								disabled={!!busy}
								onclick={() => moveClock({ follow: true }, "follow")}
							>
								{t("Follow the line's present")}
							</button>
						{/if}
					</div>
					{#if moving}
						<div
							id="{uid}-move"
							role="group"
							aria-label={t("Move the clock")}
							data-widget-part="chronicle.move-form"
						>
							<div data-widget-part="chronicle.fields">
								{#each FIELDS as f (f.key)}
									<label data-widget-part="chronicle.field">
										<span data-widget-part="chronicle.field-label label">{t(f.label)}</span>
										<input
											type="text"
											data-widget-part="chronicle.field-input"
											name={f.key}
											value={draft[f.key]}
											oninput={(e) => (draft = { ...draft, [f.key]: e.currentTarget.value })}
											onkeydown={(e) => {
												if (e.key === "Enter") {
													e.preventDefault()
													void submitMove()
												}
											}}
										/>
									</label>
								{/each}
							</div>
							{#if formProblem}
								<p data-widget-part="chronicle.alert" role="alert">{formProblem}</p>
							{/if}
							<div data-widget-part="chronicle.form-actions toolbar">
								<button type="button" data-widget-part="chronicle.cancel" onclick={() => (moving = false)}>
									{t("Cancel")}
								</button>
								<button
									type="button"
									data-widget-part="chronicle.save"
									disabled={!!busy}
									onclick={submitMove}
								>
									{t("Set the clock")}
								</button>
							</div>
						</div>
					{/if}
				{/if}
			</section>
		{/if}

		{#if view.ownerOnly}
			<p data-widget-part="chronicle.note">{view.ownerOnly}</p>
		{:else if view.state === "ready"}
			{#if view.openScene}
				{@const open = view.openScene}
				<section
					data-widget-part="chronicle.open-scene card"
					data-scene-id={open.id}
					aria-labelledby="{uid}-open-scene"
				>
					<h3 id="{uid}-open-scene" data-widget-part="chronicle.heading label">{t("Open scene")}</h3>
					<div data-widget-part="chronicle.open-scene-head">
						<span data-widget-part="chronicle.scene-swatch" data-swatch={open.swatch}></span>
						<span data-widget-part="chronicle.open-scene-name">{open.name}</span>
					</div>
					<p data-widget-part="chronicle.open-scene-meta">
						{#if open.since}<span data-widget-part="chronicle.open-scene-since">{open.since}</span>{/if}
						<span data-widget-part="chronicle.scene-span">{open.span}</span>
					</p>
					{#if open.cast.length}
						<ul data-widget-part="chronicle.cast list" aria-label={t("Proposed cast")}>
							{#each open.cast as member, i (i)}
								<li data-widget-part="chronicle.cast-member chip" title={member.evidence}>
									{member.name}
									<span data-widget-part="chronicle.cast-evidence">{member.evidence}</span>
								</li>
							{/each}
						</ul>
					{/if}
					{#if open.canClose}
						<div data-widget-part="chronicle.open-scene-actions toolbar">
							<button
								type="button"
								data-widget-part="chronicle.close"
								disabled={!!busy}
								onclick={() => closeOpenScene(open.id, false)}
							>
								<sp-icon name="flag-off" size="14"></sp-icon>
								{t("Close scene")}
							</button>
							{#if open.canCloseAndSummarize}
								<button
									type="button"
									data-widget-part="chronicle.close-summarize"
									disabled={!!busy}
									onclick={() => closeOpenScene(open.id, true)}
								>
									<sp-icon name="film" size="14"></sp-icon>
									{t("Close and summarize")}
								</button>
							{/if}
						</div>
					{/if}
					{#if open.note}
						<p data-widget-part="chronicle.open-scene-note">{open.note}</p>
					{/if}
				</section>
			{/if}

			<section data-widget-part="chronicle.now" aria-labelledby="{uid}-now">
				<h3 id="{uid}-now" data-widget-part="chronicle.heading label">{t("Now")}</h3>
				{#if view.now}
					<div data-widget-part="chronicle.entry card" data-entry-id={view.now.id}>
						<span data-widget-part="chronicle.entry-date">{view.now.date}</span>
						<span data-widget-part="chronicle.entry-line" data-blank={view.now.blank ? "" : undefined}>
							{view.now.firstLine}
						</span>
						<span data-widget-part="chronicle.entry-scenes">{view.now.scenes}</span>
					</div>
				{:else}
					<p data-widget-part="chronicle.empty empty">{view.nowEmpty}</p>
				{/if}
				<div data-widget-part="chronicle.toolbar toolbar">
					<button
						type="button"
						data-widget-part="chronicle.open"
						onclick={() => openEntry(view.now?.id)}
					>
						<sp-icon name="external-link" size="14"></sp-icon>
						{t("Open in lorebook")}
					</button>
					{#if view.canWrite && view.now}
						<button
							type="button"
							data-widget-part="chronicle.start"
							disabled={!!busy}
							onclick={startEntry}
						>
							<sp-icon name="plus" size="14"></sp-icon>
							{t("Start new history entry")}
						</button>
					{/if}
				</div>
			</section>

			{#if view.now}
				<section data-widget-part="chronicle.scenes" aria-labelledby="{uid}-scenes">
					<h3 id="{uid}-scenes" data-widget-part="chronicle.heading label">{t("Scenes")}</h3>
					{#if view.scenes.length}
						<ul data-widget-part="chronicle.scene-list list">
							{#each view.scenes as s (s.id)}
								<li
									data-widget-part="chronicle.scene row"
									data-scene-id={s.id}
									data-open={s.open ? "" : undefined}
								>
									<button
										type="button"
										data-widget-part="chronicle.scene-open"
										title={t("Open in lorebook")}
										onclick={() => openScene(s.id)}
									>
										<span data-widget-part="chronicle.scene-swatch" data-swatch={s.swatch}></span>
										<span data-widget-part="chronicle.scene-name">{s.name}</span>
										<span data-widget-part="chronicle.scene-span">{s.span}</span>
										<span
											data-widget-part="chronicle.scene-status"
											data-status={s.status}
											role="img"
											aria-label={s.statusLabel}
											title={s.statusLabel}
										></span>
									</button>
									{#if s.canSummarize}
										<button
											type="button"
											data-widget-part="chronicle.scene-summarize"
											title={t("Summarize this scene in the background")}
											disabled={!!busy}
											onclick={() => summarizeScenes([s.id])}
										>
											{t("Summarize")}
										</button>
									{:else if s.canReview}
										<!-- 🚧 §15 G8: the run finished; its review opens in the host. -->
										<button
											type="button"
											data-widget-part="chronicle.scene-summarize chronicle.scene-review"
											title={t("Its summary is ready: open the review to apply or discard it")}
											disabled={!!busy}
											onclick={() => press("review", "summarize", { kind: "scene", sceneId: s.id })}
										>
											{t("Ready to review")}
										</button>
									{/if}
								</li>
							{/each}
						</ul>
					{:else}
						<p data-widget-part="chronicle.empty empty">{view.scenesEmpty}</p>
					{/if}
					{#if view.canSummarize || view.extend || view.summarizeAll}
						<div data-widget-part="chronicle.scene-actions toolbar">
							{#if view.canSummarize}
								<button
									type="button"
									data-widget-part="chronicle.summarize"
									disabled={!!busy}
									onclick={() => press("summarize", "summarize", { kind: "scene" })}
								>
									<sp-icon name="film" size="14"></sp-icon>
									{t("Summarize scene")}
								</button>
							{/if}
							{#if view.summarizeAll}
								{@const all = view.summarizeAll}
								<button
									type="button"
									data-widget-part="chronicle.summarize-all"
									title={all.title}
									disabled={!!busy}
									onclick={() => summarizeScenes()}
								>
									<sp-icon name="film" size="14"></sp-icon>
									{all.label}
								</button>
							{/if}
							{#if view.extend}
								<button
									type="button"
									data-widget-part="chronicle.extend"
									title={view.extend.title}
									disabled={!!busy}
									onclick={() => press("extend", "extend-graph", {})}
								>
									<sp-icon name="network" size="14"></sp-icon>
									{view.extend.label}
								</button>
							{/if}
						</div>
					{/if}
				</section>
			{/if}

			{#if view.earlierHead}
				<!-- Folded: the host's accordion, its trigger the head (*Earlier (N)*). -->
				<sp-accordion data-widget-part="chronicle.earlier" value="">
					<sp-accordion-item value="earlier" heading={view.earlierHead} level="3">
						<ul data-widget-part="chronicle.earlier-list list">
							{#each view.earlier as e (e.id)}
								<li data-widget-part="chronicle.earlier-row row" data-entry-id={e.id}>
									<button
										type="button"
										data-widget-part="chronicle.earlier-entry"
										title={t("Open in lorebook")}
										onclick={() => openEntry(e.id)}
									>
										<span data-widget-part="chronicle.entry-date">{e.date}</span>
										<span data-widget-part="chronicle.entry-line" data-blank={e.blank ? "" : undefined}>
											{e.firstLine}
										</span>
										<span data-widget-part="chronicle.entry-scenes">{e.scenes}</span>
									</button>
								</li>
							{/each}
						</ul>
						{#if view.earlierMore}
							<p data-widget-part="chronicle.earlier-more">{view.earlierMore}</p>
						{/if}
					</sp-accordion-item>
				</sp-accordion>
			{/if}
		{/if}
	{/if}
</div>
