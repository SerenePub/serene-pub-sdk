/**
 * 🚧 The Lair's **summarize-scene** (live scenes §13): the one core genre
 * whose summary reads an aside channel. The Sanctum is the Dungeon Master and
 * the Castellan talking outside the story — context for what the Dungeon
 * Master meant, never something that happened in the dungeon — so its rows
 * ride the transcript as asides, and the Lair's transcript template says so.
 */

import { summarizeScene } from '../../shared/summarize/summarizeScene.js'
import {
	GENRE_SUMMARIZE_SCENE_VERSION,
	LAIR_SUMMARIZE_SCENE_SPEC_ID,
} from '../../shared/summarize/sceneIds.js'
import { lairGenre, SANCTUM_CHANNEL } from '../../registry/genres.js'


/**
 * 🚧 The Lair's transcript template: the Default's shape, with a preamble
 * that names the Sanctum and an aside line that marks it. The preamble heads
 * every batch, so each draft is told what a Sanctum line is. A story line's
 * files follow its text, named, as in the Default.
 * @experimental
 */
export const LAIR_TRANSCRIPT_TEMPLATE = [
	'{{#*inline "preamble"}}',
	'{{#if scene.name}}Scene: {{{scene.name}}}{{#if scene.place}}, in {{{scene.place}}}{{/if}}{{#if scene.date}} ({{{scene.date}}}){{/if}}\n{{/if}}',
	'{{#if cast.length}}The party: {{#each cast}}{{{name}}}{{#unless @last}}, {{/unless}}{{/each}}\n{{/if}}',
	'Lines marked [Sanctum] are the Dungeon Master and the Castellan talking in the Sanctum, outside the story. The party never hear them and nothing in them happened in the dungeon: read them only to understand what the Dungeon Master meant.',
	'{{/inline}}',
	'{{#*inline "line"}}{{{name}}}: {{{text}}}{{{attachments}}}{{/inline}}',
	'{{#*inline "aside"}}[Sanctum] {{{name}}}: {{{text}}}{{{attachments}}}{{/inline}}',
].join('\n')

/**
 * 🚧 The Lair's own **boundary trigger** (★9, live scenes §15 G1): a new
 * scene where the party reach a new floor — the world's `floor`, which the
 * Castellan's keeper keeps, changed on `main`. A dungeon's floors are its
 * chapters, and nothing core watches knows that: the room the party stand
 * in is already the genre's **place** (`shape.scenes.place`, so *the place
 * changed* covers walking from room to room), and a Castellan line on
 * `main` is either a narration the master pressed for or a knock at an
 * unbuilt room — the turn's own rhythm, not a scene's.
 * @experimental
 */
export const LAIR_NEW_FLOOR_TRIGGER = {
	key: 'newFloor',
	label: { en: 'the party reached a new floor' },
	when: { channel: 'main', stateKey: 'floor' },
} as const

/** @experimental */
export const lairSummarizeSceneSpec = () =>
	summarizeScene(LAIR_SUMMARIZE_SCENE_SPEC_ID, {
		version: GENRE_SUMMARIZE_SCENE_VERSION,
		genre: lairGenre,
		channels: { story: 'main', asides: [SANCTUM_CHANNEL] },
		transcript: LAIR_TRANSCRIPT_TEMPLATE,
		boundaries: [LAIR_NEW_FLOOR_TRIGGER],
	})
