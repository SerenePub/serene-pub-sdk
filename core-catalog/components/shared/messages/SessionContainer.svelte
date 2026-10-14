<script lang="ts">
	import { untrack } from "svelte"
	import {
		conversationIndex,
		orderedMessages,
		storyDayLabelIn,
		type ConversationSceneV1,
		type MessageOrder
	} from "@serene-pub/core-catalog/conversation"
	import SessionMessage from "./SessionMessage.svelte"
	import SceneDivider from "./SceneDivider.svelte"
	import SceneCueChip from "./SceneCueChip.svelte"
	import MessageStateLedger from "./MessageStateLedger.svelte"
	import { isLiveScene, laneOf, sceneMarks, type SceneMarks } from "./sceneMarks"
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
		/**
		 * How the lines are drawn (PLAN-core-widgets §3.7): `rows`, or
		 * `folio` — one block of prose, each line a paragraph, a thin rule
		 * naming the speaker wherever the speaker changes.
		 */
		presentation?: "rows" | "folio"
	}

	let {
		order = "oldest-first",
		showSceneMarkers = true,
		presentation = "rows"
	}: Props = $props()
	const folio = $derived(presentation === "folio")

	const conv = useConversation()
	/**
	 * 🚧 How the log spells a story day (§15 G9): through the calendar of the
	 * book the session reads, which the dossier carries (`storyCalendar`);
	 * free-form when it declares none, or before the page knows.
	 */
	const spellDay = $derived(storyDayLabelIn(conv.dossier?.storyCalendar ?? null))
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

	/**
	 * A history entry's marks in the log, for the scenes captured by
	 * selection: the entry's date above its first scene's first line, and
	 * the way on after a completed entry's last. A live scene's dates are its
	 * divider's and the day marks'.
	 */
	type EntryMarks = {
		scene: ConversationSceneV1
		historyEntry: ConversationSceneV1["historyEntry"]
		isFirstOfEntry: boolean
		isLastOfEntry: boolean
	}

	// Lightweight signal capturing only the message *set and order* (ids) and
	// what the marks read off a row — hidden, for a divider's count — not
	// their content. The parent replaces the whole `messages` array
	// reference on every streamed chunk even when only one message's content
	// changed, which would otherwise force the expensive O(scenes × messages)
	// derivations below to fully recompute on every token.
	let msgOrderKey = $derived(
		messages.map((m) => (m.isHidden ? `${m.id}h` : m.id)).join(",")
	)

	const NO_MARKS: SceneMarks = {
		sceneOf: new Map(),
		dividers: new Map(),
		dayMarks: new Map()
	}

	/**
	 * 🚧 The scene dividers, the scenes' colours and the day marks
	 * (PROPOSAL-live-scenes §7): `sceneMarks` over the rows, rebuilt only
	 * when the scenes, the rows' ids or the lane shown move.
	 */
	let marks = $derived.by((): SceneMarks => {
		void sceneList
		void msgOrderKey
		const lane = conv.lane.current
		const dayLabel = spellDay
		// No marks is what "Show scenes and dates" off means everywhere below:
		// no divider, no day mark, no coloured edge, and none of the work.
		if (!showSceneMarkers) return NO_MARKS
		return untrack(() => sceneMarks(messages, sceneList, { lane, dayLabel }))
	})

	/**
	 * 🚧 Suggested mode's *New scene?* chips (lane E), by the line each sits
	 * before — on that line's own lane only. None where the viewer may not
	 * place a boundary, or scene markers are off.
	 */
	let cueAt = $derived.by(() => {
		const out = new Map<number, { id: number; reason: string }>()
		if (!showSceneMarkers) return out
		const lanes = new Map(messages.map((m) => [m.id, laneOf(m.channel)]))
		for (const c of conv.scenes.cues)
			if (lanes.get(c.messageId) === laneOf(c.channel) && !out.has(c.messageId))
				out.set(c.messageId, { id: c.id, reason: c.reason })
		return out
	})

	let entryMarks = $derived.by((): Map<number, EntryMarks> => {
		void sceneList
		void msgOrderKey
		if (!showSceneMarkers) return new Map()
		return untrack(buildEntryMarks)
	})

	/** The messages in the sequence this log draws them, `order` applied. */
	let drawnMessages = $derived(
		orderedMessages(messages, order)
	)

	/**
	 * Who a line is from, as Folio names and compares it: the narrator by
	 * its name, anyone else by their reference (a character, a persona), and
	 * a role-named line with its member ("Dungeon Master · jody").
	 */
	function folioSpeaker(msg: MessageV1): { key: string; name: string } {
		if (msg.isNarratorResponse) {
			const name = msg.metadata?.narratorName || "Narrator"
			return { key: `narrator:${name}`, name }
		}
		const speaker = conv.line(msg.id).speaker
		const member = speaker.member?.trim()
		const name = member ? `${speaker.name} · ${member}` : speaker.name
		return { key: `${speaker.ref ?? `name:${speaker.name}`}|${member ?? ""}`, name }
	}

	/**
	 * Folio's speaker rules: the lines that open a run of one speaker, in the
	 * order drawn, each with the name its rule carries. The first line drawn
	 * opens a run too, so the page says who begins. Lines on another lane of
	 * this channel are drawn hidden, so they neither open nor break a run.
	 * Empty in Rows.
	 */
	let folioRules = $derived.by((): Map<number, string> => {
		const out = new Map<number, string>()
		if (!folio) return out
		const lane = conv.lane.current
		let last: string | null = null
		for (const msg of drawnMessages) {
			if ((msg.channel || "main") !== lane) continue
			const speaker = folioSpeaker(msg)
			if (speaker.key !== last) out.set(msg.id, speaker.name)
			last = speaker.key
		}
		return out
	})

	function buildEntryMarks(): Map<number, EntryMarks> {
		const map = new Map<number, EntryMarks>()
		const captured = sceneList.filter((s) => !isLiveScene(s))
		if (!captured.length || !messages.length) return map

		// For each captured scene, its first/last loaded line in session order
		const sceneBounds = new Map<number, { first: number; last: number }>()
		for (const scene of captured) {
			const ids = new Set(scene.selectedMessageIds ?? [])
			if (!ids.size) continue
			const ordered = messages.filter((m) => ids.has(m.id)).map((m) => m.id)
			if (ordered.length)
				sceneBounds.set(scene.id, {
					first: ordered[0],
					last: ordered[ordered.length - 1]
				})
		}

		// For each history entry, the last line across all its scenes
		const entryLastMsgIndex = new Map<number, number>()
		for (const scene of captured) {
			if (!scene.historyEntryId) continue
			const bounds = sceneBounds.get(scene.id)
			if (!bounds) continue
			const idx = messages.findIndex((m) => m.id === bounds.last)
			const current = entryLastMsgIndex.get(scene.historyEntryId) ?? -1
			if (idx > current) entryLastMsgIndex.set(scene.historyEntryId, idx)
		}
		const entryLastMsgId = new Map<number, number>()
		for (const [entryId, idx] of entryLastMsgIndex)
			entryLastMsgId.set(entryId, messages[idx].id)

		// The first line of each entry, walking the log in order
		const firstOf = new Map<number, ConversationSceneV1>()
		const lastOf = new Map<number, ConversationSceneV1>()
		const byFirst = new Map<number, ConversationSceneV1>()
		for (const scene of captured) {
			const bounds = sceneBounds.get(scene.id)
			if (bounds) byFirst.set(bounds.first, scene)
		}
		const seenEntryIds = new Set<number>()
		for (const msg of messages) {
			const scene = byFirst.get(msg.id)
			const entryId = scene?.historyEntryId
			if (scene && entryId && !seenEntryIds.has(entryId)) {
				seenEntryIds.add(entryId)
				firstOf.set(msg.id, scene)
			}
		}
		for (const scene of captured) {
			const entryId = scene.historyEntryId
			if (!entryId) continue
			const last = entryLastMsgId.get(entryId)
			if (last !== undefined && sceneBounds.get(scene.id)?.last === last)
				lastOf.set(last, scene)
		}
		for (const id of new Set([...firstOf.keys(), ...lastOf.keys()])) {
			const scene = (firstOf.get(id) ?? lastOf.get(id))!
			map.set(id, {
				scene,
				historyEntry: scene.historyEntry,
				isFirstOfEntry: firstOf.has(id),
				isLastOfEntry: lastOf.has(id)
			})
		}
		return map
	}

	/** The history entry a line's scene is filed under, for its day mark to open. */
	function dayMarkEntry(
		messageId: number
	): { historyEntryId: number; lorebookId: number } | null {
		const at = marks.sceneOf.get(messageId)
		const scene = at ? sceneList.find((s) => s.id === at.sceneId) : undefined
		return scene?.historyEntryId
			? { historyEntryId: scene.historyEntryId, lorebookId: scene.lorebookId }
			: null
	}

	/**
	 * 🚧 A history entry's date, as the history marker says it — through the
	 * book's calendar, as the divider and the day marks are (§15 G9).
	 */
	function formatEntryDate(he: {
		year: number
		month: number | null
		day: number | null
	}): string {
		return spellDay(he)
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
	<!-- Folio (PLAN-core-widgets §3.7) adds `messages.folio` to the stage: the
	     lines read as one block of prose, and every rule keyed on it (the
	     default sheet's, a pack's guard) knows so. Two spellings of one
	     element rather than a computed attribute, so each part stays written
	     out where the guide's part list reads it (scripts/widgetParts.ts). -->
	{#if folio}
		<div
			id="session-history"
			data-widget-part="messages.stage messages.folio"
			role="log"
			aria-live="polite"
			aria-atomic="false"
		>
			{@render stageBody()}
		</div>
	{:else}
		<div
			id="session-history"
			data-widget-part="messages.stage"
			role="log"
			aria-live="polite"
			aria-atomic="false"
		>
			{@render stageBody()}
		</div>
	{/if}
	</sp-scroll>
</div>

<!-- What opens at one line, oldest mark first: a captured scene's history
     entry date, the story day, then the scene's divider. Newest-first draws
     the same marks below the line, so they are emitted in reverse there. -->
{#snippet opensHere(
	msg: MessageV1,
	entry: EntryMarks | undefined,
	onThisChannel: boolean
)}
	{@const divider = marks.dividers.get(msg.id)}
	{@const dayMark = marks.dayMarks.get(msg.id)}
	{@const cue = cueAt.get(msg.id)}
	{#if order === "newest-first" && cue && !divider}
		<SceneCueChip {cue} hidden={!onThisChannel} />
	{/if}
	{#if order === "newest-first" && divider}
		<SceneDivider
			{divider}
			{order}
			color={SCENE_COLORS[divider.swatch].text}
			hidden={!onThisChannel}
		/>
	{/if}
	{#if order === "newest-first" && dayMark}
		{@render dayMarkItem(msg, dayMark.label)}
	{/if}
	{#if entry?.isFirstOfEntry && entry.historyEntry}
		<!-- History-entry marker: the date this stretch of the story is set
		     on, once before the entry's first scene message. -->
		<li data-widget-part="messages.log-item" role="presentation" hidden={!onThisChannel}>
			{#if entry.scene.historyEntryId}
				<button
					data-widget-part="messages.history-marker"
					onclick={() =>
						openLore({
							scope: "history",
							entryId: entry.scene.historyEntryId!,
							lorebookId: entry.scene.lorebookId
						})}
					title="Open history entry in lorebook"
				>
					<sp-icon name="calendar" size="12"></sp-icon>
					{formatEntryDate(entry.historyEntry)}
				</button>
			{:else}
				<span data-widget-part="messages.history-marker">
					<sp-icon name="calendar" size="12"></sp-icon>
					{formatEntryDate(entry.historyEntry)}
				</span>
			{/if}
		</li>
	{/if}
	{#if order === "oldest-first" && dayMark}
		{@render dayMarkItem(msg, dayMark.label)}
	{/if}
	{#if order === "oldest-first" && divider}
		<SceneDivider
			{divider}
			{order}
			color={SCENE_COLORS[divider.swatch].text}
			hidden={!onThisChannel}
		/>
	{/if}
	<!-- 🚧 A scene cue's chip sits in the divider's slot: where the next
	     scene would begin (a scene already beginning here makes it moot). -->
	{#if order === "oldest-first" && cue && !divider}
		<SceneCueChip {cue} hidden={!onThisChannel} />
	{/if}
{/snippet}

<!-- 🚧 A day mark: the story day this line was written on, where the day
     changes (its story clock stamp). Opens the line's history entry in the
     lorebook when its scene is filed under one. -->
{#snippet dayMarkItem(msg: MessageV1, label: string)}
	{@const filed = dayMarkEntry(msg.id)}
	<li data-widget-part="messages.log-item" role="presentation">
		{#if filed}
			<button
				data-widget-part="messages.history-marker messages.day-mark"
				onclick={() =>
					openLore({
						scope: "history",
						entryId: filed.historyEntryId,
						lorebookId: filed.lorebookId
					})}
				title="Open this day's history entry in lorebook"
			>
				<sp-icon name="calendar" size="12"></sp-icon>
				{label}
			</button>
		{:else}
			<span data-widget-part="messages.history-marker messages.day-mark">
				<sp-icon name="calendar" size="12"></sp-icon>
				{label}
			</span>
		{/if}
	</li>
{/snippet}

{#snippet stageBody()}
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
					<!-- 🚧 Time moved before anything was said (§15 G13). -->
					<MessageStateLedger head />
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
					<!-- 🚧 The ledger head (§15 G13): before the first message,
					     so only once there is nothing older to load. -->
					{#if !conv.dossier?.hasOlder}<MessageStateLedger head />{/if}
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
						{@const at = marks.sceneOf.get(msg.id)}
						{@const color = at ? SCENE_COLORS[at.swatch] : null}
						{@const entry = entryMarks.get(msg.id)}
						{@const refusal =
							conv.scenes.refusal?.at === "line" &&
							conv.scenes.refusal.id === msg.id
								? conv.scenes.refusal.text
								: null}

						<!-- What opens at this line — a history entry's date, a story
						     day, a scene — sits on the side of it the older lines
						     are: above it oldest-first, below it newest-first. -->
						{#if order === "oldest-first"}
							{@render opensHere(msg, entry, onThisChannel)}
						{/if}

						<!-- Folio: a thin rule naming who speaks from here on,
						     where the speaker changes (and above the first line). -->
						{#if folioRules.has(msg.id)}
							<li data-widget-part="messages.log-item messages.folio-rule" role="presentation">
								<span data-widget-part="messages.folio-rule-name">{folioRules.get(msg.id)}</span>
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
							data-scene={at ? at.sceneId : undefined}
							data-drag-key={msg.id}
							data-arrive={untrack(() =>
								loadingOlderMessages || !isLastMessage
									? undefined
									: "")}
						>
							<SessionMessage
								{msg}
								{index}
								{isLastMessage}
								sceneName={at ? at.name : null}
								{folio}
							/>
						</li>

						<!-- 🚧 A scene boundary this line was refused — *Start
						     scene here*, *End scene here* — said under it. -->
						{#if refusal}
							<li data-widget-part="messages.log-item messages.scene-refusal" role="alert" hidden={!onThisChannel}>
								<span data-widget-part="messages.scene-refusal-text">{refusal}</span>
								<button
									type="button"
									data-widget-part="messages.scene-refusal-dismiss messages.message-icon-button"
									aria-label="Dismiss"
									onclick={() => conv.scenes.dismiss()}
								>
									<sp-icon name="x" size="14"></sp-icon>
								</button>
							</li>
						{/if}

						{#if order === "newest-first"}
							{@render opensHere(msg, entry, onThisChannel)}
						{/if}

						<!-- Completed-entry marker: where this entry's story
						     stops, and the way on to the next one. -->
						{#if entry?.isLastOfEntry && entry.historyEntry?.isCompleted}
							<li data-widget-part="messages.log-item" role="presentation">
								{#if entry.historyEntry.nextEntry}
									{@const next = entry.historyEntry.nextEntry}
									<button
										data-widget-part="messages.history-marker"
										onclick={() =>
											openLore({
												scope: "history",
												entryId: next.id,
												lorebookId: entry.scene.lorebookId
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
												lorebookId: entry.scene.lorebookId
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
					{#if !conv.dossier?.hasOlder}<MessageStateLedger head />{/if}
					{@render olderMessagesLoading()}
				{/if}
			{/if}
		</div>
{/snippet}
