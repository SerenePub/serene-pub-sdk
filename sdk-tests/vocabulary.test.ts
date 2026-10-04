/**
 * The modder's vocabulary (R36, R51, F2) and the first-plugin guide's promise
 * to keep to it.
 *
 * `guides/vocabulary.md` is the list a modder learns first: at most 25 words
 * (R36; more needs the owner), each an H3 with one sentence, one example (a
 * code span) and a link to its entry in the canon, the app's `NOMENCLATURE.md`.
 *
 * `guides/your-first-plugin.md` uses only those words. Any other canon term is
 * linked the first time the page uses it, so a reader following the guide
 * never meets an unexplained term. "Canon term" is read from the canon itself:
 * the bold term of every table row in the canon's group sections, so a word
 * added to the canon joins the check without editing this file.
 *
 * The canon lives in the app. When the app is not checked out beside the SDK
 * (`SERENE_PUB_APP`, else `../serene-pub`), the checks that need it are
 * skipped, and the skip says so.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { slugifyHeading } from '@serene-pub/docs'

const SDK_ROOT = resolve(import.meta.dirname, '..')
const GUIDES = join(SDK_ROOT, 'guides')
const APP_ROOT = resolve(process.env.SERENE_PUB_APP ?? join(SDK_ROOT, '..', 'serene-pub'))
const CANON_PATH = join(APP_ROOT, 'NOMENCLATURE.md')
const CANON_PRESENT = existsSync(CANON_PATH)
const NO_CANON = CANON_PRESENT ? false : `the app's NOMENCLATURE.md is not at ${CANON_PATH}`

/** R36: the cap. Growing it is the owner's call, not this file's. */
const VOCABULARY_CAP = 25

/** The mark the canon puts on a modder word's entry (§27). */
const MODDER_MARK = '📘'

/**
 * Canon sections whose table rows are terms. The rest are rules, grammar, the
 * verb and icon tables, the retired words and the change ledger: they name
 * words, but a word named there is not a term a guide must define.
 */
const TERM_SECTIONS = /^## (?:[4-9]|1\d|26|27)\. /

/**
 * Canon terms that are also plain English, and read as plain English in a
 * guide: "look at the result", "a form of", "step by step". A guide using one
 * in its canon sense still links it. Each is here because the canon itself
 * gives it a narrow meaning an ordinary sentence does not carry (R4).
 */
const PLAIN_ENGLISH = new Set([
	'look', 'form', 'unit', 'fold', 'track', 'extent', 'variant', 'tab', 'detail', 'help', 'who',
	'rule', 'status', 'floor', 'overflow', 'banner', 'guide', 'seed', 'folder', 'carry', 'ceiling',
	'door', 'address',
	// A verb in English ("build writes the manifest"); the canon's is the key `SessionShape.writes`.
	'writes',
])

/** Code, HTML comments and link targets out; link text kept, and marked as linked. */
interface Prose {
	text: string
	/** [start, end) ranges of `text` that are a link's text. */
	links: Array<[number, number]>
}

function proseOf(markdown: string): Prose {
	const defined = new Set(
		[...markdown.matchAll(/^\[([^\]]+)\]:\s*\S+/gm)].map((m) => m[1]!.toLowerCase()),
	)
	const stripped = markdown
		.replace(/<!--[\s\S]*?-->/g, ' ')
		.replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, ' ')
		.replace(/`[^`\n]*`/g, ' ')
		.replace(/^\[[^\]]+\]:\s*\S+.*$/gm, ' ')
	let text = ''
	const links: Array<[number, number]> = []
	// Inline `[text](url)`, full `[text][ref]`, and shortcut `[ref]` when the page defines `ref`.
	const LINK = /\[([^\]]+)\]\(([^)\s]+)[^)]*\)|\[([^\]]+)\]\[[^\]]*\]|\[([^\]]+)\](?![(\[:])/g
	let last = 0
	for (const m of stripped.matchAll(LINK)) {
		if (m[4] !== undefined && !defined.has(m[4].toLowerCase())) continue
		text += stripped.slice(last, m.index)
		const label = m[1] ?? m[3] ?? m[4] ?? ''
		links.push([text.length, text.length + label.length])
		text += label
		last = m.index! + m[0].length
	}
	text += stripped.slice(last)
	return { text: text.replace(/[*_]/g, ' '), links }
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** A term as a whole word, singular or plural, any case. */
const termPattern = (term: string) =>
	new RegExp(`(?<![\\w-])${escapeRegExp(term)}(?:s|es)?(?![\\w-])`, 'gi')

interface VocabWord {
	word: string
	body: string
}

function readVocabulary(): VocabWord[] {
	const md = readFileSync(join(GUIDES, 'vocabulary.md'), 'utf8')
	const words: VocabWord[] = []
	const parts = md.split(/^### /m).slice(1)
	for (const part of parts) {
		const [head, ...rest] = part.split('\n')
		words.push({ word: head!.trim().toLowerCase(), body: rest.join('\n').split(/^## /m)[0]! })
	}
	return words
}

/** The canon's terms: each table row's bold first-cell terms, in the term sections. */
function readCanonTerms(canon: string): Set<string> {
	const terms = new Set<string>()
	let inTerms = false
	for (const line of canon.split('\n')) {
		if (line.startsWith('## ')) inTerms = TERM_SECTIONS.test(line)
		if (!inTerms || !line.startsWith('| **')) continue
		const cell = line.split(' | ')[0]!
		for (const m of cell.matchAll(/\*\*([^*]+)\*\*/g)) {
			const term = m[1]!.replace(/`/g, '').replace(/\(.*?\)/g, '').trim().toLowerCase()
			if (term.length > 2 && /^[a-z][a-z -]*$/.test(term)) terms.add(term)
		}
	}
	return terms
}

const vocabulary = readVocabulary()
const vocabWords = vocabulary.map((v) => v.word)

describe('the modder vocabulary (guides/vocabulary.md)', () => {
	test(`has at most ${VOCABULARY_CAP} words (R36)`, () => {
		assert.ok(vocabulary.length > 0, 'no `### word` sections were read — did the format change?')
		assert.ok(
			vocabulary.length <= VOCABULARY_CAP,
			`${vocabulary.length} words: R36 caps the vocabulary at ${VOCABULARY_CAP}; more needs the owner`,
		)
		assert.equal(new Set(vocabWords).size, vocabWords.length, 'a word is listed twice')
	})

	for (const { word, body } of vocabulary)
		test(`'${word}' has a sentence, an example and a link to its canon entry`, () => {
			assert.match(body, /[A-Za-z][^\n]*\.\s*$/m, `'${word}' has no sentence`)
			assert.match(body, /`[^`]+`/, `'${word}' has no example (a code span)`)
			assert.match(
				body,
				/\]\(https:\/\/github\.com\/[^)]*\/NOMENCLATURE\.md#[^)]+\)/,
				`'${word}' has no link to its entry in NOMENCLATURE.md`,
			)
		})

	test('every canon link lands on a heading the canon has', { skip: NO_CANON }, () => {
		const canon = readFileSync(CANON_PATH, 'utf8')
		const anchors = new Set(
			canon
				.split('\n')
				.filter((l) => /^#{1,6} /.test(l))
				.map((l) => slugifyHeading(l.replace(/^#+ /, ''))),
		)
		for (const { word, body } of vocabulary)
			for (const m of body.matchAll(/NOMENCLATURE\.md#([^)]+)\)/g))
				assert.ok(anchors.has(m[1]!), `'${word}' links to #${m[1]}, which NOMENCLATURE.md has no heading for`)
	})

	test('the canon lists the same words, and marks each one', { skip: NO_CANON }, () => {
		const canon = readFileSync(CANON_PATH, 'utf8')
		const at = canon.indexOf('### Modder vocabulary')
		assert.ok(at >= 0, 'NOMENCLATURE.md §27 has no "### Modder vocabulary" section')
		const section = canon.slice(at).split(/^#{2,3} /m)[1]!
		const bullets = [...section.matchAll(/^- \*\*([^*]+)\*\*(.*)$/gm)]
		const listed = bullets.map((m) => m[1]!.toLowerCase())
		assert.deepEqual([...listed].sort(), [...vocabWords].sort(), 'NOMENCLATURE.md §27 and guides/vocabulary.md list different words')
		// A word the canon has no entry for says so in its own bullet, and has
		// nothing to mark. That is a gap in the canon, stated where it is read.
		const unentered = new Set(bullets.filter((m) => /no entry of its own/.test(m[2]!)).map((m) => m[1]!.toLowerCase()))
		if (unentered.size) console.log(`canon words with no entry of their own yet: ${[...unentered].join(', ')}`)
		const marked = canon.slice(0, at)
		for (const word of vocabWords.filter((w) => !unentered.has(w)))
			assert.ok(
				new RegExp(`\\*\\*${escapeRegExp(word)}\\*\\*[^|\\n]{0,40}${MODDER_MARK}`, 'i').test(marked),
				`no canon entry for '${word}' carries the modder mark ${MODDER_MARK}`,
			)
	})
})

describe('guides/your-first-plugin.md keeps to the vocabulary', () => {
	test('every canon term outside the vocabulary is linked where it first appears', { skip: NO_CANON }, () => {
		const canon = readFileSync(CANON_PATH, 'utf8')
		const prose = proseOf(readFileSync(join(GUIDES, 'your-first-plugin.md'), 'utf8'))
		// Vocabulary words are blanked first, longest first, so the `turn` in
		// `turn order` is never read as the canon's `turn`.
		let text = prose.text
		for (const word of [...vocabWords].sort((a, b) => b.length - a.length))
			text = text.replace(termPattern(word), (m) => ' '.repeat(m.length))
		// The product's name is not the canon's `pub` (one installation).
		text = text.replace(/Serene Pub/g, (m) => ' '.repeat(m.length))
		const inLink = (at: number) => prose.links.some(([s, e]) => at >= s && at < e)
		const unlinked: string[] = []
		for (const term of [...readCanonTerms(canon)].sort((a, b) => b.length - a.length)) {
			if (vocabWords.includes(term) || PLAIN_ENGLISH.has(term)) continue
			const first = termPattern(term).exec(text)
			if (!first) continue
			if (!inLink(first.index)) {
				const line = prose.text.slice(0, first.index).split('\n').length
				unlinked.push(`'${term}' (near prose line ${line}: "${prose.text.slice(Math.max(0, first.index - 30), first.index + 30).replace(/\s+/g, ' ')}")`)
			}
			text = text.replace(termPattern(term), (m) => ' '.repeat(m.length))
		}
		assert.deepEqual(
			unlinked,
			[],
			`your-first-plugin.md uses canon terms outside the vocabulary without linking them the first time:\n  ${unlinked.join('\n  ')}`,
		)
	})
})
