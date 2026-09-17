/**
 * Core's built-in session widgets (PLAN 25) — part of the announcement (24 §9),
 * the same as the genres, pipelines and hooks core ships. SP boot-seeds each
 * widget's style presets from `CORE_WIDGETS` (create-if-absent by seedKey, the
 * standing rule), and the app's native-surface registry maps a widget's
 * `surface.component` key to a real Svelte component separately.
 *
 * A "widget" is a session-surface component — the conversation, a portrait
 * panel, a plugin frame. Native and frame widgets share ONE declaration
 * (this) and ONE data contract; the only difference is the iframe. `WidgetDecl`
 * is the superset of the SDK's `PanelDecl`: `id`/`title` already satisfy the
 * stable-slug + display-title a widget must announce, so this adds only the
 * authoring metadata — cell bounds, requested data scopes, plugin dependencies,
 * and the built-in style presets it ships.
 */
import type { PanelDecl, SettingsSchema } from '@serene-pub/sdk'

/** Data a widget requests access to (grant-gated, host-enforced at projection). */
export type WidgetScope = 'persona' | 'characters' | 'lore' | 'session:full' | `channel:${string}`

/** An external plugin dependency; the CLI captures pkg/range from the imports. */
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
 * widget container (native) or frame document (frame); `vars` overrides design
 * tokens (CSS custom properties).
 */
export interface WidgetStylePreset {
	/** Stable per-widget key — the seed identity within this widget's styles. */
	slug: string
	title: string
	css: string
	vars?: Record<string, string>
}

/**
 * A widget declaration. Core widgets declare it here; plugin widgets declare the
 * identical shape and the CLI captures `dependencies` from the import graph.
 * Runtime never branches on which — it reads the decl.
 */
export interface WidgetDecl extends PanelDecl {
	/**
	 * Optional cell-based size bounds (the widgetGrid cell module), in cells.
	 * These sit alongside `layout.span` (track-based) — cells are the physical
	 * floor/ceiling, span is the responsive preference.
	 */
	cells?: { minW?: number; maxW?: number; minH?: number; maxH?: number }
	/** Data the widget requests; each entry is a grant an admin can deny. */
	scopes?: WidgetScope[]
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
}

/**
 * The globally-unique, reseed-stable slug for a widget's built-in style. This is
 * both the system row's `slug` (the layout's reference target) and its seed
 * identity — the reconciler upserts and prunes system rows by matching on it,
 * NEVER on a numeric id (the codified seed rule).
 *
 * Widget ids and preset slugs are simple kebab tokens (no `:`), so the join is
 * unambiguous.
 */
export function systemStyleSlug(widgetId: string, presetSlug: string): string {
	return `${widgetId}:${presetSlug}`
}

/**
 * A widget ships at least one "default" style so a fresh layout always resolves
 * to something. Empty `css` means the base look (the widget's own styling with
 * no skin on top); it exists as a row so the layout's id+slug reference has a
 * concrete, reseed-stable target to point at.
 */
const DEFAULT_PRESET: WidgetStylePreset = {
	slug: 'default',
	title: 'Default',
	css: '',
}

/**
 * The built-in session widgets. Pure data — no component imports — so the
 * server-side style reconciler reads it at boot without pulling the client
 * bundle; the client maps each `surface.component` key to a Svelte component.
 */
export const CORE_WIDGETS: WidgetDecl[] = [
	/**
	 * The conversation: the log and the field you write into, as ONE widget.
	 *
	 * They are one because they are one thing to arrange — a transcript with
	 * nowhere to reply is not a session surface, and every layout that ever
	 * placed them placed them touching. Keeping them apart bought a second
	 * anchor guarantee, a second style target and a second row in every grid,
	 * and paid for none of it: the pair moved together or not at all.
	 *
	 * So the composer is a SETTING here rather than a widget beside this one.
	 * `composer` picks how the field is drawn, `composerPosition` which end it
	 * sits at, and `showComposer` whether it is drawn at all — which is what a
	 * read-only view of a session is, rather than a widget somebody removed.
	 */
	{
		id: 'messages',
		title: 'Messages',
		role: 'primary',
		surface: { kind: 'native', component: 'messages' },
		presets: [DEFAULT_PRESET],
		settings: {
			composer: {
				type: 'enum',
				label: 'Composer',
				description:
					'How the message field is drawn: the classic card, a ' +
					'single-line pill, or a tall editor for long turns.',
				of: ['classic', 'minimal', 'writer'],
				default: 'classic',
			},
			composerPosition: {
				type: 'enum',
				label: 'Composer position',
				description: 'Which end of the log you write at.',
				of: ['bottom', 'top'],
				default: 'bottom',
			},
			order: {
				type: 'enum',
				label: 'Message order',
				description: 'Newest messages at the bottom, or at the top.',
				of: ['oldest-first', 'newest-first'],
				default: 'oldest-first',
			},
			showMessages: {
				type: 'boolean',
				label: 'Show messages',
				default: true,
			},
			showComposer: {
				type: 'boolean',
				label: 'Show composer',
				default: true,
			},
			/**
			 * The furniture around a turn, all of it on by default and all of
			 * it behind the advanced fold: a person who wants a barer log says
			 * so one piece at a time, and a person who never opens the fold
			 * sees the whole of it, which is what a session looks like.
			 */
			showAvatars: {
				type: 'boolean',
				label: 'Show avatars',
				default: true,
				group: 'behaviour',
			},
			showTimestamps: {
				type: 'boolean',
				label: 'Show times',
				default: true,
				group: 'behaviour',
			},
			showSceneMarkers: {
				type: 'boolean',
				label: 'Show scenes and dates',
				default: true,
				group: 'behaviour',
			},
			showNudge: {
				type: 'boolean',
				label: 'Show who is due next',
				default: true,
				group: 'behaviour',
			},
			showActions: {
				type: 'boolean',
				label: 'Show the Actions label',
				default: true,
				group: 'behaviour',
			},
		},
	},
	{
		id: 'scene-portraits',
		title: 'Scene Portraits',
		surface: { kind: 'native', component: 'scene-portraits' },
		scopes: ['characters'],
		presets: [DEFAULT_PRESET],
		settings: {
			/**
			 * Where the faces come from. `pinned` is the two portraits a person
			 * pins from the chat, which is the only thing a Chat session has to
			 * show; `scene` is the cast itself, which is what a genre that docks
			 * this widget beside the conversation means by "who is here".
			 *
			 * `pinned` is the default because it is what every existing session
			 * shows, and a preset that wants the cast says so.
			 */
			source: {
				type: 'enum',
				label: 'Show',
				description:
					'Pinned shows the portraits you pin from the chat; Scene ' +
					'shows everyone in the session.',
				of: ['pinned', 'scene'],
				default: 'pinned',
			},
			/**
			 * The persona is in the scene but is not cast: it carries no state
			 * of its own, so it draws a face and no bars. Off by default — a
			 * player looking at the party is usually looking at the others.
			 */
			persona: {
				type: 'boolean',
				label: 'Include your persona',
				description: 'Put the persona you play beside the cast.',
				default: false,
				showIf: { field: 'source', equals: 'scene' },
			},
			/**
			 * The common case for stats is one row of bars under a face, so it
			 * is a setting here rather than a second widget beside this one.
			 * Off by default: a genre that declares no slots would otherwise
			 * grow an empty strip under every portrait.
			 */
			bars: {
				type: 'boolean',
				label: 'Show stat bars',
				description: "Draw each portrait's bounded stats as a mini bar row under it.",
				default: false,
			},
		},
	},
	/**
	 * Stats, inventory and world state — the three session surfaces over the
	 * attribute slots and possession edges (`docs/stats-and-states.md`).
	 *
	 * Each is a plain native widget: it reads the session's resolved state, and
	 * every edit it offers is the USER's, which applies immediately. Nothing
	 * here is a review gate — the gate is in the transcript, where the model's
	 * proposals wait, because the gate exists for the writer with no authority.
	 *
	 * A genre that declares no slots gives all three an empty state, so adding
	 * one to a chat session costs nothing and says so.
	 */
	{
		id: 'stats',
		title: 'Stats',
		icon: 'HeartPulse',
		surface: { kind: 'native', component: 'stats' },
		scopes: ['characters'],
		presets: [DEFAULT_PRESET],
		settings: {
			members: {
				type: 'enum',
				label: 'Members',
				description:
					'Scene shows whoever has state in play; All shows every ' +
					'cast member; Pick shows the ones you name.',
				of: ['scene', 'all', 'pick'],
				default: 'scene',
			},
			pickMembers: {
				type: 'string[]',
				label: 'Which members',
				description: 'One name per line.',
				default: [],
				showIf: { field: 'members', equals: 'pick' },
			},
			density: {
				type: 'enum',
				label: 'Density',
				description:
					'Full draws a labelled row per stat; Compact fits them on ' +
					'as few lines as the card allows.',
				of: ['compact', 'full'],
				default: 'full',
			},
			slots: {
				type: 'enum',
				label: 'Stats',
				description: 'Every stat a member carries, or the ones you name.',
				of: ['all', 'pick'],
				default: 'all',
			},
			pickSlots: {
				type: 'string[]',
				label: 'Which stats',
				description: "One name per line, as the stat is labelled ('hp').",
				default: [],
				showIf: { field: 'slots', equals: 'pick' },
			},
		},
	},
	{
		id: 'inventory',
		title: 'Inventory',
		icon: 'Backpack',
		surface: { kind: 'native', component: 'inventory' },
		scopes: ['characters'],
		presets: [DEFAULT_PRESET],
		settings: {
			showWorld: {
				type: 'boolean',
				label: 'Show what nobody is carrying',
				description:
					'A group for the items on the table, which is also where ' +
					'you drop something to put it down.',
				default: true,
			},
			groupBy: {
				type: 'enum',
				label: 'Group by',
				description:
					'Owner lists what each person carries; Item lists who is ' +
					'holding each thing.',
				of: ['owner', 'item'],
				default: 'owner',
			},
		},
	},
	{
		id: 'world-state',
		title: 'World State',
		icon: 'CloudSun',
		surface: { kind: 'native', component: 'world-state' },
		presets: [DEFAULT_PRESET],
		settings: {
			slots: {
				type: 'enum',
				label: 'Stats',
				description: "Every one of the world's stats, or the ones you name.",
				of: ['all', 'pick'],
				default: 'all',
			},
			pickSlots: {
				type: 'string[]',
				label: 'Which stats',
				description: "One name per line, as the stat is labelled ('weather').",
				default: [],
				showIf: { field: 'slots', equals: 'pick' },
			},
			layout: {
				type: 'enum',
				label: 'Layout',
				description:
					'A strip reads across the top of the messages; a list ' +
					'reads down a side column.',
				of: ['strip', 'list'],
				default: 'strip',
			},
		},
	},
]
