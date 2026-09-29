/**
 * The review gate (01 §7).
 *
 * The gate lives in the executor substrate, below the type layer, and keys on
 * **declared effects rather than kind** — so an effectful Provider (an MCP tool that
 * sends mail) gates exactly like a Consumer.
 *
 * The properties that matter are all negative, and each has a test:
 *   · the gated party never implements the gate
 *   · plugin code cannot decline it, detect it, or tell an approved payload from an edited one
 *   · an author may default it **on** for their own node; forbidding it is not expressible
 */

import { inferSchema, type SettingsSchema } from './settings.js'

/**
 * On or off, and nothing between.
 *
 * There used to be a third position, `async`: run the node, land the write as a
 * proposal, and record it for somebody to look at later. Nobody could name a
 * case for it. A graph proposal must never auto-apply, so it wants the blocking
 * position; a review record per generated message is noise nobody reads. It was
 * a shape the spec allowed rather than a thing anyone asked for, and every
 * screen that offered it had to explain the difference before the reader could
 * choose.
 *
 * `on` is the old `sync`: the run parks until somebody decides. `resolvePosition`
 * still reads the two old spellings, because a stored setting or a plugin's
 * `reviewDefault` may predate this.
 * @experimental
 */
export type ReviewPosition = 'off' | 'on'

/** @experimental */
export interface ReviewRequest {
	nodeKey: string
	definitionId: string
	payload: unknown
	position: Extract<ReviewPosition, 'on'>
}

/** @experimental */
export interface ReviewDecision {
	action: 'approve' | 'edit' | 'reject'
	/** Present only for 'edit'. The binding cannot tell this from an approval. */
	payload?: unknown
	by: string
	at: number
}

/** @experimental */
export interface ReviewRecord {
	nodeKey: string
	position: ReviewPosition
	action: ReviewDecision['action'] | 'proposed'
	originalHash: string
	editedHash?: string
	by?: string
	at?: number
}

/** Resolver supplied by the host. `sync` parks on this promise; waiting is free (F13). @experimental */
export type Reviewer = (req: ReviewRequest) => Promise<ReviewDecision>

/**
 * The form a reviewer is shown for this node's payload.
 *
 * Inferred from the payload (`inferSchema`) — the one field language settings,
 * plugin forms and review pauses share — and then, when the definition
 * declares `review.fields`, narrowed to those names (U5b review C1). A
 * declared field the payload does not carry infers nothing and is simply
 * absent; an undeclared one is never offered. Absent declaration, the whole
 * payload is the form, as it always was.
 *
 * The host builds the form through this and applies an edit through the SAME
 * schema (`applyFormValues` iterates the schema, never the submission), so a
 * field the form did not offer cannot be written by construction. The refusal
 * in `undeclaredReviewFields` is the second, independent guard: a submission
 * naming one is refused outright rather than dropped in silence.
 * @internal
 */
export function reviewSchemaFor(
	definition: { review?: { fields: readonly string[] } } | undefined,
	payload: unknown,
): SettingsSchema {
	const inferred = inferSchema(payload)
	const declared = definition?.review?.fields
	if (!declared) return inferred
	const allowed = new Set(declared)
	return Object.fromEntries(Object.entries(inferred).filter(([key]) => allowed.has(key)))
}

/**
 * The keys of a decision's values that the definition's `review.fields` does
 * not allow — empty when nothing is declared (every key is then a form
 * field) or when every submitted key is declared. Non-empty means refuse.
 * @internal
 */
export function undeclaredReviewFields(
	definition: { review?: { fields: readonly string[] } } | undefined,
	values: Record<string, unknown> | undefined,
): string[] {
	const declared = definition?.review?.fields
	if (!declared || !values) return []
	const allowed = new Set(declared)
	return Object.keys(values).filter((key) => !allowed.has(key))
}

/**
 * There is deliberately no `'never'` position and no descriptor field that could produce
 * one. An author picks a default; the user's setting wins over it. Forbidding review is
 * not a value this type can hold, which is the enforcement (F14).
 * @experimental
 */
export const POSITIONS: readonly ReviewPosition[] = ['off', 'on'] as const

/**
 * What the two retired spellings mean now.
 *
 * `sync` is `on` by definition. `async` becomes `on` rather than `off` because
 * somebody who asked to review a write should keep being asked: quietly
 * dropping the gate is the one migration outcome that could let an unreviewed
 * write land on an install that had deliberately gated it.
 */
const LEGACY_POSITIONS: Record<string, ReviewPosition> = {
	off: 'off',
	sync: 'on',
	async: 'on',
	on: 'on',
}

/** @experimental */
export function hashPayload(v: unknown): string {
	const s = JSON.stringify(v ?? null)
	let h = 2166136261
	for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
	return (h >>> 0).toString(16)
}

/**
 * Resolve the effective position: user setting if present, else the author's default,
 * else off. An author can raise the floor and never lower it below what a user chose.
 * @experimental
 */
export function resolvePosition(
	authorDefault: ReviewPosition | undefined,
	userSetting: unknown,
): ReviewPosition {
	if (typeof userSetting === 'string' && userSetting in LEGACY_POSITIONS)
		return LEGACY_POSITIONS[userSetting]!
	if (authorDefault && authorDefault in LEGACY_POSITIONS)
		return LEGACY_POSITIONS[authorDefault]!
	return 'off'
}

/** Which nodes the gate applies to — effects, not kind (01 §7, 14 §4a). @experimental */
export function isGated(effects: string | undefined): boolean {
	return effects === 'write' || effects === 'external'
}
