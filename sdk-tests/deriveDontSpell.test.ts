/**
 * 🚧 **Derive, don't spell** (A18, R30, R35), held as a census over the core
 * catalogue's own source: core builds its pipelines from the typed scope and
 * declared objects, never from hand-spelled node paths. Counted, comments
 * stripped:
 *
 *  - `at($, '…')` — a node read by a dotted string (the retired core-catalog
 *    helper); the scope reads `$.crib.main`, or `$.reckon.on.crib.main`
 *    across chains;
 *  - `($: any)` — a scope typed `any`, which turns every read after it back
 *    into an unchecked path;
 *  - a builder callback typed `any` — `(j: any) =>` — which drops the node
 *    map for everything the callback builds;
 *  - a junction branch's `path: '…'` — the typed path `(v: Reckoned) =>
 *    v.scripts` records the same stored string;
 *  - `node: '…'` in a config reference — `slot.prompts($.context)` names the
 *    node by its accessor.
 *
 * Each count may not rise above its allowance (`ALLOWED`), and an allowance
 * that is no longer used fails too, so the list only shrinks. An allowed
 * occurrence carries a `derive-don't-spell: <why>` comment where it stands;
 * the census of those comments is printed for the conformance allow-list.
 * @ruling A18, R30, R35
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const SRC = resolve(import.meta.dirname, '..', 'core-catalog', 'src')

/** The patterns, by the name the allowances use. */
const PATTERNS = {
	'at($, …)': /\bat\(\s*\$\s*,/g,
	'($: any)': /\(\s*\$\s*:\s*any\s*\)/g,
	'builder callback typed any':
		/\.(?:when|otherwise|junction|each|loop|gather|chain|defaults|preset|repeatWhile|task|query|oracle|outlet|inlet)\([^()]*?\(\s*\w+\s*:\s*any\s*\)\s*=>/g,
	"junction path: '…'": /\.when\(\s*['`][^'`]*['`]\s*,\s*\{[^}]*?\b(?:path|equalsPath)\s*:\s*['`]/g,
	"config node: '…'": /\bslot\.\w+\(\s*\{\s*node\s*:\s*['`]/g,
} as const

type PatternName = keyof typeof PATTERNS

/**
 * What may remain, by file — each with the reason the types cannot say it
 * without a runtime change. Lane 9 reads this as the conformance allow-list.
 */
const ALLOWED: ReadonlyArray<{ file: string; pattern: PatternName; count: number; why: string }> = [
	// 2026-10-21 (the Lair's rewrite): `lair-respond`'s one allowance left with
	// it — a character turn keeps no books, so it names no later keeper prompt.
	// 2026-10-23 (RF fix 3): Story's two commit arms' allowance (genres GM) left
	// with them — the commit runs after the `reply` junction now, where the
	// scope types the branches' nodes (`$.reply.changes.owners.main`).
	// 2026-10-23 (genres GM): the Dungeon Crawler's Rest, one body for two ways in (lane G3, S3).
	{
		file: 'genres/dungeon-crawler/rest.ts',
		pattern: '($: any)',
		count: 19,
		why: "one rest body (`restBody`) mounted on two heads — a person's press (`core:inlet/user-message@1`) and the routine on `rest-taken` (`core:inlet/routine@1`, which publishes the moment's `cause` and the session's `ruleset` without declaring them as ports) — so its scope is a union no chain types until the routine inlet declares those ports",
	},
	{
		file: 'genres/dungeon-crawler/rest.ts',
		pattern: 'builder callback typed any',
		count: 2,
		why: "the same rest body's junction and its first arm: their chain is either head's, as above",
	},
	{
		file: 'genres/dungeon-crawler/story.ts',
		pattern: '($: any)',
		count: 1,
		why: "the Planner's grammar read by the whole path its retry sees, under a branch (`fresh` | `words`) chosen when the graph is built — a key the scope's type cannot index by a value",
	},
]

/**
 * 🚧 **Strings ruled to stay** (lane 9, 2026-10-21; A18, R30) — the conformance
 * allow-list for what the census above does not count. Each names something
 * that is NOT a declared object core-catalog can hand over, so the rule "a
 * string names a declared thing only where no object form exists" holds for
 * it: a step declared LATER in the same pipeline, a path into data, a node key
 * inside another declaration's values, a compiled module the registry may not
 * import. Each count is exact over the whole catalogue: a new occurrence is a
 * visible diff that has to fit one of these reasons (or earn an object form),
 * and a removed one lowers the count — the list only shrinks. `sdkGap` names
 * the SDK 1.0 follow-up that would retire the reason (PLAN-sdk-1.0 §4a).
 */
const RULED: ReadonlyArray<{
	name: string
	pattern: RegExp
	files?: RegExp
	count: number
	why: string
	sdkGap?: string
}> = [
	{
		name: 'forward config reference',
		pattern: /\bslot\.(?:connectionOf|samplingOf)\(\s*['`]/g,
		// 2026-10-21: 73 → 68 — the Lair's reply lost its party call and its keepers.
		count: 68,
		why: "a step's connection or sampling read off ANOTHER step, declared later in the same pipeline (an envoy's or a planner's call borrowing the reply's model) — the scope only holds steps declared before",
		sdkGap: 'a typed forward config reference (chain.keyOf of a later step)',
	},
	{
		name: 'draft node key',
		pattern: /\bDRAFT_NODE\b/g,
		count: 5,
		why: "summarize-scene's draft step, named once as a constant and read by the step that merges the drafts and by the scenes socket — the same forward reference, in one place",
		sdkGap: 'a typed forward config reference',
	},
	{
		name: 'data path in a model answer',
		pattern: /(?<!function\s)\b(?:jsonPart|textPart)\(/g,
		// 2026-10-21: 139 → 172 — the Lair's rewrite reads its script steps'
		// documents (the table, the turn, the dice, the room draft, the roll).
		// 2026-10-22: 172 → 173 — lair fix 2: the turn script's `plan`, the
		// plan as the turn plays it (its speakers filled), read for the turn plan.
		// 2026-10-23: 173 → 176 — the genres seams: the one change grammar's
		// schema the reckoning's crib writes (`reckon.on.schema`, G1), and the
		// Dungeon Crawler's Planner grammar and Rest read off their scripts (G3).
		count: 176,
		why: "each call picks one field of a model's JSON answer, or of a script step's document, or one text it carries ('notes', 'name'): a path into data a model or a script writes, which no declaration names",
	},
	{
		name: 'path into published state',
		pattern: /\bpath:\s*['`][a-z]/g,
		// 2026-10-21: 21 → 18 — the Lair's reply lost its keepers' and speakers' paths.
		// 2026-10-22: 18 → 19 — one more published-value read in the rulesets build (M2–M4).
		// 2026-10-23: 19 → 21 — *Replies carry changes* (D7): the reply's JSON
		// read for its `message` and its `changes` (`reply.changes.generate` / `.asked`).
		count: 21,
		why: "a step's `path` param reads the session's published values ('world.location') or a part of a value — data the host publishes, not a node; typed condition properties (sessionOf) cover conditions, not params",
	},
	{
		name: 'preset value node key',
		pattern: /\bvalues:\s*\{\s*['"]?[a-zA-Z]/g,
		files: /^seed\//,
		// 2026-10-22: 1 → 2 — a second preset change names a step (rulesets build).
		count: 2,
		why: "a preset's change names the step its values land on ('reading' on Story's reply) inside a registration's `values` — the SDK has no object form for another pipeline's step from outside its chain",
		sdkGap: 'a public chain.keyOf() / spec.nodes.<key> handle a preset can name',
	},
	{
		name: 'compiled UI module id',
		pattern: /\bcomponent:\s*['`]/g,
		files: /^registry\/widgets\.ts$/,
		count: 15,
		why: "a widget names its compiled component module by id: the component kit is built apart and never imports the registry (nor the registry the kit's modules)",
	},
]

/** The source, comments stripped — a pattern quoted in prose is not a use. */
function code(text: string): string {
	return text
		.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
		.replace(/(^|[^:'"`\\])\/\/[^\n]*/g, (m, lead: string) => lead + ' '.repeat(m.length - lead.length))
}

function sources(dir: string): string[] {
	const out: string[] = []
	for (const name of readdirSync(dir)) {
		const p = join(dir, name)
		if (statSync(p).isDirectory()) out.push(...sources(p))
		else if (p.endsWith('.ts') && !p.endsWith('.d.ts')) out.push(p)
	}
	return out
}

/** `file → pattern → count`, for every file with any. */
function census(): Map<string, Map<PatternName, number>> {
	const out = new Map<string, Map<PatternName, number>>()
	for (const p of sources(SRC)) {
		const text = code(readFileSync(p, 'utf8'))
		for (const [name, re] of Object.entries(PATTERNS) as Array<[PatternName, RegExp]>) {
			const n = (text.match(re) ?? []).length
			if (!n) continue
			const file = relative(SRC, p).split('\\').join('/')
			if (!out.has(file)) out.set(file, new Map())
			out.get(file)!.set(name, n)
		}
	}
	return out
}

describe("derive, don't spell — the core catalogue", () => {
	test('no file spells more than its allowance', () => {
		const over: string[] = []
		for (const [file, counts] of census())
			for (const [pattern, n] of counts) {
				const allowed = ALLOWED.find((a) => a.file === file && a.pattern === pattern)?.count ?? 0
				if (n > allowed) over.push(`${file}: ${n} × ${pattern} (allowed ${allowed})`)
			}
		assert.deepEqual(
			over,
			[],
			'Read the node through the scope ($.crib.main), name a branch path by a typed path ((v: T) => v.x), ' +
				'and hand a config reference the accessor (slot.prompts($.context)). Where the types truly cannot ' +
				"say it, mark the line `// derive-don't-spell: <why>` and add it to ALLOWED.",
		)
	})

	test('every allowance is still used — the list only shrinks', () => {
		const counts = census()
		const unused = ALLOWED.filter((a) => (counts.get(a.file)?.get(a.pattern) ?? 0) < a.count).map(
			(a) => `${a.file}: ${a.pattern} (allowed ${a.count}, found ${counts.get(a.file)?.get(a.pattern) ?? 0})`,
		)
		assert.deepEqual(unused, [], 'Lower the allowance: the occurrence it allowed is gone.')
	})

	test("each allowed file says why at the line (`derive-don't-spell:`)", () => {
		const missing = ALLOWED.filter(
			(a) => !readFileSync(join(SRC, a.file), 'utf8').includes("derive-don't-spell:"),
		).map((a) => a.file)
		assert.deepEqual(missing, [])
	})

	test("the census of `derive-don't-spell:` marks, for the conformance allow-list", () => {
		const marks: string[] = []
		for (const p of sources(SRC)) {
			const lines = readFileSync(p, 'utf8').split('\n')
			lines.forEach((line, i) => {
				const at = line.indexOf("derive-don't-spell:")
				if (at < 0) return
				const why = line.slice(at + "derive-don't-spell:".length).trim()
				assert.ok(why.length > 0, `${relative(SRC, p)}:${i + 1} names no reason`)
				marks.push(`${relative(SRC, p)}:${i + 1} — ${why}`)
			})
		}
		assert.ok(marks.length > 0)
		console.log(`derive-don't-spell marks (${marks.length}):\n  ${marks.join('\n  ')}`)
	})

	test('the strings ruled to stay are exactly as many as ruled — a new one needs a reason, a gone one lowers the count', () => {
		const counts = new Map<string, number>(RULED.map((r) => [r.name, 0]))
		for (const p of sources(SRC)) {
			const file = relative(SRC, p).split('\\').join('/')
			const text = code(readFileSync(p, 'utf8'))
			for (const r of RULED) {
				if (r.files && !r.files.test(file)) continue
				counts.set(r.name, counts.get(r.name)! + (text.match(r.pattern) ?? []).length)
			}
		}
		const off = RULED.filter((r) => counts.get(r.name) !== r.count).map(
			(r) => `${r.name}: ${counts.get(r.name)} (ruled ${r.count}) — ${r.why}`,
		)
		assert.deepEqual(
			off,
			[],
			'More: the new string must fit the ruled reason, or take an object form (A18). Fewer: lower the count.',
		)
		for (const r of RULED) assert.ok(r.why.length > 40, `${r.name} says why`)
	})
})
