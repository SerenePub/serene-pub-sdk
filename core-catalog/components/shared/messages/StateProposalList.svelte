<script lang="ts">
	/**
	 * Held changes, with the two buttons that decide them.
	 *
	 * The model is the one writer with no authority: what it produces is a
	 * pending line, not a change. So nothing here applies anything — Accept runs
	 * the same write a script's would have run, Reject leaves the world as it
	 * was, and until one of them is pressed the stat says what it said.
	 *
	 * The same list under a message and in the Review panel, because "everything
	 * waiting" and "what this turn asked for" are the same rows read at two
	 * scopes, and two components would be two ways to describe one payload.
	 *
	 * A **superseded** row (plans/29 R-15 *Staleness and order*; U5f) is an
	 * accept that applied nothing: the slot moved since the proposal was
	 * made. It stays under its message, collapsed, naming what moved, with
	 * no buttons — the ledger's word on why the model's ask never landed.
	 */
	import type { ConversationProposalV1 } from "@serene-pub/core-catalog/conversation"
	import { useConversation, useT } from "./conversation.svelte"

	interface Props {
		proposals: ConversationProposalV1[]
		/** Shown in the Review panel, where a row is not under its message. */
		showAnchor?: boolean
	}
	let { proposals, showAnchor = false }: Props = $props()

	const conv = useConversation()
	const t = useT()
	const describe = (row: ConversationProposalV1) => row.text
	const movedName = (row: ConversationProposalV1) => row.moved ?? t("a value")
	const decide = (id: number, accept: boolean) =>
		void conv.request("decide-proposal", { proposalId: id, accept })
</script>

{#each proposals as row (row.id)}
	{#if row.status === "superseded"}
		<div
			data-widget-part="messages.proposal"
			data-proposal-id={row.id}
			data-superseded="true"
		>
			<sp-icon name="history" size="11"></sp-icon>
			<span data-widget-part="messages.proposal-text">
				{describe(row)}
				<span data-widget-part="messages.proposal-note">
					· {t("Superseded — {slot} changed since this was proposed").replace(
						"{slot}",
						movedName(row)
					)}
				</span>
			</span>
		</div>
	{:else}
		<div data-widget-part="messages.proposal" data-proposal-id={row.id}>
			<sp-icon name="sparkles" size="11"></sp-icon>
			<span data-widget-part="messages.proposal-text">
				{describe(row)}
				{#if showAnchor && row.messageId != null}
					<span data-widget-part="messages.proposal-anchor">on message {row.messageId}</span>
				{/if}
			</span>
			<span data-widget-part="messages.proposal-note" title="Proposed by {row.proposedBy || 'a run'}">
				proposed
			</span>
			<button
				data-widget-part="messages.proposal-decide messages.proposal-accept"
				onclick={() => decide(row.id, true)}
			>
				Accept
			</button>
			<button
				data-widget-part="messages.proposal-decide messages.proposal-reject"
				onclick={() => decide(row.id, false)}
			>
				Reject
			</button>
		</div>
	{/if}
{/each}
