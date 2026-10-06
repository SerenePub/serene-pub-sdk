<script lang="ts">
	import type { Snippet } from "svelte"
	import { useWidgetContext } from "../context"

	interface Props {
		markdown: string
		leftControls?: Snippet
		rightControls?: Snippet
		extraTabs?: {
			value: string
			title: string
			control: Snippet
			content: Snippet
			/** Stays as its own permanently visible tab on all screen sizes
			 * instead of collapsing into the mobile "More" popover. */
			alwaysVisible?: boolean
		}[]
		onSend: () => void
		/** Escape handler. Only kept from the field when provided, so a
		 * composer where Escape means nothing leaves it to the page. */
		onCancel?: () => void
		placeholder?: string
		/** `"send"` (default) is the session bar's behaviour: Enter submits on
		 * desktop. `"newline"` is for editing existing prose, where a stray
		 * Enter mid-paragraph committing the edit is a trap — there Enter
		 * always inserts a newline and Ctrl/Cmd+Enter submits. */
		enterBehavior?: "send" | "newline"
		/** Focus the field and put the caret at the end on mount. */
		autofocus?: boolean
		/** A `composer: 'none'` mode (19 §2): no Compose/Preview tabs, no
		 * input, no send — the extra tabs (triggers, lore, stats) are the
		 * whole surface. */
		hideCompose?: boolean
	}
	let {
		markdown = $bindable(),
		leftControls,
		rightControls,
		extraTabs = $bindable(),
		onSend,
		onCancel,
		placeholder = "Type a message...",
		enterBehavior = "send",
		autofocus = false,
		hideCompose = false
	}: Props = $props()

	let tabGroup: string = $state("compose")
	// Without a compose tab the initial (and any stale) selection must land
	// on a tab that exists — the first extra tab is the surface's front page.
	$effect(() => {
		if (hideCompose && (tabGroup === "compose" || tabGroup === "preview")) {
			tabGroup = extraTabs?.[0]?.value ?? "compose"
		}
	})
	// On mobile, extraTabs collapse into a single "More" popover instead of
	// competing inline with Compose/Preview for a 375px-wide row — mirrors
	// the same overflow-into-a-menu pattern already used for per-message
	// controls (see SessionMessage.svelte's mobile controls popover).
	let showMoreMenu = $state(false)
	let collapsibleExtraTabs = $derived(
		extraTabs?.filter((t) => !t.alwaysVisible) ?? []
	)
	let activeExtraTab = $derived(
		collapsibleExtraTabs.find((t) => t.value === tabGroup)
	)
	// Enter submits on desktop only; on touch it inserts a newline like any
	// other textarea. There is deliberately no on-screen hint for this — it was
	// permanent noise under every session, and gating it on "only while typing"
	// just traded that for a layout jump on the first keystroke.
	// The widget's box, not the window: a remote has no window to ask.
	const widget = useWidgetContext()
	const submitOnEnter = $derived(widget?.current.layout?.v1?.tier !== "compact")

	// The field is the page's (`sp-composer-field`): a remote hears no
	// keydown, so the keys this composer answers are named to the field,
	// which keeps them from itself and raises them as `key`. Escape cancels;
	// under `"newline"` Ctrl/Cmd+Enter submits — regardless of viewport:
	// unlike plain Enter, it isn't something a touch keyboard can emit by
	// accident — and Enter and Shift+Enter stay the field's newline. Under
	// `"send"` the field's own send key (Enter without Shift) submits.
	const fieldKeys = $derived(
		[onCancel ? "Escape" : "", enterBehavior === "newline" ? "Control+Enter Meta+Enter" : ""]
			.filter(Boolean)
			.join(" ")
	)

	function handleFieldKey(e: CustomEvent<{ key: string; shift: boolean; ctrl?: boolean; meta?: boolean }>) {
		const { key, ctrl, meta } = e.detail
		if (key === "Escape") onCancel?.()
		else if (key === "Enter" && (ctrl || meta)) onSend()
	}

	/**
	 * The field holds `markdown` as the caller sets it (an edit's text,
	 * copied in as editing starts). Only a value from OUTSIDE is written: a
	 * write resets the page's field, so the text the person typed, heard
	 * back through `markdown`, is never echoed onto what they type next.
	 * The caret goes to the end as the field lands (`autofocus`, which the
	 * page honours) rather than selecting all: this is an edit of existing
	 * text, so a select-all means the first keystroke destroys the message.
	 */
	const heard = new WeakMap<EventTarget, string>()
	const writeField = (el: HTMLElement) => {
		const v = markdown ?? ""
		if (heard.get(el) === v) return
		heard.set(el, v)
		el.removeAttribute("value")
		el.setAttribute("value", v)
	}
	/** What the person typed (or sent), from the field that raised it. */
	const hear = (e: CustomEvent<{ value: string }>) => {
		if (e.target) heard.set(e.target, e.detail.value)
		markdown = e.detail.value
	}

	$effect(() => {
		const fixed = new Set(["compose", "preview"])
		const extra = new Set(extraTabs?.map((t) => t.value) ?? [])
		if (!fixed.has(tabGroup) && !extra.has(tabGroup)) {
			tabGroup = "compose"
		}
	})
</script>

<!-- `sp-tabs` (§3.5): the list is drawn from the `sp-tab`s; the panels may sit
     anywhere below, each finding its tabs. Its parts are `messages.edit-*`
     (STYLE-GUIDE §6.16): no look here; the default widget stylesheet draws
     them, the list and the triggers through the tabs' own part. A panel's
     field raises `change` too, so only the element's own counts as a tab
     change. -->
<sp-tabs
	value={tabGroup}
	label="Message composer"
	data-widget-part="messages.edit-tabs"
	onchange={(e: CustomEvent<{ value: string }>) => {
		if (e.target === e.currentTarget) tabGroup = e.detail.value
	}}
>
	<!-- Every trigger carries its own `title` and `aria-label`. A tab strip that
	     shows icons only while inactive has no text to name it, and a name put
	     on a generic element inside the button is not exposed at all — it has to
	     be on the button. -->
		<!-- One block per tab: an sp element seats each tab's content in its
		     own trigger, and Svelte removes a block by walking its nodes as
		     siblings — two tabs in one block would leave one behind. -->
		{#if !hideCompose}
			<sp-tab
				value="compose"
				label="Compose"
				data-widget-part="messages.edit-tab"
			>
				<span data-widget-part="messages.edit-tab-body">
					<sp-icon name="pen" size="0.75em"></sp-icon>
					{#if tabGroup === "compose"}<span data-widget-part="messages.edit-tab-label">
							Compose
						</span>{/if}
				</span>
			</sp-tab>
		{/if}
		{#if !hideCompose}
			<sp-tab
				value="preview"
				label="Preview"
				data-widget-part="messages.edit-tab"
			>
				<span data-widget-part="messages.edit-tab-body">
					<sp-icon name="eye" size="0.75em"></sp-icon>
					{#if tabGroup === "preview"}<span data-widget-part="messages.edit-tab-label">
							Preview
						</span>{/if}
				</span>
			</sp-tab>
		{/if}
		{#if extraTabs}
			{#each extraTabs as tab}
				<!-- A tab not `alwaysVisible` folds into the More menu in a narrow
				     box (`data-collapsible`). -->
				<sp-tab
					value={tab.value}
					label={tab.title}
					data-widget-part="messages.edit-tab"
					data-collapsible={tab.alwaysVisible ? undefined : ""}
				>
					<span data-widget-part="messages.edit-tab-body">
						{@render tab.control?.()}
						{#if tabGroup === tab.value}<span data-widget-part="messages.edit-tab-label">
								{tab.title}
							</span>{/if}
					</span>
				</sp-tab>
			{/each}
			{#if collapsibleExtraTabs.length > 0}
				<!-- `self-stretch` rather than any stated height: it makes this
				     match whatever the real tab triggers work out to, at any
				     font scale, with no number to keep in sync. Skeleton sizes
				     those triggers itself (17.07px font, so their `2em` is
				     34.14px) and that isn't inherited here, so every attempt to
				     restate the height in em/rem lands a couple of pixels off.
				     What was here before: the button carried `min-h-[2em]` while
				     `btn-sm` shrank its font to 14.9px, so the same `2em` came
				     out 29.9px against the tabs' 34.1px — and `pt-[0.7em]` was a
				     hand-tuned patch for the difference that still left the icon
				     2px below centre. -->
				<div slot="list-end" data-widget-part="messages.edit-more-tabs">
					<!-- `sp-popover` (§3.5): our button is the trigger, the card the panel. -->
					<sp-popover
						placement="top"
						open={showMoreMenu}
						onopen-change={(e: CustomEvent<{ open: boolean }>) => (showMoreMenu = e.detail.open)}
					>
						<button slot="trigger" type="button" data-widget-part="messages.edit-more-tabs-button"
							data-active={activeExtraTab ? "" : undefined}
							aria-label="More composer tabs">
							<span data-widget-part="messages.edit-more-tabs-body">
								{#if activeExtraTab}
									{@render activeExtraTab.control?.()}
									<span data-widget-part="messages.edit-more-tabs-label">
										{activeExtraTab.title}
									</span>
								{:else}
									<sp-icon name="ellipsis-vertical" size="0.9em" data-widget-part="messages.edit-more-tabs-icon"></sp-icon>
								{/if}
							</span>
						</button>
						<div data-widget-part="messages.edit-more-tabs-panel">
									<header data-widget-part="messages.edit-more-tabs-title">
										<sp-icon name="ellipsis-vertical" size="18"></sp-icon>
										<p>More</p>
									</header>
									<article data-widget-part="messages.edit-more-tabs-list">
										{#each collapsibleExtraTabs as tab}
											<button
												type="button"
												data-widget-part="messages.edit-more-tabs-option"
												data-current={tabGroup === tab.value ? "" : undefined}
												onclick={() => {
													tabGroup = tab.value
													showMoreMenu = false
												}}
											>
												{@render tab.control?.()}
												<span>{tab.title}</span>
											</button>
										{/each}
									</article>
						</div>
					</sp-popover>
				</div>
			{/if}
		{/if}
	<!-- Spacing lives on the side groups as padding rather than as a `gap` on
	     this row, and each group only renders when it actually has something in
	     it. With a gap, the wrapper was always a flex item even when its
	     contents were hidden — the avatar is `max-lg:hidden`, so on mobile a
	     zero-width group still bought a full 16px of dead space at the left
	     edge, and the edit composer (which passes neither snippet) paid it
	     twice. This way an absent group costs nothing. -->
	<div data-widget-part="messages.edit-row">
		<!-- A column only exists when it has something to show. Reserving the
		     slots on tabs that render neither avatar nor send button left an
		     empty 48px band down the side of every extra tab; the panes below
		     are full-width content and should use the whole row. -->
		{#if leftControls && (tabGroup === "compose" || tabGroup === "preview")}
			<div role="group" aria-label="Message controls" data-widget-part="messages.edit-left">
				{@render leftControls()}
			</div>
		{/if}
		<div data-widget-part="messages.edit-panels">
			{#if !hideCompose}
				<sp-tab-panel value="compose">
					<!-- The field inside takes focus and carries the name and ARIA: this is
					     its host element; the field itself is its child `textarea`. -->
					<sp-composer-field
						data-widget-part="messages.edit-field"
						rows="1"
						label="Type your message here"
						{placeholder}
						submit-on={enterBehavior === "send" && submitOnEnter ? "enter" : "none"}
						keys={fieldKeys}
						spellcheck="true"
						autofocus={autofocus || undefined}
						oninput={hear}
						onsubmit={(e: CustomEvent<{ value: string }>) => {
							hear(e)
							onSend()
						}}
						onkey={handleFieldKey}
						{@attach writeField}
					></sp-composer-field>
				</sp-tab-panel>
			{/if}
			{#if !hideCompose}
				<sp-tab-panel value="preview">
					<!-- Sized to land on the same row height as the compose tab so
				     switching between them doesn't resize the bar. On mobile the
				     compose row is set by the 48px send button (taller than the
				     now single-line textarea), so the preview matches at 3rem; on
				     lg it's set by the 4em avatar, so the preview matches that.
				     `mb-[1em]` used to hang off the bottom here, which is what
				     made preview 4px taller than compose. -->
					<div
						data-widget-part="messages.edit-preview"
						role="region"
						aria-label="Message preview"
					>
						<div data-widget-part="messages.edit-preview-body">
							<sp-message-body text={markdown}></sp-message-body>
						</div>
					</div>
				</sp-tab-panel>
			{/if}
			{#if extraTabs}
				{#each extraTabs as tab}
					<sp-tab-panel value={tab.value}>
						<div role="region" aria-label="{tab.title} content">
							{@render tab.content?.()}
						</div>
					</sp-tab-panel>
				{/each}
			{/if}
		</div>
		{#if rightControls && tabGroup === "compose"}
			<div
				role="group"
				aria-label="Send controls"
				data-widget-part="messages.edit-right"
			>
				{@render rightControls()}
			</div>
		{/if}
	</div>
</sp-tabs>
