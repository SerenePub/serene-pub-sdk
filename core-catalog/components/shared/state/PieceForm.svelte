<script lang="ts">
	/**
	 * 🚧 A piece's edit form (PLAN-sheet-widget §3): generated from the piece
	 * shape — a text line, a paragraph, a number, a choice, a switch, a group
	 * for a record, a line of words for a list of words. A reference's form
	 * says how many are held and overrides the row's fields for this holder
	 * only; a field left as the row has it is not stored. Save checks the
	 * piece as the write gate would and says why it was refused.
	 *
	 * Drawn in two places: inside a piece's detail popover (Edit flips the
	 * popover's body to it; Save and Cancel go back to the detail) and in line
	 * under a list for a piece being added (Add has no row to anchor to).
	 *
	 * Saving resolves to the host's refusal or `null` (A21): the form stays
	 * open with the draft until the write lands, and a refusal is said in its
	 * own `piece-card.invalid` line.
	 */
	import {
		fieldValueText,
		pieceDraftOf,
		pieceFormFields,
		pieceFromDraft,
		pieceViewOf,
		type PieceContext
	} from "@serene-pub/core-catalog/session-state"
	import type { SlotRefusal, SlotWriteResult } from "./slotWriter.svelte"

	type SlotPiece = Parameters<typeof pieceViewOf>[0]
	type FieldDecl = ReturnType<typeof pieceFormFields>[number][1]

	interface Props {
		piece: SlotPiece
		ctx?: PieceContext
		t: (source: string) => string
		onsave: (piece: SlotPiece) => Promise<SlotWriteResult>
		oncancel: () => void
	}

	let { piece, ctx = {}, t, onsave, oncancel }: Props = $props()

	// The draft is the piece as the form opened: a push while typing never resets it.
	// svelte-ignore state_referenced_locally
	const opened = piece
	// svelte-ignore state_referenced_locally
	let draft = $state<Record<string, unknown>>(pieceDraftOf(opened, ctx))
	// svelte-ignore state_referenced_locally
	let countDraft = $state<number | string | null>(pieceViewOf(opened, ctx, t).count)
	let refusal = $state<SlotRefusal | null>(null)
	let saving = $state(false)
	let view = $derived(pieceViewOf(opened, ctx, t))
	let fields = $derived(pieceFormFields(ctx, opened))

	async function save() {
		if (saving) return
		const edit = pieceFromDraft(opened, draft, countDraft, ctx, t)
		if (!edit.piece) {
			refusal = { text: edit.refusal ?? t("That piece is not complete."), detail: null }
			return
		}
		saving = true
		refusal = null
		try {
			const refused = await onsave(edit.piece)
			if (refused) refusal = refused
		} finally {
			saving = false
		}
	}

	const label = (key: string, decl: FieldDecl) => {
		const l = decl.label
		const s = typeof l === "string" ? l : (l as Record<string, string> | undefined)?.en
		return s && s.trim() ? s : key
	}

	/** The draft's record at a path, made when missing. */
	function recordAt(path: readonly string[]): Record<string, unknown> {
		let at: Record<string, unknown> = draft
		for (const k of path) {
			const next = at[k]
			if (!next || typeof next !== "object" || Array.isArray(next)) at[k] = {}
			at = at[k] as Record<string, unknown>
		}
		return at
	}
	const valueAt = (path: readonly string[], key: string): unknown => {
		let at: unknown = draft
		for (const k of path) at = at && typeof at === "object" ? (at as Record<string, unknown>)[k] : undefined
		return at && typeof at === "object" ? (at as Record<string, unknown>)[key] : undefined
	}
	const setAt = (path: readonly string[], key: string, value: unknown) => {
		recordAt(path)[key] = value
	}
	const asText = (v: unknown) => (v === undefined || v === null ? "" : Array.isArray(v) ? v.join(", ") : String(v))
	/** An enum's stored keys, in order: its members', else its `of`. */
	const optionsOf = (decl: FieldDecl): string[] =>
		decl.members?.length ? decl.members.map((m) => m.key) : [...((decl.of as readonly string[] | undefined) ?? [])]
	const isWords = (decl: FieldDecl) =>
		decl.type === "list" && (!decl.item || decl.item.type === "string" || decl.item.type === "enum")
</script>

{#snippet fieldOf(path: readonly string[], key: string, decl: FieldDecl)}
	{@const name = label(key, decl)}
	{@const value = valueAt(path, key)}
	{#if decl.type === "object"}
		<div data-widget-part="piece-card.group" role="group" aria-label={name} data-field={key}>
			<span data-widget-part="piece-card.group-label label">{name}</span>
			{#each Object.entries(decl.fields ?? {}) as [sub, subDecl] (sub)}
				{@render fieldOf([...path, key], sub, subDecl)}
			{/each}
		</div>
	{:else if decl.type === "boolean"}
		<label data-widget-part="piece-card.field" data-field={key}>
			<input
				type="checkbox"
				data-widget-part="piece-card.check"
				checked={value === true}
				onchange={(e) => setAt(path, key, e.currentTarget.checked)}
			/>
			<span data-widget-part="piece-card.field-label label">{name}</span>
		</label>
	{:else if decl.type === "enum"}
		<div data-widget-part="piece-card.field" data-field={key}>
			<span data-widget-part="piece-card.field-label label">{name}{decl.required ? " *" : ""}</span>
			<sp-combobox
				data-widget-part="piece-card.choice"
				label={name}
				value={asText(value)}
				onchange={(e: CustomEvent<{ value: string }>) => setAt(path, key, e.detail.value || undefined)}
			>
				{#if !decl.required}<sp-option value="">{t("None")}</sp-option>{/if}
				{#each optionsOf(decl) as option (option)}
					<sp-option value={option}>{fieldValueText(decl, option)}</sp-option>
				{/each}
			</sp-combobox>
		</div>
	{:else if decl.type === "list" && !isWords(decl)}
		<!-- A list of records (a creature's attacks) is kept as it is: read here, changed in the lorebook. -->
		<p data-widget-part="piece-card.field piece-card.kept" data-field={key}>
			<span data-widget-part="piece-card.field-label label">{name}</span>
			<span data-widget-part="piece-card.kept-value value">{fieldValueText(decl, value) ?? t("none")}</span>
		</p>
	{:else}
		<label data-widget-part="piece-card.field" data-field={key}>
			<span data-widget-part="piece-card.field-label label">{name}{decl.required ? " *" : ""}</span>
			{#if decl.type === "text"}
				<textarea
					data-widget-part="piece-card.input"
					rows="3"
					value={asText(value)}
					oninput={(e) => setAt(path, key, e.currentTarget.value)}
				></textarea>
			{:else}
				<input
					data-widget-part="piece-card.input"
					type={decl.type === "integer" || decl.type === "number" ? "number" : "text"}
					step={decl.type === "integer" ? "1" : decl.type === "number" ? "any" : undefined}
					min={typeof decl.min === "number" && decl.type !== "list" ? decl.min : undefined}
					max={typeof decl.max === "number" && decl.type !== "list" ? decl.max : undefined}
					placeholder={isWords(decl) ? t("Words, separated by commas") : undefined}
					value={asText(value)}
					oninput={(e) => setAt(path, key, e.currentTarget.value)}
				/>
			{/if}
		</label>
	{/if}
{/snippet}

<div
	data-widget-part="piece-card.form"
	data-piece-form={view.form}
	role="group"
	aria-label={view.name && view.name !== t("Unnamed") ? t("Edit {item}").replace("{item}", view.name) : t("New piece")}
>
	{#if view.form !== "inline"}
		<p data-widget-part="piece-card.form-note">
			{t("Changes here are for this character only; the original stays as it is.")}
		</p>
	{/if}
	<label data-widget-part="piece-card.field" data-field="count">
		<span data-widget-part="piece-card.field-label label">{t("How many")}</span>
		<input
			data-widget-part="piece-card.input"
			type="number"
			min="1"
			step="1"
			value={asText(countDraft)}
			oninput={(e) => (countDraft = e.currentTarget.value)}
		/>
	</label>
	{#each fields as [key, decl] (key)}
		{@render fieldOf([], key, decl)}
	{/each}
	{#if refusal}<p data-widget-part="piece-card.invalid" role="alert" title={refusal.detail ?? undefined}>{refusal.text}</p>{/if}
	<div data-widget-part="piece-card.actions toolbar">
		<button type="button" data-widget-part="piece-card.save" disabled={saving} onclick={() => void save()}>{t("Save")}</button>
		<button type="button" data-widget-part="piece-card.cancel" onclick={oncancel}>{t("Cancel")}</button>
	</div>
</div>
