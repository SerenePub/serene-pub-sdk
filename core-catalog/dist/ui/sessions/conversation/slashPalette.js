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
import { CORE_ACTION_SPEC_ID, enablementVerdict, i18nText } from '@serene-pub/sdk';
import { statusText } from './text.js';
import { notYoursToUse, VERB_REASONS } from './messageVerbState.js';
/** The draft as a slash query: `/nar` → `nar`; anything else → null. @experimental */
export function slashQueryOf(draft) {
    const m = /^\/([^\s]*)$/.exec(draft);
    return m ? m[1] : null;
}
/**
 * A draft as a slash command (lair pass S2): `/<slash name>`, then
 * whitespace, then the rest — the **slash argument**, trimmed, its inner
 * whitespace and new lines kept, quotes and all (it is text, never
 * shell-quoted). A name with nothing after it, or only whitespace, has no
 * argument (`null`). Anything not starting `/<name>` is no command.
 * @experimental
 */
export function parseSlashCommand(draft) {
    const m = /^\/([^\s]+)(?:\s+([\s\S]*))?$/.exec(draft);
    if (!m)
        return null;
    const argument = m[2]?.trim() ?? '';
    return { name: m[1], argument: argument || null };
}
/**
 * The action a whole slash name names, with the draft's slash argument — the
 * press Enter makes when the draft is `/nudge go north` (S2). Undefined when
 * the name is not a whole slash name of these actions.
 * @experimental
 */
export function exactSlashCommand(actions, draft) {
    const parsed = parseSlashCommand(draft);
    if (!parsed)
        return undefined;
    const name = parsed.name.toLowerCase();
    const action = dedupePaletteActions(actions).find((a) => a.slash.toLowerCase() === name);
    return action ? { action, argument: parsed.argument } : undefined;
}
/**
 * The argument a palette row says its action takes (S2): its text label,
 * lower-cased and unpunctuated — `<direction the party should feel>`
 * when required, `[<describe the room>]` when optional; nothing for an
 * action that collects no text.
 * @experimental
 */
export function slashArgumentHint(a) {
    const text = a.collects?.text;
    if (!text)
        return undefined;
    const label = text.label.trim().replace(/[.?!:…]+$/u, '');
    const word = label ? label.charAt(0).toLowerCase() + label.slice(1) : 'text';
    return text.need === 'optional' ? `[<${word}>]` : `<${word}>`;
}
/**
 * Why a slash argument is refused (S2): only an action that collects text
 * takes one — `/advance x` and `/narrator x` (Narrate takes no text) are
 * refused by name, and nothing fires. Null when there is no argument, or
 * the action takes it.
 * @experimental
 */
export function slashArgumentRefusal(a, argument) {
    if (!argument?.trim() || a.collects?.text)
        return null;
    return `/${a.slash} takes no text`;
}
/**
 * One row per slash name. One declaration listed under several venues —
 * the chips row and the extra tab — is one action and one row; the first
 * occurrence keeps its place in the order. Two declarations under one name
 * cannot reach a session: one slash name means one action (R-15; plans/31
 * V2), refused at publish. Were a stale listing to carry two, core's verb
 * holds the name (S1) and otherwise the first declaration does.
 * @experimental
 */
export function dedupePaletteActions(actions) {
    const rows = new Map();
    for (const a of actions) {
        const held = rows.get(a.slash);
        if (!held) {
            rows.set(a.slash, a);
            continue;
        }
        if (held.specSlug !== CORE_ACTION_SPEC_ID && a.specSlug === CORE_ACTION_SPEC_ID)
            rows.set(a.slash, a);
    }
    return [...rows.values()];
}
/**
 * The palette's rows for a query: slash names starting with it first, then
 * labels containing it, one row per slash name (`dedupePaletteActions`).
 * An empty query lists everything.
 * @experimental
 */
export function filterPaletteActions(actions, query) {
    const q = query.trim().toLowerCase();
    const unique = dedupePaletteActions(actions);
    if (!q)
        return unique;
    const byName = unique.filter((a) => a.slash.toLowerCase().startsWith(q));
    const byLabel = unique.filter((a) => !a.slash.toLowerCase().startsWith(q) &&
        (a.name.toLowerCase().includes(q) || a.slash.toLowerCase().includes(q)));
    return [...byName, ...byLabel];
}
/** The one row a whole slash name names, if the draft is exactly it — the deduped row. @experimental */
export function exactPaletteMatch(actions, draft) {
    const q = slashQueryOf(draft);
    if (!q)
        return undefined;
    return dedupePaletteActions(actions).find((a) => a.slash.toLowerCase() === q.toLowerCase());
}
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
export function paletteRowState(a, opts) {
    if (!a.canAct)
        return { disabled: true, reason: notYoursToUse({ name: a.name, act: a.audience.act }) };
    if (a.enabled === false)
        return { disabled: true, ...(a.reason ? { reason: a.reason } : {}) };
    if (a.itemPredicates?.length && opts.newest !== undefined) {
        // No row reads as every `item.*` value absent, so the first item
        // predicate — the newest-row rule, for core's verbs — names why.
        const actsOn = a.venue === 'extra' ? opts.newest : null;
        const heard = enablementVerdict.judge({
            preds: a.itemPredicates,
            doc: actsOn ? { item: actsOn } : {},
        });
        if (!heard.ok)
            return {
                disabled: true,
                reason: (opts.statusText ?? statusText)({ i18n: heard.sentence }) || (i18nText(heard.sentence) ?? ''),
            };
    }
    if (opts.generating)
        return { disabled: true, reason: VERB_REASONS.generating };
    return { disabled: false };
}
/** The next highlight after an arrow key, wrapping. @experimental */
export function stepHighlight(current, count, delta) {
    if (count <= 0)
        return -1;
    if (current < 0)
        return delta === 1 ? 0 : count - 1;
    return (current + delta + count) % count;
}
//# sourceMappingURL=slashPalette.js.map