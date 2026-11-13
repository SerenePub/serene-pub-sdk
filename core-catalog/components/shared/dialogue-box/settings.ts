/**
 * The `dialogue-box` widget's two settings (PLAN-visual-novel-layout §1.3):
 * whether the box reads on by itself, and how fast it reads a line without a voice.
 */

export interface DialogueBoxSettings {
	autoRead: boolean
	readingSpeed: number
}

/** The declared defaults (`CORE_WIDGETS`, the `dialogue-box` entry). */
export const DIALOGUE_BOX_DEFAULTS: DialogueBoxSettings = { autoRead: false, readingSpeed: 220 }

export function readDialogueBoxSettings(
	raw: Record<string, unknown> | undefined,
): DialogueBoxSettings {
	const v = raw ?? {}
	return {
		autoRead: v.autoRead === true,
		readingSpeed:
			typeof v.readingSpeed === 'number' && Number.isFinite(v.readingSpeed)
				? Math.min(600, Math.max(80, Math.round(v.readingSpeed)))
				: DIALOGUE_BOX_DEFAULTS.readingSpeed,
	}
}
