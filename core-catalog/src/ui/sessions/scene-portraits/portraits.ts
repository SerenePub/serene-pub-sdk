/**
 * The Scene Portraits widget's reading of its sections (R21, R76, R77): which
 * faces it draws, from which image, with which bars — worked out here, in
 * plain TypeScript, so the component only draws what these return.
 *
 * Everything is read off what the host already resolved: `characters.v1`
 * (the cast, cast over card, every URL and current sprite resolved, the
 * page's pins riding along) and `session_state.v1` (the bars). The widget
 * never reads the log (its declared reads are `settings` alone).
 */
import type {
	SessionCharacterV1,
	SessionCharactersV1,
	SessionStateV1,
} from '@serene-pub/sdk'
import { barView, type BarBounds, type BarView } from '../session-state/barMath.js'
import { slotKind } from '../session-state/shapes.js'

/** Where the faces come from: the two pins, or the cast itself. @experimental */
export type ScenePortraitsSource = 'pinned' | 'scene'

/** The widget's settings, complete: the declared defaults where the instance has none. @experimental */
export interface ScenePortraitsSettings {
	source: ScenePortraitsSource
	/** Put the viewer's own persona beside the cast (scene only). */
	persona: boolean
	/** A mini bar row under each face. */
	bars: boolean
	/** Each member's current sprite over its avatar (scene only). */
	sprites: boolean
}

/** The declared defaults (`CORE_WIDGETS`, the `scene-portraits` entry). @experimental */
export const SCENE_PORTRAITS_DEFAULTS: ScenePortraitsSettings = Object.freeze({
	source: 'pinned',
	persona: false,
	bars: false,
	sprites: true,
})

/** Read one settings payload into the complete object above. @experimental */
export function readScenePortraitsSettings(raw: Record<string, unknown> | undefined): ScenePortraitsSettings {
	const v = raw ?? {}
	const d = SCENE_PORTRAITS_DEFAULTS
	return {
		source: v.source === 'scene' || v.source === 'pinned' ? v.source : d.source,
		persona: typeof v.persona === 'boolean' ? v.persona : d.persona,
		bars: typeof v.bars === 'boolean' ? v.bars : d.bars,
		sprites: typeof v.sprites === 'boolean' ? v.sprites : d.sprites,
	}
}

/** One face the scene source draws. @experimental */
export interface ScenePortrait {
	/** `character:<id>` — a persona's too. */
	key: SessionCharacterV1['ref']
	characterId: number
	isPersona: boolean
	name: string
	/** The image to draw; null draws the blank face. */
	src: string | null
	/** The state owner this member's values are filed under; null when it has none (a persona). */
	ownerKey: string | null
	/** The card's sprite sets — offered only when `canChangeSpriteSet`. */
	spriteSets: string[]
	/** The session's own pick; null when the story decides. */
	spriteSetOverride: string | null
	/**
	 * The sprite-set menu is offered: the viewer may switch it (R77, the
	 * server's rule), sprites are shown, and there is more than one set.
	 */
	offersSpriteSets: boolean
}

/**
 * The state owner a cast member's values are filed under, by character id —
 * the cast owner whose id is the character's. Null when the session has no
 * state for it.
 * @experimental
 */
export function stateOwnerKeyOf(state: SessionStateV1 | undefined, characterId: number): string | null {
	return state?.owners.find((o) => o.kind === 'session_cast' && o.id === characterId)?.key ?? null
}

/**
 * The scene source's faces: every character still in the session, then —
 * when `settings.persona` asks — the persona the VIEWER is voicing (`mine`,
 * R77), never merely the first one listed. A persona carries no state of its
 * own and shows its avatar: it draws a face and no bars, and no menu.
 * @experimental
 */
export function scenePortraitsOf(
	characters: SessionCharactersV1 | undefined,
	state: SessionStateV1 | undefined,
	settings: ScenePortraitsSettings,
): ScenePortrait[] {
	const members = characters?.members ?? []
	const out: ScenePortrait[] = []
	for (const m of members) {
		if (m.isPersona) continue
		out.push({
			key: m.ref,
			characterId: m.characterId,
			isPersona: false,
			name: m.name,
			src: settings.sprites ? (m.sprite ?? m.face) : m.face,
			ownerKey: stateOwnerKeyOf(state, m.characterId),
			spriteSets: m.spriteSets,
			spriteSetOverride: m.spriteSetOverride ?? null,
			offersSpriteSets: settings.sprites && m.canChangeSpriteSet && m.spriteSets.length > 1,
		})
	}
	if (!settings.persona) return out
	const mine = members.find((m) => m.isPersona && m.mine)
	if (mine)
		out.push({
			key: mine.ref,
			characterId: mine.characterId,
			isPersona: true,
			name: mine.name,
			src: mine.face,
			ownerKey: null,
			spriteSets: [],
			spriteSetOverride: null,
			offersSpriteSets: false,
		})
	return out
}

/** One side of the pinned source. @experimental */
export interface PinnedPortrait {
	side: 'left' | 'right'
	/** The pinned image; null for an empty side. */
	src: string | null
	/**
	 * The state owner of the member it pictures, when the host could tell who
	 * that is (`SessionSceneImageV1.ref`); an image pinned from anywhere else
	 * pictures nobody, and gets no bars — the only honest answer to "whose
	 * stats are these".
	 */
	ownerKey: string | null
}

const characterIdOf = (ref: string | null | undefined): number | null => {
	const m = /^character:(\d+)$/.exec(ref ?? '')
	return m ? Number(m[1]) : null
}

/** The two pinned sides, left then right. @experimental */
export function pinnedPortraitsOf(
	characters: SessionCharactersV1 | undefined,
	state: SessionStateV1 | undefined,
): PinnedPortrait[] {
	return (['left', 'right'] as const).map((side) => {
		const pin = characters?.sceneImages[side] ?? null
		const id = characterIdOf(pin?.ref)
		return { side, src: pin?.src ?? null, ownerKey: id == null ? null : stateOwnerKeyOf(state, id) }
	})
}

/** One bar of a mini bar row. @experimental */
export interface StatBarRow {
	slotId: string
	label: string
	bar: BarView
}

/**
 * One owner's mini bar row: its bounded stats, in declaration order, at most
 * `limit` of them. Only a number stat (`slotKind`) whose configuration in
 * force declares both ends of a range is a bar (`barView`); every other
 * shape — a choice, a list, a story time — is left out, because
 * this row has no room to say what it is.
 * @experimental
 */
export function statBarsOf(state: SessionStateV1 | undefined, ownerKey: string, limit = 3): StatBarRow[] {
	if (!state) return []
	const owner = state.owners.find((o) => o.key === ownerKey)
	if (!owner) return []
	const bag = ownerKey === 'world' ? state.resolved.world : (state.resolved.cast[ownerKey] ?? {})
	const out: StatBarRow[] = []
	for (const slot of state.slots) {
		if (!Object.hasOwn(owner.configs, slot.slotId)) continue
		// Only a number stat is a bar: a list's count bounds or a choice
		// carrying numbers is not a range with a fill.
		if (slotKind(slot) !== 'number') continue
		const bar = barView(bag[slot.qualifiedKey], owner.configs[slot.slotId] as BarBounds)
		if (bar) out.push({ slotId: slot.slotId, label: slot.label, bar })
		if (out.length >= limit) break
	}
	return out
}
