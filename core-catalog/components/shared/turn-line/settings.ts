/**
 * The `turn-line` widget's one setting (owner R8 2026-11-05: `nextUp` was the
 * `messages` widget's, moved verbatim).
 */

/**
 * Who is due next (PLAN-turn-order §4.9): the order's head with Continue,
 * the head and who follows it, or nothing.
 */
export type NextUp = "head" | "list" | "hidden"

export interface TurnLineSettings {
	nextUp: NextUp
}

/** The declared default (`CORE_WIDGETS`, the `turn-line` entry). */
export const TURN_LINE_DEFAULTS: TurnLineSettings = { nextUp: "head" }

export function readTurnLineSettings(raw: Record<string, unknown> | undefined): TurnLineSettings {
	const v = raw ?? {}
	const of: readonly NextUp[] = ["head", "list", "hidden"]
	return {
		nextUp:
			typeof v.nextUp === "string" && (of as readonly string[]).includes(v.nextUp)
				? (v.nextUp as NextUp)
				// ⏳ `showNudge: false` was this setting before `nextUp` (A8).
				: v.showNudge === false
					? "hidden"
					: TURN_LINE_DEFAULTS.nextUp
	}
}
