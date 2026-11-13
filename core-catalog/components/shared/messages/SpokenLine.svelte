<script lang="ts">
	/**
	 * 🚧 **The spoken line** (speech build lane E; design §6.4; polish pass
	 * 2026-10-29): under a line that was spoken — a `core:audio` part and
	 * `metadata.spoken` — one compact strip: a state glyph, the browser's own
	 * player, the clock, who spoke (a voice chip, and the mood when there is
	 * one) and a `⋯` with *Say it as…*. The speak verbs *Read aloud* / *Say it
	 * again* and *Stop* live in the message heading; this strip keeps only a
	 * small Stop while it is speaking. A spoken line whose file is gone reads
	 * *Not spoken yet*, never a broken player.
	 *
	 * The player is the browser's own (`<audio controls>`): a component runs
	 * in the UI worker and speaks to the page in attributes and events only,
	 * so it cannot call `play()`. Hence:
	 *
	 * - **Autoplay** is the `autoplay` attribute (core's alone), decided ONCE
	 *   per audio part: under *Make and play*, the NEWEST line's audio, spoken
	 *   since this page opened and still fresh — never an older line, never
	 *   on page load. A Dialogue box's shown line may too (`atReadingPlace`).
	 *   A browser that refuses a sound nobody asked for leaves
	 *   the player waiting; its own play button is right there.
	 * - **The playhead** arrives as the host `audio` events (1.7: `play`,
	 *   `pause`, `ended`, `timeupdate` with `{ currentTime, duration, paused }`,
	 *   seconds). They drive the state glyph, the clock and the **caption**: the
	 *   words of the cue playing now, read off the recorded cue map.
	 * - **Speaking…** (speech follow-ups A4): while the line's speak run is live
	 *   (`metadata.spoken.pending`, a run id) the line reads *Speaking…* with a
	 *   small **Stop** that raises `onStop(runId)` — the host cancels that run. The
	 *   line mounts for a pending run even before it has any audio; when the
	 *   run ends, the audio lands and *Make and play* autoplays it as before
	 *   (the `at` of the new record is what freshness reads, not the marker).
	 */
	import type { SpokenMeta } from '@serene-pub/sdk/component'
	import { mediaSrc, type MediaStripItem } from './mediaStrip'
	import {
		cueCaptionAt,
		formatClock,
		isFresh,
		isOwnVoice,
		isSpeaking,
		moodOf,
		playbackOf,
		spokenAsLine,
		spokenSinceLoad,
		voiceNameOf,
		type Playback,
		type SpokenPending,
	} from './spokenLine'

	interface Props {
		/** What the speak step recorded; null while the line has only a pending run. */
		spoken: SpokenMeta | null
		/** The speak run in flight for this line, if any (`metadata.spoken.pending`). */
		pending?: SpokenPending | null
		/** The run ids in flight, off the host's run-status pushes; absent: none known. */
		liveRunIds?: readonly string[]
		/** Stop was pressed: the host cancels this run. */
		onStop?: (runId: string) => void
		/** The line's audio file; null while it has none. */
		item: MediaStripItem | null
		/** The newest line of the log. */
		isLastMessage: boolean
		/** The session's Read aloud setting. */
		readAloud: 'off' | 'make' | 'play'
		/** The viewer's own playback choice; `never` is handled by the host (no spoken line at all). */
		spokenPlayback?: 'auto' | 'click' | 'never'
		/** The recorded voice id's display name, when the host can say it (else the record's own). */
		voiceName?: string | null
		/** The speaker's face; drawn on the voice chip when the voice is the character's own. */
		speakerFace?: string | null
		/** *Say it as…*: offered only to a viewer who may; absent, the `⋯` is not drawn. */
		onSayItAs?: () => void
		/** The audio part's file failed to load (cleared, swept): the host may say Read aloud again. */
		onGone?: (partId: number) => void
		/** 🚧 Heading audio control: the conversation says this line's strip player is the playing one. */
		playing?: boolean
		/** The rewind counter: a Stop re-keys the player so it starts over (and never autoplays again). */
		take?: number
		/** The strip player's own play / pause / ended, for the conversation's one-playing-line state. */
		onPlayback?: (paused: boolean) => void
		/** The ⋮ › Speech player's playhead while it is the one playing this line: the caption and glyph follow it too. */
		menuAt?: Playback | null
		/**
		 * 🚧 Dialogue box only (PLAN-visual-novel-layout §1.3): this line has just
		 * become the box's reading place, so its audio may play on its own as the
		 * newest line's does — under Make and play and playback `auto`, once,
		 * spoken since this page opened — newest or not, fresh or not.
		 */
		atReadingPlace?: boolean
	}
	let {
		spoken,
		pending = null,
		liveRunIds,
		onStop,
		item,
		isLastMessage,
		readAloud,
		spokenPlayback = 'auto',
		voiceName = null,
		speakerFace = null,
		onSayItAs,
		onGone,
		playing: shouldPlay = false,
		take = 0,
		onPlayback,
		menuAt = null,
		atReadingPlace = false,
	}: Props = $props()

	/** Parts already auto-played this page life, so a re-render never plays twice. */
	const played = ((globalThis as { __spAutoplayed?: Set<number> }).__spAutoplayed ??= new Set<number>())
	/** The autoplay decision per audio part, taken once: a later change never re-creates a playing player. */
	const decided = new Map<number, boolean>()
	function decide(id: number): boolean {
		const known = decided.get(id)
		if (known !== undefined) return known
		const yes =
			spokenPlayback === 'auto' &&
			readAloud === 'play' &&
			(isLastMessage || atReadingPlace) &&
			!played.has(id) &&
			!!spoken &&
			(isFresh(spoken) || atReadingPlace) &&
			spokenSinceLoad(spoken)
		decided.set(id, yes)
		if (yes) played.add(id)
		return yes
	}

	/** The run id this view last saw in flight: a run seen live and gone since is over. */
	let seenLive = $state<string | null>(null)
	$effect(() => {
		if (pending && liveRunIds?.includes(pending.runId)) seenLive = pending.runId
	})
	const speaking = $derived(isSpeaking(pending, liveRunIds, seenLive))

	/** Per part id: its file failed to load (cleared, swept). */
	let failedPart = $state<number | null>(null)
	function fail(partId: number) {
		failedPart = partId
		onGone?.(partId)
	}
	const src = $derived(item ? mediaSrc(item.assetId) : null)
	const gone = $derived(!item || failedPart === item.partId)
	// Only the FIRST element of a part may autoplay: a Stop re-key (take > 0) never does.
	const autoplay = $derived(item && spoken && !speaking && take === 0 ? decide(item.partId) : false)

	/** The last thing the player said about itself, with the part it said it for. */
	let heard = $state<{ part: number; at: Playback; ended: boolean } | null>(null)
	const playback = $derived(item && heard && heard.part === item.partId ? heard : null)
	const playing = $derived(!!playback && !playback.ended && !playback.at.paused)
	const menuPlaying = $derived(!!menuAt && !menuAt.paused)
	const caption = $derived(
		spoken && menuPlaying && menuAt
			? cueCaptionAt(spoken.cueMap, menuAt.currentTime)
			: spoken && playing && playback
				? cueCaptionAt(spoken.cueMap, playback.at.currentTime)
				: null,
	)
	const clock = $derived(
		playback && playback.at.duration > 0
			? `${formatClock(playback.ended ? playback.at.duration : playback.at.currentTime)} / ${formatClock(playback.at.duration)}`
			: null,
	)
	function hear(e: Event, ended = false) {
		const at = playbackOf((e as CustomEvent).detail)
		if (at && item) heard = { part: item.partId, at: ended ? { ...at, paused: true } : at, ended }
		if (e.type === 'play') onPlayback?.(false)
		else if (e.type === 'pause' || ended) onPlayback?.(true)
	}
	/** The host `audio`'s `playing` attribute (1.8): present while the conversation says so. */
	const playAttr = $derived(shouldPlay ? { playing: '' } : {})
	/** The player's events, spread on whichever `<audio>` is drawn. */
	const listeners = {
		onplay: (e: Event) => hear(e),
		onpause: (e: Event) => hear(e),
		ontimeupdate: (e: Event) => hear(e),
		onended: (e: Event) => hear(e, true),
		onloadedmetadata: (e: Event) => hear(e),
	}

	const asLine = $derived(spoken ? spokenAsLine(spoken, voiceName) : '')
	const name = $derived(spoken ? voiceNameOf(spoken, voiceName) : '')
	const mood = $derived(spoken ? moodOf(spoken) : null)
	const ownFace = $derived(spoken && speakerFace && isOwnVoice(spoken.spokenAs.voiceFrom) ? speakerFace : null)
</script>

<div
	data-widget-part="messages.spoken-line"
	role="group"
	aria-label="Spoken line"
	data-state={speaking ? 'speaking' : gone ? 'missing' : playing || menuPlaying ? 'playing' : 'ready'}
>
	{#if speaking && pending}
		<p data-widget-part="messages.spoken-pending" role="status">
			<span data-widget-part="messages.spoken-pulse" aria-hidden="true"><span></span><span></span><span></span></span>
			<span>Speaking…</span>
		</p>
		<button
			type="button"
			data-widget-part="messages.spoken-stop"
			aria-label="Stop speaking this line"
			title="Stop speaking this line"
			onclick={() => onStop?.(pending.runId)}
		>
			<sp-icon name="square" size="14"></sp-icon>
		</button>
	{:else if !spoken}
		<!-- A pending marker that ended with nothing recorded: nothing to show. -->
	{:else if gone || !item}
		<p data-widget-part="messages.spoken-missing">
			<sp-icon name="volume-x" size="14"></sp-icon>
			<span>Not spoken yet</span>
		</p>
	{:else}
		<span data-widget-part="messages.spoken-state" aria-hidden="true">
			<sp-icon name={playing || menuPlaying ? 'audio-lines' : 'volume-2'} size="14"></sp-icon>
		</span>
		{#key `${item.partId}:${take}`}
			{#if autoplay}
				<audio
					data-widget-part="messages.spoken-audio"
					aria-label="Play the spoken line"
					controls
					autoplay
					{...playAttr}
					preload="auto"
					{src}
					onerror={() => fail(item.partId)}
					{...listeners}
				></audio>
			{:else}
				<audio
					data-widget-part="messages.spoken-audio"
					aria-label="Play the spoken line"
					controls
					{...playAttr}
					preload="metadata"
					{src}
					onerror={() => fail(item.partId)}
					{...listeners}
				></audio>
			{/if}
		{/key}
		{#if clock}<span data-widget-part="messages.spoken-time">{clock}</span>{/if}
		<span data-widget-part="messages.spoken-voice" title={asLine}>
			{#if ownFace}
				<img data-widget-part="messages.spoken-face" src={ownFace} alt="" />
			{:else}
				<sp-icon name="mic" size="12"></sp-icon>
			{/if}
			<span aria-hidden="true">{name}</span>
			<span data-widget-part="messages.spoken-sr">{asLine}</span>
		</span>
		{#if mood}<span data-widget-part="messages.spoken-mood">{mood}</span>{/if}
		{#if onSayItAs}
			<sp-menu
				placement="bottom-end"
				label="Spoken line options"
				onselect={(e: CustomEvent<{ value: string }>) => {
					if (e.detail.value === 'say-it-as') onSayItAs?.()
				}}
			>
				<button
					slot="trigger"
					type="button"
					data-widget-part="messages.spoken-menu"
					aria-label="More about this spoken line"
					title="More about this spoken line"
				>
					<sp-icon name="ellipsis" size="14"></sp-icon>
				</button>
				<sp-menu-item value="say-it-as">
					<sp-icon name="drama" size="12"></sp-icon>
					<span>Say it as…</span>
				</sp-menu-item>
			</sp-menu>
		{/if}
		{#if caption}<p data-widget-part="messages.spoken-caption" aria-hidden="true">{caption}</p>{/if}
	{/if}
</div>
