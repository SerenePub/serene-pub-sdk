/**
 * 🚧 **Scopes** — who is in reach (lane A2, 2026-10-23; PLAN-rulesets-functions
 * D4): everyone, the same place, within a tie, whoever it is aimed at. A scope
 * answers membership and never changes anything: its `members` handler
 * (listed under `derived`) is handed the subject, whom the moment is aimed
 * at, the owners (each with where it is, `location`) and the ties between
 * them, and answers `members` — owner keys, sorted. The host answers core's
 * four natively as well; these bodies say the same answer, so a package may
 * read, fork or replace them.
 *
 * What a `visibility` names besides a word (`holder` · `gm` · `everyone`),
 * and what a function binding of `to: 'scope'` is tied to. The interface says
 * **Who's in reach** (⚠ never a bare _scope_ — a lorebook's scope is another
 * word, R1).
 */
import { CORE_FUNCTION_IDS, defineFunction } from "@serene-pub/sdk"
import { body } from "./body.js"

/** The owners and the subject, from the host's envelope (or a test's `cast` / `source`). */
const OWNERS_JS = `
function ownersOf(input) { return input.owners || input.cast || []; }
function subjectOf(input) { return typeof input.subject === "string" ? input.subject : input.source && input.source.key ? input.source.key : null; }
function aimedOf(input) { return typeof input.aimedAt === "string" ? input.aimedAt : input.aimedAt && input.aimedAt.key ? input.aimedAt.key : null; }
function sorted(xs) { return xs.slice().sort(function (a, b) { return a < b ? -1 : a > b ? 1 : 0; }); }
function keysOf(owners) { var out = []; for (var i = 0; i < owners.length; i++) if (owners[i] && owners[i].key) out.push(owners[i].key); return out; }
`

/**
 * 🚧 **Everyone** — every owner the moment reads.
 * @experimental
 */
export const everyoneScopeFunction = defineFunction(CORE_FUNCTION_IDS.everyone, {
	name: { en: "Everyone" },
	meaning: { en: "Everyone in the story is in reach." },
	kind: "scope",
	prose: "It reaches everyone in the story, wherever they are.",
	phases: ["derived"],
	body: body(
		OWNERS_JS,
		`
export function members(input) { return { members: sorted(keysOf(ownersOf(input))) }; }
`
	)
})

/**
 * 🚧 **The same place** — the owners where the subject is (the subject
 * among them); somebody nowhere in particular shares a place with nobody
 * but themselves.
 * @experimental
 */
export const samePlaceScopeFunction = defineFunction(CORE_FUNCTION_IDS.samePlace, {
	name: { en: "The same place" },
	meaning: { en: "Whoever is in the same place is in reach." },
	kind: "scope",
	prose: "It reaches whoever is in the same place, and nobody elsewhere.",
	phases: ["derived"],
	body: body(
		OWNERS_JS,
		`
export function members(input) {
	var owners = ownersOf(input), subject = subjectOf(input), me = null, i;
	for (i = 0; i < owners.length; i++) if (owners[i] && owners[i].key === subject) me = owners[i];
	if (!me) return { members: [] };
	var here = me.location;
	if (here === undefined || here === null || here === "") return { members: [subject] };
	var out = [];
	for (i = 0; i < owners.length; i++) if (owners[i] && owners[i].key && owners[i].location === here) out.push(owners[i].key);
	return { members: sorted(out) };
}
`
	)
})

/**
 * 🚧 **Within a tie** — the owners a tie joins the subject to (a bond, kin, a
 * rival), either way round; with `types`, only ties of those types.
 * @experimental
 */
export const withinTieScopeFunction = defineFunction(CORE_FUNCTION_IDS.withinTie, {
	name: { en: "Within a tie" },
	meaning: { en: "Whoever has a tie with them — kin, a friend, a rival — is in reach." },
	kind: "scope",
	prose: "It reaches those they have a tie with — kin, friends, rivals — wherever they are.",
	form: { types: { type: "string[]", label: { en: "Only ties of" }, description: { en: "The kinds of tie that count. Left out: any." } } },
	phases: ["derived"],
	body: body(
		OWNERS_JS,
		`
export function members(input) {
	var subject = subjectOf(input), ties = input.ties || [], only = (input.options || {}).types, keys = keysOf(ownersOf(input)), out = [];
	if (!subject) return { members: [] };
	for (var i = 0; i < ties.length; i++) {
		var t = ties[i];
		if (!t || (only && only.length && only.indexOf(t.type) < 0)) continue;
		var other = t.from === subject ? t.to : t.to === subject ? t.from : null;
		if (other && keys.indexOf(other) >= 0 && out.indexOf(other) < 0) out.push(other);
	}
	return { members: sorted(out) };
}
`
	)
})

/**
 * 🚧 **Whoever it is aimed at** — the one the moment is aimed at (a whisper,
 * a gift, a blow), when they are present.
 * @experimental
 */
export const aimedAtScopeFunction = defineFunction(CORE_FUNCTION_IDS.aimedAt, {
	name: { en: "Whoever it is aimed at" },
	meaning: { en: "Only the one it is aimed at is in reach." },
	kind: "scope",
	prose: "It reaches only the one it is aimed at; nobody else hears or sees it.",
	phases: ["derived"],
	body: body(
		OWNERS_JS,
		`
export function members(input) {
	var aimed = aimedOf(input);
	return { members: aimed && keysOf(ownersOf(input)).indexOf(aimed) >= 0 ? [aimed] : [] };
}
`
	)
})

/** 🚧 Core's scope functions, as `CORE_SCOPE_IDS` lists them. @experimental */
export const SCOPE_FUNCTIONS = Object.freeze([samePlaceScopeFunction, withinTieScopeFunction, aimedAtScopeFunction, everyoneScopeFunction])
