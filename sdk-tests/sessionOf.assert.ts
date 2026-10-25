/**
 * `sessionOf(genre)` and the condition builders, asserted at COMPILE time
 * (lane 2, A5 — PLAN-layering D6).
 *
 * Checked by `tsc --noEmit` and never run, like `tfTypes.assert.ts`: what A5
 * promises lives in the types — "`s.world.inCombat` exists only if a
 * declaration made it, with its type". Each `@ts-expect-error` FAILS THE BUILD
 * if the error it expects stops happening, so a widening (a stray `any`, a
 * `const` dropped from `defineAttributeSlot` or `genre`) reads here as "unused
 * '@ts-expect-error' directive". The runtime half is `conditions.test.ts`.
 *
 * ⚠ Keep every `@ts-expect-error` case on ONE line.
 */

import {
	and,
	annexField,
	defineAttributeSlot,
	eq,
	genre,
	gt,
	isTrue,
	lte,
	not,
	oneOf,
	or,
	same,
	sessionOf,
	vocabulary,
	type ConditionDecl,
	type ConditionProp,
} from '@serene-pub/sdk'

const weather = defineAttributeSlot('typed:slot/weather@1', {
	type: 'enum',
	descriptor: 'The weather.',
	appliesTo: ['world'],
	config: { of: ['clear', 'rain', 'storm'] },
})
const inCombat = defineAttributeSlot('typed:slot/in-combat@1', {
	type: 'boolean',
	descriptor: 'Whether a fight is on.',
	appliesTo: ['world'],
})
const hp = defineAttributeSlot('typed:slot/hp@1', {
	shape: 'core:stat-shape/number@1',
	descriptor: 'Health.',
	appliesTo: ['cast'],
})
const mood = defineAttributeSlot('typed:slot/mood@1', {
	shape: 'core:stat-shape/choice@1',
	descriptor: 'Mood.',
	appliesTo: ['cast'],
	config: { of: ['calm', 'angry'] },
})
const shields = defineAttributeSlot('typed:slot/shields@1', {
	type: 'integer',
	descriptor: 'Shields.',
	appliesTo: ['cast'],
})

const g = genre('typed:genre/table', {
	name: 'Table',
	family: 'story',
	// 🚧 RF fix 8: a genre brings no slots — the table's words are a vocabulary its rules play.
	shape: {
		fields: {
			tone: { type: 'enum', of: ['grounded', 'grim'] },
			tools: { type: 'boolean' },
			notes: { type: 'text' },
		},
	},
})

const table = vocabulary('typed:vocabulary/table@1', { world: { weather, inCombat }, cast: { hp, mood } })
const scifi = vocabulary('typed:vocabulary/ships@1', { cast: { shields } })
const dice = annexField({ key: 'last-roll', shape: { type: 'integer', min: 1, max: 20 } })

const s = sessionOf(g, { vocabularies: [table, scifi], annex: { 'typed.dice': [dice] } })

// ── What the genre declared is there, typed ─────────────────────────────────

const _a: ConditionDecl = isTrue(s.world.inCombat)
const _b: ConditionDecl = eq(s.world.weather, 'storm')
const _c: ConditionDecl = and(eq(s.world.weather, 'storm'), gt(s.cast.any.hp, 0))
const _d: ConditionDecl = not(isTrue(s.world.inCombat))
const _e: ConditionDecl = oneOf(s.cast.any.mood, ['calm', 'angry'])
const _f: ConditionDecl = or(eq(s.fields.tone, 'grim'), isTrue(s.fields.tools))
const _g: ConditionDecl = lte(s.cast.any.shields, 3)
const _h: ConditionDecl = gt(s.annex['typed.dice'].lastRoll, 10)
const _i: ConditionDecl = and(isTrue(s.generating), eq(s.message.isNewest, true), eq(s.sprites.any.label, 'armoured'))
const _j: ConditionDecl = same(s.cast.any.mood, s.cast.any.mood)
const _k: ConditionProp<'clear' | 'rain' | 'storm', 'enum'> = s.world.weather

// ── A property no declaration made does not exist ───────────────────────────

// @ts-expect-error — the genre declares no `wind` slot
isTrue(s.world.wind)
// @ts-expect-error — `hp` attaches to the cast, not the world
gt(s.world.hp, 0)
// @ts-expect-error — no field `difficulty` on this genre
eq(s.fields.difficulty, 'hard')
// @ts-expect-error — the cast is "some member", read through `any`
gt(s.cast.hp, 0)

// ── A wrong enum member, a wrong type ───────────────────────────────────────

// @ts-expect-error — 'stom' is not one of the weather's choices
eq(s.world.weather, 'stom')
// @ts-expect-error — not one of the mood's choices
oneOf(s.cast.any.mood, ['calm', 'sad'])
// @ts-expect-error — not one of the tone field's choices
eq(s.fields.tone, 'pulpy')
// @ts-expect-error — a number comparison over an enum
gt(s.world.weather, 1)
// @ts-expect-error — a boolean compared to a number
eq(s.world.inCombat, 1)
// @ts-expect-error — a number compared to a string
eq(s.cast.any.hp, 'full')

// ── The ruleset's own vocabulary types the view the same way ────────────────

const viaRuleset = sessionOf(g, { ruleset: scifi })
const _l: ConditionDecl = gt(viaRuleset.cast.any.shields, 0)
// @ts-expect-error — no ruleset or vocabulary passed: `shields` is not this view's
gt(sessionOf(g).cast.any.shields, 0)
// A vocabulary member IS the declaration: typed as it was declared.
const _m: typeof shields = scifi.cast.shields

export type _Used = [typeof _l, typeof _m, typeof _a, typeof _b, typeof _c, typeof _d, typeof _e, typeof _f, typeof _g, typeof _h, typeof _i, typeof _j, typeof _k]
