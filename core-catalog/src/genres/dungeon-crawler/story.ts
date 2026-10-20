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
 *  3. `plan.fresh.*` — the Planner (`DUNGEON_CRAWLER_TURN_SCHEMA`: its
 *     **deltas**, the world moving with each place's ways out inside it, the
 *     brief), checked ONCE by `core:script/dungeon-crawler-plan`; unusable →
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

import { slot } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import { DUNGEON_CRAWLER_PROMPT_KEYS } from '../../seed/prompts.js'
import { DUNGEON_CRAWLER_ANNEX_KEYS as K, DUNGEON_CRAWLER_SECRETS_SCHEMA, TRAVELOGUE_CHANNEL } from './names.js'
import { NARRATOR } from './genesis.js'
import { DUNGEON_CRAWLER_EPOCH, PLANNER } from './create.js'
import { DUNGEON_CRAWLER_DOOR_SCRIPT } from './dice.js'
import { DUNGEON_CRAWLER_DEATH_JS } from './death.js'
import { DUNGEON_CRAWLER_GOAL_JS } from './goal.js'
import { DUNGEON_CRAWLER_JOURNAL_JS, journalWrites } from './journal.js'
import { DUNGEON_CRAWLER_ENTRY_TYPES, DUNGEON_CRAWLER_ROOM_SCHEMA, DUNGEON_CRAWLER_WORDS_ROOM_SCHEMA, DUNGEON_CRAWLER_WORLD_WRITES_JS, loreWrites } from './lore.js'
import { deliverSecrets } from './secrets.js'
import {
	DUNGEON_CRAWLER_CRIB_ROUNDS,
	DUNGEON_CRAWLER_DELTA_OPS,
	DUNGEON_CRAWLER_NOT_FOR_DELTAS,
	DUNGEON_CRAWLER_STORY_PREAMBLE,
	storySeed,
} from './storyScripts.js'
import { at, DUNGEON_CRAWLER_NARRATE_TEMPLATE, jsonPart, modelCall, scriptStep, textPart, type Wiring } from './calls.js'
import { characterClassSlot, hpSlot, levelSlot, locationSlot } from '../../registry/slots.js'
import { TABLE_CHANNEL } from '../../shared/ui/conversation/tableChannel.js'
import { VIS_ITINERIS_OWN_SLOTS, VIS_ITINERIS_REPERTOIRES, VIS_ITINERIS_SELECTORS } from '../../rulesets/vis-itineris/index.js'
import { DUNGEON_CRAWLER_CONDITION_NAMES, DUNGEON_CRAWLER_CONDITION_ROWS, DUNGEON_CRAWLER_REPERTOIRE_SLOTS } from './sheet.js'

/** A slot id's bare key — what a delta names it by (`core:slot/hp@1` → `hp`). */
const keyOf = (id: string) => id.replace(/^[^/]*\//, '').replace(/@\d+$/, '')

/**
 * 🚧 One **delta** a story turn's Planner may propose — generated from
 * Vis Itineris's declaration (the genre's recommended ruleset, PLAN-rulesets §13)
 * and the genre's own fields, so the model's grammar knows every name the
 * handler accepts:
 *
 *  - `slot` — a field changed by an amount (`add`, `spend`) or set (`set`):
 *    Vis Itineris's stats and the genre's `location`; never the standing order,
 *    the fate, the clock or the table's rules
 *    (`DUNGEON_CRAWLER_NOT_FOR_DELTAS`);
 *  - `repertoire` — a piece gained, lost or used (`add`, `remove`, `spend`)
 *    in one of the repertoires the genre's sheet holds on a character
 *    (`sheet.ts`), `piece` naming it (a compendium id, or a name; a spell
 *    slot by its level). Never `exits`: a way out is written inside its
 *    place (`world.rooms[].exits`, AUDIT A12 — one exit model, `lore.ts`);
 *  - `check` — the model **asks for a check** (`hit`, `use`, `traverse`;
 *    `against` its difficulty): the handler rolls it, and a piece's effects
 *    land only on a success. A failed check applies nothing;
 *  - 🚧 `aimedAt` — who a `hit` or a `use` is aimed at (2026-10-18, owner
 *    ruling ★4): the handler rolls the weapon's damage, a draught's healing,
 *    an antitoxin's cure on them — a reference from the round's list, else a
 *    foe by name (told, kept on no sheet). Empty: a heal lands on the user, a
 *    blow on nobody.
 *
 * Every member is required (the grammar-compiling families); empty text and
 * `0` say "none".
 * @experimental
 */
export const DUNGEON_CRAWLER_DELTA_SCHEMA = Object.freeze({
	type: 'object',
	properties: {
		owner: { type: 'string', description: "Whose: a reference from this round's list, a place's, or world." },
		op: { type: 'string', enum: [...DUNGEON_CRAWLER_DELTA_OPS] },
		slot: {
			type: 'string',
			enum: [
				'',
				...new Set(
					[hpSlot.id, levelSlot.id, characterClassSlot.id, locationSlot.id, ...VIS_ITINERIS_OWN_SLOTS.map((s) => s.id)]
						.map(keyOf)
						.filter((k) => !(DUNGEON_CRAWLER_NOT_FOR_DELTAS as readonly string[]).includes(k)),
				),
			],
		},
		repertoire: {
			type: 'string',
			enum: [
				'',
				...VIS_ITINERIS_REPERTOIRES.map((r) => r.id).filter((id) => id in DUNGEON_CRAWLER_REPERTOIRE_SLOTS && id !== 'exits'),
			],
		},
		piece: { type: 'string', description: 'A piece: its compendium id or its name; a spell slot by its level. Empty when none.' },
		value: { type: 'string', description: 'An amount (add, spend), or the new value (set). Empty when none.' },
		check: {
			type: 'string',
			enum: ['', ...Object.entries(VIS_ITINERIS_SELECTORS).filter(([, d]) => d.kind === 'check').map(([k]) => k)],
		},
		against: { type: 'integer', description: 'The difficulty a check is against; 0 when none.' },
		aimedAt: {
			type: 'string',
			description: "hit or use: who it is aimed at — a reference from this round's list, or a foe by name. Empty when none.",
		},
		reason: { type: 'string' },
	},
	required: ['owner', 'op', 'slot', 'repertoire', 'piece', 'value', 'check', 'against', 'aimedAt', 'reason'],
	additionalProperties: false,
})

/**
 * What the Planner answers a story turn with (≤600 tokens, the prompt says):
 * its **deltas** for the handler (`DUNGEON_CRAWLER_DELTA_SCHEMA`), the world
 * moving (places found or changed with their ways out inside them, new
 * people, the open leads, the goal's progress, its notes), the turn's
 * minutes, the Narrator's brief, the round's summary and the secrets. Who
 * stands at death's door is not the Planner's to say (AUDIT A7): every seat
 * the turn leaves at 0 health rolls, and no other.
 * @experimental
 */
export const DUNGEON_CRAWLER_TURN_SCHEMA = {
	type: 'object',
	properties: {
		deltas: { type: 'array', maxItems: 16, items: DUNGEON_CRAWLER_DELTA_SCHEMA },
		world: {
			type: 'object',
			properties: {
				rooms: { type: 'array', maxItems: 6, items: DUNGEON_CRAWLER_ROOM_SCHEMA },
				npcs: {
					type: 'array',
					maxItems: 6,
					items: {
						type: 'object',
						properties: { name: { type: 'string' }, description: { type: 'string' }, mood: { type: 'string' } },
						required: ['name', 'description', 'mood'],
						additionalProperties: false,
					},
				},
				leads: {
					type: 'array',
					maxItems: 6,
					description: 'Open leads: short hooks the party could follow, never what happened.',
					items: { type: 'string' },
				},
				goalProgress: { type: 'string', enum: ['none', 'closer', 'reached'] },
				notes: { type: 'string' },
			},
			required: ['rooms', 'npcs', 'leads', 'goalProgress', 'notes'],
			additionalProperties: false,
		},
		clock: {
			type: 'object',
			properties: { minutes: { type: 'integer' } },
			required: ['minutes'],
			additionalProperties: false,
		},
		narratorBrief: { type: 'string' },
		roundSummary: { type: 'string' },
		secrets: DUNGEON_CRAWLER_SECRETS_SCHEMA,
	},
	required: ['deltas', 'world', 'clock', 'narratorBrief', 'roundSummary', 'secrets'],
	additionalProperties: false,
} as const

/**
 * 🚧 A delta at a table that keeps no numbers (PLAN-dc-after-walk2 Q2-3,
 * owner ruling ★3): nothing is rolled, so no `check`, no difficulty to beat
 * (`against`) and no aim (`aimedAt`), and no op that asks for a roll (`hit`,
 * `traverse`) — a fight or a lock is told in the brief, its cost a change.
 * Fields a table of words does not keep (level, Vis Itineris's own stats)
 * are not offered either. @experimental
 */
export const DUNGEON_CRAWLER_WORDS_DELTA_SCHEMA = Object.freeze({
	type: 'object',
	properties: {
		...Object.fromEntries(
			Object.entries(DUNGEON_CRAWLER_DELTA_SCHEMA.properties).filter(([k]) => k !== 'check' && k !== 'against' && k !== 'aimedAt'),
		),
		op: { type: 'string', enum: DUNGEON_CRAWLER_DELTA_OPS.filter((o) => o !== 'hit' && o !== 'traverse') },
		slot: { type: 'string', enum: ['', ...[hpSlot.id, characterClassSlot.id, locationSlot.id].map(keyOf)] },
	},
	required: DUNGEON_CRAWLER_DELTA_SCHEMA.required.filter((k) => k !== 'check' && k !== 'against' && k !== 'aimedAt'),
	additionalProperties: false,
})

/** 🚧 What the Planner answers at a table that keeps no numbers (Q2-3): the same books, in words. @experimental */
export const DUNGEON_CRAWLER_WORDS_TURN_SCHEMA = {
	...DUNGEON_CRAWLER_TURN_SCHEMA,
	properties: {
		...DUNGEON_CRAWLER_TURN_SCHEMA.properties,
		deltas: { type: 'array', maxItems: 16, items: DUNGEON_CRAWLER_WORDS_DELTA_SCHEMA },
		world: {
			...DUNGEON_CRAWLER_TURN_SCHEMA.properties.world,
			properties: {
				...DUNGEON_CRAWLER_TURN_SCHEMA.properties.world.properties,
				rooms: { type: 'array', maxItems: 6, items: DUNGEON_CRAWLER_WORDS_ROOM_SCHEMA },
			},
		},
	},
} as const

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
 *  - 🚧 `ruleset` — the turn's ruleset (`{ id, rigour, settings }`, the
 *    inlet's), and from it `kit` (the session plays the ruleset the kits'
 *    pieces come from, Vis Itineris), `casting` (`slots` · `points`, P2-4),
 *    `deathSaves` (Vis Itineris's _At zero health: Death saves_, ★7) and
 *    `rulesetRigour` — whether numbers count on a round that applied no
 *    change (the handler's facts say so only when it ran).
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
	// 🚧 Which shape the Planner plans in (Q2-3, ★3): a table on the kits'
	// ruleset counts; any other keeps words.
	planCounted: !redo && !progress.ended && rs.kit, planWords: !redo && !progress.ended && !rs.kit,
	told: redo ? {
		brief: text(last.brief), outcomes: text(last.outcomes),
		changes: Array.isArray(last.changes) && last.changes.length ? last.changes : null,
		raises: Array.isArray(last.raises) && last.raises.length ? last.raises : null,
		replay: Array.isArray(last.replay) && last.replay.length ? last.replay : null
	} : null,
	base: { progress: progress, journal: journal },
	owners: owners, actions: actions, rigour: text(doc.rigour),
	kit: rs.kit, casting: rs.casting, deathSaves: rs.deathSaves, rulesetRigour: rs.rigour,
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
 * prompt's ruleset-dependent sentences (2026-10-18, P2-1, P2-4, P2-6):
 * `piecesLine` (what a delta's repertoire and piece say), `conditionsLine`,
 * `castingLine` (what a spell costs: a slot, spell points, or — off the kit's
 * ruleset — nothing said) and `effectsLine` (weapons, draughts and spells do
 * what they say: never a hand-written health change). Under the Story
 * ruleset none of them names Vis Itineris's vocabulary (★10). 🚧 And
 * `wordsOnly` ("yes" under the Freeform ruleset, R2-3): the prompt's words
 * variant of the deltas and the ways out.
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
var kitRules = bk.kit !== false;
var byPoints = kitRules && bk.casting === "points";
// Under spell points no seat holds slots: the sheet's pool says what is left.
if (byPoints) slotLines = [];
var CONDITION_NAMES = ${JSON.stringify(DUNGEON_CRAWLER_CONDITION_NAMES.join(', '))};
var piecesLine = kitRules
	? "repertoire: weapons, armour, gear, consumables, spells, " + (byPoints ? "" : "spell-slots, ") + "features or conditions when a piece is gained, lost or used, else empty; piece: the piece by its id or name" + (byPoints ? "" : " — a spell slot by its level (1) —") + " or empty"
	: "repertoire: the list it is kept on — weapons, armour, gear, consumables, spells, features or conditions — when a thing is gained, lost or used up, else empty; piece: its name in plain words, or empty";
var conditionsLine = kitRules
	? "When something poisons, knocks down, frightens or binds someone, add that condition (repertoire conditions; piece one of: " + CONDITION_NAMES + "); remove it when it passes."
	: "When something poisons, knocks down, frightens or binds someone, add it as a condition in a word or two (repertoire conditions); remove it when it passes.";
var castingLine = !kitRules ? "" : byPoints
	? "When someone casts a spell of level 1 or higher, spend the spell (repertoire spells, op spend, piece the spell's name): it costs its level in spell points, and with too few points left it cannot be cast."
	: "When someone casts a spell of level 1 or higher, spend a slot of that level (repertoire spell-slots, op spend, piece the level); with none left at that level, the spell cannot be cast.";
// 🚧 Owner ruling ★4 (P2-1): the table executes what a piece does.
var effectsLine = !kitRules ? "" : counted
	? "Weapons, draughts and spells do what they say when used, so never add a health change for them yourself: a blow with a weapon is op hit (piece the weapon, check attack.melee or attack.ranged, against the foe's armour, aimedAt who is struck), and the table rolls its damage on a hit; a draught drunk, a flask thrown or a spell's effect is op use (piece it, aimedAt who it is for — empty for oneself), which heals, harms or cures by itself, and a draught or flask is used up."
	: "A draught drunk or a flask thrown is used up (op spend, repertoire consumables); what it does to someone's health is a change by an amount.";
return {
	rulesetVoice: blockText(blocks.voice),
	rulesetSheet: slotLines.length ? (sheetText ? sheetText + "\\n" : "") + slotLines.join("\\n") : sheetText,
	piecesLine: piecesLine, conditionsLine: conditionsLine, castingLine: castingLine, effectsLine: effectsLine,
	rulesetPieces: blockText(blocks.pieces),
	rulesetTies: blockText(blocks.ties),
	rigourLine: counted
		? "The table rolls the dice, never you. Propose deltas, never totals: a check for anything risky (op hit, use or traverse, with the check and the difficulty it is against), a change by an amount (add, spend), a piece gained, lost or used (add, remove, spend). A failed check changes nothing by itself: say what it costs in the brief."
		: "Nothing is rolled at this table, and no number is ever told. Propose no checks: what happens follows from what the scene makes likely. A change by an amount is still kept for you (add, spend), never a total; a piece gained, lost or used is add, remove or spend; anything else changes in words (op set, the new value in words).",
	// The prompts' \`{{#if diceRolled}}\`: at \`prose\` no word of dice (walk 6, 2026-10-17).
	diceRolled: counted ? "yes" : "",
	// 🚧 \`{{#if wordsOnly}}\`: a table that keeps no numbers (the Story ruleset,
	// PLAN-dc-after-walk3 R2-3, the walk's NEW-6) — its shape carries no check,
	// no difficulty and no aim, a way out no lock or trap difficulty, and
	// nobody "falls to 0 health": the books prompt says none of them.
	wordsOnly: kitRules ? "" : "yes"
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
var CONDITION_ROWS = ${JSON.stringify(DUNGEON_CRAWLER_CONDITION_ROWS)};
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
	// 🚧 A condition at a table of words (Story, Q2-3): written as its words
	// alone — "Poisoned: sick and shaky" — never the kits' rule for it.
	if (b.kit === false && dl.repertoire === "conditions" && dl.op === "add" && typeof dl.piece === "string") {
		var crow = CONDITION_ROWS[dl.piece] || CONDITION_ROWS[text(dl.piece).toLowerCase()];
		if (crow && crow.gloss) dl.piece = { kind: "inline", name: crow.name, description: crow.gloss };
	}
	// An unchecked use off the kit's ruleset (Story): the piece used up, in
	// words. On the kit's ruleset the handler executes the use itself.
	if (dl.op === "use" && !text(dl.check) && b.kit === false) {
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

// A level the handler applied raises the seat's full health by HP_PER_LEVEL a
// level: its hp max, a stat configuration (\`raises\`, written before the
// changes, at this row) — and its health by as much.
var raises = [];
for (var lu = 0; lu < seats.length; lu++) {
	var was = seats[lu], is = nowOf(seats[lu].ref);
	if (!is || was.fate === "dead" || was.maxHp === null) continue;
	var gained = Math.max(1, Math.round(num(is.level, was.level))) - was.level;
	if (gained <= 0) continue;
	var top = was.maxHp + gained * HP_PER_LEVEL;
	raises.push({ owner: was.ref, slot: SL.hp, config: { max: top } });
	// 🚧 …and at a spell-points table the pool's most with it (Q1-6): Vis
	// Itineris's one pool rule, the seat's own ceiling on its sheet.
	if (b.casting === "points") raises.push({ owner: was.ref, slot: POINTS_SLOT, config: { max: spellPointsFor(was["class"], Math.round(num(is.level, was.level))) } });
	changes.push({ owner: was.ref, slot: SL.hp, value: Math.min(top, (is.hp === null ? was.maxHp : is.hp) + gained * HP_PER_LEVEL) });
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

/**
 * What a story turn reads, handed down by the respond spec. The fallen and
 * the Journal folio are the story turn's own reads (`channel.story.fallen`,
 * `channel.story.log`): the Planner's talk never needed them (AUDIT C7).
 * @internal
 */
export interface StoryTerms {
	cast: ($: any) => unknown
	history: ($: any) => unknown
	/** `core:query/lorebook-entries@1` — the places, with their links. */
	places: ($: any) => unknown
	/** `core:query/lorebook-entries@1` — the people. */
	people: ($: any) => unknown
}

/**
 * The `channel.story` branch (see the header). `terms` hands it the spec's
 * reads: the cast, the Story's newest rows, the session's lorebook and the
 * Journal folio.
 * @internal
 */
export const storyBranch = (s: any, w: Wiring, terms: StoryTerms) => {
	const P = 'channel.story.'
	const F = `${P}plan.fresh.`
	const R = `${P}rolled.planned.`
	const books = ($: any) => at($, `${P}books`).main
	const ledger = ($: any) => at($, `${P}ledger`).main
	const turn = ($: any) => at($, `${P}turn`).main
	const door = ($: any) => at($, `${P}door`).main
	/** 🚧 The words branch's prefix (Q2-3): a table that keeps no numbers plans in a shape with none. */
	const W = `${P}plan.words.`
	const planner = (label: string, purpose: string, at0: string = F, schema: object = DUNGEON_CRAWLER_TURN_SCHEMA) => ({
		speaker: PLANNER,
		prompt: DUNGEON_CRAWLER_PROMPT_KEYS.turn,
		brief: ($: any) => at($, `${P}brief`).text,
		crib: ($: any) => at($, `${P}crib`).text,
		fields: ($: any) => at($, `${at0}fields`).main,
		cast: terms.cast,
		history: terms.history,
		schema,
		// 🚧 The round is the call's last user turn (owner ruling 2026-10-18):
		// on a round nobody spoke in, the shipped layout ended the prompt on
		// the Narrator's last line, and a strict chat model answered nothing.
		briefTurn: true,
		expose: { status: STORY_STATUS.planning, label, purpose },
	})
	const fallen = ($: any) => at($, `${P}fallen`).entries
	const log = ($: any) => at($, `${P}log`).messages
	// 🚧 An empty plan is an unreadable one (the 100-turn walk, B7): asked once
	// more, then the Narrator goes on alone — never a turn failed on it.
	w.params.push([`${F}planWrite`, { emptyIsUnreadable: true }])
	w.params.push([`${F}again.retry.replanWrite`, { emptyIsUnreadable: true }])
	w.params.push([`${W}planWrite`, { emptyIsUnreadable: true }])
	w.params.push([`${W}again.retry.replanWrite`, { emptyIsUnreadable: true }])
	w.params.push([`${P}fallen`, { entryTypes: [DUNGEON_CRAWLER_ENTRY_TYPES.fallen] }])
	w.params.push([`${P}log`, { channel: TRAVELOGUE_CHANNEL, limit: DUNGEON_CRAWLER_CRIB_ROUNDS }])
	const reads = s
		.query('fallen', ($: any) => C.lorebookEntries.v1({ scope: $.input.sessionScope, params: slot.params() }), {
			expose: { label: 'The fallen', status: STORY_STATUS.planning },
		})
		.query('log', ($: any) => C.sessionHistory.v1({ scope: $.input.sessionScope, params: slot.params() }), {
			expose: { label: 'The journal so far', status: STORY_STATUS.planning },
		})
	const readActions = jsonPart(
		jsonPart(
			textPart(
				textPart(
					scriptStep(reads, w, P, 'books', DUNGEON_CRAWLER_BOOKS_SCRIPT.seedKey, ($) => ({
						session: $.input.session,
						state: $.state.state,
						story: terms.history($),
						messageId: $.input.messageId,
						places: terms.places($),
						people: terms.people($),
						fallen: fallen($),
						log: log($),
						// 🚧 The ruleset the session plays and its settings (P2-4, P2-6).
						ruleset: $.input.ruleset,
					}), "Open the Planner's books", STORY_STATUS.planning),
					w,
					P,
					'crib',
					books,
					'crib',
					"The Planner's crib, as text",
				),
				w,
				P,
				'brief',
				books,
				'brief',
				'This round, as text',
			),
			w,
			P,
			'owners',
			books,
			'owners',
			'Whose rules are read',
		),
		w,
		P,
		'actions',
		books,
		'actions',
		'What each one does',
	)
	// The session's rigour, handed to the handler as the session holds it
	// (empty: the handler reads the stored rigour itself).
	const read = textPart(readActions, w, P, 'rigour', books, 'rigour', 'How strictly the table plays')
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
		($: any) =>
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
	// `tag` tells the two placements apart in the panel: a reading lists each
	// group and step heading once per spec (groups.int: no two alike).
	const planIn = (f: any, at0: string, schema: object, tag: string) => {
		/**
		 * The ruleset's **resolve** (PLAN-rulesets §25): the labelled blocks
		 * for this round's owners and actions, at the session's rigour — no
		 * dice, no writes.
		 */
		const resolved = f.task(
			'resolve',
			($: any) =>
				C.rulesetResolve.v1({
					scope: $.input.sessionScope,
					owners: at($, `${P}owners`).main,
					actions: at($, `${P}actions`).main,
					rigour: at($, `${P}rigour`).text,
					mode: 'resolve',
				}),
			{ expose: { label: "Read the table's rules", status: STORY_STATUS.planning } },
		)
			/**
			 * The blocks fitted to the Planner's window (W3-S): under
			 * pressure a block steps down a depth before any is dropped.
			 * Sized against the Planner's own model and sampling.
			 */
			.task(
				'budget',
				($: any) =>
					C.contextBudget.v1({
						blocks: at($, `${at0}resolve`).blocks,
						sampling: slot.samplingOf(`${at0}planWrite`),
						connection: slot.connectionOf(`${at0}planWrite`),
						params: slot.params(),
					}),
				{ expose: { label: `Fit the rules to the Planner's window${tag}`, status: STORY_STATUS.planning } },
			)
		const named = scriptStep(resolved, w, at0, 'fields', DUNGEON_CRAWLER_RULESET_FIELDS_SCRIPT.seedKey, ($) => ({
			blocks: at($, `${at0}budget`).fittedBlocks,
			facts: at($, `${at0}resolve`).facts,
			// 🚧 The seats and the state: each seat's spell slots left (P1-8).
			books: books($),
			state: $.state.state,
		}), `The rules, for the Planner${tag}`, STORY_STATUS.planning)
		const asked = modelCall(
			named,
			w,
			at0,
			'plan',
			planner(
				`Planner${tag}`,
				'Decides, out of sight, what your actions cost and what the world does: the checks to roll, the changes to your sheet, the world moving.',
				at0,
				schema,
			),
		)
		return scriptStep(asked, w, at0, 'checked', DUNGEON_CRAWLER_PLAN_SCRIPT.seedKey, ($) => ({
			json: at($, `${at0}planWrite`).json,
		}), `Check the Planner's plan${tag}`).junction('again', { on: ($: any) => at($, `${at0}checked`).main }, (k: any) =>
			k.when('retry', { path: 'retry', truthy: true }, (r: any) =>
				modelCall(
					r,
					w,
					`${at0}again.retry.`,
					'replan',
					planner(
						`Planner, asked again${tag}`,
						'When the plan comes back unreadable, the Planner is asked once more before the Narrator goes on alone.',
						at0,
						schema,
					),
				),
			),
		)
	}
	const planned = opened.junction('plan', { on: books }, (j: any) =>
		j
			.when('fresh', { path: 'planCounted', truthy: true }, (f: any) => planIn(f, F, DUNGEON_CRAWLER_TURN_SCHEMA, ' (dice)'))
			.when('words', { path: 'planWords', truthy: true }, (f: any) => planIn(f, W, DUNGEON_CRAWLER_WORDS_TURN_SCHEMA, ' (words)')),
	)
	const chosen = scriptStep(planned, w, P, 'turn', DUNGEON_CRAWLER_TURN_SCRIPT.seedKey, ($) => ({
		// 🚧 The session: the companions an owner may name (P1-1, P3-9).
		session: $.input.session,
		books: books($),
		first: at($, `${F}checked`).main,
		again: at($, `${F}again.retry.replanWrite`).json,
		// 🚧 The words branch's answers (Q2-3): whichever branch ran.
		firstWords: at($, `${W}checked`).main,
		againWords: at($, `${W}again.retry.replanWrite`).json,
		state: $.state.state,
	}), 'The plan the turn runs on', STORY_STATUS.settling)
	/** 🚧 Whose rules the turn touches — the books' and every place a way out or a traverse lands on (P1-4). */
	const chosenOwners = jsonPart(chosen, w, P, 'turnOwners', turn, 'owners', 'Whose rules the turn touches')
	/**
	 * The ruleset's **apply** (PLAN-rulesets §25), the Narrator's row already
	 * open, so every write is anchored to it: the Planner's deltas validated,
	 * the checks it asked for rolled, the changes written through the state
	 * gate; then the state as the deltas left it.
	 */
	const rolled = chosenOwners.junction('rolled', { on: turn }, (j: any) =>
		j.when('planned', { path: 'deltas', truthy: true }, (k: any) =>
			jsonPart(jsonPart(k, w, R, 'deltas', turn, 'deltas', "The Planner's deltas"), w, R, 'owners', turn, 'owners', 'Whose rules the deltas touch')
				.task(
					'apply',
					($: any) =>
						C.rulesetResolve.v1({
							owners: at($, `${R}owners`).main,
							actions: at($, `${P}actions`).main,
							deltas: at($, `${R}deltas`).main,
							scope: $.input.sessionScope,
							rigour: at($, `${P}rigour`).text,
							mode: 'apply',
						}),
					{ expose: { label: 'Apply the rules', status: STORY_STATUS.settling } },
				)
				.query('after', ($: any) => C.sessionState.v1({ scope: $.input.sessionScope }), {
					expose: { label: 'The sheet after the rules' },
				}),
		),
	)
	const applied = ($: any) => ({
		blocks: at($, `${R}apply`).blocks,
		facts: at($, `${R}apply`).facts,
		outcomes: at($, `${R}apply`).outcomes,
		explain: at($, `${R}apply`).explain,
		rejected: at($, `${R}apply`).rejected,
	})
	const doored = scriptStep(rolled, w, P, 'door', DUNGEON_CRAWLER_DOOR_SCRIPT.seedKey, ($) => ({
		session: $.input.session,
		books: books($),
		turn: turn($),
		applied: applied($),
		after: at($, `${R}after`).state,
		state: $.state.state,
	}), "Death's door, and the table's line", STORY_STATUS.settling)
	/**
	 * 🚧 The table's line (PLAN-rulesets §30), anchored to the Narrator's row
	 * it belongs to — never on Story, whose history the Narrator and the
	 * Planner read. No speaker: the table speaks in no voice. A check's line
	 * ends with the handler's explain (how its number was reached).
	 */
	const shown = doored.junction('stakes', { on: door }, (j: any) =>
		j.when('shown', { path: 'line', truthy: true }, (k: any) =>
			textPart(k, w, `${P}stakes.shown.`, 'line', door, 'line', 'The table line').outlet(
				'write',
				($: any) =>
					C.createMessage.v1({
						text: at($, `${P}stakes.shown.line`).text,
						channel: TABLE_CHANNEL,
						// The row it belongs to: the Narrator's.
						tableLine: at($, `${P}placeholder`).messageId as any,
					}),
				{ expose: { label: 'Show the rolls' } },
			),
		),
	)
	const kept = scriptStep(
		shown,
		w,
		P,
		'ledger',
		DUNGEON_CRAWLER_LEDGER_SCRIPT.seedKey,
		($) => ({
			session: $.input.session,
			books: books($),
			turn: turn($),
			door: door($),
			applied: applied($),
			after: at($, `${R}after`).state,
			state: $.state.state,
			row: at($, `${P}placeholder`).messageId,
		}),
		'Keep the books',
		STORY_STATUS.books,
	)
	/**
	 * A level's new full health, FIRST: each seat's hp max raised (one stat
	 * configuration a seat) before the round's changes, which may lift its
	 * health past the old one. Filed at the Narrator's row, as the changes are.
	 */
	const raised = kept.junction('raise', { on: ledger }, (j: any) =>
		j.when('levels', { path: 'raises', truthy: true }, (k: any) =>
			jsonPart(k, w, `${P}raise.levels.`, 'list', ledger, 'raises', 'What the levels raise').each(
				'seat',
				{ over: ($: any) => at($, `${P}raise.levels.list`).main, max: 8 },
				(m: any) => {
					const M = `${P}raise.levels.seat.item.`
					const item = ($: any) => at($, `${P}raise.levels.seat.item`)
					return textPart(
						jsonPart(jsonPart(m, w, M, 'owner', item, 'owner', 'Whose'), w, M, 'config', item, 'config', 'Their new most'),
						w,
						M,
						'slot',
						item,
						'slot',
						'Which stat',
					).outlet(
						'write',
						($: any) =>
							C.setStatConfig.v1({
								owner: at($, `${M}owner`).main,
								// 🚧 The raise names its stat (Q1-6): full health, or a spell-point pool.
								slot: at($, `${M}slot`).text,
								config: at($, `${M}config`).main,
								worldRow: at($, `${P}placeholder`).messageId,
							}),
						{ expose: { label: 'Raise a most' } },
					)
				},
			),
		),
	)
	w.params.push([`${P}sheet.changed.apply`, { mode: 'apply' }])
	const written = raised.junction('sheet', { on: ledger }, (j: any) =>
		j
			.when('changed', { path: 'changes', truthy: true }, (k: any) => {
				const Q = `${P}sheet.changed.`
				/**
				 * The state's version NOW, after the rules' apply: the books
				 * computed these changes from the state the deltas left, so they
				 * rebase on it — on the turn's opening version, a change to a
				 * slot the deltas had touched (death's door's 1 health over the
				 * blow's 0, a level's new health) was refused as stale and
				 * never landed.
				 */
				return jsonPart(k, w, Q, 'changes', ledger, 'changes', "The round's changes")
					.query('now', ($: any) => C.sessionState.v1({ scope: $.input.sessionScope }), {
						expose: { label: 'The sheet as the rules left it' },
					})
					.query('resolve', ($: any) =>
						C.resolveStateChanges.v1({
							changes: at($, `${Q}changes`).main,
							scope: $.input.sessionScope,
							base: at($, `${Q}now`).version,
						}),
					)
					.task(
						'apply',
						($: any) =>
							C.setState.v1({
								changes: at($, `${Q}resolve`).changes,
								scope: $.input.sessionScope,
								base: at($, `${Q}now`).version,
								worldRow: at($, `${P}placeholder`).messageId,
								params: slot.params(),
							}),
						{ expose: { label: "Write the round's changes" } },
					)
			})
			.when('noted', { path: 'notes', truthy: true }, (k: any) =>
				textPart(k, w, `${P}sheet.noted.`, 'notes', ledger, 'notes', "The Planner's notes").outlet(
					'write',
					($: any) =>
						C.setSessionAnnex.v1({
							value: { [K.planningNotes]: at($, `${P}sheet.noted.notes`).text } as any,
							params: slot.params(),
						}),
					{ expose: { label: "Keep the Planner's notes" } },
				),
			)
			/** 🚧 The notes once out: the revealed copy follows the rewrite (AUDIT A24). */
			.when('revealed', { path: 'notesRevealed', truthy: true }, (k: any) =>
				textPart(k, w, `${P}sheet.revealed.`, 'notes', ledger, 'notesRevealed', 'The notes, as revealed — the round').outlet(
					'write',
					($: any) =>
						C.setSessionAnnex.v1({
							value: { [K.planningNotesRevealed]: at($, `${P}sheet.revealed.notes`).text } as any,
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
	const advanced = written.junction('time', { on: ledger }, (j: any) =>
		j.when('passed', { path: 'advance', truthy: true }, (k: any) =>
			jsonPart(k, w, `${P}time.passed.`, 'elapsed', ledger, 'advance', "The turn's minutes").task(
				'advance',
				($: any) =>
					C.rulesetResolve.v1({
						scope: $.input.sessionScope,
						owners: at($, `${P}owners`).main,
						rigour: at($, `${P}rigour`).text,
						mode: 'advance',
						elapsed: at($, `${P}time.passed.elapsed`).main,
					}),
				{ expose: { label: "Pass the turn's time under the rules", status: STORY_STATUS.books } },
			),
		),
	)
	/**
	 * A swipe's re-filing (the host took back what the turn wrote at its row):
	 * the deltas that need no roll, applied again by the handler.
	 */
	const replayed = advanced.junction('replay', { on: ledger }, (j: any) =>
		j.when('deltas', { path: 'replay', truthy: true }, (k: any) =>
			jsonPart(k, w, `${P}replay.deltas.`, 'list', ledger, 'replay', 'The deltas filed again').task(
				'apply',
				($: any) =>
					C.rulesetResolve.v1({
						// The turn's owners: a way crossed may be a place nobody stands in (P1-4).
						owners: at($, `${P}turnOwners`).main,
						deltas: at($, `${P}replay.deltas.list`).main,
						scope: $.input.sessionScope,
						rigour: at($, `${P}rigour`).text,
						mode: 'apply',
					}),
				{ expose: { label: 'File the rules again' } },
			),
		),
	)
	// The world the turn moved: new places, ways out, people and cairns, in
	// the session's own lorebook, each anchored to the turn's row (`lore.ts`).
	const worlded = loreWrites(replayed, w, P, ledger)
	const filed = worlded.junction('filed', { on: ledger }, (j: any) =>
		j.when('kept', { path: 'progress', truthy: true }, (k: any) =>
			jsonPart(
				jsonPart(k, w, `${P}filed.kept.`, 'progress', ledger, 'progress', 'The crawl, after the round'),
				w,
				`${P}filed.kept.`,
				'journal',
				ledger,
				'journal',
				'The journal, after the round',
			).outlet(
				'write',
				($: any) =>
					C.setSessionAnnex.v1({
						value: {
							[K.progress]: at($, `${P}filed.kept.progress`).main,
							[K.journal]: at($, `${P}filed.kept.journal`).main,
						} as any,
						params: slot.params(),
					}),
				{ expose: { label: 'File the crawl and the journal' } },
			),
		),
	)
	w.prompts.push([`${P}context`, DUNGEON_CRAWLER_PROMPT_KEYS.narrate])
	// 🚧 The outcomes and the reminder are the last user turn, the seed after
	// them (owner ruling 2026-10-18, B1: the shipped layout sent them as a
	// trailing system message).
	w.templates.push([`${P}prompt`, DUNGEON_CRAWLER_NARRATE_TEMPLATE])
	// The Narrator's steps all say the Narrator's word (not the handlers'
	// generic *{speaker} is composing*).
	const telling = { expose: { status: STORY_STATUS.telling } }
	const told = jsonPart(
		textPart(filed, w, P, 'narration', ledger, 'brief', "The Narrator's brief"),
		w,
		P,
		'outcomes',
		ledger,
		'narrator',
		'The outcomes, after the history',
	)
		.task('context', ($: any) =>
			C.buildTemplateContext.v1({
				cast: terms.cast($) as any,
				speaker: NARRATOR as any,
				turnDirection: at($, `${P}narration`).text,
				// 🚧 `{{outcomes}}` (PLAN-rulesets §30 amendment): what the rules
				// decided and what it cost, placed by the prompt row after the
				// history — never in the system block.
				fields: at($, `${P}outcomes`).main,
				prompts: slot.prompts(),
				variables: slot.variables(),
			}),
			telling,
		)
		.task(
			'lines',
			($: any) =>
				C.processMessages.v1({
					messages: terms.history($) as any,
					cast: terms.cast($) as any,
					templateContext: at($, `${P}context`).templateContext,
					seedName: at($, `${P}context`).seedName,
					continuationPrefill: $.input.continuationPrefill,
				}),
			telling,
		)
		.task('prompt', ($: any) =>
			C.assemble.v2({
				messages: at($, `${P}lines`).messages,
				templateContext: at($, `${P}context`).templateContext,
				template: slot.template(),
				prompts: slot.prompts({ node: `${P}context` }),
				variables: slot.variables(),
				params: slot.params(),
				connection: slot.connectionOf(`${P}say`),
			}),
			telling,
		)
		.oracle(
			'say',
			($: any) =>
				C.generateText.v1({
					context: at($, `${P}prompt`).context,
					connection: slot.connection(),
					sampling: slot.sampling(),
					params: slot.params(),
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
			($: any) =>
				C.updateMessage.v1({
					target: at($, `${P}placeholder`).messageId,
					text: at($, `${P}say`).text,
					reasoning: at($, `${P}say`).reasoning,
				}),
			{ expose: { label: "Fill the Narrator's line" } },
		)
	return told
		.junction('after', { on: ledger }, (j: any) =>
			j
				// The round's journal lines, each with its kind (§16), on the folio.
				.when('journal', { path: 'journalLines', truthy: true }, (k: any) =>
					journalWrites(k, w, `${P}after.journal.`, ledger, ($: any) => at($, `${P}placeholder`).messageId),
				)
				// Secrets for one player go to that player's lane (feature 18, `secrets.ts`).
				.when('secrets', { path: 'secrets', truthy: true }, (k: any) =>
					deliverSecrets(
						jsonPart(k, w, `${P}after.secrets.`, 'list', ledger, 'secrets', "The round's secrets"),
						w,
						`${P}after.secrets.`,
						{ session: ($) => $.input.session, secrets: ($) => at($, `${P}after.secrets.list`).main },
					),
				)
				.when('lanes', { path: 'laneLines', truthy: true }, (k: any) =>
					jsonPart(k, w, `${P}after.lanes.`, 'list', ledger, 'laneLines', "The Planner's lines in the lanes").each(
						'line',
						{ over: ($: any) => at($, `${P}after.lanes.list`).main, max: 16 },
						(m: any) => {
							const M = `${P}after.lanes.line.item.`
							const item = ($: any) => at($, `${P}after.lanes.line.item`)
							return jsonPart(
								textPart(textPart(m, w, M, 'lane', item, 'lane', 'Which lane'), w, M, 'text', item, 'text', "The Planner's line"),
								w,
								M,
								'blocks',
								item,
								'blocks',
								"The line's form",
							).outlet(
								'write',
								($: any) =>
									C.createMessage.v1({
										text: at($, `${M}text`).text,
										channel: at($, `${M}lane`).text,
										speaker: PLANNER as any,
										blocks: at($, `${M}blocks`).main,
									}),
								{ expose: { label: "Say the Planner's line in a lane" } },
							)
						},
					),
				),
		)
}
