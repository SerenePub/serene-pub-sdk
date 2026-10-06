<script lang="ts">
	/**
	 * The author's note (2026-10-02, AN1; Chat only, owner ruling): the
	 * session's own note to the model — what is true now, where the story
	 * should lean — placed `depth` messages before the reply on every
	 * `interval`-th reply. Not the post-history reminder, which is the
	 * pipeline's and the card's; this widget never shows or edits that.
	 *
	 * Everything is asked of the page: `authors-note` reads the note, whether
	 * the viewer may change it (the session's owner), and what the newest
	 * reply's prompt did with it; `set-authors-note` saves it, whole. It asks
	 * again when a generation ends, so the last-reply line follows the
	 * conversation, and when the session's genre fields change
	 * (`genreFields:changed`), so a note saved in Edit Session or another tab
	 * shows here.
	 *
	 * Saved explicitly (STYLE-GUIDE §6.14): edits wait for **Save**; dirty is
	 * derived (the draft differs from what is saved, never "touched"); a
	 * re-read moves the saved snapshot and keeps what is being typed.
	 * What goes wrong is said here, in this widget (R77) — never a toast.
	 *
	 * The markup carries no look: its elements carry `authors-note.*` widget
	 * parts and the default widget stylesheet draws them (STYLE-GUIDE §6.16).
	 */
	import { untrack } from "svelte"
	import type { AuthorsNoteV1, AuthorsNoteValueV1 } from "@serene-pub/sdk/component"
	import {
		AUTHORS_NOTE_DEFAULTS,
		AUTHORS_NOTE_ROLES,
		authorsNoteDirty,
		authorsNoteLastReplyLine,
		readAuthorsNote
	} from "@serene-pub/core-catalog/authors-note"
	import { useWidgetContext } from "../../../shared/context"

	const widget = useWidgetContext()
	const t = (source: string): string => widget?.current?.t(source) ?? source

	/** What the page last answered. */
	let answer = $state<AuthorsNoteV1 | null>(null)
	/** The form's own copy; Save sends it whole. */
	let draft = $state<AuthorsNoteValueV1>({ ...AUTHORS_NOTE_DEFAULTS })
	let readError = $state<string | null>(null)
	let saveError = $state<string | null>(null)
	let saving = $state(false)

	const saved = $derived(answer ? readAuthorsNote(answer.note) : AUTHORS_NOTE_DEFAULTS)
	const dirty = $derived(answer ? authorsNoteDirty(draft, saved) : false)
	const canEdit = $derived(answer?.canEdit === true)
	const lastLine = $derived(answer ? authorsNoteLastReplyLine(answer.lastReply, t) : null)

	const reason = (e: unknown) => (e instanceof Error ? e.message : String(e))

	/**
	 * Take the page's answer as the saved snapshot. A clean form follows it;
	 * an edited one keeps the person's edits (§6.14 — a push never lies).
	 */
	function adopt(next: AuthorsNoteV1) {
		const wasDirty = answer ? authorsNoteDirty(draft, readAuthorsNote(answer.note)) : false
		answer = next
		if (!wasDirty) draft = readAuthorsNote(next.note)
	}

	let asked = 0
	function ask() {
		const ctx = untrack(() => widget?.current)
		if (!ctx) return
		const ticket = ++asked
		ctx.request("authors-note", {}).then(
			(res) => {
				if (ticket !== asked) return
				readError = null
				adopt(res)
			},
			(e) => {
				if (ticket !== asked) return
				readError = reason(e)
			}
		)
	}

	$effect(() => untrack(() => ask()))

	// A reply finished: what it did with the note is on its receipt now.
	$effect(() =>
		untrack(() =>
			widget?.current?.on("generation:end", (e) => {
				if (e.kind === "generation:end") ask()
			})
		)
	)

	// The note was saved somewhere else — Edit Session, or this widget in
	// another tab: read it again (a clean form follows it, an edited one
	// keeps the person's edits).
	$effect(() =>
		untrack(() =>
			widget?.current?.on("genreFields:changed", (e) => {
				if (e.kind === "genreFields:changed") ask()
			})
		)
	)

	async function save() {
		const ctx = untrack(() => widget?.current)
		if (!ctx || !canEdit || !dirty || saving) return
		saving = true
		saveError = null
		const sent = readAuthorsNote(draft)
		try {
			const now = await ctx.request("set-authors-note", { note: sent })
			// The saved row is what the page answered; the form is clean against it.
			answer = now
			draft = readAuthorsNote(now.note)
		} catch (e) {
			saveError = t("Not saved: {reason}").replace("{reason}", reason(e))
		} finally {
			saving = false
		}
	}

	function discard() {
		draft = { ...saved }
		saveError = null
	}

	const setNumber = (key: "depth" | "interval", raw: string) => {
		const n = raw.trim() === "" ? NaN : Number(raw)
		draft = { ...draft, [key]: Number.isFinite(n) ? n : draft[key] }
	}
</script>

<div data-widget-part="authors-note.root" data-widget="authors-note" data-dirty={dirty ? "" : undefined}>
	{#if readError}
		<p data-widget-part="authors-note.alert" role="alert">
			{t("Could not read the author's note: {reason}").replace("{reason}", readError)}
		</p>
	{/if}
	{#if !answer}
		{#if !readError}
			<p data-widget-part="authors-note.note">{t("Reading the author's note…")}</p>
		{/if}
	{:else if !answer.offered}
		<p data-widget-part="authors-note.note">
			{t("This kind of session has no author's note.")}
		</p>
	{:else}
		{#if !canEdit}
			<p data-widget-part="authors-note.note">
				{t("Only the session's owner can change the author's note.")}
			</p>
		{/if}
		<label data-widget-part="authors-note.field">
			<span data-widget-part="authors-note.label label">{t("Note")}</span>
			<textarea
				data-widget-part="authors-note.text"
				rows="5"
				placeholder={t("What is true now, or where the story should go.")}
				disabled={!canEdit}
				value={draft.text}
				oninput={(e) => (draft = { ...draft, text: e.currentTarget.value })}
			></textarea>
		</label>
		<div data-widget-part="authors-note.numbers">
			<label data-widget-part="authors-note.field">
				<span data-widget-part="authors-note.label label">{t("Messages from the end")}</span>
				<input
					type="number"
					data-widget-part="authors-note.number"
					min="0"
					step="1"
					disabled={!canEdit}
					value={String(draft.depth)}
					oninput={(e) => setNumber("depth", e.currentTarget.value)}
				/>
			</label>
			<label data-widget-part="authors-note.field">
				<span data-widget-part="authors-note.label label">{t("Every how many replies")}</span>
				<input
					type="number"
					data-widget-part="authors-note.number"
					min="1"
					step="1"
					disabled={!canEdit}
					value={String(draft.interval)}
					oninput={(e) => setNumber("interval", e.currentTarget.value)}
				/>
			</label>
		</div>
		<p data-widget-part="authors-note.help">
			{t("0 messages puts it right before the reply. Every 1 reply adds it each time.")}
		</p>
		<sp-accordion data-widget-part="authors-note.advanced">
			<sp-accordion-item value="advanced" heading={t("Advanced")} level="4">
				<span data-widget-part="authors-note.role">
					<sp-combobox
						data-widget-part="authors-note.role-field"
						label={t("Sent as")}
						value={draft.role}
						disabled={!canEdit}
						onchange={(e: CustomEvent<{ value: string }>) => {
							const next = AUTHORS_NOTE_ROLES.find((r) => r.value === e.detail.value)
							if (next) draft = { ...draft, role: next.value }
						}}
					>
						{#each AUTHORS_NOTE_ROLES as r (r.value)}
							<sp-option value={r.value}>{t(r.label)}</sp-option>
						{/each}
					</sp-combobox>
				</span>
			</sp-accordion-item>
		</sp-accordion>
		{#if saveError}
			<p data-widget-part="authors-note.alert" role="alert">{saveError}</p>
		{/if}
		{#if canEdit}
			<div data-widget-part="authors-note.actions toolbar">
				{#if dirty}
					<span data-widget-part="authors-note.unsaved">{t("Unsaved changes")}</span>
					<button type="button" data-widget-part="authors-note.discard" disabled={saving} onclick={discard}>
						{t("Discard")}
					</button>
				{/if}
				<button
					type="button"
					data-widget-part="authors-note.save"
					disabled={!dirty || saving}
					onclick={save}
				>
					{saving ? t("Saving…") : t("Save")}
				</button>
			</div>
		{/if}
		{#if lastLine}
			<p data-widget-part="authors-note.last-reply" data-applied={answer.lastReply?.included ? "" : undefined}>
				{lastLine}
			</p>
		{/if}
	{/if}
</div>
