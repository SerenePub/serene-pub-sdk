/**
 * 🚧 **What the Planner may change, in the session's rules' grammar** (lane
 * G3, 2026-10-23; PLAN-genres-seams S1: `ruleset-resolve`'s `replySchema` is
 * the one schema a genre asks a model for changes in). The story turn's
 * Planner and the Planner's talk answer JSON whose change items are the
 * reply schema's — `owner`, `changes`, `attribute`, `entryType`, `op`,
 * `value`, `name`, `reason` — built at run time from the session's ruleset,
 * never from a ruleset the build holds (the Vis-Itineris-built enums of
 * `DUNGEON_CRAWLER_DELTA_SCHEMA` are retired). On top, what is the genre's:
 *
 *  - the hero's fields it reads (`DUNGEON_CRAWLER_GENRE_FIELDS`: health,
 *    level, class, place — 🚧 RF fix 8: health, level and class only where
 *    the session's rules keep them, level only where they count; the place
 *    always, the host's) and its lists (the crawl's weapons, gear,
 *    conditions …) beside the ruleset's attributes and entry types; never a field no delta may touch (`NOT_FOR_DELTAS`), never
 *    a way out (written inside its place);
 *  - where the rules decide anything (`RulesetGist.decides`), the checks: the
 *    ops that ask one (`hit`, `use`, `traverse`), `check` by the rules' own
 *    keys (`RulesetGist.decidingKeys`, never a list of names), `against`,
 *    `aimedAt`;
 *  - the world's places, each way out inside it, its kinds and standings the
 *    ruleset's exit entry type's (`RulesetGist.exits`), and their numbers only
 *    where the rules decide and keep a way out.
 *
 * `core:script/dungeon-crawler-shape` builds it: handed `{ shape, ruleset,
 * want }` — `shape` the resolve step's `replySchema` (null reads as a ruleset
 * that names nothing; its answer in the grammar subset every backend
 * compiles — empty text is none, never `null` or a type union: GM
 * 2026-10-23, G1 ★4), `ruleset` the inlet's (its gist), `want` `turn` (the
 * story turn's books), `edits` (the Planner's talk) or `genesis` (the world,
 * its places alone) — it answers the JSON schema the call asks in. The turn script reads the answer back in the
 * handler's shape (`asDelta`, the preamble's).
 */

import { characterClassSlot, hpSlot, levelSlot, locationSlot } from '../../registry/slots.js'
import { DUNGEON_CRAWLER_SECRETS_SCHEMA } from './names.js'
import { DUNGEON_CRAWLER_STANDING_ORDERS } from './round.js'
import { DUNGEON_CRAWLER_COUNTED_EXIT_KEYS, DUNGEON_CRAWLER_EXIT_FRAME } from './lore.js'
import { DUNGEON_CRAWLER_REPERTOIRE_SLOTS } from './sheet.js'
import { DUNGEON_CRAWLER_DELTA_OPS, DUNGEON_CRAWLER_STORY_PREAMBLE, storySeed } from './storyScripts.js'

/** A slot id's bare key — what a change names it by (`core:slot/hp@1` → `hp`). */
const keyOf = (id: string) => id.replace(/^[^/]*\//, '').replace(/@\d+$/, '')

/**
 * 🚧 The genre's own sheet fields a change may name beside the ruleset's
 * attributes, by key: health, level, class and place. Level only where the
 * rules decide anything (a table of words keeps none). @experimental
 */
export const DUNGEON_CRAWLER_GENRE_FIELDS = Object.freeze([hpSlot.id, levelSlot.id, characterClassSlot.id, locationSlot.id].map(keyOf))

/**
 * 🚧 What the Planner answers a story turn with (≤600 tokens, the prompt
 * says), its change items and its places laid at run time
 * (`core:script/dungeon-crawler-shape`): the **deltas** for the handler, the
 * world moving (places found or changed with their ways out inside them, new
 * people, the open leads, the goal's progress, its notes), the turn's
 * minutes, the Narrator's brief, the round's summary and the secrets. Who
 * stands at death's door is not the Planner's to say (AUDIT A7): every seat
 * the turn leaves at 0 health stands there, and no other.
 * @experimental
 */
export const DUNGEON_CRAWLER_TURN_FRAME = Object.freeze({
	type: 'object',
	properties: {
		deltas: { type: 'array', maxItems: 16, items: { type: 'object' } },
		world: {
			type: 'object',
			properties: {
				rooms: { type: 'array', maxItems: 6, items: { type: 'object' } },
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
})

/**
 * 🚧 What a player's talk with the Planner may change (PLAN-sheet-widget-redesign
 * §13–14, 2026-10-17: "introduce an alley"), its change items and its places
 * laid at run time as the story turn's are:
 *
 *  - `standingOrder` — one of the slot's four, or empty; only at a table of
 *    more than one (`manyAtTable`: the edits script refuses it in solo);
 *  - `asks` — what the player wants the story to bring in, appended to the
 *    Planner's notes under *Asks*;
 *  - `deltas` — changes in the session's rules' grammar, applied by the
 *    ruleset handler: the host's lane any seat or the world, a guest's only
 *    their own seat;
 *  - `rooms` — the host's alone: a place the book holds with a new or changed
 *    way out inside it — the alley.
 *
 * Every member required (the grammar-compiling families); empty says "none".
 * @experimental
 */
export const DUNGEON_CRAWLER_EDITS_FRAME = Object.freeze({
	type: 'object',
	properties: {
		standingOrder: { type: 'string', enum: ['', ...DUNGEON_CRAWLER_STANDING_ORDERS.map((o) => o.key)] },
		asks: { type: 'array', maxItems: 4, items: { type: 'string' } },
		deltas: { type: 'array', maxItems: 8, items: { type: 'object' } },
		rooms: { type: 'array', maxItems: 4, items: { type: 'object' } },
	},
	required: ['standingOrder', 'asks', 'deltas', 'rooms'],
	additionalProperties: false,
})

/**
 * 🚧 What the Planner answers genesis with (≤600 tokens, the prompt says): the
 * goal, four to seven places (the first is where the party starts) with
 * their ways out — laid at run time over the session's rules, as the story
 * turn's are — two to four people, two leads and its secret notes. One
 * required key per member, for the grammar-compiling families.
 * @experimental
 */
export const DUNGEON_CRAWLER_GENESIS_FRAME = Object.freeze({
	type: 'object',
	properties: {
		goal: { type: 'string' },
		// One exit model (AUDIT A12): a way out is written inside its place.
		rooms: { type: 'array', minItems: 1, maxItems: 7, items: { type: 'object' } },
		npcs: {
			type: 'array',
			maxItems: 4,
			items: {
				type: 'object',
				properties: { name: { type: 'string' }, description: { type: 'string' } },
				required: ['name', 'description'],
				additionalProperties: false,
			},
		},
		leads: { type: 'array', maxItems: 4, items: { type: 'string' } },
		notes: { type: 'string' },
	},
	required: ['goal', 'rooms', 'npcs', 'leads', 'notes'],
	additionalProperties: false,
})

/**
 * 🚧 `core:script/dungeon-crawler-shape`: the schema a Planner's call answers
 * in, over the session's ruleset (see the module note). Handed `{ shape,
 * ruleset, want }`; answers the JSON schema itself.
 * @experimental
 */
export const DUNGEON_CRAWLER_SHAPE_SCRIPT = storySeed(
	'core:script/dungeon-crawler-shape',
	'Dungeon Crawler: what the Planner may change',
	`${DUNGEON_CRAWLER_STORY_PREAMBLE}
var FRAMES = { turn: ${JSON.stringify(DUNGEON_CRAWLER_TURN_FRAME)}, edits: ${JSON.stringify(DUNGEON_CRAWLER_EDITS_FRAME)}, genesis: ${JSON.stringify(DUNGEON_CRAWLER_GENESIS_FRAME)} };
var EXIT_FRAME = ${JSON.stringify(DUNGEON_CRAWLER_EXIT_FRAME)};
var COUNTED_EXIT = ${JSON.stringify(DUNGEON_CRAWLER_COUNTED_EXIT_KEYS)};
var MINE = ${JSON.stringify(DUNGEON_CRAWLER_GENRE_FIELDS)};
var LEVEL_KEY = ${JSON.stringify(keyOf(levelSlot.id))};
var PLACE_KEY = ${JSON.stringify(keyOf(locationSlot.id))};
var LISTS = ${JSON.stringify(Object.keys(DUNGEON_CRAWLER_REPERTOIRE_SLOTS))};
var OPS = ${JSON.stringify(DUNGEON_CRAWLER_DELTA_OPS)};
var gist = own(v.ruleset);
var rules = rulesetOf(v.ruleset);
// Counted play: the rules decide something — checks may be asked.
var counted = rules.decides;
// A way out keeps its numbers only where the rules decide and keep a way out.
var exitsCounted = counted && !!gist.exits;
// The reply schema's change item (\`ruleset-resolve\`'s \`replySchema\`): what
// the session's rules let a change name.
var cp = own(own(own(own(own(v.shape).properties).changes).items).properties);
function enumOf(p) {
	var e = own(p)["enum"], out = [];
	if (Array.isArray(e)) for (var i = 0; i < e.length; i++) if (typeof e[i] === "string" && e[i]) out.push(e[i]);
	return out;
}
function joined(a, b, not) {
	var out = [], all = a.concat(b);
	for (var i = 0; i < all.length; i++) if (out.indexOf(all[i]) < 0 && not.indexOf(all[i]) < 0) out.push(all[i]);
	return out;
}
// 🚧 RF fix 8: a hero's health, level and class are the rules' attributes —
// named only where the session's rules keep them (borrowed or their own:
// the gist's \`keeps\`, beside the reply schema's own); the place is the host's.
var ruled = enumOf(cp.attribute).concat(Array.isArray(gist.keeps) ? gist.keeps : []), mine = [];
for (var m0 = 0; m0 < MINE.length; m0++) {
	var key0 = MINE[m0];
	if (key0 === PLACE_KEY || (ruled.indexOf(key0) >= 0 && (counted || key0 !== LEVEL_KEY))) mine.push(key0);
}
var attributes = joined(enumOf(cp.attribute), mine, NOT_FOR_DELTAS);
// The ruleset's entry types and the crawl's lists — never a way out, which
// is written inside its place.
var notTypes = ["exits"];
if (gist.exits && text(gist.exits.entryType)) notTypes.push(text(gist.exits.entryType));
var types = joined(enumOf(cp.entryType), LISTS, notTypes);
var ops = [];
for (var o0 = 0; o0 < OPS.length; o0++) if (counted || (OPS[o0] !== "hit" && OPS[o0] !== "traverse")) ops.push(OPS[o0]);
// The rules' own words for their attributes — none when they name none.
var said = enumOf(cp.attribute).length ? text(own(cp.attribute).description) : "";
var delta = {
	type: "object",
	properties: {
		owner: { type: "string", description: "Whose: a reference from this round's list, a place's, or world." },
		changes: { type: "string", "enum": ["attribute", "entry"], description: "A field's value, or an entry gained, lost or used." },
		attribute: {
			type: "string", "enum": attributes.concat([""]),
			description: "The field it changes, empty for an entry" + (said ? " — " + said.replace(/^The attribute — /, "").replace(/; empty for an entry\\.$/, "").replace(/\\.$/, "") : "") + "; the character's own: " + mine.join(", ") + "."
		},
		entryType: {
			type: "string", "enum": types.concat([""]),
			description: "The kind of entry gained, lost or used, empty for a field."
		},
		op: { type: "string", "enum": ops },
		value: { type: "string", description: "An amount (add, spend), or the new value (set); empty for an entry." },
		name: { type: "string", description: "The entry: its library id or its name — a spell slot by its level; empty for a field." }
	},
	required: ["owner", "changes", "attribute", "entryType", "op", "value", "name"],
	additionalProperties: false
};
if (counted) {
	var keys = Array.isArray(gist.decidingKeys) ? gist.decidingKeys : [];
	delta.properties.check = { type: "string", "enum": [""].concat(keys), description: "The check a risky action calls for, by the rules' own name; empty when none." };
	delta.properties.against = { type: "integer", description: "The difficulty a check is against; 0 when none." };
	delta.properties.aimedAt = { type: "string", description: "hit or use: who it is aimed at — a reference from this round's list, or a foe by name. Empty when none." };
	delta.required.push("check", "against", "aimedAt");
}
delta.properties.reason = { type: "string" };
delta.required.push("reason");
// A way out: the draft's own parts, its kinds and standings the ruleset's.
var exit = copy(EXIT_FRAME);
var xf = own(own(gist.exits).fields);
if (xf.way) exit.properties.way = copy(xf.way);
if (xf.state) exit.properties.state = copy(xf.state);
var trapSaid = text(own(own(own(xf.trap).properties).condition).description);
if (trapSaid) exit.properties.trapCondition = { type: "string", description: trapSaid + " Empty when none." };
if (!exitsCounted) {
	var keep = [];
	for (var r0 = 0; r0 < exit.required.length; r0++) if (COUNTED_EXIT.indexOf(exit.required[r0]) < 0) keep.push(exit.required[r0]);
	exit.required = keep;
	for (var c0 = 0; c0 < COUNTED_EXIT.length; c0++) delete exit.properties[COUNTED_EXIT[c0]];
}
var room = {
	type: "object",
	properties: { id: { type: "string" }, name: { type: "string" }, description: { type: "string" }, exits: { type: "array", maxItems: 6, items: exit } },
	required: ["id", "name", "description", "exits"],
	additionalProperties: false
};
var want = text(v.want) === "edits" || text(v.want) === "genesis" ? text(v.want) : "turn";
var out = copy(FRAMES[want]);
if (want !== "genesis") out.properties.deltas.items = delta;
if (want === "turn") out.properties.world.properties.rooms.items = room;
else out.properties.rooms.items = room;
return out;
`,
)
