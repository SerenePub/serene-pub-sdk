/**
 * The Adventure genre's actions — the small pipelines a player fires from the
 * composer (DESIGN-adventure-genre.md, "Actions").
 *
 * `session-action` is an OPEN event: any number of pipelines may serve it, and
 * which ones a session offers is the preset's `actions.include`. So these are
 * the E-series "events are all optional" made concrete — each is two or three
 * nodes, each contributes its own button, and removing one from a preset takes
 * the button with it and breaks nothing.
 *
 * ## Two shapes, three specs
 *
 * `adventure-look` writes a message and changes nothing. The other two change
 * state and write no message at all, which is worth stating plainly because it
 * looks like a bug the first time you see a run with no reply: pressing Rest
 * produces a ledger under the last message, not a new one. A pipeline may
 * write as often as it likes and is not obliged to write at all (F7).
 *
 * ## Why `adventure-inventory` is not here
 *
 * The design lists a fourth action: a prose inventory check with no model call.
 * Two things say it should not be a pipeline. What somebody carries is their
 * `inventory` stat (phase 3b), already in the state block every prompt reads,
 * so a pipeline would only restate it. And the question it answers was the one
 * the **Inventory widget** answered continuously, in the session, with the item
 * prose on hover. A button that writes a worse copy of a panel already on
 * screen is a feature competing with itself. (R79 removed that widget for now;
 * the first reason still stands on its own, so the action stays out.)
 */
/** @internal */
export declare const ADVENTURE_LOOK_SPEC_ID = "core:spec/adventure-look";
/** @internal */
export declare const ADVENTURE_LOOK_VERSION = "1.0.0";
/**
 * The narrator describes where you are, from the lore and the world state, and
 * changes nothing.
 *
 * It is also the opening scene: the create pipeline deliberately makes no model
 * call, so this is the button a new Adventure session is meant to start with.
 *
 * ⚠ **The one shipped spec that wires `core:task/build-template-context@1`'s
 * `state` port.** That port has been declared and unfilled since the stats
 * substrate landed, because Chat must never grow a state block. This is a genre
 * that wants one, using the standard context surface to get it.
 * @internal
 */
export declare const adventureLookSpec: () => import("@serene-pub/sdk").SpecDocument;
/** @internal */
export declare const ADVENTURE_REST_SPEC_ID = "core:spec/adventure-rest";
/** @internal */
export declare const ADVENTURE_REST_VERSION = "1.0.0";
/** Stop and recover: stamina and health back, and the clock moves on. @internal */
export declare const adventureRestSpec: () => import("@serene-pub/sdk").SpecDocument;
/** @internal */
export declare const ADVENTURE_ADVANCE_TIME_SPEC_ID = "core:spec/adventure-advance-time";
/** @internal */
export declare const ADVENTURE_ADVANCE_TIME_VERSION = "1.0.0";
/** Let time pass: the world clock steps on, and the weather may turn with it. @internal */
export declare const adventureAdvanceTimeSpec: () => import("@serene-pub/sdk").SpecDocument;
/** @internal */
export declare const ADVENTURE_ASK_SPEC_ID = "core:spec/adventure-ask";
/** @internal */
export declare const ADVENTURE_ASK_VERSION = "1.0.0";
/** @internal */
export declare const ADVENTURE_ANSWER_SPEC_ID = "core:spec/adventure-answer";
/** @internal */
export declare const ADVENTURE_ANSWER_VERSION = "1.0.0";
/**
 * What the narrator's question comes back as, from `generate-json@1`.
 *
 * The addressee is a **name** rather than a participant reference: the
 * model reads names off the transcript, and `make-choices@1` resolves
 * the name — against the cast first, then the members' presences, by
 * name or nickname — into `character:<id>` at the write. A name that
 * resolves to nobody leaves the block unaddressed; a press on an
 * unaddressed block is answered as the presser (their presence when
 * they hold one, else their own line).
 * @internal
 */
export declare const ADVENTURE_ASK_SCHEMA: {
    readonly type: 'object';
    readonly properties: {
        readonly addressee: {
            readonly type: 'string';
        };
        readonly question: {
            readonly type: 'string';
        };
        readonly options: {
            readonly type: 'array';
            readonly minItems: 2;
            readonly maxItems: 4;
            readonly items: {
                readonly type: 'object';
                readonly properties: {
                    readonly key: {
                        readonly type: 'string';
                    };
                    readonly label: {
                        readonly type: 'string';
                    };
                };
                readonly required: readonly ['key', 'label'];
                readonly additionalProperties: false;
            };
        };
    };
    readonly required: readonly ['addressee', 'question', 'options'];
    readonly additionalProperties: false;
};
/**
 * **Ask**: the narrator puts a question with options to one of the cast.
 *
 * The worked form of R-15: the oracle writes `{ addressee, question, options }`,
 * `make-choices` turns it into a `choices` block addressed to that cast
 * member (`character:<id>`) whose options fire `answer`, and the narration
 * row carries it. The host stamps the block with this spec's `answer` action
 * and an id at the write; if the run's pinned portrayals say the AI portrays
 * the addressee, it records `form-addressed` and the genre's answer pipeline
 * (`core:spec/answer-form-adventure`) answers as them — else the block waits
 * for the person portraying them to click. Either way the click, real or
 * committed, runs `adventure-answer` below.
 *
 * Two actions on one spec, each its own thing to the venue model: `ask` is
 * the composer's chip and `/ask`; `answer` is what the block's options fire,
 * declared here so the block has an identity to be stamped with. `answer`
 * is offered to any participant — the form's **addressee** is who may
 * actually press it, decided per block at the fire.
 * @internal
 */
export declare const adventureAskSpec: () => import("@serene-pub/sdk").SpecDocument;
/**
 * **Answer**: what a form's option fires — the addressee's line, as the
 * addressee. `read-answer` takes the press apart (the chosen option's label,
 * who answered and their character row) and `create-message` posts the
 * label as that participant's message. A person portraying the addressee
 * clicks and the row is theirs; the answer pipeline commits an oracle's
 * choice and the row is the AI's — same spec, same row, either way, which
 * is the whole of "exactly as a click would".
 *
 * Declared on its own spec rather than folded into `ask`: a spec has one
 * inlet and one graph, and asking and answering are two graphs.
 * @internal
 */
export declare const adventureAnswerSpec: () => import("@serene-pub/sdk").SpecDocument;
//# sourceMappingURL=adventureActions.d.ts.map