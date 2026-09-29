<script lang="ts" module>
	import type { MessageOrder } from "@serene-pub/core-catalog/conversation"

	/** How the composer's field is drawn. */
	export type ComposerSkin = "classic" | "minimal" | "writer"

	/** Which end of the widget the composer sits at. */
	export type ComposerPosition = "bottom" | "top"

	/**
	 * Who is due next (PLAN-turn-order §4.9): the order's head with Continue,
	 * the head and who follows it, or nothing.
	 */
	export type NextUp = "head" | "list" | "hidden"

	/**
	 * How wide the log's rows and the composer run: the whole width the layout
	 * gives the widget (`full`, the default), or a reading measure centred in
	 * it (`comfortable`, about 640px of prose). Never a hidden cap: the widget
	 * fills its box unless its settings say otherwise.
	 */
	export type LineWidth = "full" | "comfortable"

	/**
	 * The `messages` widget's settings, complete: every value the widget reads,
	 * with the declared default wherever the instance has no deviation. The
	 * page receives this object too (as the snippet parameter and through
	 * `onSettings`), so the log, the composer and the page's scroll handling
	 * all answer to one reading of the settings.
	 */
	export interface ConversationSettings {
		order: MessageOrder
		composerSkin: ComposerSkin
		composerPosition: ComposerPosition
		lineWidth: LineWidth
		showMessages: boolean
		showComposer: boolean
		showAvatars: boolean
		showTimestamps: boolean
		showSceneMarkers: boolean
		nextUp: NextUp
		showActions: boolean
		/**
		 * The one channel this copy shows (lair re-plan S1), or `null` for the
		 * primary log. The host narrows the rows and the composer's channels
		 * by it; the widget draws its head from it.
		 */
		channel: string | null
	}

	/**
	 * The declared defaults (`CORE_WIDGETS`, the `messages` entry), restated as
	 * the fallback for a mount with no `WidgetHost` above it — a standalone
	 * render, a test — where there is no `settings.v1` to read.
	 */
	export const CONVERSATION_DEFAULTS: ConversationSettings = {
		order: "oldest-first",
		composerSkin: "classic",
		composerPosition: "bottom",
		lineWidth: "full",
		showMessages: true,
		showComposer: true,
		showAvatars: true,
		showTimestamps: true,
		showSceneMarkers: true,
		nextUp: "head",
		showActions: true,
		channel: null
	}

	function pickEnum<T extends string>(
		raw: unknown,
		of: readonly T[],
		fallback: T
	): T {
		return typeof raw === "string" &&
			(of as readonly string[]).includes(raw)
			? (raw as T)
			: fallback
	}

	function pickBool(raw: unknown, fallback: boolean): boolean {
		return typeof raw === "boolean" ? raw : fallback
	}

	/** Read one settings payload into the complete object above. */
	export function readConversationSettings(
		raw: Record<string, unknown> | undefined
	): ConversationSettings {
		const v = raw ?? {}
		const d = CONVERSATION_DEFAULTS
		return {
			order: pickEnum(v.order, ["oldest-first", "newest-first"], d.order),
			composerSkin: pickEnum(
				v.composer,
				["classic", "minimal", "writer"],
				d.composerSkin
			),
			composerPosition: pickEnum(
				v.composerPosition,
				["bottom", "top"],
				d.composerPosition
			),
			lineWidth: pickEnum(v.lineWidth, ["full", "comfortable"], d.lineWidth),
			showMessages: pickBool(v.showMessages, d.showMessages),
			showComposer: pickBool(v.showComposer, d.showComposer),
			showAvatars: pickBool(v.showAvatars, d.showAvatars),
			showTimestamps: pickBool(v.showTimestamps, d.showTimestamps),
			showSceneMarkers: pickBool(v.showSceneMarkers, d.showSceneMarkers),
			// ⏳ `showNudge: false` was this setting before `nextUp` (A8).
			nextUp: pickEnum(
				v.nextUp,
				["head", "list", "hidden"],
				v.showNudge === false ? "hidden" : d.nextUp
			),
			showActions: pickBool(v.showActions, d.showActions),
			channel:
				typeof v.channel === "string" && v.channel.trim()
					? v.channel.trim()
					: d.channel
		}
	}
</script>

<script lang="ts">
	/**
	 * The `messages` widget's component: the log you read and the
	 * field you write into, as ONE widget.
	 *
	 * It owns the conversation (C0b): the model its parts read
	 * (`conversation.svelte.ts`) and the log. The page still passes the
	 * composer, the ready-to-continue line and the banners as snippets; this
	 * component reads the widget's settings off `useWidgetContext()`, hands
	 * them back to those snippets, writes them onto the root as data
	 * attributes, and decides which end the composer sits at.
	 */
	import { useWidgetContext } from "../shared/context"
	import SessionContainer from "./SessionContainer.svelte"
	import SessionComposer from "./SessionComposer.svelte"
	import NextCharacterBlock from "./NextCharacterBlock.svelte"
	import { createConversation, setConversation } from "./conversation.svelte"

	interface Props {
		/**
		 * Called with the effective settings whenever they change, for the
		 * page's imperative half — the scroll handling, which runs outside the
		 * render and cannot read a snippet parameter.
		 */
		onSettings?: (settings: ConversationSettings) => void
	}

	let { onSettings }: Props = $props()

	const ctx = useWidgetContext()
	// The conversation's own model (C0b): the log and its lines read it, and
	// act through its verbs. Absent a host there is nothing to converse with.
	const conversation = ctx ? setConversation(createConversation(ctx)) : null

	// A host view asked for a selection (the workflow tab): start one.
	let askedToSelect: number | null = null
	$effect(() => {
		const n = conversation?.dossier?.selectForSummary ?? 0
		if (askedToSelect !== null && n !== askedToSelect) conversation?.select.start()
		askedToSelect = n
	})
	const selecting = $derived(!!conversation?.select.active)
	const selectedCount = $derived(conversation?.select.ids.size ?? 0)
	/** Every line a scene has not already captured. */
	const selectable = $derived.by(() => {
		const taken = new Set(conversation?.dossier?.scened ?? [])
		return ((conversation?.rows ?? []) as Array<{ id: number }>)
			.map((m) => m.id)
			.filter((id) => !taken.has(id))
	})
	let settings = $derived(
		readConversationSettings(
			ctx?.current.settings.v1 as Record<string, unknown> | undefined
		)
	)

	/**
	 * A backdrop image is the user's, not the session's: when one is painted
	 * behind the shell, the conversation gets a glass panel so the text keeps
	 * its contrast against whatever the picture is doing underneath.
	 */
	let hasBackdrop = $derived(!!conversation?.dossier?.backdrop)

	// Compared by value, the way `WidgetHost` compares its layout: the widget
	// context re-projects on every message that lands, and the settings on it
	// are the same object nearly every time.
	let lastSettingsKey: string | null = null
	$effect(() => {
		const next = settings
		const key = JSON.stringify(next)
		if (key === lastSettingsKey) return
		lastSettingsKey = key
		onSettings?.(next)
	})
</script>

<!-- The widget's parts (`messages.*`, STYLE-GUIDE §6.16): no look here; the
     default widget stylesheet draws them, and a pack or a person's style
     restyles them. -->
<div
	data-widget-part="messages.root"
	data-order={settings.order}
	data-composer-position={settings.composerPosition}
	data-composer-skin={settings.composerSkin}
	data-line-width={settings.lineWidth}
	data-show-messages={settings.showMessages}
	data-show-avatars={settings.showAvatars}
	data-show-timestamps={settings.showTimestamps}
	data-show-scene-markers={settings.showSceneMarkers}
	data-backdrop={hasBackdrop ? "" : undefined}
	data-channel={settings.channel ?? undefined}
>
	{#if settings.channel && conversation}
		<!-- A copy pinned to one channel names it (S1): the channel's declared
		     label, the Lair's _Sanctum_. The primary log has no head — the
		     session's own header names it. -->
		<header data-widget-part="messages.channel-head">
			<sp-icon name="messages-square" size="16" data-widget-part="messages.channel-icon"></sp-icon>
			<h2 data-widget-part="messages.channel-title">{conversation.channelName(settings.channel)}</h2>
		</header>
	{/if}
	<!-- The whole panel scrolls: the log spans the widget's width, so its
	     scrollbar sits at the panel's edge and the wheel works anywhere in it;
	     the rows (the stage, `messages.stage`) and the composer take the
	     widget's full width, or a centred reading measure when the Line width
	     setting says Comfortable. DOM order is log then composer whichever end the
	     composer is drawn at: the reading order a screen reader and the tab
	     sequence follow is the conversation's, and `order` moves the box on
	     screen. -->
	{#if settings.showMessages}
		<div data-widget-part="messages.log">
			{#if conversation}
				<SessionContainer order={settings.order} showSceneMarkers={settings.showSceneMarkers} />
			{/if}
		</div>
	{/if}
	{#if selecting && conversation}
		<!-- Selecting lines for a summary: the composer steps aside for the
		     selection's own bar, and committing hands it to the host. -->
		<!-- The compose block (`messages.compose`, on the reading column) and the
		     composer's area (`messages.compose-area`), where the selection bar
		     stands in the composer's place. -->
		<div data-widget-part="messages.compose">
			<div data-widget-part="messages.compose-area">
				<!-- The selection bar's parts are `messages.selection-*` (STYLE-GUIDE
				     §6.16): no look here; the default widget stylesheet draws them. -->
				<div data-widget-part="messages.selection-bar toolbar">
					<span data-widget-part="messages.selection-count">
						{selectedCount}
						{selectedCount === 1 ? "message" : "messages"} selected
					</span>
					<div data-widget-part="messages.selection-bulk">
						<button
							data-widget-part="messages.select-all messages.selection-button"
							title="Select all"
							onclick={() => conversation.select.set(selectable)}
						>
							<sp-icon name="check-square" size="16"></sp-icon>
							<span data-widget-part="messages.selection-button-label">Select all</span>
						</button>
						<button
							data-widget-part="messages.select-none messages.selection-button"
							title="Select none"
							onclick={() => conversation.select.set([])}
						>
							<sp-icon name="square" size="16"></sp-icon>
							<span data-widget-part="messages.selection-button-label">Select none</span>
						</button>
					</div>
					<div data-widget-part="messages.selection-finish">
						<button
							data-widget-part="messages.selection-cancel messages.selection-button"
							title="Cancel"
							onclick={() => conversation.select.stop()}
						>
							<sp-icon name="x" size="16"></sp-icon>
							<span data-widget-part="messages.selection-button-label">Cancel</span>
						</button>
						<!-- A scene summary opens a scene, which is its own declared
						     write (R-B): a genre that opens none does not offer it. -->
						{#if conversation.dossier?.writes.scenes}
							<button
								data-widget-part="messages.summarize-scene messages.selection-button"
								title="Scene"
								disabled={selectedCount === 0}
								onclick={() => conversation.select.commit("scene")}
							>
								<sp-icon name="film" size="16"></sp-icon>
								<span data-widget-part="messages.selection-button-label">Scene</span>
							</button>
						{/if}
						<button
							data-widget-part="messages.summarize-world messages.selection-button"
							title="World lore"
							disabled={selectedCount === 0}
							onclick={() => conversation.select.commit("world")}
						>
							<sp-icon name="globe" size="16"></sp-icon>
							<span data-widget-part="messages.selection-button-label">World lore</span>
						</button>
						<button
							data-widget-part="messages.summarize-character messages.selection-button"
							title="Character lore"
							disabled={selectedCount === 0}
							onclick={() => conversation.select.commit("character")}
						>
							<sp-icon name="user" size="16"></sp-icon>
							<span data-widget-part="messages.selection-button-label">Character lore</span>
						</button>
					</div>
				</div>
			</div>
		</div>
	{:else if settings.showComposer && conversation}
		{@const dossier = conversation.dossier}
		<div data-widget-part="messages.compose">
			<!-- The page's status strips (who is typing, a stale preset). -->
			<sp-host-view name="session-banners"></sp-host-view>
			{#if settings.nextUp !== "hidden" && dossier && !dossier.readOnly}
				<div data-widget-part="messages.next-up">
					<NextCharacterBlock
						order={dossier.turn.order}
						candidates={dossier.turn.candidates}
						mode={settings.nextUp}
						shouldShow={dossier.turn.show && conversation.edit.id === null}
						avatarFor={(ref) => (ref.startsWith("character:") ? ref : undefined)}
						canChooseSomeoneElse={dossier.turn.canChoose}
						viewerUserId={conversation.ctx.viewer.v1.userId}
						onContinue={(channel) => void conversation.request("fire-turn", { channel })}
						onSomeoneElse={() => void conversation.request("pick-turn", {})}
					/>
				</div>
			{/if}
			<div data-widget-part="messages.compose-area">
				{#if dossier?.readOnly}
					<!-- Read-only (19 §6, ruled): the mode disappeared, the history
					     stays, nothing starts a new turn — and the server refuses
					     independently at every generation choke, so this banner is
					     honesty, not the lock. -->
					<div data-widget-part="messages.read-only" role="status">
						<sp-icon name="lock" size="20" data-widget-part="messages.read-only-icon"></sp-icon>
						<div data-widget-part="messages.read-only-text">
							<p data-widget-part="messages.read-only-title">This session is read-only.</p>
							<p>
								Its mode ({dossier.readOnly.genreId}) is not installed. Messages are safe to
								read; new turns resume when the mode returns.
							</p>
						</div>
					</div>
				{:else}
					<SessionComposer composerSkin={settings.composerSkin} showActions={settings.showActions} />
				{/if}
			</div>
		</div>
	{/if}
</div>
