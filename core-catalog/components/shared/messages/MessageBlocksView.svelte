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
	 *
	 * 🚧 A **roll form** (`roll`, Lair rewrite D3, 2026-10-21) is a form put
	 * to the person who calls the rolls — the Lair's game master: which check
	 * (one of `stats`, else `stat` alone), how hard (one of `bands`, the
	 * session's rules' difficulties, `band` proposed), then **Roll**, or
	 * **No check** — the attempt simply happens as the story says. The press
	 * is `{ check, stat, band }` (the server adds the band's target and
	 * checks it all against the stored block, `formFireOf`). Answered,
	 * superseded and somebody-else's read as a form's do; the answered line
	 * is the server's words (_Stealth — Hard_, _No check_).
	 *
	 * 🚧 An **outcome block** (stored kind `dice`) is a result, never a
	 * question: what was checked, what it came to, against what, and how it
	 * came out in the rules' own words — its tone from the one five-band scale
	 * (`data-five`) — with how the number was reached under it. Read aloud as
	 * one sentence. 🚧 Method-aware (2026-10-22, `data-method`): a die's total,
	 * a pool's successes, the cards drawn, a comparison, a spend, or a
	 * judgement with no number at all.
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

	/* ── 🚧 the roll form and the dice (Lair rewrite D3) ──────────────── */

	type RollCheck = { key: string; label: string }
	/** A drawn card as the outcome block carries it (the SDK's `OutcomeCard`, spelled here: components import the SDK only through its component entry). */
	type OutcomeCard = { label?: string }
	type RollBand = { id: string; label: string; target?: number }

	/** The checks a roll form offers: its `stats`, else its `stat` alone. */
	const rollChecks = (b: any): RollCheck[] => {
		const listed = Array.isArray(b?.stats)
			? (b.stats as any[]).filter(
					(c) => typeof c?.key === "string" && c.key
				).map((c) => ({ key: c.key as string, label: typeof c.label === "string" && c.label ? c.label : c.key }))
			: []
		if (listed.length) return listed
		return typeof b?.stat === "string" && b.stat ? [{ key: b.stat, label: b.stat }] : []
	}

	/** The difficulties a roll form offers, in the rules' order. */
	const rollBands = (b: any): RollBand[] =>
		Array.isArray(b?.bands)
			? (b.bands as any[])
					.filter((x) => typeof x?.id === "string" && x.id)
					.map((x) => ({
						id: x.id as string,
						label: typeof x.label === "string" && x.label ? x.label : x.id,
						...(typeof x.target === "number" ? { target: x.target } : {})
					}))
			: []

	/** A difficulty as an option reads: its words, and the number it asks for. */
	const bandWords = (band: RollBand): string =>
		band.target !== undefined ? `${band.label} (${band.target})` : band.label

	/** Roll drafts — the check and difficulty picked — keyed by block index. */
	let rollDrafts = $state<Record<number, { stat?: string; band?: string }>>({})

	/** The check this roll form stands at: the picked one, else the proposed, else the first. */
	const rollStat = (i: number, b: any): string => {
		const checks = rollChecks(b)
		const picked = rollDrafts[i]?.stat
		if (picked && checks.some((c) => c.key === picked)) return picked
		if (typeof b?.stat === "string" && checks.some((c) => c.key === b.stat)) return b.stat
		return checks[0]?.key ?? ""
	}

	/** The difficulty this roll form stands at: the picked one, else the proposed, else the first. */
	const rollBand = (i: number, b: any): string => {
		const bands = rollBands(b)
		const picked = rollDrafts[i]?.band
		if (picked && bands.some((x) => x.id === picked)) return picked
		if (typeof b?.band === "string" && bands.some((x) => x.id === b.band)) return b.band
		return bands[0]?.id ?? ""
	}

	function pickRoll(i: number, key: "stat" | "band", value: string) {
		rollDrafts[i] = { ...(rollDrafts[i] ?? {}), [key]: value }
	}

	/** Answer a roll form: roll the picked check at the picked difficulty, or No check. */
	function answerRoll(i: number, block: any, check: boolean) {
		if (!onAction) return
		onAction(
			block.fn,
			{ check, stat: rollStat(i, block), band: rollBand(i, block) },
			identityOf(block),
			blockIdOf(block)
		)
	}

	/** 🚧 The check method an outcome names; absent, a die against a target (every block before 2026-10-22). */
	const methodOf = (b: any): string => (typeof b?.method === "string" && b.method ? b.method : "die-target")

	/** 🚧 The glyph for how it was decided. */
	const GLYPHS: Record<string, string> = { "die-target": "dices", "dice-pool": "dices", "card-draw": "spade", compare: "scale", bid: "coins", none: "gavel" }
	const glyphOf = (b: any): string => GLYPHS[methodOf(b)] ?? "dices"

	/** 🚧 What it came to, as the head shows it: a total, a pool's successes, a spend — nothing for a judgement. */
	const tallyOf = (b: any): string => {
		const m = methodOf(b)
		if (m === "none" || typeof b?.rolled !== "number") return ""
		if (m === "dice-pool" && b.pool && typeof b.pool.size === "number")
			return `${b.rolled} ${b.rolled === 1 ? t("success") : t("successes")} / ${b.pool.size}`
		if (m === "bid") return `${t("spent")} ${b.rolled}`
		return String(b.rolled)
	}

	/** 🚧 What it was set against, in the head: a number, or the other side's value in words. */
	const againstOf = (b: any): string => {
		const versus = b?.compare && typeof b.compare.versus === "string" ? b.compare.versus : ""
		if (versus) return `${t("against")} ${versus}${typeof b?.against === "number" ? ` (${b.against})` : ""}`
		return typeof b?.against === "number" ? `${t("against")} ${b.against}` : ""
	}

	/** An outcome as one sentence: _Stealth: 15 against 14. Success._ — _Nerve: spent 2. Success._ */
	const diceSentence = (b: any): string => {
		const stat = typeof b?.stat === "string" && b.stat ? b.stat : t("A roll")
		const tally = tallyOf(b)
		const against = againstOf(b)
		const cards = Array.isArray(b?.cards) && b.cards.length ? `${t("drew")} ${b.cards.map((c: OutcomeCard) => c?.label).join(", ")}, ` : ""
		const said = [cards + tally, against].filter(Boolean).join(" ")
		const outcome = typeof b?.outcome === "string" && b.outcome ? `${b.outcome}.` : ""
		return `${stat}: ${[said ? `${said}.` : "", outcome].filter(Boolean).join(" ")}`
	}

	/** The five-band tone a dice result carries, when it names a known one. */
	const FIVE = new Set(["crit-fail", "fail", "partial", "success", "crit"])
	const fiveOf = (b: any): string | undefined =>
		typeof b?.five === "string" && FIVE.has(b.five) ? b.five : undefined
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
			{@const answered = answeredOf(block)}
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
					{#if answered?.value}
						<span>· {answered.value}</span>
					{/if}
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
		{:else if block?.kind === "roll" && superseded(block)}
			<!-- Superseded (U5f): the conversation moved on; one quiet line, no buttons. -->
			<p
				data-widget-part="messages.block-superseded"
				data-superseded="true"
				data-block-id={blockIdOf(block)}
			>
				<sp-icon name="history" size="14"></sp-icon>
				<span>{t("Superseded — the conversation moved on")}</span>
			</p>
		{:else if block?.kind === "roll" && answeredOf(block)}
			{@const answered = answeredOf(block)}
			<!-- 🚧 A roll form, answered: the call in words (Stealth — Hard, No check). -->
			<div
				data-widget-part="messages.block-roll"
				data-answered="true"
				data-block-id={blockIdOf(block)}
			>
				{#if caption(block)}
					<p data-widget-part="messages.block-caption">{caption(block)}</p>
				{/if}
				<p data-widget-part="messages.block-answered">
					<sp-icon name="check" size="14"></sp-icon>
					<span data-widget-part="messages.block-answered-label">{t("Answered")}</span>
					{#if answered?.value}
						<span>· {answered.value}</span>
					{/if}
				</p>
			</div>
		{:else if block?.kind === "roll" && !mayAnswer(block)}
			<!-- 🚧 Somebody else calls this roll (the game master): the question, no controls. -->
			<div data-widget-part="messages.block-roll" data-block-id={blockIdOf(block)}>
				{#if caption(block)}
					<p data-widget-part="messages.block-caption">{caption(block)}</p>
				{/if}
				<p data-widget-part="messages.block-awaiting">{t("Awaiting an answer")}</p>
			</div>
		{:else if block?.kind === "roll"}
			{@const checks = rollChecks(block)}
			{@const bands = rollBands(block)}
			{@const stat = rollStat(i, block)}
			{@const band = rollBand(i, block)}
			<!-- 🚧 A roll form (Lair rewrite D3): which check, how hard, then Roll — or No check. -->
			<div
				data-widget-part="messages.block-roll"
				role="group"
				aria-label={caption(block) ?? t("A roll to call")}
				data-block-id={blockIdOf(block)}
			>
				{#if caption(block)}
					<p data-widget-part="messages.block-caption">{caption(block)}</p>
				{/if}
				<div data-widget-part="messages.block-roll-fields">
					<div data-widget-part="messages.block-field messages.block-roll-check">
						<!-- A list names itself (its own label); a lone value is named here. -->
						{#if checks.length <= 1}
							<span data-widget-part="messages.block-field-label">{t("Check")}</span>
						{/if}
						{#if checks.length > 1}
							<sp-combobox
								data-widget-part="messages.block-select"
								label={t("Check")}
								value={stat}
								onchange={(e: CustomEvent<{ value: string }>) =>
									pickRoll(i, "stat", e.detail.value)}
							>
								{#each checks as c (c.key)}
									<sp-option value={c.key}>{c.label}</sp-option>
								{/each}
							</sp-combobox>
						{:else}
							<span data-widget-part="messages.block-roll-value">{checks[0]?.label ?? stat}</span>
						{/if}
					</div>
					<div data-widget-part="messages.block-field messages.block-roll-band">
						{#if bands.length <= 1}
							<span data-widget-part="messages.block-field-label">{t("Difficulty")}</span>
						{/if}
						{#if bands.length > 1}
							<sp-combobox
								data-widget-part="messages.block-select"
								label={t("Difficulty")}
								value={band}
								onchange={(e: CustomEvent<{ value: string }>) =>
									pickRoll(i, "band", e.detail.value)}
							>
								{#each bands as b (b.id)}
									<sp-option value={b.id}>{bandWords(b)}</sp-option>
								{/each}
							</sp-combobox>
						{:else if bands.length}
							<span data-widget-part="messages.block-roll-value">{bandWords(bands[0])}</span>
						{/if}
					</div>
				</div>
				<div data-widget-part="messages.block-choice-list messages.block-roll-answers">
					<button
						type="button"
						data-widget-part="messages.block-submit messages.block-roll-go"
						disabled={!onAction || !stat || !band}
						onclick={() => answerRoll(i, block, true)}
					>
						<sp-icon name="dices" size="14"></sp-icon>
						{t("Roll")}
					</button>
					<button
						type="button"
						data-widget-part="messages.block-choice messages.block-roll-skip"
						disabled={!onAction}
						onclick={() => answerRoll(i, block, false)}
					>
						{t("No check")}
					</button>
				</div>
			</div>
		{:else if block?.kind === "dice"}
			{@const five = fiveOf(block)}
			{@const tally = tallyOf(block)}
			{@const against = againstOf(block)}
			<!-- 🚧 An outcome (Lair rewrite D3; any check method since 2026-10-22): what, what it came to, against what, how it came out; its tone from the five bands, the whole sentence its title. -->
			<div
				data-widget-part="messages.block-dice"
				data-five={five}
				data-method={methodOf(block)}
				title={diceSentence(block)}
			>
				<div data-widget-part="messages.block-dice-head">
					<sp-icon name={glyphOf(block)} size="16" data-widget-part="messages.block-dice-glyph"></sp-icon>
					<span data-widget-part="messages.block-dice-stat">{block.stat}</span>
					{#if tally}
						<span data-widget-part="messages.block-dice-total">{tally}</span>
					{/if}
					{#if against}
						<span data-widget-part="messages.block-dice-against">{against}</span>
					{/if}
					{#if block.outcome}
						<span data-widget-part="messages.block-dice-outcome chip">{block.outcome}</span>
					{/if}
				</div>
				{#if typeof block.explain === "string" && block.explain}
					<p data-widget-part="messages.block-dice-explain">{block.explain}</p>
				{:else if Array.isArray(block.cards) && block.cards.length}
					<p data-widget-part="messages.block-dice-explain">
						{t("Drew")} {block.cards.map((c: OutcomeCard) => c?.label).join(", ")}
					</p>
				{:else if Array.isArray(block.faces) && block.faces.length}
					<p data-widget-part="messages.block-dice-explain">
						{t("Rolled")} {block.faces.join(", ")}
					</p>
				{/if}
				<!-- 🚧 Ties on the graph (T2): the lorebook rows that followed a tie this moment moved. -->
				{#if Array.isArray(block.follows)}
					{#each block.follows as line, fi (fi)}
						{#if typeof line === "string" && line}
							<p data-widget-part="messages.block-dice-follows" data-follows>
								<span>{line}</span>
								<span data-widget-part="messages.block-dice-follows-note">{t("follows the tie")}</span>
							</p>
						{/if}
					{/each}
				{/if}
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
