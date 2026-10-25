<script lang="ts">
	/**
	 * Who is due next (PLAN-turn-order §4.9), rendered from the session's
	 * stored turn order — never derived on the client. It reads the entries
	 * on **its own log's channel** (the composer's, `conversation.lane`;
	 * lair re-plan R5): an entry with no `channel` is `main`'s. That
	 * channel's first entry is its head, named from the order's candidates:
	 *
	 * - a character or envoy: "<name> is ready to continue", with Continue;
	 * - `ref: null`, the pipeline's own voice: "<own voice> is ready to
	 *   continue", with Continue — the name the page resolved
	 *   (`turn.ownVoiceName`: the Lair's "Castellan", else the narrator's);
	 * - a person (a persona): "<name>'s turn", or "Your turn" when the
	 *   persona is the viewer's own, and no Continue — a person's turn is
	 *   taken by writing.
	 *
	 * An empty order with people to choose from — a round that is over, or
	 * a manual strategy waiting to be told — waits on a message and offers
	 * the pick. 🚧 A round that waits on others once the viewer has had their
	 * say (`waitingFor`, the page's reading) says so: "Waiting for Maren Holt". An order whose entries are all on other channels shows
	 * nothing here.
	 *
	 * Continue hands its channel to `onContinue`, so the page fires this
	 * channel's entry. "Someone else" asks the page to open the turn picker.
	 * With `mode: 'list'` the entries after the head follow as one quiet line.
	 *
	 * 🚧 **Continue moves past a waiting player** (Lair rewrite D5,
	 * 2026-10-21): a planned turn a person plays (`via: 'plan'`, a seated
	 * player's delver) at the head waits for them — "Waiting for Maren".
	 * The session's owner alone gets Continue there too, with the sentence
	 * that says what it does: it moves past them (the server skips the seat,
	 * `skipWaitingTurn`) and the next planned turn takes its place. Anyone
	 * else waits; the player writes.
	 *
	 * It draws the turn line's right half (`TurnLine`, PLAN-core-widgets
	 * §3.16). Its parts are `messages.turn-line-*` (STYLE-GUIDE §6.16), each
	 * beside its old name `messages.next-up-*`, ⏳ kept one release so a
	 * person's style keeps matching: the markup carries no look; the default
	 * widget stylesheet draws it, keyed on the new names.
	 */
	import type { NextUp } from "./MessagesWidget.svelte"
	import { useConversation } from "./conversation.svelte"

	type Entry = { ref: string | null; channel?: unknown; [k: string]: unknown }
	type Candidate = {
		ref: string
		kind: string
		name: string
		nickname?: string
		ownerUserId?: number
	}

	interface Props {
		order: Entry[]
		candidates: Candidate[]
		mode: NextUp
		shouldShow: boolean
		/** A face for a ref, when the session has one loaded. */
		avatarFor?: (ref: string) => unknown
		/** Continue, with the channel of the log it was pressed under (R5). */
		onContinue: (channel: string) => void
		onSomeoneElse: () => void
		/** Whether anyone else could take the turn. */
		canChooseSomeoneElse?: boolean
		/** The person looking: their own persona's turn reads "Your turn". */
		viewerUserId?: number | null
		/** 🚧 Whom the round waits on (Q3-3): "Waiting for Maren Holt". */
		waitingFor?: readonly string[]
		/** 🚧 The viewer owns the session: their Continue moves past a waiting player (D5). */
		viewerIsOwner?: boolean
	}

	let {
		order,
		candidates,
		mode,
		shouldShow,
		avatarFor,
		onContinue,
		onSomeoneElse,
		canChooseSomeoneElse = true,
		viewerUserId = null,
		waitingFor = [],
		viewerIsOwner = false
	}: Props = $props()
	const waitingWords = $derived(
		waitingFor.length ? `Waiting for ${new Intl.ListFormat("en", { style: "long", type: "conjunction" }).format([...waitingFor])}` : ""
	)

	const conversation = useConversation()
	/** This log's channel — the composer's — `main` by default. */
	const channel = $derived(conversation.lane.current || "main")
	const channelOf = (e: Entry) =>
		typeof e.channel === "string" && e.channel ? e.channel : "main"
	/** The entries prepared on this channel, in the order's order. */
	const here = $derived(order.filter((e) => channelOf(e) === channel))
	const byRef = $derived(new Map(candidates.map((c) => [c.ref, c])))
	const head = $derived(here[0])
	const nameOf = (ref: string | null): string => {
		if (ref === null)
			return conversation.dossier?.turn.ownVoiceName || "The narrator"
		const c = byRef.get(ref)
		return c?.nickname || c?.name || "Someone"
	}
	const isPerson = (ref: string | null) =>
		ref !== null && byRef.get(ref)?.kind === "persona"
	const headName = $derived(head ? nameOf(head.ref) : "")
	const headIsPerson = $derived(!!head && isPerson(head.ref))
	const headIsMine = $derived(
		headIsPerson &&
			viewerUserId != null &&
			byRef.get(head!.ref as string)?.ownerUserId === viewerUserId
	)
	/**
	 * 🚧 The head is a planned turn somebody else plays (a seated player's
	 * delver, D5): the turn waits for them.
	 */
	const headWaits = $derived(headIsPerson && !headIsMine && head?.via === "plan")
	/** 🚧 …and the owner may move past them: Continue skips the seat. */
	const ownerSkips = $derived(headWaits && viewerIsOwner)
	const line = $derived(
		headIsMine
			? "Your turn"
			: headWaits
				? `Waiting for ${headName}`
				: headIsPerson
					? `${headName}'s turn`
					: `${headName} is ready to continue`
	)
	const face = $derived(head?.ref ? avatarFor?.(head.ref) : undefined)
	const after = $derived(mode === "list" ? here.slice(1) : [])
</script>

{#if !here.length && waitingWords}
	<!-- 🚧 The round waits on others, the viewer's say made (Q3-3). -->
	<div data-widget-part="messages.turn-line-waiting messages.next-up-waiting" data-waiting-for="">
		<sp-icon name="hourglass" size="14"></sp-icon>
		<span data-widget-part="messages.turn-line-text messages.next-up-text">{waitingWords}</span>
	</div>
{:else if shouldShow && !order.length && candidates.length}
	<div data-widget-part="messages.turn-line-waiting messages.next-up-waiting">
		<span data-widget-part="messages.turn-line-text messages.next-up-text">
			Waiting for a message — or pick who speaks next
		</span>
		<button type="button" data-widget-part="messages.turn-line-pick messages.next-up-pick" onclick={onSomeoneElse}>
			<sp-icon name="users" size="14"></sp-icon>
			<span>Pick</span>
		</button>
	</div>
{:else if shouldShow && head}
	<!-- One line: who is up, and what you can do about it. -->
	<div data-widget-part="messages.turn-line-head messages.next-up-head">
		<div data-widget-part="messages.turn-line-due messages.next-up-line">
			{#if face}
				<sp-avatar ref={head.ref} size="sm"></sp-avatar>
			{:else if head.ref === null}
				<sp-icon name="book-open-text" size="18" data-widget-part="messages.turn-line-narrator messages.next-up-narrator"></sp-icon>
			{/if}
			<span data-widget-part="messages.turn-line-text messages.next-up-text">
				{line}
			</span>
			<div data-widget-part="messages.turn-line-controls messages.next-up-controls">
				{#if canChooseSomeoneElse}
					<button
						type="button"
						data-widget-part="messages.turn-line-pick messages.next-up-pick"
						onclick={onSomeoneElse}
						title="Someone else"
						aria-label="Pick someone else to continue"
					>
						<sp-icon name="users" size="14"></sp-icon>
						<span data-widget-part="messages.turn-line-pick-label messages.next-up-pick-label">Someone else</span>
					</button>
				{/if}
				{#if !headIsPerson}
					<button
						type="button"
						data-widget-part="messages.turn-line-continue messages.next-up-continue"
						onclick={() => onContinue(channel)}
						title="Continue"
						aria-label="Continue with {headName}"
					>
						<sp-icon name="play"></sp-icon>
						<span>Continue</span>
					</button>
				{:else if ownerSkips}
					<!-- 🚧 D5: the owner's Continue moves past the waiting player. -->
					<button
						type="button"
						data-widget-part="messages.turn-line-continue messages.next-up-continue"
						data-skips=""
						onclick={() => onContinue(channel)}
						title="Move past {headName}: the next turn goes ahead without them"
						aria-label="Continue without {headName}"
					>
						<sp-icon name="skip-forward"></sp-icon>
						<span>Continue</span>
					</button>
				{/if}
			</div>
		</div>
		{#if ownerSkips}
			<p data-widget-part="messages.turn-line-skip">
				Continue moves past {headName}: their turn is skipped this round.
			</p>
		{/if}
		{#if after.length}
			<p data-widget-part="messages.turn-line-after messages.next-up-after">
				Then {after.map((e) => nameOf(e.ref)).join(", ")}
			</p>
		{/if}
	</div>
{/if}
