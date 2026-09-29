/**
 * The `/` palette's logic, apart from its markup (plans/29 R-15 *slash
 * name*; F38; plans/30 U5c).
 *
 * Typing `/` at the start of an empty draft opens a list of the composer's
 * actions — the composer venue's and the extra tab's, since both are the
 * composer's own — by slash name and label; the rest of the draft filters
 * it; Enter invokes the highlighted one, or the exact match when the palette
 * is closed; Escape closes it until the draft changes. Slash names are
 * stable ASCII ids and never localised (R-20): the palette shows the
 * localised label beside each.
 *
 * Pure, so it is tested without a DOM: the component owns the textarea and
 * the popover, this owns what they show.
 */
import { type EnabledWhen } from '@serene-pub/sdk';
import type { ItemValues } from './itemValues.js';
import { statusText } from './text.js';
/** @experimental */
export interface PaletteAction {
    /** With `specSlug`, the action's identity — the one key (plans/31 V2). */
    key: string;
    specSlug: string;
    name: string;
    slash: string;
    icon?: string;
    /** Who may act, off the list — what the audience's sentence names when `canAct` is false. */
    audience: {
        act: string[];
    };
    canAct: boolean;
    isNew: boolean;
    venue: string;
    /**
     * The enabled-when verdict off the list (U5e): every predicate the
     * server evaluated over the session's published values holds. Absent
     * (an older server) reads as enabled.
     */
    enabled?: boolean;
    /** Why it is grey when `enabled` is false — already resolved to a sentence. */
    reason?: string;
    /**
     * The `item.*` predicates the server could not judge without a message
     * (U5e). An **extra**-venue row may act on the newest row — `/retry`
     * does — so they are judged here against it, and a session with
     * no row at all fails them: nothing to regenerate. A composer row's
     * press names no row, and is judged against none.
     */
    itemPredicates?: EnabledWhen[];
    /**
     * What a press collects before it fires, off the list (lair pass R3):
     * an action declaring `collects.text` takes a **slash argument** (S2);
     * one that also collects recipients opens the collect modal with it.
     */
    collects?: PaletteCollects;
}
/**
 * The part of a listed action's `collects` the palette reads (the app's
 * `ListedCollects`): the text's need and label, and whether recipients are
 * asked for too. @experimental
 */
export interface PaletteCollects {
    text?: {
        need: 'required' | 'optional';
        label: string;
    };
    recipients?: object;
}
/** The draft as a slash query: `/nar` → `nar`; anything else → null. @experimental */
export declare function slashQueryOf(draft: string): string | null;
/**
 * A draft as a slash command (lair pass S2): `/<slash name>`, then
 * whitespace, then the rest — the **slash argument**, trimmed, its inner
 * whitespace and new lines kept, quotes and all (it is text, never
 * shell-quoted). A name with nothing after it, or only whitespace, has no
 * argument (`null`). Anything not starting `/<name>` is no command.
 * @experimental
 */
export declare function parseSlashCommand(draft: string): {
    name: string;
    argument: string | null;
} | null;
/**
 * The action a whole slash name names, with the draft's slash argument — the
 * press Enter makes when the draft is `/nudge go north` (S2). Undefined when
 * the name is not a whole slash name of these actions.
 * @experimental
 */
export declare function exactSlashCommand<A extends PaletteAction>(actions: ReadonlyArray<A>, draft: string): {
    action: A;
    argument: string | null;
} | undefined;
/**
 * The argument a palette row says its action takes (S2): its text label,
 * lower-cased and unpunctuated — `<direction the party should feel>`
 * when required, `[<describe the room>]` when optional; nothing for an
 * action that collects no text.
 * @experimental
 */
export declare function slashArgumentHint(a: Pick<PaletteAction, 'collects'>): string | undefined;
/**
 * Why a slash argument is refused (S2): only an action that collects text
 * takes one — `/advance x` and `/narrator x` (Narrate takes no text) are
 * refused by name, and nothing fires. Null when there is no argument, or
 * the action takes it.
 * @experimental
 */
export declare function slashArgumentRefusal(a: Pick<PaletteAction, 'slash' | 'collects'>, argument: string | null | undefined): string | null;
/**
 * One row per slash name. One declaration listed under several venues —
 * the chips row and the extra tab — is one action and one row; the first
 * occurrence keeps its place in the order. Two declarations under one name
 * cannot reach a session: one slash name means one action (R-15; plans/31
 * V2), refused at publish. Were a stale listing to carry two, core's verb
 * holds the name (S1) and otherwise the first declaration does.
 * @experimental
 */
export declare function dedupePaletteActions(actions: ReadonlyArray<PaletteAction>): PaletteAction[];
/**
 * The palette's rows for a query: slash names starting with it first, then
 * labels containing it, one row per slash name (`dedupePaletteActions`).
 * An empty query lists everything.
 * @experimental
 */
export declare function filterPaletteActions(actions: ReadonlyArray<PaletteAction>, query: string): PaletteAction[];
/** The one row a whole slash name names, if the draft is exactly it — the deduped row. @experimental */
export declare function exactPaletteMatch(actions: ReadonlyArray<PaletteAction>, draft: string): PaletteAction | undefined;
/**
 * Whether one palette row may be run now, and why not: the audience first
 * (`canAct`, off the list), then the declared **enabled-when** verdict the
 * list carries (`enabled` / `reason`, U5e — *Set a location first*), then
 * the session's state — nothing runs while a reply streams, as the chips
 * and the **More** menu already refuse (U5c review, S5). One reading for
 * the row's `aria-disabled`, its note and the Enter/click guard, so the
 * palette cannot say one thing and do another; the chips and the More
 * menu read it too.
 * @experimental
 */
export declare function paletteRowState(a: Pick<PaletteAction, 'name' | 'audience' | 'canAct' | 'enabled' | 'reason' | 'itemPredicates'> & {
    venue?: string;
}, opts: {
    generating: boolean;
    /**
     * The newest row's `item` document, or `null` for a session with no
     * row — what an **extra**-venue press (Regenerate, Continue, and
     * their palette rows) acts on. A composer-venue press names no row
     * and is judged against none, as the door judges it (W4). Absent
     * means the caller has no row to offer and the item predicates are
     * left unjudged (a surface that lists no such action).
     */
    newest?: ItemValues | null;
    /**
     * How a predicate's sentence is put in the viewer's language: the
     * caller's own (the page passes the app's `statusText`), else the
     * resolver a conversation set in this realm (`setStatusTextResolver`).
     */
    statusText?: typeof statusText;
}): {
    disabled: boolean;
    reason?: string;
};
/** The next highlight after an arrow key, wrapping. @experimental */
export declare function stepHighlight(current: number, count: number, delta: 1 | -1): number;
//# sourceMappingURL=slashPalette.d.ts.map