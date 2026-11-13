<script lang="ts">
	/**
	 * The `dialogue-box` widget's component (PLAN-visual-novel-layout §1): the
	 * one line being read — the newest, until the reader holds on an older one —
	 * with a bar under it that says what waits and moves on (**Next line**, or by
	 * itself when `autoRead` is on). It owns the reading place and the pace of
	 * reading, both client-only and never stored. It does not own the log
	 * (Messages), writing (the Composer), who speaks next, or speech (the speak
	 * step and the spoken line); it draws the line with the log's own row and
	 * only reads what the voice is doing. No look here: parts only.
	 */
	import { untrack } from "svelte"
	import type { MessageV1 } from "@serene-pub/sdk/component"
	import {
		nextLinePlace,
		queuedSummary,
		queuedText,
		settlePlace
	} from "@serene-pub/core-catalog/conversation"
	import { useWidgetContext } from "../context"
	import SessionMessage from "../messages/SessionMessage.svelte"
	import { createConversation, setConversation } from "../messages/conversation.svelte"
	import { laneOf } from "../messages/sceneMarks"
	import { mediaStripItems } from "../messages/mediaStrip"
	import {
		isSpeaking,
		readAloudOf,
		spokenAudioItem,
		spokenOf,
		spokenPendingOf,
		spokenPlaybackOf
	} from "../messages/spokenLine"
	import {
		heardAfter,
		lineSpeechPhase,
		readOnState,
		readingTimeMs,
		type HeardPlayback,
		type LineSpeechPhase
	} from "../messages/readingPace"
	import { readDialogueBoxSettings } from "./settings"

	const ctx = useWidgetContext()
	const conversation = ctx ? setConversation(createConversation(ctx, { noSelection: true })) : null
	const settings = $derived(readDialogueBoxSettings(ctx?.current.settings.v1 as Record<string, unknown> | undefined))

	// The main channel's rows only (plan §1.2).
	const rows = $derived(conversation ? conversation.rows.filter((m) => laneOf(m.channel) === "main") : [])
	const ownId = $derived(conversation?.dossier?.ownNewestMessageId ?? null)

	// The reading place: client-only, per mount, never stored.
	let place = $state<number | null>(null)
	$effect(() => {
		const r = rows
		const own = ownId
		const was = untrack(() => place)
		const next = settlePlace(r, was, own)
		if (next !== was) place = next
	})
	function nextLine() {
		place = nextLinePlace(rows, place, ownId)
	}

	const shown = $derived(rows.find((r) => r.id === place) ?? null)
	const shownIndex = $derived(shown ? rows.indexOf(shown) : -1)
	const isNewest = $derived(shown !== null && shownIndex === rows.length - 1)

	// The host's `show-line`: the place when it is behind the newest row, else null.
	const shownLine = $derived(place !== null && rows.length > 0 && place !== rows[rows.length - 1]!.id ? place : null)
	let sent: number | null | undefined = undefined
	$effect(() => {
		const v = shownLine
		if (v === sent) return
		sent = v
		void conversation?.request("show-line", { messageId: v })
	})

	// The queue: what waits after the place.
	const summary = $derived(
		queuedSummary(rows, place, (r) => conversation?.line(r.id).speaker.name || (r as MessageV1).speakerLabel || null)
	)
	const queued = $derived(summary.lines > 0 || summary.writing !== null)
	const queuedLabel = $derived(queuedText(summary))

	// Speech facts, from the log's own helpers.
	const dossier = $derived(conversation?.dossier ?? null)
	const spoken = $derived(shown ? spokenOf(shown.metadata) : null)
	const hasAudio = $derived(
		!!shown && !!spoken && !!spokenAudioItem(mediaStripItems(shown.parts, shown.activeRevisions ?? { "0": 0 }))
	)
	const pendingRaw = $derived(shown ? spokenPendingOf(shown.metadata) : null)

	// Per-line facts, reset whenever the place moves to another line.
	let track = $state({
		id: null as number | null,
		shownAt: 0,
		timerFrom: 0,
		settledAt: null as number | null,
		audioSeenAt: null as number | null,
		heard: "none" as HeardPlayback,
		seenLive: null as string | null
	})
	$effect(() => {
		const p = place
		const s = shown
		const audio = hasAudio
		const raw = pendingRaw
		const live = conversation?.dossier?.liveRunIds
		untrack(() => {
			if (track.id !== p) {
				const t = Date.now()
				track = { id: p, shownAt: t, timerFrom: t, settledAt: null, audioSeenAt: null, heard: "none", seenLive: null }
			}
			if (s && !s.isGenerating && track.settledAt === null) track.settledAt = Date.now()
			if (audio && track.audioSeenAt === null) track.audioSeenAt = Date.now()
			if (raw && live?.includes(raw.runId)) track.seenLive = raw.runId
		})
	})
	const pending = $derived(isSpeaking(pendingRaw, dossier?.liveRunIds, track.seenLive) ? pendingRaw : null)

	// The line's player speaks to the page in bubbling events (play, pause, ended).
	function hear(e: Event) {
		track.heard = heardAfter(track.heard, e.type as "play" | "pause" | "ended")
	}

	// Read on by itself.
	let held = $state(false)
	let now = $state(Date.now())
	$effect(() => {
		if (!settings.autoRead || !queued || held) return
		now = Date.now()
		const t = setInterval(() => (now = Date.now()), 200)
		return () => clearInterval(t)
	})
	const phase = $derived(
		lineSpeechPhase({
			readAloud: readAloudOf(dossier),
			playback: spokenPlaybackOf(dossier),
			canSpeak: dossier?.speech?.canSpeak !== false,
			pendingAt: pending?.at ?? null,
			hasAudio,
			audioSeenAt: track.audioSeenAt,
			heard: track.heard,
			settledAt: track.settledAt,
			now
		})
	)
	// Only once the per-line facts are this line's: a step is never judged on the last line's `ended`.
	const readOn = $derived(
		settings.autoRead && track.id === place
			? readOnState({
					phase,
					queued,
					held,
					timerFrom: track.timerFrom,
					settledAt: track.settledAt,
					readingMs: readingTimeMs(shown?.content ?? "", settings.readingSpeed),
					now
				})
			: { due: false, timer: null }
	)
	// A voice that was expected and never started: the reading timer starts now, so its bar always fills (owner R4).
	let lastPhase: LineSpeechPhase = "none"
	$effect(() => {
		const ph = phase
		untrack(() => {
			if (ph === "blocked" && lastPhase !== "blocked" && lastPhase !== "none" && track.id === place) {
				track.timerFrom = Date.now()
			}
			lastPhase = ph
		})
	})
	$effect(() => {
		if (readOn.due) untrack(() => nextLine())
	})
	function togglePause() {
		if (held) track.timerFrom = Date.now()
		held = !held
	}

	// The slide-in hook: every line after the first this mount drew arrives.
	let firstId: number | null = null
	const arrive = $derived.by(() => {
		if (!shown) return false
		if (firstId === null) firstId = shown.id
		return shown.id !== firstId
	})
</script>

<!-- The widget's parts (`dialogue-box.*`, STYLE-GUIDE §6.16): no look here. -->
{#if conversation && !conversation.noLane && conversation.dossier && shown}
	<div data-widget-part="dialogue-box.root">
		{#key shown.id}
			<div data-widget-part="dialogue-box.line" data-arrive={arrive ? "" : undefined} onplay={hear} onpause={hear} onended={hear}>
				<SessionMessage msg={shown} index={shownIndex} isLastMessage={isNewest} place={{ n: shownIndex + 1, of: rows.length }} atReadingPlace />
			</div>
		{/key}
		{#if queued}
			<div data-widget-part="dialogue-box.bar">
				{#if queuedLabel}<span data-widget-part="dialogue-box.queued" role="status">{queuedLabel}</span>{/if}
				{#if readOn.timer}<sp-progress data-widget-part="dialogue-box.progress" value={readOn.timer.elapsed} max={readOn.timer.total} label="Time until the next line"></sp-progress>{/if}
				{#if settings.autoRead}<button type="button" data-widget-part="dialogue-box.pause" aria-pressed={held} onclick={togglePause}>Pause</button>{/if}
				<button type="button" data-widget-part="dialogue-box.next" onclick={nextLine}>Next line</button>
			</div>
		{/if}
	</div>
{/if}
