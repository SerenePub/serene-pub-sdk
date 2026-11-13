/**
 * 🚧 **One clock owner per core genre** (lane `sense-clk2`, owner rulings
 * 2026-11-11: "In core genres we should have one default owner that moves the
 * clock"): under every core preset of Story, the Lair and the Dungeon Crawler,
 * the registrations that move the story clock with nobody pressing anything —
 * on by default, not an action, not on a rest — are exactly one, and what
 * reads the round worth (`core:query/round-worth@1`) is the owner it is
 * supposed to be. The Lair's owner is the round tick too (owner 2026-11-11, lane
 * `sense-st2b`).
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
	effectiveRegistrations,
	genreDefaultsOf,
	presetChangesOf,
	type EffectiveRegistration,
	type GenreDecl,
	type PresetDecl,
} from '@serene-pub/sdk'
import {
	CORE_SPECS,
	coreGenres,
	corePresets,
	ROUND_WORTH_FIELD,
	ROUND_WORTH_KEY,
} from '@serene-pub/core-catalog'

const ADVANCE = 'core:outlet/advance-story-clock'
const WORTH = 'core:query/round-worth'
const REST = 'core:event/rest-taken@1'
/** A session's creation sets the clock's starting hour once (the Dungeon Crawler's 08:00); it moves nothing round by round. */
const CREATED = 'core:event/session-created@1'

const docs = new Map(CORE_SPECS.map((s) => [s.slug, s.build() as any]))
const doc = (id: string) => docs.get(id)!
const holds = (id: string, definition: string) =>
	doc(id).nodes.some((n: any) => String(n.definitionId).startsWith(definition))

const effective = (p: PresetDecl): EffectiveRegistration[] => {
	const g = (coreGenres() as readonly GenreDecl[]).find((x) => x.id === p.genre)!
	const defaults = genreDefaultsOf(g)!.registrations
	return effectiveRegistrations(defaults, presetChangesOf(p, defaults))
}

/** The routine's `time` duty, as its author default has it (on when nothing says otherwise). */
const timeDutyOn = (id: string) => {
	const row = doc(id).presets?.[0]?.values?.find(
		(v: any) => v.nodeKey === 'duties' && v.slot === 'params',
	)
	return row?.value?.time !== false
}

/** The pipelines that move the clock with nobody pressing anything, on by default. */
const clockMovers = (p: PresetDecl): string[] =>
	effective(p)
		.filter((r) => {
			if (r.trigger.family === 'action') return false
			if (
				r.trigger.family === 'routine' &&
				(r.trigger.cadence as any)?.options?.event === REST
			)
				return false
			if (r.trigger.family === 'event' && r.trigger.event === CREATED) return false
			if (r.mode === 'off') return false
			if (!holds(r.pipeline, ADVANCE)) return false
			if (r.trigger.family === 'routine' && holds(r.pipeline, 'core:task/reckoning-duties'))
				return timeDutyOn(r.pipeline)
			return true
		})
		.map((r) => r.pipeline)
		.sort()

describe('one default owner moves the clock in each core genre (sense-clk2)', () => {
	test('Story: the round tick, under every preset', () => {
		const presets = corePresets().filter((p) => p.genre === 'core:genre/story')
		assert.ok(presets.length > 0)
		for (const p of presets) assert.deepEqual(clockMovers(p), ['core:spec/round-tick'], p.slug)
	})

	test('the Lair: the round tick, under every preset (owner 2026-11-11, sense-st2b)', () => {
		const presets = corePresets().filter((p) => p.genre === 'core:genre/lair')
		assert.deepEqual(
			presets.map((p) => p.slug).sort(),
			['lair-rules', 'lair-rules-and-dice', 'lair-words-only'],
		)
		for (const p of presets) assert.deepEqual(clockMovers(p), ['core:spec/round-tick'], p.slug)
	})

	test("the Lair's keeper ships Move the clock off and has no round-worth move", () => {
		assert.equal(timeDutyOn('core:spec/lair-keeper'), false)
		assert.ok(!holds('core:spec/lair-keeper', WORTH))
	})

	test("the Dungeon Crawler: its reply's own move, nothing else", () => {
		assert.deepEqual(
			clockMovers(corePresets().find((p) => p.slug === 'dungeon-crawler-default')!),
			['core:spec/dungeon-crawler-respond'],
		)
	})

	test("Story's reply no longer ticks, and Story's reckoning ships Move the clock off", () => {
		assert.ok(!holds('core:spec/story-respond', ADVANCE))
		assert.ok(!doc('core:spec/story-respond').nodes.some((n: any) => n.key === 'tick'))
		assert.ok(
			!doc('core:spec/story-respond').nodes.some((n: any) =>
				String(n.key).startsWith('clock'),
			),
		)
		assert.equal(timeDutyOn('core:spec/story-reckoning'), false)
	})

	test('no reckoning reads the round worth; only the round tick does', () => {
		assert.ok(!holds('core:spec/lair-keeper', WORTH))
		assert.ok(!holds('core:spec/story-reckoning', WORTH))
		assert.ok(holds('core:spec/round-tick', WORTH))
		const tick = doc('core:spec/round-tick')
		const step = tick.nodes.find((n: any) => n.key === 'tick')
		assert.equal(step.definitionId, 'core:task/clock-step')
		const wire = JSON.stringify(step.inputs ?? step.wiring ?? step)
		assert.match(wire, /"node":"worth"/)
		assert.match(wire, /"port":"step"/)
	})

	test('the round tick reads no session settings and names no keeper id', () => {
		assert.ok(!holds('core:spec/round-tick', 'core:query/session-settings'))
		assert.ok(!JSON.stringify(doc('core:spec/round-tick')).includes('lair-keeper'))
		assert.ok(!JSON.stringify(doc('core:spec/round-tick')).includes('routineModes'))
	})

	test('the round worth field: an integer, 0 to 1440, 5 by default', () => {
		assert.equal(ROUND_WORTH_KEY, 'roundWorth')
		assert.equal(ROUND_WORTH_FIELD.type, 'integer')
		assert.equal((ROUND_WORTH_FIELD as any).min, 0)
		assert.equal((ROUND_WORTH_FIELD as any).default, 5)
	})
})
