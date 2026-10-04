/**
 * 🚧 The conversation **dossier**: what core's conversation widget is told
 * about its session, beyond the
 * envelope's base sections (C0b) — the `session_full.v1` its host projects,
 * core's own widget being granted `session:full`.
 *
 * The page answers here what only the page can: who the viewer controls, who
 * spoke each line and with what face, where scenes and history entries fall,
 * whether older messages remain. The widget judges nothing it is not told,
 * and acts only through its verbs (`invoke`, `request`) — so the same widget
 * runs as a remote in the page's UI worker, where there is no page to ask.
 *
 * A plugin's widget sees it only when it declares the `session:full` scope
 * and an admin grants that permission (`widget:session:full`) at review —
 * never by default; the grant shows the whole conversation as the viewer
 * sees it (the cast, their personas, their unsent draft, the session's
 * state). Provisional: its shape settles with the C7 cutover.
 */

import { UNCLAIMED_LINE_NAME } from '@serene-pub/sdk'

/** A participant as a line names them: display name, reference, face. @experimental */
export interface ConversationSpeakerV1 {
	name: string
	/** `character:3` — what `sp-avatar` and `view-avatar` take; null for narration. */
	ref: string | null
	/** The speaker's avatar. */
	face: string | null
	/** The sprite this line was shown with — what `avatarFace: sprite` draws instead. */
	sprite: string | null
	/**
	 * 🚧 The session member a `name` that is a role belongs to (R4): on a
	 * person's persona-less line named by the genre's `playerLabel`, the
	 * member's own name, present only when the session has more than one
	 * member — shown after the name in muted text ("Dungeon Master · jody").
	 * Absent everywhere else.
	 */
	member?: string
}

/** What the page decided about one message. @experimental */
export interface ConversationLineV1 {
	/** The viewer may press this line's own verbs (edit, hide, delete). */
	controllable: boolean
	speaker: ConversationSpeakerV1
	/** Swipe arrows: shown at all, and whether there is a newer reply to take. */
	swipes: { show: boolean; right: boolean }
	/** The line's vectors against the active embedding model (hidden when retrieval is off). */
	embedding: 'current' | 'stale' | 'none' | 'hidden'
	/**
	 * The host holds this line's compiled prompt and the viewer may read it
	 * (`prompt-details`: admins, with context debugging on). The prompt itself
	 * never rides the row — `debugMeta` is host bookkeeping (`MESSAGE_HOST_FIELDS`).
	 * Absent reads as false.
	 */
	promptDetails?: boolean
}

/** A scene over some of the log, with the history entry it sits in. @experimental */
export interface ConversationSceneV1 {
	id: number
	name: string | null
	lorebookId: number
	historyEntryId: number | null
	selectedMessageIds: number[]
	historyEntry: {
		id: number
		year: number
		month: number | null
		day: number | null
		isCompleted: boolean
		nextEntry: { id: number; year: number; month: number | null; day: number | null } | null
	} | null
}

/** The cast, as far as answering a form needs it (`canAnswerForm`). @experimental */
export interface ConversationCastV1 {
	sessionPersonas: Array<{ personaId: number | null; persona: { userId: number | null } | null }>
	sessionCharacters: Array<{ characterId: number | null }>
}

/** @experimental */
export interface ConversationDossierV1 {
	sessionId: number
	/** Per message, by id. */
	lines: Record<number, ConversationLineV1>
	scenes: ConversationSceneV1[]
	/** Messages already captured in a scene (not selectable for another). */
	scened: number[]
	/** Older messages remain to load, and a load is under way. */
	hasOlder: boolean
	loadingOlder: boolean
	/** Why Extend is unavailable in this session, when it is. */
	extendRefusal?: string
	/** The viewer owns the session (not a guest) — a form to the owner is theirs. */
	isOwner: boolean
	cast: ConversationCastV1
	/** What the session may write beyond messages (R-B): a scene, lore. */
	writes: { scenes: boolean; lore: boolean }
	/** Admins with context debugging on may open a line's prompt. */
	debugPrompts: boolean
	/**
	 * Bumped when a host view (the workflow tab) asks the conversation to
	 * start selecting lines for a summary — the widget starts on a change.
	 */
	selectForSummary: number
	/** Bumped when the host's summary finished: the selection it was handed ends. */
	summaryEnded: number
	/** What the composer is told. */
	composer: ConversationComposerV1
	/** Who is due next, from the session's stored turn order. */
	turn: {
		order: Array<{ ref: string | null; [k: string]: unknown }>
		candidates: Array<{
			ref: string
			kind: string
			name: string
			nickname?: string
			ownerUserId?: number
		}>
		/** The nudge applies now (a turn is due, nothing is generating or drafted). */
		show: boolean
		/** Anyone else could take the turn. */
		canChoose: boolean
		/**
		 * 🚧 What the pipeline's own voice — an entry with `ref: null` — is
		 * called (lair re-plan R5): the genre's fallback envoy (the Lair's
		 * "Castellan"), else the session's narrator name, else
		 * `UNCLAIMED_LINE_NAME`, as the page resolves it. Absent reads as
		 * "The narrator".
		 */
		ownVoiceName?: string
	}
	/** The session's mode is not installed: the log is read-only (19 §6). */
	readOnly: { genreId: string | null } | null
	/** The session state's ledger under each line, and what waits for the viewer. */
	state: ConversationStateV1
	/** A backdrop image is painted behind the shell: the conversation gets its glass panel. */
	backdrop: boolean
}

/** One proposed change, described. @experimental */
export interface ConversationProposalV1 {
	id: number
	status: string
	messageId: number | null
	/** The change, in words. */
	text: string
	proposedBy: string | null
	/** For a superseded proposal: what moved since. */
	moved: string | null
}

/** 🚧 The session state's ledger, as the conversation draws it (C0b). @experimental */
export interface ConversationStateV1 {
	/** Per message id: the changes it made, grouped by whose they are. */
	ledgers: Record<
		number,
		Array<{
			ownerKey: string
			ownerLabel: string
			lines: Array<{ key: string; text: string; updatedBy: string }>
		}>
	>
	/** Per message id: proposals anchored to it. */
	pending: Record<number, ConversationProposalV1[]>
	/** Every proposal waiting for the viewer (the Review panel). */
	waiting: ConversationProposalV1[]
}

/** A tab of the composer's More panel: one of the host's own views. @experimental */
export interface ConversationTabV1 {
	view: string
	title: string
	icon: string
}

/** 🚧 What core's composer is told (C0b): the page's half of writing a line. @experimental */
export interface ConversationComposerV1 {
	/**
	 * The host's last write to the draft: the one it kept, when the session
	 * opens; an empty one when an action spent it. The composer owns the
	 * draft between writes (and reports it back, `draft`); a new `write`
	 * number replaces the field, whatever it holds — the same `write` never
	 * does, so a re-posted dossier leaves the person's typing alone.
	 */
	draft: { content: string; write: number }
	/** Whom the viewer may write as, and whom they are writing as. */
	personas: Array<{ personaId: number; name: string }>
	personaId: number | null
	/**
	 * 🚧 What the viewer's persona-less lines are called (lair pass R4, the
	 * page's `sessionPlayerLabel`): the composer, writing as no persona, says
	 * "Write as the Dungeon Master…" (S2). Absent when the genre declares none.
	 */
	playerLabel?: string
	/** A guest with no persona: the composer offers to add one instead. */
	addPersona: boolean
	/** A genre with no field (`composer: 'none'`): triggers only. */
	hidden: boolean
	/**
	 * The lanes a line may be written on, `main` first — THIS copy's: the
	 * host narrows them per mount (lair re-plan S1), so a Messages widget
	 * pinned to one channel is told that channel alone, and the primary log
	 * the channels no pinned copy claims. The log shows these channels' rows
	 * and nothing else.
	 */
	channels: string[]
	/**
	 * 🚧 What each channel is called, by slug, in the viewer's language
	 * (`ChannelDecl.label`, lair re-plan R6/S1): the Lair's `sanctum` reads
	 * _Sanctum_. A channel absent here is named by its slug, title-cased.
	 */
	channelLabels?: Record<string, string>
	/** The draft's share of the context window, when counted. */
	usage: { total: number; limit: number } | null
	/** The More panel's tabs, and the turn controls' own (`session-controls`). */
	tabs: ConversationTabV1[]
	/** The session's action chips (`session-actions`) have something to show. */
	actions: boolean
	/** The retrieval notice (`retrieval-notice`) applies to this session. */
	notice: boolean
	/** The composer venue's overflow and `/` palette rows, and the newest line's values. */
	overflow: unknown[]
	palette: unknown[]
	newest: unknown | null
	/** Someone is due next: Send takes the quieter look. */
	sendTonal: boolean
	/**
	 * 🚧 The viewer's **tray** (composer attachments §3.3): the files they
	 * added to this composer and have not sent yet, in tray order — uploading,
	 * ready or refused. The host keeps it; the composer draws the tiles and
	 * asks (`attach-files`, `remove-tray-item`). Absent, the host
	 * offers no attachments and the composer draws no Attach button.
	 */
	tray?: TrayItemV1[]
	/**
	 * 🚧 What this session's reply can read (**attachment readers**, §3.2):
	 * per attachment kind whether it may be attached and why not, and per
	 * model call what it reads. Null until the host has asked.
	 */
	attachments?: AttachmentReadersV1 | null
}

/**
 * 🚧 What kind of attachment a file is (composer attachments D5) — an
 * **attachment kind**. Decided from the file's bytes, never its name.
 * @experimental
 */
export type AttachmentKindV1 = 'image' | 'text' | 'pdf'

/**
 * 🚧 One **tray item** as the composer draws it: a file uploaded into the
 * session's composer and not yet sent. ⚠ Not a held import.
 * @experimental
 */
export interface TrayItemV1 {
	id: string
	/** `uploading` (with `progress`), `ready`, or `refused` (with `refusal`). */
	status: 'uploading' | 'ready' | 'refused'
	/** 0–1 while uploading. */
	progress: number
	/** The sentence a refused tile shows. */
	refusal: string | null
	filename: string
	bytes: number
	/** Null until the server has sniffed it. */
	kind: AttachmentKindV1 | null
	/** The square thumbnail (`/media/<id>?v=thumb`) of a stored image, else null. */
	thumbSrc: string | null
}

/**
 * 🚧 The session's **attachment readers** as the composer reads them (§3.2).
 * @experimental
 */
export interface AttachmentReadersV1 {
	/** Per kind: may it be attached (the union over reading calls, D1), and why not. */
	kinds: Record<AttachmentKindV1, { allowed: boolean; reason?: string }>
	/**
	 * Each **reading call** — a model call of the reply that is handed
	 * attachments — with what it reads and what it gets as a placeholder
	 * (`[image: cat.png]`, D3). `model` names its model for an administrator
	 * only.
	 */
	calls: Array<{
		key: string
		label: string
		reads: AttachmentKindV1[]
		placeholderFor: AttachmentKindV1[]
		model?: string
	}>
	/** The file picker's filter for every kind that may be attached (`image/png,.md`). */
	accept: string
	/** Files one message may carry (D6). */
	filesPerMessage: number
	/** The byte cap per kind (D6), so a file is refused before it uploads. */
	bytesPerKind: Record<AttachmentKindV1, number>
}

/**
 * What a line reads as when the dossier names it not. Named, never "Unknown"
 * (ruled 2026-09-26): the SDK's generic name for a line nobody claims.
 * @experimental
 */
export const NO_LINE: ConversationLineV1 = {
	controllable: false,
	speaker: { name: UNCLAIMED_LINE_NAME.en, ref: null, face: null, sprite: null },
	swipes: { show: false, right: false },
	embedding: 'hidden',
}
