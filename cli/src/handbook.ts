/**
 * 🚧 The **handbook** generator (PLAN-rulesets-functions D8, 2026-10-23): a page players read, built
 * from the sentences a ruleset or genre already carries — each attribute's, entry type's and zone
 * type's `prose`, each function's meaning, the outcome words, the time unit — one section per
 * category, plus the author's own pages beside it (`handbook: [{ title, body }]`). An authored page
 * whose title matches a generated page replaces it ("edits here become your own page"); the rest
 * follow in the order written. Nothing here is rolled, hashed or sent to a model: it is documentation.
 *
 * Member words: the generated text never says ruleset, rigour, repertoire or piece.
 */
import {
	ATTRIBUTE_KINDS,
	attributeKindsInWords,
	functionBindingKinds,
	functionRefKey,
	i18nText,
	resolveFunctionRef,
	rulesetSections,
	type FunctionRef,
	type HandbookPage,
	type I18n,
} from '@serene-pub/sdk'

/** 🚧 One page the author writes beside the generated ones — the SDK's `HandbookPage` (`RulesetProps.handbook`, `GenreProps.handbook`). @experimental */
export type { HandbookPage }

/** 🚧 What a handbook is made from: a ruleset's or a genre's declaration, as far as it goes (the sections are read through `rulesetSections`). @experimental */
export interface HandbookInput {
	name?: I18n
	description?: I18n
	/** The author's own pages (the `handbook` field of a ruleset or genre). */
	handbook?: readonly HandbookPage[]
}

/** 🚧 One page of a rendered handbook. @experimental */
export interface HandbookDocPage {
	id: string
	title: string
	body: string
	source: 'generated' | 'authored'
}

/** 🚧 A rendered handbook: its pages in reading order and the whole as Markdown. @experimental */
export interface HandbookDocument {
	title: string
	pages: HandbookDocPage[]
	markdown: string
}

const en = (v: unknown): string => i18nText(v as I18n | undefined) ?? ''
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
const sentence = (s: string) => (/[.!?]$/.test(s.trim()) ? s.trim() : `${s.trim()}.`)

/** What a reader is told of the ways core decides, by the function's name segment. */
const WAYS: Readonly<Record<string, string>> = {
	judge: 'the table judges it, in words',
	'die-target': 'a die is rolled against a target',
	'dice-pool': 'a handful of dice is rolled and the successes counted',
	'card-draw': 'cards are drawn against a target',
	compare: 'one value is weighed against another, and nothing is rolled',
	spend: 'points are spent from a pool to buy the result',
	table: 'a die is rolled on a table',
	tally: 'points are added up',
}

function wayOf(ref: FunctionRef): string {
	const r = resolveFunctionRef(ref)
	const bound = Object.entries(ref.bindings ?? {}).map(([, v]) => (Array.isArray(v) ? v.join(', ') : String(v)))
	// 🚧 An entry field selector reads as its field on its entry: `bond.affection` → affection on a bond (ties T3).
	const words = (v: string) => (/^[a-z0-9-]+\.[a-z0-9-]+$/.test(v) ? `${v.slice(v.indexOf('.') + 1)} on a ${v.slice(0, v.indexOf('.'))}` : v)
	// 🚧 A role left unbound reads as its words and, where it says them, the kinds it takes (RF fix 6).
	const unbound = (role: string) => {
		const b = r.decl?.bindings?.[role]
		const kinds = functionBindingKinds(b)
		const said = en(b?.label) || role
		return kinds.length && kinds.length < ATTRIBUTE_KINDS.length ? `${said} (${attributeKindsInWords(kinds)})` : said
	}
	const hole = (text: string) => text.replace(/\{\{\s*([\w-]+)\s*\}\}/g, (_, role: string) => {
		const v = ref.bindings?.[role]
		return v === undefined ? unbound(role) : (Array.isArray(v) ? v.map(String) : [String(v)]).map(words).join(', ')
	})
	if (r.decl) return sentence(hole(r.decl.prose || en(r.decl.meaning)))
	const name = String(ref.ref).slice(String(ref.ref).indexOf('/') + 1, String(ref.ref).lastIndexOf('@'))
	const known = WAYS[name]
	return known ? sentence(known.charAt(0).toUpperCase() + known.slice(1) + (bound.length ? ` (${bound.join(', ')})` : '')) : sentence(`Part of how play runs (${name})`)
}

const FIVE_WORDS: Readonly<Record<string, string>> = {
	'crit-fail': 'a bad miss',
	fail: 'falls short',
	partial: 'a partial result',
	success: 'works',
	crit: 'goes better than hoped',
}

/**
 * 🚧 Render a handbook. Pages, in order: _How to play_, _What people carry_ (attributes and where
 * things sit), _How things are decided_ (functions), _Things people keep_ (entry types), _How
 * outcomes read_, _Time_ — each only when the declaration has something to say — then the author's
 * pages. A genre, with no sections, yields _How to play_ and its own pages.
 * @experimental
 */
export function renderHandbook(input: HandbookInput): HandbookDocument {
	const name = en(input?.name) || 'This game'
	const s = rulesetSections(input)
	const pages: HandbookDocPage[] = []
	const add = (title: string, body: string[]) => {
		const text = body.filter(Boolean).join('\n\n')
		if (text.trim()) pages.push({ id: slug(title), title, body: text, source: 'generated' })
	}

	add(`How to play ${name}`, [
		en(input?.description) && sentence(en(input.description)),
		s.attributes?.length ? `What matters about people here: ${s.attributes.map((a) => en(a.name) || a.id).join(', ')}.` : '',
	])

	const zones = s.zoneTypes ?? []
	add('What people carry', [
		...(s.attributes ?? []).map((a) => `**${en(a.name) || a.id}** — ${sentence(a.prose ?? en(a.description))}`),
		...zones.map((z) => `**${en(z.name)}** — ${sentence(z.prose)}`),
	])

	add('How things are decided', (s.functions ?? []).map((f) => `**${functionRefKey(f)}** — ${wayOf(f)}`))

	add('Things people keep', (s.entryTypes ?? []).map((e) => `**${en(e.name)}** — ${sentence(e.prose)}`))

	add('How outcomes read', (s.outcomes ?? []).map((o) => `**${en(o.label)}**${o.five ? ` — ${FIVE_WORDS[o.five] ?? o.five}` : ''}.`))

	if (s.time?.unit) add('Time', [`Time is kept in ${s.time.unit}s.`])

	for (const own of input?.handbook ?? []) {
		if (!own?.title || typeof own.body !== 'string') continue
		const at = pages.findIndex((p) => p.id === slug(own.title) || p.title === own.title)
		const page: HandbookDocPage = { id: slug(own.title), title: own.title, body: own.body, source: 'authored' }
		if (at >= 0) pages[at] = page
		else pages.push(page)
	}

	const markdown = [`# ${name}`, ...pages.map((p) => `## ${p.title}\n\n${p.body}`)].join('\n\n') + '\n'
	return { title: name, pages, markdown }
}
