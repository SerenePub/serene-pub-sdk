/**
 * 🚧 The shared genre fields for **sheet latitude**, item moves and Honour mode's new key
 * (owner rulings 2026-11-05, plan §25 ★1, ★6, ★7), and the two rulesets' marks.
 *
 * Why: core reads these keys the way it reads `autoAdvance`; a genre opts in by declaring the
 * field. This pins each field's words (what a person reads), that its members are derived from
 * the SDK's levels in order, that none is undescribed (P5), that the old `HONOR_MODE_FIELD` is
 * still exported and declared by no genre, the genres' declarations (lane `ed`, 2026-11-05: Story
 * and the Lair pin the session owner's `all-any`; the Dungeon Crawler exposes players' `no-edits`
 * and `own-items` and Keep every turn, and pins the owner's `as-ruled`), and that Vis Itineris and Wherewithal mark their attributes `changedBy: ['rules']`
 * as the owner ruled (Mood free).
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
	ITEM_MOVE_LATITUDES,
	SHEET_LATITUDES,
	rulesetSections,
	undescribedSettingParts,
	type FieldDecl,
	type RulesetProps,
} from '@serene-pub/sdk'
import * as cat from '../core-catalog/src/index.js'
import { VIS_ITINERIS_RULESET } from '../core-catalog/src/rulesets/vis-itineris/ruleset.js'
import { WHEREWITHAL_RULESET } from '../core-catalog/src/rulesets/wherewithal/ruleset.js'

const SHEET_LABELS = [
	'As the rules say',
	'No editing by hand',
	'Everything on their own characters',
	"Everything on anyone's",
]
const MOVE_LABELS = ['Follow sheet editing', 'No moving by hand', 'Their own items', "Anyone's"]

const LEVELLED = [
	{
		key: 'ownerSheetLatitude',
		field: cat.OWNER_SHEET_LATITUDE_FIELD,
		label: 'Session owner edits sheets',
		def: 'as-ruled',
		levels: SHEET_LATITUDES,
		labels: SHEET_LABELS,
		description:
			'How much the session owner may change by hand on the sheets. The world, the places and the people nobody plays count as theirs.',
	},
	{
		key: 'playerSheetLatitude',
		field: cat.PLAYER_SHEET_LATITUDE_FIELD,
		label: 'Players edit sheets',
		def: 'as-ruled',
		levels: SHEET_LATITUDES,
		labels: SHEET_LABELS,
		description:
			'How much players may change by hand on the sheets. Their own are the characters they play; watchers never change them.',
	},
	{
		key: 'ownerItemMoves',
		field: cat.OWNER_ITEM_MOVES_FIELD,
		label: 'Session owner moves items',
		def: 'follow-sheet',
		levels: ITEM_MOVE_LATITUDES,
		labels: MOVE_LABELS,
		description:
			'Whether the session owner gives, drops and picks up items by hand, and whose.',
	},
	{
		key: 'playerItemMoves',
		field: cat.PLAYER_ITEM_MOVES_FIELD,
		label: 'Players move items',
		def: 'follow-sheet',
		levels: ITEM_MOVE_LATITUDES,
		labels: MOVE_LABELS,
		description:
			'Whether players give, drop and pick up items by hand, and whose, so a table can let them hand items over while their sheets stay locked.',
	},
]

const GENRES = [
	cat.storyGenre,
	cat.chatGenre,
	cat.guideGenre,
	cat.lairGenre,
	cat.dungeonCrawlerGenre,
]
const NEW_KEYS = [...LEVELLED.map((l) => l.key), 'keepEveryTurn']

describe('the sheet-latitude and item-move fields', () => {
	for (const { key, field, label, def, levels, labels, description } of LEVELLED) {
		test(`${key}: declared in the owner's words, members derived from the levels`, () => {
			assert.equal(field.type, 'enum')
			assert.deepEqual(field.label, { en: label })
			assert.equal(field.group, 'Players')
			assert.equal(field.reach, 'owner')
			assert.equal(field.default, def)
			assert.deepEqual(field.description, { en: description })
			assert.deepEqual(
				field.members!.map((m) => m.key),
				[...levels],
			)
			assert.deepEqual(
				field.members!.map((m) => (m.label as { en: string }).en),
				labels,
			)
			assert.deepEqual(undescribedSettingParts(field), [])
		})
	}
})

describe('Keep every turn (Honour mode, renamed)', () => {
	// Moved 2026-11-05 (owner ruling ★sl-4): the label is "Keep every turn"; "Honour mode" leaves the UI.
	test('keepEveryTurn: a boolean, on by default, labelled Keep every turn', () => {
		const f: FieldDecl = cat.KEEP_EVERY_TURN_FIELD
		assert.equal(f.type, 'boolean')
		assert.equal(f.default, true)
		assert.deepEqual(f.label, { en: 'Keep every turn' })
		assert.equal(f.group, 'Players')
		assert.equal(f.reach, 'owner')
		assert.deepEqual(f.description, {
			en: 'Every turn is kept: nobody deletes the latest turn — retake it instead. Off: the host may delete the latest turn where deleting is on.',
		})
		assert.deepEqual(undescribedSettingParts(f), [])
	})

	// Moved 2026-11-05 (lane ed): the Dungeon Crawler no longer declares `honorMode`; the field stays exported ⏳ for the app's one-time mapping.
	test('the deprecated honorMode field stays exported, unchanged, and no genre declares it', () => {
		assert.equal(cat.HONOR_MODE_FIELD.type, 'boolean')
		assert.deepEqual(cat.HONOR_MODE_FIELD.label, { en: 'Honour mode' })
		assert.equal(cat.HONOR_MODE_FIELD.default, false)
		for (const g of GENRES) assert.equal('honorMode' in ((g as any).shape?.fields ?? {}), false, g.id)
	})
})

/** What each genre declares (`shape.fields`) and pins (`settings`) of the new keys. */
const fieldsOf = (g: unknown): Record<string, FieldDecl> => (g as any).shape?.fields ?? {}
const pinsOf = (g: unknown): Record<string, unknown> => (g as any).settings ?? {}

describe('the genres switched over (lane ed, 2026-11-05)', () => {
	test('Story and the Lair pin the session owner at all-any, and declare no new field', () => {
		for (const g of [cat.storyGenre, cat.lairGenre]) {
			assert.equal(pinsOf(g).ownerSheetLatitude, 'all-any', g.id)
			for (const k of NEW_KEYS) assert.equal(k in fieldsOf(g), false, `${g.id} fields.${k}`)
		}
	})

	test('the Dungeon Crawler: players no-edits and own-items (exposed), Keep every turn on, the owner pinned all-any (★ed-2, 2026-11-05)', () => {
		const g = cat.dungeonCrawlerGenre
		const f = fieldsOf(g)
		assert.equal(f.playerSheetLatitude!.default, 'no-edits')
		assert.deepEqual(f.playerSheetLatitude!.members, cat.PLAYER_SHEET_LATITUDE_FIELD.members)
		assert.equal(f.playerItemMoves!.default, 'own-items')
		assert.equal(f.keepEveryTurn, cat.KEEP_EVERY_TURN_FIELD)
		assert.equal('ownerSheetLatitude' in f, false)
		assert.equal('ownerItemMoves' in f, false)
		assert.equal(pinsOf(g).ownerSheetLatitude, 'all-any')
	})

	test('Chat and Guide say nothing (core defaults)', () => {
		for (const g of [cat.chatGenre, cat.guideGenre]) {
			for (const k of NEW_KEYS) {
				assert.equal(k in fieldsOf(g), false, `${g.id} fields.${k}`)
				assert.equal(k in pinsOf(g), false, `${g.id} settings.${k}`)
			}
		}
	})
})

describe('the rulesets mark who changes their attributes (owner, 2026-11-05)', () => {
	const marks = (decl: RulesetProps, id: string) =>
		Object.fromEntries(
			(rulesetSections({ ...decl, id }).attributes ?? []).map((a) => [a.id, a.changedBy]),
		)

	test('Vis Itineris: every attribute is changed by the rules', () => {
		const m = marks(VIS_ITINERIS_RULESET as RulesetProps, cat.VIS_ITINERIS_RULESET_ID)
		assert.ok(Object.keys(m).length > 3)
		for (const [id, by] of Object.entries(m)) assert.deepEqual(by, ['rules'], id)
	})

	test('Wherewithal: the three pools are changed by the rules, Mood is free', () => {
		const m = marks(WHEREWITHAL_RULESET as RulesetProps, cat.WHEREWITHAL_RULESET_ID)
		assert.deepEqual(Object.keys(m).sort(), [
			'mood',
			'wherewithal-favour',
			'wherewithal-nerve',
			'wherewithal-provisions',
		])
		for (const id of ['wherewithal-nerve', 'wherewithal-favour', 'wherewithal-provisions'])
			assert.deepEqual(m[id], ['rules'], id)
		assert.equal(m.mood, undefined)
	})
})
