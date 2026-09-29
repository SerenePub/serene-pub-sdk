/**
 * Core's built-in session widgets (PLAN 25) — part of the announcement (24 §9),
 * the same as the genres, pipelines and hooks core ships. SP boot-seeds each
 * widget's style presets from `CORE_WIDGETS` (create-if-absent by seedKey, the
 * standing rule), and the app mounts each widget's `component` — core's own
 * component module, served at `/core-ui/<slug>` — remote (R79).
 *
 * A "widget" is a session-surface component — the conversation, a portrait
 * panel, a plugin frame. Component and frame widgets share ONE declaration and
 * ONE data contract; the only difference is the iframe.
 *
 * ## Where the declaration lives
 *
 * `WidgetDecl` and its parts moved into the SDK (`layout.ts`) with the layout
 * document that places them, because `placement`, `fold` and `priority` are
 * statements about the grid and a plugin declaring a widget should not have to
 * import core's catalogue to say them. They are re-exported here so every
 * existing import — the app's `$lib/shared/widgets/types` chain included —
 * keeps resolving through one module.
 */
export {
	systemStyleSlug,
	type WidgetDecl,
	type WidgetDependency,
	type WidgetScope,
	type WidgetStylePreset,
} from '@serene-pub/sdk'

import { component, ownWidgets, type ComponentDecl, type WidgetDecl, type WidgetStylePreset } from '@serene-pub/sdk'

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
 * bundle; the client maps each `component` to a Svelte component.
 * @experimental
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
		/**
		 * `0` — the conversation is the primary widget, so it is the last thing
		 * to yield space and the only one that may never fold away: `shrink` keeps
		 * it drawn at whatever it is given, which is the anchor guarantee made
		 * measurable rather than special-cased in the renderer.
		 */
		priority: 0,
		fold: 'shrink',
		placement: { zone: 'middle', height: 'grow' },
		title: 'Messages',
		role: 'primary',
		component: 'messages',
		/**
		 * What the conversation's source reads (R75): its box's tier, the
		 * log, the message venues, its settings, the viewer and the locale.
		 * Everything else it is told arrives in its dossier (`session:full`,
		 * the page's grant to core's own conversation).
		 */
		reads: ['layout', 'messages', 'actions', 'settings', 'viewer', 'locale'],
		presets: [DEFAULT_PRESET],
		settings: {
			composer: {
				type: 'enum',
				label: 'Composer',
				description:
					'How the message field is drawn: the classic card, a ' +
					'single-line pill, or a tall editor for long turns.',
				of: ['classic', 'minimal', 'writer'],
				members: [
					{ key: 'classic', label: 'Classic card' },
					{ key: 'minimal', label: 'Single-line pill' },
					{ key: 'writer', label: 'Tall editor' },
				],
				default: 'classic',
			},
			composerPosition: {
				type: 'enum',
				label: 'Composer position',
				description: 'Which end of the log you write at.',
				of: ['bottom', 'top'],
				members: [
					{ key: 'bottom', label: 'Bottom' },
					{ key: 'top', label: 'Top' },
				],
				default: 'bottom',
			},
			/**
			 * How wide the log's rows and the composer run. `full` fills the
			 * width the layout gives the widget — the default, because a widget
			 * fills its box; `comfortable` holds them to a reading measure
			 * (about 640px of prose), centred on the session. It was a hidden
			 * cap before it was a setting (ruled 2026-09-29).
			 */
			lineWidth: {
				type: 'enum',
				label: 'Line width',
				description:
					'Full uses the whole width of the panel; Comfortable keeps ' +
					'lines to an easy reading length, centred.',
				of: ['full', 'comfortable'],
				members: [
					{ key: 'full', label: 'Full' },
					{ key: 'comfortable', label: 'Comfortable' },
				],
				default: 'full',
			},
			order: {
				type: 'enum',
				label: 'Message order',
				description: 'Newest messages at the bottom, or at the top.',
				of: ['oldest-first', 'newest-first'],
				members: [
					{ key: 'oldest-first', label: 'Newest at the bottom' },
					{ key: 'newest-first', label: 'Newest at the top' },
				],
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
			 * Which channel this copy shows (lair re-plan S1). Unset, it is the
			 * **primary log**: every channel no other placed Messages widget
			 * claims, so a layout with one Messages widget is the whole session,
			 * as it always was. Set, it shows that channel alone: its composer
			 * writes there, its turn controls are that channel's, and its head
			 * names the channel by its declared label (the Lair's Sanctum). The
			 * host narrows what the conversation is told (its composer's
			 * channels); this value is the claim it narrows by.
			 */
			channel: {
				type: 'string',
				label: 'Channel',
				description:
					"Show one channel only, by its slug (the Lair's is sanctum). " +
					'Empty shows every channel no other Messages widget shows.',
				group: 'behaviour',
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
			/**
			 * The face beside each line (DESIGN-sprites §7): the character's
			 * avatar, or the **sprite that line showed** — set and label
			 * recorded on the line, so an outfit change keeps the old outfit on
			 * the old lines. Avatar by default: a face per line is busy in the
			 * bubble skins, and a character with no sprites shows its avatar
			 * either way.
			 */
			avatarFace: {
				type: 'enum',
				label: 'Face beside each line',
				description:
					"The character's avatar, or the sprite that line showed.",
				of: ['avatar', 'sprite'],
				members: [
					{ key: 'avatar', label: 'Avatar' },
					{ key: 'sprite', label: 'The line\'s sprite' },
				],
				default: 'avatar',
				group: 'behaviour',
				showIf: { field: 'showAvatars', equals: true },
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
			/**
			 * Who is due next (PLAN-turn-order §4.9): the head of the stored
			 * turn order with Continue (`head`), the head and who follows
			 * (`list`), or nothing (`hidden`). Replaces the `showNudge`
			 * boolean; a stored `showNudge: false` still reads as `hidden`.
			 */
			nextUp: {
				type: 'enum',
				label: 'Who is due next',
				description: 'Show who speaks next, who speaks after them too, or nothing.',
				of: ['head', 'list', 'hidden'],
				members: [
					{ key: 'head', label: 'Who speaks next' },
					{ key: 'list', label: 'Who speaks next and after them' },
					{ key: 'hidden', label: 'Nothing' },
				],
				default: 'head',
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
		placement: { zone: 'right', height: 'grow' },
		fold: 'scroll',
		title: 'Scene Portraits',
		component: 'scene-portraits',
		/**
		 * The cast, cast over card, and the pinned images (`characters`,
		 * R76), and the state its stat bars draw (`session:state`, R72).
		 */
		scopes: ['characters', 'session:state'],
		/**
		 * Its settings alone — never the log: each member's current sprite
		 * arrives resolved on `characters` (`SessionCharacterV1.sprite`).
		 */
		reads: ['settings'],
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
				members: [
					{ key: 'pinned', label: 'Pinned' },
					{ key: 'scene', label: 'Scene' },
				],
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
			/**
			 * Faces follow the conversation (DESIGN-sprites §7): each member
			 * shows its CURRENT sprite — the one on the newest line it spoke —
			 * instead of its avatar. On by default; a member with no sprites
			 * shows its avatar either way. Scene only: a pinned portrait is an
			 * image a person chose, not a cast member.
			 */
			sprites: {
				type: 'boolean',
				label: 'Show sprites',
				description: "Show each character's current sprite instead of its avatar.",
				default: true,
				showIf: { field: 'source', equals: 'scene' },
			},
		},
	},
	/**
	 * Lore entries (PLAN-sdk-1.0 §3.9, R58): the session's lorebook, entry by
	 * entry, with what this session's rankings made of each — how often it
	 * was read, when last, at what rank — and the two marks, **Off** and
	 * **Pin**. Search, sort and filter; paged. For the book's owner (and
	 * admins): anyone else sees one line saying whose it is, because
	 * `WidgetDecl` has no visibility field and the widget says it itself.
	 */
	{
		id: 'lore-entries',
		placement: { zone: 'right', height: 'grow' },
		fold: 'scroll',
		title: 'Lore entries',
		icon: 'BookOpen',
		component: 'lore-entries',
		/** The grant `session-entries` pages the book with — nothing is pushed. */
		scopes: ['lore'],
		/**
		 * Its settings alone, as stats and world state: the page names its
		 * own session for both of its requests (`session-entries`,
		 * `set-entry-marks`).
		 */
		reads: ['settings'],
		presets: [DEFAULT_PRESET],
		settings: {
			sort: {
				type: 'enum',
				label: 'Sort by',
				description: 'Name, when it was last read, how often it was read, or its last rank.',
				of: ['name', 'lastRead', 'timesRead', 'rank'],
				members: [
					{ key: 'name', label: 'Name' },
					{ key: 'lastRead', label: 'Last read' },
					{ key: 'timesRead', label: 'Times read' },
					{ key: 'rank', label: 'Last rank' },
				],
				default: 'lastRead',
			},
			pageSize: {
				type: 'integer',
				label: 'Entries per page',
				default: 25,
				min: 5,
				max: 100,
				group: 'behaviour',
			},
		},
	},
	/**
	 * Stats and world state — the two session surfaces over the attribute
	 * slots (`docs/stats-and-states.md`). R79 removed the Inventory widget for
	 * now; since phase 3b what somebody carries is the `inventory` list stat,
	 * drawn here like any list. Its id is retired (`RETIRED_WIDGET_IDS`), so a stored layout that
	 * still places it draws nothing there.
	 *
	 * Each is a core remote component (R21): it reads the `session_state`
	 * section, and every edit it offers is the USER's, which applies
	 * immediately. Nothing here is a review gate — the gate is in the
	 * transcript, where the model's proposals wait, because the gate exists for
	 * the writer with no authority.
	 *
	 * A genre that declares no slots gives both an empty state, so adding
	 * one to a chat session costs nothing and says so.
	 */
	{
		id: 'stats',
		placement: { zone: 'right', height: 'grow' },
		fold: 'scroll',
		title: 'Stats',
		icon: 'HeartPulse',
		component: 'stats',
		/** The session's state (R72): its cast owners, slots and values — never the log. */
		scopes: ['session:state'],
		reads: ['settings'],
		presets: [DEFAULT_PRESET],
		settings: {
			members: {
				type: 'enum',
				label: 'Members',
				description:
					'Scene shows whoever has state in play; All shows every ' +
					'cast member; Pick shows the ones you name.',
				of: ['scene', 'all', 'pick'],
				members: [
					{ key: 'scene', label: 'Scene' },
					{ key: 'all', label: 'All' },
					{ key: 'pick', label: 'Pick' },
				],
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
				members: [
					{ key: 'compact', label: 'Compact' },
					{ key: 'full', label: 'Full' },
				],
				default: 'full',
			},
			slots: {
				type: 'enum',
				label: 'Stats',
				description: 'Every stat a member carries, or the ones you name.',
				of: ['all', 'pick'],
				members: [
					{ key: 'all', label: 'All' },
					{ key: 'pick', label: 'Pick' },
				],
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
		id: 'world-state',
		/**
		 * The middle, as a `fit` strip: this is the one piece of state that is
		 * about the SCENE rather than about a person, so it belongs where the
		 * scene is, and its own `layout` setting defaults to `strip` to match.
		 */
		placement: { zone: 'middle', height: 'fit' },
		fold: 'scroll',
		title: 'World State',
		icon: 'CloudSun',
		component: 'world-state',
		/** The session's state (R72): the world owner's slots and values — never the log. */
		scopes: ['session:state'],
		reads: ['settings'],
		presets: [DEFAULT_PRESET],
		settings: {
			slots: {
				type: 'enum',
				label: 'Stats',
				description: "Every one of the world's stats, or the ones you name.",
				of: ['all', 'pick'],
				members: [
					{ key: 'all', label: 'All' },
					{ key: 'pick', label: 'Pick' },
				],
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
				members: [
					{ key: 'strip', label: 'Strip' },
					{ key: 'list', label: 'List' },
				],
				default: 'strip',
			},
		},
	},
]

// Core's widgets are core's (R71): a genre naming one by value names its bare id.
ownWidgets('core', CORE_WIDGETS)

const coreWidget = (id: string): WidgetDecl => {
	const w = CORE_WIDGETS.find((x) => x.id === id)
	if (!w) throw new Error(`core declares no widget '${id}'`)
	return w
}

/**
 * Core's widgets as values (R71) — what a genre names in `omitWidgets` or a
 * layout, and what a package's clone replaces.
 * @public
 */
export const coreWidgets = {
	/** The log and the field you write into — the middle of every genre that keeps it. */
	conversation: coreWidget('messages'),
	scenePortraits: coreWidget('scene-portraits'),
	loreEntries: coreWidget('lore-entries'),
	stats: coreWidget('stats'),
	worldState: coreWidget('world-state'),
} as const

/**
 * Core's components (C6 P1), declared through the public API as a package
 * declares its own (R26): one per core widget's `component`, its source
 * under this package's `components/`. The build compiles them into
 * `dist/components/<slug>.js` (served at `/core-ui/<slug>`) and writes each
 * one's source beside it, `dist/components/<slug>.source.json`, which an
 * admin views, clones and diffs against — a clone's `basedOn` names the
 * slug, this package's version and that file's `sourceHash`.
 * @experimental
 */
export const CORE_COMPONENTS: ComponentDecl[] = [
	component({ slug: 'messages', label: 'Messages', entry: 'components/sessions/messages/messages.ts', framework: 'svelte' }),
	component({
		slug: 'world-state',
		label: 'World State',
		entry: 'components/sessions/world-state/world-state.ts',
		framework: 'svelte',
	}),
	component({ slug: 'stats', label: 'Stats', entry: 'components/sessions/stats/stats.ts', framework: 'svelte' }),
	component({
		slug: 'lore-entries',
		label: 'Lore entries',
		entry: 'components/sessions/lore-entries/lore-entries.ts',
		framework: 'svelte',
	}),
	component({
		slug: 'scene-portraits',
		label: 'Scene Portraits',
		entry: 'components/sessions/scene-portraits/scene-portraits.ts',
		framework: 'svelte',
	}),
]

/**
 * Core components an admin may read but not clone (C6 Q3): `messages` runs
 * on core's trust — no invoke gate, unprefixed `#message-<id>` ids for j/k
 * — which a clone, never mounted as core, cannot have.
 * @experimental
 */
export const CORE_VIEW_ONLY_COMPONENTS: readonly string[] = ['messages']

/**
 * `dist/components/<slug>.source.json` (C6 P1): a core component's source
 * as its build read it — every file under this package's `components/` the
 * build reached, by path relative to `components/` (never outside it, never
 * into `node_modules`). A clone starts from `files`; the in-app compiler
 * builds it from `files` and `entry` as they stand.
 * @experimental
 */
export interface CoreComponentSource {
	slug: string
	framework: ComponentDecl['framework']
	/** One of `files`' keys. */
	entry: string
	/** Relative path (under `components/`) → source. */
	files: Record<string, string>
	/** `componentSourceHash(files)` (`@serene-pub/cli/component-compile`). */
	sourceHash: string
	/** This package's version when it was built. */
	catalogVersion: string
}
