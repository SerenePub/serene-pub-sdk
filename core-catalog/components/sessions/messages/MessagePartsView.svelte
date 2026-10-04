<script lang="ts">
	/**
	 * The parts-native message body (20 §2, phase 2 of §13).
	 *
	 * Renders a message's typed parts: steps ascending (they accumulate — a
	 * stepped activity's phases stand side by side), each step showing only
	 * its active revision (`activeRevisions`, the swipe cursor), parts in
	 * their own ordinal order.
	 *
	 * Types: markdown is the body; reasoning and sections are collapsibles —
	 * the generalization that retires the two hardcoded blocks in
	 * SessionMessage. A reply's **folded sections** (B4; D5, 2026-09-27) are
	 * `core:section` parts: collapsed by default, laid out by the host above
	 * the reasoning and the body, and a section with `items` draws them as a
	 * list — never as JSON. An unknown namespaced type (its plugin is gone, or not
	 * yet installed) renders as a collapsed labeled section rather than
	 * breaking: uninstalling strands nothing. `core:image` / `core:file` parts
	 * are not drawn here: the media strip under the body shows them
	 * (composer attachments plan §3.4).
	 */
	import MessageBlocksView from "./MessageBlocksView.svelte"
	import type { MessagePartV1 } from "@serene-pub/sdk/component"

	interface Props {
		messageId: number
		parts: MessagePartV1[]
		activeRevisions: Record<string, number>
		/** An image in the message was clicked — its address. */
		onOpenImage?: (src: string) => void
		/** Declared block actions (20 §6) — fn + payload up to the page; a form's `blockId` rides along (U5d). */
		onAction?: (
			fn: string,
			payload?: Record<string, unknown>,
			action?: string,
			blockId?: string
		) => void
		/** The message body, so a form's question is not shown twice. */
		bodyText?: string
		/** The viewer's verdict on a form's addressee (U5d review, W7) — see `MessageBlocksView`. */
		canAnswer?: (addressee: string | undefined) => boolean
		/** Whether the channel has moved past a form (U5f) — see `MessageBlocksView`. */
		isStale?: (block: { head?: unknown; answered?: unknown }) => boolean
	}

	let {
		messageId,
		parts,
		activeRevisions,
		onOpenImage,
		onAction,
		bodyText,
		canAnswer,
		isStale
	}: Props = $props()

	/** Expanded state per collapsible, keyed by part id. Default collapsed. */
	let expanded = $state<Record<number, boolean>>({})

	const steps = $derived(
		[...new Set(parts.map((p) => p.step))].sort((a, b) => a - b)
	)

	function visibleParts(step: number): MessagePartV1[] {
		const active = activeRevisions[String(step)] ?? 0
		return parts
			.filter((p) => p.step === step && p.revision === active)
			.sort((a, b) => a.ordinal - b.ordinal)
	}

	function sectionTitle(part: MessagePartV1): string {
		const t = (part.data as any)?.title
		if (typeof t === "string" && t) return t
		return "Section"
	}

	/** A folded section's list, when it is one — strings only. */
	function sectionItems(part: MessagePartV1): string[] | undefined {
		const items = (part.data as any)?.items
		return Array.isArray(items) &&
			items.every((i: unknown) => typeof i === "string")
			? items
			: undefined
	}

	/** A section of reasoning wears the reasoning fold's glyph; every other kind the notebook. */
	function sectionIcon(part: MessagePartV1): "brain" | "notebook" {
		return (part.data as any)?.kind === "reasoning" ? "brain" : "notebook"
	}

	/** The graceful floor: what an unknown type shows when unfolded. */
	function unknownBody(part: MessagePartV1): string {
		if (part.content) return part.content
		try {
			return "```json\n" + JSON.stringify(part.data ?? {}, null, 2) + "\n```"
		} catch {
			return ""
		}
	}
</script>

{#snippet collapsible(
	part: MessagePartV1,
	title: string,
	icon: "brain" | "notebook" | "puzzle" | "wrench",
	body: string,
	items?: string[]
)}
	<div data-widget-part="messages.part-disclosure">
		<button
			type="button"
			data-widget-part="messages.part-disclosure-toggle"
			onclick={() => (expanded[part.id] = !expanded[part.id])}
			title={expanded[part.id] ? `Collapse ${title}` : `Expand ${title}`}
			aria-expanded={!!expanded[part.id]}
			aria-controls="part-{messageId}-{part.id}"
		>
			{#if icon === "brain"}
				<sp-icon name="brain-circuit" size="16"></sp-icon>
			{:else if icon === "notebook"}
				<sp-icon name="notebook-pen" size="16"></sp-icon>
			{:else if icon === "wrench"}
				<sp-icon name="wrench" size="16"></sp-icon>
			{:else}
				<sp-icon name="puzzle" size="16"></sp-icon>
			{/if}
			<span>{title}</span>
			<!-- Unfolded, the chevron turns: the toggle's `aria-expanded`. -->
			<sp-icon name="chevron-down" size="16" data-widget-part="messages.part-disclosure-chevron"></sp-icon>
		</button>
		<!-- grid 0fr -> 1fr transitions to/from auto height in pure CSS; the
		     overflow-hidden wrapper keeps collapsed content from spilling, and
		     the skin's `visibility` keeps the 0fr track's focusables out of the
		     tab order (`messages.part-disclosure-track`, widgets.css). -->
		<div
			id="part-{messageId}-{part.id}"
			data-widget-part="messages.part-disclosure-track"
			data-expanded={expanded[part.id] ? "" : undefined}
		>
			<div data-widget-part="messages.part-disclosure-clip">
				<div data-widget-part="messages.part-disclosure-panel messages.prose">
					{#if items}
						<ul data-widget-part="messages.fold-list">
							{#each items as item, i (i)}
								<li>{item}</li>
							{/each}
						</ul>
					{:else}
						<sp-message-body text={body}></sp-message-body>
					{/if}
				</div>
			</div>
		</div>
	</div>
{/snippet}

{#each steps as step, i (step)}
	{#if i > 0}
		<!-- Steps accumulate (20 §1): a stepped activity's phases render
		     stacked, separated so the progression reads as chapters. -->
		<hr data-widget-part="messages.part-step-divider" />
	{/if}
	{#each visibleParts(step) as part (part.id)}
		{#if part.type === "core:markdown"}
			<div data-widget-part="messages.part-markdown messages.prose">
				<sp-message-body
					text={part.content ?? ""}
					onopen-image={(e: CustomEvent<{ src: string }>) => onOpenImage?.(e.detail.src)}
				></sp-message-body>
			</div>
		{:else if part.type === "core:reasoning"}
			{@render collapsible(part, "Reasoning", "brain", part.content ?? "")}
		{:else if part.type === "core:tool-call"}
			{@render collapsible(
				part,
				(part.data as any)?.tool
					? `Tool: ${(part.data as any).tool}`
					: "Tool call",
				"wrench",
				part.content ?? unknownBody(part)
			)}
		{:else if part.type === "core:tool-result"}
			{@render collapsible(
				part,
				"Tool result",
				"wrench",
				part.content ?? unknownBody(part)
			)}
		{:else if part.type === "core:section"}
			{@render collapsible(
				part,
				sectionTitle(part),
				sectionIcon(part),
				part.content ?? "",
				sectionItems(part)
			)}
		{:else if part.type === "core:image" || part.type === "core:file"}
			<!-- Attachments and generated images are the media strip's
			     (MessageMediaStrip, under the body in every state of the row),
			     never drawn inline here — and never the unknown-type fold. -->
		{:else if Array.isArray((part.data as any)?.blocks)}
			<!-- A block tree (20 §6): plugin content as data, core's renderer,
			     whatever the part's namespace — the convention, not a registry. -->
			<MessageBlocksView
				blocks={(part.data as any).blocks}
				{onAction}
				{bodyText}
				{canAnswer}
				{isStale}
			/>
		{:else}
			{@render collapsible(part, part.type, "puzzle", unknownBody(part))}
		{/if}
	{/each}
{/each}
