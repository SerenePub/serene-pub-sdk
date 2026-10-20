/**
 * 🚧 **Background tasks** (PLAN-genre-restructure §4, ruled 2026-10-19): the
 * things a genre may do *around* a reply — read lore into the context, reckon
 * what the reply changed, sweep the history into summaries and lore every few
 * turns, react to an event, let extra voices speak. Each is declared by the
 * genre (`GenreDecl.tasks`), carries a **mode** (`full` · `review` · `off` —
 * the lorebook write-mode triple, never a bare boolean) and belongs to a
 * **trigger group** that says *when* it runs. A session stores its choices in
 * one field of type `'tasks'` (`TaskSettingsV1`); a preset pins defaults
 * through `PresetDecl.settings`; the host renders one grouped control and the
 * genre's pipelines branch on the resolved settings — one pipeline, never one
 * per toggle (owner ruling 2026-10-19).
 *
 * Genre pins the grouping; the mechanism is the SDK's (widget-functionality-universal).
 * @experimental
 */
import { i18nFindings, type I18n } from './i18n.js'

/** When a task runs — the five trigger groups, in the order the host shows them. @experimental */
export const TASK_GROUPS = ['reply', 'reckoning', 'sweep', 'events', 'voices'] as const
/** @experimental */
export type TaskGroup = (typeof TASK_GROUPS)[number]

/** How a task runs: on and applied, on but held for review, or off. @experimental */
export const TASK_MODES = ['full', 'review', 'off'] as const
/** @experimental */
export type TaskMode = (typeof TASK_MODES)[number]

/** What resolves a task: prose (a model call reads words), a script (free), or both with prose as the fallback. @experimental */
export type TaskKind = 'prose' | 'script' | 'both'

/** The display text of a trigger group, with its cost in plain words. @experimental */
export const TASK_GROUP_TEXT: Readonly<Record<TaskGroup, { label: string; cost: string }>> = Object.freeze({
	reply: { label: 'In the reply', cost: 'No extra call: read into the reply as context.' },
	reckoning: { label: 'After each turn', cost: 'One extra call after the reply, when anything here is on.' },
	sweep: { label: 'Every few turns', cost: 'One batched call every N turns, or after each scene.' },
	// Not *event* (R1: a pipeline's event is another thing): the moments themselves, in words (2026-10-19).
	events: { label: 'When something happens', cost: 'Runs at the moment: a new scene, a move, an effect running out, a goal reached.' },
	voices: { label: 'Extra voices', cost: 'More replies per turn: breaks one voice per turn.' },
})

/** @experimental */
export interface TaskDecl {
	/** The key the session stores its choice under and the pipeline branches on. */
	readonly key: string
	readonly label: I18n
	readonly description?: I18n
	readonly group: TaskGroup
	/** Prose, script, or both (script when the ruleset has one, prose otherwise). */
	readonly kind: TaskKind
	/** The mode when nothing pins one. */
	readonly default: TaskMode
	/** May a person pull this task onto its own frequency (every N turns, after each scene)? Absent means yes for `sweep` and `reckoning`, no otherwise. */
	readonly detachable?: boolean
	/** `review` offered? A task whose result is never a proposal (reading, voices) says `false`. Absent means yes. */
	readonly reviewable?: boolean
}

/** How often a `sweep` (or a detached task) fires: every N turns, or after each scene. @experimental */
export type TaskEvery = number | 'scene'

/** One stored task choice. @experimental */
export interface TaskChoiceV1 {
	mode: TaskMode
	/** Detached from its group onto this frequency (`sweep`-style tasks only). */
	every?: TaskEvery
}

/** The stored value of a `'tasks'` field — version 1. @experimental */
export interface TaskSettingsV1 {
	v: 1
	/** Per group: the shared frequency (`sweep`) and whether to wait for the round to end first. */
	groups?: Partial<Record<TaskGroup, { every?: TaskEvery; waitForRound?: boolean }>>
	tasks?: Record<string, TaskChoiceV1>
}

/** One task as a session actually runs it. @experimental */
export interface ResolvedTask extends TaskDecl {
	readonly mode: TaskMode
	readonly every: TaskEvery
	readonly waitForRound: boolean
}

/** The defaults when nothing is stored: sweep every 5 turns, wait for the round. @experimental */
export const TASK_DEFAULTS = Object.freeze({ sweepEvery: 5 as TaskEvery, waitForRound: true })

const isEvery = (v: unknown): v is TaskEvery => v === 'scene' || (typeof v === 'number' && Number.isInteger(v) && v >= 1)

/**
 * Resolve what a session runs: the declared tasks, each with the mode a pin
 * or the stored value chose (stored > pinned > declared default), its
 * frequency and whether its group waits for the round. Unknown stored keys are
 * ignored; a stored mode a task does not offer falls back to its default.
 * @experimental
 */
export function resolveTasks(
	decls: readonly TaskDecl[] | undefined,
	stored: unknown,
	pinned?: unknown,
): ResolvedTask[] {
	const s = asSettings(stored)
	const p = asSettings(pinned)
	const out: ResolvedTask[] = []
	for (const d of decls ?? []) {
		const choice = s.tasks?.[d.key] ?? p.tasks?.[d.key]
		let mode: TaskMode = d.default
		if (choice && TASK_MODES.includes(choice.mode)) mode = choice.mode
		if (mode === 'review' && d.reviewable === false) mode = 'full'
		const groupEvery = s.groups?.[d.group]?.every ?? p.groups?.[d.group]?.every
		const detachable = d.detachable ?? (d.group === 'sweep' || d.group === 'reckoning')
		const every: TaskEvery =
			d.group === 'sweep'
				? isEvery(choice?.every)
					? choice!.every!
					: isEvery(groupEvery)
						? groupEvery
						: TASK_DEFAULTS.sweepEvery
				: detachable && isEvery(choice?.every)
					? choice!.every!
					: 1
		const wait = s.groups?.[d.group]?.waitForRound ?? p.groups?.[d.group]?.waitForRound
		out.push({ ...d, mode, every, waitForRound: typeof wait === 'boolean' ? wait : TASK_DEFAULTS.waitForRound })
	}
	return out
}

/**
 * Is this task due on the turn just completed? `every` 1 is every turn; a
 * number is every Nth turn; `'scene'` is decided by the caller's scene
 * boundary flag. A task that is `off` is never due.
 * @experimental
 */
export const taskDue = (t: Pick<ResolvedTask, 'mode' | 'every'>, turn: number, sceneBoundary = false): boolean =>
	t.mode !== 'off' && (t.every === 'scene' ? sceneBoundary : t.every <= 1 ? true : sweepDue(turn, t.every))

/** The tasks of one group that are on (`full` or `review`). @experimental */
export const tasksOn = (resolved: readonly ResolvedTask[], group: TaskGroup): ResolvedTask[] =>
	resolved.filter((t) => t.group === group && t.mode !== 'off')

/**
 * Is a sweep due on this turn? `turn` is the session's turn count (1-based,
 * the turn just completed); `every` the shared or detached frequency. A
 * `'scene'` frequency is decided by the caller from the scene boundary.
 * @experimental
 */
export const sweepDue = (turn: number, every: TaskEvery): boolean =>
	typeof every === 'number' && every >= 1 && turn > 0 && turn % every === 0

function asSettings(v: unknown): TaskSettingsV1 {
	if (!v || typeof v !== 'object') return { v: 1 }
	const o = v as Record<string, unknown>
	const tasks: Record<string, TaskChoiceV1> = {}
	if (o.tasks && typeof o.tasks === 'object')
		for (const [k, c] of Object.entries(o.tasks as Record<string, unknown>)) {
			if (!c || typeof c !== 'object') continue
			const cc = c as Record<string, unknown>
			if (!TASK_MODES.includes(cc.mode as TaskMode)) continue
			tasks[k] = { mode: cc.mode as TaskMode, ...(isEvery(cc.every) ? { every: cc.every } : {}) }
		}
	const groups: TaskSettingsV1['groups'] = {}
	if (o.groups && typeof o.groups === 'object')
		for (const g of TASK_GROUPS) {
			const gg = (o.groups as Record<string, unknown>)[g]
			if (!gg || typeof gg !== 'object') continue
			const r = gg as Record<string, unknown>
			groups[g] = {
				...(isEvery(r.every) ? { every: r.every } : {}),
				...(typeof r.waitForRound === 'boolean' ? { waitForRound: r.waitForRound } : {}),
			}
		}
	return { v: 1, groups, tasks }
}

/** The stored shape, normalised: what a host writes back after editing. @experimental */
export const normaliseTaskSettings = (v: unknown): TaskSettingsV1 => asSettings(v)

/**
 * Why a genre's `tasks` is refused: a key that is not a slug, a duplicate key,
 * an unknown group/kind/mode, or display text without `en`.
 * @experimental
 */
export function taskDeclsFindings(raw: unknown, at = 'tasks'): string[] {
	const out: string[] = []
	if (raw === undefined) return out
	if (!Array.isArray(raw)) return [`${at} is a list of task declarations`]
	const seen = new Set<string>()
	raw.forEach((t, i) => {
		const where = `${at}[${i}]`
		if (!t || typeof t !== 'object') return void out.push(`${where} is not a task declaration`)
		const d = t as Record<string, unknown>
		if (typeof d.key !== 'string' || !/^[a-z][a-z0-9-]*$/.test(d.key))
			out.push(`${where}.key is a lower-case slug (letters, digits, dashes)`)
		else if (seen.has(d.key)) out.push(`${where}.key '${d.key}' is declared twice`)
		else seen.add(d.key)
		out.push(...i18nFindings(d.label, `${where}.label`, { required: true }))
		out.push(...i18nFindings(d.description, `${where}.description`))
		if (!TASK_GROUPS.includes(d.group as TaskGroup))
			out.push(`${where}.group is one of ${TASK_GROUPS.join(', ')}`)
		if (d.kind !== 'prose' && d.kind !== 'script' && d.kind !== 'both')
			out.push(`${where}.kind is 'prose', 'script' or 'both'`)
		if (!TASK_MODES.includes(d.default as TaskMode)) out.push(`${where}.default is one of ${TASK_MODES.join(', ')}`)
		if (d.detachable !== undefined && typeof d.detachable !== 'boolean') out.push(`${where}.detachable is a boolean`)
		if (d.reviewable !== undefined && typeof d.reviewable !== 'boolean') out.push(`${where}.reviewable is a boolean`)
	})
	return out
}
