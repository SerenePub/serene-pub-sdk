/**
 * 🚧 The roll form and the dice block (Lair rewrite D3, 2026-10-21).
 *
 * A `roll` block is a **form**: a check put to the person who decides it
 * (the Lair's game master), offering the check, the ruleset's difficulty
 * bands and _No check_, answered through the existing form door — ids,
 * heads, staleness, the effects line and the answer pipeline all treat it as
 * they treat a `form`. A `dice` block is a result, never a question.
 * Difficulty bands are the ruleset's (`RulesetProps.difficultyBands`), Vis
 * Itineris declares six, and a block reads them through `rollBlockBands`.
 *
 * Dungeon Crawler declares no dice-result block of its own (its table's line
 * is text on the table channel), so `dice` is declared once, here.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
	assignBlockHead,
	assignBlockIds,
	checkMessageBlocks,
	defaultDifficultyBand,
	formAnswerSchema,
	formBlocksOf,
	formFireOf,
	isFormStale,
	jsonSchemaOf,
	MESSAGE_BLOCK_KINDS,
	rollBlockBands,
	rulesetFindings,
	stampBlockActions,
	undeclaredBlockFunctions,
	validateAgainst,
	worldBlockFunctions,
	type DiceBlock,
	type MessageBlock,
	type OutcomeBlock,
	type RollBlock,
} from '@serene-pub/sdk'
import * as cat from '../core-catalog/src/index.js'

const bands = rollBlockBands(cat.visItinerisRuleset)

const roll = (over: Partial<RollBlock> = {}): RollBlock => ({
	kind: 'roll',
	fn: 'roll',
	addressee: 'owner',
	question: 'Varek tries to pick the lock. Roll for it?',
	stat: 'skill.thievery',
	stats: [
		{ key: 'skill.thievery', label: 'Thievery' },
		{ key: 'dex', label: 'Dexterity' },
	],
	bands,
	band: 'hard',
	by: 'character:12',
	...over,
})

const dice = (over: Partial<DiceBlock> = {}): DiceBlock => ({
	kind: 'dice',
	stat: 'Thievery',
	rolled: 17,
	faces: [14],
	against: 20,
	outcome: 'Failure',
	five: 'fail',
	explain: 'd20 14 + dex 3 = 17 vs 20',
	by: 'character:12',
	...over,
})

const paths = (blocks: unknown) => checkMessageBlocks(blocks).map((f) => f.path)

describe('the difficulty bands are the ruleset’s', () => {
	test('Vis Itineris offers six, Medium the default an automatic roll uses', () => {
		assert.deepEqual(
			bands.map((b) => [b.id, b.label, b.target]),
			[
				['very-easy', 'Very easy', 5],
				['easy', 'Easy', 10],
				['medium', 'Medium', 15],
				['hard', 'Hard', 20],
				['very-hard', 'Very hard', 25],
				['nearly-impossible', 'Nearly impossible', 30],
			],
		)
		assert.equal(defaultDifficultyBand(cat.visItinerisRuleset)?.id, 'medium')
		assert.deepEqual(rollBlockBands(cat.freeformRuleset), [], 'a ruleset without dice offers none')
		assert.equal(defaultDifficultyBand(cat.freeformRuleset), undefined)
	})

	test('a band that cannot mean what it says is a finding', () => {
		// ⏳ The shape before check methods (M3, 2026-10-22: Vis Itineris holds its
		// bands on its `die` method now): `conventions.dice` and top-level bands.
		// Its conventions part: Vis Itineris is registered in the sections since 2026-10-23.
		const declared = { name: cat.visItinerisRuleset.name, conventions: cat.VIS_ITINERIS_CONVENTIONS }
		const { methods: _m, defaultMethod: _dm, ...base } = declared.conventions
		const vi = { ...declared, conventions: { ...base, dice: { sides: 20 } }, difficultyBands: cat.VIS_ITINERIS_DIFFICULTY_BANDS }
		const reasons = (difficultyBands: unknown, conventions: unknown = vi.conventions) =>
			rulesetFindings('test.l1:ruleset/bands@1', { ...vi, conventions, difficultyBands } as any)
				.map((f) => /^\[([a-z-]+)\]/.exec(f)?.[1])
				.filter((r) => r && /difficult/.test(r))
		assert.deepEqual(reasons(vi.difficultyBands), [])
		assert.deepEqual(reasons([]), ['bad-difficulty'])
		assert.deepEqual(reasons([{ id: 'a', label: { en: 'A' }, target: 5 }]), ['difficulty-default'])
		assert.deepEqual(
			reasons([
				{ id: 'a', label: { en: 'A' }, target: 5, default: true },
				{ id: 'a', label: { en: 'B' }, target: 7.5, default: true },
			]),
			['duplicate-difficulty', 'bad-difficulty', 'difficulty-default'],
		)
		assert.deepEqual(reasons(vi.difficultyBands, base), ['difficulty-without-dice'])
		// 🚧 Beside check methods, top-level bands are refused: a method holds its own.
		assert.deepEqual(reasons(vi.difficultyBands, declared.conventions), ['difficulty-beside-methods'])
	})
})

describe('the blocks validate', () => {
	test('a realistic roll and its dice are clean; the kinds are listed', () => {
		assert.deepEqual(checkMessageBlocks([roll(), dice()]), [])
		assert.deepEqual(checkMessageBlocks([{ kind: 'dice', stat: 'Luck', rolled: 4, outcome: 'Partial' }]), [])
		assert.ok(MESSAGE_BLOCK_KINDS.includes('roll') && MESSAGE_BLOCK_KINDS.includes('dice'))
		assert.match(checkMessageBlocks([{ kind: 'dragon' }])[0]!.fix, /roll, dice, group/)
	})

	test('a roll offers bands, proposes what it offers, and is put as a question', () => {
		assert.deepEqual(paths([roll({ bands: [] })]), ['blocks[0].bands'])
		assert.deepEqual(paths([roll({ band: 'legendary' })]), ['blocks[0].band'])
		assert.deepEqual(paths([roll({ stat: 'wis' })]), ['blocks[0].stat'])
		assert.deepEqual(paths([roll({ bands: [...bands, bands[0]!] })]), ['blocks[0].bands[6].id'])
		assert.deepEqual(paths([roll({ bands: [{ id: 'x', label: 'X', target: 1.5 }], band: 'x' })]), ['blocks[0].bands[0].target'])
		assert.deepEqual(paths([roll({ question: undefined })]), ['blocks[0].question'])
		assert.deepEqual(paths([roll({ by: 'nobody' as any })]), ['blocks[0].by'])
		assert.deepEqual(paths([{ ...roll(), fn: undefined }]), ['blocks[0].fn'])
		assert.deepEqual(paths([roll({ stats: undefined, stat: 'dex' })]), [], 'one check needs no list')
	})

	test('a dice block is a result: a total, words for the outcome, the five-band tone', () => {
		assert.deepEqual(paths([dice({ rolled: Number.NaN })]), ['blocks[0].rolled'])
		assert.deepEqual(paths([dice({ outcome: undefined as any })]), ['blocks[0].outcome'])
		assert.deepEqual(paths([dice({ faces: [1.5] })]), ['blocks[0].faces'])
		assert.deepEqual(paths([dice({ five: 'great' as any })]), ['blocks[0].five'])
		assert.deepEqual(paths([dice({ against: 'hard' as any })]), ['blocks[0].against'])
		assert.deepEqual(paths([{ kind: 'group', blocks: [dice({ by: 'x' as any })] }]), ['blocks[0].blocks[0].by'])
	})
})

describe('a roll is a form', () => {
	const spec = {
		id: 'core:spec/lair-test',
		contributes: {
			actions: [
				{ key: 'roll', genre: 'core:genre/lair', venue: { kind: 'form' }, label: { en: 'Roll' }, description: { en: 'Roll a check.' } },
			],
		},
	}

	test('the form door sees it: ids, heads, the action stamp, the declared function', () => {
		const tree: MessageBlock[] = [{ kind: 'md', text: 'The lock is old.' }, { kind: 'group', blocks: [roll()] }]
		assert.equal(formBlocksOf(tree).length, 1)
		const stamped = assignBlockHead(assignBlockIds(stampBlockActions(tree, spec), () => 'b1'), 7)
		const [form] = formBlocksOf(stamped) as RollBlock[]
		assert.deepEqual([form!.id, form!.head, form!.action], ['b1', 7, 'core:spec/lair-test#roll'])
		assert.equal(isFormStale(form!, 8), true)
		assert.deepEqual(undeclaredBlockFunctions(tree, spec), [])
		assert.deepEqual(undeclaredBlockFunctions([roll({ fn: 'other' })], spec), ['other'])
		assert.deepEqual(checkMessageBlocks(stamped), [])
	})

	test('the effects line holds: a world roll only to the owner', () => {
		const world = { ...spec, contributes: { actions: [{ ...spec.contributes.actions[0], venue: { kind: 'composer' }, effects: 'world' }] } }
		assert.deepEqual(worldBlockFunctions([roll()], world), [])
		assert.deepEqual(worldBlockFunctions([roll({ addressee: 'character:3' })], world), ['roll'])
	})

	test('its answer schema is strict, and the press carries the band’s target', () => {
		const block = roll()
		const schema = formAnswerSchema(block)
		assert.deepEqual(schema, jsonSchemaOf(block))
		assert.deepEqual(schema.required, ['check', 'stat', 'band'])
		assert.deepEqual((schema.properties as any).stat.enum, ['skill.thievery', 'dex'])
		assert.deepEqual((schema.properties as any).band.enum, bands.map((b) => b.id))
		assert.deepEqual(formFireOf(block, { check: true, stat: 'dex', band: 'medium' }), {
			fn: 'roll',
			action: undefined,
			payload: { check: true, stat: 'dex', band: 'medium', target: 15 },
			label: 'Dexterity — Medium',
		})
	})

	test('No check fires without a target, and may leave the rest to the proposal', () => {
		assert.deepEqual(formFireOf(roll(), { check: false })?.payload, { check: false, stat: 'skill.thievery', band: 'hard' })
		assert.equal(formFireOf(roll(), { check: false })?.label, 'No check')
	})

	test('an answer the block did not offer fires nothing, and says why', () => {
		assert.equal(formFireOf(roll(), { check: true, stat: 'wis', band: 'hard' }), null)
		assert.equal(formFireOf(roll(), { check: true, stat: 'dex', band: 'legendary' }), null)
		assert.equal(formFireOf(roll(), { check: 'yes', stat: 'dex', band: 'hard' }), null)
		assert.deepEqual(validateAgainst(roll(), { check: true, stat: 'dex', band: 'hard' }), [])
		assert.match(validateAgainst(roll(), { check: true, stat: 'wis', band: 'hard' })[0]!.message, /no check and band/)
	})
})

// ── 🚧 The outcome block and method bands (PLAN-rulesets-authoring D1, 2026-10-22) ──

describe('🚧 the dice block evolves in place into the outcome block', () => {
	const outcome = (over: Partial<OutcomeBlock> = {}): OutcomeBlock => ({ kind: 'dice', stat: 'Nerve', outcome: 'It works, at a cost', five: 'partial', ...over })
	test('the stored kind stays dice: every written block still validates, and DiceBlock is OutcomeBlock', () => {
		const old: DiceBlock = dice()
		const same: OutcomeBlock = old
		assert.deepEqual(checkMessageBlocks([same]), [])
		assert.ok(!(MESSAGE_BLOCK_KINDS as readonly string[]).includes('outcome'), 'no new stored kind')
	})
	test('each method shows its own: a pool, the cards, a comparison; none comes to no number', () => {
		assert.deepEqual(
			checkMessageBlocks([
				outcome({ method: 'dice-pool', rolled: 2, faces: [6, 5, 2, 1], pool: { size: 4, successes: 2, successOn: 5 } }),
				outcome({ method: 'card-draw', rolled: 14, against: 12, cards: [{ label: 'Queen of cups', rank: 12 }] }),
				outcome({ method: 'compare', rolled: 4, against: 3, compare: { versus: "Mara's Will" } }),
				outcome({ method: 'bid', rolled: 2, against: 2, explain: 'Spent 2 nerve' }),
				outcome({ method: 'none' }),
				outcome({ method: 'acme:tarot', rolled: 3 }),
			]),
			[],
		)
	})
	test('what each method shows must mean what it says', () => {
		assert.deepEqual(paths([outcome({ method: 'die-target' })]), ['blocks[0].rolled'], 'a die comes to a number')
		assert.deepEqual(paths([outcome()]), ['blocks[0].rolled'], 'no method is a die')
		assert.deepEqual(paths([outcome({ method: 'Dice Pool' as never, rolled: 1 })]), ['blocks[0].method'])
		assert.deepEqual(paths([outcome({ method: 'dice-pool', rolled: 1, pool: { size: 2.5, successes: 1 } })]), ['blocks[0].pool'])
		assert.deepEqual(paths([outcome({ method: 'card-draw', rolled: 1, cards: [] })]), ['blocks[0].cards'])
		assert.deepEqual(paths([outcome({ method: 'card-draw', rolled: 1, cards: [{ label: 'Ace', rank: 1.5 }] })]), ['blocks[0].cards[0].rank'])
		assert.deepEqual(paths([outcome({ method: 'compare', rolled: 1, compare: { versus: '' } })]), ['blocks[0].compare'])
	})
})

describe('🚧 a roll offers the bands of the method a check is made against', () => {
	const props = (methods: Record<string, unknown>, defaultMethod?: string) =>
		({ conventions: { methods, ...(defaultMethod ? { defaultMethod } : {}), time: { unit: 'scene' } } }) as any
	const easy = [
		{ id: 'easy', label: { en: 'Easy' }, target: 3, default: true as const },
		{ id: 'hard', label: { en: 'Hard' }, target: 6 },
	]
	test('the default method’s, a named method’s, or the first method that holds any', () => {
		const rs = props({ judged: { kind: 'none' }, contest: { kind: 'compare', bands: easy } }, 'judged')
		assert.deepEqual(rollBlockBands(rs).map((b) => [b.id, b.label, b.target]), [['easy', 'Easy', 3], ['hard', 'Hard', 6]])
		assert.deepEqual(rollBlockBands(rs, 'en', 'judged'), [])
		assert.equal(defaultDifficultyBand(rs)?.id, 'easy')
		assert.equal(defaultDifficultyBand(rs, 'judged'), undefined)
		assert.deepEqual(rollBlockBands(props({ risk: { kind: 'bid', resource: 'nerve', costs: [] } })), [], 'no method holds any')
	})
	test('⏳ the top-level bands are the die method’s: a copy of Vis Itineris made before check methods offers the same six', () => {
		const vi = cat.visItinerisRuleset
		// From its conventions part: it is registered in the sections since 2026-10-23.
		const { methods: _m, defaultMethod: _dm, ...base } = cat.VIS_ITINERIS_CONVENTIONS
		const legacy = { id: vi.id, name: vi.name, conventions: { ...base, dice: { sides: 20 } }, difficultyBands: cat.VIS_ITINERIS_DIFFICULTY_BANDS }
		assert.deepEqual(rollBlockBands(legacy as any), rollBlockBands(vi))
		assert.deepEqual(rollBlockBands(legacy as any, 'en', 'die'), rollBlockBands(vi, 'en', 'die'))
		assert.equal(rollBlockBands(vi, 'en', 'die').length, 6)
		const { difficultyBands: _b, ...noBands } = legacy
		assert.deepEqual(rollBlockBands(noBands as any), [], 'without them, nothing to offer')
	})
})
