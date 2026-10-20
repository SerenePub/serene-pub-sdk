/**
 * 🚧 **Reveal the planning notes** (PLAN-dungeon-crawler-2026-10-14, feature
 * 15, D8): the owner asks, and the Planner's secret notes become readable by
 * everyone, for good — a copy of `dungeon-crawler-planning-notes` (the
 * Planner alone) into `dungeon-crawler-planning-notes-revealed` (everyone;
 * the layout's *Planning notes* tab), kept in step by every later rewrite of
 * the notes (the story turn, the Planner's talk, a new goal — AUDIT A24), and one line from the
 * Planner on Story saying so — a side note (`narration`) under the
 * Planner's own name, so it ends no round — and the journal's secret goal
 * line gives way to the real goal. A second press is refused,
 * politely, in the owner's own Planner lane. No model call. A button among
 * the composer's actions (`quick`), the owner's alone (`audience`).
 */

import { compile, slot, spec, sessionEvents } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import { dungeonCrawlerGenre } from '../../registry/genres.js'
import {
	DUNGEON_CRAWLER_ANNEX_KEYS as K,
	DUNGEON_CRAWLER_PLANNER_KEY,
	DUNGEON_CRAWLER_SECRET_GOAL_LINE,
	PARLEY_CHANNEL,
} from './names.js'
import { DATA_TRANSFORM_KIND, DUNGEON_CRAWLER_PREAMBLE, type CoreScriptSeed } from './preamble.js'
import { applyWiring, at, jsonPart, scriptStep, textPart, wiring } from './calls.js'

/** @experimental */
export const DUNGEON_CRAWLER_REVEAL_SPEC_ID = 'core:spec/dungeon-crawler-reveal'
/** @internal */
export const DUNGEON_CRAWLER_REVEAL_VERSION = '1.0.0'

const PLANNER = `envoy:${DUNGEON_CRAWLER_PLANNER_KEY}`

/**
 * 🚧 `core:script/dungeon-crawler-reveal`: judge the press. Handed
 * `{ session }`. Returns `{ lane, refusal, notes, notice, journal }`: the
 * owner's Planner lane, and either the refusal (the notes are already out)
 * or the notes to copy (a stand-in line when the Planner kept none, so a
 * reveal is always visible and never repeats) with the Story's notice — and,
 * when the journal kept the goal secret, the journal with the real goal in
 * its place.
 * @experimental
 */
export const DUNGEON_CRAWLER_REVEAL_SCRIPT: CoreScriptSeed = Object.freeze({
	typeId: DATA_TRANSFORM_KIND,
	seedKey: 'core:script/dungeon-crawler-reveal',
	name: 'Dungeon Crawler: reveal the planning notes',
	// On the genre's one preamble (AUDIT C7).
	source: `${DUNGEON_CRAWLER_PREAMBLE}
var lane = (doc.ownerUserId != null && laneOf(doc, Number(doc.ownerUserId))) || PARLEY;
if (text(core[KEYS.planningNotesRevealed]))
	return {
		lane: lane,
		refusal: "The planning notes are already on the table: everyone can read them in the Planning notes tab. There's nothing more hidden there to reveal.",
		notes: null,
		notice: null,
		journal: null
	};
// The journal's goal stops being a secret with the notes: the real goal
// over the secret line (or the bare word an older session holds).
var journal = own(core[KEYS.journal]);
var world = progressOf(core);
var kept = text(journal.goal);
var outJournal = (kept === "secret" || kept === SECRET_GOAL) && text(world.goal)
	? { goal: text(world.goal), leads: Array.isArray(journal.leads) ? journal.leads : [] }
	: null;
return {
	lane: lane,
	refusal: null,
	journal: outJournal,
	notes: text(core[KEYS.planningNotes]) || "The Planner kept no notes.",
	notice: "I've laid my planning notes on the table: everyone can read them now, in the Planning notes tab."
};
`.trim(),
	varsIn: Object.freeze(['value']),
	varsOut: Object.freeze(['value']),
})

/**
 * **Reveal the planning notes** — the owner's action (composer venue; seen
 * and pressed by the owner alone). `reveal` judges the press; the `route`
 * junction either refuses in the owner's lane, or copies the notes to the
 * revealed key and tells the table on Story.
 * @experimental
 */
export const dungeonCrawlerRevealSpec = () => {
	const w = wiring()
	let graph: any = spec(DUNGEON_CRAWLER_REVEAL_SPEC_ID, {
		version: DUNGEON_CRAWLER_REVEAL_VERSION,
		taxonomy: { role: 'action' },
		contributes: {
			actions: [
				{
					key: 'reveal',
					venue: { kind: 'composer' },
					/** A button in the composer's actions, as Rest is — not only a slash name. */
					quick: true,
					audience: { see: ['owner'], act: ['owner'] },
					icon: 'scroll-text',
					label: { en: 'Reveal the planning notes' },
					description: {
						en: "Shows everyone the Planner's secret notes, for good. It cannot be taken back.",
					},
					// 🚧 Asked first (P4-10, 2026-10-18): one press revealed them for good.
					confirm: {
						question: { en: 'Reveal the planning notes?' },
						description: {
							en: "Everyone at the table reads the Planner's secret notes from now on: the goal, what is hidden and what the world will do next. This can't be taken back.",
						},
						confirmLabel: { en: 'Reveal' },
					},
				},
			],
		},
	}).inlet('input', C.userMessage.v1(), {
		genre: dungeonCrawlerGenre,
		event: sessionEvents.sessionAction,
	})
	graph = scriptStep(graph, w, '', 'reveal', DUNGEON_CRAWLER_REVEAL_SCRIPT.seedKey, ($) => ({ session: $.input.session }), 'Check the notes')
	const judged = ($: any) => $.reveal.main
	graph = textPart(graph, w, '', 'lane', judged, 'lane', "The owner's lane")
	const built = graph.junction('route', { on: judged }, (j: any) =>
		j
			.when('refused', { path: 'refusal', truthy: true }, (c: any) =>
				textPart(c, w, 'route.refused.', 'line', judged, 'refusal', 'The refusal').outlet(
					'write',
					($: any) =>
						C.createMessage.v1({
							text: $.route.refused.line.text,
							channel: $.lane.text,
							speaker: PLANNER as any,
						}),
					{ expose: { label: 'Say: already revealed' } },
				),
			)
			.when('revealed', { path: 'notes', truthy: true }, (c: any) =>
				textPart(
					textPart(c, w, 'route.revealed.', 'notes', judged, 'notes', 'The notes'),
					w,
					'route.revealed.',
					'notice',
					judged,
					'notice',
					'The notice',
				)
					.outlet(
						'copy',
						($: any) =>
							C.setSessionAnnex.v1({
								value: { [K.planningNotesRevealed]: at($, 'route.revealed.notes').text } as any,
								params: slot.params(),
							}),
						{ expose: { label: 'Reveal the notes to everyone' } },
					)
					.outlet(
						'tell',
						($: any) =>
							C.createMessage.v1({
								text: $.route.revealed.notice.text,
								channel: 'main',
								speaker: PLANNER as any,
								/** A side note, not a turn: it does not end the round (`DUNGEON_CRAWLER_DECLARED_RULE`). */
								narration: true,
							}),
						{ expose: { label: 'Tell the table' } },
					),
			)
			.when('goal', { path: 'journal', truthy: true }, (c: any) =>
				jsonPart(c, w, 'route.goal.', 'journal', judged, 'journal', 'The journal, the goal out').outlet(
					'write',
					($: any) =>
						C.setSessionAnnex.v1({ value: { [K.journal]: $.route.goal.journal.main } as any, params: slot.params() }),
					{ expose: { label: 'Show the goal in the journal' } },
				),
			),
	)
	return compile(
		built
			.preset('dungeon-crawler', { label: 'Dungeon Crawler', default: true }, (p: any) => applyWiring(p, w))
			.build(),
	)
}
