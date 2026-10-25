/**
 * 🚧 **Scene settings** (PROPOSAL-live-scenes §4, §5; lane D, 2026-10-13):
 * how a session's **scene boundaries** are placed while it is played, and
 * when a scene's summary runs. The genre states a default
 * (`SessionShape.scenes`); a session may override it (the app keeps the
 * override on the session row); `resolveSceneSettings` is the one cascade
 * both read through.
 *
 * Three parts:
 *
 *  · `mode` — what happens at a **boundary trigger**: `manual` (nothing; a
 *    person places every boundary), `suggested` (a quiet *New scene?* chip at
 *    the line — the app's **scene cue** — that one tap accepts or dismisses),
 *    `automatic` (the boundary is placed). Default `suggested`.
 *  · `triggers` — which deterministic signals count, none of them a model:
 *    the story clock crossed a day (`dayCrossed`), a time action moved the
 *    clock (`timeAction`), the place the genre's state names changed
 *    (`placeChanged`) — those three on by default — and, off by default, a
 *    narrator or system line (`narration`), a scene grown past `length`
 *    lines or tokens, and a real-world `pause` of some hours between lines.
 *  · `summary` — when a scene's summary runs: `onClose` (in the background
 *    the moment it closes), `onRequest` (the person presses *Summarize*; the
 *    default — the person decides when to pay), `never`.
 *
 * Nothing here moves the story clock and nothing asks a model: a trigger is
 * read off stamps and rows a person or a fixed tick already wrote.
 *
 * ⚠ Not the **story clock** (the session's present), not a **scene** (the run
 * between two boundaries) and not `SessionShape.writes.scenes` (whether a
 * genre's sessions may write scenes at all — a genre that may not is Manual
 * with nothing to place).
 *
 * Two declarations ride beside the settings, both the genre's alone (live
 * scenes §15 G1–G2, 2026-10-13):
 *
 *  · the **place** (`SessionShape.scenes.place`, `ScenePlaceDecl`) — which
 *    state key holds where the story is, so *place changed* can fire and a
 *    scene's name can carry it;
 *  · the genre's own **declared boundary triggers** (`BoundaryTriggerDecl`,
 *    ★9) — carried by its summarize-scene spec (`summarizeScene(…, {
 *    boundaries })`, on the document as `contributes.boundaryTriggers`), each
 *    a switch a session may turn off under `triggers[key]`.
 *
 * Imports nothing at run time (one erased type import), so `descriptors.ts`
 * and `widgets.ts` name these types without a cycle.
 * @ruling PROPOSAL-live-scenes ★1 (Suggested; day crossed, time action, place changed on), ★9 (2026-10-13)
 */

import type { I18n } from './i18n.js'

/** What happens at a boundary trigger. @experimental */
export const SCENE_MODES = ['manual', 'suggested', 'automatic'] as const
/** @experimental */
export type SceneMode = (typeof SCENE_MODES)[number]

/** When a scene's summary runs. @experimental */
export const SCENE_SUMMARY_MODES = ['onClose', 'onRequest', 'never'] as const
/** @experimental */
export type SceneSummaryMode = (typeof SCENE_SUMMARY_MODES)[number]

/**
 * The **boundary triggers**, in the order a settings form lists them. Each is
 * deterministic: read off message stamps, rows and the clock, never a model.
 * @experimental
 */
export const SCENE_BOUNDARY_TRIGGERS = [
	'dayCrossed',
	'timeAction',
	'placeChanged',
	'narration',
	'length',
	'pause',
] as const
/** @experimental */
export type SceneBoundaryTrigger = (typeof SCENE_BOUNDARY_TRIGGERS)[number]

/**
 * The triggers as a genre or a session declares them: a switch each, and for
 * `length` and `pause` their measure (present = on, `false` = off). A key left
 * out keeps the layer below's.
 * @experimental
 */
export interface SceneTriggersDecl {
	/** The story clock crossed a day — or a month or a year, on a coarser clock. */
	dayCrossed?: boolean
	/** A time action moved the clock (*Time passes…*, a person's step) since the line before. */
	timeAction?: boolean
	/** The place the genre's state names changed since the line before. */
	placeChanged?: boolean
	/** A narrator or system line was posted. */
	narration?: boolean
	/** The scene reached `lines` lines, or about `tokens` tokens, since it opened. */
	length?: { lines?: number; tokens?: number } | false
	/** The next line came more than `hours` real hours after the one before. */
	pause?: { hours: number } | false
	/**
	 * 🚧 A **declared boundary trigger** of the session's genre (★9), by its
	 * key: on (`true`, the default) or off. Only a session's override says
	 * these, and only for a key its genre's summarize-scene spec declares
	 * (`BoundaryTriggerDecl`); a genre's own `shape.scenes` cannot (its spec
	 * is not at hand there), so it is refused.
	 */
	[declaredKey: string]: boolean | { lines?: number; tokens?: number } | { hours: number } | undefined
}

/**
 * 🚧 Which **state key** holds where the story is (live scenes §15 G2): the
 * world's value of that slot, as a template reads it (`location` for
 * `core:slot/location@1`). The genre's alone — `SessionShape.scenes.place` —
 * and never a session's: a session cannot rename what its genre's state
 * means. With it, *place changed* fires when the value moves, and a scene's
 * name reads `Scene N · <place>`.
 * @experimental
 */
export interface ScenePlaceDecl {
	stateKey: string
}

/**
 * Scene settings as a genre (`SessionShape.scenes`) or a session declares
 * them. Every key optional: absent keeps the layer below's, and absent
 * everywhere is `DEFAULT_SCENE_SETTINGS`.
 * @experimental
 */
export interface SceneSettingsDecl {
	mode?: SceneMode
	triggers?: SceneTriggersDecl
	summary?: SceneSummaryMode
	/** 🚧 The genre's alone (`ScenePlaceDecl`): refused on a session's override. */
	place?: ScenePlaceDecl
}

/** Scene settings resolved: every key stated. `length` and `pause` are null when off. @experimental */
export interface SceneSettings {
	mode: SceneMode
	triggers: {
		dayCrossed: boolean
		timeAction: boolean
		placeChanged: boolean
		narration: boolean
		length: { lines: number | null; tokens: number | null } | null
		pause: { hours: number } | null
	}
	summary: SceneSummaryMode
}

/**
 * What a session runs on when neither its genre nor the session says
 * anything: **Suggested**, with *day crossed*, *time action* and *place
 * changed* on and the rest off; summaries **on request** (★1).
 * @experimental
 */
export const DEFAULT_SCENE_SETTINGS: SceneSettings = Object.freeze({
	mode: 'suggested',
	triggers: Object.freeze({
		dayCrossed: true,
		timeAction: true,
		placeChanged: true,
		narration: false,
		length: null,
		pause: null,
	}),
	summary: 'onRequest',
}) as SceneSettings

const isObject = (v: unknown): v is Record<string, unknown> =>
	!!v && typeof v === 'object' && !Array.isArray(v)
const isPositiveInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v > 0
const isPositive = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0

/**
 * What `sceneSettingsFindings` checks a declaration against beyond its shape.
 * @experimental
 */
export interface SceneSettingsFindingsOptions {
	/**
	 * Whose declaration it is: `genre` (the default — a genre's
	 * `shape.scenes`, an inlet's `sessionShape.scenes`) may name the
	 * **place**; a `session` override may not (the place is the genre's).
	 */
	layer?: 'genre' | 'session'
	/**
	 * 🚧 The **declared boundary trigger** keys (★9) a session's override may
	 * switch under `triggers`, each `true` or `false`: the keys its genre's
	 * summarize-scene spec declares. `'any'` reads every other key as one
	 * such switch when its value is a boolean — for a reader that holds a
	 * stored override but not the spec (it drops nothing a later read
	 * resolves). Absent: none, and an unknown key is refused.
	 */
	declaredTriggers?: readonly string[] | 'any'
}

/**
 * Every fault in one scene-settings declaration, as sentences — empty when it
 * is sound. Shared by `genre()` (a genre's `shape.scenes`) and `register()`
 * (an inlet's `sessionShape.scenes`), and by a host checking a session's
 * override before it stores it.
 *
 * A trigger key this release does not know is refused rather than ignored,
 * unless it is one of `options.declaredTriggers`: a genre's own boundary
 * trigger (a new floor, say) is declared on its summarize-scene spec
 * (`BoundaryTriggerDecl`, ★9) and only a session switches it, and a key that
 * silently did nothing would read as if it did.
 * @experimental
 */
export function sceneSettingsFindings(
	raw: unknown,
	at = 'scenes',
	options: SceneSettingsFindingsOptions = {},
): string[] {
	if (raw === undefined) return []
	const layer = options.layer ?? 'genre'
	const declared = options.declaredTriggers
	if (!isObject(raw))
		return [
			`${at}: scene settings are { mode?, triggers?, summary?${layer === 'genre' ? ', place?' : ''} } — ` +
				`mode one of ${SCENE_MODES.join(', ')}, summary one of ${SCENE_SUMMARY_MODES.join(', ')}`,
		]
	const out: string[] = []
	for (const key of Object.keys(raw))
		if (key === 'place' && layer === 'session')
			out.push(`${at}.place: the place is the genre's to name (its shape.scenes.place) — a session cannot set it`)
		else if (key !== 'mode' && key !== 'triggers' && key !== 'summary' && key !== 'place')
			out.push(`${at}.${key}: not a scene setting — the keys are mode, triggers, summary${layer === 'genre' ? ' and place' : ''}`)
	if (raw.mode !== undefined && !(SCENE_MODES as readonly unknown[]).includes(raw.mode))
		out.push(`${at}.mode: one of ${SCENE_MODES.join(', ')} — not ${JSON.stringify(raw.mode)}`)
	if (raw.summary !== undefined && !(SCENE_SUMMARY_MODES as readonly unknown[]).includes(raw.summary))
		out.push(`${at}.summary: one of ${SCENE_SUMMARY_MODES.join(', ')} — not ${JSON.stringify(raw.summary)}`)
	if (layer === 'genre' && raw.place !== undefined) out.push(...scenePlaceFindings(raw.place, `${at}.place`))
	const t = raw.triggers
	if (t !== undefined) {
		if (!isObject(t)) out.push(`${at}.triggers: an object of boundary triggers — ${SCENE_BOUNDARY_TRIGGERS.join(', ')}`)
		else
			for (const [key, value] of Object.entries(t)) {
				const where = `${at}.triggers.${key}`
				if (!(SCENE_BOUNDARY_TRIGGERS as readonly string[]).includes(key)) {
					const switchable = declared === 'any' || (Array.isArray(declared) && declared.includes(key))
					if (switchable && (value === undefined || typeof value === 'boolean')) continue
					if (switchable) {
						out.push(`${where}: a declared trigger is on or off — true or false, not ${JSON.stringify(value)}`)
						continue
					}
					out.push(
						`${where}: not a boundary trigger — one of ${SCENE_BOUNDARY_TRIGGERS.join(', ')}` +
							(Array.isArray(declared) && declared.length ? `, or this genre's own: ${declared.join(', ')}` : '') +
							`. A genre's own trigger is declared on its summarize-scene spec (summarizeScene(…, { boundaries })), ` +
							`and only a session's override switches it`,
					)
					continue
				}
				if (value === undefined) continue
				if (key === 'length') {
					if (value === false) continue
					if (!isObject(value)) {
						out.push(`${where}: false, or { lines?, tokens? } — at least one, each a whole number above 0`)
						continue
					}
					const { lines, tokens, ...rest } = value
					if (Object.keys(rest).length) out.push(`${where}: only lines and tokens — not ${Object.keys(rest).join(', ')}`)
					if (lines === undefined && tokens === undefined)
						out.push(`${where}: say lines, tokens or both — or false for off`)
					if (lines !== undefined && !isPositiveInt(lines)) out.push(`${where}.lines: a whole number above 0`)
					if (tokens !== undefined && !isPositiveInt(tokens)) out.push(`${where}.tokens: a whole number above 0`)
					continue
				}
				if (key === 'pause') {
					if (value === false) continue
					if (!isObject(value) || !isPositive(value.hours) || Object.keys(value).length !== 1)
						out.push(`${where}: false, or { hours } — a number of real hours above 0`)
					continue
				}
				if (typeof value !== 'boolean') out.push(`${where}: true or false — not ${JSON.stringify(value)}`)
			}
	}
	return out
}

/** A template's word for a state value: `location`, `core_location`. */
const STATE_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/

/** Every fault in a `place` declaration, as sentences. @internal */
function scenePlaceFindings(raw: unknown, at: string): string[] {
	if (!isObject(raw) || typeof raw.stateKey !== 'string')
		return [`${at}: { stateKey } — the state key that holds where the story is, e.g. { stateKey: 'location' }`]
	const out: string[] = []
	for (const key of Object.keys(raw))
		if (key !== 'stateKey') out.push(`${at}.${key}: only stateKey — not ${key}`)
	if (!STATE_KEY.test(raw.stateKey))
		out.push(`${at}.stateKey: a state key as a template reads it (letters, digits, _) — not ${JSON.stringify(raw.stateKey)}`)
	return out
}

/**
 * 🚧 The place a genre's shape names (`shape.scenes.place`), or null — what a
 * host reads to know which state key is where the story is (live scenes §15
 * G2). Takes `unknown` on purpose, as `resolveSceneSettings` does: a shape
 * from a stored row whose place does not read names none.
 * @experimental
 */
export function declaredScenePlace(shape: unknown): ScenePlaceDecl | null {
	const scenes = isObject(shape) ? shape.scenes : undefined
	const place = isObject(scenes) ? scenes.place : undefined
	if (place === undefined || scenePlaceFindings(place, 'place').length) return null
	return { stateKey: (place as { stateKey: string }).stateKey }
}

/**
 * A shape's `scenes` refused with its sentences — at the declaration, where
 * the author is, as `assertSessionWrites` refuses `writes`.
 * @experimental
 */
export function assertSceneSettings(shape: { scenes?: unknown } | undefined, who: string): void {
	const findings = sceneSettingsFindings(shape?.scenes, `${who}.scenes`)
	if (findings.length) throw new Error(findings.join('\n'))
}

/** One layer laid over the resolved settings below it; a part it cannot read is skipped. */
function overlay(base: SceneSettings, raw: unknown): SceneSettings {
	if (!isObject(raw)) return base
	const out: SceneSettings = { ...base, triggers: { ...base.triggers } }
	if ((SCENE_MODES as readonly unknown[]).includes(raw.mode)) out.mode = raw.mode as SceneMode
	if ((SCENE_SUMMARY_MODES as readonly unknown[]).includes(raw.summary))
		out.summary = raw.summary as SceneSummaryMode
	const t = raw.triggers
	if (isObject(t)) {
		for (const key of ['dayCrossed', 'timeAction', 'placeChanged', 'narration'] as const)
			if (typeof t[key] === 'boolean') out.triggers[key] = t[key] as boolean
		if (t.length === false) out.triggers.length = null
		else if (isObject(t.length)) {
			const lines = isPositiveInt(t.length.lines) ? t.length.lines : null
			const tokens = isPositiveInt(t.length.tokens) ? t.length.tokens : null
			out.triggers.length = lines !== null || tokens !== null ? { lines, tokens } : null
		}
		if (t.pause === false) out.triggers.pause = null
		else if (isObject(t.pause) && isPositive(t.pause.hours)) out.triggers.pause = { hours: t.pause.hours }
	}
	return out
}

/**
 * The cascade: the session's own (`session`), else the genre's
 * (`shape.scenes`), else `DEFAULT_SCENE_SETTINGS` — part by part, so a
 * session that says only `summary` keeps its genre's mode and triggers.
 *
 * Pure, and takes `unknown` on purpose: a host reads a shape that arrived from
 * a stored registry row and an override from a stored session row, not typed
 * declarations. Whatever cannot be read falls through to the layer below —
 * the "a policy that cannot be read refuses nothing" posture `resolveWrites`
 * keeps.
 * @experimental
 */
export function resolveSceneSettings(shape: unknown, session?: unknown): SceneSettings {
	const declared = isObject(shape) ? shape.scenes : undefined
	return overlay(overlay(DEFAULT_SCENE_SETTINGS, declared), session)
}

/**
 * The resolved settings as a declaration again — what a host stores as a
 * session's override when a person saves the settings form. `declared` is
 * the switch of each **declared boundary trigger** (`declaredTriggerStates`),
 * written beside the core ones under `triggers`.
 * @experimental
 */
export function sceneSettingsDecl(
	settings: SceneSettings,
	declared?: Readonly<Record<string, boolean>>,
): SceneSettingsDecl {
	const t = settings.triggers
	return {
		mode: settings.mode,
		summary: settings.summary,
		triggers: {
			dayCrossed: t.dayCrossed,
			timeAction: t.timeAction,
			placeChanged: t.placeChanged,
			narration: t.narration,
			length: t.length
				? {
						...(t.length.lines !== null ? { lines: t.length.lines } : {}),
						...(t.length.tokens !== null ? { tokens: t.length.tokens } : {}),
					}
				: false,
			pause: t.pause ? { hours: t.pause.hours } : false,
			...(declared ?? {}),
		},
	}
}

// ── 🚧 Declared boundary triggers (★9, live scenes §15 G1) ──────────────────

/**
 * Who voiced a line, as a declared trigger's `speaker` reads it:
 *
 *  · `person` — a person's own line (role `user`, under a persona or not);
 *  · `character` — a cast member's line (a character's, not a narration);
 *  · `narrator` — the story's own voice: a narrator response, a system line,
 *    an envoy's line or the pipeline's own voice (the Lair's Castellan).
 * @experimental
 */
export const BOUNDARY_TRIGGER_SPEAKERS = ['person', 'character', 'narrator'] as const
/** @experimental */
export type BoundaryTriggerSpeaker = (typeof BOUNDARY_TRIGGER_SPEAKERS)[number]

/** The predicates a declared boundary trigger may state, in the order a sentence names them. @experimental */
export const BOUNDARY_TRIGGER_PREDICATES = ['channel', 'narration', 'speaker', 'actionKey', 'stateKey'] as const

/**
 * 🚧 When a **declared boundary trigger** fires — every predicate stated must
 * hold of the landed line (all of them, never any), and at least one is
 * stated. Each is deterministic: read off the line's row, the run that wrote
 * it and the state ledger, never a model.
 * @experimental
 */
export interface BoundaryTriggerWhen {
	/**
	 * The line lands on this channel: a slug (`sanctum`) is every lane of it,
	 * a lane (`sanctum:2`) that one. Must be a channel the genre declares. A
	 * channel other than `main` is watched for this trigger alone.
	 */
	channel?: string
	/** The line is (`true`) or is not (`false`) a narrator or system line — the core *narration* trigger's test. */
	narration?: boolean
	/** Who voiced the line (`BOUNDARY_TRIGGER_SPEAKERS`). */
	speaker?: BoundaryTriggerSpeaker
	/** The line was written by a run of the composer action with this key (`trigger-trap`, `acme.roll`). */
	actionKey?: string
	/** This state key's value on the world (`floor`, as a template reads it) changed since the line before. */
	stateKey?: string
}

/**
 * 🚧 A genre's own **boundary trigger** (★9, ruled 2026-10-13): declared on
 * its summarize-scene spec (`summarizeScene(…, { boundaries })`), read by
 * the host's boundary watcher beside core's (`SCENE_BOUNDARY_TRIGGERS`), and
 * listed in session settings as one more switch, on by default.
 *
 *  · `key` — its address: the cue's trigger and the session's
 *    `triggers[key]` switch. camelCase, never a core trigger's key.
 *  · `label` — what the chip says after *New scene? —*, and the switch's
 *    words: *the party reached a new floor*.
 *  · `when` — the predicates (`BoundaryTriggerWhen`).
 *
 * ⚠ Not an entry's **trigger** (a lore keyword) and not a run's start: it
 * places nothing on its own — the session's scene mode decides (Suggested
 * cues it, Automatic places it, Manual ignores it).
 * @experimental
 */
export interface BoundaryTriggerDecl {
	key: string
	label: I18n
	when: BoundaryTriggerWhen
}

/** A declared trigger's key: camelCase, like core's. */
const TRIGGER_KEY = /^[a-z][A-Za-z0-9]{0,39}$/
/** An action key, a plugin's namespaced: `trigger-trap`, `acme.roll`. */
const ACTION_KEY = /^[a-z0-9][a-z0-9._-]{0,79}$/
/**
 * 🚧 The scene cue trigger the **judged scene check** leaves (pass 7, R-i, sprint 2) — not a
 * setting: the sweep's *Notice when the scene moves on* duty is. Its cue's words are the
 * model's reason ("the party left the inn"). Reserved: no genre declares a trigger by this key.
 * @experimental
 * @ruling R-i (2026-10-24)
 */
export const JUDGED_SCENE_TRIGGER = 'judged'

/** Core's trigger keys and the cue triggers no setting switches (`endedHere`, `judged`). */
const RESERVED_TRIGGER_KEYS: ReadonlySet<string> = new Set([...SCENE_BOUNDARY_TRIGGERS, 'endedHere', JUDGED_SCENE_TRIGGER])

const isDisplayText = (v: unknown): boolean =>
	(typeof v === 'string' && v.trim() !== '') ||
	(isObject(v) &&
		typeof v.en === 'string' &&
		v.en.trim() !== '' &&
		Object.values(v).every((x) => typeof x === 'string'))

/**
 * Every fault in a list of declared boundary triggers, as sentences — empty
 * when it is sound. `channels` are the slugs the genre declares; given, a
 * `channel` predicate must name one of them (a trigger on a channel the
 * genre does not have would never fire). Used by the builder, where the
 * author is, and by a host reading a stored document.
 * @experimental
 */
export function boundaryTriggerFindings(
	raw: unknown,
	at = 'boundaries',
	options: { channels?: readonly string[] } = {},
): string[] {
	if (raw === undefined) return []
	if (!Array.isArray(raw))
		return [`${at}: a list of boundary triggers — [{ key, label, when: { ${BOUNDARY_TRIGGER_PREDICATES.join('?, ')}? } }]`]
	const out: string[] = []
	const seen = new Set<string>()
	raw.forEach((entry, i) => {
		const here = `${at}[${isObject(entry) && typeof entry.key === 'string' ? entry.key : i}]`
		if (!isObject(entry)) {
			out.push(`${here}: { key, label, when }`)
			return
		}
		for (const k of Object.keys(entry))
			if (k !== 'key' && k !== 'label' && k !== 'when') out.push(`${here}.${k}: not part of a boundary trigger — key, label and when`)
		const key = entry.key
		if (typeof key !== 'string' || !TRIGGER_KEY.test(key))
			out.push(`${here}.key: camelCase letters and digits, starting lower-case (newFloor) — not ${JSON.stringify(key)}`)
		else if (RESERVED_TRIGGER_KEYS.has(key))
			out.push(`${here}.key: '${key}' is core's own trigger — name the genre's something else`)
		else if (seen.has(key)) out.push(`${here}.key: '${key}' is declared twice`)
		else seen.add(key)
		if (!isDisplayText(entry.label))
			out.push(`${here}.label: display text — what the chip says after "New scene? —", e.g. 'the party reached a new floor'`)
		const when = entry.when
		if (!isObject(when)) {
			out.push(`${here}.when: { ${BOUNDARY_TRIGGER_PREDICATES.join('?, ')}? } — at least one`)
			return
		}
		const stated = Object.keys(when).filter((k) => when[k] !== undefined)
		if (!stated.length) out.push(`${here}.when: state at least one of ${BOUNDARY_TRIGGER_PREDICATES.join(', ')}`)
		for (const k of stated) {
			const v = when[k]
			const where = `${here}.when.${k}`
			if (!(BOUNDARY_TRIGGER_PREDICATES as readonly string[]).includes(k)) {
				out.push(`${where}: not a predicate — one of ${BOUNDARY_TRIGGER_PREDICATES.join(', ')}, each read off the line, never a model`)
				continue
			}
			if (k === 'channel') {
				if (typeof v !== 'string' || !v.trim()) {
					out.push(`${where}: a channel slug — 'main', 'sanctum', or a lane such as 'sanctum:2'`)
					continue
				}
				const slug = v.split(':')[0]!
				if (options.channels && !options.channels.includes(slug))
					out.push(`${where}: '${v}' is not a channel the genre declares (${options.channels.join(', ')}) — the trigger would never fire`)
			} else if (k === 'narration') {
				if (typeof v !== 'boolean') out.push(`${where}: true or false — not ${JSON.stringify(v)}`)
			} else if (k === 'speaker') {
				if (!(BOUNDARY_TRIGGER_SPEAKERS as readonly unknown[]).includes(v))
					out.push(`${where}: one of ${BOUNDARY_TRIGGER_SPEAKERS.join(', ')} — not ${JSON.stringify(v)}`)
			} else if (k === 'actionKey') {
				if (typeof v !== 'string' || !ACTION_KEY.test(v))
					out.push(`${where}: an action's key, as its spec declares it ('trigger-trap', 'acme.roll') — not ${JSON.stringify(v)}`)
			} else if (k === 'stateKey') {
				if (typeof v !== 'string' || !STATE_KEY.test(v))
					out.push(`${where}: a state key as a template reads it ('floor') — not ${JSON.stringify(v)}`)
			}
		}
	})
	return out
}

/**
 * The declared boundary triggers a stored spec document carries
 * (`contributes.boundaryTriggers`), each checked on its own: one that does
 * not read is left out rather than refusing the rest, and a key met twice
 * keeps its first. What a host's boundary watcher and settings form read.
 * @experimental
 */
export function boundaryTriggersOf(contributes: unknown): BoundaryTriggerDecl[] {
	const list = isObject(contributes) ? contributes.boundaryTriggers : undefined
	if (!Array.isArray(list)) return []
	const out: BoundaryTriggerDecl[] = []
	const seen = new Set<string>()
	for (const entry of list) {
		if (boundaryTriggerFindings([entry]).length) continue
		const t = entry as BoundaryTriggerDecl
		if (seen.has(t.key)) continue
		seen.add(t.key)
		out.push({ key: t.key, label: t.label, when: { ...t.when } })
	}
	return out
}

/**
 * Each declared trigger's switch for one session: on, unless the session's
 * override (`triggers[key]`) says `false`. Like `resolveSceneSettings`, it
 * takes the override as `unknown` and skips what it cannot read.
 * @experimental
 */
export function declaredTriggerStates(
	declared: ReadonlyArray<{ key: string }>,
	session?: unknown,
): Record<string, boolean> {
	const t = isObject(session) && isObject(session.triggers) ? session.triggers : {}
	const out: Record<string, boolean> = {}
	for (const { key } of declared) out[key] = typeof t[key] === 'boolean' ? (t[key] as boolean) : true
	return out
}
