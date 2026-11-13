<script lang="ts">
	/**
	 * 🚧 **Runs** (lay-R, owner 2026-11-06): an administrator's list of this
	 * session's pipeline runs, newest first — what started each, which
	 * pipeline, how it ended, how long it took, where it stopped — with
	 * doors to its steps (inline), the run inspector (`inspect-run`) and the
	 * prompt (`prompt-details`). Asked of the page (`session-runs`) when it
	 * mounts, when a run ends (`run:ended`), when the story moves
	 * (`story:moved`), on **Refresh** and on **Show more**. It draws nothing
	 * — no element, no sentence, no request — for anyone but an
	 * administrator. Everything it says is worked out in the plain half
	 * (`@serene-pub/core-catalog/session-runs`); this draws it.
	 *
	 * The markup carries no look: each element names what it is in
	 * `data-widget-part`, a run's outcome rides on `data-outcome`, and the
	 * default widget stylesheet draws them (STYLE-GUIDE §6.16).
	 */
	import { untrack } from "svelte"
	import { SvelteMap } from "svelte/reactivity"
	import type { SessionRunsV1 } from "@serene-pub/sdk/component"
	import {
		SESSION_RUNS_FIRST,
		SESSION_RUNS_MOST,
		canShowMoreRuns,
		runStartedByParts,
		sessionRunRows,
		sessionRunStepRows,
		type SessionRunRow,
		type SessionRunStepRow,
	} from "@serene-pub/core-catalog/session-runs"
	import { useWidgetContext } from "../context"

	const widget = useWidgetContext()
	const t = (source: string): string => widget?.current?.t(source) ?? source

	const isAdmin = $derived(widget?.current?.viewer?.v1?.isAdmin === true)
	const viewerId = $derived(widget?.current?.viewer?.v1?.userId ?? null)

	let limit = $state(SESSION_RUNS_FIRST)
	let answer = $state<SessionRunsV1 | null>(null)
	/** Why the page could not be read, or declined a press — this widget's own. */
	let alert = $state<string | null>(null)
	let loading = $state(false)

	/** The clock the "… ago" words are told from, moved once a minute (no new ask). */
	let now = $state(Date.now())

	const rows = $derived(sessionRunRows(answer?.runs ?? [], viewerId, now))
	const reason = (e: unknown) => (e instanceof Error ? e.message : String(e))

	// Which answer to show is this widget's: the latest ask's.
	let asked = 0
	function ask() {
		const ctx = untrack(() => widget?.current)
		if (!ctx || !untrack(() => isAdmin)) return
		const ticket = ++asked
		loading = true
		ctx.request("session-runs", { limit: untrack(() => limit) }).then(
			(res) => {
				if (ticket !== asked) return
				loading = false
				alert = null
				answer = res
			},
			(e) => {
				if (ticket !== asked) return
				loading = false
				alert = t("Not read: {reason}").replace("{reason}", reason(e))
			}
		)
	}

	// An administrator: ask when it mounts (or when the session or viewer moves).
	const sessionId = $derived(widget?.current?.session?.v1?.id ?? null)
	$effect(() => {
		if (!isAdmin) return
		void sessionId
		untrack(() => ask())
	})

	// A run ended or the story moved: ask again, once per burst.
	$effect(() => {
		if (!isAdmin) return
		return untrack(() => {
			let timer: ReturnType<typeof setTimeout> | undefined
			const again = () => {
				clearTimeout(timer)
				timer = setTimeout(() => ask(), 500)
			}
			const offEnded = widget?.current?.on("run:ended", again)
			const offMoved = widget?.current?.on("story:moved", again)
			const tick = setInterval(() => (now = Date.now()), 60_000)
			return () => {
				clearTimeout(timer)
				clearInterval(tick)
				offEnded?.()
				offMoved?.()
			}
		})
	})

	function showMore() {
		limit = SESSION_RUNS_MOST
		ask()
	}

	/** Steps already answered, by run. */
	const steps = new SvelteMap<string, SessionRunStepRow[]>()
	/** Runs whose steps are open. */
	const open = new SvelteMap<string, true>()

	async function toggleSteps(run: SessionRunRow) {
		if (open.has(run.runId)) {
			open.delete(run.runId)
			return
		}
		open.set(run.runId, true)
		if (steps.has(run.runId)) return
		const ctx = untrack(() => widget?.current)
		if (!ctx) return
		try {
			const res = await ctx.request("session-run-steps", { runId: run.runId })
			alert = null
			steps.set(run.runId, sessionRunStepRows(res.steps))
		} catch (e) {
			open.delete(run.runId)
			alert = t("Not read: {reason}").replace("{reason}", reason(e))
		}
	}

	async function inspect(run: SessionRunRow) {
		const ctx = untrack(() => widget?.current)
		if (!ctx) return
		alert = null
		try {
			await ctx.request("inspect-run", { runId: run.runId })
		} catch (e) {
			alert = t("Not opened: {reason}").replace("{reason}", reason(e))
		}
	}

	async function prompt(run: SessionRunRow) {
		const ctx = untrack(() => widget?.current)
		if (!ctx || run.promptMessageId == null) return
		alert = null
		try {
			await ctx.request("prompt-details", { messageId: run.promptMessageId })
		} catch (e) {
			alert = t("Not opened: {reason}").replace("{reason}", reason(e))
		}
	}

	const startedBy = (run: SessionRunRow, source: SessionRunsV1["runs"][number] | undefined) => {
		if (!source) return t(run.startedBy)
		const p = runStartedByParts(source, viewerId)
		const text = t(p.source)
		return p.name === undefined ? text : text.replace("{name}", p.name)
	}
	const sourceOf = (runId: string) => answer?.runs.find((r) => r.runId === runId)
</script>

{#snippet entry(run: SessionRunRow)}
	{@const isOpen = open.has(run.runId)}
	{@const listId = `session-run-steps-${run.runId}`}
	<li
		data-widget-part="session-runs.entry row"
		data-outcome={run.outcome}
		data-preview={run.preview ? "" : undefined}
		data-open={isOpen ? "" : undefined}
		data-depth={run.depth > 0 ? run.depth : undefined}
	>
		<span data-widget-part="session-runs.pipeline label">{run.pipeline}</span>
		<span data-widget-part="session-runs.outcome">{t(run.outcomeWords)}</span>
		{#if run.preview}
			<span data-widget-part="session-runs.preview chip">{t("Preview")}</span>
		{/if}
		<span data-widget-part="session-runs.started-by">{startedBy(run, sourceOf(run.runId))}</span>
		<span data-widget-part="session-runs.when">{t(run.when)}</span>
		<span data-widget-part="session-runs.duration">{t(run.duration)}</span>
		{#if run.tokens}
			<span data-widget-part="session-runs.tokens">{t(run.tokens)}</span>
		{/if}
		{#if run.stoppedAt}
			<span data-widget-part="session-runs.stopped-at">{run.stoppedAt}</span>
		{/if}
		<span data-widget-part="session-runs.actions">
			<button
				type="button"
				data-widget-part="session-runs.steps-toggle"
				aria-expanded={isOpen}
				aria-controls={listId}
				onclick={() => toggleSteps(run)}
			>
				<sp-icon name="list-tree" size="12"></sp-icon>
				{t("Steps")}
			</button>
			<button
				type="button"
				data-widget-part="session-runs.inspect"
				title={t("Open this run in the inspector")}
				onclick={() => inspect(run)}
			>
				<sp-icon name="search" size="12"></sp-icon>
				{t("Inspect")}
			</button>
			{#if run.promptMessageId != null}
				<button
					type="button"
					data-widget-part="session-runs.prompt"
					title={t("Open the prompt this run sent")}
					onclick={() => prompt(run)}
				>
					<sp-icon name="file-text" size="12"></sp-icon>
					{t("Prompt")}
				</button>
			{/if}
		</span>
		{#if isOpen}
			<ol data-widget-part="session-runs.steps list" id={listId}>
				{#each steps.get(run.runId) ?? [] as step (step.seq)}
					<li data-widget-part="session-runs.step row" data-result={step.result}>
						<span data-widget-part="session-runs.step-key">{step.key}</span>
						<span data-widget-part="session-runs.step-kind">{step.kind}</span>
						<span data-widget-part="session-runs.step-result">{step.result}</span>
						{#if step.reason}
							<span data-widget-part="session-runs.step-reason">{step.reason}</span>
						{/if}
						<span data-widget-part="session-runs.step-duration">{t(step.duration)}</span>
						{#if step.tokens}
							<span data-widget-part="session-runs.step-tokens">{t(step.tokens)}</span>
						{/if}
					</li>
				{/each}
			</ol>
		{/if}
	</li>
{/snippet}

{#if isAdmin}
	<div data-widget-part="session-runs.root" aria-busy={loading}>
		<div data-widget-part="session-runs.toolbar toolbar">
			<button type="button" data-widget-part="session-runs.refresh" onclick={() => ask()} disabled={loading}>
				<sp-icon name="refresh-cw" size="12"></sp-icon>
				{t("Refresh")}
			</button>
		</div>

		{#if alert}
			<p data-widget-part="session-runs.alert" role="alert">{alert}</p>
		{/if}

		{#if rows.length}
			<ul data-widget-part="session-runs.list list">
				{#each rows as run (run.runId)}
					{@render entry(run)}
				{/each}
			</ul>
		{/if}

		{#if canShowMoreRuns(rows.length, limit)}
			<button type="button" data-widget-part="session-runs.more" onclick={showMore} disabled={loading}>
				{t("Show more")}
			</button>
		{/if}
	</div>
{/if}
