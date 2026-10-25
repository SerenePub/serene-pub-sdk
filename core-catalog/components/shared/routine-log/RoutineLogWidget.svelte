<script lang="ts">
	/**
	 * 🚧 **While you were away** (PLAN-layering A7, R23; lane 7, 2026-10-21):
	 * what the session's **routines** did — what ran and what it wrote, what
	 * was skipped or paused and why — newest first, the runs since anyone last
	 * played under their own head. Asked of the page (`routine-log`) when it
	 * mounts, when the story moves, every minute while it is open, and on
	 * **Refresh**; an administrator's line opens its run in the inspector
	 * (`inspect-run` by run id). Everything it says is worked out in the plain
	 * half (`routineLog.ts`); this draws it.
	 *
	 * The markup carries no look: each element names what it is in
	 * `data-widget-part` (`routine-log.entry row`, …), a line's outcome rides
	 * on `data-kind`, and the default widget stylesheet draws them
	 * (STYLE-GUIDE §6.16).
	 */
	import { untrack } from "svelte"
	import type { RoutineLogV1 } from "@serene-pub/sdk/component"
	import { useWidgetContext } from "../context"
	import { readRoutineLogSettings, routineLogView, type RoutineLogLine } from "./routineLog"

	/** Whether to ask the page yet: false until the host has posted this instance's settings. */
	let { ready = true }: { ready?: boolean } = $props()

	const widget = useWidgetContext()
	const t = (source: string): string => widget?.current?.t(source) ?? source

	const settings = $derived(readRoutineLogSettings(widget?.current?.settings?.v1))
	const limit = $derived(settings.limit)
	const sessionId = $derived(widget?.current?.session?.v1?.id ?? null)
	const isAdmin = $derived(widget?.current?.viewer?.v1?.isAdmin === true)

	let answer = $state<RoutineLogV1 | null>(null)
	/** Why the page could not be read, or declined a press — this widget's own. */
	let alert = $state<string | null>(null)
	let loading = $state(false)

	/** The clock the "… ago" words are told from, moved once a minute (and the log asked again). */
	let now = $state(Date.now())

	const view = $derived(routineLogView(answer, settings, now))
	const reason = (e: unknown) => (e instanceof Error ? e.message : String(e))

	// Which answer to show is this widget's: the latest ask's.
	let asked = 0
	function ask() {
		const ctx = untrack(() => widget?.current)
		if (!ctx) return
		const ticket = ++asked
		loading = true
		ctx.request("routine-log", { limit: untrack(() => limit) }).then(
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

	// The session, or how many to show, moved: ask again.
	$effect(() => {
		if (!ready) return
		void sessionId
		void limit
		untrack(() => ask())
	})

	// The story moved, or a minute passed: ask again, once per burst.
	let timer: ReturnType<typeof setTimeout> | undefined
	$effect(() =>
		untrack(() => {
			const off = widget?.current?.on("story:moved", () => {
				clearTimeout(timer)
				timer = setTimeout(() => ready && ask(), 500)
			})
			const tick = setInterval(() => {
				now = Date.now()
				if (ready) ask()
			}, 60_000)
			return () => {
				clearTimeout(timer)
				clearInterval(tick)
				off?.()
			}
		})
	)

	async function inspect(line: RoutineLogLine) {
		const ctx = untrack(() => widget?.current)
		if (!ctx) return
		alert = null
		try {
			await ctx.request("inspect-run", { runId: line.runId })
		} catch (e) {
			alert = t("Not opened: {reason}").replace("{reason}", reason(e))
		}
	}
</script>

{#snippet entry(line: RoutineLogLine)}
	<li data-widget-part="routine-log.entry row" data-kind={line.kind} data-run-now={line.runNow ? "" : undefined}>
		<span data-widget-part="routine-log.name label">{line.name}</span>
		<span data-widget-part="routine-log.outcome">{t(line.outcome)}</span>
		{#if line.wrote}
			<span data-widget-part="routine-log.wrote">{t(line.wrote)}</span>
		{/if}
		{#if line.runNow}
			<span data-widget-part="routine-log.run-now chip">{t("Run now")}</span>
		{/if}
		<span data-widget-part="routine-log.when">{t(line.when)}</span>
		{#if isAdmin}
			<button
				type="button"
				data-widget-part="routine-log.inspect"
				title={t("Open this run in the inspector")}
				aria-label={t("Open {name}'s run in the inspector").replace("{name}", line.name)}
				onclick={() => inspect(line)}
			>
				<sp-icon name="search" size="12"></sp-icon>
			</button>
		{/if}
	</li>
{/snippet}

<div data-widget-part="routine-log.root" aria-busy={loading}>
	<div data-widget-part="routine-log.toolbar toolbar">
		<button type="button" data-widget-part="routine-log.refresh" onclick={() => ask()} disabled={loading}>
			<sp-icon name="refresh-cw" size="12"></sp-icon>
			{t("Refresh")}
		</button>
	</div>

	{#if alert}
		<p data-widget-part="routine-log.alert" role="alert">{alert}</p>
	{/if}

	{#if view.empty}
		<p data-widget-part="routine-log.empty empty" role="status">{t(view.empty)}</p>
	{/if}

	{#if view.away.length}
		<section data-widget-part="routine-log.group" data-group="away" aria-label={t("While you were away")}>
			<h3 data-widget-part="routine-log.group-head">{t("While you were away")}</h3>
			<ul data-widget-part="routine-log.list list">
				{#each view.away as line (line.runId)}
					{@render entry(line)}
				{/each}
			</ul>
		</section>
	{/if}

	{#if view.earlier.length}
		<section data-widget-part="routine-log.group" data-group="earlier" aria-label={t("Earlier")}>
			<h3 data-widget-part="routine-log.group-head">{view.away.length ? t("Earlier") : t("Recent")}</h3>
			<ul data-widget-part="routine-log.list list">
				{#each view.earlier as line (line.runId)}
					{@render entry(line)}
				{/each}
			</ul>
		</section>
	{/if}
</div>
