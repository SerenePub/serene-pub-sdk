/**
 * Names, compared the one way every reader agrees on (lair pass R7, 2026-09-28).
 *
 * `core:task/undescribed-name@1` asks whether a room the planner named is
 * already described: by a lorebook entry whose name or keys answer to it, or
 * by a recent paragraph of prose that names it. Both questions are "is this
 * the same name?", and a second copy of the rule elsewhere would not fail, it
 * would quietly disagree (the knock says the room is new while the listing
 * says it is known). So the rule lives here, once, for the core binding, a
 * plugin's own check and the tests alike.
 *
 * ## The rule
 *
 * A name is reduced to its **words**:
 *
 * - NFKC, then lower case;
 * - a possessive `'s` at the end of a word is dropped, then every other
 *   apostrophe (`'`, `’`, `ʼ`, `‘`, `` ` ``) — so "the Vault's door" names "the
 *   Vault", "Dragon's Den" is "dragon den" and "O'Brien" is "obrien";
 * - every other character that is not a letter, a digit or a combining mark
 *   separates words. That removes surrounding quotes and punctuation
 *   (`"The Vault."`), and collapses whitespace, in one step.
 *
 * Then **one** leading article (`the`, `a`, `an`) is dropped, when a word is
 * left after it. "The Vault" and "vault" are one name; "The" alone stays "the".
 *
 * Two names match on **whole equality** of what is left, never a substring:
 * "the vault" is not "the sunken vault".
 *
 * ## Prose
 *
 * A text names a name when the name's words appear in it as a contiguous run
 * of whole words ("the vault, dark" and "the vault's door" name "Vault";
 * "the vaults" does not). The article is not stripped from the text, only
 * from the name.
 *
 * ⚠ Hyphens separate words, so "well-lit" counts as two words toward
 * `minWords`. That is consistent on both sides, which is what matters.
 * @experimental
 */

/** The articles one strip removes from the front of a name. @experimental */
export const LEADING_ARTICLES: readonly string[] = ['the', 'a', 'an']

const POSSESSIVE = /['’ʼ]s(?![\p{L}\p{N}\p{M}])/gu
const APOSTROPHES = /['’ʼ‘`]/gu
const SEPARATORS = /[^\p{L}\p{N}\p{M}]+/u

/**
 * A text's words, as the name rule reads them: NFKC, lower case, a possessive
 * `'s` and then every apostrophe dropped, split on everything that is not a
 * letter, digit or mark. Anything but a string has no words.
 * @experimental
 */
export function nameWords(text: unknown): string[] {
	if (typeof text !== 'string') return []
	return text
		.normalize('NFKC')
		.toLowerCase()
		.replace(POSSESSIVE, '')
		.replace(APOSTROPHES, '')
		.split(SEPARATORS)
		.filter(Boolean)
}

/** A name's words with one leading article dropped (when a word is left after it). */
function nameTerms(name: unknown): string[] {
	const words = nameWords(name)
	return words.length > 1 && LEADING_ARTICLES.includes(words[0]!) ? words.slice(1) : words
}

/**
 * A name, normalized: its words (see the module note) with one leading
 * article dropped, joined by single spaces. `''` for no name.
 * @experimental
 */
export function normalizeName(name: unknown): string {
	return nameTerms(name).join(' ')
}

/**
 * Whether two names are the same name: whole equality after
 * `normalizeName`, and never for an empty one.
 * @experimental
 */
export function sameName(a: unknown, b: unknown): boolean {
	const x = normalizeName(a)
	return x !== '' && x === normalizeName(b)
}

/** How many times `terms` occurs in `words` as a contiguous run, without overlap. */
function occurrences(words: readonly string[], terms: readonly string[]): number {
	let count = 0
	for (let i = 0; i + terms.length <= words.length;) {
		let hit = true
		for (let j = 0; j < terms.length; j++)
			if (words[i + j] !== terms[j]) {
				hit = false
				break
			}
		if (hit) {
			count++
			i += terms.length
		} else i++
	}
	return count
}

/**
 * Whether `text` names `name`: the name's words (article dropped) appear in it
 * as a contiguous run of whole words.
 * @experimental
 */
export function namesName(text: unknown, name: unknown): boolean {
	const terms = nameTerms(name)
	return terms.length > 0 && occurrences(nameWords(text), terms) > 0
}

/**
 * The first paragraph of `text` that names `name` **and** holds at least
 * `minWords` words besides it, trimmed; `null` when none does.
 *
 * A paragraph is what a blank line (whitespace-only lines included) separates.
 * "Besides it" subtracts every occurrence of the name's words, so a paragraph
 * that says the name three times is not longer for it.
 * @experimental
 */
export function passageNaming(text: unknown, name: unknown, minWords: number): string | null {
	if (typeof text !== 'string') return null
	const terms = nameTerms(name)
	if (terms.length === 0) return null
	for (const paragraph of text.split(/\n[^\S\n]*\n/u)) {
		const words = nameWords(paragraph)
		const hits = occurrences(words, terms)
		if (hits > 0 && words.length - hits * terms.length >= minWords) return paragraph.trim()
	}
	return null
}
