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

import { i18nText, isI18n, localeMapOf, type I18n, type LocaleMap } from './i18n.js'

/**
 * One status: display text (R-20 — a string or a locale map with `en`), and
 * the values its `{vars}` take. A bare string is `en`, so `ctx.status({ i18n:
 * '{speaker} is thinking' })` is the short spelling of the map form.
 * @experimental
 */
export interface StatusText {
	i18n: I18n
	vars?: Record<string, string | number>
}

/**
 * A grey widget action's reason, as the host lists it (`WidgetAction.reason`):
 * a locale map, never a bare string.
 *
 * Declared here beside `StatusText` rather than in `widgets.ts` beside
 * `WidgetAction`, because the API reference's anchor for the property
 * `WidgetAction.reason` and for an interface named `WidgetActionReason` on the
 * same page are one slug (`widgetactionreason`) — TypeDoc then links this type
 * as `#widgetactionreason-1`, which is no heading, and the docs site refuses
 * the dead link.
 * @experimental
 */
export interface WidgetActionReason extends StatusText {
	i18n: LocaleMap
}

/**
 * The receipt's one record of a status — the last one set, and the node that
 * set it — present only when the run ended `halt`, `err` or `cancelled`
 * (R-21, "optional, taken"). Never on an `ok` receipt, and never a node row.
 * @experimental
 */
export interface LastStatus {
	nodeKey: string
	text: StatusText
}

/**
 * The variables a host fills, by name, when a status's text mentions them and
 * the handler did not supply a value. One entry: `speaker` — the display name
 * of the run's speaker (a character's or an envoy's), which the handler cannot
 * know and the host always can. A text naming `{speaker}` on a run with no
 * speaker keeps the variable unset; see `renderStatusText` for what a reader
 * sees then.
 * @experimental
 */
export const HOST_FILLED_STATUS_VARS = ['speaker'] as const

/** `{name}` — one variable placeholder, as every locale of a status spells it. */
const VAR_PATTERN = /\{([A-Za-z_][A-Za-z0-9_]*)\}/g

/**
 * Is this a status a run can carry? `i18n` is display text a publish accepts
 * (R-20): a non-blank string, or a locale map whose `en` is non-blank. The
 * executor drops a status that is not, with a note on the receipt — a status
 * is advisory and never halts a run.
 * @internal
 */
export function isStatusText(value: unknown): value is StatusText {
	if (!value || typeof value !== 'object') return false
	return isI18n((value as { i18n?: unknown }).i18n)
}

/** The variable names a status's text mentions, across every locale it carries. @internal */
export function statusVarsMentioned(text: StatusText): string[] {
	const names = new Set<string>()
	for (const template of Object.values(localeMapOf(text.i18n))) {
		if (typeof template !== 'string') continue
		for (const m of template.matchAll(VAR_PATTERN)) names.add(m[1]!)
	}
	return [...names]
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
export function fillStatusVars(
	text: StatusText,
	values: Record<string, string | number | undefined>,
): StatusText {
	const mentioned = statusVarsMentioned(text)
	const added: Record<string, string | number> = {}
	for (const name of mentioned) {
		if (text.vars && name in text.vars) continue
		const v = values[name]
		if (v === undefined) continue
		added[name] = v
	}
	if (Object.keys(added).length === 0) return text
	return { ...text, vars: { ...(text.vars ?? {}), ...added } }
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
export function renderStatusText(text: StatusText, language = 'en'): string {
	const template = i18nText(text.i18n, language) ?? ''
	const vars = text.vars ?? {}
	const withoutUnfilledSpeaker =
		!('speaker' in vars) && template.startsWith('{speaker} ')
			? template.slice('{speaker} '.length)
			: template
	return withoutUnfilledSpeaker.replace(VAR_PATTERN, (whole, name: string) =>
		name in vars ? String(vars[name]) : whole,
	)
}

/** Two statuses that would render identically in every locale. @internal */
export function sameStatus(a: StatusText | undefined, b: StatusText | undefined): boolean {
	if (a === b) return true
	if (!a || !b) return false
	return sameLocaleMap(localeMapOf(a.i18n), localeMapOf(b.i18n)) && sameVars(a.vars, b.vars)
}

/** Same locale map — order-independent, like `sameVars` (a rebuilt object must still match). */
function sameLocaleMap(a: LocaleMap, b: LocaleMap): boolean {
	const ka = Object.keys(a).sort()
	const kb = Object.keys(b).sort()
	if (ka.length !== kb.length) return false
	return ka.every((k, i) => k === kb[i] && a[k] === b[k])
}

function sameVars(
	a: Record<string, string | number> | undefined,
	b: Record<string, string | number> | undefined,
): boolean {
	const ka = Object.keys(a ?? {}).sort()
	const kb = Object.keys(b ?? {}).sort()
	if (ka.length !== kb.length) return false
	return ka.every((k, i) => k === kb[i] && a![k] === b![k])
}
