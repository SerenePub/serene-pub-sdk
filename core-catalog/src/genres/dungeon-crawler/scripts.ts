/**
 * 🚧 Dungeon Crawler's script steps (PLAN-dungeon-crawler-2026-10-14): the
 * genre's bookkeeping, as `core:script:data/transform@1` rows a
 * `core:task/run-script@1` step runs — seeded by the host from
 * `CORE_SCRIPTS` (`seed/scripts.ts`) and named by seed key in each spec's
 * author preset (`PresetBuilder.scripts`), never by row id.
 *
 * Why scripts: the graph language reads a port whole and branches on a
 * path, but it has no step that opens a lane number, merges a document or
 * builds the next question's blocks. Each script here is one such
 * computation over values the spec hands it (its `value`): pure, seeded,
 * receipted, and run in the same sandbox as an admin's own scripts.
 *
 * Each returns ONE document; the spec reads the parts it needs with
 * `core:script/read-path` (a JSON part) or `core:task/join-text@1`'s `path`
 * (a text part), and branches on the rest at a junction (`path` + `truthy`).
 * A part that is absent is `null` — never an empty list, which a junction
 * would take as present.
 *
 * Every script opens on the genre's ONE preamble (`preamble.ts`, AUDIT C7).
 * Plain ES5 so any sandbox runs them.
 */

import { DUNGEON_CRAWLER_KIT_JS } from './kits.js'
import { DUNGEON_CRAWLER_EXITS_JS, DUNGEON_CRAWLER_WORLD_WRITES_JS } from './lore.js'
import { DUNGEON_CRAWLER_STANDING_ORDERS, STANDING_ORDER_QUESTION } from './round.js'
import { DUNGEON_CRAWLER_REPERTOIRE_SLOTS } from './sheet.js'
import { DUNGEON_CRAWLER_PREAMBLE, seedScript, type CoreScriptSeed } from './preamble.js'

export { DATA_TRANSFORM_KIND, DUNGEON_CRAWLER_SLOT_DEFAULTS, type CoreScriptSeed } from './preamble.js'
// 🚧 Every genre's generic reader (`shared/scriptSeed.ts`, 2026-10-23, S5); re-exported from its old home.
export { READ_PATH_SCRIPT } from '../../shared/scriptSeed.js'

/** The interview's answer action — what every question's block fires. @experimental */
// derive-don't-spell: the interview spec (`interview.ts`) imports this module, and its scripts read the identity as they load.
export const DUNGEON_CRAWLER_INTERVIEW_ACTION = 'core:spec/dungeon-crawler-interview#answer'

/**
 * 🚧 The interview's questions, by the key a block carries as its
 * `referent` (what the answer is about, read back by `read-answer@1`).
 * @experimental
 */
export const DUNGEON_CRAWLER_QUESTIONS = Object.freeze({
	worldShape: 'world-shape',
	difficulty: 'difficulty',
	goalMode: 'goal-mode',
	name: 'name',
	characterClass: 'class',
	backstory: 'backstory',
	backstoryText: 'backstory-text',
	/** A player's own *Just play* (a guest's first form): their character only. */
	justPlay: 'just-play',
	/** 🚧 After a death (`death.ts`): make a new character — the name first, as before. */
	newCharacter: 'new-character',
} as const)

/** The option key that skips the interview (feature 3). @experimental */
export const JUST_PLAY_CHOICE = 'just-play'
/**
 * 🚧 The option beside *Just play* on a player's first question: make the
 * character with the Planner, the name first. @experimental
 */
export const MAKE_CHARACTER_CHOICE = 'make-character'

/** A slot id's bare key — its `session-state@1` key (`core:slot/crawl-gear@1` → `crawl-gear`). */
const keyOf = (id: string) => id.replace(/^[^/]*\//, '').replace(/@\d+$/, '')

/**
 * What a seat may hold that a new character does not inherit, by state key →
 * repertoire — from the genre's ruleset fields (`sheet.ts`), never a second
 * list. A place's ways out are not a character's. @internal
 */
const HELD_REPERTOIRES: Readonly<Record<string, string>> = Object.freeze(
	Object.fromEntries(
		Object.entries(DUNGEON_CRAWLER_REPERTOIRE_SLOTS)
			.filter(([rep]) => rep !== 'exits')
			.map(([rep, id]) => [keyOf(id), rep]),
	),
)

/** The interview's forms: the question keys, and a builder per block. */
const INTERVIEW_JS = `
var ACTION = ${JSON.stringify(DUNGEON_CRAWLER_INTERVIEW_ACTION)};
var Q = ${JSON.stringify(DUNGEON_CRAWLER_QUESTIONS)};
var JUST_PLAY = ${JSON.stringify(JUST_PLAY_CHOICE)};
var MAKE_CHARACTER = ${JSON.stringify(MAKE_CHARACTER_CHOICE)};
var STANDING = ${JSON.stringify(DUNGEON_CRAWLER_STANDING_ORDERS)};
var STANDING_Q = ${JSON.stringify(STANDING_ORDER_QUESTION)};
${DUNGEON_CRAWLER_KIT_JS}
// 🚧 The classes the session's ruleset knows (Lair rewrite D9; read off the
// inlet since 2026-10-23, S4): the Planner names one, or a name for one, so
// the class finds its starting kit — nothing said where the rules keep none.
var CLASS_LINE = KIT_LABELS.length ? "Each class is one of the ruleset's — " + classList() + " — or a name for one of them that fits the world." : "";
function choices(addressee, referent, question, options) {
	var actions = [];
	for (var i = 0; i < options.length; i++) actions.push({ fn: "answer", action: ACTION, choice: options[i][0], label: options[i][1] });
	return { kind: "choices", addressee: addressee, referent: referent, question: question, actions: actions };
}
function textForm(addressee, referent, question, field, label) {
	var fields = {};
	fields[field] = { type: "string", label: label };
	return { kind: "form", fn: "answer", action: ACTION, addressee: addressee, referent: referent, question: question, label: "Answer", fields: fields };
}
function worldShapeBlock(who) {
	return choices(who, Q.worldShape, "A dungeon to delve, or an open world to wander?", [
		["dungeon", "A dungeon"], ["open-world", "An open world"], [JUST_PLAY, "Just play"]
	]);
}
function nameBlock(who) { return textForm(who, Q.name, "What is your character called?", "name", "Name"); }
function goalBlock(who) {
	return choices(who, Q.goalMode, "The goal?", [["shared", "Tell us the goal"], ["secret", "Keep it secret"]]);
}
// 🚧 A standing order is what a character does on a round its player skips
// (D11): only a table of more than one has rounds to skip (PLAN §14, manyAtTable).
function standingOrderBlock(who, name) {
	var options = [];
	for (var i = 0; i < STANDING.length; i++) options.push([STANDING[i].key, STANDING[i].label]);
	return choices(who, STANDING_Q, "What does " + (name || "your character") + " do when you're away?", options);
}
// A player's first question (not the owner's): make the character together,
// or Just play — one form, so answering it closes Just play with it.
function justPlayBlock(who) {
	return choices(who, Q.justPlay, "Shall we make your character together, or shall I make one for you?", [[MAKE_CHARACTER, "Make my character"], [JUST_PLAY, "Just play"]]);
}
`

/** The interview's ES5: the preamble, then its forms. */
const PREAMBLE = `${DUNGEON_CRAWLER_PREAMBLE}
${INTERVIEW_JS}`

/**
 * 🚧 `core:script/dungeon-crawler-lanes`: who at the table is greeted on
 * their Planner lane when it opens (feature 9, ★D).
 *
 * Handed `{ session }`. The people are the owner (`ownerUserId`), every
 * guest and every live player seat's player, the owner first
 * (`tablePeople`). Returns `{ greet, ask }`: `greet` — one entry per person
 * with no lane yet, `{ addressee, owner, text, blocks }`, or null for nobody;
 * `ask` — 🚧 when this run greets somebody and exactly one person had a lane
 * before (the table grows past one, PLAN-sheet-widget-redesign §14), that
 * person's standing-order question on their own lane, `{ addressee, lane,
 * text, blocks }` — only once their character is made — or null. **Core** opens the lanes (owner ruling 2026-10-17,
 * lanes by person on the server): the create and welcome specs ask
 * `core:query/channel-lane@1` for each person in turn and greet only on a
 * lane that ask `opened` — so the owner, asked first on a new session, has
 * lane 1 (`parley`), and a person who already has a lane is not greeted
 * again. The owner's first question is the world's shape, with Just play;
 * anyone else's is one choice — *Make my character* (their character's name
 * next) or *Just play* (the world is the owner's to choose) — so the first
 * answer closes Just play with it. `text` is null for the owner, whose line
 * is the Planner's declared greeting.
 * @experimental
 */
export const DUNGEON_CRAWLER_LANES_SCRIPT = seedScript(
	'core:script/dungeon-crawler-lanes',
	'Dungeon Crawler: who to greet on a Planner lane',
	`${PREAMBLE}
var owner = doc.ownerUserId != null ? Number(doc.ownerUserId) : null;
var users = tablePeople(doc);
var greet = [];
// Who already has a lane: the table as it stood before this run.
var prior = [];
// 🚧 The guest's welcome says where the world stands, as it stands now
// (2026-10-16 walk: a guest who joined after genesis was told it was being
// set up; the 100-turn walk, B2: one who joined before anybody had answered
// was told so too).
var worldNow = progressOf(core);
var worldBuilt = worldNow.built === true;
var worldUnderway = !worldBuilt && (!!worldNow.shape || worldNow.settled === true || num(worldNow.building, 0) > 0);
// 🚧 An adventure its owner ended (PLAN-dc-after-walk2 Q3-7, the walk's N16:
// a guest who joined after End was asked to make a character for a world
// that will tell no more): told so, and asked nothing.
var worldEnded = worldNow.ended === true;
for (var u = 0; u < users.length; u++) {
	var id = users[u];
	var who = "user:" + id;
	// Already at the table with a lane (the settings document's register):
	// nothing to ask core for.
	if (laneOf(doc, id)) { prior.push(id); continue; }
	var isOwner = id === owner;
	greet.push({
		addressee: who,
		owner: isOwner,
		text: isOwner ? null : worldEnded ? "Welcome to the table. This adventure has ended: the Story and the Journal stay here to read." : "Welcome to the table. This channel is just the two of us, out of character: ask me anything here, now or once we're playing. " +
			(worldBuilt ? "The world is ready and waiting; let's make your character." : worldUnderway ? "The world is being set up by the session's owner; let's make your character." : "The session's owner chooses the world; let's make your character meanwhile."),
		blocks: isOwner ? [worldShapeBlock(who)] : worldEnded ? [] : [justPlayBlock(who)]
	});
}
// 🚧 A second person at the table (PLAN-sheet-widget-redesign §14): the one
// who played alone is asked their standing order now, on their own lane — a
// round can pass without them from here on. Only when the table goes from
// one to more (a later newcomer asks nobody: everyone before them was asked
// here or under their own sheet), and only of a character already made.
var ask = [];
if (greet.length && prior.length === 1 && !worldEnded) {
	var soloSeat = seatOf(doc, prior[0]);
	var soloName = seatNameOf(soloSeat);
	// 🚧 Only of a character MADE (the 100-turn walk, B3): a persona names
	// the seat at creation, and the question then superseded the open world
	// question — the host was deadlocked. An unmade one is asked by their
	// own sheet, the table being more than one by then.
	if (soloName && heroMade(progressOf(core), "user:" + prior[0])) ask.push({
		addressee: "user:" + prior[0],
		lane: laneOf(doc, prior[0]),
		text: "Someone new has joined the table, so a round can pass while you're away from now on.",
		blocks: [standingOrderBlock("user:" + prior[0], soloName)]
	});
}
return { greet: greet.length ? greet : null, ask: ask.length ? ask : null };
`,
)

/**
 * 🚧 `core:script/dungeon-crawler-interview`: one answer of the Planner's
 * interview, judged (features 1–3).
 *
 * Handed `{ session, referent, choice, label, values, addressee, state }` —
 * the answer as `read-answer@1` takes it apart. The world's three questions
 * are the owner's alone; a character's are their player's. Returns the plan
 * the spec routes on, every part `null` unless this answer needs it:
 *
 *  - `lane` · `addressee` — where the Planner answers, and who is asked next;
 *  - `refusal` — a short Planner line, and nothing else happens;
 *  - `world` — the crawl's bookkeeping, changed (its `shape`, whether the
 *    world's questions are `settled`, the person's `heroes` entry);
 *  - `worldChanges` — state changes on the world (difficulty, goal mode);
 *  - `seatName` · `seatChanges` — the player seat's name, and changes naming
 *    no owner, made on that seat (`set-seat-name@1` hands the seat over);
 *  - `next` · `nextText` · `nextBlocks` — the next question, as a line and its form;
 *  - `note` — an acknowledgement ("Name: Ann."), written as a **table line**:
 *    faceless and never rerun, since no model call wrote it (2026-10-16);
 *  - 🚧 `echo` — the person's answer in their words ("A dungeon."), a table
 *    line of kind `answer` on their lane: the Planner's talk reads it as
 *    their line, so the lane's transcript is a conversation, not ten
 *    Planner questions in a row (the 100-turn walk, P3-5);
 *  - 🚧 `retireSeat` — a new character after a death (P3-1, owner ruling
 *    2026-10-18): the dead character's seat, retired as the name opens the
 *    person a NEW seat — the cairn's seat keeps its history and its name;
 *  - `classBrief` — the Planner offers classes (ONE model call), then asks;
 *  - `sheetBrief` — the Planner makes the sheet (ONE model call); with
 *    `justPlay` it picks everything the person may pick.
 *
 * 🚧 *Make a new character* is answered only while that person's character
 * is dead by its `fate` row (AUDIT A8): a retake that undid the death leaves
 * the form in the lane, and pressing it then must not wipe a living kit.
 * @experimental
 */
export const DUNGEON_CRAWLER_INTERVIEW_SCRIPT = seedScript(
	'core:script/dungeon-crawler-interview',
	'Dungeon Crawler: the interview',
	`${PREAMBLE}
var state = own(v.state);
var who = text(v.addressee);
var m = /^user:(\\d+)$/.exec(who);
var userId = m ? Number(m[1]) : null;
var isOwner = userId !== null && doc.ownerUserId != null && userId === Number(doc.ownerUserId);
var world = progressOf(core);
var heroes = own(world.heroes);
var hero = own(heroes[who]);
var seat = userId === null ? null : seatOf(doc, userId);
var seatRef = seat ? seatRefOf(seat) : null;
var name = seatNameOf(seat);
var referent = text(v.referent);
var choice = text(v.choice);
var label = text(v.label) || choice;
var values = own(v.values);
var plan = {
	lane: (userId !== null && laneOf(doc, userId)) || PARLEY, addressee: who, refusal: null, world: null, worldChanges: null,
	seatName: null, seatChanges: null, next: null, nextText: null, nextBlocks: null, note: null,
	echo: null, retireSeat: null, classBrief: null, sheetBrief: null, justPlay: false
};
function ask(t, blocks) { plan.next = true; plan.nextText = t; plan.nextBlocks = blocks; }
function keepHero() { heroes[who] = hero; world.heroes = heroes; plan.world = world; }
// 🚧 The person's answer, in their words, for their lane's transcript (P3-5).
function said(words) { var t0 = text(words); if (t0) plan.echo = /[.!?…]$/.test(t0) ? t0 : t0 + "."; }
// 🚧 The seat's character is dead (by its fate row): the next name is a NEW
// character, on a new seat (P3-1).
var seatFate = seatRef ? text(own(own(own(state.cast).byId)[stateKeyOf(seatRef)]).fate) : "";
// 🚧 A seat with a card is named by it (P3-6, the walk's #26): the name
// question is not asked of a persona — unless that character is the one
// who died, and a new one is being made.
var personaName = seat && seat.persona && seatFate !== "dead" ? text(seat.persona.name) : "";
function named(given, fromPersona) {
	plan.seatName = given;
	hero.name = given;
	keepHero();
	// The answered form shows only that it was answered: the table says the
	// name back — the person's answer, which their lane's talk reads as theirs;
	// a persona's name is the table's to say.
	if (fromPersona) plan.note = "Name: " + given + ", from your persona.";
	else plan.echo = "Name: " + given + ".";
	plan.classBrief = worldLine() + "\\nThe character is called " + given + ". Offer three to five classes that fit this world, each a short name. " + CLASS_LINE;
}
// Ask the name — or, for a persona's seat, take the persona's and go on to the class.
function askName(intro) {
	if (personaName) { named(personaName, true); return; }
	ask(intro, [nameBlock(who)]);
}
function worldLine() {
	var shape = world.shape === "open-world" ? "an open world" : world.shape === "dungeon" ? "a dungeon" : "a world of the Planner's choosing";
	return "The adventure is " + shape + ".";
}
function sheetBrief(how) {
	var persona = seat && seat.persona ? seat.persona : null;
	var lines = [worldLine()];
	if (plan.justPlay) {
		lines.push(isOwner
			? "The player chose Just play: choose everything for them. Pick the world's shape (dungeon or open-world), the difficulty (gentle, fair or brutal), the goal (shared or secret), and their character: a name, a class and a short backstory. " + CLASS_LINE
			: "The player chose Just play: make their character for them — a name, a class and a short backstory. The world is already chosen; leave shape, difficulty and goal empty. " + CLASS_LINE);
	} else {
		lines.push("The character is " + (name || "unnamed") + (hero["class"] ? ", a " + hero["class"] : "") + ".");
		lines.push("Their name is chosen: write it as it is. Leave class empty: it is chosen. Give a short backstory.");
	}
	if (how === "persona" && persona) lines.push("Base the backstory on the player's persona: " + text(persona.name) + ". " + text(persona.description));
	else if (how === "told") lines.push("The player told you about them: " + text(hero.told));
	else if (!plan.justPlay) lines.push("Invent a backstory that fits the world.");
	return lines.join("\\n");
}
var WORLD_QUESTIONS = [Q.worldShape, Q.difficulty, Q.goalMode, "stat-mode"];
if (WORLD_QUESTIONS.indexOf(referent) >= 0 && !isOwner && choice !== JUST_PLAY) {
	plan.refusal = "The world's questions are the session owner's to answer. Let's make your character instead.";
} else if (referent === Q.worldShape && choice === JUST_PLAY && isOwner) {
	said(label);
	plan.justPlay = true;
	plan.sheetBrief = sheetBrief("surprise");
} else if (referent === Q.justPlay && choice === MAKE_CHARACTER) {
	said(label);
	askName("Then let's begin with a name.");
} else if (referent === Q.justPlay || (referent === Q.worldShape && choice === JUST_PLAY)) {
	said(label);
	plan.justPlay = true;
	plan.sheetBrief = sheetBrief("surprise");
} else if (referent === Q.worldShape) {
	said(label);
	world.shape = choice === "open-world" ? "open-world" : "dungeon";
	plan.world = world;
	ask("How hard should the world push back?", [choices(who, Q.difficulty, "How hard?", [["gentle", "Gentle"], ["fair", "Fair"], ["brutal", "Brutal"]])]);
} else if (referent === Q.difficulty) {
	said(label);
	plan.worldChanges = [{ owner: "world", slot: SL.difficulty, value: choice }];
	// Numbers and dice are the session's rigour, set at creation: never asked
	// (walk 6, 2026-10-17).
	ask("Shall I tell you the goal, or keep it secret?", [goalBlock(who)]);
} else if (referent === "stat-mode") {
	// ⏳ A "Story or dice?" form an older session still holds (asked before
	// walk 6, 2026-10-17): nothing is written — the rigour is the session's —
	// and the interview goes on to the goal, never stalls on a lost question.
	ask("Shall I tell you the goal, or keep it secret?", [goalBlock(who)]);
} else if (referent === Q.goalMode) {
	said(label);
	// The goal mode is the world's slot alone (AUDIT C7: no copy in the
	// bookkeeping); \`settled\` says the world's questions are answered, so
	// any finished sheet may build the world from here on (A10).
	plan.worldChanges = [{ owner: "world", slot: SL.goalMode, value: choice }];
	world.settled = true;
	plan.world = world;
	askName("That's the world settled. Now, who are you?");
} else if (referent === Q.name) {
	var given = text(values.name);
	if (!given) ask("I didn't catch a name. What is your character called?", [nameBlock(who)]);
	else {
		// 🚧 A new character after a death (P3-1): a fresh hero, on a NEW
		// seat — the fallen's seat retires with its name and its history.
		if (seatRef && seatFate === "dead") { plan.retireSeat = seatRef; hero = {}; }
		named(given);
	}
} else if (referent === Q.characterClass) {
	if (!name) {
		plan.refusal = "Tell me your character's name first.";
		ask("What is your character called?", [nameBlock(who)]);
	} else {
		said(label);
		plan.seatName = name;
		plan.seatChanges = [{ slot: SL.characterClass, value: label }];
		hero["class"] = label;
		keepHero();
		var options = [];
		if (seat && seat.persona) options.push(["persona", "From my persona"]);
		options.push(["together", "Work it out with me"]);
		options.push(["surprise", "Surprise me"]);
		ask("A " + label + ". Where does " + name + " come from?", [choices(who, Q.backstory, "Their backstory?", options)]);
	}
} else if (referent === Q.backstory) {
	said(label);
	if (choice === "together") ask("Tell me about them in a line or two: where they come from, what they want.", [textForm(who, Q.backstoryText, "Who are they?", "backstory", "Backstory")]);
	else plan.sheetBrief = sheetBrief(choice === "persona" ? "persona" : "surprise");
} else if (referent === Q.backstoryText) {
	said(values.backstory);
	hero.told = text(values.backstory);
	keepHero();
	plan.sheetBrief = sheetBrief(hero.told ? "told" : "surprise");
} else if (referent === Q.newCharacter) {
	// The fate row decides, never the form still standing in the lane.
	var fateNow = seatRef ? text(own(own(own(state.cast).byId)[stateKeyOf(seatRef)]).fate) : "";
	if (seatRef && fateNow !== "dead") plan.refusal = (name || "Your character") + " is alive and still in the story: there is no new character to make.";
	else { said(label); ask("A new face, then. What is your new character called?", [nameBlock(who)]); }
} else if (referent === STANDING_Q) {
	var order = null;
	for (var so = 0; so < STANDING.length; so++) if (STANDING[so].key === choice) order = STANDING[so];
	if (!manyAtTable(doc)) plan.refusal = "You're the only one at the table, so there's no round to sit out: no standing order is needed.";
	else if (!name || !order) plan.refusal = !name ? "Tell me your character's name first." : "I didn't catch that order. Ask me here and I'll set it.";
	else {
		said(order.label);
		plan.seatName = name;
		plan.seatChanges = [{ slot: SL.standingOrder, value: order.key }];
		plan.note = "Noted: when you're away, " + name + " will " + order.says + ". Ask me here any time to change it.";
	}
} else {
	plan.refusal = "I lost track of that question. Ask me anything here and we'll carry on.";
}
if (plan.sheetBrief) { plan.currentName = name || null; plan.isOwner = isOwner; }
// No change that changes nothing (a Fair picked where Fair is the default).
if (plan.worldChanges) { plan.worldChanges = dropUnchanged(plan.worldChanges, state, "world"); if (!plan.worldChanges.length) plan.worldChanges = null; }
if (plan.seatChanges) { plan.seatChanges = dropUnchanged(plan.seatChanges, state, seatRef); if (!plan.seatChanges.length) plan.seatChanges = null; }
return plan;
`,
)

/**
 * 🚧 How long a world being built holds off another build (AUDIT A10): two
 * sheets finished within one genesis would otherwise build two worlds; a
 * genesis that failed frees the next finished sheet after this long.
 * @internal
 */
const GENESIS_HOLD_MS = 15 * 60 * 1000

/**
 * 🚧 `core:script/dungeon-crawler-sheet`: the Planner's sheet, applied
 * (features 2–3). Handed `{ session, plan, json, state, ruleset }` — the
 * interview's plan, the model's answer and the inlet's ruleset (🚧 P2-4,
 * P2-6: the kit's spell slots only at a slots table on the kits' ruleset; at
 * a spell-points table the class's pool, `kitSpellPoints`, as a seat change;
 * off the kits' ruleset the pieces land in words, the handler's). Returns:
 *
 *  - `seatName`, `seatChanges` — the seat's name (the one chosen, or the
 *    model's on Just play) and its stats as changes naming no owner: level 1,
 *    alive, full health and the class's six ability scores
 *    (`kitAbilityChanges`); a character made once the world exists stands
 *    where a living seat stands, else where its arrival was owed, else the
 *    first place (`location`, AUDIT A9);
 *  - 🚧 `pointsConfig` — at a spell-points table, the pool's most as the
 *    points stat's `{ max }` (the class's pool, `kitSpellPoints`; 0 for a
 *    class that casts nothing), null when in force;
 *  - `healthConfig` — its full health as its hp slot's `{ max }` (the class's
 *    hit die plus its Constitution modifier, `kitMaxHp`; null when in force);
 *  - `kit` — `{ owners, deltas }` for the ruleset handler: the class's
 *    starting kit (`kitDeltas`), what the seat held before removed first;
 *  - `worldChanges`, `world` — the world's on the owner's Just play, and the
 *    crawl's bookkeeping (the hero, and `building` when genesis starts);
 *  - `text`, `blocks`, `after` — the Planner's summary (*They carry · They
 *    know · They can*), the standing order's question only at a table of
 *    more than one (PLAN §14, `manyAtTable`), and what happens next on its own line;
 *  - `openStory` — whose Story composers open now: none until the world is
 *    built (AUDIT A10) — this person once it is; every person with a
 *    finished sheet when this sheet starts genesis; `waiting` when this
 *    person's stays shut for a world somebody else will build;
 *  - `genesisBrief`, `goalMode` — what genesis is asked to make, on the FIRST
 *    finished sheet (the owner's, or any once the world's questions are
 *    settled), and the goal mode it files under.
 *
 * With no name anywhere (the model left it empty on Just play), nothing is
 * filed: only `next` · `nextText` · `nextBlocks`, the name asked again.
 * @experimental
 */
export const DUNGEON_CRAWLER_SHEET_SCRIPT = seedScript(
	'core:script/dungeon-crawler-sheet',
	'Dungeon Crawler: apply the character sheet',
	`${PREAMBLE}
${DUNGEON_CRAWLER_KIT_JS}
var HELD = ${JSON.stringify(HELD_REPERTOIRES)};
var GENESIS_HOLD_MS = ${GENESIS_HOLD_MS};
// 🚧 Handed \`{ kit, seat }\` instead (P3-7): the kit, its owner the seat the
// sheet named in this same run (\`set-seat-name@1\`'s \`seat\`) — a seat a
// Just play opened had no reference when the sheet was read.
if (v.kit !== undefined) {
	var kitIn = own(v.kit);
	var seatNow = text(v.seat);
	var listIn = Array.isArray(kitIn.deltas) ? kitIn.deltas : [];
	var outD = [];
	for (var kd0 = 0; kd0 < listIn.length; kd0++) {
		var dd0 = own(listIn[kd0]);
		if (dd0.owner === SEAT_TOKEN || !text(dd0.owner)) dd0.owner = seatNow;
		if (text(dd0.owner)) outD.push(dd0);
	}
	return { owners: ["session:" + doc.sessionId].concat(seatNow ? [seatNow] : []), deltas: outD.length && seatNow ? outD : null };
}
var plan = own(v.plan);
var json = own(v.json);
var state = own(v.state);
var who = text(plan.addressee);
var world = progressOf(core);
var heroes = own(world.heroes);
var hero = own(heroes[who]);
var justPlay = plan.justPlay === true;
var isOwner = plan.isOwner === true;
var name = justPlay ? text(json.name) || text(plan.currentName) || text(hero.name) : text(plan.currentName) || text(hero.name) || text(json.name);
// 🚧 A sheet with no name is never filed under a made-up one (walk
// 2026-10-17: a guest became "the Stranger"): nothing is written and the
// name is asked again — the interview carries on from the answer.
if (!name) {
	return {
		seatName: null, seatChanges: null, healthConfig: null, pointsConfig: null, worldChanges: null, world: null, kit: null,
		text: null, after: null, genesisBrief: null, goalMode: null, blocks: null, openStory: null, waiting: false,
		next: true, nextText: "I didn't settle on a name. What is your character called?", nextBlocks: [nameBlock(who)]
	};
}
var cls = justPlay ? text(json["class"]) : text(hero["class"]);
// 🚧 Just play with no class from the model (the 100-turn walk, B20): the
// table picks one — its kit with it — never a sheet left "not set".
if (justPlay && !cls) cls = KIT_LABELS[Math.floor(Math.random() * KIT_LABELS.length)] || "";
var whoMatch = /^user:(\\d+)$/.exec(who);
var sheetSeat = whoMatch ? seatOf(doc, Number(whoMatch[1])) : null;
var sheetRef = sheetSeat ? seatRefOf(sheetSeat) : null;
// 🚧 The class's starting kit: pieces of the rules, never lines of text —
// deltas the ruleset handler applies to the seat, after what the seat held
// before goes (a newcomer after a death) — and its ability scores and hit
// die (2026-10-17).
var kitKey = kitKeyFor(cls);
// A seat this run is about to open (Just play) has no reference yet: its
// kit names the token, which the seat step fills (P3-7).
var kitList = kitDeltas(kitKey, sheetRef || SEAT_TOKEN);
// 🚧 How the session's ruleset casts (P2-4, P2-6): spell slots are the
// kits' ruleset's, at a table that plays slots; spell points are a pool.
var rulesNow = rulesetOf(v.ruleset);
if (!rulesNow.decides || rulesNow.casting === "points") {
	var keptKit = [];
	for (var kk = 0; kk < kitList.length; kk++) if (kitList[kk].repertoire !== text(KITS.slotType)) keptKit.push(kitList[kk]);
	kitList = keptKit;
}
// 🚧 Full health is the seat's own hp max — a stat configuration
// (\`healthConfig\`, written through set-stat-config before the stats) —
// Vis Itineris's level-1 rule: the class's hit die plus the Constitution
// modifier (\`kitMaxHp\`), never a number the model picks (2026-10-17).
var maxNow = sheetRef ? maxHpOf(state, sheetRef) : null;
// 🚧 None where the session's rules keep no kits (S4): health stays the sheet's own.
var maxHp = kitMaxHp(kitKey);
var healthConfig = maxHp !== null && maxHp !== maxNow ? { max: maxHp } : null;
// 🚧 A new sheet is a living character at full health (a newcomer after a
// death: \`death.ts\`), with the class's six ability scores.
var changes = [{ slot: SL.level, value: 1 }, { slot: SL.fate, value: "alive" }];
if (maxHp !== null) changes.push({ slot: SL.hp, value: maxHp });
else if (maxNow !== null) changes.push({ slot: SL.hp, value: maxNow });
var scores = kitAbilityChanges(kitKey);
for (var ab = 0; ab < scores.length; ab++) changes.push(scores[ab]);
// 🚧 …and the class's trained skills (owner ruling ★4): a trained check adds proficiency.
var trained = kitSkillChanges(kitKey);
for (var tk = 0; tk < trained.length; tk++) changes.push(trained[tk]);
// 🚧 At a spell-points table the class's pool, full (P2-4) — none for a class that casts nothing.
// 🚧 …and the pool's most is the seat's own (PLAN-dc-after-walk2 Q1-6, the
// walk's N11): one row, "Spell points 4/4" — never the stat's ceiling of 99
// beside a second row saying the most; a class that casts nothing holds a
// pool of none, which the sheet does not draw.
var pointsConfig = null;
if (rulesNow.casting === "points" && rulesNow.pointsSlot) {
	var pool = kitSpellPoints(kitKey);
	changes.push({ slot: rulesNow.pointsSlot, value: pool });
	var poolNow = sheetRef ? own(own(own(state).configs)[stateKeyOf(sheetRef)])[rulesNow.pointsSlot] : null;
	if (!poolNow || poolNow.max !== pool) pointsConfig = { max: pool };
}
if (justPlay && cls) changes.push({ slot: SL.characterClass, value: cls });
var kitOut = null;
var drop = [];
if (sheetRef) {
	var heldBag = own(own(own(state).cast).byId)[stateKeyOf(sheetRef)] || {};
	for (var rk in HELD) {
		var heldList = Array.isArray(heldBag[rk]) ? heldBag[rk] : [];
		for (var hi = 0; hi < heldList.length; hi++) {
			var hp0 = heldList[hi];
			var hname = hp0 && hp0.kind === "compendium" ? hp0.pieceId : hp0 && hp0.name;
			if (hname) drop.push({ owner: sheetRef, repertoire: HELD[rk], op: "remove", piece: hname });
		}
	}
}
// The kit, always: the seat step names its owner when this run opens the seat.
kitOut = { owners: ["session:" + doc.sessionId].concat(sheetRef ? [sheetRef] : []), deltas: drop.concat(kitList) };
// The world's on the owner's Just play: the schema's enums say what each may
// be (AUDIT C7: no second check here).
var worldChanges = null;
if (justPlay && isOwner) {
	worldChanges = [];
	if (text(json.difficulty)) worldChanges.push({ owner: "world", slot: SL.difficulty, value: text(json.difficulty) });
	if (text(json.goalMode)) worldChanges.push({ owner: "world", slot: SL.goalMode, value: text(json.goalMode) });
	if (text(json.shape)) world.shape = text(json.shape);
	world.settled = true;
}
// The goal mode genesis files under: chosen in this run, else the world's slot.
var goalMode = (justPlay && isOwner && text(json.goalMode)) || text(own(state.world)["goal-mode"]) || "shared";
hero.name = name;
if (cls) hero["class"] = cls;
hero.backstory = text(json.backstory);
// 🚧 Made, not merely named (\`heroMade\`): rounds wait for this hero, the
// table asks their standing order, from here on.
hero.made = true;
heroes[who] = hero;
world.heroes = heroes;
var built = world.built === true;
// 🚧 Where a character made once the world exists stands (AUDIT A9): where
// a living seat of the party stands now, else where their arrival was owed
// (a newcomer after a death), else nowhere yet — the story turn places them.
if (built) {
	var where = "";
	var party = seatsOf(doc, state);
	for (var ps = 0; ps < party.length && !where; ps++)
		if (party[ps].ref !== sheetRef && party[ps].fate === "alive" && party[ps].location) where = party[ps].location;
	var owedHere = Array.isArray(world.arrivals) ? world.arrivals : [];
	for (var ow = 0; ow < owedHere.length && !where; ow++) if (own(owedHere[ow]).who === who) where = text(own(owedHere[ow]).where);
	if (where) changes.push({ slot: SL.location, value: where });
}
// The summary: what they carry, what they know, what they can do — by
// repertoire, never one list mixing spells into the gear (AUDIT E).
var carry = [], know = [], can = [];
for (var ki = 0; ki < kitList.length; ki++) {
	var kd = kitList[ki], lbl = pieceLabel(kd.repertoire, kd.piece);
	if (!lbl) continue;
	if (kd.repertoire === "spells") know.push(lbl);
	else if (kd.repertoire === "features") can.push(lbl);
	else if (kd.repertoire !== "spell-slots") carry.push(lbl);
}
var lines = ["Here is " + name + (cls ? ", " + cls : "") + "."];
if (hero.backstory) lines.push(hero.backstory);
var kitLines = [];
if (carry.length) kitLines.push("They carry: " + carry.join(", ") + ".");
if (know.length) kitLines.push("They know: " + know.join(", ") + ".");
if (can.length) kitLines.push("They can: " + can.join(", ") + ".");
if (kitLines.length) lines.push(kitLines.join("\\n"));
// 🚧 Genesis on the FIRST finished sheet (AUDIT A10): the owner's, or anyone's
// once the owner has settled the world's questions — never twice while one
// is being built.
var buildingSince = num(world.building, 0);
var building = buildingSince > 0 && Date.now() - buildingSince < GENESIS_HOLD_MS;
var genesisDue = !built && !building && (isOwner || world.settled === true);
// The standing order's question only at a table of more than one (§14);
// "the others" only when another seat is out there (AUDIT E).
var many = manyAtTable(doc);
var others = liveSeats(doc).length > 1;
// What happens next is its own line, AFTER the summary and its standing-order
// question (round 2: "Give me a moment…" sat above the question it preceded).
var after = built
	? (others ? "The others are already out there. You'll join them in the story; say what you do when you're ready." : "The world is waiting. Say what you do on the Story when you're ready.")
	: genesisDue ? "Give me a moment to build the world." : "We'll begin once the world is ready.";
// No change that changes nothing: a fresh seat already reads level 1, alive.
changes = dropUnchanged(changes, state, sheetRef);
if (worldChanges) { worldChanges = dropUnchanged(worldChanges, state, "world"); if (!worldChanges.length) worldChanges = null; }
var genesisBrief = null;
var openStory = null;
if (genesisDue) {
	world.building = Date.now();
	var shapeWord = world.shape === "open-world" ? "an open world" : "a dungeon";
	var heroesLine = [];
	var hooks0 = [];
	openStory = [];
	for (var h in heroes) if (heroes[h] && heroes[h].name) {
		heroesLine.push(heroes[h].name + (heroes[h]["class"] ? " (" + heroes[h]["class"] + ")" : ""));
		if (text(heroes[h].backstory)) hooks0.push(heroes[h].name + ": " + text(heroes[h].backstory));
		openStory.push(h);
	}
	// 🚧 What the world is for, said whole (P3-4): how hard it pushes, what
	// each hero brings to hook a story on, and who travels with them.
	var difficulty0 = (justPlay && isOwner && text(json.difficulty)) || text(own(state.world).difficulty) || "fair";
	var companions0 = companionNames(doc);
	genesisBrief = "Build " + shapeWord + " for this party: " + heroesLine.join(", ") + "." +
		"\\nDifficulty: " + difficulty0 + "." +
		(hooks0.length ? "\\nTheir backstories, to hook the world on:\\n- " + hooks0.join("\\n- ") : "") +
		(companions0.length ? "\\nTravelling with them, voiced by the Narrator: " + companions0.join(", ") + "." : "");
} else if (built) openStory = [who];
return {
	seatName: name, seatChanges: changes.length ? changes : null, healthConfig: healthConfig, pointsConfig: pointsConfig,
	// 🚧 The pool the config bounds — the session's rules' (S4).
	pointsSlot: pointsConfig ? rulesNow.pointsSlot : null,
	worldChanges: worldChanges, world: world,
	kit: kitOut,
	text: lines.join("\\n\\n"), after: after, genesisBrief: genesisBrief, goalMode: genesisBrief ? goalMode : null,
	openStory: openStory && openStory.length ? openStory : null,
	waiting: !built && !genesisDue,
	blocks: many ? [standingOrderBlock(who, name)] : null,
	next: null, nextText: null, nextBlocks: null
};
`,
)

/**
 * 🚧 `core:script/dungeon-crawler-genesis`: the generated world, filed
 * (feature 4). Handed `{ session, sheet, json, state }` — the sheet step's
 * output (whose bookkeeping this run already changed, so it is merged
 * first), the model's world and the session's state. Returns `{ world,
 * journal, notes, openingBrief, placements, places, people }`: the
 * crawl's bookkeeping (`world` here: the goal and `built`), the journal (the
 * goal, or *secret*, and the leads), the Planner's notes (the secret goal and
 * its notes), what the Narrator's opening scene is asked to open on, each
 * player seat's `location` set to the first place (`null` when none moves) —
 * and the world itself for the session's own lorebook (`lore.ts`): the
 * places with their ways out inside them, and the people. 🚧 Called again
 * with `places` (the places as written), it returns `{ ways }` alone: the
 * world's ways out as `exits` pieces, `{ owners, deltas }` for the ruleset
 * handler's apply (`exitDeltas`), or `null` (R2-2).
 * @experimental
 */
export const DUNGEON_CRAWLER_GENESIS_SCRIPT = seedScript(
	'core:script/dungeon-crawler-genesis',
	'Dungeon Crawler: file the generated world',
	`${PREAMBLE}
${DUNGEON_CRAWLER_EXITS_JS}
${DUNGEON_CRAWLER_WORLD_WRITES_JS}
var json = own(v.json);
// 🚧 Its second call (PLAN-dc-after-walk3 R2-2, the walk's NEW-7): handed the
// places as written (\`places\`, the lorebook listing), the world's ways out
// as \`exits\` pieces on the places they leave — held from the start, so the
// crib names each exactly and the Planner's first re-listing changes nothing.
if (v.places !== undefined) {
	var built = exitDeltas(roomsOf(json.rooms, 7), placesOf(v.places), v.state);
	return { ways: built.deltas.length ? built : null };
}
var sheet = own(v.sheet);
var world = sheet.world && typeof sheet.world === "object" ? own(sheet.world) : progressOf(core);
delete world.building;
var rooms = roomsOf(json.rooms, 7);
var npcs = [];
var rawN = Array.isArray(json.npcs) ? json.npcs : [];
for (var j = 0; j < rawN.length && npcs.length < 4; j++) {
	var n = own(rawN[j]);
	if (text(n.name)) npcs.push({ name: text(n.name), description: text(n.description) });
}
var goal = text(json.goal);
var leads = list(json.leads, 4);
world.goal = goal;
var secret = (text(sheet.goalMode) || text(own(own(v.state).world)["goal-mode"])) === "secret";
var notes = [];
// The Planner's notes always lead with the goal — secret or shared.
if (goal) notes.push((secret ? "Secret goal: " : "Goal: ") + goal);
if (text(json.notes)) notes.push(text(json.notes));
var first = rooms[0];
// The world, for the session's own lorebook: every place new, so every way
// out between two of them is a link written with the later of the two.
var writes = worldWrites([], [], rooms, npcs, false);
// 🚧 Where the party starts (core:slot/location@1): every player seat with a
// character — and the owner's, named or not (Just play names it in this same
// run) — stands in the first place. A seat placed later stands where the
// party stands then (AUDIT A9: no copy of where they started).
var placements = [];
if (first) {
	world.built = true;
	var ownerId = doc.ownerUserId != null ? Number(doc.ownerUserId) : null;
	var seated = liveSeats(doc);
	for (var p = 0; p < seated.length; p++) {
		var st = seated[p];
		if (!seatNameOf(st) && userOf(st) !== ownerId) continue;
		placements.push({ owner: seatRefOf(st), slot: SL.location, value: first.name });
	}
	placements = dropUnchanged(placements, v.state, null);
}
// One full stop, whatever the model ended its own sentence with ("portcullis.." — 2026-10-16 walk).
function stop(x) { x = text(x); return x && !/[.!?…]$/.test(x) ? x + "." : x; }
// 🚧 Who travels with the party is in the opening (P3-4): the companions,
// by name — narrative only, the Narrator's to voice.
var companionsNow = companionNames(doc);
var openingBrief = (first ? stop("Open the adventure in " + first.name + (text(first.description) ? ": " + text(first.description) : "")) : "Open the adventure.") +
	" Start in the middle of something; within a few lines the party should find, fight or meet something." +
	(companionsNow.length ? " Travelling with them: " + companionsNow.join(", ") + " — name them in the scene." : "") +
	(leads.length ? " Hint at: " + stop(leads[0]) : "");
// 🚧 Every Planner lane of a person whose character is made hears that the
// story has started, and where (PLAN-dc-after-walk2 Q3-3, the walk's #25: the
// world built and nothing said where to go next).
var started = [];
if (first) {
	var people0 = tablePeople(doc);
	for (var pp = 0; pp < people0.length; pp++) {
		var lane0 = laneOf(doc, people0[pp]);
		if (lane0 && heroMade(world, "user:" + people0[pp])) started.push(lane0);
	}
}
return {
	world: world,
	journal: { goal: secret ? SECRET_GOAL : goal, leads: leads },
	notes: notes.join("\\n"),
	openingBrief: openingBrief,
	placements: placements.length ? placements : null,
	places: writes.places.length ? writes.places : null,
	people: writes.people.length ? writes.people : null,
	fallen: null,
	startedLanes: started.length ? started : null,
	startedLine: "The story has started: open the Story tab and say what you do."
};
`,
)

/**
 * 🚧 `core:script/dungeon-crawler-crib`: the Planner's crib as prose, for
 * its out-of-character talk (feature 9). Handed `{ session, lane, places,
 * people, state, ruleset }` — the lane the line was sent on, the session's
 * own lorebook as the respond spec lists it, and the turn's ruleset.
 * Returns `{ text, canChange }`: the
 * world (shape, goal, places, people), the journal, the Planner's own notes
 * and the hero whose lane this is — and what this player may change through
 * the Planner (`{{canChange}}` in the edits prompt, PLAN §13–14): the host
 * any seat, place or the world; a guest their own character; the standing
 * order only at a table of more than one (`manyAtTable`). ⚠ Read by the Planner only:
 * the goal and the notes are secrets the Narrator's prompts never take.
 * @experimental
 */
export const DUNGEON_CRAWLER_CRIB_SCRIPT = seedScript(
	'core:script/dungeon-crawler-crib',
	"Dungeon Crawler: the Planner's crib",
	`${PREAMBLE}
var who = laneWho(doc, v.lane);
var world = progressOf(core);
var journal = own(core[KEYS.journal]);
var state = own(v.state);
var lines = cribLines(world, journal, { state: state, places: v.places, people: v.people });
var hero = who ? own(own(world.heroes)[who]) : {};
var m = who ? /^user:(\\d+)$/.exec(who) : null;
var laneUser = m ? Number(m[1]) : null;
var isOwner = !!m && doc.ownerUserId != null && Number(m[1]) === Number(doc.ownerUserId);
var seat = laneUser !== null ? seatOf(doc, laneUser) : null;
var ref = seat ? seatRefOf(seat) : null;
var seatName = seatNameOf(seat);
// 🚧 How this table plays (P1-3): its ruleset and rigour, and how hard the
// world pushes — the Planner answers rules questions from them.
var rs = own(v.ruleset);
var rsId = text(rs.id);
// 🚧 The ruleset by its own name (its gist, S4), else its id in words.
var rsName = text(rs.name) || (rsId ? rsId.replace(/^[a-z0-9.-]+:ruleset\\//, "").replace(/@\\d+$/, "").replace(/-/g, " ") : "");
var rigour0 = text(rs.rigour);
var playsWords = rigour0 === "prose" || (rigour0 && rs.decides === false)
	? "nothing is rolled and no number is told: everything is said in words"
	: rigour0 ? (rs.chance === true ? "the table rolls the dice in the open and keeps the numbers" : "the table decides each check by its rules in the open and keeps the numbers") : "";
var difficulty0 = text(own(state.world).difficulty);
// 🚧 The rules' options this table chose (PLAN-dc-after-walk2 Q2-4, the walk's
// #22): what happens at zero health and how spells are paid for — so "what
// happens if I drop?" has an answer — 🚧 read off the session's rules (S4):
// their fall rule (★I), else down and out with nothing rolled; their casting.
var rl0 = rulesetOf(v.ruleset);
var options0 = [];
if (rl0.fall) options0.push(rl0.deathSaves ? "at zero health: death saves — a roll each round, " + deathSavesRule(rl0.fall, true) : "at zero health: one roll at death's door decides");
else if (rl0.decides) options0.push("at zero health: down and out until a rest — nothing is rolled");
if (rl0.casting === "points") options0.push("spells: spell points, a spell costing its level");
else if (rl0.decides && text(own(rs.kits).slotType)) options0.push("spells: spell slots, one a spell, back after a long rest");
if (rsName || playsWords || difficulty0 || options0.length)
	lines.push("This table: " + [rsName ? "plays " + rsName : "", playsWords, difficulty0 ? "difficulty " + difficulty0 : ""].concat(options0).filter(function (x) { return x; }).join("; ") + ".");
if (hero.name) {
	lines.push("You are talking with the player of " + hero.name + (hero["class"] ? ", a " + hero["class"] : "") + "." + (hero.backstory ? " " + hero.backstory : ""));
} else lines.push("You are talking with a player who has not made their character yet.");
// 🚧 Their character's sheet, as it stands (P1-3, the walk's #22: "How much
// health do I have left?" was unanswerable), and its reference.
if (ref && seatName) lines.push("Their character's sheet: " + sheetLine(state, ref, seatName, rulesetOf(v.ruleset)) + ".");
var many = manyAtTable(doc);
var can = [];
can.push(isOwner
	? "This player is the session's host: their asks may change any character, any place (a new way out of a place goes under rooms) or the world."
	: "This player may change only their own character" + (hero.name ? ", " + hero.name : "") + ": never another character, a place or the world. Anything else they want is an ask.");
if (ref) can.push("Their own character's reference — a change's owner — is " + ref + (seatName ? " (" + seatName + ")" : "") + ".");
can.push(many
	? "Their standing order (hold, follow, fight or flee) is what their character does on a round they skip."
	: "They play alone, so there is no standing order: leave it empty.");
return { text: lines.join("\\n"), canChange: can.join(" ") };
`,
)

/**
 * 🚧 `core:script/dungeon-crawler-edits`: what a player asked the Planner for
 * in their lane, landed (feature 9; PLAN-sheet-widget-redesign §13–14).
 * Handed `{ session, lane, json, state, places }` — the model's `{
 * standingOrder, asks, deltas, rooms }`. Returns, each `null` when empty:
 *
 *  - `changes` — the standing order on that player's seat, only at a table
 *    of more than one (§14, `manyAtTable`: solo has none);
 *  - `notes` (+ `notesRevealed` while the notes are out) — the Planner's
 *    notes with each ask appended under **Asks**, tagged by who asked; the
 *    story turn honours an open ask when the scene allows, and strikes it;
 *  - `deltas` · `owners` — changes in the story turn's delta shape for the
 *    ruleset handler's `apply`: the host's lane may touch any seat, a place
 *    or the world; a guest's only their own seat (refused deltas are said);
 *    a host's `rooms` become ways out of places the book holds
 *    (`exitDeltas`, the one exit model);
 *  - `said` — the table line for what landed without the handler (the
 *    standing order, the asks, what was refused).
 *
 * Handed `{ applied }` (the handler's `apply`) instead, it returns `{ line }`
 * — the table line for what the handler decided.
 * @experimental
 */
export const DUNGEON_CRAWLER_EDITS_SCRIPT = seedScript(
	'core:script/dungeon-crawler-edits',
	'Dungeon Crawler: what the Planner talk changes',
	`${PREAMBLE}
${DUNGEON_CRAWLER_EXITS_JS}
// Every name the table knows a reference by: the seats, the companions,
// the places — what a refusal says in words (P1-2) and an owner given by
// name resolves to (P1-1).
var NAMES = {};
var BY_NAME = {};
var seatsAll = liveSeats(doc);
for (var na = 0; na < seatsAll.length; na++) if (seatNameOf(seatsAll[na])) { NAMES[seatRefOf(seatsAll[na])] = seatNameOf(seatsAll[na]); BY_NAME[seatNameOf(seatsAll[na]).toLowerCase()] = seatRefOf(seatsAll[na]); }
var COMPANIONS = companionsOf(doc);
for (var nc = 0; nc < COMPANIONS.length; nc++) { NAMES[COMPANIONS[nc].ref] = COMPANIONS[nc].name; BY_NAME[COMPANIONS[nc].name.toLowerCase()] = COMPANIONS[nc].ref; }
var placesNamed = placesOf(v.places);
for (var np = 0; np < placesNamed.length; np++) if (placesNamed[np].id !== null) { NAMES["location:" + placesNamed[np].id] = placesNamed[np].name; BY_NAME[placesNamed[np].name.toLowerCase()] = "location:" + placesNamed[np].id; }
if (v.applied !== undefined) {
	var ap = own(v.applied);
	var told = [];
	var oc = Array.isArray(ap.outcomes) ? ap.outcomes : [];
	for (var o = 0; o < oc.length; o++) if (text(own(oc[o]).text)) told.push(text(own(oc[o]).text));
	// 🚧 Each refusal in the table's words, never its code (P1-2).
	var rj = Array.isArray(ap.rejected) ? ap.rejected : [];
	for (var r = 0; r < rj.length; r++) told.push(refusalWords(rj[r], NAMES));
	return { line: told.length ? told.join("\\n") : null };
}
var SAYS = {};
for (var so = 0; so < STANDING.length; so++) SAYS[STANDING[so].key] = STANDING[so].says;
var state = own(v.state);
var json = own(v.json);
var who = laneWho(doc, v.lane);
var m = who ? /^user:(\\d+)$/.exec(who) : null;
var userId = m ? Number(m[1]) : null;
var isOwner = userId !== null && doc.ownerUserId != null && userId === Number(doc.ownerUserId);
var seat = userId !== null ? seatOf(doc, userId) : null;
var ref = seat ? seatRefOf(seat) : null;
var name = seatNameOf(seat);
var said = [];
// The standing order: the player's own, and only where there are rounds to skip.
var changes = [];
var order = text(json.standingOrder);
if (order && ref && manyAtTable(doc) && SAYS[order]) changes = dropUnchanged([{ owner: ref, slot: SL.standingOrder, value: order }], state, ref);
if (changes.length) said.push("Standing order: when you're away, " + (name || "your character") + " will " + SAYS[order] + ".");
// The asks, under one Asks heading of the Planner's notes, tagged by who asked.
var asks = list(json.asks, 4);
var notes = null;
if (asks.length) {
	var tag = name || (isOwner ? "the host" : "a player");
	var now = text(core[KEYS.planningNotes]);
	var added = [];
	// An ask already noted (a swipe of the Planner's reply asks it again) is not noted twice.
	for (var a = 0; a < asks.length; a++) {
		var askLine = "- [" + tag + "] " + asks[a];
		if (now.indexOf(askLine) >= 0) continue;
		added.push(askLine);
		said.push("Noted for the story: " + asks[a]);
	}
	if (added.length) notes = /(^|\\n)Asks:/.test(now) ? now + "\\n" + added.join("\\n") : (now ? now + "\\n\\n" : "") + "Asks:\\n" + added.join("\\n");
}
// The changes, in the story turn's delta shape: the host's lane any owner, a
// guest's only their own seat (by its reference or its name).
var deltas = [];
var rd = Array.isArray(json.deltas) ? json.deltas : [];
// An owner the edits left empty (the walk's lane edit with \`owner: ""\`) is
// the asking player's own character (P1-1, P1-3).
if (ref) for (var re0 = 0; re0 < rd.length; re0++) if (rd[re0] && typeof rd[re0] === "object" && !text(rd[re0].owner)) { rd[re0] = own(rd[re0]); rd[re0].owner = ref; }
for (var i = 0; i < rd.length && deltas.length < 8; i++) {
	var d = deltaOf(asDelta(rd[i]));
	if (!d) continue;
	// A seat, a companion or a place named by its name is its reference
	// (P1-1); an owner left empty is the asking player's own character.
	if (BY_NAME[d.owner.toLowerCase()]) d.owner = BY_NAME[d.owner.toLowerCase()];
	if ((d.owner === "me" || d.owner === "player" || d.owner === "self") && ref) d.owner = ref;
	var ownerName = NAMES[d.owner] || d.owner;
	// 🚧 Companions are narrative only (owner ruling 2026-10-18): no sheet
	// keeps their health or their things.
	var companionAsked = false;
	for (var ca = 0; ca < COMPANIONS.length; ca++) if (COMPANIONS[ca].ref === d.owner) companionAsked = true;
	if (companionAsked) { said.push("Not changed: " + ownerName + " travels with the party in the story only — no sheet keeps their health or their things."); continue; }
	// 🚧 In plain words (P4-7, the 100-turn walk #23): an owner nobody at the
	// table answers to ("player asked to hurt another") is never echoed back.
	if (!isOwner && d.owner !== ref) { said.push("Not changed: " + (NAMES[d.owner] ? NAMES[d.owner] + " is not yours to change — only " + (name || "your own character") + " is." : "that change is for someone else — only " + (name || "your own character") + " is yours to change.")); continue; }
	deltas.push(d);
}
var owners = ["session:" + doc.sessionId];
if (isOwner) {
	var ex = exitDeltas(roomsOf(json.rooms, 4), placesOf(v.places), state);
	deltas = deltas.concat(ex.deltas);
}
for (var od = 0; od < deltas.length; od++) if (owners.indexOf(deltas[od].owner) < 0) owners.push(deltas[od].owner);
return {
	changes: changes.length ? changes : null,
	notes: notes,
	notesRevealed: notes && text(core[KEYS.planningNotesRevealed]) ? notes : null,
	deltas: deltas.length ? deltas : null,
	owners: owners,
	said: said.length ? said.join("\\n") : null
};
`,
)

/** Every script the genre ships, for the seed pass. @experimental */
export const DUNGEON_CRAWLER_SCRIPTS: readonly CoreScriptSeed[] = Object.freeze([
	DUNGEON_CRAWLER_LANES_SCRIPT,
	DUNGEON_CRAWLER_INTERVIEW_SCRIPT,
	DUNGEON_CRAWLER_SHEET_SCRIPT,
	DUNGEON_CRAWLER_GENESIS_SCRIPT,
	DUNGEON_CRAWLER_CRIB_SCRIPT,
	DUNGEON_CRAWLER_EDITS_SCRIPT,
])
