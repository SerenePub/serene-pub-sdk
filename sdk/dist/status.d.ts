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
 * Text is a locale map with variables; the CLIENT resolves the locale, so a
 * handler never sees a language. `{speaker}` is the one variable the HOST
 * fills — see `HOST_FILLED_STATUS_VARS` — because a handler is blind to who
 * is speaking and must stay so.
 *
 * ⚠ Not HTTP's `statusText` (a reason phrase beside a code) and not a run's
 * *outcome* (`ok · halt · err · cancelled`): a status is prose about progress,
 * and it decides nothing.
 */
import type { LocaleMap } from './descriptors.js';
/** One status: a locale map with `en`, and the values its `{vars}` take. */
export interface StatusText {
    i18n: LocaleMap;
    vars?: Record<string, string | number>;
}
/**
 * The receipt's one record of a status — the last one set, and the node that
 * set it — present only when the run ended `halt`, `err` or `cancelled`
 * (R-21, "optional, taken"). Never on an `ok` receipt, and never a node row.
 */
export interface LastStatus {
    nodeKey: string;
    text: StatusText;
}
/**
 * The variables a host fills, by name, when a status's text mentions them and
 * the handler did not supply a value. One entry: `speaker` — the display name
 * of the run's speaker (a character's or an envoy's), which the handler cannot
 * know and the host always can. A text naming `{speaker}` on a run with no
 * speaker keeps the variable unset; see `renderStatusText` for what a reader
 * sees then.
 */
export declare const HOST_FILLED_STATUS_VARS: readonly ['speaker'];
/** Is this a status a run can carry? A locale map with an `en` string, at least. */
export declare function isStatusText(value: unknown): value is StatusText;
/** The variable names a status's text mentions, across every locale it carries. */
export declare function statusVarsMentioned(text: StatusText): string[];
/**
 * A status with the given variables filled in — for every name the text
 * mentions that its own `vars` does not already set. The text's own values
 * win: a handler that supplied a value said what it meant.
 *
 * Returns the same object when nothing changes, so a caller can dedupe by
 * identity as well as by content.
 */
export declare function fillStatusVars(text: StatusText, values: Record<string, string | number | undefined>): StatusText;
/**
 * The status as a person reads it: the requested locale, else `en`, with
 * every `{var}` the text sets substituted. A variable the text mentions and
 * nobody filled stays as written — a visible `{speaker}` mid-sentence is a
 * defect a reader can report — EXCEPT a leading `{speaker} `, which is
 * dropped rather than shown literally: a run with nobody to name (a
 * summarize, a graph build) leaves `speaker` unset by design, and "is
 * thinking" reads fine with nobody named. An empty gap elsewhere is one
 * nobody would notice.
 */
export declare function renderStatusText(text: StatusText, language?: string): string;
/** Two statuses that would render identically in every locale. */
export declare function sameStatus(a: StatusText | undefined, b: StatusText | undefined): boolean;
//# sourceMappingURL=status.d.ts.map