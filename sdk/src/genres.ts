/**
 * Session genres — first-class declared objects with their own ids.
 *
 * A genre is what kind of session something is: `core:genre/chat`. It owns
 * its id; the create pipeline is its **required member**, not its identity.
 * The genre object declares everything a surface asks about
 * for the life of a session — display name, family, standing shape — plus
 * its **event surface**: which session events exist for this genre and which
 * are required. Presets validate against that surface; dispatch keys on
 * (genre, event).
 *
 * Pipelines reference the genre object directly (`input(…, { genre: chat,
 * event: events.messageRespond })`) — a typed reference the compiler checks,
 * never a string retyped per spec. In the document it serializes to the id.
 * @ruling 24 §3, 23 §7
 */
import type { WidgetDecl } from './layout.js'
import { widgetRef, type GenreLayoutDecl } from './widgetDecls.js'
import { drawnWidgetIds, layoutWidgetIds, resolveWidgetAlias } from './sessionLayout.js'
import {
	assertChannelDecls,
	assertMessageVerbFloors,
	assertSessionWrites,
	assertTurnControls,
	channelDecls,
	lorebookReadOptional,
	lorebookShapeFindings,
	widgetDeclsFindings,
	type I18n,
	type SessionShape,
	type SlotDecl,
} from './descriptors.js'
import { assertSceneSettings, declaredScenePlace } from './sceneSettings.js'
import { i18nFindings, localeMapOf, type LocaleMap } from './i18n.js'
import { eventById, notADeclaredEvent } from './events.js'
import { settingsSchemaFindings } from './settings.js'
import type { RegistrationDecl } from './registrations.js'
import { exposureFindings, type SettingValue } from './exposure.js'
import { genreUsesFindings, type GenreUses } from './fit.js'
import { _withdrawHostStateOf, declareHostState, HOST_PLACE_KEY } from './hostState.js'
import type { SlotAppliesTo } from './attributes.js'
import { refuseUnlessIdentical } from './hash.js'
import { getRuleset, handbookFindings, isRulesetTemplateId, RIGOURS, type HandbookPage, type Rigour } from './rulesets.js'
import { finding, RULESET_ID_PATTERN, RulesetError } from './repertoires.js'
import { isActionIdentity, parseSpecId, assertSpecId } from './identity.js'
import {
	enabledWhenFindings,
	normalizeEnabledWhen,
	type EnabledWhen,
	type EnabledWhenDecl,
} from './predicates.js'

/** `owner:genre/name` — lowercase, digits, hyphens, dots in the owner. */
const GENRE_ID = /^[a-z0-9]+(?:[.-][a-z0-9]+)*:genre\/[a-z0-9]+(?:-[a-z0-9]+)*$/

/** @experimental */
export function assertGenreId(id: string): void {
	if (!GENRE_ID.test(id))
		throw new Error(
			`'${id}' is not a valid genre id. Use 'owner:genre/name' — 'core:genre/chat', ` +
				`'acme.rp:genre/mystery'. The id is an address sessions hold for their ` +
				`lifetime; the display name lives in the declaration.`,
		)
}

/**
 * The core session events, as **event ids** — `core:event/<name>@1`.
 *
 * Constants so the core vocabulary is typo-proof. Since 2026-09-16
 * these ARE `CORE_EVENTS` entries (`events.ts`): one
 * registry, and a genre's event surface, a preset's `bindings` map and a spec's
 * inlet lock are all keyed by these ids. The bare names (`session-created`)
 * were the keys until the fold; a host migrates its stored keys once.
 * @public
 * @ruling 24 §5, R-4 (ruled 2026-09-15)
 */
export const sessionEvents = Object.freeze({
	/** The create slot — required; exactly one pipeline per genre declares it. */
	sessionCreated: 'core:event/session-created@1',
	/** The primary turn. A swipe is this pipeline re-run, not a new event. */
	messageRespond: 'core:event/message-respond@1',
	/**
	 * 🚧 A person sent a message; the bound pipeline saves it (owner ruling
	 * 2026-10-15). Every genre has it, stated in its `events` or not
	 * (`genreHasEvent`) — so no genre declaration moved; `preset()` binds
	 * `core:spec/save-message` (`SAVE_MESSAGE_SPEC_ID`) here unless the preset
	 * binds a spec of its own.
	 */
	messageOffered: 'core:event/message-offered@1',
	/**
	 * 🚧 A person asked for a message to be deleted; the pipeline registered
	 * here deletes it (owner ruling 2026-10-23). Core registers none, so
	 * Delete is offered nowhere until a genre or an administrator does.
	 */
	messageDeletionAsked: 'core:event/message-deletion-asked@1',
	/**
	 * Arbitrary buttons/triggers — the existing functions surface.
	 * @ruling 19 §3
	 */
	sessionAction: 'core:event/session-action@1',
	/** A character or persona joined; payload carries the kind. */
	memberAdded: 'core:event/member-added@1',
	/** A character or persona left; payload carries the kind. */
	memberRemoved: 'core:event/member-removed@1',
	/**
	 * A form in a message was addressed to a participant the AI portrays.
	 * Optional in every genre's surface: a genre that
	 * binds nothing leaves such a form waiting, as it would for a person.
	 * @ruling R-15 *Forms*, U5d
	 */
	formAddressed: 'core:event/form-addressed@1',
	// ── Turn order as event-driven state (PLAN-turn-order §4.1, 2026-09-21) ──
	// The events a genre may bind its turn-order spec to. A genre that
	// binds the spec lists every event it binds it to, all optional (`{}`).
	/** A row that is not generating landed — a send, a greeting, a finished or stopped reply. */
	messageCompleted: 'core:event/message-completed@1',
	/** A person rewrote a settled message. */
	messageEdited: 'core:event/message-edited@1',
	/** A message was deleted. */
	messageDeleted: 'core:event/message-deleted@1',
	/** A message was hidden from the prompt, or shown again. */
	messageHidden: 'core:event/message-hidden@1',
	/**
	 * A line's shown sprite changed — a picker's choice or a person's.
	 * @ruling DESIGN-sprites
	 */
	spriteShown: 'core:event/sprite-shown@1',
	/** A seated participant's row changed — active, position, visibility or portrayal. */
	castChanged: 'core:event/cast-changed@1',
	/** `sessions:update` landed — name, scenario, lorebook, genre fields, preset, channels, tags. */
	sessionUpdated: 'core:event/session-updated@1',
	/** A session was branched at a message into a new session; recorded on the branch. */
	sessionBranched: 'core:event/session-branched@1',
	/**
	 * A pipeline's annex entry changed — "my state changed". Caused by
	 * `core:outlet/set-session-annex@1`; the payload names the owner.
	 */
	annexChanged: 'core:event/annex-changed@1',
	/**
	 * 🚧 The session's backdrop was set or cleared — by
	 * `core:outlet/set-backdrop@1` or by a person.
	 * @ruling DESIGN-image-generation §6.4
	 */
	backdropSet: 'core:event/backdrop-set@1',
	/**
	 * the stored turn order was written. **For typing only**: core-internal,
	 * read by the auto-advance listener and the `sessions:turnOrder` push;
	 * `genre()` refuses it in `events`, so no preset can bind it.
	 */
	turnOrderChanged: 'core:event/turn-order-changed@1',
	// ── 🚧 The session events the host raises (PLAN-layering D7, 2026-10-20; D11) ──
	/** 🚧 A turn ended — a speaker's line landed and what it set off settled. */
	turnEnded: 'core:event/turn-ended@1',
	/** 🚧 A round ended — everyone the turn order seats has taken a turn. */
	roundEnded: 'core:event/round-ended@1',
	/** 🚧 A live scene was opened. */
	sceneOpened: 'core:event/scene-opened@1',
	/** 🚧 A live scene was closed. */
	sceneClosed: 'core:event/scene-closed@1',
	/** 🚧 The session's story clock moved. */
	storyClockMoved: 'core:event/story-clock-moved@1',
	/** 🚧 The session's owner archived it (pr-6, R-k). */
	sessionArchived: 'core:event/session-archived@1',
	/** 🚧 A scene's summary was saved into the lorebook (pr-6, R-l). */
	sceneSummaryApplied: 'core:event/scene-summary-applied@1',
	/** 🚧 The session's settle line moved (pr-6, pass 4). */
	historySettled: 'core:event/history-settled@1',
} as const)

/** @experimental */
export type SessionEvent = (typeof sessionEvents)[keyof typeof sessionEvents]

/**
 * 🚧 Does this genre's event surface have `event`? Its `events`, plus
 * `message-offered`, which every genre has whether it lists it or not (owner
 * ruling 2026-10-15: a person's message is always saved through a pipeline).
 * Implied rather than written into each declaration, so no genre's
 * declaration — and no create document carrying one — moved.
 * @experimental
 */
export const genreHasEvent = (genre: Pick<GenreDecl, 'events'>, event: string): boolean =>
	event in (genre.events ?? {}) || event === sessionEvents.messageOffered

/**
 * Why no genre may list, and no spec may lock, `turn-order-changed`:
 * the turn-order write's own event is core-internal.
 * One sentence for `genre()`, the builder's `.inlet()` and the package pass.
 * @experimental
 * @ruling PLAN-turn-order §4.1
 */
export const TURN_ORDER_CHANGED_IS_INTERNAL =
	`'${sessionEvents.turnOrderChanged}' is core-internal — the auto-advance listener and the ` +
	`turn-order push read it, and a pipeline bound to it would recompute the order it was told ` +
	`about. Bind '${sessionEvents.messageCompleted}' and the other session events instead.`

/** One entry of a genre's event surface. @experimental */
export interface GenreEventDecl {
	/** A preset for this genre must bind this event. */
	required?: boolean
	/**
	 * An open slot: any number of pipelines may serve it (actions). A
	 * non-open event binds at most one pipeline per preset.
	 */
	open?: boolean
}

/** 🚧 When a genre's history settles (G2, R-m). @experimental */
export const HISTORY_SETTLES = ['on-write', 'on-commit'] as const
/** @experimental */
export type HistorySettle = (typeof HISTORY_SETTLES)[number]

/** @public */
export interface GenreDecl {
	readonly id: string
	/**
	 * The picker card's title — a string or a locale map with `en`.
	 * @ruling R-20
	 */
	readonly name: I18n
	readonly family: string
	/** The picker card's subtitle. */
	readonly description?: I18n
	/** 🚧 The card's long copy (PLAN-genre-restructure §6, 2026-10-19): who's in the room, who drives, calls per turn in plain words, what's required and optional, when to pick a sibling. Two lines show; "More" unfolds it in place; the docs compiler reuses it. */
	readonly about?: I18n
	/**
	 * 🚧 The author's own **handbook** pages (2026-10-23, D8) beside the generated _How to play_ page; documentation, never a prompt block. Absent when unstated.
	 * Spelled out rather than `HandbookPage`, as `uses` is: this interface is frozen and the handbook is still 🚧.
	 */
	readonly handbook?: readonly { readonly title: string; readonly body: string }[]
	/** 🚧 Who may sit here (ruled 2026-10-19): `'solo'` — never a group session: the form hides the group switch and the host refuses `isGroup`, invites, guest claims and lanes (the Guide: one person's questions about the app). `'group'` (default) — as the shape allows. */
	readonly members?: 'solo' | 'group'
	/**
	 * 🚧 What this genre **plays best with** (PLAN-genre-restructure §11; RF fix 8, owner ruling
	 * 2026-10-23: "genres expect, never lock"): the verbs its scripts emit (or `'any'`), and the
	 * attributes, entry types and zone types it reads by **tag** (`health`, `inventory`,
	 * `condition`), each with the sentence the picker says why; `rulesetFit` rates every ruleset
	 * against it and a ruleset lacking one plays it in words. Never a requirement a ruleset must
	 * meet: a genre that needs a shape degrades in words when the rules lack it.
	 */
	readonly uses?: {
		// Spelled out rather than `GenreUses`, as `rigour` is: this interface
		// is frozen and the fit vocabulary is still 🚧 (`fit.ts`).
		readonly verbs: readonly string[] | 'any'
		readonly attributes?: readonly { readonly tag: string; readonly kinds?: readonly string[]; readonly label: string; readonly why: string }[]
		readonly entryTypes?: readonly { readonly tag: string; readonly label: string; readonly why: string }[]
		readonly zoneTypes?: readonly { readonly tag: string; readonly label: string; readonly why: string }[]
		readonly conditions?: boolean
		readonly casting?: boolean
		readonly dice?: 'required' | 'optional'
		readonly optional?: {
			readonly verbs?: readonly string[]
			readonly attributes?: readonly { readonly tag: string; readonly kinds?: readonly string[]; readonly label: string; readonly why: string }[]
			readonly entryTypes?: readonly { readonly tag: string; readonly label: string; readonly why: string }[]
			readonly zoneTypes?: readonly { readonly tag: string; readonly label: string; readonly why: string }[]
			readonly conditions?: boolean
			readonly casting?: boolean
		}
	}
	/**
	 * 🚧 **The genre's defaults** (R22, PLAN-layering D4): the registrations
	 * every session of this genre starts from — which pipeline answers which
	 * event, which actions are offered, which routines run on which cadence —
	 * and the setting values the genre sets, locks or asks at start. Every
	 * preset is one set of changes on top of these (R2).
	 *
	 * Spelled out loosely here rather than as `GenreDefaults` (this interface
	 * is frozen, and the registration vocabulary is still 🚧): read it typed
	 * with `genreDefaultsOf(genre)`. Declared with `genre(id, { defaults })`
	 * or, when the registrations name pipelines that import the genre,
	 * `withGenreDefaults(genre, { … })`. Absent when unstated, so a genre that
	 * says nothing hashes as it did.
	 * @ruling R2, R22, R38
	 */
	readonly defaults?: {
		readonly registrations: readonly { readonly key: string; readonly trigger: { readonly family: string }; readonly pipeline: string }[]
		readonly settings?: Readonly<Record<string, unknown>>
	}
	/**
	 * The standing SessionShape every surface asks about.
	 * @ruling 19 §1
	 */
	readonly shape?: SessionShape
	/**
	 * The event surface: which events exist for this genre, and which are
	 * required. `session-created` is implicitly required for every genre and
	 * is added if absent — a genre without a create pipeline is not a genre.
	 */
	readonly events: Readonly<Record<string, GenreEventDecl>>
	/*
	 * 🚧 Retired (RF fix 8, owner ruling 2026-10-23): `slots`, `sheets` and
	 * `customAttributes`. A genre brings no attributes — the session's rules
	 * do (their sections' attributes), and the host keeps the place, the time
	 * and a genre tool's own state beside them (`hostState.ts`). What a genre
	 * plays best with is said in `uses`; `genre()` refuses the three, and a
	 * stored manifest that still carries them has them dropped.
	 */
	/**
	 * The **envoys** this genre brings with it (built 2026-09-16) — speakers
	 * that exist nowhere in
	 * the library: Serene Pub's guide, a dungeon's narrator-in-residence. An
	 * array, so a genre may offer several; the session or its preset's
	 * defaults seat one or more, and `default: true` seats one with no choice.
	 *
	 * Normalised at declaration: every entry carries `speaks` (`in-turn`
	 * unless stated), keys are unique, at most one is the default, and every
	 * `name` is display text with `en` — a string or a locale map. Part
	 * of the declaration's hash, so a changed envoy is a changed genre.
	 * @ruling plans/29 R-18 (2026-09-15), U5g, R-20
	 */
	readonly envoys?: readonly EnvoyDecl[]
	/**
	 * 🚧 What a person's **persona-less line** is called in this genre — the Lair's
	 * "Dungeon Master". The counterpart to envoys: an envoy names a speaker
	 * the genre brings, this names the person at the keyboard when no persona
	 * speaks for them.
	 *
	 * Display text, normalised to a locale map at the declaration.
	 * Read at render and at prompt time — the log's author name, the
	 * transcript label, `{{playerLabel}}` in every context builder — and
	 * **never stamped on a row**: it is a role, not an identity, so a rename
	 * relabels history. A session may override it; the settings document's
	 * `playerLabel` is the session's value, else this, else absent.
	 *
	 * Refused on a genre whose `shape.personas.min` is 1 or more: a persona
	 * always names the person's line there, so nothing would ever carry it.
	 * Absent when unstated, so a genre that says nothing hashes as it did.
	 * @ruling lair re-plan R4, owner ruling 3 (2026-09-28), R-20
	 */
	readonly playerLabel?: LocaleMap
	/**
	 * 🚧 How far Back reaches (G2, ruled 2026-10-24). `on-commit` (default): the settle line moves only when
	 * a summary is saved or a person touches a row. `on-write`: every anchored write settles as it lands —
	 * an honour-mode game; Back is refused, Hide and Branch still work. The genre's alone: no preset or
	 * session changes it. Absent when unstated, so a genre that says nothing hashes as it did.
	 * Spelled out rather than `HistorySettle`, as `uses` is: this interface is frozen and the settle vocabulary is still 🚧.
	 */
	readonly history?: { readonly settle: 'on-write' | 'on-commit' }
	/**
	 * The genre's **enabled-when defaults** (built
	 * 2026-09-17), keyed by action **identity** — `<spec>#<key>`, and
	 * `core#<verb>` for one of core's message verbs (it was the function key
	 * until 2026-09-17). A genre's defaults
	 * name its own actions and core's verbs; a key that is not an identity
	 * is refused at the declaration. An action that declares its own
	 * `enabledWhen` beats this; a session's binding override beats both. Each entry is the junction clause's predicate
	 * shape over the session's published values (`predicates.ts`), stored
	 * in list form with `reason` a locale map; refused at the declaration
	 * on the same terms as the envoys.
	 * @ruling plans/29 R-15, U5e, plans/31 V2 (2026-09-17)
	 */
	readonly enabledWhen?: Readonly<Record<string, readonly EnabledWhen[]>>
	/**
	 * The genre's **pinned settings** — the genre layer of the settings cascade, keyed by
	 * setting key: `session > genre > core`.
	 *
	 * A genre that declares the field (`shape.fields[key]`) **and** pins a
	 * value here gets the pinned value as the control's initial value; the
	 * person's stored value wins over it. A genre that pins a value and
	 * declares no field renders no control, stores nothing on the session,
	 * and the pinned value is what every run reads — the replacement for a
	 * `hidden` flag. A pinned value is never stored per session.
	 * @ruling PLAN-turn-order §4.13, R14 (2026-09-21)
	 */
	readonly settings?: Readonly<Record<string, unknown>>
	/**
	 * Widgets this genre's sessions do not offer — any package's, core's
	 * included, by the id the page knows them by (`widgetRef`). Declared by
	 * value (`omitWidgets: [coreWidgets.stats]`).
	 * @ruling R71
	 */
	readonly omitWidgets?: readonly string[]
	/**
	 * The layouts this genre ships; the first is its default.
	 * @ruling R71
	 */
	readonly layouts?: readonly GenreLayoutDecl[]
	/**
	 * 🚧 The **summarize pipelines this genre owns** (live scenes §13,
	 * 2026-10-13): `scene` is the spec id a scene of this genre's sessions is
	 * summarized with — `core:spec/lair-summarize-scene`,
	 * `acme.phone:spec/summarize-scene`. Absent, core's default
	 * (`core:spec/summarize-scene`) runs, so a new genre summarizes on day one
	 * with nothing written.
	 *
	 * Resolution is this field, never a search: the host asks the session's
	 * genre for `summarize.scene` and runs that spec. Which channels are the
	 * story and which are asides is the SPEC's business (its source step's
	 * params), not the genre's. Absent when unstated, so a genre that says
	 * nothing hashes as it did.
	 */
	/**
	 * 🚧 The **rigour** this genre's sessions run rulesets at — the options a
	 * session may pick from and the default. Absent, a genre runs at
	 * `prose` only. Rulesets are genre-independent: a genre says how play is
	 * driven and how much of the mechanics it resolves, never which mechanics.
	 * (Spelled out rather than `GenreRigour`: this interface is frozen, and
	 * the rigour vocabulary is still 🚧.)
	 */
	readonly rigour?: {
		readonly options: readonly ('prose' | 'mechanics' | 'scripts')[]
		readonly default: 'prose' | 'mechanics' | 'scripts'
	}
	/**
	 * 🚧 Rulesets this genre names, optionally: `only` — only these work (a
	 * genre built to drive one ruleset; the first is the default); or
	 * `recommended` with a `default` — offered first, every other ruleset
	 * still allowed. Absent, every ruleset is offered alike. (`only` was
	 * `strict` until 2026-10-17: in the interface _strict_ means rigour.)
	 */
	readonly rulesets?:
		| { readonly only: readonly string[] }
		| { readonly recommended: readonly string[]; readonly default: string }
	readonly summarize?: {
		/**
		 * The spec a scene is summarized with — `owner:spec/<name>`. Only
		 * `scene` is read today; world, character and history summaries
		 * stay on the shared specs.
		 */
		readonly scene?: string
	}
}

/** @experimental */
export interface GenreProps {
	/**
	 * The picker card's title — a string or a locale map with `en`.
	 * @ruling R-20
	 */
	name: I18n
	family: string
	description?: I18n
	/** 🚧 The card's long copy — see `GenreDecl.about`. */
	about?: I18n
	/** 🚧 The author's own handbook pages — see `GenreDecl.handbook`. */
	handbook?: readonly HandbookPage[]
	/** 🚧 `'solo'` refuses group sessions — see `GenreDecl.members`. */
	members?: 'solo' | 'group'
	/** 🚧 What the genre uses of a ruleset — see `GenreDecl.uses`. */
	uses?: GenreUses
	/** 🚧 The genre's defaults — its registrations and setting values; see `GenreDecl.defaults`. */
	defaults?: GenreDefaults
	shape?: SessionShape
	events?: Record<string, GenreEventDecl>
	envoys?: readonly EnvoyDecl[]
	/** What a person's persona-less line is called — see `GenreDecl.playerLabel`. */
	playerLabel?: I18n
	/** When the genre's history settles — see `GenreDecl.history`. */
	history?: { readonly settle: HistorySettle }
	/** Enabled-when defaults per action identity — see `GenreDecl.enabledWhen`. */
	enabledWhen?: Readonly<Record<string, EnabledWhenDecl>>
	/** Pinned setting values — the genre layer of the cascade; see `GenreDecl.settings`. */
	settings?: Readonly<Record<string, unknown>>
	/**
	 * Widgets this genre's sessions do not offer, by value.
	 * @ruling R71
	 */
	omitWidgets?: readonly WidgetDecl[]
	/** The layouts this genre ships (`layout()`); the first is its default. */
	layouts?: readonly GenreLayoutDecl[]
	/** 🚧 The summarize pipelines this genre owns, by spec id — see `GenreDecl.summarize`. */
	summarize?: { scene?: string }
	/** 🚧 The rigour options and default — see `GenreDecl.rigour`. */
	rigour?: GenreRigour
	/** 🚧 The only rulesets, or the recommended ones, by id — see `GenreDecl.rulesets`. */
	rulesets?: GenreRulesets
}

/** 🚧 A genre's rigour options and its default (`GenreDecl.rigour`). @experimental */
export interface GenreRigour {
	options: readonly Rigour[]
	default: Rigour
}

/** 🚧 The rulesets a genre names (`GenreDecl.rulesets`). @experimental */
export type GenreRulesets = { only: readonly string[] } | { recommended: readonly string[]; default: string }

/**
 * 🚧 Why a genre's `rigour` or `rulesets` is refused, each finding opened by
 * its reason's name: `bad-rigour` (no options, an unknown rigour, a default
 * outside the options) · `bad-rulesets` (both or neither form, an empty
 * list, a default outside `recommended`, the retired `strict`) · `bad-ruleset-id` ·
 * 🚧 `template-ruleset` (a ruleset template, 2026-10-22) ·
 * `unknown-ruleset` — a `core:` id or one under the genre's own namespace
 * that no registered ruleset is (declare it above the genre). An id under
 * another package's namespace is the package's `requires`, resolved at
 * install, so it is not refused here.
 * @experimental
 */
export function genreRulesetFindings(id: string, props: Pick<GenreProps, 'rigour' | 'rulesets'>): string[] {
	const out: string[] = []
	const r = props.rigour
	if (r !== undefined) {
		const options = Array.isArray(r?.options) ? r.options : []
		if (!options.length) out.push(finding('bad-rigour', `${id}.rigour has no options. Name the rigours a session may run at — ['prose'] at least.`))
		for (const o of options.filter((o) => !RIGOURS.includes(o)))
			out.push(finding('bad-rigour', `${id}.rigour offers '${String(o)}'. The rigours are ${RIGOURS.join(', ')}.`))
		if (!options.includes(r?.default))
			out.push(finding('bad-rigour', `${id}.rigour defaults to '${String(r?.default)}', which is not among its options.`))
	}
	const rs = props.rulesets as Record<string, unknown> | undefined
	if (rs !== undefined) {
		const only = rs?.only
		const recommended = rs?.recommended
		let ids: unknown[] = []
		if (rs?.strict !== undefined)
			out.push(finding('bad-rulesets', `${id}.rulesets.strict is now 'only' (2026-10-17) — say { only: [...] }.`))
		else if ((only === undefined) === (recommended === undefined))
			out.push(finding('bad-rulesets', `${id}.rulesets is { only: [...] } or { recommended: [...], default } — one of the two.`))
		else if (only !== undefined) {
			if (!Array.isArray(only) || !only.length || rs.default !== undefined)
				out.push(finding('bad-rulesets', `${id}.rulesets.only is a non-empty list, with no default beside it — the first is the default.`))
			else ids = only
		} else {
			if (!Array.isArray(recommended) || !recommended.length)
				out.push(finding('bad-rulesets', `${id}.rulesets.recommended is a non-empty list.`))
			else {
				ids = recommended
				if (!recommended.includes(rs.default))
					out.push(finding('bad-rulesets', `${id}.rulesets.default is '${String(rs.default)}', which is not among its recommended rulesets.`))
			}
		}
		const own = id.slice(0, id.indexOf(':'))
		for (const rid of ids) {
			if (typeof rid !== 'string' || !RULESET_ID_PATTERN.test(rid)) {
				out.push(finding('bad-ruleset-id', `${id}.rulesets names '${String(rid)}', not a ruleset id ('owner:ruleset/name@N').`))
				continue
			}
			// 🚧 A template is copied, never played (2026-10-22): no genre offers one.
			if (isRulesetTemplateId(rid)) {
				out.push(finding('template-ruleset', `${id}.rulesets names ${rid}, a ruleset template — an archetype to copy, never one a session plays. Name a ruleset made from it.`))
				continue
			}
			const ns = rid.slice(0, rid.indexOf(':'))
			if ((ns === 'core' || ns === own) && !getRuleset(rid))
				out.push(finding('unknown-ruleset', `${id}.rulesets names ${rid}, which no registered ruleset is. Declare it above the genre.`))
		}
	}
	return out
}

/**
 * 🚧 The retired attribute keys of a genre declaration (RF fix 8): what a
 * genre may no longer say, and why — refused by `genre()`, dropped from a
 * stored manifest.
 * @internal
 */
export const RETIRED_GENRE_ATTRIBUTE_KEYS = Object.freeze(['slots', 'sheets', 'customAttributes'] as const)

/** The sentence `genre()` refuses a retired attribute key with. @internal */
const retiredGenreKeyFinding = (id: string, key: string): string =>
	`${id}.${key}: a genre brings no attributes any more — the session's rules do. Say what it plays best with in \`uses\` (attributes, entry types and zone types by tag), and keep a tool's own state in its annex fields.`

/* ── Envoys ─────────────────────────────────────────────────────────────── */

/**
 * When an envoy speaks.
 *
 *  · `in-turn` — a turn-taking candidate like any cast character: the turn
 *    strategies may pick it, the composer's reply may be its. The default for
 *    a genre's envoys.
 *  · `on-action` — speaks **only through an action's outputs**: a dice
 *    plugin's *Roll* reports as its envoy, and no strategy ever picks it. The
 *    only value an action's envoy may carry (`ActionDecl.envoy`).
 * @experimental
 * @ruling plans/29 R-21 (6)
 */
export type EnvoySpeaks = 'in-turn' | 'on-action'

/**
 * A speaker a genre or a contributed action brings with it.
 *
 * Declared in one of exactly two places — `GenreDecl.envoys[]` or
 * `ActionDecl.envoy` — and nowhere else: there is no API to add an envoy to
 * another genre and no user authors one. Addressed as `envoy:<slug>` wherever
 * a character is `character:<id>` (`participants.ts`): a genre's slug is its
 * `key`; an action's is `<plugin>.<key>`, namespaced like a slash name so it
 * cannot collide with a genre's (`envoyIdentity`).
 *
 * Its data is **configuration**: `prompts`, `description` and
 * `image` are the genre's declared defaults, read by a pipeline node through
 * `slot.prompts({ envoy })` and tuned in the Pipelines panel with deviation
 * semantics like any other setting — no second schema.
 *
 * ⚠ Not a *character* (a library row) and not a *persona* (the user's own).
 * @experimental
 * @ruling plans/29 R-18, R-18 (2)
 */
export interface EnvoyDecl {
	/** The genre-local key — lowercase kebab, no dots (a dot marks an action's namespace). */
	key: string
	/**
	 * Display text: a string or a locale map with `en` — `'Guide'` is `{ en: 'Guide' }`.
	 * @ruling R-20
	 */
	name: I18n
	/**
	 * ⏳ An `http(s)://` URL or a `data:image/…` URI (`ENVOY_IMAGE`) — refused
	 * at the declaration otherwise, because a host renders it as an `<img>`
	 * source and nothing else, and a `javascript:` or `data:text/html` string
	 * is not an image. Neither the SDK nor the catalog ships binary assets
	 * today (widgets carry Lucide icon *names*); until a package can ship an
	 * image, the string is the image.
	 */
	image?: string
	description?: I18n
	/**
	 * The envoy's authored instructions — the fields of the context builder's
	 * `prompts` slot (`core:task/build-template-context@1`: `systemPrompt`,
	 * `postHistoryInstructions`), because that is the slot a node reads them
	 * through. One vocabulary, read by reference; never a mapping.
	 */
	prompts?: { systemPrompt?: string; postHistoryInstructions?: string }
	/** Seated on every new session of the genre, with no choice. At most one per genre. */
	default?: boolean
	/**
	 * The genre's **fallback envoy** (ruled 2026-09-26: "everyone should have
	 * names, even just placeholders") — the speaker a line **nobody claims**
	 * posts as: a message a pipeline writes with no character, no persona, no
	 * `speaker` and no `narration`. The host stamps its reference on the row
	 * at the write (`metadata.speaker = envoy:<key>`), so the line is named
	 * like any envoy's. At most one per genre, and a **genre's** envoy only:
	 * an action's envoy already speaks for exactly its action.
	 *
	 * Not `default` (seated with no choice) and not a turn: a fallback that
	 * should never be picked by a strategy says `speaks: 'on-action'`. A genre
	 * that declares none gets `UNCLAIMED_LINE_NAME` — never "Unknown".
	 */
	fallback?: boolean
	/** See `EnvoySpeaks`. A genre's default is `in-turn`; an action's envoy is always `on-action`. */
	speaks?: EnvoySpeaks
	/**
	 * The line this envoy opens a new session with: the Lair's Castellan
	 * introduces the game and invites the
	 * person to start. **Declared, not generated** — a create run is a
	 * person waiting, so it calls no model; the text is interpolated
	 * (`{{char}}` is the envoy, `{{playerLabel}}`, `{{characterNames}}`)
	 * and written by the genre's create spec through
	 * `core:query/envoy-greeting@1`, only while the envoy is seated.
	 *
	 * `channel` is where it lands, one the genre declares (default `main`).
	 * A **genre's** envoy only: an action's envoy speaks for its action.
	 *
	 * ⚠ Not `SessionShape.greeting`, which is the CARDS' greetings.
	 * @ruling lair re-plan R6 (2026-09-28)
	 */
	greeting?: EnvoyGreeting
}

/** An envoy's opening line and where it lands — see `EnvoyDecl.greeting`. @experimental */
export interface EnvoyGreeting {
	/**
	 * The line, interpolated at create. Display text.
	 * @ruling R-20
	 */
	text: I18n
	/** A channel the genre declares. Default `main`. */
	channel?: string
}

/**
 * The name a line nobody claims is shown and prompted under when its genre
 * declares no fallback envoy (`EnvoyDecl.fallback`) — display text, read
 * in the viewer's language. The host's last resort, so no line is ever
 * attributed to "Unknown" (ruled 2026-09-26). The same word the host already
 * gives narration with no narrator name.
 * @experimental
 * @ruling R-20
 */
export const UNCLAIMED_LINE_NAME: LocaleMap = Object.freeze({ en: 'Narrator' })

/** An envoy's key: a lowercase kebab token. Dots are reserved for an action's namespace. @experimental */
export const ENVOY_KEY = /^[a-z][a-z0-9-]*$/

/** An envoy's image: an `http(s)://` URL or a `data:image/…` URI — an `<img>` source, nothing else. @experimental */
export const ENVOY_IMAGE = /^(?:https?:\/\/\S+|data:image\/[a-z0-9.+-]+(?:;[^,]*)?,.+)$/i

const ENVOY_SPEAKS: ReadonlySet<string> = new Set<EnvoySpeaks>(['in-turn', 'on-action'])

/**
 * Every fault in one envoy declaration, as sentences (the teaching-error
 * pattern). Empty when it is sound. `owner` says which of the two
 * declaring places this is, because an action's envoy has one rule of its own:
 * it may only be `on-action`.
 * @internal
 * @ruling 15 §1.3
 */
export function envoyFindings(
	raw: unknown,
	at: string,
	owner: 'genre' | 'action' = 'genre',
): string[] {
	const out: string[] = []
	if (!raw || typeof raw !== 'object') return [`${at}: an envoy is an object — got ${typeof raw}`]
	const e = raw as Record<string, unknown>
	const where = `${at}[${typeof e.key === 'string' ? e.key : '?'}]`
	if (typeof e.key !== 'string' || !ENVOY_KEY.test(e.key))
		out.push(
			`${where}: 'key' is required — a lowercase kebab token (${ENVOY_KEY.source}); ` +
				`an action's envoy is namespaced by the host, never by the key`,
		)
	out.push(...i18nFindings(e.name, `${where}.name`, { required: true }))
	out.push(...i18nFindings(e.description, `${where}.description`))
	if (e.image !== undefined && (typeof e.image !== 'string' || !ENVOY_IMAGE.test(e.image)))
		out.push(
			`${where}: 'image' is an http(s):// URL or a data:image/… URI — an <img> source and nothing else`,
		)
	if (e.prompts !== undefined) {
		if (!e.prompts || typeof e.prompts !== 'object')
			out.push(`${where}: 'prompts' is { systemPrompt?, postHistoryInstructions? }`)
		else
			for (const [k, v] of Object.entries(e.prompts as Record<string, unknown>))
				if (typeof v !== 'string')
					out.push(`${where}: prompts.${k} is a string — the authored text`)
	}
	if (e.default !== undefined && typeof e.default !== 'boolean')
		out.push(`${where}: 'default' is a boolean`)
	if (e.fallback !== undefined) {
		if (typeof e.fallback !== 'boolean') out.push(`${where}: 'fallback' is a boolean`)
		else if (owner === 'action' && e.fallback)
			out.push(
				`${where}: an action's envoy cannot be the fallback — it speaks for its action only; ` +
					`declare the fallback on the genre's envoys`,
			)
	}
	if (e.greeting !== undefined) {
		const g = e.greeting as Record<string, unknown> | null
		if (owner === 'action')
			out.push(
				`${where}: an action's envoy cannot declare a greeting — it speaks for its action ` +
					`only; declare the greeting on the genre's envoy (R6)`,
			)
		else if (!g || typeof g !== 'object' || Array.isArray(g))
			out.push(`${where}: 'greeting' is { text, channel? } — the line this envoy opens a new session with`)
		else {
			out.push(...i18nFindings(g.text, `${where}.greeting.text`, { required: true }))
			if (g.channel !== undefined && (typeof g.channel !== 'string' || !g.channel.trim()))
				out.push(`${where}: greeting.channel is a channel slug the genre declares — 'main' when absent`)
		}
	}
	if (e.speaks !== undefined) {
		if (!ENVOY_SPEAKS.has(e.speaks as string))
			out.push(`${where}: 'speaks' is 'in-turn' or 'on-action' (R-21 (6))`)
		else if (owner === 'action' && e.speaks !== 'on-action')
			out.push(
				`${where}: an action's envoy speaks 'on-action' only — it is the speaker the ` +
					`action's results post as, never a turn-taking candidate (R-21 (6))`,
			)
	}
	return out
}

/**
 * The findings on a genre's whole list: each entry's, plus unique keys, at
 * most one default, and — given the genre's `channels` (slugs, `main`
 * included) — a greeting on a channel the genre does not declare.
 * @internal
 * @ruling R6
 */
export function envoysFindings(raw: unknown, at = 'envoys', channels?: readonly string[]): string[] {
	if (raw === undefined) return []
	if (!Array.isArray(raw)) return [`${at}: a genre's envoys are an array`]
	const out: string[] = []
	const keys = new Map<string, number>()
	let defaults = 0
	const fallbacks: string[] = []
	raw.forEach((e, i) => {
		out.push(...envoyFindings(e, at, 'genre'))
		const key = (e as { key?: unknown })?.key
		if (typeof key === 'string') keys.set(key, (keys.get(key) ?? 0) + 1)
		if ((e as { default?: unknown })?.default === true) defaults++
		if ((e as { fallback?: unknown })?.fallback === true) fallbacks.push(typeof key === 'string' ? key : '?')
		const lands = (e as { greeting?: { channel?: unknown } })?.greeting?.channel
		if (channels && typeof lands === 'string' && lands.trim() && !channels.includes(lands.trim()))
			out.push(
				`${at}[${typeof key === 'string' ? key : '?'}]: greeting.channel '${lands}' is not a channel ` +
					`this genre declares — it declares ${channels.map((c) => `'${c}'`).join(', ')} (R6)`,
			)
		void i
	})
	if (fallbacks.length > 1)
		out.push(
			`${at}: ${fallbacks.map((k) => `'${k}'`).join(', ')} are all 'fallback: true' — a line nobody ` +
				`claims posts as one envoy; mark one`,
		)
	for (const [key, n] of keys)
		if (n > 1) out.push(`${at}: the key '${key}' is declared ${n} times — an envoy's key is unique within its genre`)
	if (defaults > 1)
		out.push(
			`${at}: ${defaults} envoys are 'default: true' — at most one is seated with no choice; ` +
				`the rest are offered`,
		)
	return out
}

/** One envoy in its document form: `speaks` stated, nothing else added. @experimental */
export function normalizeEnvoy(raw: EnvoyDecl, speaks: EnvoySpeaks): EnvoyDecl {
	return Object.freeze({ ...raw, speaks })
}

/**
 * A genre's enabled-when defaults, as findings: keyed by an action identity
 * (`<spec>#<key>`, or `core#<verb>`), each value a predicate or a list judged
 * by `enabledWhenFindings`. Empty when sound or absent.
 * @experimental
 */
export function genreEnabledWhenFindings(raw: unknown, at = 'enabledWhen'): string[] {
	if (raw === undefined) return []
	if (!raw || typeof raw !== 'object' || Array.isArray(raw))
		return [
			`${at}: a genre's enabled-when defaults are an object keyed by action identity — ` +
				`{ 'core:spec/look#look': { on: 'state.world.location', truthy: true, reason: { en: '…' } } }`,
		]
	const out: string[] = []
	for (const [id, decl] of Object.entries(raw as Record<string, unknown>)) {
		if (!isActionIdentity(id))
			out.push(
				`${at}: a default is keyed by the identity of the action it applies to — ` +
					`'<spec slug>#<key>', or 'core#<verb>' for a message verb — got '${id}'`,
			)
		out.push(...enabledWhenFindings(decl, `${at}[${id}]`))
	}
	return out
}

function assertEnabledWhen(
	decl: Readonly<Record<string, EnabledWhenDecl>> | undefined,
	genreId: string,
): Record<string, readonly EnabledWhen[]> | undefined {
	if (!decl) return undefined
	const findings = genreEnabledWhenFindings(decl, `${genreId}.enabledWhen`)
	if (findings.length) throw new Error(findings.join('\n'))
	const out: Record<string, readonly EnabledWhen[]> = {}
	for (const [fn, v] of Object.entries(decl)) out[fn] = Object.freeze(normalizeEnabledWhen(v))
	return Object.freeze(out)
}

/**
 * Every display string a genre carries: `name` (required) and
 * `description`; and the shape's `fields` schema and its `panels[]` titles
 * (🚧 a genre brings no slots or sheets since RF fix 8).
 * @experimental
 * @ruling R-20
 */
export function genreDisplayTextFindings(props: GenreProps, at: string): string[] {
	const out: string[] = []
	out.push(...i18nFindings(props.name, `${at}.name`, { required: true }))
	out.push(...i18nFindings(props.description, `${at}.description`))
	out.push(...i18nFindings(props.about, `${at}.about`))
	if (props.shape) {
		out.push(...settingsSchemaFindings(props.shape.fields, `${at}.shape.fields`))
		out.push(...widgetDeclsFindings(props.shape.panels, `${at}.shape.panels`))
	}
	return out
}

function assertDisplayText(props: GenreProps, genreId: string): void {
	const findings = genreDisplayTextFindings(props, genreId)
	if (findings.length) throw new Error(findings.join('\n'))
}

/**
 * `GenreProps.playerLabel`, checked and normalised: display text with an
 * `en`, as a frozen locale map — and refused for a genre where a
 * persona always names the person's line (`shape.personas.min ≥ 1`), because
 * nothing there would ever carry it.
 * @ruling R4, R-20
 */
function assertPlayerLabel(props: GenreProps, genreId: string): LocaleMap | undefined {
	if (props.playerLabel === undefined) return undefined
	const findings = i18nFindings(props.playerLabel, `${genreId}.playerLabel`)
	if (findings.length) throw new Error(findings.join('\n'))
	if ((props.shape?.personas?.min ?? 0) >= 1)
		throw new Error(
			`${genreId}.playerLabel: this genre requires a persona (shape.personas.min ≥ 1), so a persona ` +
				`always names the person's line and no line would ever carry the label — drop playerLabel, ` +
				`or let the genre run without a persona`,
		)
	return Object.freeze({ ...localeMapOf(props.playerLabel) })
}

function assertEnvoys(
	envoys: readonly EnvoyDecl[] | undefined,
	genreId: string,
	shape: SessionShape | undefined,
): EnvoyDecl[] {
	if (!envoys) return []
	const findings = envoysFindings(
		envoys,
		`${genreId}.envoys`,
		channelDecls(shape).map((c) => c.slug),
	)
	if (findings.length) throw new Error(findings.join('\n'))
	return envoys.map((e) => normalizeEnvoy(e, e.speaks ?? 'in-turn'))
}

/** Core's conversation widget — the primary widget a genre must replace if it withholds it. @internal */
export const CONVERSATION_WIDGET_ID = 'messages'

/**
 * `omitWidgets` read down to ids, and `layouts` checked.
 * @ruling R71
 */
function assertGenreWidgets(props: GenreProps, id: string): { omitWidgets: string[]; layouts: GenreLayoutDecl[] } {
	const problems: string[] = []
	const omitWidgets: string[] = []
	for (const w of props.omitWidgets ?? []) {
		if (typeof w === 'string') {
			problems.push(`${id} omitWidgets: '${w}' is a string — name the widget value (coreWidgets.x, or the package's widget)`)
			continue
		}
		try {
			omitWidgets.push(widgetRef(w))
		} catch (e) {
			problems.push(`${id} omitWidgets: ${(e as Error).message}`)
		}
	}
	const layouts = [...(props.layouts ?? [])]
	// The first is the genre's default, and the instance seeds a genre's
	// default by its slug.
	if (layouts.length && layouts[0]!.slug !== 'default')
		problems.push(`${id} layouts: the first is the genre's default — give it slug 'default' (it is '${layouts[0]!.slug}')`)
	// 🚧 One guests' layout at most, and never the default: the default is the owner's.
	const forGuests = layouts.filter((l) => l.forGuests === true)
	if (forGuests.length > 1)
		problems.push(
			`${id} layouts: ${forGuests.map((l) => `'${l.slug}'`).join(' and ')} are both forGuests — a guest's first open copies one`,
		)
	if (layouts[0]?.forGuests === true)
		problems.push(`${id} layouts: the default is the owner's — mark another layout forGuests, or none`)
	const slugs = new Set<string>()
	for (const l of layouts) {
		if (slugs.has(l.slug)) problems.push(`${id} layouts: two layouts are '${l.slug}' — a slug names one`)
		slugs.add(l.slug)
		// By widget, not by instance: `messages#sanctum` places the conversation.
		// An aliased id (`world-state`) is both the widget it became and the
		// one it was: omitting either withholds it.
		for (const w of layoutWidgetIds(l.preset)) {
			const read = resolveWidgetAlias(w)
			if (omitWidgets.includes(read.widgetId) || (read.aliasedFrom !== null && omitWidgets.includes(read.aliasedFrom)))
				problems.push(`${id} layout '${l.slug}' places '${w}', which the genre omits`)
		}
	}
	// The primary floor: a session always draws its primary widget. A genre
	// that withholds the conversation says what stands in its place — its
	// package's `role: 'primary'` widget — in the layout it ships first, in any
	// zone (placement is free). Which widget that is, the widget's declaration
	// says, and a genre holds only ids: so this asks that the layout draws
	// something, and the package pass (`genreLayoutFindings`, run by
	// `defineExtension` and the packager) that what it draws is primary.
	if (omitWidgets.includes(CONVERSATION_WIDGET_ID)) {
		const first = layouts[0]
		if (!first || !drawnWidgetIds(first.preset).length)
			problems.push(
				`${id} omits the conversation — ship a layout (layouts: [layout({ … })]) that places ` +
					`the widget that takes its place (its role: 'primary' widget), in any zone`,
			)
	}
	if (problems.length) throw new Error(problems.join('\n'))
	return { omitWidgets: [...new Set(omitWidgets)], layouts }
}

/**
 * 🚧 What is wrong with a genre's `summarize` declaration — one sentence per
 * problem, empty when it is sound. Each entry is a spec id with an owner
 * (`core:spec/lair-summarize-scene`): a bare slug is a hand-imported
 * document's, which no genre can be sure an install holds.
 * @experimental
 */
export function genreSummarizeFindings(raw: unknown, at = 'summarize'): string[] {
	if (raw === undefined) return []
	if (!raw || typeof raw !== 'object' || Array.isArray(raw))
		return [`${at}: an object of spec ids — { scene: 'owner:spec/name' } — not ${JSON.stringify(raw)}`]
	const out: string[] = []
	for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
		if (key !== 'scene') {
			out.push(`${at}.${key}: not a summarize pipeline a genre can own — only 'scene' is read`)
			continue
		}
		if (value === undefined) continue
		if (typeof value !== 'string') {
			out.push(`${at}.scene: a spec id, as a string — not ${JSON.stringify(value)}`)
			continue
		}
		try {
			assertSpecId(value)
		} catch (e) {
			out.push(`${at}.scene: ${(e as Error).message}`)
			continue
		}
		if (!parseSpecId(value).owner)
			out.push(`${at}.scene: '${value}' names no owner — use 'owner:spec/name', e.g. 'core:spec/story-summarize-scene'`)
	}
	return out
}

/** A slot id as a template reads it: `core:slot/location@1` → `location`. */
const slotLocalKey = (slotId: string) => slotId.replace(/^.*:slot\//, '').replace(/@\d+$/, '')

/**
 * 🚧 A genre's `shape.scenes.place` (live scenes §15 G2) must name the
 * host's place (`HOST_PLACE_KEY`, `location`) — the value the host keeps on
 * the world for every genre whose scenes are placed by it (RF fix 8: a genre
 * declares no slots, so the place is the host's). A place nothing keeps would
 * name no scene and fire no *place changed*. Refused here, where the author is.
 */
function assertScenePlaceDeclared(props: GenreProps, id: string): void {
	const place = declaredScenePlace(props.shape)
	if (!place) return
	if (place.stateKey !== HOST_PLACE_KEY)
		throw new Error(
			`${id}.scenes.place.stateKey: '${place.stateKey}' is not a place the host keeps — the place is '${HOST_PLACE_KEY}', the host's own (a genre declares no slots)`,
		)
}

/**
 * Declare a genre. The id is stated in full, under your plugin's slug
 * (`acme.dice:genre/table`), and the genre value is what everything else
 * references.
 * @public
 */
export function genre<const P extends GenreProps>(
	id: string,
	props: P,
): GenreDecl & {
	readonly __declared?: {
		readonly fields: {
			readonly [K in keyof NonNullable<NonNullable<P['shape']>['fields']>]: NonNullable<NonNullable<P['shape']>['fields']>[K] extends { readonly type: 'boolean' }
				? 'boolean'
				: NonNullable<NonNullable<P['shape']>['fields']>[K] extends { readonly type: 'number' | 'integer' }
					? 'number'
					: NonNullable<NonNullable<P['shape']>['fields']>[K] extends { readonly type: 'enum'; readonly of: readonly (infer O extends string)[] }
						? readonly ['enum', O]
						: NonNullable<NonNullable<P['shape']>['fields']>[K] extends { readonly type: 'enum' }
							? readonly ['enum', string]
							: NonNullable<NonNullable<P['shape']>['fields']>[K] extends { readonly type: 'string' | 'text' }
								? 'string'
								: 'unknown'
		}
	}
} {
	assertGenreId(id)
	// The floors (R-15): a genre that switches off stop, branch or edit is
	// refused here, at the declaration, on the same terms as an inlet's shape.
	assertMessageVerbFloors(props.shape, id)
	// The writes (R-B) and the channel declarations (R-C): refused here too,
	// on the same terms and for the same reason — a `writes.lore: 'no'` or a
	// channel declared `role: 'prose'` is an authoring mistake, not a value to
	// degrade at the write site where nobody is reading.
	assertSessionWrites(props.shape, id)
	assertTurnControls(props.shape, id)
	assertChannelDecls(props.shape, id)
	// ⏳ `lorebook: 'required'` (retired RF fix 2, 2026-10-23): accepted for
	// one release, warned here, and read as 'optional' in the declaration.
	for (const f of lorebookShapeFindings(props.shape, `${id}.shape.lorebook`))
		console.warn(`[genres] ${f.law}: ${f.message} — ${f.fix}`)
	// 🚧 The scene settings (live scenes §4): refused here on the same terms —
	// a mode or a trigger that does not read is an authoring mistake, not a
	// default to fall back to silently.
	assertSceneSettings(props.shape, id)
	assertScenePlaceDeclared(props, id)
	const events: Record<string, GenreEventDecl> = { ...(props.events ?? {}) }
	// The turn-order write's own event is core-internal (PLAN-turn-order
	// §4.1): the recompute must not be able to answer itself, so no genre
	// may list it and no preset can ever bind it. Refused here, at the
	// declaration, where the author is.
	if (sessionEvents.turnOrderChanged in events)
		throw new Error(`${id} lists it in its events: ${TURN_ORDER_CHANGED_IS_INTERNAL}`)
	// A genre lists core's events. A package's event joins a genre's surface
	// through the package entry, which also says who may record it — one
	// place, so a genre cannot list an event with no scope.
	for (const event of Object.keys(events)) {
		if (!eventById(event)) throw new Error(`${id}: ${notADeclaredEvent(event)}`)
		if (!event.startsWith('core:'))
			throw new Error(
				`${id} lists '${event}', a package's event — add it to the genre from defineExtension({ events: ` +
					`[{ event, genre, recordedBy }] }), which also says who may record it`,
			)
	}
	// Every genre has the create slot, stated or not — stating it merely
	// confirms; omitting it must not produce a genre nothing can instantiate.
	events[sessionEvents.sessionCreated] = {
		...(events[sessionEvents.sessionCreated] ?? {}),
		required: true,
	}
	// The envoys (R-18): refused here, at the declaration, on the same terms
	// as the floors — a duplicate key, two defaults or a name with no `en`
	// is an authoring mistake, not a row to degrade.
	// The display text (R-20, U5i): the card's name and subtitle, the shape's
	// fields and panels, and every slot's and sheet's label — refused here on
	// the same terms as the floors. A blank name is a card with no face.
	assertDisplayText(props, id)
	const envoys = assertEnvoys(props.envoys, id, props.shape)
	// The enabled-when defaults (R-15, U5e): refused here on the same terms —
	// a path that is a port reference or a predicate with no reason is an
	// authoring mistake, not a button to grey with no sentence.
	const enabledWhen = assertEnabledWhen(props.enabledWhen, id)
	const { omitWidgets, layouts } = assertGenreWidgets(props, id)
	// 🚧 RF fix 8: a genre brings no attributes — refused by name, with where to say it instead.
	for (const key of RETIRED_GENRE_ATTRIBUTE_KEYS)
		if ((props as unknown as Record<string, unknown>)[key] !== undefined) throw new Error(retiredGenreKeyFinding(id, key))
	if (props.history !== undefined) {
		const settle = (props.history as { settle?: unknown } | null)?.settle
		if (!(HISTORY_SETTLES as readonly unknown[]).includes(settle))
			throw new Error(`genre '${id}' declares history.settle '${String(settle)}' — 'on-write' or 'on-commit'.`)
	}
	const playerLabel = assertPlayerLabel(props, id)
	const summarizeFindings = genreSummarizeFindings(props.summarize, `${id}.summarize`)
	if (summarizeFindings.length) throw new Error(summarizeFindings.join('\n'))
	const rulesetFound = genreRulesetFindings(id, props)
	if (rulesetFound.length) throw new RulesetError(id, rulesetFound)
	if (props.members !== undefined && props.members !== 'solo' && props.members !== 'group')
		throw new Error(`${id}.members: 'solo' or 'group' — not ${JSON.stringify(props.members)}`)
	const usesFound = genreUsesFindings(props.uses, `${id}.uses`)
	if (usesFound.length) throw new Error(usesFound.join('\n'))
	const handbookFound = handbookFindings(props.handbook, id)
	if (handbookFound.length) throw new Error(handbookFound.join('\n'))
	const defaultsFound = genreDefaultsShapeFindings(props.defaults, `${id}.defaults`)
	if (defaultsFound.length) throw new Error(defaultsFound.join('\n'))
	// 🚧 Exposure (A10, R1): a genre's field may reach the owner; model plumbing never does.
	const exposureFound = exposureFindings(props.shape?.fields as never, `${id}.shape.fields`)
	if (exposureFound.length) throw new Error(exposureFound.join('\n'))
	const summarize =
		props.summarize?.scene !== undefined ? Object.freeze({ scene: props.summarize.scene }) : undefined
	const decl: GenreDecl = Object.freeze({
		id,
		name: props.name,
		family: props.family,
		description: props.description,
		...(props.about !== undefined ? { about: props.about } : {}),
		// 🚧 2026-10-23: absent when unstated, so a genre that says nothing hashes as it did.
		...(props.handbook !== undefined ? { handbook: Object.freeze(props.handbook.map((p) => Object.freeze({ title: p.title, body: p.body }))) } : {}),
		...(props.members === 'solo' ? { members: 'solo' as const } : {}),
		...(props.uses ? { uses: Object.freeze(JSON.parse(JSON.stringify(props.uses)) as GenreUses) } : {}),
		// PLAN-layering D4: absent when unstated, so a genre that says nothing hashes as it did.
		...(props.defaults ? { defaults: freezeGenreDefaults(props.defaults) } : {}),
		shape: lorebookReadOptional(props.shape),
		events: Object.freeze(events),
		...(envoys.length ? { envoys: Object.freeze(envoys) } : {}),
		// R4: absent when unstated, so a genre that says nothing hashes as it did.
		...(playerLabel ? { playerLabel } : {}),
		// G2: absent when unstated, so a genre that says nothing hashes as it did.
		...(props.history ? { history: Object.freeze({ settle: props.history.settle }) } : {}),
		...(enabledWhen && Object.keys(enabledWhen).length ? { enabledWhen } : {}),
		// The pinned settings (§4.13): copied when stated, frozen like the
		// rest, absent otherwise — so an unpinned genre hashes as it did.
		...(props.settings && Object.keys(props.settings).length
			? { settings: Object.freeze({ ...props.settings }) }
			: {}),
		// R71: absent when unstated, so a genre that says nothing hashes as it did.
		...(omitWidgets.length ? { omitWidgets: Object.freeze(omitWidgets) } : {}),
		...(layouts.length ? { layouts: Object.freeze(layouts) } : {}),
		// Live scenes §13: absent when unstated, so a genre that says nothing hashes as it did.
		...(summarize ? { summarize } : {}),
		// 🚧 Rulesets: absent when unstated, so a genre that says nothing hashes as it did.
		...(props.rigour
			? { rigour: Object.freeze({ options: Object.freeze([...props.rigour.options]), default: props.rigour.default }) }
			: {}),
		...(props.rulesets ? { rulesets: Object.freeze(freezeRulesets(props.rulesets)) } : {}),
	})
	const existing = registry.get(id)
	if (existing) {
		// A genre whose defaults were added after it (`withGenreDefaults`) is
		// the same genre re-declared without them — a module re-evaluating —
		// so it compares as the bare declaration it was.
		const { defaults: _added, ...bare } = existing
		refuseUnlessIdentical(decl.defaults ? existing : (bare as GenreDecl), decl, `duplicate genre id: ${id}`, GENRE_DISPLAY_KEYS)
	}
	registry.set(id, decl)
	// `__declared` is a phantom (never set): each field's value kind, kept in
	// the TYPE so `sessionOf(genre)` can derive what a condition may test (A5;
	// a genre brings no slots since RF fix 8). Only those, so genres that differ in name
	// or events still share a type — and the fields projected to plain kinds
	// (spelled inline, naming no type), so a frozen genre's inferred type
	// names nothing unfrozen (the surface audit, R37).
	return decl as GenreDecl & {
		readonly __declared?: {
			readonly fields: {
			readonly [K in keyof NonNullable<NonNullable<P['shape']>['fields']>]: NonNullable<NonNullable<P['shape']>['fields']>[K] extends { readonly type: 'boolean' }
				? 'boolean'
				: NonNullable<NonNullable<P['shape']>['fields']>[K] extends { readonly type: 'number' | 'integer' }
					? 'number'
					: NonNullable<NonNullable<P['shape']>['fields']>[K] extends { readonly type: 'enum'; readonly of: readonly (infer O extends string)[] }
						? readonly ['enum', O]
						: NonNullable<NonNullable<P['shape']>['fields']>[K] extends { readonly type: 'enum' }
							? readonly ['enum', string]
							: NonNullable<NonNullable<P['shape']>['fields']>[K] extends { readonly type: 'string' | 'text' }
								? 'string'
								: 'unknown'
		}
		}
	}
}

/**
 * 🚧 **The genre's defaults** as authored (R22, PLAN-layering D4): the
 * registrations every session of the genre starts from, and the setting
 * values the genre sets — each a plain value, or `{ value, lock?, askAtStart? }`
 * (`SettingValue`, A10). The genre's **default preset** is not named here:
 * a preset says so itself (`preset({ …, default: true })`, A18).
 * @experimental
 * @ruling R2, R22, A10
 */
export interface GenreDefaults {
	readonly registrations: readonly RegistrationDecl[]
	readonly settings?: Readonly<Record<string, SettingValue>>
}

/** The genre's defaults, typed — `GenreDecl.defaults` read back as what was declared. @experimental */
export const genreDefaultsOf = (g: GenreDecl | null | undefined): GenreDefaults | undefined =>
	g?.defaults as GenreDefaults | undefined

/**
 * The shape of a genre's defaults, refused at the declaration: a list of
 * registrations (each made by `register()` — a key, a trigger, a pipeline)
 * and a settings map. What the registrations MEAN — fit, cadence options,
 * duplicates, cycles — is `registrationFindings`'s, the one door (§11-2),
 * which a package build and a host both call; a duplicate never refuses here
 * (R34).
 * @experimental
 */
export function genreDefaultsShapeFindings(raw: unknown, at = 'defaults'): string[] {
	if (raw === undefined) return []
	const out: string[] = []
	if (!raw || typeof raw !== 'object' || Array.isArray(raw))
		return [`${at}: the genre's defaults are { registrations: [ … ], settings? } — got ${Array.isArray(raw) ? 'a list' : typeof raw}`]
	const d = raw as { registrations?: unknown; settings?: unknown }
	if (!Array.isArray(d.registrations))
		out.push(`${at}.registrations: a list of registrations — register(trigger, pipeline, { … })`)
	else
		d.registrations.forEach((r, i) => {
			const reg = r as { key?: unknown; trigger?: { family?: unknown }; pipeline?: unknown } | null
			if (!reg || typeof reg !== 'object' || typeof reg.key !== 'string' || !reg.trigger || typeof reg.trigger.family !== 'string' || typeof reg.pipeline !== 'string')
				out.push(`${at}.registrations[${i}]: not a registration — make each with register(trigger, pipeline, { … })`)
		})
	if (d.settings !== undefined && (!d.settings || typeof d.settings !== 'object' || Array.isArray(d.settings)))
		out.push(`${at}.settings: a map of setting key → value (or { value, lock?, askAtStart? })`)
	for (const k of Object.keys(d))
		if (k !== 'registrations' && k !== 'settings')
			out.push(
				`${at}.${k} is not part of the genre's defaults — registrations and settings; the default preset ` +
					`says so itself (preset({ …, default: true }))`,
			)
	return out
}

const freezeGenreDefaults = (d: GenreDefaults): GenreDecl['defaults'] =>
	Object.freeze({
		// The registrations themselves, not copies: the registration door
		// recognises what `register()` handed out (a string reference warns, R30).
		registrations: Object.freeze([...d.registrations]),
		...(d.settings && Object.keys(d.settings).length ? { settings: Object.freeze({ ...d.settings }) } : {}),
	}) as GenreDecl['defaults']

/**
 * 🚧 A genre with its defaults stated — for the common case where the
 * registrations name pipelines that import the genre (so the genre cannot
 * name them at its own declaration without an import cycle). Returns the
 * genre carrying `defaults` and registers it in place of the one passed: the
 * declaration is the same genre with its defaults added, so nothing that
 * holds the id sees two genres. Pass the returned value to
 * `defineExtension({ genres })`.
 *
 * Refuses a genre that already states different defaults — one genre, one
 * set of defaults.
 * @experimental
 * @ruling R22
 */
export function withGenreDefaults<G extends GenreDecl>(g: G, defaults: GenreDefaults): G {
	const found = genreDefaultsShapeFindings(defaults, `${g.id}.defaults`)
	if (found.length) throw new Error(found.join('\n'))
	const next: GenreDecl = Object.freeze({ ...g, defaults: freezeGenreDefaults(defaults) })
	const existing = registry.get(g.id)
	if (existing?.defaults)
		refuseUnlessIdentical(existing, next, `genre '${g.id}' states its defaults twice, differently`, GENRE_DISPLAY_KEYS)
	registry.set(g.id, next)
	return next as G
}

const freezeRulesets = (r: GenreRulesets): GenreRulesets =>
	'only' in r
		? { only: Object.freeze([...r.only]) }
		: { recommended: Object.freeze([...r.recommended]), default: r.default }

/**
 * Declared genres, by id.
 *
 * ⚠ **Registered, not merely returned**: a session holds a genre id, and this
 * is what turns that id back into its shape, envoys, defaults and what it
 * plays best with. (🚧 Since RF fix 8 a genre brings no attribute slots: the
 * session's rules answer "does THIS session have health?".)
 *
 * Stored as a fact about the running code, like every other registry here: an
 * identical re-declaration is a no-op so a dev-server reload does not throw,
 * and a *different* declaration under a claimed id throws with both hashes
 * named.
 */
const registry = new Map<string, GenreDecl>()

/** Display text stripped from the comparison — see `SLOT_DISPLAY_KEYS`. */
const GENRE_DISPLAY_KEYS = { display: ['name', 'description'] } as const

/** @internal */
export const getGenre = (id: string): GenreDecl | undefined => registry.get(id)
/** @experimental */
export const genres = (): GenreDecl[] => [...registry.values()]
/** @experimental */
export function _clearGenres(): void {
	registry.clear()
}

/**
 * Register a genre from a package's **stored manifest** — the declaration
 * `genre()` already built and `serene-pub build` serialised, which the host
 * reads back because it never evaluates a plugin's code in-process.
 *
 * Not `genre()`: that is the authoring door and takes values (widget refs,
 * `EnabledWhenDecl`), where a manifest holds their compiled form (widget ids,
 * normalised predicates) — re-running the authoring checks over it would
 * refuse the very shape they produced. What is checked here is what a stored
 * row can still get wrong: the id grammar, the `core:` namespace, and that the
 * owner segment is the declaring package's. A present entry is **replaced**,
 * like a stored slot: the manifest is the one author, and an upgraded package
 * re-registering is that author, not a second party.
 * @internal
 */
export function _registerPackageGenre(packageId: string, raw: GenreDecl): GenreDecl {
	const id = typeof raw?.id === 'string' ? raw.id : ''
	assertGenreId(id)
	if (id.startsWith('core:'))
		throw new Error(`package '${packageId}' may not declare '${id}': the 'core:' namespace is reserved.`)
	if (id.slice(0, id.indexOf(':')) !== packageId)
		throw new Error(`genre '${id}' is not under '${packageId}' — a package declares only its own genres`)
	if (!raw.name || typeof raw.family !== 'string')
		throw new Error(`genre '${id}' has no name or family — not a genre declaration`)
	const events = { ...(raw.events ?? {}) }
	events[sessionEvents.sessionCreated] = { ...(events[sessionEvents.sessionCreated] ?? {}), required: true }
	// A stored `summarize` the authoring door would refuse is dropped rather
	// than refused: the host then runs core's default summarizer, which is the
	// standing "fall back, never strand the session" rule for a stale binding.
	// 🚧 RF fix 8: a manifest built before genres stopped bringing attributes
	// may still carry `slots`, `sheets` or `customAttributes` — never refused
	// (a stored row is not the author). ⏳ What its `slots` and `sheets` named
	// becomes the genre's TOOL STATE (`declareHostState`): its own pipelines
	// keep writing it, and it is never an attribute — until the package moves
	// it to annex fields, as `genre()` now tells its author to.
	const { summarize: storedSummarize, slots: storedSlots, sheets: storedSheets, customAttributes: _custom, ...rest } = raw as GenreDecl & Record<'slots' | 'sheets' | 'customAttributes', unknown>
	const kept: { slot: string; owners?: readonly SlotAppliesTo[] }[] = []
	for (const sheet of Array.isArray(storedSheets) ? storedSheets : [])
		for (const e of Array.isArray((sheet as { slots?: unknown })?.slots) ? ((sheet as { slots: unknown[] }).slots as { id?: unknown; appliesTo?: unknown }[]) : [])
			if (typeof e?.id === 'string' && !kept.some((k) => k.slot === e.id))
				kept.push({ slot: e.id, ...(Array.isArray(e.appliesTo) && e.appliesTo.length ? { owners: e.appliesTo as SlotAppliesTo[] } : {}) })
	for (const d of Array.isArray(storedSlots) ? (storedSlots as { id?: unknown }[]) : [])
		if (typeof d?.id === 'string' && !kept.some((k) => k.slot === d.id)) kept.push({ slot: d.id })
	const summarize =
		storedSummarize !== undefined && !genreSummarizeFindings(storedSummarize).length
			? storedSummarize
			: undefined
	const decl: GenreDecl = Object.freeze({
		...rest,
		...(summarize?.scene !== undefined ? { summarize: Object.freeze({ scene: summarize.scene }) } : {}),
		events: Object.freeze(events),
	})
	registry.set(id, decl)
	_withdrawHostStateOf(id)
	if (kept.length) declareHostState(kept.map((k) => ({ slot: k.slot, role: 'tool' as const, genres: [id], ...(k.owners ? { owners: k.owners } : {}) })))
	return decl
}

/**
 * Withdraw a package's genre, so a disabled or uninstalled plugin's genre stops
 * resolving and an upgraded package may declare it again, differently. The
 * host's to call when it reconciles plugin genres. `core:` genres are never
 * withdrawn: they arrive and leave with the build.
 * @internal
 */
export function _withdrawGenre(id: string): boolean {
	if (id.startsWith('core:')) return false
	// 🚧 RF fix 8: what the host kept for its tools goes with it.
	_withdrawHostStateOf(id)
	return registry.delete(id)
}

/**
 * The envoys a genre declares, by id — empty for a genre this build does not
 * declare: an unknown genre's envoys are never guessed.
 * @experimental
 */
export const genreEnvoys = (id: string): readonly EnvoyDecl[] => registry.get(id)?.envoys ?? []

/**
 * The genre's fallback envoy (`EnvoyDecl.fallback`) — the speaker a line
 * nobody claims posts as — or undefined when it declares none.
 * @experimental
 */
export const genreFallbackEnvoy = (g: GenreDecl | string): EnvoyDecl | undefined =>
	(typeof g === 'string' ? registry.get(g)?.envoys : g.envoys)?.find((e) => e.fallback === true)

/** One of a genre's envoys by key, or undefined. @experimental */
export const genreEnvoy = (
	g: GenreDecl | string,
	key: string,
): EnvoyDecl | undefined =>
	(typeof g === 'string' ? registry.get(g)?.envoys : g.envoys)?.find((e) => e.key === key)

/**
 * The genre's enabled-when default for one function, by id or declaration —
 * empty for a genre this build does not declare or a function it says
 * nothing about, on the same "never guess" terms as `genreEnvoys`.
 * @internal
 */
export const genreEnabledWhen = (g: GenreDecl | string, fn: string): readonly EnabledWhen[] =>
	(typeof g === 'string' ? registry.get(g)?.enabledWhen : g.enabledWhen)?.[fn] ?? []

/** 🚧 The genre's settle mode, default resolved. @experimental */
export function historySettleOf(genre: unknown): HistorySettle {
	const settle = (genre as { history?: { settle?: unknown } } | null | undefined)?.history?.settle
	return (HISTORY_SETTLES as readonly unknown[]).includes(settle) ? (settle as HistorySettle) : 'on-commit'
}

/** A genre reference as it lands in documents: always the id. Takes a `GenreDecl`, a `use()` ref or an id. @experimental */
export const genreIdOf = (g: GenreDecl | { readonly id: string } | string): string => {
	const id = typeof g === 'string' ? g : g.id
	assertGenreId(id)
	return id
}

/**
 * The configurable surface of one envoy, as a slot declaration.
 *
 * An envoy is not a node and has no registry row to carry a declaration —
 * so the SDK declares its slot from the two facts the genre does carry, its
 * `prompts` defaults and its name, the way `clauseSettingsSlotFor` declares
 * a gather clause's mode. A host renders it through the same reader a node's
 * slot goes through, at the address `envoy:<key>` (`envoyConfigKey`), with
 * the genre's text as the author default: an admin's edit is a deviation
 * above it, and clearing the edit is the genre's text again.
 *
 * `parameters`, not `prompts`, and the reason is what each kind means to a
 * panel: a `prompts` slot is a **reference** to a swappable prompt row, and
 * an envoy's instructions are not a row anybody swaps — they are the genre's
 * words, tuned in place. The slot is still *named* `prompts`, because that
 * is the name the reading node's own slot has and the name `slot.prompts({
 * envoy })` resolves at; the fields are that node's fields.
 * @internal
 * @ruling R-18 (2)
 */
export function envoyPromptsSlotFor(envoy: EnvoyDecl): SlotDecl {
	return {
		kind: 'parameters',
		facet: 'prompts',
		quick: true,
		description: {
			en: 'The written instructions this envoy speaks under. The genre ships them; edit them here to change how it answers.',
		},
		schema: {
			systemPrompt: {
				type: 'text',
				quick: true,
				default: envoy.prompts?.systemPrompt ?? '',
				label: { en: 'System prompt' },
				description: {
					en: "Who the envoy is and how it should answer — the reply's instructions, in the envoy's own words.",
				},
			},
			postHistoryInstructions: {
				type: 'text',
				default: envoy.prompts?.postHistoryInstructions ?? '',
				label: { en: 'Post-history instructions' },
				description: {
					en: 'Instructions placed after the conversation, just before the envoy answers. Empty unless the genre or you put something here.',
				},
			},
		},
	}
}
