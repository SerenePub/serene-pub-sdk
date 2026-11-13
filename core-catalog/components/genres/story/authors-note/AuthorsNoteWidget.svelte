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
	 * 🚧 It also holds the session's **Scenario** (lay-B D13, 2026-11-05;
	 * owner ruling R5: Left's second tab is "scenario / author's note
	 * management"), above the note and shown whether or not the note is
	 * offered — a kind of session with no note is then the Scenario alone.
	 * `session-scenario` reads it and the viewer's right to change it (the
	 * session's owner), `set-session-scenario` saves it whole; it has its own
	 * Save / Discard and its own read and save lines, saved and read apart from
	 * the note, as the page writes them apart. No event says a scenario changed
	 * elsewhere, so it is asked once, on mount, and takes the save's answer.
	 *
	 * The depth and interval numbers and *Sent as* show only with the viewer's
	 * advanced controls on (`viewer.v1.advancedControls`); hidden, the stored
	 * values are still what Save sends.
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
	/** 🚧 2026-11-10: the viewer's advanced controls switch; absent means shown. */
	const advanced = $derived(widget?.current?.viewer?.v1?.advancedControls !== false)
	const t = (source: string): string => widget?.current?.t(source) ?? source

	/** What the page last answered. */
	let answer = $state<AuthorsNoteV1 | null>(null)
	/** The form's own copy; Save sends it whole. */
	let draft = $state<AuthorsNoteValueV1>({ ...AUTHORS_NOTE_DEFAULTS })
	let readError = $state<string | null>(null)
	let saveError = $state<string | null>(null)
	let saving = $state(false)

	/** 🚧 The scenario, the same way: what the page last answered, the form's copy, its own lines. */
	let scenarioAnswer = $state<{ scenario: string; canEdit: boolean } | null>(null)
	let scenarioDraft = $state("")
	let scenarioReadError = $state<string | null>(null)
	let scenarioSaveError = $state<string | null>(null)
	let scenarioSaving = $state(false)

	const saved = $derived(answer ? readAuthorsNote(answer.note) : AUTHORS_NOTE_DEFAULTS)
	const dirty = $derived(answer ? authorsNoteDirty(draft, saved) : false)
	const canEdit = $derived(answer?.canEdit === true)
	const scenarioDirty = $derived(scenarioAnswer ? scenarioDraft !== scenarioAnswer.scenario : false)
	const scenarioCanEdit = $derived(scenarioAnswer?.canEdit === true)
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

	/** The scenario is asked once, on mount: nothing tells this widget it changed elsewhere. */
	let scenarioAsked = 0
	function askScenario() {
		const ctx = untrack(() => widget?.current)
		if (!ctx) return
		const ticket = ++scenarioAsked
		ctx.request("session-scenario", {}).then(
			(res) => {
				if (ticket !== scenarioAsked) return
				scenarioReadError = null
				const wasDirty = scenarioAnswer ? scenarioDraft !== scenarioAnswer.scenario : false
				scenarioAnswer = res
				if (!wasDirty) scenarioDraft = res.scenario
			},
			(e) => {
				if (ticket !== scenarioAsked) return
				scenarioReadError = reason(e)
			}
		)
	}

	$effect(() => untrack(() => askScenario()))

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

	async function saveScenario() {
		const ctx = untrack(() => widget?.current)
		if (!ctx || !scenarioCanEdit || !scenarioDirty || scenarioSaving) return
		scenarioSaving = true
		scenarioSaveError = null
		try {
			const now = await ctx.request("set-session-scenario", { scenario: scenarioDraft })
			// The saved row is what the page answered; the form is clean against it.
			scenarioAnswer = now
			scenarioDraft = now.scenario
		} catch (e) {
			scenarioSaveError = t("Not saved: {reason}").replace("{reason}", reason(e))
		} finally {
			scenarioSaving = false
		}
	}

	function discardScenario() {
		scenarioDraft = scenarioAnswer?.scenario ?? ""
		scenarioSaveError = null
	}

	const setNumber = (key: "depth" | "interval", raw: string) => {
		const n = raw.trim() === "" ? NaN : Number(raw)
		draft = { ...draft, [key]: Number.isFinite(n) ? n : draft[key] }
	}
</script>

<div
	data-widget-part="authors-note.root"
	data-widget="authors-note"
	data-dirty={dirty || scenarioDirty ? "" : undefined}
>
	<section data-widget-part="authors-note.scenario">
		{#if scenarioReadError}
			<p data-widget-part="authors-note.alert" role="alert">
				{t("Could not read the scenario: {reason}").replace("{reason}", scenarioReadError)}
			</p>
		{/if}
		{#if scenarioAnswer}
			{#if !scenarioCanEdit}
				<p data-widget-part="authors-note.note">
					{t("Only the session's owner can change the scenario.")}
				</p>
			{/if}
			<label data-widget-part="authors-note.field">
				<span data-widget-part="authors-note.label label">{t("Scenario")}</span>
				<textarea
					data-widget-part="authors-note.scenario-text"
					rows="4"
					placeholder={t("Describe the session scenario, setting, or context (optional)")}
					disabled={!scenarioCanEdit}
					value={scenarioDraft}
					oninput={(e) => (scenarioDraft = e.currentTarget.value)}
				></textarea>
			</label>
			{#if scenarioSaveError}
				<p data-widget-part="authors-note.alert" role="alert">{scenarioSaveError}</p>
			{/if}
			{#if scenarioCanEdit}
				<div data-widget-part="authors-note.actions toolbar">
					{#if scenarioDirty}
						<span data-widget-part="authors-note.unsaved">{t("Unsaved changes")}</span>
						<button
							type="button"
							data-widget-part="authors-note.discard"
							disabled={scenarioSaving}
							onclick={discardScenario}
						>
							{t("Discard")}
						</button>
					{/if}
					<button
						type="button"
						data-widget-part="authors-note.save"
						disabled={!scenarioDirty || scenarioSaving}
						onclick={saveScenario}
					>
						{scenarioSaving ? t("Saving…") : t("Save")}
					</button>
				</div>
			{/if}
		{/if}
	</section>
	{#if readError}
		<p data-widget-part="authors-note.alert" role="alert">
			{t("Could not read the author's note: {reason}").replace("{reason}", readError)}
		</p>
	{/if}
	{#if answer?.offered}
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
		{#if advanced}
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
		{/if}
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
