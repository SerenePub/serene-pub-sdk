/**
 * Folded sections (B4; decision D5, 2026-09-27) — the checks a host makes on
 * the message outlets' `sections` in-port, the one reading of where a row keeps
 * them, and the one `core:section` part each becomes. Pure: the host's write,
 * its projection to parts and a widget's fallback all read through here, so
 * there is one answer to "which sections does this alternative carry".
 *
 * Where a row keeps them: `metadata.sections` while the row has no
 * alternatives; `metadata.swipes.sectionsHistory`, parallel to `history`, once
 * a write gives one of them sections. Until that array exists the first
 * alternative's sections are the row's `sections` — the ones it had before
 * anybody swiped.
 * @experimental
 */
import type { FoldedSectionPartDataV1, FoldedSectionV1 } from './widgets.js';
/**
 * How many folded sections one reply may carry. Bounded because they are laid
 * out in the host's own part slots, between a narrator's instructions and the
 * reply's reasoning and body. @experimental
 */
export declare const MAX_FOLDED_SECTIONS = 6;
/** A folded section's `kind`: a lowercase slug. @experimental */
export declare const FOLDED_SECTION_KIND: RegExp;
/**
 * Check a `sections` value and return it normalized, or the reason it is
 * refused (1-based position, the field, what is wrong). `undefined`/`null` is
 * "none given". A section with nothing to show — blank text, an empty list —
 * is left out rather than refused: a formatter that found nothing is an
 * ordinary state.
 * @experimental
 */
export declare function checkFoldedSections(value: unknown): {
    sections?: FoldedSectionV1[];
    refusal?: string;
};
/**
 * The folded sections alternative `slot` of a row carries, read from its
 * metadata. `slot` defaults to the alternative the row shows.
 * @experimental
 */
export declare function foldedSectionsOf(metadata: unknown, slot?: number): FoldedSectionV1[];
/**
 * Metadata with the SHOWN alternative's folded sections replaced by
 * `sections` — whole, so an empty list clears them. Every other alternative
 * keeps its own. Returns a new object; the input is not touched.
 * @experimental
 */
export declare function withFoldedSections<M extends object>(metadata: M | null | undefined, sections: FoldedSectionV1[]): M;
/**
 * One folded section as the `core:section` part it is stored as: `content` is
 * its text, or its items as a markdown bullet list (what a renderer that knows
 * nothing of `items` shows); `data` is {@link FoldedSectionPartDataV1}.
 * @experimental
 */
export declare function foldedSectionPart(section: FoldedSectionV1): {
    type: 'core:section';
    content: string;
    data: FoldedSectionPartDataV1;
};
/**
 * The readable lines a document's lists make — what `core:task/list-section@1`
 * folds into one section's `items` (lair pass B5, decision D5, 2026-09-27).
 *
 * `path` names the keys to read, comma-separated and in order (`'beats,speakers'`);
 * empty reads the document itself. A list contributes one line per entry and
 * anything else one line: a string is itself, a number or a boolean its text,
 * and an object its own scalar values joined with ` — ` in key order, so a
 * planner's `{ name, intent }` reads "Mara — check the door" and never as JSON.
 * Nested lists and objects inside an entry are left out rather than printed.
 * Blank lines are dropped, so a document with nothing to say makes no lines.
 * @experimental
 */
export declare function sectionItemsOf(document: unknown, path?: string): string[];
//# sourceMappingURL=foldedSections.d.ts.map