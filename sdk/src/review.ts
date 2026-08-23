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
 */
export type ReviewPosition = 'off' | 'on'

export interface ReviewRequest {
	nodeKey: string
	typeId: string
	payload: unknown
	position: Extract<ReviewPosition, 'on'>
}

export interface ReviewDecision {
	action: 'approve' | 'edit' | 'reject'
	/** Present only for 'edit'. The binding cannot tell this from an approval. */
	payload?: unknown
	by: string
	at: number
}

export interface ReviewRecord {
	nodeKey: string
	position: ReviewPosition
	action: ReviewDecision['action'] | 'proposed'
	originalHash: string
	editedHash?: string
	by?: string
	at?: number
}

/** Resolver supplied by the host. `sync` parks on this promise; waiting is free (F13). */
export type Reviewer = (req: ReviewRequest) => Promise<ReviewDecision>

/**
 * There is deliberately no `'never'` position and no descriptor field that could produce
 * one. An author picks a default; the user's setting wins over it. Forbidding review is
 * not a value this type can hold, which is the enforcement (F14).
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

export function hashPayload(v: unknown): string {
	const s = JSON.stringify(v ?? null)
	let h = 2166136261
	for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
	return (h >>> 0).toString(16)
}

/**
 * Resolve the effective position: user setting if present, else the author's default,
 * else off. An author can raise the floor and never lower it below what a user chose.
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

/** Which nodes the gate applies to — effects, not kind (01 §7, 14 §4a). */
export function isGated(effects: string | undefined): boolean {
	return effects === 'write' || effects === 'external'
}
