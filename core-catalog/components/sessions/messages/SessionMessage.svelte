<script lang="ts">
	import { messageEnvoySlug } from "@serene-pub/core-catalog/conversation"
	import MessageComposer from "./MessageComposer.svelte"
	import MessageControls from "./MessageControls.svelte"
	import {
		enabledWhenState,
		quickRowActions,
		verdictOf
	} from "@serene-pub/core-catalog/conversation"
	import { actionIdentity, foldedSectionsOf } from "@serene-pub/sdk/component"
	import MessagePartsView from "./MessagePartsView.svelte"
	import MessageStateLedger from "./MessageStateLedger.svelte"
	import { useWidgetContext } from "../shared/context"
	import { staleOf } from "@serene-pub/core-catalog/conversation"
	import { untrack } from "svelte"
	import { useConversation } from "./conversation.svelte"
	import type { MessageV1, WidgetAction } from "@serene-pub/sdk/component"

	/**
	 * One line of the conversation (C0b). It is handed its row and where it
	 * sits; everything else is the conversation's (`useConversation`) — who
	 * spoke, what the viewer controls, what is being edited or selected — and
	 * every press is one of its verbs.
	 */
	interface Props {
		msg: MessageV1
		index: number
		isLastMessage: boolean
		/**
		 * The scene this message belongs to, when it belongs to one — the log
		 * reads it off its scene map. The row also carries the scene's colour
		 * as `--sp-scene`, which the badge below inherits.
		 */
		sceneName?: string | null
	}

	let { msg, index, isLastMessage, sceneName = null }: Props = $props()

	const conv = useConversation()
	const line = $derived(conv.line(msg.id))
	const allMessages = $derived(conv.ctx.messages.v1)
	const hasGeneratingMessage = $derived(allMessages.some((m) => m.isGenerating))
	const extendRefusal = $derived(conv.dossier?.extendRefusal)
	const isSummarizationMode = $derived(conv.select.active)
	const isSelected = $derived(conv.select.ids.has(msg.id))
	const scened = $derived(conv.dossier?.scened.includes(msg.id) ?? false)

	/**
	 * The unified widget envelope (PLAN 25, ruled 2026-08-30). Present at the
	 * one real site — SessionLayout renders the `messages` widget's snippet
	 * inside a `WidgetHost`, and Svelte resolves context where a snippet RENDERS
	 * rather than where it was declared, so the host's ctx reaches down here.
	 * Undefined anywhere else (a standalone mount, a test), which is why every
	 * read below keeps its prop as the fallback.
	 */
	const widget = useWidgetContext()
	const ctx = $derived(widget?.current)

	/**
	 * The first two of this component's ~16 `onXxx` callbacks to move onto the
	 * envelope, because they are the two that were already action-shaped — a
	 * verb plus this message as its subject, which is exactly `ctx.action`'s
	 * signature.
	 *
	 * The two routes are the SAME call, not two spellings of a similar one:
	 * the envelope's `invoke` resolves the identity against `ctx.actions.v1`
	 * and hands the press to the host's `actionDispatch`, whose `fire` IS
	 * +page's `fireOfferedAction` — the one the prop reaches through
	 * `fireMenuAction`. One function, one emit, one permission check, so the
	 * run is named and the narrator's modal opens whichever way it was
	 * pressed. `ctx.action` (⏳) remains the block lane's fallback and lands
	 * on the same function by way of `handleFrameAction`.
	 */
	/**
	 * A contributed action fired from the options menu or the quick row
	 * (19 §4), its identity riding along (W1) so the server checks THAT
	 * declaration and runs THAT spec.
	 */
	function fireOfferedAction(action: WidgetAction, m: MessageV1) {
		conv.invoke(actionIdentity(action), m)
	}

	/**
	 * A declared block action inside a parts-native body (20 §6). `action`
	 * is the identity the block was stamped with by the outlet that wrote it
	 * (W-E) — carried, never chosen here — so the server checks THAT
	 * declaration; a block with none fires legacy (the owner floor).
	 */
	function fireBlockAction(
		fn: string,
		m: MessageV1,
		payload?: Record<string, unknown>,
		action?: string,
		blockId?: string
	) {
		// ⏳ `action`, not `invoke`: a block's `action` is the identity the
		// OUTLET stamped it with (W-E), which need not be listed in any venue of
		// this session, and `invoke` refuses a reference no venue lists. The
		// host forwards all five arguments, so the identity and the block
		// survive the hop and the server holds the press to the block's
		// addressee.
		conv.ctx.action(fn, m.id, payload, action, blockId)
	}

	const messageCount = $derived(allMessages.length)

	/**
	 * The face beside this line (DESIGN-sprites §7). With the messages widget's
	 * `avatarFace` setting at `sprite`, a line shows the sprite it was SHOWN —
	 * set and label recorded on the line itself, so scrolling back past an
	 * outfit change keeps the old outfit on the old lines. The default is the
	 * avatar, because a face per line is busy in the bubble skins. The message
	 * id picks among a label's variants, so one line always shows one image.
	 */
	let showLineSprite = $derived(
		(ctx?.settings?.v1 as { avatarFace?: string } | undefined)?.avatarFace ===
			"sprite"
	)
	let faceSrc = $derived(
		showLineSprite ? (line.speaker.sprite ?? line.speaker.face) : line.speaker.face
	)
	const narratorDisplayName = $derived(
		msg.metadata?.narratorName || "Narrator"
	)
	/** Who this message is from, as the header prints it. */
	const displayName = $derived(
		msg.isNarratorResponse ? narratorDisplayName : line.speaker.name
	)
	/**
	 * The member a role-named line belongs to (R4): "Dungeon Master · jody"
	 * on a shared session's persona-less line, drawn muted after the name.
	 * The page sends it only when the session has more than one member.
	 */
	const speakerMember = $derived(
		msg.isNarratorResponse ? undefined : line.speaker.member?.trim() || undefined
	)
	/** The disc a speaker with no picture gets: their initial. */
	const avatarInitial = $derived(
		displayName.trim().charAt(0).toUpperCase() || "?"
	)
	const isGreeting = $derived(!!msg.metadata?.isGreeting)
	// Two independent classifications the style packs (sessionLayout skins) key
	// off. The one SessionMessage renders every layout; these attributes are
	// what a bubbles/compact/moonlit skin uses for alignment, colour and
	// avatar placement.
	//   data-msg-role   = user | assistant | narration  (who's speaking, by turn)
	//   data-msg-author = persona | character | narrator (which entity kind)
	// They usually agree (a persona speaks as 'user', a character as 'assistant')
	// but are kept separate so a skin can leverage either — e.g. impersonation,
	// or group chats where the split matters.
	const msgRole = $derived(
		msg.isNarratorResponse
			? "narration"
			: msg.role === "user"
				? "user"
				: "assistant"
	)
	/** An envoy's line (U5g): named by reference, no character row behind it. */
	const isEnvoy = $derived(messageEnvoySlug(msg) !== null)
	const msgAuthor = $derived(
		msg.isNarratorResponse
			? "narrator"
			: msg.personaId != null
				? "persona"
				: msg.characterId != null
					? "character"
					: isEnvoy
						? "envoy"
						: "unknown"
	)
	const canControl = $derived(line.controllable)
	const showSwipes = $derived(line.swipes.show)
	/**
	 * The swipe arrow's gate is the swipe verb's own enabled-when (U5e,
	 * review W3): the list's verdict, then the `item.*` predicates — the
	 * newest row, a swipe to take — judged against this row exactly as the
	 * ⋮ menu's Swipe entry and the server's door judge them, so the arrow
	 * and the entry can never disagree. `canSwipeRight` (the page's older
	 * compound) is ⏳ unread here since U5e and kept on the prop chain one
	 * release. With no listed swipe verb (an older server) the arrow is
	 * open to the item rule alone.
	 */
	const swipeWhen = $derived.by(() => {
		const listed = [
			...(venueActions?.primary ?? []),
			...(venueActions?.overflow ?? [])
		].find((a) => a.specSlug === "core" && a.key === "swipe")
		if (!listed) return [false, undefined] as const
		return enabledWhenState({
			msg,
			isLastMessage,
			canControl,
			...verdictOf(listed)
		})
	})
	// Native model thinking (from Ollama think: true, etc.) — `thinking` is
	// written into the row's metadata by the narrate spec's placeholder outlet,
	// for the active swipe.
	const thinkingContent = $derived(msg.metadata?.thinking || "")
	const hasThinking = $derived(thinkingContent.trim().length > 0)

	// Optional per-trigger focus note for a Narrator response (e.g. "Focus on
	// the weather turning stormy") — set once at trigger time, see sessions.ts's
	// narratorMessage.metadata.narratorInstructions.
	const narratorInstructionsContent = $derived(
		msg.metadata?.narratorInstructions || ""
	)
	const hasNarratorInstructions = $derived(
		narratorInstructionsContent.trim().length > 0
	)

	let isThinkingExpanded = $state(false)
	let isNarratorInstructionsExpanded = $state(false)

	// The shown alternative's folded sections (B4) — for a row that arrives
	// without its parts (a streamed frame's announce, a swipe), which the
	// parts view would otherwise draw. Expanded state by position.
	const foldedSections = $derived(foldedSectionsOf(msg.metadata))
	let expandedSections = $state<Record<number, boolean>>({})

	// The edit buffer: the widget owns edit mode (`conv.edit`); the row's text
	// is copied in when editing starts, and saving is the `edit` verb.
	const isEditing = $derived(conv.edit.id === msg.id)
	let editContent = $state("")
	$effect(() => {
		if (isEditing) editContent = untrack(() => msg.content)
	})
	// Parts-native rendering (20 §13 phase 2): when the server attached the
	// message's typed parts and the message is settled, the body — thinking
	// and section collapsibles included — renders from them. Streaming,
	// errors, and unenriched broadcasts fall back to the legacy fields, which
	// are parity-identical by construction.
	const partsNative = $derived(
		!!msg.parts?.length && !msg.isGenerating && !msg.error && !isEditing
	)

	const isEditDirty = $derived(isEditing && editContent !== msg.content)
	// Empty is blocked as well as unchanged: clearing a message to nothing
	// leaves an unreadable stub in the thread, and Delete is the control that
	// actually expresses that intent.
	const canSaveEdit = $derived(isEditDirty && editContent.trim().length > 0)

	/** A `date` column carries the day only; a time of day needs a timestamp. */
	const DAY_ONLY = /^\d{4}-\d{2}-\d{2}$/

	/**
	 * The clock beside the name, in the reader's own locale. `createdAt` is a
	 * day-precision `date` column on this row (20 §5), so a value with no time
	 * of day in it reads `updatedAt`, which is a timestamp.
	 */
	const messageTime = $derived.by(() => {
		const created: unknown = msg.createdAt
		const stamp =
			typeof created === "string" && DAY_ONLY.test(created)
				? (msg.updatedAt ?? created)
				: (created ?? msg.updatedAt)
		if (!stamp) return ""
		const at =
			stamp instanceof Date ? stamp : new Date(stamp as string | number)
		if (Number.isNaN(at.getTime())) return ""
		return at.toLocaleTimeString([], {
			hour: "numeric",
			minute: "2-digit"
		})
	})

	/**
	 * What the ember dot beside the name says while a reply is being made:
	 * the run's own status (R-19) — *Jasmine is thinking*, *Jasmine is
	 * typing*, *loading the model* — resolved in the reader's language. A
	 * row with none says *working* until its run's first status lands.
	 */
	const generatingStatus = $derived(
		conv.statusText(msg.generationStatus) || conv.t("working")
	)

	// ── the quick actions ────────────────────────────────────────────────
	// The message venue's PRIMARY set (R-15 `quick`, U5c), one click away on
	// the row itself — core's verbs and a plugin's `quick` message action
	// alike (S8) — each shown on exactly the messages the ⋮ menu offers it
	// on and only while the menu would have it enabled, through the one verb
	// table both read (`quickRowActions`). The menu keeps the full list,
	// including the entries that are disabled and explained. Stop is the
	// primary set's too, but it has its own pill below rather than an icon.
	//
	// The list arrives on the widget envelope when a host provides one, the
	// prop otherwise; with neither, the floors alone.
	const venueActions = $derived(
		ctx?.actions?.v1?.message as
			| { primary: WidgetAction[]; overflow: WidgetAction[] }
			| undefined
	)
	const quickActions = $derived(
		quickRowActions(venueActions?.primary ?? [], {
			msg,
			isLastMessage,
			editing: conv.edit.id !== null,
			hasGeneratingMessage,
			canControl,
			extendRefusal
		})
	)
	const showQuickActions = $derived(
		!isSummarizationMode && !isEditing && quickActions.length > 0
	)

	/**
	 * A quick icon fires the same handler the menu's row does: core's verbs
	 * to the page's handlers, a contributed action through `fireOfferedAction`
	 * with this message as the subject.
	 */
	function fireQuick(_e: Event, action: WidgetAction) {
		if (action.specSlug !== "core") return fireOfferedAction(action, msg)
		if (action.key === "edit") return conv.edit.start(msg)
		if (action.key === "swipe") return conv.swipe(msg, "right")
		conv.invoke(action.key, msg)
	}

	/** The swipe counter is drawn only where there is a history to count. */
	const swipes = $derived(msg.metadata?.swipes)
	const hasSwipeHistory = $derived(
		swipes?.currentIdx !== null &&
			swipes?.currentIdx !== undefined &&
			!!swipes?.history &&
			swipes.history.length > 1
	)

	function handleMessageUpdate() {
		if (!canSaveEdit) return
		conv.edit.save(msg, editContent)
	}

	function toggleThinking() {
		isThinkingExpanded = !isThinkingExpanded
	}

	function toggleNarratorInstructions() {
		isNarratorInstructionsExpanded = !isNarratorInstructionsExpanded
	}

	// An image inside the rendered text is the host's markup; `sp-message-body`
	// raises `open-image` with its address.
	const openImage = (e: CustomEvent<{ src: string }>) =>
		void conv.request("view-image", { src: e.detail.src })
</script>

<!-- A <div>, not an <li>: SessionContainer already wraps each message in its own
     <li> (the row that carries `--sp-scene`), so an <li> here nests a list item
     inside a list item — invalid HTML that confuses assistive-tech list
     semantics. The role="article" below is what carries the semantics.

     The four cells are the style packs' contract: avatar, identity, controls,
     content, plus the `data-msg-*` attributes a pack keys its look off. Every
     element is a widget part (`messages.message-*`, STYLE-GUIDE §6.16): no look
     here; the default widget stylesheet draws them, and a pack restyles them. -->
<div
	id="message-{msg.id}"
	data-widget-part="messages.message"
	data-msg-role={msgRole}
	data-msg-author={msgAuthor}
	data-msg-state={isEditing
		? "editing"
		: isSummarizationMode
			? isSelected
				? "selected"
				: "dim"
			: "normal"}
	data-msg-generating={msg.isGenerating ? "" : undefined}
	data-msg-hidden={msg.isHidden ? "" : undefined}
	data-msg-greeting={isGreeting ? "" : undefined}
	data-msg-newest={isLastMessage ? "" : undefined}
	tabindex="-1"
	role="article"
	aria-label="Message {index +
		1} of {messageCount} from {displayName}{speakerMember ? ` · ${speakerMember}` : ''}: {msg.content.slice(0, 100)}{msg
		.content.length > 100
		? '...'
		: ''}"
>
	<span data-widget-part="messages.message-avatar">
		{#if msg.isNarratorResponse}
			<span
				data-widget-part="messages.message-avatar-glyph"
				title={narratorDisplayName}
				aria-hidden="true"
			>
				<sp-icon name="cloud-sun" size="1.25em"></sp-icon>
			</span>
		{:else}
			<!-- Avatar rendered directly (not the reusable Avatar component):
			     Skeleton hard-sizes its avatar root, which fought the layout
			     CSS. A plain img/glyph lets each style pack own size and shape. -->
			<button
				data-widget-part="messages.message-avatar-button"
				onclick={() => line.speaker.ref && void conv.request("view-avatar", { ref: line.speaker.ref })}
				aria-label="View {displayName}'s avatar"
			>
				{#if faceSrc}
					<img
						data-widget-part="messages.message-avatar-img"
						src={faceSrc}
						alt={displayName}
					/>
				{:else}
					<span data-widget-part="messages.message-avatar-glyph" aria-hidden="true">
						{avatarInitial}
					</span>
				{/if}
			</button>
		{/if}
	</span>

	<div data-widget-part="messages.message-identity">
		{#if msg.isNarratorResponse}
			<span data-widget-part="messages.message-name" title={narratorDisplayName}>
				{narratorDisplayName}
			</span>
		{:else if isEnvoy}
			<!-- Nothing to open: an envoy has no character page. -->
			<span data-widget-part="messages.message-name" title={displayName}>
				{displayName}
			</span>
		{:else}
			<button
				data-widget-part="messages.message-name"
				onclick={() => {
					const id = msg.characterId ?? msg.personaId
					if (id) void conv.request("open-character", { characterId: id })
				}}
				title={displayName}
			>
				{displayName}
			</button>
		{/if}
		{#if speakerMember}
			<span data-widget-part="messages.message-member">· {speakerMember}</span>
		{/if}

		<span data-widget-part="messages.message-badges">
			{#if isGreeting}
				<span
					data-widget-part="messages.message-badge"
					role="img"
					aria-label="Greeting message"
				>
					<sp-icon name="handshake" size="14"></sp-icon>
				</span>
			{/if}
			{#if msg.isHidden}
				<span
					data-widget-part="messages.message-badge"
					role="img"
					aria-label="Hidden from the model"
				>
					<sp-icon name="ghost" size="14"></sp-icon>
				</span>
			{/if}
			{#if sceneName}
				<!-- Colour comes from `--sp-scene` on the row this message
				     sits in, so the badge and the pack's scene bar are the
				     same colour by construction. -->
				<span data-widget-part="messages.message-badge messages.message-badge-scene">
					<sp-icon name="film" size="14"></sp-icon>
					<span data-widget-part="messages.message-badge-label">In scene:</span>
					<span data-widget-part="messages.message-badge-text">{sceneName}</span>
				</span>
			{/if}
			<!-- The line's vectors against the active embedding model: nothing
			     at all while that is hidden (the common case); which it is
			     rides `data-vectors`. -->
			{#if line.embedding === "current"}
				<span data-widget-part="messages.message-vectors" data-vectors="current" title="Vectors up to date" aria-label="Vectors up to date">
					<sp-icon name="zap" size="12"></sp-icon>
				</span>
			{:else if line.embedding === "stale"}
				<span data-widget-part="messages.message-vectors" data-vectors="stale" title="Vectors stale — model changed" aria-label="Vectors stale — model changed">
					<sp-icon name="refresh-cw" size="12"></sp-icon>
				</span>
			{/if}
		</span>

		{#if msg.isGenerating}
			<span data-widget-part="messages.message-status">
				<span data-widget-part="messages.message-ember" aria-hidden="true"></span>
				{generatingStatus}
			</span>
		{:else if isEditing}
			<span data-widget-part="messages.message-status">Editing</span>
		{:else if msg.generationOutcome === "stopped"}
			<!-- The explicit outcome (R-15): a reply somebody stopped, holding
			     the partial text. Cleared by the next regenerate or extend on
			     the row, and by a swipe onto another alternative — the stop
			     belongs to the alternative that was streaming, so selecting a
			     different one leaves the mark behind. -->
			<span data-widget-part="messages.message-status" title="This reply was stopped before it finished">
				Stopped
			</span>
		{/if}
	</div>

	<div data-widget-part="messages.message-controls">
		{#if isEditing}
			<button
				data-widget-part="messages.message-cancel"
				title="Cancel edit (Esc)"
				onclick={() => conv.edit.cancel()}
			>
				Cancel
			</button>
			<button
				data-widget-part="messages.message-save"
				title={canSaveEdit
					? "Save changes (Ctrl+Enter)"
					: isEditDirty
						? "A message can't be saved empty"
						: "No changes to save"}
				disabled={!canSaveEdit}
				onclick={handleMessageUpdate}
			>
				Save
			</button>
		{:else}
			{#if messageTime}
				<span data-widget-part="messages.message-time">{messageTime}</span>
			{/if}

			{#if showSwipes}
				<div data-widget-part="messages.message-swipes">
					{#if hasSwipeHistory}
						<button
							data-widget-part="messages.message-swipe-previous messages.message-icon-button"
							aria-label="Previous swipe"
							onclick={() => conv.swipe(msg, "left")}
							disabled={conv.edit.id !== null ||
								!swipes!.currentIdx ||
								swipes!.history.length <= 1 ||
								msg.isGenerating ||
								!canControl}
						>
							<sp-icon name="chevron-left" size="14"></sp-icon>
						</button>
						<!-- tabular-nums + a min width so stepping 9/12 -> 10/12
						     doesn't shove the arrows sideways. -->
						<span data-widget-part="messages.message-swipe-count" aria-live="polite">
							{(swipes!.currentIdx || 0) + 1} / {swipes!.history
								.length}
						</span>
					{/if}
					<button
						data-widget-part="messages.message-swipe-next messages.message-icon-button"
						aria-label="Next swipe"
						title={swipeWhen[1] ? `Next swipe — ${swipeWhen[1]}` : undefined}
						onclick={() => conv.swipe(msg, "right")}
						disabled={conv.edit.id !== null || swipeWhen[0] || !canControl}
					>
						<sp-icon name="chevron-right" size="14"></sp-icon>
					</button>
				</div>
			{/if}

			{#if showQuickActions}
				<!-- The icons fade in on hover and focus on a fine pointer and
				     stand permanently on a coarse one — see messageLayouts.css,
				     STYLE-GUIDE §9. -->
				<div
					data-widget-part="messages.message-actions"
					role="group"
					aria-label="Message actions"
				>
					{#each quickActions as { action } (actionIdentity(action))}
						{@const iconName = action.icon || "play"}
						<!-- Icon-only: the accessible name is the declaration's
						     `iconAlt`, else its name; the tooltip adds what it
						     does (the legend, 2026-09-28). -->
						<button
							data-widget-part="messages.message-action messages.message-icon-button"
							aria-label={action.iconAlt || action.name}
							title={action.description
								? `${action.name} — ${action.description}`
								: action.name}
							onclick={(e) => fireQuick(e, action)}
						>
							<sp-icon name={iconName} size="14"></sp-icon>
						</button>
					{/each}
				</div>
			{/if}

			<div data-widget-part="messages.message-menu">
				{#if isSummarizationMode}
					<!-- Selecting lines for a summary: this line's own choice, and
					     the two range selections. A line a scene already captured
					     cannot join another. -->
					<div data-widget-part="messages.message-selection" role="group" aria-label="Selection controls">
						{#if scened}
							<span
								data-widget-part="messages.message-in-scene messages.message-selection-button"
								title="Already captured in a scene"
								aria-label="Already captured in a scene"
							>
								<sp-icon name="film"></sp-icon>
								<span data-widget-part="messages.message-selection-label">In Scene</span>
							</span>
						{:else}
							<button
								data-widget-part="messages.message-select messages.message-selection-button"
								title={isSelected ? "Deselect message" : "Select message"}
								aria-label={isSelected ? "Deselect message" : "Select message"}
								aria-pressed={isSelected}
								onclick={() => conv.select.toggle(msg)}
							>
								<sp-icon name={isSelected ? "check-square" : "square"}></sp-icon>
								<span data-widget-part="messages.message-selection-label">{isSelected ? "Deselect" : "Select"}</span>
							</button>
							<button
								data-widget-part="messages.message-select-above messages.message-selection-button"
								title="Select all above up to nearest selected"
								aria-label="Select all above up to nearest selected"
								onclick={() => conv.select.range(index, "above")}
							>
								<sp-icon name="chevrons-up"></sp-icon>
								<span data-widget-part="messages.message-selection-label">Select all above</span>
							</button>
							<button
								data-widget-part="messages.message-select-below messages.message-selection-button"
								title="Select all below up to nearest selected"
								aria-label="Select all below up to nearest selected"
								onclick={() => conv.select.range(index, "below")}
							>
								<sp-icon name="chevrons-down"></sp-icon>
								<span data-widget-part="messages.message-selection-label">Select all below</span>
							</button>
						{/if}
					</div>
				{:else}
					<MessageControls {msg} {isLastMessage} />
				{/if}
			</div>

			{#if msg.isGenerating}
				<button
					data-widget-part="messages.message-stop"
					onclick={() => conv.invoke("stop", msg)}
				>
					<sp-icon name="square" size="14"></sp-icon>
					Stop
				</button>
			{/if}
		{/if}
	</div>

	<div data-widget-part="messages.message-content">
		<!-- The collapsibles a reply can carry: the Narrator's per-trigger
		     focus note, its folded sections (a Plan, B4) and the model's own
		     thinking. All are suppressed when parts render — the section and
		     thinking parts carry them there, in the same order. -->
		{#if (hasNarratorInstructions || hasThinking || foldedSections.length) && !partsNative}
			<div data-widget-part="messages.message-disclosures">
				{#if hasNarratorInstructions}
					<div data-widget-part="messages.message-disclosure">
						<button
							data-widget-part="messages.message-disclosure-toggle"
							onclick={toggleNarratorInstructions}
							aria-expanded={isNarratorInstructionsExpanded}
							aria-controls="extra-instructions-{msg.id}"
						>
							<sp-icon name="target" size="14"></sp-icon>
							<span>Extra instructions</span>
							<sp-icon name="chevron-down" size="14"></sp-icon>
						</button>
						<!-- grid 0fr -> 1fr is the only way to transition to/from an
						     auto height in pure CSS. The inner overflow-hidden
						     wrapper is required: the track collapses to 0 but the
						     content keeps its intrinsic height, so without it the
						     text spills out. Content stays mounted while collapsed
						     because a transition needs both endpoints to exist —
						     and the skin hides a collapsed track's content, since
						     a 0fr track still contains focusable content
						     (`messages.message-disclosure-track`, widgets.css). -->
						<div
							id="extra-instructions-{msg.id}"
							data-widget-part="messages.message-disclosure-track"
							data-expanded={isNarratorInstructionsExpanded ? "" : undefined}
						>
							<div data-widget-part="messages.message-disclosure-clip">
								<div
									data-widget-part="messages.message-disclosure-panel messages.prose"
								>
									<sp-message-body text={narratorInstructionsContent}></sp-message-body>
								</div>
							</div>
						</div>
					</div>
				{/if}

				{#each foldedSections as section, i (i)}
					<div data-widget-part="messages.message-disclosure">
						<button
							type="button"
							data-widget-part="messages.message-disclosure-toggle"
							onclick={() => (expandedSections[i] = !expandedSections[i])}
							aria-expanded={!!expandedSections[i]}
							aria-controls="folded-section-{msg.id}-{i}"
						>
							<sp-icon
								name={section.kind === "thinking" ? "brain-circuit" : "notebook-pen"}
								size="14"
							></sp-icon>
							<span>{section.label}</span>
							<sp-icon name="chevron-down" size="14"></sp-icon>
						</button>
						<!-- See the first block for why this is a grid track. -->
						<div
							id="folded-section-{msg.id}-{i}"
							data-widget-part="messages.message-disclosure-track"
							data-expanded={expandedSections[i] ? "" : undefined}
						>
							<div data-widget-part="messages.message-disclosure-clip">
								<div
									data-widget-part="messages.message-disclosure-panel messages.prose"
								>
									{#if section.items}
										<ul data-widget-part="messages.fold-list">
											{#each section.items as item, j (j)}
												<li>{item}</li>
											{/each}
										</ul>
									{:else}
										<sp-message-body text={section.content ?? ""}></sp-message-body>
									{/if}
								</div>
							</div>
						</div>
					</div>
				{/each}

				{#if hasThinking}
					<div data-widget-part="messages.message-disclosure">
						<button
							data-widget-part="messages.message-disclosure-toggle"
							onclick={toggleThinking}
							aria-expanded={isThinkingExpanded}
							aria-controls="thinking-{msg.id}"
						>
							<sp-icon name="brain-circuit" size="14"></sp-icon>
							<span>Thinking</span>
							<sp-icon name="chevron-down" size="14"></sp-icon>
						</button>
						<!-- See the block above for why this is a grid track. -->
						<div
							id="thinking-{msg.id}"
							data-widget-part="messages.message-disclosure-track"
							data-expanded={isThinkingExpanded ? "" : undefined}
						>
							<div data-widget-part="messages.message-disclosure-clip">
								<div
									data-widget-part="messages.message-disclosure-panel messages.prose"
								>
									<sp-message-body text={thinkingContent}></sp-message-body>
								</div>
							</div>
						</div>
					</div>
				{/if}
			</div>
		{/if}

		<!-- Padding-free wrapper that carries the height change of a discrete
		     swap (swiping between alternatives, entering or leaving edit, an
		     error replacing content) — in CSS, the conversation skin's
		     `messages.message-sizer`, where the engine can interpolate to `auto`. Not while
		     generating: the height changes on every token, and a transition
		     would trail the text instead of settling. -->
		<div data-widget-part="messages.message-sizer" data-settled={msg.isGenerating ? undefined : ""}>
			<div data-widget-part="messages.message-body">
				{#if msg.error}
					<div data-widget-part="messages.message-failure">
						{#if msg.content}
							<div data-widget-part="messages.message-partial messages.prose">
								<sp-message-body text={msg.content}></sp-message-body>
							</div>
						{/if}
						<div data-widget-part="messages.message-error">
							<p data-widget-part="messages.message-error-line">
								<sp-icon name="alert-triangle" size="14" data-widget-part="messages.message-error-icon"></sp-icon>
								<span>
									{msg.error.message}{#if msg.error.code}
										({msg.error.code}){/if}
								</span>
							</p>
							<!--
						Presence IS permission. `error.connection` is connection
						identity, and the server removes that key from every
						payload a non-admin receives (connections/visibility.ts),
						so a client that renders it whenever it arrives shows it
						only to administrators — no role check here to drift out
						of step with the one on the server.

						The sentence above names no connection by construction,
						which is what lets it be stored and shown to anybody; this
						is where an administrator gets back the half it left out —
						which connection, and what the service actually said.
					-->
							{#if msg.error.connection?.name || msg.error.connection?.detail}
								<p data-widget-part="messages.message-error-detail">
									{[
										msg.error.connection.name,
										msg.error.connection.model
									]
										.filter(Boolean)
										.join(" · ")}{msg.error.connection
										.detail
										? `${msg.error.connection.name ? "\n" : ""}${msg.error.connection.detail}`
										: ""}
								</p>
							{/if}
							<button
								data-widget-part="messages.message-retry"
								onclick={() => conv.invoke("retry", msg)}
							>
								Retry
							</button>
						</div>
					</div>
				{:else if isEditing}
					<!-- One surface: the panel IS the field. The textarea below
					     drops its own border, radius and fill (see `edit-field`)
					     and simply lays text on this one. -->
					<div
						data-widget-part="messages.edit-surface"
					>
						<MessageComposer
							bind:markdown={editContent}
							onSend={handleMessageUpdate}
							onCancel={() => conv.edit.cancel()}
							enterBehavior="newline"
							placeholder="Edit this message…"
							autofocus
						/>
						<!-- Transient: it exists only while an edit is open, so
						     it can't become permanent noise. -->
						<div
							data-widget-part="messages.edit-hint"
						>
							<span>
								<kbd data-widget-part="messages.edit-key">Ctrl</kbd>
								+
								<kbd data-widget-part="messages.edit-key">Enter</kbd>
								to save
							</span>
							<span aria-hidden="true" data-widget-part="messages.edit-hint-separator">·</span>
							<span>
								<kbd data-widget-part="messages.edit-key">Esc</kbd>
								to cancel
							</span>
							{#if isEditDirty}
								<span
									data-widget-part="messages.edit-unsaved"
								>
									Unsaved changes
								</span>
							{/if}
						</div>
					</div>
				{:else if partsNative}
					<!-- The parts-native body (20 §2): markdown, thinking,
				     sections, steps — everything typed renders from parts. -->
					<div data-widget-part="messages.message-parts">
						<MessagePartsView
							messageId={msg.id}
							parts={msg.parts!}
							activeRevisions={msg.activeRevisions ?? { "0": 0 }}
							onOpenImage={(src) => void conv.request("view-image", { src })}
							bodyText={msg.content ?? ""}
							onAction={(fn, payload, action, blockId) =>
								fireBlockAction(fn, msg, payload, action, blockId)}
							canAnswer={(addressee) => conv.canAnswer(addressee)}
							isStale={(block) =>
								staleOf(block, msg, allMessages)}
						/>
					</div>
				{:else}
					<!-- `data-streaming`: text is arriving (the row is generating and
					     has some), which the sheet pulses. -->
					<div
						data-widget-part="messages.message-text messages.prose"
						data-streaming={msg.isGenerating && msg.content ? "" : undefined}
					>
						<sp-message-body
							text={msg.content}
							streaming={msg.isGenerating ? "" : undefined}
							onopen-image={openImage}
						></sp-message-body>
					</div>
				{/if}
			</div>
		</div>

		<!-- What this turn changed, and what it is still asking for (the stats
		     and states ledger). Renders nothing at all for a message that
		     changed nothing, which is almost every message — and it is outside
		     the height-animated wrapper above, because a decision landing here
		     must not look like the body re-rendering. -->
		<MessageStateLedger messageId={msg.id} />
	</div>
</div>
