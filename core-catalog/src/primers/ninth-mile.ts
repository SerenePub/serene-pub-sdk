/**
 * 🚧 The Ninth Mile's primer — the starter lorebook core ships for Freeform, in
 * our own words: one coaching inn at a crossroads, four pieces of world lore,
 * and one lead that opens the first scene (a storm night). Compendium mode
 * `referenced`: Freeform has no compendium, so nothing is derived. It has no
 * cast on purpose: the innkeeper, Nell Haverly, is offered as a starter
 * character on the home wizard's Pick a character step instead (defined in the
 * app, `src/lib/shared/characters/starterCharacter.ts`), so making a lorebook
 * from this primer never writes a second Nell. `registry/primers.ts` declares it.
 */
import type { PrimerContent, PrimerProps } from '@serene-pub/sdk'

/** @experimental */
export const NINTH_MILE_PRIMER_ID = 'core:primer/ninth-mile@1'

const content: PrimerContent = {
	entries: [
		{
			key: 'the-crossroads',
			type: 'core:entry/world-lore@1',
			title: 'The crossroads',
			content:
				'Three roads meet at the Ninth Mile: the river road down to the market towns, the hill road over the pass, and the old east road through Hollin Wood, which hardly anyone takes now. The milestone by the inn door says nine miles, and nobody alive remembers which town it was counting from.',
			keys: ['crossroads', 'milestone', 'river road', 'hill road'],
			fields: { category: 'region', priority: 3 },
		},
		{
			key: 'old-east-road',
			type: 'core:entry/world-lore@1',
			title: 'The old east road',
			content:
				"The east road runs through Hollin Wood to Callow, a village that emptied a generation ago when its well went bad. Carters swear they have seen lights moving between the trees on wet nights. Nell says it's poachers, and changes the subject.",
			keys: ['east road', 'Hollin Wood', 'Callow'],
			fields: { category: 'legend', priority: 2 },
		},
		{
			key: 'tale-ledger',
			type: 'core:entry/world-lore@1',
			title: 'The tale ledger',
			content:
				'At the Ninth Mile a good story pays for a cup of cider. Nell writes the ones she likes into a fat, ink-stained ledger kept behind the bar, and the regulars argue over which tales deserve a page. Anyone may read it; only Nell writes in it.',
			keys: ['ledger', 'tale ledger', 'cider'],
			fields: { category: 'custom', priority: 2 },
		},
		{
			key: 'the-household',
			type: 'core:entry/world-lore@1',
			title: 'The household',
			content:
				'Nell Haverly keeps the inn. Tobin, the cook, came with the building and says very little; his bread says the rest. Pip, the stable girl, is fourteen, fearless with horses, and means to walk every road from the crossroads before she is grown.',
			keys: ['Nell', 'Tobin', 'Pip', 'household'],
			fields: { category: 'household', priority: 2 },
		},
	],
	places: [
		{
			key: 'ninth-mile',
			title: 'The Ninth Mile',
			content:
				'A coaching inn of grey stone and black timber at the crossroads. A low common room with a long scrubbed table and a hearth wide enough to sit inside; the kitchen behind it; six rooms up a creaking stair; and a stable yard where the coach changes horses. A painted milestone swings on the sign over the door.',
			keys: ['Ninth Mile', 'the inn', 'common room', 'stable yard'],
			fields: { category: 'inn', priority: 3 },
		},
	],
	cast: [],
	relationships: [],
	leads: [
		{
			key: 'storm-night',
			title: 'The night the roads close',
			content:
				'A storm has flooded the ford on the river road and brought a tree down across the hill road, so tonight everyone at the Ninth Mile is staying put. In the common room: a courier who will not let go of her sealed satchel, an old man who keeps asking what day it is, and a stranger who walked in off the east road, soaked to the knee, when that road should not have been passable at all. By morning the roads will open; what happens before then is the story.',
			involves: ['ninth-mile', 'the-crossroads', 'old-east-road'],
		},
	],
}

/** 🚧 @experimental */
export const NINTH_MILE_PRIMER: PrimerProps = Object.freeze({
	ruleset: 'core:ruleset/freeform@1',
	compendiumMode: 'referenced',
	name: { en: 'The Ninth Mile' },
	description: {
		en: 'A coaching inn where three roads meet, on the night a storm closes all three. A small world to start a story in, with no dice and no rules to learn.',
	},
	content: Object.freeze(content),
})
