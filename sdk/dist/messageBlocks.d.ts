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
import { type EffectsLineDeclarationInput } from './actions.js';
import { type ParticipantRef } from './participants.js';
/**
 * What a `choices` button or a `form` submit fires (U5c review, W-E).
 *
 * `fn` is the action's **key** — the second half of its identity, the word
 * a spec's own block names one of its actions by (plans/31 V2; it was the
 * routing *function* until then, and the key of every action core ships was
 * already that word). `action` is the
 * **identity** of the declaration the press is held to, `<spec slug>#<key>`
 * (`ACTION_IDENTITY`): the server checks THAT action's audience and
 * enablement and runs THAT spec, so a block a spec wrote for any
 * participant (`act: ['participant']`) admits a guest. It is **written by
 * the outlet that created the block** from the run's spec
 * (`stampBlockActions`), never by the client, which only carries it back on
 * the fire. A block carrying none — one stored before this field, or one
 * whose spec declares no action for `fn` — is fired as the legacy shape and
 * gets the narrowest reading: the owner floor.
 * @experimental
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
 *  - **`head`** — the **channel head** the form was issued at (plans/29
 *    R-15 *Staleness and order*; 30 §U5f, 2026-09-17): the greatest message
 *    id on the row's channel at the write, stamped by the host
 *    (`assignBlockHead`) — for a fresh write, the row itself. The head
 *    moving past it **stales** the form: unanswered, and a newer message
 *    on that channel exists — one that is not itself an answer to a form on
 *    the same row (the host marks an answer's row `metadata.answersForm`,
 *    and an answer does not move the conversation on from the row it
 *    answers, so several questions on one row are each answerable).
 *    Staleness is computed, never stored; a stale press is refused at the
 *    door and a client collapses the block as *superseded*. Never written
 *    by a spec; one it wrote is dropped and the host's stamp put in its
 *    place. A block with no `head` — one stored before the field — is never
 *    stale.
 *
 * A `choices` option carries **`choice`**, the option key its press answers
 * with (`{ choice }` is the fire's payload, and the oracle's schema is an
 * enum of these keys). Options of an addressed block must each carry one,
 * distinct — a question with options must be answerable by key.
 * @experimental
 */
export interface FormBlockFields {
    id?: string;
    /**
     * The channel head at issue (U5f) — a positive message id, the host's
     * stamp. See the module note: staleness is `!answered && head != null &&
     * headNow > head`, computed by whoever holds the channel.
     */
    head?: number;
    addressee?: ParticipantRef;
    /**
     * The question put to the addressee, as prose — what the block shows
     * above its options or fields, and what the answer pipeline puts to the
     * oracle. A `choices` block with no question is a row of buttons and
     * cannot be addressed: there is nothing to answer.
     */
    question?: string;
    /**
     * What the question is **about**, by name — the thing an answer acts on,
     * carried from the run that asked to the run the press fires (lair pass
     * B12, 2026-09-27). The Lair's knock asks *is there a room here?*; the
     * room is its `referent`, and *Answer the door* reads it off the form
     * (`read-answer@1`'s `referent`) to name the room it writes. Plain text,
     * never an id: it is shown to nobody and trusted for nothing — a press
     * still re-judges everything it touches. Absent on a question about
     * nothing in particular, which is most of them.
     *
     * Neither the question (prose a person reads) nor an option's `choice`
     * (a key a junction compares): those two could not carry a name without
     * breaking what they are for.
     */
    referent?: string;
    /**
     * The answer, once given (U5d review, W7) — stamped on the stored block
     * by the host when the action's run landed, never written by a spec. A
     * form is answered **once**: a second press is refused naming who
     * answered, and a client greys the block and shows the answer.
     */
    answered?: FormAnswered;
}
/**
 * Who answered a form, when, and — for a `choices` block — which option.
 * `by` is the addressee when the block was addressed (a person clicking for
 * them and the oracle answering as them are both the addressee's answer),
 * else the user who pressed. `at` is ISO 8601.
 * @experimental
 */
export interface FormAnswered {
    by: ParticipantRef;
    at: string;
    choice?: string;
}
/** @experimental */
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
 * Action buttons. `fn` is an action key, resolved to its identity by
 * the writing spec's declarations (`stampBlockActions`); pressing one fires
 * `sessions:fireAction` with the message and the choice as subject.
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
/** @experimental */
export interface MessageBlockFinding {
    /** e.g. `blocks[2].actions[0]` */
    path: string;
    message: string;
    fix: string;
}
/** The caps that make rendering a sandbox's output a bounded promise. @experimental */
export declare const MESSAGE_BLOCK_LIMITS: {
    readonly maxBlocks: 64;
    readonly maxDepth: 3;
    readonly maxText: number;
    readonly maxRows: 64;
    readonly maxActions: 12;
};
/** The longest block id the validator accepts; a host's uuid is 36. @experimental */
export declare const BLOCK_ID_MAX_LENGTH = 64;
/**
 * Validate a candidate block tree. Empty findings = renderable. Total, never
 * throws — the host refuses a write on findings rather than crashing on one.
 * @internal
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
 * The identity is `<spec id>#<key>` for the action of `spec` whose `key`
 * is the block's `fn` (plans/31 V2: the key is the identity's second half,
 * so `fn` names at most one). A block whose `fn` the spec declares no
 * action for is left unstamped — it fires as legacy and gets the
 * owner floor — rather than guessed; and a block that already carries an
 * `action` keeps it, so a spec may name a declaration of another spec's on
 * purpose. Returns a copy; the input is never mutated.
 * @internal
 */
export declare function stampBlockActions(blocks: MessageBlock[], spec: {
    id: string;
    contributes?: unknown;
}): MessageBlock[];
/** A well-formed `FormAnswered` — the shape the host stamps and the validator accepts. @experimental */
export declare function isFormAnswered(v: unknown): v is FormAnswered;
/** One form in a block tree — a `choices` or `form` block, located. @experimental */
export type FormBlock = Extract<MessageBlock, {
    kind: 'choices' | 'form';
}>;
/**
 * Every `choices` and `form` block in a tree, in render order, groups
 * flattened — the blocks a fire, an event or an answer can name.
 * @internal
 */
export declare function formBlocksOf(blocks: MessageBlock[]): FormBlock[];
/** The form block carrying `id`, or undefined. @internal */
export declare function findFormBlock(blocks: MessageBlock[], id: string): FormBlock | undefined;
/**
 * Every function a `choices` option or a `form` names, deduplicated — what
 * the writing spec must declare an action for. A block whose `fn` the spec
 * declares no action for is refused at the write: nothing would ever be held
 * to an audience for it.
 * @experimental
 */
export declare function blockFunctionsOf(blocks: MessageBlock[]): string[];
/**
 * The functions a tree names that `spec` declares no action for — the
 * refusal the host makes before it stamps (`stampBlockActions` leaves such a
 * block unstamped rather than guessing; the write refuses it instead, with
 * the function named). A reference that already **names its action** — a
 * spec pointing a block at another spec's declaration on purpose, the way
 * the Adventure genre's Ask points its options at Answer — is not judged
 * here: the host holds the named identity to the installed declaration
 * instead (`foreignBlockActions`).
 * @internal
 */
export declare function undeclaredBlockFunctions(blocks: MessageBlock[], spec: {
    id: string;
    contributes?: unknown;
}): string[];
/**
 * The action identities a tree names that are **not** `spec`'s own — the
 * declarations of other specs a block points at on purpose. The host holds
 * each to the installed declaration: it must exist for the session's genre,
 * and it may not be `world` (the effects line).
 * @internal
 */
export declare function foreignBlockActions(blocks: MessageBlock[], spec: {
    id: string;
    contributes?: unknown;
}): string[];
/**
 * **The one addressee a `world` action may be named to** (L1, ruled
 * 2026-09-17): the session's owner, and nobody else.
 *
 * `owner` the role, never `user:<id>` — this half of the law is pure and
 * holds no session, so it cannot know which person owns one; a reference that
 * happens to name the owner is resolved at the press, where the host can ask.
 * @experimental
 */
export declare const isOwnerAddressed: (addressee: unknown) => boolean;
/**
 * The effects line (plans/29 R-15 *The line*; 09-B F39): a block naming a
 * `world` action — one whose result touches cards, lorebooks, settings,
 * permissions, connections — is refused. Such an action lives in the
 * composer or the review gate and is owner-only; a message carrying it would
 * put an out-of-fiction effect where a character could be asked to answer
 * it. Returns the functions of the offending actions.
 *
 * ## The one exception: a block addressed to the **owner** (L1, 2026-09-17)
 *
 * A `choices` or `form` block whose `addressee` is `owner` may name a `world`
 * action. The reasoning is the line's own: the rule exists so that an
 * out-of-fiction effect is never *a question a character could be asked*, and
 * a form put to the owner is not that question — the owner is already the
 * whole of such an action's `act` audience (`WORLD_ACTION_ACTORS`), and
 * pressing the button is the owner acting, in the one place the line has
 * always allowed them to. Every other addressee — a character, a persona,
 * a user by id, or none at all (“nobody in particular”, which anyone the
 * audience admits may press) — keeps the refusal.
 *
 * ⚠ The **venue** half of F41 is untouched: an action declaring
 * `venue: { kind: 'form' }` still may not be `world`, because a venue is
 * declared and an addressee is decided at run time, so the construction-time
 * check cannot see one. An owner-addressed block therefore names a
 * `composer`-venue world action — the Lair genre's knock does exactly this
 * — and `form` stays fiction-only.
 * @experimental
 */
export declare function worldBlockFunctions(blocks: MessageBlock[], spec: {
    id: string;
    contributes?: unknown;
}): string[];
/**
 * Every shape the effects line is heard in (F41), one verdict:
 *
 *  - `venue` / `actor` — a declaration: a `world` action's declared venue,
 *    or a reference its `act` audience names (`worldActionCrossing`).
 *  - `block` — the write: the blocks a node produced, against the spec that
 *    contributed the actions they name (`worldBlockFunctions`).
 *  - `identity` — the write, for a block pointing at ANOTHER spec's
 *    declaration on purpose: the host resolved the identity to its
 *    `effects` and collected the addressees of every block naming it.
 *  - `press` — the fire: a `world` action pressed from a block, or answered
 *    **as** a participant by the answer pipeline.
 * @experimental
 */
export type EffectsLineInput = EffectsLineDeclarationInput | {
    kind: 'block';
    blocks: MessageBlock[];
    spec: {
        id: string;
        contributes?: unknown;
    };
} | {
    kind: 'identity';
    identity: string;
    effects: unknown;
    addressees: readonly unknown[];
} | {
    kind: 'press';
    name: string;
    effects: unknown;
    /** The fire is made as a participant — the answer pipeline answering for one. */
    as: boolean;
    /** The press is on a form block (rather than the composer's own button). */
    onBlock: boolean;
    /** Who that block was put to, when it was put to anyone. */
    blockAddressee: unknown;
};
/**
 * The effects line (plans/29 R-15 *The line*; F41), as one verdict: an
 * out-of-fiction effect — cards, lore, settings, permissions — is the
 * owner's (or an administrator's), from the composer or the review gate, and
 * never a question a character could be asked. Heard at the declaration
 * (`actionFindingsByLaw`: the builder, `validate()`, the packager, a host's
 * publish), at the write (`worldBlockFunctions`, the host's block gate) and
 * at the fire (the host's `fireAction`). The one exception is L1's: a block
 * addressed to the **owner** may carry it, because the owner is already the
 * whole of such an action's `act` audience and pressing the button is the
 * owner acting. A fire made **as** a participant has no exception — that is
 * the answer pipeline answering for someone, and an oracle granting a
 * permission is the thing the line exists to make impossible.
 * @internal
 */
export declare const effectsLineVerdict: import("./verdicts.js").VerdictDecl<EffectsLineInput>;
/**
 * Stamp an `id` on every `choices` and `form` block that has none — the
 * host's half, at the write, with the host's id maker (a uuid). A block that
 * already carries one keeps it. Returns a copy; the input is never mutated.
 * @internal
 */
export declare function assignBlockIds(blocks: MessageBlock[], makeId: () => string): MessageBlock[];
/** A channel head as a block carries it: a positive integer message id. @experimental */
export declare const isChannelHead: (v: unknown) => v is number;
/**
 * Stamp the **channel head** on every `choices` and `form` block (plans/29
 * R-15 *Staleness and order*; 30 §U5f) — the host's half, at the write,
 * with the head it read off the channel. Unlike `assignBlockIds`, a value
 * the block already carries is **replaced**: the head is a fact about the
 * channel at the write, and only the host holds the channel. Returns a
 * copy; the input is never mutated.
 * @internal
 */
export declare function assignBlockHead(blocks: MessageBlock[], head: number): MessageBlock[];
/**
 * Is this form **stale** — issued at a channel head the channel has since
 * moved past, and still unanswered? The one rule (R-15 *Staleness and
 * order*), written once so the host's door and a client's render agree:
 *
 *     !answered && head != null && headNow > head
 *
 * `headNow` is the greatest message id on the block's row's channel as the
 * caller holds it, leaving out the row's own answers (rows whose
 * `metadata.answersForm.messageId` is the block's row) — deleted rows are
 * gone and do not count, hidden rows still exist and do. Answered beats
 * stale everywhere: a form answered before the head moved stays answered.
 * A block with no `head` is never stale.
 * @experimental
 */
export declare function isFormStale(block: {
    head?: unknown;
    answered?: unknown;
}, headNow: number | null | undefined): boolean;
/**
 * Staleness as a verdict (R-15 *Staleness and order*; U5f): `isFormStale`
 * is the judge, and the sentence is the one the host's fire refuses a press
 * with and a dispatched answer is receipted with. The client draws a stale
 * form collapsed as *superseded* from the same verdict, over the head it
 * holds — the `list` door, an affordance; the fire refuses regardless.
 */
/** Input to `stalenessVerdict`'s judge. @experimental */
export interface StalenessInput {
    block: {
        head?: unknown;
        answered?: unknown;
    };
    /** The channel head as the door holds it (`stalenessHead` on the host; the client's `stalenessHeadOf`). */
    headNow: number | null | undefined;
}
/** @internal */
export declare const stalenessVerdict: import("./verdicts.js").VerdictDecl<StalenessInput>;
/**
 * The JSON Schema an oracle answers a form against (R-15: "an oracle with
 * `json` capability answers against the form's schema").
 *
 *  - `choices` → `{ choice: <enum of the option keys> }`, required.
 *  - `form` → the field schema, mapped field by field (`fieldsToJsonSchema`).
 *
 * A `choices` block whose options carry no keys yields an empty enum, which
 * is what the validator refuses on an addressed block before it is written.
 * @internal
 */
export declare function formAnswerSchema(block: FormBlock): Record<string, unknown>;
/**
 * The one field language as JSON Schema — for a `form` block's answer, and
 * for anything else that hands a `SettingsSchema` to a model. Every field
 * type maps; `secret` and `media` map to strings because that is what a
 * model could produce, and a form asking a character for either is a form
 * the author should not have written.
 * @experimental
 */
export declare function fieldsToJsonSchema(fields: SettingsSchema): Record<string, unknown>;
/**
 * The fire a form's answer becomes — what a press sends, and what the
 * answer pipeline commits "exactly as a click would": the block's function,
 * its stamped identity, and the payload. For `choices` the payload is
 * `{ choice }`; for `form` it is the answered values. Null when the answer
 * names no option the block offers, or is not an object — an oracle's
 * answer is checked here before anything is fired.
 * @internal
 */
export declare function formFireOf(block: FormBlock, answer: unknown): {
    fn: string;
    action?: string;
    payload: Record<string, unknown>;
    label?: string;
} | null;
//# sourceMappingURL=messageBlocks.d.ts.map