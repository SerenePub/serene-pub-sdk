/**
 * The Writing Room's actions (plans/genres §2; U2) — the small pipelines an
 * author fires from the composer and from a chunk of the manuscript.
 *
 * `session-action` is an OPEN event: any number of pipelines may serve it, and
 * which ones a session offers is the preset's `actions.include`. Six actions in
 * three shapes, and the shapes are what the file is organised by:
 *
 *  - **the manuscript's verbs** — *Continue*, *Rewrite*, *Expand*, *Tighten*.
 *    One graph, four sets of instructions. Each reads the manuscript as a folio
 *    and writes prose back to the manuscript; *Continue* adds a chunk, the
 *    other three take the chunk they were pressed on and replace it.
 *  - **the conversation's** — *Brainstorm* and *Critique this passage*. The
 *    companion answers on `main`, with the manuscript as context.
 *  - **the two that are neither** — *Add to bible*, which asks a model for one
 *    lore entry and lands it behind the review gate, and *Export*, which makes
 *    no model call at all.
 *
 * ## Why each verb is its own spec
 *
 * A shipped prompt is resolved per (node definition, slot) per spec, so four
 * verbs sharing one spec would ship four verbs one set of instructions. Four
 * specs is what gives *Tighten* its own wording and *Expand* its own, in the
 * same pool, each editable without touching the other — the reasoning
 * `adventureActions.ts` records for Rest and Advance time, applied to prose.
 *
 * ## The subject: the chunk that was pressed
 *
 * *Rewrite*, *Expand*, *Tighten* and *Critique* are **message-venue** actions:
 * a press carries `messageId`, and `create-message`'s `row` port takes it, so
 * the chunk the author pressed is the row the rewrite lands in. They are
 * offered only on the newest row of the manuscript (`enabledWhen`), which is
 * also the last passage of the folio the model is shown — so "this passage" and
 * "the end of the manuscript above" are the same passage by construction.
 *
 * ⚠ **A sub-passage selection cannot ride along.** A fire carries a message and
 * a payload, and the payload is a form's answer or a widget's `invoke` args —
 * nothing in the client sends a text range. So the unit is the chunk, which is
 * why the genre has a chunk length at all.
 */
/** @internal */
export declare const WRITING_ROOM_CONTINUE_SPEC_ID = "core:spec/writing-room-continue";
/** @internal */
export declare const WRITING_ROOM_REWRITE_SPEC_ID = "core:spec/writing-room-rewrite";
/** @internal */
export declare const WRITING_ROOM_EXPAND_SPEC_ID = "core:spec/writing-room-expand";
/** @internal */
export declare const WRITING_ROOM_TIGHTEN_SPEC_ID = "core:spec/writing-room-tighten";
/** @internal */
export declare const WRITING_ROOM_ACTION_VERSION = "1.1.0";
/** The one quick verb: another chunk, at the length the session asked for. @internal */
export declare const writingRoomContinueSpec: () => import("@serene-pub/sdk").SpecDocument;
/** @internal */
export declare const writingRoomRewriteSpec: () => import("@serene-pub/sdk").SpecDocument;
/** @internal */
export declare const writingRoomExpandSpec: () => import("@serene-pub/sdk").SpecDocument;
/** @internal */
export declare const writingRoomTightenSpec: () => import("@serene-pub/sdk").SpecDocument;
/** @internal */
export declare const WRITING_ROOM_BRAINSTORM_SPEC_ID = "core:spec/writing-room-brainstorm";
/** @internal */
export declare const WRITING_ROOM_CRITIQUE_SPEC_ID = "core:spec/writing-room-critique";
/** @internal */
export declare const writingRoomBrainstormSpec: () => import("@serene-pub/sdk").SpecDocument;
/** @internal */
export declare const writingRoomCritiqueSpec: () => import("@serene-pub/sdk").SpecDocument;
/** @internal */
export declare const WRITING_ROOM_ADD_TO_BIBLE_SPEC_ID = "core:spec/writing-room-add-to-bible";
/**
 * The genre's declared lore write (R-B), and the one action on the **world**
 * side of the effects line: a lore entry is a row in a book that outlives the
 * session, so the action is `world`, its audience is the owner, and no message
 * block may ever name it.
 *
 * ## The form is the review gate, not a `form` block
 *
 * The plan asked for "a form: name, content". It is one — it is just not a
 * block in a message. `core:outlet/create-lore-entry@1` declares
 * `review: { fields: ['name', 'content'] }`, which means core holds the write
 * at the gate and shows the author **those two fields, editable**, before
 * anything lands. A `form` block could not have done it: a world action is
 * exactly what a block may not name, which is the rule that stops a character
 * asking a question that rewrites a lorebook.
 *
 * So the model proposes and the author confirms, in the surface the app already
 * has for "a pipeline wants to write something".
 *
 * ## Two readings of one document
 *
 * A data reference is `{node, port}` with no sub-path, so the entry's name and
 * its content cannot come off one node. The proposal is read twice at two
 * paths, each one pure and costing a millisecond — the same construction Lair's
 * knock uses for its question.
 * @internal
 */
export declare const WRITING_ROOM_BIBLE_SCHEMA: {
    readonly type: 'object';
    readonly required: readonly ['name', 'content'];
    readonly properties: {
        readonly name: {
            readonly type: 'string';
            readonly description: "The entry's name — the thing itself, as the manuscript calls it.";
        };
        readonly content: {
            readonly type: 'string';
            readonly description: 'What is true about it, in a few sentences. Facts the story must keep, not a summary of what has happened.';
        };
    };
};
/** @internal */
export declare const writingRoomAddToBibleSpec: () => import("@serene-pub/sdk").SpecDocument;
/** @internal */
export declare const WRITING_ROOM_EXPORT_SPEC_ID = "core:spec/writing-room-export";
/**
 * The manuscript, compiled to Markdown — **as a message, not as a file.**
 *
 * ⚠ **There is no download path for a session's own content**, and this is the
 * gap rather than a preference. `pipeline_run_artifacts` stores pointers and no
 * bytes; the one outlet that reaches document-capable storage is
 * `attach-audio@1`, whose contract says audio; `Sockets.Sessions.ExportLogs` is
 * a type with no handler, no event and no caller. A `.md` file would have had
 * to be invented — a new outlet, a new shape and a route — so it is not.
 *
 * What this does instead is the nearest supported thing: one `md` block on
 * `main`, which the log renders as Markdown and a person can select and copy.
 *
 * ⚠ A block's text is capped at 64 KiB (`MESSAGE_BLOCK_LIMITS.maxText`), so a
 * long manuscript is refused at the write rather than truncated. That cap is
 * the second half of the same gap: a card is not a document.
 *
 * No model call anywhere in it — a compile is a join.
 * @internal
 */
export declare const writingRoomExportSpec: () => import("@serene-pub/sdk").SpecDocument;
/** Every action pipeline the Writing Room ships. @internal */
export declare const WRITING_ROOM_ACTION_SPECS: (typeof writingRoomContinueSpec)[];
//# sourceMappingURL=writingRoomActions.d.ts.map