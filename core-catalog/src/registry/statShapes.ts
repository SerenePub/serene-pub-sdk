/**
 * Core's catalogue of stat shapes — the four a stat is most often (owner,
 * 2026-09-26): a **number** (drawn as a bar when bounded), a **choice**, a
 * **list** and a **story time**.
 *
 * Seeded so stats stay predictable: a genre, a plugin or a person authoring
 * a slot names one of these rather than inventing a field, and every widget
 * that draws a stat knows all four. A slot may still write a `FieldDecl` of
 * its own (`shape: { type: 'integer', min: 0 }`) — the catalogue is the
 * common case, not a fence. Declared through the SDK's public door
 * (`defineStatShape`, R26), exactly as a plugin's would be.
 *
 * What a shape bounds is only the floor: a slot's `config` (and every layer
 * under it — a card, a lorebook, a session) deviates from it. So the shapes
 * here say what KIND of value, and nothing about its range or its options.
 *
 * ⚠ **Inventory is not here, and not a feature.** An inventory is a slot
 * shaped as a `list`, addressed by slug (`inventory`) by whatever genre
 * pipeline manages it (ruled 2026-09-25).
 */
import { defineStatShape } from '@serene-pub/sdk'

/**
 * A number, whole unless a slot says otherwise. With a floor and a ceiling in
 * force it is drawn as a bar; with either missing it is a number, because a
 * half-full bar over half a range invents the half.
 * @experimental
 */
export const numberStatShape = defineStatShape('core:stat-shape/number@1', {
	label: { en: 'Number' },
	description: { en: 'A whole number. With a floor and a ceiling it is drawn as a bar.' },
	field: { type: 'integer' },
})

/**
 * One of a closed set — a mood, the weather, whether the case is open. The
 * options are the slot's (`config.of`): a choice with none is refused where
 * it is declared.
 * @experimental
 */
export const choiceStatShape = defineStatShape('core:stat-shape/choice@1', {
	label: { en: 'Choice' },
	description: { en: 'One of a closed set of options, picked from a menu.' },
	field: { type: 'enum' },
})

/**
 * An ordered list of text or lore references — an inventory, the companions
 * travelling along, the clues found. Items are added, removed and reordered;
 * a lore reference names an entry (`{ entryId }`) and reads as its title.
 * @experimental
 */
export const listStatShape = defineStatShape('core:stat-shape/list@1', {
	label: { en: 'List' },
	description: { en: 'An ordered list of things, each a line of text or a lore entry.' },
	field: { type: 'list', item: { type: 'string' } },
})

/**
 * A position on the story calendar — a date, optionally with a time of day
 * (`412-03-05 22:30`), shown through the calendar (`formatStoryTime`). A
 * clock is this shape: the time a scene has reached.
 * @experimental
 */
export const storyTimeStatShape = defineStatShape('core:stat-shape/story-time@1', {
	label: { en: 'Story time' },
	description: { en: 'A date on the story calendar, optionally with a time of day.' },
	field: { type: 'string', format: 'story-time' },
})

/** The catalogue, in the order a picker offers it. @experimental */
export const CORE_STAT_SHAPES = [numberStatShape, choiceStatShape, listStatShape, storyTimeStatShape] as const
