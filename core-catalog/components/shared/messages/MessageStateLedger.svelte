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
	 * change is the one above them; **Review** opens the same rows for the whole
	 * session, for when they have scrolled away.
	 *
	 * 🚧 `head` (live scenes §15 G13): the conversation's **ledger head**
	 * instead — the clock moves made before the session had a single line
	 * (`state.head`), drawn above the first message. Lines only: nothing
	 * waits on a line that does not exist.
	 */
	import StateProposalList from "./StateProposalList.svelte"
	import { useConversation } from "./conversation.svelte"

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
	let waiting = $derived(head ? [] : (conv.dossier?.state.waiting ?? []))
	let reviewOpen = $state(false)
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
				<span data-widget-part="messages.ledger-owner">{group.ownerLabel}</span>
				{#each group.lines as line, i (line.key)}
					{#if i > 0}<span data-widget-part="messages.ledger-separator">·</span>{/if}
					<span data-widget-part="messages.ledger-change" title="changed by {line.updatedBy}">
						{line.text}
					</span>
				{/each}
			</p>
		{/each}

		{#if pending.length}
			<StateProposalList proposals={pending} />
		{/if}

		{#if waiting.length}
			<!-- `sp-popover` (§3.5): our button is the trigger, the card the panel. -->
			<sp-popover
				placement="bottom-start"
				label="Waiting for you"
				open={reviewOpen}
				onopen-change={(e: CustomEvent<{ open: boolean }>) => (reviewOpen = e.detail.open)}
			>
				<button slot="trigger" type="button" data-widget-part="messages.ledger-review">
					<sp-icon name="clipboard-check" size="11"></sp-icon>
					<span>
						Review
						{waiting.length === 1
							? "1 change"
							: `${waiting.length} changes`}
					</span>
				</button>
						<div data-widget-part="messages.ledger-review-panel">
							<header
								data-widget-part="messages.ledger-review-title"
							>
								<sp-icon name="clipboard-check" size="14"></sp-icon>
								<span>Waiting for you</span>
							</header>
							<p data-widget-part="messages.ledger-review-note">
								The AI asked for these. Nothing changes until
								you accept one.
							</p>
							<StateProposalList proposals={waiting} showAnchor />
						</div>
			</sp-popover>
		{/if}
	</div>
{/if}
