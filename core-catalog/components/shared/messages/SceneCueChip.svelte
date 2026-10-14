<script lang="ts">
	import { useConversation } from "./conversation.svelte"

	/**
	 * 🚧 A **scene cue**'s chip (PROPOSAL-live-scenes §4, §7; lane E):
	 * Suggested scene mode's quiet *New scene?* in the scene divider's slot,
	 * before the line the next scene would open at, saying why (the
	 * triggers that fired there, in words). **Yes** opens a scene at the line
	 * (the lane's open scene closes at the line before); **Not here** sets
	 * every cue at the line aside, never offered there again. Drawn only where
	 * the viewer may place a boundary (the dossier's `sceneBoundaries`); a
	 * refusal is said here, under the chip.
	 */
	interface Props {
		cue: { id: number; reason: string }
		/** Drawn hidden: its line is on another lane than the log shows. */
		hidden?: boolean
	}

	let { cue, hidden = false }: Props = $props()

	const conv = useConversation()
	const refusal = $derived(
		conv.scenes.refusal?.at === "cue" && conv.scenes.refusal.id === cue.id
			? conv.scenes.refusal.text
			: null
	)
	const decide = (accept: boolean) => (e: Event) => {
		if (conv.scenes.busy) return e.preventDefault()
		void conv.scenes.decideCue(cue.id, accept)
	}
</script>

<!-- A `messages.log-item` in the divider's slot: the chip's parts are
     `messages.scene-cue*` (STYLE-GUIDE §6.16), drawn by the default sheet. -->
<li
	data-widget-part="messages.log-item messages.scene-cue"
	role="presentation"
	data-cue={cue.id}
	{hidden}
>
	<div data-widget-part="messages.scene-cue-body" role="group" aria-label="New scene?">
		<sp-icon name="flag" size="14" data-widget-part="messages.scene-cue-icon"></sp-icon>
		<span data-widget-part="messages.scene-cue-text">
			New scene?
			{#if cue.reason}
				<span data-widget-part="messages.scene-cue-reason">— {cue.reason}</span>
			{/if}
		</span>
		<button
			type="button"
			data-widget-part="messages.scene-cue-accept"
			title="Start a new scene at this line"
			aria-disabled={conv.scenes.busy}
			onclick={decide(true)}
		>
			Yes
		</button>
		<button
			type="button"
			data-widget-part="messages.scene-cue-decline"
			title="No new scene at this line; it is not suggested here again"
			aria-disabled={conv.scenes.busy}
			onclick={decide(false)}
		>
			Not here
		</button>
	</div>
	{#if refusal}
		<p data-widget-part="messages.scene-refusal" role="alert">
			<span data-widget-part="messages.scene-refusal-text">{refusal}</span>
			<button
				type="button"
				data-widget-part="messages.scene-refusal-dismiss messages.message-icon-button"
				aria-label="Dismiss"
				onclick={() => conv.scenes.dismiss()}
			>
				<sp-icon name="x" size="14"></sp-icon>
			</button>
		</p>
	{/if}
</li>
