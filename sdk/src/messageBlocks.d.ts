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
 */
 | {
    kind: 'choices';
    actions: Array<{
        fn: string;
        label: string;
        icon?: string;
    }>;
}
/**
 * A form rendered from the one field language (`SettingsSchema`);
 * submitting fires `fn` with the entered values as the payload.
 */
 | {
    kind: 'form';
    fields: SettingsSchema;
    fn: string;
    label?: string;
}
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
/**
 * Validate a candidate block tree. Empty findings = renderable. Total, never
 * throws — the host refuses a write on findings rather than crashing on one.
 */
export declare function checkMessageBlocks(value: unknown): MessageBlockFinding[];
