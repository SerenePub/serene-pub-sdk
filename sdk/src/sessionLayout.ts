/**
 * The **session layout** (`SessionLayoutV1`) — the ONE layout
 * format: what the screen draws, what a person arranges, what a genre or a
 * plugin ships (`GenreLayoutDecl.preset`), and what a **session layout preset**
 * row stores. Plain JSON, stored verbatim; every reader reads it defensively,
 * so a key this build does not know degrades rather than throws.
 *
 * ## The shape in one paragraph
 *
 * Its **arrangement** is `panels` ({@link PanelLayoutV2}): three plain
 * stacks — `left`, `middle`, `right` — of **panels**, a panel being a box
 * that holds widgets as tabs, the thing a person drags and sees. There is no
 * pin: every panel is open. A panel may state a `priority` (`low` gives way
 * first when a zone runs short; absent is its open widget's declaration), and
 * the layout's look — `backing`, `opacity`, `gap`, `behind`, `behindDim` — sits inside `panels` too.
 * When `panels` is present it is the whole truth.
 *
 * ⏳ Version 1 panels (the middle as `above` / `primary` / `below`, a pin per
 * panel) and, before them, three slots — `zoneLayout`, `widgetGrid` and
 * `arrangedGrid`, three views of one placement — are still typed and still
 * read: 0.6 is in users' hands and plugin manifests carry them. The old slots
 * become version 1 by {@link panelsFromSlots}, and version 1 becomes version 2
 * by {@link panelsV2Of} — the ONE converter every reader reuses. The slots
 * are dropped at the 0.7 squash, with `panelsFromSlots`.
 *
 * What the screen DRAWS is one reading: {@link resolveDrawn} (→
 * {@link DrawnLayout}) reads {@link panelsOf}, drops retired widgets, and
 * gives every panel a height and a priority (its own, else its widget's
 * declaration). The id readers that ask "is it drawn"
 * ({@link drawnWidgetIds}, {@link primaryPlaced}) are that answer.
 *
 * A named layout adds `widgetSettings` and `widgetStyles` (per-instance values
 * and style pins), so one blob is the portable layout. A session keeps those
 * two in its own rows instead, and its row adds the surface manager's
 * bookkeeping (`active`, `tierSizeOverrides`), which is the app's.
 *
 * ## Widget instance ids
 *
 * A layout places a widget under a **widget instance id**: the widget id
 * itself (`messages`, `acme.maps:map`), or `<widget id>#<instance name>` for
 * another copy of it in the same layout (`messages#sanctum`). Everything a
 * layout keys per placed copy — a panel's tabs, the old slots' lists and
 * cells, the `widgetSettings` and `widgetStyles` keys — is an instance id;
 * everything about the widget (its declaration, its style rows) is read
 * through {@link widgetOfInstance}.
 *
 * ## The converters, and what is deliberately not here
 *
 * The SDK owns two converters, and no other: {@link panelsFromSlots} (the old
 * slots read as version 1 panels) and {@link panelsV2Of} (version 1, or the
 * slots, read as version 2). They are here rather than in the app because
 * four readers need the same answer — the packager's compiler, plugin manifests in the wild
 * (which ship the old slots and keep working with no manifest change), the
 * goldens, and the app's boot pass that writes `panels` onto stored rows — and
 * two answers to one conversion would be a bug. Every other normaliser, the renderer
 * and all measurement are the app's, which reads a stored blob it did not
 * write and must repair rather than refuse. This module types the format,
 * reads the ids out of it, and checks a layout a package SHIPS
 * ({@link validateSessionLayout}), where refusing is right. No `svelte`
 * import, ever: a linked package that imports svelte gives the app a second
 * Svelte.
 * @ruling NOMENCLATURE §9
 */

import { parsePluginWidgetId } from './surfaces.js'
import type { WidgetDecl } from './layout.js'

// ── Zones ───────────────────────────────────────────────────────────────────

/** The three zones, in visual order. There is no fourth. @experimental */
export const ZONE_IDS = ['left', 'middle', 'right'] as const
/** @experimental */
export type ZoneId = (typeof ZONE_IDS)[number]

// ── Widget instance ids ─────────────────────────────────────────────────────

/** The separator between a widget id and an instance name. @experimental */
export const INSTANCE_NAME_SEPARATOR = '#'

/** An instance name: short, kebab, lower case (`sanctum`, `2`). @experimental */
export const INSTANCE_NAME = /^[a-z0-9][a-z0-9-]{0,31}$/

/** Core's widget id grammar — the bare half a package never namespaces. */
const CORE_WIDGET_ID = /^[a-z][a-z0-9-]*$/

/** The widget half of a placed id as written — the id up to its `#`, else the id — before any alias. */
function writtenWidgetOf(instanceId: string): string {
	const at = instanceId.indexOf(INSTANCE_NAME_SEPARATOR)
	return at > 0 ? instanceId.slice(0, at) : instanceId
}

/** The instance name half as written (`2` of `world-state#2`), before any alias. */
function writtenNameOf(instanceId: string): string | null {
	const at = instanceId.indexOf(INSTANCE_NAME_SEPARATOR)
	return at > 0 && at < instanceId.length - 1 ? instanceId.slice(at + 1) : null
}

/**
 * The widget a placed id is a copy of: the id up to its `#`, else the id —
 * read through {@link WIDGET_ID_ALIASES}, so `world-state` is a copy of
 * `stats`. @experimental
 */
export function widgetOfInstance(instanceId: string): string {
	return resolveWidgetAlias(instanceId).widgetId
}

/**
 * The instance name of a copy (`sanctum` of `messages#sanctum`), or `null` for
 * the widget itself. An aliased id answers the name it reads as
 * (`world-state` → `world`, {@link resolveWidgetAlias}), so the pair
 * {@link widgetOfInstance} · `instanceNameOf` always names one copy.
 * @experimental
 */
export function instanceNameOf(instanceId: string): string | null {
	return writtenNameOf(resolveWidgetAlias(instanceId).instanceId)
}

/** Is this placed id a copy of `widgetId` — the widget itself or one of its instances? @experimental */
export function isInstanceOf(instanceId: string, widgetId: string): boolean {
	return widgetOfInstance(instanceId) === widgetId
}

/**
 * Is this string a widget instance id a layout may place? The widget half is
 * core's grammar (`world-state`) or a plugin's namespaced one
 * (`acme.maps:map`, `parsePluginWidgetId`); the instance name, when there is
 * one, is {@link INSTANCE_NAME}.
 * @experimental
 */
export function isWidgetInstanceId(id: unknown): id is string {
	if (typeof id !== 'string' || !id) return false
	const at = id.indexOf(INSTANCE_NAME_SEPARATOR)
	const widget = at < 0 ? id : id.slice(0, at)
	if (at >= 0 && !INSTANCE_NAME.test(id.slice(at + 1))) return false
	return CORE_WIDGET_ID.test(widget) || parsePluginWidgetId(widget) !== null
}

/**
 * Widget ids that name nothing any build places. A saved layout, a preset or
 * an arrangement may still carry one — all three are stored verbatim and
 * nothing rewrites them — so every reader drops it.
 *
 * `composer` is NOT one: it is a widget again — the owner's R8, 2026-11-05,
 * "Split the messages, composer and activity status/turn select into three
 * widgets", which supersedes NOMENCLATURE §23's 2026-09-16 "composer (the
 * widget) — Merged into messages". Only the ⏳ old slots still never draw
 * one ({@link LEGACY_SLOT_DROPPED}).
 *
 * `inventory` is one because core's Inventory widget was removed (2026-09-25)
 * for now, with no replacement. Adventure and Lair shipped it, so layouts and
 * presets saved from them name it; dropping it here is what makes such a
 * layout open on the widgets it still has — nothing drawn in its place, no
 * labelled placeholder. What somebody carries is the `inventory` stat, which
 * the stats widget draws as a list. Take it off this list if the widget comes
 * back.
 * @experimental
 * @ruling R79
 */
export const RETIRED_WIDGET_IDS: ReadonlySet<string> = new Set(['inventory'])

/**
 * ⏳ Widget ids the OLD-SLOT path drops, so a slot-era blob never revives a
 * composer: before the split (2026-11-05) the field was `messages`' own, and
 * a slot that names `composer` meant nothing. Read ONLY by {@link panelsFromSlots}'s
 * conversion — nowhere else; a `panels` layout places `composer` freely.
 * @experimental
 */
export const LEGACY_SLOT_DROPPED: ReadonlySet<string> = new Set(['composer'])

/**
 * 🚧 The ids of the two widgets the conversation splits into, for a copy of
 * `messages`: `messages` → `composer`, `turn-line`; `messages#x` →
 * `composer#x`, `turn-line#x`. Pure.
 * @experimental
 */
export function conversationSplitIds(instanceId: string): { composer: string; turnLine: string } {
	const name = instanceNameOf(instanceId)
	const at = name === null ? '' : `${INSTANCE_NAME_SEPARATOR}${name}`
	return { composer: `composer${at}`, turnLine: `turn-line${at}` }
}

// ── Widget id aliases ───────────────────────────────────────────────────────

/**
 * One widget id that now reads as another widget with some settings implied
 * ({@link WIDGET_ID_ALIASES}).
 * @experimental
 */
export interface WidgetIdAlias {
	/** The widget it is now (`stats`). */
	id: string
	/**
	 * The instance name it reads as (`world`): `world-state` is `stats#world`,
	 * `world-state#2` is `stats#world-2`.
	 */
	instanceName: string
	/**
	 * The settings the old widget meant, merged UNDER the instance's own — a
	 * preset's and a person's stored values win. A reader takes them as the
	 * instance's defaults.
	 */
	settings: Readonly<Record<string, unknown>>
}

/**
 * ⏳ Widget ids that are another widget now — an ALIAS, not a retirement: a
 * stored layout, preset or arrangement that places one keeps drawing what it
 * drew, as a copy of the widget it became with the settings it meant
 * ({@link resolveWidgetAlias}). Every id reader goes through it
 * ({@link widgetOfInstance}, {@link resolveDrawn}, {@link validateSessionLayout}),
 * so an aliased id is neither retired nor unknown.
 *
 * `world-state` is one since the Stats uplift: World State was Stats drawn for the world, as a strip — one
 * capability, so one widget, with `owners` and `arrangement` settings. A
 * layout written today places `stats#world` with those settings itself (and
 * `title: 'World State'`, as core's shipped layouts do).
 * REMOVE in 0.7.0, with the `world-state` declaration (rewritten layouts
 * have had a release to land).
 * @experimental
 * @ruling PLAN-core-widgets W7 (2026-10-11)
 */
export const WIDGET_ID_ALIASES: Readonly<Record<string, WidgetIdAlias>> = Object.freeze({
	'world-state': Object.freeze({
		id: 'stats',
		instanceName: 'world',
		// `title` is core's own setting (every widget has one): an existing
		// placed World State keeps its name rather than reading "Stats".
		settings: Object.freeze({ owners: 'world', arrangement: 'strip', title: 'World State' }),
	}),
})

/**
 * A placed id read through {@link WIDGET_ID_ALIASES} — what
 * {@link resolveWidgetAlias} answers.
 * @experimental
 */
export interface ResolvedWidgetAlias {
	/** The widget it is a copy of (`stats` for `world-state`). */
	widgetId: string
	/**
	 * The instance id it reads as — `stats#world` for `world-state`,
	 * `stats#world-2` for `world-state#2` — what a layout written today would
	 * place. NOT a storage key: stored settings, style pins and a layout's
	 * own lists stay keyed by the id as placed. The id itself when nothing
	 * is aliased.
	 */
	instanceId: string
	/** The settings the alias implies, merged under the instance's own; `{}` when none. */
	impliedSettings: Readonly<Record<string, unknown>>
	/** The aliased widget id (`world-state`), or `null` when the id is not an alias. */
	aliasedFrom: string | null
}

const NO_SETTINGS: Readonly<Record<string, unknown>> = Object.freeze({})

/** An instance name cut to {@link INSTANCE_NAME}'s length, never ending on a `-`. */
const nameWithin = (name: string): string => name.slice(0, 32).replace(/-+$/, '')

/**
 * Read a placed id through {@link WIDGET_ID_ALIASES}. An id that is no alias
 * answers itself, its widget and no settings.
 *
 * The id it reads as is stable — `world-state` is always `stats#world`,
 * `world-state#n` always `stats#world-n` — and, given the ids already placed
 * (`taken`), collision-safe: one a layout already places is skipped for the
 * next free `-2`, `-3`… So a caller rewriting a layout passes every id it
 * places.
 * @experimental
 */
export function resolveWidgetAlias(instanceId: string, taken?: Iterable<string>): ResolvedWidgetAlias {
	const written = writtenWidgetOf(instanceId)
	const alias = Object.hasOwn(WIDGET_ID_ALIASES, written) ? WIDGET_ID_ALIASES[written] : undefined
	if (!alias) return { widgetId: written, instanceId, impliedSettings: NO_SETTINGS, aliasedFrom: null }
	const own = writtenNameOf(instanceId)
	const name = nameWithin(own ? `${alias.instanceName}-${own}` : alias.instanceName)
	let canonical = `${alias.id}${INSTANCE_NAME_SEPARATOR}${name}`
	if (taken) {
		const placed = new Set(taken)
		placed.delete(instanceId)
		for (let n = 2; placed.has(canonical); n++)
			canonical = `${alias.id}${INSTANCE_NAME_SEPARATOR}${nameWithin(name.slice(0, 32 - `-${n}`.length))}-${n}`
	}
	return { widgetId: alias.id, instanceId: canonical, impliedSettings: alias.settings, aliasedFrom: written }
}

// ── The shape ───────────────────────────────────────────────────────────────

/**
 * One width rule of a side zone's ladder. `min` is the session box's inline
 * size (px) at or above which the rule applies; rules merge ascending, each
 * stating only what changes.
 * @experimental
 */
export interface LayoutZoneRule {
	min: number
	/** A side: `drawer` · `rail` · `icons` · `hidden`. A strip: `row` · `hidden`. */
	mode?: 'drawer' | 'rail' | 'icons' | 'hidden' | 'row'
	/** The rail's or drawer's inline size, px. */
	width?: number
	/** Rail stack columns (a wide screen turns a rail into a grid). */
	columns?: number
}

/**
 * ⏳ One zone of `zoneLayout`: a side column (or a strip) and the widgets it
 * lists, in order. Read only by {@link panelsFromSlots} (and its `rules`, by
 * {@link zoneRungAt}); dropped at the 0.7 squash.
 *
 * Where the page draws it is `side` (a side zone) or `area` (a strip) — never
 * its key — and a zone that does not say it is a strip is a side.
 * @experimental
 */
export interface LayoutZoneDef {
	kind: 'side' | 'strip'
	/** A side zone's edge. Absent is the right: state it. */
	side?: 'left' | 'right'
	/** A strip: above or below the conversation. Absent is the top: state it. */
	area?: 'top' | 'bottom'
	/** The editor's label; the zone's key when absent. */
	label?: string
	/** A docked column when absent or `true`; an icon strip when `false`. */
	pinned?: boolean
	/** Widget instance ids, in order. */
	widgets: string[]
	/** The width ladder. Absent means the default for where it is drawn ({@link DEFAULT_SIDE_RULES}, {@link DEFAULT_STRIP_RULES}). */
	rules?: LayoutZoneRule[]
}

/**
 * ⏳ The `zoneLayout` slot — read only by {@link panelsFromSlots} (and its
 * zones' `rules`, a side's width ladder); dropped at the 0.7 squash. A zone is keyed by where the page draws it: a side
 * zone by its `side` (`left`, `right`), a strip by its `area` (`top`,
 * `bottom`) — so one layout has at most one of each, and the key and the
 * field never disagree (`validateSessionLayout` refuses a layout where they
 * do). The middle has no zone here: its membership is the widget grid's. The
 * type is a string record because a stored blob is read as it was written.
 * @experimental
 */
export interface ZoneLayoutV1 {
	version: 1
	zones: Record<string, LayoutZoneDef>
	/** The message pack by name (`novel`), the id-free way to pick one. */
	styles?: { chat?: string }
}

/**
 * ⏳ How a grid widget sizes on one axis: `grow` fills what is left (a `1fr`
 * track), `fixed` is content-sized (`auto`), or a number of cells.
 * @experimental
 */
export type GridSizeSpec = 'grow' | 'fixed' | { minCells?: number; maxCells?: number; cells?: number }

/**
 * ⏳ The edges of its space a widget sticks to as the grid reflows (read only
 * by {@link panelsFromSlots}, for panel order). ⚠ Not a lore
 * entry's **anchor** (the reference that governs its visibility).
 * @experimental
 */
export interface WidgetAnchor {
	top?: boolean
	bottom?: boolean
	left?: boolean
	right?: boolean
}

/**
 * ⏳ One widget in the widget grid.
 * ⏳ Read only by {@link panelsFromSlots}; dropped at the 0.7 squash.
 * @experimental
 */
export interface GridWidget {
	/** A widget instance id. */
	id: string
	zone: ZoneId
	/** Its place in the zone's stack, top to bottom. */
	order: number
	/** Cells wide; absent spans the zone. */
	colSpan?: number
	size: { w: GridSizeSpec; h: GridSizeSpec }
	anchor: WidgetAnchor
	/** Stays visible when the drawer is closed. Absent means pinned ({@link pinnedOf}). */
	pinned?: boolean
	/** Only meaningful when pinned: the card background toggle. */
	background?: boolean
	/** Tab-group membership. */
	group?: string
}

/**
 * ⏳ The `widgetGrid` slot.
 * ⏳ Read only by {@link panelsFromSlots}; dropped at the 0.7 squash.
 * @experimental
 */
export interface WidgetGridV1 {
	version: 1
	/** The cell module, px. */
	cell: number
	widgets: GridWidget[]
}

/**
 * ⏳ One widget's cell box in an arranged zone (read only by
 * {@link panelsFromSlots}; dropped at the 0.7 squash): 0-based origin and span, in whole
 * cells of that zone's grid.
 * @experimental
 */
export interface ArrangedItem {
	/** A widget instance id. */
	id: string
	x: number
	y: number
	w: number
	h: number
	anchor?: WidgetAnchor
	/** Tab-group membership: items sharing one draw as one tab set (`g:` + the sorted members). */
	group?: string
	/** Docked in a side column. ABSENT MEANS PINNED ({@link pinnedOf}); `false` is the only value written. */
	pinned?: boolean
}

/**
 * ⏳ One zone's arrangement: its cell grid and the items on it.
 * ⏳ Read only by {@link panelsFromSlots}; dropped at the 0.7 squash.
 * @experimental
 */
export interface ArrangedZone {
	cols: number
	rows: number
	items: ArrangedItem[]
}

/**
 * ⏳ The `arrangedGrid` slot: one arrangement per zone that has one.
 * ⏳ Read only by {@link panelsFromSlots}; dropped at the 0.7 squash.
 * @experimental
 */
export type ArrangedGridV1 = Partial<Record<ZoneId, ArrangedZone>>

/**
 * A **style pin** a layout carries: the widget style it draws with. A person's
 * saved layout carries `{ id, slug }` from their pins; a shipped one can know
 * only the slug, because a row id belongs to one install.
 * @experimental
 */
export interface WidgetStylePin {
	slug: string
	id?: number
}

// ── Panels ──────────────────────────────────────────────────────────────────

/**
 * The height a side or strip panel takes: `fit` its content, `fill` an equal
 * share of what is left (absent means `fill`), or `{ share }` twelfths of the
 * zone's docked height — an integer 1–12, counted only among that zone's
 * docked panels.
 * @experimental
 */
export type PanelHeightV1 = 'fit' | 'fill' | { share: number }

/**
 * A **panel**: a box in a zone that holds widgets as tabs. The thing a person
 * drags, pins and sees.
 * @experimental
 */
export interface PanelV1 {
	/** Stable within one layout; `p` + a counter. Never an instance id. */
	key: string
	/** Widget instance ids, in tab order. At least one. */
	tabs: string[]
	/** The tab last shown; absent is `tabs[0]`. */
	open?: string
	/**
	 * ABSENT MEANS DOCKED ({@link pinnedOf}); `false` is in the rail, and the
	 * only value written. Refused on a middle panel: the middle never pins.
	 * @deprecated ⏳ removed at 0.7 (owner's call) — version 2 has no pin.
	 */
	pinned?: false
	/** A side or strip panel's height; absent is `fill`. */
	height?: PanelHeightV1
	/** A person's name for the panel, shown only when it holds two or more tabs. */
	title?: string
}

/** A side zone's panels, top to bottom. @experimental */
export type PanelZoneV1 = PanelV1[]

/**
 * The middle: the `primary` panel (it fills), with panels `above` and `below`
 * it, each top to bottom.
 * @experimental
 * @deprecated ⏳ removed at 0.7 (owner's call) — version 2's middle is one list.
 */
export interface PanelMiddleV1 {
	above: PanelV1[]
	primary: PanelV1
	below: PanelV1[]
}

/**
 * The `panels` slot — the arrangement. When a layout has it, it is the whole
 * truth: the old slots are not read.
 *
 * Rules the type cannot say ({@link validateSessionLayout}): an instance id
 * sits in at most one panel across the layout; `middle.primary` holds at
 * least one tab; a layout places one copy of the conversation somewhere;
 * `pinned: false` means nothing in the middle, and is refused there.
 * @experimental
 */
export interface PanelLayoutV1 {
	version: 1
	left: PanelZoneV1
	middle: PanelMiddleV1
	right: PanelZoneV1
}

/**
 * 🚧 How much a panel claims when a zone runs short: `low` gives way first,
 * then `normal`; `high` last.
 * @experimental
 */
export type PanelPriority = 'high' | 'normal' | 'low'

/**
 * 🚧 What a panel is backed by: a `card`, `glass` (translucent), or `none`.
 * @experimental
 */
export type PanelBacking = 'card' | 'glass' | 'none'

/**
 * 🚧 The space between panels in a zone.
 * @experimental
 */
export type PanelGap = 'tight' | 'comfortable' | 'spacious'

/**
 * 🚧 A {@link PanelGap} in px.
 * @experimental
 */
export const PANEL_GAP_PX: Readonly<Record<PanelGap, number>> = Object.freeze({ tight: 4, comfortable: 12, spacious: 24 })

/**
 * 🚧 The layout's look: what backs a panel, how opaque, and the gap between
 * panels.
 * @experimental
 */
export interface PanelLook {
	backing: PanelBacking
	/** Percent, 0–100. */
	opacity: number
	gap: PanelGap
	/** 🚧 What shows behind the panels: the person's own background (absent, `'background'`) or the session's backdrop. */
	behind?: 'background' | 'backdrop'
	/** 🚧 Percent, 0–100, darkening the backdrop behind the panels; absent is 0. */
	behindDim?: number
}

/**
 * 🚧 The look a layout that states none has.
 * @experimental
 */
export const DEFAULT_PANEL_LOOK: Readonly<PanelLook> = Object.freeze({ backing: 'card', opacity: 100, gap: 'comfortable', behind: 'background', behindDim: 0 })

/**
 * 🚧 A **panel** in version 2: a box in a zone that holds widgets as tabs.
 * There is no pin — every panel is open.
 * @experimental
 */
export interface PanelV2 {
	/** Stable within one layout; `p` + a counter. Never an instance id. */
	key: string
	/** Widget instance ids, in tab order. */
	tabs: string[]
	/** The tab last shown; absent is `tabs[0]`. */
	open?: string
	/** The panel's height; absent is the open tab's declaration (`WidgetDecl.panel.height`), else `fill`. */
	height?: PanelHeightV1
	/**
	 * Absent = the open tab's widget declaration (`WidgetDecl.panel.priority`),
	 * else `'normal'`. When a zone runs short, `low` gives way first, then
	 * `normal`.
	 */
	priority?: PanelPriority
	/** A person's name for the panel, shown only when it holds two or more tabs. */
	title?: string
}

/**
 * 🚧 The `panels` slot in version 2 — the arrangement: three plain stacks of
 * panels, top to bottom, no pin, and the layout's look beside them. The
 * middle is never empty. `opacity` is a percent, 0–100; an absent look value
 * is {@link DEFAULT_PANEL_LOOK}'s.
 * @experimental
 */
export interface PanelLayoutV2 {
	version: 2
	left: PanelV2[]
	middle: PanelV2[]
	right: PanelV2[]
	backing?: PanelBacking
	opacity?: number
	gap?: PanelGap
	/** 🚧 What shows behind the panels: the person's own background (absent, `'background'`) or the session's backdrop. */
	behind?: 'background' | 'backdrop'
	/** 🚧 Percent, 0–100, darkening the backdrop behind the panels; absent is 0. */
	behindDim?: number
}

/**
 * The **session layout**. Every slot is optional: a layout says what it
 * arranges and nothing else.
 * @experimental
 */
export interface SessionLayoutV1 {
	/**
	 * The arrangement. When present it is the whole truth. Version 2
	 * ({@link PanelLayoutV2}) is what is written; version 1
	 * ({@link PanelLayoutV1}) stays readable, converted on read by
	 * {@link panelsV2Of}.
	 */
	panels?: PanelLayoutV1 | PanelLayoutV2
	/** ⏳ Read only by {@link panelsFromSlots} (and its `rules`, a side's width ladder); dropped at the 0.7 squash. */
	zoneLayout?: ZoneLayoutV1
	/** ⏳ Read only by {@link panelsFromSlots}; dropped at the 0.7 squash. */
	widgetGrid?: WidgetGridV1
	/** ⏳ Read only by {@link panelsFromSlots}; dropped at the 0.7 squash. */
	arrangedGrid?: ArrangedGridV1
	/** Per-instance widget settings, keyed by widget instance id. */
	widgetSettings?: Record<string, Record<string, unknown>>
	/** Style pins, keyed by widget instance id. */
	widgetStyles?: Record<string, WidgetStylePin>
}

// ── Reading the old slots ───────────────────────────────────────────────────

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x)

const strings = (x: unknown): string[] =>
	Array.isArray(x) ? x.filter((s): s is string => typeof s === 'string') : []

/** The conversation's widget id (`CONVERSATION_WIDGET_ID`, which `genres.ts` owns; not imported, to keep this module a leaf). */
const CONVERSATION = 'messages'

/** An arranged zone's ids in reading order (by row, then column), or null when the zone has none. */
function arrangedIn(layout: SessionLayoutV1, zone: ZoneId): string[] | null {
	const frame = isObj(layout.arrangedGrid) ? (layout.arrangedGrid as Record<string, unknown>)[zone] : undefined
	if (!isObj(frame) || !Array.isArray(frame.items)) return null
	return (frame.items as unknown[])
		.filter((i): i is ArrangedItem => isObj(i) && typeof i.id === 'string')
		.map((i) => ({ id: i.id, x: Number(i.x) || 0, y: Number(i.y) || 0 }))
		.sort((a, b) => a.y - b.y || a.x - b.x)
		.map((i) => i.id)
}

/** The zone definitions of `zoneLayout`, whatever its keys. */
function zoneDefs(layout: SessionLayoutV1): Array<Record<string, unknown>> {
	const zones: unknown = isObj(layout.zoneLayout) ? layout.zoneLayout.zones : undefined
	return isObj(zones) ? Object.values(zones).filter(isObj) : []
}

/** The zone definitions of `zoneLayout` with their keys, in declared order. */
function zoneEntries(layout: SessionLayoutV1): Array<[string, Record<string, unknown>]> {
	const zones: unknown = isObj(layout.zoneLayout) ? layout.zoneLayout.zones : undefined
	return isObj(zones) ? Object.entries(zones).filter((e): e is [string, Record<string, unknown>] => isObj(e[1])) : []
}

/**
 * Where the page draws a zone of `zoneLayout` — the one rule, which the
 * converter and the validator share: a strip at its `area` (the top unless it
 * says bottom); anything else is a side, on its `side` (the right unless it
 * says left). Never the zone's key.
 */
function zoneDrawnAt(def: Record<string, unknown>): 'left' | 'right' | 'top' | 'bottom' {
	if (def.kind === 'strip') return def.area === 'bottom' ? 'bottom' : 'top'
	return def.side === 'left' ? 'left' : 'right'
}

/** An arranged frame read as the page read it: whole numbers of cells and an item list, else none. */
function frameIn(layout: SessionLayoutV1, zone: ZoneId): { cols: number; rows: number; items: ArrangedItem[] } | null {
	const frame = isObj(layout.arrangedGrid) ? (layout.arrangedGrid as Record<string, unknown>)[zone] : undefined
	if (!isObj(frame) || typeof frame.cols !== 'number' || typeof frame.rows !== 'number' || !Array.isArray(frame.items))
		return null
	const items = (frame.items as unknown[]).filter(
		(i): i is ArrangedItem =>
			isObj(i) && typeof i.id === 'string' && !!i.id && ['x', 'y', 'w', 'h'].every((k) => typeof i[k] === 'number'),
	)
	return { cols: frame.cols, rows: frame.rows, items }
}

/** The grid's well-formed entries for one zone, by `order`. */
function gridZone(layout: SessionLayoutV1, zone: ZoneId): GridWidget[] {
	const widgets = isObj(layout.widgetGrid) && Array.isArray(layout.widgetGrid.widgets) ? layout.widgetGrid.widgets : []
	return widgets
		.filter((w): w is GridWidget => isObj(w) && typeof w.id === 'string' && !!w.id && w.zone === zone)
		.map((w, n) => ({ w, order: typeof w.order === 'number' ? w.order : n }))
		.sort((a, b) => a.order - b.order)
		.map(({ w }) => w)
}

/** Every id the old slots NAME — the zone lists, the grid and the arrangement — each once, in that order. */
function slotWidgetIds(layout: SessionLayoutV1): string[] {
	const out = new Set<string>()
	for (const z of zoneDefs(layout)) for (const id of strings(z.widgets)) out.add(id)
	const grid = isObj(layout.widgetGrid) && Array.isArray(layout.widgetGrid.widgets) ? layout.widgetGrid.widgets : []
	for (const w of grid) if (isObj(w) && typeof w.id === 'string') out.add(w.id)
	for (const zone of ZONE_IDS) for (const id of arrangedIn(layout, zone) ?? []) out.add(id)
	return [...out]
}

/** Is this instance a copy of a retired widget? No reader draws one. */
const retired = (instanceId: string): boolean => RETIRED_WIDGET_IDS.has(widgetOfInstance(instanceId))

/** Does the OLD-SLOT path drop this instance — retired, or a {@link LEGACY_SLOT_DROPPED} widget? Read only by `convertSlots`. */
const slotDropped = (instanceId: string): boolean =>
	retired(instanceId) || LEGACY_SLOT_DROPPED.has(widgetOfInstance(instanceId))

// ── panelsFromSlots: the old slots, read as panels ──────────────────────────

/** What {@link panelsFromSlots} may be told beyond the layout. @experimental */
export interface PanelsFromSlotsOptions {
	/**
	 * The widgets that declare `role: 'primary'` — the stand-in for the
	 * conversation a genre that withholds it ships. Read only when the middle
	 * places no copy of the conversation; a layout carries no roles itself.
	 */
	primaryWidgetIds?: Iterable<string>
}

/** One item of an old slot as the converter reads it: its box (cells, or its list place), group, pin and anchor. */
interface SlotItem {
	id: string
	x: number
	y: number
	w: number
	h: number
	group?: string
	pinned: boolean
	anchor?: WidgetAnchor
}

/** A panel before it has a key. */
type PanelDraft = Omit<PanelV1, 'key'>

const byRow = (a: SlotItem, b: SlotItem) => a.y - b.y || a.x - b.x
const byColumn = (a: SlotItem, b: SlotItem) => a.x - b.x || a.y - b.y

/** An arranged item read as a slot item. */
const fromArranged = (i: ArrangedItem): SlotItem => ({
	id: i.id,
	x: i.x,
	y: i.y,
	w: i.w,
	h: i.h,
	...(typeof i.group === 'string' ? { group: i.group } : {}),
	pinned: pinnedOf(i),
	...(isObj(i.anchor) ? { anchor: i.anchor } : {}),
})

/**
 * Items clustered by `group` tag — an ungrouped item is a cluster of one —
 * each cluster's members ordered by their cell (x, then y), the clusters in
 * the order their first member was read.
 */
function clustersOf(items: readonly SlotItem[]): SlotItem[][] {
	const byGroup = new Map<string, SlotItem[]>()
	const out: SlotItem[][] = []
	for (const i of items) {
		if (i.group === undefined) {
			out.push([i])
			continue
		}
		let c = byGroup.get(i.group)
		if (!c) byGroup.set(i.group, (c = [])), out.push(c)
		c.push(i)
	}
	for (const c of out) c.sort(byColumn)
	return out
}

/** A cluster's top-left: its least row, then its least column. */
const cornerOf = (c: readonly SlotItem[]) => ({ y: Math.min(...c.map((i) => i.y)), x: Math.min(...c.map((i) => i.x)) })

/** Top-anchored first, bottom-anchored last (the app's `collapsedOrder` rule, applied once here). */
const anchorRank = (c: readonly SlotItem[]) =>
	c.some((i) => i.anchor?.top) ? 0 : c.some((i) => i.anchor?.bottom) ? 2 : 1

/** Clusters as panels: tabs in cell order, docked unless every member was unpinned. */
function panelOf(c: readonly SlotItem[], height?: PanelHeightV1): PanelDraft {
	return {
		tabs: c.map((i) => i.id),
		...(c.every((i) => !i.pinned) ? { pinned: false as const } : {}),
		...(height ? { height } : {}),
	}
}

/** The converter's answer, and whether the primary is the floor's (no conversation was placed in the middle). */
function convertSlots(layout: unknown, opts: PanelsFromSlotsOptions = {}): { panels: PanelLayoutV1; floor: boolean } {
	const doc: SessionLayoutV1 = isObj(layout) ? (layout as SessionLayoutV1) : {}
	const seen = new Set<string>()
	/** Admit an instance once, in the old reading order — middle, left, right, strips — never a retired one. */
	const admit = (id: string): boolean => {
		if (slotDropped(id) || seen.has(id)) return false
		seen.add(id)
		return true
	}
	const defs = zoneEntries(doc)

	// The middle: its arrangement whenever it has one (an emptied one
	// included), else the grid's middle entries, a row each by `order`.
	const middleFrame = frameIn(doc, 'middle')
	const middleItems: SlotItem[] = (
		middleFrame
			? middleFrame.items.map(fromArranged).sort(byRow)
			: gridZone(doc, 'middle').map(
					(w, n): SlotItem => ({ id: w.id, x: 0, y: n, w: 1, h: 1, pinned: true, ...(typeof w.group === 'string' ? { group: w.group } : {}) }),
				)
	).filter((i) => admit(i.id))
	const primaryIds = new Set(opts.primaryWidgetIds ?? [])
	const conversations = middleItems.filter((i) => isInstanceOf(i.id, CONVERSATION))
	const lead: SlotItem | undefined = conversations.length
		? conversations.reduce((best, i) => (i.w * i.h > best.w * best.h ? i : best))
		: (middleItems.find((i) => primaryIds.has(widgetOfInstance(i.id))) ?? middleItems[0])
	const primaryMembers = lead
		? lead.group === undefined
			? [lead]
			: middleItems.filter((i) => i.group === lead.group).sort(byColumn)
		: []
	const aboveItems: PanelDraft[] = []
	const belowItems: PanelDraft[] = []
	if (lead) {
		const rest = clustersOf(middleItems.filter((i) => !primaryMembers.includes(i)))
		rest.sort((a, b) => cornerOf(a).y - cornerOf(b).y || cornerOf(a).x - cornerOf(b).x)
		for (const c of rest) {
			// Above its rows, or beside them (no column survives): above. Under them: below.
			const at = cornerOf(c).y
			;(at >= lead.y + lead.h ? belowItems : aboveItems).push({ tabs: c.map((i) => i.id), height: 'fit' })
		}
	}

	// The sides: an arrangement that places anything live, else every zone
	// drawn there, in order, each item taking its zone's pin — with the
	// grid's entries for the side folded in after the first zone's list.
	const side = (edge: 'left' | 'right'): PanelDraft[] => {
		const frame = frameIn(doc, edge)
		let items: SlotItem[]
		if (frame && frame.items.some((i) => !slotDropped(i.id))) items = frame.items.map(fromArranged)
		else {
			items = []
			defs
				.filter(([, d]) => zoneDrawnAt(d) === edge)
				.forEach(([, def], n) => {
					const pinned = pinnedOf(def)
					for (const id of strings(def.widgets)) items.push({ id, x: 0, y: items.length, w: 1, h: 1, pinned })
					if (n === 0)
						for (const w of gridZone(doc, edge))
							items.push({ id: w.id, x: 0, y: items.length, w: 1, h: 1, pinned, ...(typeof w.group === 'string' ? { group: w.group } : {}) })
				})
		}
		const live = items.sort(byRow).filter((i) => admit(i.id))
		return clustersOf(live)
			.map((c, n) => ({ c, n }))
			.sort((a, b) => {
				const ca = cornerOf(a.c)
				const cb = cornerOf(b.c)
				return anchorRank(a.c) - anchorRank(b.c) || ca.y - cb.y || ca.x - cb.x || a.n - b.n
			})
			.map(({ c }) => panelOf(c))
	}
	const left = side('left')
	const right = side('right')

	// The strips: one panel each, first in their area, in declared order.
	const stripsAt = (area: 'top' | 'bottom'): PanelDraft[] =>
		defs
			.filter(([, d]) => d.kind === 'strip' && zoneDrawnAt(d) === area)
			.map(([, d]) => strings(d.widgets).filter((id) => admit(id)))
			.filter((tabs) => tabs.length > 0)
			.map((tabs) => ({ tabs, height: 'fit' as const }))
	const above = [...stripsAt('top'), ...aboveItems]
	const below = [...stripsAt('bottom'), ...belowItems]

	// The primary: the lead's group — else, with nothing in the middle, the
	// panel already holding the bare conversation, moved to the middle, or
	// the floor's conversation.
	let primary: PanelDraft
	let floor = false
	if (lead) {
		const tabs = primaryMembers.map((i) => i.id)
		primary = { tabs, ...(tabs[0] !== lead.id ? { open: lead.id } : {}) }
	} else {
		const holder = [above, below, left, right].find((list) => list.some((p) => p.tabs.includes(CONVERSATION)))
		if (holder) {
			const at = holder.findIndex((p) => p.tabs.includes(CONVERSATION))
			const [moved] = holder.splice(at, 1)
			primary = { tabs: moved!.tabs, ...(moved!.tabs[0] !== CONVERSATION ? { open: CONVERSATION } : {}) }
		} else {
			primary = { tabs: [CONVERSATION] }
			floor = true
		}
	}

	// Keys in discovery order: the primary, above, below, left, right.
	let n = 0
	const keyed = (p: PanelDraft): PanelV1 => ({ key: `p${++n}`, ...p })
	const keyedPrimary = keyed(primary)
	const keyedAbove = above.map(keyed)
	const keyedBelow = below.map(keyed)
	return {
		panels: {
			version: 1,
			left: left.map(keyed),
			middle: { above: keyedAbove, primary: keyedPrimary, below: keyedBelow },
			right: right.map(keyed),
		},
		floor,
	}
}

/**
 * ⏳ The old slots — `zoneLayout`, `widgetGrid`, `arrangedGrid` — read as
 * {@link PanelLayoutV1}. The ONE normaliser the SDK owns (the module header
 * says why). Pure and deterministic; it reads the old slots only, never
 * `panels`, and drops nothing but geometry (cells, sizes, anchors, the
 * grid's cell module).
 *
 * **A side** (`left`, `right`): its arrangement when that places anything
 * live, else every `zoneLayout` zone drawn there, in order, with the grid's
 * entries for the side after the first zone's list. Items are clustered by
 * their `group` tag (an ungrouped item is its own), each cluster one panel
 * with its tabs in cell order (x, then y). Panels run top-anchored first,
 * then by their top-left cell (row, then column), bottom-anchored last. A
 * panel is docked unless every member was unpinned — and an un-arranged
 * zone's items take its pin, so a `pinned: false` zone puts every panel in
 * the rail. Heights are absent (`fill`).
 *
 * **The middle.** Its arrangement whenever it has one (an emptied one
 * included), else the grid's middle entries by `order`, one row each. The
 * primary is the item carrying a copy of the conversation (the largest, if
 * several), else a `role: 'primary'` widget's ({@link PanelsFromSlotsOptions}),
 * else the first; its group's members are the primary panel's tabs, so a
 * grouped `messages#sanctum` stays a tab of it. `zoneLayout` strips come
 * first in their area — `top` above, `bottom` below — a panel each, in
 * declared order; then the rest of the middle, clustered the same way: a
 * cluster whose top row is under the primary's rows goes below, anything
 * else above (beside it included: panels have no columns). Every middle panel
 * but the primary is `height: 'fit'`.
 *
 * **Nothing in the middle.** The panel holding the bare `messages` moves
 * there; with none anywhere, the primary is the floor's conversation,
 * `{ key: 'p1', tabs: ['messages'] }` — so an empty layout yields a valid
 * panel layout. ({@link resolveDrawn} marks that panel `floor`: the layout
 * did not place it, and the id readers do not count it.)
 *
 * Every instance is admitted once, where the old readers drew it first —
 * middle, left, right, strips — and a copy of a retired widget never
 * ({@link RETIRED_WIDGET_IDS}), nor of a {@link LEGACY_SLOT_DROPPED} one. An aliased id ({@link WIDGET_ID_ALIASES})
 * stays the id as placed, the key its settings and style pin live under.
 * Keys run `p1…pn` in discovery order: the primary, above, below, left, right.
 * @experimental
 */
export function panelsFromSlots(layout: SessionLayoutV1, opts?: PanelsFromSlotsOptions): PanelLayoutV1 {
	return convertSlots(layout, opts).panels
}

/** Is this a stored `panels` slot a reader can walk — version 2, or a version 1 with its primary? (Not a validation: {@link validateSessionLayout} is.) */
function storedPanels(layout: unknown): PanelLayoutV1 | PanelLayoutV2 | null {
	if (!isObj(layout)) return null
	const p = layout.panels
	if (isObj(p) && p.version === 2) return p as unknown as PanelLayoutV2
	return isObj(p) && p.version === 1 && isObj(p.middle) && isObj(p.middle.primary) ? (p as unknown as PanelLayoutV1) : null
}

/** A stored zone's panels, defensively: the objects of a list. */
const panelList = (x: unknown): PanelV2[] => (Array.isArray(x) ? x.filter((p): p is PanelV2 => isObj(p)) : [])

// ── panelsV2Of: version 1 and the old slots, read as version 2 ──────────────

/** What {@link panelsV2Of} may be told beyond the layout. @experimental */
export interface PanelsV2Options extends PanelsFromSlotsOptions {
	/** Per-instance settings to read and plan moves over; absent = the layout's own `widgetSettings`. */
	widgetSettings?: Readonly<Record<string, Readonly<Record<string, unknown>>>>
	/** Style pins (any value: a pin or a style id) keyed by instance id; absent = the layout's own `widgetStyles`. */
	widgetStyles?: Readonly<Record<string, unknown>>
}

/**
 * 🚧 One setting the split of `messages` moves or drops: `{ from, to, key,
 * value }` moves `key` of instance `from` onto instance `to` (the composer or
 * turn line made for it); `{ drop, key }` removes `key` from instance `drop`
 * (a key the widget no longer has).
 * @experimental
 */
export type PanelSettingsMove =
	| { from: string; to: string; key: string; value: unknown }
	| { drop: string; key: string }

/**
 * 🚧 {@link panelsV2Of}'s answer: the panels, the settings the split moves or
 * drops, and the style pins the new widgets copy.
 * @experimental
 */
export interface PanelsV2Conversion {
	panels: PanelLayoutV2
	settingsMoves: PanelSettingsMove[]
	styleCopies: Array<{ from: string; to: string }>
}

/** A property of an object, when it is an own one. */
const ownOf = (o: unknown, key: string): unknown => (isObj(o) && Object.hasOwn(o, key) ? o[key] : undefined)

/** Settings keys of a copy of `messages` that the split moves to its composer. */
const COMPOSER_KEYS = ['composer', 'otherTabsComposer', 'showActions'] as const
/** The keys of a copy of `messages` the split drops, after `nextUp`. */
const DROPPED_KEYS = ['composerPosition', 'showComposer', 'showMessages', 'showNudge'] as const

/** A stored panel rebuilt as a version 2 panel: only what version 2 has. */
function flattenPanel(panel: object): PanelV2 {
	const p = panel as Record<string, unknown>
	return {
		key: typeof p.key === 'string' ? p.key : '',
		tabs: strings(p.tabs),
		...(p.open !== undefined ? { open: p.open as string } : {}),
		...(p.height !== undefined ? { height: p.height as PanelHeightV1 } : {}),
		...(p.title !== undefined ? { title: p.title as string } : {}),
	}
}

/** {@link panelsV2Of}, and the keys of the panels the converter's floor made (none for a stored layout). */
function convertToV2(layout: unknown, opts: PanelsV2Options = {}): PanelsV2Conversion & { floorKeys: ReadonlySet<string> } {
	const doc: SessionLayoutV1 = isObj(layout) ? (layout as SessionLayoutV1) : {}
	const stored = doc.panels
	if (isObj(stored) && stored.version === 2)
		return { panels: stored as unknown as PanelLayoutV2, settingsMoves: [], styleCopies: [], floorKeys: new Set() }

	// The version 1 source: a stored one, else the old slots.
	let source: PanelLayoutV1
	let floor = false
	const v1 = storedPanels(doc)
	if (v1 && v1.version === 1) source = v1
	else {
		const converted = convertSlots(doc, opts)
		source = converted.panels
		floor = converted.floor
	}

	// Flatten: left, the middle top to bottom, right. Version 1 predates the
	// split of Messages, so a `composer` written into one is slot-era too: it is
	// dropped like the old slots drop it (LEGACY_SLOT_DROPPED), and a panel left
	// with no tabs goes — it never blocks the split below.
	const mid = source.middle
	const unretired = (p: PanelV2): PanelV2 => {
		const tabs = p.tabs.filter((id) => !LEGACY_SLOT_DROPPED.has(widgetOfInstance(id)))
		if (tabs.length === p.tabs.length) return p
		const { open, ...rest } = p
		return { ...rest, tabs, ...(open !== undefined && tabs.includes(open) ? { open } : {}) }
	}
	const list = (v: unknown) => panelList(v).map(flattenPanel).map(unretired).filter((p) => p.tabs.length > 0)
	const primary = unretired(flattenPanel(mid.primary))
	const zones: Record<ZoneId, PanelV2[]> = {
		left: list(source.left),
		middle: [...list(mid.above), ...(primary.tabs.length > 0 ? [primary] : []), ...list(mid.below)],
		right: list(source.right),
	}
	const floorPanels = new Set<PanelV2>(floor ? [primary] : [])
	// Settings and style pins LAYER, per instance: the layout's own, then the
	// caller's (stored rows) over them — a key the caller passes wins; a key only
	// the layout carries still counts. Callers apply each move to whichever store
	// holds that key.
	const layered = (own: unknown, over: unknown): Record<string, unknown> | undefined => {
		if (!isObj(own) && !isObj(over)) return undefined
		const out: Record<string, unknown> = {}
		for (const src of [own, over])
			if (isObj(src))
				for (const [id, v] of Object.entries(src))
					out[id] = isObj(v) && isObj(out[id]) ? { ...(out[id] as object), ...v } : v
		return out
	}
	const S = layered(doc.widgetSettings, opts.widgetSettings)
	const T = layered(doc.widgetStyles, opts.widgetStyles)
	const settingOf = (id: string, key: string): unknown => ownOf(ownOf(S, id), key)

	// The composer and turn line, once per composing copy of Messages.
	const order = ['middle', 'left', 'right'] as const
	const placed = new Set(order.flatMap((z) => zones[z].flatMap((p) => p.tabs)))
	const composed = new Map<string, string>()
	const turned = new Map<string, string>()
	const styled: Array<{ from: string; to: string }> = []
	const made = new Set<PanelV2>()
	if (![...placed].some((id) => isInstanceOf(id, 'composer'))) {
		for (const z of order) {
			const next: PanelV2[] = []
			for (const panel of zones[z]) {
				const m = panel.tabs.find(
					(id) => isInstanceOf(id, CONVERSATION) && settingOf(id, 'showComposer') !== false,
				)
				if (m === undefined) {
					next.push(panel)
					continue
				}
				const { composer, turnLine } = conversationSplitIds(m)
				const nextUp = settingOf(m, 'nextUp')
				const nextUpIs = nextUp === 'head' || nextUp === 'list' || nextUp === 'hidden' ? nextUp : settingOf(m, 'showNudge') === false ? 'hidden' : 'head'
				const pair: PanelV2[] = []
				if (nextUpIs !== 'hidden' && !placed.has(turnLine)) {
					pair.push({ key: '', tabs: [turnLine], height: 'fit' })
					turned.set(m, turnLine)
					styled.push({ from: m, to: turnLine })
				}
				if (!placed.has(composer)) {
					pair.push({ key: '', tabs: [composer], height: 'fit' })
					composed.set(m, composer)
					styled.push({ from: m, to: composer })
				}
				pair.forEach((p) => made.add(p))
				if (floorPanels.has(panel)) pair.forEach((p) => floorPanels.add(p))
				if (settingOf(m, 'composerPosition') === 'top') next.push(...pair, panel)
				else next.push(panel, ...pair)
			}
			zones[z] = next
		}
	}

	// Keys for the new panels continue the counter, in final array order.
	let n = 0
	for (const z of order)
		for (const p of zones[z]) {
			const at = /^p(\d+)$/.exec(p.key)
			if (at) n = Math.max(n, Number(at[1]))
		}
	for (const z of order) for (const p of zones[z]) if (made.has(p)) p.key = `p${++n}`
	const floorKeys = new Set([...floorPanels].map((p) => p.key))

	// Settings the split moves or drops, in the order they are found.
	const settingsMoves: PanelSettingsMove[] = []
	if (isObj(S))
		for (const [id, values] of Object.entries(S)) {
			if (!isObj(values)) continue
			const has = (k: string) => Object.hasOwn(values, k)
			if (isInstanceOf(id, CONVERSATION)) {
				for (const key of COMPOSER_KEYS)
					if (has(key)) {
						const to = composed.get(id)
						settingsMoves.push(to ? { from: id, to, key, value: values[key] } : { drop: id, key })
					}
				if (has('nextUp')) {
					const to = turned.get(id)
					settingsMoves.push(to ? { from: id, to, key: 'nextUp', value: values.nextUp } : { drop: id, key: 'nextUp' })
				}
				for (const key of DROPPED_KEYS) if (has(key)) settingsMoves.push({ drop: id, key })
			}
			if (has('hostCard')) settingsMoves.push({ drop: id, key: 'hostCard' })
			if (isInstanceOf(id, CONVERSATION) && has('backingMode')) settingsMoves.push({ drop: id, key: 'backingMode' })
		}

	// Style pins the new widgets take from the Messages copy they came from.
	const present = (id: string) => ownOf(T, id) !== undefined && ownOf(T, id) !== null
	const styleCopies = styled.filter(({ from, to }) => present(from) && !present(to))

	return { panels: { version: 2, left: zones.left, middle: zones.middle, right: zones.right }, settingsMoves, styleCopies, floorKeys }
}

/**
 * 🚧 The layout's arrangement as {@link PanelLayoutV2} — the ONE converter,
 * with {@link panelsFromSlots} (old slots → version 1): every reader reuses
 * it, and the app's boot pass writes its answer. Pure, deterministic, total
 * and non-mutating.
 *
 * A stored version 2 is returned as it is (the same object), with nothing to
 * move. Otherwise the source is a stored version 1, else
 * {@link panelsFromSlots}; it is flattened — left, the middle as `above`,
 * `primary`, `below`, right — each panel keeping `key`, `tabs`, `open`,
 * `height` and `title` and dropping the pin.
 *
 * **The split.** Before it, the log, the field and the turn line were one
 * widget. For each panel's first tab that is a copy of `messages` with its
 * composer showing (`showComposer` not `false`), a turn-line panel (unless
 * `nextUp` reads as `hidden`, the legacy `showNudge: false` included) and a
 * composer panel — `height: 'fit'` — are inserted right after it, or before
 * it when `composerPosition` is `'top'`; their ids are
 * {@link conversationSplitIds}. A layout that already places a `composer`
 * gets nothing. New keys continue the `p<n>` counter.
 *
 * `settingsMoves` lists what the split does to the stored settings (a key to
 * move onto the new instance, or to drop) and `styleCopies` the style pins
 * the new instances copy; the CALLER applies both. No look is written.
 * @experimental
 */
export function panelsV2Of(layout: SessionLayoutV1, opts?: PanelsV2Options): PanelsV2Conversion {
	const { floorKeys: _floorKeys, ...conversion } = convertToV2(layout, opts)
	return conversion
}

/** {@link panelsV2Of}'s panels, and the keys of the converter's floor panels. */
function panelsWithFloor(layout: unknown, opts?: PanelsV2Options): { panels: PanelLayoutV2; floorKeys: ReadonlySet<string> } {
	const { panels, floorKeys } = convertToV2(layout, opts)
	return { panels, floorKeys }
}

/**
 * The layout's panels as version 2: {@link panelsV2Of}'s `panels` — a stored
 * version 2 as it is, anything else converted. What every reader reads.
 * ⚠ Its return type changed with version 2 (was {@link PanelLayoutV1}).
 * @experimental
 */
export function panelsOf(layout: SessionLayoutV1, opts?: PanelsV2Options): PanelLayoutV2 {
	return panelsV2Of(layout, opts).panels
}

/** Every panel's tabs, as written, in reading order — middle, left, right — the floor's left out. */
function panelTabs(layout: unknown, zones: readonly ZoneId[] = ZONE_IDS): string[] {
	const { panels, floorKeys } = panelsWithFloor(layout)
	const out: string[] = []
	for (const z of ['middle', 'left', 'right'] as const)
		if (zones.includes(z))
			for (const p of panelList(panels[z])) if (!floorKeys.has(p.key)) out.push(...strings(p.tabs))
	return out
}

// ── Reading ids ─────────────────────────────────────────────────────────────

/**
 * Every widget instance id the layout NAMES, each once: its panels' tabs in
 * reading order (middle, left, right) — and, while it has no `panels`, then whatever the ⏳ old
 * slots name that the conversion did not keep (a retired widget, an entry an
 * arrangement shadows). What a check reads when the question is "does this
 * layout mention it at all" (a genre's omitted widgets). The floor's
 * conversation is not named.
 * @experimental
 */
export function layoutWidgetIds(layout: SessionLayoutV1): string[] {
	const out = new Set(panelTabs(layout))
	if (!storedPanels(layout) && isObj(layout)) for (const id of slotWidgetIds(layout)) out.add(id)
	return [...out]
}

/**
 * The widget instance ids the MIDDLE's panels hold, top to bottom, each
 * once. The floor's conversation is not held.
 * @experimental
 */
export function middleWidgetIds(layout: SessionLayoutV1): string[] {
	return [...new Set(panelTabs(layout, ['middle']))]
}

// ── What a layout draws ─────────────────────────────────────────────────────

/**
 * What a zone's width ladder resolves to at one inline size: its rules merged
 * ascending, each stating only what changes. For a side zone the zone's pin
 * then refines a `rail`: pinned (absent or `true`) stays a docked rail, and
 * `pinned: false` is an icon strip. A strip is a `row` unless a rule hides it.
 * @experimental
 * @deprecated ⏳ removed at 0.7 (owner's call) — {@link resolveDrawn} no longer walks a ladder.
 */
export interface ZoneRung {
	mode: NonNullable<LayoutZoneRule['mode']>
	/** The rail's or drawer's inline size, px. */
	width: number
	/** Rail stack columns (a wide screen turns a rail into a grid). */
	columns: number
}

/**
 * The width ladder a side zone walks when it declares no `rules` of its own:
 * an overlay drawer below the rail rung, a docked rail above it, wider and
 * then two columns on a very wide box. The left docks later than the right,
 * because the right is where a fresh session's widgets land.
 *
 * From 1200 to 1440 — where the left has just docked beside the right — each
 * side's rail is 248px rather than 264, so two docked columns, their gaps and
 * the stage's 696px measure fit a 1216px session box (a 1280 window):
 * 248 + 248 + 2×8 + 696 = 1208. At 264 they needed 1240 and both sides tucked.
 * @experimental
 * @deprecated ⏳ removed at 0.7 (owner's call) — no reader walks a width ladder now.
 */
export const DEFAULT_SIDE_RULES: Readonly<Record<'left' | 'right', readonly LayoutZoneRule[]>> = {
	right: [
		{ min: 0, mode: 'drawer', width: 320 },
		{ min: 760, mode: 'rail', width: 264 },
		{ min: 1200, width: 248 },
		{ min: 1440, width: 264 },
		{ min: 1900, width: 300 },
		{ min: 2400, width: 344, columns: 2 },
	],
	left: [
		{ min: 0, mode: 'drawer', width: 320 },
		{ min: 1200, mode: 'rail', width: 248 },
		{ min: 1440, width: 264 },
		{ min: 1900, width: 300 },
		{ min: 2400, width: 344, columns: 2 },
	],
}

/**
 * The width ladder a strip walks when it declares none: always a row.
 * @experimental
 * @deprecated ⏳ removed at 0.7 (owner's call) — no reader walks a width ladder now.
 */
export const DEFAULT_STRIP_RULES: readonly LayoutZoneRule[] = [{ min: 0, mode: 'row' }]

/**
 * A zone's width ladder at `inline` px — its own `rules`, else the default
 * ladder for where it is drawn ({@link DEFAULT_SIDE_RULES},
 * {@link DEFAULT_STRIP_RULES}) — with the pin refinement {@link ZoneRung}
 * describes. The one walk: the page's rails, the editor's simulator and
 * {@link resolveDrawn} all read a ladder through it.
 * @experimental
 * @deprecated ⏳ removed at 0.7 (owner's call) — {@link resolveDrawn} no longer walks a ladder.
 */
export function zoneRungAt(def: LayoutZoneDef, inline: number): ZoneRung {
	const strip = def.kind === 'strip'
	const own = Array.isArray(def.rules)
		? (def.rules as unknown[]).filter((r): r is LayoutZoneRule => isObj(r) && typeof r.min === 'number')
		: null
	const rules = own ?? (strip ? DEFAULT_STRIP_RULES : DEFAULT_SIDE_RULES[def.side === 'left' ? 'left' : 'right'])
	const out: ZoneRung = { mode: 'row', width: 264, columns: 1 }
	for (const rule of [...rules].sort((a, b) => a.min - b.min)) {
		if (inline < rule.min) break
		if (rule.mode !== undefined) out.mode = rule.mode
		if (rule.width !== undefined) out.width = rule.width
		if (rule.columns !== undefined) out.columns = rule.columns
	}
	if (strip) {
		if (out.mode !== 'hidden') out.mode = 'row'
	} else if (out.mode === 'rail' && def.pinned === false) out.mode = 'icons'
	return out
}

/**
 * Is this placement pinned? **Absent means pinned; `false` is the only value
 * that unpins.** The ONE pin rule of the session layout: a panel's
 * ({@link PanelV1.pinned} — docked in its side, or in the rail as an icon
 * that docks or flies out when opened), and the ⏳ old slots' that carry the
 * field (an arranged item, a grid entry, a zone), so a layout saved before a
 * slot had the field reads exactly as it drew: docked. Anything that is not
 * `false` (a missing field, `true`, junk) is pinned. ⚠ Not the widget
 * envelope's `layout.v1.pinned`, which a host tells a widget about its own
 * box.
 * @experimental
 * @deprecated ⏳ removed at 0.7 (owner's call) — version 2 has no pin; still read by {@link panelsFromSlots}.
 */
export function pinnedOf(placement: { pinned?: unknown } | null | undefined): boolean {
	return placement?.pinned !== false
}

/**
 * One widget instance a panel draws, as a tab.
 * @experimental
 */
export interface DrawnInstance {
	/** The widget instance id (`messages`, `messages#sanctum`). */
	instanceId: string
	/** The widget it is a copy of ({@link widgetOfInstance}, read through {@link WIDGET_ID_ALIASES}). */
	widgetId: string
	/**
	 * ⏳ When the id is an alias (`world-state`): the settings it implies
	 * ({@link resolveWidgetAlias}), which a settings reader merges UNDER the
	 * instance's stored ones. `instanceId` stays the id as placed — the key
	 * its stored settings and style pin live under.
	 */
	impliedSettings?: Readonly<Record<string, unknown>>
	/**
	 * Always `true`: version 2 has no pin.
	 * @deprecated ⏳ removed at 0.7 (owner's call)
	 */
	pinned: boolean
}

/**
 * One panel as a layout draws it.
 * @experimental
 */
export interface DrawnPanel {
	/** The panel's key ({@link PanelV2.key}). */
	key: string
	/** Its tabs, in order: what it draws. Never empty, except the floor's. */
	tabs: DrawnInstance[]
	/** The instance id of the tab shown: its `open` when that is one of its tabs, else the first. */
	open: string
	/**
	 * Always `true`: version 2 has no pin.
	 * @deprecated ⏳ removed at 0.7 (owner's call)
	 */
	pinned: boolean
	/**
	 * Its height: the stored one when readable, else the open tab's
	 * declaration (`WidgetDecl.panel.height`), else `fill`.
	 */
	height: PanelHeightV1
	/**
	 * 🚧 Its priority: the stored one when valid, else the open tab's
	 * declaration (`WidgetDecl.panel.priority`), else `'normal'`. When a zone
	 * runs short, `low` gives way first, then `normal`.
	 */
	priority: PanelPriority
	/** A person's name for it, when it has one. */
	title?: string
	/**
	 * The converter's floor: the layout placed no conversation in its middle
	 * (and no `panels`), so the primary is `messages` by
	 * {@link panelsFromSlots}'s rule — and the turn line and composer made for
	 * it are floor panels too. A renderer draws it; the id readers do not
	 * count it — the layout did not place it.
	 */
	floor?: true
}

/**
 * One of the three zones as a layout draws it.
 * @experimental
 */
export interface DrawnZone {
	zone: ZoneId
	kind: 'side' | 'middle'
	/** A side zone's edge. */
	side?: 'left' | 'right'
	/**
	 * No longer set: the key of the first `zoneLayout` zone drawn on a side.
	 * @deprecated ⏳ removed at 0.7 (owner's call)
	 */
	zoneKey?: string | null
	/**
	 * Always `true`: version 2 has no pin.
	 * @deprecated ⏳ removed at 0.7 (owner's call)
	 */
	pinned: boolean
	/**
	 * No longer set: a side's width ladder at the box's inline size.
	 * @deprecated ⏳ removed at 0.7 (owner's call)
	 */
	rung?: ZoneRung
	/** Its panels in reading order, top to bottom. */
	panels: DrawnPanel[]
	/** Every tab of its panels, in reading order — the floor's left out. */
	instances: DrawnInstance[]
}

/**
 * The middle as version 1's layout drew it: a zone whose panels are `above`,
 * the `primary` and `below`. {@link resolveDrawn} no longer answers one.
 * @experimental
 * @deprecated ⏳ removed at 0.7 (owner's call) — the middle is a {@link DrawnZone} now.
 */
export interface DrawnMiddle extends DrawnZone {
	zone: 'middle'
	kind: 'middle'
	above: DrawnPanel[]
	primary: DrawnPanel
	below: DrawnPanel[]
}

/**
 * What a session layout DRAWS, and where — {@link resolveDrawn}'s answer.
 * A renderer, a picture of a preset, the primary floor and a genre's checks
 * all read this.
 * @experimental
 */
export interface DrawnLayout {
	left: DrawnZone
	middle: DrawnZone
	right: DrawnZone
	/** 🚧 The layout's look, read: a stored version 2's, else {@link DEFAULT_PANEL_LOOK}'s; `gapPx` is the gap in px. */
	look: Required<PanelLook> & { gapPx: number }
}

/** An instance's widget, read through the aliases, and the settings an alias implies. */
function widgetFacts(instanceId: string): Pick<DrawnInstance, 'widgetId' | 'impliedSettings'> {
	const r = resolveWidgetAlias(instanceId)
	return r.aliasedFrom ? { widgetId: r.widgetId, impliedSettings: r.impliedSettings } : { widgetId: r.widgetId }
}

/** A stored height, read: `fit`, `fill` or a whole share of 1–12; anything else is absent. */
function validHeight(x: unknown): PanelHeightV1 | undefined {
	if (x === 'fit' || x === 'fill') return x
	if (isObj(x) && isInt(x.share) && x.share >= 1 && x.share <= 12) return { share: x.share }
	return undefined
}

const isPriority = (x: unknown): x is PanelPriority => x === 'high' || x === 'normal' || x === 'low'
const isBacking = (x: unknown): x is PanelBacking => x === 'card' || x === 'glass' || x === 'none'
const isGap = (x: unknown): x is PanelGap => x === 'tight' || x === 'comfortable' || x === 'spacious'

/** What {@link resolveDrawn} may be told beyond the layout. @experimental */
export interface ResolveDrawnOptions {
	/** Widget declarations by the id the layout names them — for a panel's default priority and height. */
	widgets?: readonly Pick<WidgetDecl, 'id' | 'panel'>[]
}

/** The layout's look as a stored version 2 states it, else the default. */
function lookOf(layout: unknown): Required<PanelLook> & { gapPx: number } {
	const p = isObj(layout) && isObj(layout.panels) && layout.panels.version === 2 ? layout.panels : {}
	const gap = isGap(p.gap) ? p.gap : DEFAULT_PANEL_LOOK.gap
	return {
		backing: isBacking(p.backing) ? p.backing : DEFAULT_PANEL_LOOK.backing,
		opacity: typeof p.opacity === 'number' && Number.isFinite(p.opacity) ? Math.min(100, Math.max(0, p.opacity)) : DEFAULT_PANEL_LOOK.opacity,
		gap,
		behind: p.behind === 'backdrop' ? 'backdrop' : 'background',
		behindDim: typeof p.behindDim === 'number' && Number.isFinite(p.behindDim) ? Math.min(100, Math.max(0, p.behindDim)) : 0,
		gapPx: PANEL_GAP_PX[gap],
	}
}

/**
 * What a session layout draws: per zone, its panels top to bottom, each with
 * its tabs, the tab shown, a height and a priority — and the layout's look.
 * Pure and total — any value reads; what it cannot read places nothing.
 *
 * It reads {@link panelsOf}: the layout's `panels` (version 1 converted), else
 * the ⏳ old slots through {@link panelsFromSlots}. A tab that is a copy of a
 * retired widget ({@link RETIRED_WIDGET_IDS}) is not drawn, a panel left with
 * no tab is not drawn, and an instance is drawn once, in its first panel in
 * reading order — middle, left, right. An aliased id
 * ({@link WIDGET_ID_ALIASES}) is drawn as the widget it became, under the id
 * it was placed by, with the settings it implies.
 *
 * A panel's `height` is its stored one, else its open tab's declaration
 * (`opts.widgets`, `panel.height`), else `fill`; its `priority` likewise
 * (`panel.priority`, else `'normal'`). There is no pin: every `pinned` is
 * `true`, and no width ladder is walked, so `box` is not read.
 * @experimental
 */
export function resolveDrawn(layout: SessionLayoutV1, box: { inline: number; block?: number }, opts: ResolveDrawnOptions = {}): DrawnLayout {
	const doc: SessionLayoutV1 = isObj(layout) ? layout : {}
	const { panels, floorKeys } = panelsWithFloor(doc)
	const decls = new Map<string, Pick<WidgetDecl, 'id' | 'panel'>>()
	for (const w of (Array.isArray(opts?.widgets) ? opts.widgets : []) as readonly unknown[])
		if (isObj(w) && typeof w.id === 'string') decls.set(w.id, w as unknown as Pick<WidgetDecl, 'id' | 'panel'>)
	const seen = new Set<string>()
	/** Admit an instance once, in reading order, never a retired one. */
	const admit = (id: string): boolean => {
		if (retired(id) || seen.has(id)) return false
		seen.add(id)
		return true
	}
	const draw = (p: PanelV2): DrawnPanel => {
		const tabs = strings(p.tabs)
			.filter((id) => id && admit(id))
			.map((id): DrawnInstance => ({ instanceId: id, ...widgetFacts(id), pinned: true }))
		const open = typeof p.open === 'string' && tabs.some((t) => t.instanceId === p.open) ? p.open : (tabs[0]?.instanceId ?? '')
		const decl = decls.get(tabs.find((t) => t.instanceId === open)?.widgetId ?? '')?.panel
		const declHeight = isObj(decl) && (decl.height === 'fit' || decl.height === 'fill') ? decl.height : undefined
		const declPriority = isObj(decl) && isPriority(decl.priority) ? decl.priority : undefined
		return {
			key: typeof p.key === 'string' ? p.key : '',
			tabs,
			open,
			pinned: true,
			height: validHeight(p.height) ?? declHeight ?? 'fill',
			priority: isPriority(p.priority) ? p.priority : (declPriority ?? 'normal'),
			...(typeof p.title === 'string' ? { title: p.title } : {}),
			...(floorKeys.has(p.key) ? { floor: true as const } : {}),
		}
	}
	const zone = (z: ZoneId): DrawnZone => {
		const own = panelList(panels[z]).map(draw).filter((p) => p.tabs.length > 0)
		return {
			zone: z,
			kind: z === 'middle' ? 'middle' : 'side',
			...(z === 'middle' ? {} : { side: z }),
			pinned: true,
			panels: own,
			instances: own.filter((p) => !p.floor).flatMap((p) => p.tabs),
		}
	}
	// Reading order is middle, left, right: the draw order decides who keeps a repeated id.
	const middle = zone('middle')
	const left = zone('left')
	const right = zone('right')
	return { left, middle, right, look: lookOf(doc) }
}

/** Every instance a drawn layout draws, in its reading order: middle, left, right — the floor's left out. @experimental */
export function drawnInstances(drawn: DrawnLayout): DrawnInstance[] {
	return [...drawn.middle.instances, ...drawn.left.instances, ...drawn.right.instances]
}

/**
 * Every widget instance id the layout DRAWS, in reading order — the middle,
 * left, right: {@link resolveDrawn}'s answer as ids.
 * A retired widget is never drawn, and the floor's conversation is not the
 * layout's.
 * @experimental
 */
export function drawnWidgetIds(layout: SessionLayoutV1): string[] {
	// Membership does not depend on the box: only a side's presentation does.
	return drawnInstances(resolveDrawn(layout, { inline: 0 })).map((i) => i.instanceId)
}

/**
 * Does the layout DRAW any instance of `primaryId` — the bare id or a
 * `#name` copy — in any panel? The **primary floor**'s question: placement is
 * free, and the one rule left is that a layout draws its genre's primary
 * widget somewhere. Asked of {@link resolveDrawn}, like every "is it drawn";
 * the converter's floor is not the layout placing it.
 * @experimental
 */
export function primaryPlaced(layout: SessionLayoutV1, primaryId: string): boolean {
	return drawnWidgetIds(layout).some((id) => isInstanceOf(id, primaryId))
}


// ── Validation ──────────────────────────────────────────────────────────────

/** @experimental */
export interface SessionLayoutValidation {
	ok: boolean
	/** What makes the layout unusable as shipped. Any error refuses it. */
	errors: string[]
	/** What draws, but not as declared: an unknown widget draws a placeholder. */
	warnings: string[]
}

/** What {@link validateSessionLayout} checks ids against. @experimental */
export interface SessionLayoutValidationOptions {
	/**
	 * Widget declarations, under the ids the layout names them by (core's
	 * bare, a plugin's namespaced — or, in a package's own declaration, the
	 * package's bare). A widget listed here and placed more often than its
	 * `maxInstances` is a warning.
	 */
	widgets?: readonly Pick<WidgetDecl, 'id' | 'maxInstances'>[]
	/**
	 * `'warn'` when `widgets` is every widget the caller knows — an
	 * instance's check, core's and every enabled package's — so a widget
	 * outside it is warned about too: it draws a labelled placeholder. A
	 * packager knows its own widgets and not the rest, and leaves this at
	 * `'ignore'` (the default).
	 */
	unknownWidgets?: 'warn' | 'ignore'
}

const isInt = (x: unknown): x is number => typeof x === 'number' && Number.isInteger(x)

/** The slots a session layout has. */
const SLOTS = ['panels', 'zoneLayout', 'widgetGrid', 'arrangedGrid', 'widgetSettings', 'widgetStyles'] as const

/** The top-level keys only the retired layout document had (and its preset wrapper, `layout`). */
const RETIRED_DOCUMENT_KEYS: readonly string[] = ['layout', 'version', 'zones', 'variants', 'look']

function isSizeSpec(x: unknown): boolean {
	if (x === 'grow' || x === 'fixed') return true
	if (!isObj(x)) return false
	const keys = ['minCells', 'maxCells', 'cells'].filter((k) => x[k] !== undefined)
	return keys.length > 0 && keys.every((k) => typeof x[k] === 'number' && (x[k] as number) > 0)
}

function isAnchor(x: unknown): boolean {
	return isObj(x) && Object.entries(x).every(([k, v]) => ['top', 'bottom', 'left', 'right'].includes(k) && typeof v === 'boolean')
}

/**
 * Check a layout a package ships — the rules its type cannot express. Pure;
 * the verdict lists every problem rather than the first.
 *
 * **Errors** (the layout is refused):
 * - `panels` of the wrong shape: `{ version: 2, left, middle, right,
 *   backing?, opacity?, gap? }`, each zone a list of panels top to bottom
 *   and the middle never empty; version 1's `{ version: 1, left, middle: {
 *   above, primary, below }, right }` is still checked (and warned about);
 *   any other version is refused. A panel has a key no other panel has, at
 *   least one tab, `open` one of its tabs, `height` `fit`, `fill` or `{ share }`
 *   (an integer 1–12); in version 2 `priority` is `high`, `normal` or `low`
 *   and `pinned` is refused (there is no pin), `backing` is `card`, `glass`
 *   or `none`, `opacity` a number from 0 to 100, `gap` `tight`,
 *   `comfortable` or `spacious`, `behind` `background` or `backdrop`,
 *   `behindDim` a number from 0 to 100; in version 1 `pinned` is absent or `false`,
 *   refused on a middle panel. An instance id in two panels, or twice in one;
 * - an ⏳ old slot of the wrong shape: `zoneLayout` and `widgetGrid` are `version: 1`;
 *   a grid entry and an arrangement name a zone, `left`, `middle` or
 *   `right`; a `zoneLayout` zone is keyed by where the page draws it — a
 *   side by its `side` (`left`, `right`), a strip by its `area` (`top`,
 *   `bottom`);
 * - a placed id that is not a widget instance id (`<widget id>` or
 *   `<widget id>#<instance name>`);
 * - an arranged cell that is not whole cells inside its zone's `cols` × `rows`;
 * - an id placed twice: a widget instance lives in ONE zone, listed once. The
 *   three slots may each name it there — a side lists it, its arrangement
 *   gives it cells — but never in two zones (a zone as the page draws it),
 *   and never twice in one list;
 * - a `widgetSettings` value that is not an object, a `widgetStyles` pin with
 *   no slug;
 * - the retired layout document (LayoutDoc v2), bare or in its preset
 *   wrapper — refused by name, never read as a layout that places nothing.
 *
 * **Warnings** (the layout draws, not as written):
 * - a key that is not a slot (readers ignore it) and a retired widget;
 * - `panels-v1:` — version 1 panels are converted on read ({@link panelsV2Of});
 *   ship version 2;
 * - in the old slots, a placed copy of a {@link LEGACY_SLOT_DROPPED} widget (a
 *   slot-era composer): the slots never draw it;
 * - `panels` that place no copy of the conversation: the session draws one
 *   by the primary floor — unless the genre withholds it, which the genre's
 *   own checks judge (a layout carries no roles);
 * - with `panels`, the ⏳ old slots are still checked for shape, but what
 *   they place is not read, so nothing below is asked of them;
 * - an id placed but never drawn ({@link drawnWidgetIds}): its zone's
 *   arrangement draws over it, or the grid puts it in a side the layout has
 *   no zone for;
 * - two arranged items sharing a cell (one draws over the other);
 * - with `opts.widgets`, more instances of a widget than its
 *   `maxInstances` (readers draw the first ones in reading order);
 * - with `opts.unknownWidgets: 'warn'` too, a widget `opts.widgets` does not
 *   hold (it draws a labelled placeholder).
 *
 * An aliased id (`world-state`, {@link WIDGET_ID_ALIASES}) is checked as the
 * widget it became: neither retired nor unknown, and counted against that
 * widget's `maxInstances`.
 * @experimental
 */
export function validateSessionLayout(
	layout: unknown,
	opts: SessionLayoutValidationOptions = {},
): SessionLayoutValidation {
	const errors: string[] = []
	const warnings: string[] = []
	if (!isObj(layout)) return { ok: false, errors: ['a session layout is an object'], warnings }
	// The retired layout document (LayoutDoc v2) — bare, or inside the
	// `{ layout, widgetSettings, widgetStyles }` preset that carried it — is
	// refused by name rather than read as a layout that places nothing: no
	// reader converts it (owner L1).
	if (RETIRED_DOCUMENT_KEYS.some((k) => k in layout))
		errors.push(
			`a retired layout document (LayoutDoc v2: ${RETIRED_DOCUMENT_KEYS.filter((k) => k in layout).join(', ')}) — ` +
				'declare a session layout: { panels?, widgetSettings?, widgetStyles? }',
		)
	for (const k of Object.keys(layout))
		if (!(SLOTS as readonly string[]).includes(k) && !RETIRED_DOCUMENT_KEYS.includes(k))
			warnings.push(`'${k}' is not a slot of the session layout — readers ignore it`)

	/** Where each id is placed: the zone the page draws it in, first seen at `where`. */
	const placedIn = new Map<string, { zone: string; where: string }>()
	const isInstanceId = (id: unknown, where: string): id is string => {
		if (isWidgetInstanceId(id)) return true
		errors.push(
			`${where}: '${String(id)}' is not a widget instance id — a widget id, or '<widget id>#<instance name>' (${INSTANCE_NAME})`,
		)
		return false
	}
	const place = (id: unknown, zone: string, where: string, seen: Set<string>) => {
		if (!isInstanceId(id, where)) return
		if (seen.has(id)) errors.push(`${where}: '${id}' is listed twice — a widget instance is placed once`)
		seen.add(id)
		const held = placedIn.get(id)
		if (held && held.zone !== zone)
			errors.push(`${where}: '${id}' is also placed in ${held.zone} (${held.where}) — a widget instance lives in one zone`)
		else if (!held) placedIn.set(id, { zone, where })
	}
	const zoneKey = (k: string, where: string): boolean => {
		if ((ZONE_IDS as readonly string[]).includes(k)) return true
		errors.push(`${where}: '${k}' is not a zone — one of ${ZONE_IDS.join(', ')}`)
		return false
	}

	// zoneLayout
	const zl = layout.zoneLayout
	if (zl !== undefined) {
		if (!isObj(zl) || zl.version !== 1 || !isObj(zl.zones))
			errors.push('zoneLayout: { version: 1, zones: { … } }')
		else {
			for (const [key, def] of Object.entries(zl.zones)) {
				const at = `zoneLayout.zones.${key}`
				if (!isObj(def)) {
					errors.push(`${at}: a zone is an object`)
					continue
				}
				if (def.kind !== 'side' && def.kind !== 'strip') errors.push(`${at}.kind: 'side' or 'strip'`)
				if (def.side !== undefined && def.side !== 'left' && def.side !== 'right')
					errors.push(`${at}.side: 'left' or 'right'`)
				if (def.area !== undefined && def.area !== 'top' && def.area !== 'bottom')
					errors.push(`${at}.area: 'top' or 'bottom'`)
				if (def.pinned !== undefined && typeof def.pinned !== 'boolean') errors.push(`${at}.pinned: a boolean`)
				if (def.rules !== undefined && (!Array.isArray(def.rules) || def.rules.some((r) => !isObj(r) || typeof r.min !== 'number')))
					errors.push(`${at}.rules: a list of { min, mode?, width?, columns? }`)
				// ONE way to say where a zone is: the page reads `side` / `area`
				// (absent: the right / the top), so the key must say the same.
				const drawnAt = zoneDrawnAt(def)
				if (key !== drawnAt) {
					const strip = def.kind === 'strip'
					const field = strip ? 'area' : 'side'
					const unstated = def[field] === undefined ? ` (it states no ${field}, and ${strip ? 'a strip with none is the top' : 'a side zone with none is the right'})` : ''
					const fixes = (strip ? ['top', 'bottom'] : ['left', 'right']).includes(key)
						? `key it '${drawnAt}', or set ${field}: '${key}'`
						: `key it '${drawnAt}'`
					errors.push(
						`${at}: the page draws this ${strip ? 'strip' : 'side zone'} at the ${drawnAt}${unstated} — ` +
							`a zone is keyed by where it is drawn (a side by its side, a strip by its area${key === 'middle' ? "; the middle's membership is the widget grid's" : ''}): ${fixes}`,
					)
				}
				if (!Array.isArray(def.widgets)) {
					errors.push(`${at}.widgets: a list of widget instance ids`)
					continue
				}
				const seen = new Set<string>()
				for (const id of def.widgets) place(id, drawnAt, `${at}.widgets`, seen)
			}
			if (zl.styles !== undefined && (!isObj(zl.styles) || (zl.styles.chat !== undefined && typeof zl.styles.chat !== 'string')))
				errors.push('zoneLayout.styles: { chat?: string }')
		}
	}

	// widgetGrid
	const wg = layout.widgetGrid
	if (wg !== undefined) {
		if (!isObj(wg) || wg.version !== 1 || !Array.isArray(wg.widgets))
			errors.push('widgetGrid: { version: 1, cell, widgets: [ … ] }')
		else {
			if (typeof wg.cell !== 'number' || !(wg.cell > 0)) errors.push('widgetGrid.cell: a positive number of px')
			const seen = new Set<string>()
			wg.widgets.forEach((w, n) => {
				const at = `widgetGrid.widgets[${n}]`
				if (!isObj(w)) {
					errors.push(`${at}: a grid widget is an object`)
					return
				}
				// A missing or non-string zone is refused like a wrong one — and the
				// entry's id is still checked, since it names a widget either way.
				const zone = typeof w.zone === 'string' ? w.zone : undefined
				const zoned = zone === undefined ? (errors.push(`${at}.zone: one of ${ZONE_IDS.join(', ')}`), false) : zoneKey(zone, `${at}.zone`)
				if (typeof w.order !== 'number' || !Number.isFinite(w.order)) errors.push(`${at}.order: a number`)
				if (!isObj(w.size) || !isSizeSpec(w.size.w) || !isSizeSpec(w.size.h))
					errors.push(`${at}.size: { w, h }, each 'grow', 'fixed' or { cells | minCells | maxCells }`)
				if (!isAnchor(w.anchor)) errors.push(`${at}.anchor: { top?, bottom?, left?, right? } of booleans`)
				if (w.colSpan !== undefined && !(isInt(w.colSpan) && w.colSpan > 0)) errors.push(`${at}.colSpan: a positive integer`)
				if (w.group !== undefined && typeof w.group !== 'string') errors.push(`${at}.group: a string`)
				if (zoned) place(w.id, zone!, 'widgetGrid.widgets', seen)
				else isInstanceId(w.id, 'widgetGrid.widgets')
			})
		}
	}

	// arrangedGrid
	const ag = layout.arrangedGrid
	if (ag !== undefined) {
		if (!isObj(ag)) errors.push('arrangedGrid: { left?, middle?, right? }')
		else
			for (const [key, frame] of Object.entries(ag)) {
				const at = `arrangedGrid.${key}`
				if (!zoneKey(key, at)) continue
				if (!isObj(frame) || !(isInt(frame.cols) && frame.cols > 0) || !(isInt(frame.rows) && frame.rows > 0) || !Array.isArray(frame.items)) {
					errors.push(`${at}: { cols, rows, items } — whole, positive cols and rows`)
					continue
				}
				const { cols, rows } = frame as { cols: number; rows: number }
				const seen = new Set<string>()
				/** The items with whole-cell boxes, for the overlap check. */
				const boxes: Array<{ id: string; x: number; y: number; w: number; h: number }> = []
				;(frame.items as unknown[]).forEach((item, n) => {
					const where = `${at}.items[${n}]`
					if (!isObj(item)) {
						errors.push(`${where}: an arranged item is an object`)
						return
					}
					const { x, y, w, h } = item
					if (!isInt(x) || !isInt(y) || !isInt(w) || !isInt(h) || x < 0 || y < 0 || w < 1 || h < 1 || x + w > cols || y + h > rows)
						errors.push(`${where}: whole cells inside ${cols} × ${rows} (x, y ≥ 0; w, h ≥ 1)`)
					else if (typeof item.id === 'string') boxes.push({ id: item.id, x, y, w, h })
					if (item.anchor !== undefined && !isAnchor(item.anchor)) errors.push(`${where}.anchor: { top?, bottom?, left?, right? } of booleans`)
					if (item.group !== undefined && typeof item.group !== 'string') errors.push(`${where}.group: a string`)
					if (item.pinned !== undefined && typeof item.pinned !== 'boolean') errors.push(`${where}.pinned: a boolean`)
					place(item.id, key, `${at}.items`, seen)
				})
				// Two boxes on one cell: the page draws both, one over the other.
				boxes.forEach((a, i) => {
					for (const b of boxes.slice(i + 1))
						if (a.id !== b.id && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h)
							warnings.push(`${at}: '${a.id}' and '${b.id}' share cells — one draws over the other`)
				})
			}
	}

	// widgetSettings / widgetStyles
	const ws = layout.widgetSettings
	if (ws !== undefined) {
		if (!isObj(ws)) errors.push('widgetSettings: { [widget instance id]: { … } }')
		else
			for (const [id, v] of Object.entries(ws)) {
				if (!isWidgetInstanceId(id)) errors.push(`widgetSettings: '${id}' is not a widget instance id`)
				if (!isObj(v)) errors.push(`widgetSettings.${id}: the widget's settings, an object`)
			}
	}
	const pins = layout.widgetStyles
	if (pins !== undefined) {
		if (!isObj(pins)) errors.push('widgetStyles: { [widget instance id]: { slug, id? } }')
		else
			for (const [id, v] of Object.entries(pins)) {
				if (!isWidgetInstanceId(id)) errors.push(`widgetStyles: '${id}' is not a widget instance id`)
				if (!isObj(v) || typeof v.slug !== 'string' || !v.slug || (v.id !== undefined && !(isInt(v.id) && v.id > 0)))
					errors.push(`widgetStyles.${id}: a style pin, { slug, id? }`)
			}
	}

	// panels
	const pl = layout.panels
	/** Where each id sits in `panels`: its zone, first seen at `where`. */
	const panelPlaced = new Map<string, { zone: string; where: string }>()
	if (pl !== undefined) {
		const keys = new Set<string>()
		const v2 = isObj(pl) && pl.version === 2
		const panel = (p: unknown, zone: ZoneId, at: string, middle: boolean) => {
			if (!isObj(p))
				return errors.push(
					`${at}: a panel is an object — { key, tabs, open?, ${v2 ? 'priority?' : 'pinned?'}, height?, title? }`,
				)
			if (typeof p.key !== 'string' || !p.key) errors.push(`${at}.key: a non-empty string`)
			else if (keys.has(p.key)) errors.push(`${at}.key: '${p.key}' keys two panels — a key names one`)
			else keys.add(p.key)
			if (!Array.isArray(p.tabs) || p.tabs.length === 0)
				errors.push(`${at}.tabs: at least one widget instance id${at === 'panels.middle.primary' ? ' — the primary holds the conversation (or what stands in for it)' : ''}`)
			else
				for (const id of p.tabs) {
					if (!isInstanceId(id, `${at}.tabs`)) continue
					const held = panelPlaced.get(id)
					if (held) errors.push(`${at}.tabs: '${id}' is also in ${held.where} — a widget instance sits in one panel, once`)
					else panelPlaced.set(id, { zone, where: at })
				}
			if (p.open !== undefined && !(typeof p.open === 'string' && Array.isArray(p.tabs) && p.tabs.includes(p.open)))
				errors.push(`${at}.open: one of its tabs`)
			if (p.pinned !== undefined) {
				if (v2) errors.push(`${at}.pinned: there is no pin in version 2 — every panel is open; leave it out`)
				else if (middle) errors.push(`${at}.pinned: a middle panel never pins — leave it out`)
				else if (p.pinned !== false) errors.push(`${at}.pinned: absent (docked) or false (in the rail)`)
			}
			if (v2 && p.priority !== undefined && !isPriority(p.priority)) errors.push(`${at}.priority: 'high', 'normal' or 'low'`)
			const h = p.height
			if (h !== undefined && h !== 'fit' && h !== 'fill' && !(isObj(h) && isInt(h.share) && h.share >= 1 && h.share <= 12))
				errors.push(`${at}.height: 'fit', 'fill' or { share } — a whole number of twelfths, 1 to 12`)
			if (p.title !== undefined && typeof p.title !== 'string') errors.push(`${at}.title: a string`)
		}
		const list = (x: unknown, zone: ZoneId, at: string, middle: boolean) => {
			if (!Array.isArray(x)) return errors.push(`${at}: a list of panels, top to bottom`)
			x.forEach((p, n) => panel(p, zone, `${at}[${n}]`, middle))
		}
		if (!isObj(pl) || (pl.version !== 1 && pl.version !== 2))
			errors.push(
				'panels: { version: 2, left: [ … ], middle: [ … ], right: [ … ], backing?, opacity?, gap? } — or version 1, ' +
					'{ version: 1, left: [ … ], middle: { above: [ … ], primary: { … }, below: [ … ] }, right: [ … ] }',
			)
		else if (pl.version === 2) {
			if (![pl.left, pl.middle, pl.right].every(Array.isArray))
				errors.push('panels: { version: 2, left: [ … ], middle: [ … ], right: [ … ], backing?, opacity?, gap? }')
			if (isObj(pl.middle) || 'above' in pl || 'primary' in pl || 'below' in pl)
				errors.push("panels.middle: one list of panels, top to bottom — above / primary / below are version 1's")
			if (!isObj(pl.middle)) list(pl.middle, 'middle', 'panels.middle', true)
			if (Array.isArray(pl.middle) && pl.middle.length === 0)
				errors.push('panels.middle: the middle is never empty — at least one panel')
			list(pl.left, 'left', 'panels.left', false)
			list(pl.right, 'right', 'panels.right', false)
			if (pl.backing !== undefined && !isBacking(pl.backing)) errors.push("panels.backing: 'card', 'glass' or 'none'")
			if (pl.opacity !== undefined && !(typeof pl.opacity === 'number' && Number.isFinite(pl.opacity) && pl.opacity >= 0 && pl.opacity <= 100))
				errors.push('panels.opacity: a number from 0 to 100')
			if (pl.gap !== undefined && !isGap(pl.gap)) errors.push("panels.gap: 'tight', 'comfortable' or 'spacious'")
			if (pl.behind !== undefined && pl.behind !== 'background' && pl.behind !== 'backdrop') errors.push("panels.behind: 'background' or 'backdrop'")
			if (pl.behindDim !== undefined && !(typeof pl.behindDim === 'number' && Number.isFinite(pl.behindDim) && pl.behindDim >= 0 && pl.behindDim <= 100))
				errors.push('panels.behindDim: a number from 0 to 100')
		} else {
			warnings.push('panels-v1: version 1 panels are converted on read (panelsV2Of) — ship { version: 2, … }')
			const mid = pl.middle
			if (!isObj(mid)) errors.push('panels.middle: { above: [ … ], primary: { key, tabs }, below: [ … ] }')
			else {
				list(mid.above, 'middle', 'panels.middle.above', true)
				panel(mid.primary, 'middle', 'panels.middle.primary', true)
				list(mid.below, 'middle', 'panels.middle.below', true)
			}
			list(pl.left, 'left', 'panels.left', false)
			list(pl.right, 'right', 'panels.right', false)
		}
		if (isObj(pl) && (pl.version === 1 || pl.version === 2) && ![...panelPlaced.keys()].some((id) => isInstanceOf(id, CONVERSATION) && !retired(id)))
			warnings.push(
				`panels place no copy of the conversation ('${CONVERSATION}') — a session draws one anyway (the primary floor), unless its genre withholds it for a role: 'primary' widget`,
			)
	}

	// Warnings: what draws, but not as written.
	const drawn = new Set(drawnWidgetIds(layout as SessionLayoutV1))
	// With `panels`, the old slots are not read: what is placed is what the panels hold.
	const placed = storedPanels(layout) ? panelPlaced : placedIn
	const framed = (zone: string) => {
		const frame = isObj(ag) ? ag[zone] : undefined
		return isObj(frame) && Array.isArray(frame.items) && (zone === 'middle' || frame.items.length > 0)
	}
	for (const [id, { zone }] of placed) {
		if (RETIRED_WIDGET_IDS.has(widgetOfInstance(id))) {
			warnings.push(`'${id}' names a retired widget — no reader draws it`)
			continue
		}
		if (!storedPanels(layout) && LEGACY_SLOT_DROPPED.has(widgetOfInstance(id))) {
			warnings.push(`'${id}' is a slot-era composer — the old slots never draw it; place the Composer in panels`)
			continue
		}
		if (drawn.has(id)) continue
		// Named, and never drawn: the page reads each zone one way
		// (`drawnWidgetIds`), and this id is not in what it reads.
		const why = framed(zone)
			? `the ${zone}'s arrangement draws there, and it does not place '${id}'`
			: `the grid puts it on the ${zone}, where the layout has no side zone to draw it in`
		warnings.push(`'${id}' is placed in the ${zone} but never drawn — ${why}`)
	}
	if (opts.widgets) {
		const decls = new Map(opts.widgets.map((w) => [w.id, w]))
		const counts = new Map<string, number>()
		for (const id of placed.keys()) {
			const widget = widgetOfInstance(id)
			counts.set(widget, (counts.get(widget) ?? 0) + 1)
			if (opts.unknownWidgets === 'warn' && !decls.has(widget) && !RETIRED_WIDGET_IDS.has(widget))
				warnings.push(`'${id}' names a widget this pub does not know — it draws as a placeholder`)
		}
		for (const [widget, n] of counts) {
			const cap = decls.get(widget)?.maxInstances
			if (typeof cap === 'number' && n > cap)
				warnings.push(`'${widget}' is placed ${n} times, over its maxInstances (${cap}) — readers draw the first ${cap}`)
		}
	}
	return { ok: errors.length === 0, errors, warnings }
}
