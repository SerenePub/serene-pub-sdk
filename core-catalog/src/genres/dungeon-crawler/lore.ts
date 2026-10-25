/**
 * 🚧 Dungeon Crawler's **world, in the session's own lorebook** (rulesets
 * W3-B, PLAN-rulesets §26, 2026-10-16). The world is no longer a JSON
 * document in the annex: genesis and every story turn write it as entries
 * of the session's lorebook — which, for a session with no lorebook (every
 * Dungeon Crawler session: it has none), is the session's own, made on the
 * first write and invisible until *Create lorebook from session*.
 *
 *  - a **place** is a `core:entry/location` entry; each way out between two
 *    places is a link (`leads to`, both ways) — the places graph;
 *  - a **person** the party may meet is a `core:entry/character-lore` entry
 *    (no card: R23 — a lorebook entry is not a library character);
 *  - a **fallen hero**'s cairn is a `core:entry/history` entry, its epitaph.
 *
 * Every write goes through `core:outlet/create-lore-entry@1` and
 * `core:outlet/link-lore-entries@1`, which the host routes to the session's
 * own lorebook and stamps with the run's turn message — so a retake or a
 * delete of the turn takes its places, people and cairns with it, and there
 * is no snapshot to keep.
 *
 * The turn reads the world back through three `core:query/lorebook-entries@1`
 * listings (places with their links, people, the fallen); the scripts read
 * them with `placesOf` / `peopleOf` / `fallenOf` (`storyScripts.ts`).
 *
 * ⏳ Not yet written: a place's or a person's text changed after it exists
 * (no outlet amends an entry), and a person's binding (no outlet binds an
 * entry to a cast member), and a new way out between two places already in
 * the book. New places (with their ways out), people and cairns only.
 */

import { slot, ITEM, type DataRef } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import { chainIf, chainOf, jsonPart, later, textPart, type Chain, type ReadOn, type Wiring } from './calls.js'
import { bareEntryTypeId, characterLoreEntryType, historyEntryType, locationEntryType } from '../../registry/entries.js'

/** The entry types the world writes, bare (the type's version is its own column). @internal */
export const DUNGEON_CRAWLER_ENTRY_TYPES = Object.freeze({
	place: bareEntryTypeId(locationEntryType),
	person: bareEntryTypeId(characterLoreEntryType),
	fallen: bareEntryTypeId(historyEntryType),
} as const)

/** The wording a way out says, read from either end. @internal */
export const DUNGEON_CRAWLER_WAY_WORDS = 'leads to'

/** The most places / people / cairns one write adds. @internal */
const MOST = Object.freeze({ places: 8, people: 6, fallen: 8 })

/**
 * 🚧 **One exit model** (AUDIT A12, 2026-10-17): a way out is written INSIDE
 * the place it leaves — `rooms[].exits[]`, each `{ to, way, state, lockDc,
 * trap, trapDc, trapDamage, trapCondition, minutes }` — by genesis and by the
 * story turn's Planner alike, never as a delta of its own. Exits were once
 * modelled twice (room exit names became links, and `exits` deltas became
 * pieces), and a new room's exit landed on the room the party stood in.
 *
 *  - a room that is NEW becomes a place, its exits links (`leads to`) whose
 *    description says the way and how it stands (`worldWrites`);
 *  - a room the book already holds keeps its entry; its exits become pieces
 *    of the rules' way-out entry type on that place's owner
 *    (`location:<id>`), a way of the same name replaced — a door that locks
 *    is the same door (`exitDeltas`, the turn script and the Planner's talk).
 *
 * Every member required (the grammar-compiling families); empty text and
 * `0` say "none". 🚧 What the rules' way out declares — the kinds of way, how
 * one stands, what a trap may leave — is laid in at run time from the
 * **session's** ruleset (lane G3, 2026-10-23, S4: `shape.ts`, the entry type
 * tagged `exit`, `RulesetGist.exits`), never from a ruleset the build holds;
 * free words where it has none. The draft's own parts (where it leads by
 * name, "none" as `0` or empty, a trap flattened) stay the draft's. ⏳ The
 * schemas spelled from Vis Itineris's exit piece at build
 * (`DUNGEON_CRAWLER_EXIT_SCHEMA`, `DUNGEON_CRAWLER_ROOM_SCHEMA` and their
 * words variants) are retired. Placeholders here: `way`, `state` and the
 * trap condition's sentence.
 * @internal
 */
export const DUNGEON_CRAWLER_EXIT_FRAME = Object.freeze({
	type: 'object',
	properties: {
		to: { type: 'string', description: 'The place it leads to, by name; empty when nobody knows yet.' },
		way: { type: 'string', description: 'What kind of way it is, in a word.' },
		state: { type: 'string', description: 'How it stands, in a word: open, shut, barred.' },
		lockDc: { type: 'integer', description: 'How hard the lock is to pick; 0 when none.' },
		trap: { type: 'string', description: 'A trap on it, in a few words; empty when none.' },
		trapDc: { type: 'integer', description: "How hard the trap is to spot or dodge; 0 when none." },
		// 🚧 What the trap does to whoever springs it (PLAN-dc-after-walk3
		// R2-1, owner ruling ★2): the table rolls it, never the Planner.
		trapDamage: { type: 'string', description: 'The harm the trap deals when it springs, like 1d6; empty when it deals none.' },
		trapCondition: { type: 'string', description: 'The condition the trap leaves on whoever springs it. Empty when none.' },
		minutes: { type: 'integer', description: 'How long crossing it takes; 0 when no time to speak of.' },
	},
	required: ['to', 'way', 'state', 'lockDc', 'trap', 'trapDc', 'trapDamage', 'trapCondition', 'minutes'],
	additionalProperties: false,
})

/** 🚧 What a way out at a table of words does not carry: its numbers, and a trap's rolled effect. @internal */
export const DUNGEON_CRAWLER_COUNTED_EXIT_KEYS: readonly string[] = Object.freeze(['lockDc', 'trapDc', 'trapDamage', 'trapCondition'])

/**
 * 🚧 The exit model in ES5, inside the preamble's scope:
 *
 *  - `roomsOf(raw, max)` — the rooms an answer carries, trimmed; an exit
 *    written as a bare name (an older answer) is `{ to }`, its way unsaid;
 *  - `exitName(e)` — a way's name: "Door to The Hall" ("Passage" when it
 *    leads nowhere named yet);
 *  - `exitStanding(e, numbers)` — how it stands, in words ("locked (DC 15)"),
 *    the DCs only at a counted rigour; 🚧 never its trap (Q2-3);
 *  - `exitDeltas(rooms, places, state)` → `{ deltas, owners }` — the exits of
 *    every room the book already holds, as `exits` pieces on its place, a
 *    held way of the same name removed first.
 * @internal
 */
export const DUNGEON_CRAWLER_EXITS_JS = `
function roomsOf(raw, max) {
	var out = [];
	var rr = Array.isArray(raw) ? raw : [];
	for (var r = 0; r < rr.length && out.length < max; r++) {
		var room = own(rr[r]);
		if (!text(room.name)) continue;
		var exits = [];
		var ex = Array.isArray(room.exits) ? room.exits : [];
		for (var e = 0; e < ex.length && exits.length < 6; e++) {
			var x = typeof ex[e] === "string" ? { to: ex[e] } : own(ex[e]);
			var to = text(x.to);
			if (!to && !text(x.way)) continue;
			exits.push({ to: to, way: text(x.way), state: text(x.state), lockDc: num(x.lockDc, 0), trap: text(x.trap), trapDc: num(x.trapDc, 0), trapDamage: text(x.trapDamage), trapCondition: text(x.trapCondition), minutes: num(x.minutes, 0) });
		}
		out.push({ id: text(room.id), name: text(room.name), description: text(room.description), exits: exits });
	}
	return out;
}
function exitName(e) {
	var way = text(e.way) || "door";
	way = way.charAt(0).toUpperCase() + way.slice(1);
	return text(e.to) ? way + " to " + text(e.to) : way;
}
function exitStanding(e, numbers) {
	var parts = [], st = text(e.state);
	function dc(x) { return numbers && num(x, 0) > 0 ? " (DC " + num(x, 0) + ")" : ""; }
	if (st && st.toLowerCase() !== "open") parts.push(st + (st.toLowerCase() === "locked" ? dc(e.lockDc) : ""));
	else if (!st && num(e.lockDc, 0) > 0) parts.push("locked" + dc(e.lockDc));
	// 🚧 A trap is never in words a player reads (PLAN-dc-after-walk2 Q2-3, the
	// walk's N12: "Door to The Vault, locked, trapped — poison needle" before
	// anyone looked): it is kept on the way (\`trap\`), where the Planner reads
	// it and a failed crossing springs it.
	return parts.join(", ");
}
// Whether a held way already stands as a newly written one would: where it
// leads, what kind of way, how it stands, its lock, trap and crossing time.
function sameWay(held, piece) {
	var h = own(held);
	var hp = h.kind === "inline" && h.props && typeof h.props === "object" ? own(h.props) : h;
	function trapOf(x) { var t = x && typeof x === "object" ? x : {}; return text(t.name) + "|" + num(t.dc, 0) + "|" + text(t.damage) + "|" + text(t.condition); }
	return text(hp.towards) === text(piece.towards) &&
		(text(hp.way) || "door") === (text(piece.way) || "door") &&
		text(hp.state).toLowerCase() === text(piece.state).toLowerCase() &&
		num(hp.lockDc, 0) === num(piece.lockDc, 0) &&
		trapOf(hp.trap) === trapOf(piece.trap) &&
		num(hp.travelMinutes, 0) === num(piece.travelMinutes, 0);
}
function exitDeltas(rooms, places, state) {
	var deltas = [], owners = [];
	function placeRef(name) {
		var n = text(name).toLowerCase();
		for (var i = 0; i < places.length; i++) if (places[i] && places[i].id !== null && (text(places[i].name).toLowerCase() === n || "location:" + places[i].id === n)) return "location:" + places[i].id;
		return null;
	}
	for (var r = 0; r < rooms.length; r++) {
		var ref = placeRef(rooms[r].name);
		if (!ref) continue;
		var m = /^location:(\\d+)$/.exec(ref);
		var bag = own(own(own(own(state).locations).byId)[m[1]]);
		var held = Array.isArray(bag["crawl-exits"]) ? bag["crawl-exits"] : [];
		for (var x = 0; x < rooms[r].exits.length; x++) {
			var e = rooms[r].exits[x];
			var name = exitName(e);
			// \`towards\` — where it leads — is required of every exit: the place
			// named, else the way's own name (a way nobody has followed yet).
			var standing = exitStanding(e, false);
			var piece = { kind: "inline", name: name, description: name + (standing ? ", " + standing : ""), towards: placeRef(e.to) || text(e.to) || name, way: e.way || "door" };
			if (e.state) piece.state = e.state;
			if (e.lockDc > 0) piece.lockDc = clamp(Math.round(e.lockDc), 1, 30);
			if (e.trap) {
				piece.trap = { name: e.trap, dc: clamp(Math.round(e.trapDc || 12), 1, 30) };
				// 🚧 Its own effect, rolled by the table on whoever springs it (R2-1, ★2):
				// the dice it deals, and the condition it leaves.
				var dmg = /\\d+d\\d+(?:\\s*[+-]\\s*\\d+)?/.exec(text(e.trapDamage));
				if (dmg) piece.trap.damage = text(e.trapDamage);
				if (text(e.trapCondition)) piece.trap.condition = text(e.trapCondition).toLowerCase();
			}
			if (e.minutes > 0) piece.travelMinutes = Math.round(e.minutes);
			var same = null;
			for (var h = 0; h < held.length; h++)
				if (held[h] && text(held[h].name).toLowerCase() === name.toLowerCase()) { same = held[h]; break; }
			// 🚧 A way listed again as it already stands changes nothing (P4-7,
			// the 100-turn walk #23: every re-listing "gained" its exits again).
			if (same && sameWay(same, piece)) continue;
			if (same) deltas.push({ owner: ref, op: "remove", repertoire: "exits", piece: text(same.name) });
			deltas.push({ owner: ref, op: "add", repertoire: "exits", piece: piece, reason: name });
			if (owners.indexOf(ref) < 0) owners.push(ref);
		}
	}
	return { deltas: deltas, owners: owners };
}
`

/**
 * 🚧 What a script hands the world writes — `worldWrites(placesNow,
 * peopleNow, rooms, npcs, numbers)` → `{ places, people }` (ES5, inside the
 * preamble's scope, after `DUNGEON_CRAWLER_EXITS_JS`):
 *
 *  - `places` — each room not yet a place, in order, `{ name, content,
 *    links }`, its `links` naming every way out to a place that exists by
 *    the time it is written (a place already in the book, or one written
 *    before it in this list) — so every link resolves in the entry's own
 *    commit; a link says the way and how it stands in its `description`
 *    ("Door to The Hall, locked (DC 15)" — DCs only when `numbers`);
 *  - ⏳ a way out between two places already in the book is not a link
 *    (`link-lore-entries@1`'s `from` is an entry id, which no step makes
 *    from a script's number) — it is an `exits` piece (`exitDeltas`);
 *  - `people` — each person not yet in the book, `{ name, content }`.
 *
 * A way out naming no place, and one the book already holds, is not written.
 * @internal
 */
export const DUNGEON_CRAWLER_WORLD_WRITES_JS = `
function worldWrites(placesNow, peopleNow, rooms, npcs, numbers) {
	var WAY = ${JSON.stringify(DUNGEON_CRAWLER_WAY_WORDS)};
	function key(x) { return String(x || "").trim().toLowerCase(); }
	var existing = {};
	for (var i = 0; i < placesNow.length; i++) existing[key(placesNow[i].name)] = placesNow[i];
	var linked = {};
	function pair(a, b) { return key(a) < key(b) ? key(a) + "|" + key(b) : key(b) + "|" + key(a); }
	for (var e = 0; e < placesNow.length; e++) for (var x = 0; x < placesNow[e].exits.length; x++) linked[pair(placesNow[e].name, placesNow[e].exits[x])] = true;
	var fresh = [];
	var order = {};
	for (var r = 0; r < rooms.length && fresh.length < ${MOST.places}; r++) {
		var nm = String(rooms[r].name || "").trim();
		if (!nm || existing[key(nm)] || order[key(nm)] !== undefined) continue;
		order[key(nm)] = fresh.length;
		fresh.push({ name: nm, content: String(rooms[r].description || "").trim() || nm, links: [] });
	}
	function known(n) { return !!existing[key(n)] || order[key(n)] !== undefined; }
	for (var q = 0; q < rooms.length; q++) {
		var from = String(rooms[q].name || "").trim();
		var exits = Array.isArray(rooms[q].exits) ? rooms[q].exits : [];
		for (var w = 0; w < exits.length; w++) {
			var way = exits[w];
			var to = String(way.to || "").trim();
			if (!from || !to || key(from) === key(to) || !known(from) || !known(to)) continue;
			var p = pair(from, to);
			if (linked[p]) continue;
			linked[p] = true;
			var fi = order[key(from)], ti = order[key(to)];
			// ⏳ Between two places already in the book: an \`exits\` piece, not a link.
			if (fi === undefined && ti === undefined) continue;
			// The later-written of the two carries the link, so its far end exists.
			var host = fi === undefined ? ti : ti === undefined ? fi : Math.max(fi, ti);
			var far = host === fi ? to : from;
			var link = { to: existing[key(far)] ? existing[key(far)].name : fresh[order[key(far)]].name, linkType: WAY, reverseLinkType: WAY };
			// The link says the way and how it stands ("Door, locked (DC 15)"),
			// read from either end — so never "to" one of them; a bare name
			// (an older answer) says nothing.
			var standing = exitStanding(way, numbers);
			var kind = text(way.way);
			if (kind || standing) link.description = (kind ? kind.charAt(0).toUpperCase() + kind.slice(1) : "A way") + (standing ? ", " + standing : "");
			fresh[host].links.push(link);
		}
	}
	var seen = {};
	for (var pn = 0; pn < peopleNow.length; pn++) seen[key(peopleNow[pn].name)] = true;
	var people = [];
	for (var n = 0; n < npcs.length && people.length < ${MOST.people}; n++) {
		var who = String(npcs[n].name || "").trim();
		if (!who || seen[key(who)]) continue;
		seen[key(who)] = true;
		var said = String(npcs[n].description || "").trim();
		if (npcs[n].mood) said = (said ? said + " " : "") + "Mood: " + String(npcs[n].mood).trim() + ".";
		people.push({ name: who, content: said || who });
	}
	return { places: fresh, people: people };
}
`

/** What the world writes branch on: a document whose lists are each null for none. */
interface WorldWrites {
	readonly places: unknown
	readonly people: unknown
	readonly fallen: unknown
}

/**
 * The world writes, on chain `c`, from a step whose output (`from`, read by
 * its FULL path, since the branches read it too) carries `places`, `people`
 * and `fallen` (each null for none) — three junctions in turn: places first
 * (each with its links, one commit), then people, then cairns. Node keys:
 * `<chain>.lorePlaces.new.*`, `<chain>.lorePeople.new.*`,
 * `<chain>.loreFallen.new.*`. Hands the chain back as it came: nothing after
 * reads them. Mounted on the story turn and on genesis, so its own steps are
 * typed as any chain's. @internal
 */
export const loreWrites = <B extends Chain>(c: B, w: Wiring, from: ReadOn<B>): B => {
	const read = ($: unknown) => from($ as never) as DataRef
	const writes = { place: later('write'), person: later('write'), cairn: later('write') }
	w.params.push([writes.place, { entryType: DUNGEON_CRAWLER_ENTRY_TYPES.place }])
	w.params.push([writes.person, { entryType: DUNGEON_CRAWLER_ENTRY_TYPES.person }])
	w.params.push([writes.cairn, { entryType: DUNGEON_CRAWLER_ENTRY_TYPES.fallen }])
	/** One entry, written from an `each` item: `name`, `content` and (a place) `links`. */
	const entry = (m: Chain, withLinks: boolean, label: string, noun: string) =>
		chainIf(
			withLinks,
			textPart(textPart(chainOf(m), w, 'name', ($) => $[ITEM], 'name', `The ${noun}'s name`), w, 'content', ($) => $[ITEM], 'content', `What the ${noun} says`),
			(named) => jsonPart(named, w, 'links', ($) => $[ITEM], 'links', 'Its ways out'),
		).outlet(
			'write',
			($) =>
				C.createLoreEntry.v1({
					name: $.name.text,
					content: $.content.text,
					...(withLinks ? { links: $.links.main } : {}),
					params: slot.params(),
				}),
			{ expose: { label } },
		)
	chainOf(c)
		.junction('lorePlaces', { on: read }, (j) =>
			j.when('new', { path: (v: WorldWrites) => v.places, truthy: true }, (k) =>
				jsonPart(k, w, 'list', read, 'places', 'The new places').each('place', { over: ($) => $.list.main, max: MOST.places }, (m) =>
					entry(writes.place.on(m), true, 'Write a place', 'place'),
				),
			),
		)
		.junction('lorePeople', { on: read }, (j) =>
			j.when('new', { path: (v: WorldWrites) => v.people, truthy: true }, (k) =>
				jsonPart(k, w, 'list', read, 'people', 'The new people').each('person', { over: ($) => $.list.main, max: MOST.people }, (m) =>
					entry(writes.person.on(m), false, 'Write a person', 'person'),
				),
			),
		)
		.junction('loreFallen', { on: read }, (j) =>
			j.when('new', { path: (v: WorldWrites) => v.fallen, truthy: true }, (k) =>
				jsonPart(k, w, 'list', read, 'fallen', 'The newly fallen').each('cairn', { over: ($) => $.list.main, max: MOST.fallen }, (m) =>
					entry(writes.cairn.on(m), false, 'Raise a cairn', 'cairn'),
				),
			),
		)
	return c
}
