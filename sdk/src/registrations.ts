/**
 * 🚧 **Registrations** — which pipeline runs on which trigger (PLAN-layering
 * D1; R6, R7, R24, R30, R31, R34, A4, A8, A12; LS1).
 *
 * Pipelines and the things they listen to are two separate things. A
 * pipeline declares what it does (and the events it **suits**, for pickers
 * only); a **registration** says "this trigger runs this pipeline, here":
 *
 * ```ts
 * register(coreEvents.messageRespond, storyReply, { values: { … } })   // an event pipeline
 * register(narrate.actions.narrate, narrate)                         // an action pipeline
 * register(everyNTurns({ n: 5 }), storySweep, { mode: 'review' })    // a routine
 * ```
 *
 * The genre's defaults hold registrations; a preset adds, drops and changes
 * them (one level, R2); a session keeps its own rows. Every layer's
 * registrations are **data with an origin** (§11-1), and every origin passes
 * one door: `registrationFindings` (§11-2).
 *
 * ## The key is derived, never typed (A8, R34)
 *
 * `register()` derives the registration's stable identity from what it is —
 * the trigger and the pipeline: `message-respond→story-reply`,
 * `every-n-turns→story-sweep`, `story-narrate#narrate→story-narrate`. A core
 * id contributes its name; another package's its namespace and name
 * (`acme.dice:roll`), so two packages' pipelines never share a key. Changing
 * a cadence's options or a `when` keeps the key — stored session values and
 * a routine's queue survive an administrator's edit; a different pipeline or
 * trigger is a different registration. Two alike in one layer warn, never
 * refuse (R34).
 *
 * ## Objects first; strings warn (R30, A18)
 *
 * `register()` takes the declared objects — an event (`coreEvents.…`, a
 * package's `defineSessionEvent`), an action handle (`spec.actions.<key>`),
 * a cadence (`everyNTurns(…)`), a pipeline (the spec you built, or
 * `use('…')`). A string still works, as a fallback, and the door says so.
 * @experimental
 * @ruling R6, R7, R24, R30, R31, R34, A4, A8, A12, LS1, §11
 */

import type { BuiltSpec } from './builder.js'
import type { SpecDocument } from './document.js'
import type { ExternalRef, PresetDecl } from './announce.js'
import type { Finding } from './validate.js'
import { i18nFindings, type I18n } from './i18n.js'
import {
	EVENT_ID,
	eventById,
	eventIdOf,
	isEventDef,
	isSessionEventDecl,
	notADeclaredEvent,
	type EventDef,
	type SessionEventDecl,
} from './events.js'
import {
	CADENCE_ID,
	ON_EVENT,
	cadenceClock,
	cadenceOptionFindings,
	isCadenceRef,
	type CadenceRef,
} from './cadences.js'
import { conditionFindings, type ConditionDecl } from './conditions.js'
import { fitOf } from './entities.js'
import { actionsOf, isActionIdentity, type NormalizedAction } from './actions.js'
import { getDefinition } from './descriptors.js'
import { exposureFindings } from './exposure.js'

// ── Triggers ────────────────────────────────────────────────────────────────

/**
 * The trigger families — open (LS1): Live is a later family, and a closed
 * union would make it a breaking change after SDK 1.0. The registration door
 * refuses a family the host does not support, with a sentence.
 * @experimental
 * @ruling LS1
 */
export type TriggerFamily = 'event' | 'action' | 'routine' | (string & {})

/** The families core's host supports today. @experimental */
export const TRIGGER_FAMILIES = ['event', 'action', 'routine'] as const

/**
 * What starts a registered pipeline: an event (by id), an action a person
 * fires (by identity, `<spec slug>#<key>`), or a cadence (a routine).
 * @experimental
 */
export type Trigger =
	| { readonly family: 'event'; readonly event: string }
	| { readonly family: 'action'; readonly action: string }
	| { readonly family: 'routine'; readonly cadence: CadenceRef }

/**
 * A registration's changes to the pipeline's declared defaults — the preset
 * and genre layers of the value cascade (R38): `{ [nodeKey]: { [slot]: value } }`.
 * Prompts, templates, sampling and loadouts by library reference; parameters
 * by value. Never a connection: what a step runs on is an administrator's
 * loadout, never a registration's.
 * @experimental
 * @ruling R38
 */
export type RegistrationValues = Readonly<Record<string, Readonly<Record<string, unknown>>>>

/** A routine's mode (R37): off, held for review, or applied. @experimental */
export type RoutineMode = 'off' | 'review' | 'full'

/** The routine modes. @experimental */
export const ROUTINE_MODES: readonly RoutineMode[] = ['off', 'review', 'full']

/**
 * The per-routine cron caps (R11) — each at most the owner's user setting,
 * which is at most the system's. For routines on the system clock.
 * @experimental
 * @ruling R11
 */
export interface RoutineCaps {
	/** How long the session may go without a person's interaction before the routine stops running. */
	readonly idleTimeoutMinutes?: number
	/** How many system-clock routine runs may happen since the last interaction. */
	readonly maxRunsInRow?: number
}

/**
 * One registration: this trigger runs this pipeline — in the genre's
 * defaults, a preset's changes, or a session's rows.
 * @experimental
 * @ruling D1
 */
export interface RegistrationDecl {
	/** DERIVED, never typed: `<trigger key>→<pipeline key>` (`registrationKeyOf`). */
	readonly key: string
	readonly trigger: Trigger
	/** The spec id of the pipeline that runs. */
	readonly pipeline: string
	/** Runs only when this holds over the session's published values (R31: absent = always). */
	readonly when?: ConditionDecl
	/** Changes to the pipeline's declared defaults (R38). */
	readonly values?: RegistrationValues
	/** Many per trigger (R24): run in this order, then by key. */
	readonly order?: number
	/** Routines only (R37): default `full`. */
	readonly mode?: RoutineMode
	/** Routines only (R18): default false — a firing that finds one waiting is refused. */
	readonly allowStacking?: boolean
	/** Routines on the system clock only (R11), an administrator's. */
	readonly caps?: RoutineCaps
	/** What the settings call it, when not the pipeline's name. */
	readonly label?: I18n
}

/** What `register()` takes beside the trigger and the pipeline. @experimental */
export type RegistrationOptions = Omit<RegistrationDecl, 'key' | 'trigger' | 'pipeline'>

const OPTION_KEYS = ['when', 'values', 'order', 'mode', 'allowStacking', 'caps', 'label'] as const

/**
 * An action, as an object a registration names: `narrate.actions.narrate`
 * (`spec.actions.<key>` on a built spec, typed from its declarations) —
 * derive, don't spell (A18).
 * @experimental
 */
export interface ActionHandle {
	readonly __handle: 'action'
	/** The spec that declares it. */
	readonly spec: string
	readonly key: string
	/** `<spec slug>#<key>` — what stored forms hold. */
	readonly identity: string
	/** Where it appears — its venues' kinds. */
	readonly venues: readonly string[]
	/** What a press collects first — `text`, `recipients`, `clockStep`. */
	readonly collects: readonly string[]
}

/** Is this an action handle? @experimental */
export const isActionHandle = (v: unknown): v is ActionHandle =>
	!!v &&
	typeof v === 'object' &&
	(v as ActionHandle).__handle === 'action' &&
	typeof (v as ActionHandle).identity === 'string'

/** The handle of one declared action. @internal */
export function actionHandle(
	specId: string,
	a: Pick<NormalizedAction, 'key' | 'venue' | 'collects'>,
): ActionHandle {
	const venues = (Array.isArray(a.venue) ? a.venue : [a.venue])
		.map((v) => v?.kind)
		.filter((k): k is NonNullable<typeof k> => !!k)
	return Object.freeze({
		__handle: 'action' as const,
		spec: specId,
		key: a.key,
		identity: `${specId}#${a.key}`,
		venues: Object.freeze([...new Set(venues)]),
		collects: Object.freeze(Object.keys(a.collects ?? {})),
	})
}

/**
 * The handles of every action a spec (or its document) declares, by key.
 * `spec.actions` on a built spec is this, typed.
 * @experimental
 */
export function actionHandlesOf(s: {
	id: string
	meta?: { contributes?: unknown }
	contributes?: unknown
}): Record<string, ActionHandle> {
	const contributes = s.meta ? s.meta.contributes : s.contributes
	const out: Record<string, ActionHandle> = {}
	for (const a of actionsOf({ id: s.id, contributes })) out[a.key] = actionHandle(s.id, a)
	return out
}

/** What `register()` accepts as a trigger: the declared objects, or a string (warned, R30). @experimental */
export type TriggerInput =
	EventDef | SessionEventDecl | ActionHandle | CadenceRef | Trigger | string

/** What `register()` accepts as a pipeline: the spec you built or compiled, `use('…')`, or a string (warned, R30). @experimental */
export type PipelineInput = BuiltSpec | SpecDocument | ExternalRef | string

// ── Keys ────────────────────────────────────────────────────────────────────

/** The arrow a registration key joins its two halves with. @experimental */
export const REGISTRATION_KEY_JOIN = '→'

/**
 * The part of an id a key carries: a core id's name (`message-respond`,
 * `story-reply`, `every-n-turns`), another package's namespace and name
 * (`acme.dice:roll`) — so two packages never share a key.
 */
function keySegment(id: string): string {
	const bare = id.replace(/@[^@/#]*$/, '')
	const colon = bare.indexOf(':')
	if (colon === -1) return bare
	const ns = bare.slice(0, colon)
	const tail = bare.slice(bare.lastIndexOf('/') + 1).replace(/^[^:]*:/, '')
	return ns === 'core' ? tail : `${ns}:${tail}`
}

/** A trigger's half of a registration key. @experimental */
export function triggerKeyOf(trigger: Trigger | { family: string; [k: string]: unknown }): string {
	switch (trigger.family) {
		case 'event':
			return keySegment((trigger as { event: string }).event)
		case 'action': {
			const identity = (trigger as { action: string }).action
			const hash = identity.lastIndexOf('#')
			return `${keySegment(identity.slice(0, hash))}#${identity.slice(hash + 1)}`
		}
		case 'routine':
			return keySegment((trigger as { cadence: CadenceRef }).cadence.id)
		default: {
			const ref = (trigger as { ref?: unknown }).ref
			return `${trigger.family}:${typeof ref === 'string' ? keySegment(ref) : ''}`
		}
	}
}

/**
 * A registration's stable identity, derived (A8): `<trigger key>→<pipeline
 * key>` — `message-respond→story-reply`, `every-n-turns→story-sweep`,
 * `story-narrate#narrate→story-narrate`. Pure; the host derives the same key
 * for a row it stores.
 * @experimental
 * @ruling A8, R34
 */
export function registrationKeyOf(
	trigger: Trigger | TriggerInput,
	pipeline: string | { id: string },
): string {
	// Through `triggerOf`, which reads an event object (whose own `family` is
	// data or action) before a trigger (whose `family` is event, action, …).
	const t = triggerOf(trigger as TriggerInput).trigger
	const id = typeof pipeline === 'string' ? pipeline : pipeline.id
	return `${triggerKeyOf(t)}${REGISTRATION_KEY_JOIN}${keySegment(id)}`
}

// ── register() ──────────────────────────────────────────────────────────────

/** Registrations written with a string where an object exists (R30) — warned at the door. */
const spelled = new WeakMap<object, string[]>()
/** The version range a `use('…@range')` pipeline carried — the preset's requirement (A16). */
const ranges = new WeakMap<object, string>()

/** A trigger read from what `register()` was handed; `spelled` names the strings. @internal */
export function triggerOf(input: TriggerInput): { trigger: Trigger; spelled?: string } {
	if (typeof input === 'string') {
		if (EVENT_ID.test(input))
			return { trigger: { family: 'event', event: input }, spelled: input }
		if (CADENCE_ID.test(input))
			return {
				trigger: {
					family: 'routine',
					cadence: Object.freeze({ id: input, options: Object.freeze({}) }),
				},
				spelled: input,
			}
		if (isActionIdentity(input))
			return { trigger: { family: 'action', action: input }, spelled: input }
		throw new Error(
			`register(): '${input}' is not an event id, an action identity or a cadence id — pass the object: ` +
				`coreEvents.messageRespond, spec.actions.<key>, everyNTurns({ n: 5 })`,
		)
	}
	if (isSessionEventDecl(input) || isEventDef(input))
		return { trigger: { family: 'event', event: eventIdOf(input) } }
	if (isActionHandle(input)) return { trigger: { family: 'action', action: input.identity } }
	if (isCadenceRef(input)) return { trigger: { family: 'routine', cadence: input } }
	if (
		input &&
		typeof input === 'object' &&
		typeof (input as { family?: unknown }).family === 'string'
	)
		return { trigger: input as Trigger }
	throw new Error(
		`register(): the trigger is ${input === null ? 'null' : typeof input} — pass an event (coreEvents.…), ` +
			`an action (spec.actions.<key>) or a cadence (everyNTurns(…), systemCron(…), …)`,
	)
}

/** The spec id a registration names, and the range a `use()` carried. @internal */
export function pipelineOf(input: PipelineInput): { id: string; spelled?: string; range?: string } {
	if (typeof input === 'string') {
		if (!input)
			throw new Error(
				"register(): the pipeline is an empty string — pass the spec you built, or use('<spec id>')",
			)
		return { id: input.replace(/@\d+$/, ''), spelled: input }
	}
	if (input && typeof input === 'object' && (input as ExternalRef).kind === 'external-ref')
		return {
			id: (input as ExternalRef).id,
			...((input as ExternalRef).range ? { range: (input as ExternalRef).range } : {}),
		}
	if (input && typeof input === 'object' && typeof (input as { id?: unknown }).id === 'string')
		return { id: (input as { id: string }).id }
	throw new Error(
		`register(): the pipeline is ${input === null ? 'null' : typeof input} — pass the spec you built, or use('<spec id>')`,
	)
}

/**
 * Register a pipeline on a trigger — the one way a pipeline is mounted. The
 * key is derived (A8); `opts` are the registration's `when`, `values`,
 * `order` and, for a routine, `mode`, `allowStacking` and `caps`. Nothing
 * here refuses what the door judges (fit, cadence options, duplicates): call
 * `registrationFindings`, which a package build and a host both do.
 * @experimental
 * @ruling D1, A8, R30
 */
export function register(
	trigger: TriggerInput,
	pipeline: PipelineInput,
	opts: RegistrationOptions = {},
): RegistrationDecl {
	const t = triggerOf(trigger)
	const p = pipelineOf(pipeline)
	if (opts && typeof opts !== 'object')
		throw new Error('register(): options are an object — { when?, values?, order?, mode?, … }')
	for (const k of Object.keys(opts ?? {}))
		if (!(OPTION_KEYS as readonly string[]).includes(k))
			throw new Error(
				`register(): '${k}' is not a registration option — one of ${OPTION_KEYS.join(', ')}`,
			)
	const decl: RegistrationDecl = Object.freeze({
		key: registrationKeyOf(t.trigger, p.id),
		trigger: Object.freeze({ ...t.trigger }) as Trigger,
		pipeline: p.id,
		...Object.fromEntries(
			OPTION_KEYS.filter((k) => opts?.[k] !== undefined).map((k) => [k, opts[k]]),
		),
	})
	const strings = [t.spelled, p.spelled].filter((s): s is string => !!s)
	if (strings.length) spelled.set(decl, strings)
	if (p.range) ranges.set(decl, p.range)
	return decl
}

/** The `use('…@range')` range a registration's pipeline carried, if any (A16). @internal */
export const registrationRange = (decl: RegistrationDecl): string | undefined => ranges.get(decl)

// ── The door ────────────────────────────────────────────────────────────────

/**
 * What the door is handed beside the registrations. Every field is
 * optional: a check the context cannot support is skipped, never guessed.
 * @experimental
 */
export interface RegistrationContext {
	/** Resolve a pipeline by spec id — the specs this build or install knows. Absent: pipelines, fit and emits are not checked. */
	pipeline?: (id: string) => BuiltSpec | SpecDocument | undefined
	/**
	 * Pipelines this context cannot judge — another package's, which a
	 * package build records as a requirement and the instance that has it
	 * checks. Neither resolved nor called missing.
	 */
	external?: (id: string) => boolean
	/** The trigger families the host supports (LS1). Default: event, action, routine. */
	families?: readonly TriggerFamily[]
	/** Whether the session (or the genre's sessions) has a story clock. `false` refuses story-clock cadences. */
	storyClock?: boolean
	/** The system's cron caps (R11): a registration's own may not exceed them. */
	caps?: RoutineCaps
	/** What the registrations are, for sentences — `the genre's defaults`, `preset 'story-minimal'`. */
	layer?: string
}

const MAX_ORDER = 1_000_000

/** Every pipeline a registration list names that emits — `{ event → [emitted] }` per registration. */
function emitsOf(p: BuiltSpec | SpecDocument | undefined): string[] {
	return [...((p as { emits?: readonly string[] } | undefined)?.emits ?? [])]
}

/** The event a registration listens to, when it listens to one (an event, or a routine on `onEvent`). */
function listenedEvent(d: RegistrationDecl): string | undefined {
	if (d.trigger?.family === 'event') return d.trigger.event
	if (d.trigger?.family === 'routine' && d.trigger.cadence?.id === ON_EVENT.id) {
		const ev = d.trigger.cadence.options?.event
		return typeof ev === 'string' ? ev : undefined
	}
	return undefined
}

/**
 * Cycles among emitted events (A12): a registration listening to E runs a
 * pipeline that emits F, a registration listening to F runs one that emits E.
 * Each cycle once, as the events in order.
 * @experimental
 * @ruling A12
 */
export function emitCycles(
	decls: readonly RegistrationDecl[],
	pipeline: (id: string) => BuiltSpec | SpecDocument | undefined,
): string[][] {
	const edges = new Map<string, Set<string>>()
	for (const d of decls) {
		const ev = listenedEvent(d)
		if (!ev) continue
		for (const out of emitsOf(pipeline(d.pipeline))) {
			const set = edges.get(ev) ?? new Set<string>()
			set.add(out)
			edges.set(ev, set)
		}
	}
	const cycles: string[][] = []
	const seen = new Set<string>()
	const visit = (node: string, path: string[]) => {
		const at = path.indexOf(node)
		if (at !== -1) {
			const cycle = path.slice(at)
			const id = [...cycle].sort().join('|')
			if (!seen.has(id)) {
				seen.add(id)
				cycles.push([...cycle, node])
			}
			return
		}
		if (path.length > 64) return
		for (const next of edges.get(node) ?? []) visit(next, [...path, node])
	}
	for (const start of [...edges.keys()].sort()) visit(start, [])
	return cycles
}

const err = (law: string, message: string, fix: string): Finding => ({
	law,
	severity: 'error',
	message,
	fix,
})
const warn = (law: string, message: string, fix: string): Finding => ({
	law,
	severity: 'warning',
	message,
	fix,
})

/** The slots a registration's values may set (R38): never a connection. */
const VALUE_SLOTS = [
	'prompts',
	'template',
	'variables',
	'sampling',
	'speechSampling',
	'loadout',
	'params',
	'settings',
	'scripts',
] as const

/**
 * **The one registration door** (§11-2): every origin — the genre's defaults,
 * a preset, a session row, a future tool — is judged here, by the SDK at a
 * package build and by the host at install, update and publish (A11).
 *
 *  · the family is one the host supports (LS1);
 *  · the trigger names something declared — an event, an action its spec
 *    contributes, a cadence with valid options (R10, R15, R20) and, on the
 *    story clock, a session that has one;
 *  · the pipeline resolves, and **fits** the trigger (R4, R12);
 *  · routine-only fields (`mode`, `allowStacking`, `caps`) sit on routines,
 *    caps on the system clock and within the system's (R11);
 *  · `values` set the slots a registration may (never a connection), on
 *    nodes the pipeline has;
 *  · the pipeline exposes no model plumbing to the owner (ruled 10-12);
 *  · two registrations alike **warn** (R34); a cycle among emitted events
 *    **refuses** (A12); a string where an object exists **warns** (R30).
 * @experimental
 * @ruling §11-2, R4, R11, R12, R30, R34, A11, A12, LS1
 */
export function registrationFindings(
	decls: readonly RegistrationDecl[],
	ctx: RegistrationContext = {},
): Finding[] {
	const out: Finding[] = []
	const layer = ctx.layer ? ` in ${ctx.layer}` : ''
	const families = ctx.families ?? TRIGGER_FAMILIES
	const counts = new Map<string, number>()
	for (const [i, d] of decls.entries()) {
		const at = `registration '${d?.key ?? `#${i + 1}`}'${layer}`
		if (!d || typeof d !== 'object' || !d.trigger || typeof d.pipeline !== 'string') {
			out.push(
				err(
					'registration shape',
					`${at} is not a registration`,
					'make it with register(trigger, pipeline, { … })',
				),
			)
			continue
		}
		counts.set(d.key, (counts.get(d.key) ?? 0) + 1)
		const strings = spelled.get(d)
		if (strings)
			out.push(
				warn(
					'registration reference',
					`${at} names ${strings.map((s) => `'${s}'`).join(' and ')} as a string`,
					'pass the declared object — coreEvents.…, spec.actions.<key>, a cadence, the spec value or use(…) — so a typo is a compile error (R30)',
				),
			)
		const family = d.trigger.family
		if (!(families as readonly string[]).includes(family)) {
			out.push(
				err(
					'registration family',
					`${at}: ${family} pipelines are not available on this host yet`,
					`register on ${families.join(', ')}`,
				),
			)
			continue
		}
		const expected = registrationKeyOf(d.trigger, d.pipeline)
		if (d.key !== expected)
			out.push(
				err(
					'registration key',
					`${at}: the key is '${d.key}', and its trigger and pipeline derive '${expected}'`,
					'never type a key — register() derives it (A8)',
				),
			)

		// The trigger.
		let action: { venue?: unknown; collects?: { recipients?: unknown } } | undefined
		if (d.trigger.family === 'event') {
			const ev = d.trigger.event
			if (!eventById(ev))
				out.push(
					err(
						'registration trigger',
						`${at}: ${notADeclaredEvent(ev)}`,
						'register on a declared event',
					),
				)
			else if (ev === 'core:event/turn-order-changed@1')
				out.push(
					err(
						'registration trigger',
						`${at}: '${ev}' is core-internal — the turn-order push reads it`,
						'register on core:event/message-completed@1 or another session event',
					),
				)
		} else if (d.trigger.family === 'action') {
			const identity = d.trigger.action
			if (!isActionIdentity(identity))
				out.push(
					err(
						'registration trigger',
						`${at}: '${identity}' is not an action identity`,
						"name the action by its handle — spec.actions.<key> ('<spec slug>#<key>')",
					),
				)
			else if (ctx.pipeline) {
				const hash = identity.lastIndexOf('#')
				const specId = identity.slice(0, hash)
				const declarer = ctx.external?.(specId) ? undefined : ctx.pipeline(specId)
				if (declarer) {
					const contributes =
						'meta' in declarer
							? declarer.meta.contributes
							: (declarer as SpecDocument).contributes
					const found = actionsOf({ id: declarer.id, contributes }).find(
						(a) => a.key === identity.slice(hash + 1),
					)
					if (!found)
						out.push(
							err(
								'registration trigger',
								`${at}: '${specId}' declares no action '${identity.slice(hash + 1)}'`,
								'name an action the spec contributes — spec.actions.<key>',
							),
						)
					else action = found
				}
			}
		} else if (d.trigger.family === 'routine') {
			for (const f of cadenceOptionFindings(d.trigger.cadence, `${at} cadence`))
				out.push(
					err(
						'cadence options',
						f,
						'state the cadence with its ready-made function — everyNTurns({ n }), systemCron({ every, unit }), …',
					),
				)
			if (
				ctx.storyClock === false &&
				d.trigger.cadence &&
				cadenceClock(d.trigger.cadence) === 'story'
			)
				out.push(
					err(
						'cadence clock',
						`${at}: needs a story clock, and the session has none`,
						'attach a lorebook with a calendar, or register on another cadence',
					),
				)
		}

		// Routine-only fields.
		const routine = d.trigger.family === 'routine'
		for (const k of ['mode', 'allowStacking', 'caps'] as const)
			if (d[k] !== undefined && !routine)
				out.push(
					err(
						'routine fields',
						`${at}: '${k}' is a routine's — this registration is on ${d.trigger.family === 'event' ? 'an event' : 'an action'}`,
						`drop '${k}'`,
					),
				)
		if (d.mode !== undefined && !ROUTINE_MODES.includes(d.mode))
			out.push(
				err(
					'routine fields',
					`${at}: mode '${String(d.mode)}' is not one of ${ROUTINE_MODES.join(', ')}`,
					"use 'off', 'review' or 'full'",
				),
			)
		if (d.allowStacking !== undefined && typeof d.allowStacking !== 'boolean')
			out.push(
				err(
					'routine fields',
					`${at}: allowStacking is true or false`,
					'leave it out for the default (off)',
				),
			)
		if (d.caps !== undefined) {
			if (routine && cadenceClock(d.trigger.cadence as CadenceRef) !== 'system')
				out.push(
					warn(
						'registration caps',
						`${at}: caps apply to routines on the system clock, and this one is not`,
						'drop caps',
					),
				)
			for (const k of ['idleTimeoutMinutes', 'maxRunsInRow'] as const) {
				const v = d.caps?.[k]
				if (v === undefined) continue
				if (typeof v !== 'number' || !Number.isInteger(v) || v < 1)
					out.push(
						err(
							'registration caps',
							`${at}: caps.${k} is a whole number, 1 or more`,
							`set caps.${k} to a whole number`,
						),
					)
				else if (ctx.caps?.[k] !== undefined && v > ctx.caps[k]!)
					out.push(
						err(
							'registration caps',
							`${at}: caps.${k} is ${v}, above the system's ${ctx.caps[k]}`,
							`set it to ${ctx.caps[k]} or less — each layer is at most the one above (R11)`,
						),
					)
			}
		}
		if (
			d.order !== undefined &&
			(typeof d.order !== 'number' ||
				!Number.isInteger(d.order) ||
				Math.abs(d.order) > MAX_ORDER)
		)
			out.push(
				err(
					'registration order',
					`${at}: order is a whole number`,
					'order registrations on one trigger with 0, 10, 20 …',
				),
			)
		if (d.when !== undefined)
			for (const f of conditionFindings(d.when, `${at} when`))
				out.push(
					err(
						'registration when',
						f,
						'build the condition with the typed builders — isTrue(…), eq(…), and(…)',
					),
				)
		if (d.label !== undefined)
			for (const f of i18nFindings(d.label, `${at} label`))
				out.push(err('registration label', f, "a string or a locale map with 'en'"))

		// The pipeline: resolvable, fitting, values on its nodes, no plumbing exposed.
		const elsewhere = ctx.external?.(d.pipeline) === true
		const p = elsewhere ? undefined : ctx.pipeline?.(d.pipeline)
		if (ctx.pipeline && !p && !elsewhere)
			out.push(
				err(
					'registration pipeline',
					`${at} runs '${d.pipeline}', which is not installed`,
					'register a pipeline this package ships or requires',
				),
			)
		if (d.values !== undefined) {
			if (!d.values || typeof d.values !== 'object' || Array.isArray(d.values))
				out.push(
					err(
						'registration values',
						`${at}: values are { [step]: { [slot]: value } }`,
						'set values per step and slot',
					),
				)
			else
				for (const [nodeKey, slots] of Object.entries(d.values)) {
					if (p && !p.nodes.some((n) => n.key === nodeKey))
						out.push(
							err(
								'registration values',
								`${at} sets values on '${nodeKey}', which '${d.pipeline}' has no step called`,
								`one of ${p.nodes.map((n) => `'${n.key}'`).join(', ')}`,
							),
						)
					for (const slot of Object.keys(slots ?? {}))
						if (slot === 'connection')
							out.push(
								err(
									'registration values',
									`${at} sets a connection on '${nodeKey}'`,
									"a registration never names a connection — what a step runs on is an administrator's loadout",
								),
							)
						else if (!(VALUE_SLOTS as readonly string[]).includes(slot))
							out.push(
								err(
									'registration values',
									`${at} sets '${slot}' on '${nodeKey}'`,
									`set one of ${VALUE_SLOTS.join(', ')}`,
								),
							)
				}
		}
		if (p) {
			const fit = fitOf(p, d.trigger, { action })
			if (!fit.ok)
				out.push(
					err(
						'registration fit',
						`${at}: ${fit.sentence}`,
						'register it on a trigger that carries what it reads, or a pipeline that reads less (R4)',
					),
				)
			for (const n of p.nodes) {
				const def = getDefinition(`${n.definitionId}@${n.definitionVersion}`)
				for (const [slotName, slot] of Object.entries(def?.slots ?? {})) {
					const schema = (slot as { schema?: Record<string, unknown> }).schema
					if (!schema) continue
					for (const f of exposureFindings(
						schema as never,
						`'${d.pipeline}' ${n.key}.${slotName}`,
					))
						out.push(
							err(
								'exposed plumbing',
								`${at}: ${f}`,
								'model plumbing is never exposed to a member (ruled 10-12)',
							),
						)
				}
			}
			out.push(
				...pipelineDefaultsFindings(p).map((m) =>
					warn(
						'pipeline defaults',
						`${at}: ${m}`,
						"move the preset's values into a registration's values, or into .defaults()",
					),
				),
			)
		}
	}
	for (const [key, n] of counts)
		if (n > 1)
			out.push(
				warn(
					'registration duplicate',
					`registration '${key}'${layer} is declared ${n} times — the same trigger and pipeline`,
					'keep one: two alike are one registration (R34)',
				),
			)
	if (ctx.pipeline)
		for (const cycle of emitCycles(decls, ctx.pipeline))
			out.push(
				err(
					'emits cycle',
					`registrations${layer} form a cycle through emitted events: ${cycle.join(' → ')}`,
					"break it — drop one registration, or a pipeline's emits (A12)",
				),
			)
	return out
}

/**
 * Author presets a pipeline ships that are not its declared defaults (R38,
 * PLAN-layering D5): only the `default: true` one (`.defaults()`) is read;
 * the rest are ignored, each named here.
 * @experimental
 * @ruling R38
 */
export function pipelineDefaultsFindings(p: {
	id: string
	presets?: ReadonlyArray<{ slug: string; default?: boolean }>
}): string[] {
	return (p.presets ?? [])
		.filter((x) => !x.default)
		.map(
			(x) =>
				`'${p.id}' ships the author preset '${x.slug}', which is ignored — a pipeline's values come from its declared defaults and the registrations that change them (R38)`,
		)
}

// ── Presets as changes, and the merge (R2, R22; D4) ─────────────────────────

/**
 * One change a preset makes to a registration of the genre's defaults —
 * named by its key (derived from the registration the preset was handed).
 * @experimental
 */
export interface RegistrationChange {
	readonly key: string
	readonly values?: RegistrationValues
	readonly mode?: RoutineMode
	readonly when?: ConditionDecl
	readonly allowStacking?: boolean
	readonly caps?: RoutineCaps
	readonly order?: number
	readonly label?: I18n
}

/**
 * A preset's changes on top of the genre's defaults (R2): registrations it
 * adds, the keys it drops, and the changes it makes to the rest.
 * @experimental
 * @ruling R2, R3
 */
export interface PresetRegistrationChanges {
	readonly register?: readonly RegistrationDecl[]
	readonly drop?: readonly string[]
	readonly change?: readonly RegistrationChange[]
}

/**
 * One session row over the effective registrations: a change to one
 * (`mode`, `values`, …), `dropped` (switched off by the session — gone from
 * the list), or a whole registration of the session's own origin
 * (`registration`, §11-1).
 * @experimental
 * @ruling §11-1, R37
 */
export interface SessionRegistrationRow {
	readonly key: string
	readonly dropped?: boolean
	readonly registration?: RegistrationDecl
	readonly origin?: string
	readonly mode?: RoutineMode
	readonly values?: RegistrationValues
	readonly when?: ConditionDecl
	readonly allowStacking?: boolean
	readonly caps?: RoutineCaps
	readonly order?: number
}

/** A registration as it stands in a session, with where it came from. @experimental */
export type EffectiveRegistration = RegistrationDecl & {
	/** The layer that added it: `genre`, `preset`, `session`, or a session row's own origin. */
	readonly origin: 'genre' | 'preset' | 'session' | (string & {})
	/** The layers that changed it, in order. */
	readonly changedBy?: readonly string[]
}

const CHANGE_KEYS = ['values', 'mode', 'when', 'allowStacking', 'caps', 'order', 'label'] as const

/** A copy of a registration that keeps what `register()` noted about it (a string reference, a range). */
function carried<T extends object>(from: RegistrationDecl, to: T): T {
	const s = spelled.get(from)
	if (s) spelled.set(to, s)
	const r = ranges.get(from)
	if (r) ranges.set(to, r)
	return to
}

/** Merge one layer's values over another's: node → slot, a slot's value replaced whole. */
function mergeValues(
	base: RegistrationValues | undefined,
	over: RegistrationValues | undefined,
): RegistrationValues | undefined {
	if (!over) return base
	if (!base) return over
	const out: Record<string, Record<string, unknown>> = {}
	for (const [k, v] of Object.entries(base)) out[k] = { ...v }
	for (const [k, v] of Object.entries(over)) out[k] = { ...(out[k] ?? {}), ...v }
	return out
}

function applyChange(
	r: EffectiveRegistration,
	change: Partial<RegistrationChange>,
	by: string,
): EffectiveRegistration {
	const next: Record<string, unknown> = { ...r }
	for (const k of CHANGE_KEYS) {
		if (change[k] === undefined) continue
		next[k] = k === 'values' ? mergeValues(r.values, change.values) : change[k]
	}
	next.changedBy = [...(r.changedBy ?? []), by]
	return carried(r, next) as unknown as EffectiveRegistration
}

/**
 * **Effective registrations** — the genre's defaults ⊕ a preset's changes ⊕
 * a session's rows (PLAN-layering D4). Pure; the host's resolver reuses it.
 * A dropped registration is gone; a routine switched Off stays, with
 * `mode: 'off'` (R8). Sorted by `order`, then key (R24). Within one layer the
 * first of two alike wins — the door warns about the second (R34).
 * @experimental
 * @ruling R2, R8, R22, R24, R34
 */
export function effectiveRegistrations(
	genreDefaults: readonly RegistrationDecl[] | undefined,
	presetChanges?: PresetRegistrationChanges | null,
	sessionRows?: readonly SessionRegistrationRow[] | null,
): EffectiveRegistration[] {
	const byKey = new Map<string, EffectiveRegistration>()
	for (const r of genreDefaults ?? [])
		if (!byKey.has(r.key)) byKey.set(r.key, carried(r, { ...r, origin: 'genre' }))
	if (presetChanges) {
		for (const key of presetChanges.drop ?? []) byKey.delete(key)
		for (const c of presetChanges.change ?? []) {
			const r = byKey.get(c.key)
			if (r) byKey.set(c.key, applyChange(r, c, 'preset'))
		}
		const added = new Set<string>()
		for (const r of presetChanges.register ?? []) {
			if (added.has(r.key)) continue
			added.add(r.key)
			byKey.set(r.key, carried(r, { ...r, origin: 'preset' }))
		}
	}
	for (const row of sessionRows ?? []) {
		if (row.dropped) {
			byKey.delete(row.key)
			continue
		}
		if (row.registration) {
			byKey.set(
				row.registration.key,
				carried(row.registration, { ...row.registration, origin: row.origin ?? 'session' }),
			)
			continue
		}
		const r = byKey.get(row.key)
		if (r) byKey.set(row.key, applyChange(r, row, 'session'))
	}
	return [...byKey.values()].sort(
		(a, b) => (a.order ?? 0) - (b.order ?? 0) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0),
	)
}

/** Do two triggers name the same thing (event, action, or cadence id)? @experimental */
export function sameTrigger(a: Trigger, b: Trigger): boolean {
	if (a.family !== b.family) return false
	if (a.family === 'event') return a.event === (b as typeof a).event
	if (a.family === 'action') return a.action === (b as typeof a).action
	if (a.family === 'routine') return a.cadence.id === (b as typeof a).cadence.id
	return false
}

/**
 * ⏳ A preset's changes, read from whatever it states (PLAN-layering D4):
 * `registrations` when it states them; otherwise derived from its
 * pre-registration form — the aliases kept to 0.7:
 *
 *  · `bindings` → for each event, the genre's defaults on that event are
 *    dropped and the bound spec registered (a binding replaced the event's
 *    one pipeline); a binding the defaults already hold changes nothing.
 *  · `actions.include` → the listed actions registered, and the defaults'
 *    action registrations not listed dropped (the include list was the whole
 *    set). Absent: the defaults' actions stand.
 *
 * `aliasConfigs` names, per derived registration key, the named
 * configuration a binding carried — configurations retire (R38); the host's
 * data upgrade turns each into that registration's values.
 * @experimental
 */
export function presetChangesOf(
	preset: Pick<PresetDecl, 'bindings' | 'actions'> & {
		registrations?: PresetRegistrationChanges
	},
	genreDefaults?: readonly RegistrationDecl[],
): PresetRegistrationChanges & { aliasConfigs?: Readonly<Record<string, string>> } {
	if (preset.registrations) return preset.registrations
	const defaults = genreDefaults ?? []
	const register: RegistrationDecl[] = []
	const drop = new Set<string>()
	const aliasConfigs: Record<string, string> = {}
	for (const [event, binding] of Object.entries(preset.bindings ?? {})) {
		if (!binding?.spec) continue
		const trigger: Trigger = { family: 'event', event }
		const key = registrationKeyOf(trigger, binding.spec)
		if (binding.config) aliasConfigs[key] = binding.config
		if (defaults.some((d) => d.key === key)) continue
		for (const d of defaults)
			if (d.trigger.family === 'event' && d.trigger.event === event) drop.add(d.key)
		register.push(Object.freeze({ key, trigger, pipeline: binding.spec }))
	}
	if (preset.actions) {
		const included = new Set(preset.actions.include)
		for (const d of defaults)
			if (d.trigger.family === 'action' && !included.has(d.trigger.action)) drop.add(d.key)
		for (const identity of preset.actions.include) {
			const hash = identity.lastIndexOf('#')
			const trigger: Trigger = { family: 'action', action: identity }
			const key = registrationKeyOf(trigger, identity.slice(0, hash))
			if (defaults.some((d) => d.key === key)) continue
			register.push(Object.freeze({ key, trigger, pipeline: identity.slice(0, hash) }))
		}
	}
	return {
		...(register.length ? { register } : {}),
		...(drop.size ? { drop: [...drop] } : {}),
		...(Object.keys(aliasConfigs).length ? { aliasConfigs } : {}),
	}
}
