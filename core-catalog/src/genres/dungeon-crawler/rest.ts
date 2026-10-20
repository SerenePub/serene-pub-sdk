/**
 * 🚧 Dungeon Crawler's **Rest** (PLAN-dungeon-crawler-2026-10-14, feature 11):
 * a session action, modelled on Adventure's (`adventure/rest.ts`) but with a
 * fixed rule and no model call — the table knows what a night's rest does.
 *
 * `core:script/dungeon-crawler-rest` over the session and its state:
 *
 *  - every living player seat is restored to full health (its own hp
 *    max, `state.configs` — the number its bar is drawn to), and
 *    one **taken out** is back on their feet (`fate` → `alive`); the dead
 *    stay dead;
 *  - the crawl's clock moves on eight hours (`core:slot/crawl-time@1`);
 *  - 🚧 every spent spell slot comes back (`spell-slots` pieces, `used` 0);
 *    at a table playing spell points (P2-4) the night's `advance` refills
 *    each caster's pool to the derive script's `spell-points-max` — the
 *    handler's, read off the `casting` setting;
 *  - 🚧 a death-save tally (★7) is dropped: everyone living is up again;
 *  - the journal (the `travelogue` folio) gets the rest's line, which the
 *    next Planner call reads in its crib (no copy is kept).
 *
 * The world's fuses are conditions on the world owner (`core:slot/crawl-fuses@1`,
 * `sheet.ts`), shown to the Planner by the ruleset's sheet. The night then
 * passes through the handler's `advance` (`core:task/ruleset-resolve@1`),
 * over the world and the living seats, with `elapsed: { minutes }` — the
 * genre names its own unit and never reads the ruleset's.
 *
 * Written on the 🚧 **table** channel (no model, no speaker — PLAN-rulesets
 * §30: the rest's reckoning is the table's, never a line in Story's history
 * for the Narrator to imitate), anchored to Story's newest line; the
 * changes filed at that table row (`set-state`'s `worldRow`), so deleting
 * the Story line takes the rest back — and one line in the journal, anchored
 * to the same Story line (the `travelogue` folio): "The party rests. Day 1, 16:30 → Day 2,
 * 00:30."
 */

import { compile, slot, spec, sessionEvents } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import { dungeonCrawlerGenre } from '../../registry/genres.js'
import { DUNGEON_CRAWLER_ANNEX_KEYS as K, TRAVELOGUE_CHANNEL } from './names.js'
import { DUNGEON_CRAWLER_EPOCH } from './create.js'
import { DUNGEON_CRAWLER_STORY_PREAMBLE, storySeed } from './storyScripts.js'
import { applyWiring, jsonPart, scriptStep, textPart, wiring } from './calls.js'
import { TABLE_CHANNEL } from '../../shared/ui/conversation/tableChannel.js'

/** @experimental */
export const DUNGEON_CRAWLER_REST_SPEC_ID = 'core:spec/dungeon-crawler-rest'
/** @internal */
export const DUNGEON_CRAWLER_REST_VERSION = '1.0.0'
/** How long a rest takes. @experimental */
export const DUNGEON_CRAWLER_REST_MINUTES = 480

/** @experimental */
export const DUNGEON_CRAWLER_REST_SCRIPT = storySeed(
	'core:script/dungeon-crawler-rest',
	'Dungeon Crawler: rest',
	`${DUNGEON_CRAWLER_STORY_PREAMBLE}
var progress = progressOf(core);
var state = own(v.state);
var seats = seatsOf(doc, state);
var changes = [];
var healed = [];
for (var i = 0; i < seats.length; i++) {
	var s = seats[i];
	if (s.fate === "dead") continue;
	var mended = false;
	if (s.maxHp !== null && (s.hp === null || s.hp < s.maxHp)) { changes.push({ owner: s.ref, slot: SL.hp, value: s.maxHp }); mended = true; }
	// 🚧 …and one lying dying (Q3-8) is up again too, its death saves gone.
	if (s.fate === "taken-out" || s.fate === "dying") { changes.push({ owner: s.ref, slot: SL.fate, value: "alive" }); mended = true; }
	if (s.tally) changes.push({ owner: s.ref, slot: SL.deathSaves, value: "" });
	if (mended) healed.push(s.name);
}
var was = text(own(state.world)["crawl-time"]) || ${JSON.stringify(DUNGEON_CRAWLER_EPOCH)};
var now = addMinutes(was, ${DUNGEON_CRAWLER_REST_MINUTES}) || was;
changes.push({ owner: "world", slot: SL.clock, value: now });
var hadFates = JSON.stringify([progress.fates || null, progress.deathSaves || null]);
keepFates(progress, seats, changes);
// 🚧 Nobody is dying after a night's rest (★7): the death-save tallies go.
if (progress.deathSaves) delete progress.deathSaves;
changes = dropUnchanged(changes, state, null);
// Whose rules the night passes over: the world, and every living seat.
var owners = ["session:" + doc.sessionId];
for (var oi = 0; oi < seats.length; oi++) if (seats[oi].fate !== "dead") owners.push(seats[oi].ref);
// 🚧 A long rest gives back every spent spell slot (PLAN §8) — done here as
// the pieces rewritten, not left to the ruleset's rider, which only says so.
var deltas = [];
var byId = own(own(state.cast).byId);
for (var si = 0; si < seats.length; si++) {
	if (seats[si].fate === "dead") continue;
	var slots = own(byId[stateKeyOf(seats[si].ref)])["crawl-spell-slots"];
	slots = Array.isArray(slots) ? slots : [];
	for (var sp = 0; sp < slots.length; sp++) {
		var piece = own(slots[sp]);
		if (num(piece.used, 0) <= 0) continue;
		var fresh = copy(piece);
		fresh.used = 0;
		deltas.push({ owner: seats[si].ref, op: "remove", repertoire: "spell-slots", piece: text(piece.name) });
		deltas.push({ owner: seats[si].ref, op: "add", repertoire: "spell-slots", piece: fresh, reason: "A long rest" });
	}
}
return {
	changes: changes,
	owners: owners,
	deltas: deltas.length ? deltas : null,
	// The round script's mirror of who is out, when the rest changed it.
	progress: JSON.stringify([progress.fates || null, progress.deathSaves || null]) !== hadFates ? progress : null,
	line: "The party rests for eight hours." + (healed.length ? " " + healed.join(", ") + (healed.length === 1 ? " recovers." : " recover.") : "") + " It is now " + clockLabel(now) + ".",
	journal: "The party rests. " + clockLabel(was) + " → " + clockLabel(now) + "."
};
`,
)

/** **Rest** — stop for eight hours: wounds heal and the world moves on. @experimental */
export const dungeonCrawlerRestSpec = () => {
	const w = wiring()
	const rest = ($: any) => $.rest.main
	w.params.push(['rested.said.applied', { mode: 'apply' }])
	let graph: any = spec(DUNGEON_CRAWLER_REST_SPEC_ID, {
		version: DUNGEON_CRAWLER_REST_VERSION,
		taxonomy: { role: 'action' },
		contributes: {
			actions: [
				{
					key: 'rest',
					venue: { kind: 'composer' },
					quick: true,
					/** The owner's alone: a guest is not shown it (the host hides an action outside its `see`). */
					audience: { see: ['owner'], act: ['owner'] },
					icon: 'bed',
					label: { en: 'Rest' },
					description: {
						en: 'Stop for eight hours: wounds heal, the fallen-down get back up, and the world moves on.',
					},
				},
			],
		},
	})
		.inlet('input', C.userMessage.v1(), {
			genre: dungeonCrawlerGenre,
			event: sessionEvents.sessionAction,
		})
		.query('state', ($) => C.sessionState.v1({ scope: $.input.sessionScope }))
		/** Story's newest line: the one the rest's table row belongs to. */
		.query(
			'head',
			($) => C.sessionHistory.v1({ scope: $.input.sessionScope, params: slot.params() }),
			{
				expose: { status: 'Resting' },
			},
		)
	w.params.push(['head', { channel: 'main', limit: 1 }])
	graph = scriptStep(
		graph,
		w,
		'',
		'rest',
		DUNGEON_CRAWLER_REST_SCRIPT.seedKey,
		($) => ({
			session: $.input.session,
			state: $.state.state,
		}),
		'Rest',
	)
	const built = graph.junction('rested', { on: rest }, (j: any) =>
		j
			.when('said', { path: 'line', truthy: true }, (c: any) =>
				jsonPart(
					jsonPart(
						jsonPart(
							textPart(c, w, 'rested.said.', 'line', rest, 'line', 'The rest, told'),
							w,
							'rested.said.',
							'anchor',
							($: any) => $.head.messages,
							'0.id',
							'The Story line the rest is told after',
						).outlet(
							'write',
							($: any) =>
								C.createMessage.v1({
									text: $.rested.said.line.text,
									channel: TABLE_CHANNEL,
									// 🚧 The row it belongs to (§30): Story's newest.
									tableLine: $.rested.said.anchor.main,
								}),
							{ expose: { label: 'Tell the rest' } },
						),
						w,
						'rested.said.',
						'changes',
						rest,
						'changes',
						'What the rest changes',
					),
					w,
					'rested.said.',
					'owners',
					rest,
					'owners',
					'Whose rules the night passes over',
				)
					.query('resolved', ($: any) =>
						C.resolveStateChanges.v1({
							changes: $.rested.said.changes.main,
							scope: $.input.sessionScope,
							base: $.state.version,
						}),
					)
					.task(
						'applied',
						($: any) =>
							C.setState.v1({
								changes: $.rested.said.resolved.changes,
								scope: $.input.sessionScope,
								base: $.state.version,
								worldRow: $.rested.said.write.messageId,
								params: slot.params(),
							}),
						{ expose: { label: 'Heal, and move the clock' } },
					)
					/**
					 * The ruleset's **advance** (PLAN-rulesets §25): the night's
					 * time passed to every mechanic that runs on time — what wears
					 * off, what recharges — for the world and the living seats.
					 */
					.task(
						'advanced',
						($: any) =>
							C.rulesetResolve.v1({
								scope: $.input.sessionScope,
								owners: $.rested.said.owners.main,
								mode: 'advance',
								elapsed: { minutes: DUNGEON_CRAWLER_REST_MINUTES },
							}),
						{ expose: { label: 'Pass the night under the rules' } },
					),
			)
			/** The journal's line for the rest, on the folio — as a round's is (`journal.ts`). */
			.when('logged', { path: 'journal', truthy: true }, (c: any) =>
				jsonPart(
					textPart(
						c,
						w,
						'rested.logged.',
						'line',
						rest,
						'journal',
						"The rest's journal line",
					),
					w,
					'rested.logged.',
					'anchor',
					($: any) => $.head.messages,
					'0.id',
					'The Story line the journal line follows',
				).outlet(
					'write',
					($: any) =>
						C.createMessage.v1({
							text: $.rested.logged.line.text,
							channel: TRAVELOGUE_CHANNEL,
							// Anchored, as the rest's table row is, to Story's newest line.
							tableLine: $.rested.logged.anchor.main,
						}),
					{ expose: { label: 'Write the rest in the journal' } },
				),
			)
			/** 🚧 The spell slots a long rest gives back, through the handler (PLAN §8). */
			.when('restored', { path: 'deltas', truthy: true }, (c: any) =>
				jsonPart(
					jsonPart(c, w, 'rested.restored.', 'deltas', rest, 'deltas', 'The spell slots given back'),
					w,
					'rested.restored.',
					'owners',
					rest,
					'owners',
					'Whose slots',
				).task(
					'apply',
					($: any) =>
						C.rulesetResolve.v1({
							scope: $.input.sessionScope,
							owners: $.rested.restored.owners.main,
							deltas: $.rested.restored.deltas.main,
							mode: 'apply',
						}),
					{ expose: { label: 'Give back the spell slots' } },
				),
			)
			.when('kept', { path: 'progress', truthy: true }, (c: any) =>
				jsonPart(c, w, 'rested.kept.', 'value', rest, 'progress', 'Who is up again').outlet(
					'write',
					($: any) =>
						C.setSessionAnnex.v1({
							value: { [K.progress]: $.rested.kept.value.main } as any,
							params: slot.params(),
						}),
					{ expose: { label: 'Keep who is up again' } },
				),
			),
	)
	return compile(
		built
			.preset('dungeon-crawler', { label: 'Dungeon Crawler', default: true }, (p: any) =>
				applyWiring(p, w),
			)
			.build(),
	)
}
