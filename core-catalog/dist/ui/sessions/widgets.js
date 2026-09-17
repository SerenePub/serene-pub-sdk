/**
 * The globally-unique, reseed-stable slug for a widget's built-in style. This is
 * both the system row's `slug` (the layout's reference target) and its seed
 * identity — the reconciler upserts and prunes system rows by matching on it,
 * NEVER on a numeric id (the codified seed rule).
 *
 * Widget ids and preset slugs are simple kebab tokens (no `:`), so the join is
 * unambiguous.
 */
export function systemStyleSlug(widgetId, presetSlug) {
    return `${widgetId}:${presetSlug}`;
}
/**
 * A widget ships at least one "default" style so a fresh layout always resolves
 * to something. Empty `css` means the base look (the widget's own styling with
 * no skin on top); it exists as a row so the layout's id+slug reference has a
 * concrete, reseed-stable target to point at.
 */
const DEFAULT_PRESET = {
    slug: 'default',
    title: 'Default',
    css: '',
};
/**
 * The built-in session widgets. Pure data — no component imports — so the
 * server-side style reconciler reads it at boot without pulling the client
 * bundle; the client maps each `surface.component` key to a Svelte component.
 */
export const CORE_WIDGETS = [
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
                description: 'How the message field is drawn: the classic card, a ' +
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
                description: 'Pinned shows the portraits you pin from the chat; Scene ' +
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
                description: 'Scene shows whoever has state in play; All shows every ' +
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
                description: 'Full draws a labelled row per stat; Compact fits them on ' +
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
                description: 'A group for the items on the table, which is also where ' +
                    'you drop something to put it down.',
                default: true,
            },
            groupBy: {
                type: 'enum',
                label: 'Group by',
                description: 'Owner lists what each person carries; Item lists who is ' +
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
                description: 'A strip reads across the top of the messages; a list ' +
                    'reads down a side column.',
                of: ['strip', 'list'],
                default: 'strip',
            },
        },
    },
];
//# sourceMappingURL=widgets.js.map