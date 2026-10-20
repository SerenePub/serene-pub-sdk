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
	 *
	 * 🚧 A player's **offer** (Give to…, ★4; PLAN-dc-after-walk3 R1-2) is no
	 * model's ask: offered to the viewer it reads *offered* with Accept and
	 * Decline; the viewer's OWN offer reads *Offered to Maren Holt — waiting
	 * for their answer* with Withdraw alone — the giver never accepts their
	 * own gift (the host refuses it, and the walk's giver met that refusal).
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
	{:else if row.offer?.yours}
		<div data-widget-part="messages.proposal" data-proposal-id={row.id} data-offer="yours">
			<sp-icon name="hourglass" size="11"></sp-icon>
			<span data-widget-part="messages.proposal-text">
				{t("Offered to {to} — waiting for their answer").replace("{to}", row.offer.to)}
				<span data-widget-part="messages.proposal-note">· {describe(row)}</span>
			</span>
			<button
				data-widget-part="messages.proposal-decide messages.proposal-reject"
				onclick={() => decide(row.id, false)}
			>
				{t("Withdraw")}
			</button>
		</div>
	{:else if row.offer}
		<div data-widget-part="messages.proposal" data-proposal-id={row.id} data-offer="to-you">
			<sp-icon name="hand-helping" size="11"></sp-icon>
			<span data-widget-part="messages.proposal-text">
				{describe(row)}
				{#if showAnchor && row.messageId != null}
					<span data-widget-part="messages.proposal-anchor">on message {row.messageId}</span>
				{/if}
			</span>
			<span data-widget-part="messages.proposal-note" title={t("Offered by {from}").replace("{from}", row.offer.from)}>
				{t("offered")}
			</span>
			<button
				data-widget-part="messages.proposal-decide messages.proposal-accept"
				onclick={() => decide(row.id, true)}
			>
				{t("Accept")}
			</button>
			<button
				data-widget-part="messages.proposal-decide messages.proposal-reject"
				onclick={() => decide(row.id, false)}
			>
				{t("Decline")}
			</button>
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
