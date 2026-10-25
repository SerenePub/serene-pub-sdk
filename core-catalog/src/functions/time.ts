/**
 * 🚧 **Time and order** — what happens as time passes and who goes when
 * (lane A2, 2026-10-23): a value that moves each turn, round, scene or day; a
 * moment scheduled on the story clock; a deadline that passes; a turn order
 * from a value; actions in a turn; a rest.
 *
 * Time functions wake on the session events the host raises (D11:
 * `turn-ended`, `round-ended`, `scene-closed`, `story-clock-moved`) and read
 * the event's payload — a story clock's `{ from, to }`.
 */
import {
	defineFunction,
	NUMBER_ATTRIBUTE_KINDS,
	ROUND_ENDED_EVENT,
	SCENE_CLOSED_EVENT,
	STORY_CLOCK_MOVED_EVENT,
	TURN_ENDED_EVENT,
	type FieldDecl
} from "@serene-pub/sdk"
import { BASICS_JS, body, STORY_TIME_JS } from "./body.js"

/** A story time as an option: year, then month, day, hour, minute — each a whole number. */
const storyTimeOption = (label: string, description: string, required = false): FieldDecl => ({
	type: "object",
	label: { en: label },
	description: { en: description },
	...(required ? { required: true } : {}),
	fields: {
		year: { type: "integer", required: true, label: { en: "Year" } },
		month: { type: "integer", label: { en: "Month" } },
		day: { type: "integer", label: { en: "Day" } },
		hour: { type: "integer", min: 0, max: 23, label: { en: "Hour" } },
		minute: { type: "integer", min: 0, max: 59, label: { en: "Minute" } }
	}
})

/** Each period a recurring change comes round on, as the event it ends on. */
const PERIOD_EVENTS: Readonly<Record<string, string>> = Object.freeze({
	turn: TURN_ENDED_EVENT,
	round: ROUND_ENDED_EVENT,
	scene: SCENE_CLOSED_EVENT,
	day: STORY_CLOCK_MOVED_EVENT
})

/**
 * 🚧 **Each turn, round, scene or day** — a value moves by an amount each
 * time the period comes round (hunger grows each day, a fire burns down each
 * round). A day is a story-clock move onto another date.
 * @experimental
 */
export const recurringFunction = defineFunction("core:function/recurring@1", {
	name: { en: "Each turn, round, scene or day" },
	meaning: { en: "A value moves by an amount each time a period comes round — hunger each day, a fire each round." },
	kind: "time",
	bindings: { what: { to: "attribute", kinds: NUMBER_ATTRIBUTE_KINDS, label: { en: "Moves" } } },
	prose: "{{what}} moves on its own as time passes.",
	form: {
		every: {
			type: "enum",
			of: ["turn", "round", "scene", "day"],
			members: [
				{ key: "turn", label: { en: "Each turn" } },
				{ key: "round", label: { en: "Each round" } },
				{ key: "scene", label: { en: "Each scene" } },
				{ key: "day", label: { en: "Each day" } }
			],
			default: "scene",
			label: { en: "Every" }
		},
		by: { type: "integer", default: 1, label: { en: "By" }, description: { en: "How much it moves each time — negative to bring it down." } }
	},
	phases: ["effects"],
	body: body(
		BASICS_JS,
		`
var PERIOD_EVENTS = ${JSON.stringify(PERIOD_EVENTS)};
function daysPassed(clock) {
	if (!clock || !clock.from || !clock.to) return 0;
	var f = clock.from, t = clock.to;
	return num(f.year, 0) !== num(t.year, 0) || num(f.month, 0) !== num(t.month, 0) || num(f.day, 0) !== num(t.day, 0) ? 1 : 0;
}
export function effects(input) {
	var o = input.options || {}, ev = input.event, what = attrOf((input.bindings || {}).what);
	var every = o.every || "scene";
	if (!ev || !what || ev.id !== PERIOD_EVENTS[every]) return {};
	if (every === "day" && !daysPassed(payloadOf(ev).clock)) return {};
	var by = num(o.by, 1);
	if (!by) return {};
	return { deltas: [{ owner: ownerKey(input), attribute: what.id, op: "add", value: by, reason: "each " + every }] };
}
`
	)
})

/** The event a scheduled moment raises when the story clock reaches it. */
const SCHEDULED_EVENT = "core:event/scheduled-moment-reached@1"

/**
 * 🚧 **At a set story time** — when the story clock reaches a moment (the
 * festival at dawn on the third), it happens: a line the model reads, and
 * `scheduled-moment-reached` raised for whatever answers it.
 * @experimental
 */
export const scheduledFunction = defineFunction("core:function/scheduled@1", {
	name: { en: "At a set story time" },
	meaning: { en: "When the story clock reaches a set moment — the festival at dawn on the third — it happens." },
	kind: "time",
	adds: { events: [{ id: SCHEDULED_EVENT, name: { en: "A scheduled moment was reached" } }] },
	prose: "Some things happen at a set time, whatever anyone is doing; when the moment comes, it comes.",
	form: {
		at: storyTimeOption("At", "The story time it happens at.", true),
		happens: { type: "string", required: true, label: { en: "What happens" }, description: { en: "In a sentence the model reads when it comes." } }
	},
	emits: [SCHEDULED_EVENT],
	phases: ["effects"],
	body: body(
		BASICS_JS,
		STORY_TIME_JS,
		`
export function effects(input) {
	var o = input.options || {}, ev = input.event;
	if (!ev || ev.id !== "${STORY_CLOCK_MOVED_EVENT}" || !o.at || !crossed(payloadOf(ev).clock, o.at)) return {};
	return { lines: [o.happens], emits: [{ event: "${SCHEDULED_EVENT}", payload: { key: (input.function && input.function.key) || input.key || "" } }] };
}
`
	)
})

/** The event a deadline passing with its goal unmet raises. */
const DEADLINE_EVENT = "core:event/deadline-passed@1"

/**
 * 🚧 **A deadline** — a value must reach a goal by a story time (the ransom
 * gathered by the new moon); when the clock passes it short of the goal, the
 * deadline has passed — a line, and `deadline-passed` raised.
 * @experimental
 */
export const deadlineFunction = defineFunction("core:function/deadline@1", {
	name: { en: "A deadline" },
	meaning: { en: "Something must be done by a set time — the ransom gathered by the new moon — or the chance is gone." },
	kind: "time",
	bindings: { goal: { to: "attribute", kinds: NUMBER_ATTRIBUTE_KINDS, label: { en: "Must reach" } } },
	adds: { events: [{ id: DEADLINE_EVENT, name: { en: "A deadline passed" }, description: { en: "The story clock passed a deadline with its goal unmet." } }] },
	prose: "{{goal}} has to reach its mark in time; once the time is past, it is too late.",
	form: {
		by: storyTimeOption("By", "The story time it must be done by.", true),
		reach: { type: "integer", required: true, label: { en: "Reach" }, description: { en: "What the value must reach." } }
	},
	emits: [DEADLINE_EVENT],
	phases: ["effects"],
	body: body(
		BASICS_JS,
		STORY_TIME_JS,
		`
export function effects(input) {
	var o = input.options || {}, ev = input.event, goal = attrOf((input.bindings || {}).goal);
	if (!ev || ev.id !== "${STORY_CLOCK_MOVED_EVENT}" || !o.by || !goal || !crossed(payloadOf(ev).clock, o.by)) return {};
	if (typeof goal.value === "number" && goal.value >= o.reach) return {};
	return { lines: ["The time has passed: " + goal.id + " did not reach " + o.reach + "."], emits: [{ event: "${DEADLINE_EVENT}", payload: { key: (input.function && input.function.key) || input.key || "", owner: ownerKey(input) } }] };
}
`
	)
})

/**
 * 🚧 **Turn order from a value** — who goes first is whoever has the most of
 * a value (quickness, initiative), ties by name; with `lowestFirst`, the
 * least. Handed the whole cast's values, it answers the `order`.
 * @experimental
 */
export const turnOrderByFunction = defineFunction("core:function/turn-order-by@1", {
	name: { en: "Turn order from a value" },
	meaning: { en: "Whoever has the most of a value — quickness, initiative — goes first." },
	kind: "time",
	bindings: { by: { to: "attribute", kinds: NUMBER_ATTRIBUTE_KINDS, label: { en: "Ordered by" } } },
	prose: "Whoever has the most {{by}} goes first.",
	form: { lowestFirst: { type: "boolean", default: false, label: { en: "Lowest first" } } },
	phases: ["derived"],
	body: body(
		BASICS_JS,
		`
export function derived(input) {
	var by = attrOf((input.bindings || {}).by) || (idOf((input.bindings || {}).by) ? { id: idOf((input.bindings || {}).by) } : null);
	var cast = input.owners || input.cast || [], values = input.values || {};
	if (!by) return {};
	var low = (input.options || {}).lowestFirst === true, rows = [];
	for (var i = 0; i < cast.length; i++) {
		var c = cast[i];
		if (!c || !c.key) continue;
		var v = values[c.key] ? values[c.key][by.id] : undefined;
		rows.push({ key: c.key, name: c.name || c.key, v: typeof v === "number" ? v : -Infinity });
	}
	rows.sort(function (a, b) {
		if (a.v !== b.v) return low ? (a.v === -Infinity ? 1 : b.v === -Infinity ? -1 : a.v - b.v) : b.v - a.v;
		return a.name < b.name ? -1 : a.name > b.name ? 1 : a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
	});
	var order = [];
	for (var j = 0; j < rows.length; j++) order.push(rows[j].key);
	return { order: order };
}
`
	)
})

/**
 * 🚧 **Actions in a turn** — a turn holds so many actions, and a reaction
 * besides when the rules allow. Header-only: the engine reads the ruleset's
 * time section's turns; the model reads this.
 * @experimental
 */
export const actionsPerTurnFunction = defineFunction("core:function/actions-per-turn@1", {
	name: { en: "Actions in a turn" },
	meaning: { en: "A turn holds a set number of actions, and a reaction besides when the rules allow." },
	kind: "time",
	prose: "A turn holds a set number of actions; what does not fit waits for the next turn.",
	form: {
		perTurn: { type: "integer", min: 1, default: 1, label: { en: "Actions a turn" } },
		reaction: { type: "boolean", default: false, label: { en: "A reaction besides" } }
	}
})

/** 🚧 The event a rest raises — what a pool that refills on a rest listens for. @experimental */
export const REST_TAKEN_EVENT = "core:event/rest-taken@1"

/**
 * 🚧 **A rest** — someone stops to recover: every value it restores comes
 * back to its most, and `rest-taken` is raised (a pool that refills on a rest
 * listens for it). A person may invoke it (D6).
 * @experimental
 */
export const restFunction = defineFunction("core:function/rest@1", {
	name: { en: "A rest" },
	meaning: { en: "Stopping to recover brings back what rest restores — strength, nerve, spells." },
	kind: "time",
	bindings: { restores: { to: "attribute", kinds: NUMBER_ATTRIBUTE_KINDS, tags: ["resource"], many: true, label: { en: "Restores" } } },
	adds: { events: [{ id: REST_TAKEN_EVENT, name: { en: "A rest was taken" } }] },
	prose: "Resting takes time and brings back {{restores}}.",
	form: { rest: { type: "string", label: { en: "Which rest" }, description: { en: "The rest it is, by id — a short rest, a night's sleep." } } },
	emits: [REST_TAKEN_EVENT],
	invokable: { label: { en: "Rest" } },
	phases: ["effects"],
	body: body(
		BASICS_JS,
		`
export function effects(input) {
	if (!input.answer) return {};
	var who = whoOf(input), rs = attrsOf((input.bindings || {}).restores), out = { deltas: [], emits: [] };
	for (var i = 0; i < rs.length; i++)
		if (typeof rs[i].max === "number" && rs[i].value !== rs[i].max) out.deltas.push({ owner: who, attribute: rs[i].id, op: "set", value: rs[i].max, reason: "rested" });
	out.emits.push({ event: "${REST_TAKEN_EVENT}", payload: { owner: who, rest: (input.options || {}).rest || "" } });
	return out;
}
`
	)
})

/** 🚧 Core's time-and-order functions. @experimental */
export const TIME_FUNCTIONS = Object.freeze([
	recurringFunction,
	scheduledFunction,
	deadlineFunction,
	turnOrderByFunction,
	actionsPerTurnFunction,
	restFunction
])
