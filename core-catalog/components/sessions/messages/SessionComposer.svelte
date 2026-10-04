<script lang="ts">
	/**
	 * Core's composer (C0b): the field you write into, the persona you write
	 * as, the lane, the session's action chips and its More panel. It reads
	 * the conversation (`useConversation`) and the dossier's composer part;
	 * sending, the draft and a persona switch are requests core's own widget
	 * may make, a press of an action is `invoke`, and the page's own parts —
	 * the chips, the turn controls, the panels, the run card, the retrieval
	 * notice — are host views it places (`sp-host-view`).
	 */
	import {
		exactPaletteMatch,
		exactSlashCommand,
		filterPaletteActions,
		paletteRowState,
		slashArgumentHint,
		slashArgumentRefusal,
		slashQueryOf,
		stepHighlight,
		type PaletteAction
	} from "@serene-pub/core-catalog/conversation"
	import { actionIdentity } from "@serene-pub/sdk/component"
	import type { ItemValues } from "@serene-pub/core-catalog/conversation"
	import {
		ATTACHMENT_KINDS_V1,
		KIND_FORMATS,
		KIND_NAME,
		preCheckFiles,
		readerCallLines,
		readersSummary,
		sendableTrayIds,
		sniffAttachmentKind,
		uploadingNote,
		type TrayItemV1,
		type TrayRefusalV1
	} from "@serene-pub/core-catalog/conversation"
	import { i18nText } from "@serene-pub/sdk/component"
	import { untrack } from "svelte"
	import { useConversation } from "./conversation.svelte"
	import type { WidgetAction } from "@serene-pub/sdk/component"

	/** The More panel's tab that is not a pane: the turn controls, in the actions row. */
	const TURN_CONTROLS_VIEW = "session-controls"

	interface Props {
		/** How the composer is drawn (a widget setting). */
		composerSkin?: "classic" | "minimal" | "writer" | "quill"
		/** Hides the Actions label and its row outright. */
		showActions?: boolean
	}

	let { composerSkin = "classic", showActions = true }: Props = $props()

	const conv = useConversation()
	const c = $derived(conv.dossier?.composer)
	const hideCompose = $derived(!!c?.hidden)
	const channels = $derived(c?.channels ?? [])
	const overflowActions = $derived((c?.overflow ?? []) as WidgetAction[])
	const paletteActions = $derived((c?.palette ?? []) as PaletteAction[])
	const newestItem = $derived((c?.newest ?? null) as ItemValues | null)
	const sendTonal = $derived(!!c?.sendTonal)
	const actionsListed = $derived(!!c?.actions)

	/**
	 * The draft: the composer's own between the host's writes. A write — the
	 * kept draft when the session opens, an empty one when an action spent
	 * it — replaces the field, whatever it holds; the same write, re-posted
	 * with the rest of the dossier, never does.
	 */
	let draft = $state("")
	let written: number | null = null
	let writtenFor: number | null = null
	$effect(() => {
		const write = c?.draft ?? null
		const session = conv.dossier?.sessionId ?? null
		// Another session: its own draft, never the last one's.
		if (session === writtenFor && (write?.write ?? null) === written) return
		writtenFor = session
		written = write?.write ?? null
		setField(write?.content ?? "")
	})
	// The host keeps the draft (and counts its tokens): told as it changes.
	$effect(() => {
		const content = draft
		const t = setTimeout(() => void conv.request("draft", { content }), 150)
		return () => clearTimeout(t)
	})

	/**
	 * What the field is told to show. The field is the host's between writes
	 * (the caret stays on the page), so a write is a reset — and every reset
	 * must arrive, the same text included: the attachment removes the
	 * attribute first, since both Svelte and the renderer skip a write of the
	 * value they last wrote.
	 */
	let fieldValue = $state("")
	let fieldWrites = $state(0)
	function setField(text: string) {
		draft = text
		fieldValue = text
		fieldWrites++
	}
	const writeField = (el: HTMLElement) => {
		void fieldWrites
		const v = fieldValue
		el.removeAttribute("value")
		el.setAttribute("value", v)
	}

	function send() {
		const content = draft
		const trayItemIds = sendableTrayIds(tray)
		// Attachments alone are a line (composer attachments §3.1).
		if (!content.trim() && !trayItemIds.length && !uploading) return
		// A whole slash name — with or without its argument — is a command,
		// never a line: Send runs it as Enter does (S2), which is how a phone,
		// whose Enter writes a new line, runs `/nudge go north`.
		const command = content.trim() ? exactSlashCommand(paletteActions, content) : undefined
		if (command) {
			invokePalette(command.action, command.argument)
			return
		}
		// Send waits only for the files still uploading ("Uploading 1 of
		// 2…"), then goes on its own.
		if (uploading) {
			sendWaiting = true
			return
		}
		sendWaiting = false
		// Cleared once the host took it: a refused line (no persona, an
		// attachment the reply stopped reading) stays put, tiles and all.
		// The tiles leave when the host's tray says they were sent.
		conv.ctx
			.request("send", {
				content,
				personaId: c?.personaId ?? null,
				channel: conv.lane.current,
				...(trayItemIds.length ? { trayItemIds } : {})
			})
			.then(
				() => {
					if (draft === content) setField("")
				},
				(e: Error) => console.warn(`Send: ${e.message}`)
			)
		paletteDismissed = null
		paletteHighlight = -1
	}

	/* ── attachments (composer attachments §3.3) ──────────────────────────
	 * The tray is the host's (`composer.tray`): this composer asks it to
	 * take files (`attach-files`) and to drop one (`remove-tray-item`), and
	 * draws what it says. A file the readers would refuse — or an SVG, an
	 * oversized file, one past the count — is refused here first, before a
	 * byte goes up, as a tile that says why and clears itself; the server
	 * checks every file again. What the reply can read is not drawn in the
	 * composer's body: the More (⋮) panel's **What can be attached** opens
	 * it in a dialog (next-pass note 41, 2026-10-03). */
	const tray = $derived((c?.tray ?? []) as TrayItemV1[])
	const readers = $derived(c?.attachments ?? null)
	const offersAttachments = $derived(c?.tray !== undefined && !hideCompose)
	const readersLine = $derived(readersSummary(readers))
	const readerLines = $derived(readerCallLines(readers))
	/** The More panel offers **What can be attached**: there is something to say. */
	const readersOffered = $derived(offersAttachments && !!readersLine)
	const uploading = $derived(uploadingNote(tray))
	const hasAttachments = $derived(tray.some((t) => t.status !== "refused"))
	/** The **What can be attached** dialog is open. */
	let readersOpen = $state(false)
	/** Pressed Send while files were uploading: it goes when they finish. */
	let sendWaiting = $state(false)
	$effect(() => {
		if (sendWaiting && !uploading) untrack(() => send())
	})
	/** Files refused before upload, drawn as tiles until they clear (§2b). */
	let refusedHere = $state<Array<TrayRefusalV1 & { key: number }>>([])
	let refusalSeq = 0
	/** What the live region last said ("cat.png attached", a refusal). */
	let announcement = $state("")

	async function attachFiles(files: File[]) {
		if (!files.length) return
		const sniffed = await Promise.all(
			files.map(async (f) => ({
				name: f.name,
				size: f.size,
				kind: sniffAttachmentKind(
					new Uint8Array(await f.slice(0, 512).arrayBuffer()),
					f.name,
					f.type
				)
			}))
		)
		const { accept, refusals } = preCheckFiles(sniffed, tray, readers)
		for (const r of refusals) {
			const key = ++refusalSeq
			refusedHere = [...refusedHere, { ...r, key }]
			setTimeout(() => (refusedHere = refusedHere.filter((x) => x.key !== key)), 6000)
		}
		if (refusals.length)
			announcement = refusals.map((r) => `Can't attach ${r.filename}: ${r.reason}`).join(" ")
		if (accept.length)
			conv.ctx
				.request("attach-files", { files: accept.map((i) => files[i]!) })
				.catch((e: Error) => (announcement = e.message))
	}

	function removeTrayItem(item: TrayItemV1) {
		void conv.ctx.request("remove-tray-item", { trayItemId: item.id }).catch(() => {})
		announcement = `${item.filename} removed`
	}

	// "cat.png attached" — once, as a tile turns ready; a server refusal too.
	const heard = new Map<string, string>()
	$effect(() => {
		for (const t of tray) {
			const was = heard.get(t.id)
			if (was === t.status) continue
			heard.set(t.id, t.status)
			if (was === undefined && t.status === "uploading") continue
			if (t.status === "ready") untrack(() => (announcement = `${t.filename} attached`))
			if (t.status === "refused")
				untrack(() => (announcement = `Can't attach ${t.filename}: ${t.refusal ?? ""}`))
		}
	})

	/** "Open the picker" filter — the kinds this reply reads, by mime and extension. */
	const pickerAccept = $derived(readers?.accept ?? "")
	const progressOf = (t: TrayItemV1) => Math.round(Math.min(Math.max(t.progress, 0), 1) * 100)

	/**
	 * What a channel is CALLED: its declared label (`ChannelDecl.label`, the
	 * Lair's _Sanctum_), else its slug title-cased — the conversation's one
	 * reading (S1), so the strip and a pinned copy's head never disagree.
	 */
	const channelLabel = (slug: string) => conv.channelName(slug)

	// Unique per instance: a session page can hold more than one composer on
	// screen at a time, and a shared id sends every `for`/`aria-describedby` to
	// whichever element happens to come first in the DOM.
	const uid = $props.id()
	const inputId = `composer-input-${uid}`
	const warningId = `composer-warning-${uid}`
	const actionsId = `composer-actions-${uid}`
	const paletteId = `composer-palette-${uid}`
	const paletteOptionId = (i: number) => `${paletteId}-option-${i}`

	let personaSwitcherOpen = $state(false)
	let moreMenuOpen = $state(false)
	let actionsOpen = $state(false)
	let previewOpen = $state(false)
	/** The More panel currently filling the field area, or null for the field. */
	let activePaneValue: string | null = $state(null)

	// Enter submits at desktop widths only; on a touch keyboard it inserts a
	// newline like any other textarea.
	// Enter sends where there is a keyboard to press it on; a narrow box (a
	// phone's) keeps Enter for a new line, as a touch keyboard does.
	const submitOnEnter = $derived(conv.ctx.layout?.v1?.tier !== "compact")
	/** The Enter/Shift+Enter hint: shown once, remembered in the widget's saved state. */
	let hintSeen = $state(true)
	// ⏳ A native widget has no saved state yet: the hint is remembered per
	// mount until it does (a remote's `state` carries it).
	const saved = $derived(
		(conv.ctx as unknown as { state?: { hintSeen?: boolean } }).state
	)
	$effect(() => {
		hintSeen = !!saved?.hintSeen
	})
	let hintVisible = $state(false)

	const activePersona = $derived(
		c?.personas.find((p) => p.personaId === c?.personaId) ?? null
	)
	const personaCount = $derived(c?.personas.length ?? 0)

	const tabs = $derived(c?.tabs ?? [])
	let turnControls = $derived(tabs.find((t) => t.view === TURN_CONTROLS_VIEW))
	let morePanes = $derived(tabs.filter((t) => t.view !== TURN_CONTROLS_VIEW))
	let activePane = $derived(morePanes.find((t) => t.view === activePaneValue))
	let hasActionsRow = $derived(actionsListed || !!turnControls || overflowActions.length > 0)
	let overflowNew = $derived(overflowActions.filter((a) => a.isNew))
	let overflowOpen = $state(false)
	/**
	 * The verdict the overflow reads off a listed action (U5e): the same
	 * `paletteRowState` the chips and the palette read, so the three cannot
	 * disagree. The reason arrives as a locale map and is resolved here.
	 */
	const overflowRow = (a: WidgetAction) => ({
		name: a.name,
		audience: a.audience,
		canAct: a.canAct,
		enabled: a.enabled,
		venue: a.venue,
		...(a.reason ? { reason: i18nText(a.reason.i18n, conv.ctx.locale.v1) ?? a.reason.i18n.en } : {}),
		...(a.itemPredicates?.length ? { itemPredicates: a.itemPredicates } : {})
	})

	/* ── the `/` palette (R-15 slash names, F38; U5c) ──────────────────────
	 * Typing `/` at the start of an empty draft lists the composer's actions;
	 * the rest of the draft filters them. Escape closes it until the draft
	 * changes; Enter invokes the highlighted row, or the exact match when
	 * the palette is closed. The textarea stays the input — the list is a
	 * listbox it controls (`aria-controls`, `aria-activedescendant`). */
	/** The query Escape was pressed on; the palette stays closed while the draft still says it. */
	let paletteDismissed = $state<string | null>(null)
	let paletteHighlight = $state(-1)
	const paletteQuery = $derived(slashQueryOf(draft))
	const paletteRows = $derived(
		paletteQuery === null || !paletteActions.length
			? []
			: filterPaletteActions(paletteActions, paletteQuery)
	)
	const paletteOpen = $derived(
		paletteDismissed !== paletteQuery &&
			paletteRows.length > 0 &&
			!hideCompose
	)
	// The highlight never points past the rows it has.
	$effect(() => {
		if (paletteHighlight >= paletteRows.length)
			paletteHighlight = paletteRows.length ? 0 : -1
	})
	/**
	 * What Enter runs while the palette is open: the highlighted row, else
	 * the name typed in full, else — once the draft has narrowed the list —
	 * its first row. A bare `/` and Enter highlights rather than fires:
	 * nothing was named. ONE derivation, read by the key handler and by the
	 * footer hint, so the hint cannot promise a row Enter would not run.
	 */
	const paletteEnterPick = $derived(
		!paletteOpen
			? undefined
			: paletteHighlight >= 0
				? paletteRows[paletteHighlight]
				: (exactPaletteMatch(paletteActions, draft) ??
					(paletteQuery ? paletteRows[0] : undefined))
	)
	// Opening the palette is meeting its newcomers.
	$effect(() => {
		if (!paletteOpen) return
		const fresh = paletteRows.filter((a) => a.isNew)
		if (fresh.length) void conv.request("actions-seen", { keys: fresh.map(actionIdentity) })
	})

	/**
	 * Run one action. With a **slash argument** (S2) the press supplies its
	 * text, and the draft stays until the host's run spends it (D1) — kept
	 * on an error, or on the host's refusal of text to an action that
	 * collects none (`/advance x`), so nothing typed is lost. Without one the
	 * draft was only the name, and goes now.
	 */
	function invokePalette(action: PaletteAction, argument: string | null = null) {
		// The same gate the chips and the More menu apply (S5): the
		// audience, and nothing while a reply streams.
		if (paletteRowState(action, { generating: isGenerating, newest: newestItem }).disabled)
			return
		if (argument === null) setField("")
		paletteDismissed = null
		paletteHighlight = -1
		conv.invoke(actionIdentity(action), undefined, undefined, argument ?? undefined)
	}
	/**
	 * The draft as a whole slash name and its argument (S2), when it has one:
	 * what Enter runs (the palette is closed once a space is typed) and what
	 * the footer says it will do.
	 */
	const slashCommand = $derived.by(() => {
		const command = exactSlashCommand(paletteActions, draft)
		return command?.argument ? command : undefined
	})
	const slashRefusal = $derived(
		slashCommand ? slashArgumentRefusal(slashCommand.action, slashCommand.argument) : null
	)

	/**
	 * The keys the palette handles, which the field keeps from itself and
	 * raises as `key`: all four while it is open, Enter alone while the draft
	 * names an action exactly.
	 */
	const capturedKeys = $derived(
		paletteOpen
			? "ArrowUp ArrowDown Escape Enter Tab"
			: exactPaletteMatch(paletteActions, draft) || (slashCommand && submitOnEnter)
				? "Enter"
				: ""
	)

	/** True when the key was the palette's to handle. */
	function handlePaletteKey(e: { key: string; shiftKey: boolean; preventDefault: () => void }): boolean {
		if (paletteOpen) {
			if (e.key === "ArrowDown" || e.key === "ArrowUp") {
				e.preventDefault()
				paletteHighlight = stepHighlight(
					paletteHighlight,
					paletteRows.length,
					e.key === "ArrowDown" ? 1 : -1
				)
				return true
			}
			if (e.key === "Escape") {
				e.preventDefault()
				paletteDismissed = paletteQuery
				return true
			}
			if (e.key === "Enter" && !e.shiftKey) {
				e.preventDefault()
				const pick = paletteEnterPick
				if (pick) invokePalette(pick)
				else paletteHighlight = 0
				return true
			}
			if (e.key === "Tab" && paletteRows.length) {
				// Complete to the highlighted (or first) name, like a shell.
				e.preventDefault()
				const pick =
					paletteRows[paletteHighlight >= 0 ? paletteHighlight : 0]!
				// One that takes an argument (S2) completes with its space, ready for it.
				setField(`/${pick.slash}${slashArgumentHint(pick) ? " " : ""}`)
				return true
			}
			return false
		}
		// Closed: `/name` + Enter still invokes an exact match, so a name
		// typed in full never needs the list.
		if (e.key === "Enter" && !e.shiftKey) {
			const exact = exactPaletteMatch(paletteActions, draft)
			if (exact) {
				e.preventDefault()
				invokePalette(exact)
				return true
			}
			// `/nudge go north` + Enter runs Nudge with its argument (S2) —
			// where Enter sends; a phone's Enter keeps writing the argument's
			// next line, and its Send runs the command.
			if (slashCommand && submitOnEnter) {
				e.preventDefault()
				invokePalette(slashCommand.action, slashCommand.argument)
				return true
			}
		}
		return false
	}

	function handleOverflowOpen(open: boolean) {
		overflowOpen = open
		if (open && overflowNew.length)
			void conv.request("actions-seen", { keys: overflowNew.map(actionIdentity) })
	}
	let actionsLabelShown = $derived(showActions && hasActionsRow)

	let tokenCounts = $derived(c?.usage ?? null)
	let usageRatio = $derived(
		tokenCounts && tokenCounts.limit > 0
			? Math.min(tokenCounts.total / tokenCounts.limit, 1)
			: null
	)
	let contextExceeded = $derived(
		tokenCounts ? tokenCounts.total > tokenCounts.limit : false
	)

	const messages = $derived(conv.ctx.messages.v1 as Array<{ isGenerating?: boolean }>)
	let isGenerating = $derived(!!messages[messages.length - 1]?.isGenerating)
	let ragVisible = $derived(!!c?.notice && composerSkin !== "minimal")
	// Writing as no persona in a genre that names the person's lines (R4's
	// `playerLabel`, S2): "Write as the Dungeon Master…".
	let placeholder = $derived(
		activePersona
			? `Write as ${activePersona.name}…`
			: c?.playerLabel
				? `Write as the ${c.playerLabel}…`
				: "Write a message…"
	)

	// A pane that has gone (a lorebook unbound, context debugging switched off)
	// hands the field area back. A mode with no field opens on its first panel,
	// because there is nothing else for the area to show.
	$effect(() => {
		const values = morePanes.map((p) => p.view)
		if (activePaneValue && !values.includes(activePaneValue)) {
			activePaneValue = null
		}
		if (hideCompose && !activePaneValue && values.length) {
			activePaneValue = values[0]
		}
	})

	/** The field raised a key the palette keeps (`keys`). */
	function handleFieldKey(e: CustomEvent<{ key: string; shift: boolean }>) {
		const ev = { key: e.detail.key, shiftKey: e.detail.shift, preventDefault() {} }
		if (handlePaletteKey(ev)) return
		// Enter reached here only as a captured key: the send key, then.
		if (ev.key === "Enter" && !ev.shiftKey && submitOnEnter) send()
	}

	function handleFieldFocus() {
		if (hintSeen || !submitOnEnter) return
		hintVisible = true
		hintSeen = true
		;(conv.ctx as unknown as { saveState?: (s: object) => void }).saveState?.({ ...(saved ?? {}), hintSeen: true })
	}

	function openPane(value: string) {
		activePaneValue = value
		previewOpen = false
		moreMenuOpen = false
	}

	/** More › What can be attached: the panel closes, the dialog opens. */
	function openReaders() {
		moreMenuOpen = false
		readersOpen = true
	}

	function backToCompose() {
		activePaneValue = null
	}

	function togglePreview() {
		previewOpen = !previewOpen
		if (previewOpen) activePaneValue = null
	}

	// The row is a disclosure, not a menu: it closes on its toggle and on
	// Escape, never because focus left it — `src/ui/sessions/conversation/actionsDisclosure.ts` has the
	// table and the reason. There is deliberately no `onfocusout` here.
	/** Escape closes the actions row (natively; a remote hears no keys). */
	function handleKeyDown(e: KeyboardEvent) {
		if (e.key === "Escape" && actionsOpen && !overflowOpen) actionsOpen = false
	}
</script>


<!-- The composer's parts are `messages.composer-*` (STYLE-GUIDE §6.16): no look
     here; the default widget stylesheet draws them, and the skin
     (`data-composer-skin`) is a state a style reads. -->
<!-- Escape closes the actions row: a keyboard shortcut over the whole group,
     not an interaction of its own (natively; a remote hears no keys). -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
	data-widget-part="messages.composer"
	data-composer-skin={composerSkin}
	hidden={conv.edit.id !== null}
	onkeydown={handleKeyDown}
	role="group"
	aria-label="Compose"
>
	{#if c?.addPersona}
		<!-- Guests without a persona get the one thing they can do here. -->
		<div data-widget-part="messages.join">
			<div data-widget-part="messages.join-text">
				<sp-icon name="user-plus" size="48" data-widget-part="messages.join-icon"></sp-icon>
				<h3 data-widget-part="messages.join-title">Join the conversation</h3>
				<p data-widget-part="messages.join-note">
					Add a persona to this session to send messages.
				</p>
			</div>
			<button
				data-widget-part="messages.join-button"
				onclick={() => void conv.request("add-persona", {})}
			>
				<sp-icon name="user-plus" size="20"></sp-icon>
				Add your persona
			</button>
		</div>
	{:else}
		<!-- Above the composer, because a run in flight is about the message you
		     are about to get rather than the ones already there — and because it
		     has to stay visible while the transcript scrolls. -->
		<sp-host-view name="run-progress"></sp-host-view>

		<div data-widget-part="messages.composer-disclosure">
			<div data-widget-part="messages.composer-disclosure-bar">
				{#if actionsLabelShown}
					<button
						type="button"
						data-widget-part="messages.composer-actions-toggle"
						aria-expanded={actionsOpen}
						aria-controls={actionsId}
						onclick={() => (actionsOpen = !actionsOpen)}
					>
						<span>Actions</span>
						<sp-icon name="chevron-down" size="12" data-widget-part="messages.composer-actions-chevron"></sp-icon>
					</button>
				{/if}
				{#if ragVisible}
					<div data-widget-part="messages.composer-notice">
						<sp-host-view name="retrieval-notice"></sp-host-view>
					</div>
				{/if}
			</div>

			{#if actionsLabelShown && actionsOpen}
				<div
					id={actionsId}
					data-widget-part="messages.composer-actions-row"
					role="group"
					aria-label="Session actions"
				>
					<!-- ONE group, ONE chip (next-pass note 30, 2026-10-02): the turn
					     controls first — Continue, Pick who speaks, Regenerate — then
					     the genre's actions, then More. The page's two host views
					     draw their chips straight into this row (the row lays out
					     `sp-host-view`'s children as its own), so they wrap, space
					     and look as one set. -->
					<div data-widget-part="messages.composer-actions messages.composer-chips">
						{#if turnControls}
							<!-- This composer's channel's turn controls (S1): a copy pinned to the
							     Sanctum draws the Sanctum's listing. -->
							<sp-host-view name="session-controls" channel={conv.lane.current}></sp-host-view>
						{/if}
						{#if actionsListed}
							<sp-host-view name="session-actions" channel={conv.lane.current}></sp-host-view>
						{/if}
						{#if overflowActions.length}
							<!-- The overflow (R-15, F38): every enabled action
							     the primary row leaves out, never hidden by
							     prominence. A Menu — these are actions, not a
							     field. A newcomer marks the trigger until the
							     menu has been opened once. -->
							<!-- `sp-menu` (§3.5): each `sp-menu-item`'s own content is its row. -->
							<sp-menu
								placement="top-start"
								label="More actions"
								open={overflowOpen}
								onopen-change={(e: CustomEvent<{ open: boolean }>) =>
									handleOverflowOpen(e.detail.open)}
								onselect={(e: CustomEvent<{ value: string }>) => {
									const a = overflowActions.find(
										(x) => actionIdentity(x) === e.detail.value
									)
									// The wire's reason is a locale map; the palette's
									// shape carries a sentence, and the fire needs neither.
									if (a) conv.invoke(actionIdentity(a))
								}}
							>
								<button
									slot="trigger"
									type="button"
									data-widget-part="messages.composer-more-actions"
									title="More actions"
									aria-label={overflowNew.length
										? `More actions (${overflowNew.length} new)`
										: "More actions"}
								>
									<sp-icon name="ellipsis" size="14"></sp-icon>
									More
									{#if overflowNew.length}
										<span data-widget-part="messages.composer-new-dot" aria-hidden="true"></span>
									{/if}
								</button>
								{#each overflowActions as a (actionIdentity(a))}
									{@const iconName = a.icon || "play"}
									{@const row = paletteRowState(overflowRow(a), {
										generating: isGenerating,
										newest: newestItem
									})}
									<!-- Grey, listed, with its reason (R-15, U5e): the
									     audience's word, the declared enabled-when's, or
									     the busy rule — as a second line and to a screen
									     reader, never dropped from the list. -->
									<sp-menu-item
										value={actionIdentity(a)}
										disabled={row.disabled}
										data-widget-part="messages.composer-overflow-item"
									>
										<sp-icon name={iconName} size="12"></sp-icon>
										<span title={a.description}>
											{a.name}
											<span data-widget-part="messages.composer-overflow-slash">/{a.slash}</span>
											{#if row.reason}
												<span data-widget-part="messages.composer-overflow-note">{row.reason}</span>
											{/if}
										</span>
										{#if a.isNew}
											<span data-widget-part="messages.composer-new">New</span>
										{/if}
									</sp-menu-item>
								{/each}
							</sp-menu>
						{/if}
					</div>
				</div>
			{/if}
		</div>

		<!-- Files dropped onto the composer, or pasted into it (a screenshot),
		     join the tray; a drag shows "Drop to attach" (STYLE-GUIDE §6.7).
		     Off where the host offers no attachments, so a paste of text is
		     the field's as ever. -->
		<sp-drop-zone
			data-widget-part="messages.composer-drop"
			label="Drop to attach"
			disabled={!offersAttachments}
			onfiles={(e: CustomEvent<{ files: File[] }>) => {
				// Its OWN files only. An sp element's event bubbles, and the
				// Attach picker sits inside this zone — without this, one pick
				// staged every file twice (found in the 2026-10-02 live check).
				if (e.target !== e.currentTarget) return
				void attachFiles(e.detail.files)
			}}
		>
		<div data-widget-part="messages.composer-card">
			{#if usageRatio !== null}
				<!-- The draft's share of the context window, read along the card's
				     top edge rather than as a number, so it costs no row. -->
				<div
					data-widget-part="messages.composer-meter"
					role="progressbar"
					aria-label="Context window used"
					aria-valuemin={0}
					aria-valuemax={100}
					aria-valuenow={Math.round(usageRatio * 100)}
				>
					<div
						data-widget-part="messages.composer-meter-fill"
						data-high={usageRatio > 0.9 ? "" : undefined}
						style="--sp-fill: {(usageRatio * 100).toFixed(1)}%"
					></div>
				</div>
			{/if}

			<div data-widget-part="messages.composer-body">
				{#if activePane}
					<div data-widget-part="messages.composer-pane-head">
						<span data-widget-part="messages.composer-pane-title">
							{activePane.title}
						</span>
						{#if !hideCompose}
							<button
								type="button"
								data-widget-part="messages.composer-back"
								onclick={backToCompose}
							>
								<sp-icon name="arrow-left" size="14"></sp-icon>
								Back to compose
							</button>
						{/if}
					</div>
					<div role="region" aria-label="{activePane.title} panel">
						<sp-host-view name={activePane.view}></sp-host-view>
					</div>
				{:else if previewOpen}
					<div
						data-widget-part="messages.composer-preview"
						role="region"
						aria-label="Message preview"
					>
						<sp-message-body text={draft}></sp-message-body>
					</div>
				{:else if !hideCompose}
					{#if paletteOpen}
						<!-- The `/` palette: the composer's actions by slash
						     name, filtered by the draft. A listbox the field
						     controls; Enter invokes, Escape closes, Tab
						     completes the name. -->
						<ul
							id={paletteId}
							data-widget-part="messages.composer-palette"
							role="listbox"
							aria-label="Slash commands"
						>
							{#each paletteRows as a, i (a.slash)}
								{@const iconName = a.icon || "play"}
								{@const rowState = paletteRowState(a, {
									generating: isGenerating,
									newest: newestItem
								})}
								{@const argHint = slashArgumentHint(a)}
								<!-- The highlighted row is its `aria-selected`, a row the
								     audience or a reply in flight refuses its `aria-disabled`. -->
								<li
									id={paletteOptionId(i)}
									role="option"
									aria-selected={i === paletteHighlight}
									aria-disabled={rowState.disabled}
									data-widget-part="messages.composer-palette-row"
								>
									<button
										type="button"
										data-widget-part="messages.composer-palette-button"
										tabindex="-1"
										disabled={rowState.disabled}
										onmousedown={(e) => e.preventDefault()}
										onmouseenter={() => (paletteHighlight = i)}
										onclick={() => invokePalette(a)}
									>
										<sp-icon name={iconName} size="14"></sp-icon>
										<span data-widget-part="messages.composer-palette-slash">/{a.slash}</span>
										{#if argHint}
											<!-- The argument it takes (S2): `/nudge <direction…>`. -->
											<span data-widget-part="messages.composer-palette-argument">{argHint}</span>
										{/if}
										<span data-widget-part="messages.composer-palette-label">{a.name}</span>
										{#if a.isNew}
											<span data-widget-part="messages.composer-new">New</span>
										{/if}
										{#if rowState.reason}
											<span data-widget-part="messages.composer-palette-note">{rowState.reason}</span>
										{/if}
									</button>
								</li>
							{/each}
						</ul>
					{/if}
					<!-- The field inside takes focus and carries the ARIA: this is its
					     host element; the field itself is its child `textarea`. -->
					<!-- svelte-ignore a11y_aria_activedescendant_has_tabindex -->
					<sp-composer-field
						data-widget-part="messages.composer-field"
						rows="1"
						label="Write a message"
						{placeholder}
						submit-on={submitOnEnter ? "enter" : "none"}
						keys={capturedKeys}
						spellcheck="true"
						aria-describedby={contextExceeded ? warningId : undefined}
						aria-invalid={contextExceeded ? "true" : undefined}
						aria-autocomplete={paletteActions.length ? "list" : undefined}
						aria-controls={paletteOpen ? paletteId : undefined}
						aria-activedescendant={paletteOpen && paletteHighlight >= 0
							? paletteOptionId(paletteHighlight)
							: undefined}
						oninput={(e: CustomEvent<{ value: string }>) => (draft = e.detail.value)}
						onsubmit={(e: CustomEvent<{ value: string }>) => {
							draft = e.detail.value
							send()
						}}
						onkey={handleFieldKey}
						onfocus={handleFieldFocus}
						{@attach writeField}
					></sp-composer-field>
				{/if}
			</div>

			{#if offersAttachments && (tray.length || refusedHere.length)}
				<!-- The tray: this line's attachments, uploading, ready or
				     refused. A row of tiles that scrolls sideways on a phone. -->
				<ul data-widget-part="messages.composer-tray" aria-label="Attachments">
					{#each tray as t (t.id)}
						<li
							data-widget-part="messages.composer-tray-item"
							data-status={t.status}
							data-kind={t.kind ?? undefined}
						>
							{#if t.thumbSrc}
								<img
									data-widget-part="messages.composer-tray-thumb"
									src={t.thumbSrc}
									alt=""
									loading="lazy"
									decoding="async"
								/>
							{:else}
								<sp-icon
									data-widget-part="messages.composer-tray-icon"
									name={t.kind === "image" ? "image" : "file-text"}
									size="20"
								></sp-icon>
							{/if}
							<span data-widget-part="messages.composer-tray-name" title={t.filename}>{t.filename}</span>
							{#if t.status === "uploading"}
								<span
									data-widget-part="messages.composer-tray-progress"
									role="progressbar"
									aria-label="Uploading {t.filename}"
									aria-valuemin={0}
									aria-valuemax={100}
									aria-valuenow={progressOf(t)}
									style="--sp-fill: {progressOf(t)}%"
								></span>
							{:else if t.status === "refused"}
								<span data-widget-part="messages.composer-tray-refusal">{t.refusal ?? "Not attached."}</span>
							{/if}
							<button
								type="button"
								data-widget-part="messages.composer-tray-remove"
								aria-label="Remove {t.filename}"
								title="Remove"
								onclick={() => removeTrayItem(t)}
							>
								<sp-icon name="x" size="12"></sp-icon>
							</button>
						</li>
					{/each}
					{#each refusedHere as r (r.key)}
						<li data-widget-part="messages.composer-tray-item" data-status="refused">
							<sp-icon data-widget-part="messages.composer-tray-icon" name="ban" size="20"></sp-icon>
							<span data-widget-part="messages.composer-tray-name" title={r.filename}>{r.filename}</span>
							<span data-widget-part="messages.composer-tray-refusal">{r.reason}</span>
						</li>
					{/each}
				</ul>
			{/if}
			<div data-widget-part="messages.composer-footer">
				<!-- Which channel this line lands on. Drawn only when there is
				     a choice: one channel is every session that exists today,
				     and a picker with one option is a control that teaches
				     nothing. The chosen one is its `aria-pressed`. -->
				{#if channels.length > 1}
					<div
						data-widget-part="messages.composer-channels"
						role="group"
						aria-label="Which channel you are writing on"
					>
						{#each channels as slug (slug)}
							<button
								type="button"
								data-widget-part="messages.composer-channel"
								aria-pressed={slug === conv.lane.current}
								title="Write on {channelLabel(slug)}"
								onclick={() => conv.lane.set(slug)}
							>
								{channelLabel(slug)}
							</button>
						{/each}
					</div>
				{/if}
				{#if activePersona}
					{#if personaCount > 1}
						<!-- `sp-popover` (§3.5): our button is the trigger, the card the panel. -->
						<sp-popover
							placement="top-start"
							open={personaSwitcherOpen}
							onopen-change={(e: CustomEvent<{ open: boolean }>) => (personaSwitcherOpen = e.detail.open)}
						>
							<button slot="trigger" type="button" data-widget-part="messages.composer-persona"
								title="Switch persona"
								aria-label="Switch persona (currently {activePersona.name})">
								<sp-avatar ref={`character:${activePersona.personaId}`} size="sm"></sp-avatar>
								<span data-widget-part="messages.composer-persona-name">
									{activePersona.name}
								</span>
								<sp-icon name="chevron-down" size="14"></sp-icon>
							</button>
							<div data-widget-part="messages.composer-persona-menu">
								<p data-widget-part="messages.composer-persona-menu-title">
									Write as
								</p>
								{#each c?.personas ?? [] as p (p.personaId)}
									<button
										type="button"
										data-widget-part="messages.composer-persona-option"
										aria-current={p.personaId === c?.personaId ? "true" : undefined}
										onclick={() => {
											void conv.request("switch-persona", { personaId: p.personaId })
											personaSwitcherOpen = false
										}}
									>
										<sp-avatar ref={`character:${p.personaId}`} size="sm"></sp-avatar>
										<span data-widget-part="messages.composer-persona-option-name">{p.name}</span>
									</button>
								{/each}
							</div>
						</sp-popover>
					{:else}
						<span data-widget-part="messages.composer-persona">
							<sp-avatar ref={`character:${activePersona.personaId}`} size="sm"></sp-avatar>
							<span data-widget-part="messages.composer-persona-name">
								{activePersona.name}
							</span>
						</span>
					{/if}
				{/if}

				<div data-widget-part="messages.composer-footer-end">
					{#if offersAttachments}
						<!-- Attach: the device's picker, filtered to what this reply
						     reads. Its body is our own button; the picker is the
						     page's (`sp-file-picker`). -->
						<sp-file-picker
							data-widget-part="messages.composer-attach"
							accept={pickerAccept || undefined}
							multiple={true}
							onfiles={(e: CustomEvent<{ files: File[] }>) => void attachFiles(e.detail.files)}
						>
							<button
								type="button"
								data-widget-part="messages.composer-attach-button messages.composer-icon-button"
								title={readersLine ? `Attach files. ${readersLine}` : "Attach files"}
								aria-label="Attach files"
							>
								<sp-icon name="paperclip" size="16"></sp-icon>
							</button>
						</sp-file-picker>
					{/if}
					{#if !hideCompose}
						<button
							type="button"
							data-widget-part="messages.composer-preview-toggle messages.composer-icon-button"
							aria-pressed={previewOpen}
							title="Preview"
							aria-label="Preview the formatted draft"
							onclick={togglePreview}
						>
							<sp-icon name="eye" size="16"></sp-icon>
						</button>
					{/if}

					{#if morePanes.length > 0 || readersOffered}
						<!-- `sp-popover` (§3.5): our button is the trigger, the card the panel.
						     A panel filling the field area marks it `data-active`. Under
						     the panes, **What can be attached** opens the readers dialog
						     (note 41) — so it is here in every skin, panes or none. -->
						<sp-popover
							placement="top-end"
							open={moreMenuOpen}
							onopen-change={(e: CustomEvent<{ open: boolean }>) => (moreMenuOpen = e.detail.open)}
						>
							<button slot="trigger" type="button" data-widget-part="messages.composer-more messages.composer-icon-button"
								data-active={activePane ? "" : undefined}
								title="More"
								aria-label="More">
								<sp-icon name="ellipsis-vertical" size="16"></sp-icon>
							</button>
							<div data-widget-part="messages.composer-panes">
										<header data-widget-part="messages.composer-panes-title">
											<sp-icon name="ellipsis-vertical" size="16"></sp-icon>
											<p>More</p>
										</header>
										<div data-widget-part="messages.composer-panes-list">
											{#each morePanes as pane (pane.view)}
												<button
													type="button"
													data-widget-part="messages.composer-pane-option"
													data-current={activePaneValue === pane.view ? "" : undefined}
													onclick={() =>
														openPane(pane.view)}
												>
													<sp-icon name={pane.icon} size="12"></sp-icon>
													<span>{pane.title}</span>
												</button>
											{/each}
											{#if readersOffered}
												<button
													type="button"
													data-widget-part="messages.composer-pane-option messages.composer-readers-button"
													onclick={openReaders}
												>
													<sp-icon name="paperclip" size="12"></sp-icon>
													<span>What can be attached</span>
												</button>
											{/if}
										</div>
							</div>
						</sp-popover>
					{/if}

					{#if !hideCompose}
						{#if isGenerating}
							<button
								type="button"
								data-widget-part="messages.composer-stop"
								title="Stop"
								aria-label="Stop generating"
								onclick={() => conv.invoke("stop")}
							>
								<sp-icon name="square"></sp-icon>
								<span>Stop</span>
							</button>
						{:else}
							<!-- Someone due next (`data-someone-due`): Send steps back. -->
							<button
								type="button"
								data-widget-part="messages.composer-send"
								data-someone-due={sendTonal ? "" : undefined}
								disabled={!draft.trim() && !hasAttachments}
								title="Send"
								aria-label="Send message"
								onclick={send}
							>
								<sp-icon name="send"></sp-icon>
								<span>Send</span>
							</button>
						{/if}
					{/if}
				</div>
			</div>
		</div>
		</sp-drop-zone>

		{#if offersAttachments}
			<!-- Attachments said aloud: "cat.png attached", a refusal, a removal. -->
			<p data-widget-part="messages.composer-announce" aria-live="polite">{announcement}</p>
		{/if}
		{#if readersOffered}
			<!-- What this reply can read (§3.2; note 41): out of the composer's
			     body, opened from More. The summary, every kind with the reason
			     a refused one can't be attached, and each model call's reading.
			     A refusal at the moment of a pick or a drop still says why on
			     its own tile, and aloud. -->
			<sp-dialog
				label="What can be attached"
				open={readersOpen}
				onopen-change={(e: CustomEvent<{ open: boolean }>) => (readersOpen = e.detail.open)}
			>
				<span slot="title">What can be attached</span>
				<div data-widget-part="messages.composer-readers">
					<p data-widget-part="messages.composer-readers-line">{readersLine}</p>
					<ul data-widget-part="messages.composer-readers-kinds" aria-label="Kinds of file">
						{#each ATTACHMENT_KINDS_V1 as k (k)}
							{@const v = readers?.kinds[k]}
							<li data-widget-part="messages.composer-readers-kind" data-allowed={v?.allowed ? "" : undefined}>
								<strong>{KIND_NAME[k]}</strong>
								<span>({KIND_FORMATS[k]})</span>
								{#if v?.allowed}
									<span> — can be attached</span>
								{:else}
									<span data-widget-part="messages.composer-readers-reason"> — can't be attached. {v?.reason ?? ""}</span>
								{/if}
							</li>
						{/each}
					</ul>
					{#if readerLines.length}
						<ul data-widget-part="messages.composer-readers-calls" aria-label="Each model call">
							{#each readerLines as line (line)}
								<li>{line}</li>
							{/each}
						</ul>
					{/if}
				</div>
			</sp-dialog>
		{/if}
		{#if sendWaiting && uploading}
			<p data-widget-part="messages.composer-hint" aria-live="polite">{uploading} Sends when done.</p>
		{/if}

		{#if contextExceeded}
			<p
				id={warningId}
				data-widget-part="messages.composer-warning"
				role="alert"
			>
				This draft pushes the prompt past the context limit. Older turns
				will be trimmed.
			</p>
		{/if}

		{#if paletteOpen}
			<!-- While the palette is open Enter does not send: it runs the
			     row it would pick (the same derivation the key handler reads),
			     or — a bare `/` with nothing highlighted — only highlights. -->
			<p data-widget-part="messages.composer-hint" aria-live="polite">
				<kbd data-widget-part="messages.composer-key">Enter</kbd>
				{#if paletteEnterPick}
					runs /{paletteEnterPick.slash}
				{:else}
					highlights the first ·
					<kbd data-widget-part="messages.composer-key">↑</kbd>
					<kbd data-widget-part="messages.composer-key">↓</kbd>
					to choose
				{/if}
				·
				<kbd data-widget-part="messages.composer-key">Esc</kbd>
				closes.
			</p>
		{:else if slashCommand}
			<!-- A whole slash name and its argument (S2): what Enter (or Send)
			     will do with it — or why it will not. -->
			<p
				data-widget-part="messages.composer-hint"
				data-refused={slashRefusal ? "" : undefined}
				aria-live="polite"
			>
				{#if slashRefusal}
					{slashRefusal}.
				{:else}
					<kbd data-widget-part="messages.composer-key">{submitOnEnter ? "Enter" : "Send"}</kbd>
					runs /{slashCommand.action.slash} with your text.
				{/if}
			</p>
		{:else if hintVisible && submitOnEnter}
			<p data-widget-part="messages.composer-hint">
				<kbd data-widget-part="messages.composer-key">Enter</kbd>
				sends.
				<kbd data-widget-part="messages.composer-key">Shift</kbd>
				<kbd data-widget-part="messages.composer-key">Enter</kbd>
				for a new line.
			</p>
		{/if}
	{/if}
</div>
