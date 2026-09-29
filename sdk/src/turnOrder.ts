/**
 * Turn order as state (PLAN-turn-order §4.2, ruled 2026-09-21).
 *
 * The session's ordered list of prepared turns is a **document**, not a
 * decision a run makes on the way to a reply. It lives at
 * `sessions.metadata.turnOrder`, is written by `core:outlet/set-turn-order@1`
 * and nothing else, and survives refresh and reboot (R5). A page renders it;
 * a socket fires an entry from it; the recompute is a pipeline
 * (`core:spec/<genre>-turn-order`, one per genre) that answers a session event and reads only.
 *
 * Three shapes, each open at the end so an orderer or a plugin may carry more:
 *
 *  · a **candidate** — a participant the pool admitted this run;
 *  · an **entry** — one prepared turn: who, where, what to fire, how decided;
 *  · the **order** — the entries, the candidates they were chosen from, and
 *    what the recompute answered.
 *
 * ⚠ `TurnCandidateV1.ref` is a `ParticipantRef`, whose grammar today admits
 * `character:` · `envoy:` · `user:` and the roles — not `persona:`. A
 * persona is a character row flagged `is_persona` (NOMENCLATURE §23), so its
 * reference is `character:<id>` and `kind: 'persona'` is what says which;
 * whether the grammar grows a `persona:` form is an open question the plan
 * records (§8), not one this file answers.
 */
import type { ParticipantRef } from './participants.js'

/** @experimental */
export interface TurnCandidateV1 {
	/** character:11 | persona:7 | envoy:mascot — see the file note on `persona:`. */
	ref: ParticipantRef
	kind: 'character' | 'persona' | 'envoy' | (string & {})
	name: string
	nickname?: string
	position: number
	/** Characters and personas: whose library row this is. */
	ownerUserId?: number
	/** Open: orderers and plugins may add keys; core passes them through. */
	[k: string]: unknown
}

/** @experimental */
export interface TurnEntryV1 {
	/** Who speaks. null = the pipeline's own voice (a narrator turn). */
	ref: ParticipantRef | null
	/** Where: canonical channel string (`main`, `phone:3`). Absent = the pipeline's default. */
	channel?: string
	/** What to fire: an event id or an action id. Absent = core:event/message-respond@1. */
	subject?: string
	/** How decided. Open string; core: strategy | script | voice, and pick on an entry a person fires. */
	via: string
	[k: string]: unknown
}

/** @experimental */
export interface TurnOrderV1 {
	v: 1
	order: TurnEntryV1[]
	candidates: TurnCandidateV1[]
	/** Epoch ms of the event this order answers. The write rule keeps the newer. */
	basedOnAt: number
	computedAt: number
	runId: string | null
	/** The event id that caused the recompute. */
	event: string | null
	/** The strategy definition id that produced `order`. */
	strategy: string | null
}

/**
 * The order a session has before its first recompute — and what a reader
 * answers for a document it cannot read. Frozen: a caller that wants to
 * build on it copies it.
 * @experimental
 */
export const EMPTY_TURN_ORDER: TurnOrderV1 = Object.freeze({
	v: 1 as const,
	order: Object.freeze([]) as unknown as TurnEntryV1[],
	candidates: Object.freeze([]) as unknown as TurnCandidateV1[],
	basedOnAt: 0,
	computedAt: 0,
	runId: null,
	event: null,
	strategy: null,
})

const isRecord = (v: unknown): v is Record<string, unknown> =>
	typeof v === 'object' && v !== null && !Array.isArray(v)

const isEntry = (v: unknown): v is TurnEntryV1 =>
	isRecord(v) &&
	(v.ref === null || typeof v.ref === 'string') &&
	typeof v.via === 'string' &&
	(v.channel === undefined || typeof v.channel === 'string') &&
	(v.subject === undefined || typeof v.subject === 'string')

const isCandidate = (v: unknown): v is TurnCandidateV1 =>
	isRecord(v) &&
	typeof v.ref === 'string' &&
	typeof v.kind === 'string' &&
	typeof v.name === 'string' &&
	typeof v.position === 'number'

/**
 * The turn order a session's `metadata` holds — `EMPTY_TURN_ORDER` when the
 * key is missing or the value is not a `TurnOrderV1`. Never throws: a
 * session that predates this build, or one whose metadata a hand edit
 * broke, has an empty order until its next event recomputes it (§4.1,
 * "no backfill"). The document is returned as stored, extra keys included;
 * only its shape is judged.
 * @experimental
 */
export function readTurnOrder(metadata: unknown): TurnOrderV1 {
	if (!isRecord(metadata)) return EMPTY_TURN_ORDER
	const t = metadata.turnOrder
	if (!isRecord(t)) return EMPTY_TURN_ORDER
	if (t.v !== 1) return EMPTY_TURN_ORDER
	if (!Array.isArray(t.order) || !t.order.every(isEntry)) return EMPTY_TURN_ORDER
	if (!Array.isArray(t.candidates) || !t.candidates.every(isCandidate)) return EMPTY_TURN_ORDER
	if (typeof t.basedOnAt !== 'number' || typeof t.computedAt !== 'number') return EMPTY_TURN_ORDER
	if (t.runId !== null && typeof t.runId !== 'string') return EMPTY_TURN_ORDER
	if (t.event !== null && typeof t.event !== 'string') return EMPTY_TURN_ORDER
	if (t.strategy !== null && typeof t.strategy !== 'string') return EMPTY_TURN_ORDER
	return t as unknown as TurnOrderV1
}

/* ── Round robin: the one public rule ─────────────────────────────────── */

/**
 * The fields of a history row the round-robin rule reads — the shape
 * `core:shape/messages@1` carries (the host's `session-history` projection),
 * reduced to what the rule needs. Rows may carry more; the rule ignores it.
 *
 * @experimental 🚧 provisional with the turn-order vocabulary (PLAN-turn-order §4.4).
 */
export interface TurnHistoryMessage {
	role: string
	characterId?: number | null
	personaId?: number | null
	isHidden?: boolean | null
	isNarratorResponse?: boolean | null
	/**
	 * The row's participant reference (`envoy:<slug>`), as `session-history`
	 * publishes it. A raw row keeps it in `metadata.speaker` instead; both are read.
	 */
	speaker?: string | null
	metadata?: unknown
}

/** Who voiced a row, by reference: the projected `speaker`, else the raw `metadata.speaker`. */
const speakerRefOf = (m: TurnHistoryMessage): unknown =>
	m.speaker ?? (m.metadata as { speaker?: unknown } | undefined)?.speaker

/**
 * The rows that count as turns: not hidden, not narration. Hidden rows and
 * narrator responses are outside the rotation entirely. A missing row (`null`
 * or `undefined` — a sparse or partially loaded history) is skipped, never a
 * throw: every reader of turn order goes through here, so it tolerates them once.
 *
 * @experimental 🚧 provisional with the turn-order vocabulary (PLAN-turn-order §4.4).
 */
export function countedTurns<M extends TurnHistoryMessage>(messages: readonly (M | null | undefined)[]): M[] {
	return messages.filter((m): m is M => !!m && !m.isHidden && !m.isNarratorResponse)
}

const lastUserIndex = (turns: readonly TurnHistoryMessage[]): number => {
	for (let i = turns.length - 1; i >= 0; i--) if (turns[i]!.role === 'user') return i
	return -1
}

/**
 * Which participants have already spoken since the person last did, as
 * references (`character:<id>`, `envoy:<slug>`).
 *
 * Three readings, one per kind, each the fact that kind leaves in the
 * history: a character's id on a reply row, an envoy's reference on a reply
 * row (`speaker`, else `metadata.speaker`), a persona's id on the user row
 * that opened the window — the person's own send is their turn, consumed. An
 * envoy's reply marks no character. Before any user row the whole history is
 * one round, so a greeting counts as its character's turn.
 *
 * @experimental 🚧 provisional with the turn-order vocabulary (PLAN-turn-order §4.4).
 */
export function spokenRefsSince(messages: readonly (TurnHistoryMessage | null | undefined)[]): Set<string> {
	const turns = countedTurns(messages)
	const at = lastUserIndex(turns)
	const out = new Set<string>()
	for (let i = at + 1; i < turns.length; i++) {
		const m = turns[i]!
		if (m.role !== 'assistant') continue
		if (m.characterId != null) out.add(`character:${m.characterId}`)
		const ref = speakerRefOf(m)
		if (typeof ref === 'string' && ref.startsWith('envoy:')) out.add(ref)
	}
	if (at >= 0) {
		const sender = turns[at]!.personaId
		if (sender != null) out.add(`character:${sender}`)
	}
	return out
}

/**
 * Round robin — once per turn of the person's: every candidate that has not
 * spoken since the person last did, in candidate order, each entry
 * `via: 'strategy'`. Everyone having spoken is an empty order (the person's
 * turn), never a halt; the next user row opens a fresh round, and a manual
 * out-of-turn trigger counts as that candidate's turn for the round.
 *
 * This is the rule `core:task/turn-round-robin@1` runs, and the fallback a
 * plugin's own strategy should use rather than carry a copy of it.
 *
 * @experimental 🚧 provisional with the turn-order vocabulary (PLAN-turn-order §4.4).
 */
export function roundRobinOrder(
	candidates: readonly TurnCandidateV1[],
	messages: readonly (TurnHistoryMessage | null | undefined)[],
): TurnEntryV1[] {
	const spoken = spokenRefsSince(messages)
	return candidates.filter((c) => !spoken.has(c.ref)).map((c) => ({ ref: c.ref, via: 'strategy' }))
}
