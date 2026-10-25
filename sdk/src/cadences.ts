/**
 * 🚧 **Cadences** — when a routine runs (R5, R9, R10, R15–R21; PLAN-layering D2).
 *
 * A routine is a pipeline registered on a **cadence**: a declared condition
 * that answers one thing — due or not — and passes **no data of its own**
 * (R9). The host evaluates a cadence only at the **events** it **wakes on**
 * (D11, 2026-10-23: they are events, never "moments") — a turn ended, a
 * round ended, a scene opened or closed, the story clock moved, the
 * 5-minute system tick, or any session event (`ANY_EVENT`: `onEvent`,
 * `whenValue`) — so a cadence that is not due costs nothing.
 *
 * Every cadence is declared once, globally, with a stable id
 * (`core:cadence/every-n-turns@1`) and **options** declared as fields, so a
 * registration states it as `{ id, options }` (a `CadenceRef`): addressable,
 * serializable, validated by the same field declarations an administrator's
 * settings use (§11-3). Core's ten are evaluated natively by the host
 * (`evaluate: 'host'`); a plugin's cadence is a script of kind
 * `core:script:cadence/due@1`, run in the sandbox.
 *
 * The pure due-functions live here, so the host and an author's test agree:
 * `cadenceDue(ref, event, state)` answers one event and returns the state
 * to keep (a cron's next time, a value's last answer), and
 * `simulateCadence(ref, events)` drives a list of events for a test (A17).
 *
 * ## The rulings the functions hold
 *
 *  · **No seconds** (R10): nothing here counts finer than a minute.
 *  · **System Cron: five minutes is the floor** (R15) — a minutes interval is
 *    a multiple of 5, at least 5. Core ticks routines every 5 minutes.
 *  · **Timeline Cron** (R10, R17, R19): on the session's story calendar,
 *    at least one minute; when the clock moves it fires **once** if its
 *    remaining wait is within the jump, never once per interval crossed (no
 *    catch-up); an optional **jump ceiling** (`maxJump`, "Skip when the clock
 *    jumps more than …") makes a larger move fire nothing.
 *  · **Schedule** (R20): set moments — once, daily, weekly, monthly,
 *    annually — on the 5-minute grid, on the system clock (the owner's time
 *    zone) or the story calendar (its own weekdays and months).
 *  · **No catch-up after a restart** (R21): the host clears a cron's state
 *    on the first interaction after a restart, and each counts its next time
 *    from then.
 *
 * Story time is ordered by `compareStoryTimes` and stepped by
 * `advanceStoryTime` — never packed into one number.
 * @experimental
 * @ruling R5, R9, R10, R15, R16, R17, R19, R20, R21, A17
 */

import type { EntityKind } from './entities.js'
import { checkValues, type FieldDecl } from './settings.js'
import { refuseUnlessIdentical } from './hash.js'
import { i18nFindings, type I18n } from './i18n.js'
import { conditionFindings, evaluateCondition, type ConditionDecl } from './conditions.js'
import {
	CORE_EVENTS,
	EVENT_ID,
	eventById,
	eventIdOf,
	notADeclaredEvent,
	packageEventById,
	type EventDef,
	type SessionEventDecl,
} from './events.js'
import {
	advanceStoryTime,
	compareStoryTimes,
	parseStoryTime,
	storyDayIndex,
	storyTimeProblem,
	storyTimeText,
	type StoryCalendar,
	type StoryTime,
	type StoryTimeUnit,
} from './storyTime.js'

// ── Events a cadence wakes on (D11) ─────────────────────────────────────────

/** 🚧 `core:event/turn-ended@1` — a turn ended (R51). @experimental */
export const TURN_ENDED_EVENT = 'core:event/turn-ended@1' as const
/** 🚧 `core:event/round-ended@1` — a round ended (R52). @experimental */
export const ROUND_ENDED_EVENT = 'core:event/round-ended@1' as const
/** 🚧 `core:event/scene-opened@1`. @experimental */
export const SCENE_OPENED_EVENT = 'core:event/scene-opened@1' as const
/** 🚧 `core:event/scene-closed@1`. @experimental */
export const SCENE_CLOSED_EVENT = 'core:event/scene-closed@1' as const
/** 🚧 `core:event/story-clock-moved@1`. @experimental */
export const STORY_CLOCK_MOVED_EVENT = 'core:event/story-clock-moved@1' as const
/**
 * 🚧 `core:event/system-tick@1` — the 5-minute system tick as the event the
 * host emits to cadences (D11: "the system tick becomes a host-emitted event
 * too"). Host-only: no declared `EventDef`, so no pipeline registers on it —
 * a routine on the system clock is a System Cron, under the cron caps.
 * @experimental
 */
export const SYSTEM_TICK_EVENT = 'core:event/system-tick@1' as const
/**
 * 🚧 What a cadence that wakes on **every** session event lists (`onEvent`
 * reads its option's event; `whenValue` the published values the host
 * hands with the event).
 * @experimental
 */
export const ANY_EVENT = '*' as const

// Derive, don't spell (R35): the five session events are core's declared ones.
for (const [id, def] of [
	[TURN_ENDED_EVENT, CORE_EVENTS.turnEnded],
	[ROUND_ENDED_EVENT, CORE_EVENTS.roundEnded],
	[SCENE_OPENED_EVENT, CORE_EVENTS.sceneOpened],
	[SCENE_CLOSED_EVENT, CORE_EVENTS.sceneClosed],
	[STORY_CLOCK_MOVED_EVENT, CORE_EVENTS.storyClockMoved],
] as const)
	if (eventIdOf(def) !== id) throw new Error(`cadences: '${id}' is not core's ${eventIdOf(def)}`)

/** 🚧 What a cadence wakes on: an event id, or `ANY_EVENT`. @experimental */
export type CadenceWake = string

/** 🚧 The core events the host evaluates cadences at, in order. @experimental */
export const CADENCE_EVENTS = [
	TURN_ENDED_EVENT,
	ROUND_ENDED_EVENT,
	SCENE_OPENED_EVENT,
	SCENE_CLOSED_EVENT,
	STORY_CLOCK_MOVED_EVENT,
	SYSTEM_TICK_EVENT,
] as const

/** What every event a cadence is handed may carry: the event's own payload, and the published values when the host reads them. */
interface CadenceEventBase {
	readonly payload?: unknown
	readonly values?: unknown
}

/**
 * 🚧 One event, as the host hands it to a cadence (and a test to
 * `simulateCadence`) — `event` its id, then what its due-function reads,
 * nothing more. Any other session event arrives as `{ event, payload }`; a
 * host that reads the published values for `whenValue` hands them as
 * `values`.
 * @experimental
 */
export type CadenceEvent =
	/**
	 * A turn ended; `turn` counts the turns of its lane from 1 (R51). Who took
	 * it (`speaker`: a participant reference, or `'narrator'`), on which
	 * `lane` (absent = the story's lane, `main`), the `round` and each
	 * speaker's turns in it, this one included (`turnsBy`).
	 */
	| (CadenceEventBase & {
			readonly event: typeof TURN_ENDED_EVENT
			readonly turn: number
			readonly speaker?: string
			readonly lane?: string
			readonly round?: number
			readonly turnsBy?: Readonly<Record<string, number>>
	  })
	/** A round ended (R52); `round` from 1, `speakers` in order of first turn. */
	| (CadenceEventBase & { readonly event: typeof ROUND_ENDED_EVENT; readonly round: number; readonly speakers?: readonly string[]; readonly lane?: string })
	| (CadenceEventBase & { readonly event: typeof SCENE_OPENED_EVENT; readonly sceneId?: number })
	| (CadenceEventBase & { readonly event: typeof SCENE_CLOSED_EVENT; readonly sceneId?: number })
	/** The story clock moved from `from` to `to`, counted on `calendar` (null: free-form). */
	| (CadenceEventBase & { readonly event: typeof STORY_CLOCK_MOVED_EVENT; readonly from: StoryTime; readonly to: StoryTime; readonly calendar?: StoryCalendar | null })
	/** The 5-minute system tick: `at` (epoch ms), the session's last interaction (null: none since the restart), the owner's time zone. */
	| (CadenceEventBase & { readonly event: typeof SYSTEM_TICK_EVENT; readonly at: number; readonly lastInteractionAt?: number | null; readonly timeZone?: string })
	/** Any other session event, by id. */
	| (CadenceEventBase & { readonly event: string })

/** The short name an event id reads as in a reason — `turn-ended` for core's. */
const eventWord = (id: string): string => (id === ANY_EVENT ? 'any event' : (/^core:event\/([a-z0-9-]+)@\d+$/.exec(id)?.[1] ?? id))

// ── ⏳ The names before events (one release, D11) ───────────────────────────

/**
 * ⏳ The session moments a cadence woke on before they were events (D11,
 * 2026-10-23) — read as event ids (`MOMENT_EVENTS`). Say `CadenceWake`.
 * @experimental
 */
export type MomentKind =
	| 'turn-ended'
	| 'round-ended'
	| 'scene-opened'
	| 'scene-closed'
	| 'story-clock-moved'
	| 'system-tick'
	| 'event'
	| 'value-changed'
	| (string & {})

/** ⏳ The moments core's host evaluated cadences at — say `CADENCE_EVENTS`. @experimental */
export const CORE_MOMENTS = [
	'turn-ended',
	'round-ended',
	'scene-opened',
	'scene-closed',
	'story-clock-moved',
	'system-tick',
	'event',
	'value-changed',
] as const

/** ⏳ What each moment is as an event: the session moments their event ids, `event` and `value-changed` every event. @experimental */
export const MOMENT_EVENTS: Readonly<Record<(typeof CORE_MOMENTS)[number], CadenceWake>> = Object.freeze({
	'turn-ended': TURN_ENDED_EVENT,
	'round-ended': ROUND_ENDED_EVENT,
	'scene-opened': SCENE_OPENED_EVENT,
	'scene-closed': SCENE_CLOSED_EVENT,
	'story-clock-moved': STORY_CLOCK_MOVED_EVENT,
	'system-tick': SYSTEM_TICK_EVENT,
	event: ANY_EVENT,
	'value-changed': ANY_EVENT,
})

/**
 * ⏳ One moment, in the shape before events (`kind`, not `event`) — still
 * taken wherever a `CadenceEvent` is (`cadenceEventOf`). Say `CadenceEvent`.
 * @experimental
 */
export type CadenceMoment =
	| {
			kind: 'turn-ended'
			turn: number
			speaker?: string
			lane?: string
			round?: number
			turnsBy?: Readonly<Record<string, number>>
	  }
	| { kind: 'round-ended'; round: number; speakers?: readonly string[]; lane?: string }
	| { kind: 'scene-opened'; sceneId?: number }
	| { kind: 'scene-closed'; sceneId?: number }
	| { kind: 'story-clock-moved'; from: StoryTime; to: StoryTime; calendar?: StoryCalendar | null }
	| { kind: 'system-tick'; at: number; lastInteractionAt?: number | null; timeZone?: string }
	| { kind: 'event'; event: string; payload?: unknown }
	| { kind: 'value-changed'; values: unknown }

/**
 * 🚧 What a cadence may be handed: an event, or a ⏳ moment in the shape
 * before events. Every member has an optional `kind`, so a reader written
 * for moments still reads it.
 * @experimental
 */
export type CadenceInput = (CadenceEvent & { readonly kind?: undefined }) | CadenceMoment | { readonly kind: string }

/** 🚧 What a wake is, as an event id: an old moment kind read through `MOMENT_EVENTS` (⏳), anything else as said. @experimental */
export const cadenceWakeOf = (w: string): CadenceWake =>
	Object.prototype.hasOwnProperty.call(MOMENT_EVENTS, w) ? MOMENT_EVENTS[w as keyof typeof MOMENT_EVENTS] : w

/**
 * 🚧 Any event a cadence is handed, as a `CadenceEvent`: one already is;
 * a ⏳ moment (`kind`) is read as its event — `{ kind: 'event', event,
 * payload }` as that event, `{ kind: 'value-changed', values }` as an event
 * with no id of its own (`ANY_EVENT`) carrying the values.
 * @experimental
 */
export function cadenceEventOf(e: CadenceInput): CadenceEvent {
	const o = e as Record<string, unknown>
	if (typeof o?.event === 'string' && o.kind === undefined) return e as CadenceEvent
	const { kind, ...rest } = o as { kind?: string } & Record<string, unknown>
	if (kind === 'event') return { ...rest, event: String(rest.event) } as CadenceEvent
	if (kind === 'value-changed') return { event: ANY_EVENT, values: rest.values } as CadenceEvent
	return { ...rest, event: cadenceWakeOf(String(kind)) } as CadenceEvent
}

/**
 * ⏳ The moments a cadence wakes at, in the words before events — for a host
 * that still raises moments (`{ kind }`) for one release: each event id as
 * its moment, every event (`ANY_EVENT`) as `value-changed` for `whenValue`
 * and `event` for any other. Say `cadenceWakesOn`.
 * @experimental
 */
export function cadenceMomentKinds(def: Pick<CadenceDef, 'id' | 'wakesOn'> | undefined): MomentKind[] {
	const out = new Set<MomentKind>()
	for (const w of def?.wakesOn ?? []) {
		if (w === ANY_EVENT) out.add(def!.id === WHEN_VALUE.id ? 'value-changed' : 'event')
		else {
			const kind = (Object.keys(MOMENT_EVENTS) as (keyof typeof MOMENT_EVENTS)[]).find((k) => MOMENT_EVENTS[k] === w)
			out.add(kind ?? w)
		}
	}
	return [...out]
}

/** 🚧 Whether a cadence wakes at an event: it lists the event, or every event. @experimental */
export const cadenceWakesOn = (def: Pick<CadenceDef, 'wakesOn'>, event: string): boolean =>
	def.wakesOn.includes(ANY_EVENT) || def.wakesOn.includes(event)

// ── Declarations ────────────────────────────────────────────────────────────

/**
 * A cadence, declared once (core's or a plugin's) and addressed by id.
 * @experimental
 * @ruling R5, §11-3
 */
export interface CadenceDef {
	/** `<ns>:cadence/<name>@<N>` — `core:cadence/every-n-turns@1`. */
	readonly id: string
	readonly i18n: { readonly name: I18n; readonly description?: I18n }
	/** The options a registration states — admin-editable (R36), validated by these declarations. */
	readonly options: Readonly<Record<string, FieldDecl>>
	/**
	 * 🚧 The events the host evaluates it at — event ids, or `ANY_EVENT`
	 * (D11); at any other it sleeps. ⏳ An old moment kind (`'turn-ended'`)
	 * is read as its event when declared (`cadenceWakeOf`).
	 */
	readonly wakesOn: readonly CadenceWake[]
	/** What its `cause` carries beyond the session a routine always has — fit (R4, R12). */
	readonly carries: readonly EntityKind[]
	/** Crons: which clock it counts on. Absent when an option decides (Schedule). */
	readonly clock?: 'system' | 'story'
	/**
	 * `'host'`: evaluated natively (core's). `{ script }`: a script of kind
	 * `core:script:cadence/due@1` — its source — run in the sandbox (a plugin's).
	 */
	readonly evaluate: 'host' | { readonly script: string }
}

/**
 * A cadence as a registration states it: the id and the option values.
 * Serializable (§11-3) — what a stored registration row holds.
 * @experimental
 */
export interface CadenceRef {
	readonly id: string
	readonly options: Readonly<Record<string, unknown>>
}

/** `<ns>:cadence/<name>@<N>`. @experimental */
export const CADENCE_ID = /^[a-z0-9]+(?:[.-][a-z0-9]+)*:cadence\/[a-z0-9]+(?:-[a-z0-9]+)*@\d+$/

/** A cadence's name segment — `every-n-turns` for `core:cadence/every-n-turns@1`. @experimental */
export const cadenceSlugOf = (id: string): string =>
	id.slice(id.indexOf('/') + 1).replace(/@\d+$/, '')

/** Whether a value is a cadence reference (`{ id, options }` with a cadence id). @experimental */
export const isCadenceRef = (v: unknown): v is CadenceRef =>
	!!v &&
	typeof v === 'object' &&
	typeof (v as CadenceRef).id === 'string' &&
	CADENCE_ID.test((v as CadenceRef).id) &&
	!!(v as CadenceRef).options &&
	typeof (v as CadenceRef).options === 'object'

const cadences = new Map<string, CadenceDef>()

function cadenceDeclFindings(def: CadenceDef): string[] {
	const out: string[] = []
	if (!def || typeof def !== 'object')
		return ['a cadence is { id, i18n, options, wakesOn, carries, evaluate }']
	if (typeof def.id !== 'string' || !CADENCE_ID.test(def.id))
		out.push(
			`'${String(def.id)}' is not a cadence id — '<namespace>:cadence/<name>@<version>', lowercase and hyphenated`,
		)
	out.push(...i18nFindings(def.i18n?.name, `${def.id} i18n.name`, { required: true }))
	out.push(...i18nFindings(def.i18n?.description, `${def.id} i18n.description`))
	if (!def.options || typeof def.options !== 'object' || Array.isArray(def.options))
		out.push(`${def.id}: options is a map of field declarations ({} when it takes none)`)
	if (
		!Array.isArray(def.wakesOn) ||
		!def.wakesOn.length ||
		def.wakesOn.some((m) => typeof m !== 'string' || !m || (cadenceWakeOf(m) !== ANY_EVENT && !EVENT_ID.test(cadenceWakeOf(m))))
	)
		out.push(
			`${def.id}: wakesOn lists the events it is evaluated at — event ids (${CADENCE_EVENTS.join(', ')}), or '${ANY_EVENT}' for every event`,
		)
	if (!Array.isArray(def.carries) || def.carries.some((k) => typeof k !== 'string' || !k))
		out.push(
			`${def.id}: carries lists entity kinds — ['session'] when its event carries nothing more`,
		)
	if (def.clock !== undefined && def.clock !== 'system' && def.clock !== 'story')
		out.push(`${def.id}: clock is 'system' or 'story'`)
	const ev = def.evaluate as unknown
	if (
		ev !== 'host' &&
		!(
			ev &&
			typeof ev === 'object' &&
			typeof (ev as { script?: unknown }).script === 'string' &&
			(ev as { script: string }).script.trim()
		)
	)
		out.push(
			`${def.id}: evaluate is 'host' (core's) or { script } — the source of a core:script:cadence/due@1 script`,
		)
	else if (
		typeof ev === 'object' &&
		(ev as { script: string }).script.length > MAX_CADENCE_SCRIPT_BYTES
	)
		out.push(
			`${def.id}: the script is ${(ev as { script: string }).script.length} bytes; a cadence script is at most ${MAX_CADENCE_SCRIPT_BYTES}`,
		)
	return out
}

/** The most a cadence script's source may weigh — the sandbox's source cap. @experimental */
export const MAX_CADENCE_SCRIPT_BYTES = 256 * 1024

/**
 * Declare a cadence. Core's own (`core:` ids, evaluated by the host); a
 * plugin declares through `definePluginCadence`. An identical
 * re-declaration is a no-op — a dev server's reload re-runs this — and a
 * different one under a claimed id throws (src/hash.ts).
 * @experimental
 */
export function defineCadence(def: CadenceDef): CadenceDef {
	const found = cadenceDeclFindings(def)
	if (found.length) throw new Error(`cadence refused:\n · ${found.join('\n · ')}`)
	const frozen: CadenceDef = Object.freeze({
		...def,
		options: Object.freeze({ ...def.options }),
		// ⏳ An old moment kind is stored as its event (D11).
		wakesOn: Object.freeze([...new Set(def.wakesOn.map(cadenceWakeOf))]),
		carries: Object.freeze([...def.carries]),
	})
	const existing = cadences.get(def.id)
	if (existing) {
		refuseUnlessIdentical(existing, frozen, `duplicate cadence id: ${def.id}`)
		// The same declaration again (a reload): the one already held stays.
		return existing
	}
	cadences.set(def.id, frozen)
	return frozen
}

/**
 * A plugin's cadence: its own namespace, evaluated by a script of kind
 * `core:script:cadence/due@1` (the host evaluates only core's natively), and
 * waking only on events the host emits — core's cadence events, a declared
 * session event, or every event.
 * @experimental
 */
export function definePluginCadence(pluginId: string, def: CadenceDef): CadenceDef {
	if (typeof def?.id === 'string' && def.id.startsWith('core:'))
		throw new Error(
			`plugin '${pluginId}' may not declare '${def.id}': the 'core:' namespace is core's`,
		)
	if (def?.evaluate === 'host')
		throw new Error(
			`plugin '${pluginId}' cadence '${def.id}' says evaluate: 'host' — a plugin's cadence is a script of kind ` +
				`core:script:cadence/due@1: evaluate: { script }`,
		)
	const unknown = (def?.wakesOn ?? []).filter((m) => {
		const w = cadenceWakeOf(m)
		return w !== ANY_EVENT && !(CADENCE_EVENTS as readonly string[]).includes(w) && !eventById(w) && !packageEventById(w)
	})
	if (unknown.length)
		throw new Error(
			`plugin '${pluginId}' cadence '${def.id}' wakes on ${unknown.map((m) => `'${m}'`).join(', ')}, which core ` +
				`never emits — one of ${CADENCE_EVENTS.join(', ')}, a declared session event, or '${ANY_EVENT}'`,
		)
	return defineCadence(def)
}

/** A declared cadence by id, or undefined. @experimental */
export const getCadence = (id: string): CadenceDef | undefined => cadences.get(id)
/** Every declared cadence. @experimental */
export const allCadences = (): CadenceDef[] => [...cadences.values()]
/** Withdraw a plugin's cadence (uninstall). Core's stay. @internal */
export function _withdrawCadence(id: string): boolean {
	if (id.startsWith('core:')) return false
	return cadences.delete(id)
}

// ── Option helpers ──────────────────────────────────────────────────────────

/** `HH:MM`, 24-hour. @experimental */
export const CLOCK_TIME = /^([01]\d|2[0-3]):([0-5]\d)$/

const parseClockTime = (t: unknown): { hour: number; minute: number } | undefined => {
	if (typeof t !== 'string') return undefined
	const m = CLOCK_TIME.exec(t)
	return m ? { hour: Number(m[1]), minute: Number(m[2]) } : undefined
}

/** A span of story or system time — `{ every: 12, unit: 'hours' }`. @experimental */
export interface CadenceSpan {
	readonly every: number
	readonly unit: StoryTimeUnit
}

/**
 * When a Schedule fires (R20). Times are `HH:MM` on the 5-minute grid. On the
 * system clock they are in the session owner's time zone, `once` is
 * `YYYY-MM-DDTHH:MM`, and a weekday counts from 0 = Monday. On the story
 * calendar they are the calendar's own: `once` is a story time line
 * (`412-03-05 22:30`), a weekday indexes the calendar's `weekdays`, and months
 * are its months.
 * @experimental
 * @ruling R20
 */
export type ScheduleAt =
	| { readonly once: string }
	| { readonly daily: string }
	| { readonly weekly: { readonly weekday: number; readonly time: string } }
	| { readonly monthly: { readonly day: number; readonly time: string } }
	| { readonly annually: { readonly month: number; readonly day: number; readonly time: string } }

const MINUTE = 60_000
const UNIT_MS: Record<'minutes' | 'hours' | 'days', number> = {
	minutes: MINUTE,
	hours: 60 * MINUTE,
	days: 24 * 60 * MINUTE,
}

/** The system tick's grid: core emits system time to routines every 5 minutes (R15). @experimental */
export const SYSTEM_TICK_MINUTES = 5

const isWhole = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v)

const SYSTEM_UNITS = ['minutes', 'hours', 'days'] as const
const STORY_UNITS = ['minutes', 'hours', 'days', 'months', 'years'] as const

function spanFindings(raw: unknown, at: string, units: readonly string[]): string[] {
	if (!raw || typeof raw !== 'object')
		return [`${at}: { every, unit } — a whole number and one of ${units.join(', ')}`]
	const s = raw as { every?: unknown; unit?: unknown }
	const out: string[] = []
	if (!isWhole(s.every) || s.every < 1) out.push(`${at}.every: a whole number, 1 or more`)
	if (!units.includes(s.unit as string))
		out.push(
			`${at}.unit: one of ${units.join(', ')} — no seconds: core never counts finer than a minute (R10)`,
		)
	return out
}

function scheduleAtFindings(raw: unknown, clock: 'system' | 'story', at: string): string[] {
	const out: string[] = []
	const time = (t: unknown, where: string) => {
		const p = parseClockTime(t)
		if (!p) out.push(`${where}: a time of day 'HH:MM', 24-hour`)
		else if (p.minute % SYSTEM_TICK_MINUTES)
			out.push(
				`${where}: '${String(t)}' is off the 5-minute grid — a schedule fires on whole 5 minutes (R20)`,
			)
	}
	if (!raw || typeof raw !== 'object' || Array.isArray(raw))
		return [
			`${at}: one of { once }, { daily }, { weekly: { weekday, time } }, { monthly: { day, time } }, { annually: { month, day, time } }`,
		]
	const keys = Object.keys(raw)
	if (keys.length !== 1 || !['once', 'daily', 'weekly', 'monthly', 'annually'].includes(keys[0]!))
		return [`${at}: exactly one of once, daily, weekly, monthly, annually`]
	const a = raw as Record<string, any>
	if ('once' in a) {
		if (clock === 'system') {
			const m =
				typeof a.once === 'string'
					? /^(\d{4})-(\d{2})-(\d{2})T(\d{2}:\d{2})$/.exec(a.once)
					: null
			if (!m) out.push(`${at}.once: 'YYYY-MM-DDTHH:MM' in the session owner's time zone`)
			else time(m[4], `${at}.once`)
		} else {
			const t = parseStoryTime(a.once)
			if (!t) out.push(`${at}.once: a story time line such as '412-03-05 22:30'`)
			else if (t.minute != null && t.minute % SYSTEM_TICK_MINUTES)
				out.push(`${at}.once: '${a.once}' is off the 5-minute grid (R20)`)
		}
	} else if ('daily' in a) time(a.daily, `${at}.daily`)
	else if ('weekly' in a) {
		if (
			!a.weekly ||
			!isWhole(a.weekly.weekday) ||
			a.weekly.weekday < 0 ||
			(clock === 'system' && a.weekly.weekday > 6)
		)
			out.push(
				`${at}.weekly.weekday: ${clock === 'system' ? 'a whole number 0–6, 0 = Monday' : "a whole number indexing the calendar's weekdays, from 0"}`,
			)
		time(a.weekly?.time, `${at}.weekly.time`)
	} else if ('monthly' in a) {
		if (
			!a.monthly ||
			!isWhole(a.monthly.day) ||
			a.monthly.day < 1 ||
			(clock === 'system' && a.monthly.day > 31)
		)
			out.push(`${at}.monthly.day: a day of the month, from 1`)
		time(a.monthly?.time, `${at}.monthly.time`)
	} else if ('annually' in a) {
		const y = a.annually
		if (!y || !isWhole(y.month) || y.month < 1 || (clock === 'system' && y.month > 12))
			out.push(`${at}.annually.month: a month, from 1`)
		if (!y || !isWhole(y.day) || y.day < 1 || (clock === 'system' && y.day > 31))
			out.push(`${at}.annually.day: a day of the month, from 1`)
		time(y?.time, `${at}.annually.time`)
	}
	return out
}

// ── Core's ten (PLAN-layering D2) ───────────────────────────────────────────

const HOST = 'host' as const

/** @experimental */
export const EVERY_N_TURNS = defineCadence({
	id: 'core:cadence/every-n-turns@1',
	i18n: {
		name: { en: 'Every few turns' },
		description: { en: 'Runs after every so many turns of the session.' },
	},
	options: {
		n: {
			type: 'integer',
			min: 1,
			max: 1000,
			default: 5,
			label: { en: 'Every how many turns' },
		},
	},
	wakesOn: [TURN_ENDED_EVENT],
	carries: ['session', 'message', 'speaker'],
	evaluate: HOST,
})
/** @experimental */
export const AFTER_EACH_TURN = defineCadence({
	id: 'core:cadence/after-each-turn@1',
	i18n: {
		name: { en: 'After each turn' },
		description: { en: 'Runs after every turn, once what it set off has settled.' },
	},
	options: {},
	wakesOn: [TURN_ENDED_EVENT],
	carries: ['session', 'message', 'speaker'],
	evaluate: HOST,
})
/** @experimental */
export const AFTER_EACH_ROUND = defineCadence({
	id: 'core:cadence/after-each-round@1',
	i18n: {
		name: { en: 'After each round' },
		description: { en: 'Runs once everyone the turn order seats has taken a turn.' },
	},
	options: {},
	wakesOn: [ROUND_ENDED_EVENT],
	carries: ['session'],
	evaluate: HOST,
})
/** @experimental */
export const AFTER_EACH_SCENE = defineCadence({
	id: 'core:cadence/after-each-scene@1',
	i18n: { name: { en: 'After each scene' }, description: { en: 'Runs when a scene closes.' } },
	options: {},
	wakesOn: [SCENE_CLOSED_EVENT],
	carries: ['session', 'scene'],
	evaluate: HOST,
})
/** @experimental */
export const WHEN_IDLE = defineCadence({
	id: 'core:cadence/when-idle@1',
	i18n: {
		name: { en: 'When nobody is playing' },
		description: { en: 'Runs once after the session has gone quiet for a while.' },
	},
	options: {
		minutes: {
			type: 'integer',
			min: 5,
			default: 30,
			label: { en: 'After how many quiet minutes' },
		},
	},
	wakesOn: [SYSTEM_TICK_EVENT],
	carries: ['session'],
	clock: 'system',
	evaluate: HOST,
})
/** @experimental */
export const ON_EVENT = defineCadence({
	id: 'core:cadence/on-event@1',
	i18n: {
		name: { en: 'When something happens' },
		description: {
			en: 'Runs when a session event fires, optionally only when its own fields say so.',
		},
	},
	options: {
		event: { type: 'string', label: { en: 'Event' } },
		where: { type: 'text', format: 'json', label: { en: 'Only when' } },
	},
	wakesOn: [ANY_EVENT],
	// What the event carries — `cadenceCarries` reads the named event's.
	carries: ['session'],
	evaluate: HOST,
})
/** @experimental */
export const WHEN_VALUE = defineCadence({
	id: 'core:cadence/when-value@1',
	i18n: {
		name: { en: 'When a value says so' },
		description: { en: "Runs when a condition over the session's values becomes true." },
	},
	options: { when: { type: 'text', format: 'json', label: { en: 'When' } } },
	wakesOn: [ANY_EVENT],
	carries: ['session', 'slot'],
	evaluate: HOST,
})
/** @experimental */
export const SYSTEM_CRON = defineCadence({
	id: 'core:cadence/system-cron@1',
	i18n: {
		name: { en: 'System Cron' },
		description: { en: 'Runs every so often in real time — every 5 minutes at the finest.' },
	},
	options: {
		every: { type: 'integer', min: 1, default: 1, label: { en: 'Every' } },
		unit: { type: 'enum', of: SYSTEM_UNITS, default: 'hours', label: { en: 'Unit' } },
	},
	wakesOn: [SYSTEM_TICK_EVENT],
	carries: ['session'],
	clock: 'system',
	evaluate: HOST,
})
/** @experimental */
export const TIMELINE_CRON = defineCadence({
	id: 'core:cadence/timeline-cron@1',
	i18n: {
		name: { en: 'Timeline Cron' },
		description: {
			en: "Runs every so often in story time, counted on the session's story calendar.",
		},
	},
	options: {
		every: { type: 'integer', min: 1, default: 1, label: { en: 'Every' } },
		unit: { type: 'enum', of: STORY_UNITS, default: 'days', label: { en: 'Unit' } },
		maxJump: {
			type: 'object',
			label: { en: 'Skip when the clock jumps more than …' },
			fields: {
				every: { type: 'integer', min: 1, label: { en: 'More than' } },
				unit: { type: 'enum', of: STORY_UNITS, label: { en: 'Unit' } },
			},
		},
	},
	wakesOn: [STORY_CLOCK_MOVED_EVENT],
	carries: ['session', 'clock'],
	clock: 'story',
	evaluate: HOST,
})
/** @experimental */
export const SCHEDULE = defineCadence({
	id: 'core:cadence/schedule@1',
	i18n: {
		name: { en: 'Schedule' },
		description: {
			en: 'Runs at set moments — once, daily, weekly, monthly or yearly — in real time or story time.',
		},
	},
	options: {
		clock: {
			type: 'enum',
			of: ['system', 'story'] as const,
			default: 'system',
			label: { en: 'Clock' },
		},
		at: { type: 'text', format: 'json', label: { en: 'When' } },
		maxJump: {
			type: 'object',
			label: { en: 'Skip when the clock jumps more than …' },
			fields: {
				every: { type: 'integer', min: 1, label: { en: 'More than' } },
				unit: { type: 'enum', of: STORY_UNITS, label: { en: 'Unit' } },
			},
		},
	},
	wakesOn: [SYSTEM_TICK_EVENT, STORY_CLOCK_MOVED_EVENT],
	carries: ['session'],
	evaluate: HOST,
})

/** Core's cadences, by name. @experimental */
export const coreCadences = Object.freeze({
	everyNTurns: EVERY_N_TURNS,
	afterEachTurn: AFTER_EACH_TURN,
	afterEachRound: AFTER_EACH_ROUND,
	afterEachScene: AFTER_EACH_SCENE,
	whenIdle: WHEN_IDLE,
	onEvent: ON_EVENT,
	whenValue: WHEN_VALUE,
	systemCron: SYSTEM_CRON,
	timelineCron: TIMELINE_CRON,
	schedule: SCHEDULE,
})

// ── Validation ──────────────────────────────────────────────────────────────

/** Options validated by their own rules rather than `checkValues` (JSON values, nested objects). */
const CUSTOM_OPTIONS = new Set(['where', 'when', 'at', 'maxJump', 'event'])

/**
 * Every fault in a cadence reference: an undeclared cadence, an option it
 * does not declare, a value its declaration refuses — and the rulings: a
 * System Cron in minutes is a multiple of 5 and at least 5 (R15), a Timeline
 * Cron at least one minute, a Schedule on the 5-minute grid (R20), no seconds
 * anywhere (R10). As sentences that say what to do instead.
 * @experimental
 * @ruling R10, R15, R20
 */
export function cadenceOptionFindings(
	ref: CadenceRef | null | undefined,
	at = 'cadence',
): string[] {
	if (!ref || typeof ref !== 'object')
		return [
			`${at}: a cadence is { id, options } — make one with everyNTurns(…), systemCron(…), …`,
		]
	const def = getCadence(ref.id)
	if (!def)
		return [
			`${at}: '${String(ref.id)}' is not a declared cadence — core's are ${allCadences()
				.filter((c) => c.id.startsWith('core:'))
				.map((c) => cadenceSlugOf(c.id))
				.join(', ')}`,
		]
	const options = (ref.options ?? {}) as Record<string, unknown>
	if (typeof options !== 'object' || Array.isArray(options))
		return [`${at}.options: a map of option values`]
	const out: string[] = []
	for (const k of Object.keys(options))
		if (!(k in def.options))
			out.push(
				`${at}.options.${k}: ${cadenceSlugOf(def.id)} takes ${Object.keys(def.options).join(', ') || 'no options'}`,
			)
	// Core's JSON-valued options (`where`, `when`, `at`, …) are judged by their
	// own rules below; a plugin's options are all its declarations' to judge.
	const custom = def.id.startsWith('core:') ? CUSTOM_OPTIONS : new Set<string>()
	const plain = Object.fromEntries(Object.entries(def.options).filter(([k]) => !custom.has(k)))
	for (const f of checkValues(plain, options)) out.push(`${at}.options: ${f.message} — ${f.fix}`)
	if (typeof options.unit === 'string' && /^sec/i.test(options.unit))
		out.push(`${at}.options.unit: no seconds — core never counts finer than a minute (R10)`)
	const slug = def.id.startsWith('core:') ? cadenceSlugOf(def.id) : ''
	switch (slug) {
		case 'system-cron':
			if (
				options.unit === 'minutes' &&
				isWhole(options.every) &&
				(options.every < SYSTEM_TICK_MINUTES || options.every % SYSTEM_TICK_MINUTES)
			)
				out.push(
					`${at}.options.every: a System Cron in minutes runs every 5, 10, 15 … minutes — core ticks routines every 5 minutes, never finer (R15)`,
				)
			break
		case 'timeline-cron':
			if (options.maxJump !== undefined)
				out.push(...spanFindings(options.maxJump, `${at}.options.maxJump`, STORY_UNITS))
			break
		case 'when-idle':
			if (isWhole(options.minutes) && options.minutes % SYSTEM_TICK_MINUTES)
				out.push(
					`${at}.options.minutes: a multiple of 5 — the session's quiet is checked on the 5-minute tick (R15)`,
				)
			break
		case 'on-event': {
			const ev = options.event
			if (typeof ev !== 'string' || !ev)
				out.push(`${at}.options.event: the event it listens to — onEvent(coreEvents.…)`)
			else if (!eventById(ev)) out.push(`${at}.options.event: ${notADeclaredEvent(ev)}`)
			if (options.where !== undefined)
				out.push(...conditionFindings(options.where, `${at}.options.where`))
			break
		}
		case 'when-value':
			if (options.when === undefined)
				out.push(`${at}.options.when: the condition it waits for — whenValue({ when })`)
			else out.push(...conditionFindings(options.when, `${at}.options.when`))
			break
		case 'schedule': {
			const clock = options.clock ?? 'system'
			if (clock !== 'system' && clock !== 'story') break
			if (options.at === undefined) {
				out.push(
					`${at}.options.at: when it fires — { once }, { daily }, { weekly }, { monthly } or { annually }`,
				)
				break
			}
			out.push(...scheduleAtFindings(options.at, clock, `${at}.options.at`))
			if (options.maxJump !== undefined) {
				if (clock !== 'story')
					out.push(
						`${at}.options.maxJump: only a story-clock schedule skips long clock jumps — after a restart a system schedule waits for an interaction (R21)`,
					)
				else
					out.push(...spanFindings(options.maxJump, `${at}.options.maxJump`, STORY_UNITS))
			}
			break
		}
	}
	return out
}

/**
 * A reference's options with every option it leaves out at its declared
 * default — what the due-function reads, and what a settings form shows.
 * @experimental
 */
export function cadenceOptionsOf(ref: CadenceRef): Record<string, unknown> {
	const def = getCadence(ref.id)
	const out: Record<string, unknown> = {}
	for (const [k, d] of Object.entries(def?.options ?? {}))
		if (d.default !== undefined) out[k] = d.default
	return { ...out, ...(ref.options ?? {}) }
}

/** The clock a cadence reference counts on, if any — `story` needs a session with a story clock. @experimental */
export function cadenceClock(ref: CadenceRef): 'system' | 'story' | undefined {
	const def = getCadence(ref.id)
	if (!def) return undefined
	if (def.clock) return def.clock
	if (def.id === SCHEDULE.id) return ref.options?.clock === 'story' ? 'story' : 'system'
	return undefined
}

/**
 * What a cadence reference's `cause` carries — its declaration's `carries`,
 * except where an option decides: `onEvent` carries what its event carries,
 * and a story-clock `schedule` carries the story clock.
 * @experimental
 * @ruling R9, R12
 */
export function cadenceCarries(ref: CadenceRef): EntityKind[] {
	const def = getCadence(ref.id)
	if (!def) return ['session']
	if (def.id === ON_EVENT.id) {
		const ev = typeof ref.options?.event === 'string' ? eventById(ref.options.event) : undefined
		return [...(ev?.carries ?? ['session'])]
	}
	if (def.id === SCHEDULE.id && ref.options?.clock === 'story') return ['session', 'clock']
	return [...def.carries]
}

const freezeRef = (id: string, options: Record<string, unknown>): CadenceRef => {
	const ref: CadenceRef = Object.freeze({ id, options: Object.freeze(options) })
	const found = cadenceOptionFindings(ref, cadenceSlugOf(id))
	if (found.length) throw new Error(`cadence refused:\n · ${found.join('\n · ')}`)
	return ref
}

// ── The ready-made cadences (each returns a `CadenceRef`) ───────────────────

/** Every `n` turns — the 5th, the 10th, … @experimental */
export const everyNTurns = (o: { n: number }): CadenceRef =>
	freezeRef(EVERY_N_TURNS.id, { n: o?.n })
/** After every turn. @experimental */
export const afterEachTurn = (): CadenceRef => freezeRef(AFTER_EACH_TURN.id, {})
/** After every round — the "wait for everyone". @experimental */
export const afterEachRound = (): CadenceRef => freezeRef(AFTER_EACH_ROUND.id, {})
/** After every scene closes. @experimental */
export const afterEachScene = (): CadenceRef => freezeRef(AFTER_EACH_SCENE.id, {})
/** Once, after the session has been quiet for `minutes` (a multiple of 5). @experimental */
export const whenIdle = (o: { minutes: number }): CadenceRef =>
	freezeRef(WHEN_IDLE.id, { minutes: o?.minutes })
/**
 * When a session event fires — `onEvent(coreEvents.castChanged, { where: … })`
 * — optionally only when a condition over the event's own payload holds.
 * @experimental
 */
export const onEvent = (
	event: EventDef | SessionEventDecl | string,
	o: { where?: ConditionDecl } = {},
): CadenceRef =>
	freezeRef(ON_EVENT.id, {
		event: eventIdOf(event),
		...(o.where !== undefined ? { where: o.where } : {}),
	})
/** When a condition over the session's published values becomes true. @experimental */
export const whenValue = (o: { when: ConditionDecl }): CadenceRef =>
	freezeRef(WHEN_VALUE.id, { when: o?.when })
/** Every so often in real time — minutes in multiples of 5 (R15), hours, days. @experimental */
export const systemCron = (o: { every: number; unit: 'minutes' | 'hours' | 'days' }): CadenceRef =>
	freezeRef(SYSTEM_CRON.id, { every: o?.every, unit: o?.unit })
/**
 * Every so often in story time, on the session's calendar (R10). `maxJump`:
 * "Skip when the clock jumps more than …" (R19).
 * @experimental
 */
export const timelineCron = (o: {
	every: number
	unit: StoryTimeUnit
	maxJump?: CadenceSpan
}): CadenceRef =>
	freezeRef(TIMELINE_CRON.id, {
		every: o?.every,
		unit: o?.unit,
		...(o?.maxJump ? { maxJump: { ...o.maxJump } } : {}),
	})
/** At set moments on the system clock or the story calendar (R20). @experimental */
export const schedule = (o: {
	clock: 'system' | 'story'
	at: ScheduleAt
	maxJump?: CadenceSpan
}): CadenceRef =>
	freezeRef(SCHEDULE.id, {
		clock: o?.clock,
		at: o?.at,
		...(o?.maxJump ? { maxJump: { ...o.maxJump } } : {}),
	})

// ── Due-functions ───────────────────────────────────────────────────────────

/**
 * What a cadence keeps between events — a cron's next time, a value's last
 * answer. JSON, owned by the host (the registration row's `state`, D7), and
 * cleared on the first interaction after a restart (R21).
 * @experimental
 */
export type CadenceState = Readonly<Record<string, unknown>>

/** One event's answer: due or not, the state to keep, and why when it is not. @experimental */
export interface CadenceVerdict {
	due: boolean
	state: CadenceState
	reason?: string
}

const no = (state: CadenceState, reason: string): CadenceVerdict => ({ due: false, state, reason })

const spanText = (s: { every: number; unit: string }) =>
	`${s.every} ${s.every === 1 ? s.unit.replace(/s$/, '') : s.unit}`

/**
 * Whether a move of the story clock from `from` to `to` is larger than the
 * ceiling — `undefined` when the ceiling cannot be counted from `from`.
 */
function jumpsPast(
	from: StoryTime,
	to: StoryTime,
	ceiling: CadenceSpan,
	calendar?: StoryCalendar | null,
): boolean | undefined {
	const limit = advanceStoryTime(from, ceiling.every, ceiling.unit, calendar)
	if (!limit.time) return undefined
	return compareStoryTimes(to, limit.time) > 0
}

/** A story time on `day`'s date at `hour:minute`. */
const atTime = (day: StoryTime, t: { hour: number; minute: number }): StoryTime => ({
	year: day.year,
	month: day.month ?? null,
	day: day.day ?? null,
	hour: t.hour,
	minute: t.minute,
})

/**
 * The first occurrence of a schedule strictly after `after`, on a story
 * calendar — or `null` when the clock cannot place one (a daily schedule on
 * a clock with no day, a weekly one on a calendar with no week).
 * @experimental
 * @ruling R20
 */
export function nextStoryOccurrence(
	after: StoryTime,
	at: ScheduleAt,
	calendar?: StoryCalendar | null,
): StoryTime | null {
	const later = (t: StoryTime) => compareStoryTimes(t, after) > 0
	if ('once' in at) {
		const t = parseStoryTime(at.once)
		return t && later(t) ? t : null
	}
	const hasDay = after.month != null && after.day != null
	if ('daily' in at) {
		const t = parseClockTime(at.daily)
		if (!t || !hasDay) return null
		const today = atTime(after, t)
		if (later(today)) return today
		return advanceStoryTime(today, 1, 'days', calendar).time ?? null
	}
	if ('weekly' in at) {
		const t = parseClockTime(at.weekly.time)
		const week = calendar?.weekdays ?? []
		if (!t || !hasDay || !calendar || !week.length) return null
		for (let i = 0; i <= week.length; i++) {
			const day =
				i === 0
					? atTime(after, t)
					: advanceStoryTime(atTime(after, t), i, 'days', calendar).time
			if (!day) return null
			const index = storyDayIndex(day, calendar)
			if (index === null) continue
			const weekday =
				(((index + (calendar.firstWeekday ?? 0)) % week.length) + week.length) % week.length
			if (weekday === at.weekly.weekday && later(day)) return day
		}
		return null
	}
	if ('monthly' in at) {
		const t = parseClockTime(at.monthly.time)
		if (!t || after.month == null) return null
		const months = calendar?.months.length ?? 12
		for (let k = 0; k <= months * 2 + 1; k++) {
			const month =
				k === 0
					? { year: after.year, month: after.month }
					: advanceStoryTime(
							{ year: after.year, month: after.month },
							k,
							'months',
							calendar,
						).time
			if (!month || month.month == null) return null
			const candidate: StoryTime = {
				year: month.year,
				month: month.month,
				day: at.monthly.day,
				hour: t.hour,
				minute: t.minute,
			}
			if (storyTimeProblem(candidate, calendar)) continue
			if (later(candidate)) return candidate
		}
		return null
	}
	if ('annually' in at) {
		const t = parseClockTime(at.annually.time)
		if (!t) return null
		const cycle = Math.max(1, calendar?.leap?.every ?? 1) * 2 + 1
		for (let k = 0; k <= Math.min(cycle, 1000); k++) {
			const candidate: StoryTime = {
				year: after.year + k,
				month: at.annually.month,
				day: at.annually.day,
				hour: t.hour,
				minute: t.minute,
			}
			if (storyTimeProblem(candidate, calendar)) continue
			if (later(candidate)) return candidate
		}
		return null
	}
	return null
}

const WEEKDAY_INDEX: Record<string, number> = {
	Mon: 0,
	Tue: 1,
	Wed: 2,
	Thu: 3,
	Fri: 4,
	Sat: 5,
	Sun: 6,
}

/** The wall-clock parts of an instant in a time zone. */
function wallClock(
	at: number,
	timeZone: string,
): { year: number; month: number; day: number; hour: number; minute: number; weekday: number } {
	const parts = Object.fromEntries(
		new Intl.DateTimeFormat('en-US', {
			timeZone,
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
			weekday: 'short',
			hourCycle: 'h23',
		})
			.formatToParts(new Date(at))
			.map((p) => [p.type, p.value]),
	)
	return {
		year: Number(parts.year),
		month: Number(parts.month),
		day: Number(parts.day),
		hour: Number(parts.hour) % 24,
		minute: Number(parts.minute),
		weekday: WEEKDAY_INDEX[parts.weekday as string] ?? 0,
	}
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Does the wall-clock moment match the schedule? */
function wallMatches(w: ReturnType<typeof wallClock>, at: ScheduleAt): boolean {
	const hhmm = `${pad(w.hour)}:${pad(w.minute)}`
	if ('once' in at) return at.once === `${w.year}-${pad(w.month)}-${pad(w.day)}T${hhmm}`
	if ('daily' in at) return at.daily === hhmm
	if ('weekly' in at) return at.weekly.weekday === w.weekday && at.weekly.time === hhmm
	if ('monthly' in at) return at.monthly.day === w.day && at.monthly.time === hhmm
	if ('annually' in at)
		return (
			at.annually.month === w.month && at.annually.day === w.day && at.annually.time === hhmm
		)
	return false
}

/** The most 5-minute grid points one system tick looks back over — a week. */
const MAX_GRID_LOOKBACK = (7 * 24 * 60) / SYSTEM_TICK_MINUTES

/**
 * Whether a system-clock schedule has an occurrence in `(after, upTo]`, read
 * on the 5-minute grid in `timeZone`. Fires once however many it passed
 * (no catch-up, R19/R21).
 * @experimental
 */
export function systemScheduleDue(
	after: number,
	upTo: number,
	at: ScheduleAt,
	timeZone = 'UTC',
): boolean {
	const step = SYSTEM_TICK_MINUTES * MINUTE
	let t = Math.floor(after / step) * step + step
	const earliest = upTo - MAX_GRID_LOOKBACK * step
	if (t < earliest) t = Math.ceil(earliest / step) * step
	for (; t <= upTo; t += step) if (wallMatches(wallClock(t, timeZone), at)) return true
	return false
}

/**
 * One event's answer for one cadence reference: due or not, the state to
 * keep, and why when it is not. Pure — the host evaluates core's cadences
 * with exactly this, and `simulateCadence` drives it for a test. An event
 * the cadence does not wake on is never due. A plugin's cadence is evaluated
 * by its script, not here (`simulateCadence` takes an `evaluate` stand-in).
 * ⏳ A moment in the shape before events (`{ kind }`) is read as its event
 * (`cadenceEventOf`).
 * @experimental
 * @ruling R9, R15, R17, R19, R20, R21, D11
 */
export function cadenceDue(
	ref: CadenceRef,
	event: CadenceInput,
	state: CadenceState = {},
): CadenceVerdict {
	const def = getCadence(ref.id)
	if (!def) return no(state, `'${ref.id}' is not a declared cadence`)
	const e = cadenceEventOf(event)
	if (!cadenceWakesOn(def, e.event))
		return no(state, `${cadenceSlugOf(def.id)} sleeps at ${eventWord(e.event)}`)
	if (def.evaluate !== 'host')
		return no(state, `${cadenceSlugOf(def.id)} is decided by its script, on the host`)
	const o = cadenceOptionsOf(ref) as Record<string, any>
	// The known events, by id; any other is `{ event, payload, values }`.
	const m = e as CadenceEvent & Record<string, any>
	switch (def.id) {
		case EVERY_N_TURNS.id: {
			if (m.event !== TURN_ENDED_EVENT) break
			const n = isWhole(o.n) && o.n >= 1 ? o.n : 5
			return m.turn >= 1 && m.turn % n === 0
				? { due: true, state }
				: no(state, `turn ${m.turn} is not a multiple of ${n}`)
		}
		case AFTER_EACH_TURN.id:
		case AFTER_EACH_ROUND.id:
		case AFTER_EACH_SCENE.id:
			return { due: true, state }
		case WHEN_IDLE.id: {
			if (m.event !== SYSTEM_TICK_EVENT) break
			const last = m.lastInteractionAt
			if (last == null) return no(state, 'nobody has played since the app started')
			const quiet = m.at - last
			if (quiet < (isWhole(o.minutes) ? o.minutes : 30) * MINUTE)
				return no(state, 'the session is not quiet long enough yet')
			if (state.firedFor === last) return no(state, 'already ran for this quiet stretch')
			return { due: true, state: { firedFor: last } }
		}
		case ON_EVENT.id: {
			if (m.event !== o.event)
				return no(state, `listens to ${String(o.event)}, not ${m.event}`)
			return evaluateCondition(o.where as ConditionDecl | undefined, m.payload)
				? { due: true, state }
				: no(state, "the event's fields do not match")
		}
		case WHEN_VALUE.id: {
			if (m.values === undefined) return no(state, 'no published values came with the event')
			const holds = evaluateCondition(o.when as ConditionDecl, m.values)
			if (!holds) return no({ held: false }, 'the condition does not hold')
			// Edge-triggered: once when it becomes true, not on every change while it stays true.
			return state.held === true
				? no({ held: true }, 'the condition already held')
				: { due: true, state: { held: true } }
		}
		case SYSTEM_CRON.id: {
			if (m.event !== SYSTEM_TICK_EVENT) break
			const unit = (SYSTEM_UNITS as readonly string[]).includes(o.unit)
				? (o.unit as 'minutes' | 'hours' | 'days')
				: 'hours'
			const interval = (isWhole(o.every) && o.every >= 1 ? o.every : 1) * UNIT_MS[unit]
			const nextAt = typeof state.nextAt === 'number' ? state.nextAt : undefined
			// Counted from the first tick it sees — after a restart, from the
			// first interaction (the host clears the state, R21).
			if (nextAt === undefined) return no({ nextAt: m.at + interval }, 'counting from now')
			if (m.at < nextAt) return no(state, 'not due yet')
			// Once, however many intervals passed (no catch-up, R19), and the
			// next time counts from this run.
			return { due: true, state: { nextAt: m.at + interval } }
		}
		case TIMELINE_CRON.id: {
			if (m.event !== STORY_CLOCK_MOVED_EVENT) break
			const cal = m.calendar ?? null
			if (compareStoryTimes(m.to, m.from) <= 0)
				return no(state, 'the story clock did not move forward')
			const unit = (STORY_UNITS as readonly string[]).includes(o.unit)
				? (o.unit as StoryTimeUnit)
				: 'days'
			const every = isWhole(o.every) && o.every >= 1 ? o.every : 1
			let next = typeof state.nextAt === 'string' ? parseStoryTime(state.nextAt) : null
			if (!next) {
				const first = advanceStoryTime(m.from, every, unit, cal)
				if (!first.time) return no(state, first.problem)
				next = first.time
			}
			const kept: CadenceState = { nextAt: storyTimeText(next) }
			if (o.maxJump && jumpsPast(m.from, m.to, o.maxJump as CadenceSpan, cal))
				return no(kept, `Skipped: the clock jumped more than ${spanText(o.maxJump)}`)
			if (compareStoryTimes(m.to, next) < 0) return no(kept, 'not due yet')
			// Once per move (R17), and the next time counts from where the clock stands.
			const after = advanceStoryTime(m.to, every, unit, cal)
			return { due: true, state: after.time ? { nextAt: storyTimeText(after.time) } : {} }
		}
		case SCHEDULE.id: {
			const at = o.at as ScheduleAt
			if (state.done === true) return no(state, 'a once schedule already ran')
			const once = !!at && 'once' in at
			if (o.clock === 'story') {
				if (m.event !== STORY_CLOCK_MOVED_EVENT)
					return no(state, 'a story-clock schedule sleeps at the system tick')
				const cal = m.calendar ?? null
				if (compareStoryTimes(m.to, m.from) <= 0)
					return no(state, 'the story clock did not move forward')
				if (o.maxJump && jumpsPast(m.from, m.to, o.maxJump as CadenceSpan, cal))
					return no(state, `Skipped: the clock jumped more than ${spanText(o.maxJump)}`)
				const occ = nextStoryOccurrence(m.from, at, cal)
				if (!occ) return no(state, 'the story clock cannot place this schedule')
				if (compareStoryTimes(occ, m.to) > 0) return no(state, 'not due yet')
				return { due: true, state: once ? { done: true } : state }
			}
			if (m.event !== SYSTEM_TICK_EVENT)
				return no(state, 'a system schedule sleeps when the story clock moves')
			const last = typeof state.lastAt === 'number' ? state.lastAt : undefined
			if (last === undefined) return no({ lastAt: m.at }, 'counting from now')
			const due = m.at > last && systemScheduleDue(last, m.at, at, m.timeZone ?? 'UTC')
			if (!due) return no({ lastAt: m.at }, 'not due yet')
			return { due: true, state: once ? { lastAt: m.at, done: true } : { lastAt: m.at } }
		}
	}
	return no(state, `${cadenceSlugOf(def.id)} has nothing to say at ${eventWord(e.event)}`)
}

/** One step of a simulation: the event, and the cadence's answer to it. @experimental */
export interface SimulatedStep {
	/** 🚧 The event, as a `CadenceEvent`. */
	event: CadenceEvent
	/** ⏳ What the step was handed, as it was handed (a moment in the shape before events stays one). */
	moment: CadenceInput
	due: boolean
	reason?: string
}

/**
 * Drive a cadence through a list of events — a fake clock for an author's
 * test (A17). Returns each event's answer, the indexes it fired at, and the
 * state left. A plugin's cadence passes `evaluate` (what its script would
 * answer — handed each event as it was given); core's are evaluated as the
 * host does.
 *
 * ```ts
 * const run = simulateCadence(everyNTurns({ n: 5 }), turns(1, 12))
 * run.fired // [4, 9] — turns 5 and 10
 * ```
 * @experimental
 * @ruling A17
 */
export function simulateCadence(
	ref: CadenceRef,
	events: ReadonlyArray<CadenceInput>,
	opts: {
		state?: CadenceState
		evaluate?: (
			event: CadenceInput,
			options: Readonly<Record<string, unknown>>,
			state: CadenceState,
		) => boolean | CadenceVerdict
	} = {},
): { steps: SimulatedStep[]; fired: number[]; state: CadenceState } {
	let state: CadenceState = opts.state ?? {}
	const steps: SimulatedStep[] = []
	const fired: number[] = []
	const def = getCadence(ref.id)
	events.forEach((given, i) => {
		const event = cadenceEventOf(given)
		let verdict: CadenceVerdict
		if (opts.evaluate && (!def || def.evaluate !== 'host')) {
			if (def && !cadenceWakesOn(def, event.event))
				verdict = no(state, `${cadenceSlugOf(def.id)} sleeps at ${eventWord(event.event)}`)
			else {
				const r = opts.evaluate(given, ref.options ?? {}, state)
				verdict = typeof r === 'boolean' ? { due: r, state } : r
			}
		} else verdict = cadenceDue(ref, given, state)
		state = verdict.state
		steps.push({
			event,
			moment: given,
			due: verdict.due,
			...(verdict.reason ? { reason: verdict.reason } : {}),
		})
		if (verdict.due) fired.push(i)
	})
	return { steps, fired, state }
}

/** 🚧 `turn-ended` events for turns `from` … `to` — a simulation's turns. @experimental */
export const turnEvents = (from: number, to: number): CadenceEvent[] => {
	const out: CadenceEvent[] = []
	for (let t = from; t <= to; t++) out.push({ event: TURN_ENDED_EVENT, turn: t })
	return out
}

/** ⏳ `turn-ended` moments in the shape before events — say `turnEvents`. @experimental */
export const turnMoments = (from: number, to: number): CadenceMoment[] => {
	const out: CadenceMoment[] = []
	for (let t = from; t <= to; t++) out.push({ kind: 'turn-ended', turn: t })
	return out
}

// ── What a routine's pipeline receives (R9; `core:inlet/routine@1`) ─────────

/**
 * The routine inlet's `routine` port: metadata for where the routine resides
 * — the registration, the preset, the cadence and its option values, the
 * turn / round / scene it fired on. Nothing opinionated (R9). `note` leaves
 * room for a description or prompt a registration made during play may carry
 * one day (§11-5), read through the SDK.
 * @experimental
 * @ruling R9, §11-5
 */
export interface RoutineFiring {
	registrationKey: string
	presetId?: number | null
	cadence: CadenceRef
	mode: 'off' | 'review' | 'full'
	firedAt: { turn?: number; round?: number; sceneId?: number }
	note?: string
}

/**
 * The routine inlet's `cause` port: what the event the cadence woke at
 * carries — a turn's message and speaker, an event's own entity references,
 * the slot that matched, the clock's from and to, a tick's scheduled and run
 * times. Each entity also arrives on its own port (`message`, `speaker`,
 * `subject`, …), which is what fit reads (R4, R12).
 * @experimental
 * @ruling R9
 */
export interface RoutineCause {
	/** ⏳ The moment it woke at, in the words before events — say `event`. */
	moment?: MomentKind
	at: number
	/** 🚧 The event it woke at, by id (D11). */
	event?: string
	payload?: unknown
	messageId?: number
	speaker?: string | null
	/** 🚧 `turn-ended` · `round-ended`: the lane the turn was taken on (a canonical channel string; R51). */
	lane?: string
	/** 🚧 `turn-ended`: the turn's index in its lane, from 1 (R51). */
	turn?: number
	/** 🚧 `turn-ended` · `round-ended`: the round, from 1 (R52). */
	round?: number
	/** 🚧 `turn-ended`: turns each speaker has taken this round, this one included (R51). */
	turnsBy?: Readonly<Record<string, number>>
	/** 🚧 `round-ended`: who spoke in the round, in order of first turn (R52). */
	speakers?: readonly string[]
	actor?: string
	castMember?: string
	subject?: string
	user?: string
	slot?: string
	clock?: { from: StoryTime; to: StoryTime; crossed?: number }
	sceneId?: number
	scheduledFor?: number
}
