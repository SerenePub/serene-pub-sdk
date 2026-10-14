/**
 * 🚧 The conversation's **scene dividers** and **day marks**, as pure
 * functions (PROPOSAL-live-scenes §3, §7, §14 C): what the log draws between
 * its rows, and which scene boundaries a line's menu may offer.
 *
 * A scene is one of two kinds while live scenes land. A **live scene** opens
 * at a message and is the run of its channel lane's lines from there to the
 * message it closes at — open-ended while it is the **open scene**. A scene
 * **captured by selection** (ticked lines, no opening) is its
 * `selectedMessageIds` alone. A row sits in at most one scene: a captured
 * scene's lines are taken first, then the live ranges fill the rest.
 *
 * A row's **story clock stamp** (`storyClock*`, the session's story now when
 * it was written) gives the day marks: one before the first stamped line of
 * each story day on the lane the log shows.
 *
 * Self-contained — no import — so a component bundles it from source and a
 * test reads it as it stands.
 */

/** A story time as a scene's clock and a row's stamp carry it. */
export interface StoryDayParts {
	year: number
	month?: number | null
	day?: number | null
	hour?: number | null
	minute?: number | null
}

/** A scene as these functions read it (the dossier's `ConversationSceneV1`). */
export interface SceneMarkScene {
	id: number
	name: string | null
	selectedMessageIds: number[]
	historyEntryId?: number | null
	historyEntry?: { year: number; month: number | null; day: number | null } | null
	channel?: string
	openedAtMessageId?: number | null
	closedAtMessageId?: number | null
	openedAt?: StoryDayParts | null
	closedAt?: StoryDayParts | null
	summaryStatus?: string
}

/** A row as these functions read it (a `MessageV1`). */
export interface SceneMarkRow {
	id: number
	channel?: unknown
	isHidden?: boolean
	storyClockYear?: unknown
	storyClockMonth?: unknown
	storyClockDay?: unknown
}

/** How many scene colours the conversation's palette has (the Chronicle's swatches). */
export const SCENE_SWATCH_COUNT = 8

/**
 * A channel string as one lane, canonically: a bare slug is lane 1, so
 * `main` and `main:1` are one lane; unset is `main`.
 */
export function laneOf(channel: unknown): string {
	const raw = typeof channel === "string" && channel.trim() ? channel.trim() : "main"
	const at = raw.indexOf(":")
	if (at < 0) return raw
	const lane = raw.slice(at + 1)
	return lane === "1" ? raw.slice(0, at) : raw
}

/** A scene opened at a message — not one captured by selection. */
export const isLiveScene = (s: SceneMarkScene): boolean =>
	typeof s.openedAtMessageId === "number"

/** A live scene still open: no closing message yet. */
export const isOpenScene = (s: SceneMarkScene): boolean =>
	isLiveScene(s) && s.closedAtMessageId == null

/**
 * Where a scene begins in the session: its opening message, else its first
 * captured line; a scene with neither sorts last. The order scenes take
 * their colours in, here and in the Chronicle.
 */
export function sceneStartOf(s: SceneMarkScene): number {
	if (isLiveScene(s)) return s.openedAtMessageId as number
	const ids = s.selectedMessageIds ?? []
	return ids.length ? Math.min(...ids) : Number.POSITIVE_INFINITY
}

/** Each scene's colour (0–7): its place among the session's scenes, oldest first. */
export function sceneSwatches(scenes: readonly SceneMarkScene[]): Map<number, number> {
	const out = new Map<number, number>()
	;[...scenes]
		.sort((a, b) => sceneStartOf(a) - sceneStartOf(b) || a.id - b.id)
		.forEach((s, i) => out.set(s.id, i % SCENE_SWATCH_COUNT))
	return out
}

/** Whether a live scene's range holds a row: its lane, from its opening to its close. */
export function liveSceneHolds(s: SceneMarkScene, row: SceneMarkRow): boolean {
	if (!isLiveScene(s)) return false
	if (laneOf(row.channel) !== laneOf(s.channel)) return false
	if (row.id < (s.openedAtMessageId as number)) return false
	return s.closedAtMessageId == null || row.id <= s.closedAtMessageId
}

const whole = (v: unknown): number | null =>
	typeof v === "number" && Number.isInteger(v) ? v : null

/** A row's stamped story day, or null for a row written before stamps. */
export function storyDayOfRow(row: SceneMarkRow): StoryDayParts | null {
	const year = whole(row.storyClockYear)
	if (year === null) return null
	const month = whole(row.storyClockMonth)
	return { year, month, day: month === null ? null : whole(row.storyClockDay) }
}

/** Whether two story times fall on one day (as precise as both are). */
export function sameStoryDay(a: StoryDayParts, b: StoryDayParts): boolean {
	return (
		a.year === b.year &&
		(a.month ?? null) === (b.month ?? null) &&
		(a.day ?? null) === (b.day ?? null)
	)
}

/**
 * A story day spelled free-form, the calendar's bottom rung
 * (`formatStoryTime` with no calendar), the time of day left off: `Year
 * 412, Mo. 3, Day 5`. 🚧 What `sceneMarks` spells with when it is handed no
 * `dayLabel` — the conversation hands it the book's calendar's
 * (`storyDayLabelIn`, §15 G9).
 */
export function storyDayLabel(t: StoryDayParts): string {
	let out = `Year ${Math.trunc(t.year)}`
	if (t.month) out += `, Mo. ${t.month}`
	if (t.month && t.day) out += `, Day ${t.day}`
	return out
}

/** What a scene divider says and holds. */
export interface SceneDivider {
	scene: SceneMarkScene
	/** Its colour, 0–7. */
	swatch: number
	live: boolean
	/** The lane's open scene: its divider reads *since …* and carries the open mark. */
	open: boolean
	/**
	 * The story lines it holds: a closed scene's recorded lines, else the
	 * shown lines of its range that are loaded (an open scene's grow).
	 */
	lineCount: number
	/** The loaded rows it holds, in conversation order — whose faces it shows. */
	rowIds: number[]
	/** The day a live scene opened on; null for a captured scene, or one opened with no story clock. */
	dateLabel: string | null
	/**
	 * 🚧 Where *Move start up one line* moves a live scene's opening: the
	 * shown line before it on its lane, when that line is loaded and in no
	 * other scene; else null (lane E).
	 */
	startEarlier: number | null
	/**
	 * 🚧 Where *Move start down one line* moves it: the scene's next shown
	 * line on its lane, when the scene would keep a line; else null.
	 */
	startLater: number | null
	/**
	 * 🚧 *Reopen scene* is offered: a closed live scene with no open scene
	 * and no later scene on its lane, so it may run on to the newest line.
	 */
	reopens: boolean
}

/** What the log draws between its rows. */
export interface SceneMarks {
	/** Per row id: the scene it sits in, and that scene's colour. */
	sceneOf: Map<number, { sceneId: number; swatch: number; name: string }>
	/** Per row id: the divider drawn at it — its scene's first loaded row. */
	dividers: Map<number, SceneDivider>
	/** Per row id: the day mark drawn before it. */
	dayMarks: Map<number, { label: string; day: StoryDayParts }>
}

const sceneName = (s: SceneMarkScene) => (s.name?.trim() ? s.name : "Scene")

/**
 * The marks over `rows` (conversation order, oldest first). `lane` is the
 * lane the log shows: day marks compare only its rows, since the others are
 * drawn hidden. Absent, every row counts. 🚧 `dayLabel` spells a divider's
 * day and a day mark — the book's calendar's (§15 G9); absent, free-form
 * (`storyDayLabel`).
 */
export function sceneMarks(
	rows: readonly SceneMarkRow[],
	scenes: readonly SceneMarkScene[],
	opts: { lane?: string; dayLabel?: (t: StoryDayParts) => string } = {}
): SceneMarks {
	const dayLabel = opts.dayLabel ?? storyDayLabel
	const sceneOf: SceneMarks["sceneOf"] = new Map()
	const dividers: SceneMarks["dividers"] = new Map()
	const dayMarks: SceneMarks["dayMarks"] = new Map()
	const swatches = sceneSwatches(scenes)

	// Captured scenes take their ticked lines first…
	const byId = new Map(rows.map((r) => [r.id, r]))
	const holds = new Map<number, number[]>()
	for (const s of scenes) {
		if (isLiveScene(s)) continue
		for (const id of s.selectedMessageIds ?? []) {
			if (!byId.has(id) || sceneOf.has(id)) continue
			sceneOf.set(id, { sceneId: s.id, swatch: swatches.get(s.id) ?? 0, name: sceneName(s) })
		}
	}
	// …then each live range fills what is left on its lane.
	const live = scenes.filter(isLiveScene)
	for (const row of rows) {
		if (sceneOf.has(row.id)) continue
		const s = live.find((x) => liveSceneHolds(x, row))
		if (s) sceneOf.set(row.id, { sceneId: s.id, swatch: swatches.get(s.id) ?? 0, name: sceneName(s) })
	}
	for (const row of rows) {
		const at = sceneOf.get(row.id)
		if (!at) continue
		const list = holds.get(at.sceneId) ?? []
		list.push(row.id)
		holds.set(at.sceneId, list)
	}

	for (const s of scenes) {
		const ids = holds.get(s.id)
		if (!ids?.length) continue
		const liveScene = isLiveScene(s)
		const open = isOpenScene(s)
		const shown = ids.filter((id) => !byId.get(id)?.isHidden).length
		const recorded = s.selectedMessageIds?.length ?? 0
		// A captured scene's date is its history entry's, which the log's
		// history marker already says above the entry's first scene.
		const when = liveScene ? s.openedAt : null
		const nudge = liveScene ? startNudges(s, rows, sceneOf) : { startEarlier: null, startLater: null }
		dividers.set(ids[0], {
			scene: s,
			swatch: swatches.get(s.id) ?? 0,
			live: liveScene,
			open,
			lineCount: !open && recorded > 0 ? recorded : shown,
			rowIds: ids,
			dateLabel: when && typeof when.year === "number" ? dayLabel(when) : null,
			...nudge,
			reopens: liveScene && !open && mayReopen(s, live)
		})
	}

	let last: StoryDayParts | null = null
	for (const row of rows) {
		if (opts.lane !== undefined && (typeof row.channel === "string" && row.channel ? row.channel : "main") !== opts.lane)
			continue
		const day = storyDayOfRow(row)
		if (!day) continue
		if (!last || !sameStoryDay(last, day)) dayMarks.set(row.id, { label: dayLabel(day), day })
		last = day
	}
	return { sceneOf, dividers, dayMarks }
}

/**
 * 🚧 Where a live scene's opening may move by one line (lane E): the shown
 * line before it on its lane — loaded and in no scene — and the scene's own
 * next shown line, while the scene would keep at least one line.
 */
function startNudges(
	s: SceneMarkScene,
	rows: readonly SceneMarkRow[],
	sceneOf: SceneMarks["sceneOf"],
): { startEarlier: number | null; startLater: number | null } {
	const lane = laneOf(s.channel)
	const onLane = rows.filter((r) => laneOf(r.channel) === lane)
	const at = onLane.findIndex((r) => r.id === s.openedAtMessageId)
	if (at < 0) return { startEarlier: null, startLater: null }
	let earlier: SceneMarkRow | undefined
	for (let i = at - 1; i >= 0; i--)
		if (!onLane[i]!.isHidden) {
			earlier = onLane[i]
			break
		}
	let later: SceneMarkRow | undefined
	for (let i = at + 1; i < onLane.length; i++)
		if (!onLane[i]!.isHidden) {
			later = onLane[i]
			break
		}
	return {
		startEarlier: earlier && !sceneOf.has(earlier.id) ? earlier.id : null,
		startLater:
			later &&
			sceneOf.get(later.id)?.sceneId === s.id &&
			(s.closedAtMessageId == null || later.id <= s.closedAtMessageId)
				? later.id
				: null,
	}
}

/** A closed live scene may run on again: no open scene and no later scene on its lane. */
function mayReopen(s: SceneMarkScene, live: readonly SceneMarkScene[]): boolean {
	const lane = laneOf(s.channel)
	return !live.some(
		(x) =>
			x.id !== s.id &&
			laneOf(x.channel) === lane &&
			(isOpenScene(x) || (x.openedAtMessageId as number) > (s.openedAtMessageId as number)),
	)
}

/** Which scene boundaries a line's menu may offer. */
export interface BoundaryOffer {
	/** *Start scene here*: a scene may open at this line. */
	start: boolean
	/** *End scene here*: the open scene this line may close, by id; null when none. */
	end: number | null
}

/**
 * What the host would accept at this line — mirrored so the menu hides what
 * it would refuse (`scenes:open`, `scenes:close`):
 *
 * - **Start** where the line is in no scene captured by selection and in no
 *   closed scene, and the lane's open scene (if any) opened before it — the
 *   open one is then closed at the line before. With no open scene, every
 *   closed scene on the lane must end before the line (a new one runs on to
 *   the newest line, and may not cover another).
 * - **End** where the lane's open scene opened at or before the line.
 */
export function boundaryOffer(row: SceneMarkRow, scenes: readonly SceneMarkScene[]): BoundaryOffer {
	const lane = laneOf(row.channel)
	const onLane = scenes.filter((s) => isLiveScene(s) && laneOf(s.channel) === lane)
	const open = onLane.find(isOpenScene) ?? null
	const captured = scenes.some(
		(s) => !isLiveScene(s) && (s.selectedMessageIds ?? []).includes(row.id)
	)
	const inClosed = onLane.some((s) => !isOpenScene(s) && liveSceneHolds(s, row))
	const start =
		!captured &&
		!inClosed &&
		(open
			? row.id > (open.openedAtMessageId as number)
			: onLane.every((s) => s.closedAtMessageId != null && s.closedAtMessageId < row.id))
	const end = open && row.id >= (open.openedAtMessageId as number) ? open.id : null
	return { start, end }
}

/**
 * 🚧 Whether a run may become one closed scene (*Mark as scene*, lane E) —
 * what the host would take, mirrored: no line of it on its lane is in a
 * scene captured by selection, and it overlaps no live scene on its lane,
 * except that the lane's open scene, opened before the run, is closed at the
 * line before (as *Start scene here* closes it).
 */
export function runOffer(
	run: { lane: string; first: number; last: number },
	scenes: readonly SceneMarkScene[],
	rows: readonly SceneMarkRow[],
): boolean {
	const onLane = scenes.filter((s) => isLiveScene(s) && laneOf(s.channel) === run.lane)
	for (const s of onLane) {
		const opened = s.openedAtMessageId as number
		if (isOpenScene(s)) {
			if (run.last < opened) continue
			if (run.first <= opened) return false
			continue
		}
		if (run.first <= (s.closedAtMessageId as number) && opened <= run.last) return false
	}
	const captured = new Set(scenes.filter((s) => !isLiveScene(s)).flatMap((s) => s.selectedMessageIds ?? []))
	return !rows.some(
		(r) => r.id >= run.first && r.id <= run.last && laneOf(r.channel) === run.lane && captured.has(r.id),
	)
}

/**
 * The run a selection marks as one scene (*Mark as scene*): from the
 * earliest line picked to the latest picked on that line's lane, or null for
 * an empty selection.
 */
export function markedRun(
	selected: Iterable<number>,
	rows: readonly SceneMarkRow[]
): { lane: string; first: number; last: number } | null {
	const picked = new Set(selected)
	const chosen = rows.filter((r) => picked.has(r.id))
	if (!chosen.length) return null
	const first = chosen.reduce((a, b) => (b.id < a.id ? b : a))
	const lane = laneOf(first.channel)
	const last = chosen
		.filter((r) => laneOf(r.channel) === lane)
		.reduce((a, b) => (b.id > a.id ? b : a))
	return { lane, first: first.id, last: last.id }
}
