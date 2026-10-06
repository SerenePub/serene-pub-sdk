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
	 * the pick. An order whose entries are all on other channels shows
	 * nothing here.
	 *
	 * Continue hands its channel to `onContinue`, so the page fires this
	 * channel's entry. "Someone else" asks the page to open the turn picker.
	 * With `mode: 'list'` the entries after the head follow as one quiet line.
	 *
	 * Its parts are `messages.next-up-*` (STYLE-GUIDE §6.16): the markup
	 * carries no look; the default widget stylesheet draws it.
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
		viewerUserId = null
	}: Props = $props()

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
	const line = $derived(
		headIsMine
			? "Your turn"
			: headIsPerson
				? `${headName}'s turn`
				: `${headName} is ready to continue`
	)
	const face = $derived(head?.ref ? avatarFor?.(head.ref) : undefined)
	const after = $derived(mode === "list" ? here.slice(1) : [])
</script>

{#if shouldShow && !order.length && candidates.length}
	<div data-widget-part="messages.next-up-waiting">
		<span data-widget-part="messages.next-up-text">
			Waiting for a message — or pick who speaks next
		</span>
		<button type="button" data-widget-part="messages.next-up-pick" onclick={onSomeoneElse}>
			<sp-icon name="users" size="14"></sp-icon>
			<span>Pick</span>
		</button>
	</div>
{:else if shouldShow && head}
	<!-- One line: who is up, and what you can do about it. -->
	<div data-widget-part="messages.next-up-head">
		<div data-widget-part="messages.next-up-line">
			{#if face}
				<sp-avatar ref={head.ref} size="sm"></sp-avatar>
			{:else if head.ref === null}
				<sp-icon name="book-open-text" size="18" data-widget-part="messages.next-up-narrator"></sp-icon>
			{/if}
			<span data-widget-part="messages.next-up-text">
				{line}
			</span>
			<div data-widget-part="messages.next-up-controls">
				{#if canChooseSomeoneElse}
					<button
						type="button"
						data-widget-part="messages.next-up-pick"
						onclick={onSomeoneElse}
						title="Someone else"
						aria-label="Pick someone else to continue"
					>
						<sp-icon name="users" size="14"></sp-icon>
						<span data-widget-part="messages.next-up-pick-label">Someone else</span>
					</button>
				{/if}
				{#if !headIsPerson}
					<button
						type="button"
						data-widget-part="messages.next-up-continue"
						onclick={() => onContinue(channel)}
						title="Continue"
						aria-label="Continue with {headName}"
					>
						<sp-icon name="play"></sp-icon>
						<span>Continue</span>
					</button>
				{/if}
			</div>
		</div>
		{#if after.length}
			<p data-widget-part="messages.next-up-after">
				Then {after.map((e) => nameOf(e.ref)).join(", ")}
			</p>
		{/if}
	</div>
{/if}
