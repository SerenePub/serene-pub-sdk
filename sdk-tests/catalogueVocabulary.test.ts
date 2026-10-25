/**
 * 🚧 **What core's catalogue shows a member says no SDK noun** (PLAN-genres-seams
 * S7, 2026-10-23). NOMENCLATURE §28: the client never shows an SDK noun, and
 * members read only the UI names. The app's `src/lib/client/rulesetVocabulary.test.ts`
 * holds its `.svelte` files to that; the words below are the catalogue's own,
 * which no `.svelte` file spells and that test never read:
 *
 *  - each core genre's name, card subtitle (`description`), long copy (`about`),
 *    `playerLabel`, handbook pages, its envoys' names and descriptions, its
 *    shape's hints, and its fields' labels, descriptions and choices;
 *  - each core preset's label and description (the start form's Preset card);
 *  - each core pipeline's actions (`contributes.actions`: label, description,
 *    and what their forms and confirmations say);
 *  - each step's progress status (`expose.status`, the progress card);
 *  - each card a member sets (a step exposed to the session, `expose.session`):
 *    its title, the step's own name (the title it falls back to), and its
 *    switches' labels, descriptions and choices (the step definition's params).
 *
 * **Banned** — any hit fails: §28's list (ruleset, rigour, repertoire,
 * compendium, primer, bestow, render depth, phantom, table channel) and the
 * internal words a member never reads (piece, binding, config, reckoning,
 * sweep). **Watched** — common English, so each hit must be reviewed into
 * `ALLOWLIST` with its reason: bridge, parked, mechanic (§28's _mechanics_ is
 * its plural). Whole word, any case, plurals included; an id of §2's grammar
 * (`core:ruleset/vis-itineris@1`) is skipped. An allowlist entry that stops
 * matching fails, so the list only holds what is still shown.
 *
 * And **a routine's duties card is titled by the routine's own name** — the
 * `CORE_SPECS` name members read under Routines — for every routine a core
 * genre registers: never _What the reckoning keeps_.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { getDefinition } from '@serene-pub/sdk'
import { CORE_SPECS, coreGenres, corePresetInputs } from '@serene-pub/core-catalog'

/** One string a member reads, and where the catalogue declares it. */
interface Shown {
	where: string
	text: string
}

/** The plain words to say instead — what a failure tells the author (§28). */
const BANNED: Readonly<Record<string, string>> = {
	ruleset: "Rules (a field label), or the rules' own name (Vis Itineris)",
	rigour: 'How strict: Words only · Rules · The rules decide',
	repertoire: "the list's own label (Items, Spells, Conditions…)",
	compendium: 'the ‹name› library (Vis Itineris library)',
	primer: 'Starter lorebook',
	bestow: 'what it does, in words',
	'render depth': 'Detail: One line · Short · Full',
	phantom: 'nothing; the action Create lorebook from session and the badge This session only',
	'table channel': 'Dice',
	piece: "the thing's own name (Longsword), or its list label's singular (an item)",
	binding: 'what it does, in words',
	config: 'Settings, or what the setting does',
	reckoning: "the routine's own name (Note what changed, Keep the books)",
	sweep: "the routine's own name (Look back over the story)",
}

/** Common English: a hit is reviewed rather than refused. Singular `mechanic`, so `mechanics` is its plural. */
const WATCHED: Readonly<Record<string, string>> = {
	bridge: 'nothing; an effect reads as its origin (+1 from Affection)',
	parked: 'the sentence under the heading where the kept data shows',
	mechanic: 'the rules, in sentences',
}

/** Reviewed hits of a watched word: `text` is a part of the shown string, with why it is plain English there. */
const ALLOWLIST: readonly { where: string; text: string; reason: string }[] = []

/* ── what the catalogue shows ─────────────────────────────────────────── */

/** An I18n value's strings: a string, or every locale of a locale map. */
const textsOf = (v: unknown): string[] =>
	typeof v === 'string'
		? [v]
		: v && typeof v === 'object' && !Array.isArray(v)
			? Object.values(v as Record<string, unknown>).filter((x): x is string => typeof x === 'string')
			: []

/** The first locale's text (`en`), for a name compared as text. */
const plain = (v: unknown): string => textsOf(v)[0] ?? ''

type Put = (where: string, v: unknown) => void

/** A settings field as the session settings form draws it: label, description, hint, placeholder, choices. */
function fieldShown(where: string, f: any, at: Put) {
	if (!f || typeof f !== 'object') return
	at(`${where} label`, f.label)
	at(`${where} description`, f.description)
	at(`${where} hint`, f.hint)
	at(`${where} placeholder`, f.placeholder)
	for (const m of Array.isArray(f.members) ? f.members : []) {
		at(`${where} choice ${m?.key} label`, m?.label)
		at(`${where} choice ${m?.key} description`, m?.description)
	}
}

/** The keys of an action declaration (and its forms) whose value a member reads (`ActionDecl`, `ActionCollects`). */
const ACTION_TEXT_KEYS = new Set(['label', 'description', 'placeholder', 'ifEmpty', 'iconAlt', 'question', 'confirmLabel'])

/** Every member-read string under an action, however deep its form nests them. */
function actionShown(where: string, v: unknown, at: Put) {
	if (!v || typeof v !== 'object') return
	if (Array.isArray(v)) {
		v.forEach((x, i) => actionShown(`${where}[${i}]`, x, at))
		return
	}
	for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
		if (ACTION_TEXT_KEYS.has(k)) at(`${where}.${k}`, x)
		else actionShown(`${where}.${k}`, x, at)
	}
}

/** Built once: compiling every core pipeline is the slow half of this file. */
let built: { slug: string; name: unknown; doc: any }[] | undefined
const coreDocs = () => (built ??= CORE_SPECS.map((s) => ({ slug: s.slug, name: s.name, doc: s.build() })))

/** Everything the catalogue shows a member, with where it is declared. */
function catalogueShown(): Shown[] {
	const out: Shown[] = []
	const at: Put = (where, v) => {
		for (const text of textsOf(v)) out.push({ where, text })
	}
	for (const g of coreGenres() as readonly any[]) {
		at(`${g.id} name`, g.name)
		at(`${g.id} description`, g.description)
		at(`${g.id} about`, g.about)
		at(`${g.id} playerLabel`, g.playerLabel)
		for (const p of g.handbook ?? []) {
			at(`${g.id} handbook title`, p.title)
			at(`${g.id} handbook "${p.title}"`, p.body)
		}
		for (const e of g.envoys ?? []) {
			at(`${g.id} envoy ${e.key} name`, e.name)
			at(`${g.id} envoy ${e.key} description`, e.description)
		}
		for (const side of ['characters', 'personas']) at(`${g.id} shape.${side} hint`, g.shape?.[side]?.hint)
		for (const [k, f] of Object.entries(g.shape?.fields ?? {})) fieldShown(`${g.id} field ${k}`, f, at)
	}
	for (const p of corePresetInputs() as readonly any[]) {
		at(`preset ${p.slug} label`, p.label)
		at(`preset ${p.slug} description`, p.description)
	}
	for (const { slug, doc } of coreDocs()) {
		actionShown(`${slug} actions`, doc.contributes?.actions ?? [], at)
		for (const n of doc.nodes ?? []) {
			const expose = n.expose as { session?: boolean; label?: unknown; status?: unknown } | undefined
			at(`${slug} ${n.key} status`, expose?.status)
			if (expose?.session !== true) continue
			// A card a member sets: its title, the title it falls back to, and its switches.
			at(`${slug} ${n.key} card title`, expose.label)
			const def = getDefinition(`${n.definitionId}@${n.definitionVersion}`) as any
			at(`${slug} ${n.key} step name`, def?.i18n?.name)
			for (const slotDecl of Object.values(def?.slots ?? {}) as any[])
				for (const [k, f] of Object.entries(slotDecl?.schema ?? {})) fieldShown(`${slug} ${n.key} ${k}`, f, at)
		}
	}
	return out
}

/* ── the matcher ──────────────────────────────────────────────────────── */

/** An id of §2's grammar: `<namespace>:<kind>/<name>` with an optional `@<major>`. */
const ID = /[a-z0-9][a-z0-9._-]*:[a-z][a-z-]*\/[a-z0-9][a-z0-9._/-]*(?:@\d+)?/gi

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/** A word whole, any case, singular or plural (a space in it matches any run of spaces). */
const wordPattern = (word: string) => new RegExp(`(?<![\\w])${escapeRegExp(word).replace(/ /g, '\\s+')}(?:s|es)?(?![\\w])`, 'i')

const BANNED_PATTERNS = Object.keys(BANNED).map((w) => [w, wordPattern(w)] as const)
const WATCHED_PATTERNS = Object.keys(WATCHED).map((w) => [w, wordPattern(w)] as const)

interface Hit extends Shown {
	word: string
	kind: 'banned' | 'watched'
}

function hitsIn(shown: readonly Shown[]): Hit[] {
	const hits: Hit[] = []
	for (const s of shown) {
		const words = s.text.replace(ID, ' ')
		for (const [word, re] of BANNED_PATTERNS) if (re.test(words)) hits.push({ ...s, word, kind: 'banned' })
		for (const [word, re] of WATCHED_PATTERNS) if (re.test(words)) hits.push({ ...s, word, kind: 'watched' })
	}
	return hits
}

const covers = (e: { where: string; text: string }, h: Hit) => e.where === h.where && h.text.includes(e.text)

/** The hits that fail: every banned word, and a watched word not reviewed. */
const failing = (hits: readonly Hit[], allowlist: typeof ALLOWLIST) =>
	hits.filter((h) => h.kind === 'banned' || !allowlist.some((e) => covers(e, h)))

const hitMessage = (h: Hit) =>
	`${h.where} shows "${h.word}" — the interface says ${(h.kind === 'banned' ? BANNED : WATCHED)[h.word]} (NOMENCLATURE §28): "${h.text.length > 120 ? `${h.text.slice(0, 117)}…` : h.text}"` +
	(h.kind === 'watched' ? '; if it is plain English here, add it to ALLOWLIST with the reason' : '')

/* ── the tests ────────────────────────────────────────────────────────── */

describe('the catalogue says no SDK noun to a member (§28, S7)', () => {
	test('proof: a banned word fails, a watched word not reviewed fails, a reviewed one and an id pass', () => {
		const fixture: Shown[] = [
			{ where: 'fixture banned', text: 'Pick a ruleset for numbers.' },
			{ where: 'fixture watched', text: 'A bridge over the river.' },
			{ where: 'fixture reviewed', text: 'The parked cart rolls away.' },
			{ where: 'fixture id', text: 'Plays core:ruleset/vis-itineris@1 by default.' },
			{ where: 'fixture plural', text: 'The Sweeps of the north.' },
			{ where: 'fixture inside a word', text: 'Configure the rulesetless thing.' },
		]
		const hits = hitsIn(fixture)
		assert.deepEqual(
			hits.map((h) => [h.where, h.kind, h.word]),
			[
				['fixture banned', 'banned', 'ruleset'],
				['fixture watched', 'watched', 'bridge'],
				['fixture reviewed', 'watched', 'parked'],
				['fixture plural', 'banned', 'sweep'],
			],
		)
		const reviewed = [{ where: 'fixture reviewed', text: 'parked cart', reason: 'a cart, standing still' }]
		assert.deepEqual(
			failing(hits, reviewed).map((h) => h.where),
			['fixture banned', 'fixture watched', 'fixture plural'],
		)
		assert.match(hitMessage(hits[0]!), /^fixture banned shows "ruleset" — the interface says Rules/)
	})

	test('it reads every kind of member string the catalogue declares', () => {
		const shown = catalogueShown()
		const has = (pattern: RegExp) => shown.some((s) => pattern.test(s.where))
		// A genre's long copy, a field label and a choice, a preset, an action, a status, a duties card and its switches.
		for (const p of [
			/^core:genre\/story about$/,
			/^core:genre\/lair field autoRoll label$/,
			/^core:genre\/story field difficulty choice story label$/,
			/^preset lair-rules-and-dice description$/,
			/^core:spec\/lair-roll actions\[0\]\.collects\.text\.placeholder$/,
			/^core:spec\/story-reckoning \S+ status$/,
			/^core:spec\/story-reckoning duties card title$/,
			/^core:spec\/story-sweep duties step name$/,
			/^core:spec\/story-reckoning duties attributes label$/,
		])
			assert.ok(has(p), `nothing read at ${p}`)
		assert.ok(shown.length > 300, `${shown.length} strings read`)
	})

	test('no member string says a banned word, and every watched one is reviewed', () => {
		const shown = catalogueShown()
		const hits = hitsIn(shown)
		const bad = failing(hits, ALLOWLIST)
		assert.deepEqual(bad.map(hitMessage), [])
		const stale = ALLOWLIST.filter((e) => !hits.some((h) => covers(e, h)))
		assert.deepEqual(stale, [], 'an allowlist entry that no longer matches is removed')
	})

	test("a routine's duties card is titled by the routine's own name", () => {
		const docs = new Map(coreDocs().map((d) => [d.slug, d]))
		const seen: string[] = []
		for (const g of coreGenres() as readonly any[]) {
			for (const r of g.defaults?.registrations ?? []) {
				if (r.trigger?.family !== 'routine') continue
				const at = docs.get(r.pipeline)
				assert.ok(at, `${g.id}: ${r.pipeline} is a core pipeline`)
				for (const n of at.doc.nodes ?? []) {
					const expose = n.expose as { session?: boolean; label?: unknown } | undefined
					if (expose?.session !== true || !/-duties$/.test(String(n.definitionId))) continue
					assert.equal(plain(expose.label), plain(at.name), `${r.pipeline} ${n.key}`)
					seen.push(`${r.pipeline} → ${plain(expose.label)}`)
				}
			}
		}
		assert.deepEqual([...new Set(seen)].sort(), [
			'core:spec/lair-keeper → Keep the books',
			'core:spec/story-reckoning → Note what changed',
			'core:spec/story-sweep → Look back over the story',
		])
	})
})
