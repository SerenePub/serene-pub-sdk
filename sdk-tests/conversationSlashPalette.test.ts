/**
 * The `/` palette's logic (R-15 slash names, F38; U5c). No component test
 * pattern exists in this repo (the suite runs in a node environment with no
 * `@testing-library/svelte`), so the palette's behaviour is pinned here on
 * the pure half and the markup is driven by hand — see docs/sessions.md
 * "Slash commands".
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { CORE_ACTIONS, CORE_VERB_REASONS, partitionEnabledWhen } from '@serene-pub/sdk'
import { itemValuesOf } from '../core-catalog/src/ui/sessions/conversation/index.js'
import {
	dedupePaletteActions,
	exactPaletteMatch,
	exactSlashCommand,
	filterPaletteActions,
	paletteRowState,
	parseSlashCommand,
	slashArgumentHint,
	slashArgumentRefusal,
	slashQueryOf,
	statusTextIn,
	stepHighlight,
	type PaletteAction,
} from '../core-catalog/src/ui/sessions/conversation/index.js'

const action = (over: Partial<PaletteAction>): PaletteAction => ({
	key: 'narrate',
	specSlug: 'core:spec/narrate',
	name: 'Narrate',
	slash: 'narrate',
	audience: { act: ['owner'] },
	canAct: true,
	isNew: false,
	venue: 'composer',
	...over,
})

const ACTIONS: PaletteAction[] = [
	action({}),
	action({
		key: 'narrate-character',
		specSlug: 'core:spec/narrate-character',
		name: 'Side character',
		slash: 'narrate-character',
	}),
	action({
		key: 'generate-image',
		specSlug: 'core:spec/generate-image',
		name: 'Image',
		slash: 'generate-image',
	}),
	action({
		key: 'roll',
		specSlug: 'acme:spec/roll',
		name: 'Roll the dice',
		slash: 'acme.roll',
		isNew: true,
	}),
	action({
		key: 'advance',
		specSlug: 'core',
		name: 'Continue',
		slash: 'advance',
		venue: 'extra',
	}),
]

describe('the draft as a slash query', () => {
	it('opens on a leading slash with no whitespace, and on nothing else', () => {
		assert.equal(slashQueryOf('/'), '')
		assert.equal(slashQueryOf('/nar'), 'nar')
		assert.equal(slashQueryOf('/acme.roll'), 'acme.roll')
		assert.equal(slashQueryOf(''), null)
		assert.equal(slashQueryOf('hello /narrate'), null)
		assert.equal(slashQueryOf('/narrate now'), null)
		assert.equal(slashQueryOf('/nar\n'), null)
	})
})

describe('filtering', () => {
	it('lists everything for a bare slash, one row per slash name', () => {
		const twice = [...ACTIONS, action({ specSlug: 'core:spec/narrate-b' })]
		assert.deepEqual(
			filterPaletteActions(twice, '').map((a) => a.slash),
			['narrate', 'narrate-character', 'generate-image', 'acme.roll', 'advance'],
		)
	})

	it('matches slash-name prefixes first, then labels — case-insensitively', () => {
		assert.deepEqual(
			filterPaletteActions(ACTIONS, 'nar').map((a) => a.slash),
			['narrate', 'narrate-character'],
		)
		// `Image` by label; `generate-image` by the name containing `image`.
		assert.deepEqual(
			filterPaletteActions(ACTIONS, 'IMA').map((a) => a.slash),
			['generate-image'],
		)
		// A plugin's namespaced name is reachable by either half.
		assert.deepEqual(
			filterPaletteActions(ACTIONS, 'roll').map((a) => a.slash),
			['acme.roll'],
		)
		assert.deepEqual(
			filterPaletteActions(ACTIONS, 'acme').map((a) => a.slash),
			['acme.roll'],
		)
		assert.deepEqual(filterPaletteActions(ACTIONS, 'zzz'), [])
	})
})

describe('Enter on an exact name', () => {
	it('names the action whether or not the palette is open', () => {
		assert.equal(exactPaletteMatch(ACTIONS, '/narrate')?.key, 'narrate')
		assert.equal(exactPaletteMatch(ACTIONS, '/NARRATE')?.key, 'narrate')
		assert.equal(exactPaletteMatch(ACTIONS, '/acme.roll')?.key, 'roll')
		assert.equal(exactPaletteMatch(ACTIONS, '/nar'), undefined)
		assert.equal(exactPaletteMatch(ACTIONS, 'narrate'), undefined)
	})

	it('with no highlight, Enter runs the first filtered row — the documented rule (S5)', () => {
		// The component's Enter reads: the highlighted row, else the exact
		// match, else the first row of a narrowed list. Pinned here on the
		// pure half: `/gen` narrows to one row, and that row is the pick.
		const rows = filterPaletteActions(ACTIONS, 'gen')
		assert.deepEqual(
			rows.map((a) => a.slash),
			['generate-image'],
		)
		assert.equal(exactPaletteMatch(ACTIONS, '/gen'), undefined)
		assert.equal(rows[0]?.key, 'generate-image')
	})
})

/**
 * One row per slash name (plans/31 V2: one slash name means one action, so
 * two declarations under one name never reach a session — the dedupe folds
 * one declaration's several venues, and holds core's verb to its name).
 */
describe('one row per slash name', () => {
	it('one declaration listed under two venues is one row, in its first place', () => {
		const twice = [...ACTIONS, action({ venue: 'extra' })]
		const rows = dedupePaletteActions(twice)
		assert.deepEqual(
			rows.map((a) => a.slash),
			['narrate', 'narrate-character', 'generate-image', 'acme.roll', 'advance'],
		)
		assert.partialDeepStrictEqual(rows[0], { specSlug: 'core:spec/narrate', venue: 'composer' })
		assert.partialDeepStrictEqual(exactPaletteMatch(twice, '/narrate'), {
			specSlug: 'core:spec/narrate',
		})
	})

	it("a core verb holds its name (S1): the verb's row, whichever side of it a stale alternative was listed", () => {
		const alternative = action({
			key: 'advance',
			specSlug: 'core:spec/keep-going',
			name: 'Keep going',
			slash: 'advance',
		})
		for (const list of [
			[...ACTIONS, alternative],
			[alternative, ...ACTIONS],
		]) {
			const row = dedupePaletteActions(list).find((a) => a.slash === 'advance')
			assert.partialDeepStrictEqual(row, { specSlug: 'core', key: 'advance' })
		}
	})
})

describe("a row's state", () => {
	/** The audience half every row carries off the list: the name and who may act. */
	const roll = { name: 'Roll', audience: { act: ['owner'] } }
	/** The audience's sentence — `core:verdict/audience`'s own, quoted (01 §13). */
	const notYours = "'Roll' is not yours to use here — its audience is owner."

	it('is greyed by the audience first, then while a reply streams — like the chips and the More menu (S5)', () => {
		assert.deepEqual(paletteRowState({ ...roll, canAct: true }, { generating: false }), {
			disabled: false,
		})
		assert.deepEqual(paletteRowState({ ...roll, canAct: false }, { generating: false }), {
			disabled: true,
			reason: notYours,
		})
		assert.deepEqual(paletteRowState({ ...roll, canAct: true }, { generating: true }), {
			disabled: true,
			reason: 'wait for the reply to finish',
		})
		// The audience's sentence wins: a greyed chip does not change its
		// reason because something else is busy.
		assert.equal(
			paletteRowState({ ...roll, canAct: false }, { generating: true }).reason,
			notYours,
		)
	})

	it('reads the declared enabled-when verdict between the two, with its reason (U5e)', () => {
		const grey = { ...roll, canAct: true, enabled: false, reason: 'Set a location first' }
		assert.deepEqual(paletteRowState(grey, { generating: false }), {
			disabled: true,
			reason: 'Set a location first',
		})
		// The audience's word still first; the declared reason over the busy rule.
		assert.equal(
			paletteRowState({ ...grey, canAct: false }, { generating: false }).reason,
			notYours,
		)
		assert.equal(paletteRowState(grey, { generating: true }).reason, 'Set a location first')
		// An older server sends no verdict: enabled.
		assert.deepEqual(
			paletteRowState({ ...roll, canAct: true, enabled: undefined }, { generating: false }),
			{
				disabled: false,
			},
		)
		// A verdict with no sentence still greys — the row says nothing rather than lying.
		assert.deepEqual(
			paletteRowState({ ...roll, canAct: true, enabled: false }, { generating: false }),
			{
				disabled: true,
			},
		)
	})

	it("judges an extra row's item.* predicates against the newest row, and a session with no row fails them with the newest reason (U5e live walk)", () => {
		const retry = CORE_ACTIONS.find((a) => a.key === 'retry')!
		const itemPredicates = partitionEnabledWhen(retry.enabledWhen!, 'item').under
		// Regenerate / `/retry`: core's `retry` at the extra venue, acting on the newest row.
		const row = {
			name: 'Regenerate',
			audience: { act: ['item'] },
			canAct: true,
			enabled: true,
			itemPredicates,
			venue: 'extra',
		}
		// No row at all: `/retry` is grey exactly as the Regenerate chip is.
		assert.deepEqual(paletteRowState(row, { generating: false, newest: null }), {
			disabled: true,
			reason: CORE_VERB_REASONS.notNewest.en,
		})
		// A newest reply the road can redo: open.
		const reply = itemValuesOf({ id: 9, role: 'assistant' }, { isNewest: true, mine: true })
		assert.deepEqual(paletteRowState(row, { generating: false, newest: reply }), {
			disabled: false,
		})
		// …a hidden one, or a greeting: grey with that predicate's reason.
		assert.equal(
			paletteRowState(row, {
				generating: false,
				newest: itemValuesOf(
					{ id: 9, role: 'assistant', isHidden: true },
					{ isNewest: true, mine: true },
				),
			}).reason,
			CORE_VERB_REASONS.hidden.en,
		)
		assert.equal(
			paletteRowState(row, {
				generating: false,
				newest: itemValuesOf(
					{ id: 9, role: 'assistant', metadata: { isGreeting: true } },
					{ isNewest: true, mine: true },
				),
			}).reason,
			CORE_VERB_REASONS.greeting.en,
		)
		// A surface offering no row leaves them unjudged; a row with none is untouched.
		assert.deepEqual(paletteRowState(row, { generating: false }), { disabled: false })
		assert.deepEqual(
			paletteRowState(
				{ ...roll, canAct: true, enabled: true },
				{ generating: false, newest: null },
			),
			{
				disabled: false,
			},
		)
		// The audience and the list's own verdict still come first; the busy rule after.
		assert.equal(
			paletteRowState({ ...row, canAct: false }, { generating: false, newest: null }).reason,
			"'Regenerate' is not yours to use here — its audience is item.",
		)
		assert.equal(
			paletteRowState(row, { generating: true, newest: reply }).reason,
			'wait for the reply to finish',
		)
	})

	it("a failed item predicate's sentence speaks the language of the statusText its caller hands in — the page's own, in the page's realm", () => {
		const mine = { on: 'item.mine', truthy: true, reason: { en: 'only on your own line', es: 'solo en tu propia línea' } }
		const row = {
			name: 'Regenerate',
			audience: { act: ['item'] },
			canAct: true,
			enabled: true,
			itemPredicates: [mine],
			venue: 'extra',
		}
		const theirs = itemValuesOf({ id: 9, role: 'assistant' }, { isNewest: true, mine: false })
		// Nothing set in this realm and nothing handed in: English.
		assert.equal(paletteRowState(row, { generating: false, newest: theirs }).reason, 'only on your own line')
		// The caller's language: the author's translation when it ships one…
		const spanish = (t: (en: string) => string) => (s: Parameters<typeof statusTextIn>[0]) => statusTextIn(s, 'es', t)
		assert.equal(
			paletteRowState(row, { generating: false, newest: theirs, statusText: spanish((en) => en) }).reason,
			'solo en tu propia línea',
		)
		// …else the caller's `t` over the English.
		assert.equal(
			paletteRowState(
				{ ...row, itemPredicates: [{ ...mine, reason: { en: 'only on your own line' } }] },
				{ generating: false, newest: theirs, statusText: spanish((en) => `[es] ${en}`) },
			).reason,
			'[es] only on your own line',
		)
	})

	it("a composer row's press names no row, so its item.* predicates are judged against none — as the door judges them (W4)", () => {
		const onlyMine = [
			{ on: 'item.mine', truthy: true, reason: { en: 'only on your own line' } },
		]
		const newest = itemValuesOf({ id: 9, role: 'assistant' }, { isNewest: true, mine: true })
		// A message action listed in the composer too: grey there whatever the newest row says.
		assert.deepEqual(
			paletteRowState(
				{
					...roll,
					canAct: true,
					enabled: true,
					itemPredicates: onlyMine,
					venue: 'composer',
				},
				{ generating: false, newest },
			),
			{ disabled: true, reason: 'only on your own line' },
		)
		// A row with no venue named reads as the composer's.
		assert.equal(
			paletteRowState(
				{ ...roll, canAct: true, enabled: true, itemPredicates: onlyMine },
				{ generating: false, newest },
			).disabled,
			true,
		)
		// The same predicates at the extra venue act on the newest row.
		assert.deepEqual(
			paletteRowState(
				{ ...roll, canAct: true, enabled: true, itemPredicates: onlyMine, venue: 'extra' },
				{ generating: false, newest },
			),
			{ disabled: false },
		)
	})

	it("the turn controls' chips read the same verdict: Regenerate is grey while generating, hidden, or with nothing to redo (pass 3)", () => {
		// What the page's `extraChip` hands over: the listed `retry` at the
		// extra venue, the reason resolved, the newest row beside it.
		const retry = CORE_ACTIONS.find((a) => a.key === 'retry')!
		const listed = (enabled: boolean, reason?: string) => ({
			...roll,
			canAct: true,
			enabled,
			venue: 'extra',
			...(reason ? { reason } : {}),
			itemPredicates: partitionEnabledWhen(retry.enabledWhen!, 'item').under,
		})
		const newest = itemValuesOf({ id: 3, role: 'assistant' }, { isNewest: true, mine: true })
		// The start push: the server said no.
		assert.deepEqual(
			paletteRowState(listed(false, CORE_VERB_REASONS.generating.en), {
				generating: false,
				newest,
			}),
			{ disabled: true, reason: CORE_VERB_REASONS.generating.en },
		)
		// The end push, a reply to redo: open.
		assert.deepEqual(paletteRowState(listed(true), { generating: false, newest }), {
			disabled: false,
		})
		// …a hidden newest row, or none: grey with the row's reason.
		assert.equal(
			paletteRowState(listed(true), {
				generating: false,
				newest: itemValuesOf(
					{ id: 3, role: 'assistant', isHidden: true },
					{ isNewest: true, mine: true },
				),
			}).reason,
			CORE_VERB_REASONS.hidden.en,
		)
		assert.equal(
			paletteRowState(listed(true), { generating: false, newest: null }).reason,
			CORE_VERB_REASONS.notNewest.en,
		)
		// …and the author's own line as the newest row (F1, a persona-less
		// genre after the last reply was deleted): grey, never a regenerate.
		assert.equal(
			paletteRowState(listed(true), {
				generating: false,
				newest: itemValuesOf({ id: 4, role: 'user' }, { isNewest: true, mine: true }),
			}).reason,
			CORE_VERB_REASONS.ownLine.en,
		)
		// The client's own busy flag still holds between pushes.
		assert.equal(
			paletteRowState(listed(true), { generating: true, newest }).reason,
			CORE_VERB_REASONS.generating.en,
		)
	})
})

describe('the highlight', () => {
	it('steps and wraps, and starts at either end', () => {
		assert.equal(stepHighlight(-1, 3, 1), 0)
		assert.equal(stepHighlight(-1, 3, -1), 2)
		assert.equal(stepHighlight(2, 3, 1), 0)
		assert.equal(stepHighlight(0, 3, -1), 2)
		assert.equal(stepHighlight(0, 0, 1), -1)
	})
})

/**
 * Slash arguments (lair pass S2; owner ruling 4, 2026-09-28): `/<slash
 * name>`, whitespace, then the rest — the **slash argument**, trimmed, its
 * inner new lines kept. Only an action that collects text takes one.
 */
describe('slash arguments', () => {
	const NUDGE = action({
		key: 'nudge',
		specSlug: 'core:spec/lair-nudge',
		name: 'Nudge',
		slash: 'nudge',
		collects: { text: { need: 'required', label: 'Direction the party should feel' } },
	})
	const ROOM = action({
		key: 'answer-door',
		specSlug: 'core:spec/lair-knock',
		name: 'Answer the door',
		slash: 'room',
		collects: { text: { need: 'optional', label: 'Describe the room' } },
	})
	const WHISPER = action({
		key: 'whisper',
		specSlug: 'core:spec/lair-whisper',
		name: 'Whisper',
		slash: 'whisper',
		collects: {
			text: { need: 'required', label: 'What do you whisper?' },
			recipients: { label: 'Who hears it', min: 1 },
		},
	})
	const NARRATOR = action({ key: 'narrate', specSlug: 'core:spec/narrate', name: 'Narrate', slash: 'narrator' })
	const ALL = [...ACTIONS, NUDGE, ROOM, WHISPER, NARRATOR]

	it('parses a name and its argument', () => {
		assert.deepEqual(parseSlashCommand('/nudge the ceiling drips'), {
			name: 'nudge',
			argument: 'the ceiling drips',
		})
	})

	it('parses a bare name as no argument, trailing whitespace included', () => {
		assert.deepEqual(parseSlashCommand('/nudge'), { name: 'nudge', argument: null })
		assert.deepEqual(parseSlashCommand('/nudge   '), { name: 'nudge', argument: null })
		assert.deepEqual(parseSlashCommand('/nudge\n\n'), { name: 'nudge', argument: null })
	})

	it('keeps quotes as text: an argument is the rest, verbatim, never shell-quoted', () => {
		assert.deepEqual(parseSlashCommand('/nudge "the ceiling drips"'), {
			name: 'nudge',
			argument: '"the ceiling drips"',
		})
		assert.deepEqual(parseSlashCommand(`/nudge 'hold' she says`), {
			name: 'nudge',
			argument: `'hold' she says`,
		})
	})

	it('trims the argument and keeps its inner whitespace and new lines', () => {
		assert.equal(parseSlashCommand('/nudge   go   north  ')?.argument, 'go   north')
		assert.equal(parseSlashCommand('/nudge\tgo')?.argument, 'go')
		assert.equal(parseSlashCommand('/nudge\nfirst line\n\nsecond\n')?.argument, 'first line\n\nsecond')
	})

	it('is no command unless the draft starts with a slash and a name', () => {
		assert.equal(parseSlashCommand(''), null)
		assert.equal(parseSlashCommand('/'), null)
		assert.equal(parseSlashCommand('/ go north'), null)
		assert.equal(parseSlashCommand('  /nudge go'), null)
		assert.equal(parseSlashCommand('hello /nudge go'), null)
	})

	it('names the action a whole name and argument press, case-insensitively', () => {
		assert.equal(exactSlashCommand(ALL, '/nudge go north')?.action.key, 'nudge')
		assert.equal(exactSlashCommand(ALL, '/NUDGE go north')?.argument, 'go north')
		assert.equal(exactSlashCommand(ALL, '/room')?.argument, null)
		assert.equal(exactSlashCommand(ALL, '/nud go north'), undefined)
		assert.equal(exactSlashCommand(ALL, 'go north'), undefined)
	})

	it("hints the argument from the action's text label: <required>, [<optional>], none", () => {
		assert.equal(slashArgumentHint(NUDGE), '<direction the party should feel>')
		assert.equal(slashArgumentHint(WHISPER), '<what do you whisper>')
		assert.equal(slashArgumentHint(ROOM), '[<describe the room>]')
		assert.equal(slashArgumentHint(NARRATOR), undefined)
	})

	it('refuses an argument to an action that collects no text, by its slash name', () => {
		const advance = ALL.find((a) => a.slash === 'advance')!
		assert.equal(slashArgumentRefusal(advance, 'x'), '/advance takes no text')
		// Narrate takes no text (R8/QA): `/narrator <text>` is refused like any other.
		assert.equal(slashArgumentRefusal(NARRATOR, 'the rain stops'), '/narrator takes no text')
		// A blank argument is no argument.
		assert.equal(slashArgumentRefusal(advance, '  '), null)
		assert.equal(slashArgumentRefusal(advance, null), null)
		assert.equal(slashArgumentRefusal(NUDGE, 'go north'), null)
		assert.equal(slashArgumentRefusal(ROOM, 'a mossy crypt'), null)
		// Whisper takes the text; its recipients are the modal's (prefilled).
		assert.equal(slashArgumentRefusal(WHISPER, 'hold'), null)
	})
})
