/**
 * 🚧 Dungeon Crawler's **Rest** (PLAN-dungeon-crawler-2026-10-14, feature 11):
 * the party stops for a night — no model call; what a night's rest does is
 * the table's, and how long one takes is the **session's ruleset's** (its
 * longest rest, read off the inlet at run time — `RulesetGist.rests`, lane
 * G3, 2026-10-23, S4; never a ruleset the build holds).
 *
 * Two ways in (PLAN-genres-seams S3):
 *
 *  - **the rules' Rest** — where the session's ruleset offers one
 *    (`core:function/rest@1`, an invokable function: Vis Itineris), the rules
 *    action Rest is the one at the composer (`core:spec/rules-action#rest`):
 *    it restores what the rules restore and raises `core:event/rest-taken@1`;
 *    this genre's own effects follow on that event — the routine **After a
 *    rest** (`core:spec/dungeon-crawler-after-rest`, `onEvent(rest-taken)`).
 *    🚧 The party's night is still the owner's to call: a rest another
 *    player's seat took is that seat's alone (the rules action carries no
 *    audience, ★);
 *  - **the genre's Rest** (`core:spec/dungeon-crawler-rest`) — registered
 *    only while the rules offer none (`unlessRulesOffer`, the host's fact
 *    `rules.invokable`), so a session never offers two.
 *
 * Both run `core:script/dungeon-crawler-rest` over the session and its state:
 *
 *  - every living player seat is restored to full health (its own hp
 *    max, `state.configs` — the number its bar is drawn to), and
 *    one **taken out** is back on their feet (`fate` → `alive`); the dead
 *    stay dead;
 *  - the crawl's clock moves on by the rest's length — the rest the rules
 *    raised, else their longest (`core:slot/crawl-time@1`); 🚧 rules that keep
 *    no rest say none, and the night is told without its length;
 *  - 🚧 every spent spell slot comes back (`spell-slots` pieces, `used` 0);
 *    at a table playing spell points (P2-4) the night's `advance` refills
 *    each caster's pool — the handler's, read off the ruleset's casting;
 *  - 🚧 a death-save tally (★7) is dropped: everyone living is up again;
 *  - the journal (the `travelogue` folio) gets the rest's line, which the
 *    next Planner call reads in its crib (no copy is kept).
 *
 * The world's fuses are conditions on the world owner (`core:slot/crawl-fuses@1`,
 * `sheet.ts`), shown to the Planner by the ruleset's sheet. The night then
 * passes through the handler's `advance` (`core:task/ruleset-resolve@1`),
 * over the world and the living seats, with `elapsed: { minutes }` — the
 * genre names its own unit (minutes), the length is the ruleset's.
 *
 * Written on the 🚧 **table** channel (no model, no speaker — PLAN-rulesets
 * §30: the rest's reckoning is the table's, never a line in Story's history
 * for the Narrator to imitate), anchored to Story's newest line; the
 * changes filed at that table row (`set-state`'s `worldRow`), so deleting
 * the Story line takes the rest back — and one line in the journal, anchored
 * to the same Story line (the `travelogue` folio): "The party rests. Day 1, 16:30 → Day 2,
 * 00:30."
 */

import { compile, coreEvents, slot, spec } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import { DUNGEON_CRAWLER_ANNEX_KEYS as K, TRAVELOGUE_CHANNEL } from './names.js'
import { DUNGEON_CRAWLER_EPOCH } from './create.js'
import { DUNGEON_CRAWLER_STORY_PREAMBLE, storySeed } from './storyScripts.js'
import { applyWiring, jsonPart, later, scriptStep, textPart, wiring, type Chain, type NodeLater, type Wiring } from './calls.js'
import { TABLE_CHANNEL } from '../../shared/ui/conversation/tableChannel.js'

/** @experimental */
export const DUNGEON_CRAWLER_REST_SPEC_ID = 'core:spec/dungeon-crawler-rest'
/** @internal */
export const DUNGEON_CRAWLER_REST_VERSION = '1.0.0'

/** 🚧 The routine that answers the rules' Rest (S3). @experimental */
export const DUNGEON_CRAWLER_AFTER_REST_SPEC_ID = 'core:spec/dungeon-crawler-after-rest'
/** @internal */
export const DUNGEON_CRAWLER_AFTER_REST_VERSION = '1.0.0'

/**
 * `core:script/dungeon-crawler-rest`: what a night's rest changes. Handed
 * `{ session, state, ruleset, cause? }` — `cause` the event that woke the
 * routine (its `values.rest`, the rest the rules raised). Returns `{ changes,
 * owners, deltas, progress, elapsed, line, journal }` (`elapsed` null where
 * the rules keep no rest).
 * @experimental
 */
export const DUNGEON_CRAWLER_REST_SCRIPT = storySeed(
	'core:script/dungeon-crawler-rest',
	'Dungeon Crawler: rest',
	`${DUNGEON_CRAWLER_STORY_PREAMBLE}
var progress = progressOf(core);
var state = own(v.state);
var seats = seatsOf(doc, state);
// 🚧 The rest's length, the session's rules' (S4): the rest the rules raised
// (\`rest-taken\`'s \`rest\`), else their longest; none where they keep no rest.
// The routine's cause carries the event's payload whole (\`cause.payload.values\`, as the
// host's \`dispatchRulesetEmits\` raises it — GM 2026-10-23: read there first).
var raisedBy = own(own(own(v.cause).payload).values);
var raised = text(raisedBy.rest) || text(own(own(v.cause).values).rest) || text(own(v.cause).rest);
var rests = Array.isArray(own(v.ruleset).rests) ? own(v.ruleset).rests : [];
var taken = null;
for (var ri = 0; ri < rests.length && raised; ri++) if (text(own(rests[ri]).id) === raised) taken = own(rests[ri]);
if (!taken || num(taken.minutes, 0) <= 0) taken = nightRest(v.ruleset);
var minutes = taken ? num(taken.minutes, 0) : 0;
// 🚧 After the rules' Rest (S3): the party's night is the owner's to call, as
// the crawl's own Rest always was — a rest another player's seat took was
// that seat's, and the rules restored what they restore. Nothing more here.
if (v.cause !== undefined && v.cause !== null) {
	var restedBy = text(raisedBy.owner) || text(own(own(v.cause).values).owner) || text(own(v.cause).owner);
	for (var rb = 0; rb < seats.length; rb++)
		if (seats[rb].ref === restedBy && seats[rb].user != null && doc.ownerUserId != null && Number(seats[rb].user) !== Number(doc.ownerUserId))
			return { changes: [], owners: [], deltas: null, elapsed: null, progress: null, line: null, journal: null };
}
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
var now = minutes > 0 ? addMinutes(was, minutes) || was : was;
if (now !== was) changes.push({ owner: "world", slot: SL.clock, value: now });
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
	// The night's time, for the handler's advance — none where the rules keep no rest.
	elapsed: minutes > 0 ? { minutes: minutes } : null,
	// The round script's mirror of who is out, when the rest changed it.
	progress: JSON.stringify([progress.fates || null, progress.deathSaves || null]) !== hadFates ? progress : null,
	line: "The party rests" + (minutes > 0 ? " for " + restWords(minutes) : "") + "." + (healed.length ? " " + healed.join(", ") + (healed.length === 1 ? " recovers." : " recover.") : "") + (now !== was ? " It is now " + clockLabel(now) + "." : ""),
	journal: "The party rests." + (now !== was ? " " + clockLabel(was) + " → " + clockLabel(now) + "." : "")
};
`,
)

/** What the rest's script hands the `rested` junction (`DUNGEON_CRAWLER_REST_SCRIPT`). */
interface Rested {
	readonly changes: unknown
	readonly owners: unknown
	readonly deltas: unknown
	readonly elapsed: unknown
	readonly progress: unknown
	readonly line: unknown
	readonly journal: unknown
}

/**
 * A night's rest, after the head (`input` — a person's press, or the
 * routine's moment — `state` and `head`, Story's newest line): the script,
 * then its junction — the table's line and the changes, the night under the
 * rules, the journal, the spell slots given back, who is up again. One body
 * for both ways in.
 */
// derive-don't-spell: one body on two heads (a press's user-message inlet, the routine's), whose union no chain types — see sdk-tests/deriveDontSpell ALLOWED.
const restBody = <B extends Chain>(head: B, w: Wiring, applied: NodeLater, routine: boolean) => {
	w.params.push(['head', { channel: 'main', limit: 1 }])
	const rested = scriptStep(
		head as any,
		w,
		'rest',
		DUNGEON_CRAWLER_REST_SCRIPT.seedKey,
		($: any) => ({
			session: $.input.session,
			state: $.state.state,
			// 🚧 The session's ruleset (S4): how long its rest takes.
			ruleset: $.input.ruleset,
			// The routine's moment: the rest the rules raised (`rest-taken`'s payload).
			...(routine ? { cause: $.input.cause } : {}),
		}),
		'Rest',
	)
	return rested.junction('rested', { on: ($: any) => $.rest.main }, (j: any) =>
		j
			.when('said', { path: (v: Rested) => v.line, truthy: true }, (c: any) =>
				jsonPart(
					jsonPart(
						textPart(applied.on(c), w, 'line', ($: any) => $.rest.main, 'line', 'The rest, told'),
						w,
						'anchor',
						($: any) => $.head.messages,
						'0.id',
						'The Story line the rest is told after',
					).outlet(
						'write',
						($: any) =>
							C.createMessage.v1({
								text: $.line.text,
								channel: TABLE_CHANNEL,
								// 🚧 The row it belongs to (§30): Story's newest.
								tableLine: $.anchor.main,
							}),
						{ expose: { label: 'Tell the rest' } },
					),
					w,
					'changes',
					($: any) => $.rest.main,
					'changes',
					'What the rest changes',
				)
					.query('resolved', ($: any) =>
						C.resolveStateChanges.v1({
							changes: $.changes.main,
							scope: $.input.sessionScope,
							base: $.state.version,
						}),
					)
					.task(
						'applied',
						($: any) =>
							C.setState.v1({
								changes: $.resolved.changes,
								scope: $.input.sessionScope,
								base: $.state.version,
								worldRow: $.write.messageId,
								params: slot.params(),
							}),
						{ expose: { label: 'Heal, and move the clock' } },
					),
			)
			/**
			 * The ruleset's **advance** (PLAN-rulesets §25): the night's time
			 * passed to every mechanic that runs on time — what wears off,
			 * what recharges — for the world and the living seats. 🚧 Only
			 * where the rules keep a rest (S4): its length is theirs.
			 */
			.when('passed', { path: (v: Rested) => v.elapsed, truthy: true }, (c: any) =>
				jsonPart(
					jsonPart(c, w, 'elapsed', ($: any) => $.rest.main, 'elapsed', "The night's length"),
					w,
					'owners',
					($: any) => $.rest.main,
					'owners',
					'Whose rules the night passes over',
				).task(
					'advanced',
					($: any) =>
						C.rulesetResolve.v1({
							params: slot.params(),
							scope: $.input.sessionScope,
							owners: $.owners.main,
							mode: 'advance',
							elapsed: $.elapsed.main,
							// The routine's moment: the event that woke it, the functions' `ctx.event` (D3).
							...(routine ? { event: $.input.cause } : {}),
						}),
					{ expose: { label: 'Pass the night under the rules' } },
				),
			)
			/** The journal's line for the rest, on the folio — as a round's is (`journal.ts`). */
			.when('logged', { path: (v: Rested) => v.journal, truthy: true }, (c: any) =>
				jsonPart(
					textPart(c, w, 'line', ($: any) => $.rest.main, 'journal', "The rest's journal line"),
					w,
					'anchor',
					($: any) => $.head.messages,
					'0.id',
					'The Story line the journal line follows',
				).outlet(
					'write',
					($: any) =>
						C.createMessage.v1({
							text: $.line.text,
							channel: TRAVELOGUE_CHANNEL,
							// Anchored, as the rest's table row is, to Story's newest line.
							tableLine: $.anchor.main,
						}),
					{ expose: { label: 'Write the rest in the journal' } },
				),
			)
			/** 🚧 The spell slots a long rest gives back, through the handler (PLAN §8). */
			.when('restored', { path: (v: Rested) => v.deltas, truthy: true }, (c: any) =>
				jsonPart(
					jsonPart(c, w, 'deltas', ($: any) => $.rest.main, 'deltas', 'The spell slots given back'),
					w,
					'owners',
					($: any) => $.rest.main,
					'owners',
					'Whose slots',
				).task(
					'apply',
					($: any) =>
						C.rulesetResolve.v1({
							params: slot.params(),
							scope: $.input.sessionScope,
							owners: $.owners.main,
							deltas: $.deltas.main,
							mode: 'apply',
							// The routine's moment: the event that woke it, the functions' `ctx.event` (D3).
							...(routine ? { event: $.input.cause } : {}),
						}),
					{ expose: { label: 'Give back the spell slots' } },
				),
			)
			.when('kept', { path: (v: Rested) => v.progress, truthy: true }, (c: any) =>
				jsonPart(c, w, 'value', ($: any) => $.rest.main, 'progress', 'Who is up again').outlet(
					'write',
					($: any) =>
						C.setSessionAnnex.v1({
							value: { [K.progress]: $.value.main } as any,
							params: slot.params(),
						}),
					{ expose: { label: 'Keep who is up again' } },
				),
			),
	)
}

/** **Rest** — stop for the night: wounds heal and the world moves on. Offered only while the rules offer no Rest of their own. @experimental */
export const dungeonCrawlerRestSpec = () => {
	const w = wiring()
	/** The night's changes applied — named first among the declared defaults' parameters, its branch built below. */
	const applied = later('applied')
	w.params.push([applied, { mode: 'apply' }])
	const head = spec(DUNGEON_CRAWLER_REST_SPEC_ID, {
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
						// 🚧 No length said (S4): it is the session's rules'.
						en: 'Stop for the night: wounds heal, the fallen-down get back up, and the world moves on.',
					},
				},
			],
		},
	})
		.inlet('input', C.userMessage.v1(), { suits: [] })
		.query('state', ($) => C.sessionState.v1({ scope: $.input.sessionScope }))
		/** Story's newest line: the one the rest's table row belongs to. */
		.query(
			'head',
			($) => C.sessionHistory.v1({ scope: $.input.sessionScope, params: slot.params() }),
			{
				expose: { status: 'Resting' },
			},
		)
	return compile((restBody(head, w, applied, false) as any).defaults((p: any) => applyWiring(p, w)).build())
}

/**
 * 🚧 **After a rest** — the routine on `core:event/rest-taken@1` (S3): when the
 * session's rules' Rest has been taken (the rules action Rest), the night's
 * effects that are the crawl's own — the party healed and back on their
 * feet, the death-save tallies gone, the spell slots back, the clock moved
 * by the rest the rules raised, the night under the rules, and the journal's
 * line. The rules' own restoring is theirs (`core:function/rest@1`).
 * @experimental
 */
export const dungeonCrawlerAfterRestSpec = () => {
	const w = wiring()
	const applied = later('applied')
	w.params.push([applied, { mode: 'apply' }])
	const head = spec(DUNGEON_CRAWLER_AFTER_REST_SPEC_ID, {
		version: DUNGEON_CRAWLER_AFTER_REST_VERSION,
		taxonomy: { role: 'maintenance' },
	})
		/** A routine (D2): the session, and the rest the rules raised (`cause`). */
		.inlet('input', C.routine.v1(), { suits: [coreEvents.restTaken] })
		.query('state', ($) => C.sessionState.v1({ scope: $.input.sessionScope }))
		/** Story's newest line: the one the rest's table row belongs to. */
		.query(
			'head',
			($) => C.sessionHistory.v1({ scope: $.input.sessionScope, params: slot.params() }),
			{
				expose: { status: 'Resting' },
			},
		)
	return compile((restBody(head, w, applied, true) as any).defaults((p: any) => applyWiring(p, w)).build())
}
