/**
 * Predicates — one declared shape, read in two places (plans/29 R-15
 * *enabled-when*; 20 §10 *junction*; ruled 2026-09-15, built 2026-09-17 as
 * U5e).
 *
 * A **junction** clause branches on a value a task computed: each branch is
 * `{ path?, equals? | equalsPath? | truthy? }` over that value. An action's
 * **enabled-when** is the same predicate over the session's **published
 * values** — the document a host builds from what a session has already said
 * about itself (`state.world.location`, `session.generating`, a message's
 * `item.hidden`). The core here — `readPath` and `predicateHolds` — is what
 * both read, so a predicate that fires a branch and one that greys a button
 * can never mean two things.
 *
 * ## The two-port compare (D-4a, 2026-09-17)
 *
 * `equals` takes a literal, so until this the grammar could ask *is the
 * accused Vell?* and never *is the accused the culprit?* — and a genre that
 * derives a hidden fact rather than authoring it has no other question.
 * `equalsPath` is the second path: the same document, read twice, compared
 * strictly. Additive in the single-version sense (ruling 2026-09-08) — a
 * stored document without it validates and hashes exactly as before. Both
 * doors read it: the junction's `fires()` hands the routed value in as the
 * scope, an enabled-when's evaluator hands in the published values.
 *
 * ## What an enabled-when is not
 *
 * Not a port reference: `on` is a dotted path into the published values,
 * never `$.parse.call` — an action lives outside a run, and there is no port
 * to read. Not code: a richer decision belongs in a task the junction reads,
 * or in a value the state-keeper publishes. And not the field-level
 * `ValuePredicate` of `values.ts`, which gates one settings-form field on a
 * sibling field's value.
 */

import type { I18n, LocaleMap } from './descriptors.js'
import { i18nFindings, localeMapOf } from './i18n.js'

/** The junction's truthiness: a value that is not falsy and not an empty list. @experimental */
export const truthy = (v: unknown): boolean => !!v && !(Array.isArray(v) && v.length === 0)

/**
 * The value at a dotted path, or `undefined` where the path leaves the
 * document — a missing segment answers `undefined`, never a throw. An absent
 * or empty path is the value itself (a junction branch with no `path` reads
 * the routed value whole). It walks any key at evaluation, on purpose: the
 * junction shares this walker over data a task computed, and the segments a
 * published-values path may not name (`__proto__`, `constructor`,
 * `prototype`) are refused at declaration by `enabledWhenFindings`, not here.
 * @experimental
 */
export function readPath(value: unknown, path?: string): unknown {
	if (!path) return value
	let cur: any = value
	for (const seg of path.split('.')) {
		if (cur == null) return undefined
		cur = cur[seg]
	}
	return cur
}

/** The predicate half of a junction branch and of an enabled-when: exactly one of the three. @experimental */
export interface Predicate {
	/** Holds when the value strictly equals this literal. */
	equals?: unknown
	/**
	 * Holds when the value strictly equals **the value at another path in the
	 * same document** — the two-port compare (D-4a, 2026-09-17).
	 *
	 * `equals` takes a literal, so a document could state *is the accused
	 * Vell?* and never *is the accused the culprit?* — which is the one
	 * question a genre that DERIVES a hidden fact has to ask, and the reason
	 * Whodunit could not adjudicate its own case. The other side is read out
	 * of the same document the subject was: the junction's routed value for a
	 * branch, the published values for an enabled-when.
	 *
	 * ⚠ **Two absences are not a match.** A path that leaves the document
	 * answers `undefined`, and if that counted as equal to an absent subject
	 * then an unwired port on each side would fire the branch that means *the
	 * accused IS the culprit*. Either side absent holds for nothing.
	 *
	 * Strict (`===`) like `equals`, so it compares a key and not a document:
	 * two structurally equal objects are not equal here, and a structured
	 * comparison belongs in a value the pipeline publishes as one.
	 */
	equalsPath?: string
	/** Holds when the value is truthy (`truthy`). */
	truthy?: boolean
}

/**
 * The conditions a predicate may state — **exactly one**, wherever it is read.
 *
 * Exported because the junction's own validator asks the same question of a
 * branch (`validate.ts`) and asked it off a literal list; one list is what
 * keeps a grammar that grew a third condition from being legal in one door
 * and refused at the other.
 * @experimental
 */
export const PREDICATE_CONDITION_KEYS: readonly string[] = ['equals', 'equalsPath', 'truthy']

/**
 * Does the predicate hold over this value? `equals` is strict (`===`);
 * `equalsPath` is that same strictness against the value at another path in
 * `scope` — the document the subject itself was read from — and holds for
 * nothing when either side is absent; `truthy` is the junction's truthiness;
 * a predicate stating none of the three holds for nothing — the validators
 * refuse one, but a stored document is judged by what it says.
 *
 * `scope` is optional so that every caller written before the two-port
 * compare still compiles. A caller that does not pass it has no second side
 * to read, so an `equalsPath` predicate holds for nothing there — the same
 * answer an absent path gives, and never a silent `true`.
 * @internal
 */
export function predicateHolds(pred: Predicate, value: unknown, scope?: unknown): boolean {
	if (pred.equals !== undefined) return value === pred.equals
	if (pred.equalsPath !== undefined) {
		// A stored document is judged by what it says, and what it says may be
		// wrong: `equalsPath: 3` reaches `readPath` as a number and `3.split`
		// throws, which would take a whole listing down rather than grey one
		// button. The validators refuse it at the door; here it simply does
		// not hold, on the same rule `normalizeEnabledWhen` drops a malformed
		// entry by.
		if (typeof pred.equalsPath !== 'string' || !pred.equalsPath) return false
		if (value === undefined) return false
		const other = readPath(scope, pred.equalsPath)
		return other !== undefined && value === other
	}
	if (pred.truthy) return truthy(value)
	return false
}

/* ── enabled-when ──────────────────────────────────────────────────────── */

/**
 * One enabled-when predicate (plans/29 R-15): a declared condition over the
 * session's published values that says whether an action is offered *now*.
 * The junction clause's predicate shape, never code.
 *
 * A host publishes, per listing: `state.world.<slot>` and
 * `state.cast.<key>.<slot>` (the resolved state), `session.fields.<key>`
 * (the genre's fields as stored) and `session.generating`; and, for the
 * `message` venue, `item.<field>` per message — `item.id`, `item.isNewest`,
 * `item.hidden`, `item.generating`, `item.role`, `item.mine`,
 * `item.hasSwipes`, `item.greeting`, `item.channel`, `item.speaker` (a
 * participant reference, or null) and `item.characterLine` (lair re-plan
 * R11). A predicate over `item.*` is evaluated
 * where a message is at hand: the client per row, the server at the door.
 * @experimental
 */
export interface EnabledWhen extends Predicate {
	/**
	 * A dotted path into the published values — `state.world.location`,
	 * `session.generating`, `item.hidden`. **Not a port reference** (no `$`):
	 * actions live outside a run.
	 */
	on: string
	/** Why the control is grey when this predicate does not hold. Required (R-20: a string or a locale map with `en`). */
	reason: I18n
}

/** The keys an enabled-when may carry; anything else is a finding. @experimental */
export const ENABLED_WHEN_KEYS: readonly string[] = [
	'on',
	...PREDICATE_CONDITION_KEYS,
	'reason',
]

/** Segments an `on` path may not walk: a published-values path names data, never a prototype. */
const FORBIDDEN_SEGMENTS: ReadonlySet<string> = new Set(['__proto__', 'constructor', 'prototype'])

/** What `equals` may compare against — a JSON scalar. */
const isPrimitive = (v: unknown): boolean =>
	v === null || ['string', 'number', 'boolean'].includes(typeof v)

/** A single predicate or a list — a list means **all must hold**. @experimental */
export type EnabledWhenDecl = EnabledWhen | EnabledWhen[]

/**
 * The verdict over one predicate set: enabled, or the first predicate that
 * failed with its reason — a locale map, whatever spelling the author used.
 * @experimental
 */
export type EnabledWhenVerdict =
	{ enabled: true } | { enabled: false; reason: LocaleMap; failed: EnabledWhen }

// `localeMapOf` and `i18nFindings` live in `i18n.ts` with the type they read;
// re-exported here because the enabled-when vocabulary has always offered them.
export { i18nFindings, localeMapOf }

/** A value with the one field a predicate cannot do without — the shape the list form keeps. @experimental */
export const isEnabledWhenShaped = (p: unknown): p is EnabledWhen =>
	!!p &&
	typeof p === 'object' &&
	!Array.isArray(p) &&
	typeof (p as { on?: unknown }).on === 'string'

/**
 * The list form: a single predicate wrapped, a list copied, `reason` as a
 * locale map, nothing else touched. Absent is the empty list — an action
 * declaring no predicate is always enabled. An entry that is not a
 * predicate at all — no string `on` — is dropped here rather than read: a
 * stored document from before this shape must not take a listing down, and
 * `enabledWhenFindings` names the entry wherever the declaration is judged
 * (construction, `validate()`, the host's publish).
 * @internal
 */
export function normalizeEnabledWhen(x: unknown): EnabledWhen[] {
	if (x == null) return []
	const list = Array.isArray(x) ? x : [x]
	return list.filter(isEnabledWhenShaped).map((p) => ({
		...p,
		reason: p.reason === undefined ? p.reason : localeMapOf(p.reason),
	}))
}

/**
 * Evaluate a predicate set over a published-values document: every
 * predicate must hold, and the **first** that does not names the reason —
 * the order the author wrote them in is the order a person is told them in.
 * Pure and isomorphic: the client runs it per message row with the same
 * `item` document the server builds at the door.
 * @experimental
 */
export function evaluateEnabledWhen(
	preds: ReadonlyArray<EnabledWhen> | EnabledWhen | undefined | null,
	doc: unknown,
): EnabledWhenVerdict {
	for (const pred of normalizeEnabledWhen(preds)) {
		// The whole document travels beside the subject: `equalsPath` reads its
		// other side out of the same published values `on` was read from.
		if (predicateHolds(pred, readPath(doc, pred.on), doc)) continue
		return { enabled: false, reason: localeMapOf(pred.reason), failed: pred }
	}
	return { enabled: true }
}

/** The predicates over one prefix (`item`) and the rest, split for a host that evaluates them in two places. @internal */
export function partitionEnabledWhen(
	preds: ReadonlyArray<EnabledWhen>,
	prefix: string,
): { under: EnabledWhen[]; rest: EnabledWhen[] } {
	const under: EnabledWhen[] = []
	const rest: EnabledWhen[] = []
	for (const p of preds) (p.on === prefix || p.on.startsWith(`${prefix}.`) ? under : rest).push(p)
	return { under, rest }
}

/**
 * Every fault in one enabled-when declaration — a predicate or a list — as
 * sentences that say what to do instead (the teaching-error pattern, 15
 * §1.3). Empty when it is sound, and for `undefined` (no predicate). Applied
 * to an action's `enabledWhen` at construction, in `validate()` and at the
 * host's publish, and to a genre's defaults at declaration.
 * @experimental
 */
export function enabledWhenFindings(raw: unknown, at = 'enabledWhen'): string[] {
	if (raw === undefined || raw === null) return []
	const list = Array.isArray(raw) ? raw : [raw]
	const out: string[] = []
	list.forEach((p, i) => {
		const where = Array.isArray(raw) ? `${at}[${i}]` : at
		if (!p || typeof p !== 'object' || Array.isArray(p)) {
			out.push(
				`${where}: an enabled-when is { on, equals | truthy, reason } — a predicate over ` +
					`the session's published values, such as { on: 'state.world.location', truthy: true, ` +
					`reason: { en: 'Set a location first' } }`,
			)
			return
		}
		const e = p as Record<string, unknown>
		if (typeof e.on !== 'string' || !e.on)
			out.push(
				`${where}: 'on' is required — a published-values path such as 'state.world.location' ` +
					`or 'session.generating' (never a port reference: actions live outside a run)`,
			)
		else if (e.on.startsWith('$'))
			out.push(
				`${where}: 'on' is '${e.on}', which reads as a port reference — an enabled-when names ` +
					`a published-values path such as 'state.world.location'; actions live outside a run ` +
					`and have no ports to read`,
			)
		else {
			const walked = e.on.split('.').find((seg) => FORBIDDEN_SEGMENTS.has(seg))
			if (walked)
				out.push(
					`${where}: 'on' walks '${walked}' — a published-values path names data ` +
						`('state.world.location', 'item.hidden'), never a prototype`,
				)
		}
		const stated = PREDICATE_CONDITION_KEYS.filter((k) => e[k] !== undefined)
		if (stated.length !== 1)
			out.push(
				`${where}: states ${stated.length || 'no'} conditions — exactly one of ` +
					`${PREDICATE_CONDITION_KEYS.join(' / ')} per predicate (the junction rule, 20 ` +
					`§10); a richer decision belongs in a value the pipeline publishes`,
			)
		if (e.truthy !== undefined && typeof e.truthy !== 'boolean')
			out.push(`${where}: 'truthy' is a boolean — write truthy: true`)
		else if (e.truthy === false)
			out.push(
				`${where}: 'truthy: false' states nothing — write truthy: true to require a value, ` +
					`or equals: false to require a false one`,
			)
		if (e.equals !== undefined && !isPrimitive(e.equals))
			out.push(
				`${where}: 'equals' is a primitive — a string, number, boolean or null; a structured ` +
					`comparison belongs in a value the pipeline publishes as one`,
			)
		// The other side of a two-port compare is a path, judged exactly as `on`
		// is: it names data in the same document, never a port and never a
		// prototype. Refused when it is not a string at all — `equalsPath: 3`
		// would otherwise read as a comparison against nothing and quietly
		// never hold.
		if (e.equalsPath !== undefined) {
			if (typeof e.equalsPath !== 'string' || !e.equalsPath)
				out.push(
					`${where}: 'equalsPath' is a path, not a value — the OTHER side of the ` +
						`comparison, read from the same document as 'on' (e.g. ` +
						`'state.world.culprit'); to compare against a literal, write equals:`,
				)
			else if (e.equalsPath.startsWith('$'))
				out.push(
					`${where}: 'equalsPath' is '${e.equalsPath}', which reads as a port reference — ` +
						`it names a published-values path exactly as 'on' does; actions live ` +
						`outside a run and have no ports to read`,
				)
			else {
				const walkedOther = e.equalsPath.split('.').find((seg) => FORBIDDEN_SEGMENTS.has(seg))
				if (walkedOther)
					out.push(
						`${where}: 'equalsPath' walks '${walkedOther}' — a published-values path ` +
							`names data ('state.world.location', 'item.hidden'), never a prototype`,
					)
			}
		}
		if (e.reason === undefined)
			out.push(
				`${where}: 'reason' is required — why the control is grey when the predicate does not ` +
					`hold, a locale map with 'en' (R-20)`,
			)
		// The reason's text is display text and gets R-20's one sentence, a
		// blank one included (01 §13: one verdict per law, `core:verdict/i18n`).
		else out.push(...i18nFindings(e.reason, `${where}.reason`))
		for (const k of Object.keys(e))
			if (!ENABLED_WHEN_KEYS.includes(k))
				out.push(
					`${where}: '${k}' is not part of an enabled-when — one of ${ENABLED_WHEN_KEYS.join(', ')}`,
				)
	})
	return out
}
