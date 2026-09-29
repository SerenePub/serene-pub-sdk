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
export declare const LEADING_ARTICLES: readonly string[];
/**
 * A text's words, as the name rule reads them: NFKC, lower case, a possessive
 * `'s` and then every apostrophe dropped, split on everything that is not a
 * letter, digit or mark. Anything but a string has no words.
 * @experimental
 */
export declare function nameWords(text: unknown): string[];
/**
 * A name, normalized: its words (see the module note) with one leading
 * article dropped, joined by single spaces. `''` for no name.
 * @experimental
 */
export declare function normalizeName(name: unknown): string;
/**
 * Whether two names are the same name: whole equality after
 * `normalizeName`, and never for an empty one.
 * @experimental
 */
export declare function sameName(a: unknown, b: unknown): boolean;
/**
 * Whether `text` names `name`: the name's words (article dropped) appear in it
 * as a contiguous run of whole words.
 * @experimental
 */
export declare function namesName(text: unknown, name: unknown): boolean;
/**
 * The first paragraph of `text` that names `name` **and** holds at least
 * `minWords` words besides it, trimmed; `null` when none does.
 *
 * A paragraph is what a blank line (whitespace-only lines included) separates.
 * "Besides it" subtracts every occurrence of the name's words, so a paragraph
 * that says the name three times is not longer for it.
 * @experimental
 */
export declare function passageNaming(text: unknown, name: unknown, minWords: number): string | null;
//# sourceMappingURL=names.d.ts.map