/**
 * `@serene-pub/core-catalog/backdrop` — the plain-TypeScript half of core's
 * Backdrop widget (DESIGN-image-generation §6.4, 2026-10-12): its settings,
 * and the one reading it draws — the session's **backdrop**, off the
 * `session` section (`SessionV1.backdrop`). The widget's Svelte source lives
 * in `components/shared/backdrop/` and ships built
 * (`dist/components/backdrop.js`); a host imports only this half, which
 * carries no Svelte runtime.
 *
 * A **backdrop** is session state (`sessions.backdropMediaId`): one picture
 * the session shows behind or beside the Stage, set by a pipeline
 * (`core:outlet/set-backdrop@1`) or by a person from this widget. ⚠ Not the
 * app background, not a message attachment, and not the retired *scene
 * image* pins.
 *
 * 🚧 Provisional with the widget.
 */
import { actionIdentity, type ActionsV1, type SessionBackdropV1, type SessionV1, type ViewerV1 } from '@serene-pub/sdk'

/** `cover`: fill the box, cropping the edges. `contain`: the whole picture, letterboxed. @experimental */
export type BackdropFit = 'cover' | 'contain'

/** The widget's settings, complete — the declared defaults wherever an instance has none. @experimental */
export interface BackdropSettings {
	fit: BackdropFit
	/** How dark the overlay over the picture is, 0 (none) to 100 (black). */
	dim: number
}

/** @experimental */
export const BACKDROP_DEFAULTS: BackdropSettings = Object.freeze({ fit: 'cover', dim: 0 })

/** What the widget says with no backdrop set. @experimental */
export const BACKDROP_EMPTY = 'No backdrop yet — Scene will set one, or pick an image'

/** Read one settings payload (`settings.v1`) into the complete object above. @experimental */
export function readBackdropSettings(raw: Record<string, unknown> | undefined): BackdropSettings {
	const v = raw ?? {}
	const dim = typeof v.dim === 'number' && Number.isFinite(v.dim) ? Math.round(v.dim) : BACKDROP_DEFAULTS.dim
	return {
		fit: v.fit === 'contain' ? 'contain' : 'cover',
		dim: Math.min(100, Math.max(0, dim)),
	}
}

/**
 * The session's backdrop, or null — the `session` section's own field, read
 * absent as null (a host that does not know it yet). A value without a
 * usable id or address is no picture anyone can fetch, and reads null.
 * @experimental
 */
export function backdropOf(session: SessionV1 | undefined): SessionBackdropV1 | null {
	const b = session?.backdrop
	if (!b || typeof b !== 'object') return null
	if (typeof b.mediaId !== 'number' || !Number.isInteger(b.mediaId) || b.mediaId <= 0) return null
	if (typeof b.src !== 'string' || !b.src) return null
	return { mediaId: b.mediaId, src: b.src }
}

/**
 * May this viewer change the backdrop: the session's owner or an admin —
 * the server's own rule (`sessions:setBackdrop`), so the widget offers
 * only what will be allowed. A guest sees the picture and no controls.
 * @experimental
 */
export function mayChangeBackdrop(viewer: ViewerV1 | undefined): boolean {
	if (!viewer || viewer.userId === null) return false
	return viewer.isAdmin || !viewer.isGuest
}

/**
 * 🚧 The Scene action the widget's **Illustrate** fires (DESIGN-image-
 * generation §6.5, I9): `core:spec/chat-illustrate-scene#illustrate-scene`,
 * spelled out rather than imported so this half stays free of the spec
 * builder. The app's Scene test holds the two together.
 * @experimental
 */
export const BACKDROP_ILLUSTRATE_ACTION = 'core:spec/chat-illustrate-scene#illustrate-scene'

/**
 * 🚧 Every genre's Scene action, Chat's first (§16 follow-up D3): Adventure
 * ships the same graph under its own spec, since an inlet is one genre's.
 * @experimental
 */
export const BACKDROP_ILLUSTRATE_ACTIONS: readonly string[] = Object.freeze([
	BACKDROP_ILLUSTRATE_ACTION,
	'core:spec/adventure-illustrate-scene#illustrate-scene',
])

/** What a press of Illustrate sends: the picture becomes the backdrop and nothing is posted. @experimental */
export const BACKDROP_ILLUSTRATE_PAYLOAD = Object.freeze({ placement: 'backdrop' as const })

/** The Illustrate button, as the widget draws it. @experimental */
export interface BackdropIllustrateView {
	identity: string
	/** Listed but not pressable for this viewer (no act right, or enabled-when says no). */
	disabled: boolean
}

/**
 * Illustrate, when this session lists the Scene action (`actions.v1`), or
 * null — a genre without it (anything but Chat and Adventure today) shows no button,
 * because a widget cannot fire what the session does not offer.
 * @experimental
 */
export function illustrateActionOf(actions: ActionsV1 | undefined): BackdropIllustrateView | null {
	for (const venue of ['composer', 'extra'] as const) {
		const listed = actions?.[venue]
		if (!listed) continue
		for (const a of [...(listed.primary ?? []), ...(listed.overflow ?? [])]) {
			const identity = actionIdentity(a)
			if (!BACKDROP_ILLUSTRATE_ACTIONS.includes(identity)) continue
			return { identity, disabled: !a.canAct || a.enabled === false }
		}
	}
	return null
}
