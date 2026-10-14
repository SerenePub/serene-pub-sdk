/**
 * `@serene-pub/core-catalog/attendance` — the plain-TypeScript half of core's
 * Who's here widget (PLAN-core-widgets W10): its settings, and the one view
 * it draws from the session's **attendance** (`attendance.v1`) — the people
 * who have the session open (**Here**), each with the personas they write
 * as and whether they are typing, then the ones who left (**Away**) with
 * when they were last here. The widget's Svelte source lives in
 * `components/shared/attendance/` and ships built
 * (`dist/components/attendance.js`); a host imports only this half, which
 * carries no Svelte runtime.
 *
 * Who is here is the host's word (`AttendeeV1.here`), never worked out
 * here; this only groups and words it. The personas' names and faces come
 * from the cast (`characters.v1`), by the refs the section names.
 *
 * Every sentence is English source handed through the widget's `t`, so the
 * same words speak the viewer's language natively or in a worker.
 *
 * ⚠ Not a cast **presence** (a cast member's dated span in the world): the
 * people here are accounts — the session's owner and its guests.
 *
 * 🚧 Provisional with the widget.
 */
import type { AttendanceV1, AttendeeV1, SessionCharactersV1, ViewerV1 } from '@serene-pub/sdk'

/** A translation: English source in, the viewer's words out. @experimental */
export type AttendanceT = (source: string) => string

/** The widget's settings, complete — the declared defaults wherever an instance has none. @experimental */
export interface AttendanceSettings {
	/** List the people with a seat who are not here now, under **Away**. */
	showAway: boolean
	/** Draw each persona's face beside its name. */
	faces: boolean
}

/** @experimental */
export const ATTENDANCE_DEFAULTS: AttendanceSettings = Object.freeze({
	showAway: true,
	faces: true,
})

/** Read one settings payload (`settings.v1`) into the complete object above. @experimental */
export function readAttendanceSettings(
	raw: Record<string, unknown> | undefined,
): AttendanceSettings {
	const v = raw ?? {}
	return {
		showAway: typeof v.showAway === 'boolean' ? v.showAway : ATTENDANCE_DEFAULTS.showAway,
		faces: typeof v.faces === 'boolean' ? v.faces : ATTENDANCE_DEFAULTS.faces,
	}
}

/**
 * When someone away was last here, from `now` (ms): `Last here just now`,
 * `Last here 5m ago`, `… 3h ago`, `… 2d ago`; `Not seen lately` when the
 * host has no time for them (it has not seen them since it started).
 * @experimental
 */
export function attendanceLastHere(at: number | null, now: number, t: AttendanceT): string {
	if (at === null || !Number.isFinite(at)) return t('Not seen lately')
	const s = Math.max(0, Math.round((now - at) / 1000))
	if (s < 60) return t('Last here just now')
	if (s < 3600) return t('Last here {n}m ago').replace('{n}', String(Math.round(s / 60)))
	if (s < 86400) return t('Last here {n}h ago').replace('{n}', String(Math.round(s / 3600)))
	return t('Last here {n}d ago').replace('{n}', String(Math.round(s / 86400)))
}

/** One persona a person writes as, as drawn. @experimental */
export interface AttendancePersonaView {
	ref: `character:${number}`
	/** What `open-character` opens. */
	characterId: number
	name: string
	/** The persona's face, when faces are on and the card has one. */
	face: string | null
}

/** One person's row. @experimental */
export interface AttendancePersonView {
	key: string
	userId: number
	name: string
	/** The viewer's own row. */
	you: boolean
	role: AttendeeV1['role']
	/** `Owner` · `Guest`, worded. */
	roleChip: string
	/** One of their personas is typing now (Here rows only). */
	typing: boolean
	personas: AttendancePersonaView[]
	/** When they were last here (Away rows only); null on a Here row. */
	lastHere: string | null
}

/** Everything the widget draws. @experimental */
export interface AttendanceView {
	/** Who has the session open now: the viewer first, then the owner, then guests by name. */
	here: AttendancePersonView[]
	/** Who has a seat and is not here — empty when `showAway` is off. Most recently here first. */
	away: AttendancePersonView[]
	/** *Nobody else is here.* when nobody but the viewer has it open; null otherwise. */
	alone: string | null
}

/** Everything the view is drawn from: the widget's sections. @experimental */
export interface AttendanceInputs {
	attendance: AttendanceV1 | undefined
	/** `characters.v1`, for the personas' names and faces; absent when not granted. */
	characters?: SessionCharactersV1
	viewer: ViewerV1
	settings: AttendanceSettings
	/** The clock the Away times are told from (ms). */
	now: number
	t: AttendanceT
}

const characterIdOf = (ref: string): number | null => {
	const m = /^character:(\d+)$/.exec(ref)
	return m ? Number(m[1]) : null
}

/**
 * Group the session's attendance into Here and Away, word each row, and find
 * each persona's name and face in the cast. A persona the cast does not list
 * (not granted, or gone) is left out rather than drawn nameless.
 * @experimental
 */
export function attendanceView(input: AttendanceInputs): AttendanceView {
	const { t, settings, viewer, now } = input
	const people = input.attendance?.people ?? []
	const members = input.characters?.members ?? []
	const byRef = new Map(members.map((m) => [m.ref as string, m]))
	const chips: Record<AttendeeV1['role'], string> = { owner: t('Owner'), guest: t('Guest') }

	const personasOf = (p: AttendeeV1): AttendancePersonaView[] => {
		const out: AttendancePersonaView[] = []
		for (const ref of p.personaRefs ?? []) {
			const m = byRef.get(ref)
			const characterId = characterIdOf(ref)
			if (!m || characterId === null) continue
			out.push({
				ref,
				characterId,
				name: m.name,
				face: settings.faces ? (m.face ?? null) : null,
			})
		}
		return out
	}
	const row = (p: AttendeeV1, here: boolean): AttendancePersonView => ({
		key: `user:${p.userId}`,
		userId: p.userId,
		name: p.name || t('Someone'),
		you: viewer.userId != null && p.userId === viewer.userId,
		role: p.role,
		roleChip: chips[p.role] ?? chips.guest,
		typing: here && !!p.typing,
		personas: personasOf(p),
		lastHere: here ? null : attendanceLastHere(p.lastSeenAt, now, t),
	})

	const rank = (r: AttendancePersonView) => (r.you ? 0 : r.role === 'owner' ? 1 : 2)
	const here = people
		.filter((p) => p.here)
		.map((p) => row(p, true))
		.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))
	const away = settings.showAway
		? people
				.filter((p) => !p.here)
				.sort(
					(a, b) =>
						(b.lastSeenAt ?? -1) - (a.lastSeenAt ?? -1) || a.name.localeCompare(b.name),
				)
				.map((p) => row(p, false))
		: []
	const alone = here.some((r) => !r.you) ? null : t('Nobody else is here.')
	return { here, away, alone }
}
