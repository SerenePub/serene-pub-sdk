/**
 * The widget data contract — ONE envelope every session widget receives,
 * native and frame alike.
 *
 * A native widget reads these sections through the host's in-document context
 * (live, reactive); a frame receives the same sections snapshotted over its
 * port. Field-for-field identical: reactivity is the native analog of a push,
 * and that is the whole of the difference. The declarations live here so the
 * two deliveries cannot drift — a plugin compiled against this package sees
 * exactly the shapes an instance sends.
 *
 * These types are TRANSPORT-NEUTRAL. The frame wire that carries them is
 * `surfaces.ts` (`HostFrameMessage` / `FrameHostMessage`); the host internals
 * that produce them — measuring a box, deciding a grant — are core's and are
 * not declared here.
 *
 * ## Two version clocks
 *
 *  - `WIDGET_PROTOCOL` versions the TRANSPORT — the verbs (`action` / `invoke`
 *    / `request` / `on`, and the retired ⏳ `menu`) and the message kinds. Rev only when the wire
 *    itself changes.
 *  - Each DATA section is a bag of versioned shapes (`layout: { v1 }`, …). When
 *    a pre-existing key inside a section changes meaning, emit `v2` alongside
 *    `v1` for a transition window; old widgets read `.v1`, new ones read `.v2`.
 *    ADDITIVE keys go straight into the existing `v1` — no bump.
 *
 * ## Base vs scoped
 *
 * Base sections ({@link WIDGET_BASE_SECTIONS}: layout / session / channels /
 * messages / props / actions / settings / annex / locale / viewer /
 * turnOrder / attendance) are delivered to every widget that READS them
 * (`WidgetDecl.reads`; a declaration without `reads` reads all of them, which
 * is every widget written before `reads` existed). Scoped sections
 * ({@link WidgetScopedSections}, the one table) appear ONLY when the widget
 * declared the scope AND it was granted — the same deny-by-default a frame
 * gets, applied at projection so a native widget is no more privileged.
 * Absence means "not granted", never a silent empty — or "not posted yet":
 * which of the two, the host says with `grants` (the scopes the widget
 * holds, on mount and on every change), so a widget draws "not granted"
 * rather than loading forever.
 * @ruling PLAN 25 (ruled 2026-08-30), R75
 */

import type { TurnOrderV1 } from './turnOrder.js'
import type { SessionDossierV1 } from './sessionDossier.js'
import type { SlotAppliesTo, SlotType, SlotValue } from './attributes.js'
import type { FieldDecl } from './settings.js'
import type { StatusText, WidgetActionReason } from './status.js'
import type { EnabledWhen } from './predicates.js'
import type { StoryTime, StoryTimeUnit } from './storyTime.js'
import type { SceneSummaryMode } from './sceneSettings.js'

/** Free-form data riding beside a verb or an event. Keys are the sender's. @experimental */
export type WidgetPayload = Record<string, unknown>

/**
 * The width class of a widget's own box.
 *
 * A fact about the widget's box, not the window: a widget in a 240px rail is
 * `compact` however wide the viewport is, and that is what it reflows against.
 * @experimental
 */
export type WidgetTier = 'compact' | 'cozy' | 'roomy' | 'wide'

// ─── Section shapes (v1) ────────────────────────────────────────────────────

/** Where this widget sits, and what the host is painting around it. @experimental */
export interface LayoutV1 {
	/**
	 * Which zone in the page-level zone grid (identity + totals).
	 *
	 * Cell counts of the zone's grid — the session layout's whole cells. Read
	 * them for where the widget sits, never for its size: `tier`, `box.px`,
	 * `box.edges` and `chrome` are the fields a widget sizes itself by.
	 */
	zone: { columns: number; column: number; rows: number; row: number }
	/** Where this widget sits within its zone. */
	box: {
		/** Width in the zone's cells. See `zone`. */
		cols: number
		/**
		 * Height in the zone's cells, or null when the widget grows / is
		 * unbounded. See `zone`.
		 */
		rows: number | null
		/** Which zone edges the widget touches. */
		edges: { top: boolean; right: boolean; bottom: boolean; left: boolean }
		/**
		 * The widget box as the host MEASURED it, in CSS pixels.
		 *
		 * The size a widget can actually draw against: whatever the browser
		 * resolved for the widget's box, so the number is the answer rather
		 * than a cell count multiplied by the cell module.
		 *
		 * Absent when the host has not measured this mount — a widget in a
		 * pop-over, a first frame before layout settles, a host that measures
		 * width alone. Absent is "unknown", never zero, so a widget reads
		 * `tier` when it is missing rather than reflowing against a 0.
		 */
		px?: { width: number; height: number }
	}
	/** The width class of this widget's own box. */
	tier: WidgetTier
	/** Guaranteed-visible: placed in the grid, not collapsible/closable away. */
	pinned: boolean
	collapsed: boolean
	drawered: boolean
	/**
	 * Decoration the HOST is painting, so the widget suppresses its own and
	 * never double-draws (a widget renders its own backdrop only where false).
	 */
	chrome: {
		background: boolean
		wrapper: boolean
		titleBar: boolean
		padding: boolean
		/**
		 * @experimental Is the host drawing its **card** around this widget —
		 * a surface, a border and (outside a tab group) a title bar?
		 *
		 * Off by default for a widget placed in a zone: it sits flush in its
		 * cell and its own style decides whether it has a surface. On when the
		 * person turned on the widget's **Card** setting (`hostCard`), and
		 * always on while the widget is momentarily opened over the session (a
		 * pop-over, a flyout, the phone's panel sheet). When it is on,
		 * `background` and `wrapper` are true as well.
		 *
		 * The page also marks the widget's box `data-sp-card="on"` or `"off"`,
		 * so a stylesheet can key off the same fact without reading this.
		 */
		card: boolean
	}
}

/** The session a widget is drawn in, as much of it as every widget may see. @experimental */
export interface SessionV1 {
	id: number
	name: string | null
	/**
	 * 🚧 The session's **backdrop** — the picture the Backdrop widget shows
	 * (`sessions.backdropMediaId`), or null when none is set. Absent from a
	 * host that does not know the field yet; read absent as null.
	 * @ruling DESIGN-image-generation §6.4, §9.4
	 */
	backdrop?: SessionBackdropV1 | null
	/**
	 * 🚧 The lorebook this session reads (`sessions.lorebookId`), or null when
	 * it reads none — so a widget can leave out what only a lorebook could
	 * answer (the Stats list's *Add from the lorebook*). Absent from a host
	 * that does not say: read absent as unknown, never as none.
	 */
	lorebookId?: number | null
	/**
	 * 🚧 The session's **ruleset settings** — which ruleset it plays and the
	 * values it chose for that ruleset's settings (W3-S, 2026-10-16). Absent
	 * from a host that does not store them yet, and null for a session with
	 * no ruleset chosen; read either as the ruleset's defaults
	 * (`rulesetSettingValues` fills every setting a session left unsaid).
	 */
	rulesetSettings?: SessionRulesetSettingsV1 | null
	/**
	 * 🚧 The session's **channels as this viewer has them** (2026-10-17):
	 * one entry per channel the genre declares, with the viewer's own lane
	 * on a personal channel (`ChannelDecl.lanes: 'personal'`) and the
	 * attention each lane asks of them. Absent from a host that does not
	 * say; a widget then draws the channel whole and shows no dots.
	 */
	channels?: SessionChannelV1[]
}

/**
 * 🚧 One channel as the viewer has it. `mine` is the canonical channel
 * string of the viewer's own lane on a personal channel (`parley:2`),
 * absent on a shared one; `waitingOnYou` is true while a lane's turn is
 * this viewer's to take (a question asked them, their turn in the order);
 * `unseen` counts the lines written there since they last read it. The
 * host derives both — a widget never recomputes who speaks (canon A9).
 * @experimental
 */
export interface SessionChannelV1 {
	slug: string
	lanes: 'shared' | 'personal'
	mine?: string
	waitingOnYou?: boolean
	unseen?: number
}

/**
 * 🚧 A session's ruleset settings on the wire: the ruleset it plays and its
 * chosen setting values, by setting name (`degrees` → `classic`). Only the
 * values a session chose are stored; `rulesetSettingValues(ruleset, { values })`
 * resolves the rest from the defaults, and leaves out a name or choice the
 * ruleset does not declare. ⚠ Not a session setting (`sessionSettings.ts`),
 * not a ruleset preset — a preset is one way to fill these values.
 * @experimental
 */
export interface SessionRulesetSettingsV1 {
	rulesetId: string
	values: Record<string, string>
}

/**
 * 🚧 A session's **backdrop** as a widget sees it: its file id and the
 * address of its `fitted` representation (the whole picture, long edge
 * ≤ 1568 px), resolved by the host. ⚠ Not the app background, not a message
 * attachment.
 * @experimental
 */
export interface SessionBackdropV1 {
	mediaId: number
	src: string
}

/**
 * @experimental One message as a widget sees it (🚧 `parts`).
 *
 * The host posts the session's message rows, so what arrives is a row: `id`,
 * `role` and `content` are on every one of them, and the rest is present when
 * the row carries it. The index signature is the honest part of the shape —
 * the host forwards the row, less only its bookkeeping (below), so columns
 * not named here ride along at the top level, and a widget that reaches for one is
 * reading something core may narrow without notice.
 *
 * A widget renders from the named fields. `extras` is the row's own bag, not a
 * catch-all for the unnamed ones.
 *
 * Withheld, though the stored row carries them: `userId` (a widget never
 * compares user ids — the host answers "may this viewer act" itself),
 * `queueItemId`, `debugMeta` (the compiled prompt — admins read it through
 * the host's `prompt-details`), `embedding` (the row's vector),
 * `embeddingModel`, `embeddingSourceHash` and `embedTextHash` (the hashes the
 * embedding queue compares), `vectorizedAt`, `version`, and 🚧 the forward
 * stack's `rewindOrdinal` and `rewindTaken` (RF fix 5: a rewound row never
 * reaches a widget, and what Back took is the host's). They are host
 * bookkeeping, listed once in {@link MESSAGE_HOST_FIELDS}: a host strips them
 * from every row it posts ({@link projectMessageRow}), so a widget never
 * receives them.
 */
export interface MessageV1 {
	/** The row's id. What every verb taking a `messageId` wants. */
	id: number
	/** The session this row belongs to. */
	sessionId?: number
	/**
	 * The lane this row is on, canonically (`main`, `text-messages:2`).
	 *
	 * The LANE rides inside this string — `<slug>:<lane>`, with a bare slug
	 * meaning lane 1 — and `parseChannel` takes it apart. Absent reads as
	 * `main`.
	 */
	channel?: string
	/** `user` · `assistant` · `system` — the chat-completions vocabulary. */
	role: string
	/** The rendered text of the message. */
	content: string
	/**
	 * Who spoke, as the host resolved it for display: a character's name, a
	 * persona's, the narrator's. Null when the host has no name for the row.
	 */
	speakerLabel?: string | null
	/** The speaking character, when one spoke. */
	characterId?: number | null
	/** The speaking persona, when one spoke. */
	personaId?: number | null
	/** True for a narrator turn: no character, no persona, `role: assistant`. */
	isNarratorResponse?: boolean
	/** The row's kind, where a host distinguishes several. */
	kind?: string
	/**
	 * 🚧 Provisional. The parts-native half of the message model: the parts a
	 * renderer composes, blocks included, each at its step and revision — the
	 * row shows, per step, the revision `activeRevisions` names. The row's
	 * `content` is the flattened text of the same thing and stays
	 * authoritative for a widget that only draws prose. Absent on a row the
	 * host has not projected yet (one written mid-run).
	 */
	parts?: MessagePartV1[]
	/** When the row was written, as a string on the wire. */
	createdAt?: string
	/** When the row last changed — a timestamp, as a string on the wire. */
	updatedAt?: string
	/**
	 * 🚧 The **story clock stamp**: the session's story now as it stood when
	 * the row was written (its own clock, else its line's present), as the
	 * five stored columns. All null or absent on a row written before stamps,
	 * or in a session with no dated story. What the conversation's **day
	 * marks** read.
	 * @ruling PROPOSAL-live-scenes §6, §8
	 */
	storyClockYear?: number | null
	storyClockMonth?: number | null
	storyClockDay?: number | null
	storyClockHour?: number | null
	storyClockMinute?: number | null
	/** A person has edited this row's text. */
	isEdited?: boolean
	/** The host is not showing this row. */
	isHidden?: boolean
	/** A run is filling this row right now. */
	isGenerating?: boolean
	/**
	 * How the last generation on this row ended, when it did not end normally
	 * — `stopped` for a reply a person stopped, leaving the partial text.
	 * Null or absent for a reply that finished.
	 */
	generationOutcome?: string | null
	/**
	 * What the run filling this row is doing right now — *{speaker} is
	 * typing* — as display text with its variables filled, NOT a string:
	 * resolve it with `renderStatusText`. Null or absent when nothing runs.
	 * @ruling R-19
	 */
	generationStatus?: StatusText | null
	/** Why the last run on this row failed, when it did — shown in place of text. */
	error?: MessageErrorV1 | null
	/**
	 * Per step (`"0"`, `"1"`, …), the revision of that step's parts the row
	 * shows — the swipe cursor of the parts-native model (`{ "0": 1 }`).
	 */
	activeRevisions?: Record<string, number>
	/** The row's own metadata bag — the keys a widget reads are named in {@link MessageMetadataV1}. */
	metadata?: MessageMetadataV1
	/** Whatever else the host attached to the row for a widget to read. */
	extras?: WidgetPayload
	/**
	 * The host forwards the row, less {@link MESSAGE_HOST_FIELDS}, so columns
	 * this interface does not name arrive at the top level beside the ones it
	 * does.
	 */
	[k: string]: unknown
}

/**
 * @experimental The message-row columns a host never posts to a widget — the
 * bookkeeping {@link MessageV1} withholds. The one list: a host's projection
 * ({@link projectMessageRow}) and `MessageV1`'s doc comment both follow it.
 */
export const MESSAGE_HOST_FIELDS = Object.freeze([
	'userId',
	'queueItemId',
	'debugMeta',
	'embedding',
	'embeddingModel',
	'embeddingSourceHash',
	'embedTextHash',
	'vectorizedAt',
	'version',
	// 🚧 The forward stack (RF fix 5): which Back took a row out, and what it took.
	'rewindOrdinal',
	'rewindTaken',
] as const)

/** @experimental One of {@link MESSAGE_HOST_FIELDS}. */
export type MessageHostField = (typeof MESSAGE_HOST_FIELDS)[number]

const HOST_FIELD_SET: ReadonlySet<string> = new Set(MESSAGE_HOST_FIELDS)

/**
 * @experimental A message row as it may cross to a widget: a shallow copy
 * without {@link MESSAGE_HOST_FIELDS}. Every road a row takes to a widget —
 * the `messages` post, a `channel` post, a `messages` page — goes through
 * this. A non-object is returned as it is.
 */
export function projectMessageRow<T>(row: T): Omit<T, MessageHostField> {
	if (!row || typeof row !== 'object' || Array.isArray(row)) return row as Omit<T, MessageHostField>
	const out: Record<string, unknown> = {}
	for (const key of Object.keys(row)) if (!HOST_FIELD_SET.has(key)) out[key] = (row as Record<string, unknown>)[key]
	return out as Omit<T, MessageHostField>
}

/** A failed run, as the row carries it. @experimental */
export interface MessageErrorV1 {
	message: string
	code?: string
	/**
	 * The connection the run failed on — its identity, which only an
	 * administrator is sent: for everyone else the whole bag is absent. Any
	 * field may be null (a connection deleted since, a model never named).
	 */
	connection?: MessageErrorConnectionV1
}

/** @experimental A failed run's connection identity (administrators only; see {@link MessageErrorV1}). */
export interface MessageErrorConnectionV1 {
	id?: number | null
	name?: string | null
	/** The model the connection names — a file path, on a managed connection. */
	model?: string | null
	/** The adapter kind: `koboldcpp`, `openai-chat`. */
	type?: string | null
	/** What the service itself said, verbatim. */
	detail?: string
}

/**
 * @experimental 🚧 One part of a message (the parts-native model): a typed piece at a
 * `step`, in one `revision` of that step, in `ordinal` order.
 */
export interface MessagePartV1 {
	id: number
	messageId: number
	step: number
	revision: number
	ordinal: number
	/**
	 * `core:markdown` · `core:reasoning` (the reply's reasoning) ·
	 * `core:section` · `core:image` · … or a plugin's namespaced type.
	 */
	type: string
	/**
	 * The text, for a textual type. A `core:section` holds its section's text
	 * here — for a list, the items as a markdown bullet list, so a renderer
	 * that knows nothing of `items` still shows something readable.
	 */
	content: string | null
	/**
	 * Structure, for a type that has any. A `core:section` carries
	 * {@link FoldedSectionPartDataV1}: its `title`, and — for a folded section —
	 * its `kind`, and `items` when it is a list.
	 */
	data: Record<string, unknown> | null
}

/**
 * @experimental 🚧 A **folded section**: a named piece of a reply shown
 * collapsed beside its body, never as the body — a narrator's Plan (beats and
 * speakers, as a list), a step's notes. What the
 * `sections` in-port of `core:outlet/create-message@1` and
 * `core:outlet/update-message@1` takes, as a list, and what the host stores per
 * swipe and serves to widgets as a `core:section` part.
 *
 * Exactly one of `content` and `items`. A folded section never enters the
 * prompt transcript, and neither does the reply's reasoning: both are for the
 * person reading, never re-sent to the model.
 *
 * ⚠ Not a layout **fold** (a unit or zone giving way at a size), and not the
 * model's reasoning trace — that is the `reasoning` in-port, stored as a
 * `core:reasoning` part.
 * @ruling B4, decision D5 (2026-09-27)
 */
export interface FoldedSectionV1 {
	/**
	 * What the section holds, as a lowercase slug — `plan`, `notes`, or a
	 * plugin's own. Chooses the glyph; never shown.
	 */
	kind: string
	/** The heading on the section's disclosure button, in sentence case: `Plan`. */
	label: string
	/** The section's text (markdown). */
	content?: string
	/** The section as a list, one entry per line — rendered as a list, never as JSON. */
	items?: string[]
}

/**
 * @experimental The `data` of a `core:section` part. `title` is the heading;
 * `kind` and `items` are present on a folded section ({@link FoldedSectionV1}).
 */
export interface FoldedSectionPartDataV1 {
	title: string
	kind?: string
	items?: string[]
}

/** @experimental The metadata keys a message widget reads; others ride along. */
export interface MessageMetadataV1 {
	isGreeting?: boolean
	/** Alternative replies: their texts, and which one is shown. */
	swipes?: MessageSwipesV1
	narratorName?: string
	narratorInstructions?: string
	/**
	 * The model's reasoning for the shown swipe, when it shared any — written
	 * on every streamed frame, so it fills while the reply is still reasoning.
	 */
	reasoning?: string | null
	/**
	 * The row's folded sections while it has no alternatives; once it has,
	 * `swipes.sectionsHistory` holds each one's. A widget reads the
	 * `core:section` parts instead.
	 */
	sections?: FoldedSectionV1[] | null
	/** The expression sprite shown beside the row. */
	sprite?: unknown
	/** Who spoke, as the speaker envoy recorded it. */
	speaker?: unknown
	/** The form this row answers: the message carrying it, and the block. */
	answersForm?: { messageId: number; blockId: string }
	/**
	 * 🚧 A **table line** — the table's own line, in no voice (a Dungeon
	 * Crawler roll line; `create-message@1`'s `tableLine`). Drawn without a
	 * speaker's face or name.
	 */
	tableLine?: boolean
	[k: string]: unknown
}

/** @experimental A row's alternative replies (`metadata.swipes`). */
export interface MessageSwipesV1 {
	/** Which of `history` is shown; null before the first. */
	currentIdx: number | null
	/** Every reply's text, oldest first. */
	history: string[]
	/** The reasoning each reply carried, parallel to `history`. */
	reasoningHistory?: (string | null)[]
	/**
	 * The folded sections each reply carried, parallel to `history`. Absent
	 * until a write gives a later alternative sections; until then the first
	 * alternative's are the row's `sections`.
	 */
	sectionsHistory?: (FoldedSectionV1[] | null)[]
	[k: string]: unknown
}

/** Who is looking — what a widget needs to know about the viewer, and no more. @experimental */
export interface ViewerV1 {
	userId: number | null
	isAdmin: boolean
	/** A guest seat: may read, may not write. */
	isGuest: boolean
}

/**
 * One person in the session's **attendance**: the session's owner or
 * one of its guests — an account, never a cast member — whether they have
 * the session open now, as whom they write, and whether they are typing.
 *
 * Not a cast **presence** (a cast member's dated span in the world): this is
 * who has the session open, and nothing about the fiction.
 * @experimental
 * @ruling W10
 */
export interface AttendeeV1 {
	userId: number
	/** The account's display name (its username when it has none). */
	name: string
	/** The session's owner, or a guest the owner added. */
	role: 'owner' | 'guest'
	/**
	 * The personas this person writes as in this session — `character:<id>`,
	 * the grammar of `characters.v1` refs, so a widget granted `characters`
	 * finds their faces. Empty when they write as none.
	 */
	personaRefs: `character:${number}`[]
	/** One of their personas pinged *typing* within the last few seconds. */
	typing: boolean
	/**
	 * When they last had the session open (ms since the epoch): now, while
	 * they do; null when the server has not seen them since it started.
	 */
	lastSeenAt: number | null
	/** They have the session open now — in any tab. */
	here: boolean
}

/**
 * The session's **attendance** (`attendance.v1`): its owner and guests,
 * owner first, each with whether they have the session open now. A base
 * section — who is in the room is something every widget may know.
 * @experimental
 * @ruling W10
 */
export interface AttendanceV1 {
	v: 1
	people: AttendeeV1[]
}

/**
 * The attendance before the host's first push — and what a reader answers
 * for a section it was not sent. Frozen.
 * @experimental
 */
export const EMPTY_ATTENDANCE: AttendanceV1 = Object.freeze({
	v: 1 as const,
	people: Object.freeze([]) as unknown as AttendeeV1[],
})

/**
 * One action as a venue lists it — transport-neutral here so a
 * frame and a native widget read the same rows. `specSlug` is `core` for one
 * of core's own message verbs.
 * @experimental
 * @ruling plans/29 R-15
 */
export interface WidgetAction {
	key: string
	specSlug: string
	name: string
	/** What it does, one sentence — every contributed and core action declares one (2026-09-28). */
	description?: string
	icon?: string
	/**
	 * What the icon says standing alone — the accessible name of an
	 * icon-only control. Absent: `name`.
	 * @experimental
	 */
	iconAlt?: string
	slash: string
	quick: boolean
	audience: { see: string[]; act: string[] }
	venue: string
	channel?: string
	origin: 'core' | 'companion' | 'foreign'
	floor: boolean
	canAct: boolean
	itemGated: boolean
	isNew: boolean
	/**
	 * The enabled-when verdict, beside `canAct` — both shown, neither
	 * hides the action: every predicate the host could judge over the
	 * session's published values holds. The `item.*` ones are not among
	 * them (`itemPredicates`). The host always sends it; absent (a fixture,
	 * a host older than this field) reads as enabled.
	 * @ruling U5e
	 */
	enabled?: boolean
	/** Why it is grey when `enabled` is false — resolve with `renderStatusText`. */
	reason?: WidgetActionReason
	/**
	 * The predicates over `item.*` — the message the action is pressed on —
	 * which a widget judges per row with `evaluateEnabledWhen`. Message venue
	 * only; absent when there are none.
	 */
	itemPredicates?: EnabledWhen[]
}

/**
 * The session's actions per **venue**, each a primary set plus an overflow
 * that lists every enabled action. Keyed by venue kind (`composer`,
 * `message`, `extra`, `widget`, …); a widget reads the venues it draws —
 * `widget` for its own controls, `message` when it renders a message's menu —
 * and fires one through `invoke(key)`. Empty venues when the host has no list
 * yet.
 * @experimental
 * @ruling F38
 */
export type ActionsV1 = Record<string, { primary: WidgetAction[]; overflow: WidgetAction[] }>

/** The transport-neutral data half — the versioned sections. */
/**
 * What this viewer may see of the session annex: per owner, the values
 * whose audience holds for them — never the annex itself. A value stored for
 * pipelines only is never here.
 * @experimental
 * @ruling R57
 */
export type AnnexV1 = Record<string, Record<string, unknown>>

// ─── Scoped section shapes (v1, 🚧) ─────────────────────────────────────────

/**
 * 🚧 One person the session's story has met ({@link SessionStateV1.metPeople}):
 * its entry in the session's own notes and the name the session reads it by.
 * @experimental
 */
export interface SessionMetPersonV1 {
	entryId: number
	name: string
}

/**
 * 🚧 The session's stats and states, as a widget reads them —
 * `session_state.v1` (a SCOPED section, scope `session:state`, which a
 * plugin's widget is granted as `widget:session:state`, reviewed like
 * `session:full`). The viewer's view of the one resolved read (`state:get`):
 * what every member of the session reads today, until state gets per-viewer
 * audiences.
 *
 * `resolved`, never `state`: `state` on a component's context is the view
 * state it saved.
 * @experimental
 * @ruling R72
 */
export interface SessionStateV1 {
	/** The session this answers for. */
	sessionId: number
	/** The first read has landed. Before it, empty means "not yet", never "nothing". */
	loaded: boolean
	/**
	 * Why the last READ failed, in words; null when it did not. A write a
	 * widget asked for fails as that request's own rejection — errors are
	 * per widget, never one line every state widget shows.
	 * @ruling R77
	 */
	error: string | null
	/** The values, resolved: what a template reads as `state`. */
	resolved: SessionResolvedStateV1
	/** Every slot this install declares, as a widget has to draw it. */
	slots: SessionStateSlotV1[]
	/** Every owner this session's values belong to: the world, and each cast member. */
	owners: SessionStateOwnerV1[]
	/**
	 * 🚧 The table **keeps no numbers** (PLAN-dc-after-walk2 Q2-3, owner ruling
	 * ★3): its ruleset is one of words, with no dice (the Freeform ruleset). A
	 * widget draws a stat that has words in them (`SessionStateSlotV1.words`)
	 * and a number with none not at all. Absent: numbers are kept.
	 * @experimental
	 */
	wordsOnly?: true
	/**
	 * 🚧 The **people the story has met** (PLAN-dc-after-walk2 Q3-5): the
	 * `core:entry/character-lore` entries of the session's own notes — where
	 * a story that writes people (a dungeon crawl's) puts each one it meets —
	 * as the session sees them, in entry order. No card behind them, so no
	 * picture: Scene Portraits draws each by name (`metPeople`). Absent from
	 * a host that predates it, and ⏳ empty for a session with a lorebook of
	 * its own (that book holds people never met).
	 * @experimental
	 */
	metPeople?: readonly SessionMetPersonV1[]
	/**
	 * 🚧 The **offers** waiting on this session's sheets (2026-10-19, owner
	 * ruling ★4): a piece given to a sheet its giver may not write waits here
	 * until the receiver accepts or declines it, or the giver withdraws it —
	 * nothing moves before that. Only the offers the viewer is shown (those
	 * on owners they hear). Absent from a host that predates offers, and when
	 * none waits. @experimental
	 */
	offers?: SessionStateOfferV1[]
	/**
	 * 🚧 The session's **story clock** in words (RF fix 8, 2026-10-23): when
	 * the story is — the _when_ of a sheet's _Where and when_ row, the host's
	 * own time. Absent when the session keeps no clock.
	 * @experimental
	 */
	storyTime?: string
}

/**
 * 🚧 One **offer** ({@link SessionStateV1.offers}): `count` of a piece in
 * `from`'s `slotId` list, offered to `to` by the _Give to…_ request
 * (`give-piece`). The receiver — whoever may write `to` — accepts or
 * declines it with `decide-proposal` (`proposalId`, `accept`); the giver
 * withdraws it the same way (`accept: false`). @experimental
 */
export interface SessionStateOfferV1 {
	/** What `decide-proposal` answers. */
	proposalId: number
	slotId: string
	/** Whose list the piece leaves, by the owner's key and words. */
	from: OwnerRefV1 & { key: string; label: string }
	/** Whose list it would join. */
	to: OwnerRefV1 & { key: string; label: string }
	/** The piece as a person reads it — its name, never an id. */
	item: string
	/** How many are offered (at least 1). */
	count: number
	/** True when the viewer made this offer: theirs to withdraw. */
	yours?: boolean
}

/**
 * The resolved values — the object a template reads as `state`. Each bag is
 * keyed by a slot's QUALIFIED key (`SessionStateSlotV1.qualifiedKey`), the
 * key every value is filed under.
 * @experimental
 */
export interface SessionResolvedStateV1 {
	/** The world's values. */
	world: Record<string, unknown>
	/** Each cast member's values — a card-less player seat's too — by owner key (`SessionStateOwnerV1.key`). */
	cast: Record<string, Record<string, unknown>>
	/**
	 * 🚧 Each location's values, by owner key (`SessionStateOwnerV1.key`, a
	 * `session_location` owner) — attributes phase 4. Absent from a host
	 * that predates locations holding state.
	 */
	locations?: Record<string, Record<string, unknown>>
	/**
	 * The session's state version: moved by every applied change.
	 * @ruling U5f
	 */
	version?: number
}

/**
 * What a slot IS, for a widget that draws it: `14` is a bar only because the
 * slot is an integer with a floor and a ceiling, `wary` a chip only because
 * the slot is an enum. ⚠ Never the slot's `descriptor` — that is the
 * sentence the MODEL reads, and a widget drawing it would put prompt text on
 * a bar.
 * @experimental
 */
export interface SessionStateSlotV1 {
	/** `owner:slot/name@N` — what `set-attribute-value` names. */
	slotId: string
	/** The key a person reads (`hp`): the first claimant's, so a display name, not an address. */
	key: string
	/** The key every value is filed under in `resolved` — the one to look a value up by. */
	qualifiedKey: string
	label: string
	description?: string
	type: SlotType
	/**
	 * 🚧 The catalogue stat shape the slot names (`core:stat-shape/list@1`),
	 * when it names one; absent for a slot shaped inline or by `type` alone.
	 */
	shape?: string
	/**
	 * 🚧 What the value IS, in the field language (`FieldDecl`): the stat
	 * shape's field — what decides a bar, a chip, a list or a story time
	 * (`statShapeKindOf`). Absent from a host that predates shapes, and for a
	 * derived slot: read the field off `type` then (`fieldForSlotType`).
	 */
	field?: FieldDecl
	appliesTo: SlotAppliesTo[]
	/**
	 * A sheet says a session of this shape must have a value: shown, never enforced here.
	 * @ruling R7
	 */
	required?: boolean
	/**
	 * Retired: its values still resolve and nothing new is written; drawn greyed, never dropped.
	 * @ruling R3
	 */
	retired?: boolean
	/** The sheet that first named it, when one did. */
	sheetId?: string
	/**
	 * 🚧 How the value reads at a table that keeps no numbers
	 * ({@link SessionStateV1.wordsOnly}): the declaration's bands in the
	 * viewer's language (`slotWordsFor`). Absent when it declares none.
	 * @experimental
	 */
	words?: { upTo: number; label: string }[]
	/**
	 * 🚧 Drawn only while it holds something (the declaration's
	 * `shownWhenSet`, PLAN-dc-after-walk2 Q3-8): a widget leaves an empty one
	 * off the sheet. Absent: drawn empty, as every stat is.
	 * @experimental
	 */
	shownWhenSet?: true
	/**
	 * 🚧 The rules' **attribute kind** (RF fix 8, 2026-10-23): number · pool ·
	 * tally · label · list · text — what a stock widget picks its drawing
	 * by. Absent on host state, and from a host that predates it (read the
	 * kind off `field`/`type` then).
	 * @experimental
	 */
	kind?: string
	/**
	 * 🚧 The attribute's **shown-as hint** (RF fix 8): how the rules would
	 * like it drawn — `bar`, `pips`, `badge`, `count`, `words`, `list`, `fan`,
	 * `ties`, or a package's own word. A widget that does not know the hint
	 * draws the kind's default. Absent: the kind's default.
	 * @experimental
	 */
	shownAs?: string
	/**
	 * 🚧 **Host state** (RF fix 8): what the host keeps beside the rules'
	 * attributes — `place` and `time` (a sheet's _Where and when_ row), ⏳
	 * `carried` (what someone carries, the host's carried zone kept as a
	 * list) or a genre tool's own (`tool`: the Lair's whisper, the crawl's
	 * fate). Never drawn among the attributes. Absent: one of the rules'
	 * attributes.
	 * @experimental
	 */
	hostState?: 'place' | 'time' | 'carried' | 'tool'
}

/**
 * An owner a session's values belong to — the world (`kind: 'session'`), a
 * cast member (`session_cast`, whose `id` is the card), 🚧 a player seat
 * that voices no card (`player_seat`, whose `id` is the seat — participant
 * reference `player-seat:<id>`; a seat with a card is that card's `session_cast`)
 * or 🚧 a location (`session_location`, whose `id` is the location's lore
 * entry) — keyed exactly as `resolved` keys it. `key` is the lookup; `kind`
 * and `id` are what `set-attribute-value` names.
 * @experimental
 */
export interface SessionStateOwnerV1 extends OwnerRefV1 {
	/** `world`, the cast member's or player seat's key in `resolved.cast`, or the location's in `resolved.locations`. */
	key: string
	label: string
	/**
	 * 🚧 Whether the viewer may write this owner's values. `false` on a
	 * player seat that is not the viewer's (only its player and the
	 * session's owner write it — the host refuses anyone else); a widget
	 * draws those values without edit controls. Absent: writable, as every
	 * owner was before this field (2026-10-16, additive).
	 * @experimental
	 */
	editable?: boolean
	/**
	 * 🚧 True on the one owner that is the viewer's own: their player seat
	 * (card-less or carded), else the persona they play. The stats widget's
	 * `owners: 'mine'` draws this one; a guest sees their own sheet, never
	 * the host's. Absent on every other owner. @experimental
	 */
	mine?: boolean
	/**
	 * 🚧 True on an owner that is a **player seat** (2026-10-18): a card-less
	 * one (`player_seat`), or a card seated as one (a persona played as a
	 * seat). Never on a cast member nobody plays — a companion, an NPC card.
	 * The stats widget's `owners: 'seats'` draws these. Absent everywhere
	 * else, and from a host that predates it. @experimental
	 */
	seat?: boolean
	/**
	 * 🚧 The owner's **face** (2026-10-17): the picture the sheet head, the
	 * faces strip, Scene Portraits and a reply's avatar all draw — a cast
	 * member's card art, a player seat's **seat portrait**
	 * (`session_personas.portrait_media_id`), resolved by the host to a
	 * `src`. `null` when the owner has none; absent from a host that does
	 * not say (read as none). The world and a place carry none.
	 * `set-owner-face` changes it.
	 * @experimental
	 */
	face?: { src: string; mediaRef: string | null } | null
	/**
	 * The configuration in force per slot id — a bar's bounds, a chip's
	 * options. Only the slots this owner may carry appear, so a slot is this
	 * owner's exactly when its id is a key here.
	 *
	 * 🚧 One universal key (2026-10-17): `lock` — `'none'` (the default:
	 * whoever may write this owner writes this slot), `'people'` (no hand
	 * edit; pipelines and the session's owner still write — the dice keep
	 * Health), or `'all'` (nothing writes until unlocked). Set by
	 * `core:outlet/set-stat-config@1`; a widget draws a locked slot without
	 * edit controls, and the host refuses a write with its own sentence.
	 */
	configs: Record<string, Record<string, unknown>>
	/**
	 * 🚧 Each repertoire a list stat of this owner holds (`config.repertoire`),
	 * by address — its name and its piece shape, so a widget labels a piece's
	 * facts and draws its form without the ruleset's declaration. Absent
	 * from a host that predates pieces, and on an owner holding none.
	 * @experimental
	 */
	repertoires?: Record<string, SessionStateRepertoireV1>
	/**
	 * 🚧 The owner's **derived values** (2026-10-18): what the session's
	 * ruleset works out from this owner's sheet and puts on it (a derived
	 * selector marked `onSheet` — Vis Itineris's _Armour class_), each with
	 * the label a person reads and the value as the host worked it out. Never
	 * stored, so never written: a widget draws them read-only, with no edit
	 * control and no trail. In the ruleset's order. Absent when the ruleset
	 * works nothing out for this owner (no numbers at this table, or none on
	 * the sheet), and from a host that predates them.
	 * @experimental
	 */
	derived?: SessionStateDerivedV1[]
	/**
	 * 🚧 The owner's **tie sides** (ties on the graph, T1–T5, 2026-10-23):
	 * each side of a tie this owner holds — a bond, a rivalry — towards whom,
	 * its words, and its numbers where the viewer may see them (its holder,
	 * the game master, or a side shown to others), with the other person's
	 * side as words (and its numbers once shown). A stock widget draws them as
	 * a list of ties. Absent when the session's rules keep no ties, and from a
	 * host that predates them.
	 * @experimental
	 */
	ties?: SessionStateTieV1[]
	/**
	 * 🚧 What the owner **holds**, zone by zone (RF fix 8, 2026-10-23): each
	 * of the session's rules' zone types this owner has an instance of — the
	 * host's carried zone among them — with the held entries in it, as the
	 * viewer may see them. A stock widget draws each by its shown-as hint (a
	 * list, a fan). Absent when the owner holds nothing in any zone, and from
	 * a host that predates zones on the wire.
	 * @experimental
	 */
	zones?: SessionStateZoneV1[]
	/**
	 * 🚧 The owner's **attribute carries** (RF fix 8): each of the rules'
	 * optional attributes this owner may hold, whether they carry it, and
	 * whether the viewer may switch it (`set-attribute-carry`) — whoever plays
	 * the holder, or the session's owner. An attribute switched off is not in
	 * `configs` (not shown); this is where a widget offers it back. Absent
	 * when the rules declare no optional attribute for this owner.
	 * @experimental
	 */
	carries?: { slotId: string; label: string; carries: boolean; mayChange: boolean }[]
}

/**
 * 🚧 One zone an owner holds ({@link SessionStateOwnerV1.zones}): its zone
 * type's id and words, the shown-as hint a stock widget draws it by, and the
 * held entries in it — each by its name, its entry type (`entryType`, and
 * `typeLabel` the type's words), how many when more than one, and whether its
 * holder has exposed it. @experimental
 */
export interface SessionStateZoneV1 {
	zoneType: string
	label: string
	shownAs?: string
	entries: { name: string; entryType: string; typeLabel?: string; count?: number; exposed?: boolean }[]
}

/**
 * 🚧 One field of a tie side as a widget draws it: `field` its key,
 * `label` its words, `value` the words or the number (a number with its
 * bounds), `onto` when the lorebook graph reads it (the words everyone
 * sees). @experimental
 */
export interface SessionStateTieFieldV1 {
	field: string
	label: string
	value: string | number
	min?: number
	max?: number
	onto?: true
}

/**
 * 🚧 One tie side on an owner's sheet ({@link SessionStateOwnerV1.ties}):
 * the tie's kind (`entryType`, `label`), whom it is towards (an owner key
 * and a name), the relationship's name on the lorebook when it has one, this
 * side's words and — where the viewer may see them — its numbers, whether it
 * is shown to others (`shown`), whether the viewer may show or hide it
 * (`mayShow`, its holder or the game master: `set-tie-shown`), and the other
 * person's side towards this owner (`other`): its words, and its numbers
 * once shown or to the game master.
 * @experimental
 */
export interface SessionStateTieV1 {
	entryType: string
	label: string
	towards: string
	towardsLabel: string
	name?: string
	words: SessionStateTieFieldV1[]
	numbers?: SessionStateTieFieldV1[]
	shown: boolean
	mayShow: boolean
	other?: { words: SessionStateTieFieldV1[]; numbers?: SessionStateTieFieldV1[]; shown: boolean }
}

/**
 * 🚧 One derived value on an owner's sheet ({@link SessionStateOwnerV1.derived}):
 * `key` the ruleset's selector (`armour-class`), `label` its words, `value`
 * the number or words the host worked out. @experimental
 */
export interface SessionStateDerivedV1 {
	key: string
	label: string
	value: string | number
}

/**
 * 🚧 **An owner, named** — the one shape every widget request that names
 * whose stats uses (`set-attribute-value`, `stat-trail`, `set-owner-face`):
 * the session itself (the world), a cast member, a player seat or a place,
 * by the row's own id. The same four kinds the state read keys its owners
 * by, so a widget hands back exactly what it was given. One shape, not a
 * union repeated per request (2026-10-17).
 * @experimental
 */
export interface OwnerRefV1 {
	kind: 'session' | 'session_cast' | 'player_seat' | 'session_location'
	id: number
}

/**
 * 🚧 A repertoire as a widget needs it: its name and its piece shape (the
 * universal parts and its own fields, `RepertoireDecl.piece`). Never its
 * compendium — the host fills a referenced piece's `resolved` instead.
 * @experimental
 */
export interface SessionStateRepertoireV1 {
	label: string
	piece: FieldDecl
}

/**
 * 🚧 The session's cast, as a widget draws it — `characters.v1` — with
 * the scene images they picture riding along: images ride with their parent.
 * @experimental
 * @ruling R76
 */
export interface SessionCharactersV1 {
	/**
	 * Everyone still in the session: its characters, then its personas. A
	 * **benched** character (switched off in Participants: still in the
	 * session, out of the turns) is listed with `benched: true` — a reader that means "who is in the scene" leaves those
	 * out itself.
	 * @ruling W6 (2026-10-11)
	 */
	members: SessionCharacterV1[]
	/**
	 * ⏳ The portraits pinned beside the conversation, one per side; null for
	 * an empty side. The composer's **Pinned images** pane that set them is
	 * gone: a Scene Portraits instance's **chosen images**
	 * replace them, and the page only seeds those from a browser's old pins
	 * once. Still projected this release for a widget that reads it.
	 * @deprecated REMOVE in 0.7.0 — read `SessionCharacterV1` and ask
	 * `character-images`; a chosen image is a widget setting.
	 * @ruling W6 (2026-10-11)
	 */
	sceneImages: { left: SessionSceneImageV1 | null; right: SessionSceneImageV1 | null }
}

/**
 * One cast member, **cascaded cast over card**: the character card's
 * fields overlaid by the cast member's, and **the cast member wins wherever
 * both speak** — its name, its face, its sprite set. The card owns the art;
 * the cast member picks the set. The host merges; a widget reads the merged
 * value and never resolves the cascade itself.
 *
 * The host also resolves every URL and the current sprite, so a widget draws
 * what it is handed and asks nothing of the page but its verbs.
 * @experimental
 * @ruling R76
 */
export interface SessionCharacterV1 {
	/**
	 * `character:<id>` — a persona's too: a persona is a character row
	 * (`isPersona` says which), so its reference is the same grammar
	 * (`TurnCandidateV1.ref` reads it the same way).
	 */
	ref: `character:${number}`
	characterId: number
	/** A persona — a person's own character — rather than one of the cast. */
	isPersona: boolean
	/**
	 * The viewer's own persona in this session: what a widget draws for "your
	 * persona" (the viewer's, never merely the first one listed).
	 * @ruling R77
	 */
	mine: boolean
	/** The name to show: the cast member's (a nickname) over the card's. */
	name: string
	/** The member's avatar, resolved (a same-origin media URL); null when there is none. */
	face: string | null
	/**
	 * The member's CURRENT sprite — the one on the newest line it spoke, in
	 * `spriteSet` — resolved; null when the card has no sprites.
	 */
	sprite: string | null
	/** The card's sprite sets, by name, in the card's order. */
	spriteSets: string[]
	/** The set this member shows: the session's choice over the card's; null when neither names one. */
	spriteSet: string | null
	/**
	 * 🚧 The session's own choice alone (`set-sprite-set`): the set this
	 * session overrides the story's with, null when it follows the story. What
	 * a sprite-set menu marks as picked, where "as the story has it" is the
	 * absence of an override rather than the card's default set. Optional
	 * (additive): absent reads as null.
	 */
	spriteSetOverride?: string | null
	/**
	 * The viewer may switch this member's set (`set-sprite-set`) — the
	 * server's rule (the session's owner or the character's), answered by the
	 * host so a menu is offered only where it will be allowed.
	 * @ruling R77
	 */
	canChangeSpriteSet: boolean
	/**
	 * 🚧 When this member last spoke (ms since the epoch): its newest visible
	 * line on the session's line; null when it has spoken none. What a
	 * widget ranks "who spoke last" by without reading the log.
	 * Optional (additive): absent reads as null.
	 * @ruling W6
	 */
	lastSpokeAt?: number | null
	/**
	 * 🚧 How many images the character's **gallery** holds, when the host
	 * knows — what `character-images` would page through. Optional
	 * (additive): absent means the host did not say, never that there are
	 * none; ask `character-images` to find out.
	 * @ruling W6
	 */
	galleryCount?: number
	/**
	 * 🚧 A **benched** character: still in the session, switched off in
	 * Participants, out of the turns. Never a persona. Optional
	 * (additive): absent reads as false.
	 * @ruling W6
	 */
	benched?: boolean
}

/**
 * 🚧 One of the viewer's own personas in this session — `persona.v1` is a
 * list of them: the `characters.v1` members that are `isPersona && mine`,
 * the same objects (cascaded, resolved) cut from the same projection, so a
 * widget granted `persona` alone never needs the cast to find "you".
 *
 * A list because a person may write as several; today `mine` marks the one
 * the viewer is voicing (the composer's pick), so it holds at most one, and
 * is empty — never absent — when the viewer writes as no persona.
 * @experimental
 */
export type SessionPersonaV1 = SessionCharacterV1 & { isPersona: true }

/**
 * ⏳ A portrait pinned to one side of the conversation.
 * @deprecated REMOVE in 0.7.0 with {@link SessionCharactersV1.sceneImages}.
 * @experimental
 */
export interface SessionSceneImageV1 {
	/** The image, as the host resolved it. */
	src: string
	/**
	 * The member it pictures, when the host can tell — a pin is stored as an
	 * image, so it is matched by face; null for an image pinned from anywhere
	 * else.
	 */
	ref: `character:${number}` | null
}

// ─── The one table of scoped sections (🚧; C5 L3) ───────────────────────────

/**
 * 🚧 **The** table of scoped sections: each widget scope that delivers data,
 * the name its section is posted under, and that section's `v1` shape.
 * Every other spelling is derived from this one — `WidgetScope`,
 * `WidgetData`'s scoped keys, `ComponentSections.scoped`, the frame's
 * `scoped` message, the component wire's receiver — so a scoped section is
 * added by one entry here and one in {@link WIDGET_SCOPED_SECTIONS}, which
 * the compiler holds to this.
 *
 * A scoped section appears ONLY when the widget declared the scope AND it was
 * granted (a plugin's as `widget:<scope>`, reviewed and deniable; core's own
 * widgets hold every scope). Absence means "not granted", never a silent
 * empty — or, before the first post, "not yet"; the host's `grants`
 * (frame message `grants`, `ComponentContext.grants` / `granted(scope)`)
 * says which.
 *
 * Every `v1` is a named shape — never `unknown`.
 * @experimental
 * @ruling C4 (2026-10-10)
 */
export interface WidgetScopedSections {
	/**
	 * 🚧 The whole conversation as core's own conversation sees it: the
	 * dossier ({@link SessionDossierV1}). Its shape settles when the
	 * conversation moves onto the public contract.
	 * @ruling C8
	 */
	'session:full': { section: 'session_full'; v1: SessionDossierV1 }
	/**
	 * 🚧 The session's stats and states.
	 * @ruling R72
	 */
	'session:state': { section: 'session_state'; v1: SessionStateV1 }
	/**
	 * 🚧 The viewer's own personas in this session ({@link SessionPersonaV1}):
	 * the `characters.v1` members that are `isPersona && mine`, cut from the
	 * same projection under this scope's own grant. Empty, never absent, when
	 * the viewer writes as no persona.
	 */
	persona: { section: 'persona'; v1: SessionPersonaV1[] }
	/**
	 * 🚧 The session's cast, cast over card, and the scene images they picture.
	 * @ruling R76
	 */
	characters: { section: 'characters'; v1: SessionCharactersV1 }
	/**
	 * 🚧 The **lore grant marker**. The lore is not pushed: it is paged by
	 * request (`session-entries`), as messages are, and this scope is the
	 * grant a plugin's widget holds to ask. The section carries no data —
	 * `{ granted: true }`, posted when the scope is granted and absent
	 * otherwise — so present means granted, never "not yet".
	 */
	lore: { section: 'lore'; v1: { granted: true } }
}

/** A widget scope that delivers a scoped section — every scope but `channel:<slug>`. @experimental */
export type WidgetSectionScope = keyof WidgetScopedSections

/** A scoped section's name as posted: `session_full`, `session_state`, `persona`, `characters`, `lore`. @experimental */
export type WidgetScopedSectionName = WidgetScopedSections[WidgetSectionScope]['section']

/** Each scoped section's `v1`, by its posted name. @experimental */
export type WidgetScopedSectionValues = {
	[S in WidgetSectionScope as WidgetScopedSections[S]['section']]: WidgetScopedSections[S]['v1']
}

/** The envelope's scoped half: each section a `{ v1 }` bag, present iff declared and granted. @experimental */
export type WidgetScopedData = {
	[N in WidgetScopedSectionName]?: { v1: WidgetScopedSectionValues[N] }
}

/**
 * {@link WidgetScopedSections} at runtime: scope → the name its section is
 * posted under. Typed off the table, so a scope missing here, or a name that
 * disagrees with it, does not compile.
 * @experimental
 */
export const WIDGET_SCOPED_SECTIONS: { readonly [S in WidgetSectionScope]: WidgetScopedSections[S]['section'] } =
	Object.freeze({
		'session:full': 'session_full',
		'session:state': 'session_state',
		persona: 'persona',
		characters: 'characters',
		lore: 'lore',
	})

const SCOPED_SECTION_NAMES: ReadonlySet<string> = new Set(Object.values(WIDGET_SCOPED_SECTIONS))

/** Is this a scoped section's posted name — what a receiver checks an incoming `scoped` message against. @experimental */
export const isWidgetScopedSectionName = (name: unknown): name is WidgetScopedSectionName =>
	typeof name === 'string' && SCOPED_SECTION_NAMES.has(name)

// ─── The envelope ───────────────────────────────────────────────────────────

/**
 * The transport-neutral data half — the versioned sections: the base ones
 * below, and the scoped half ({@link WidgetScopedData}) the table above
 * derives.
 *
 * A base section a widget does not READ (`WidgetDecl.reads`) is never
 * sent to it: a remote or a frame never receives it, and a native widget is
 * handed its empty value (`[]`, `{}`) and never re-projected for it — so a
 * widget that does not read `messages` is not handed the log again on every
 * token.
 * @experimental
 * @ruling R75
 */
export interface WidgetData extends WidgetScopedData {
	// base — delivered to every widget that reads it (R75)
	layout: { v1: LayoutV1 }
	session: { v1: SessionV1 }
	channels: { v1: string[] }
	messages: { v1: MessageV1[] }
	props: { v1: WidgetPayload }
	/**
	 * The action model's venues — base, so a widget need not declare a
	 * scope to offer a control.
	 * @ruling R-15
	 */
	actions: { v1: ActionsV1 }
	/**
	 * This instance's effective settings: every field the widget declares
	 * (`WidgetDecl.settings`), defaults filled in, with the user's deviations
	 * over them. Complete by construction, so a widget reads a value rather
	 * than re-deriving its own defaults. Empty for a widget that declares none.
	 */
	settings: { v1: WidgetPayload }
	/**
	 * The viewer's view of the session annex — `{}` when there is nothing to see.
	 * @ruling R57
	 */
	annex: { v1: AnnexV1 }
	/**
	 * The viewer's language code (`en`, `fr`, …), so a widget renders a locale
	 * map (`i18nText(text, locale.v1)`) in the language the page speaks.
	 */
	locale: { v1: string }
	/**
	 * 🚧 Who is looking.
	 * @ruling C0b
	 */
	viewer: { v1: ViewerV1 }
	/**
	 * The session's turn order: who is due to speak, in order, and who
	 * could — the stored order core and every strategy write, never
	 * recomputed by a reader. What the page already shows every member in
	 * its "next" line; `EMPTY_TURN_ORDER` before the first recompute. An
	 * entry is open: a strategy may add keys (a `reason`, …) and they arrive.
	 * @ruling C5, A9
	 */
	turnOrder: { v1: TurnOrderV1 }
	/**
	 * The session's attendance: its owner and guests, who has it open
	 * now and who left, as whom each writes, who is typing.
	 * `EMPTY_ATTENDANCE` before the host's first push.
	 * @ruling W10
	 */
	attendance: { v1: AttendanceV1 }
	// scoped — present iff declared + granted: `WidgetScopedData`, from the table
}

/**
 * A base section's name — what a widget lists in `WidgetDecl.reads`. @experimental
 * @ruling R75
 */
export type WidgetBaseSection = Exclude<keyof WidgetData, WidgetScopedSectionName>

// Every base section, once: typed off `WidgetData`, so a section added there
// and not here — or named here and not there — does not compile.
const BASE_SECTIONS: { readonly [S in WidgetBaseSection]: true } = {
	layout: true,
	session: true,
	channels: true,
	messages: true,
	props: true,
	actions: true,
	settings: true,
	annex: true,
	locale: true,
	viewer: true,
	turnOrder: true,
	attendance: true,
}

/**
 * The base sections, in the order the envelope declares them: what
 * `WidgetDecl.reads` may name, and what a widget reads when it names none.
 * @experimental
 * @ruling R75
 */
export const WIDGET_BASE_SECTIONS: readonly WidgetBaseSection[] = Object.freeze(
	Object.keys(BASE_SECTIONS) as WidgetBaseSection[],
)

// ─── Verbs (transport-specific; part of the protocol) ───────────────────────

/**
 * ⏳ A menu for the host to render at a point the widget names — the argument
 * of the retired `menu` verb ({@link WidgetVerbs.menu}). REMOVE in 0.7.0.
 * @deprecated No host ever drew one. Place an `sp-menu` (or an `sp-popover`)
 * in your component instead: the page draws it with its own controls.
 * @experimental
 */
export interface MenuSpec {
	at: { x: number; y: number }
	items: Array<{ id: string; label: string; icon?: string; disabled?: boolean }>
}

/**
 * ⏳ What a person picked out of a `MenuSpec` — the retired `menu` verb's
 * answer. REMOVE in 0.7.0.
 * @deprecated See {@link MenuSpec}.
 * @experimental
 */
export interface MenuResult {
	id: string
}

/**
 * 🚧 What a widget may ASK the host for — by kind, with its params and
 * what comes back. A request is not a grant: the host may decline, and the
 * promise rejects. The host-UI kinds open something of the host's own (a
 * panel, a viewer, a picker) and resolve once it is shown; the widget never
 * sees what the host draws.
 * @experimental
 * @ruling C0b
 */
export interface WidgetRequests {
	/**
	 * 🚧 **While you were away** (PLAN-layering A7, R23; lane 7): the
	 * session's recent routine runs, newest first — what ran and what it
	 * wrote, what was skipped or paused and why — and when a person last
	 * played, so a widget can say which happened while nobody was here.
	 * `limit` is a wish the host clamps (1–200); `since` (epoch ms) narrows
	 * it.
	 */
	'routine-log': { params: { limit?: number; since?: number }; result: RoutineLogV1 }
	/**
	 * One page of the session's lines, for this widget's own window — never
	 * the conversation's, so two paging widgets never take each other's
	 * pages. Newest first on the first ask; `cursor` is the last page's
	 * `nextCursor`, absent on the last page. `limit` is a wish the host clamps
	 * (core: 1–100, 25 by default). `channel` is a channel string: a bare
	 * slug reads the whole channel, `slug:n` one lane; absent, a widget that
	 * declares one channel reads that one, any other reads every channel. A
	 * plugin's widget that declares channels is held to them. Rows arrive
	 * oldest first, as a log reads.
	 */
	messages: { params: { channel?: string; cursor?: string; limit?: number }; result: { rows: MessageV1[]; nextCursor?: string } }
	/** The character's sheet in the host's panel. */
	'open-character': { params: { characterId: number }; result: void }
	/** A participant's avatar, full size. */
	'view-avatar': { params: { ref: string }; result: void }
	/**
	 * An image a message shows, full size, in the page's lightbox. 🚧 `gallery`:
	 * the other images it sits with — a message's
	 * media strip — so the lightbox pages through them (←/→, swipe); `index` is
	 * where `src` sits in `srcs`, `captions` what each is called. Without it
	 * the lightbox shows the one image.
	 * @ruling composer attachments §3.4
	 */
	'view-image': {
		params: { src: string; gallery?: { srcs: string[]; index: number; captions?: string[] } }
		result: void
	}
	/**
	 * The lore panel at a history entry, a scene, or a new history entry —
	 * 🚧 or a place (`scope: 'places'`, an additive value).
	 * @ruling W4 (2026-10-11)
	 */
	'open-lore': {
		params: {
			lorebookId?: number
			scope: 'history' | 'scenes' | 'places'
			entryId?: number
			sceneId?: number
			create?: boolean
		}
		result: void
	}
	/** The prompt a message was generated from (admins, when context debugging is on). */
	'prompt-details': { params: { messageId: number }; result: void }
	/**
	 * The run that wrote a message, in the run inspector (admins) — or 🚧
	 * one run by its id (`runId`), as *While you were away* links a
	 * routine's run (PLAN-layering A7; lane 7). One of the two.
	 */
	'inspect-run': { params: { messageId?: number; runId?: string }; result: void }
	/** The host's "who speaks next" picker; resolves once a turn was fired or it was closed. */
	'pick-turn': { params: Record<string, never>; result: void }
	/**
	 * The host's sprite picker for a character's line.
	 * @ruling DESIGN-sprites §6
	 */
	'change-sprite': { params: { messageId: number }; result: void }
	/** The viewer has now seen these newly offered actions (their "new" mark clears). */
	'actions-seen': { params: { keys: string[] }; result: void }
	/**
	 * Summarize the selected messages into a scene, world lore or a character's lore.
	 * 🚧 `messageIds` absent: the host starts the
	 * conversation's own selection instead, and the person picks the lines —
	 * what Chronicle's **Summarize scene** asks, since it holds no lines.
	 * 🚧 `sceneId` (with `kind: 'scene'`): summarize that existing scene — a
	 * live scene's range, or a captured one's lines — in the host's review;
	 * `messageIds` is then ignored. What a scene divider's **Summarize** asks.
	 * A scene whose run still runs or waits in `review` opens that run's
	 * review instead of starting another — what a divider's and Chronicle's
	 * **Ready to review** ask (§15 G8).
	 * @ruling W3 (2026-10-11); PROPOSAL-live-scenes §7, §15 G8
	 */
	summarize: {
		params: { kind: 'scene' | 'world' | 'character'; messageIds?: number[]; sceneId?: number }
		result: void
	}
	/**
	 * 🚧 **Live scenes** (PROPOSAL-live-scenes §3, §14 C): open a scene at
	 * `messageId` on its channel lane — *Start scene here*. A scene already
	 * open on that lane is closed first, at the line before. The session's
	 * owner only, where the genre writes scenes and the session reads a
	 * lorebook (`SessionDossierV1.sceneBoundaries`); the host's refusal is
	 * the rejection, in words. Resolves with the opened scene's id; the
	 * scene arrives in the dossier's `scenes`.
	 */
	'scene-open': {
		params: {
			messageId: number
			channel?: string
			/**
			 * 🚧 The scene's last line: it opens and closes in one write — a
			 * closed scene over `messageId … closeAt` (*Mark as scene*, lane
			 * E). Any run that overlaps no live scene on its lane; one wholly
			 * before the lane's open scene leaves that scene open.
			 */
			closeAt?: number
		}
		result: { sceneId: number }
	}
	/**
	 * 🚧 Close the open scene `sceneId` at `messageId` — *End scene here* —
	 * or, absent, at its lane's newest line. Owner only, as `scene-open`.
	 */
	'scene-close': { params: { sceneId: number; messageId?: number }; result: { sceneId: number } }
	/**
	 * 🚧 Move a live scene's **scene boundaries**: its opening to `openedAt`,
	 * and (a closed scene only) its end to `closedAt` — message ids on the
	 * scene's lane. `closedAt: null` **reopens** a closed scene: it runs on
	 * to its lane's newest line again, refused while a later scene stands on
	 * the lane (lane E). A move leaves the scene's summary out of date
	 * (`summaryStatus` back to `none`, its text kept). Owner only, as
	 * `scene-open`.
	 */
	'scene-move': {
		params: { sceneId: number; openedAt?: number; closedAt?: number | null }
		result: { sceneId: number }
	}
	/** 🚧 Rename a scene (a scene divider's name); null or blank clears it. Owner only. */
	'scene-rename': { params: { sceneId: number; name: string | null }; result: void }
	/**
	 * 🚧 *Remove boundary* on a scene divider: the host asks the person
	 * first (what goes, what stays), then removes the boundary. A scene with
	 * one before it on its lane **joins** that scene (lane E: its lines
	 * become that scene's, its own summary goes; `mergedInto` names the
	 * survivor); the lane's first scene is removed, its lines staying in the
	 * conversation outside any scene. Resolves `removed: false` when the
	 * person kept it. Owner only.
	 */
	'scene-remove': { params: { sceneId: number }; result: { removed: boolean; mergedInto?: number } }
	/**
	 * 🚧 Send the viewer's line, as the persona and on the lane named — what
	 * core's own composer asks. A plugin's widget may ask it too, holding the
	 * **write grant** on that channel (`channel:<slug>:write`, reviewed as
	 * `widget:channel:<slug>:write`) and naming one of its own declared
	 * `channels`; a press must be behind it, and the line goes as the viewer.
	 * @ruling C0b
	 */
	send: {
		params: {
			content: string
			personaId: number | null
			channel: string
			/**
			 * 🚧 The composer's **tray items** to send as this line's
			 * attachments, in tray order. With
			 * any, `content` may be empty. The host refuses the whole line
			 * when one is not ready; the tray then stays as it was.
			 * @ruling composer attachments §3.1
			 */
			trayItemIds?: string[]
		}
		result: void
	}
	/**
	 * 🚧 Core's composer: upload these files into
	 * the session's composer tray — the files a person picked, dropped or
	 * pasted (`sp-file-picker`, `sp-drop-zone`). Resolves once they are
	 * queued; their progress, readiness and refusals arrive in the dossier's
	 * `composer.tray`, never in the reply.
	 * @ruling composer attachments §3.3
	 */
	'attach-files': { params: { files: File[] }; result: void }
	/** 🚧 Core's composer: take one tray item out of the tray (its upload stops; nothing is sent). */
	'remove-tray-item': { params: { trayItemId: string }; result: void }
	/**
	 * 🚧 Core's conversation: take one
	 * attachment — a `core:image` / `core:file` part, by its id — off a sent
	 * message. Whoever may edit the message may; the file itself stays.
	 * @ruling composer attachments D9 (remove only)
	 */
	'remove-attachment': { params: { messageId: number; partId: number }; result: void }
	/**
	 * 🚧 Core's composer: the draft changed (the host keeps it, and counts its
	 * tokens). A plugin's widget may ask it too — the gentler `send` — holding
	 * the write grant (`channel:<slug>:write`) on the channel the composer is
	 * on, one of its declared `channels`; a press must be behind it.
	 */
	draft: { params: { content: string }; result: void }
	/** 🚧 Core's composer: write as another of the viewer's personas. */
	'switch-persona': { params: { personaId: number }; result: void }
	/** 🚧 Core's composer: the host's "add your persona" flow, for a guest with none. */
	'add-persona': { params: Record<string, never>; result: void }
	/**
	 * 🚧 Core's composer: a guest who plays takes a seat by naming the
	 * character they will play — a card-less player seat (`seatName`), whose
	 * lines are that character's turns (Lair rewrite D5, 2026-10-21). The
	 * host refuses a blank name.
	 */
	'take-seat': { params: { name: string }; result: void }
	/**
	 * 🚧 Core's conversation: Continue — fire the first entry of the session's
	 * turn order on `channel`, the channel of the composer it was pressed in.
	 * Absent, the host answers for its own
	 * composer's channel.
	 * @ruling lair re-plan R5 (2026-09-28)
	 */
	'fire-turn': { params: { channel?: string }; result: void }
	/**
	 * 🚧 Core's conversation: **Back** — take the newest turn of the story out
	 * of the history, onto the session's forward stack (RF fix 5, owner ruling
	 * 2026-10-23). The session's owner; the host's refusal (nothing to go back
	 * to, a branch's fork, a reply being written) is said by the host, and
	 * the strip's state arrives in the dossier (`SessionDossierV1.rewind`).
	 */
	'rewind-turn': { params: Record<string, never>; result: void }
	/** 🚧 Core's conversation: **Forward** — bring the newest rewound turn back. */
	'forward-turn': { params: Record<string, never>; result: void }
	/** 🚧 Core's conversation: accept or reject a proposed change to the session's state. */
	'decide-proposal': { params: { proposalId: number; accept: boolean }; result: void }
	/**
	 * 🚧 Core's conversation: the next older page of the log (owner ruling
	 * ★7, 2026-10-19) — 25 more lines of each of `channels` (absent: every
	 * channel that has older lines, `SessionDossierV1.olderIn`), merged into
	 * the page's log, so a copy showing one channel scrolls back through its
	 * own lines and never another's. Resolves once the lines have landed.
	 * @experimental
	 */
	'load-older': { params: { channels?: string[] }; result: void }
	/**
	 * 🚧 _Give to…_ (2026-10-19, owner ruling ★4): `count` (absent: one) of
	 * the piece at `index` of `from`'s `slotId` list handed to `to`, where it
	 * joins `to`'s own count of the same piece. The host decides how: given at
	 * once when the viewer may write both sheets (`given: 'direct'` — the
	 * session's owner, or a drop at a place they keep), else **offered**
	 * (`given: 'offered'`) to a player's seat, whose player accepts or
	 * declines it ({@link SessionStateV1.offers}). Refused in words — more
	 * than is held, a sheet the viewer may not give from, a place nobody
	 * keeps. The table hears it either way. A plugin's widget may ask it,
	 * holding the write grant `session:state:write`, as for
	 * `set-attribute-value`.
	 * @experimental
	 */
	'give-piece': {
		params: { from: OwnerRefV1; to: OwnerRefV1; slotId: string; index: number; count?: number }
		result: { given: 'direct' | 'offered' }
	}
	/**
	 * 🚧 Show or hide one tie side's numbers to others (ties on the graph,
	 * T1, 2026-10-23): `owner`'s side of the tie of type `entryType` towards
	 * `towards` (an owner key, as {@link SessionStateTieV1.towards} names
	 * it) — the side's `exposed` flag. Its holder's to set, or the game
	 * master's; refused in words otherwise. The change arrives as the next
	 * `session_state` push. A plugin's widget asks it holding the write grant
	 * `session:state:write`, as for `set-attribute-value`.
	 * @experimental
	 */
	'set-tie-shown': {
		params: { owner: OwnerRefV1; entryType: string; towards: string; shown: boolean }
		result: { shown: boolean }
	}
	/**
	 * 🚧 Carry one of the rules' optional attributes, or stop carrying it
	 * (an **attribute carry**; RF fix 8, 2026-10-23 — the switch Session
	 * settings › Attributes offers, from the sheet too): `owner` carries
	 * `slotId` when `carries` is true. Off, it is not shown, read or changed
	 * for them; what it held comes back when it is on again. Whoever plays
	 * the holder may switch their own, the session's owner anyone's; an
	 * attribute the rules require is refused in words. The change arrives as
	 * the next `session_state` push. A plugin's widget asks it holding the
	 * write grant `session:state:write`, as for `set-attribute-value`.
	 * @experimental
	 */
	'set-attribute-carry': {
		params: { owner: OwnerRefV1; slotId: string; carries: boolean }
		result: { carries: boolean }
	}
	/**
	 * 🚧 Set one owner's value for one slot, as core's state widgets do, at
	 * the session layer — the viewer's own edit, applied at once (the page's
	 * `state:set`); `null` clears the session's value so the read inherits
	 * again. The page names its own session. Resolves once written; the new
	 * value arrives as a `session_state` push, never in the reply. A plugin's
	 * widget may ask it too, holding the write grant `session:state:write`
	 * (reviewed as `widget:session:state:write`) — a grant apart from the
	 * `session:state` read; a press must be behind it.
	 * @ruling R21
	 */
	'set-attribute-value': {
		params: {
			owner: OwnerRefV1
			slotId: string
			/** A list is written whole — its items in order: words, lore references and pieces (`SlotListItem`). */
			value: SlotValue
			/**
			 * 🚧 One line the table hears when this write lands (2026-10-18,
			 * the 100-turn walk #35: _Give to…_ moved a potion in silence) —
			 * "Wren gives Potion of healing to Rook." In a session whose genre
			 * keeps a **table channel** (`TABLE_CHANNEL`), the host writes it
			 * there, under the story's newest line, voiceless; elsewhere it is
			 * not written. Plain words, at most 200 characters.
			 * @experimental
			 */
			say?: string
		}
		result: void
	}
	/**
	 * 🚧 Core's scene portraits: show a character in another of its
	 * sprite sets, for this session only; `null` goes back to the card's.
	 * Offered where `SessionCharacterV1.canChangeSpriteSet` says so; the
	 * server judges it again.
	 * @ruling R21
	 */
	'set-sprite-set': { params: { characterId: number; set: string | null }; result: void }
	/**
	 * ⏳ Take down the portrait pinned on one side — the page's own pin,
	 * which the page keeps (the page and the widget never disagree
	 * about what is pinned). Core's Scene Portraits no longer asks it (a
	 * **chosen image** is the widget's own setting); still
	 * answered this release.
	 * @deprecated REMOVE in 0.7.0 with `SessionCharactersV1.sceneImages`.
	 * @ruling R77, W6 (2026-10-11)
	 */
	'clear-scene-image': { params: { side: 'left' | 'right' }; result: void }
	/**
	 * 🚧 Core's Scene Portraits: a page of one
	 * session member's **gallery** — the character's own images, in the
	 * gallery's order, sprites left out — each by `ref` (the image's stable
	 * id, what a **chosen image** stores) with its `src` resolved by the
	 * host. `cursor` is the last page's `nextCursor`; none is the first page,
	 * and no `nextCursor` is the last. Only a member of `characters.v1` may be
	 * asked about; the host refuses anyone else. A widget shows one large by
	 * `view-image` with the page as its `gallery`.
	 * @ruling PLAN-core-widgets W6
	 */
	'character-images': {
		params: { characterId: number; cursor?: string }
		result: { images: Array<{ ref: string; src: string; caption?: string }>; nextCursor?: string }
	}
	/**
	 * 🚧 A page of the session's lorebook, entry by entry, with what this
	 * session's rankings made of each — searched by title and keys,
	 * sorted, filtered, paged. The page names its own session. `lorebookId`
	 * is null when the session reads into no book; `ownerOnly` when the viewer
	 * is not the book's owner, and then `rows` is empty. `offset` is the page
	 * actually served — pulled back when the one asked for ran past the end.
	 * @ruling R58
	 */
	'session-entries': {
		params: {
			/**
			 * 🚧 Text an entry's title or one of its keys contains — the
			 * search box's words, matched as they are (`%` and `_` are
			 * literal). Never `query`, a retired word here — the node kind
			 * owns it: the page reconciles this
			 * with its socket's spelling.
			 */
			titleOrKey?: string
			sort?: 'name' | 'lastRead' | 'timesRead' | 'rank'
			filter?: 'all' | 'fired' | 'pinned' | 'off'
			/**
			 * 🚧 Only entries of these entry types (`core:entry/item`, …) —
			 * what a state widget's item picker asks for before the rest of
			 * the book (attributes phase 3c). Absent or empty is every type.
			 */
			typeIds?: string[]
			offset?: number
			limit?: number
		}
		result: {
			lorebookId: number | null
			bookName?: string
			ownerOnly: boolean
			rows: SessionEntryV1[]
			total: number
			offset: number
		}
	}
	/**
	 * 🚧 Core's lore entries: an entry's **Off** and **Pin** marks, and
	 * nothing else — never a re-embed. Resolves with both marks as the session
	 * reads the entry — its line, at its clock. For the book's owner and
	 * admins; the server judges it.
	 *
	 * `heldBy` is present when a dated amendment still decides a mark asked
	 * for, so it does not read as asked here: the entry itself was saved, and
	 * the amendment wins from `date` on (spelled by the book's calendar).
	 * @ruling R58
	 */
	'set-entry-marks': {
		params: { entryId: number; off?: boolean; pinned?: boolean }
		result: { off: boolean; pinned: boolean; heldBy?: { mark: 'off' | 'pinned'; date: string } }
	}
	/**
	 * 🚧 Core's author's note widget (2026-10-02, AN1): the session's
	 * author's note as it reads now, whether the viewer may change it, and
	 * what the newest reply's prompt did with it. The page names its own
	 * session.
	 */
	'authors-note': { params: Record<string, never>; result: AuthorsNoteV1 }
	/**
	 * 🚧 Core's author's note widget: save the session's author's note,
	 * whole. The session's owner only — the server judges it. Resolves with
	 * the note as it now reads.
	 */
	'set-authors-note': { params: { note: AuthorsNoteValueV1 }; result: AuthorsNoteV1 }
	/**
	 * 🚧 Core's Chronicle: where the
	 * session stands in its story and what its lorebook has recorded of it —
	 * its story clock, the history entry it reads now with this session's
	 * scenes under it, and the entries before it. The page names its own
	 * session. Read on the session's line, up to its own clock when it has
	 * one. `earlierLimit` caps `earlier` (default 10).
	 * @ruling PLAN-core-widgets W3 (2026-10-11)
	 */
	'history-entries': { params: { earlierLimit?: number }; result: HistoryEntriesV1 }
	/**
	 * 🚧 Core's Chronicle: move the session's **story clock** — never the
	 * book's present. `{ follow: true }` clears it, so the session follows
	 * its line's present again; `{ to }` sets it; `{ by, unit }` steps it
	 * through the book's calendar (from the line's present when the session
	 * follows it). The session's owner only; a date the calendar cannot
	 * place, or a step that does not land, is refused with the reason.
	 * Resolves with the clock as it now reads.
	 */
	'set-story-clock': {
		params: { follow: true } | { to: StoryTime } | { by: number; unit: StoryTimeUnit }
		result: StoryClockV1
	}
	/**
	 * 🚧 Core's Chronicle: add the next history entry after the one the
	 * session reads now (`HistoryEntriesV1.current`), on the session's line,
	 * one step on by the book's calendar — the lorebook's *Add the next date
	 * in sequence*. The book's owner only. Resolves with the new entry's id.
	 */
	'start-history-entry': { params: Record<string, never>; result: { entryId: number } }
	/**
	 * 🚧 Core's Chronicle: open the host's **Extend graph** review for this
	 * session's scenes on its line that are not in the lorebook's
	 * relationship graph yet. Resolves once it is shown; refused when there
	 * is none to read.
	 */
	'extend-graph': { params: Record<string, never>; result: void }
	/**
	 * 🚧 Core's Chronicle: summarize scenes of this session in the
	 * background, one after another, each through the host's summarize-scene
	 * path (its activity card, then its review) — `sceneIds`, or, absent,
	 * every closed scene whose summary has not run or failed: **Summarize all
	 * (N)**. A scene row's *Summarize* and the open scene's *Close and
	 * summarize* name one. The session's owner only, where the session's
	 * summary mode is not `never` (`HistoryEntriesV1.summaryMode`); a scene
	 * already summarizing, or still open, is skipped. Resolves once they are
	 * queued, with how many.
	 * @ruling PROPOSAL-live-scenes §5, §7 (2026-10-13)
	 */
	'summarize-scenes': { params: { sceneIds?: number[] }; result: { started: number } }
	/**
	 * 🚧 Decide a **scene cue** — Suggested mode's *New scene?* chip at a
	 * line (`SessionDossierV1.sceneCues`). `accept` opens a scene at the
	 * cue's line (the scene open on its lane, if any, closes at the line
	 * before); `accept: false` is *Not here*: every cue at that line is
	 * dismissed and never offered there again. The session's owner only.
	 * Resolves with the scene it opened, or null.
	 * @ruling PROPOSAL-live-scenes §4 (2026-10-13)
	 */
	'decide-scene-cue': { params: { cueId: number; accept: boolean }; result: { sceneId: number | null } }
	/**
	 * 🚧 Core's Places: the places of the
	 * session's lorebook as the session reads them — on its line, at its
	 * story clock, a place switched off, archived or renamed by then read as
	 * the session has it — and the **ways** between them, the same ones its
	 * prompt says as *From here:* (standing, never secret). The page names
	 * its own session. Who stands where is not here: it is the session's
	 * state (`session_state.v1`, each owner's `location`), which a widget
	 * granted `session:state` reads itself.
	 * @ruling PLAN-core-widgets W4 (2026-10-11)
	 */
	'session-places': { params: Record<string, never>; result: SessionPlacesV1 }
	/**
	 * 🚧 The **channel lanes** under one channel (ruled 2026-10-12): the
	 * conversations a channel carries, numbered from 1 — a phone's several
	 * threads. One entry per lane that holds at least one line, with how many
	 * and the latest. Who is in a lane is the genre's to keep (its extension
	 * data); this lists what the log itself shows. `channel` is a bare slug;
	 * a lane string (`slug:n`) answers that one lane. A plugin's widget that
	 * declares channels is held to them.
	 */
	'channel-lanes': { params: { channel: string }; result: { lanes: ChannelLaneV1[] } }
	/**
	 * 🚧 Core's Stats: one owner's
	 * **stat trail** for one slot — the changes this session made to it,
	 * oldest first, each with the message it was written at — read from the
	 * ledger the *Stat trail* pipeline query reads. `slotId` is the full id
	 * or its local name; `limit` keeps the newest that many (default 20, at
	 * most 100). The page names its own session. A slot the session does not
	 * track has no trail: `changes` is empty.
	 * @ruling PLAN-core-widgets §3.10, F2 (2026-10-11)
	 */
	'stat-trail': {
		params: {
			owner: OwnerRefV1
			slotId: string
			limit?: number
		}
		result: { changes: StatTrailChangeV1[] }
	}
	/**
	 * 🚧 Core's Scene Portraits: set the
	 * **chosen image** this widget shows for one member (`character:<id>`),
	 * by its image ref (what `character-images` answered as `ref`); `null`
	 * takes it away, so the face falls back to the avatar. Written into the
	 * asking widget's own settings (`chosenImages`), as the viewer's own
	 * values; the new settings arrive as the widget's `settings` section,
	 * never in the reply. Only a member of `characters.v1` may be named.
	 * @ruling F2 (2026-10-11), W6 ruling 1
	 */
	'set-chosen-image': { params: { characterRef: string; mediaRef: string | null }; result: void }
	/**
	 * 🚧 Core's Backdrop widget: set the session's **backdrop** to one image,
	 * by its image ref (what `character-images` answered as `ref`, a file's
	 * uuid, or what `session-images` answered, a file's id); `null` clears it. The host asks the server, which lets the
	 * session's owner or an admin; the new backdrop arrives on the `session`
	 * section, never in the reply.
	 * @ruling DESIGN-image-generation §6.4
	 */
	'set-backdrop': { params: { mediaRef: string | null }; result: void }
	/**
	 * 🚧 Core's Stats (the sheet head's portrait, 2026-10-17): set one
	 * owner's **face** — a player seat's seat portrait, or a cast member's
	 * chosen image — by a media ref (an upload's or a generated picture's
	 * file id, what `session-images` answers as `ref`); `null` clears it so
	 * the card's own art, or nothing, shows again. The viewer may set their
	 * own seat's, the session's owner anyone's; the host refuses the rest.
	 * The new face arrives on the next `session_state` push.
	 */
	'set-owner-face': { params: { owner: OwnerRefV1; mediaRef: string | null }; result: void }
	/**
	 * 🚧 Core's Backdrop widget's *From this session*: a page of the
	 * pictures generated in this session — the Album's `generated` source
	 * over a page of the session's lines (the `messages` request's window),
	 * newest first — each by `ref` (the file's id, which `set-backdrop`
	 * takes as it takes a uuid) with its `src` resolved by the host.
	 * `cursor` is the last page's `nextCursor`; none is the first page, and
	 * no `nextCursor` is the last. A page may hold no picture and still have
	 * a next one.
	 * @ruling DESIGN-image-generation §16 follow-up D3 (2026-10-12)
	 */
	'session-images': {
		params: { cursor?: string }
		result: { images: Array<{ ref: string; src: string; caption?: string }>; nextCursor?: string }
	}
}

/**
 * 🚧 One change on a **stat trail** (`stat-trail`): what the slot read
 * before it (`from`; null for the first the session made with nothing
 * recorded before it) and after (`to`; null is a clear — the session's value
 * taken away, so the read inherits again), the message it was written at
 * (null when written before the session's first), when (ms since the epoch),
 * and who wrote it: `user` — a person's own edit; `model` — a turn's run
 * (what the reply said, or a proposal from it someone accepted);
 * `pipeline` — anything else that writes state (a script).
 * @experimental
 * @ruling F2
 */
export interface StatTrailChangeV1 {
	messageId: number | null
	at: number
	from: unknown
	to: unknown
	by: 'user' | 'model' | 'pipeline'
}

/**
 * 🚧 One **channel lane** as the log shows it (`channel-lanes`): a numbered
 * conversation under a channel. Lane 1 is the bare slug, by canon, and
 * `channel` is always the canonical string a row carries.
 * @experimental
 */
export interface ChannelLaneV1 {
	/** The canonical channel string of this lane: `phone` for lane 1, `phone:2` after. */
	channel: string
	/** The channel's slug. */
	slug: string
	/** The lane number, from 1. */
	lane: number
	/** Lines in this lane, hidden ones included. */
	count: number
	/** The newest line, so a list can order and preview lanes. */
	latest: {
		messageId: number
		/** ISO time the line was created. */
		at: string
		role: string
		characterId?: number | null
		personaId?: number | null
	}
}

/**
 * 🚧 What `session-places` answers. With no lorebook (`lorebookId`
 * null) everything else is empty.
 * @experimental
 * @ruling W4
 */
export interface SessionPlacesV1 {
	/** The session's book; null when it reads none. */
	lorebookId: number | null
	/** The moment the places are read at — the session's story clock; null at the head of its line. */
	asOf: StoryTime | null
	/** The places the session sees, in entry order. */
	places: PlaceV1[]
	/** The ways between them, by relationship id; both ends are always among `places`. */
	ways: WayV1[]
}

/**
 * 🚧 One place as a session reads it — a **place**, a
 * `core:entry/location` lore entry.
 * @experimental
 * @ruling W4
 */
export interface PlaceV1 {
	/** The place's lore entry id — what `open-lore` and a `location` value name. */
	id: number
	/** Its name as the session reads it (an amendment's, by then). */
	name: string
	/** Its category ("a floor, a district, a wing"); null when it has none. */
	category: string | null
	/**
	 * Where its category falls among the book's categories, sorted as the
	 * lorebook's Places lens sorts them (from 0) — what a tint is dealt by,
	 * so a category keeps its hue when a filter hides the others. Null with
	 * no category.
	 */
	tint: number | null
	/** What else the book links to it — a cast member who keeps it, a faction — each said from the place. */
	linked: PlaceLinkV1[]
}

/**
 * 🚧 Something the book links to a place that is not another place: a
 * cast member, or other lore. A link to a character's own lore is never
 * here.
 * @experimental
 * @ruling W4
 */
export interface PlaceLinkV1 {
	kind: 'cast' | 'entry'
	/** The cast member's id, or the entry's. */
	id: number
	name: string
	/** The link said from the place, as the lorebook says it ("Verity keeps the Crypt."). */
	says: string
}

/**
 * 🚧 One **way** between two places: a relationship with a place at
 * each end, standing, and not secret.
 * @experimental
 * @ruling W4
 */
export interface WayV1 {
	/** The relationship's id. */
	id: number
	/** The place it runs from — its `from` end. */
	from: number
	/** The place it runs to. */
	to: number
	/** It reads from both ends ("Both ways") — an arrowhead at each. */
	bothWays: boolean
	/** Its own name ("the rusted iron door"); null when it has none. */
	name: string | null
	/** Said from `from`: "The rusted iron door leads north to the Drowned Hall." */
	fromSays: string
	/** Said from `to`; null for a one-way way, which is no way out of there. */
	toSays: string | null
}

/**
 * 🚧 Where a session stands in its story: its **story clock** as read —
 * its own, or its line's present when it follows the line. Dates are the
 * SDK's `StoryTime`, spelled through the book's calendar by the host.
 * @experimental
 * @ruling W3
 */
export interface StoryClockV1 {
	/** The session's present: its own clock, else its line's present; null when neither exists. */
	present: StoryTime | null
	/** `present` spelled through the book's calendar; empty when there is none. */
	label: string
	/** The session holds a clock of its own; false — it follows its line's present. */
	own: boolean
	/** The line's present (the line's clock, else its newest history entry); null when it has none. */
	linePresent: StoryTime | null
	/** `linePresent`, spelled; empty when there is none. */
	linePresentLabel: string
	/** The session's own clock stands before its line's present: it reads an earlier moment. */
	behind: boolean
}

/**
 * 🚧 One history entry as Chronicle reads it. A history entry is dated,
 * not named: its date is its heading.
 * @experimental
 * @ruling W3
 */
export interface HistoryEntryV1 {
	id: number
	/** Its date: a year, and a month and a day where it has them. */
	date: StoryTime
	/** The date spelled through the book's calendar. */
	label: string
	/** The first line of what it says; empty when it says nothing yet. */
	firstLine: string
	/** How many of this session's scenes are filed under it. */
	sceneCount: number
}

/**
 * 🚧 One of the session's scenes under a history entry.
 * @experimental
 * @ruling W3
 */
export interface HistorySceneV1 {
	id: number
	/** Its name; null when it has none yet. */
	name: string | null
	/** How many of the session's lines it holds. */
	lineCount: number
	/**
	 * Its place among the session's scenes, oldest first (from 0) — what a
	 * scene's colour is chosen by.
	 */
	order: number
	/** Its summary is written. */
	summarized: boolean
	/** It is in the lorebook's relationship graph. */
	graphed: boolean
	/**
	 * 🚧 Where its summary stands — `none` · `running` · `review` (the run
	 * finished and waits for the person's Apply, §15 G8) · `done` ·
	 * `failed` — read off the scene row (a scene summarized before the
	 * status existed reads `done`). Absent reads as `summarized`'s answer.
	 */
	summaryStatus?: 'none' | 'running' | 'review' | 'done' | 'failed'
}

/**
 * 🚧 The session's **open scene**, as Chronicle's *Open scene* card reads it
 * (`HistoryEntriesV1.openScene`): the scene opened at a line and not yet
 * closed, on the session's main lane. Its cast is **proposed**, no model:
 * who spoke, who the session's roster names, who the lines name — each with
 * the evidence that put them there.
 * @experimental
 * @ruling PROPOSAL-live-scenes §7 (2026-10-13)
 */
export interface HistoryOpenSceneV1 {
	id: number
	/** Its name; null when it has none yet. */
	name: string | null
	/** The channel lane it runs on (`main`). */
	channel: string
	/** The story clock as it opened, spelled through the book's calendar; empty when it opened with none. */
	since: string
	/** How many of the session's lines it holds so far. */
	lineCount: number
	/** Its place among the session's scenes (from 0) — its colour. */
	order: number
	/** The proposed cast, each with its evidence ("spoke 4 times", "named twice"). */
	cast: Array<{ name: string; evidence: string }>
}

/**
 * 🚧 What `history-entries` answers. With no lorebook (`lorebookId`
 * null) everything else is empty. A viewer who is not the session's owner
 * reads the clock alone: the history entries and scenes are the book
 * owner's (`ownerOnly`), and only the owner moves the clock.
 * @experimental
 * @ruling W3
 */
export interface HistoryEntriesV1 {
	lorebookId: number | null
	/** The viewer is not the session's owner: `current`, `scenes` and `earlier` are empty, and the clock is read-only. */
	ownerOnly: boolean
	clock: StoryClockV1
	/** The newest history entry the session reads on its line, up to its own clock; null when none. */
	current: HistoryEntryV1 | null
	/** This session's scenes filed under `current`, oldest first. */
	scenes: HistorySceneV1[]
	/** The entries before `current`, newest first — at most `earlierLimit` of them. */
	earlier: HistoryEntryV1[]
	/** How many entries come before `current` in all. */
	earlierTotal: number
	/** This session's scenes on its line not yet in the lorebook's relationship graph — what Extend graph reads. */
	ungraphedScenes: number
	/** The session's genre captures scenes: **Summarize scene** is offered. */
	opensScenes: boolean
	/** 🚧 The session's open scene on its main lane; null when none is open. Absent on a host that predates it. */
	openScene?: HistoryOpenSceneV1 | null
	/**
	 * 🚧 When this session's scenes are summarized (its scene settings):
	 * `onClose`, `onRequest` or `never` — under `never`, no *Summarize* is
	 * offered. Absent reads as `onRequest`.
	 */
	summaryMode?: SceneSummaryMode
	/** 🚧 This session's closed scenes whose summary has not run, or failed — **Summarize all (N)**. */
	unsummarizedScenes?: number
}

/**
 * 🚧 The session's author's note, as stored (2026-10-02, AN1) — the value of
 * a genre's `authorsNote` field (`AUTHORS_NOTE_FIELD` in core's catalogue).
 * Not the post-history reminder, which is the pipeline's and the card's.
 * @experimental
 */
export interface AuthorsNoteValueV1 {
	text: string
	/** Messages before the reply it is placed; 0 is right before the reply. */
	depth: number
	/** Added to every `interval`-th reply; 1 is every reply. */
	interval: number
	role: 'system' | 'user' | 'assistant'
}

/**
 * 🚧 What the `authors-note` request answers (2026-10-02, AN1).
 * @experimental
 */
export interface AuthorsNoteV1 {
	/** The session's genre declares an author's note at all. False: nothing else here means anything. */
	offered: boolean
	/** The viewer may change it (the session's owner). */
	canEdit: boolean
	note: AuthorsNoteValueV1
	/**
	 * What the newest reply's prompt did with the note — Assemble's own
	 * decision, off that run's receipt. Null when no reply has been written
	 * with a note in scope yet.
	 */
	lastReply: {
		included: boolean
		/** `included`, `empty` (no text), or `interval` (this reply was not one of every `interval`). */
		reason: 'included' | 'empty' | 'interval'
		depth: number
		/** Where it landed among the messages the prompt carried, oldest first. */
		targetIndex: number
	} | null
}
/** @experimental */
export type WidgetRequestKind = keyof WidgetRequests

/**
 * 🚧 One entry of the session's lorebook, with what this session's rankings
 * made of it — a row of `session-entries`.
 * @experimental
 */
export interface SessionEntryV1 {
	id: number
	/** The entry type's id. */
	typeId: string
	title: string
	keys: string[]
	/** Marked **Off**: retrieval may not use it. */
	off: boolean
	/** **Pinned**: in every prompt, whatever the ranking says. */
	pinned: boolean
	/** How often this session's rankings judged it, and how often they included it. */
	timesJudged: number
	timesIncluded: number
	/** When a ranking last judged it (an ISO string on the wire); null when none has. */
	lastJudgedAt: string | null
	/** Whether that last judgement included it, why, and at what rank. */
	lastIncluded: boolean | null
	lastReason: string | null
	lastRank: number | null
}

/**
 * 🚧 One line of **While you were away** (PLAN-layering A7, R23): a
 * routine's run, or a firing of it that did not run, as the host's routine
 * log keeps it. `wrote` is what the run left (its artifacts); `reason` says
 * why one was skipped, paused, failed or stopped, in a sentence.
 * @experimental
 */
export interface RoutineLogEntryV1 {
	runId: string
	/** The registration it fired under. */
	registrationKey: string
	/** The pipeline it ran. */
	pipeline: string
	/** What the routine is called — its pipeline's name. */
	name: string
	kind: 'ran' | 'skipped' | 'paused' | 'failed' | 'stopped'
	reason?: string
	/** Epoch ms. */
	startedAt: number
	endedAt: number
	wrote: Array<{ kind: string; entityId: number; action: string }>
	/** The session's owner pressed Run now. */
	runNow?: boolean
}

/**
 * 🚧 What `routine-log` answers: the session's recent routine runs, newest
 * first, and when a person last played (epoch ms; null when nobody has).
 * @experimental
 */
export interface RoutineLogV1 {
	lastInteractionAt: number | null
	entries: RoutineLogEntryV1[]
}

/**
 * 🚧 Who a host answers a request kind for — its **askers**:
 *
 *  - `'any'` — any widget's, core's or a plugin's. The host still applies
 *    its own rules (an admin's view, an image off the app's origin).
 *  - `'core'` — core's own widgets only: a verb that acts on the session's
 *    structure (a turn, a summary, a proposal, the lore), which a plugin's
 *    widget does through its own actions instead.
 *  - `{ scope }` — core's, or a plugin's widget GRANTED that scope (reviewed
 *    as `widget:<scope>`, carried as the bare scope): a request that READS
 *    scoped data, so the scope that would have pushed it is what lets a
 *    widget page it.
 *  - `{ scope, write: true }` — core's, or a plugin's widget holding the
 *    **write grant** on that scope ({@link WidgetWriteGrant}): a request that
 *    CHANGES what the scope covers, as the viewer. A write grant is a
 *    permission apart from the read — `session:state:write` beside
 *    `session:state` — so an admin who granted the read is asked once more.
 *    `scope: 'channel'` is the channel the request writes to, which must be
 *    one of the widget's declared `channels`, written `channel:<slug>:write`.
 *    A host holds a plugin's write to a person's press behind it as well.
 * @experimental
 * @ruling F9
 */
export type WidgetRequestAskers =
	| 'any'
	| 'core'
	| { scope: WidgetSectionScope; write?: never }
	| { scope: WidgetSectionScope | 'channel'; write: true }

/**
 * 🚧 A **write grant** as a widget's grants carry it — BARE, like the read
 * (`session:state:write`, `channel:main:write`), and reviewed as the
 * permission `widget:<it>` (`widget:session:state:write`). A widget asks for
 * one in its declaration's `scopes`. Not a scope of its own: it pushes no
 * section, and holding it never grants the read.
 * @experimental
 */
export type WidgetWriteGrant = `${WidgetSectionScope}:write` | `channel:${string}:write`

/**
 * The askers of every request kind — the marking a host enforces
 * ({@link widgetRequestRefusal}). Typed off {@link WidgetRequests}, so a kind
 * cannot be added without saying who may ask it.
 * @experimental
 */
export const WIDGET_REQUEST_ASKERS: { readonly [K in WidgetRequestKind]: WidgetRequestAskers } = Object.freeze({
	messages: 'any',
	'open-character': 'any',
	'view-avatar': 'any',
	'view-image': 'any',
	'open-lore': 'any',
	'prompt-details': 'any',
	'inspect-run': 'any',
	'pick-turn': 'any',
	'change-sprite': 'any',
	'actions-seen': 'core',
	summarize: 'core',
	// 🚧 Live scenes (PROPOSAL-live-scenes §14 C): every scene boundary is a
	// write into the session's lorebook, as the viewer — core's only.
	'scene-open': 'core',
	'scene-close': 'core',
	'scene-move': 'core',
	'scene-rename': 'core',
	'scene-remove': 'core',
	// 🚧 A dice tray, a vote, a card draw: the result goes in as the viewer's line,
	// on a channel the widget declares and holds the write grant on.
	send: Object.freeze({ scope: 'channel' as const, write: true as const }),
	'attach-files': 'core',
	'remove-tray-item': 'core',
	'remove-attachment': 'core',
	// 🚧 The gentler send: prefill the composer, on a channel the widget may write.
	draft: Object.freeze({ scope: 'channel' as const, write: true as const }),
	'switch-persona': 'core',
	'add-persona': 'core',
	// 🚧 A guest's seat, opened by name (Lair rewrite D5) — core's composer only.
	'take-seat': 'core',
	'fire-turn': 'core',
	// 🚧 Back · Forward (RF fix 5): the session's history — core's conversation only.
	'rewind-turn': 'core',
	'forward-turn': 'core',
	'decide-proposal': 'core',
	// 🚧 Older lines of the page's log, per channel (★7) — core's conversation only.
	'load-older': 'core',
	// 🚧 A stat panel that edits: the write beside the `session:state` read.
	'set-attribute-value': Object.freeze({ scope: 'session:state' as const, write: true as const }),
	// 🚧 Give to… (★4): a write on two sheets, on the same grant.
	'give-piece': Object.freeze({ scope: 'session:state' as const, write: true as const }),
	// 🚧 A tie side shown or hidden (ties on the graph, T1): the same write grant.
	'set-tie-shown': Object.freeze({ scope: 'session:state' as const, write: true as const }),
	// 🚧 An attribute carried or not (RF fix 8): the same write grant.
	'set-attribute-carry': Object.freeze({ scope: 'session:state' as const, write: true as const }),
	'set-sprite-set': 'core',
	'clear-scene-image': 'core',
	// 🚧 Scene Portraits (W6): a member's gallery is part of the cast it was granted.
	'character-images': Object.freeze({ scope: 'characters' as const }),
	'session-entries': Object.freeze({ scope: 'lore' as const }),
	'set-entry-marks': 'core',
	'authors-note': 'core',
	'set-authors-note': 'core',
	// 🚧 Chronicle (W3): reading the session's history is reading its lore;
	// moving its clock, starting an entry and the graph review act as the viewer.
	'history-entries': Object.freeze({ scope: 'lore' as const }),
	'set-story-clock': 'core',
	'start-history-entry': 'core',
	'extend-graph': 'core',
	'summarize-scenes': 'core',
	'decide-scene-cue': 'core',
	// 🚧 Places (W4): reading the session's places is reading its lore.
	'session-places': Object.freeze({ scope: 'lore' as const }),
	// 🚧 Channel lanes (2026-10-12): what the log shows of a channel; held to a plugin widget's declared channels by the page.
	'channel-lanes': 'any',
	// 🚧 Stats (F2): a stat's trail is the session's state, read.
	'stat-trail': Object.freeze({ scope: 'session:state' as const }),
	// 🚧 Scene Portraits (F2): writes the asking widget's own settings — core's only.
	'set-chosen-image': 'core',
	// 🚧 Backdrop (2026-10-12): writes session state — core's only.
	'set-backdrop': 'core',
	// 🚧 Stats (2026-10-17): a seat's portrait is session state — core's only.
	'set-owner-face': 'core',
	// 🚧 Backdrop (D3, 2026-10-12): the session's generated pictures, for its chooser — core's only.
	'session-images': 'core',
	// 🚧 While you were away (A7, R23; lane 7): what the session's routines did — core's only for now.
	'routine-log': 'core',
})

/** Every request kind — what a host checks an incoming `request` against. @experimental */
export const WIDGET_REQUEST_KINDS: readonly WidgetRequestKind[] = Object.freeze(
	Object.keys(WIDGET_REQUEST_ASKERS) as WidgetRequestKind[],
)

/**
 * Why a host must decline this request from this widget, as a sentence — or
 * null when {@link WIDGET_REQUEST_ASKERS} lets it ask. `owner` is `'core'` or
 * the widget's plugin id; `grants` the scopes that widget was granted, as
 * BARE scopes (`'lore'`, `'session:state'`, a write grant
 * `'session:state:write'`) — never the permission keys they are reviewed as
 * (`'widget:lore'`), which match nothing here. Core's widgets hold every
 * scope. A request is still not a grant: null means the host MAY answer,
 * never that it must. Grants that are not a list — a stored string, whose
 * `includes` would match a substring — grant nothing.
 *
 * A channel write (`send`, `draft`) is judged against `channels`, the
 * widget's declared channels, and `params.channel` when the request names
 * one: a channel the widget did not declare is refused whatever it holds.
 * A request naming none passes when the widget may write one of its
 * channels, and the HOST holds it to one of those (the composer's channel,
 * for a draft). A host also holds a plugin's write to a person's press.
 * @experimental
 */
export function widgetRequestRefusal(
	kind: string,
	from: { owner: string; grants?: readonly string[]; channels?: readonly string[] },
	params?: unknown,
): string | null {
	if (!Object.hasOwn(WIDGET_REQUEST_ASKERS, kind)) return `'${kind}' is not something a host answers`
	const askers = WIDGET_REQUEST_ASKERS[kind as WidgetRequestKind]
	if (askers === 'any' || from.owner === 'core') return null
	if (askers === 'core') return `only core's own widgets ask '${kind}'`
	const holds = (grant: string) => Array.isArray(from.grants) && from.grants.includes(grant)
	if (askers.write !== true)
		return holds(askers.scope)
			? null
			: `'${kind}' reads what the '${askers.scope}' scope covers, and this widget was not granted it`
	if (askers.scope !== 'channel') {
		const grant = `${askers.scope}:write`
		return holds(grant)
			? null
			: `'${kind}' changes what the '${askers.scope}' scope covers, and this widget was not granted the write grant '${grant}'`
	}
	const declared = Array.isArray(from.channels) ? from.channels.filter((c) => typeof c === 'string') : []
	const named = (params as { channel?: unknown } | null | undefined)?.channel
	if (named !== undefined) {
		if (typeof named !== 'string' || !declared.includes(named))
			return `'${kind}' writes to '${String(named)}', which is not one of this widget's channels`
		return holds(`channel:${named}:write`)
			? null
			: `'${kind}' writes to the '${named}' channel, and this widget was not granted the write grant 'channel:${named}:write'`
	}
	return declared.some((c) => holds(`channel:${c}:write`))
		? null
		: `'${kind}' writes to a channel, and this widget was not granted the write grant 'channel:<slug>:write' on any channel it declares`
}

/** What rides beside an invocation: the subject message, entered values. @experimental */
export interface WidgetInvokeArgs {
	messageId?: number
	payload?: WidgetPayload
	/**
	 * The form the press answers — a block's id within `messageId` —
	 * so the server reads the block off the row and holds the press
	 * to its addressee. Absent on every other press.
	 *
	 * The `invoke` spelling of {@link WidgetVerbs.action}'s fifth argument: a
	 * widget drawing a message's form presses it by the declaration's identity
	 * like any other action, and the block it answers rides here rather than
	 * forcing that one press back onto the deprecated verb.
	 * @ruling R-15 *Forms*
	 */
	blockId?: string
	/**
	 * The text the press already supplies: the composer's
	 * **slash argument**, `/nudge go north` → `go north`. The host hands it
	 * to an action that collects text, as if the collect modal had — and
	 * refuses the press, firing nothing, when the action collects none. An
	 * action that also collects recipients still opens its modal, prefilled.
	 * @ruling lair pass S2
	 */
	text?: string
}

/**
 * Something the host told this widget about.
 *
 * A discriminated union on `kind`. The last member is the ESCAPE HATCH and it
 * is namespaced on purpose: a bare `{ kind: string }` widened the union back to
 * "any string", so an author's typo compiled and every other member stopped
 * narrowing. A kind core does not ship is spelled `custom:<whatever>`, which
 * can never collide with a member added here later.
 * @experimental
 * @ruling R56, R81, W3 (2026-10-11)
 */
export type WidgetEvent =
	| {
			kind: 'message:created'
			/** The channel as stored — canonical, so lane 1 is the bare slug. */
			channel: string
			/** …taken apart, so a widget need not parse it (ruling 2026-09-09). */
			slug: string
			lane: number
			messageId: number
	  }
	/**
	 * A row this widget can see changed in a way that is not an arriving
	 * delta — an edit, a hide, a swipe, a re-stamped metadata bag.
	 *
	 * `channel` is the row's, canonically, so the host can narrow this to the
	 * widgets that declared it; absent from a host that does not know which
	 * channel the row was on, which reaches every widget as before.
	 */
	| { kind: 'message:updated'; messageId: number; channel?: string }
	/** A row this widget can see is gone. `channel` as `message:updated`. */
	| { kind: 'message:deleted'; messageId: number; channel?: string }
	/**
	 * Text was appended to a row being generated — `delta` is the appended
	 * text alone, never the row's whole content. Emitted per arrival, so a
	 * listener doing real work per delta is doing it once per chunk.
	 * `channel` as `message:updated`.
	 */
	| { kind: 'message:delta'; messageId: number; delta: string; channel?: string }
	/**
	 * A reply started filling. Carries the row when the host knows which one
	 * (it usually does — the row exists before its first token).
	 *
	 * Names no channel on purpose: a generation is session news, not channel
	 * news, and reaches every widget.
	 */
	| { kind: 'generation:start'; messageId?: number }
	/**
	 * …and stopped. `aborted` is true for a reply a person stopped, leaving
	 * the partial text — the `stopped` outcome, not an error.
	 */
	| { kind: 'generation:end'; messageId?: number; aborted: boolean }
	| { kind: 'channel:activated'; channel: string; slug: string; lane: number }
	/**
	 * 🚧 Provisional — DECLARED, NOT PRODUCED (2026-09-17). No host ships a
	 * single "the selected message"; the session page's only selection is the
	 * summarization mode's SET of rows, which this member cannot describe and
	 * must not be bent into. A widget may subscribe, and will hear nothing
	 * until a host has one selected message to announce; the shape may change
	 * when one does. Do not read absence as "nothing is selected".
	 */
	| { kind: 'selection:changed'; messageId: number | null }
	/**
	 * This widget's placement changed — it moved, resized, changed tier, or was
	 * collapsed/drawered. The new `layout.v1` rides along so a listener needs no
	 * second read; a native consumer can equally read `layout.v1` off its own
	 * context, which is already reactive. It exists for the frame lane, where a
	 * push is the only reactivity there is, and is emitted on both so the two
	 * stay field-for-field identical.
	 */
	| { kind: 'layout:changed'; layout: LayoutV1 }
	/**
	 * A package's event was recorded in this session — everything in the
	 * session hears it, so every widget does. `event` is its id (compare with
	 * the declaration: `e.event === guessed.id`); `payload` is what the
	 * recording wrote; `at` the instant it was recorded. Names no channel: an
	 * event is session news. Core's own events reach widgets as the members
	 * above, never as this one.
	 */
	| { kind: 'event:recorded'; event: string; payload: unknown; at: number }
	/**
	 * 🚧 A turn in this session ranked its lore: what the rankings made
	 * of the session's lore entries was written — the rollup `session-entries`
	 * reads moved — so a lore reader asks again now, and only now. Carries
	 * nothing: the rows are the request's. Sent after the write, never before
	 * it. Heard by core's widgets and by a plugin's widget granted `lore`
	 * ({@link WIDGET_EVENT_SCOPES}); names no channel.
	 */
	| { kind: 'lore:ranked' }
	/**
	 * 🚧 A lore entry of the session's book changed — its marks (pinned, off)
	 * or anything else a save wrote — by this viewer, in any of their tabs,
	 * widgets or the lorebook's editors. A lore reader showing `entryId` asks
	 * again, so a mark set in one place is never stale in another; one showing
	 * only pinned or off entries asks again whatever the id, since the entry
	 * may have joined. Carries the id only — not how the session reads the
	 * entry now: the row is the request's. Sent after the write. Scoped like
	 * `lore:ranked` ({@link WIDGET_EVENT_SCOPES}); names no channel.
	 */
	| { kind: 'lore:marked'; entryId: number }
	/**
	 * 🚧 The session's stored **genre fields** changed (history window lane,
	 * 2026-10-03) — Edit Session › Settings saved one, or a widget wrote one
	 * (the Author's note's `set-authors-note`), in any of the owner's tabs. A
	 * widget showing a genre field's value asks again; carries nothing — the
	 * value is the request's. Sent after the write, to the session's owner's
	 * page only (the one person who may change them); names no channel.
	 */
	| { kind: 'genreFields:changed' }
	/**
	 * 🚧 The session's story moved (Chronicle): its story
	 * clock or its line (a pipeline step, the session's settings, a widget),
	 * a history entry of its book was added or changed, or one of its scenes
	 * was captured, changed or removed. A widget showing where the session
	 * stands asks again (`history-entries`); carries nothing. Scoped like
	 * `lore:ranked` ({@link WIDGET_EVENT_SCOPES}); names no channel.
	 */
	| { kind: 'story:moved' }
	/** Anything core does not ship. Namespaced so it cannot shadow a member. */
	| { kind: `custom:${string}`; payload?: WidgetPayload }

/** Every event kind a widget may subscribe to, the custom namespace included. @experimental */
export type WidgetEventKind = WidgetEvent['kind']

/**
 * 🚧 The scope a widget must hold to HEAR an event kind — a kind not
 * listed is heard by every widget its channel reaches. An event about scoped
 * data is scoped data: a widget that may not read the lore is not told when
 * it moved. Read by {@link widgetEventHeard}, which every host delivery of
 * widget events asks.
 * @experimental
 * @ruling R81
 */
export const WIDGET_EVENT_SCOPES: { readonly [K in WidgetEventKind]?: WidgetSectionScope } = Object.freeze({
	'lore:ranked': 'lore',
	'lore:marked': 'lore',
	'story:moved': 'lore',
})

/**
 * Is this widget told of an event of this kind? Core's widgets hold every
 * scope; a plugin's hears a scoped kind only when granted its scope — as
 * BARE scopes (`'lore'`), never the permission keys (`'widget:lore'`); grants
 * that are not a list grant nothing (the rule {@link widgetRequestRefusal}
 * holds a request to).
 * @experimental
 */
export function widgetEventHeard(kind: string, to: { owner: string; grants?: readonly string[] }): boolean {
	const scope = Object.hasOwn(WIDGET_EVENT_SCOPES, kind) ? WIDGET_EVENT_SCOPES[kind as WidgetEventKind] : undefined
	if (!scope || to.owner === 'core') return true
	return Array.isArray(to.grants) && to.grants.includes(scope)
}

/** What a widget can DO — the transport half of the envelope. @experimental */
export interface WidgetVerbs {
	/**
	 * ⏳ Fire an action by its bare **key**.
	 *
	 * @deprecated Use {@link WidgetVerbs.invoke}. A press names a DECLARATION
	 * by its identity: a bare key is resolved by the server to the genre's
	 * sole declarer of it and refused — naming the identities — when several
	 * specs declare it. Accepted for one release; `invoke`
	 * resolves the identity for you.
	 *
	 * `action` is the identity of the declaration being fired
	 * (`<spec slug>#<key>`) when one is in hand — `invoke` always supplies it —
	 * so the server checks THAT action's audience and enablement and runs THAT
	 * spec.
	 * @ruling plans/31 V2
	 */
	action(
		fn: string,
		messageId?: number,
		payload?: WidgetPayload,
		action?: string,
		/**
		 * The form the press answers — a block's id within `messageId` —
		 * so the server reads the block off the row and holds the
		 * press to its addressee. Absent on every other press.
		 * @ruling R-15 *Forms*
		 */
		blockId?: string,
	): void
	/**
	 * Fire an action from `actions.v1` by its **identity** (`<spec slug>#<key>`)
	 * or, when only one action carries it, its bare **key**:
	 * the host resolves it to the declaration and routes it
	 * — one of core's verbs to the host's real handler (an `extend` is an
	 * extend, never a function fire), a contributed one to the audited fire
	 * with its identity. A key no venue lists, or a bare key several actions
	 * share, throws: a widget cannot fire something the session does not offer —
	 * or something ambiguous — and believe it did.
	 * @ruling R-15 `invoke(id, args)`
	 */
	invoke(key: string, args?: WidgetInvokeArgs): void
	/** Ask the host for something ({@link WidgetRequests}); rejects when it declines. */
	request<K extends WidgetRequestKind>(kind: K, params: WidgetRequests[K]['params']): Promise<WidgetRequests[K]['result']>
	/**
	 * 🚧 The viewer's translation of an English UI string — synchronous,
	 * the source itself until a translation arrives, then re-rendered. For
	 * a widget's OWN literals; declared text (a label, a title) is a locale
	 * map read with `i18nText(text, locale.v1)`.
	 * @ruling C0b
	 */
	t(source: string): string
	/**
	 * ⏳ RETIRED 2026-10-10.
	 * REMOVE in 0.7.0. A host-rendered menu at a point: no host ever drew
	 * one, and every host answers `null` (dismissed) at once. Kept, still
	 * answering `null`, so a widget that calls it does not break before
	 * 0.7.0. No frame message carries it.
	 * @deprecated Place an `sp-menu` (or an `sp-popover`) in your component;
	 * the page draws it with its own controls.
	 * @ruling PLAN-widget-system-consolidation C4
	 */
	menu(spec: MenuSpec): Promise<MenuResult | null>
	/**
	 * Subscribe to a host event; returns an unsubscribe.
	 *
	 * `'*'` receives every event, which is how a widget forwards the lot —
	 * into its own store, a log, a bridge — without enumerating a union it
	 * would then have to keep in step. It is a SUBSCRIPTION, never a kind: no
	 * event is ever delivered carrying `kind: '*'`.
	 */
	on(kind: WidgetEventKind | '*', cb: (e: WidgetEvent) => void): () => void
}

/**
 * The version of the widget contract — the verbs above and the message kinds
 * that carry them.
 *
 * ONE number for both deliveries: native IS frame minus the iframe (ruled
 * 2026-09-08), so a second clock for the in-document lane would be a second
 * contract by accident. `FRAME_PROTOCOL` in `surfaces.ts` is this constant
 * under the name the frame wire spells it, and the frame's `init` carries it.
 * @experimental
 */
export const WIDGET_PROTOCOL = 2 as const

/** A version of the widget contract a host and a frame can both speak. @experimental */
export type WidgetProtocolVersion = 1 | 2
