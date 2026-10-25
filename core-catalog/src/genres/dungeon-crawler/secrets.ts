/**
 * 🚧 Secrets for one player (PLAN-dungeon-crawler-2026-10-14, features 18–19,
 * D3): what one character learns that the others could not, delivered by the
 * Planner in that player's own Planner lane — never on the shared Story.
 *
 * The story turn's Planner JSON carries them as `secrets[]`
 * (`DungeonCrawlerSecret`, `DUNGEON_CRAWLER_SECRETS_SCHEMA` in `names.ts`),
 * and the story branch hands them to `deliverSecrets` — a fragment, not a
 * spec of its own, because nothing but that turn has them to deliver. An
 * empty or absent list writes nothing.
 *
 * Lane privacy is the server's (owner ruling 2026-10-17): `parley` is declared
 * `lanes: 'personal'`, so core sends each Planner lane to its person and the
 * session's owner alone — a secret never reaches another player's screen.
 */

import { slot, ITEM, type DataRef } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import { DUNGEON_CRAWLER_PLANNER_KEY, PARLEY_CHANNEL } from './names.js'
import { DATA_TRANSFORM_KIND, DUNGEON_CRAWLER_PREAMBLE, type CoreScriptSeed } from './preamble.js'
import { chainOf, jsonPart, on, readOn, scriptStep, textPart, type Chain, type ReadOn, type Wiring } from './calls.js'

/** The Planner, by reference — whose name a secret's line carries. */
const PLANNER = `envoy:${DUNGEON_CRAWLER_PLANNER_KEY}`

/** At most this many secrets a turn. @experimental */
export const DUNGEON_CRAWLER_SECRETS_MAX = 8

/**
 * How many of the Planner channel's newest rows (every lane) a delivery
 * checks for a secret already told. @internal
 */
export const DUNGEON_CRAWLER_SECRETS_TOLD_WINDOW = 400

/**
 * 🚧 `core:script/dungeon-crawler-secrets`: the secrets, sorted by lane.
 * Handed `{ session, secrets }`; each secret's `seat` is read as
 * `user:<id>`, `player-seat:<id>`, `character:<id>` (a seat with a card) or
 * — the model's habit — the seat's name. Returns `{ deliveries }`: one
 * `{ lane, text }` per secret whose player has a Planner lane (core's lane
 * register, the settings document's `channelLanes` — `laneOf`), or `null`
 * when there is none. A secret for nobody at the table is dropped.
 *
 * **Told once** (2026-10-15): handed `told` — the Planner channel's newest
 * rows, every lane — a secret whose lane already holds a Planner row with
 * the very same line is not delivered again: a re-driven turn (a swipe,
 * a retry) or a Planner repeating what it already said never posts it
 * twice. A retake deletes the turn's own deliveries with the turn (they are
 * its yield), so the retaken turn tells them afresh.
 * @experimental
 */
export const DUNGEON_CRAWLER_SECRETS_SCRIPT: CoreScriptSeed = Object.freeze({
	typeId: DATA_TRANSFORM_KIND,
	seedKey: 'core:script/dungeon-crawler-secrets',
	name: 'Dungeon Crawler: secrets, by Planner lane',
	// On the genre's one preamble (AUDIT C7): one seat reference, one player.
	source: `${DUNGEON_CRAWLER_PREAMBLE}
var seats = liveSeats(doc);
// A lane as the rows store it: a bare \`parley\` is lane 1.
function laneKey(c) { var t = text(c); return t === PARLEY + ":1" ? PARLEY : t; }
var told = {};
var rows = Array.isArray(v.told) ? v.told : [];
for (var r = 0; r < rows.length; r++) {
	var row = rows[r];
	if (!row || row.role === "user") continue;
	var said = text(row.content) || text(row.message);
	if (said) told[laneKey(row.channel) + "|" + said] = true;
}
function userFor(ref) {
	var m = /^user:(\\d+)$/.exec(ref);
	if (m) return Number(m[1]);
	for (var i = 0; i < seats.length; i++) if (ref === seatRefOf(seats[i])) return userOf(seats[i]);
	var name = ref.toLowerCase();
	for (var j = 0; j < seats.length; j++) if (name && seatNameOf(seats[j]).toLowerCase() === name) return userOf(seats[j]);
	return null;
}
var secrets = Array.isArray(v.secrets) ? v.secrets : [];
var out = [];
for (var k = 0; k < secrets.length && out.length < ${DUNGEON_CRAWLER_SECRETS_MAX}; k++) {
	var s = own(secrets[k]);
	var line0 = text(s.text);
	if (!line0) continue;
	var user = userFor(text(s.seat));
	if (user === null) continue;
	var lane = laneOf(doc, user);
	if (!lane) continue;
	var line = "For you alone: " + line0;
	var key = laneKey(lane) + "|" + line;
	if (told[key]) continue;
	told[key] = true;
	out.push({ lane: lane, text: line });
}
return { deliveries: out.length ? out : null };
`.trim(),
	varsIn: Object.freeze(['value']),
	varsOut: Object.freeze(['value']),
})

/** What the secrets' sort hands its junction (`core:script/dungeon-crawler-secrets`). */
interface Sorted {
	readonly deliveries: unknown
}

/**
 * **Deliver the secrets** — a fragment for the story turn's branch: sort
 * `secrets` by lane (`core:script/dungeon-crawler-secrets`), then one
 * Planner line per secret on that player's lane, never one that lane was
 * already told. Node keys on the chain it is handed: `told` (the Planner
 * channel's rows), `secrets`, then `secret.due.list` and the `secret.due.one`
 * loop. Nothing is written when no secret has a lane.
 *
 * ```ts
 * deliverSecrets(k, w, {
 *   session: ($) => $.input.session,
 *   secrets: ($) => $.list.main, // the round's secrets, on this chain
 * })
 * ```
 * @experimental
 */
export const deliverSecrets = <B extends Chain>(
	c: B,
	w: Wiring,
	terms: { session: ReadOn<B>; secrets: ReadOn<B> },
): B => {
	w.params.push([on(c, 'told'), { channel: PARLEY_CHANNEL, limit: DUNGEON_CRAWLER_SECRETS_TOLD_WINDOW }])
	const sorted = scriptStep(
		chainOf(c).query('told', ($) => C.sessionHistory.v1({ scope: $.input.sessionScope, params: slot.params() }), {
			expose: { label: 'What the lanes were told' },
		}),
		w,
		'secrets',
		DUNGEON_CRAWLER_SECRETS_SCRIPT.seedKey,
		($) => ({ session: terms.session($ as never), secrets: terms.secrets($ as never), told: $.told.messages }),
		'Sort the secrets by player',
	)
	/** The sorted secrets, for the branch below. */
	const secrets: DataRef = readOn(sorted, ($) => $.secrets.main)
	sorted.junction('secret', { on: secrets }, (j) =>
		j.when('due', { path: (v: Sorted) => v.deliveries, truthy: true }, (d) =>
			jsonPart(d, w, 'list', () => secrets, 'deliveries', 'The secrets, by lane').each(
				'one',
				{ over: ($) => $.list.main, max: DUNGEON_CRAWLER_SECRETS_MAX },
				/** One secret: its lane, its line, and the Planner's row there. */
				(m) =>
					textPart(textPart(m, w, 'lane', ($) => $[ITEM], 'lane', "The secret's lane"), w, 'line', ($) => $[ITEM], 'text', 'The secret').outlet(
						'write',
						($) =>
							C.createMessage.v1({
								text: $.line.text,
								channel: $.lane.text,
								speaker: PLANNER as any,
							}),
						{ expose: { label: 'Tell one player a secret' } },
					),
			),
		),
	)
	return c
}
