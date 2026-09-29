/**
 * Statuses (plans/29 R-19, R-21; 09-B B11) — what a node says it is doing,
 * from inside its execution.
 *
 * `ctx.status({ i18n, vars })` is callable at any point, by any kind: a query
 * says *{speaker} is thinking*, the oracle five nodes later says *{speaker} is
 * typing*. It is **ephemeral** — never a parameter, never declared on a
 * definition, never a node row on the receipt (F34) — and it persists until
 * the next status or the run's end. The one exception R-21 took: the **last**
 * status is recorded on the receipt when a run ends `halt`, `err` or
 * `cancelled`, because "what was it doing when it died" is a question the
 * receipt should answer.
 *
 * Text is display text with variables — a string, or a locale map (R-20);
 * the CLIENT resolves the locale, so a handler never sees a language. `{speaker}` is the one variable the HOST
 * fills — see `HOST_FILLED_STATUS_VARS` — because a handler is blind to who
 * is speaking and must stay so.
 *
 * ⚠ Not HTTP's `statusText` (a reason phrase beside a code) and not a run's
 * *outcome* (`ok · halt · err · cancelled`): a status is prose about progress,
 * and it decides nothing.
 */
import { i18nText, isI18n, localeMapOf } from './i18n.js';
/**
 * The variables a host fills, by name, when a status's text mentions them and
 * the handler did not supply a value. One entry: `speaker` — the display name
 * of the run's speaker (a character's or an envoy's), which the handler cannot
 * know and the host always can. A text naming `{speaker}` on a run with no
 * speaker keeps the variable unset; see `renderStatusText` for what a reader
 * sees then.
 * @experimental
 */
export const HOST_FILLED_STATUS_VARS = ['speaker'];
/** `{name}` — one variable placeholder, as every locale of a status spells it. */
const VAR_PATTERN = /\{([A-Za-z_][A-Za-z0-9_]*)\}/g;
/**
 * Is this a status a run can carry? `i18n` is display text a publish accepts
 * (R-20): a non-blank string, or a locale map whose `en` is non-blank. The
 * executor drops a status that is not, with a note on the receipt — a status
 * is advisory and never halts a run.
 * @internal
 */
export function isStatusText(value) {
    if (!value || typeof value !== 'object')
        return false;
    return isI18n(value.i18n);
}
/** The variable names a status's text mentions, across every locale it carries. @internal */
export function statusVarsMentioned(text) {
    const names = new Set();
    for (const template of Object.values(localeMapOf(text.i18n))) {
        if (typeof template !== 'string')
            continue;
        for (const m of template.matchAll(VAR_PATTERN))
            names.add(m[1]);
    }
    return [...names];
}
/**
 * A status with the given variables filled in — for every name the text
 * mentions that its own `vars` does not already set. The text's own values
 * win: a handler that supplied a value said what it meant.
 *
 * Returns the same object when nothing changes, so a caller can dedupe by
 * identity as well as by content.
 * @internal
 */
export function fillStatusVars(text, values) {
    const mentioned = statusVarsMentioned(text);
    const added = {};
    for (const name of mentioned) {
        if (text.vars && name in text.vars)
            continue;
        const v = values[name];
        if (v === undefined)
            continue;
        added[name] = v;
    }
    if (Object.keys(added).length === 0)
        return text;
    return { ...text, vars: { ...(text.vars ?? {}), ...added } };
}
/**
 * The status as a person reads it: the requested locale, else `en`, with
 * every `{var}` the text sets substituted. A variable the text mentions and
 * nobody filled stays as written — a visible `{speaker}` mid-sentence is a
 * defect a reader can report — EXCEPT a leading `{speaker} `, which is
 * dropped rather than shown literally: a run with nobody to name (a
 * summarize, a graph build) leaves `speaker` unset by design, and "is
 * thinking" reads fine with nobody named. An empty gap elsewhere is one
 * nobody would notice.
 * @internal
 */
export function renderStatusText(text, language = 'en') {
    const template = i18nText(text.i18n, language) ?? '';
    const vars = text.vars ?? {};
    const withoutUnfilledSpeaker = !('speaker' in vars) && template.startsWith('{speaker} ')
        ? template.slice('{speaker} '.length)
        : template;
    return withoutUnfilledSpeaker.replace(VAR_PATTERN, (whole, name) => name in vars ? String(vars[name]) : whole);
}
/** Two statuses that would render identically in every locale. @internal */
export function sameStatus(a, b) {
    if (a === b)
        return true;
    if (!a || !b)
        return false;
    return sameLocaleMap(localeMapOf(a.i18n), localeMapOf(b.i18n)) && sameVars(a.vars, b.vars);
}
/** Same locale map — order-independent, like `sameVars` (a rebuilt object must still match). */
function sameLocaleMap(a, b) {
    const ka = Object.keys(a).sort();
    const kb = Object.keys(b).sort();
    if (ka.length !== kb.length)
        return false;
    return ka.every((k, i) => k === kb[i] && a[k] === b[k]);
}
function sameVars(a, b) {
    const ka = Object.keys(a ?? {}).sort();
    const kb = Object.keys(b ?? {}).sort();
    if (ka.length !== kb.length)
        return false;
    return ka.every((k, i) => k === kb[i] && a[k] === b[k]);
}
//# sourceMappingURL=status.js.map