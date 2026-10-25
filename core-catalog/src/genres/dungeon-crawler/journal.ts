/**
 * 🚧 Dungeon Crawler's **journal** (PLAN-dungeon-crawler-2026-10-14, feature
 * 10, owner ruling 2026-10-14: one panel — the goal, open leads and the log).
 * The log is the table's: the Planner's summary filed by the books, never a
 * line the Narrator writes (AUDIT E).
 *
 * After each story turn, with no model call of its own:
 *
 *  - **the log** — the Planner's `roundSummary` (one past-tense, in-character
 *    sentence, written in the same JSON call that planned the round) is
 *    written as the round's `did` line on the `travelogue` folio — death's
 *    door only when the Planner wrote no summary — the way the Lair writes a
 *    plain line to a channel (`lair/fileRoom.ts`'s `said`); 🚧 beside it, the
 *    round's other lines by **kind** (PLAN-sheet-widget-redesign §16,
 *    `DUNGEON_CRAWLER_JOURNAL_KINDS`), each row's kind stored as
 *    `metadata.kind` through `create-message@1`'s `kind` in-port, which the
 *    Journal copy filters on (`rowKinds`). The folio is also the Planner's
 *    crib, which reads its newest forty lines (no copy is kept);
 *  - **the leads** — the `dungeon-crawler-journal` annex key's `leads` follow
 *    the Planner's `world.leads` (the whole open list, or empty to leave
 *    them). The goal stays as genesis or a new goal (`goal.ts`) wrote it.
 *
 * A summary near-identical to one of the folio's newest lines
 * (`SAME_JOURNAL_LINE_JS`, `JOURNAL_RECENT`) is not written. A swipe or an
 * extend writes no second log line (the turn's lines stand); a retake
 * deletes them with the rest of the turn's rows — each is anchored to the
 * Narrator's row.
 */

import { ITEM } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import { TRAVELOGUE_CHANNEL } from './names.js'
import { jsonPart, textPart, type Wiring } from './calls.js'
import type { StoryKept } from './story.js'

/**
 * 🚧 The Journal's line kinds (PLAN-sheet-widget-redesign §16), in the order
 * a round writes them: `did` (the round's summary), `found` (a new place),
 * `met` (a new person), `changed` (the rules' triggers — a condition ending,
 * a fuse — and death's door), `time` (the clock moved), `lead` (a lead new
 * to the list). Stored on each row as `metadata.kind`; the layout's Journal
 * copy names them all (`rowKinds`).
 * @experimental
 */
export const DUNGEON_CRAWLER_JOURNAL_KINDS = Object.freeze(['did', 'found', 'met', 'changed', 'time', 'lead'] as const)

/**
 * How many of the folio's newest lines a round's summary is held against
 * (`SAME_JOURNAL_LINE_JS`): since every kind is a row, the previous round's
 * summary is no longer the newest line — a `time` or a `lead` line follows
 * it — so the summary is checked against the last few, not the last one.
 * @internal
 */
const JOURNAL_RECENT = 12

/**
 * 🚧 **Near-identical journal lines** (owner screenshot 2026-10-15): two
 * lines whose letters and digits, lower-cased, are the same, or — both a
 * sentence of forty or more — within a quarter of the longer one's length by
 * edit distance: a reworded opening on the same sentence. A short line
 * ("Summary 2." · "Summary 3.") is near-identical only when it is the same.
 * Blank never matches. Kept simple on purpose: a Levenshtein over two short
 * sentences, one row at a time.
 * @internal
 */
export const SAME_JOURNAL_LINE_JS = `
function journalKey(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, ""); }
function sameJournalLine(a, b) {
	var x = journalKey(a), y = journalKey(b);
	if (!x || !y) return false;
	if (x === y) return true;
	var n = Math.max(x.length, y.length);
	if (n < 40) return false;
	if (Math.abs(x.length - y.length) > n / 4) return false;
	var prev = [], cur = [], i, j;
	for (j = 0; j <= y.length; j++) prev.push(j);
	for (i = 1; i <= x.length; i++) {
		cur = [i];
		for (j = 1; j <= y.length; j++)
			cur.push(Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x.charAt(i - 1) === y.charAt(j - 1) ? 0 : 1)));
		prev = cur;
	}
	return prev[y.length] <= n / 4;
}
`

/**
 * The ledger's journal part: `journal.leads`, the log line and the round's
 * journal lines by kind. Runs inside `core:script/dungeon-crawler-ledger`
 * over its variables (`plan`, `d`, `b`, `base`, `journal`, `writes`,
 * `applied`, `clockNext`). The previous round's line is the Journal folio's newest
 * (`b.log`) — the crib keeps no copy of it. @internal
 */
export const DUNGEON_CRAWLER_JOURNAL_JS = `
// ── The journal (journal.ts) ──
${SAME_JOURNAL_LINE_JS}
if (plan && plan.world.leads.length) journal.leads = plan.world.leads.slice(0, 6);
var said = [];
var dl = Array.isArray(d.deaths) ? d.deaths : [];
// 🚧 Death's door told as it stands (PLAN-dc-after-walk2 Q1-5, the walk's
// N10): a seat still rolling death saves lies dying, with its tally — it
// came back only once stable or up again.
for (var jd = 0; jd < dl.length; jd++) {
	var door = dl[jd];
	said.push(
		door.outcome === "dead" ? door.name + " fell." :
		door.outcome === "taken-out" ? door.name + " was taken out." :
		door.outcome === "dying" ? door.name + " lies dying (" + deathSaveWords(num(door.passed, 0), num(door.failed, 0)) + ")." :
		door.name + " came back from death's door."
	);
}
// The log takes ONE line a turn: the Planner's summary, which already tells
// the round (owner walkthrough 2026-10-15: "Ann went up the wall. Ann
// managed to climb the wall."). Death's door stands in only when the
// Planner wrote none.
var logLine = plan && plan.roundSummary ? plan.roundSummary : said.join(" ");
// A line that says a recent one again (owner screenshot 2026-10-15:
// "Jandir encountered the spectral form of Zyloth, who warned…" then
// "Jandir spoke with the ghost of Zyloth, who warned…") is not written:
// the round added nothing the journal does not already say. Held against
// the folio's newest lines, not its newest one: the previous round's
// summary is followed by that round's other kinds.
var recentLog = Array.isArray(b.log) ? b.log.slice(Math.max(0, b.log.length - ${JOURNAL_RECENT})) : [];
var repeats = false;
for (var jr = 0; jr < recentLog.length && !repeats; jr++) if (sameJournalLine(logLine, text(recentLog[jr]))) repeats = true;
var travelogue = b.fresh && logLine && !repeats ? logLine : null;
// 🚧 The Journal's kinds (PLAN-sheet-widget-redesign §16,
// DUNGEON_CRAWLER_JOURNAL_KINDS), every one from what the round already
// produced — no model call: \`did\` (the summary), \`found\` (a new place),
// \`met\` (a new person), \`changed\` (the handler's triggers — a condition
// ending, a fuse — and death's door), \`time\` (the clock moved), \`lead\` (a
// lead new to the list). Each is written as its own row with its kind
// (\`create-message@1\`'s \`kind\`, the respond spec's \`after.journal\`).
var journalLines = [];
if (travelogue) journalLines.push({ kind: "did", text: travelogue });
if (b.fresh) {
	for (var jf = 0; jf < writes.places.length; jf++) journalLines.push({ kind: "found", text: "Found " + writes.places[jf].name + "." });
	for (var jm = 0; jm < writes.people.length; jm++) journalLines.push({ kind: "met", text: "Met " + writes.people[jm].name + "." });
	var jo = Array.isArray(applied.outcomes) ? applied.outcomes : [];
	for (var jt = 0; jt < jo.length; jt++) if (own(jo[jt]).kind === "trigger" && text(own(jo[jt]).text)) journalLines.push({ kind: "changed", text: text(own(jo[jt]).text) + "." });
	// Death's door is a \`changed\` line — unless it already IS the round's
	// \`did\` line (the Planner wrote no summary): never said twice.
	if (!travelogue || (plan && plan.roundSummary)) for (var js = 0; js < said.length; js++) journalLines.push({ kind: "changed", text: said[js] });
	if (clockNext) journalLines.push({ kind: "time", text: clockLabel(b.clockBase) + " \u2192 " + clockLabel(clockNext) + "." });
	var leadsBefore = list(own(base.journal).leads, 6);
	var leadsNow = list(journal.leads, 6);
	for (var jl = 0; jl < leadsNow.length; jl++) if (leadsBefore.indexOf(leadsNow[jl]) < 0) journalLines.push({ kind: "lead", text: "New lead: " + leadsNow[jl] });
}
`

/**
 * The round's journal lines, in the story turn's `after.journal` branch (it
 * fired on the ledger's `journalLines`): `list` → one `line` each (`text`,
 * `kind`) → `write`, a whole row on the folio with its kind
 * (`metadata.kind`), in no voice — nobody speaks there — anchored to the
 * turn's row (the Narrator's) so a retake or a delete of the turn takes its
 * lines too. An `each` keys its members under `<clause>.item.`, read beside
 * the item.
 * @internal
 */
export const journalWrites = (c: StoryKept<'channel.story.after.journal'>, w: Wiring): StoryKept<'channel.story.after.journal'> =>
	jsonPart(c, w, 'list', ($) => $.channel.story.ledger.main, 'journalLines', "The round's journal lines").each(
		'line',
		{ over: ($) => $.list.main, max: 32 },
		(m) =>
			textPart(textPart(m, w, 'text', ($) => $[ITEM], 'text', 'The journal line'), w, 'kind', ($) => $[ITEM], 'kind', "The line's kind").outlet(
				'write',
				($) =>
					C.createMessage.v1({
						text: $.text.text,
						channel: TRAVELOGUE_CHANNEL,
						kind: $.kind.text,
						tableLine: $.channel.story.placeholder.messageId as any,
					}),
				{ expose: { label: 'Write a journal line' } },
			),
	)
