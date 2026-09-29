<script lang="ts">
	/**
	 * The block renderer (20 §6): plugin message content as data, drawn by
	 * core's own components — themed, accessible, and with nothing to
	 * sanitize, because no markup ever crosses the boundary.
	 *
	 * Interactivity is declared: a `choices` button or a `form` submit names a
	 * function key, and `onAction` carries it (with the entered values as the
	 * payload) up to the page, which fires `sessions:fireAction` with the
	 * message as subject — the same audited path as every contributed button.
	 * The block's `action` — the identity of the declaration it fires,
	 * stamped by the outlet that wrote it (U5c review, W-E) — rides along
	 * verbatim, so the server holds the press to THAT declaration's audience;
	 * a block carrying none is fired as the legacy shape and gets the owner
	 * floor. This view never invents one.
	 *
	 * A **form** (R-15 *Forms*; U5d) is a `choices` or `form` block with an
	 * `addressee`: its `id` rides the press as `blockId`, so the server reads
	 * the block off the row and holds the press to the addressee — the person
	 * portraying them may answer, nobody else; when the AI portrays them the
	 * answer pipeline already answered. A choice's `choice` key is the
	 * payload. The question is shown above the options unless the message
	 * body already says it (`bodyText`), which is how the narrator's Ask
	 * reads: the question once, then the buttons.
	 *
	 * **Answered once** (U5d review, W7): a form the host has stamped
	 * `answered` shows the answer in place of its buttons, greyed; a form
	 * put to somebody the viewer does not portray shows no buttons at all —
	 * `canAnswer` is the viewer's verdict, handed down from the page, which
	 * mirrors the server's resolver (`utils/formAnswer.ts`). An affordance
	 * only: the server refuses regardless.
	 *
	 * **Superseded** (plans/29 R-15 *Staleness and order*; U5f): a form the
	 * channel has moved past — unanswered, and a newer message on its row's
	 * channel than the `head` it was issued at — collapses to one quiet line,
	 * no question and no buttons (the row's body already showed the question).
	 * `isStale` is the verdict, handed down from the message
	 * (`utils/formAnswer.ts` `staleOf`, the server's rule over the list the
	 * client holds). Answered beats stale.
	 *
	 * Every drawing of a `choices` or `form` block carries its stamped id as
	 * `data-block-id`: a notification's link lands on the form it names
	 * (`?message=<id>&block=<blockId>`, the page's `messageLanding.ts`).
	 */
	import MessageBlocksView from "./MessageBlocksView.svelte"
	import { useT } from "./conversation.svelte"
	import { answeredChoiceLabel, answeredOf } from "@serene-pub/core-catalog/conversation"

	const t = useT()

	interface Props {
		blocks: any[]
		onAction?: (
			fn: string,
			payload?: Record<string, unknown>,
			action?: string,
			blockId?: string
		) => void
		depth?: number
		/** The message body, so a form's question is not shown twice. */
		bodyText?: string
		/**
		 * May the viewer answer a form put to this addressee? Absent, every
		 * addressed form shows its buttons and the server judges the press.
		 */
		canAnswer?: (addressee: string | undefined) => boolean
		/**
		 * Has the channel moved past this form (U5f)? Absent, no form is
		 * drawn superseded and the server refuses a stale press.
		 */
		isStale?: (block: { head?: unknown; answered?: unknown }) => boolean
	}

	let { blocks, onAction, depth = 1, bodyText, canAnswer, isStale }: Props = $props()

	/** Whether the form is superseded — never when answered. */
	const superseded = (b: { head?: unknown; answered?: unknown }): boolean =>
		!answeredOf(b) && !!isStale && isStale(b)

	/** The addressee, when the block has one. */
	const addresseeOf = (b: { addressee?: unknown }): string | undefined =>
		typeof b?.addressee === "string" && b.addressee ? b.addressee : undefined

	/** Whether this viewer's buttons show on the form. */
	const mayAnswer = (b: { addressee?: unknown }): boolean =>
		!canAnswer || canAnswer(addresseeOf(b))

	/** A form's question, when the body does not already carry it. */
	const caption = (b: { question?: unknown }): string | null => {
		if (typeof b?.question !== "string" || !b.question.trim()) return null
		const q = b.question.trim()
		return bodyText && bodyText.trim().includes(q) ? null : q
	}

	/** The block's id, when the host stamped one. */
	const blockIdOf = (b: { id?: unknown }): string | undefined =>
		typeof b?.id === "string" && b.id ? b.id : undefined

	/** Form drafts, keyed by block index within this view. */
	let formDrafts = $state<Record<number, Record<string, unknown>>>({})

	function editField(i: number, key: string, value: unknown) {
		formDrafts[i] = { ...(formDrafts[i] ?? {}), [key]: value }
	}

	function submitForm(i: number, block: any) {
		if (!onAction) return
		// Declared defaults fill what the person didn't touch.
		const values: Record<string, unknown> = {}
		for (const [key, decl] of Object.entries(block.fields ?? {}) as any)
			if (decl?.default !== undefined) values[key] = decl.default
		Object.assign(values, formDrafts[i] ?? {})
		onAction(block.fn, values, identityOf(block), blockIdOf(block))
	}

	/** The block's stamped identity, when it carries a well-formed one. */
	const identityOf = (b: { action?: unknown }): string | undefined =>
		typeof b?.action === "string" && b.action ? b.action : undefined

	const fieldLabel = (key: string, decl: any): string =>
		typeof decl?.label === "string" ? decl.label : (decl?.label?.en ?? key)
</script>

<!-- The block tree's parts (`messages.block*`, STYLE-GUIDE §6.16): no look
     here; the default widget stylesheet draws them. `data-depth` is how deep
     in a group the view is (1: the part's own tree). -->
<div data-widget-part="messages.blocks" data-depth={depth}>
	{#each blocks as block, i}
		{#if block?.kind === "md"}
			<div data-widget-part="messages.block-markdown messages.prose">
				<sp-message-body text={String(block.text ?? "")}></sp-message-body>
			</div>
		{:else if block?.kind === "kv"}
			<dl data-widget-part="messages.block-kv">
				{#each block.rows ?? [] as row}
					<dt data-widget-part="messages.block-kv-label">{row.label}</dt>
					<dd>{row.value}</dd>
				{/each}
			</dl>
		{:else if block?.kind === "table"}
			<div data-widget-part="messages.block-table-scroll">
				<table data-widget-part="messages.block-table">
					<thead>
						<tr>
							{#each block.columns ?? [] as col}
								<th>{col}</th>
							{/each}
						</tr>
					</thead>
					<tbody>
						{#each block.rows ?? [] as row}
							<tr>
								{#each row as cell}
									<td>{cell}</td>
								{/each}
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{:else if block?.kind === "stat"}
			<div data-widget-part="messages.block-stat">
				<div data-widget-part="messages.block-stat-head">
					<span data-widget-part="messages.block-stat-label">{block.label}</span>
					<span data-widget-part="messages.block-stat-value">
						{block.value}{block.max != null ? ` / ${block.max}` : ""}
					</span>
				</div>
				{#if block.max}
					<div
						data-widget-part="messages.block-stat-track meter"
						role="meter"
						aria-label={block.label}
						aria-valuenow={block.value}
						aria-valuemin={0}
						aria-valuemax={block.max}
					>
						<div
							data-widget-part="messages.block-stat-fill"
							style="--sp-fill: {Math.max(
								0,
								Math.min(100, (block.value / block.max) * 100)
							)}%"
						></div>
					</div>
				{/if}
			</div>
		{:else if block?.kind === "image" && block.assetId != null}
			<img
				data-widget-part="messages.block-image"
				src="/session-assets/{block.assetId}"
				alt={block.alt ?? "attachment"}
			/>
		{:else if block?.kind === "choices" && superseded(block)}
			<!-- Superseded (U5f): the conversation moved on; one quiet line, no buttons. -->
			<p
				data-widget-part="messages.block-superseded"
				data-superseded="true"
				data-block-id={blockIdOf(block)}
			>
				<sp-icon name="history" size="14"></sp-icon>
				<span>{t("Superseded — the conversation moved on")}</span>
			</p>
		{:else if block?.kind === "choices"}
			{@const answered = answeredOf(block)}
			<div
				data-widget-part="messages.block-choices"
				role="group"
				aria-label={typeof block.question === "string" && block.question
					? block.question
					: t("Choices")}
				data-answered={answered ? "true" : undefined}
				data-block-id={blockIdOf(block)}
			>
				{#if caption(block)}
					<p data-widget-part="messages.block-caption">{caption(block)}</p>
				{/if}
				{#if answered}
					<!-- Answered once: the answer stands in for the buttons. -->
					<p data-widget-part="messages.block-answered">
						<sp-icon name="check" size="14"></sp-icon>
						<span data-widget-part="messages.block-answered-label">{t("Answered")}</span>
						{#if answeredChoiceLabel(block, answered)}
							<span>· {answeredChoiceLabel(block, answered)}</span>
						{/if}
					</p>
				{:else if !mayAnswer(block)}
					<!-- Somebody else's to answer: no buttons for this viewer. -->
					<p data-widget-part="messages.block-awaiting">{t("Awaiting an answer")}</p>
				{:else}
					<div data-widget-part="messages.block-choice-list">
						{#each block.actions ?? [] as action}
							<button
								type="button"
								data-widget-part="messages.block-choice"
								disabled={!onAction}
								onclick={() =>
									onAction?.(
										action.fn,
										typeof action.choice === "string"
											? { choice: action.choice }
											: {},
										identityOf(action),
										blockIdOf(block)
									)}
							>
								<sp-icon name="play" size="14"></sp-icon>
								{action.label}
							</button>
						{/each}
					</div>
				{/if}
			</div>
		{:else if block?.kind === "form" && superseded(block)}
			<!-- Superseded (U5f): the conversation moved on; one quiet line, no buttons. -->
			<p
				data-widget-part="messages.block-superseded"
				data-superseded="true"
				data-block-id={blockIdOf(block)}
			>
				<sp-icon name="history" size="14"></sp-icon>
				<span>{t("Superseded — the conversation moved on")}</span>
			</p>
		{:else if block?.kind === "form" && answeredOf(block)}
			<div
				data-widget-part="messages.block-form"
				data-answered="true"
				data-block-id={blockIdOf(block)}
			>
				{#if caption(block)}
					<p data-widget-part="messages.block-caption">{caption(block)}</p>
				{/if}
				<p data-widget-part="messages.block-answered">
					<sp-icon name="check" size="14"></sp-icon>
					<span data-widget-part="messages.block-answered-label">{t("Answered")}</span>
				</p>
			</div>
		{:else if block?.kind === "form" && !mayAnswer(block)}
			<div data-widget-part="messages.block-form" data-block-id={blockIdOf(block)}>
				{#if caption(block)}
					<p data-widget-part="messages.block-caption">{caption(block)}</p>
				{/if}
				<p data-widget-part="messages.block-awaiting">{t("Awaiting an answer")}</p>
			</div>
		{:else if block?.kind === "form"}
			<div data-widget-part="messages.block-form" data-block-id={blockIdOf(block)}>
				{#if caption(block)}
					<p data-widget-part="messages.block-caption">{caption(block)}</p>
				{/if}
				{#each Object.entries(block.fields ?? {}) as [key, decl]}
					{@const d = decl as any}
					<label data-widget-part="messages.block-field">
						<span data-widget-part="messages.block-field-label">{fieldLabel(key, d)}</span>
						{#if d.type === "boolean"}
							<input
								type="checkbox"
								data-widget-part="messages.block-checkbox"
								checked={!!(formDrafts[i]?.[key] ?? d.default)}
								onchange={(e) =>
									editField(i, key, e.currentTarget.checked)}
							/>
						{:else if d.type === "enum"}
							<sp-combobox
								data-widget-part="messages.block-select"
								label={key}
								value={String(formDrafts[i]?.[key] ?? d.default ?? "")}
								onchange={(e: CustomEvent<{ value: string }>) =>
									editField(i, key, e.detail.value)}
							>
								{#each d.of ?? [] as opt}
									<sp-option value={opt}>{opt}</sp-option>
								{/each}
							</sp-combobox>
						{:else if d.type === "number" || d.type === "integer"}
							<input
								type="number"
								data-widget-part="messages.block-input"
								step={d.type === "integer" ? "1" : "any"}
								value={formDrafts[i]?.[key] ?? d.default ?? ""}
								oninput={(e) => {
									const n = Number(e.currentTarget.value)
									editField(
										i,
										key,
										Number.isFinite(n) ? n : undefined
									)
								}}
							/>
						{:else}
							<input
								type="text"
								data-widget-part="messages.block-input"
								value={String(
									formDrafts[i]?.[key] ?? d.default ?? ""
								)}
								oninput={(e) =>
									editField(i, key, e.currentTarget.value)}
							/>
						{/if}
					</label>
				{/each}
				<button
					type="button"
					data-widget-part="messages.block-submit"
					disabled={!onAction}
					onclick={() => submitForm(i, block)}
				>
					{block.label ?? "Submit"}
				</button>
			</div>
		{:else if block?.kind === "group" && Array.isArray(block.blocks) && depth < 3}
			<div
				data-widget-part="messages.block-group"
				data-layout={block.layout === "row" ? "row" : "column"}
			>
				<MessageBlocksView
					blocks={block.blocks}
					{onAction}
					{bodyText}
					{canAnswer}
					{isStale}
					depth={depth + 1}
				/>
			</div>
		{/if}
	{/each}
</div>
