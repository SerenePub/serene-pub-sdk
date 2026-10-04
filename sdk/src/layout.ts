/**
 * The **widget declaration** a package ships (`WidgetDecl`) and its parts:
 * what a widget renders, the data it asks for, the styles and settings it
 * offers. Where an instance of it sits is the **session layout**'s business
 * (`sessionLayout.ts`, `SessionLayoutV1`); a declaration never says.
 *
 * It lives beside `settings.ts` and `descriptors.ts` because it is a public
 * contract on the same terms as those, and it imports only their types so
 * `descriptors.ts` can name `WidgetDecl` without a cycle.
 *
 * The file kept its name when the retired layout document (LayoutDoc v2) and
 * its machinery left it (plan `PLAN-layout-one-format-2026-09-28`, brief 1):
 * the widget half is what stayed.
 */

import type { I18n } from './i18n.js'
import type { SettingsSchema } from './settings.js'
import type { WidgetBaseSection, WidgetSectionScope } from './widgets.js'

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
 * widget's box; `vars` overrides design
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
 * What a widget renders, resolved — the host's switch. `remote` is a
 * component running in its owner's UI worker, mirrored through the
 * vocabulary (§3.5) — core's own components as much as a plugin's (R79).
 * A real document goes INSIDE the component, as an `sp-frame`; a widget is
 * never a bare frame (the `surface` shortcut retired 2026-10-02).
 * @experimental
 */
export type WidgetSurface = { kind: 'remote'; owner: string; component: string }

/**
 * Resolve a widget declaration to what the host mounts. `owner` is `'core'`
 * or the declaring plugin's id: a `component` is that owner's remote. `null`
 * when the declaration names no component — validation reports that; the
 * host treats it as a missing widget, never a crash.
 * @internal
 */
export function resolveWidgetSurface(decl: Pick<WidgetDecl, 'component'>, owner: string): WidgetSurface | null {
	if (typeof decl.component === 'string' && decl.component) return { kind: 'remote', owner, component: decl.component }
	return null
}

/**
 * One **widget** a session offers: the conversation, a portrait column, a
 * plugin's board. Every widget names a component (R25); a plugin that needs a
 * real document places an `sp-frame` inside that component.
 *
 * Declaring a widget makes it *addable*. Where an instance of it sits is the
 * **session layout**'s business (`SessionLayoutV1`): any widget may sit in any
 * zone, as many times as the layout places it (`maxInstances` aside).
 * @experimental
 */
export interface WidgetDecl {
	/** Stable id — a layout's widget instance ids and `surface:open` intents key on this. */
	id: string
	/** Human title shown in the widget's chrome and the tray — a string or a locale map (R-20). */
	title: I18n
	/** Optional icon name (the app maps it to its icon set). */
	icon?: string
	/**
	 * `primary` is the genre's **floor widget**: a layout always places one,
	 * anywhere — any zone, a tab group — and a reader that finds none appends
	 * it to the middle. Core's conversation is the primary; a genre that
	 * withholds it (`omitWidgets`) ships the widget that stands in its place.
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
	 * package (R25). Core's widgets name core components. A document the
	 * widget needs goes inside that component, as an `sp-frame`.
	 */
	component: string
	/** Which channels feed it (20 §4/§7). A widget is a view onto its channels. */
	channels?: string[]
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
	 * The most instances of this widget one layout may place — a positive
	 * integer; absent means as many as a person adds. For a widget that holds
	 * state only one copy can own (global keybindings, an audio bus). At the
	 * cap the editor offers no more; a layout over it draws the first ones in
	 * reading order (middle, left, right) and `validateSessionLayout` warns.
	 */
	maxInstances?: number
	/**
	 * ⏳ The surface manager's packing hints — what the app's panel packer
	 * reads: the column span a widget asks for, its minimum box, whether it may
	 * collapse or close, and whether it prefers the drawer. The layout
	 * document's replacements for them (`placement`, `cells`, `fold`) retired
	 * with it (owner L1, 2026-09-28), so these stand until the session layout
	 * states sizes of its own.
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
