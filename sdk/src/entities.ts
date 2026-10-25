/**
 * 🚧 **Entities and fit** (R4, R12, A1, A17; PLAN-layering D3).
 *
 * A pipeline is mounted, it does not lock (§2): whether it may be registered
 * on a trigger is **derived from its graph**. The steps' data references into
 * the inlet name the inlet ports the pipeline reads; the inlet's declaration
 * says which **entity** each of those ports stands for (`Descriptor.entities`);
 * and every trigger states what its body **carries** — an event its
 * `EventDef.carries`, a cadence its `CadenceDef.carries` (beside the session a
 * routine always has), an action the session, the person who pressed and
 * whose turn it is. A registration fits when everything read is carried.
 *
 * ```ts
 * fitOf(storyReply, { family: 'event', event: sessionEvents.sceneOpened })
 * // { ok: false, missing: ['speaker'], sentence: 'Story reply reads the speaker; scene-opened carries none.' }
 * ```
 *
 * A port maps to an entity only where reading it **needs** that entity — the
 * user-message inlet's `messageId` (the row a verb re-drives, null on a fresh
 * turn) is left out, so reading an optional port never narrows fit. An inlet
 * this SDK does not know (another package's) cannot be judged and fits.
 * @experimental
 * @ruling R4, R12, A1, A17
 */

import { collectDataRefs, type DataRef } from './refs.js'
import { getDefinition } from './descriptors.js'
import { eventById, type EventDef } from './events.js'
import { actionsOf, type NormalizedAction, type VenueKind } from './actions.js'
import { i18nText } from './i18n.js'
import type { BuiltSpec } from './builder.js'
import type { SpecDocument } from './document.js'
import type { Trigger } from './registrations.js'
import { cadenceCarries } from './cadences.js'

/**
 * What a trigger's body carries and what an inlet port stands for — the
 * vocabulary fit is computed over. Open, so a later trigger family (Live) or a
 * package may name its own.
 *
 *  · `session` — the session: its scope and settings document.
 *  · `message` — one message row.
 *  · `speaker` — whose turn it is: who the line comes out as.
 *  · `actor` — who pressed or sent: the person (or the participant acting for them).
 *  · `cast-member` — one or more seated participants, named by the trigger.
 *  · `subject` — what a change is about: a card, a participant whose stats moved.
 *  · `user` — a person's account (`user:<id>`).
 *  · `slot` — the attribute slot that matched or moved.
 *  · `clock` — the story clock's from and to.
 *  · `scene` — a live scene.
 *  · `form` — a form block in a message.
 * @experimental
 */
export type EntityKind =
	| 'session'
	| 'message'
	| 'speaker'
	| 'actor'
	| 'cast-member'
	| 'subject'
	| 'user'
	| 'slot'
	| 'clock'
	| 'scene'
	| 'form'
	| (string & {})

/** The entity kinds core names, in the order a sentence lists them. @experimental */
export const ENTITY_KINDS = [
	'session',
	'message',
	'speaker',
	'actor',
	'cast-member',
	'subject',
	'user',
	'slot',
	'clock',
	'scene',
	'form',
] as const

/** How a sentence names each entity kind. @experimental */
export const ENTITY_WORDS: Readonly<Record<string, string>> = Object.freeze({
	session: 'session',
	message: 'message',
	speaker: 'speaker',
	actor: 'person who pressed',
	'cast-member': 'cast member',
	subject: 'subject',
	user: 'user',
	slot: 'slot',
	clock: 'story clock',
	scene: 'scene',
	form: 'form',
})

/** An entity kind as a sentence names it. @experimental */
export const entityWord = (k: EntityKind): string => ENTITY_WORDS[k] ?? String(k).replace(/-/g, ' ')

/** What a trigger whose body says nothing carries: the session it happened in. @experimental */
export const DEFAULT_CARRIES: readonly EntityKind[] = Object.freeze(['session'])

/**
 * What every action press carries: the session, the person who pressed, and
 * whose turn it is (the host resolves a speaker on every fire — null is the
 * narrator, a legitimate value). A `message`-venue action adds the message
 * its row stands for; an action collecting recipients adds the cast members.
 * @experimental
 */
export const ACTION_CARRIES: readonly EntityKind[] = Object.freeze(['session', 'actor', 'speaker'])

/** The routine inlet's id, unversioned — routines enter through it and nothing else does. @experimental */
export const ROUTINE_INLET = 'core:inlet/routine'

/** What an action's declaration adds to `ACTION_CARRIES`. @experimental */
export function actionCarries(
	decl?: {
		venue?: unknown
		collects?: { recipients?: unknown } | undefined
	} | null,
): EntityKind[] {
	const out: EntityKind[] = [...ACTION_CARRIES]
	const venues = Array.isArray(decl?.venue) ? decl!.venue : decl?.venue ? [decl.venue] : []
	if (venues.some((v) => (v as { kind?: VenueKind })?.kind === 'message')) out.push('message')
	if (decl?.collects?.recipients) out.push('cast-member')
	return out
}

/** What an event's body carries — its declaration's `carries`, else the session. @experimental */
export function eventCarries(event: string | EventDef): readonly EntityKind[] {
	const def = typeof event === 'string' ? eventById(event) : event
	return def?.carries ?? DEFAULT_CARRIES
}

/** A spec or its compiled document — fit reads either. @experimental */
export type FitPipeline = BuiltSpec | SpecDocument

const nodesOf = (p: FitPipeline) =>
	p.nodes as ReadonlyArray<{
		key: string
		kind: string
		definitionId: string
		definitionVersion: number
		config: unknown
	}>

const clausesOf = (p: FitPipeline) =>
	(p.clauses ?? []) as ReadonlyArray<{ over?: unknown; on?: unknown; repeatWhile?: unknown }>

/** The inlet node of a pipeline, or undefined. @experimental */
export function inletNodeOf(p: FitPipeline) {
	return nodesOf(p).find((n) => n.kind === 'inlet')
}

/**
 * The inlet ports a pipeline's steps read — every data reference into the
 * inlet node, from node configs and clause sources (`over`, `on`,
 * `repeatWhile`). Sorted, each once.
 * @experimental
 */
export function inletPortsRead(p: FitPipeline): string[] {
	const inlet = inletNodeOf(p)
	if (!inlet) return []
	const refs: DataRef[] = []
	for (const n of nodesOf(p))
		if (n.key !== inlet.key) refs.push(...collectDataRefs(n.config).map((r) => r.ref))
	for (const c of clausesOf(p))
		for (const v of [c.over, c.on, c.repeatWhile])
			if (v !== undefined) refs.push(...collectDataRefs(v).map((r) => r.ref))
	return [...new Set(refs.filter((r) => r.node === inlet.key).map((r) => r.port))].sort()
}

/** The port → entity map an inlet declares, or undefined when this SDK does not know the inlet. @experimental */
export function inletEntitiesOf(p: FitPipeline): Readonly<Record<string, EntityKind>> | undefined {
	const inlet = inletNodeOf(p)
	if (!inlet) return undefined
	const def = getDefinition(`${inlet.definitionId}@${inlet.definitionVersion}`)
	if (!def) return undefined
	return (def as { entities?: Readonly<Record<string, EntityKind>> }).entities ?? {}
}

/**
 * The entities a pipeline needs from whatever triggers it — the entity of
 * every inlet port its steps read. Empty for an inlet this SDK does not know.
 * @experimental
 * @ruling R4
 */
export function entitiesRead(p: FitPipeline): EntityKind[] {
	const map = inletEntitiesOf(p)
	if (!map) return []
	const out = new Set<EntityKind>()
	for (const port of inletPortsRead(p)) {
		const e = map[port]
		if (e) out.add(e)
	}
	return orderEntities([...out])
}

const orderEntities = (list: EntityKind[]): EntityKind[] => {
	const rank = (k: EntityKind) => {
		const i = (ENTITY_KINDS as readonly string[]).indexOf(k)
		return i === -1 ? ENTITY_KINDS.length : i
	}
	return [...new Set(list)].sort(
		(a, b) => rank(a) - rank(b) || String(a).localeCompare(String(b)),
	)
}

/** The action a pipeline declares under `key`, read off its contributions. */
function declaredAction(
	p: FitPipeline | undefined,
	specId: string,
	key: string,
): NormalizedAction | undefined {
	if (!p || p.id !== specId) return undefined
	const contributes = 'meta' in p ? p.meta.contributes : (p as SpecDocument).contributes
	return actionsOf({ id: p.id, contributes }).find((a) => a.key === key)
}

/**
 * What a trigger carries. An event: its declaration's `carries`. A routine:
 * the session, plus what the event its cadence wakes at carries. An action: the
 * session, the person who pressed and whose turn it is, plus the message
 * (message venue) and cast members (collected recipients) its declaration
 * names — read off `pipeline` when it declares the action, or `ctx.action`.
 * @experimental
 */
export function triggerCarries(
	trigger: Trigger | { family: string },
	ctx?: {
		pipeline?: FitPipeline
		action?: { venue?: unknown; collects?: { recipients?: unknown } } | null
	},
): EntityKind[] {
	switch (trigger.family) {
		case 'event':
			return orderEntities([...eventCarries((trigger as { event: string }).event)])
		case 'routine':
			return orderEntities([
				'session',
				...cadenceCarries((trigger as Extract<Trigger, { family: 'routine' }>).cadence),
			])
		case 'action': {
			const identity = (trigger as { action: string }).action
			const hash = identity.lastIndexOf('#')
			const decl =
				ctx?.action ??
				declaredAction(ctx?.pipeline, identity.slice(0, hash), identity.slice(hash + 1))
			return orderEntities(actionCarries(decl ?? null))
		}
		default:
			return [...DEFAULT_CARRIES]
	}
}

/** Whether a registration fits, and if not, what is missing in words. @experimental */
export type Fit = { ok: true } | { ok: false; missing: EntityKind[]; sentence: string }

const humanize = (slug: string): string => {
	const words = slug.replace(/[-_]/g, ' ').trim()
	return words ? words[0]!.toUpperCase() + words.slice(1) : slug
}

/** What a sentence calls a pipeline: its declared name, else its slug tail humanised. @experimental */
export function pipelineName(p: FitPipeline | { id: string }): string {
	const meta = (p as { meta?: { i18n?: { name?: unknown } } }).meta
	const named = meta?.i18n?.name !== undefined ? i18nText(meta.i18n.name as never) : undefined
	if (named) return named
	const tail = p.id.slice(p.id.lastIndexOf('/') + 1)
	return humanize(tail)
}

/** What a sentence calls a trigger: the event's slug, the cadence's slug, the action's identity. @experimental */
export function triggerName(trigger: Trigger | { family: string }): string {
	const tail = (id: string) => id.slice(id.lastIndexOf('/') + 1).replace(/@\d+$/, '')
	switch (trigger.family) {
		case 'event':
			return tail((trigger as { event: string }).event)
		case 'routine':
			return tail((trigger as Extract<Trigger, { family: 'routine' }>).cadence.id)
		case 'action':
			return tail((trigger as { action: string }).action)
		default:
			return `a ${trigger.family} trigger`
	}
}

const listWords = (kinds: readonly EntityKind[]): string => {
	const words = kinds.map((k) => `the ${entityWord(k)}`)
	return words.length <= 1
		? (words[0] ?? '')
		: `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`
}

/**
 * Does `pipeline` fit `trigger`? Fit derives from the graph: the entities
 * of the inlet ports its steps read must all be carried by the trigger, and
 * the family must match the inlet — a routine enters through
 * `core:inlet/routine@1`, and nothing else does. The sentence says what is
 * missing, in the words a person reads at the registration door:
 * "Story reply reads the speaker; scene-opened carries none."
 * @experimental
 * @ruling R4, R12, A11, A17
 */
export function fitOf(
	pipeline: FitPipeline,
	trigger: Trigger | { family: string },
	ctx?: { action?: { venue?: unknown; collects?: { recipients?: unknown } } | null },
): Fit {
	const inlet = inletNodeOf(pipeline)
	const name = pipelineName(pipeline)
	const tName = triggerName(trigger)
	if (inlet) {
		const routineInlet = inlet.definitionId === ROUTINE_INLET
		if (trigger.family === 'routine' && !routineInlet)
			return {
				ok: false,
				missing: [],
				sentence: `${name} starts on '${inlet.definitionId}@${inlet.definitionVersion}'; a routine starts a pipeline through the routine inlet (${ROUTINE_INLET}@1).`,
			}
		if (trigger.family !== 'routine' && routineInlet)
			return {
				ok: false,
				missing: [],
				sentence: `${name} starts through the routine inlet, which takes routines only — ${tName} is ${/^[aeiou]/.test(trigger.family) ? 'an' : 'a'} ${trigger.family}.`,
			}
	}
	const needed = entitiesRead(pipeline)
	if (!needed.length) return { ok: true }
	const carried = new Set(triggerCarries(trigger, { pipeline, action: ctx?.action }))
	const missing = needed.filter((k) => !carried.has(k))
	if (!missing.length) return { ok: true }
	return {
		ok: false,
		missing,
		sentence: `${name} reads ${listWords(missing)}; ${tName} carries ${missing.length === 1 ? 'none' : 'none of them'}.`,
	}
}
