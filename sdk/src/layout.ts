/**
 * The session **layout document** (v2) — one typed document a genre ships, a
 * person edits and the app renders, plus the four pure functions that make it
 * mean something: `validateLayoutDoc`, `resolve`, `layoutOps` and `fromLegacy`.
 *
 * It lives beside `settings.ts` and `descriptors.ts` because it is a public
 * contract on the same terms as those: a plugin declares widgets and looks
 * against it, the CLI validates a shipped layout with it, the docs compiler
 * renders a genre's layout through it, and the app's stage is a renderer for
 * `resolve`'s answer and nothing else.
 *
 * ## The model in one paragraph
 *
 * Three fixed **zones** — left, middle, right — and the middle is the primary
 * one. Each zone is a CSS grid of **tracks** (rows and columns), each track
 * carrying an **extent** that says what it means (`grow`, `fit`, N `cells`, a
 * range) rather than a measured size. A **unit** sits on those tracks by grid
 * line: a widget, a tab **group** of widgets, or a spacer. Every unit carries
 * an **instance key**, unique in the document, which is what per-instance
 * settings and style pins are stored against. A **variant** is one screen
 * size's own zones, patched over the base a zone at a time. A **look** is a
 * declared layout variable at root, zone or unit scope. A **fold** is what a
 * unit does when its declared minimum cannot be met.
 *
 * ## What is deliberately not here
 *
 * No solver, no measured cells, no free CSS at root or zone scope, no fourth
 * zone. `resolve` emits grid templates and `grid-area` line strings; the
 * browser does the layout. Every future knob arrives as a declaration — a
 * `LookDecl` a plugin ships, a `WidgetDecl` field — rather than as a new key
 * this file has to learn.
 *
 * ## Versioning
 *
 * The document's `version` is `2`. **Additive keys never bump it**: readers
 * drop keys they do not know and draw unknown unit kinds as labelled
 * placeholders, so a document written by a newer build still resolves here. A
 * breaking change ships `version: 3` beside 2 with its own `fromV2`.
 */

import type { FieldDecl, I18nText, SettingsSchema } from './settings.js'
import type { I18n } from './i18n.js'
import type { WidgetBaseSection, WidgetSectionScope } from './widgets.js'

// ── Zones and sizes ─────────────────────────────────────────────────────────

/** The three zones, in visual order. There is no fourth; see the file header. @experimental */
export const ZONE_IDS = ['left', 'middle', 'right'] as const
/** @experimental */
export type ZoneId = (typeof ZONE_IDS)[number]

/**
 * The four sizes, as the **session box's** inline size — never the viewport's.
 * Opening a sidebar cascades the layout exactly as narrowing the window does,
 * which is the whole reason the numbers are measured on the box.
 * @experimental
 */
export const BREAKPOINTS = { compact: 0, cozy: 640, roomy: 1024, wide: 1440 } as const
/** @experimental */
export type Breakpoint = keyof typeof BREAKPOINTS

/** Ascending, which is the order every "at or above" rule walks. @experimental */
export const BREAKPOINT_ORDER: readonly Breakpoint[] = ['compact', 'cozy', 'roomy', 'wide']

/**
 * The reference box each size is edited and checked at (§5.1): a width and a
 * device height. `checkSizes` resolves at these, and the editor's Screen picker
 * draws them, so "what the phone will do" is one answer rather than two.
 * @experimental
 */
export const REFERENCE_BOXES: Record<Breakpoint, { width: number; height: number }> = {
	compact: { width: 390, height: 844 },
	cozy: { width: 640, height: 960 },
	roomy: { width: 1024, height: 768 },
	wide: { width: 1440, height: 900 },
}

/** The size a measured box is. Total: anything under `cozy` is `compact`. @experimental */
export function breakpointFor(width: number): Breakpoint {
	const w = Number.isFinite(width) ? width : 0
	let out: Breakpoint = 'compact'
	for (const bp of BREAKPOINT_ORDER) if (w >= BREAKPOINTS[bp]) out = bp
	return out
}

/**
 * The narrowest a widget is ever asked to be. A side thinner than this, or a
 * box thinner than a zone's own tracks, folds that zone to one column — the
 * one measurement in the whole model, and it is a floor rather than a ladder.
 * @experimental
 */
export const MIN_WIDGET_PX = 220

// ── The document ────────────────────────────────────────────────────────────

/**
 * What a track means, never what it measures.
 *
 * `grow` is `1fr`, `fit` is `auto`, `{ cells: n }` is N of the cell module, and
 * `{ min, max }` is a `minmax()` in cells. Nothing here is pixels: the cell
 * module is a root look emitted in `rem`, so a layout follows the reader's zoom
 * instead of pinning itself to one device.
 *
 * `{ grow: n }` is a **share**: n twelfths of what the grow tracks on that axis
 * divide between them, emitted as `nfr`. It exists because "Map beside Messages
 * at 8 and 4 of 12" is a sentence the editor's join gesture has to be able to
 * write down, and a bare `grow` has no number to write it in.
 *
 * ⚠ A share only reads as "n of twelve" when **every** grow track on that axis
 * carries one. `joinRow` and `setSpan` therefore materialise the whole axis
 * before they write (`materialiseShares`), and a track handle between two share
 * tracks moves both and preserves their total — which is what keeps the reading
 * true after a drag. A bare `grow` beside a share is a mixed axis, and its
 * share is whatever the weighted ones have not claimed.
 * @experimental
 */
export type Extent = 'grow' | 'fit' | { cells: number } | { min?: number; max?: number } | { grow: number }

/** A grow track's share is read in twelfths of its axis. @experimental */
export const TWELFTHS = 12

/**
 * A bag of **look** deviations — declared keys only, and only where the value
 * differs from the declaration's default. Everything else is inherited, so a
 * document says what somebody changed rather than restating the theme.
 * @experimental
 */
export type LookBag = Record<string, unknown>

/**
 * The shared half of every unit. Exported because the three unit types extend
 * it and a declaration emit cannot name a private type; a reader holding a unit
 * of an unknown `kind` can type it as this.
 * @experimental
 */
export interface UnitBase {
	/** `widget` · `group` · `spacer` today; anything else draws a placeholder. */
	kind: string
	/**
	 * The **instance key**: unique in the document, default the widget id.
	 *
	 * ⚠ There is deliberately **no `title`** here. What a unit is called comes
	 * from the `WidgetDecl` it names, so one rename reaches every document and a
	 * layout never carries a stale label for a widget somebody renamed. A person
	 * naming their own instance is a per-instance SETTING (`title`, core-owned),
	 * stored against this key — not a second copy of the name in the placement.
	 */
	key: string
	/** 1-based grid lines. `start` is the line, `span` the track count. */
	row: { start: number; span: number }
	col: { start: number; span: number }
	/** Absent means pinned — the 2026-09-10 rule, kept verbatim. */
	pinned?: boolean
	/** Fold order and space contention; default from the widget declaration. */
	priority?: number
	/** Unit-scope looks. */
	look?: LookBag
}

/** @experimental */
export interface WidgetUnit extends UnitBase {
	kind: 'widget'
	widget: string
}

/** Several widgets drawn as one tab set, occupying one unit's cells. @experimental */
export interface GroupUnit extends UnitBase {
	kind: 'group'
	members: Array<{ widget: string; key: string }>
}

/** Deliberate empty space, so a person can leave a hole without a placeholder. @experimental */
export interface SpacerUnit extends UnitBase {
	kind: 'spacer'
}

/** Discriminated on `kind`. A document may carry kinds this build has never heard of. @experimental */
export type Unit = WidgetUnit | GroupUnit | SpacerUnit

/** @experimental */
export interface Zone {
	/** At least one; the default is `['grow']`. */
	rows: Extent[]
	/** At least one; the default is `['grow']`. */
	cols: Extent[]
	units: Unit[]
	/** Zone-scope looks. */
	look?: LookBag
}

/** @experimental */
export interface SideZone extends Zone {
	/** Absent means a docked column; `false` means an icon rail. */
	pinned?: boolean
	/** The docked column's inline size. Default `{ cells: 6 }`. */
	width?: Extent
}

/** @experimental */
export interface LayoutDoc {
	version: 2
	zones: { left?: SideZone; middle: Zone; right?: SideZone }
	/**
	 * One size's own zones — **a patch, and the patch granularity is the zone**:
	 * a variant that names `right` replaces that whole zone and says nothing
	 * about the other two. A variant serves its own size and every smaller size
	 * that has none of its own (`resolve` rule 1).
	 */
	variants?: Partial<Record<Breakpoint, Partial<LayoutDoc['zones']>>>
	/** Root-scope looks. */
	look?: LookBag
}

/**
 * A layout as it is **shipped or saved**: the document plus the per-instance
 * settings and style pins that came with it. A genre ships one; a person's
 * saved preset is one; the reconciler writes all three columns from it.
 *
 * Both maps are keyed by **instance key**, not by widget id — which are the
 * same string until somebody places a second copy of a widget.
 * @experimental
 */
export interface LayoutPreset {
	layout: LayoutDoc
	widgetSettings?: Record<string, Record<string, unknown>>
	widgetStyles?: Record<string, { id: number; slug: string }>
}

/** The docked width a side takes when it does not declare one. @experimental */
export const DEFAULT_SIDE_WIDTH: Extent = { cells: 6 }

// ── Widget declarations ─────────────────────────────────────────────────────

/**
 * Data a widget requests access to (grant-gated, host-enforced at
 * projection): a scope that delivers a scoped section — the SDK's one table,
 * `WidgetScopedSections` (`session:full`, `session:state`, `persona`,
 * `characters`, `lore`) — or a `channel:<slug>`.
 * @experimental
 */
export type WidgetScope = WidgetSectionScope | `channel:${string}`

/** An external plugin dependency; the CLI captures pkg/range from the imports. @experimental */
export interface WidgetDependency {
	/** The depended-on plugin's stable manifest id. */
	pluginId: string
	/** The npm package the direct API reference resolved to (CLI-filled). */
	pkg?: string
	/** Semver range the author built against (CLI-filled). */
	range?: string
}

/**
 * A built-in style a widget ships. Seeded as a `source: "system"` row keyed by
 * `systemStyleSlug(widgetId, slug)`; users never edit these in place — they
 * clone one into a private style. `css` is the scoped skin injected into the
 * widget's box (a component) or frame document (frame); `vars` overrides design
 * tokens (CSS custom properties).
 * @experimental
 */
export interface WidgetStylePreset {
	/** Stable per-widget key — the seed identity within this widget's styles. */
	slug: string
	title: string
	css: string
	vars?: Record<string, string>
	/**
	 * What `vars` this pack exposes, in the one field language.
	 *
	 * Stored per style row as today — the schema only makes the pack's own
	 * knobs editable **without CSS**, so a person can retune a shipped skin
	 * instead of cloning it and hand-editing a stylesheet to change one radius.
	 * A var with no declaration here stays exactly what it is: CSS the author
	 * wrote, which nothing offers to edit.
	 */
	varsSchema?: SettingsSchema
}

/**
 * The globally-unique, reseed-stable slug for a widget's built-in style. This is
 * both the system row's `slug` (the layout's reference target) and its seed
 * identity — the reconciler upserts and prunes system rows by matching on it,
 * NEVER on a numeric id (the codified seed rule).
 *
 * Widget ids and preset slugs are simple kebab tokens (no `:`), so the join is
 * unambiguous.
 * @internal
 */
export function systemStyleSlug(widgetId: string, presetSlug: string): string {
	return `${widgetId}:${presetSlug}`
}

/**
 * The deprecated spelling of what a widget renders (R24): a plugin's own
 * frame document. `native` — a core component the page mounted in its own
 * tree — is gone (R79): every widget is a component, and a declaration still
 * spelling `{ kind: 'native' }` resolves to nothing.
 * @experimental
 */
export type WidgetSurfaceAlias = { kind: 'frame'; pluginId: string; entry: string }

/**
 * What a widget renders, resolved — the host's switch. `remote` is a
 * component running in its owner's UI worker, mirrored through the
 * vocabulary (§3.5) — core's own components as much as a plugin's (R79);
 * `frame` a plugin document in an opaque-origin iframe.
 * @experimental
 */
export type WidgetSurface =
	| { kind: 'frame'; pluginId: string; entry: string }
	| { kind: 'remote'; owner: string; component: string }

/**
 * Resolve a widget declaration to what the host mounts. `owner` is `'core'`
 * or the declaring plugin's id: a `component` is that owner's remote. `null`
 * when the declaration names nothing it may — validation reports that; the
 * host treats it as a missing widget, never a crash.
 *
 * The alias is held to the same rule as `component` (R25): a `frame` mounts
 * its OWN plugin's document, never another's.
 * @internal
 */
export function resolveWidgetSurface(
	decl: Pick<WidgetDecl, 'component' | 'surface'>,
	owner: string,
): WidgetSurface | null {
	if (typeof decl.component === 'string' && decl.component) return { kind: 'remote', owner, component: decl.component }
	const s = decl.surface as { kind?: unknown; pluginId?: unknown; entry?: unknown } | undefined
	if (s?.kind === 'frame' && typeof s.pluginId === 'string' && typeof s.entry === 'string')
		return owner === 'core' || s.pluginId === owner ? { kind: 'frame', pluginId: s.pluginId, entry: s.entry } : null
	return null
}

/**
 * One **widget** a session offers: the conversation, a portrait column, a
 * plugin frame. Component and frame widgets share ONE declaration (this) and
 * ONE data contract; the only difference is the iframe.
 *
 * Declaring a widget makes it *addable*. Where an instance of it sits is the
 * layout document's business — `placement` only says where a fresh drop lands.
 * @experimental
 */
export interface WidgetDecl {
	/** Stable id — units and `surface:open` intents key on this. */
	id: string
	/** Human title shown in the widget's chrome and the tray — a string or a locale map (R-20). */
	title: I18n
	/** Optional icon name (the app maps it to its icon set). */
	icon?: string
	/**
	 * The anchored conversation is `primary` — **required**: the middle is never
	 * empty, and if no primary widget is placed anywhere `resolve` appends it.
	 * Everything else is `secondary` (the default).
	 */
	role?: 'primary' | 'secondary'
	/**
	 * The genres whose sessions offer it (R71), by id — `widget()` reads
	 * genre values down to these. Absent = every genre. A genre may still
	 * withhold it (`GenreDecl.omitWidgets`).
	 */
	genres?: string[]
	/**
	 * What renders inside: the slug of a {@link ComponentDecl} in the same
	 * package (R25). Core's widgets name core components. Give this or the
	 * deprecated `surface`, never both.
	 */
	component?: string
	/**
	 * ⏳ The alias `component` replaces (R24), accepted until 0.7: `frame`
	 * mounts a generated component whose whole body is one `sp-frame` at the
	 * entry. `native` is retired (R79) and a written `remote` refused — name
	 * the component instead.
	 *
	 * @deprecated Declare `component`.
	 */
	surface?: WidgetSurfaceAlias
	/** Which channels feed it (20 §4/§7). A widget is a view onto its channels. */
	channels?: string[]
	/**
	 * Size bounds in **cells** — the floor and ceiling `resolve` and the editor
	 * both enforce. A unit whose allotted space is below `minW`/`minH` applies
	 * its `fold`, and the editor's track drag stops at the same number and names
	 * the widget.
	 */
	cells?: { minW?: number; maxW?: number; minH?: number; maxH?: number }
	/** Data the widget requests; each entry is a grant an admin can deny. */
	scopes?: WidgetScope[]
	/**
	 * The BASE sections this widget reads (R75) — `messages`, `settings`, … —
	 * and so the only ones its host sends it: a widget that does not read
	 * `messages` is never handed the log again on every token. Absent means
	 * every base section, which is what a widget declared before R75 reads.
	 * A name outside `WIDGET_BASE_SECTIONS` is refused where the widget is
	 * declared. Scoped sections are not named here — `scopes` asks for them.
	 */
	reads?: WidgetBaseSection[]
	/** External plugin dependencies (CLI-captured into the manifest). */
	dependencies?: WidgetDependency[]
	/** Built-in styles this widget ships; seeded as system rows. */
	presets?: WidgetStylePreset[]
	/**
	 * Per-instance settings this widget offers, in the SDK's one field
	 * language — the same `FieldDecl` a node's `params` are declared in, so one
	 * renderer draws both and an author who has written node params has written
	 * these.
	 *
	 * Exposure is progressive and declaration-driven: a field appears in the
	 * widget's settings panel only because it is here, and a field carrying
	 * `group: 'behaviour'` appears behind the advanced disclosure. Core owns
	 * `title` and `lane` for every widget, so those two keys are reserved and a
	 * declaration of either is ignored.
	 *
	 * Values are stored per widget instance as deviations from the defaults
	 * declared here; a field dropped from this schema has its stored values
	 * pruned on the next reconcile.
	 */
	settings?: SettingsSchema
	/**
	 * Where a fresh drop — or a `surface:open` intent — puts an instance, and
	 * what shape it takes when it lands. Placement only; a placed unit's
	 * position is the document's.
	 */
	placement?: {
		/** Default zone. Absent means `right`. */
		zone?: ZoneId
		/** Default row extent when placed alone in a row. Absent means `grow`. */
		height?: Extent
		/** Default column share of twelve when joining a row. */
		span?: number
		/** Default `pinned` for the unit. `layout.prefer: 'drawer'` maps to `false`. */
		pinned?: boolean
	}
	/**
	 * What happens below its declared minimum: `shrink` keeps it at whatever it
	 * is given, `scroll` keeps it and scrolls, `rail` sends it to the zone's
	 * icon rail, `hide` hides it. Absent means `scroll`.
	 */
	fold?: 'shrink' | 'scroll' | 'rail' | 'hide'
	/**
	 * Fold order and space contention: **lower yields first**, and the primary
	 * widget is `0`. Absent means 50.
	 */
	priority?: number
	/**
	 * ⏳ The surface-grid packer's hints, kept one release as deprecated inputs
	 * to the same defaults (`span.ideal` → `placement.span`, `minInline` →
	 * `cells.minW`, `prefer: 'drawer'` → `placement.pinned: false`).
	 *
	 * @deprecated Declare `placement`, `cells` and `fold` instead.
	 */
	layout?: {
		span?: { ideal?: number; min?: number; max?: number }
		minInline?: number
		minBlock?: number
		collapsible?: boolean
		closable?: boolean
		prefer?: 'grid' | 'drawer'
	}
	/** Seed this widget into a new session's default layout. Default false. */
	defaultActive?: boolean
}

// ── Look declarations ───────────────────────────────────────────────────────

/**
 * One **look**: a declared layout variable, at root, zone or unit scope.
 *
 * Looks are how the model grows without growing keys. Core ships eight
 * (`CORE_LOOKS`); a plugin ships its own under a namespaced key, and both are
 * read the same way — `resolve` reads the `structural` ones to build the grid
 * templates and passes every other one through as a CSS variable at its scope.
 * @experimental
 */
export interface LookDecl {
	/** Core bare (`backdrop`); a plugin namespaces it (`<pluginId>.key`). */
	key: string
	/** The settings field language: type, default, editor, group. */
	field: FieldDecl
	appliesTo: Array<'root' | 'zone' | 'unit'>
	/** Read by `resolve()` to build the templates. Everything else passes through. */
	structural?: boolean
	/** Default `--sp-look-<key>`. */
	cssVar?: string
	/**
	 * The CSS unit a numeric value is emitted in. `rem` divides by 16, so a
	 * value that is a module (the cell) follows the reader's zoom; `px` is for
	 * the gaps and pads that should not. Absent means the number is emitted
	 * bare, which is what a unitless variable (a count, a ratio) wants.
	 */
	unit?: 'px' | 'rem'
	label?: I18nText
	description?: I18nText
}

/**
 * The CSS custom property a look is emitted as.
 *
 * A plugin's key is namespaced with a dot, which is not an ident character, so
 * every character outside `[A-Za-z0-9_-]` becomes `-`. Two keys that differ
 * only in punctuation would collide; declare `cssVar` explicitly if that is
 * ever a real risk.
 * @experimental
 */
export function lookCssVar(decl: LookDecl): string {
	return decl.cssVar ?? `--sp-look-${decl.key.replace(/[^A-Za-z0-9_-]/g, '-')}`
}

/** Both declaration sets `resolve`, `checkSizes` and `validateLayoutDoc` read. @internal */
export interface LayoutDecls {
	widgets?: WidgetDecl[]
	looks?: LookDecl[]
}

// ── Small shared helpers ────────────────────────────────────────────────────

const isObj = (x: unknown): x is Record<string, unknown> =>
	!!x && typeof x === 'object' && !Array.isArray(x)

const isInt = (x: unknown): x is number => typeof x === 'number' && Number.isInteger(x)

const isCells = (e: Extent): e is { cells: number } =>
	isObj(e) && typeof (e as { cells?: unknown }).cells === 'number'

/** A weighted grow track — `{ grow: n }`, n twelfths of the axis. @experimental */
export const isShare = (e: Extent): e is { grow: number } =>
	isObj(e) && typeof (e as { grow?: unknown }).grow === 'number'

const isRange = (e: Extent): e is { min?: number; max?: number } =>
	isObj(e) && !isCells(e) && !isShare(e)

/** Bare or weighted — everything that divides what the fixed tracks leave. */
const isGrowish = (e: Extent): boolean => e === 'grow' || isShare(e)

/** The twelfths a grow track claims; a bare `grow` claims none of its own. */
const shareOf = (e: Extent): number => (isShare(e) ? e.grow : 0)

/** @experimental */
export function isExtent(x: unknown): x is Extent {
	if (x === 'grow' || x === 'fit') return true
	if (!isObj(x)) return false
	if (typeof x.grow === 'number') return Number.isInteger(x.grow) && x.grow > 0
	if (typeof x.cells === 'number') return Number.isFinite(x.cells) && x.cells > 0
	const okMin = x.min === undefined || (typeof x.min === 'number' && Number.isFinite(x.min))
	const okMax = x.max === undefined || (typeof x.max === 'number' && Number.isFinite(x.max))
	return okMin && okMax
}

/**
 * Give every bare `grow` track on one axis a share, so the axis reads in
 * twelfths — the step `joinRow` and `setSpan` take before they write.
 *
 * Shares already declared keep their number; the bare tracks divide what is
 * left, remainder first, so the axis totals twelve. An axis with fewer than two
 * grow tracks is returned untouched (`force` overrides that, for the moment a
 * single track is about to become two): one grow track is already the whole of
 * what the grow tracks share, and writing `{ grow: 12 }` for it would be noise
 * in every document that never joined anything.
 *
 * With more than twelve grow tracks there is no integer division of twelve, so
 * each gets one and the axis totals more — the honest floor rather than a zero.
 * @experimental
 */
export function materialiseShares(tracks: Extent[], force = false): Extent[] {
	const growIndexes = tracks.map((t, i) => (isGrowish(t) ? i : -1)).filter((i) => i >= 0)
	if (!growIndexes.length) return tracks
	if (!force && growIndexes.length < 2) return tracks
	const bare = growIndexes.filter((i) => tracks[i] === 'grow')
	if (!bare.length) return tracks
	const claimed = growIndexes.reduce((sum, i) => sum + shareOf(tracks[i]!), 0)
	const pool = Math.max(bare.length, TWELFTHS - claimed)
	const each = Math.floor(pool / bare.length)
	let spare = pool - each * bare.length
	const out = [...tracks]
	for (const i of bare) out[i] = { grow: each + (spare-- > 0 ? 1 : 0) }
	return out
}

const KNOWN_KINDS = new Set(['widget', 'group', 'spacer'])

/** Every widget id a unit names, the group members included. */
function widgetIdsOf(u: Unit): string[] {
	if (u.kind === 'widget') return typeof (u as WidgetUnit).widget === 'string' ? [(u as WidgetUnit).widget] : []
	if (u.kind === 'group')
		return ((u as GroupUnit).members ?? [])
			.map((m) => m?.widget)
			.filter((w): w is string => typeof w === 'string')
	return []
}

/** Every instance key a unit owns — its own and, for a group, its members'. */
function keysOf(u: Unit): string[] {
	const own = typeof u.key === 'string' ? [u.key] : []
	if (u.kind === 'group')
		for (const m of (u as GroupUnit).members ?? [])
			if (m && typeof m.key === 'string') own.push(m.key)
	return own
}

const zonesOf = (zones: LayoutDoc['zones'] | Partial<LayoutDoc['zones']>): Array<[ZoneId, Zone]> =>
	ZONE_IDS.map((id) => [id, (zones as Record<string, Zone | undefined>)?.[id]] as const).filter(
		(pair): pair is [ZoneId, Zone] => !!pair[1],
	)

/** Row-major reading order: down the rows, across the columns, key as tie-break. */
function rowMajor(units: Unit[]): Unit[] {
	return [...units].sort(
		(a, b) =>
			(a.row?.start ?? 0) - (b.row?.start ?? 0) ||
			(a.col?.start ?? 0) - (b.col?.start ?? 0) ||
			String(a.key).localeCompare(String(b.key)),
	)
}

// ── validateLayoutDoc ───────────────────────────────────────────────────────

/** @experimental */
export interface LayoutValidation {
	ok: boolean
	/** The document cannot be stored as it is. */
	errors: string[]
	/** Reported, pruned at reconcile, never fatal. */
	warnings: string[]
}

/**
 * The rules the type cannot express.
 *
 * **Errors** are structural: overlapping units, a position outside the zone's
 * tracks, a repeated instance key, a variant naming a size that is not one.
 * **Warnings** are everything a reader survives — an undeclared look key (which
 * is pruned at reconcile), a widget id this build has no component for, a unit
 * kind it has never heard of. Both of those draw a labelled placeholder rather
 * than failing, which is the whole point: uninstalling a plugin must not strand
 * a person's layout.
 *
 * Total: `doc` is `unknown` because the server runs this on every write.
 * @internal
 */
export function validateLayoutDoc(doc: unknown, opts?: LayoutDecls): LayoutValidation {
	const errors: string[] = []
	const warnings: string[] = []
	const err = (m: string) => {
		if (!errors.includes(m)) errors.push(m)
	}
	const warn = (m: string) => {
		if (!warnings.includes(m)) warnings.push(m)
	}

	if (!isObj(doc)) return { ok: false, errors: ['The layout document must be an object.'], warnings }
	if (doc.version !== 2) err(`\`version\` must be 2; this document says ${JSON.stringify(doc.version)}.`)
	if (!isObj(doc.zones)) {
		err('`zones` is required, with a `middle`.')
		return { ok: false, errors, warnings }
	}
	const zones = doc.zones as Record<string, unknown>
	if (!isObj(zones.middle)) err('`zones.middle` is required — the middle is the primary zone.')

	const widgetIds = new Set((opts?.widgets ?? []).map((w) => w.id))
	const looks = opts?.looks ?? []
	const lookByKey = new Map(looks.map((l) => [l.key, l]))

	const checkLooks = (bag: unknown, scope: 'root' | 'zone' | 'unit', where: string) => {
		if (bag === undefined) return
		if (!isObj(bag)) return err(`${where}: \`look\` must be an object of declared keys.`)
		if (!looks.length) return
		for (const key of Object.keys(bag)) {
			const decl = lookByKey.get(key)
			if (!decl) warn(`${where}: the look \`${key}\` is not declared; it is dropped at reconcile.`)
			else if (!decl.appliesTo.includes(scope))
				warn(
					`${where}: the look \`${key}\` applies to ${decl.appliesTo.join(', ')}, not ${scope}; it is dropped at reconcile.`,
				)
		}
	}

	/** One layer: the base, or one variant's effective zones. */
	const checkLayer = (layer: Record<string, unknown>, where: string) => {
		const seen = new Map<string, string>()
		for (const id of ZONE_IDS) {
			const raw = layer[id]
			if (raw === undefined) continue
			if (!isObj(raw)) {
				err(`${where}zone \`${id}\` must be a whole zone, with \`rows\`, \`cols\` and \`units\`.`)
				continue
			}
			const zone = raw as unknown as Zone
			const rows = Array.isArray(zone.rows) ? zone.rows : null
			const cols = Array.isArray(zone.cols) ? zone.cols : null
			if (!rows?.length) err(`${where}zone \`${id}\` must declare at least one row track.`)
			if (!cols?.length) err(`${where}zone \`${id}\` must declare at least one column track.`)
			for (const [axis, tracks] of [
				['row', rows],
				['column', cols],
			] as const)
				tracks?.forEach((t, i) => {
					if (isExtent(t)) return
					if (isObj(t) && typeof (t as { grow?: unknown }).grow === 'number')
						err(
							`${where}zone \`${id}\`: ${axis} track ${i + 1}'s share is ${JSON.stringify((t as { grow: unknown }).grow)}; a share is a whole number of twelfths, at least 1.`,
						)
					else err(`${where}zone \`${id}\`: ${axis} track ${i + 1} is not an extent.`)
				})
			if (id !== 'middle') {
				const side = zone as SideZone
				if (side.pinned !== undefined && typeof side.pinned !== 'boolean')
					err(`${where}zone \`${id}\`: \`pinned\` must be true or false.`)
				if (side.width !== undefined && !isExtent(side.width))
					err(`${where}zone \`${id}\`: \`width\` is not an extent.`)
			}
			checkLooks(zone.look, 'zone', `${where}zone \`${id}\``)

			if (!Array.isArray(zone.units)) {
				err(`${where}zone \`${id}\`: \`units\` must be an array.`)
				continue
			}
			const rowCount = rows?.length ?? 0
			const colCount = cols?.length ?? 0
			const placed: Array<{ key: string; r0: number; r1: number; c0: number; c1: number }> = []
			for (const unit of zone.units as Unit[]) {
				if (!isObj(unit)) {
					err(`${where}zone \`${id}\`: every unit must be an object.`)
					continue
				}
				if (typeof unit.key !== 'string' || !unit.key)
					err(`${where}zone \`${id}\`: every unit needs an instance key.`)
				if (typeof unit.kind !== 'string' || !unit.kind)
					err(`${where}zone \`${id}\`: every unit needs a \`kind\`.`)
				else if (!KNOWN_KINDS.has(unit.kind))
					warn(
						`${where}zone \`${id}\`: the unit \`${unit.key}\` has kind \`${unit.kind}\`, which draws a labelled placeholder.`,
					)
				if (unit.kind === 'widget' && typeof (unit as WidgetUnit).widget !== 'string')
					err(`${where}zone \`${id}\`: the unit \`${unit.key}\` names no widget.`)
				if (unit.kind === 'group') {
					const members = (unit as GroupUnit).members
					if (!Array.isArray(members) || !members.length)
						err(`${where}zone \`${id}\`: the group \`${unit.key}\` has no members.`)
					else
						for (const m of members)
							if (!isObj(m) || typeof m.widget !== 'string' || typeof m.key !== 'string')
								err(
									`${where}zone \`${id}\`: every member of the group \`${unit.key}\` needs a widget and an instance key.`,
								)
				}
				if (widgetIds.size)
					for (const w of widgetIdsOf(unit))
						if (!widgetIds.has(w))
							warn(
								`${where}zone \`${id}\`: \`${w}\` is not a widget this build knows; it draws a labelled placeholder.`,
							)
				for (const key of keysOf(unit)) {
					const prior = seen.get(key)
					if (prior)
						err(
							`${where}the instance key \`${key}\` is used twice (zone \`${prior}\` and zone \`${id}\`); keys are unique in the document.`,
						)
					else seen.set(key, id)
				}
				checkLooks(unit.look, 'unit', `${where}zone \`${id}\`: the unit \`${unit.key}\``)

				const spans: Array<['row' | 'col', { start: number; span: number } | undefined, number]> = [
					['row', unit.row, rowCount],
					['col', unit.col, colCount],
				]
				let ok = true
				for (const [axis, at, count] of spans) {
					const word = axis === 'row' ? 'row' : 'column'
					if (!isObj(at) || !isInt(at.start) || !isInt(at.span)) {
						err(
							`${where}zone \`${id}\`: the unit \`${unit.key}\` needs a \`${axis}\` of \`{ start, span }\` whole numbers.`,
						)
						ok = false
						continue
					}
					if (at.start < 1 || at.span < 1) {
						err(
							`${where}zone \`${id}\`: the unit \`${unit.key}\` starts at ${word} ${at.start} spanning ${at.span}; grid lines are 1-based and a span is at least 1.`,
						)
						ok = false
						continue
					}
					if (count && at.start + at.span - 1 > count) {
						err(
							`${where}zone \`${id}\`: the unit \`${unit.key}\` spans ${word}s ${at.start}–${at.start + at.span - 1}, but the zone has ${count} ${word} track${count === 1 ? '' : 's'}.`,
						)
						ok = false
					}
				}
				if (unit.pinned !== undefined && typeof unit.pinned !== 'boolean')
					err(`${where}zone \`${id}\`: the unit \`${unit.key}\`'s \`pinned\` must be true or false.`)
				if (ok && typeof unit.key === 'string')
					placed.push({
						key: unit.key,
						r0: unit.row.start,
						r1: unit.row.start + unit.row.span,
						c0: unit.col.start,
						c1: unit.col.start + unit.col.span,
					})
			}
			for (let i = 0; i < placed.length; i++)
				for (let j = i + 1; j < placed.length; j++) {
					const a = placed[i]!
					const b = placed[j]!
					if (a.r0 < b.r1 && a.r1 > b.r0 && a.c0 < b.c1 && a.c1 > b.c0)
						err(
							`${where}zone \`${id}\`: \`${a.key}\` and \`${b.key}\` claim the same cells.`,
						)
				}
		}
	}

	checkLooks(doc.look, 'root', 'The root')
	checkLayer(zones, '')

	if (doc.variants !== undefined) {
		if (!isObj(doc.variants)) err('`variants` must be an object keyed by size.')
		else
			for (const [bp, patch] of Object.entries(doc.variants)) {
				if (!(bp in BREAKPOINTS)) {
					err(
						`\`variants\` names \`${bp}\`, which is not a size (${BREAKPOINT_ORDER.join(', ')}).`,
					)
					continue
				}
				if (!isObj(patch)) {
					err(`Variant \`${bp}\` must be an object of whole zones.`)
					continue
				}
				for (const key of Object.keys(patch))
					if (!(ZONE_IDS as readonly string[]).includes(key))
						warn(`Variant \`${bp}\` names \`${key}\`, which is not a zone; it is dropped on read.`)
				// A variant is a patch at ZONE granularity, so the layer it
				// describes is the base with its own zones laid over the top —
				// which is what the overlap and key rules have to hold for.
				checkLayer({ ...zones, ...(patch as Record<string, unknown>) }, `Variant \`${bp}\`: `)
			}
	}

	return { ok: errors.length === 0, errors, warnings }
}

// ── resolve ─────────────────────────────────────────────────────────────────

/** @internal */
export interface Box {
	width: number
	height: number
	/** Measured side widths, when the host has them. */
	sideWidths?: Partial<Record<'left' | 'right', number>>
}

/** @internal */
export interface ResolvedUnit {
	key: string
	/** A `grid-area` line string: `rowStart / colStart / rowEnd / colEnd`. */
	area: string
	/** Not drawn at this size (fold `hide`, or a hidden zone). */
	hidden?: boolean
	/** Drawn as an icon in the zone's rail rather than in the grid. */
	rail?: boolean
	/**
	 * Set **only** when this unit's declared minimum could not be met at this
	 * size — the fold that was applied. Absent means the unit fits.
	 */
	fold?: 'shrink' | 'scroll' | 'rail' | 'hide'
	/** Unit-scope look variables. */
	vars?: Record<string, string>
}

/** @internal */
export interface ResolvedZone {
	state: 'docked' | 'rail' | 'sheet' | 'hidden'
	gridTemplateRows: string
	gridTemplateColumns: string
	units: ResolvedUnit[]
	vars: Record<string, string>
}

/** @internal */
export interface Resolved {
	breakpoint: Breakpoint
	/** `null` = the document declares no such zone. */
	zones: Record<ZoneId, ResolvedZone | null>
	/** Root CSS variables: the structural looks and every pass-through one. */
	vars: Record<string, string>
}

/** `{ cells: 3 }` → `calc(3 * var(--sp-cell))`. The host sets `--sp-cell` in rem. */
const cellsCss = (n: number): string => `calc(${n} * var(--sp-cell))`

/** @experimental */
export function extentToCss(e: Extent): string {
	if (e === 'grow') return '1fr'
	if (e === 'fit') return 'auto'
	if (isShare(e)) return `${e.grow}fr`
	if (isCells(e)) return cellsCss(e.cells)
	const min = typeof e.min === 'number' ? cellsCss(e.min) : '0'
	const max = typeof e.max === 'number' ? cellsCss(e.max) : '1fr'
	return `minmax(${min}, ${max})`
}

/** The px a track is worth before sharing; `null` = it takes a share of the rest. */
function extentFloorPx(e: Extent, cell: number): number | null {
	if (e === 'grow' || e === 'fit' || isShare(e)) return null
	if (isCells(e)) return e.cells * cell
	if (isRange(e) && typeof e.min === 'number') return e.min * cell
	return null
}

/**
 * Per-track px: fixed tracks take their floor, the rest share what is left —
 * **in proportion to their share**, so `{ grow: 8 }` beside `{ grow: 4 }` is
 * two thirds and one third rather than half and half. A bare `grow` and a `fit`
 * weigh one apiece, which is what `1fr` and `auto` do.
 */
function trackPx(tracks: Extent[], available: number, cell: number, gap: number): number[] {
	const out = tracks.map(() => 0)
	const flex: number[] = []
	let fixed = 0
	let weight = 0
	tracks.forEach((t, i) => {
		const px = extentFloorPx(t, cell)
		if (px === null) {
			flex.push(i)
			weight += isShare(t) ? t.grow : 1
		} else {
			out[i] = px
			fixed += px
		}
	})
	const gaps = Math.max(0, tracks.length - 1) * gap
	const rest = Math.max(0, available - gaps - fixed)
	for (const i of flex) {
		const t = tracks[i]!
		out[i] = weight > 0 ? (rest * (isShare(t) ? t.grow : 1)) / weight : 0
	}
	return out
}

/**
 * One extent for a span of them — what a multi-row unit becomes when its zone
 * folds to one column. `grow` wins (something in the span wants the rest);
 * otherwise cells sum, and a span of `fit` alone stays `fit`.
 */
function combineExtents(list: Extent[]): Extent {
	if (!list.length) return 'grow'
	// One track combines to itself, share and all.
	if (list.length === 1) return list[0]!
	if (list.some((e) => e === 'grow')) return 'grow'
	// Shares add up: two rows of four twelfths fold into one of eight.
	const shares = list.filter(isShare)
	if (shares.length) return { grow: shares.reduce((sum, e) => sum + e.grow, 0) }
	let cells = 0
	let min = 0
	let max = 0
	let sawRange = false
	let sawFit = false
	for (const e of list) {
		if (e === 'fit') sawFit = true
		else if (isCells(e)) cells += e.cells
		else if (isRange(e)) {
			sawRange = true
			min += e.min ?? 0
			max += e.max ?? 0
		}
	}
	if (cells > 0 && !sawRange) return { cells }
	if (sawRange) {
		const out: { min?: number; max?: number } = {}
		if (min + cells > 0) out.min = min + cells
		if (max > 0) out.max = max + cells
		return out
	}
	return sawFit ? 'fit' : 'grow'
}

/**
 * How many tracks a grid template names.
 *
 * A paren-aware scan rather than a split on whitespace, because a single track
 * is routinely `calc(4 * var(--sp-cell))` or `minmax(0, 1fr)` and both carry
 * spaces of their own. Counting those as three tracks would make a one-column
 * zone look like several to anything reading the template back.
 * @internal
 */
export function trackCount(template: string): number {
	let depth = 0
	let count = 0
	let inTrack = false
	for (const ch of template) {
		if (ch === '(') depth++
		else if (ch === ')') depth = Math.max(0, depth - 1)
		const space = depth === 0 && /\s/.test(ch)
		if (space) inTrack = false
		else if (!inTrack) {
			inTrack = true
			count++
		}
	}
	return count
}

const areaOf = (u: { row: { start: number; span: number }; col: { start: number; span: number } }): string =>
	`${u.row.start} / ${u.col.start} / ${u.row.start + u.row.span} / ${u.col.start + u.col.span}`

/** Stringify one look value by its field type (rule 6). */
function lookToCss(decl: LookDecl, value: unknown): string {
	const t = decl.field.type
	if (value === null || value === undefined) return ''
	if (t === 'boolean') return value ? '1' : '0'
	if (t === 'number' || t === 'integer') {
		const n = Number(value)
		if (!Number.isFinite(n)) return ''
		if (decl.unit === 'rem') return `${n / 16}rem`
		if (decl.unit === 'px') return `${n}px`
		return String(n)
	}
	if (typeof value === 'string') return value
	return JSON.stringify(value)
}

/** The CSS variables one look bag becomes at one scope. */
function looksToVars(
	bag: LookBag | undefined,
	scope: 'root' | 'zone' | 'unit',
	looks: LookDecl[],
	withDefaults: boolean,
): Record<string, string> {
	const out: Record<string, string> = {}
	for (const decl of looks) {
		if (!decl.appliesTo.includes(scope)) continue
		const has = bag && Object.prototype.hasOwnProperty.call(bag, decl.key)
		const value = has ? bag![decl.key] : withDefaults ? decl.field.default : undefined
		if (value === undefined) continue
		const css = lookToCss(decl, value)
		if (css !== '') out[lookCssVar(decl)] = css
	}
	return out
}

/** A declared look's value at one scope, falling back to its default. */
function lookValue(bag: LookBag | undefined, key: string, looks: LookDecl[]): unknown {
	if (bag && Object.prototype.hasOwnProperty.call(bag, key)) return bag[key]
	return looks.find((l) => l.key === key)?.field.default
}

const numberLook = (bag: LookBag | undefined, key: string, looks: LookDecl[], fallback: number): number => {
	const v = lookValue(bag, key, looks)
	return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

/**
 * The variant that serves a size: the nearest **customized** one at or above
 * it. A variant at `roomy` serves `cozy` and `compact` unless they have their
 * own, and nothing below the base ever reaches upward — which is what makes a
 * phone edit unable to touch the desktop.
 * @experimental
 */
export function servingVariant(doc: LayoutDoc, bp: Breakpoint): Breakpoint | null {
	const from = BREAKPOINT_ORDER.indexOf(bp)
	for (let i = from; i < BREAKPOINT_ORDER.length; i++) {
		const at = BREAKPOINT_ORDER[i]!
		if (doc.variants && doc.variants[at]) return at
	}
	return null
}

/** The zones in force at one size: the base patched, a zone at a time. @internal */
export function effectiveZones(doc: LayoutDoc, bp: Breakpoint): LayoutDoc['zones'] {
	const base = (doc.zones ?? {}) as LayoutDoc['zones']
	const at = servingVariant(doc, bp)
	if (!at) return base
	const patch = doc.variants![at]!
	const out = { ...base } as Record<string, Zone | undefined>
	for (const id of ZONE_IDS) {
		const z = (patch as Record<string, Zone | undefined>)[id]
		if (z) out[id] = z
	}
	return out as LayoutDoc['zones']
}

/**
 * The document at one box, as grid templates and `grid-area` strings.
 *
 * Pure and **total** for every box and every document that parses — unknown
 * look keys and unknown unit kinds included. The six rules run in the order
 * §2.5 states them, and each is marked below.
 * @internal
 */
export function resolve(doc: LayoutDoc, box: Box, decls?: LayoutDecls): Resolved {
	const looks = decls?.looks ?? []
	const widgets = decls?.widgets ?? []
	const widgetById = new Map(widgets.map((w) => [w.id, w]))
	const width = Number.isFinite(box?.width) ? Math.max(0, box.width) : 0
	const height = Number.isFinite(box?.height) ? Math.max(0, box.height) : 0
	const bp = breakpointFor(width)

	const rootLook = isObj(doc?.look) ? (doc!.look as LookBag) : undefined
	const cell = numberLook(rootLook, 'cell', looks, 44)
	const rootGap = numberLook(rootLook, 'gap', looks, 12)
	const rootPad = numberLook(rootLook, 'pad', looks, 12)
	const railWidth = numberLook(rootLook, 'railWidth', looks, 36)

	// ── rule 1: the effective zones ─────────────────────────────────────
	const zones = effectiveZones(doc, bp)

	// ── rule 2: the middle is never empty ───────────────────────────────
	const primary = widgets.find((w) => w.role === 'primary')
	const middleRaw: Zone | undefined = (zones as Record<string, Zone | undefined>).middle
	const middle: Zone = middleRaw ?? { rows: ['grow'], cols: ['grow'], units: [] }
	let effective: Record<string, Zone | undefined> = { ...(zones as Record<string, Zone | undefined>), middle }
	if (primary) {
		const placedAnywhere = zonesOf(effective as LayoutDoc['zones']).some(([, z]) =>
			(z.units ?? []).some((u) => widgetIdsOf(u).includes(primary.id)),
		)
		if (!placedAnywhere) {
			const unit: WidgetUnit = {
				kind: 'widget',
				key: primary.id,
				widget: primary.id,
				row: { start: 1, span: 1 },
				col: { start: 1, span: 1 },
			}
			const units = middle.units ?? []
			if (!units.length) {
				// No units at all: the middle IS the primary widget, one grow row.
				effective = { ...effective, middle: { ...middle, rows: ['grow'], cols: ['grow'], units: [unit] } }
			} else {
				// Placed nowhere but the middle has other units: append a row.
				const rows = [...(middle.rows ?? ['grow']), 'grow' as Extent]
				const cols = middle.cols ?? ['grow']
				effective = {
					...effective,
					middle: {
						...middle,
						rows,
						cols,
						units: [
							...units,
							{ ...unit, row: { start: rows.length, span: 1 }, col: { start: 1, span: cols.length } },
						],
					},
				}
			}
		}
	}

	// ── rule 3: below roomy the sides are sheets and the middle is the page ──
	const belowRoomy = BREAKPOINTS[bp] < BREAKPOINTS.roomy

	const stateOf = (id: ZoneId, zone: Zone): ResolvedZone['state'] => {
		if (id === 'middle') return 'docked'
		if (!(zone.units ?? []).length) return 'hidden'
		if (belowRoomy) return 'sheet'
		// ── rule 5: an unpinned side is a rail ──────────────────────────
		return (zone as SideZone).pinned === false ? 'rail' : 'docked'
	}

	const states: Partial<Record<ZoneId, ResolvedZone['state']>> = {}
	for (const [id, zone] of zonesOf(effective as LayoutDoc['zones'])) states[id] = stateOf(id, zone)

	const sideWidthPx = (id: 'left' | 'right'): number => {
		const zone = effective[id] as SideZone | undefined
		if (!zone) return 0
		const state = states[id]
		if (state === 'hidden') return 0
		if (state === 'rail') return railWidth
		if (state === 'sheet') return width
		const measured = box?.sideWidths?.[id]
		if (typeof measured === 'number' && Number.isFinite(measured) && measured > 0) return measured
		return extentFloorPx(zone.width ?? DEFAULT_SIDE_WIDTH, cell) ?? 6 * cell
	}

	const availableOf = (id: ZoneId): number => {
		if (id !== 'middle') return sideWidthPx(id)
		if (belowRoomy) return Math.max(0, width - rootPad * 2)
		const sides = (['left', 'right'] as const).reduce(
			(sum, s) => sum + (states[s] === 'sheet' ? 0 : sideWidthPx(s)),
			0,
		)
		return Math.max(0, width - sides - rootPad * 2)
	}

	const out: Record<ZoneId, ResolvedZone | null> = { left: null, middle: null, right: null }

	for (const [id, zone] of zonesOf(effective as LayoutDoc['zones'])) {
		const state = states[id]!
		const zoneLook = isObj(zone.look) ? (zone.look as LookBag) : undefined
		const gap = numberLook(zoneLook, 'gap', looks, rootGap)
		const available = availableOf(id)

		const rows = (Array.isArray(zone.rows) && zone.rows.length ? zone.rows : (['grow'] as Extent[])).filter(
			isExtent,
		)
		const cols = (Array.isArray(zone.cols) && zone.cols.length ? zone.cols : (['grow'] as Extent[])).filter(
			isExtent,
		)
		const safeRows = rows.length ? rows : (['grow'] as Extent[])
		const safeCols = cols.length ? cols : (['grow'] as Extent[])
		const units = (Array.isArray(zone.units) ? zone.units : []).filter(
			(u): u is Unit => isObj(u) && isObj(u.row) && isObj(u.col),
		)

		// Rule 5, unit half: a whole rail is icons; an unpinned unit in a
		// docked side is one icon. Railed units leave the grid, so they are
		// taken out before the tracks are derived.
		const railed = new Set<string>()
		if (state === 'rail') for (const u of units) railed.add(u.key)
		else if (state === 'docked' && id !== 'middle')
			for (const u of units) if (u.pinned === false) railed.add(u.key)

		const gridUnits = units.filter((u) => !railed.has(u.key))

		// ── rule 3, second half: fold to one column ─────────────────────
		const trackFloor =
			safeCols.reduce((sum, c) => sum + (extentFloorPx(c, cell) ?? MIN_WIDGET_PX), 0) +
			Math.max(0, safeCols.length - 1) * gap
		const folds =
			state !== 'hidden' &&
			(belowRoomy || (available > 0 && (available < MIN_WIDGET_PX || available < trackFloor)))

		let useRows = safeRows
		let useCols = safeCols
		let placed: Array<{ unit: Unit; row: { start: number; span: number }; col: { start: number; span: number } }>

		if (folds && safeCols.length >= 1) {
			const order = rowMajor(gridUnits)
			useCols = ['grow']
			useRows = order.map((u) =>
				combineExtents(
					safeRows.slice(Math.max(0, u.row.start - 1), Math.max(0, u.row.start - 1 + Math.max(1, u.row.span))),
				),
			)
			if (!useRows.length) useRows = ['grow']
			placed = order.map((unit, i) => ({
				unit,
				row: { start: i + 1, span: 1 },
				col: { start: 1, span: 1 },
			}))
		} else {
			placed = gridUnits.map((unit) => ({ unit, row: unit.row, col: unit.col }))
		}

		const colPx = trackPx(useCols, available, cell, gap)
		const rowPx = trackPx(useRows, Math.max(0, height - rootPad * 2), cell, gap)

		// ── rule 4: a minimum that cannot be met applies the unit's fold,
		//            and lower priority yields first ──────────────────────
		const foldOf = (u: Unit): NonNullable<ResolvedUnit['fold']> => {
			const decl = widgetById.get(widgetIdsOf(u)[0] ?? '')
			return decl?.fold ?? 'scroll'
		}
		const priorityOf = (u: Unit): number => {
			if (typeof u.priority === 'number') return u.priority
			const decl = widgetById.get(widgetIdsOf(u)[0] ?? '')
			return decl?.priority ?? 50
		}
		const widthOf = (p: (typeof placed)[number]): number => {
			let px = 0
			for (let i = p.col.start - 1; i < p.col.start - 1 + p.col.span; i++) px += colPx[i] ?? 0
			return px + Math.max(0, p.col.span - 1) * gap
		}
		const heightOf = (p: (typeof placed)[number]): number | null => {
			// Only a deterministic row span has a height worth checking: a
			// `fit` row is content-sized and a `grow` row is whatever is left,
			// so neither can be under a minimum in any meaningful sense.
			const span = useRows.slice(p.row.start - 1, p.row.start - 1 + p.row.span)
			if (!span.length || span.some((e) => e === 'grow' || e === 'fit')) return null
			let px = 0
			for (let i = p.row.start - 1; i < p.row.start - 1 + p.row.span; i++) px += rowPx[i] ?? 0
			return px + Math.max(0, p.row.span - 1) * gap
		}

		const applied = new Map<string, NonNullable<ResolvedUnit['fold']>>()
		if (available > 0) {
			// Ascending priority: the unit that yields first is the one that
			// matters least, and each rail/hide hands its width back as slack
			// the survivors can use.
			const byRow = new Map<number, typeof placed>()
			for (const p of placed) {
				const list = byRow.get(p.row.start) ?? []
				list.push(p)
				byRow.set(p.row.start, list)
			}
			for (const list of byRow.values()) {
				let slack = 0
				const contenders = [...list].sort(
					(a, b) => priorityOf(a.unit) - priorityOf(b.unit) || String(a.unit.key).localeCompare(String(b.unit.key)),
				)
				const survivors = contenders.length
				let yielded = 0
				for (const p of contenders) {
					const decl = widgetById.get(widgetIdsOf(p.unit)[0] ?? '')
					const minW = decl?.cells?.minW
					const minH = decl?.cells?.minH
					const have = widthOf(p) + slack
					const tooNarrow = typeof minW === 'number' && minW > 0 && have < minW * cell
					const h = heightOf(p)
					const tooShort = typeof minH === 'number' && minH > 0 && h !== null && h < minH * cell
					if (!tooNarrow && !tooShort) continue
					const fold = foldOf(p.unit)
					// The last one standing is never folded away: a row of one
					// widget that does not fit still has to draw something.
					if ((fold === 'rail' || fold === 'hide') && yielded >= survivors - 1) {
						applied.set(p.unit.key, fold === 'hide' ? 'shrink' : 'scroll')
						continue
					}
					applied.set(p.unit.key, fold)
					if (fold === 'rail' || fold === 'hide') {
						slack += widthOf(p) + gap
						yielded++
					}
				}
			}
		}

		const hiddenKeys = new Set<string>()
		for (const [key, fold] of applied) {
			if (fold === 'hide') hiddenKeys.add(key)
			if (fold === 'rail') railed.add(key)
		}

		// In the folded path the rows are DERIVED from the units, so a unit
		// that left the grid takes its row with it. In the unfolded path the
		// tracks are the author's and stay exactly as declared.
		let finalRows = useRows
		let finalPlaced = placed
		if (folds) {
			const kept = placed.filter((p) => !hiddenKeys.has(p.unit.key) && !railed.has(p.unit.key))
			finalRows = kept.length ? kept.map((p) => useRows[p.row.start - 1] ?? 'grow') : ['grow']
			finalPlaced = kept.map((p, i) => ({ ...p, row: { start: i + 1, span: 1 } }))
		}

		const resolvedUnits: ResolvedUnit[] = []
		for (const p of finalPlaced) {
			const vars = looksToVars(p.unit.look, 'unit', looks, false)
			resolvedUnits.push({
				key: p.unit.key,
				area: areaOf(p),
				...(hiddenKeys.has(p.unit.key) ? { hidden: true as const } : {}),
				...(applied.has(p.unit.key) ? { fold: applied.get(p.unit.key)! } : {}),
				...(Object.keys(vars).length ? { vars } : {}),
			})
		}
		// Railed units keep their identity and their declared cells, so a host
		// that expands a flyout has somewhere to draw it.
		for (const u of units)
			if (railed.has(u.key)) {
				const vars = looksToVars(u.look, 'unit', looks, false)
				resolvedUnits.push({
					key: u.key,
					area: areaOf(u),
					rail: true,
					...(hiddenKeys.has(u.key) ? { hidden: true as const } : {}),
					...(applied.has(u.key) ? { fold: applied.get(u.key)! } : {}),
					...(Object.keys(vars).length ? { vars } : {}),
				})
			}

		out[id] = {
			state,
			gridTemplateRows: finalRows.map(extentToCss).join(' '),
			gridTemplateColumns: useCols.map(extentToCss).join(' '),
			units: resolvedUnits,
			// ── rule 6, zone scope: deviations only; the rest cascades ──
			vars: looksToVars(zoneLook, 'zone', looks, false),
		}
	}

	// ── rule 6, root scope: every declared root look, default included, so
	//            the host always has `--sp-cell` to calc against ────────────
	return { breakpoint: bp, zones: out, vars: looksToVars(rootLook, 'root', looks, true) }
}

// ── checkSizes ──────────────────────────────────────────────────────────────

/** @experimental */
export type LayoutFindingKind = 'below-minimum' | 'hidden' | 'folded' | 'sheet'

/** @experimental */
export interface LayoutFinding {
	breakpoint: Breakpoint
	kind: LayoutFindingKind
	zone: ZoneId
	/** The unit's instance key, where the finding is about one unit. */
	key?: string
	/** One sentence, ready to show. */
	message: string
}

/** @experimental */
export type SizeFindings = Record<Breakpoint, LayoutFinding[]>

const SIZE_LABEL: Record<Breakpoint, string> = {
	compact: 'Compact',
	cozy: 'Cozy',
	roomy: 'Roomy',
	wide: 'Wide',
}

const FOLD_SENTENCE: Record<NonNullable<ResolvedUnit['fold']>, string> = {
	shrink: 'it will be squeezed',
	scroll: 'it will scroll',
	rail: 'it will move to the rail',
	hide: 'it will be hidden',
}

/**
 * The document at every size, and what each one costs.
 *
 * A **finding is a deviation**, never a consequence of the rules themselves:
 * below `roomy` every zone folds to one column and every side becomes a sheet,
 * which is the contract rather than a surprise, so neither is reported there. A
 * zone that folds at `roomy` or `wide` — because its own tracks do not fit the
 * box — is reported, and so is every unit below its declared minimum and every
 * unit hidden, at any size.
 *
 * Pure and total; the editor shows these on Done and the CLI treats a finding
 * on a shipped layout as an error.
 * @experimental
 */
export function checkSizes(doc: LayoutDoc, decls?: LayoutDecls): SizeFindings {
	const out: SizeFindings = { compact: [], cozy: [], roomy: [], wide: [] }
	for (const bp of BREAKPOINT_ORDER) {
		const findings: LayoutFinding[] = []
		const zones = effectiveZones(doc, bp)
		const resolved = resolve(doc, REFERENCE_BOXES[bp], decls)
		const expectedFold = BREAKPOINTS[bp] < BREAKPOINTS.roomy
		for (const id of ZONE_IDS) {
			const zone = resolved.zones[id]
			if (!zone) continue
			const declared = (zones as Record<string, Zone | undefined>)[id]
			const declaredCols = declared?.cols?.length ?? 1
			const drawnCols = Math.max(1, trackCount(zone.gridTemplateColumns))
			if (!expectedFold && declaredCols > 1 && drawnCols === 1 && zone.state !== 'hidden')
				findings.push({
					breakpoint: bp,
					kind: 'folded',
					zone: id,
					message: `${SIZE_LABEL[bp]}: the ${id} zone does not fit its ${declaredCols} columns, so it folds to one.`,
				})
			if (!expectedFold && zone.state === 'sheet')
				findings.push({
					breakpoint: bp,
					kind: 'sheet',
					zone: id,
					message: `${SIZE_LABEL[bp]}: the ${id} zone becomes a sheet over the middle.`,
				})
			for (const unit of zone.units) {
				if (unit.hidden)
					findings.push({
						breakpoint: bp,
						kind: 'hidden',
						zone: id,
						key: unit.key,
						message: `${SIZE_LABEL[bp]}: ${unit.key} is hidden.`,
					})
				else if (unit.fold)
					findings.push({
						breakpoint: bp,
						kind: 'below-minimum',
						zone: id,
						key: unit.key,
						message: `${SIZE_LABEL[bp]}: ${unit.key} is below its declared minimum, ${FOLD_SENTENCE[unit.fold]}.`,
					})
			}
		}
		out[bp] = findings
	}
	return out
}

// ── Operations ──────────────────────────────────────────────────────────────

/**
 * Every op returns this. `doc` is the INPUT BY REFERENCE when nothing changed —
 * which is what lets a store skip a repaint and a test assert "this gesture did
 * nothing" without comparing trees. `refused` is one sentence, and when it is
 * set `doc` is always the input.
 * @experimental
 */
export interface LayoutOpResult {
	doc: LayoutDoc
	refused?: string
}

/**
 * Where an edit lands. `'base'` is the document every size inherits; a
 * breakpoint is that size's variant.
 *
 * ⚠ Only **position** edits honour a breakpoint target. Membership — adding,
 * removing, pinning, grouping, looks — is size-neutral and always writes the
 * base *and* every variant that shadows the zone, because a person who adds
 * Stats on the train expects Stats on the desk (§5.5).
 * @experimental
 */
export type OpTarget = 'base' | Breakpoint

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T

const refuse = (doc: LayoutDoc, refused: string): LayoutOpResult => ({ doc, refused })

/** Store a rebuilt document, or refuse it if the rebuild broke a rule. */
function commit(input: LayoutDoc, next: LayoutDoc, decls?: LayoutDecls): LayoutOpResult {
	if (JSON.stringify(next) === JSON.stringify(input)) return { doc: input }
	const check = validateLayoutDoc(next, decls)
	if (!check.ok) return refuse(input, check.errors[0]!)
	return { doc: next }
}

/** Every zone object that stands for `id`: the base's, and every variant's. */
function layersFor(doc: LayoutDoc, id: ZoneId): Array<{ get: () => Zone | undefined; set: (z: Zone) => void }> {
	const layers: Array<{ get: () => Zone | undefined; set: (z: Zone) => void }> = [
		{
			get: () => (doc.zones as Record<string, Zone | undefined>)[id],
			set: (z) => {
				;(doc.zones as Record<string, Zone | undefined>)[id] = z
			},
		},
	]
	for (const bp of BREAKPOINT_ORDER) {
		const patch = doc.variants?.[bp]
		if (!patch) continue
		const record = patch as Record<string, Zone | undefined>
		if (!record[id]) continue
		layers.push({ get: () => record[id], set: (z) => void (record[id] = z) })
	}
	return layers
}

/** The zone one positional edit writes: the base's, or the variant's own. */
function positionalZone(doc: LayoutDoc, id: ZoneId, target: OpTarget): Zone | undefined {
	if (target === 'base') return (doc.zones as Record<string, Zone | undefined>)[id]
	const patch = (doc.variants ??= {})[target] ?? ((doc.variants[target] = {}) as Partial<LayoutDoc['zones']>)
	const record = patch as Record<string, Zone | undefined>
	if (!record[id]) {
		const base = (doc.zones as Record<string, Zone | undefined>)[id]
		if (!base) return undefined
		record[id] = clone(base)
	}
	return record[id]
}

const findUnit = (zone: Zone, key: string): Unit | undefined => (zone.units ?? []).find((u) => u.key === key)

function zoneHolding(zones: LayoutDoc['zones'], key: string): ZoneId | undefined {
	for (const [id, zone] of zonesOf(zones)) if (findUnit(zone, key)) return id
	return undefined
}

/** Do two units' row bands overlap at all? */
const sharesRows = (a: Unit, b: Unit): boolean =>
	a.row.start < b.row.start + b.row.span && b.row.start < a.row.start + a.row.span

/**
 * Drop the tracks nothing is on any more — run at the end of every op that
 * moves or removes a unit, in place, on the zone that changed.
 *
 * Three rules, and each is the inverse of a gesture:
 *
 *   1. **A row no unit covers goes**, and everything below it shifts up. A move
 *      leaves the row it came from empty; a `fit` row collapses to nothing but
 *      a `grow` one keeps its share, so the hole would be visible.
 *   2. **A unit left alone in its row band reclaims the full width.** A column
 *      split only ever exists because two units share a row, so when one of
 *      them leaves the other should not be left beside a hole. The inverse of
 *      the join, and the only way a unit's span shrinks in the first place.
 *   3. **A column split no unit uses collapses back to one track** — but only
 *      when every column track is a grow variety. Columns the author sized in
 *      cells are reserved space somebody asked for; collapsing those would be
 *      tidying away a decision rather than a leftover.
 *
 * A zone with no units keeps its tracks: there is nothing to infer from an
 * empty zone, and a zone needs at least one row and one column either way.
 * @experimental
 */
export function tidyZone(zone: Zone): void {
	const rows = zone.rows ?? []
	const cols = zone.cols ?? []
	let units = zone.units ?? []
	if (!units.length) return

	// 1. rows nothing covers.
	const used = new Set<number>()
	for (const u of units) for (let r = u.row.start; r < u.row.start + u.row.span; r++) used.add(r)
	if (used.size && used.size < rows.length) {
		const keep = rows.map((_, i) => used.has(i + 1))
		// Old grid line → new grid line.
		const line: number[] = []
		let at = 1
		for (let i = 0; i <= keep.length; i++) {
			line[i + 1] = at
			if (keep[i]) at++
		}
		zone.rows = rows.filter((_, i) => keep[i])
		units = units.map((u) => {
			const start = line[u.row.start] ?? 1
			const end = line[u.row.start + u.row.span] ?? start + 1
			return { ...u, row: { start, span: Math.max(1, end - start) } }
		})
	}

	// 2. a unit alone in its row band takes the whole width back.
	const width = (zone.cols ?? cols).length
	units = units.map((u) =>
		units.some((o) => o.key !== u.key && sharesRows(o, u))
			? u
			: { ...u, col: { start: 1, span: width } },
	)

	// 3. a split nobody is using.
	const full = units.every((u) => u.col.start === 1 && u.col.span === width)
	if (width > 1 && full && cols.every(isGrowish)) {
		zone.cols = ['grow']
		units = units.map((u) => ({ ...u, col: { start: 1, span: 1 } }))
	}
	zone.units = units
}

/** A free row at the end of a zone, for a unit that has nowhere else to land. */
function appendRow(zone: Zone, extent: Extent): number {
	zone.rows = [...(zone.rows ?? []), extent]
	return zone.rows.length
}

/** @experimental */
export interface PlaceArgs {
	widget: string
	/** Defaults to the widget id; pass one to place a second copy. */
	key?: string
	/** Defaults to the declaration's `placement.zone`, else `right`. */
	zone?: ZoneId
	/** A one-column list index for the variant, when `target` is a size. */
	at?: number
	target: OpTarget
}

/** @experimental */
export interface RemoveArgs {
	key: string
	target: OpTarget
}

/** @experimental */
export interface MoveArgs {
	key: string
	zone?: ZoneId
	row: number
	col: number
	target: OpTarget
}

/** @experimental */
export interface SetPinnedArgs {
	/** A unit's pin. Omit with `zone` to pin the side itself. */
	key?: string
	zone?: ZoneId
	pinned: boolean
	target: OpTarget
}

/** @experimental */
export interface TrackArgs {
	zone: ZoneId
	axis: 'row' | 'col'
	index: number
	target: OpTarget
}

/**
 * The pure operations the editor and the CLI both dispatch.
 *
 * Every one of them: takes the document first, returns `{ doc, refused? }`,
 * returns the input **by reference** when it changes nothing, and refuses
 * rather than storing a document `validateLayoutDoc` would reject.
 * @experimental
 */
export const layoutOps = {
	/**
	 * Add a widget. **Membership, so it lands on the base** — and in every
	 * variant that shadows the zone, or the size that customized it would never
	 * see the new widget (§5.5). With a size target and an explicit `at`, that
	 * size's list position is the variant's own.
	 */
	place(doc: LayoutDoc, args: PlaceArgs, decls?: LayoutDecls): LayoutOpResult {
		const decl = (decls?.widgets ?? []).find((w) => w.id === args.widget)
		const key = args.key ?? args.widget
		const id = args.zone ?? decl?.placement?.zone ?? 'right'
		const next = clone(doc)
		if (zoneHolding(next.zones, key))
			return refuse(doc, `The instance key \`${key}\` is already placed; keys are unique in the document.`)
		const height = decl?.placement?.height ?? 'grow'
		const pinned = decl?.placement?.pinned

		if (!layersFor(next, id)[0]!.get())
			(next.zones as Record<string, Zone | undefined>)[id] = { rows: [], cols: ['grow'], units: [] }
		for (const layer of layersFor(next, id)) {
			const zone = layer.get()
			if (!zone) continue
			if (!zone.cols?.length) zone.cols = ['grow']
			const row = appendRow(zone, height)
			const unit: WidgetUnit = {
				kind: 'widget',
				key,
				widget: args.widget,
				row: { start: row, span: 1 },
				col: { start: 1, span: zone.cols.length },
				...(pinned === false ? { pinned: false } : {}),
			}
			zone.units = [...(zone.units ?? []), unit]
		}
		if (args.target !== 'base' && typeof args.at === 'number') {
			const zone = positionalZone(next, id, args.target)
			if (zone) {
				const order = rowMajor(zone.units ?? []).map((u) => u.key)
				const without = order.filter((k) => k !== key)
				without.splice(Math.max(0, Math.min(args.at, without.length)), 0, key)
				foldOrderInto(zone, without)
			}
		}
		return commit(doc, next, decls)
	},

	/** Remove a unit. Membership: the base and every variant lose it. */
	remove(doc: LayoutDoc, args: RemoveArgs, decls?: LayoutDecls): LayoutOpResult {
		const next = clone(doc)
		let touched = false
		for (const id of ZONE_IDS)
			for (const layer of layersFor(next, id)) {
				const zone = layer.get()
				if (!zone) continue
				const before = (zone.units ?? []).length
				zone.units = (zone.units ?? []).filter((u) => u.key !== args.key)
				if (zone.units.length !== before) {
					touched = true
					tidyZone(zone)
				}
			}
		if (!touched) return { doc }
		return commit(doc, next, decls)
	},

	/** Move a unit to a grid line. **Position, so a size target writes its variant.** */
	moveToLine(doc: LayoutDoc, args: MoveArgs, decls?: LayoutDecls): LayoutOpResult {
		const next = clone(doc)
		const zones = args.target === 'base' ? next.zones : effectiveZones(next, args.target)
		const from = zoneHolding(zones, args.key)
		if (!from) return refuse(doc, `There is no unit \`${args.key}\` at this size.`)
		const to = args.zone ?? from
		const source = positionalZone(next, from, args.target)
		const dest = positionalZone(next, to, args.target)
		if (!source || !dest) return refuse(doc, `There is no \`${to}\` zone to move \`${args.key}\` into.`)
		const unit = findUnit(source, args.key)
		if (!unit) return refuse(doc, `There is no unit \`${args.key}\` at this size.`)
		const moved: Unit = {
			...unit,
			row: { start: args.row, span: unit.row.span },
			col: { start: args.col, span: unit.col.span },
		}
		if (source === dest)
			// In place, so a move to where it already is is byte-identical and
			// comes back by reference rather than as a reshuffled array.
			dest.units = dest.units.map((u) => (u.key === args.key ? moved : u))
		else {
			source.units = source.units.filter((u) => u.key !== args.key)
			dest.units = [...(dest.units ?? []), moved]
		}
		tidyZone(dest)
		if (source !== dest) tidyZone(source)
		return commit(doc, next, decls)
	},

	/**
	 * Put a unit into another's row, the two sharing its columns.
	 *
	 * The column axis is **materialised** first, so both sides come out reading
	 * as "n of twelve" rather than as two anonymous `1fr`s. A host that already
	 * spans two or more tracks simply gives half of them away; a host on ONE
	 * track has that track split in two, each half carrying half its share, and
	 * every unit that covered the line widens by a track so nothing else moves.
	 */
	joinRow(
		doc: LayoutDoc,
		args: { key: string; ontoKey: string; target: OpTarget },
		decls?: LayoutDecls,
	): LayoutOpResult {
		if (args.key === args.ontoKey) return refuse(doc, 'A widget cannot be put beside itself.')
		const next = clone(doc)
		const zones = args.target === 'base' ? next.zones : effectiveZones(next, args.target)
		const id = zoneHolding(zones, args.ontoKey)
		if (!id) return refuse(doc, `There is no unit \`${args.ontoKey}\` at this size.`)
		const zone = positionalZone(next, id, args.target)
		if (!zone) return refuse(doc, `There is no unit \`${args.ontoKey}\` at this size.`)
		const from = zoneHolding(zones, args.key)
		if (!from) return refuse(doc, `\`${args.key}\` and \`${args.ontoKey}\` are not in the same size.`)
		const sourceZone = positionalZone(next, from, args.target)!
		if (!findUnit(sourceZone, args.key)) return refuse(doc, `There is no unit \`${args.key}\` at this size.`)

		zone.cols = materialiseShares(zone.cols, true)
		const onto = findUnit(zone, args.ontoKey)!
		if (onto.col.span < 2) {
			const at = onto.col.start
			const track = zone.cols[at - 1]!
			if (!isGrowish(track))
				return refuse(
					doc,
					`\`${args.ontoKey}\` sits in a fixed column; widen it or add a column before putting \`${args.key}\` beside it.`,
				)
			const total = isShare(track) ? track.grow : TWELFTHS
			const first = Math.max(1, Math.ceil(total / 2))
			const second = Math.max(1, total - first)
			zone.cols = [...zone.cols.slice(0, at - 1), { grow: first }, { grow: second }, ...zone.cols.slice(at)]
			zone.units = zone.units.map((u) => {
				const c = u.col
				if (c.start > at) return { ...u, col: { start: c.start + 1, span: c.span } }
				if (c.start + c.span - 1 >= at) return { ...u, col: { start: c.start, span: c.span + 1 } }
				return u
			})
		}

		const host = findUnit(zone, args.ontoKey)!
		const span = host.col.span
		const half = Math.max(1, Math.floor(span / 2))
		const joiner = findUnit(sourceZone, args.key)!
		sourceZone.units = sourceZone.units.filter((u) => u.key !== args.key)
		zone.units = zone.units.map((u) =>
			u.key === args.ontoKey ? { ...u, col: { start: host.col.start, span: half } } : u,
		)
		zone.units = [
			...zone.units,
			{
				...joiner,
				row: { start: host.row.start, span: host.row.span },
				col: { start: host.col.start + half, span: span - half },
			},
		]
		tidyZone(zone)
		if (sourceZone !== zone) tidyZone(sourceZone)
		return commit(doc, next, decls)
	},

	/** Give a unit a row of its own, directly under the one it was in. */
	splitRow(doc: LayoutDoc, args: { key: string; target: OpTarget }, decls?: LayoutDecls): LayoutOpResult {
		const next = clone(doc)
		const zones = args.target === 'base' ? next.zones : effectiveZones(next, args.target)
		const id = zoneHolding(zones, args.key)
		if (!id) return refuse(doc, `There is no unit \`${args.key}\` at this size.`)
		const zone = positionalZone(next, id, args.target)!
		const unit = findUnit(zone, args.key)!
		const at = unit.row.start + unit.row.span
		zone.rows = [...zone.rows.slice(0, at - 1), zone.rows[unit.row.start - 1] ?? 'grow', ...zone.rows.slice(at - 1)]
		zone.units = zone.units.map((u) => {
			if (u.key === args.key) return { ...u, row: { start: at, span: 1 }, col: { start: 1, span: zone.cols.length } }
			if (u.row.start >= at) return { ...u, row: { start: u.row.start + 1, span: u.row.span } }
			if (u.row.start + u.row.span - 1 >= at) return { ...u, row: { start: u.row.start, span: u.row.span + 1 } }
			return u
		})
		tidyZone(zone)
		return commit(doc, next, decls)
	},

	/**
	 * Change how many tracks a unit spans on one axis.
	 *
	 * Materialises that axis first, for the same reason `joinRow` does: a span
	 * whose result a person is meant to read as "8 of 12" needs every grow
	 * track beside it to carry a share.
	 */
	setSpan(
		doc: LayoutDoc,
		args: { key: string; axis: 'row' | 'col'; span: number; target: OpTarget },
		decls?: LayoutDecls,
	): LayoutOpResult {
		if (!isInt(args.span) || args.span < 1) return refuse(doc, 'A span is a whole number of tracks, at least 1.')
		const next = clone(doc)
		const zones = args.target === 'base' ? next.zones : effectiveZones(next, args.target)
		const id = zoneHolding(zones, args.key)
		if (!id) return refuse(doc, `There is no unit \`${args.key}\` at this size.`)
		const zone = positionalZone(next, id, args.target)!
		if (args.axis === 'row') zone.rows = materialiseShares(zone.rows)
		else zone.cols = materialiseShares(zone.cols)
		zone.units = zone.units.map((u) =>
			u.key === args.key ? { ...u, [args.axis]: { ...u[args.axis], span: args.span } } : u,
		)
		return commit(doc, next, decls)
	},

	/** Retune one track. **Position, so a size target writes its variant.** */
	setTrackExtent(
		doc: LayoutDoc,
		args: TrackArgs & { extent: Extent },
		decls?: LayoutDecls,
	): LayoutOpResult {
		if (!isExtent(args.extent)) return refuse(doc, 'That is not a track extent.')
		const next = clone(doc)
		const zone = positionalZone(next, args.zone, args.target)
		if (!zone) return refuse(doc, `There is no \`${args.zone}\` zone at this size.`)
		const list = args.axis === 'row' ? zone.rows : zone.cols
		if (args.index < 1 || args.index > list.length)
			return refuse(doc, `The ${args.zone} zone has no ${args.axis === 'row' ? 'row' : 'column'} ${args.index}.`)
		const copy = [...list]
		copy[args.index - 1] = args.extent
		if (args.axis === 'row') zone.rows = copy
		else zone.cols = copy
		return commit(doc, next, decls)
	},

	/** Add a track, pushing everything after it along. */
	addTrack(
		doc: LayoutDoc,
		args: { zone: ZoneId; axis: 'row' | 'col'; at?: number; extent?: Extent; target: OpTarget },
		decls?: LayoutDecls,
	): LayoutOpResult {
		const next = clone(doc)
		const zone = positionalZone(next, args.zone, args.target)
		if (!zone) return refuse(doc, `There is no \`${args.zone}\` zone at this size.`)
		const list = args.axis === 'row' ? zone.rows : zone.cols
		const at = Math.max(1, Math.min(args.at ?? list.length + 1, list.length + 1))
		const copy = [...list]
		copy.splice(at - 1, 0, args.extent ?? 'grow')
		if (args.axis === 'row') zone.rows = copy
		else zone.cols = copy
		zone.units = zone.units.map((u) => {
			const cur = u[args.axis]
			if (cur.start >= at) return { ...u, [args.axis]: { start: cur.start + 1, span: cur.span } }
			if (cur.start + cur.span - 1 >= at) return { ...u, [args.axis]: { start: cur.start, span: cur.span + 1 } }
			return u
		})
		return commit(doc, next, decls)
	},

	/** Remove a track; a unit that lived only there refuses the whole edit. */
	removeTrack(doc: LayoutDoc, args: TrackArgs, decls?: LayoutDecls): LayoutOpResult {
		const next = clone(doc)
		const zone = positionalZone(next, args.zone, args.target)
		if (!zone) return refuse(doc, `There is no \`${args.zone}\` zone at this size.`)
		const list = args.axis === 'row' ? zone.rows : zone.cols
		const word = args.axis === 'row' ? 'row' : 'column'
		if (args.index < 1 || args.index > list.length)
			return refuse(doc, `The ${args.zone} zone has no ${word} ${args.index}.`)
		if (list.length <= 1) return refuse(doc, `The ${args.zone} zone needs at least one ${word}.`)
		const orphan = zone.units.find((u) => {
			const cur = u[args.axis]
			return cur.span === 1 && cur.start === args.index
		})
		if (orphan)
			return refuse(doc, `\`${orphan.key}\` is the only thing in ${word} ${args.index}; move it before removing the ${word}.`)
		const copy = [...list]
		copy.splice(args.index - 1, 1)
		if (args.axis === 'row') zone.rows = copy
		else zone.cols = copy
		zone.units = zone.units.map((u) => {
			const cur = u[args.axis]
			if (cur.start > args.index) return { ...u, [args.axis]: { start: cur.start - 1, span: cur.span } }
			if (cur.start + cur.span - 1 >= args.index)
				return { ...u, [args.axis]: { start: cur.start, span: Math.max(1, cur.span - 1) } }
			return u
		})
		return commit(doc, next, decls)
	},

	/**
	 * Pin or unpin a unit, or a side zone itself. **Membership**: the base and
	 * every variant, so a pin made on a phone is the same pin on the desk.
	 */
	setPinned(doc: LayoutDoc, args: SetPinnedArgs, decls?: LayoutDecls): LayoutOpResult {
		const next = clone(doc)
		const write = (zone: Zone) => {
			if (args.key) {
				zone.units = (zone.units ?? []).map((u) => {
					if (u.key !== args.key) return u
					if (args.pinned) {
						// Absent IS pinned — never store `true`, so a pinned
						// document stays byte-identical to one saved before the
						// field existed.
						const { pinned: _was, ...rest } = u
						return rest as Unit
					}
					return { ...u, pinned: false }
				})
			} else {
				const side = zone as SideZone
				if (args.pinned) delete side.pinned
				else side.pinned = false
			}
		}
		const target = args.zone ?? (args.key ? zoneHolding(next.zones, args.key) : undefined)
		if (!target) return refuse(doc, args.key ? `There is no unit \`${args.key}\`.` : 'Name a zone to pin.')
		if (!args.key && target === 'middle') return refuse(doc, 'The middle zone is the session, not a rail.')
		for (const layer of layersFor(next, target)) {
			const zone = layer.get()
			if (zone) write(zone)
		}
		return commit(doc, next, decls)
	},

	/** Merge widget units into one tab group. Membership: base and variants. */
	group(doc: LayoutDoc, args: { keys: string[]; key?: string; target: OpTarget }, decls?: LayoutDecls): LayoutOpResult {
		if (!Array.isArray(args.keys) || args.keys.length < 2)
			return refuse(doc, 'A group needs at least two widgets.')
		const next = clone(doc)
		const id = zoneHolding(next.zones, args.keys[0]!)
		if (!id) return refuse(doc, `There is no unit \`${args.keys[0]}\`.`)
		const groupKey = args.key ?? `g:${args.keys.join('+')}`
		for (const layer of layersFor(next, id)) {
			const zone = layer.get()
			if (!zone) continue
			const members = args.keys
				.map((k) => findUnit(zone, k))
				.filter((u): u is WidgetUnit => !!u && u.kind === 'widget')
			if (members.length < 2) continue
			const anchor = rowMajor(members)[0]!
			zone.units = [
				...zone.units.filter((u) => !args.keys.includes(u.key)),
				{
					kind: 'group',
					key: groupKey,
					members: members.map((m) => ({ widget: m.widget, key: m.key })),
					row: anchor.row,
					col: anchor.col,
					...(members.every((m) => m.pinned === false) ? { pinned: false as const } : {}),
				} satisfies GroupUnit,
			]
			tidyZone(zone)
		}
		return commit(doc, next, decls)
	},

	/** Break a tab group back into its widgets, stacked in its rows. */
	ungroup(doc: LayoutDoc, args: { key: string; target: OpTarget }, decls?: LayoutDecls): LayoutOpResult {
		const next = clone(doc)
		const id = zoneHolding(next.zones, args.key)
		if (!id) return refuse(doc, `There is no group \`${args.key}\`.`)
		for (const layer of layersFor(next, id)) {
			const zone = layer.get()
			if (!zone) continue
			const unit = findUnit(zone, args.key)
			if (!unit || unit.kind !== 'group') continue
			const group = unit as GroupUnit
			// Each member needs a row of its own, so the group's row becomes
			// the first and the rest are inserted under it.
			const extra = group.members.length - 1
			const at = group.row.start + group.row.span
			const extent = zone.rows[group.row.start - 1] ?? 'grow'
			zone.rows = [...zone.rows.slice(0, at - 1), ...Array.from({ length: extra }, () => extent), ...zone.rows.slice(at - 1)]
			zone.units = zone.units
				.filter((u) => u.key !== args.key)
				.map((u) =>
					u.row.start >= at ? { ...u, row: { start: u.row.start + extra, span: u.row.span } } : u,
				)
			zone.units = [
				...zone.units,
				...group.members.map<WidgetUnit>((m, i) => ({
					kind: 'widget',
					key: m.key,
					widget: m.widget,
					row: { start: i === 0 ? group.row.start : at + i - 1, span: 1 },
					col: { start: group.col.start, span: group.col.span },
					...(group.pinned === false ? { pinned: false as const } : {}),
				})),
			]
			tidyZone(zone)
		}
		return commit(doc, next, decls)
	},

	/** Reorder a group's tabs. Membership order, so it lands everywhere. */
	reorderMembers(
		doc: LayoutDoc,
		args: { key: string; order: string[]; target: OpTarget },
		decls?: LayoutDecls,
	): LayoutOpResult {
		const next = clone(doc)
		const id = zoneHolding(next.zones, args.key)
		if (!id) return refuse(doc, `There is no group \`${args.key}\`.`)
		for (const layer of layersFor(next, id)) {
			const zone = layer.get()
			if (!zone) continue
			zone.units = zone.units.map((u) => {
				if (u.key !== args.key || u.kind !== 'group') return u
				const group = u as GroupUnit
				const byKey = new Map(group.members.map((m) => [m.key, m]))
				const ordered = args.order.map((k) => byKey.get(k)).filter((m): m is GroupUnit['members'][number] => !!m)
				const rest = group.members.filter((m) => !args.order.includes(m.key))
				return { ...group, members: [...ordered, ...rest] }
			})
		}
		return commit(doc, next, decls)
	},

	/**
	 * Set one look. **An option, so it lands on the base** — and on every
	 * variant zone that shadows the one being styled.
	 */
	setLook(
		doc: LayoutDoc,
		args: { scope: 'root' | 'zone' | 'unit'; zone?: ZoneId; key?: string; look: string; value: unknown; target: OpTarget },
		decls?: LayoutDecls,
	): LayoutOpResult {
		const next = clone(doc)
		const put = (bagHolder: { look?: LookBag }) => {
			const bag = { ...(bagHolder.look ?? {}) }
			if (args.value === undefined) delete bag[args.look]
			else bag[args.look] = args.value
			if (Object.keys(bag).length) bagHolder.look = bag
			else delete bagHolder.look
		}
		if (args.scope === 'root') put(next)
		else {
			const id = args.zone ?? (args.key ? zoneHolding(next.zones, args.key) : undefined)
			if (!id) return refuse(doc, 'Name a zone or a unit to style.')
			let touched = false
			for (const layer of layersFor(next, id)) {
				const zone = layer.get()
				if (!zone) continue
				if (args.scope === 'zone') {
					put(zone)
					touched = true
				} else {
					zone.units = zone.units.map((u) => {
						if (u.key !== args.key) return u
						touched = true
						const copy = { ...u } as Unit
						put(copy)
						return copy
					})
				}
			}
			if (!touched) return refuse(doc, `There is nothing called \`${args.key ?? id}\` to style.`)
		}
		return commit(doc, next, decls)
	},

	/**
	 * Drop what a move left behind: empty rows, a narrowed unit now alone in
	 * its row, a column split nobody is using. Every op that moves or removes a
	 * unit runs it already; this is the door for an editor that has just
	 * rearranged a zone some other way.
	 */
	tidy(doc: LayoutDoc, args: { zone: ZoneId; target: OpTarget }, decls?: LayoutDecls): LayoutOpResult {
		const next = clone(doc)
		const zone = positionalZone(next, args.zone, args.target)
		if (!zone) return refuse(doc, `There is no \`${args.zone}\` zone at this size.`)
		tidyZone(zone)
		return commit(doc, next, decls)
	},

	/**
	 * Make a size its own: copy the zones it currently inherits into its
	 * variant. Idempotent — a size already customized comes back by reference.
	 */
	customizeVariant(doc: LayoutDoc, args: { breakpoint: Breakpoint }, decls?: LayoutDecls): LayoutOpResult {
		if (!(args.breakpoint in BREAKPOINTS)) return refuse(doc, `\`${args.breakpoint}\` is not a size.`)
		if (doc.variants?.[args.breakpoint]) return { doc }
		const next = clone(doc)
		next.variants = { ...(next.variants ?? {}), [args.breakpoint]: clone(effectiveZones(doc, args.breakpoint)) }
		return commit(doc, next, decls)
	},

	/** Return a size to inherited. Absent already: the input, by reference. */
	resetVariant(doc: LayoutDoc, args: { breakpoint: Breakpoint }, decls?: LayoutDecls): LayoutOpResult {
		if (!doc.variants?.[args.breakpoint]) return { doc }
		const next = clone(doc)
		delete next.variants![args.breakpoint]
		if (!Object.keys(next.variants!).length) delete next.variants
		return commit(doc, next, decls)
	},

	/**
	 * A one-column order, for **one size only**.
	 *
	 * The owner rule this exists for: a phone edit never degrades the desktop.
	 * A folded order carries no information about columns, so writing it to the
	 * base would shuffle a two-dimensional layout — it goes to the variant, and
	 * `doc.zones` comes back byte-identical every time. `promoteOrder` is the
	 * one door from here to the base, and it only opens when there are no
	 * columns to damage.
	 */
	reorderFolded(
		doc: LayoutDoc,
		args: { zone: ZoneId; order: string[]; target: Breakpoint },
		decls?: LayoutDecls,
	): LayoutOpResult {
		if ((args.target as string) === 'base')
			return refuse(doc, 'A folded order is one size’s own; use promoteOrder to apply it to every size.')
		if (!(args.target in BREAKPOINTS)) return refuse(doc, `\`${args.target}\` is not a size.`)
		const next = clone(doc)
		const zone = positionalZone(next, args.zone, args.target)
		if (!zone) return refuse(doc, `There is no \`${args.zone}\` zone at this size.`)
		const known = new Set((zone.units ?? []).map((u) => u.key))
		const order = args.order.filter((k) => known.has(k))
		if (order.length !== known.size) return refuse(doc, 'A folded order must name every unit in the zone exactly once.')
		foldOrderInto(zone, order)
		return commit(doc, next, decls)
	},

	/**
	 * Apply one size's folded order to the base, so every size sees it.
	 *
	 * Succeeds **iff** every zone the order touches is already one column wide
	 * at the base: that is the only promotion which cannot damage a desktop
	 * layout, because it changes no columns. Otherwise it refuses with a
	 * sentence naming the size and the units that sit side by side there.
	 */
	promoteOrder(doc: LayoutDoc, args: { breakpoint: Breakpoint }, decls?: LayoutDecls): LayoutOpResult {
		const patch = doc.variants?.[args.breakpoint]
		if (!patch) return refuse(doc, `${SIZE_LABEL[args.breakpoint] ?? args.breakpoint} has no order of its own to apply.`)
		const affected = ZONE_IDS.filter((id) => (patch as Record<string, Zone | undefined>)[id])
		// The base is what every uncustomized size sees; name the largest of
		// them, because that is the layout a promotion would damage.
		const servedByBase =
			[...BREAKPOINT_ORDER].reverse().find((bp) => !doc.variants?.[bp]) ?? BREAKPOINT_ORDER[BREAKPOINT_ORDER.length - 1]!
		for (const id of affected) {
			const base = (doc.zones as Record<string, Zone | undefined>)[id]
			if (!base) continue
			if ((base.cols?.length ?? 1) === 1) continue
			const row = rowMajor(base.units ?? []).reduce<Map<number, string[]>>((m, u) => {
				m.set(u.row.start, [...(m.get(u.row.start) ?? []), u.key])
				return m
			}, new Map())
			const side = [...row.values()].find((keys) => keys.length > 1) ?? []
			const names = side.length ? side.join(' beside ') : `${base.cols!.length} columns`
			return refuse(
				doc,
				`${SIZE_LABEL[servedByBase]} has ${names}; apply the order there from a desktop.`,
			)
		}
		const next = clone(doc)
		for (const id of affected) {
			const variantZone = (patch as Record<string, Zone | undefined>)[id]!
			const base = (next.zones as Record<string, Zone | undefined>)[id]
			if (!base) continue
			const order = rowMajor(variantZone.units ?? []).map((u) => u.key)
			foldOrderInto(base, order.filter((k) => (base.units ?? []).some((u) => u.key === k)))
			delete (next.variants![args.breakpoint] as Record<string, Zone | undefined>)[id]
		}
		if (next.variants && !Object.keys(next.variants[args.breakpoint] ?? {}).length)
			delete next.variants[args.breakpoint]
		if (next.variants && !Object.keys(next.variants).length) delete next.variants
		return commit(doc, next, decls)
	},
}

/** Rewrite a zone as one column, its units stacked in the given key order. */
function foldOrderInto(zone: Zone, order: string[]): void {
	const byKey = new Map((zone.units ?? []).map((u) => [u.key, u]))
	const stacked = order.map((k) => byKey.get(k)).filter((u): u is Unit => !!u)
	const rest = (zone.units ?? []).filter((u) => !order.includes(u.key))
	const all = [...stacked, ...rest]
	zone.rows = all.map((u) =>
		combineExtents((zone.rows ?? []).slice(u.row.start - 1, u.row.start - 1 + u.row.span)),
	)
	if (!zone.rows.length) zone.rows = ['grow']
	zone.cols = ['grow']
	zone.units = all.map((u, i) => ({ ...u, row: { start: i + 1, span: 1 }, col: { start: 1, span: 1 } }))
}

// ── fromLegacy ──────────────────────────────────────────────────────────────

/**
 * Widget ids that name nothing any build places. A saved blob, a preset or an
 * arrangement may still carry one — all three were stored verbatim and nothing
 * rewrote them — so every reader drops it.
 *
 * `composer` is one because the conversation is ONE widget: the log and the
 * field are one thing to arrange, and the field's shape is a setting on
 * `messages` rather than a widget beside it.
 *
 * `inventory` is one because R79 (2026-09-25) removed core's Inventory widget
 * for now, with no replacement. Adventure and Lair shipped it, so layouts and
 * presets saved from them name it; dropping it here is what makes such a layout
 * open on the widgets it still has — nothing drawn in its place, no labelled
 * placeholder. What somebody carries is the `inventory` stat (phase 3b), which
 * the stats widget draws as a list. Take it off
 * this list if the widget comes back.
 * @internal
 */
export const RETIRED_WIDGET_IDS: ReadonlySet<string> = new Set(['composer', 'inventory'])

/**
 * Read a pre-v2 layout blob as a `LayoutPreset`, or `null` if it is not one.
 *
 * ## The mapping, exactly
 *
 * | legacy | v2 |
 * |---|---|
 * | `arrangedGrid[zone].items` sorted by `y` then `x` | the zone's units, in reading order |
 * | the distinct `y` boundaries | row tracks — `grow` for an item the widget grid called `grow`, `fit` for a one-cell band, `{ cells: h }` otherwise |
 * | `x`/`w` over the zone's `cols` | column tracks in **twelfths**, collapsed to one `grow` column when every item spanned the full width |
 * | `group` | a `GroupUnit` at the members' bounding box |
 * | `pinned: false` on an item or `zoneLayout.zones[side].pinned` | the unit's / the side's `pinned` |
 * | `anchor` | **dropped** — top/bottom survive only as reading order |
 * | a retired widget id | **dropped** |
 * | `widgetGrid.widgets` with no arrangement | one row per widget, in `order`, extent from `size.h` |
 * | `widgetSettings` inside the blob | lifted to `LayoutPreset.widgetSettings` |
 *
 * Deterministic and lossy, in that order: holes and anchors do not survive, and
 * the changelog says so. A v2 document — or a `LayoutPreset` around one —
 * passes straight through.
 * @internal
 */
export function fromLegacy(blob: unknown): LayoutPreset | null {
	if (!isObj(blob)) return null

	// Already v2: a bare document, or a preset around one.
	if (blob.version === 2 && isObj(blob.zones)) return { layout: blob as unknown as LayoutDoc }
	if (isObj(blob.layout) && (blob.layout as Record<string, unknown>).version === 2)
		return blob as unknown as LayoutPreset

	const hasLegacy = ['zoneLayout', 'widgetGrid', 'arrangedGrid', 'widgetSettings'].some((k) =>
		Object.prototype.hasOwnProperty.call(blob, k),
	)
	if (!hasLegacy) return null

	const arranged = isObj(blob.arrangedGrid) ? (blob.arrangedGrid as Record<string, unknown>) : {}
	const grid = isObj(blob.widgetGrid) ? (blob.widgetGrid as Record<string, unknown>) : {}
	const gridWidgets = (Array.isArray(grid.widgets) ? grid.widgets : []).filter(isObj)
	const zoneLayout = isObj(blob.zoneLayout) ? (blob.zoneLayout as Record<string, unknown>) : {}
	const legacyZones = isObj(zoneLayout.zones) ? (zoneLayout.zones as Record<string, unknown>) : {}

	const live = (id: unknown): id is string => typeof id === 'string' && !!id && !RETIRED_WIDGET_IDS.has(id)
	const heightOf = (id: string): Extent => {
		const w = gridWidgets.find((g) => g.id === id)
		const h = isObj(w?.size) ? (w!.size as Record<string, unknown>).h : undefined
		if (h === 'grow') return 'grow'
		if (h === 'fixed') return 'fit'
		if (isObj(h) && typeof h.cells === 'number') return { cells: h.cells }
		return 'grow'
	}
	const growsById = new Set(
		gridWidgets
			.filter((g) => isObj(g.size) && (g.size as Record<string, unknown>).h === 'grow')
			.map((g) => g.id)
			.filter(live),
	)

	const taken = new Set<string>()
	const zones: Record<string, Zone | undefined> = {}

	/** A zone built from a saved arrangement: bands to rows, twelfths to columns. */
	const fromArrangement = (raw: unknown): Zone | null => {
		if (!isObj(raw) || !Array.isArray(raw.items)) return null
		const cols = typeof raw.cols === 'number' && raw.cols > 0 ? raw.cols : 1
		type Item = { id: string; x: number; y: number; w: number; h: number; group?: string; pinned?: boolean }
		const items = (raw.items as unknown[])
			.filter(isObj)
			.filter(
				(i): i is Record<string, unknown> =>
					live(i.id) && ['x', 'y', 'w', 'h'].every((k) => typeof i[k] === 'number'),
			)
			.map<Item>((i) => ({
				id: i.id as string,
				x: i.x as number,
				y: i.y as number,
				w: i.w as number,
				h: i.h as number,
				...(typeof i.group === 'string' ? { group: i.group } : {}),
				...(i.pinned === false ? { pinned: false } : {}),
			}))
			.filter((i) => !taken.has(i.id))
			.sort((a, b) => a.y - b.y || a.x - b.x || a.id.localeCompare(b.id))
		if (!items.length) return null

		// Units first: a tab group is one unit at its members' bounding box.
		type Placed = { unit: Unit; x0: number; x1: number; y0: number; y1: number }
		const groups = new Map<string, Item[]>()
		const placed: Placed[] = []
		for (const it of items) {
			taken.add(it.id)
			if (it.group) {
				groups.set(it.group, [...(groups.get(it.group) ?? []), it])
				continue
			}
			placed.push({
				unit: {
					kind: 'widget',
					key: it.id,
					widget: it.id,
					row: { start: 1, span: 1 },
					col: { start: 1, span: 1 },
					...(it.pinned === false ? { pinned: false as const } : {}),
				},
				x0: it.x,
				x1: it.x + it.w,
				y0: it.y,
				y1: it.y + it.h,
			})
		}
		for (const [key, members] of groups) {
			const x0 = Math.min(...members.map((m) => m.x))
			const x1 = Math.max(...members.map((m) => m.x + m.w))
			const y0 = Math.min(...members.map((m) => m.y))
			const y1 = Math.max(...members.map((m) => m.y + m.h))
			placed.push({
				unit: {
					kind: 'group',
					key,
					members: members.map((m) => ({ widget: m.id, key: m.id })),
					row: { start: 1, span: 1 },
					col: { start: 1, span: 1 },
					// A group reads as pinned unless EVERY member says otherwise
					// — the same answer the per-item default gives.
					...(members.every((m) => m.pinned === false) ? { pinned: false as const } : {}),
				},
				x0,
				x1,
				y0,
				y1,
			})
		}
		placed.sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0 || String(a.unit.key).localeCompare(String(b.unit.key)))

		// y-bands → row tracks.
		const bounds = [...new Set(placed.flatMap((p) => [p.y0, p.y1]))].sort((a, b) => a - b)
		const bands: Array<[number, number]> = []
		for (let i = 0; i < bounds.length - 1; i++) bands.push([bounds[i]!, bounds[i + 1]!])
		if (!bands.length) bands.push([0, 1])
		const rows: Extent[] = bands.map(([from, to]) => {
			const covering = placed.filter((p) => p.y0 < to && p.y1 > from)
			if (covering.some((p) => widgetIdsOf(p.unit).some((w) => growsById.has(w)))) return 'grow'
			const span = to - from
			return span <= 1 ? 'fit' : { cells: span }
		})

		// x-extents → column tracks in twelfths, unless everything is full-width.
		const fullWidth = placed.every((p) => p.x0 <= 0 && p.x1 >= cols)
		const colCount = fullWidth ? 1 : 12
		const toTwelfth = (x: number) => Math.max(0, Math.min(12, Math.round((x * 12) / cols)))

		const units = placed.map<Unit>((p) => {
			const rowStart = bands.findIndex(([from]) => from >= p.y0)
			const rowEnd = bands.findIndex(([, to]) => to >= p.y1)
			const start = (rowStart < 0 ? 0 : rowStart) + 1
			const span = Math.max(1, (rowEnd < 0 ? bands.length - 1 : rowEnd) + 1 - start + 1)
			const c0 = fullWidth ? 1 : toTwelfth(p.x0) + 1
			const c1 = fullWidth ? 2 : Math.max(c0 + 1, toTwelfth(p.x1) + 1)
			return { ...p.unit, row: { start, span }, col: { start: c0, span: c1 - c0 } }
		})
		return { rows, cols: Array.from({ length: colCount }, () => 'grow' as Extent), units }
	}

	/** A zone built from a bare id list: one widget per row, top to bottom. */
	const fromOrder = (ids: string[]): Zone | null => {
		const keep = ids.filter(live).filter((id) => !taken.has(id))
		if (!keep.length) return null
		for (const id of keep) taken.add(id)
		return {
			rows: keep.map(heightOf),
			cols: ['grow'],
			units: keep.map<WidgetUnit>((id, i) => ({
				kind: 'widget',
				key: id,
				widget: id,
				row: { start: i + 1, span: 1 },
				col: { start: 1, span: 1 },
			})),
		}
	}

	// The middle first, so a widget named in two places belongs to the one that
	// matters most; then the sides in reading order.
	for (const id of ['middle', 'left', 'right'] as const) {
		const built =
			fromArrangement(arranged[id]) ??
			fromOrder(
				id === 'middle'
					? gridWidgets
							.filter((w) => (w.zone ?? 'middle') === 'middle')
							.sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0))
							.map((w) => w.id)
							.filter(live)
					: (() => {
							const z = legacyZones[id]
							const list = isObj(z) && Array.isArray(z.widgets) ? z.widgets : []
							return list.filter(live)
						})(),
			)
		if (built) zones[id] = built
		else if (id !== 'middle' && isObj(legacyZones[id]))
			// A declared side with nothing in it is still declared: the Adventure
			// lore rail lands collapsed on the day core ships a lore widget.
			zones[id] = { rows: ['grow'], cols: ['grow'], units: [] }
	}
	if (!zones.middle) zones.middle = { rows: ['grow'], cols: ['grow'], units: [] }

	for (const id of ['left', 'right'] as const) {
		const z = legacyZones[id]
		if (zones[id] && isObj(z) && z.pinned === false) (zones[id] as SideZone).pinned = false
	}

	const layout: LayoutDoc = {
		version: 2,
		zones: {
			...(zones.left ? { left: zones.left as SideZone } : {}),
			middle: zones.middle,
			...(zones.right ? { right: zones.right as SideZone } : {}),
		},
	}
	const settings = isObj(blob.widgetSettings) ? (blob.widgetSettings as Record<string, unknown>) : null
	const widgetSettings: Record<string, Record<string, unknown>> = {}
	if (settings)
		for (const [key, value] of Object.entries(settings))
			if (live(key) && isObj(value)) widgetSettings[key] = value

	return { layout, ...(Object.keys(widgetSettings).length ? { widgetSettings } : {}) }
}
