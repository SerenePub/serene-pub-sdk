/**
 * 🚧 Dungeon Crawler's **story turn** (PLAN-dungeon-crawler-2026-10-14,
 * features 4–14; on the ruleset handler since 2026-10-16, PLAN-rulesets §25,
 * §26, §30): the `channel.story` branch of `core:spec/dungeon-crawler-respond`.
 *
 * **Two model calls a turn, at most** — the hidden Planner's ONE JSON call,
 * then the Narrator's ONE streamed reply. A malformed plan is asked for once
 * more (the only third call there is), then the turn is the Narrator's alone.
 * The rules are the session's **ruleset**, read and applied by the one
 * handler every genre calls (`core:task/ruleset-resolve@1`): the genre never
 * rolls a check or does a sum of its own.
 *
 *  0. `placeholder` — the Narrator's row (a swipe's own row, re-driven),
 *     opened FIRST (AUDIT A11): a line sent while the turn runs comes after
 *     a reply and declares for the next round, never lost between the last
 *     reply and this one; every write of the turn is anchored to it, so a
 *     retake or a delete takes it back;
 *  1. `fallen`, `log`, `books` — the story turn's own reads (the fallen, the
 *     Journal folio) and `core:script/dungeon-crawler-books`: the Planner's
 *     crib (the preamble's one crib builder — the world as the session's own
 *     lorebook holds it, the goal, the leads, the notes and their Asks, the
 *     story so far) and this round's brief (each player seat, what they
 *     declared — the person lines on Story since its newest reply — or their
 *     standing order, the companions, the owed arrivals); the **owners** the
 *     handler resolves and each seat's **action**. A swipe or an extend of
 *     the last turn's row re-tells that turn (`redo`): no Planner, no
 *     handler — what was rolled stands;
 *  2. `plan.fresh.resolve` — the handler's **resolve**: the ruleset's
 *     labelled blocks (`voice`, `sheet`, `pieces`, `ties`) for these owners
 *     and actions, at the session's rigour; `plan.fresh.fields` names them
 *     for the Planner's prompt row (`{{rulesetVoice}}`, `{{rulesetSheet}}`,
 *     `{{rulesetPieces}}`, `{{rulesetTies}}`, `{{rigourLine}}`);
 *  3. `plan.fresh.*` — the Planner, its grammar laid over the session's
 *     rules (🚧 S1, 2026-10-23: `plan.fresh.shape` reads `ruleset-resolve`'s
 *     `replySchema`, `plan.fresh.schema` — `core:script/dungeon-crawler-shape`
 *     — adds the genre's fields, the rules' checks and the world's places;
 *     `shape.ts`): its **deltas**, the world moving with each place's ways out
 *     inside it, the brief; checked ONCE by `core:script/dungeon-crawler-plan`
 *     (the deltas read back in the handler's shape, `asDelta`); unusable →
 *     `plan.fresh.again.retry.*`;
 *  4. `turn` — `core:script/dungeon-crawler-turn`: the plan the turn runs on
 *     (the first answer, else the retry, else none), with the ways out of
 *     places the book holds and the spell slots spent as deltas;
 *  5. `rolled.planned.apply` — the handler's **apply** with the deltas:
 *     validated, rolled (a check the model asked for), applied through the
 *     state gate; outcomes, the explain trace, refused deltas (filed for
 *     review by the handler). `rolled.planned.after` reads the state left;
 *  6. `door` — `core:script/dungeon-crawler-door` (`dice.ts`): death's door
 *     for every living seat the turn left at 0 health — and no other (A7) —
 *     and the table's line — the outcomes (a check's with its explain), the
 *     conditions put on or taken off, and death's door — written on the 🚧
 *     **table** channel (`stakes.shown.write`), anchored to the Narrator's
 *     row, in no voice;
 *  7. `ledger` — `core:script/dungeon-crawler-ledger`: the genre's own
 *     bookkeeping — its fields (fate, the clock, where a newcomer stands, a
 *     level's new full health), death (`death.ts`), the goal (`goal.ts`), the
 *     leads, the journal line and its kinds (`journal.ts`), the world's new
 *     places and people for the session's lorebook (`lore.ts`), the
 *     Narrator's brief and **outcomes**, and the turn's minutes;
 *  8. `raise.levels.*`, `sheet.changed.*` — the genre fields written, filed at
 *     the Narrator's row (the revealed notes kept in step, A24);
 *     `time.passed.advance` — the handler's **advance** with the turn's
 *     minutes (A4: durations tick every turn); `lorePlaces` … `loreFallen` —
 *     the world written; `filed.kept.write` — the bookkeeping and the
 *     journal, one annex write;
 *  9. `outcomes`, `context` … `say` → `save` — the Narrator, streamed, under
 *     its own prompt row with the brief as `{{turnDirection}}` and the
 *     outcomes as `{{outcomes}}` after the history (§30 amendment);
 * 10. `after.*` — on a fresh turn only: the journal's lines on the folio,
 *     each with its kind (`journal.ts`, §16), each
 *     secret in its player's lane (`secrets.ts`), the Planner's lines in a
 *     player's lane (a death's *Make a new character*, the goal's form). The
 *     next round starts with the Narrator's reply itself (`roundScript.ts`).
 */

import { slot, ITEM, type ChainBuilder, type DataRef, type OutPortsOf, type PortDecl } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import { DUNGEON_CRAWLER_PROMPT_KEYS } from '../../seed/prompts.js'
import { DUNGEON_CRAWLER_ANNEX_KEYS as K, DUNGEON_CRAWLER_SECRETS_SCHEMA, TRAVELOGUE_CHANNEL } from './names.js'
import { NARRATOR } from './genesis.js'
import { DUNGEON_CRAWLER_EPOCH, PLANNER } from './create.js'
import { DUNGEON_CRAWLER_DOOR_SCRIPT } from './dice.js'
import { DUNGEON_CRAWLER_DEATH_JS } from './death.js'
import { DUNGEON_CRAWLER_GOAL_JS } from './goal.js'
import { DUNGEON_CRAWLER_JOURNAL_JS, journalWrites } from './journal.js'
import { DUNGEON_CRAWLER_ENTRY_TYPES, DUNGEON_CRAWLER_WORLD_WRITES_JS, loreWrites } from './lore.js'
import { deliverSecrets } from './secrets.js'
import { DUNGEON_CRAWLER_CRIB_ROUNDS, DUNGEON_CRAWLER_STORY_PREAMBLE, storySeed } from './storyScripts.js'
import { DUNGEON_CRAWLER_SHAPE_SCRIPT } from './shape.js'
import {
	DUNGEON_CRAWLER_NARRATE_TEMPLATE,
	jsonPart,
	later,
	modelCall,
	on,
	scriptStep,
	sibling,
	textPart,
	type BranchOf,
	type Wiring,
} from './calls.js'
import type { StoryOn } from './respond.js'
import { TABLE_CHANNEL } from '../../shared/ui/conversation/tableChannel.js'

/*
 * ⏳ The story turn's grammar was spelled here from Vis Itineris at build
 * (`DUNGEON_CRAWLER_DELTA_SCHEMA`, `DUNGEON_CRAWLER_TURN_SCHEMA` and their
 * words variants, retired 2026-10-23, lane G3): it is laid at run time over
 * the session's ruleset now — `ruleset-resolve`'s `replySchema` and the
 * rules' checks (`shape.ts`, `core:script/dungeon-crawler-shape`; S1).
 */

/**
 * 🚧 `core:script/dungeon-crawler-books`: what a story turn starts from.
 * Handed `{ session, state, story, messageId, places, people, fallen, log }`
 * — the settings document, the session's state, the Story's newest rows, the
 * inlet's re-driven row, the three listings of the session's lorebook and
 * the Journal folio's newest lines. Returns:
 *
 *  - `fresh` — plan this turn (not a re-telling, not ended); `redo` — the row
 *    being re-driven is the last turn's, whose `told` brief and outcomes
 *    stand; `ended`;
 *  - `base` — `{ progress, journal }` to build on;
 *  - `owners` — what the handler resolves: `session:<id>`, each live seat's
 *    reference, and `location:<entry id>` for each place one stands in;
 *    `actions` — `[{ owner, text }]`, each live seat's declared lines, else
 *    its standing order;
 *  - `clockBase`, `rules` (`difficulty`), `seats`, `places`, `people` — as
 *    read; `log` — the Journal's newest lines; `crib` (the preamble's one
 *    crib builder), `brief`;
 *  - `rigour` — the session's, as its document carries it (empty when it
 *    carries none: the ruleset handler then reads the stored one);
 *  - 🚧 `ruleset` — the turn's ruleset as the inlet carries it (its id,
 *    rigour and settings, and its gist — `rulesetGistOf`; lane G3,
 *    2026-10-23, S4), and from it `decides` (counted play: the rules decide
 *    anything — never "the ruleset is Vis Itineris"), `casting` (`slots` ·
 *    `points`, P2-4) and the pool's slot (`pointsSlot`), `fall` (its fall
 *    rule, or null — told in words, ★I) and `deathSaves` (its saves play,
 *    ★7), `conditions` (its condition rows, or null), each seat's
 *    `levelHp` (what a level brings to full health, its class's — 0 where
 *    the rules keep no levels), and `rulesetRigour` — whether numbers count
 *    on a round that applied no change (the handler's facts say so only
 *    when it ran).
 * @experimental
 */
export const DUNGEON_CRAWLER_BOOKS_SCRIPT = storySeed(
	'core:script/dungeon-crawler-books',
	"Dungeon Crawler: the Planner's books",
	`${DUNGEON_CRAWLER_STORY_PREAMBLE}
var state = own(v.state);
var progress = progressOf(core);
var journal = own(core[KEYS.journal]);
var msgs = Array.isArray(v.story) ? v.story : [];
// A swipe or an extend re-drives the last turn's own row: that turn is told
// again from what it decided, and nothing is planned, rolled or written twice.
var last = own(progress.lastTelling);
var redo = v.messageId != null && last.row != null && Number(v.messageId) === Number(last.row);
var w0 = own(state.world);
var rules = { difficulty: text(w0.difficulty) || "fair" };
// 🚧 How the session's ruleset plays (P2-4, P2-6): the kit's own ruleset or
// another (Story: words), and Vis Itineris's casting and dying choices.
var rs = rulesetOf(v.ruleset);
var clockBase = text(w0["crawl-time"]) || ${JSON.stringify(DUNGEON_CRAWLER_EPOCH)};
var seats = seatsOf(doc, state);
// 🚧 What a level brings to each seat's full health (S4, D9: the genre's
// HP_PER_LEVEL retired): its class's kit's level gain, read off the
// session's ruleset — none where the rules keep no levels or no kits.
var KITS0 = own(own(v.ruleset).kits);
function levelHpOf(cls) {
	var order = Array.isArray(KITS0.order) ? KITS0.order : [], by = own(KITS0.byId);
	if (!rs.levels || !order.length) return 0;
	var words = String(cls || "").toLowerCase().split(/[^a-z]+/), pick = own(by[order[0]]);
	for (var k0 = 0; k0 < order.length; k0++) {
		var kw = Array.isArray(own(by[order[k0]]).words) ? own(by[order[k0]]).words : [], hit = false;
		for (var w0 = 0; w0 < kw.length && !hit; w0++) for (var w1 = 0; w1 < words.length; w1++) if (words[w1] && words[w1] === kw[w0]) hit = true;
		if (hit) { pick = own(by[order[k0]]); break; }
	}
	return num(pick.levelHp, 0);
}
for (var lh = 0; lh < seats.length; lh++) seats[lh].levelHp = levelHpOf(seats[lh]["class"]);
var heroes = own(progress.heroes);
var places = placesOf(v.places);
var people = peopleOf(v.people);
var log = logOf(v.log, CRIB_ROUNDS);

// This round's declarations: the person lines on Story since its newest
// reply, by the one rule the round script waits on (\`sinceReply\`).
var declaredLines = sinceReply(msgs);
var said = {};
function seatOfLine(m) {
	var sp = text(m.speaker);
	for (var q = 0; q < seats.length; q++) if (seats[q].ref === sp) return seats[q];
	if (m.personaId != null) for (var p = 0; p < seats.length; p++) if (seats[p].ref === "character:" + m.personaId) return seats[p];
	if (m.userId != null) for (var u = 0; u < seats.length; u++) if (seats[u].user === Number(m.userId)) return seats[u];
	return seats.length === 1 ? seats[0] : null;
}
for (var l = 0; l < declaredLines.length; l++) {
	var line = declaredLines[l];
	if (!text(line.content)) continue;
	var who = seatOfLine(line);
	var key = who ? who.ref : "someone";
	said[key] = (said[key] ? said[key] + " " : "") + text(line.content);
}

function placeNamed(name) {
	var n = text(name).toLowerCase();
	for (var i = 0; i < places.length; i++) if (places[i].name.toLowerCase() === n) return places[i];
	return null;
}
var crib = cribLines(progress, journal, { state: state, places: v.places, people: v.people, fallen: v.fallen, log: log, detail: true });

var brief = [];
brief.push("Difficulty: " + rules.difficulty + ". Time: " + clockLabel(clockBase) + ".");
var party = [];
// Each live seat's action this round: what it declared, else its standing order.
var actions = [];
var owners = ["session:" + doc.sessionId];
// 🚧 A seat whose character is not made yet is neither waited for nor in
// the round (the 100-turn walk, B16): named only, never by reference.
var notYet = [];
for (var pi = 0; pi < seats.length; pi++) {
	var st = seats[pi];
	if (!seatMade(progress, st)) { notYet.push(st.name); continue; }
	var saves0 = own(own(progress.deathSaves)[st.ref]);
	var dying0 = rs.deathSaves && (st.fate === "alive" || st.fate === "dying") && st.hp !== null && st.hp <= 0 ? ", dying: " + deathSaveWords(num(saves0.passed, 0), num(saves0.failed, 0)) : "";
	var head = "- " + st.name + " (" + st.ref + (st["class"] ? ", " + st["class"] : "") + standingText(st.level, st.hp, st.maxHp, rs) +
		dying0 + (st.location ? ", at " + st.location : "") + ")";
	if (st.fate === "dead") { party.push(head + ": dead. Nobody plays them now."); continue; }
	if (st.fate === "taken-out") { party.push(head + ": taken out, down until the party rests."); continue; }
	// 🚧 Dying (death saves, ★7): they act no more, but a heal can still reach them.
	if (dying0) { owners.push(st.ref); party.push(head + ": dying at death's door — they can do nothing until someone heals them; their death save is rolled after this round."); continue; }
	var declared = !!said[st.ref];
	var action = declared ? said[st.ref] : st.standingOrder;
	actions.push({ owner: st.ref, text: action });
	owners.push(st.ref);
	var here = placeNamed(st.location);
	if (here && here.id !== null && owners.indexOf("location:" + here.id) < 0) owners.push("location:" + here.id);
	party.push(head + (declared ? ": declared \\u201C" + action + "\\u201D." : ": did not declare; standing order: " + action + "."));
}
if (said.someone) party.push("- Someone at the table said: \\u201C" + said.someone + "\\u201D.");
brief.push(party.length ? "This round:\\n" + party.join("\\n") : "This round: nobody is playing yet.");
if (notYet.length) brief.push("Still making their character, not in the story yet: " + notYet.join(", ") + ".");
// 🚧 A round nobody spoke in (Continue): said in so many words, so the
// round's own turn says what to resolve (owner ruling 2026-10-18).
var anyDeclared = false;
for (var dk in said) anyDeclared = true;
if (!anyDeclared && actions.length) brief.push("Nobody new declared this round: resolve it from each character's standing order.");
// 🚧 The companions are narrative only (owner ruling 2026-10-18, P3-9): no
// sheet is kept for them and no change reaches them — said so, by name.
var comp = companionNames(doc);
if (comp.length) brief.push("Companions travelling with the party, voiced by the Narrator — narrative only: no sheet keeps their health or their things, so propose no delta for them; tell what befalls them in the brief:\\n- " + comp.join("\\n- "));
var owed = Array.isArray(progress.arrivals) ? progress.arrivals : [];
for (var oi = 0; oi < owed.length; oi++) {
	var o = own(owed[oi]);
	var newName = text(own(heroes[o.who]).name);
	if (newName && newName !== text(o.fallen)) brief.push("Arriving: " + newName + ", a new character, must join the story within " + num(o.left, 1) + " round(s), near " + (text(o.where) || "where " + text(o.fallen) + " fell") + ".");
}
return {
	fresh: !redo && !progress.ended, redo: redo, ended: !!progress.ended,
	// 🚧 Which shape the Planner plans in (Q2-3, ★3): a table whose rules
	// decide anything counts (S4: \`rulesetDecides\`); any other keeps words.
	planCounted: !redo && !progress.ended && rs.decides, planWords: !redo && !progress.ended && !rs.decides,
	told: redo ? {
		brief: text(last.brief), outcomes: text(last.outcomes),
		changes: Array.isArray(last.changes) && last.changes.length ? last.changes : null,
		raises: Array.isArray(last.raises) && last.raises.length ? last.raises : null,
		replay: Array.isArray(last.replay) && last.replay.length ? last.replay : null
	} : null,
	base: { progress: progress, journal: journal },
	owners: owners, actions: actions, rigour: text(doc.rigour),
	decides: rs.decides, casting: rs.casting, pointsSlot: rs.pointsSlot, fall: rs.fall, deathSaves: rs.deathSaves, rulesetRigour: rs.rigour,
	conditions: own(v.ruleset).conditions || null,
	clockBase: clockBase, rules: rules, seats: seats, places: places, people: people, log: log,
	crib: crib.join("\\n"), brief: brief.join("\\n")
};
`,
)

/**
 * 🚧 `core:script/dungeon-crawler-ruleset-fields`: the handler's `resolve`
 * blocks, named for the Planner's prompt row — each block's text at the
 * depth it rendered, and one line saying how this table plays (its rigour).
 * Handed `{ blocks, facts }` — `blocks` the context budget's `fittedBlocks`
 * (a list of `{ key, text }`; the handler's keyed record also reads),
 * `facts` the handler's. Returns
 * `{ rulesetVoice, rulesetSheet, rulesetPieces, rulesetTies, rigourLine }`,
 * empty text for a block the ruleset did not render — and 🚧 the books
 * prompt's ruleset-dependent sentences (2026-10-18, P2-1, P2-4, P2-6; read
 * off the session's ruleset since 2026-10-23, S4 — its gist on the inlet's
 * `ruleset`, handed in as `ruleset`): `piecesLine` (what a change's `name`
 * says), `conditionsLine` (the rules' own conditions by name, else words),
 * `castingLine` (what a spell costs: a slot, spell points, or — where the
 * rules keep neither — nothing said), `effectsLine` (weapons, draughts and
 * spells do what they say: never a hand-written health change) and
 * `againstLine` (a difficulty, by the rules' own bands). None names Vis
 * Itineris's vocabulary (★10). 🚧 And `wordsOnly` ("yes" where the rules
 * decide nothing, R2-3) and `exitsInWords` (a way out with no numbers): the
 * prompt's words variants.
 * @experimental
 */
export const DUNGEON_CRAWLER_RULESET_FIELDS_SCRIPT = storySeed(
	'core:script/dungeon-crawler-ruleset-fields',
	"Dungeon Crawler: the ruleset's blocks, for the Planner",
	`${DUNGEON_CRAWLER_STORY_PREAMBLE}
// The fitted blocks (context-budget's \`fittedBlocks\`, a list of
// \`{ key, text }\`), or the handler's own record keyed by label.
var blocks = {};
if (Array.isArray(v.blocks)) {
	for (var bi = 0; bi < v.blocks.length; bi++) {
		var fb = own(v.blocks[bi]);
		if (typeof fb.key === "string") blocks[fb.key] = fb;
	}
} else blocks = own(v.blocks);
var facts = own(v.facts);
function blockText(b) { return b && typeof b === "object" ? text(b.text) : text(b); }
var rigour = text(facts.rigour) || "prose";
var counted = rigour === "mechanics" || rigour === "scripts";
// 🚧 The spell slots each seat has left (P1-8, the walk's #39: a third spell
// at 0 slots was narrated as cast): what the sheet block does not say.
var slotLines = [];
var seatsF = Array.isArray(own(v.books).seats) ? own(v.books).seats : [];
for (var sf = 0; sf < seatsF.length; sf++) {
	var sw = slotWords(own(own(own(own(v.state).cast).byId)[stateKeyOf(seatsF[sf].ref)]));
	if (sw.length) slotLines.push(seatsF[sf].name + " — spell slots " + sw.join(", ") + ". A spell of a level with none left cannot be cast.");
}
var sheetText = blockText(blocks.sheet);
var bk = own(v.books);
// 🚧 The session's ruleset, as the inlet carries it (S4): whether it decides
// anything, its kits (a level's spell slots), its conditions, its way out,
// whether chance decides, and its difficulty bands — never Vis Itineris's.
var gist = own(v.ruleset);
var decides = bk.decides === true;
var slotType = text(own(gist.kits).slotType);
var byPoints = decides && bk.casting === "points";
var slotted = decides && !byPoints && !!slotType;
// Under spell points no seat holds slots: the sheet's pool says what is left.
if (byPoints) slotLines = [];
var conds = own(bk.conditions);
var condNames = Array.isArray(conds.names) ? conds.names : [];
var piecesLine = slotted
	? "name: the entry by its library id or its name — a spell slot by its level (1) — or empty"
	: decides ? "name: the entry by its library id or its name, or empty" : "name: the entry in plain words, or empty";
var conditionsLine = condNames.length
	? "When something poisons, knocks down, frightens or binds someone, add that condition (entryType " + text(conds.entryType) + "; name one of: " + condNames.join(", ") + "); remove it when it passes."
	: "When something poisons, knocks down, frightens or binds someone, add it as a condition in a word or two (entryType " + (text(conds.entryType) || "conditions") + "); remove it when it passes.";
var castingLine = byPoints
	? "When someone casts a spell of level 1 or higher, spend the spell (entryType spells, op spend, name the spell's name): it costs its level in spell points, and with too few points left it cannot be cast."
	: slotted
		? "When someone casts a spell of level 1 or higher, spend a slot of that level (entryType " + slotType + ", op spend, name the level); with none left at that level, the spell cannot be cast."
		: "";
// 🚧 Owner ruling ★4 (P2-1): the table executes what a piece does.
var effectsLine = !decides ? "" : counted
	? "Weapons, draughts and spells do what they say when used, so never add a health change for them yourself: a blow with a weapon is op hit (name the weapon, check the attack it calls for, against the foe's defence, aimedAt who is struck), and the table works out its harm on a hit; a draught drunk, a flask thrown or a spell's effect is op use (name it, aimedAt who it is for — empty for oneself), which heals, harms or cures by itself, and a draught or flask is used up."
	: "A draught drunk or a flask thrown is used up (op spend, entryType consumables); what it does to someone's health is a change by an amount.";
// 🚧 What a difficulty is, by the rules' own bands (D9: never the genre's numbers).
var bands = Array.isArray(gist.bands) ? gist.bands : [];
var lowBand = null, highBand = null;
for (var bd = 0; bd < bands.length; bd++) {
	var bnd = own(bands[bd]);
	if (typeof bnd.target !== "number") continue;
	if (!lowBand || bnd.target < lowBand.target) lowBand = bnd;
	if (!highBand || bnd.target > highBand.target) highBand = bnd;
}
var againstLine = lowBand && highBand && lowBand !== highBand
	? "against: its difficulty, " + lowBand.target + " " + text(lowBand.label).toLowerCase() + " to " + highBand.target + " " + text(highBand.label).toLowerCase() + ", else 0"
	: "against: its difficulty, else 0";
// 🚧 Who decides a check: dice where chance decides, else the rules' own way.
var decider = gist.chance === true ? "The table rolls the dice, never you." : "The table decides every check by its rules, never you.";
return {
	rulesetVoice: blockText(blocks.voice),
	rulesetSheet: slotLines.length ? (sheetText ? sheetText + "\\n" : "") + slotLines.join("\\n") : sheetText,
	piecesLine: piecesLine, conditionsLine: conditionsLine, castingLine: castingLine, effectsLine: effectsLine, againstLine: againstLine,
	rulesetPieces: blockText(blocks.pieces),
	rulesetTies: blockText(blocks.ties),
	rigourLine: counted && decides
		? decider + " Propose deltas, never totals: a check for anything risky (op hit, use or traverse, with the check and the difficulty it is against), a change by an amount (add, spend), an entry gained, lost or used (add, remove, spend). A failed check changes nothing by itself: say what it costs in the brief."
		: "Nothing is rolled at this table, and no number is ever told. Propose no checks: what happens follows from what the scene makes likely. A change by an amount is still kept for you (add, spend), never a total; an entry gained, lost or used is add, remove or spend; anything else changes in words (op set, the new value in words).",
	// The prompts' \`{{#if diceRolled}}\`: at \`prose\` no word of dice (walk 6, 2026-10-17).
	diceRolled: counted && decides ? "yes" : "",
	// 🚧 \`{{#if wordsOnly}}\`: a table whose rules decide nothing (Freeform,
	// PLAN-dc-after-walk3 R2-3, the walk's NEW-6; S4: never "the ruleset is not
	// Vis Itineris") — its shape carries no check, no difficulty and no aim,
	// and nobody "falls to 0 health": the books prompt says none of them.
	wordsOnly: decides ? "" : "yes",
	// 🚧 \`{{#if exitsInWords}}\`: a way out keeps no lock or trap difficulty —
	// the rules decide nothing, or keep no way out of their own (S4).
	exitsInWords: decides && gist.exits ? "" : "yes"
};
`,
)

/**
 * 🚧 `core:script/dungeon-crawler-plan`: the Planner's answer, checked —
 * the ONE `checkPlan` of the turn (AUDIT C7: the turn, the door and the
 * ledger read the plan this step hands on, never check it again). Handed
 * `{ json }` → `{ ok, retry, plan }` — `plan` normalised, or `null` with
 * `retry` when there is no usable `narratorBrief`.
 * @experimental
 */
export const DUNGEON_CRAWLER_PLAN_SCRIPT = storySeed(
	'core:script/dungeon-crawler-plan',
	"Dungeon Crawler: check the Planner's plan",
	`${DUNGEON_CRAWLER_STORY_PREAMBLE}
var plan = checkPlan(v.json);
return { ok: !!plan, retry: !plan, plan: plan };
`,
)

/**
 * 🚧 `core:script/dungeon-crawler-turn`: the plan this turn runs on — the
 * first answer when it was usable, else the retry's (checked here, the only
 * other check), else none. Handed `{ books, first, again, state }` → `{ plan,
 * deltas, owners }` (`deltas` null when there is nothing for the handler to
 * apply; `owners` the books' and every place a way out lands on). Two
 * things become deltas here, from the state the turn started on:
 *
 *  - the ways out of every room the Planner wrote that the book already
 *    holds — `exits` pieces on that place, a way of the same name replaced
 *    (`exitDeltas`, the one exit model, AUDIT A12);
 *  - 🚧 a spell slot spent (PLAN §8): `spend` on `spell-slots`, piece the
 *    level ("1"), is that level's piece rewritten with one more `used` —
 *    never the whole piece spent away; refused (left out) when none is left
 *    — and at a table playing spell points (P2-4) refused in words: the
 *    spell is spent instead (`spend` on `spells`, the handler's pool).
 *
 * 🚧 A `hit` or `use` keeps its `aimedAt` (P2-1), a name the table knows
 * read as that reference; a `use` with no check stays a `use` on the kit's
 * ruleset — the handler executes it and spends what it uses up (owner ruling
 * ★4) — and is a `spend` of the piece elsewhere (Story keeps it in words).
 * @experimental
 */
export const DUNGEON_CRAWLER_TURN_SCRIPT = storySeed(
	'core:script/dungeon-crawler-turn',
	'Dungeon Crawler: the plan the turn runs on',
	`${DUNGEON_CRAWLER_STORY_PREAMBLE}
var b = own(v.books);
var state = own(v.state);
// 🚧 The session's rules' conditions as the table says them (S4), off the books.
var CONDITION_ROWS = own(own(b.conditions).rows);
var plan = null;
if (b.fresh) {
	// 🚧 A table of words planned in its own shape (Q2-3): that branch's answer.
	var words0 = b.planWords === true;
	var first = own(words0 ? v.firstWords : v.first);
	plan = first.ok === true && first.plan ? first.plan : checkPlan(words0 ? v.againWords : v.again);
}
var owners = Array.isArray(b.owners) ? b.owners.slice() : [];
var seatsB = Array.isArray(b.seats) ? b.seats : [];
var placesB = Array.isArray(b.places) ? b.places : [];
// 🚧 What the turn could not do, each in the table's words (P1-1, P1-8):
// the door script shows them on the table's line, the ledger tells the
// Narrator they did not happen.
var refused = [];
// 🚧 Ways out a traverse crosses (P1-4): opened by the ledger on a success.
var traversals = [];
// Every name the table knows a reference by — the seats, the companions,
// the places — so an owner given by name is that reference (P1-1).
var NAMES = {}, BY_NAME = {}, COMPANION = {};
for (var sn0 = 0; sn0 < seatsB.length; sn0++) { NAMES[seatsB[sn0].ref] = seatsB[sn0].name; BY_NAME[text(seatsB[sn0].name).toLowerCase()] = seatsB[sn0].ref; }
var comps = companionsOf(doc);
for (var cn0 = 0; cn0 < comps.length; cn0++) { NAMES[comps[cn0].ref] = comps[cn0].name; BY_NAME[comps[cn0].name.toLowerCase()] = comps[cn0].ref; COMPANION[comps[cn0].ref] = true; }
for (var pl0 = 0; pl0 < placesB.length; pl0++) if (placesB[pl0].id !== null) { NAMES["location:" + placesB[pl0].id] = placesB[pl0].name; BY_NAME[text(placesB[pl0].name).toLowerCase()] = "location:" + placesB[pl0].id; }
function seatRefFor(owner) {
	var o = text(owner);
	return BY_NAME[o.toLowerCase()] || o;
}
function seatOfRef(ref) {
	for (var s = 0; s < seatsB.length; s++) if (seatsB[s].ref === ref) return seatsB[s];
	return null;
}
function bagOf(ref) {
	var m0 = /^location:(\\d+)$/.exec(ref);
	if (m0) return own(own(own(state.locations).byId)[m0[1]]);
	return own(own(own(state.cast).byId)[stateKeyOf(ref)]);
}
// The repertoire an owner holds a piece in, by its name or compendium id.
function heldIn(ref, piece) {
	var want = (piece && typeof piece === "object" ? text(piece.name) : text(piece)).toLowerCase();
	if (!want) return null;
	var bag = bagOf(ref);
	var lists = SHEET_LISTS.concat([["crawl-conditions", "conditions"], ["crawl-spell-slots", "spell-slots"], ["crawl-exits", "exits"]]);
	for (var li = 0; li < lists.length; li++) {
		var held = Array.isArray(bag[lists[li][0]]) ? bag[lists[li][0]] : [];
		for (var hi = 0; hi < held.length; hi++) {
			var hp1 = own(held[hi]);
			var names = [text(hp1.name), text(hp1.pieceId), pieceWords(hp1)];
			for (var ni = 0; ni < names.length; ni++) if (names[ni] && names[ni].toLowerCase() === want) return { repertoire: lists[li][1], piece: hp1 };
		}
	}
	return null;
}
function isHealth(slot) { var k = text(slot).toLowerCase(); return k === "hp" || k === "core:slot/hp@1" || k === "health"; }
// The health an owner stands on now: the sheet's, else its full health.
function healthNow(ref) {
	var st0 = seatOfRef(ref);
	if (st0) return st0.hp !== null ? st0.hp : st0.maxHp;
	var e0 = own(own(own(state.cast).byId)[stateKeyOf(ref)]);
	return num(e0.hp, null);
}
// 🚧 Who crosses a way (Q2-1, owner ruling ★6 — no grammar change): the seat
// whose declaration this round names the way (its name, or where it goes),
// else the one seat standing at its place, else the one seat that declared.
var ACTIONS = Array.isArray(b.actions) ? b.actions : [];
function actorFor(place, wayName) {
	var name = text(wayName).toLowerCase();
	var to = name.replace(/^[a-z]+ to /, "");
	var named = [], here = [], spoke = [];
	for (var ai = 0; ai < ACTIONS.length; ai++) {
		var act = own(ACTIONS[ai]);
		var st2 = seatOfRef(text(act.owner));
		if (!st2) continue;
		var said2 = text(act.text).toLowerCase();
		if (said2 && (said2.indexOf(name) >= 0 || (to && said2.indexOf(to) >= 0))) named.push(st2.ref);
		if (NAMES[place] && text(st2.location).toLowerCase() === text(NAMES[place]).toLowerCase()) here.push(st2.ref);
		if (said2) spoke.push(st2.ref);
	}
	return named.length ? named[0] : here.length === 1 ? here[0] : spoke.length === 1 ? spoke[0] : null;
}
// 🚧 A delta, normalised before the handler can refuse it (P1-1): its owner
// by name, an overkill blow brought to what is left (owner ruling
// 2026-10-18: death's door decides from there), a use with no check an
// unchecked use, a traverse named by the way. Null when it cannot happen —
// said in \`refused\`.
function normalise(dl0) {
	var dl = copy(dl0);
	dl.owner = seatRefFor(dl.owner);
	// 🚧 Who it is aimed at (P2-1): a seat or a place by its reference; a
	// companion (narrative only) or a foe by name, told and kept nowhere.
	if (text(dl.aimedAt)) {
		var tRef = seatRefFor(dl.aimedAt);
		dl.aimedAt = COMPANION[tRef] ? NAMES[tRef] : tRef;
	}
	var who0 = NAMES[dl.owner] || dl.owner;
	if (COMPANION[dl.owner]) {
		refused.push({ delta: dl, words: "Not changed: " + who0 + " travels with the party in the story only — no sheet keeps their health or their things." });
		return null;
	}
	if (isHealth(dl.slot) && (dl.op === "spend" || (dl.op === "add" && Number(dl.value) < 0))) {
		var amount = Math.abs(Number(dl.value));
		var now0 = healthNow(dl.owner);
		if (now0 !== null && isFinite(amount) && amount > now0) {
			if (now0 <= 0) { refused.push({ delta: dl, words: "Not changed: " + who0 + " has no health left to lose." }); return null; }
			dl.value = dl.op === "spend" ? now0 : -now0;
		}
	}
	// 🚧 A condition at a table of words (Q2-3): written as its words alone —
	// "<the condition>: <its gloss>" — never the rules' rule for it; 🚧 and
	// where the session's rules keep no such condition (S4: Freeform), its
	// name alone, so nothing else's rule is ever looked up for it.
	if (b.decides === false && dl.repertoire === "conditions" && dl.op === "add" && typeof dl.piece === "string") {
		var crow = CONDITION_ROWS[dl.piece] || CONDITION_ROWS[text(dl.piece).toLowerCase()];
		dl.piece = crow && crow.gloss ? { kind: "inline", name: crow.name, description: crow.gloss } : { kind: "inline", name: text(dl.piece) };
	}
	// An unchecked use where the rules decide nothing: the piece used up, in
	// words. Where they decide, the handler executes the use itself.
	if (dl.op === "use" && !text(dl.check) && b.decides === false) {
		var where = text(dl.repertoire) ? { repertoire: text(dl.repertoire) } : heldIn(dl.owner, dl.piece);
		if (where) return { owner: dl.owner, op: "spend", repertoire: where.repertoire, piece: dl.piece, reason: text(dl.reason) || "Used" };
	}
	if (dl.op === "traverse" && text(dl.piece)) {
		// The way is the place's: a traverse names it by the place that holds
		// it — where the traveller stands first, else any place that does.
		var holder = null;
		if (/^location:/.test(dl.owner) && heldIn(dl.owner, dl.piece)) holder = dl.owner;
		var traveller = seatOfRef(dl.owner);
		if (!holder && traveller && traveller.location && BY_NAME[text(traveller.location).toLowerCase()] && heldIn(BY_NAME[text(traveller.location).toLowerCase()], dl.piece)) holder = BY_NAME[text(traveller.location).toLowerCase()];
		for (var pp = 0; !holder && pp < placesB.length; pp++) if (placesB[pp].id !== null && heldIn("location:" + placesB[pp].id, dl.piece)) holder = "location:" + placesB[pp].id;
		if (holder) {
			var way = heldIn(holder, dl.piece);
			dl.owner = holder;
			dl.piece = text(way.piece.name) || dl.piece;
			// 🚧 The door's own lock difficulty decides (PLAN-dc-after-walk2
			// Q2-1, the walk's N7): the Planner's number only for a way that
			// keeps none.
			if (num(way.piece.lockDc, 0) > 0) dl.against = num(way.piece.lockDc, 0);
			// 🚧 Who makes the check (★6): the seat the Planner named, else the
			// one whose declaration names the way — its hands, its skill.
			var actor = traveller ? traveller.ref : actorFor(holder, dl.piece);
			if (actor) dl.actor = actor;
			traversals.push({ place: holder, way: copy(way.piece), actor: actor || null });
			if (owners.indexOf(holder) < 0) owners.push(holder);
		}
	}
	return dl;
}
// Slots this turn already spent, by seat and level: two spells of a level in
// one round spend two of its slots, and a third finds none (P1-8, the walk's
// #39: each spend read the slots the turn began with).
var spentNow = {};
function spendSlot(dl) {
	var lv = Number((/\\d+/.exec(text(dl.piece)) || [])[0]);
	var ref = seatRefFor(dl.owner);
	var held = own(own(own(state.cast).byId)[stateKeyOf(ref)])["crawl-spell-slots"];
	held = Array.isArray(held) ? held : [];
	var already = num(spentNow[ref + "|" + lv], 0);
	for (var i = 0; i < held.length; i++) {
		var p = own(held[i]);
		if (num(p.level, 0) !== lv || num(p.used, 0) + already >= num(p.max, 0)) continue;
		spentNow[ref + "|" + lv] = already + 1;
		var next = copy(p);
		next.used = num(p.used, 0) + already + 1;
		return [
			{ owner: ref, op: "remove", repertoire: "spell-slots", piece: text(p.name) },
			{ owner: ref, op: "add", repertoire: "spell-slots", piece: next, reason: dl.reason || "A spell cast" }
		];
	}
	// 🚧 None left at that level (P1-8, the walk's #39): refused in words the
	// table shows and the Narrator hears — the spell does not go off.
	// 🚧 In words (Q3-2, the walk's N14: "— casts a first-level spell does not
	// happen"): "Ilse has no first-level slot left: the spell fails."
	var ORD = ["", "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth"];
	var why0 = text(dl.reason).replace(/[.]$/, "");
	refused.push({ delta: dl, words: "Not changed: " + (NAMES[ref] || ref) + " has no " + (ORD[lv] ? ORD[lv] + "-level" : "such") + " slot left: the spell fails" + (why0 ? " (" + why0 + ")" : "") + "." });
	return null;
}
if (plan) {
	var deltas = [];
	for (var d = 0; d < plan.deltas.length; d++) {
		var dl = normalise(plan.deltas[d]);
		if (!dl) continue;
		if (dl.repertoire === "spell-slots" && dl.op === "spend" && b.casting === "points") {
			// 🚧 Spell points (P2-4): no slots to spend — the spell is.
			refused.push({ delta: dl, words: "Not changed: this table plays spell points, not slots — " + (NAMES[seatRefFor(dl.owner)] || "the caster") + " spends the spell itself, its level in points." });
			continue;
		}
		if (dl.repertoire === "spell-slots" && dl.op === "spend") {
			var spent = spendSlot(dl);
			if (spent) { deltas.push(spent[0]); deltas.push(spent[1]); }
			continue;
		}
		deltas.push(dl);
	}
	var ways = exitDeltas(plan.world.rooms, placesB, state);
	for (var x = 0; x < ways.deltas.length; x++) deltas.push(ways.deltas[x]);
	// The place a way out lands on is resolved this turn, standing in it or not.
	for (var w = 0; w < ways.owners.length; w++) if (owners.indexOf(ways.owners[w]) < 0) owners.push(ways.owners[w]);
	plan.deltas = deltas;
}
return {
	plan: plan, deltas: plan && plan.deltas.length ? plan.deltas : null, owners: owners,
	refused: refused.length ? refused : null, traversals: traversals.length ? traversals : null
};
`,
)

/**
 * 🚧 `core:script/dungeon-crawler-ledger`: the story turn's own books, kept.
 * Handed `{ session, books, turn, door, applied, after, state, row }` —
 * `applied` the handler's `apply` (`{ blocks, facts, outcomes }`), `after`
 * the state it left (`state`, the turn's own, when it applied nothing),
 * `row` the Narrator's row. Returns `{ changes, progress, journal, notes,
 * notesRevealed, brief, narrator, travelogue, journalLines, secrets,
 * laneLines, raises, places, people, fallen, replay, advance }` — see the
 * file header, step 8. `advance` is the turn's minutes for the handler's
 * `advance` (AUDIT A4: durations tick on every story turn, not only on
 * Rest). On a re-telling (a swipe), the brief and the outcomes as the turn
 * first told them, and what it files again (`changes`, `raises`, `replay`:
 * the host took back what was anchored to the row).
 * @experimental
 */
export const DUNGEON_CRAWLER_LEDGER_SCRIPT = storySeed(
	'core:script/dungeon-crawler-ledger',
	'Dungeon Crawler: keep the books',
	`${DUNGEON_CRAWLER_STORY_PREAMBLE}
${DUNGEON_CRAWLER_WORLD_WRITES_JS}
var b = own(v.books);
if (b.redo) {
	// A swipe takes back what the turn wrote at its row (the host retracts
	// state anchored to a re-driven reply): it is filed again — the genre's
	// own changes as they were, and the deltas the handler applied without a
	// roll (its checks are not rolled twice: the dice that fell stand).
	var told0 = own(b.told);
	return {
		changes: told0.changes || null,
		// A raise told before raises named their stat was full health's.
		raises: Array.isArray(told0.raises) ? told0.raises.map(function (r) { var o = own(r); if (!o.slot) o.slot = SL.hp; return o; }) : null,
		replay: told0.replay || null,
		progress: null, journal: null, notes: null, notesRevealed: null, travelogue: null, journalLines: null,
		secrets: null, laneLines: null, places: null, people: null, fallen: null, advance: null,
		brief: text(told0.brief) || "Tell this round again from what the players just did.",
		narrator: (function () {
			var c0 = text(own(own(v.applied).facts).rigour) || text(b.rulesetRigour), dr = c0 === "mechanics" || c0 === "scripts" ? "yes" : "";
			return text(told0.outcomes) ? { outcomes: text(told0.outcomes), diceRolled: dr } : { diceRolled: dr };
		})()
	};
}
var d = own(v.door);
var applied = own(v.applied);
// The Narrator's row, as its write's result ({ status, ids: { id } }) or a bare id.
var rawRow = v.row && typeof v.row === "object" ? (v.row.ids ? v.row.ids.id : v.row.id) : v.row;
var row = rawRow != null && isFinite(Number(rawRow)) ? Number(rawRow) : null;
var base = own(b.base);
var progress = own(copy(base.progress));
var journal = own(copy(base.journal));
// The plan as the plan step checked it — never checked again (AUDIT C7).
var plan = own(v.turn).plan || null;
var seats = Array.isArray(b.seats) ? b.seats : [];
// The state as the handler's deltas left it; with none applied, as the turn found it.
var afterState = Object.keys(own(v.after)).length ? own(v.after) : own(v.state);
var seatsNow = seatsOf(doc, afterState);
function seatFor(ref) {
	var r = text(ref);
	for (var i = 0; i < seats.length; i++) if (seats[i].ref === r) return seats[i];
	for (var j = 0; j < seats.length; j++) if (text(seats[j].name).toLowerCase() === r.toLowerCase()) return seats[j];
	return null;
}
function nowOf(ref) {
	for (var i = 0; i < seatsNow.length; i++) if (seatsNow[i].ref === ref) return seatsNow[i];
	return null;
}
var changes = [];
var told = [];
var laneLines = [];
var facts = own(applied.facts);
// 🚧 The handler's rigour, else — a round that applied no change — the
// session's, as the books read it: a quiet round at a dice table still
// tells the Narrator the dice count.
var rig0 = text(facts.rigour) || text(b.rulesetRigour);
var counted = rig0 === "mechanics" || rig0 === "scripts";

// A level the handler applied raises the seat's full health by what a level
// brings under the session's rules (\`levelHp\`, the books' — its class's
// level gain; S4, D9: the genre keeps no number of its own): its hp max, a
// stat configuration (\`raises\`, written before the changes, at this row)
// — and its health by as much. Rules that keep no levels raise nothing.
var raises = [];
for (var lu = 0; lu < seats.length; lu++) {
	var was = seats[lu], is = nowOf(seats[lu].ref);
	var perLevel = num(was.levelHp, 0);
	if (!is || was.fate === "dead" || was.maxHp === null || perLevel <= 0) continue;
	var gained = Math.max(1, Math.round(num(is.level, was.level))) - was.level;
	if (gained <= 0) continue;
	var top = was.maxHp + gained * perLevel;
	raises.push({ owner: was.ref, slot: SL.hp, config: { max: top } });
	// 🚧 …and at a spell-points table the pool's most with it (Q1-6): the
	// pool rule, the seat's own ceiling on its sheet.
	if (b.casting === "points" && text(b.pointsSlot)) raises.push({ owner: was.ref, slot: b.pointsSlot, config: { max: spellPointsFor(was["class"], Math.round(num(is.level, was.level))) } });
	changes.push({ owner: was.ref, slot: SL.hp, value: Math.min(top, (is.hp === null ? was.maxHp : is.hp) + gained * perLevel) });
}

// The clock: the turn's minutes, from where the turn started.
var clockNext = null;
if (plan && plan.clock.minutes > 0) {
	clockNext = addMinutes(b.clockBase, plan.clock.minutes);
	if (clockNext && clockNext !== b.clockBase) changes.push({ owner: "world", slot: SL.clock, value: clockNext });
	else clockNext = null;
}

// The world the Planner moved, for the session's own lorebook: new places
// with their ways out (a link says the way and how it stands), new people
// (\`lore.ts\`). The ways out of a place the book already holds were pieces
// in this turn's deltas (\`exitDeltas\`, the turn script).
var placesNow = Array.isArray(b.places) ? b.places : [];
var writes = plan ? worldWrites(placesNow, Array.isArray(b.people) ? b.people : [], plan.world.rooms, plan.world.npcs, counted) : { places: [], people: [] };
var fallenNew = [];
${DUNGEON_CRAWLER_DEATH_JS}
// Who is out of the round once this turn lands (the round script's mirror).
var outNow = fatesAfter(seatsNow, changes);
keepFates(progress, seatsNow, changes);
// 🚧 Where everybody is (core:slot/location@1, AUDIT A9): a living seat nobody
// has placed yet (a newcomer) stands where a living seat of the party stands,
// else where its arrival was owed, else the first place of the world.
function partyPlace(except) {
	for (var i = 0; i < seatsNow.length; i++)
		if (seatsNow[i].ref !== except && seatsNow[i].location && !outNow[seatsNow[i].ref]) return seatsNow[i].location;
	return "";
}
function owedPlace(ref) {
	var s = seatFor(ref);
	var owed0 = Array.isArray(progress.arrivals) ? progress.arrivals : [];
	for (var i = 0; s && s.user != null && i < owed0.length; i++) if (own(owed0[i]).who === "user:" + s.user) return text(own(owed0[i]).where);
	return "";
}
if (plan)
	for (var ls = 0; ls < seatsNow.length; ls++) {
		var sn = seatsNow[ls];
		if (sn.location || outNow[sn.ref] === "dead") continue;
		// Not in the story yet: a character still being made stands nowhere.
		if (!seatMade(progress, sn)) continue;
		var at0 = partyPlace(sn.ref) || owedPlace(sn.ref) || (placesNow[0] ? placesNow[0].name : writes.places[0] ? writes.places[0].name : "");
		if (at0) changes.push({ owner: sn.ref, slot: SL.location, value: at0 });
	}
${DUNGEON_CRAWLER_GOAL_JS}
${DUNGEON_CRAWLER_JOURNAL_JS}

var notesNow = plan && plan.world.notes ? plan.world.notes : null;

// The Narrator's brief: the Planner's. What the rules decided and what it
// cost are the OUTCOMES (PLAN-rulesets §30 amendment): their own labelled
// block after the history, where the model reads them last — never in the
// system block, which carries the stable voice.
var brief = [];
brief.push(plan ? plan.narratorBrief : progress.ended ? "" : "The Planner is silent this round: continue the story from what the players just did, and let the world answer them.");
if (plan && plan.deltas.length && !counted) brief.push("This table keeps no numbers: tell every result in words.");
var outcomes = [];
var handlerBlock = own(own(applied.blocks).outcomes);
if (text(handlerBlock.text)) outcomes.push("What the rules decided — tell each result honestly, the cost first:\\n" + text(handlerBlock.text));
for (var t = 0; t < told.length; t++) outcomes.push(told[t]);
// 🚧 What the round asked for that did not happen (P1-2, P1-8): the
// Narrator never tells it as done — the walk's potions drunk, locks picked
// and spells cast at no slot were all narrated as having happened.
var notDone = Array.isArray(d.refused) ? d.refused : [];
if (notDone.length) outcomes.push("These did NOT happen — never tell them as done; the attempt may fail in the story:\\n- " + notDone.map(function (x) { return text(x).replace(/^Not changed: /, ""); }).join("\\n- "));
if (counted && text(handlerBlock.text)) outcomes.push("You may name a result in a word; leave the numbers to the table's line.");
changes = dropUnchanged(changes, afterState, null);
var outcomesText = outcomes.join("\\n\\n");
var briefText = brief.filter(function (x) { return x; }).join("\\n\\n");
// What a swipe of this row files again: the genre's changes, the raised
// health, and the deltas that need no roll — 🚧 an unchecked use among them
// (P2-1: a draught drunk is drunk again, its use spent again).
var replay = [];
if (plan) for (var rp = 0; rp < plan.deltas.length; rp++)
	if (CHECK_OPS.indexOf(plan.deltas[rp].op) < 0 || (plan.deltas[rp].op === "use" && !text(plan.deltas[rp].check))) replay.push(plan.deltas[rp]);
// 🚧 A way crossed on a success stands open after it (P1-4): its lock is
// picked or broken. Applied after the round (the replay step), and filed
// for a swipe to apply again with the rest.
var opened = [];
var nowOpen = [];
var trav = Array.isArray(own(v.turn).traversals) ? own(v.turn).traversals : [];
var ocs = Array.isArray(applied.outcomes) ? applied.outcomes : [];
for (var tv = 0; tv < trav.length; tv++) {
	var tw = own(trav[tv]);
	var wayName = text(own(tw.way).name);
	var crossed = false;
	for (var oi2 = 0; oi2 < ocs.length; oi2++) {
		var oc2 = own(ocs[oi2]);
		if (oc2.kind !== "check" || text(oc2.owner) !== text(tw.place)) continue;
		if (text(oc2.text).toLowerCase().indexOf(wayName.toLowerCase()) < 0) continue;
		var five = text(own(oc2.check).five);
		if (five === "success" || five === "crit" || five === "partial") crossed = true;
	}
	var st1 = text(own(tw.way).state).toLowerCase();
	if (!crossed || (st1 !== "locked" && !(num(own(tw.way).lockDc, 0) > 0))) continue;
	var openWay = copy(own(tw.way));
	openWay.state = "open";
	delete openWay.lockDc;
	openWay.description = text(openWay.name) + (openWay.trap ? ", trapped" : "");
	opened.push({ owner: tw.place, op: "remove", repertoire: "exits", piece: wayName });
	opened.push({ owner: tw.place, op: "add", repertoire: "exits", piece: openWay, reason: wayName + " stands open" });
	nowOpen.push(wayName + " now stands open.");
}
for (var op2 = 0; op2 < opened.length; op2++) replay.push(opened[op2]);
// 🚧 The Narrator hears it too (Q2-1): the way stands open, in one line.
if (nowOpen.length) outcomesText = (outcomesText ? outcomesText + "\\n\\n" : "") + nowOpen.join(" ");
progress.lastTelling = {
	row: row, brief: briefText, outcomes: outcomesText,
	changes: changes.length ? changes : null, raises: raises.length ? raises : null, replay: replay.length ? replay : null
};
return {
	changes: changes.length ? changes : null,
	progress: progress, journal: journal, notes: notesNow,
	// 🚧 While the notes are out, the revealed copy follows every rewrite
	// (AUDIT A24: it was copied once and went stale).
	notesRevealed: notesNow && text(core[KEYS.planningNotesRevealed]) ? notesNow : null,
	brief: briefText,
	// The Narrator's prompt fields: \`{{outcomes}}\`, after the history.
	// \`{{diceRolled}}\`: at \`prose\` the Narrator hears no word of dice.
	narrator: outcomesText ? { outcomes: outcomesText, diceRolled: counted ? "yes" : "" } : { diceRolled: counted ? "yes" : "" },
	travelogue: travelogue,
	journalLines: journalLines.length ? journalLines : null,
	secrets: plan && plan.secrets.length ? plan.secrets : null,
	laneLines: laneLines.length ? laneLines : null,
	raises: raises.length ? raises : null,
	// A fresh turn applies again only the ways it crossed (P1-4).
	replay: opened.length ? opened : null,
	places: writes.places.length ? writes.places : null,
	people: writes.people.length ? writes.people : null,
	fallen: fallenNew.length ? fallenNew : null,
	advance: plan && plan.clock.minutes > 0 ? { minutes: plan.clock.minutes } : null
};
`,
)

/**
 * What a story turn says it is doing, stage by stage (owner 2026-10-15: "I'm
 * not seeing the visual feedback that a message is being processed").
 * Declared from the first step (`books`), so the turn speaks at once.
 */
const STORY_STATUS = Object.freeze({
	planning: 'The Planner is thinking',
	// Not "Rolling the dice" (AUDIT E): at \`prose\` nothing is rolled.
	settling: 'Settling the round',
	books: 'The Planner keeps the books',
	telling: 'The Narrator tells it',
} as const)

/** What the books hand the plan junction (`DUNGEON_CRAWLER_BOOKS_SCRIPT`). */
interface Books {
	readonly fresh: unknown
	readonly redo: unknown
	readonly ended: unknown
	readonly planCounted: unknown
	readonly planWords: unknown
}

/** The plan, checked (`DUNGEON_CRAWLER_PLAN_SCRIPT`): `retry` when there is no usable brief. */
interface Checked {
	readonly ok: unknown
	readonly retry: unknown
	readonly plan: unknown
}

/** The plan the turn runs on (`DUNGEON_CRAWLER_TURN_SCRIPT`). */
interface TurnPlan {
	readonly plan: unknown
	readonly deltas: unknown
	readonly owners: unknown
	readonly refused: unknown
	readonly traversals: unknown
}

/** Death's door, and the table's line (`DUNGEON_CRAWLER_DOOR_SCRIPT`). */
interface Door {
	readonly deaths: unknown
	readonly line: unknown
	readonly refused: unknown
}

/** The turn's books, kept (`DUNGEON_CRAWLER_LEDGER_SCRIPT`): each member `null` when there is nothing to write. @internal */
export interface Ledger {
	readonly changes: unknown
	readonly progress: unknown
	readonly journal: unknown
	readonly notes: unknown
	readonly notesRevealed: unknown
	readonly brief: unknown
	readonly narrator: unknown
	readonly travelogue: unknown
	readonly journalLines: unknown
	readonly secrets: unknown
	readonly laneLines: unknown
	readonly raises: unknown
	readonly places: unknown
	readonly people: unknown
	readonly fallen: unknown
	readonly replay: unknown
	readonly advance: unknown
}

/**
 * What the story turn's writers read off its chain (`lore.ts`, `journal.ts`,
 * `secrets.ts`): the inlet, the kept books, the Narrator's row. A chain that
 * has them passes for one. @internal
 */
export type StoryKept<P extends string = 'channel.story', Own extends Record<string, PortDecl> = {}> = ChainBuilder<
	{
		input: OutPortsOf<ReturnType<typeof C.userMessage.v1>>
		'channel.story.ledger': OutPortsOf<ReturnType<typeof C.runScript.v1>>
		'channel.story.placeholder': OutPortsOf<ReturnType<typeof C.createMessage.v1>>
	} & Own,
	P
>

/** What the rules' apply hands the door and the ledger. */
type Applied = { readonly [K in 'blocks' | 'facts' | 'outcomes' | 'explain' | 'rejected']: DataRef }

/** The handler's apply, as the door and the ledger read it. */
const applied = (a: Applied) => ({
	blocks: a.blocks,
	facts: a.facts,
	outcomes: a.outcomes,
	explain: a.explain,
	rejected: a.rejected,
})

/**
 * The `channel.story` branch (see the header): the spec's reads — the cast,
 * the Story's newest rows, the session's lorebook — are the respond spec's
 * head (`respond.ts`); the fallen and the Journal folio are its own.
 * @internal
 */
export const storyBranch = (s: StoryOn, w: Wiring): StoryOn => {
	// 🚧 An empty plan is an unreadable one (the 100-turn walk, B7): asked once
	// more, then the Narrator goes on alone — never a turn failed on it.
	const planWrite = { fresh: later('planWrite'), words: later('planWrite') }
	const replanWrite = { fresh: later('replanWrite'), words: later('replanWrite') }
	w.params.push([planWrite.fresh, { emptyIsUnreadable: true }])
	w.params.push([replanWrite.fresh, { emptyIsUnreadable: true }])
	w.params.push([planWrite.words, { emptyIsUnreadable: true }])
	w.params.push([replanWrite.words, { emptyIsUnreadable: true }])
	w.params.push([on(s, 'fallen'), { entryTypes: [DUNGEON_CRAWLER_ENTRY_TYPES.fallen] }])
	w.params.push([on(s, 'log'), { channel: TRAVELOGUE_CHANNEL, limit: DUNGEON_CRAWLER_CRIB_ROUNDS }])
	const reads = s
		.query('fallen', ($) => C.lorebookEntries.v1({ scope: $.input.sessionScope, params: slot.params() }), {
			expose: { label: 'The fallen', status: STORY_STATUS.planning },
		})
		.query('log', ($) => C.sessionHistory.v1({ scope: $.input.sessionScope, params: slot.params() }), {
			expose: { label: 'The journal so far', status: STORY_STATUS.planning },
		})
	const readActions = jsonPart(
		jsonPart(
			textPart(
				textPart(
					scriptStep(reads, w, 'books', DUNGEON_CRAWLER_BOOKS_SCRIPT.seedKey, ($) => ({
						session: $.input.session,
						state: $.state.state,
						story: $.story.messages,
						messageId: $.input.messageId,
						places: $.places.entries,
						people: $.people.entries,
						fallen: $.fallen.entries,
						log: $.log.messages,
						// 🚧 The ruleset the session plays and its settings (P2-4, P2-6).
						ruleset: $.input.ruleset,
					}), "Open the Planner's books", STORY_STATUS.planning),
					w,
					'crib',
					($) => $.books.main,
					'crib',
					"The Planner's crib, as text",
				),
				w,
				'brief',
				($) => $.books.main,
				'brief',
				'This round, as text',
			),
			w,
			'owners',
			($) => $.books.main,
			'owners',
			'Whose rules are read',
		),
		w,
		'actions',
		($) => $.books.main,
		'actions',
		'What each one does',
	)
	// The session's rigour, handed to the handler as the session holds it
	// (empty: the handler reads the stored rigour itself).
	const read = textPart(readActions, w, 'rigour', ($) => $.books.main, 'rigour', 'How strictly the table plays')
	/**
	 * The Narrator's row, opened FIRST (AUDIT A11) — before the Planner is
	 * asked, so a line somebody sends while the turn runs comes after a
	 * reply and declares for the next round, instead of falling between the
	 * Story's last reply and a reply that did not exist yet and being lost.
	 * Every write of the turn is anchored to it, so a retake or a delete
	 * takes it all back.
	 */
	const opened = read.outlet(
		'placeholder',
		($) =>
			C.createMessage.v1({
				generating: true,
				channel: 'main',
				speaker: NARRATOR as any,
				row: $.input.messageId,
			}),
		{ expose: { label: "Open the Narrator's line", status: STORY_STATUS.planning } },
	)
	/**
	 * The Planner, asked — one shape a table that counts (the ruleset's
	 * labelled blocks, its checks and difficulties), 🚧 another for a table of
	 * words (Q2-3, owner ruling ★3: the Freeform ruleset's books carry no lock
	 * difficulty, no trap difficulty, no check, no difficulty to beat and no
	 * aim — none of which a table of words can use).
	 */
	const planned = opened.junction('plan', { on: ($) => $.books.main }, (j) => {
		// `tag` tells the two placements apart in the panel: a reading lists each
		// group and step heading once per spec (groups.int: no two alike).
		const planIn = (f: BranchOf<typeof j, 'fresh' | 'words'>, mode: 'fresh' | 'words', tag: string) => {
			/**
			 * The Planner's call, the same terms on the first ask and the second
			 * — 🚧 its grammar the one this branch laid over the session's rules
			 * (S1: `schema`, below), read by the whole path the retry sees.
			 */
			const planner = (label: string, purpose: string) => ({
				speaker: PLANNER,
				prompt: DUNGEON_CRAWLER_PROMPT_KEYS.turn,
				schema: ($: any) => $.channel.story.plan[mode].schema.main, // derive-don't-spell: a branch chosen at build time (`fresh` | `words`) is a key the scope's type cannot index
				// 🚧 The round is the call's last user turn (owner ruling 2026-10-18):
				// on a round nobody spoke in, the shipped layout ended the prompt on
				// the Narrator's last line, and a strict chat model answered nothing.
				briefTurn: true,
				expose: { status: STORY_STATUS.planning, label, purpose },
			})
			/**
			 * The ruleset's **resolve** (PLAN-rulesets §25): the labelled blocks
			 * for this round's owners and actions, at the session's rigour — no
			 * dice, no writes.
			 */
			const resolved = planWrite[mode]
				.on(f)
				.task(
					'resolve',
					($) =>
						C.rulesetResolve.v1({
							params: slot.params(),
							scope: $.input.sessionScope,
							owners: $.channel.story.owners.main,
							actions: $.channel.story.actions.main,
							rigour: $.channel.story.rigour.text,
							mode: 'resolve',
						}),
					// Tagged by its branch, as the Planner's grammar is: two steps one heading apart (GM 2026-10-23).
					{ expose: { label: `Read the table's rules${tag}`, status: STORY_STATUS.planning } },
				)
				/**
				 * The blocks fitted to the Planner's window (W3-S): under
				 * pressure a block steps down a depth before any is dropped.
				 * Sized against the Planner's own model and sampling.
				 */
				.task(
					'budget',
					($) =>
						C.contextBudget.v1({
							blocks: $.resolve.blocks,
							sampling: slot.samplingOf(sibling($.resolve, 'planWrite')),
							connection: slot.connectionOf(sibling($.resolve, 'planWrite')),
							params: slot.params(),
						}),
					{ expose: { label: `Fit the rules to the Planner's window${tag}`, status: STORY_STATUS.planning } },
				)
			const fielded = scriptStep(resolved, w, 'fields', DUNGEON_CRAWLER_RULESET_FIELDS_SCRIPT.seedKey, ($) => ({
				blocks: $.budget.fittedBlocks,
				facts: $.resolve.facts,
				// 🚧 The seats and the state: each seat's spell slots left (P1-8).
				books: $.channel.story.books.main,
				state: $.state.state,
				// 🚧 The session's ruleset and its gist (S4): its kits, conditions, bands.
				ruleset: $.input.ruleset,
			}), `The rules, for the Planner${tag}`, STORY_STATUS.planning)
				/**
				 * 🚧 What a change may name under the session's rules (S1): the
				 * reply schema `ruleset-resolve` builds from its attributes and
				 * entry types — no dice, no writes.
				 */
				.task(
					'shape',
					($) =>
						C.rulesetResolve.v1({
							params: slot.params(),
							scope: $.input.sessionScope,
							owners: $.channel.story.owners.main,
							mode: 'resolve',
							actions: { replyShape: true } as any,
						}),
					{ expose: { label: `What the Planner may change${tag}`, status: STORY_STATUS.planning } },
				)
			/** 🚧 The Planner's grammar, laid over the rules' reply schema and checks (`shape.ts`). */
			const named = scriptStep(fielded, w, 'schema', DUNGEON_CRAWLER_SHAPE_SCRIPT.seedKey, ($) => ({
				shape: $.shape.replySchema,
				ruleset: $.input.ruleset,
				want: 'turn',
			}), `The Planner's grammar${tag}`, STORY_STATUS.planning)
			const asked = modelCall(named, w, 'plan', {
				...planner(
					`Planner${tag}`,
					'Decides, out of sight, what your actions cost and what the world does: the checks to roll, the changes to your sheet, the world moving.',
				),
				brief: ($) => $.channel.story.brief.text,
				crib: ($) => $.channel.story.crib.text,
				fields: ($) => $.fields.main,
				cast: ($) => $.cast.cast,
				history: ($) => $.story.messages,
			})
			return scriptStep(asked, w, 'checked', DUNGEON_CRAWLER_PLAN_SCRIPT.seedKey, ($) => ({
				json: $.planWrite.json,
			}), `Check the Planner's plan${tag}`).junction('again', { on: ($) => $.checked.main }, (k) =>
				k.when('retry', { path: (v: Checked) => v.retry, truthy: true }, (r) =>
					modelCall(replanWrite[mode].on(r), w, 'replan', {
						...planner(
							`Planner, asked again${tag}`,
							'When the plan comes back unreadable, the Planner is asked once more before the Narrator goes on alone.',
						),
						brief: ($) => $.channel.story.brief.text,
						crib: ($) => $.channel.story.crib.text,
						fields: ($) => $.channel.story.plan[mode].fields.main,
						cast: ($) => $.cast.cast,
						history: ($) => $.story.messages,
					}),
				),
			)
		}
		return j
			.when('fresh', { path: (v: Books) => v.planCounted, truthy: true }, (f) => planIn(f, 'fresh', ' (dice)'))
			.when('words', { path: (v: Books) => v.planWords, truthy: true }, (f) => planIn(f, 'words', ' (words)'))
	})
	const chosen = scriptStep(planned, w, 'turn', DUNGEON_CRAWLER_TURN_SCRIPT.seedKey, ($) => ({
		// 🚧 The session: the companions an owner may name (P1-1, P3-9).
		session: $.input.session,
		books: $.books.main,
		first: $.plan.fresh.checked.main,
		again: $.plan.fresh.again.retry.replanWrite.json,
		// 🚧 The words branch's answers (Q2-3): whichever branch ran.
		firstWords: $.plan.words.checked.main,
		againWords: $.plan.words.again.retry.replanWrite.json,
		state: $.state.state,
	}), 'The plan the turn runs on', STORY_STATUS.settling)
	/** 🚧 Whose rules the turn touches — the books' and every place a way out or a traverse lands on (P1-4). */
	const chosenOwners = jsonPart(chosen, w, 'turnOwners', ($) => $.turn.main, 'owners', 'Whose rules the turn touches')
	/**
	 * The ruleset's **apply** (PLAN-rulesets §25), the Narrator's row already
	 * open, so every write is anchored to it: the Planner's deltas validated,
	 * the checks it asked for rolled, the changes written through the state
	 * gate; then the state as the deltas left it.
	 */
	const rolled = chosenOwners.junction('rolled', { on: ($) => $.turn.main }, (j) =>
		j.when('planned', { path: (v: TurnPlan) => v.deltas, truthy: true }, (k) =>
			jsonPart(
				jsonPart(k, w, 'deltas', ($) => $.channel.story.turn.main, 'deltas', "The Planner's deltas"),
				w,
				'owners',
				($) => $.channel.story.turn.main,
				'owners',
				'Whose rules the deltas touch',
			)
				.task(
					'apply',
					($) =>
						C.rulesetResolve.v1({
							params: slot.params(),
							owners: $.owners.main,
							actions: $.channel.story.actions.main,
							deltas: $.deltas.main,
							scope: $.input.sessionScope,
							rigour: $.channel.story.rigour.text,
							mode: 'apply',
						}),
					{ expose: { label: 'Apply the rules', status: STORY_STATUS.settling } },
				)
				.query('after', ($) => C.sessionState.v1({ scope: $.input.sessionScope }), {
					expose: { label: 'The sheet after the rules' },
				}),
		),
	)
	const doored = scriptStep(rolled, w, 'door', DUNGEON_CRAWLER_DOOR_SCRIPT.seedKey, ($) => ({
		session: $.input.session,
		books: $.books.main,
		turn: $.turn.main,
		applied: applied($.rolled.planned.apply),
		after: $.rolled.planned.after.state,
		state: $.state.state,
	}), "Death's door, and the table's line", STORY_STATUS.settling)
	/**
	 * 🚧 The table's line (PLAN-rulesets §30), anchored to the Narrator's row
	 * it belongs to — never on Story, whose history the Narrator and the
	 * Planner read. No speaker: the table speaks in no voice. A check's line
	 * ends with the handler's explain (how its number was reached).
	 */
	const shown = doored.junction('stakes', { on: ($) => $.door.main }, (j) =>
		j.when('shown', { path: (v: Door) => v.line, truthy: true }, (k) =>
			textPart(k, w, 'line', ($) => $.channel.story.door.main, 'line', 'The table line').outlet(
				'write',
				($) =>
					C.createMessage.v1({
						text: $.line.text,
						channel: TABLE_CHANNEL,
						// The row it belongs to: the Narrator's.
						tableLine: $.channel.story.placeholder.messageId as any,
					}),
				{ expose: { label: 'Show the rolls' } },
			),
		),
	)
	const kept = scriptStep(
		shown,
		w,
		'ledger',
		DUNGEON_CRAWLER_LEDGER_SCRIPT.seedKey,
		($) => ({
			session: $.input.session,
			books: $.books.main,
			turn: $.turn.main,
			door: $.door.main,
			applied: applied($.rolled.planned.apply),
			after: $.rolled.planned.after.state,
			state: $.state.state,
			row: $.placeholder.messageId,
		}),
		'Keep the books',
		STORY_STATUS.books,
	)
	/**
	 * A level's new full health, FIRST: each seat's hp max raised (one stat
	 * configuration a seat) before the round's changes, which may lift its
	 * health past the old one. Filed at the Narrator's row, as the changes are.
	 */
	const raised = kept.junction('raise', { on: ($) => $.ledger.main }, (j) =>
		j.when('levels', { path: (v: Ledger) => v.raises, truthy: true }, (k) =>
			jsonPart(k, w, 'list', ($) => $.channel.story.ledger.main, 'raises', 'What the levels raise').each(
				'seat',
				{ over: ($) => $.list.main, max: 8 },
				(m) =>
					textPart(
						jsonPart(jsonPart(m, w, 'owner', ($) => $[ITEM], 'owner', 'Whose'), w, 'config', ($) => $[ITEM], 'config', 'Their new most'),
						w,
						'slot',
						($) => $[ITEM],
						'slot',
						'Which stat',
					).outlet(
						'write',
						($) =>
							C.setStatConfig.v1({
								owner: $.owner.main,
								// 🚧 The raise names its stat (Q1-6): full health, or a spell-point pool.
								slot: $.slot.text,
								config: $.config.main,
								worldRow: $.channel.story.placeholder.messageId,
							}),
						{ expose: { label: 'Raise a most' } },
					),
			),
		),
	)
	const written = raised.junction('sheet', { on: ($) => $.ledger.main }, (j) =>
		j
			.when('changed', { path: (v: Ledger) => v.changes, truthy: true }, (k) => {
				w.params.push([on(k, 'apply'), { mode: 'apply' }])
				/**
				 * The state's version NOW, after the rules' apply: the books
				 * computed these changes from the state the deltas left, so they
				 * rebase on it — on the turn's opening version, a change to a
				 * slot the deltas had touched (death's door's 1 health over the
				 * blow's 0, a level's new health) was refused as stale and
				 * never landed.
				 */
				return jsonPart(k, w, 'changes', ($) => $.channel.story.ledger.main, 'changes', "The round's changes")
					.query('now', ($) => C.sessionState.v1({ scope: $.input.sessionScope }), {
						expose: { label: 'The sheet as the rules left it' },
					})
					.query('resolve', ($) =>
						C.resolveStateChanges.v1({
							changes: $.changes.main,
							scope: $.input.sessionScope,
							base: $.now.version,
						}),
					)
					.task(
						'apply',
						($) =>
							C.setState.v1({
								changes: $.resolve.changes,
								scope: $.input.sessionScope,
								base: $.now.version,
								worldRow: $.channel.story.placeholder.messageId,
								params: slot.params(),
							}),
						{ expose: { label: "Write the round's changes" } },
					)
			})
			.when('noted', { path: (v: Ledger) => v.notes, truthy: true }, (k) =>
				textPart(k, w, 'notes', ($) => $.channel.story.ledger.main, 'notes', "The Planner's notes").outlet(
					'write',
					($) =>
						C.setSessionAnnex.v1({
							value: { [K.planningNotes]: $.notes.text } as any,
							params: slot.params(),
						}),
					{ expose: { label: "Keep the Planner's notes" } },
				),
			)
			/** 🚧 The notes once out: the revealed copy follows the rewrite (AUDIT A24). */
			.when('revealed', { path: (v: Ledger) => v.notesRevealed, truthy: true }, (k) =>
				textPart(k, w, 'notes', ($) => $.channel.story.ledger.main, 'notesRevealed', 'The notes, as revealed — the round').outlet(
					'write',
					($) =>
						C.setSessionAnnex.v1({
							value: { [K.planningNotesRevealed]: $.notes.text } as any,
							params: slot.params(),
						}),
					{ expose: { label: 'Keep the revealed notes in step — the round' } },
				),
			),
	)
	/**
	 * 🚧 The turn's time passed under the rules (AUDIT A4): the handler's
	 * **advance** with the turn's minutes, after the round's changes — what
	 * wears off (a condition's duration), what recharges — for the owners the
	 * turn resolved. Rest was once the only thing that ticked a duration.
	 */
	const advanced = written.junction('time', { on: ($) => $.ledger.main }, (j) =>
		j.when('passed', { path: (v: Ledger) => v.advance, truthy: true }, (k) =>
			jsonPart(k, w, 'elapsed', ($) => $.channel.story.ledger.main, 'advance', "The turn's minutes").task(
				'advance',
				($) =>
					C.rulesetResolve.v1({
						params: slot.params(),
						scope: $.input.sessionScope,
						owners: $.channel.story.owners.main,
						rigour: $.channel.story.rigour.text,
						mode: 'advance',
						elapsed: $.elapsed.main,
					}),
				{ expose: { label: "Pass the turn's time under the rules", status: STORY_STATUS.books } },
			),
		),
	)
	/**
	 * A swipe's re-filing (the host took back what the turn wrote at its row):
	 * the deltas that need no roll, applied again by the handler.
	 */
	const replayed = advanced.junction('replay', { on: ($) => $.ledger.main }, (j) =>
		j.when('deltas', { path: (v: Ledger) => v.replay, truthy: true }, (k) =>
			jsonPart(k, w, 'list', ($) => $.channel.story.ledger.main, 'replay', 'The deltas filed again').task(
				'apply',
				($) =>
					C.rulesetResolve.v1({
						params: slot.params(),
						// The turn's owners: a way crossed may be a place nobody stands in (P1-4).
						owners: $.channel.story.turnOwners.main,
						deltas: $.list.main,
						scope: $.input.sessionScope,
						rigour: $.channel.story.rigour.text,
						mode: 'apply',
					}),
				{ expose: { label: 'File the rules again' } },
			),
		),
	)
	// The world the turn moved: new places, ways out, people and cairns, in
	// the session's own lorebook, each anchored to the turn's row (`lore.ts`).
	const worlded = loreWrites(replayed, w, ($) => $.channel.story.ledger.main)
	const filed = worlded.junction('filed', { on: ($) => $.ledger.main }, (j) =>
		j.when('kept', { path: (v: Ledger) => v.progress, truthy: true }, (k) =>
			jsonPart(
				jsonPart(k, w, 'progress', ($) => $.channel.story.ledger.main, 'progress', 'The crawl, after the round'),
				w,
				'journal',
				($) => $.channel.story.ledger.main,
				'journal',
				'The journal, after the round',
			).outlet(
				'write',
				($) =>
					C.setSessionAnnex.v1({
						value: {
							[K.progress]: $.progress.main,
							[K.journal]: $.journal.main,
						} as any,
						params: slot.params(),
					}),
				{ expose: { label: 'File the crawl and the journal' } },
			),
		),
	)
	w.prompts.push([on(filed, 'context'), DUNGEON_CRAWLER_PROMPT_KEYS.narrate])
	// 🚧 The outcomes and the reminder are the last user turn, the seed after
	// them (owner ruling 2026-10-18, B1: the shipped layout sent them as a
	// trailing system message).
	w.templates.push([on(filed, 'prompt'), DUNGEON_CRAWLER_NARRATE_TEMPLATE])
	// The Narrator's steps all say the Narrator's word (not the handlers'
	// generic *{speaker} is composing*).
	const telling = { expose: { status: STORY_STATUS.telling } }
	const told = jsonPart(
		textPart(filed, w, 'narration', ($) => $.ledger.main, 'brief', "The Narrator's brief"),
		w,
		'outcomes',
		($) => $.ledger.main,
		'narrator',
		'The outcomes, after the history',
	)
		.task('context', ($) =>
			C.buildTemplateContext.v1({
				cast: $.cast.cast as any,
				speaker: NARRATOR as any,
				turnDirection: $.narration.text,
				// 🚧 `{{outcomes}}` (PLAN-rulesets §30 amendment): what the rules
				// decided and what it cost, placed by the prompt row after the
				// history — never in the system block.
				fields: $.outcomes.main,
				prompts: slot.prompts(),
				variables: slot.variables(),
			}),
			telling,
		)
		.task(
			'lines',
			($) =>
				C.processMessages.v1({
					messages: $.story.messages as any,
					cast: $.cast.cast as any,
					templateContext: $.context.templateContext,
					seedName: $.context.seedName,
					continuationPrefill: $.input.continuationPrefill,
				}),
			telling,
		)
		.task('prompt', ($) =>
			C.assemble.v2({
				messages: $.lines.messages,
				templateContext: $.context.templateContext,
				template: slot.template(),
				prompts: slot.prompts($.context),
				variables: slot.variables(),
				params: slot.params(),
				connection: slot.connectionOf(sibling($.context, 'say')),
			}),
			telling,
		)
		.oracle(
			'say',
			($) =>
				C.generateText.v1({
					context: $.prompt.context,
					connection: slot.connection(),
					sampling: slot.sampling(),
					params: slot.params(),
					// 🚧 O7: the voice a spoken reply speaks in, when `outputs` ask for audio.
					speechSampling: slot.speechSampling(),
				}),
			{
				expose: {
					stream: true,
					status: STORY_STATUS.telling,
					label: 'Narrator',
					purpose: 'Tells the round on the Story from the Planner’s brief and the dice. Never decides what your character does, says or feels.',
				},
			},
		)
		.outlet(
			'save',
			($) =>
				C.updateMessage.v1({
					target: $.placeholder.messageId,
					text: $.say.text,
					reasoning: $.say.reasoning,
				}),
			{ expose: { label: "Fill the Narrator's line" } },
		)
	return told.junction('after', { on: ($) => $.ledger.main }, (j) =>
		j
			// The round's journal lines, each with its kind (§16), on the folio.
			.when('journal', { path: (v: Ledger) => v.journalLines, truthy: true }, (k) => journalWrites(k, w))
			// Secrets for one player go to that player's lane (feature 18, `secrets.ts`).
			.when('secrets', { path: (v: Ledger) => v.secrets, truthy: true }, (k) =>
				deliverSecrets(jsonPart(k, w, 'list', ($) => $.channel.story.ledger.main, 'secrets', "The round's secrets"), w, {
					session: ($) => $.input.session,
					secrets: ($) => $.list.main,
				}),
			)
			.when('lanes', { path: (v: Ledger) => v.laneLines, truthy: true }, (k) =>
				jsonPart(k, w, 'list', ($) => $.channel.story.ledger.main, 'laneLines', "The Planner's lines in the lanes").each(
					'line',
					{ over: ($) => $.list.main, max: 16 },
					(m) =>
						jsonPart(
							textPart(textPart(m, w, 'lane', ($) => $[ITEM], 'lane', 'Which lane'), w, 'text', ($) => $[ITEM], 'text', "The Planner's line"),
							w,
							'blocks',
							($) => $[ITEM],
							'blocks',
							"The line's form",
						).outlet(
							'write',
							($) =>
								C.createMessage.v1({
									text: $.text.text,
									channel: $.lane.text,
									speaker: PLANNER as any,
									blocks: $.blocks.main,
								}),
							{ expose: { label: "Say the Planner's line in a lane" } },
						),
				),
			),
	)
}
