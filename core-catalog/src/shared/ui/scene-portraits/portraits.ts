/**
 * The Scene Portraits widget's reading of its sections (R21, R76, R77): which
 * faces it draws, from which image, with which bars — worked out here, in
 * plain TypeScript, so the component only draws what these return.
 *
 * Everything is read off what the host already resolved: `characters.v1`
 * (the cast, cast over card, every URL, current sprite and last line's time
 * resolved) and `session_state.v1` (the bars). The widget never reads the
 * log (its declared reads are `settings` alone); a chosen image's own `src`
 * is the host's answer to `character-images`.
 *
 * Three settings, each one question (W6, 2026-10-11): **who** (`who`),
 * **which picture** (`face`) and **how laid out** (`arrangement`).
 */
import type { SessionCharacterV1, SessionCharactersV1, SessionStateV1 } from '@serene-pub/sdk'
import { barView, type BarBounds, type BarView } from '../session-state/barMath.js'
import { slotKind } from '../session-state/shapes.js'

/**
 * ⏳ The old one-axis setting (`source`): the two pins, or the cast itself.
 * Read since W6 as the three axes below — `pinned` is `who: pick`, `face:
 * chosen`, `arrangement: stage`; `scene` is `who: scene`.
 * @deprecated REMOVE in 0.7.0 — read {@link ScenePortraitsWho}.
 * @experimental
 */
export type ScenePortraitsSource = 'pinned' | 'scene'

/**
 * WHO the widget shows (W6): `scene` — everyone in the session; `recent` —
 * the members who spoke last, newest first, up to `recentTurns` of them;
 * `pick` — the members `pickMembers` names. A benched character is never
 * shown: it is out of the scene.
 * @experimental
 */
export type ScenePortraitsWho = 'scene' | 'recent' | 'pick'

/**
 * WHICH picture each face shows (W6): `avatar` — the character's picture;
 * `sprite` — its current sprite, the one on the newest line it spoke
 * (DESIGN-sprites §7), else its avatar; `chosen` — the **chosen image**
 * this instance keeps for it (`chosenImages`), else its avatar. ⚠ Not
 * `SessionCharacterV1.face`, which is the avatar's URL.
 * @experimental
 */
export type ScenePortraitsFace = 'avatar' | 'sprite' | 'chosen'

/**
 * HOW the faces are laid out (W6): a `row`, a wrapping `grid`, a `column`,
 * or a `stage` — the first two, large, side by side (the look the pinned
 * portraits had). A widget setting, not a layout's **arrangement**.
 * @experimental
 */
export type ScenePortraitsArrangement = 'row' | 'grid' | 'column' | 'stage'

/** The widget's settings, complete: the declared defaults where the instance has none. @experimental */
export interface ScenePortraitsSettings {
	who: ScenePortraitsWho
	/** With `who: recent`: how many of the latest speakers, 1–20. */
	recentTurns: number
	/** With `who: pick`: one member per line — a name as the session shows it, or a `character:<id>`. */
	pickMembers: string[]
	face: ScenePortraitsFace
	/**
	 * With `face: chosen`: each member's **chosen image**, one
	 * `character:<id>=<image ref>` pair per entry (the settings language has
	 * no map). The first pair for a member wins.
	 */
	chosenImages: string[]
	arrangement: ScenePortraitsArrangement
	/** Put the viewer's own persona beside the cast (`scene` and `recent`). */
	persona: boolean
	/**
	 * 🚧 Every **player seat**'s character beside the cast (`scene` only;
	 * PLAN-dc-after-walk2 Q3-5): each player's character — a card seated as a
	 * player seat, or a card-less player seat by its seat name — with its
	 * face. The viewer's own is among them, so `persona` adds nothing more.
	 */
	playerSeats: boolean
	/**
	 * 🚧 The **people the story has met** after them (`scene` only; Q3-5,
	 * `SessionStateV1.metPeople`): by name, with no picture — a lorebook
	 * entry has none.
	 */
	metPeople: boolean
	/** A mini bar row under each face. */
	bars: boolean
	/**
	 * 🚧 Whose faces carry bars (PLAN-dc-after-walk3 R3-3, the walk's NEW-13):
	 * `everyone` with stats, or only the **player seats**' characters — a crawl's
	 * companions keep no sheet, and drew bars of stats nothing writes.
	 */
	barsFor: ScenePortraitsBarsFor
}

/** 🚧 Whose faces carry stat bars (`barsFor`). @experimental */
export type ScenePortraitsBarsFor = 'everyone' | 'seats'

/** The declared defaults (`CORE_WIDGETS`, the `scene-portraits` entry). @experimental */
export const SCENE_PORTRAITS_DEFAULTS: ScenePortraitsSettings = Object.freeze({
	who: 'scene',
	recentTurns: 3,
	pickMembers: Object.freeze([]) as unknown as string[],
	face: 'sprite',
	chosenImages: Object.freeze([]) as unknown as string[],
	arrangement: 'grid',
	persona: false,
	playerSeats: false,
	metPeople: false,
	bars: false,
	barsFor: 'everyone',
})

/** The bounds of `recentTurns`, as the declaration has them. @experimental */
export const SCENE_PORTRAITS_RECENT_MAX = 20

const WHO: readonly ScenePortraitsWho[] = ['scene', 'recent', 'pick']
const FACE: readonly ScenePortraitsFace[] = ['avatar', 'sprite', 'chosen']
const ARRANGEMENT: readonly ScenePortraitsArrangement[] = ['row', 'grid', 'column', 'stage']
const BARS_FOR: readonly ScenePortraitsBarsFor[] = ['everyone', 'seats']
const oneOf = <T extends string>(of: readonly T[], v: unknown): v is T =>
	typeof v === 'string' && (of as readonly string[]).includes(v)
const lines = (v: unknown): string[] =>
	Array.isArray(v)
		? v
				.filter((x): x is string => typeof x === 'string')
				.map((x) => x.trim())
				.filter(Boolean)
		: []

/**
 * Read one settings payload into the complete object above.
 *
 * ⏳ A payload from before W6 reads as the axes it meant: `source: pinned`
 * is `who: pick` · `face: chosen` · `arrangement: stage`, and `sprites:
 * false` is `face: avatar` — each only where the new key is not written. A
 * host that prunes stored settings has already moved them (the app's
 * `withLegacyScenePortraitsSettings`); this is the fallback for a raw
 * payload. REMOVE the legacy reads in 0.7.0.
 * @experimental
 */
export function readScenePortraitsSettings(
	raw: Record<string, unknown> | undefined,
): ScenePortraitsSettings {
	const v = raw ?? {}
	const d = SCENE_PORTRAITS_DEFAULTS
	const pinned = v.source === 'pinned'
	const n =
		typeof v.recentTurns === 'number' && Number.isInteger(v.recentTurns) ? v.recentTurns : NaN
	return {
		who: oneOf(WHO, v.who) ? v.who : pinned ? 'pick' : d.who,
		recentTurns: n >= 1 && n <= SCENE_PORTRAITS_RECENT_MAX ? n : d.recentTurns,
		pickMembers: lines(v.pickMembers),
		face: oneOf(FACE, v.face)
			? v.face
			: pinned
				? 'chosen'
				: v.sprites === false
					? 'avatar'
					: d.face,
		chosenImages: lines(v.chosenImages),
		arrangement: oneOf(ARRANGEMENT, v.arrangement)
			? v.arrangement
			: pinned
				? 'stage'
				: d.arrangement,
		persona: typeof v.persona === 'boolean' ? v.persona : d.persona,
		playerSeats: typeof v.playerSeats === 'boolean' ? v.playerSeats : d.playerSeats,
		metPeople: typeof v.metPeople === 'boolean' ? v.metPeople : d.metPeople,
		bars: typeof v.bars === 'boolean' ? v.bars : d.bars,
		barsFor: oneOf(BARS_FOR, v.barsFor) ? v.barsFor : d.barsFor,
	}
}

/* ── chosen images ────────────────────────────────────────────────────── */

/** One `chosenImages` entry: `character:<id>=<image ref>`. @experimental */
export const chosenImagePair = (member: string, image: string): string => `${member}=${image}`

/**
 * Each member's chosen image ref, by member ref (`character:<id>`), from
 * the `chosenImages` entries — the first entry for a member wins, and an
 * entry that is not `character:<id>=<ref>` is skipped.
 * @experimental
 */
export function chosenImagesOf(entries: readonly string[]): Map<string, string> {
	const out = new Map<string, string>()
	for (const entry of entries) {
		const at = entry.indexOf('=')
		if (at < 0) continue
		const member = entry.slice(0, at).trim()
		const image = entry.slice(at + 1).trim()
		if (!/^character:\d+$/.test(member) || !image || out.has(member)) continue
		out.set(member, image)
	}
	return out
}

/**
 * `entries` with `member`'s chosen image set to `image` — or taken out, for
 * null — and every other member's kept in order. What a writer stores.
 * @experimental
 */
export function withChosenImage(
	entries: readonly string[],
	member: string,
	image: string | null,
): string[] {
	const kept = entries.filter((e) => {
		const at = e.indexOf('=')
		return at < 0 || e.slice(0, at).trim() !== member
	})
	return image ? [...kept, chosenImagePair(member, image)] : kept
}

/* ── who is shown ─────────────────────────────────────────────────────── */

/**
 * The members the widget shows, in the order it draws them (`who`), before
 * the arrangement cuts a stage to two. Never a benched character. A
 * persona appears in `scene` and `recent` only as the viewer's own (`mine`,
 * R77) and only with `persona` on; `pick` shows whomever it names.
 * @experimental
 */
export function scenePortraitMembersOf(
	characters: SessionCharactersV1 | undefined,
	settings: ScenePortraitsSettings,
): SessionCharacterV1[] {
	const members = (characters?.members ?? []).filter((m) => !m.benched)
	if (settings.who === 'pick') {
		const out: SessionCharacterV1[] = []
		for (const line of settings.pickMembers) {
			const wanted = line.toLowerCase()
			for (const m of members)
				if ((m.ref === line || m.name.trim().toLowerCase() === wanted) && !out.includes(m))
					out.push(m)
		}
		return out
	}
	const cast = members.filter((m) => !m.isPersona)
	// 🚧 With every player seat shown (`sceneFiguresOf`), the viewer's own is one of them.
	const seatsShown = settings.playerSeats && settings.who === 'scene'
	const mine = settings.persona && !seatsShown ? members.find((m) => m.isPersona && m.mine) : undefined
	const shown = mine ? [...cast, mine] : cast
	if (settings.who === 'scene') return shown
	// recent: whoever spoke last first; a member that has spoken nothing is not recent.
	return shown
		.map((m, at) => ({ m, at, when: m.lastSpokeAt ?? null }))
		.filter((x): x is { m: SessionCharacterV1; at: number; when: number } => x.when !== null)
		.sort((a, b) => b.when - a.when || a.at - b.at)
		.slice(0, settings.recentTurns)
		.map((x) => x.m)
}

/**
 * 🚧 A **scene figure** (PLAN-dc-after-walk2 Q3-5, the walk's #29): someone
 * in the scene who is no cast member of `characters.v1` — a player seat's
 * character (`playerSeats`, read off `session_state.v1`'s owners) or a
 * person the story has met (`metPeople`). Drawn after the cast with its face
 * and name, its bars when it keeps stats; never a sprite, a chosen image or a
 * set menu: it has no card to page.
 * @experimental
 */
export interface SceneFigure {
	/** The owner's state key (`player_seat:4`, `12`), or `met:<entryId>` for a person met. */
	key: string
	kind: 'player-seat' | 'met'
	name: string
	/** Its face (the owner's `face`); null draws the blank face. */
	src: string | null
	/** The state owner its bars read; null for a person met. */
	ownerKey: string | null
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

/**
 * 🚧 The scene's figures (`SceneFigure`), in the order drawn after the cast:
 * every player seat — the viewer's own first, as the Stats strip has them —
 * then the people met, each once and never one already drawn by name. Only
 * with `who: scene`: the latest speakers and a pick name cast members.
 * @experimental
 */
export function sceneFiguresOf(
	characters: SessionCharactersV1 | undefined,
	state: SessionStateV1 | undefined,
	settings: ScenePortraitsSettings,
): SceneFigure[] {
	if (settings.who !== 'scene' || !state) return []
	const out: SceneFigure[] = []
	const drawn = scenePortraitMembersOf(characters, settings).map((m) => m.name)
	const taken = (name: string) => drawn.some((n) => sameName(n, name)) || out.some((f) => sameName(f.name, name))
	if (settings.playerSeats) {
		const seated = state.owners.filter(
			(o) => (o.kind === 'session_cast' || o.kind === 'player_seat') && (o.seat === true || o.kind === 'player_seat'),
		)
		for (const o of [...seated.filter((o) => o.mine), ...seated.filter((o) => !o.mine)])
			if (!taken(o.label))
				out.push({ key: o.key, kind: 'player-seat', name: o.label, src: o.face?.src ?? null, ownerKey: o.key })
	}
	if (settings.metPeople)
		for (const p of state.metPeople ?? [])
			if (p.name.trim() && !taken(p.name))
				out.push({ key: `met:${p.entryId}`, kind: 'met', name: p.name.trim(), src: null, ownerKey: null })
	return out
}

/** One face the widget draws. @experimental */
export interface ScenePortrait {
	/** `character:<id>` — a persona's too. */
	key: SessionCharacterV1['ref']
	characterId: number
	isPersona: boolean
	name: string
	/**
	 * The image to draw; null draws the blank face. With `face: chosen` it is
	 * the avatar, the one shown until the chosen image's own `src` is known
	 * (`chosenRef`), or when none is chosen.
	 */
	src: string | null
	/** With `face: chosen`: the ref of this member's chosen image; null when none is chosen. */
	chosenRef: string | null
	/** With `who: recent`: 1 for whoever spoke last, then 2, 3…; null otherwise. */
	rank: number | null
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
export function stateOwnerKeyOf(
	state: SessionStateV1 | undefined,
	characterId: number,
): string | null {
	return state?.owners.find((o) => o.kind === 'session_cast' && o.id === characterId)?.key ?? null
}

/**
 * The faces the widget draws, in order: who (`scenePortraitMembersOf`), each
 * with the picture its `face` setting picks, cut to the first two on a
 * `stage`. A persona carries no state of its own and no sprite set: it
 * draws a face and no bars, and no menu.
 * @experimental
 */
export function scenePortraitsOf(
	characters: SessionCharactersV1 | undefined,
	state: SessionStateV1 | undefined,
	settings: ScenePortraitsSettings,
): ScenePortrait[] {
	const chosen = settings.face === 'chosen' ? chosenImagesOf(settings.chosenImages) : null
	const members = scenePortraitMembersOf(characters, settings)
	const shown = settings.arrangement === 'stage' ? members.slice(0, 2) : members
	return shown.map((m, at) => {
		const sprite = settings.face === 'sprite' && !m.isPersona ? m.sprite : null
		return {
			key: m.ref,
			characterId: m.characterId,
			isPersona: m.isPersona,
			name: m.name,
			src: sprite ?? m.face,
			chosenRef: chosen?.get(m.ref) ?? null,
			rank: settings.who === 'recent' ? at + 1 : null,
			ownerKey: m.isPersona ? null : stateOwnerKeyOf(state, m.characterId),
			spriteSets: m.isPersona ? [] : m.spriteSets,
			spriteSetOverride: m.isPersona ? null : (m.spriteSetOverride ?? null),
			offersSpriteSets:
				!m.isPersona &&
				settings.face === 'sprite' &&
				m.canChangeSpriteSet &&
				m.spriteSets.length > 1,
		}
	})
}

/**
 * ⏳ One side of the pinned source.
 * @deprecated REMOVE in 0.7.0 with `SessionCharactersV1.sceneImages`.
 * @experimental
 */
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

/**
 * ⏳ The two pinned sides, left then right — no longer drawn by the widget
 * (W6), kept for a clone that still reads `sceneImages`.
 * @deprecated REMOVE in 0.7.0 with `SessionCharactersV1.sceneImages`.
 * @experimental
 */
export function pinnedPortraitsOf(
	characters: SessionCharactersV1 | undefined,
	state: SessionStateV1 | undefined,
): PinnedPortrait[] {
	return (['left', 'right'] as const).map((side) => {
		const pin = characters?.sceneImages[side] ?? null
		const id = characterIdOf(pin?.ref)
		return {
			side,
			src: pin?.src ?? null,
			ownerKey: id == null ? null : stateOwnerKeyOf(state, id),
		}
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
export function statBarsOf(
	state: SessionStateV1 | undefined,
	ownerKey: string,
	limit = 3,
	/** 🚧 `seats`: none for an owner that is no player seat (R3-3). */
	barsFor: ScenePortraitsBarsFor = 'everyone',
): StatBarRow[] {
	if (!state) return []
	const owner = state.owners.find((o) => o.key === ownerKey)
	if (!owner) return []
	if (barsFor === 'seats' && owner.seat !== true) return []
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
