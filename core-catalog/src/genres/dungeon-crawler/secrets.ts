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

import { slot } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import { DUNGEON_CRAWLER_PLANNER_KEY, PARLEY_CHANNEL } from './names.js'
import { DATA_TRANSFORM_KIND, DUNGEON_CRAWLER_PREAMBLE, type CoreScriptSeed } from './preamble.js'
import { at, jsonPart, scriptStep, textPart, type Wiring } from './calls.js'

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

/**
 * **Deliver the secrets** — a fragment for the story turn's branch: sort
 * `secrets` by lane (`core:script/dungeon-crawler-secrets`), then one
 * Planner line per secret on that player's lane, never one that lane was
 * already told. Node keys under `prefix` (`channel.story.`): `told` (the
 * Planner channel's rows), `secrets`, then `secret.due.list` and the
 * `secret.due.one` loop. Nothing is written when no secret has a lane.
 *
 * ```ts
 * deliverSecrets(s, w, 'channel.story.', {
 *   session: ($) => $.input.session,
 *   secrets: ($) => $.channel.story.plan.main, // the Planner JSON's `secrets`
 * })
 * ```
 * @experimental
 */
export const deliverSecrets = (
	c: any,
	w: Wiring,
	prefix: string,
	terms: { session: ($: any) => unknown; secrets: ($: any) => unknown },
) => {
	w.params.push([`${prefix}told`, { channel: PARLEY_CHANNEL, limit: DUNGEON_CRAWLER_SECRETS_TOLD_WINDOW }])
	const heard = c.query(
		'told',
		($: any) => C.sessionHistory.v1({ scope: $.input.sessionScope, params: slot.params() }),
		{ expose: { label: 'What the lanes were told' } },
	)
	return scriptStep(
		heard,
		w,
		prefix,
		'secrets',
		DUNGEON_CRAWLER_SECRETS_SCRIPT.seedKey,
		($) => ({ session: terms.session($), secrets: terms.secrets($), told: at($, `${prefix}told`).messages }),
		'Sort the secrets by player',
	).junction('secret', { on: ($: any) => at($, `${prefix}secrets`).main }, (j: any) =>
		j.when('due', { path: 'deliveries', truthy: true }, (d: any) =>
			jsonPart(d, w, `${prefix}secret.due.`, 'list', ($) => at($, `${prefix}secrets`).main, 'deliveries', 'The secrets, by lane').each(
				'one',
				{ over: ($: any) => at($, `${prefix}secret.due.list`).main, max: DUNGEON_CRAWLER_SECRETS_MAX },
				(m: any) => deliverOne(m, w, `${prefix}secret.due.one`),
			),
		),
	)
}

/** One secret: its lane, its line, and the Planner's row there. */
const deliverOne = (m: any, w: Wiring, clause: string) => {
	const item = ($: any) => at($, `${clause}.item`)
	const p = `${clause}.item.`
	const laned = textPart(m, w, p, 'lane', item, 'lane', "The secret's lane")
	return textPart(laned, w, p, 'line', item, 'text', 'The secret').outlet(
		'write',
		($: any) =>
			C.createMessage.v1({
				text: at($, `${p}line`).text,
				channel: at($, `${p}lane`).text,
				speaker: PLANNER as any,
			}),
		{ expose: { label: 'Tell one player a secret' } },
	)
}
