/**
 * 🚧 **A drafted card or book, read out of a reply** (M2c path B, owner ruling 2026-10-31: no separate
 * classification call — the reply itself carries the draft). A reply that drafts a character card or a lorebook
 * ends with ONE hidden block, an HTML comment so the message renderer never shows it:
 *
 *     <!--draft:character {"name": "Mira", "description": "…", …}-->
 *     <!--draft:lorebook {"name": "The Lighthouse", "entries": [{ "name": "…", "content": "…", "keys": ["…"] }]}-->
 *
 * `readLibraryDraft` takes every such block out of the text (what the person reads, and what is saved), and reads
 * the LAST one: `make` names its kind and `draft` its parsed JSON. No block, an unknown kind, or JSON that does not
 * parse → `make: ''` and no `draft` (the blocks are still taken out). Pure; what `core:task/read-library-draft@1` runs.
 * It is also the Guide reply's cleanup step: draft blocks out, and a line that is exactly `See: /docs/<path>` (optionally in
 * backticks, optionally a trailing `.`) turned into a markdown link the message renderer draws.
 * ⚠ Not a tool call (`parse-tool-call@1`) and not `parse-json@1` (which reads a whole reply as JSON).
 * @experimental
 */
export type LibraryDraftKind = 'character' | 'lorebook'

/** @experimental */
export interface LibraryDraftRead {
	/** The reply without its draft blocks. */
	text: string
	/** The last block's kind, or `''` when there is none it could read. */
	make: LibraryDraftKind | ''
	/** The last block's JSON (an object), when `make` names a kind. */
	draft?: Record<string, unknown>
}

const BLOCK = /<!--\s*draft:([a-z-]+)\s*([\s\S]*?)-->/g
const SEE_LINE = /^See: ?`?(\/docs\/[^\s`]+?)`?\.?[ \t]*$/gm

/** @experimental */
export function readLibraryDraft(text: unknown): LibraryDraftRead {
	const s = typeof text === 'string' ? text : ''
	let last: { kind: string; body: string } | null = null
	for (const m of s.matchAll(BLOCK)) last = { kind: m[1]!, body: m[2]! }
	// A block the reply was cut off in (the response limit reached before its `-->`) is taken out too: it is no
	// draft anyone can read, and it must not be saved into the message.
	const closed = s.replace(BLOCK, '')
	const open = closed.search(/<!--\s*draft:/)
	const stripped = (open >= 0 ? closed.slice(0, open) : closed)
		.replace(/\n{3,}/g, '\n\n')
		.trimEnd()
		.replace(SEE_LINE, 'See: [$1]($1)')
	if (!last || (last.kind !== 'character' && last.kind !== 'lorebook')) return { text: stripped, make: '' }
	try {
		const draft = JSON.parse(last.body.trim()) as unknown
		if (!draft || typeof draft !== 'object' || Array.isArray(draft)) return { text: stripped, make: '' }
		return { text: stripped, make: last.kind, draft: draft as Record<string, unknown> }
	} catch {
		return { text: stripped, make: '' }
	}
}
