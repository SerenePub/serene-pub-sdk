/**
 * 🚧 **Back · Forward** in core's conversation (RF fix 5, owner ruling
 * 2026-10-23: "introduce a back and forward button. If clicking back, rewind
 * the history. On continue/new write, replace the rewound history."): what
 * the two presses show — the app draws them in the session header since
 * polish parity L1 (2026-10-24) — and the composer's note while the session
 * is rewound. The host says how many turns are ahead and why each
 * press would be refused (`SessionDossierV1.rewind`); this adds what only the
 * page knows — whether the viewer is the session's owner, whether a reply is
 * being written — and words it. Pure, so the rule is tested without a page.
 *
 * The universal widget draws the note wherever it shows the story; the host
 * draws the presses from the same state. The genre pins nothing. Member
 * copy: Back, Forward, "turns ahead".
 */
import type { ConversationRewindV1 } from '@serene-pub/sdk'

/** Why a press is grey, when the page knows it and the host could not. @experimental */
export const REWIND_STRIP_REASONS = Object.freeze({
	notOwner: "Only the session's owner can go back or forward.",
	generating: 'Wait for the reply to finish.',
})

/** One press of the strip. @experimental */
export interface RewindPressState {
	/** Greyed: `aria-disabled`, the click guarded. */
	disabled: boolean
	/** Why, when it is grey. */
	reason?: string
}

/** What the strip and the composer's note draw. @experimental */
export interface RewindStripState {
	/**
	 * Draw the strip at all: the host sent its state, this copy shows the
	 * story, and the viewer is the session's owner (a member presses
	 * neither, so a member is shown no strip — only the composer's note).
	 */
	shown: boolean
	back: RewindPressState
	forward: RewindPressState
	/** How many turns are ahead. */
	ahead: number
	/** "2 turns ahead"; empty with none. */
	aheadText: string
	/** The composer's note while rewound — "2 turns ahead will be replaced if you write now." — or null. */
	replaceText: string | null
}

/** "1 turn ahead" · "2 turns ahead". @experimental */
export const turnsAheadText = (n: number): string => (n > 0 ? `${n} ${n === 1 ? 'turn' : 'turns'} ahead` : '')

/**
 * The strip's state. `story`: this copy shows the story's lane (the primary
 * log, or one pinned to `main`) — Back and Forward act there alone.
 * @experimental
 */
export function rewindStripState(input: {
	rewind: ConversationRewindV1 | null | undefined
	isOwner: boolean
	generating: boolean
	story: boolean
}): RewindStripState {
	const r = input.rewind
	const ahead = r && r.ahead > 0 ? Math.trunc(r.ahead) : 0
	const press = (serverReason: string | null | undefined): RewindPressState => {
		const reason = !input.isOwner
			? REWIND_STRIP_REASONS.notOwner
			: input.generating
				? REWIND_STRIP_REASONS.generating
				: (serverReason ?? undefined)
		return reason ? { disabled: true, reason } : { disabled: false }
	}
	return {
		shown: !!r && input.story && input.isOwner,
		back: press(r?.back),
		forward: press(r?.forward),
		ahead,
		aheadText: turnsAheadText(ahead),
		replaceText: r && ahead > 0 && input.story ? `${turnsAheadText(ahead)} will be replaced if you write now.` : null,
	}
}
