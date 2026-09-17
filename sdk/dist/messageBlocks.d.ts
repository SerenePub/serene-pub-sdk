/**
 * Message blocks (20 §6) — custom message content as **data, not code**.
 *
 * A plugin's message part carries a block tree in `data.blocks`; core renders
 * it with its own components. Nothing to sanitize (no HTML crosses the
 * boundary), theming and accessibility are core's once for everyone, and
 * interactivity is *declared*: a `choices` button or a `form` submit names a
 * function key, and pressing it fires the trigger machinery with the message
 * as subject — the same audited path every contributed button already takes.
 *
 * The validator is the write-time gate: a hostile or malformed tree is refused
 * with the block path named, and the caps make "render whatever a sandboxed
 * hook produced" a bounded promise. Findings carry a `fix` like every finding
 * in this SDK (15 §1.3).
 */
import type { SettingsSchema } from './settings.js';
import { type ParticipantRef } from './participants.js';
/**
 * What a `choices` button or a `form` submit fires (U5c review, W-E).
 *
 * `fn` is the function key — what routing resolves. `action` is the
 * **identity** of the declaration the press is held to, `<spec slug>#<key>`
 * (`ACTION_IDENTITY`): the server checks THAT action's audience and
 * enablement and runs THAT spec, so a block a spec wrote for any
 * participant (`act: ['participant']`) admits a guest. It is **written by
 * the outlet that created the block** from the run's spec
 * (`stampBlockActions`), never by the client, which only carries it back on
 * the fire. A block carrying none — one stored before this field, or one
 * whose spec declares no action for `fn` — is fired as the legacy shape and
 * gets the narrowest reading: the owner floor.
 */
export interface BlockActionRef {
    fn: string;
    action?: string;
}
/**
 * A **form** (plans/29 R-15 *Forms*; 30 §U5d, built 2026-09-17) is an
 * action still awaiting its answer, addressed to an audience and carried in
 * a message: a `choices` block (one question, several options) or a `form`
 * block (fields to fill). The two fields below are what make a block a form
 * rather than a row of buttons:
 *
 *  - **`addressee`** — who the question is put to, as a participant
 *    reference (`character:12`, `envoy:mascot`, `owner`, `user:3`). The
 *    addressee IS the block's audience: the person portraying them may
 *    answer (the click), and when the host's resolver says the AI portrays
 *    them this turn, core records `core:event/form-addressed@1` and the
 *    genre's answer pipeline answers through an oracle with the `json`
 *    capability — receipted, reviewable, never magical. A block with no
 *    addressee is what it always was: buttons anyone the action's audience
 *    admits may press.
 *  - **`id`** — the block's identity within its message, stamped by the
 *    host at the write (`assignBlockIds`) so a fire, a `form-addressed`
 *    event and a `form-answered` change can all name it. Never written by a
 *    spec; one it wrote is kept.
 *
 * A `choices` option carries **`choice`**, the option key its press answers
 * with (`{ choice }` is the fire's payload, and the oracle's schema is an
 * enum of these keys). Options of an addressed block must each carry one,
 * distinct — a question with options must be answerable by key.
 */
export interface FormBlockFields {
    id?: string;
    addressee?: ParticipantRef;
    /**
     * The question put to the addressee, as prose — what the block shows
     * above its options or fields, and what the answer pipeline puts to the
     * oracle. A `choices` block with no question is a row of buttons and
     * cannot be addressed: there is nothing to answer.
     */
    question?: string;
}
export type MessageBlock = 
/** Markdown text — the workhorse. */
{
    kind: 'md';
    text: string;
}
/** Label/value rows — stats panels, item cards. */
 | {
    kind: 'kv';
    rows: Array<{
        label: string;
        value: string;
    }>;
}
/** A small table. Rendering may scroll it; it never overflows the log. */
 | {
    kind: 'table';
    columns: string[];
    rows: string[][];
}
/** A labelled meter — HP bars, progress, clocks. */
 | {
    kind: 'stat';
    label: string;
    value: number;
    max?: number;
}
/** An attachment from the session's asset store — never a foreign URL. */
 | {
    kind: 'image';
    assetId: number;
    alt?: string;
}
/**
 * Action buttons. `fn` is a function key resolved through the mode's
 * contribution machinery (19 §3–§4); pressing one fires
 * `sessions:triggerFunction` with the message and the choice as subject.
 * `action` is the identity of the declaration the button fires
 * (`BlockActionRef`), stamped by the outlet that wrote the block.
 */
 | ({
    kind: 'choices';
    actions: Array<BlockActionRef & {
        label: string;
        icon?: string;
        choice?: string;
    }>;
} & FormBlockFields)
/**
 * A form rendered from the one field language (`SettingsSchema`);
 * submitting fires `fn` with the entered values as the payload.
 */
 | ({
    kind: 'form';
    fields: SettingsSchema;
    label?: string;
} & BlockActionRef & FormBlockFields)
/** Nesting, one layout hint. Depth-capped by the validator. */
 | {
    kind: 'group';
    layout?: 'row' | 'column';
    blocks: MessageBlock[];
};
export interface MessageBlockFinding {
    /** e.g. `blocks[2].actions[0]` */
    path: string;
    message: string;
    fix: string;
}
/** The caps that make rendering a sandbox's output a bounded promise. */
export declare const MESSAGE_BLOCK_LIMITS: {
    readonly maxBlocks: 64;
    readonly maxDepth: 3;
    readonly maxText: number;
    readonly maxRows: 64;
    readonly maxActions: 12;
};
/** The longest block id the validator accepts; a host's uuid is 36. */
export declare const BLOCK_ID_MAX_LENGTH = 64;
/**
 * Validate a candidate block tree. Empty findings = renderable. Total, never
 * throws — the host refuses a write on findings rather than crashing on one.
 */
export declare function checkMessageBlocks(value: unknown): MessageBlockFinding[];
/**
 * Stamp each `choices` button and `form` in a tree with the identity of the
 * declaration it fires — the outlet's half of W-E, called where a block part
 * is written with the run's spec in hand. That is the host's seam, not the
 * SDK's: in Serene Pub the executor's host scope carries the running
 * document's slug (`runtime/host.ts`, `HostScope.specId`) and its message
 * outlet is where the stamp lands; the `blocks` port U5d builds is built on
 * this call. The SDK declares no `HostScope` — a host wired by hand passes
 * `{ id, contributes }` from wherever it keeps the running spec.
 *
 * The identity is `<spec id>#<key>` for the ONE action of `spec` whose
 * `function` is the block's `fn`. A block whose `fn` the spec declares no
 * action for, or several, is left unstamped — it fires as legacy and gets the
 * owner floor — rather than guessed; and a block that already carries an
 * `action` keeps it, so a spec may name a declaration of another spec's on
 * purpose. Returns a copy; the input is never mutated.
 */
export declare function stampBlockActions(blocks: MessageBlock[], spec: {
    id: string;
    contributes?: unknown;
}): MessageBlock[];
/** One form in a block tree — a `choices` or `form` block, located. */
export type FormBlock = Extract<MessageBlock, {
    kind: 'choices' | 'form';
}>;
/**
 * Every `choices` and `form` block in a tree, in render order, groups
 * flattened — the blocks a fire, an event or an answer can name.
 */
export declare function formBlocksOf(blocks: MessageBlock[]): FormBlock[];
/** The form block carrying `id`, or undefined. */
export declare function findFormBlock(blocks: MessageBlock[], id: string): FormBlock | undefined;
/**
 * Every function a `choices` option or a `form` names, deduplicated — what
 * the writing spec must declare an action for. A block whose `fn` the spec
 * declares no action for is refused at the write: nothing would ever be held
 * to an audience for it.
 */
export declare function blockFunctionsOf(blocks: MessageBlock[]): string[];
/**
 * The functions a tree names that `spec` declares no action for — the
 * refusal the host makes before it stamps (`stampBlockActions` leaves such a
 * block unstamped rather than guessing; the write refuses it instead, with
 * the function named).
 */
export declare function undeclaredBlockFunctions(blocks: MessageBlock[], spec: {
    id: string;
    contributes?: unknown;
}): string[];
/**
 * The effects line (plans/29 R-15 *The line*; 09-B F39): a block naming a
 * `world` action — one whose result touches cards, lorebooks, settings,
 * permissions, connections — is refused. Such an action lives in the
 * composer or the review gate and is owner-only; a message carrying it would
 * put an out-of-fiction effect where a character could be asked to answer
 * it. Returns the functions of the offending actions.
 */
export declare function worldBlockFunctions(blocks: MessageBlock[], spec: {
    id: string;
    contributes?: unknown;
}): string[];
/**
 * Stamp an `id` on every `choices` and `form` block that has none — the
 * host's half, at the write, with the host's id maker (a uuid). A block that
 * already carries one keeps it. Returns a copy; the input is never mutated.
 */
export declare function assignBlockIds(blocks: MessageBlock[], makeId: () => string): MessageBlock[];
/**
 * The JSON Schema an oracle answers a form against (R-15: "an oracle with
 * `json` capability answers against the form's schema").
 *
 *  - `choices` → `{ choice: <enum of the option keys> }`, required.
 *  - `form` → the field schema, mapped field by field (`fieldsToJsonSchema`).
 *
 * A `choices` block whose options carry no keys yields an empty enum, which
 * is what the validator refuses on an addressed block before it is written.
 */
export declare function formAnswerSchema(block: FormBlock): Record<string, unknown>;
/**
 * The one field language as JSON Schema — for a `form` block's answer, and
 * for anything else that hands a `SettingsSchema` to a model. Every field
 * type maps; `secret` and `media` map to strings because that is what a
 * model could produce, and a form asking a character for either is a form
 * the author should not have written.
 */
export declare function fieldsToJsonSchema(fields: SettingsSchema): Record<string, unknown>;
/**
 * The fire a form's answer becomes — what a press sends, and what the
 * answer pipeline commits "exactly as a click would": the block's function,
 * its stamped identity, and the payload. For `choices` the payload is
 * `{ choice }`; for `form` it is the answered values. Null when the answer
 * names no option the block offers, or is not an object — an oracle's
 * answer is checked here before anything is fired.
 */
export declare function formFireOf(block: FormBlock, answer: unknown): {
    fn: string;
    action?: string;
    payload: Record<string, unknown>;
    label?: string;
} | null;
//# sourceMappingURL=messageBlocks.d.ts.map