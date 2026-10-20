<script lang="ts">
	/**
	 * The **turn line** (PLAN-core-widgets §3.16; owner 2026-10-10: "the last
	 * run and the next response trigger above the composer should be
	 * combined"): ONE row between the log and the composer, in two halves.
	 *
	 * - **Left, what the last run did** (`messages.turn-line-run`): a status
	 *   pill read off the newest reply in this log — *Narrator replied ·
	 *   6.2 s*, *Wren is thinking* while it streams (the row's own run
	 *   status), *Last run failed · <the row's error>* — then *Review N
	 *   changes* when proposals wait for the viewer, then *Inspect run*
	 *   (administrators, R55). The time is the run as this view saw it, from
	 *   `generation:start` to `generation:end`: a reply that finished before
	 *   the page opened has none, and says only that it replied.
	 * - **Right, who is next** (`messages.turn-line-next`): who is typing (the
	 *   page's `session-banners` view), then `NextCharacterBlock` exactly as
	 *   it always drew — or **Stop** while the reply streams, or **Try again**
	 *   (the reply's `retry` verb, the error row's own Retry) after it failed.
	 *   The `nextUp` setting governs this half; `hidden` drops it, and only
	 *   it — who is typing still shows, at the row's end.
	 *
	 * In a narrow box the pill is all of the left half: its links live in the
	 * pill's own panel (`sp-popover`), which the pill opens at every width.
	 * Reads only the conversation (its rows, its dossier, its events); acts
	 * only through its verbs and requests.
	 */
	import { untrack } from "svelte"
	import { SvelteMap } from "svelte/reactivity"
	import type { StatusText } from "@serene-pub/sdk/component"
	import type { NextUp } from "./MessagesWidget.svelte"
	import NextCharacterBlock from "./NextCharacterBlock.svelte"
	import StateProposalList from "./StateProposalList.svelte"
	import { useConversation } from "./conversation.svelte"

	interface Props {
		/** The `nextUp` setting: what the right half shows; `hidden`, none of it. */
		nextUp: NextUp
	}

	let { nextUp }: Props = $props()

	const conv = useConversation()
	const dossier = $derived(conv.dossier)

	type Row = {
		id: number
		isGenerating?: boolean
		error?: { message: string; code?: string } | null
		generationOutcome?: string | null
		generationStatus?: unknown
		characterId?: number | null
		isNarratorResponse?: boolean
		speakerLabel?: string | null
		metadata?: { isGreeting?: boolean }
	}
	const rows = $derived(conv.rows as Row[])
	/**
	 * 🚧 The composer under this line already offers Stop (its newest row is
	 * generating — the composer's own rule): this line does not offer a
	 * second (2026-10-18, the 100-turn walk #28: four Stops during a Rest).
	 */
	const composerStops = $derived(!!rows[rows.length - 1]?.isGenerating)
	/** A reply some run wrote: a greeting opens the session, no run wrote it. */
	const isReply = (m: Row) =>
		(!!m.characterId || !!m.isNarratorResponse || !!m.isGenerating) && !m.metadata?.isGreeting

	/** The newest reply in this log: the run the left half is about. */
	const reply = $derived.by((): Row | null => {
		for (let i = rows.length - 1; i >= 0; i--) if (isReply(rows[i])) return rows[i]
		return null
	})
	/** The reply is the log's last line: a retry is still offered on it. */
	const replyIsLast = $derived(!!reply && rows[rows.length - 1]?.id === reply.id)

	type TurnState = "live" | "failed" | "stopped" | "done"
	const turnState = $derived.by((): TurnState | null => {
		if (!reply) return null
		if (reply.isGenerating) return "live"
		if (reply.error) return "failed"
		if (reply.generationOutcome === "stopped") return "stopped"
		return "done"
	})

	/** Who wrote the reply, as the page named the line. */
	const speaker = $derived.by((): string | null => {
		if (!reply) return null
		const named = dossier?.lines[reply.id]?.speaker.name
		if (named) return named
		if (reply.speakerLabel) return reply.speakerLabel
		if (reply.isNarratorResponse) return dossier?.turn.ownVoiceName || "The narrator"
		return null
	})

	// How long each run took, as this view saw it: `generation:start` to
	// `generation:end`, per reply. A stopped run keeps no time.
	const startedAt = new Map<number, number>()
	const took = new SvelteMap<number, number>()
	$effect(() =>
		untrack(() => {
			const offStart = conv.ctx.on("generation:start", (e) => {
				if (e.kind === "generation:start" && e.messageId != null) startedAt.set(e.messageId, Date.now())
			})
			const offEnd = conv.ctx.on("generation:end", (e) => {
				if (e.kind !== "generation:end" || e.messageId == null) return
				const t0 = startedAt.get(e.messageId)
				startedAt.delete(e.messageId)
				if (t0 === undefined || e.aborted) took.delete(e.messageId)
				else took.set(e.messageId, (Date.now() - t0) / 1000)
			})
			return () => {
				offStart()
				offEnd()
			}
		})
	)
	const seconds = (s: number) => `${s < 10 ? s.toFixed(1) : Math.round(s)} s`

	const status = $derived.by((): string => {
		if (!reply || !turnState) return ""
		if (turnState === "live")
			return (
				conv.statusText(reply.generationStatus as StatusText | null | undefined) ||
				`${speaker ?? "The reply"} is thinking`
			)
		if (turnState === "failed") return `Last run failed · ${reply.error!.message}`
		if (turnState === "stopped") return "Last run stopped"
		const time = took.get(reply.id)
		const said = speaker ? `${speaker} replied` : "Replied"
		return time === undefined ? said : `${said} · ${seconds(time)}`
	})

	const waiting = $derived(dossier?.state.waiting ?? [])
	/**
	 * 🚧 What waits ON the viewer, and the viewer's own offers waiting on
	 * somebody else (PLAN-dc-after-walk3 R1-2, the walk's NEW-4): the giver's
	 * Review panel showed Accept · Reject on her own offer under "The AI
	 * asked for these". Her offers are listed apart, with Withdraw.
	 */
	const toDecide = $derived(waiting.filter((p) => !p.offer?.yours))
	const ownOffers = $derived(waiting.filter((p) => !!p.offer?.yours))
	/** Who asked for what waits on the viewer: the AI, a player, or both. */
	const decideNote = $derived.by(() => {
		const offers = toDecide.filter((p) => !!p.offer).length
		if (!offers) return "The AI asked for these. Nothing changes until you accept one."
		if (offers === toDecide.length)
			return offers === 1 ? "Offered to you. Nothing changes until you accept it." : "Offered to you. Nothing changes until you accept one."
		return "The AI asked for some, a player offered others. Nothing changes until you accept one."
	})
	const reviewLabel = $derived(
		toDecide.length
			? toDecide.length === 1
				? "Review 1 change"
				: `Review ${toDecide.length} changes`
			: ownOffers.length === 1
				? "Your offer is waiting"
				: `Your ${ownOffers.length} offers are waiting`
	)
	/** "Inspect run" (R55: administrators only), on a reply that has finished. */
	const canInspect = $derived(!!conv.ctx.viewer.v1.isAdmin && !!reply && turnState !== "live")
	const hasLinks = $derived(waiting.length > 0 || canInspect)
	/** The links beside the pill: Review only when the pill is not already it. */
	const hasSideLinks = $derived((waiting.length > 0 && !!status) || canInspect)
	let panelOpen = $state(false)

	const inspect = () => {
		panelOpen = false
		if (reply) void conv.request("inspect-run", { messageId: reply.id })
	}

	const showNext = $derived(nextUp !== "hidden" && !!dossier && !dossier.readOnly)
</script>

<!-- The turn line's parts (`messages.turn-line*`, STYLE-GUIDE §6.16): no
     look here; the default widget stylesheet draws them. -->
<div data-widget-part="messages.turn-line" data-turn-state={turnState ?? undefined}>
	{#if status || hasLinks}
		<div data-widget-part="messages.turn-line-run">
			{#if hasLinks}
				<!-- `sp-popover` (§3.5): the pill is the trigger; its panel holds
				     the links, which is all a narrow box shows of them. -->
				<sp-popover
					placement="top-start"
					label="The last run"
					open={panelOpen}
					onopen-change={(e: CustomEvent<{ open: boolean }>) => (panelOpen = e.detail.open)}
				>
					<button
						slot="trigger"
						type="button"
						data-widget-part="messages.turn-line-status"
						data-turn-state={turnState ?? undefined}
						title={status || reviewLabel}
					>
						<span data-widget-part="messages.turn-line-status-text">{status || reviewLabel}</span>
						<sp-icon name="chevron-up" size="12" data-widget-part="messages.turn-line-status-more"></sp-icon>
					</button>
					<div data-widget-part="messages.turn-line-panel">
						{#if toDecide.length}
							<header data-widget-part="messages.ledger-review-title">
								<sp-icon name="clipboard-check" size="14"></sp-icon>
								<span>Waiting for you</span>
							</header>
							<p data-widget-part="messages.ledger-review-note">{decideNote}</p>
							<StateProposalList proposals={toDecide} showAnchor />
						{/if}
						{#if ownOffers.length}
							<header data-widget-part="messages.ledger-review-title">
								<sp-icon name="hourglass" size="14"></sp-icon>
								<span>{ownOffers.length === 1 ? "Your offer" : "Your offers"}</span>
							</header>
							<p data-widget-part="messages.ledger-review-note">
								Nothing moves until it is accepted. You can take an offer back.
							</p>
							<StateProposalList proposals={ownOffers} />
						{/if}
						{#if canInspect}
							<button type="button" data-widget-part="messages.turn-line-panel-inspect" onclick={inspect}>
								<sp-icon name="receipt" size="14"></sp-icon>
								<span>Inspect run</span>
							</button>
						{/if}
					</div>
				</sp-popover>
			{:else}
				<span data-widget-part="messages.turn-line-status" data-turn-state={turnState ?? undefined} title={status}>
					<span data-widget-part="messages.turn-line-status-text">{status}</span>
				</span>
			{/if}
			{#if hasSideLinks}
				<!-- The same links, beside the pill where the box has room. -->
				<span data-widget-part="messages.turn-line-links">
					<!-- Not when the pill already says it (no status yet): one
					     Review per screen, never two side by side. -->
					{#if waiting.length && status}
						<button
							type="button"
							data-widget-part="messages.turn-line-review"
							onclick={() => (panelOpen = true)}
						>
							<sp-icon name="clipboard-check" size="12"></sp-icon>
							<span>{reviewLabel}</span>
						</button>
					{/if}
					{#if canInspect}
						<button type="button" data-widget-part="messages.turn-line-inspect" onclick={inspect}>
							<sp-icon name="receipt" size="12"></sp-icon>
							<span>Inspect run</span>
						</button>
					{/if}
				</span>
			{/if}
		</div>
	{/if}
	{#if showNext && dossier}
		<div data-widget-part="messages.turn-line-next messages.next-up">
			<!-- Who else is writing (the page's view): a pill, when someone is. -->
			<span data-widget-part="messages.turn-line-typing"><sp-host-view name="session-banners"></sp-host-view></span>
			{#if turnState === "live"}
				<!-- 🚧 Live with the composer's own Stop right under it: nothing here. -->
				{#if !composerStops}
					<button
						type="button"
						data-widget-part="messages.turn-line-stop"
						title="Stop"
						aria-label="Stop generating"
						onclick={() => conv.invoke("stop")}
					>
						<sp-icon name="square" size="14"></sp-icon>
						<span>Stop</span>
					</button>
				{/if}
			{:else if turnState === "failed" && replyIsLast && reply}
				<button
					type="button"
					data-widget-part="messages.turn-line-retry"
					title="Write this reply again"
					onclick={() => conv.invoke("retry", reply)}
				>
					<sp-icon name="refresh-cw" size="14"></sp-icon>
					<span>Try again</span>
				</button>
			{:else}
				<NextCharacterBlock
					order={dossier.turn.order}
					candidates={dossier.turn.candidates}
					mode={nextUp}
					shouldShow={dossier.turn.show && conv.edit.id === null}
					avatarFor={(ref) => (ref.startsWith("character:") ? ref : undefined)}
					canChooseSomeoneElse={dossier.turn.canChoose}
					viewerUserId={conv.ctx.viewer.v1.userId}
					waitingFor={dossier.turn.waitingFor ?? []}
					onContinue={(channel) => void conv.request("fire-turn", { channel })}
					onSomeoneElse={() => void conv.request("pick-turn", {})}
				/>
			{/if}
		</div>
	{:else}
		<span data-widget-part="messages.turn-line-typing"><sp-host-view name="session-banners"></sp-host-view></span>
	{/if}
</div>
