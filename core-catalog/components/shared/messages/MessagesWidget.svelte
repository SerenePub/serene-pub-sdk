<script lang="ts" module>
	import type { MessageOrder } from "@serene-pub/core-catalog/conversation"

	/** How the composer's field is drawn. */
	export type ComposerSkin = "classic" | "minimal" | "writer" | "quill"

	/** Which end of the widget the composer sits at. */
	export type ComposerPosition = "bottom" | "top"

	/**
	 * Who is due next (PLAN-turn-order §4.9): the order's head with Continue,
	 * the head and who follows it, or nothing.
	 */
	export type NextUp = "head" | "list" | "hidden"

	/**
	 * How wide the log's rows and the composer run: a reading column of about
	 * 76 characters of the story's body text centred in the box (`column`,
	 * the default since ★R1, 2026-10-24), the whole width the layout gives
	 * the widget (`full`), or the narrower measure (`comfortable`, about
	 * 640px of prose). Never a hidden cap: a setting a person sees and changes.
	 */
	export type LineWidth = "column" | "full" | "comfortable"

	/**
	 * How the lines are drawn (PLAN-core-widgets §3.7): `rows`, the log as
	 * it has always been, or `folio` — one block of prose, a thin rule
	 * naming the speaker where the speaker changes, nothing else around a
	 * line. The SETTING also takes `auto` (§3.16, the declared default:
	 * _Follow the channel_), which the reader turns into one of the two.
	 */
	export type Presentation = "rows" | "folio"

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
		/**
		 * 🚧 The composer while a tab other than the first is shown
		 * (`otherTabsComposer`, lair fix 2), or `same` — `composerSkin`.
		 */
		otherTabsComposer: ComposerSkin | "same"
		composerPosition: ComposerPosition
		lineWidth: LineWidth
		/**
		 * The effective presentation: a stored `rows` or `folio`, else —
		 * `auto`, or nothing stored — `folio` when this copy's claimed
		 * channel is a folio-role one, else `rows`.
		 */
		presentation: Presentation
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
		/**
		 * 🚧 What an empty log says (the copy's `emptyState`), or `null` for
		 * the widget's own "Send a message to start".
		 */
		emptyState: string | null
		/**
		 * 🚧 How the change lines spell a story time (`formatStoryTimeAs`
		 * tokens), or `null` for the host's spelling through the calendar.
		 */
		timeFormat: string | null
	}

	/**
	 * The declared defaults (`CORE_WIDGETS`, the `messages` entry), restated as
	 * the fallback for a mount with no `WidgetHost` above it — a standalone
	 * render, a test — where there is no `settings.v1` to read.
	 */
	export const CONVERSATION_DEFAULTS: ConversationSettings = {
		order: "oldest-first",
		composerSkin: "classic",
		otherTabsComposer: "same",
		composerPosition: "bottom",
		lineWidth: "column",
		presentation: "rows",
		showMessages: true,
		showComposer: true,
		showAvatars: true,
		showTimestamps: true,
		showSceneMarkers: true,
		nextUp: "head",
		showActions: true,
		channel: null,
		emptyState: null,
		timeFormat: null
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

	/**
	 * Read one settings payload into the complete object above.
	 *
	 * `channelRole` is what the copy's claimed channel IS (`ChannelDecl.role`,
	 * off the dossier), and it decides the two values Folio changes when the
	 * settings leave them to it: a `presentation` of `auto` (the declared
	 * default, _Follow the channel_), or none, follows the channel (a folio
	 * channel reads as Folio), and a Folio copy's composer is the
	 * page line (`quill`) unless the copy chose a skin other than the declared
	 * default. Settings arrive complete, so `classic` — the default — is the
	 * one value that cannot say "chosen"; a Folio copy that wants the card
	 * back cannot have it, which is the price of a manuscript's page line.
	 */
	export function readConversationSettings(
		raw: Record<string, unknown> | undefined,
		channelRole: "conversation" | "folio" = "conversation"
	): ConversationSettings {
		const v = raw ?? {}
		const d = CONVERSATION_DEFAULTS
		// `auto` is neither of the two, so it falls to the channel's rule.
		const presentation = pickEnum<Presentation>(
			v.presentation,
			["rows", "folio"],
			channelRole === "folio" ? "folio" : d.presentation
		)
		const folio = presentation === "folio"
		const skin = pickEnum(
			v.composer,
			["classic", "minimal", "writer", "quill"],
			d.composerSkin
		)
		return {
			order: pickEnum(v.order, ["oldest-first", "newest-first"], d.order),
			composerSkin: folio && skin === d.composerSkin ? "quill" : skin,
			otherTabsComposer: pickEnum(
				v.otherTabsComposer,
				["same", "classic", "minimal", "writer", "quill"],
				d.otherTabsComposer
			),
			composerPosition: pickEnum(
				v.composerPosition,
				["bottom", "top"],
				d.composerPosition
			),
			lineWidth: pickEnum(v.lineWidth, ["column", "full", "comfortable"], d.lineWidth),
			presentation,
			showMessages: pickBool(v.showMessages, d.showMessages),
			showComposer: pickBool(v.showComposer, d.showComposer),
			showAvatars: pickBool(v.showAvatars, d.showAvatars),
			showTimestamps: pickBool(v.showTimestamps, d.showTimestamps),
			// A manuscript has no scenes or dates between its paragraphs.
			showSceneMarkers:
				!folio && pickBool(v.showSceneMarkers, d.showSceneMarkers),
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
					: d.channel,
			emptyState:
				typeof v.emptyState === "string" && v.emptyState.trim()
					? v.emptyState.trim()
					: d.emptyState,
			timeFormat:
				typeof v.timeFormat === "string" && v.timeFormat.trim()
					? v.timeFormat
					: d.timeFormat
		}
	}
</script>

<script lang="ts">
	/**
	 * The `messages` widget's component: the log you read and the
	 * field you write into, as ONE widget.
	 *
	 * It owns the conversation (C0b): the model its parts read
	 * (`conversation.svelte.ts`), the log, the turn line (`TurnLine`) and the
	 * composer; the page's own views (who is typing, the action chips) it
	 * places as `sp-host-view`s. It reads the widget's settings off
	 * `useWidgetContext()`, hands them to the page (`onSettings`), writes them
	 * onto the root as data attributes, and decides which end the composer
	 * sits at.
	 */
	import { untrack } from "svelte"
	import { SvelteMap } from "svelte/reactivity"
	import { channelTabDots, channelTabsOf, newestNewsOn, rewindStripState } from "@serene-pub/core-catalog/conversation"
	import { useWidgetContext } from "../context"
	import SessionContainer from "./SessionContainer.svelte"
	import SessionComposer from "./SessionComposer.svelte"
	import TurnLine from "./TurnLine.svelte"
	import { createConversation, setConversation } from "./conversation.svelte"
	import { markedRun, runOffer } from "./sceneMarks"

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
	/**
	 * 🚧 *Mark as scene* (PROPOSAL-live-scenes §14 C): the selection's
	 * boundary path, offered first — the picked run becomes one closed live
	 * scene, opened at its first line and closed at its last, in one write.
	 * Offered only where the viewer may place scene boundaries and the run
	 * overlaps no scene on its lane (`runOffer`, lane E — an earlier run
	 * too); tick capture (*Scene summary*) stays beside it for now.
	 */
	const markRun = $derived.by(() => {
		if (!conversation?.scenes.boundaries || !selectedCount) return null
		const rows = (conversation.rows ?? []) as Array<{ id: number; channel?: unknown }>
		const run = markedRun(conversation.select.ids, rows)
		return run && runOffer(run, conversation.dossier?.scenes ?? [], rows) ? run : null
	})
	const selectionRefusal = $derived(
		conversation?.scenes.refusal?.at === "selection" ? conversation.scenes.refusal.text : null
	)
	/** Every line a scene has not already captured. */
	const selectable = $derived.by(() => {
		const taken = new Set(conversation?.dossier?.scened ?? [])
		return ((conversation?.rows ?? []) as Array<{ id: number }>)
			.map((m) => m.id)
			.filter((id) => !taken.has(id))
	})
	let settings = $derived.by(() => {
		const raw = ctx?.current.settings.v1 as Record<string, unknown> | undefined
		// The claimed channel's role, when the host says it (the dossier's
		// `composer.channelRoles`): what an unset Presentation follows.
		const claim = typeof raw?.channel === "string" ? raw.channel.trim() : ""
		return readConversationSettings(
			raw,
			claim && conversation ? conversation.channelRole(claim) : "conversation"
		)
	})

	/**
	 * 🚧 **Channel tabs** (lair fix 2, 2026-10-22): a copy showing two or
	 * more channels — the Lair's story with its Sanctum, for the GM — draws a
	 * tab each above the log (`channelTabsOf`), in place of the composer's
	 * old channel switch. The active tab is the conversation's lane: the log
	 * shows its rows and the composer writes there. A guest is never told the
	 * Sanctum (an owner-only channel), so their story has no tabs. The tabs
	 * are the host's (`sp-tabs`): the page draws the tablist, its roving
	 * focus and its arrow keys (STYLE-GUIDE §10), and raises `change`.
	 */
	// Never on a copy pinned to a channel: its claim is one channel, its head names it.
	const tabs = $derived(conversation && !settings.channel ? channelTabsOf(conversation.channels) : [])
	const activeTab = $derived(conversation?.lane.current ?? "main")
	const viewerId = $derived.by((): number | null => {
		const id = (ctx?.current.viewer?.v1 as { userId?: unknown } | undefined)?.userId
		return typeof id === "number" ? id : null
	})
	/**
	 * What each tab was last shown with (its newest line by somebody else):
	 * the shown tab's mark follows its channel, a tab never seen starts with
	 * its history read. Written by the effect below, never read tracked there.
	 */
	const seen = new SvelteMap<string, number>()
	$effect(() => {
		const rows = (conversation?.rows ?? []) as Parameters<typeof newestNewsOn>[0]
		for (const tab of tabs) {
			const newest = newestNewsOn(rows, tab, viewerId)
			const active = tab === activeTab
			untrack(() => {
				if ((active || !seen.has(tab)) && seen.get(tab) !== newest) seen.set(tab, newest)
			})
		}
	})
	/** The tabs with a line nobody has shown the viewer yet. */
	const dots = $derived(
		channelTabDots(tabs, activeTab, (conversation?.rows ?? []) as Parameters<typeof newestNewsOn>[0], viewerId, seen)
	)
	/** A tab's name, said with its news to a screen reader (the trigger's own label). */
	const tabLabel = (slug: string) =>
		`${conversation?.channelName(slug) ?? slug}${dots.has(slug) ? " (new lines)" : ""}`
	/**
	 * The composer this tab is written with: the copy's `composer`, or —
	 * on a tab other than the first — its `otherTabsComposer` when it says
	 * one (the Lair's Sanctum pill).
	 */
	const composerSkin = $derived(
		tabs.length > 1 && activeTab !== tabs[0] && settings.otherTabsComposer !== "same"
			? settings.otherTabsComposer
			: settings.composerSkin
	)

	/**
	 * 🚧 **Back · Forward** (RF fix 5, owner ruling 2026-10-23): the composer's
	 * note while the session is rewound, on a copy that shows the story (the
	 * primary log, or one pinned to `main`), with Forward beside it for the
	 * owner. The host says how many turns are ahead and why a press would be
	 * refused (`dossier.rewind`); nothing presses while a reply is being
	 * written. The two presses themselves are the session header's (polish
	 * parity L1, 2026-10-24: chrome above the first message is at most two
	 * rows), which reads the same state through `rewindStripState`.
	 */
	const generating = $derived(
		((conversation?.ctx.messages.v1 ?? []) as Array<{ isGenerating?: boolean }>).some((m) => m.isGenerating)
	)
	const rewind = $derived(
		rewindStripState({
			rewind: conversation?.rewind.state,
			isOwner: !!conversation?.dossier?.isOwner,
			generating,
			story: !settings.channel || settings.channel === "main" || settings.channel.startsWith("main:")
		})
	)
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
	data-composer-skin={composerSkin}
	data-line-width={settings.lineWidth}
	data-presentation={settings.presentation}
	data-show-messages={settings.showMessages}
	data-show-avatars={settings.showAvatars}
	data-show-timestamps={settings.showTimestamps}
	data-show-scene-markers={settings.showSceneMarkers}
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
	{#if tabs.length > 1 && conversation}
		<!-- 🚧 The channel tabs (lair fix 2): one per channel this copy shows,
		     the active one the lane the log shows and the composer writes on.
		     A tab not shown carries a dot when somebody else's line lands on
		     its channel. -->
		<sp-tabs
			value={activeTab}
			label="Conversations"
			data-widget-part="messages.channel-tabs"
			onchange={(e: CustomEvent<{ value: string }>) => {
				if (e.target === e.currentTarget && e.detail?.value) conversation.lane.set(e.detail.value)
			}}
		>
			<!-- One block per tab: an sp element seats each tab's content in its
			     own trigger (see MessageComposer's tabs). -->
			{#each tabs as slug (slug)}
				<sp-tab
					value={slug}
					label={tabLabel(slug)}
					data-widget-part="messages.channel-tab"
					data-channel-tab={slug}
					data-news={dots.has(slug) ? "" : undefined}
				>
					<span data-widget-part="messages.channel-tab-label">{conversation.channelName(slug)}</span>
					{#if dots.has(slug)}<span data-widget-part="messages.channel-tab-dot" aria-hidden="true"></span>{/if}
				</sp-tab>
			{/each}
		</sp-tabs>
	{/if}
	<!-- The whole panel scrolls: the log spans the widget's width, so its
	     scrollbar sits at the panel's edge and the wheel works anywhere in it;
	     the rows (the stage, `messages.stage`) and the composer take a centred
	     reading measure when the Line width setting says Column (the default)
	     or Comfortable, or the widget's full width at Full. DOM order is log then composer whichever end the
	     composer is drawn at: the reading order a screen reader and the tab
	     sequence follow is the conversation's, and `order` moves the box on
	     screen. -->
	{#if settings.showMessages}
		<div data-widget-part="messages.log">
			{#if conversation}
				<SessionContainer
					order={settings.order}
					showSceneMarkers={settings.showSceneMarkers}
					presentation={settings.presentation}
					emptyState={settings.emptyState}
				/>
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
				{#if selectionRefusal}
					<p data-widget-part="messages.scene-refusal" role="alert">
						<span data-widget-part="messages.scene-refusal-text">{selectionRefusal}</span>
						<button
							type="button"
							data-widget-part="messages.scene-refusal-dismiss messages.message-icon-button"
							aria-label="Dismiss"
							onclick={() => conversation.scenes.dismiss()}
						>
							<sp-icon name="x" size="14"></sp-icon>
						</button>
					</p>
				{/if}
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
						<!-- 🚧 The boundary path first: the run becomes one live
						     scene, summarized later from its divider. -->
						{#if conversation.scenes.boundaries}
							<button
								data-widget-part="messages.mark-scene messages.selection-button"
								title="Make these lines one scene: it starts at the first line picked and ends at the last"
								disabled={!markRun || conversation.scenes.busy}
								onclick={() => void conversation.scenes.markSelection()}
							>
								<sp-icon name="flag" size="16"></sp-icon>
								<span data-widget-part="messages.selection-button-label">Mark as scene</span>
							</button>
						{/if}
						<!-- A scene summary opens a scene, which is its own declared
						     write (R-B): a genre that opens none does not offer it.
						     ⏳ Tick capture, kept while live scenes land. -->
						{#if conversation.dossier?.writes.scenes}
							<button
								data-widget-part="messages.summarize-scene messages.selection-button"
								title={conversation.scenes.boundaries
									? "Summarize the picked lines as a scene, now"
									: "Scene"}
								disabled={selectedCount === 0}
								onclick={() => conversation.select.commit("scene")}
							>
								<sp-icon name="film" size="16"></sp-icon>
								<span data-widget-part="messages.selection-button-label">
									{conversation.scenes.boundaries ? "Scene summary" : "Scene"}
								</span>
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
	{:else if settings.showComposer && conversation && !conversation.noLane}
		{@const dossier = conversation.dossier}
		<div data-widget-part="messages.compose">
			<!-- The turn line (§3.16): what the last run did, and who is next —
			     one row above the field. -->
			<TurnLine nextUp={settings.nextUp} />
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
					{#if rewind.replaceText}
						<!-- 🚧 While rewound (RF fix 5): a new line replaces the
						     turns ahead — said before it is written, with Forward
						     beside it for the owner. -->
						<p data-widget-part="messages.rewind-replace" role="status">
							<sp-icon name="undo-2" size="14" data-widget-part="messages.rewind-replace-icon"></sp-icon>
							<span data-widget-part="messages.rewind-replace-text">{rewind.replaceText}</span>
							{#if conversation.dossier?.isOwner}
								<button
									type="button"
									data-widget-part="messages.rewind-replace-forward"
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
</div>
