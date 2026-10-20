<script lang="ts">
	/**
	 * The transcript ledger: what one message changed, under that message.
	 *
	 * Every line is a real row anchored to this message, which is what makes it
	 * revertible WITH the message: delete or regenerate the reply and the rows it
	 * wrote go too, so the ledger cannot drift from the fiction it describes.
	 * It renders nothing at all for a message that changed nothing, which is
	 * almost every message in almost every session.
	 *
	 * Pending lines are the model's proposals waiting at the gate. They sit here
	 * rather than in a queue somewhere else because the sentence that justifies a
	 * change is the one above them. **Review** — the same rows for the whole
	 * session, for when they have scrolled away — is the turn line's alone
	 * (`TurnLine`), never repeated under each message.
	 *
	 * 🚧 `head` (live scenes §15 G13): the conversation's **ledger head**
	 * instead — the clock moves made before the session had a single line
	 * (`state.head`), drawn above the first message. Lines only: nothing
	 * waits on a line that does not exist.
	 */
	import StateProposalList from "./StateProposalList.svelte"
	import { useConversation } from "./conversation.svelte"
	import { useWidgetContext } from "../context"
	import { ledgerLineTextAs } from "@serene-pub/core-catalog/session-state"

	type Props = { messageId: number; head?: false } | { messageId?: undefined; head: true }
	let { messageId, head = false }: Props = $props()

	// What this line changed and what waits on it: the page's projection of
	// the session state (C0b), read off the conversation.
	const conv = useConversation()
	let groups = $derived(
		head
			? (conv.dossier?.state.head ?? [])
			: (conv.dossier?.state.ledgers[messageId as number] ?? [])
	)
	let pending = $derived(head ? [] : (conv.dossier?.state.pending[messageId as number] ?? []))
	// 🚧 The copy's `timeFormat`: a story-time line (a clock move, a clock
	// stat) spelled the copy's way from the parts the host sent beside its
	// words (`storyTime`); empty, the host's words as they came.
	const widget = useWidgetContext()
	let timeFormat = $derived(
		(widget?.current.settings.v1 as Record<string, unknown> | undefined)?.timeFormat as string | undefined
	)
	/**
	 * 🚧 Who changed it, in words (PLAN-dc-after-walk3 R3-5, the walk's
	 * polish: a change line's name read "changed by run:<uuid>"): a person's
	 * hand, or a run — never its id.
	 */
	const changedBy = (updatedBy: string): string =>
		updatedBy === "user" ? "Changed by hand" : updatedBy.startsWith("run:") ? "Changed automatically" : "Changed"
</script>

<!-- The ledger's parts (`messages.ledger*`, `messages.proposal*`; STYLE-GUIDE
     §6.16): no look here; the default widget stylesheet draws them. -->
{#if groups.length || pending.length}
	<div
		data-widget-part="messages.ledger"
		data-ledger-message={head ? undefined : messageId}
		data-ledger-head={head ? "" : undefined}
	>
		{#each groups as group (group.ownerKey)}
			<p data-widget-part="messages.ledger-line" data-owner-key={group.ownerKey}>
				<!-- 🚧 The world's lines carry no name (Q3-2): "Time Day 1, 08:00 → 08:05". -->
				{#if group.ownerLabel}<span data-widget-part="messages.ledger-owner">{group.ownerLabel}</span>{/if}
				{#each group.lines as line, i (line.key)}
					{#if i > 0}<span data-widget-part="messages.ledger-separator">·</span>{/if}
					<span data-widget-part="messages.ledger-change" title={changedBy(line.updatedBy)}>
						{ledgerLineTextAs(line, timeFormat)}
					</span>
				{/each}
			</p>
		{/each}

		{#if pending.length}
			<StateProposalList proposals={pending} />
		{/if}

		<!-- 🚧 No session-wide Review here (DC walk 6: "Review 1 change" drawn
		     once per ledger AND on the turn line — three buttons for one
		     proposal). The turn line is the one place it lives; this
		     message's own proposals are the list above. -->
	</div>
{/if}
