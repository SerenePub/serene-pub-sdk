/**
 * 🚧 The conversation **dossier** — `session_full.v1`, the section a widget
 * granted `session:full` is posted ({@link WidgetScopedSections}): what core's
 * conversation widget is told about its session beyond the envelope's base
 * sections.
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
 * state).
 *
 * Declared here, beside the other section shapes, since 2026-10-10:
 * it was core-catalog's
 * `ConversationDossierV1`, which now names this type (⏳ REMOVE in 0.7.0).
 * The fields are exactly what core's conversation (`MessagesWidget` and
 * its children) reads today, plus `backdrop`, which the host that draws the
 * copy reads. Provisional as a whole: its shape settles when the
 * conversation moves onto the public contract.
 *
 * Imports nothing but the story-time leaf's types (`StoryTime`,
 * `StoryCalendar`, itself importing nothing), so `widgets.ts` names it
 * without a cycle.
 * @ruling C0b, PLAN-widget-system-consolidation C4, C8
 */

import type { StoryCalendar, StoryTime } from './storyTime.js'
import type { SceneSummaryMode } from './sceneSettings.js'

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
	 * 🚧 The session member a `name` that is a role belongs to: on a
	 * person's persona-less line named by the genre's `playerLabel`, the
	 * member's own name, present only when the session has more than one
	 * member — shown after the name in muted text ("Dungeon Master · jody").
	 * Absent everywhere else.
	 * @ruling R4
	 */
	member?: string
}

/** What the page decided about one message. @experimental */
export interface ConversationLineV1 {
	/** The viewer may press this line's own verbs (edit, hide, delete). */
	controllable: boolean
	/**
	 * 🚧 The viewer may rerun this line (swipe, retry, extend) — wider than
	 * `controllable` for an envoy's line in a channel lane the viewer is the
	 * member of (ruled 2026-10-15). Absent reads as `controllable`.
	 */
	rerunnable?: boolean
	/**
	 * 🚧 The viewer may delete this line (2026-10-18) — narrower than
	 * `controllable` where the session keeps its turns: a story turn's row
	 * under Honour mode off, or an older turn's, which the host refuses to
	 * delete whoever asks. A widget does not offer Delete on a line whose
	 * `deletable` is false (the host's refusal stays the floor). Absent
	 * reads as `controllable`.
	 */
	deletable?: boolean
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

/**
 * A scene over some of the log, with the history entry it sits in.
 *
 * 🚧 Two kinds while live scenes land (PROPOSAL-live-scenes §3): a **live
 * scene** — opened at a message, the run of one channel lane's lines between
 * its two **scene boundaries** (`openedAtMessageId` … `closedAtMessageId`,
 * the end null while it is the **open scene**) — and a scene **captured by
 * selection** (ticked lines, `openedAtMessageId` absent or null), which
 * `selectedMessageIds` alone describes. A live scene's `selectedMessageIds`
 * is the host's derived cache, written when it closes.
 * @experimental
 */
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
	/** 🚧 The channel lane a live scene runs on, canonical (`main`, `phone:2`). Absent reads as `main`. */
	channel?: string
	/** 🚧 The message a live scene opens at (its opening **scene boundary**); null or absent for a scene captured by selection. */
	openedAtMessageId?: number | null
	/** 🚧 The message a live scene closes at; null while it is the session's **open scene** on its lane. */
	closedAtMessageId?: number | null
	/** 🚧 The story clock as the scene opened — the boundary line's stamp, else the session's story now. */
	openedAt?: StoryTime | null
	/** 🚧 The story clock as the scene closed; null while it is open. */
	closedAt?: StoryTime | null
	/**
	 * 🚧 Where its summary stands: `none` · `running` · `review` (the run
	 * finished and waits for the person's Apply — the divider's *Ready to
	 * review*; §15 G8) · `done` · `failed`. Absent reads as unknown.
	 */
	summaryStatus?: 'none' | 'running' | 'review' | 'done' | 'failed'
	/**
	 * 🚧 The scene has summary text. With `summaryStatus: 'none'` on a live
	 * scene it is a summary a moved boundary left behind — the divider says
	 * *Summary out of date* (lane E). Absent reads as false.
	 */
	hasSummary?: boolean
	/**
	 * 🚧 Who is in the scene — its cast as the host stores it (participants
	 * first), each named and drawn as the page names them; `ref` is the
	 * participant reference when the member is a card (`character:3`). A
	 * divider's faces read this; absent (a guest's page, say), they fall
	 * back to who spoke in its loaded lines (lane E).
	 */
	cast?: ConversationSceneCastV1[]
}

/**
 * 🚧 One member of a scene's cast, as a scene divider draws it.
 * @experimental
 */
export interface ConversationSceneCastV1 {
	/** A participant reference (`character:3`) when the member is a card; null for a background member. */
	ref: string | null
	name: string
	/** The face's image URL, or null for an initial. */
	face: string | null
}

/**
 * 🚧 A **scene cue** at one line, as the conversation draws it — Suggested
 * scene mode's quiet *New scene?* chip in the line's scene-divider slot,
 * with **Yes** and **Not here** (`decide-scene-cue`, by `id`). One per line
 * and lane: the triggers that fired there are listed together. Offered only
 * past the lane's latest scene boundary, and only to the session's owner
 * (`sceneBoundaries`).
 * @experimental
 * @ruling PROPOSAL-live-scenes §4, §7 (2026-10-13)
 */
export interface ConversationSceneCueV1 {
	/** What `decide-scene-cue` takes; deciding it decides every trigger at this line. */
	id: number
	/** The channel lane, canonical (`main`, `phone:2`). */
	channel: string
	/** The line the next scene would open at. */
	messageId: number
	/** The boundary triggers that fired at this line (`dayCrossed`, `timeAction`, …). */
	triggers: string[]
	/** Why, in words, for the chip: "the day changed", "time passed". */
	reason: string
}

/** The cast, as far as answering a form needs it (`canAnswerForm`). @experimental */
export interface ConversationCastV1 {
	sessionPersonas: Array<{ personaId: number | null; persona: { userId: number | null } | null }>
	sessionCharacters: Array<{ characterId: number | null }>
}

/**
 * 🚧 The conversation dossier — `session_full.v1` (see the head of this
 * file). Every field is one core's conversation reads; each is the page's
 * answer, never a verdict the widget re-derives.
 * @experimental
 */
export interface SessionDossierV1 {
	/** The session the dossier describes — what the composer files its draft under. */
	sessionId: number
	/** Per message, by id. A message absent here reads as core-catalog's `NO_LINE`. */
	lines: Record<number, ConversationLineV1>
	scenes: ConversationSceneV1[]
	/** Messages already captured in a scene (not selectable for another). */
	scened: number[]
	/** Older messages remain to load, and a load is under way. */
	hasOlder: boolean
	loadingOlder: boolean
	/**
	 * 🚧 The channels — each as its rows store it (`parley:2`) — that hold
	 * lines older than the log (owner ruling ★7, 2026-10-19: history pages
	 * per channel). A copy that shows some channels has older lines exactly
	 * when one of them is here, and asks for them with `load-older`. Absent
	 * from a host that predates it: read `hasOlder`. @experimental
	 */
	olderIn?: string[]
	/** Why Extend is unavailable in this session, when it is. */
	extendRefusal?: string
	/** The viewer owns the session (not a guest) — a form to the owner is theirs. */
	isOwner: boolean
	cast: ConversationCastV1
	/** What the session may write beyond messages (R-B): a scene, lore. */
	writes: { scenes: boolean; lore: boolean }
	/**
	 * 🚧 The viewer may place **scene boundaries** here — *Start scene here*,
	 * *End scene here*, a scene divider's rename, *Remove boundary* and
	 * *Summarize*: the session's owner, its genre writes scenes, it reads a
	 * lorebook, and lore writes are not Off. The host's own refusals,
	 * mirrored so the widget hides what would be refused rather than offering
	 * it. Absent reads as false.
	 * @ruling PROPOSAL-live-scenes §7, §14 C
	 */
	sceneBoundaries?: boolean
	/**
	 * 🚧 The **scene cues** waiting at lines of this session — Suggested
	 * scene mode's *New scene?* chips, oldest first. Absent or empty: none.
	 * @ruling PROPOSAL-live-scenes §4 (2026-10-13)
	 */
	sceneCues?: ConversationSceneCueV1[]
	/**
	 * 🚧 When this session's scenes are summarized (its scene settings):
	 * under `never` no *Summarize* is offered — a scene divider's included.
	 * Absent reads as `onRequest`.
	 * @ruling PROPOSAL-live-scenes §5 (2026-10-13)
	 */
	sceneSummaryMode?: SceneSummaryMode
	/**
	 * 🚧 The **story calendar** of the book the session reads
	 * (`lorebooks.story_calendar`), what the conversation spells its dates
	 * through — a scene divider's day, a day mark, a history marker — as
	 * `formatStoryTime(time, calendar)` does. Null: the book declares none
	 * (free-form: *Year 412, Mo. 3, Day 5*). Absent: not known yet (the same).
	 * @ruling PROPOSAL-live-scenes §15 G9 (2026-10-13)
	 */
	storyCalendar?: StoryCalendar | null
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
		/**
		 * 🚧 The stored order's entries (`TurnOrderV1.order`), as the page
		 * snapshots them. Open past `ref` on purpose: a turn strategy may add
		 * keys (a `channel`, a `reason`) and they ride through; the widget
		 * reads `ref` and passes the rest on.
		 */
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
		 * called: the genre's fallback envoy (the Lair's
		 * "Castellan"), else the session's narrator name, else
		 * `UNCLAIMED_LINE_NAME`, as the page resolves it. Absent reads as
		 * "The narrator".
		 * @ruling lair re-plan R5
		 */
		ownVoiceName?: string
		/**
		 * 🚧 Whom the round waits on, once the viewer has had their say and
		 * nothing is prepared (PLAN-dc-after-walk2 Q3-3): the others' names,
		 * as the page reads them off the seats and the Story's lines — "Waiting
		 * for Maren Holt". Absent when nobody is waited for. @experimental
		 */
		waitingFor?: string[]
	}
	/**
	 * The session's mode is not installed: the log is read-only.
	 * @ruling 19 §6
	 */
	readOnly: { genreId: string | null } | null
	/** The session state's ledger under each line, and what waits for the viewer. */
	state: ConversationStateV1
	/**
	 * 🚧 An app background image is painted behind the shell: the
	 * conversation gets its glass panel. Read by the HOST that draws the copy
	 * (its card's background), not by the widget — the one field here no
	 * widget reads. Not the session's backdrop (`SessionV1.backdrop`).
	 */
	appBackground: boolean
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
	/**
	 * 🚧 A player's **offer** (Give to…, ★4), not a change a run asked for
	 * (PLAN-dc-after-walk3 R1-2, the walk's NEW-4): who it is offered to and
	 * by, and whether the viewer made it — the giver's own offer waits on the
	 * receiver and is theirs to withdraw, never to accept. Absent for every
	 * other proposal.
	 */
	offer?: { from: string; to: string; yours: boolean }
}

/**
 * 🚧 The session state's ledger, as the conversation draws it. @experimental
 * @ruling C0b
 */
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
	/**
	 * 🚧 The conversation's **ledger head** (live scenes §15 G13): changes
	 * anchored to no message, grouped as a message's are — the clock moves
	 * made before the session had a single line (a *Time passes…* pressed, or
	 * skipped for want of a clock, before anything was said). Drawn above the
	 * first message. Optional: a host that sends none has nothing there.
	 */
	head?: Array<{
		ownerKey: string
		ownerLabel: string
		lines: Array<{ key: string; text: string; updatedBy: string }>
	}>
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

/**
 * 🚧 What core's composer is told: the page's half of writing a line. @experimental
 * @ruling C0b
 */
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
	 * 🚧 Whom the viewer writes as with no persona, phrased as the composer
	 * writes it after "Write as": the viewer's own card-less player seat by
	 * its name ("Ann"), else the page's `sessionPlayerLabel` with its article
	 * ("the Dungeon Master"). The composer says "Write as Ann…" /
	 * "Write as the Dungeon Master…". Absent when there is neither.
	 * @ruling lair pass R4, S2
	 */
	playerLabel?: string
	/** A guest with no persona: the composer offers to add one instead. */
	addPersona: boolean
	/** A genre with no field (`composer: 'none'`): triggers only. */
	hidden: boolean
	/**
	 * 🚧 The channel lanes the genre closed this viewer's composer on
	 * (`core:outlet/set-composer-state@1`, owner ruling 2026-10-15), by
	 * canonical channel — `*` for every channel — each with what it is
	 * waiting on. Read a lane with `composerClosedOn(closed, lane)`: a closed
	 * composer greys its field and its chips and shows the reason in place
	 * of the placeholder (`composerClosedPlaceholder`); a send on it is
	 * refused by the host with the reason in its sentence. Absent or empty:
	 * open everywhere. Turn controls are not the composer's and stay.
	 */
	closed?: Record<string, { reason?: string }>
	/**
	 * The lanes a line may be written on, `main` first — THIS copy's: the
	 * host narrows them per mount, so a Messages widget
	 * pinned to one channel is told that channel alone, and the primary log
	 * the channels no pinned copy claims. The log shows these channels' rows
	 * and nothing else.
	 * @ruling lair re-plan S1
	 */
	channels: string[]
	/**
	 * 🚧 What each channel is called, by slug, in the viewer's language
	 * (`ChannelDecl.label`): the Lair's `sanctum` reads
	 * _Sanctum_. A channel absent here is named by its slug, title-cased.
	 * @ruling lair re-plan R6/S1
	 */
	channelLabels?: Record<string, string>
	/**
	 * 🚧 What each channel IS, by slug (`ChannelDecl.role`): only channels
	 * that declare a role, so `{ manuscript: 'folio' }` for the Writing Room.
	 * A Messages copy whose `channel` claim names a `folio` channel draws as
	 * Folio when its `presentation` setting is unset.
	 * Absent: every channel is a conversation.
	 * @ruling PLAN-core-widgets §3.7
	 */
	channelRoles?: Record<string, 'conversation' | 'folio'>
	/** The draft's share of the context window, when counted. */
	usage: { total: number; limit: number } | null
	/** The More panel's tabs, and the turn controls' own (`session-controls`). */
	tabs: ConversationTabV1[]
	/** The session's action chips (`session-actions`) have something to show. */
	actions: boolean
	/** The retrieval notice (`retrieval-notice`) applies to this session. */
	notice: boolean
	/**
	 * 🚧 The composer venue's overflow and `/` palette rows, and the newest
	 * line's values. Opaque here on purpose: the composer reads them as
	 * `WidgetAction[]`, core-catalog's `PaletteAction[]` and its `ItemValues`
	 * — the last two are the catalogue's own shapes, which this package
	 * cannot name — and the page fills them from its own action lists.
	 * Typed when the conversation moves onto the public contract.
	 * @ruling C8
	 */
	overflow: unknown[]
	palette: unknown[]
	newest: unknown | null
	/** Someone is due next: Send takes the quieter look. */
	sendTonal: boolean
	/**
	 * 🚧 The viewer's **tray**: the files they
	 * added to this composer and have not sent yet, in tray order — uploading,
	 * ready or refused. The host keeps it; the composer draws the tiles and
	 * asks (`attach-files`, `remove-tray-item`). Absent, the host
	 * offers no attachments and the composer draws no Attach button.
	 * @ruling composer attachments §3.3
	 */
	tray?: TrayItemV1[]
	/**
	 * 🚧 What this session's reply can read (**attachment readers**):
	 * per attachment kind whether it may be attached and why not, and per
	 * model call what it reads. Null until the host has asked.
	 * @ruling composer attachments §3.2
	 */
	attachments?: AttachmentReadersV1 | null
}

/**
 * 🚧 What kind of attachment a file is — an
 * **attachment kind**. Decided from the file's bytes, never its name.
 * @experimental
 * @ruling composer attachments D5
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
 * 🚧 The session's **attachment readers** as the composer reads them.
 * @experimental
 * @ruling composer attachments §3.2
 */
export interface AttachmentReadersV1 {
	/**
	 * Per kind: may it be attached (the union over reading calls), and why not.
	 * @ruling composer attachments D1
	 */
	kinds: Record<AttachmentKindV1, { allowed: boolean; reason?: string }>
	/**
	 * Each **reading call** — a model call of the reply that is handed
	 * attachments — with what it reads and what it gets as a placeholder
	 * (`[image: cat.png]`). `model` names its model for an administrator
	 * only.
	 * @ruling composer attachments D3
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
	/**
	 * Files one message may carry.
	 * @ruling composer attachments D6
	 */
	filesPerMessage: number
	/**
	 * The byte cap per kind, so a file is refused before it uploads.
	 * @ruling composer attachments D6
	 */
	bytesPerKind: Record<AttachmentKindV1, number>
}

