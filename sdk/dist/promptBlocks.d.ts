/**
 * The **prompt blocks** a context template is assembled from, as a configurable
 * ordered list rather than an order frozen into the template's source.
 *
 * SillyTavern calls this a preset's *prompt list*; the ruling of 2026-09-10
 * calls it the `blocks` param and puts it exactly where a preset's other
 * decisions live — inside the pipeline configuration the preset selects, on the
 * assembly node that renders the prompt. Not a session setting, not a table:
 * "which sections are in the prompt, in what order" is the same kind of fact as
 * "which prompt does this step use", and it is an administrator's.
 *
 * ## ⚠ A third sense of the word `block`
 *
 * NOMENCLATURE §15 says a **block** is one message — `system`, `user`,
 * `assistant`. The pipeline container that used to share the word is a
 * **clause** since 2026-09-15 (R-14), which took one sense off the pile. This
 * is another: one **section within** a prompt, named by the template variable
 * that renders it. The word is the ruling's, so it is used here and recorded
 * there rather than quietly replaced with a fresh invention. Say **prompt
 * block** in prose; the bare word still means a message.
 *
 * ## What this module is, and is not
 *
 * It is the declaration and the pure resolution: the shipped order, the field
 * declaration a panel renders, and the arithmetic that turns *what an admin
 * configured* plus *what a template actually produces* into an effective order
 * with its receipt. It renders nothing and knows no template syntax — which
 * template variables a given story string produces is a question only that
 * template's engine can answer, and the host asks it.
 */
import type { FieldDecl } from './settings.js';
/**
 * One entry in the pack: a block, and whether it is in.
 *
 * `enabled` is separate from membership on purpose. Removing an entry and
 * switching it off are different acts — the first forgets where it sat, the
 * second keeps its place — and a list that could only express the first would
 * make "turn the lore off for a moment" destroy the ordering somebody tuned.
 */
export interface PromptBlockEntry {
    /** The template variable that renders this section — `worldLore`, `history`. */
    id: string;
    /** Absent means in. Only an explicit `false` takes a block out. */
    enabled?: boolean;
}
/**
 * The blocks Serene Pub's shipped context template renders, **in its order**.
 *
 * This list and that template are one fact stated twice, which is a thing worth
 * being uncomfortable about: the template is a seeded row an install may have
 * replaced, and this is a declaration. They are held in step by a test in the
 * host that reads the shipped template and asserts this order — so the
 * declared default cannot drift from the prompt a fresh install actually gets.
 *
 * Order is the 0.5 prompt's order, unchanged. Do not tidy it: every entry's
 * position is a byte in every prompt on every install that has changed nothing.
 */
export declare const SHIPPED_PROMPT_BLOCK_IDS: readonly ['currentDate', 'instructions', 'characters', 'personas', 'scenario', 'worldLore', 'history', 'relationshipsPerspectives', 'relationshipsKnown'];
export type ShippedPromptBlockId = (typeof SHIPPED_PROMPT_BLOCK_IDS)[number];
/**
 * The declared default: every shipped block, in the shipped order, all on.
 *
 * Being the **declared** default is what makes this cost nothing to store. A
 * configuration holds deviations only, so until somebody reorders or switches
 * one off there is no row anywhere and the pack is whatever this says — which
 * is also what lets the shipped order be corrected in a release rather than
 * swept through every install's rows.
 */
export declare const SHIPPED_PROMPT_BLOCKS: readonly PromptBlockEntry[];
/**
 * The param, declared once and shared by the contract and the panel.
 *
 * ⚠ `of` on the `id` member is what the **picker offers**, not what the runtime
 * accepts. A context template may render a variable no declaration here
 * enumerates — a plugin's, or one an admin wrote — and an id this list does not
 * carry is honoured if the template produces it and reported on the receipt if
 * it does not (`resolvePromptBlocks`). A refusal there would turn "I switched
 * my pipeline's template" into a run that stops.
 */
export declare const PROMPT_BLOCKS_DECL: FieldDecl;
/**
 * Is this value the shipped pack, entry for entry?
 *
 * The host's identity test, and the reason it is worth exporting rather than
 * inlining: **the shipped pack means "leave the template alone"**, not "reorder
 * the template into this order". Those are the same thing for the template
 * Serene Pub ships and are emphatically not the same thing for one somebody
 * wrote, whose sections may sit in an order they chose. Treating the default as
 * an instruction would silently rewrite every custom template on first run.
 */
export declare function isShippedPromptBlocks(value: unknown): boolean;
/** What a resolution decided, and what the receipt says about it. */
export interface ResolvedPromptBlocks {
    /** The effective order: block ids, as they will be rendered. */
    order: string[];
    /** Configured, but this template renders no such block. Ignored, not refused. */
    unknown: string[];
    /** Rendered by the template, left out by the pack — switched off, or not listed. */
    dropped: string[];
    /** Whether the effective order departs from what the template already had. */
    changed: boolean;
}
/**
 * The pack, applied to what a template actually produces.
 *
 * Pure, total, and refuses nothing. Three rules, in this order:
 *
 *  · an entry the template does not produce is **ignored**, and named on the
 *    receipt — a template swap must not stop a turn;
 *  · an entry with `enabled: false`, and a produced block the pack does not
 *    list at all, are both **out** — but they are reported apart from each
 *    other nowhere, because from the prompt's side they are the same absence;
 *  · everything else renders in the pack's order.
 *
 * A duplicate id keeps its first position and is dropped thereafter: a block is
 * one section, and rendering it twice is not a thing the list can mean.
 */
export declare function resolvePromptBlocks(configured: unknown, produced: readonly string[]): ResolvedPromptBlocks;
//# sourceMappingURL=promptBlocks.d.ts.map