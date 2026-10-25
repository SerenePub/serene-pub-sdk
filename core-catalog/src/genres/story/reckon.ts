/**
 * 🚧 Story's background work, as **routines** (PLAN-layering §4, R5, R37;
 * 2026-10-20 — was the tail of `core:spec/story-respond`, behind the retired
 * background tasks' junctions): what the reckoning and the sweep ask, how
 * their answers are sorted, and the branches that file them. The pipelines
 * that run them are their own — `core:spec/story-reckoning` (`reckoning.ts`)
 * and `core:spec/story-sweep` (`sweep.ts`) — registered on cadences in the
 * Story genre's defaults; the reply is one call again.
 *
 *  - **the reckoning** — ONE JSON call after a round (or a turn: an
 *    administrator swaps the cadence, R36), when any of its duties is on (the
 *    Dungeon Crawler's Planner pattern: read the story's newest lines, emit
 *    changes). Its crib is the cast's sheets, those lines and the ruleset's
 *    voice; its answer is 🚧 the session's rules' own change grammar (S1 —
 *    `ruleset-resolve`'s `replySchema`, `STORY_RECKON_SCHEMA` its envelope).
 *    What the rules keep goes through the ruleset handler
 *    (`core:task/ruleset-resolve@1`, `apply` / `propose`); what they keep
 *    nothing of is written in words: resolved by name
 *    (`resolve-state-changes@1`) and applied when the routine's mode is
 *    **Full**, held as proposals when it is **Review**. The clock moves by the story's own time; a new place
 *    is filed with its ways out. Its grammar, its two scripts and its branch
 *    are every reckoning's — `shared/reckoning.ts` (2026-10-23, S5), which
 *    the Lair's keeper builds on too; this file re-exports them.
 *  - **the sweep** — ONE batched JSON call every few turns, when any of its
 *    duties is on: its prompt asks only for what the duties on write, and
 *    each answer lands through the writes core already has — a history entry
 *    for the summary, lore, people and places as lorebook entries (Full:
 *    written; Review: held at the write's review gate), the world's state as
 *    changes (applied or proposed), the goals as the session's note, how the
 *    characters stand as a graph proposal.
 *
 * Each duty is a switch on the routine's own duties step
 * (`core:task/reckoning-duties@1`, `core:task/sweep-duties@1`) — the
 * pipeline's own settings (A6) — and each publishes `modes` keyed as these
 * scripts and junctions always read them (`attributes`, `places-on-move`,
 * `world-state` …), so the seeded scripts read what they read before.
 *
 * Minimal drops both routines: one call a turn. Living registers both: the
 * reply, then the reckoning — two calls a turn, plus the sweep every few.
 * The host owns what a duty reads beyond the graph: *End what runs out*
 * (the ruleset handler's expiry) and *Mark goals reached* (the annex write).
 */

import { slot, ITEM, type ChainBuilder, type EntryDescriptor, type OutPortsOf } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import { STORY_PROMPT_KEYS } from '../../seed/prompts.js'
import { seedScript, type CoreScriptSeed } from '../../shared/scriptSeed.js'
import {
	jsonPart,
	modelCall,
	on,
	scriptStep,
	textPart,
	type BranchOf,
	type NodeOn,
	type Plus,
	type Wiring,
} from '../../shared/calls.js'
import { STORY_GENRE_ID } from '../../registry/genres.js'
import { STORY_GOALS_KEY } from '../../shared/annexField.js'
import {
	STORY_PREAMBLE,
	STORY_RECKON_CRIB_SCRIPT,
	STORY_RECKON_SCRIPT,
	type ReckonTerms,
} from '../../shared/reckoning.js'
import type { SweepDue } from './sweep.js'
import { fileLore, rememberNote } from '../../shared/lore.js'
import { characterLoreEntryType, historyEntryType, locationEntryType, worldLoreEntryType } from '../../registry/entries.js'

// 🚧 The reckoning's grammar, scripts and branch are every reckoning's (`shared/reckoning.ts`,
// 2026-10-23, PLAN-genres-seams S5: the Lair's keeper is the same graph); re-exported from their old home.
export {
	// 🚧 S1 (2026-10-23): the one change grammar, open — `STORY_DELTA_SCHEMA` retired.
	RECKON_CHANGE_SCHEMA,
	STORY_RECKON_SCHEMA,
	STORY_RECKON_CRIB_SCRIPT,
	STORY_RECKON_SCRIPT,
	reckonBranch,
	type ReckonTerms,
} from '../../shared/reckoning.js'

const NAMED = {
	type: 'object',
	properties: { name: { type: 'string' }, content: { type: 'string' } },
	required: ['name', 'content'],
	additionalProperties: false,
} as const

/**
 * 🚧 The sweep's answer — one member per sweep duty, each empty when its
 * duty is off or nothing changed: the story so far (`summary`), new lore,
 * new people (`cast`), the world's state, how the characters stand
 * (`relationships`), the places used (`scenes`), the running goals and whether
 * the story moved on to a new scene (`sceneMovedOn`: `{ moved, line, reason }`, the line numbered in the crib).
 * @experimental
 */
export const STORY_SWEEP_SCHEMA = {
	type: 'object',
	properties: {
		summary: NAMED,
		lore: { type: 'array', maxItems: 6, items: NAMED },
		cast: { type: 'array', maxItems: 4, items: NAMED },
		worldState: {
			type: 'array',
			maxItems: 6,
			items: {
				type: 'object',
				properties: { slot: { type: 'string' }, value: { type: 'string' } },
				required: ['slot', 'value'],
				additionalProperties: false,
			},
		},
		relationships: {
			type: 'array',
			maxItems: 6,
			items: {
				type: 'object',
				properties: { from: { type: 'string' }, to: { type: 'string' }, how: { type: 'string' } },
				required: ['from', 'to', 'how'],
				additionalProperties: false,
			},
		},
		scenes: { type: 'array', maxItems: 4, items: NAMED },
		goals: { type: 'string' },
		sceneMovedOn: { type: 'object', properties: { moved: { type: 'boolean' }, line: { type: 'integer' }, reason: { type: 'string' } }, required: ['moved', 'line', 'reason'], additionalProperties: false },
	},
	required: ['summary', 'lore', 'cast', 'worldState', 'relationships', 'scenes', 'goals', 'sceneMovedOn'],
	additionalProperties: false,
} as const

/** The Story scripts' one preamble (`shared/reckoning.ts`, the reckoning's): the sweep's scripts open on it too. */
const storySeed = (seedKey: string, name: string, body: string): CoreScriptSeed =>
	seedScript(seedKey, name, `${STORY_PREAMBLE}\n${body}`)

/**
 * 🚧 `core:script/story-sweep-crib`: what the sweep is asked. Handed
 * `{ session, state, modes, check, history }` (`check` the duties step's `sceneCheck`, `history` the
 * story's rows). Returns `{ crib, brief, fields }`: the crib
 * (the world as it stands and who is seated), the brief (each sweep duty
 * that is on, as its question, and that every other member stays empty) and the
 * prompt's named fields (`difficulty`).
 * @experimental
 */
export const STORY_SWEEP_CRIB_SCRIPT = storySeed(
	'core:script/story-sweep-crib',
	'Story: what the sweep is asked',
	`
var doc = own(v.session), state = own(v.state), modes = own(v.modes);
// The goals noted so far (the annex's \`story-goals\`), so the sweep ticks
// and adds rather than rewrites (lane 2: *Mark goals reached* reads a tick).
var goalsNow = text(own(own(doc.annex).core)["story-goals"]);
var people = peopleOf(doc), names = [];
for (var i = 0; i < people.length; i++) if (people[i].name) names.push(people[i].name);
var world = bagLine(own(state.world));
var asks = [];
if (modeOf(modes, "summary") !== "off") asks.push("summary: what happened since the last summary, as a history entry — { name: a short title, content: a few plain sentences }");
if (modeOf(modes, "lore") !== "off") asks.push("lore: facts about the world the story established that are worth remembering — places' histories, customs, objects — each { name, content }");
if (modeOf(modes, "cast") !== "off") asks.push("cast: people the story introduced who are not seated (" + (names.length ? "seated: " + names.join(", ") : "nobody is seated") + "), each { name, content: who they are, in a sentence or two }");
// 🚧 RF fix 8: the world's values are the session's own — the host's place and whatever the rules keep on the world — never a list the genre spells.
var worldKeys = [], tracked = Array.isArray(state.slots) ? state.slots : [];
for (var k = 0; k < tracked.length; k++) { var ts = own(tracked[k]); if (Array.isArray(ts.appliesTo) && ts.appliesTo.indexOf("world") >= 0 && ts.key && ts.type !== "derived") worldKeys.push(ts.key); }
if (modeOf(modes, "world-state") !== "off" && worldKeys.length) asks.push("worldState: what changed about the world — " + worldKeys.join(", ") + " (by those words; location is where the story is) — each { slot, value }");
if (modeOf(modes, "relationships") !== "off") asks.push("relationships: how two characters now stand with each other, each { from, to, how }");
if (modeOf(modes, "scenes") !== "off") asks.push("scenes: each place the story used, each { name, content: what it is like }");
if (modeOf(modes, "goals") !== "off") asks.push("goals: what the characters are after now, as a checklist — one goal a line, '- [ ] the goal' while it is open and '- [x] the goal' once the story has reached it; keep the goals already noted (" + (goalsNow ? "below" : "none yet") + "), tick the ones reached, add new ones");
// 🚧 Notice when the scene moves on (pass 7, R-i): asked only when the host's judged scene check is due; its lines are numbered for the answer.
var check = own(v.check), sceneLines = [];
if (modeOf(modes, "scene-moved-on") !== "off" && check.due === true && Array.isArray(check.lines) && check.lines.length) {
	var byId = {}, hist = Array.isArray(v.history) ? v.history : [], named = {};
	for (var h = 0; h < hist.length; h++) { var hr = own(hist[h]); if (hr.id !== undefined) byId[String(hr.id)] = hr; }
	for (var q = 0; q < people.length; q++) named[people[q].ref] = people[q].name;
	for (var n = 0; n < check.lines.length; n++) {
		var row = byId[String(check.lines[n])];
		var who = row ? (named["character:" + text(row.characterId)] || named["character:" + text(row.personaId)] || (row.role === "user" ? "A player" : "The narrator")) : "";
		var said = row ? text(row.content).split("\\n").join(" ").slice(0, 160) : "(not in view)";
		sceneLines.push("[" + (n + 1) + "] " + (who ? who + ": " : "") + said);
	}
	asks.push("sceneMovedOn: did the story move on to a new scene in the numbered lines — a new place, a jump in time, a new gathering, one matter ended and another begun? { moved: true or false, line: the number of the line the new scene begins at (0 when it did not move on), reason: why, in a few words — the party left the inn }");
}
return {
	crib: "The world: " + (world || "nothing tracked yet") + "." + (names.length ? "\\nSeated: " + names.join(", ") + "." : "") + (goalsNow && modeOf(modes, "goals") !== "off" ? "\\nThe goals so far:\\n" + goalsNow : "") + (sceneLines.length ? "\\n\\nThe lines since the last look, numbered:\\n" + sceneLines.join("\\n") : ""),
	brief: "Look back over the story so far and answer only these:\\n- " + asks.join("\\n- ") + "\\n\\nEvery other member stays empty: an empty list, empty text, or { moved: false, line: 0, reason: \\"\\" }.",
	fields: { difficulty: text(own(doc.fields).difficulty) || "normal" }
};
`,
)

/**
 * 🚧 `core:script/story-sweep`: the sweep's answer, sorted by duty and mode.
 * Handed `{ json, modes, check }`. Each list lands under `<member>Full` or
 * `<member>Review` by its duty's mode — absent when the duty is off or the
 * answer empty — so a junction reads which write runs: `summaryFull`,
 * `summaryReview` (one `{ name, content }`), `loreFull` · `loreReview`,
 * `castFull` · `castReview`, `scenesFull` · `scenesReview` (lists),
 * `worldFull` · `worldReview` (changes on the world: `{ owner: 'world',
 * slot, value }`), `goals` (text — a note, so Review writes it too) and
 * `relationships` (`{ from, to, how }` — a proposal either way: the graph
 * never applies itself, so Full and Review both file it on the Graph's
 * review screen, lane 2), `sceneCueFull` · `sceneCueReview` (one `{ at, channel, reason }`: the
 * new scene's first line, its lane and why — the model's numbered line mapped onto the check's own lines).
 * @experimental
 */
export const STORY_SWEEP_SCRIPT = storySeed(
	'core:script/story-sweep',
	'Story: what the sweep found',
	`
var j = own(v.json), modes = own(v.modes);
function named(x) { x = own(x); var n = text(x.name), c = text(x.content); return n && c ? { name: n, content: c } : null; }
function namedList(xs, max) { var out = []; if (!Array.isArray(xs)) return out; for (var i = 0; i < xs.length && out.length < max; i++) { var n = named(xs[i]); if (n) out.push(n); } return out; }
var out = {};
function put(member, task, value) {
	var m = modeOf(modes, task);
	if (m === "off" || !value || (Array.isArray(value) && !value.length)) return;
	out[member + (m === "full" ? "Full" : "Review")] = value;
}
put("summary", "summary", named(j.summary));
put("lore", "lore", namedList(j.lore, 6));
put("cast", "cast", namedList(j.cast, 4));
put("scenes", "scenes", namedList(j.scenes, 4));
var world = [];
if (Array.isArray(j.worldState)) for (var w = 0; w < j.worldState.length && world.length < 6; w++) {
	var s = own(j.worldState[w]);
	if (text(s.slot) && text(s.value)) world.push({ owner: "world", slot: text(s.slot), value: text(s.value) });
}
put("world", "world-state", world);
if (modeOf(modes, "goals") !== "off" && text(j.goals)) out.goals = text(j.goals);
if (modeOf(modes, "relationships") !== "off" && Array.isArray(j.relationships)) {
	var ties = [];
	for (var r = 0; r < j.relationships.length && ties.length < 6; r++) {
		var t = own(j.relationships[r]);
		if (text(t.from) && text(t.to) && text(t.how) && text(t.from).toLowerCase() !== text(t.to).toLowerCase())
			ties.push({ from: text(t.from), to: text(t.to), how: text(t.how) });
	}
	if (ties.length) out.relationships = ties;
}
// 🚧 Notice when the scene moves on: the model's numbered line, mapped onto the check's own lines (never further back).
var check = own(v.check), moved = own(j.sceneMovedOn), cueMode = modeOf(modes, "scene-moved-on");
var at = Math.floor(num(moved.line, 0));
if (cueMode !== "off" && check.due === true && moved.moved === true && Array.isArray(check.lines) && at >= 1 && at <= check.lines.length && text(moved.reason))
	out["sceneCue" + (cueMode === "full" ? "Full" : "Review")] = { at: check.lines[at - 1], channel: text(check.channel) || "main", reason: text(moved.reason).slice(0, 120) };
return out;
`,
)

/**
 * 🚧 `core:script/story-scene-reading`: *Read the scene* (`scene-reading`,
 * lane 2, 2026-10-19), the gate on what the reply's context builder is
 * handed. Handed `{ modes, state, places }` — the resolved duty modes, the
 * session's state and the lorebook's places with their ways out. On, it
 * passes the two on, and the builder makes `{{locationEntry}}` (the place
 * the world's `location` names: its name, what it is like, the ways from
 * here) and `{{knownLocations}}` — the variables a Story prompt row places
 * after its instructions. Off, it hands on nothing (`state: null`,
 * `places: []`), so the builder makes neither and the prompt is the bytes it
 * was. Writes nothing.
 * @experimental
 */
export const STORY_SCENE_READING_SCRIPT = storySeed(
	'core:script/story-scene-reading',
	'Story: read the scene',
	`
var on = modeOf(own(v.modes), "scene-reading") !== "off";
return on
	? { state: v.state && typeof v.state === "object" ? v.state : null, places: Array.isArray(v.places) ? v.places : [] }
	: { state: null, places: [] };
`,
)

/**
 * 🚧 `core:script/story-rest-crib`: what Story's **Rest** reads of the
 * session's rules (PLAN-genres-seams S3, 2026-10-23 — `TRACKED_SLOTS`
 * retired). Handed `{ ruleset, fields }` — the inlet's ruleset (its
 * `attributes`, with their tags) and the session's genre fields. Returns the
 * fields with `restores`: each attribute the rules tag `resource` — the ones
 * a rest brings back — as "Name (id), up to N", joined; empty when the rules
 * tag none, and the keeper's prompt says what a rest restores in words.
 * @experimental
 */
export const STORY_REST_CRIB_SCRIPT = storySeed(
	'core:script/story-rest-crib',
	'Story: what a rest brings back',
	`
var r = own(v.ruleset), out = own(v.fields), names = [];
var attrs = Array.isArray(r.attributes) ? r.attributes : [];
for (var i = 0; i < attrs.length; i++) {
	var a = own(attrs[i]), tags = Array.isArray(a.tags) ? a.tags : [];
	if (tags.indexOf("resource") < 0 || !text(a.id)) continue;
	var max = own(a.bounds).max;
	names.push((text(a.name) ? text(a.name) + " (" + text(a.id) + ")" : text(a.id)) + (typeof max === "number" ? ", up to " + max : ""));
}
out.restores = names.join("; ");
return out;
`,
)

/**
 * 🚧 `core:script/story-after-rest`: how far a rest the rules raised moves
 * Story's clock (GM 2026-10-23, G1 ★5; PLAN-genres-seams S3). Handed
 * `{ cause, ruleset }` — the routine's moment (`rest-taken`'s payload, its
 * `values.rest` the rest the rules raised) and the inlet's ruleset (its
 * `rests`, longest first, read at run time: `rulesetGistOf`). Returns a clock
 * step `{ by, unit }` in minutes: the raised rest's, else the rules' longest;
 * `by` 0 — no move — where they keep no rest, name one they do not keep, or
 * keep it without minutes (Wherewithal's).
 * @experimental
 */
export const STORY_AFTER_REST_SCRIPT = storySeed(
	'core:script/story-after-rest',
	'Story: how long the rest took',
	`
var cause = own(v.cause), raised = text(own(own(cause.payload).values).rest) || text(own(cause.values).rest);
var rests = Array.isArray(own(v.ruleset).rests) ? own(v.ruleset).rests : [];
var taken = null;
for (var i = 0; i < rests.length; i++) if (raised && text(own(rests[i]).id) === raised) taken = own(rests[i]);
if (!taken && !raised && rests.length) taken = own(rests[0]);
var minutes = taken ? Math.floor(num(taken.minutes, 0)) : 0;
return { by: minutes > 0 ? minutes : 0, unit: "minutes" };
`,
)

/**
 * 🚧 `core:script/story-reply-owners`: whose changes a reply that carries
 * them may name (PLAN-genres-seams S2, 2026-10-23 — found by the first end-to-
 * end run of *Replies carry changes*: with no owners the ruleset handler
 * refused every change as `unknown-owner`). Handed `{ session }`, the settings
 * document; returns the owners the ruleset handler resolves — the world
 * (`session:<id>`) and everyone seated and switched on, by reference — for
 * the reply schema (its `owner` words) and the commit.
 * @experimental
 */
export const STORY_REPLY_OWNERS_SCRIPT = storySeed(
	'core:script/story-reply-owners',
	'Story: whose changes a reply may carry',
	`
var doc = own(v.session), people = peopleOf(doc), out = ["session:" + text(doc.sessionId)];
for (var i = 0; i < people.length; i++) out.push(people[i].ref);
return out;
`,
)

/** 🚧 The Story scripts core seeds, in seed order. @experimental */
export const STORY_SCRIPTS: readonly CoreScriptSeed[] = Object.freeze([
	STORY_RECKON_CRIB_SCRIPT,
	STORY_RECKON_SCRIPT,
	STORY_SWEEP_CRIB_SCRIPT,
	STORY_SWEEP_SCRIPT,
	STORY_SCENE_READING_SCRIPT,
	STORY_REST_CRIB_SCRIPT,
	STORY_REPLY_OWNERS_SCRIPT,
	STORY_AFTER_REST_SCRIPT,
])

/**
 * 🚧 What the sweep's sort hands its junctions (`core:script/story-sweep`):
 * `<member>Full` or `<member>Review` by its duty's mode, absent when off or
 * empty; `goals` and `relationships` either way; `sceneCueFull` / `sceneCueReview` by the duty's mode. @internal
 */
interface Swept {
	readonly summaryFull: unknown
	readonly summaryReview: unknown
	readonly loreFull: unknown
	readonly loreReview: unknown
	readonly castFull: unknown
	readonly castReview: unknown
	readonly scenesFull: unknown
	readonly scenesReview: unknown
	readonly worldFull: unknown
	readonly worldReview: unknown
	readonly goals: unknown
	readonly relationships: unknown
	readonly sceneCueFull: unknown
	readonly sceneCueReview: unknown
}

/** Story's reckoning terms. @internal */
export const STORY_RECKON_TERMS: ReckonTerms = Object.freeze<ReckonTerms>({
	prompt: STORY_PROMPT_KEYS.reckon,
	ruleset: ($) => $.input.ruleset,
})

/** The nodes the sweep's lorebook writes read: the routine's inlet, and the sweep's sorted answer. */
type SweepSorted = ChainBuilder<
	{
		input: OutPortsOf<ReturnType<typeof C.routine.v1>>
		'sweep.due.swept': OutPortsOf<ReturnType<typeof C.runScript.v1>>
	},
	'sweep.due'
>

/**
 * Lorebook entries from a list, Full and Review alike — `<key>.full.*` /
 * `<key>.review.*` on the sweep's chain. Adds the junction to `c` and hands
 * `c` back as it came: nothing after reads it.
 */
const entryWrites = <B extends SweepSorted>(
	c: B,
	w: Wiring,
	review: NodeOn[],
	key: 'lore' | 'cast' | 'scenes',
	entryType: EntryDescriptor<string>,
	noun: string,
	max: number,
): B => {
	const sweep: SweepSorted = c
	sweep.junction(key, { on: ($) => $.swept.main }, (j) => {
		const arm = (b: BranchOf<typeof j, 'full' | 'review'>, mode: 'full' | 'review') => {
			return fileLore(b, w, {
				from: ($) => $.sweep.due.swept.main,
				member: `${key}${mode === 'full' ? 'Full' : 'Review'}`,
				listLabel: `The ${noun}s`,
				each: 'entry',
				noun,
				max,
				entryType,
				writeLabel: mode === 'full' ? `File the ${noun}` : `Hold the ${noun} for review`,
				review: mode === 'review' ? review : undefined,
			})
		}
		return j
			.when('full', { path: (v: Swept) => v[`${key}Full`], truthy: true }, (b) => arm(b, 'full'))
			.when('review', { path: (v: Swept) => v[`${key}Review`], truthy: true }, (b) => arm(b, 'review'))
	})
	return c
}

/** The sweep's branch — `sweep.due.*`; `review` collects the write steps the declared defaults hold at the review gate. @internal */
export const sweepBranch = (s: SweepDue, w: Wiring, review: NodeOn[]): Plus<SweepDue, 'sweepWrite', OutPortsOf<ReturnType<typeof C.generateJson.v1>>> => {
	const read = s.query('state', ($) => C.sessionState.v1({ scope: $.input.sessionScope }), {
		expose: { label: 'The world as it stands', status: 'Looking back over the story' },
	})
	const cribbed = jsonPart(
		textPart(
			textPart(
				scriptStep(read, w, 'crib', STORY_SWEEP_CRIB_SCRIPT.seedKey, ($) => ({
					session: $.input.session,
					state: $.state.state,
					modes: $.duties.modes,
					check: $.duties.sceneCheck,
					history: $.history.messages,
				}), 'What the sweep is asked', 'Looking back over the story'),
				w,
				'cribText',
				($) => $.crib.main,
				'crib',
				'The world, as text',
			),
			w,
			'brief',
			($) => $.crib.main,
			'brief',
			'What to look for',
		),
		w,
		'fields',
		($) => $.crib.main,
		'fields',
		"The sweep's prompt fields",
	)
	const asked = modelCall(cribbed, w, 'sweep', {
		prompt: STORY_PROMPT_KEYS.sweep,
		brief: ($) => $.brief.text,
		crib: ($) => $.cribText.text,
		fields: ($) => $.fields.main,
		cast: ($) => $.cast.cast,
		history: ($) => $.history.messages,
		schema: STORY_SWEEP_SCHEMA,
		briefTurn: true,
		expose: {
			status: 'Looking back over the story',
			// Not the routine's name, which titles its duties card (S7): two steps of one group never share a heading.
			label: 'File what is worth keeping',
			purpose:
				'Every few turns, looks back over the story and files what is worth keeping: a summary, new lore and people, the world as it now stands.',
		},
	})
	const sorted = scriptStep(asked, w, 'swept', STORY_SWEEP_SCRIPT.seedKey, ($) => ({
		json: $.sweepWrite.json,
		modes: $.duties.modes,
		check: $.duties.sceneCheck,
	}), 'What the sweep found, sorted', 'Looking back over the story')
	/** The summary — one history entry. */
	const summarized = sorted.junction('summary', { on: ($) => $.swept.main }, (j) => {
		const arm = (b: BranchOf<typeof j, 'full' | 'review'>, mode: 'full' | 'review') => {
			const member = mode === 'full' ? 'summaryFull' : 'summaryReview'
			const rv = (s: string) => (mode === 'review' ? `${s} (for review)` : s)
			return rememberNote(
				textPart(
					textPart(
						jsonPart(b, w, 'doc', ($) => $.sweep.due.swept.main, member, rv('The summary, as written')),
						w,
						'name',
						($) => $.doc.main,
						'name',
						rv("The summary's title"),
					),
					w,
					'content',
					($) => $.doc.main,
					'content',
					rv('The summary'),
				),
				w,
				{
					key: 'write',
					name: ($) => $.name.text,
					content: ($) => $.content.text,
					entryType: historyEntryType,
					review: mode === 'review' ? review : undefined,
					expose: { label: mode === 'full' ? 'File the summary' : 'Hold the summary for review' },
				},
			)
		}
		return j
			.when('full', { path: (v: Swept) => v.summaryFull, truthy: true }, (b) => arm(b, 'full'))
			.when('review', { path: (v: Swept) => v.summaryReview, truthy: true }, (b) => arm(b, 'review'))
	})
	const lored = entryWrites(summarized, w, review, 'lore', worldLoreEntryType, 'lore entry', 6)
	const peopled = entryWrites(lored, w, review, 'cast', characterLoreEntryType, 'person', 4)
	const placed = entryWrites(peopled, w, review, 'scenes', locationEntryType, 'location', 4)
	/** The world's state — changes on the world, applied on Full, proposed on Review. */
	const worlded = placed.junction('world', { on: ($) => $.swept.main }, (j) => {
		const arm = (b: BranchOf<typeof j, 'full' | 'review'>, mode: 'full' | 'review') => {
			if (mode === 'full') w.params.push([on(b, 'apply'), { mode: 'apply' }])
			return jsonPart(
				b,
				w,
				'changes',
				($) => $.sweep.due.swept.main,
				mode === 'full' ? 'worldFull' : 'worldReview',
				mode === 'review' ? "The world's changes (for review)" : "The world's changes",
			)
				.query('resolve', ($) =>
					C.resolveStateChanges.v1({
						changes: $.changes.main,
						base: $.sweep.due.state.version,
						scope: $.input.sessionScope,
					}),
				)
				.task(
					mode === 'full' ? 'apply' : 'propose',
					($) =>
						C.setState.v1({
							changes: $.resolve.changes,
							scope: $.input.sessionScope,
							base: $.sweep.due.state.version,
							params: slot.params(),
						}),
					{ expose: { label: mode === 'full' ? "Keep the world's state" : "Propose the world's state" } },
				)
		}
		return j
			.when('full', { path: (v: Swept) => v.worldFull, truthy: true }, (b) => arm(b, 'full'))
			.when('review', { path: (v: Swept) => v.worldReview, truthy: true }, (b) => arm(b, 'review'))
	})
	/**
	 * 🚧 How the characters stand (lane 2, 2026-10-19): the ties the sweep
	 * found, filed as a graph proposal on the lorebook's Graph review screen
	 * — the existing relationship proposal path. A proposal on Full and on
	 * Review alike: the graph never applies itself.
	 */
	const tied = worlded.junction('relationships', { on: ($) => $.swept.main }, (j) =>
		j.when('proposed', { path: (v: Swept) => v.relationships, truthy: true }, (b) =>
			jsonPart(b, w, 'ties', ($) => $.sweep.due.swept.main, 'relationships', 'How they stand').outlet(
				'propose',
				($) => C.graphProposal.v1({ proposal: $.ties.main }),
				{ expose: { label: 'Propose how they stand' } },
			),
		),
	)
	/**
	 * 🚧 Notice when the scene moves on (pass 7, R-i): the new scene the sweep found, as a scene cue
	 * (`propose-scene-cue@1`) — the session's scene mode decides from there; a Review sweep always
	 * asks (`ask`). Never behind the review gate: a cue's review is its chip.
	 */
	const cued = tied.junction('sceneCue', { on: ($) => $.swept.main }, (j) => {
		const arm = (b: BranchOf<typeof j, 'full' | 'review'>, mode: 'full' | 'review') => {
			const rv = (s: string) => (mode === 'review' ? `${s} (for review)` : s)
			if (mode === 'review') w.params.push([on(b, 'offer'), { ask: true }])
			const cue = jsonPart(b, w, 'cue', ($) => $.sweep.due.swept.main, mode === 'full' ? 'sceneCueFull' : 'sceneCueReview', rv('The new scene'))
			const at = jsonPart(cue, w, 'at', ($) => $.cue.main, 'at', rv('Where it begins'))
			const lane = textPart(at, w, 'lane', ($) => $.cue.main, 'channel', rv('Its lane'))
			return textPart(lane, w, 'reason', ($) => $.cue.main, 'reason', rv('Why it moved on')).outlet(
				'offer',
				($) => C.proposeSceneCue.v1({ at: $.at.main, channel: $.lane.text, reason: $.reason.text, params: slot.params() }),
				{ expose: { label: mode === 'full' ? 'Mark the new scene' : 'Suggest the new scene' } },
			)
		}
		return j
			.when('full', { path: (v: Swept) => v.sceneCueFull, truthy: true }, (b) => arm(b, 'full'))
			.when('review', { path: (v: Swept) => v.sceneCueReview, truthy: true }, (b) => arm(b, 'review'))
	})
	/** The goals — the session's running note (`annex.core['story-goals']`). */
	return cued.junction('goals', { on: ($) => $.swept.main }, (j) =>
		j.when('noted', { path: (v: Swept) => v.goals, truthy: true }, (b) =>
			textPart(b, w, 'text', ($) => $.sweep.due.swept.main, 'goals', 'The goals, as text').outlet(
				'write',
				($) =>
					C.setSessionAnnex.v1({
						value: { [STORY_GOALS_KEY]: $.text.text } as any,
						params: slot.params(),
					}),
				{ expose: { label: 'Keep the goals' } },
			),
		),
	)
}
