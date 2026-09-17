/**
 * The review gate (01 §7).
 *
 * The gate lives in the executor substrate, below the type layer, and keys on
 * **declared effects rather than kind** — so an effectful Provider (an MCP tool that
 * sends mail) gates exactly like a Consumer.
 *
 * The properties that matter are all negative, and each has a test:
 *   · the gated party never implements the gate
 *   · plugin code cannot decline it, detect it, or tell an approved payload from an edited one
 *   · an author may default it **on** for their own node; forbidding it is not expressible
 */
import { type SettingsSchema } from './settings.js';
/**
 * On or off, and nothing between.
 *
 * There used to be a third position, `async`: run the node, land the write as a
 * proposal, and record it for somebody to look at later. Nobody could name a
 * case for it. A graph proposal must never auto-apply, so it wants the blocking
 * position; a review record per generated message is noise nobody reads. It was
 * a shape the spec allowed rather than a thing anyone asked for, and every
 * screen that offered it had to explain the difference before the reader could
 * choose.
 *
 * `on` is the old `sync`: the run parks until somebody decides. `resolvePosition`
 * still reads the two old spellings, because a stored setting or a plugin's
 * `reviewDefault` may predate this.
 */
export type ReviewPosition = 'off' | 'on';
export interface ReviewRequest {
    nodeKey: string;
    definitionId: string;
    payload: unknown;
    position: Extract<ReviewPosition, 'on'>;
}
export interface ReviewDecision {
    action: 'approve' | 'edit' | 'reject';
    /** Present only for 'edit'. The binding cannot tell this from an approval. */
    payload?: unknown;
    by: string;
    at: number;
}
export interface ReviewRecord {
    nodeKey: string;
    position: ReviewPosition;
    action: ReviewDecision['action'] | 'proposed';
    originalHash: string;
    editedHash?: string;
    by?: string;
    at?: number;
}
/** Resolver supplied by the host. `sync` parks on this promise; waiting is free (F13). */
export type Reviewer = (req: ReviewRequest) => Promise<ReviewDecision>;
/**
 * The form a reviewer is shown for this node's payload.
 *
 * Inferred from the payload (`inferSchema`) — the one field language settings,
 * plugin forms and review pauses share — and then, when the definition
 * declares `review.fields`, narrowed to those names (U5b review C1). A
 * declared field the payload does not carry infers nothing and is simply
 * absent; an undeclared one is never offered. Absent declaration, the whole
 * payload is the form, as it always was.
 *
 * The host builds the form through this and applies an edit through the SAME
 * schema (`applyFormValues` iterates the schema, never the submission), so a
 * field the form did not offer cannot be written by construction. The refusal
 * in `undeclaredReviewFields` is the second, independent guard: a submission
 * naming one is refused outright rather than dropped in silence.
 */
export declare function reviewSchemaFor(definition: {
    review?: {
        fields: readonly string[];
    };
} | undefined, payload: unknown): SettingsSchema;
/**
 * The keys of a decision's values that the definition's `review.fields` does
 * not allow — empty when nothing is declared (every key is then a form
 * field) or when every submitted key is declared. Non-empty means refuse.
 */
export declare function undeclaredReviewFields(definition: {
    review?: {
        fields: readonly string[];
    };
} | undefined, values: Record<string, unknown> | undefined): string[];
/**
 * There is deliberately no `'never'` position and no descriptor field that could produce
 * one. An author picks a default; the user's setting wins over it. Forbidding review is
 * not a value this type can hold, which is the enforcement (F14).
 */
export declare const POSITIONS: readonly ReviewPosition[];
export declare function hashPayload(v: unknown): string;
/**
 * Resolve the effective position: user setting if present, else the author's default,
 * else off. An author can raise the floor and never lower it below what a user chose.
 */
export declare function resolvePosition(authorDefault: ReviewPosition | undefined, userSetting: unknown): ReviewPosition;
/** Which nodes the gate applies to — effects, not kind (01 §7, 14 §4a). */
export declare function isGated(effects: string | undefined): boolean;
//# sourceMappingURL=review.d.ts.map