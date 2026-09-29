<script lang="ts">
	import { untrack } from "svelte"
	import {
		conversationIndex,
		orderedMessages,
		type ConversationSceneV1,
		type MessageOrder
	} from "@serene-pub/core-catalog/conversation"
	import SessionMessage from "./SessionMessage.svelte"
	import { scopeNotGranted } from "@serene-pub/core-catalog/widgets"
	import { useConversation } from "./conversation.svelte"
	import type { MessageV1 } from "@serene-pub/sdk/component"
	// eslint-disable-next-line @typescript-eslint/no-unused-vars

	// Visually distinct, readable scene colors (work in both light and dark)
	const SCENE_COLORS = [
		{
			bar: "hsl(220,65%,62%)",
			text: "hsl(220,65%,65%)",
			bg: "hsl(220,65%,62%,0.10)"
		}, // blue
		{
			bar: "hsl(150,52%,48%)",
			text: "hsl(150,52%,52%)",
			bg: "hsl(150,52%,48%,0.10)"
		}, // green
		{
			bar: "hsl(35, 75%,55%)",
			text: "hsl(35, 75%,58%)",
			bg: "hsl(35, 75%,55%,0.10)"
		}, // amber
		{
			bar: "hsl(280,55%,62%)",
			text: "hsl(280,55%,66%)",
			bg: "hsl(280,55%,62%,0.10)"
		}, // purple
		{
			bar: "hsl(340,60%,58%)",
			text: "hsl(340,60%,62%)",
			bg: "hsl(340,60%,58%,0.10)"
		}, // rose
		{
			bar: "hsl(190,60%,48%)",
			text: "hsl(190,60%,52%)",
			bg: "hsl(190,60%,48%,0.10)"
		}, // teal
		{
			bar: "hsl(55, 70%,50%)",
			text: "hsl(55, 70%,54%)",
			bg: "hsl(55, 70%,50%,0.10)"
		}, // yellow
		{
			bar: "hsl(15, 70%,55%)",
			text: "hsl(15, 70%,59%)",
			bg: "hsl(15, 70%,55%,0.10)"
		} // orange
	]

	// Props for customizing the components used
	/**
	 * The conversation's log (C0b): the widget's own part. It draws what the
	 * conversation holds — the rows off the widget context, the scenes off the
	 * page's dossier — in a host-measured scroll region (`sp-scroll`), and asks
	 * for older rows when the reader reaches the far end.
	 */
	interface Props {
		order?: MessageOrder
		showSceneMarkers?: boolean
	}

	let { order = "oldest-first", showSceneMarkers = true }: Props = $props()

	const conv = useConversation()
	// This copy's rows (S1): its channels', so a channel another copy claims
	// is never drawn here, not even hidden.
	const messages = $derived(conv.rows)
	const sceneList = $derived(conv.dossier?.scenes ?? [])
	const loadingOlderMessages = $derived(!!conv.dossier?.loadingOlder)
	const loaded = $derived(!!conv.dossier)
	/**
	 * The host said this widget does not hold `session:full` (a plugin's copy
	 * not granted it): the dossier will never come, so "Loading session…"
	 * would spin forever — it is said instead.
	 */
	const dossierNotGranted = $derived(scopeNotGranted(conv.ctx, "session:full"))

	/** Older rows, asked for once per reach of the far end. */
	function loadOlder() {
		if (!conv.dossier?.hasOlder || conv.dossier.loadingOlder) return
		void conv.request("messages", {})
	}
	/** The lore panel, at a history entry, a scene, or a new entry. */
	const openLore = (params: {
		lorebookId: number
		scope: "history" | "scenes"
		entryId?: number
		sceneId?: number
		create?: boolean
	}) => void conv.request("open-lore", params)

	type MsgSceneInfo = {
		scene: ConversationSceneV1
		isFirstInScene: boolean
		isLastInScene: boolean
		historyEntry: ConversationSceneV1["historyEntry"]
		isFirstOfEntry: boolean
		isLastOfEntry: boolean
		colorIndex: number
	}

	// Lightweight signal capturing only the message *set and order* (ids), not
	// their content. The parent replaces the whole `messages` array
	// reference on every streamed chunk even when only one message's content
	// changed, which would otherwise force the expensive O(scenes × messages)
	// derivation below to fully recompute on every token.
	let msgOrderKey = $derived(messages.map((m) => m.id).join(","))

	let msgSceneMap = $derived.by((): Map<number, MsgSceneInfo> => {
		// Track sceneList and msgOrderKey as the real dependencies here. The
		// heavy work below (which reads messages directly) is wrapped
		// in untrack() so a messages reference change alone doesn't
		// dirty this derived — only a change in msgOrderKey's *value* (i.e. the
		// message ids/order actually changing) or sceneList does.
		void sceneList.length
		void msgOrderKey

		// An empty map is what "no scene markers" means everywhere below: no
		// divider, no chip, no coloured bar, and none of the work to find them.
		if (!showSceneMarkers) return new Map()
		return untrack(buildMsgSceneMap)
	})

	/** The messages in the sequence this log draws them, `order` applied. */
	let drawnMessages = $derived(
		orderedMessages(messages, order)
	)

	function buildMsgSceneMap(): Map<number, MsgSceneInfo> {
		const map = new Map<number, MsgSceneInfo>()
		if (!sceneList.length || !messages.length) return map

		// Build messageId → scene lookup
		const messageToScene = new Map<number, ConversationSceneV1>()
		for (const scene of sceneList) {
			for (const msgId of scene.selectedMessageIds ?? []) {
				messageToScene.set(msgId, scene)
			}
		}

		// For each scene, find its first/last message IDs in session display order
		const sceneBounds = new Map<number, { first: number; last: number }>()
		for (const scene of sceneList) {
			const ids = new Set(scene.selectedMessageIds ?? [])
			if (!ids.size) continue
			const ordered = messages
				.filter((m) => ids.has(m.id))
				.map((m) => m.id)
			if (ordered.length)
				sceneBounds.set(scene.id, {
					first: ordered[0],
					last: ordered[ordered.length - 1]
				})
		}

		// For each history entry, find the last message across all its scenes
		const entryLastMsgIndex = new Map<number, number>()
		for (const scene of sceneList) {
			if (!scene.historyEntryId) continue
			const bounds = sceneBounds.get(scene.id)
			if (!bounds) continue
			const idx = messages.findIndex(
				(m) => m.id === bounds.last
			)
			const current = entryLastMsgIndex.get(scene.historyEntryId) ?? -1
			if (idx > current) entryLastMsgIndex.set(scene.historyEntryId, idx)
		}
		const entryLastMsgId = new Map<number, number>()
		for (const [entryId, idx] of entryLastMsgIndex) {
			entryLastMsgId.set(entryId, messages[idx].id)
		}

		// Assign colors in the order scenes first appear in the session
		const sceneColorIndex = new Map<number, number>()
		let colorCounter = 0
		for (const msg of messages) {
			const scene = messageToScene.get(msg.id)
			if (scene && !sceneColorIndex.has(scene.id)) {
				sceneColorIndex.set(
					scene.id,
					colorCounter % SCENE_COLORS.length
				)
				colorCounter++
			}
		}

		// Walk messages in display order to build the full map
		const seenEntryIds = new Set<number>()
		for (const msg of messages) {
			const scene = messageToScene.get(msg.id)
			if (!scene) continue
			const bounds = sceneBounds.get(scene.id)
			if (!bounds) continue

			const isFirstInScene = bounds.first === msg.id
			const isLastInScene = bounds.last === msg.id
			const entryId = scene.historyEntryId
			const isFirstOfEntry =
				isFirstInScene && !!entryId && !seenEntryIds.has(entryId)
			if (isFirstOfEntry) seenEntryIds.add(entryId)
			const isLastOfEntry =
				!!entryId && entryLastMsgId.get(entryId) === msg.id

			map.set(msg.id, {
				scene,
				isFirstInScene,
				isLastInScene,
				historyEntry: scene.historyEntry,
				isFirstOfEntry,
				isLastOfEntry,
				colorIndex: sceneColorIndex.get(scene.id) ?? 0
			})
		}

		return map
	}

	function formatEntryDate(he: {
		year: number
		month: number | null
		day: number | null
	}): string {
		let s = `Year ${he.year}`
		if (he.month) s += `, Mo. ${he.month}`
		if (he.day) s += `, Day ${he.day}`
		return s
	}
</script>

<!-- The log's parts (`messages.*`, STYLE-GUIDE §6.16): no look here; the
     default widget stylesheet draws them. -->
<div data-widget-part="messages.log-body">
	<!-- The host measures and scrolls (`sp-scroll`): pinned to the newest end
	     as rows arrive, held still when the reader has scrolled away, and
	     `reach-start` at the far end asks for older rows. -->
	<sp-scroll
		data-widget-part="messages.log-scroll"
		stick={order === "newest-first" ? "top" : "bottom"}
		label="Session messages"
		onreach-start={loadOlder}
	>
	<!-- The region spans the panel; the rows (the stage, `messages.stage`)
	     take its full width, or a centred measure under Line width:
	     Comfortable. -->
	<div
		id="session-history"
		data-widget-part="messages.stage"
		role="log"
		aria-live="polite"
		aria-atomic="false"
	>
		<div data-widget-part="messages.stage-body">
			{#if !loaded && dossierNotGranted}
				<div data-widget-part="messages.log-note messages.log-floor" role="status" data-scope-not-granted="session:full">
					<sp-icon name="lock" size="28" data-widget-part="messages.log-floor-icon"></sp-icon>
					<span data-widget-part="messages.log-floor-text">
						{conv.t("This widget has not been granted the whole conversation. An administrator can grant it in the extension's permissions.")}
					</span>
				</div>
			{:else if !loaded}
				<!-- Still loading the session itself — distinct from a genuinely
				     empty session below, otherwise "No messages yet." flashes on
				     every session open even when it has hundreds of messages. -->
				<div data-widget-part="messages.log-loading messages.log-floor">
					<sp-icon name="loader-2" size="28" data-widget-part="messages.log-floor-icon messages.log-loading-icon"></sp-icon>
					<span data-widget-part="messages.log-floor-text">Loading session…</span>
				</div>
			{:else if messages.length === 0}
				<div data-widget-part="messages.log-empty messages.log-floor empty">
					<sp-icon name="message-square-text" size="28" data-widget-part="messages.log-floor-icon"></sp-icon>
					<span data-widget-part="messages.log-floor-text">Send a message to start</span>
				</div>
			{:else}
				<!-- The older messages arrive at whichever end they are drawn
				     at, so the indicator for them sits at that end too. -->
				{#snippet olderMessagesLoading()}
					{#if loadingOlderMessages}
						<div data-widget-part="messages.older-loading">
							<div data-widget-part="messages.older-loading-body">
								<sp-icon name="loader-2" size="16" data-widget-part="messages.older-loading-icon"></sp-icon>
								Loading older messages...
							</div>
						</div>
					{/if}
				{/snippet}
				{#if order === "oldest-first"}
					{@render olderMessagesLoading()}
				{/if}

				<ul
					data-widget-part="messages.message-list list"
					role="group"
					aria-label="Session conversation with {messages.length} messages"
				>
					{#each drawnMessages as msg, row (msg.id)}
						{@const index = conversationIndex(
							row,
							messages.length,
							order
						)}
						{@const isLastMessage =
							index === messages.length - 1}
						{@const onThisChannel =
							(msg.channel || "main") === conv.lane.current}
						{@const si = msgSceneMap.get(msg.id)}
						{@const color = si ? SCENE_COLORS[si.colorIndex] : null}

						<!-- History-entry marker: the date this stretch of the
						     story is set on, once before the entry's first scene
						     message. -->
						{#if si?.isFirstOfEntry && si.historyEntry}
							<li data-widget-part="messages.log-item" role="presentation">
								{#if si.scene.historyEntryId}
									<button
										data-widget-part="messages.history-marker"
										onclick={() =>
											openLore({
												scope: "history",
												entryId: si.scene.historyEntryId!,
												lorebookId: si.scene.lorebookId
											})}
										title="Open history entry in lorebook"
									>
										<sp-icon name="calendar" size="12"></sp-icon>
										{formatEntryDate(si.historyEntry)}
									</button>
								{:else}
									<span data-widget-part="messages.history-marker">
										<sp-icon name="calendar" size="12"></sp-icon>
										{formatEntryDate(si.historyEntry)}
									</span>
								{/if}
							</li>
						{/if}

						<!-- Scene title: the scene's name at the top of its
						     group, in the scene's own colour. -->
						{#if si?.isFirstInScene && color}
							<li
								data-widget-part="messages.log-item"
								role="presentation"
								style="--sp-scene: {color.text}"
							>
																	<button
										data-widget-part="messages.scene-title"
										onclick={() =>
											openLore({
												scope: "scenes",
												sceneId: si.scene.id,
												entryId: si.scene.historyEntryId ?? undefined,
												lorebookId: si.scene.lorebookId
											})}
										title="Open scene in lorebook"
									>
										<sp-icon name="film" size="14"></sp-icon>
										{si.scene.name ?? "Scene"}
										{#if si.historyEntry && !si.historyEntry.isCompleted}
											<span data-widget-part="messages.scene-title-state">
												open
											</span>
										{/if}
									</button>
								
							</li>
						{/if}

						<!-- The message row. It carries the scene's colour as
						     `--sp-scene`, which the style pack draws the scene's
						     edge with and the message's own scene badge inherits.

						     Opacity-only fade, no height/transform — autoscroll
						     reads scrollHeight synchronously on insert, so an
						     entering message has to contribute its full height
						     to layout immediately.
						     Enter is suppressed for bulk inserts: while older
						     messages are being prepended, and for anything that
						     isn't the last message (so switching sessions doesn't
						     fade the whole backlog in). First render needs no
						     guard — Svelte transitions are local by default, so
						     they don't play when an ancestor block is created.
						     Exit is fade-only: the <ul> has a gap, and a
						     collapsing <li> would leave that gap behind to snap
						     shut at the end — a worse artifact than the fix. -->
						<li
							data-widget-part="messages.message-row"
							hidden={!onThisChannel}
							style={color
								? `--sp-scene: ${color.text}`
								: undefined}
							data-scene={si ? si.scene.id : undefined}
							data-arrive={untrack(() =>
								loadingOlderMessages || !isLastMessage
									? undefined
									: "")}
						>
							<SessionMessage
								{msg}
								{index}
								{isLastMessage}
								sceneName={si ? (si.scene.name ?? "Scene") : null}
							/>
						</li>

						<!-- Completed-entry marker: where this entry's story
						     stops, and the way on to the next one. -->
						{#if si?.isLastOfEntry && si.historyEntry?.isCompleted}
							<li data-widget-part="messages.log-item" role="presentation">
								{#if si.historyEntry.nextEntry}
									{@const next = si.historyEntry.nextEntry}
																			<button
											data-widget-part="messages.history-marker"
											onclick={() =>
												openLore({
													scope: "history",
													entryId: next.id,
													lorebookId: si.scene.lorebookId
												})}
											title="Open next history entry in lorebook"
										>
											<sp-icon name="calendar" size="12"></sp-icon>
											Next: {formatEntryDate(next)}
										</button>
									
								{:else}
									<button
										data-widget-part="messages.history-marker messages.history-start"
										onclick={() =>
											openLore({
												scope: "history",
												create: true,
												lorebookId: si.scene.lorebookId
											})}
										title="Start a new history entry"
									>
										<sp-icon name="calendar-plus" size="12"></sp-icon>
										Start a new entry
									</button>
								{/if}
							</li>
						{/if}
					{/each}
				</ul>
				{#if order === "newest-first"}
					{@render olderMessagesLoading()}
				{/if}
			{/if}
		</div>
	</div>
	</sp-scroll>
</div>
