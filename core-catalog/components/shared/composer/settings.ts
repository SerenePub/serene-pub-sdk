/**
 * The `composer` widget's settings (owner R8 2026-11-05: they were the
 * `messages` widget's, moved verbatim), read the way the `messages` reader
 * read them: every value present, the declared default wherever the instance
 * has no deviation.
 */

/** How the composer's field is drawn. */
export type ComposerSkin = "classic" | "minimal" | "writer" | "quill"

export interface ComposerSettings {
	composerSkin: ComposerSkin
	/**
	 * 🚧 The composer while a tab other than the first is shown
	 * (`otherTabsComposer`, lair fix 2), or `same` — `composerSkin`.
	 */
	otherTabsComposer: ComposerSkin | "same"
	showActions: boolean
}

/** The declared defaults (`CORE_WIDGETS`, the `composer` entry). */
export const COMPOSER_DEFAULTS: ComposerSettings = {
	composerSkin: "classic",
	otherTabsComposer: "same",
	showActions: true
}

function pickEnum<T extends string>(raw: unknown, of: readonly T[], fallback: T): T {
	return typeof raw === "string" && (of as readonly string[]).includes(raw) ? (raw as T) : fallback
}

/**
 * Read one settings payload. `folio` is whether the target Messages copy
 * reads as Folio: then a copy whose `composer` is the declared default
 * (`classic`) writes with the page line (`quill`). Settings arrive complete,
 * so `classic` cannot say "chosen"; a Folio copy that wants the card back
 * cannot have it, which is the price of a manuscript's page line.
 */
export function readComposerSettings(
	raw: Record<string, unknown> | undefined,
	folio: boolean
): ComposerSettings {
	const v = raw ?? {}
	const d = COMPOSER_DEFAULTS
	const skin = pickEnum<ComposerSkin>(v.composer, ["classic", "minimal", "writer", "quill"], d.composerSkin)
	return {
		composerSkin: folio && skin === d.composerSkin ? "quill" : skin,
		otherTabsComposer: pickEnum(
			v.otherTabsComposer,
			["same", "classic", "minimal", "writer", "quill"],
			d.otherTabsComposer
		),
		showActions: typeof v.showActions === "boolean" ? v.showActions : d.showActions
	}
}
