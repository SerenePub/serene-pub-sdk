/**
 * The Messages copy a Composer or Turn line belongs to (owner R8 2026-11-05:
 * the composer and the turn line are widgets beside the log, not parts of it).
 *
 * The host gives each the same `session:full` dossier as its TARGET Messages
 * copy — its `composer.channels` narrowed the same way — and says which
 * channel that copy last showed (`show-channel`) under `dossier.composer`.
 * Those two fields are not yet in the SDK's `ConversationComposerV1`, so they
 * are read here, structurally, in ONE place; nothing else touches the shape.
 */

export type TargetLineWidth = "column" | "full" | "comfortable"
export type TargetPresentation = "rows" | "folio"

/** The Messages copy this Composer / Turn line writes beside. */
export interface ComposerTarget {
	/** The target Messages instance id (`messages`, `messages#sanctum`). */
	instance: string
	/** The channel that copy shows, canonical. */
	channel: string
	/** That channel's label in the viewer's language. */
	label: string
	/** The target's Line width, when the host says it. */
	lineWidth?: TargetLineWidth
	/** The target's effective presentation, when the host says it. */
	presentation?: TargetPresentation
}

export interface ComposerTargetFields {
	/** Absent: no target resolved — the first writable channel is the lane. */
	target: ComposerTarget | null
	/** Set when the target panel shows a tab that is not a Messages tab. */
	writingTo: { channel: string; label: string } | null
}

const str = (v: unknown): v is string => typeof v === "string" && v !== ""

/** Read `dossier.composer.target` and `.writingTo`; both null when the host sends none. */
export function composerTargetOf(dossier: unknown): ComposerTargetFields {
	const composer = (dossier as { composer?: Record<string, unknown> } | null | undefined)?.composer
	const t = composer?.target as Record<string, unknown> | null | undefined
	const w = composer?.writingTo as Record<string, unknown> | null | undefined
	const target: ComposerTarget | null =
		t && str(t.instance) && str(t.channel)
			? {
					instance: t.instance,
					channel: t.channel,
					label: typeof t.label === "string" ? t.label : t.channel,
					...(t.lineWidth === "column" || t.lineWidth === "full" || t.lineWidth === "comfortable"
						? { lineWidth: t.lineWidth }
						: {}),
					...(t.presentation === "rows" || t.presentation === "folio"
						? { presentation: t.presentation }
						: {})
				}
			: null
	const writingTo =
		w && str(w.channel) ? { channel: w.channel, label: typeof w.label === "string" && w.label ? w.label : w.channel } : null
	return { target, writingTo }
}
