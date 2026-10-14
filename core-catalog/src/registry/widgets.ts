/**
 * Core's built-in session widgets (PLAN 25) — part of the announcement (24 §9),
 * the same as the genres, pipelines and hooks core ships. SP boot-seeds each
 * widget's style presets from `CORE_WIDGETS` (create-if-absent by seedKey, the
 * standing rule), and the app mounts each widget's `component` — core's own
 * component module, served at `/core-ui/<slug>` — remote (R79).
 *
 * A "widget" is a session-surface component — the conversation, a portrait
 * panel, a plugin's board. Every widget names a component; a plugin that needs
 * a real document places an `sp-frame` inside its component.
 *
 * ## Where the declaration lives
 *
 * `WidgetDecl` and its parts live in the SDK (`layout.ts`), because a plugin
 * declaring a widget should not have to import core's catalogue to say what
 * one is. They are re-exported here so every existing import — the app's
 * `$lib/shared/widgets/types` chain included — keeps resolving through one
 * module.
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
		title: 'Messages',
		/**
		 * The primary widget: every layout places one, in whichever zone a
		 * person puts it (the primary floor), and as many more copies as they
		 * add — a Sanctum panel, a second view of the story.
		 */
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
					'single-line pill, a tall editor for long turns, or a ' +
					'page line — no box, the next line of the story on a ' +
					'faint underline.',
				of: ['classic', 'minimal', 'writer', 'quill'],
				members: [
					{ key: 'classic', label: 'Classic card' },
					{ key: 'minimal', label: 'Single-line pill' },
					{ key: 'writer', label: 'Tall editor' },
					// The quill skin (next-pass note 22, 2026-10-02): writing
					// on the page itself, as if into an ebook.
					{ key: 'quill', label: 'Page line' },
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
			/**
			 * How the lines are drawn (PLAN-core-widgets §3.7, Q7: a setting,
			 * not a widget — the data, the channel claim and the composer are
			 * the same; only the drawing changes). `rows` is the log as it has
			 * always been; `folio` reads the lines as one block of prose: each
			 * line's body a paragraph, a thin rule naming the speaker where the
			 * speaker changes, no avatar, name row, time or swipes, scene
			 * markers off, and the composer on the page line unless the copy
			 * chose another skin.
			 *
			 * The default is `auto`, **Follow the channel** (PLAN-core-widgets
			 * §3.16): settings arrive complete (defaults filled in), so a
			 * declared `rows` would be indistinguishable from a person's
			 * `rows`, and an undeclared default left the settings sheet's
			 * select empty. `auto` says "unset" out loud: a copy whose `channel`
			 * claim names a `folio`-role channel (`ChannelDecl.role`, the
			 * Writing Room's manuscript) draws as Folio, every other copy as
			 * Rows. A stored `rows` or `folio` wins either way.
			 */
			presentation: {
				type: 'enum',
				label: 'Presentation',
				description:
					'Rows draws each line with its avatar and controls; Folio ' +
					'reads the lines as one block of prose, the way a manuscript ' +
					'reads. Follow the channel reads a manuscript-style channel ' +
					'as Folio and any other as Rows.',
				of: ['auto', 'rows', 'folio'],
				members: [
					{ key: 'auto', label: 'Follow the channel' },
					{ key: 'rows', label: 'Rows' },
					{ key: 'folio', label: 'Folio' },
				],
				default: 'auto',
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
		title: 'Scene Portraits',
		// Its own glyph since W6 (2026-10-11): a framed face. `Users` is the
		// accounts' — Who's here holds it (NOMENCLATURE §22).
		icon: 'SquareUserRound',
		component: 'scene-portraits',
		layout: { span: { ideal: 1 }, minInline: 200 },
		/**
		 * The cast, cast over card (`characters`, R76) — each member's
		 * current sprite and last line's time resolved, its gallery paged by
		 * `character-images` — and the state its stat bars draw
		 * (`session:state`, R72).
		 */
		scopes: ['characters', 'session:state'],
		/**
		 * Its settings alone — never the log: each member's current sprite
		 * and when it last spoke arrive on `characters`.
		 */
		reads: ['settings'],
		presets: [DEFAULT_PRESET],
		/**
		 * Three questions, one setting each (PLAN-core-widgets W6, ruled
		 * 2026-10-10 Q8): **who** (`who`), **which picture** (`face`) and
		 * **how laid out** (`arrangement`). The old one-axis `source`
		 * squashed two of them into one: ⏳ it and `sprites` are still read
		 * (a stored `source: pinned` is `who: pick` · `face: chosen` ·
		 * `arrangement: stage`; `sprites: false` is `face: avatar`), are
		 * never shown, and go at the 0.7 squash.
		 */
		settings: {
			who: {
				type: 'enum',
				label: 'Show',
				description:
					'Everyone in the scene; whoever spoke last, newest first; or only the ' +
					'members you name.',
				of: ['scene', 'recent', 'pick'],
				members: [
					{ key: 'scene', label: 'Everyone in the scene' },
					{ key: 'recent', label: 'Whoever spoke last' },
					{ key: 'pick', label: 'Members you pick' },
				],
				default: 'scene',
			},
			recentTurns: {
				type: 'integer',
				label: 'How many',
				description: 'Show up to this many of the members who spoke most recently.',
				min: 1,
				max: 20,
				default: 3,
				showIf: { field: 'who', equals: 'recent' },
			},
			/** One member per line, as Stats' `pickOwners` is: a name as the session shows it, or `character:<id>`. */
			pickMembers: {
				type: 'string[]',
				label: 'Members',
				description: 'One per line, by the name the session shows. They are drawn in this order.',
				default: [],
				showIf: { field: 'who', equals: 'pick' },
			},
			/**
			 * Faces follow the conversation by default (DESIGN-sprites §7):
			 * each member's CURRENT sprite — the one on the newest line it
			 * spoke — and its avatar when it has none. ⚠ The setting is which
			 * picture a face shows; `SessionCharacterV1.face` is the avatar's
			 * URL.
			 */
			face: {
				type: 'enum',
				label: 'Picture',
				description:
					"Each character's avatar; its current sprite, which follows the " +
					"conversation; or an image chosen from the character's gallery.",
				of: ['avatar', 'sprite', 'chosen'],
				members: [
					{ key: 'avatar', label: 'Avatar' },
					{ key: 'sprite', label: 'Current sprite' },
					{ key: 'chosen', label: 'Chosen image' },
				],
				default: 'sprite',
			},
			/**
			 * 🚧 Each member's **chosen image**, `character:<id>=<image ref>`
			 * per entry — the settings language has no map. The ref is what
			 * `character-images` answers each image with. Behaviour: the face's
			 * own chooser is where an image is picked, and writes it here
			 * (`set-chosen-image`, F2).
			 */
			chosenImages: {
				type: 'string[]',
				label: 'Chosen images',
				description:
					'One per line: the character, then = and the image (character:3=…). ' +
					'A character with none shows its avatar.',
				default: [],
				showIf: { field: 'face', equals: 'chosen' },
				group: 'behaviour',
			},
			arrangement: {
				type: 'enum',
				label: 'Arrangement',
				description:
					'A row, a grid that wraps, a column, or a stage: the first two, large, side by side.',
				of: ['row', 'grid', 'column', 'stage'],
				members: [
					{ key: 'row', label: 'Row' },
					{ key: 'grid', label: 'Grid' },
					{ key: 'column', label: 'Column' },
					{ key: 'stage', label: 'Stage' },
				],
				default: 'grid',
			},
			/**
			 * The persona is in the scene but is not cast: it carries no state
			 * of its own, so it draws a face and no bars. Off by default — a
			 * player looking at the party is usually looking at the others.
			 * Read by `scene` and `recent`; `pick` shows whomever it names.
			 */
			persona: {
				type: 'boolean',
				label: 'Include your persona',
				description: 'Put the persona you play beside the cast.',
				default: false,
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
			 * ⏳ The old `source`. No default, so a value is only ever one a
			 * layout or a person stored: `scene` stays stored as the mark of an
			 * instance that never drew pins (the page seeds chosen images only
			 * into one that did, or that stored nothing); `pinned` is moved to
			 * the three axes by every prune, so the `showIf` on its own value
			 * keeps it off the settings sheet. REMOVE in 0.7.0.
			 */
			source: {
				type: 'enum',
				label: 'Show (old setting)',
				description: 'Replaced by Show, Picture and Arrangement.',
				of: ['pinned', 'scene'],
				showIf: { field: 'source', equals: 'pinned' },
				group: 'behaviour',
			},
			/**
			 * ⏳ The old sprites switch, moved to `face` by every prune (`false`
			 * is `avatar`), so never shown. REMOVE in 0.7.0.
			 */
			sprites: {
				type: 'boolean',
				label: 'Show sprites (old setting)',
				description: 'Replaced by Picture.',
				showIf: { field: 'sprites', equals: false },
				group: 'behaviour',
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
		title: 'Lore entries',
		icon: 'BookOpen',
		component: 'lore-entries',
		layout: { span: { ideal: 1 }, minInline: 260 },
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
	 * Stats — the session surface over the attribute slots
	 * (`docs/stats-and-states.md`), for every owner that holds them: the
	 * world, the cast, the places. One widget with three axes since the Stats
	 * uplift (PLAN-core-widgets W7, 2026-10-11): `owners` (whose), `slots`
	 * (which) and `arrangement` (how — cards, a list down a rail, a strip
	 * across the top). World State was this widget drawn for the world as a
	 * strip, so its id is now an alias (`WIDGET_ID_ALIASES`): a layout that
	 * places `world-state` draws Stats with `owners: world, arrangement:
	 * strip` under its own settings. A layout that wants both the world strip
	 * and the party's cards places Stats twice (`stats#world`).
	 *
	 * R79 removed the Inventory widget for now; what somebody carries is the
	 * `inventory` list stat, drawn here like any list. Its id is retired
	 * (`RETIRED_WIDGET_IDS`), so a stored layout that still places it draws
	 * nothing there.
	 *
	 * A core remote component (R21): it reads the `session_state` section,
	 * and every edit it offers is the USER's, which applies immediately.
	 * Nothing here is a review gate — the gate is in the transcript, where the
	 * model's proposals wait, because the gate exists for the writer with no
	 * authority. A genre that declares no slots gives it an empty state, so
	 * adding one to a chat session costs nothing and says so.
	 */
	{
		id: 'stats',
		title: 'Stats',
		icon: 'HeartPulse',
		component: 'stats',
		layout: { span: { ideal: 1 }, minInline: 220 },
		/** The session's state (R72): its owners, slots and values — never the log. */
		scopes: ['session:state'],
		reads: ['settings'],
		presets: [DEFAULT_PRESET],
		settings: {
			owners: {
				type: 'enum',
				label: 'Whose stats',
				description:
					"Cast draws the cast's; World the world's, with any place that " +
					'has a stat in play under it; Places every place in play; All ' +
					'draws the world, the cast and the places, each under its own ' +
					'heading; Pick draws the ones you name.',
				of: ['cast', 'world', 'places', 'all', 'pick'],
				members: [
					{ key: 'cast', label: 'Cast' },
					{ key: 'world', label: 'World' },
					{ key: 'places', label: 'Places' },
					{ key: 'all', label: 'All' },
					{ key: 'pick', label: 'Pick' },
				],
				default: 'cast',
			},
			pickOwners: {
				type: 'string[]',
				label: 'Which owners',
				description: "One name per line: a cast member, a place, or 'World'.",
				default: [],
				showIf: { field: 'owners', equals: 'pick' },
			},
			/**
			 * Read when `owners` is Cast or All. Always shown: `showIf` holds one
			 * `equals`, and hiding it under All would hide what All reads.
			 */
			castScope: {
				type: 'enum',
				label: 'Which cast members',
				description:
					'With Cast or All: Scene shows whoever has a stat in play; All ' +
					'shows every cast member.',
				of: ['scene', 'all'],
				members: [
					{ key: 'scene', label: 'Scene' },
					{ key: 'all', label: 'All' },
				],
				default: 'scene',
			},
			slots: {
				type: 'enum',
				label: 'Stats',
				description:
					'Every stat an owner carries; Bars, only the numbers with a ' +
					'floor and a ceiling (a HUD); or the ones you name.',
				of: ['all', 'bars', 'pick'],
				members: [
					{ key: 'all', label: 'All' },
					{ key: 'bars', label: 'Bars' },
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
			arrangement: {
				type: 'enum',
				label: 'Arrangement',
				description:
					'Cards draws a card per owner; List one labelled row per stat ' +
					'down a column; Strip one line across the top of the messages.',
				of: ['cards', 'list', 'strip'],
				members: [
					{ key: 'cards', label: 'Cards' },
					{ key: 'list', label: 'List' },
					{ key: 'strip', label: 'Strip' },
				],
				default: 'cards',
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
			/**
			 * 🚧 The **stat trail** (PLAN-core-widgets §3.10, F2): a button
			 * beside each stat opens the changes that led to its value, by
			 * message (`stat-trail`). Anyone in the session may read it.
			 */
			trail: {
				type: 'boolean',
				label: 'Show changes',
				description:
					'A button beside each stat lists how it changed in this ' +
					'session: what it was, what it became, and who changed it.',
				default: true,
				group: 'behaviour',
			},
		},
	},
	/**
	 * ⏳ World State — Stats drawn for the world as a strip, now an ALIAS of
	 * `stats` (`WIDGET_ID_ALIASES`, W7 2026-10-11): every reader resolves a
	 * placed `world-state` to Stats with `owners: world, arrangement: strip`,
	 * so nothing mounts this declaration, and no tray offers it. It stays
	 * declared for one release only so its `widget_styles` rows are not
	 * pruned as undeclared (`syncWidgetStyles`' `pruneUndeclared`) and its
	 * module still serves at `/core-ui/world-state` (a thin wrapper of
	 * Stats). Its settings are the ones a stored row may still hold; the
	 * settings reader reads `layout` as Stats' `arrangement`.
	 * @deprecated REMOVE in 0.7.0 — place `stats#world` with `owners: 'world'`
	 * and `arrangement: 'strip'`.
	 */
	{
		id: 'world-state',
		title: 'World State',
		icon: 'CloudSun',
		component: 'world-state',
		layout: { span: { ideal: 2 }, minInline: 240, minBlock: 60 },
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
	/**
	 * 🚧 Turn order (PLAN-core-widgets W1, 2026-10-10): whose turn it is, who
	 * follows, and — where the viewer may — Continue and Pick who speaks. The
	 * session's stored order (`turnOrder.v1`) drawn as a list to look at:
	 * the head line means what the composer's *Who is due next* line means
	 * (the same `order[0]`, the same words), then a row per prepared turn
	 * with its chip (*Due* · *Then* · *You*), then the two controls and the
	 * strategy in force. Unlike the composer's line it never hides while a
	 * draft exists — it is for looking while someone else writes.
	 *
	 * Faces and "you" come from the cast (`characters`); who may press comes
	 * from the session's own turn controls (`actions.v1`, `core#advance` /
	 * `core#pick`) where the genre lists them, else from `viewer.v1`. A
	 * control the viewer may not press is greyed with its reason, never
	 * hidden. One per layout: a second copy would show the same thing.
	 */
	{
		id: 'turn-order',
		title: 'Turn order',
		icon: 'ListOrdered',
		component: 'turn-order',
		layout: { span: { ideal: 1 }, minInline: 220 },
		/** Faces, names and `mine` — the cast, cascaded (R76). */
		scopes: ['characters'],
		reads: ['turnOrder', 'viewer', 'actions', 'settings', 'locale'],
		maxInstances: 1,
		presets: [DEFAULT_PRESET],
		settings: {
			faces: {
				type: 'boolean',
				label: 'Faces',
				description: "Draw each speaker's face beside their name.",
				default: true,
			},
			showStrategy: {
				type: 'boolean',
				label: 'Show the strategy',
				description: 'Name the strategy that set the order (Round robin, Manual, …) under the controls.',
				default: true,
				group: 'behaviour',
			},
			/**
			 * 🚧 W6 (2026-10-11): `characters.v1` lists a benched character
			 * (`benched: true`) since the Scene Portraits uplift, so the
			 * plan's setting is drawable now.
			 */
			showBenched: {
				type: 'boolean',
				label: 'Show benched characters',
				description: 'List the characters switched off in Participants under the order.',
				default: false,
				group: 'behaviour',
			},
		},
	},
	/**
	 * 🚧 Actions (PLAN-core-widgets W8, 2026-10-11): what can I do right now.
	 * The session's listed actions (`actions.v1`) as real buttons, each with
	 * its icon and name, in three groups taken from fields the listing
	 * carries — the **turn controls** (the `extra` venue: Continue, Pick who
	 * speaks, Regenerate, …), then the **genre's** own (the `composer`
	 * venue), then the **added** ones (`origin: 'foreign'` — another
	 * namespace's, switched on for this genre). A press is `invoke`, so an
	 * action that collects text or recipients opens the page's collect modal
	 * exactly as its chip does. A greyed action keeps its reason as its
	 * title, in the chips' words (`paletteRowState`), never hidden.
	 *
	 * Not the composer's Actions disclosure: that row is about the line being
	 * written and folds away; this stays up while someone else writes, and
	 * `size: large` is the tile grid a phone needs for a long list.
	 *
	 * ⚠ `showWaiting` is declared, not drawn: the questions put to the
	 * viewer's characters (a message's forms) reach no section this widget
	 * reads — the forms ride `messages.v1` and who may answer one is the
	 * conversation dossier's word.
	 */
	{
		id: 'actions',
		title: 'Actions',
		icon: 'MousePointerClick',
		component: 'actions',
		layout: { span: { ideal: 1 }, minInline: 220 },
		reads: ['actions', 'settings', 'locale'],
		maxInstances: 1,
		presets: [DEFAULT_PRESET],
		settings: {
			groups: {
				type: 'enum',
				label: 'Show',
				description:
					'Every group, or one alone: the turn controls, the genre\'s own ' +
					'actions, or the actions added to it from outside.',
				of: ['all', 'turn', 'genre', 'foreign'],
				members: [
					{ key: 'all', label: 'All' },
					{ key: 'turn', label: 'Turn controls' },
					{ key: 'genre', label: 'Genre actions' },
					{ key: 'foreign', label: 'Added actions' },
				],
				default: 'all',
			},
			size: {
				type: 'enum',
				label: 'Size',
				description:
					'Compact draws chips that wrap; Large draws a grid of tiles ' +
					'a finger lands on easily.',
				of: ['compact', 'large'],
				members: [
					{ key: 'compact', label: 'Compact' },
					{ key: 'large', label: 'Large' },
				],
				default: 'compact',
			},
			showWaiting: {
				type: 'boolean',
				label: 'Show what waits on you',
				description:
					'List the questions put to your characters that wait for your ' +
					'answer. Not drawn yet: the widget cannot see them.',
				default: true,
				group: 'behaviour',
			},
		},
	},
	/**
	 * 🚧 Annex (PLAN-core-widgets W9, 2026-10-11): what the pipeline knows
	 * that the viewer may see — one declared annex key, by its label, in the
	 * shape it was declared in. The `key` setting names it as a template
	 * does, `<owner>.<key>`. It draws the viewer's own view of the annex
	 * (`annex.v1`), never the annex itself, so a key whose `see` audience
	 * leaves the viewer out is never drawn. Text is prose, a number or a
	 * choice one row, a list chips, an object a row per member.
	 *
	 * The field's label and whether the viewer may set it are the host's,
	 * from its listing (`actions.v1`): a settable field is one action at the
	 * `widget` venue, `<owner>:annex#<key>`, named by its label and judged
	 * for the viewer. A text field the viewer may set has the Session data
	 * list's Edit, which presses that action with `{ value }` — the same
	 * door, the same write.
	 *
	 * ⚠ Neither the declared shape nor the `see` verdict reaches a widget
	 * yet: a field nobody may set is titled by its key and drawn by its
	 * value's own form, and a key the viewer may not see reads as *Nothing
	 * written yet*. The settings sheet offers no list of the keys (the
	 * field language has no options-from-the-session); the key is typed.
	 */
	{
		id: 'annex',
		title: 'Annex',
		icon: 'ClipboardList',
		component: 'annex',
		layout: { span: { ideal: 1 }, minInline: 220 },
		reads: ['annex', 'actions', 'viewer', 'settings', 'locale'],
		presets: [DEFAULT_PRESET],
		settings: {
			key: {
				type: 'string',
				label: 'Key',
				description:
					'The annex key to show, written as its owner, a dot, then the key: ' +
					"core.retake-quietly, or a plugin's acme.dice.last-roll. Edit session › " +
					'Settings › Session data lists every key under its owner.',
				default: '',
			},
			showLabel: {
				type: 'boolean',
				label: 'Show the label',
				description: "Draw the field's label above its value.",
				default: false,
			},
		},
	},
	/**
	 * 🚧 Album (PLAN-core-widgets W2, 2026-10-11): what has this session
	 * shown me — every picture on its lines (`messages.v1` rows' `core:image`
	 * parts, the shown revision), newest line first, each a square tile with
	 * a corner glyph for where it came from: **attached** by a person (a
	 * person's line) or **generated** by a run (any other line). Hover or
	 * focus names who showed it and when; a press opens the page's lightbox
	 * (`view-image`) with the whole album as its pages, in the order drawn.
	 * `arrangement: latest` draws the newest large and the rest as a strip,
	 * so an illustrated scene sits beside the log as it is generated.
	 *
	 * ⚠ Not a **gallery** (a character's or persona's own image set) — the
	 * word stays theirs (R1) — not the **media strip** (one message's files,
	 * under its card), and not the **Media** collection. Its tile is its own
	 * (`album.tile`), drawn like the strip's: the strip's tile is markup
	 * inside the conversation, not yet a shared control.
	 *
	 * ⚠ The caption does not jump to its line: a fragment link from this box
	 * is prefixed into the box (`guardedConnection`, every box but the
	 * conversation holding the page's ids), so `#message-<id>` cannot reach
	 * the log's anchor, and `selection:changed` has no producer yet.
	 */
	{
		id: 'album',
		title: 'Album',
		icon: 'BookImage',
		component: 'album',
		layout: { span: { ideal: 1 }, minInline: 200 },
		reads: ['messages', 'settings', 'locale'],
		presets: [DEFAULT_PRESET],
		settings: {
			source: {
				type: 'enum',
				label: 'Show',
				description: 'Every picture, or only what people attached, or only what was generated.',
				of: ['all', 'attached', 'generated'],
				members: [
					{ key: 'all', label: 'Everything' },
					{ key: 'attached', label: 'Attached' },
					{ key: 'generated', label: 'Generated' },
				],
				default: 'all',
			},
			tile: {
				type: 'enum',
				label: 'Tile size',
				of: ['small', 'medium', 'large'],
				members: [
					{ key: 'small', label: 'Small' },
					{ key: 'medium', label: 'Medium' },
					{ key: 'large', label: 'Large' },
				],
				default: 'medium',
			},
			arrangement: {
				type: 'enum',
				label: 'Arrangement',
				description:
					'Grid draws every picture the same size; Newest large draws the ' +
					'newest picture big, with the rest as a strip beneath it.',
				of: ['grid', 'latest'],
				members: [
					{ key: 'grid', label: 'Grid' },
					{ key: 'latest', label: 'Newest large' },
				],
				default: 'grid',
			},
			/**
			 * One channel's pictures (the Messages widget's `channel`, read
			 * the same way: a slug, every lane of it). Empty is every
			 * channel: an album takes no line from a log, so no copy's claim
			 * narrows it.
			 */
			channel: {
				type: 'string',
				label: 'Channel',
				description:
					"Show one channel's pictures only, by its slug (the Lair's is sanctum). " +
					'Empty shows every channel.',
				group: 'behaviour',
			},
		},
	},
	/**
	 * 🚧 Backdrop (DESIGN-image-generation §6.4, ruling §9.4; 2026-10-12):
	 * the session's **backdrop** — one picture, session state
	 * (`sessions.backdropMediaId`), set by a pipeline
	 * (`core:outlet/set-backdrop@1`) or by a person here. It reads the
	 * `session` section (`SessionV1.backdrop`, the host's `fitted` address),
	 * draws it fitted under a darkening overlay, and offers the session's
	 * owner or an admin **Change** (a cast member's gallery, paged by
	 * `character-images` — Scene Portraits' chooser request, so it holds
	 * `characters`) and **Clear** (`set-backdrop`). **Illustrate** fires
	 * the Scene action (`actions`) with `{ placement: 'backdrop' }` (I9).
	 *
	 * ⚠ Not the app background (a person's own, behind every screen), not a
	 * message attachment, and not the retired *scene image* pins.
	 */
	{
		id: 'backdrop',
		title: 'Backdrop',
		icon: 'MountainSnow',
		component: 'backdrop',
		layout: { span: { ideal: 1 }, minInline: 200 },
		scopes: ['characters'],
		// `actions`: the Scene action, for **Illustrate** (I9).
		reads: ['session', 'settings', 'locale', 'viewer', 'actions'],
		presets: [DEFAULT_PRESET],
		settings: {
			fit: {
				type: 'enum',
				label: 'Fit',
				description: 'Fill the box and crop the edges, or show the whole picture.',
				of: ['cover', 'contain'],
				members: [
					{ key: 'cover', label: 'Fill' },
					{ key: 'contain', label: 'Whole picture' },
				],
				default: 'cover',
			},
			/** A darkening overlay, so text laid over the picture stays legible. */
			dim: {
				type: 'integer',
				label: 'Dim',
				description: 'Darken the picture so text over it is easier to read. 0 is none, 100 is black.',
				min: 0,
				max: 100,
				default: 0,
			},
		},
	},
	/**
	 * 🚧 Chronicle (PLAN-core-widgets W3, 2026-10-11): when are we in the
	 * story, and what has the lorebook recorded of this session. Top to
	 * bottom: the session's **story clock** (its own, or its line's present
	 * it follows — with **Next day** / **Move the clock…** / **Follow the
	 * line's present** for the session's owner, and a chip when its own
	 * clock stands before its line's present); **Now**, the history entry
	 * the session reads on its line up to its clock, with **Open in
	 * lorebook** and **Start new history entry**; that entry's scenes from
	 * this session, with **Summarize scene** and **Extend graph (N)**; and
	 * **Earlier**, the entries before it, folded. It is the composer's Lore
	 * pane's history half, moved (Q3): the pane keeps what the next reply
	 * would pull in and the entries that have come up.
	 *
	 * Everything is asked of the page (`history-entries`, `set-story-clock`,
	 * `start-history-entry`, `extend-graph`, `summarize`, `open-lore`); the
	 * declared `lore` scope is the grant for the read, and `story:moved`
	 * tells it to ask again. A guest reads the clock alone: the entries and
	 * scenes are the lorebook owner's.
	 *
	 * ⚠ Not a **history entry** (one dated row it lists), not a **scene**,
	 * and not the **story clock** (the value its head shows). A genre with
	 * no lorebook omits it (Dungeon Crawler, when it lands).
	 */
	{
		id: 'chronicle',
		title: 'Chronicle',
		icon: 'Calendar',
		component: 'chronicle',
		layout: { span: { ideal: 1 }, minInline: 260 },
		/** The grant `history-entries` reads with — nothing is pushed. */
		scopes: ['lore'],
		reads: ['settings', 'viewer', 'session'],
		presets: [DEFAULT_PRESET],
		settings: {
			clock: {
				type: 'boolean',
				label: 'Show the story clock',
				description: "Draw where the session stands in its story, and its owner's controls to move it.",
				default: true,
			},
			earlierCount: {
				type: 'integer',
				label: 'Earlier entries shown',
				description: 'How many history entries before the current one the Earlier list shows.',
				default: 10,
				min: 5,
				max: 50,
				group: 'behaviour',
			},
		},
	},
	/**
	 * 🚧 Places (PLAN-core-widgets W4, 2026-10-11): where are we, what is
	 * around us, where can we go. The session's places — its lorebook's
	 * `core:entry/location` entries on its line, at its story clock, a place
	 * switched off or archived by then left out, a renamed one by its name
	 * then — as a **list** (name, category tint, the faces of the cast who
	 * stand there, its ways out; the world's `location` marked **Here**; a
	 * press opens the entry) or a **map** (the shared **map canvas**:
	 * squares tinted by category, arrows for ways — an arrowhead at each end
	 * when a way reads both ways — faces on squares, **Here** ringed; a
	 * press opens the place's detail: its ways said from it, what the book
	 * links to it, who is here, its stats, **Open entry**).
	 *
	 * The places and ways are asked of the page (`session-places`, under the
	 * `lore` grant); who stands where is the session's state, read from
	 * `session_state.v1` (each owner's `location`). The Lair's right column
	 * (list, both picked out) and Adventure's tray place it; every core
	 * genre with a lorebook offers it.
	 *
	 * ⚠ Not the lorebook's **Places lens** (where places and ways are made),
	 * not **Stats** (which draws a place's stats as cards), and never titled
	 * *Map*: Dungeon Crawler's `crawl-map` is *Map* in its genre.
	 */
	{
		id: 'places',
		title: 'Places',
		icon: 'Map',
		component: 'places',
		layout: { span: { ideal: 2 }, minInline: 260, minBlock: 120 },
		/** The grant `session-places` reads with, and the state who stands where is read from. */
		scopes: ['lore', 'session:state'],
		reads: ['settings'],
		presets: [DEFAULT_PRESET],
		settings: {
			view: {
				type: 'enum',
				label: 'View',
				description: 'A list of the places, or a map of them with their ways drawn between.',
				of: ['list', 'map'],
				members: [
					{ key: 'list', label: 'List' },
					{ key: 'map', label: 'Map' },
				],
				default: 'list',
			},
			highlight: {
				type: 'enum',
				label: 'Pick out',
				description:
					"Where the scene is (the world's location, marked Here), where the " +
					'cast stand (their faces on the place), or both.',
				of: ['world', 'cast', 'both'],
				members: [
					{ key: 'world', label: 'Where the scene is' },
					{ key: 'cast', label: 'Where the cast stand' },
					{ key: 'both', label: 'Both' },
				],
				default: 'both',
			},
			categories: {
				type: 'string[]',
				label: 'Categories',
				description: "One category per line, as the places are filed ('Upper floor'). Empty shows every place.",
				default: [],
				group: 'behaviour',
			},
			showWays: {
				type: 'boolean',
				label: 'Show ways out',
				description: "Write each place's ways out under its name in the list, and in a place's detail.",
				default: true,
				group: 'behaviour',
			},
		},
	},
	/**
	 * 🚧 Who's here (PLAN-core-widgets W10, 2026-10-11): which people have
	 * this session open now, as whom each writes, and who is typing. The
	 * session's **attendance** (`attendance.v1`, a base section) drawn as two
	 * groups: **Here** — a row per person with the session open (their
	 * name, *you* on the viewer's own, the persona each writes as with its
	 * face, a typing pulse, and *Owner* / *Guest* as a quiet chip) — and
	 * **Away** — the session's other members, with when they were last here.
	 * A press on a persona opens its sheet (`open-character`).
	 *
	 * Who is here is the host's word: a person whose tab holds the session
	 * open, in any tab. The faces come from the cast (`characters`). One per
	 * layout: a second copy would show the same people. Every genre offers it.
	 *
	 * ⚠ Not a cast **presence** (a cast member's dated span in the world):
	 * these are the session's people — its owner and guests — not its cast.
	 */
	{
		id: 'attendance',
		title: "Who's here",
		icon: 'Users',
		component: 'attendance',
		layout: { span: { ideal: 1 }, minInline: 220 },
		/** The personas' faces and names, by the refs the attendance names (R76). */
		scopes: ['characters'],
		reads: ['attendance', 'viewer', 'settings'],
		maxInstances: 1,
		presets: [DEFAULT_PRESET],
		settings: {
			showAway: {
				type: 'boolean',
				label: 'Show who is away',
				description: 'List the people with a seat who do not have the session open, with when they were last here.',
				default: true,
				group: 'behaviour',
			},
			faces: {
				type: 'boolean',
				label: 'Faces',
				description: "Draw each persona's face beside its name.",
				default: true,
			},
		},
	},
	/**
	 * 🚧 The author's note (2026-10-02, AN1; owner ruling: Chat only): the
	 * session's own note to the model, edited and saved here, with what the
	 * newest reply did with it. It reads no section — the note, who may
	 * change it and the last reply's verdict are all asked of the page
	 * (`authors-note`, `set-authors-note`). Offered by Chat alone among core's
	 * genres (the others omit it); in a plugin genre that declares no note it
	 * says so in one line. Chat's default layout places it, unpinned, in the
	 * right rail (owner ruling 2026-10-03; `CHAT_LAYOUT`).
	 */
	{
		id: 'authors-note',
		title: "Author's note",
		icon: 'NotebookPen',
		component: 'authors-note',
		layout: { span: { ideal: 1 }, minInline: 240 },
		reads: [],
		presets: [DEFAULT_PRESET],
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
	/** Stats (W7): the world's, the cast's and the places' stats — as cards, a list or a strip. */
	stats: coreWidget('stats'),
	/**
	 * ⏳ World State is Stats now (`WIDGET_ID_ALIASES`): a layout naming it
	 * draws Stats with `owners: 'world', arrangement: 'strip'`.
	 * @deprecated REMOVE in 0.7.0 — place `stats#world` with those settings.
	 */
	worldState: coreWidget('world-state'),
	/** 🚧 The author's note (AN1) — Chat's; the other core genres omit it. */
	authorsNote: coreWidget('authors-note'),
	/** 🚧 Turn order (W1): whose turn it is, who follows, Continue and Pick who speaks. */
	turnOrder: coreWidget('turn-order'),
	/** 🚧 Actions (W8): the session's actions as buttons — turn controls, the genre's, the added. */
	actions: coreWidget('actions'),
	/** 🚧 Annex (W9): one declared annex key, by its label, as the viewer may see it. */
	annex: coreWidget('annex'),
	/** 🚧 Album (W2): every picture on the session's lines, newest first; the lightbox pages them all. */
	album: coreWidget('album'),
	/** 🚧 Backdrop: the session's backdrop picture, with Change and Clear for its owner. */
	backdrop: coreWidget('backdrop'),
	/** 🚧 Chronicle (W3): the session's story clock, the history entry it reads now with its scenes, and the entries before. */
	chronicle: coreWidget('chronicle'),
	/** 🚧 Places (W4): the session's places as a list or a map — where the scene is, who stands where, the ways between. */
	places: coreWidget('places'),
	/** 🚧 Who's here (W10): the session's people — who has it open, as whom each writes, who is typing, who is away. */
	attendance: coreWidget('attendance'),
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
	component({ slug: 'messages', label: 'Messages', entry: 'components/shared/messages/messages.ts', framework: 'svelte' }),
	// ⏳ REMOVE in 0.7.0 with the `world-state` declaration: a thin wrapper of
	// Stats in World State's settings, kept so `/core-ui/world-state` serves.
	component({
		slug: 'world-state',
		label: 'World State',
		entry: 'components/shared/world-state/world-state.ts',
		framework: 'svelte',
	}),
	component({ slug: 'stats', label: 'Stats', entry: 'components/shared/stats/stats.ts', framework: 'svelte' }),
	component({
		slug: 'lore-entries',
		label: 'Lore entries',
		entry: 'components/shared/lore-entries/lore-entries.ts',
		framework: 'svelte',
	}),
	component({
		slug: 'scene-portraits',
		label: 'Scene Portraits',
		entry: 'components/shared/scene-portraits/scene-portraits.ts',
		framework: 'svelte',
	}),
	component({
		slug: 'authors-note',
		label: "Author's note",
		entry: 'components/genres/chat/authors-note/authors-note.ts',
		framework: 'svelte',
	}),
	component({
		slug: 'turn-order',
		label: 'Turn order',
		entry: 'components/shared/turn-order/turn-order.ts',
		framework: 'svelte',
	}),
	component({
		slug: 'actions',
		label: 'Actions',
		entry: 'components/shared/actions/actions.ts',
		framework: 'svelte',
	}),
	component({
		slug: 'annex',
		label: 'Annex',
		entry: 'components/shared/annex/annex.ts',
		framework: 'svelte',
	}),
	component({
		slug: 'album',
		label: 'Album',
		entry: 'components/shared/album/album.ts',
		framework: 'svelte',
	}),
	component({
		slug: 'backdrop',
		label: 'Backdrop',
		entry: 'components/shared/backdrop/backdrop.ts',
		framework: 'svelte',
	}),
	component({
		slug: 'chronicle',
		label: 'Chronicle',
		entry: 'components/shared/chronicle/chronicle.ts',
		framework: 'svelte',
	}),
	component({
		slug: 'places',
		label: 'Places',
		entry: 'components/shared/places/places.ts',
		framework: 'svelte',
	}),
	component({
		slug: 'attendance',
		label: "Who's here",
		entry: 'components/shared/attendance/attendance.ts',
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
