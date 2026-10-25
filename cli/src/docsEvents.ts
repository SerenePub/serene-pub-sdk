/**
 * The event catalogue, rendered from the SDK's own declarations (A1).
 *
 * Fit (R4) is only as clear as the list it is read against: every event a
 * pipeline may be registered on, the entities its body carries, and who causes
 * it — and, for the other two triggers, what an action carries and what each
 * cadence's event carries. A registration refused in words ("Story reply reads
 * the speaker; scene-opened carries none") is read against this page, so the
 * page is rendered from the same declarations the door reads: `coreEvents`
 * (with `carries`, `causedBy`, `declaredRoot`), `ACTION_CARRIES` and
 * `coreCadences`. Nothing here is written by hand, so nothing can drift.
 */
import {
	ACTION_CARRIES,
	allCadences,
	coreEvents,
	entityWord,
	eventCarries,
	eventIdOf,
	i18nText,
	SYSTEM_TICK_EVENT,
	type CadenceDef,
	type EntityKind,
	type EventDef,
	type I18n,
} from '@serene-pub/sdk'
import type { DocPage } from './docs.js'

const code = (s: string) => '`' + s + '`'
const en = (v: unknown): string => i18nText(v as I18n | undefined) ?? ''
/** One cell: no line breaks, no stray pipes. */
const cell = (s: string) => s.replace(/\n/g, ' ').replace(/\|/g, '\\|')
const words = (kinds: readonly EntityKind[]) => (kinds.length ? kinds.map((k) => entityWord(k)).join(', ') : '—')

function eventRow(e: EventDef): string {
	const id = eventIdOf(e)
	const name = en(e.name) || e.slug
	const how = e.family === 'action'
		? 'asked for by a person'
		: e.declaredRoot
			? 'the host, when it happens'
			: e.causedBy?.length
				? e.causedBy.map(code).join(', ')
				: '—'
	return `| ${code(id)} | ${cell(name)} | ${e.family} | ${words(eventCarries(e))} | ${how} | ${cell(e.description ?? '')} |`
}

function cadenceRow(c: CadenceDef): string {
	const options = Object.keys(c.options)
	const clock = c.clock === 'system' ? 'real time' : c.clock === 'story' ? 'story time' : 'the cadence decides'
	return (
		`| ${code(c.id)} | ${cell(en(c.i18n.name))} | ${c.wakesOn.map(code).join(', ') || '—'} | ` +
		`session${c.carries.filter((k) => k !== 'session').length ? ', ' + words(c.carries.filter((k) => k !== 'session')) : ''} | ` +
		`${c.clock || c.wakesOn.includes(SYSTEM_TICK_EVENT) ? clock : '—'} | ${options.length ? options.map(code).join(', ') : '—'} | ` +
		`${cell(en(c.i18n.description))} |`
	)
}

/**
 * `events.md` — every core event and what its body carries, what an action
 * carries, and every cadence with the events it wakes at. An array, like
 * `renderLawsDocs()`, so a caller appends it to the same source's pages.
 * @internal
 */
export function renderEventsDocs(): DocPage[] {
	const lines: string[] = []
	lines.push('# Events and what they carry')
	lines.push('')
	lines.push(
		'A pipeline runs when something registers it: an **event** it listens to, an **action** a person ' +
			'fires, or a **routine** whose **cadence** says it is due. Whichever it is, the trigger carries a ' +
			'few things — the session always, and sometimes a message, a speaker, a scene or the clock — and a ' +
			'pipeline **fits** a trigger only when every thing its steps read is carried. A registration that does ' +
			'not fit is refused in words, at publish, at install and in the preset editor: ' +
			'_"Story reply reads the speaker; scene-opened carries none."_ This page is what those words are read ' +
			'against. It is rendered from the SDK\'s declarations, the same ones the check reads.',
	)
	lines.push('')
	lines.push('## Events')
	lines.push('')
	lines.push(
		'An event is either **data** — something was written, caused by the steps listed — or an **action** — ' +
			'a request a person makes. Events the host raises itself, when something happens outside any ' +
			'pipeline, say so. **Carries** is what a pipeline registered on the event may read.',
	)
	lines.push('')
	lines.push('| event | name | family | carries | caused by | what it means |')
	lines.push('|---|---|---|---|---|---|')
	const events = Object.values(coreEvents as Record<string, EventDef>).sort((a, b) =>
		eventIdOf(a) < eventIdOf(b) ? -1 : 1,
	)
	for (const e of events) lines.push(eventRow(e))
	lines.push('')
	lines.push('## Actions')
	lines.push('')
	lines.push(
		`An action pipeline runs when a person presses its action. Every action carries ${words(ACTION_CARRIES)}; ` +
			'one fired on a message carries the message too, and one that asks who it is for carries the cast ' +
			'member picked.',
	)
	lines.push('')
	lines.push('## Routines and their cadences')
	lines.push('')
	lines.push(
		'A routine is a pipeline that runs when its **cadence** says so. It starts through the routine inlet ' +
			`(${code('core:inlet/routine@1')}), which always hands it the session, the routine's own metadata ` +
			'and the **cause**: what the event it woke at carried. A cadence is evaluated only at the events ' +
			"listed (**Wakes at**; `*` is every event), so a cadence that is not due costs nothing. A routine never runs beside a " +
			'reply: it waits until the session\'s actions and events have finished.',
	)
	lines.push('')
	lines.push('| cadence | name | wakes at | carries | clock | options | what it does |')
	lines.push('|---|---|---|---|---|---|---|')
	const cadences = allCadences()
		.filter((c) => c.id.startsWith('core:'))
		.sort((a, b) => (a.id < b.id ? -1 : 1))
	for (const c of cadences) lines.push(cadenceRow(c))
	lines.push('')
	lines.push(
		`An ${code('on-event')} cadence also carries what its event carries, and a story-time Schedule carries ` +
			'the clock. System Cron never runs more often than every five minutes; nothing counts in seconds.',
	)
	lines.push('')
	return [{ path: 'events.md', markdown: lines.join('\n') }]
}
