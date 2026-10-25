/**
 * 🚧 A **seeded script row** (`pipeline_scripts`) as the catalogue declares
 * it, and the generic one every genre reads documents through (moved here
 * from `genres/dungeon-crawler/preamble.ts` and `scripts.ts` on 2026-10-23,
 * PLAN-genres-seams S5: Story, the Lair and `shared/calls.ts` all built their
 * rows with the Dungeon Crawler's helper). The old paths re-export each name,
 * so nothing that imports them moves; seed keys and sources are byte for byte
 * what they were.
 *
 * No imports: a genre's preamble, the rulesets' seeds and the shared builders
 * all read this, so it sits under every one of them.
 */

/** The kind every data-transform script here is. @experimental */
export const DATA_TRANSFORM_KIND = 'core:script:data/transform@1'

/** A seeded script row (`pipeline_scripts`), as `CORE_SCRIPTS` lists it. @experimental */
export interface CoreScriptSeed {
	/** Never change spelling — existing installs match on it. */
	seedKey: string
	typeId: string
	name: string
	source: string
	varsIn: readonly string[]
	varsOut: readonly string[]
}

/** A seeded data-transform row, reading and returning `value`. @internal */
export const seedScript = (seedKey: string, name: string, source: string): CoreScriptSeed =>
	Object.freeze({
		typeId: DATA_TRANSFORM_KIND,
		seedKey,
		name,
		source: source.trim(),
		varsIn: Object.freeze(['value']),
		varsOut: Object.freeze(['value']),
	})

/**
 * 🚧 `core:script/read-path`: one part of a document, by dotted path —
 * `{ from, path }` → the value at `from.<path>`, or `null`. The generic
 * reader the graph language lacks; the text twin is `join-text@1`'s `path`.
 * @experimental
 */
export const READ_PATH_SCRIPT = seedScript(
	'core:script/read-path',
	'Read a part of a document',
	`
var v = value || {};
var cur = v.from;
var path = typeof v.path === "string" ? v.path : "";
if (path) {
	var parts = path.split(".");
	for (var i = 0; i < parts.length; i++) {
		if (cur === null || cur === undefined || typeof cur !== "object") { cur = null; break; }
		cur = cur[parts[i]];
	}
}
return cur === undefined ? null : cur;
`,
)
