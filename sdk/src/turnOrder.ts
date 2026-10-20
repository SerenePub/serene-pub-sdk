/**
 * Turn order as state.
 *
 * The session's ordered list of prepared turns is a **document**, not a
 * decision a run makes on the way to a reply. It lives at
 * `sessions.metadata.turnOrder`, is written by `core:outlet/set-turn-order@1`
 * and nothing else, and survives refresh and reboot. A page renders it;
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
 * ⚠ `TurnCandidateV1.ref` is a `ParticipantRef`; there is no `persona:`
 * form. `kind: 'persona'` names the ROLE — a person's seat, shown as their
 * turn and never fired — and the ref names who sits there: the voiced card
 * (`character:<id>`, a persona being a character row flagged `is_persona`),
 * or 🚧 `player-seat:<id>` for a seat that voices no card.
 * @ruling PLAN-turn-order §4.2 (ruled 2026-09-21), R5, NOMENCLATURE §23, PLAN-turn-order §8
 */
import type { ParticipantRef } from './participants.js'

/** @experimental */
export interface TurnCandidateV1 {
	/** `character:11` · `player-seat:4` · `envoy:mascot` — see the file note on `persona`. */
	ref: ParticipantRef
	kind: 'character' | 'persona' | 'envoy' | (string & {})
	name: string
	nickname?: string
	position: number
	/** Characters and personas: whose library row this is — for a card-less player seat, whose seat. */
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
	/**
	 * How decided. Open string; core: strategy | script | voice, pick on an
	 * entry a person fires, and 🚧 `plan` — a turn a standing turn plan named
	 * (a Lair character turn): the rest of a turn already taken, which
	 * auto-advance fires on any run's cause but a stopped one.
	 */
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
 * broke, has an empty order until its next event recomputes it (no
 * backfill). The document is returned as stored, extra keys included;
 * only its shape is judged.
 * @experimental
 * @ruling PLAN-turn-order §4.1
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
 * @experimental 🚧 provisional with the turn-order vocabulary.
 * @ruling PLAN-turn-order §4.4
 */
export interface TurnHistoryMessage {
	role: string
	characterId?: number | null
	personaId?: number | null
	isHidden?: boolean | null
	isNarratorResponse?: boolean | null
	/**
	 * The row's participant reference — `envoy:<slug>` on an envoy's reply,
	 * 🚧 `player-seat:<id>` on a person's line sent from a card-less player seat — as
	 * `session-history` publishes it. A raw row keeps it in
	 * `metadata.speaker` instead; both are read.
	 */
	speaker?: string | null
	metadata?: unknown
}

/** Who voiced a row, by reference: the projected `speaker`, else the raw `metadata.speaker`. */
const speakerRefOf = (m: Pick<TurnHistoryMessage, 'speaker' | 'metadata'>): unknown =>
	m.speaker ?? (m.metadata as { speaker?: unknown } | undefined)?.speaker

/**
 * The seat a person's row was sent from, as a reference: its persona
 * (`character:<id>`), else 🚧 the `player-seat:<id>` a card-less player seat's line
 * carries; null for a row from neither. The one reading of a sender —
 * the row that opens a round (`spokenRefsSince`) is read by it.
 *
 * @experimental 🚧 provisional with the turn-order vocabulary.
 */
export function senderRefOf(
	m: Pick<TurnHistoryMessage, 'personaId' | 'speaker' | 'metadata'>,
): `character:${number}` | `player-seat:${number}` | null {
	if (m.personaId != null) return `character:${m.personaId}`
	const ref = speakerRefOf(m)
	return typeof ref === 'string' && /^player-seat:[1-9][0-9]*$/.test(ref) ? (ref as `player-seat:${number}`) : null
}

/**
 * The rows that count as turns: not hidden, not narration. Hidden rows and
 * narrator responses are outside the rotation entirely. A missing row (`null`
 * or `undefined` — a sparse or partially loaded history) is skipped, never a
 * throw: every reader of turn order goes through here, so it tolerates them once.
 *
 * @experimental 🚧 provisional with the turn-order vocabulary.
 * @ruling PLAN-turn-order §4.4
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
 * references (`character:<id>`, `player-seat:<id>`, `envoy:<slug>`).
 *
 * Three readings, one per kind, each the fact that kind leaves in the
 * history: a character's id on a reply row, an envoy's reference on a reply
 * row (`speaker`, else `metadata.speaker`), and on the user row that opened
 * the window its persona's id — or, from a card-less player seat, its `player-seat:`
 * reference — the person's own send is their turn, consumed. An
 * envoy's reply marks no character. Before any user row the whole history is
 * one round, so a greeting counts as its character's turn.
 *
 * @experimental 🚧 provisional with the turn-order vocabulary.
 * @ruling PLAN-turn-order §4.4
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
	const sender = at >= 0 ? senderRefOf(turns[at]!) : null
	if (sender) out.add(sender)
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
 * @experimental 🚧 provisional with the turn-order vocabulary.
 * @ruling PLAN-turn-order §4.4
 */
export function roundRobinOrder(
	candidates: readonly TurnCandidateV1[],
	messages: readonly (TurnHistoryMessage | null | undefined)[],
): TurnEntryV1[] {
	const spoken = spokenRefsSince(messages)
	return candidates.filter((c) => !spoken.has(c.ref)).map((c) => ({ ref: c.ref, via: 'strategy' }))
}
