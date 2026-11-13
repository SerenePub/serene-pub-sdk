<script lang="ts">
	/**
	 * The `composer` widget's component (owner R8 2026-11-05, PLAN-session-
	 * layout-simplify D7/D8): the field you write into, the persona you write
	 * as, the actions, the rewind note and the read-only banner — split from
	 * the log. It owns a conversation of its own that follows the Messages
	 * copy it writes for (`followTarget`): same dossier, and the lane that
	 * copy shows. Its settings come off the widget context; the Line width
	 * and presentation it is drawn with are the target's, off the dossier.
	 */
	import { rewindStripState, channelTabsOf } from "@serene-pub/core-catalog/conversation"
	import { useWidgetContext } from "../context"
	import SessionComposer from "../messages/SessionComposer.svelte"
	import { createConversation, setConversation } from "../messages/conversation.svelte"
	import { readComposerSettings } from "./settings"
	import { composerTargetOf } from "./target"

	const ctx = useWidgetContext()
	const conversation = ctx ? setConversation(createConversation(ctx, { followTarget: true })) : null

	const fields = $derived(composerTargetOf(conversation?.dossier))
	const target = $derived(fields.target)
	const writingTo = $derived(fields.writingTo)
	/**
	 * Folio's rule, the target's: its presentation when the host says it, else
	 * what its channel IS (`channelRole`). No target: the primary log's.
	 */
	const folio = $derived(
		!target
			? false
			: target.presentation
				? target.presentation === "folio"
				: !!conversation && conversation.channelRole(target.channel) === "folio"
	)
	const settings = $derived(
		readComposerSettings(ctx?.current.settings.v1 as Record<string, unknown> | undefined, folio)
	)

	/**
	 * The composer this lane is written with: the copy's `composer`, or — on a
	 * tab other than the first — its `otherTabsComposer` when it says one (the
	 * Lair's Sanctum pill).
	 */
	const composerSkin = $derived.by(() => {
		const tabs = channelTabsOf(conversation?.channels)
		return tabs.length > 1 && conversation?.lane.current !== tabs[0] && settings.otherTabsComposer !== "same"
			? settings.otherTabsComposer
			: settings.composerSkin
	})

	/**
	 * 🚧 **Back · Forward** (RF fix 5, owner ruling 2026-10-23): the note while
	 * the session is rewound, where the target shows the story (`main`), with
	 * Forward beside it for the owner. The host says how many turns are ahead
	 * and why a press would be refused (`dossier.rewind`); nothing presses
	 * while a reply is being written. The two presses themselves are the
	 * session header's, which reads the same state through `rewindStripState`.
	 */
	const generating = $derived(
		((conversation?.ctx.messages.v1 ?? []) as Array<{ isGenerating?: boolean }>).some((m) => m.isGenerating)
	)
	const rewind = $derived(
		rewindStripState({
			rewind: conversation?.rewind.state,
			isOwner: !!conversation?.dossier?.isOwner,
			generating,
			story: !target || target.channel === "main" || target.channel.startsWith("main:")
		})
	)
</script>

<!-- The widget's parts (`composer.*`, STYLE-GUIDE §6.16): no look here; the
     default widget stylesheet draws them. ⏳ Each also carries its old
     `messages.*` name, so a style pack written for the old widget keeps
     working. The root is the compose block itself and never fills the panel's
     height: the host measures its content. -->
{#if conversation && !conversation.noLane}
	{@const dossier = conversation.dossier}
	<div
		data-widget-part="composer.root messages.compose composer.compose"
		data-composer-skin={composerSkin}
		data-line-width={target?.lineWidth ?? "full"}
		data-presentation={target?.presentation}
	>
		<div data-widget-part="messages.compose-area composer.compose-area">
			{#if dossier?.readOnly}
				<!-- Read-only (19 §6, ruled): the mode disappeared, the history
				     stays, nothing starts a new turn — and the server refuses
				     independently at every generation choke, so this banner is
				     honesty, not the lock. -->
				<div data-widget-part="messages.read-only composer.read-only" role="status">
					<sp-icon name="lock" size="20" data-widget-part="messages.read-only-icon composer.read-only-icon"></sp-icon>
					<div data-widget-part="messages.read-only-text composer.read-only-text">
						<p data-widget-part="messages.read-only-title composer.read-only-title">This session is read-only.</p>
						<p>
							Its mode ({dossier.readOnly.genreId}) is not installed. Messages are safe to
							read; new turns resume when the mode returns.
						</p>
					</div>
				</div>
			{:else}
				{#if writingTo}
					<!-- The target panel shows a tab that is not a Messages tab: say
					     where a line goes. -->
					<p data-widget-part="composer.writing-to" role="status">
						{conversation.t("Writing to {label}").replace("{label}", writingTo.label)}
					</p>
				{/if}
				{#if rewind.replaceText}
					<!-- 🚧 While rewound (RF fix 5): a new line replaces the turns
					     ahead — said before it is written, with Forward beside it
					     for the owner. -->
					<p data-widget-part="messages.rewind-replace composer.rewind-replace" role="status">
						<sp-icon name="undo-2" size="14" data-widget-part="messages.rewind-replace-icon composer.rewind-replace-icon"></sp-icon>
						<span data-widget-part="messages.rewind-replace-text composer.rewind-replace-text">{rewind.replaceText}</span>
						{#if conversation.dossier?.isOwner}
							<button
								type="button"
								data-widget-part="messages.rewind-replace-forward composer.rewind-replace-forward"
								title={rewind.forward.reason ? `Forward — ${rewind.forward.reason}` : "Forward — bring the next turn back"}
								aria-disabled={rewind.forward.disabled}
								onclick={(e) => (rewind.forward.disabled ? e.preventDefault() : conversation.rewind.forward())}
							>
								<span>Forward</span>
								<sp-icon name="redo-2" size="14"></sp-icon>
							</button>
						{/if}
					</p>
				{/if}
				<SessionComposer {composerSkin} showActions={settings.showActions} />
			{/if}
		</div>
	</div>
{/if}
