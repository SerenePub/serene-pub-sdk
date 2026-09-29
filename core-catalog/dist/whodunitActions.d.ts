/**
 * The **Whodunit** genre's actions — what a detective does that is not simply
 * talking (plans/genres-and-showcase-plugins §4, "Actions").
 *
 * `session-action` is an OPEN event, so each of these is its own small pipeline
 * contributing its own button, and removing one from a preset takes the button
 * with it and breaks nothing. Three shapes, and two of them come in pairs:
 *
 *  - **Question** → **Answer**. The detective types a question, picks who to
 *    put it to from a form, and that suspect answers in their own voice. Two
 *    specs because a spec has one inlet and one graph, and asking and answering
 *    are two graphs — Adventure's Ask/Answer pair, with the form turned round.
 *  - **Search** is a narrator turn that may move the ledger: the scene
 *    describes what the detective turns over, and the state keeper decides
 *    whether that was actually a clue.
 *  - **Accuse** → **Verdict**. The same form shape as Question, ending in the
 *    one pipeline in this genre that is allowed to know who did it.
 *
 * ## The forms are addressed to the OWNER
 *
 * Every form here is a `choices` block with `addressee: 'owner'` wired on the
 * port (R-15 *Forms*; the port wins over the document's, by contract). That is
 * the U5d machinery pointed at a person rather than at a character, and it is
 * the right address for the same reason in both pairs: *who do you want to ask*
 * and *who do you say did it* are the detective's questions to answer, and a
 * model that could address them to somebody in the room would be the suspects
 * choosing who gets interrogated.
 *
 * None of these declares `effects: 'world'`, which is what lets a form carry
 * them at all: `worldBlockFunctions` refuses any message block naming a world
 * action (the effects line, R-15), and it is why Lair's knock cannot save a
 * room. Nothing here writes outside the session — messages and the session's
 * own state ledger, both of which are the fiction.
 *
 * ## ⚠ `lorebook-triggers` appears in exactly one spec below
 *
 * `core:query/lorebook-triggers@1` returns world lore, **character lore** and
 * history through one port, so wiring it is wiring the suspects' private
 * entries. Nothing here wires it. The two pipelines that put prose in front of
 * a model — *Answer* and *Search* — read `world-lore` and `history-entries` as
 * two explicit lanes instead, which is the decision `whodunit.ts` takes for the
 * turn and for the same reason; the two pickers read no lore at all — and,
 * since D-4a (2026-09-17), no transcript and no model either: the room IS the
 * option list, and `core:task/cast-choices@1` shapes it. The single exception
 * is `whodunit-verdict`, whose whole job is to know.
 */
/** @internal */
export declare const WHODUNIT_QUESTION_SPEC_ID = "core:spec/whodunit-question";
/** @internal */
export declare const WHODUNIT_QUESTION_VERSION = "1.0.0";
/** @internal */
export declare const WHODUNIT_ANSWER_SPEC_ID = "core:spec/whodunit-answer";
/** @internal */
export declare const WHODUNIT_ANSWER_VERSION = "1.0.0";
/**
 * **Question**: the detective puts something to one suspect.
 *
 * The collected text (lair pass R3) is the **question** — the one thing a person always has
 * when they press this — and the form is only *who*. The block is addressed to
 * the owner, its options fire `whodunit-answer`, and the row it lands on is the
 * question itself, so the suspect's voice reads it out of the transcript like
 * anything else said in the room.
 *
 * ## No model stands between the room and the question (D-4a, 2026-09-17)
 *
 * This spec used to spend a whole `generate-json@1` call whose entire job was
 * to read the cast back out as `{ key, label }` and echo the detective's own
 * question at them — a request, a schema and a wait for two facts the run
 * already held, with a model free to misspell a suspect, invent one or leave
 * one out, and what it wrote was what the player could press.
 * `core:task/cast-choices@1` publishes the room in exactly the shape
 * `make-choices@1` reads, the detective's words go on the `question` port, and
 * the whole picker is two pure nodes bounded at half a second each.
 *
 * ⚠ **The question is `$.input.text`, not a prompt.** It is what the person
 * typed, which is the point: the row carries their words, and *Answer*'s
 * suspect reads the question out of the transcript. A composer press with
 * nothing typed therefore puts up no block — `make-choices@1` publishes none
 * for a document with no question — which is the same silence it answers an
 * empty room with.
 * @internal
 */
export declare const whodunitQuestionSpec: () => import("@serene-pub/sdk").SpecDocument;
/**
 * **Answer**: the suspect the detective picked answers, and nobody else does.
 *
 * `read-answer` takes the press apart; the chosen option's label is the
 * suspect's name, and `build-side-character-context@1` resolves that name
 * against the cast — which is what decides whose card is compiled at full
 * visibility, what `{{char}}` renders and the name on the line the model
 * continues from (`asSideCharacter`, in the app's bindings).
 *
 * ⚠ **This is the genre's promise at its narrowest, and its limit.** The reply
 * is written by one call, in one person's voice, from a corpus that holds the
 * case as publicly known and no suspect's private entries at all — see
 * `whodunit.ts` for why the lane is withheld rather than scoped. What this
 * suspect knows that the others do not has to be on their card.
 *
 * Declared on its own spec rather than folded into *Question*: a spec has one
 * inlet and one graph.
 * @internal
 */
export declare const whodunitAnswerSpec: () => import("@serene-pub/sdk").SpecDocument;
/** @internal */
export declare const WHODUNIT_SEARCH_SPEC_ID = "core:spec/whodunit-search";
/** @internal */
export declare const WHODUNIT_SEARCH_VERSION = "1.0.0";
/**
 * **Search**: the detective turns the place over, and the ledger may move.
 *
 * Two agents and one row. The narrator writes what searching this place with
 * this question in mind actually turns up — from the case and the state, never
 * invented — and then the state keeper reads that scene and decides whether it
 * was a clue. `clues-found` rises when the scene genuinely produced something
 * and not because a button was pressed, which is the difference between a
 * counter and a score.
 *
 * ⚠ **The keeper reads the scene, so it runs after the write** — Adventure's
 * ordering rule: `afterWrite` is the edge that makes the keeper's changes
 * anchor to a message that EXISTS, which is how a swipe takes them back with
 * it.
 * @internal
 */
export declare const whodunitSearchSpec: () => import("@serene-pub/sdk").SpecDocument;
/** @internal */
export declare const WHODUNIT_ACCUSE_SPEC_ID = "core:spec/whodunit-accuse";
/** @internal */
export declare const WHODUNIT_ACCUSE_VERSION = "1.0.0";
/** @internal */
export declare const WHODUNIT_VERDICT_SPEC_ID = "core:spec/whodunit-verdict";
/** @internal */
export declare const WHODUNIT_VERDICT_VERSION = "1.0.0";
/**
 * **Accuse**: the detective names somebody, and the case ends either way.
 *
 * The same picker as *Question* over the same list, addressed to the same
 * person, firing `whodunit-verdict` instead. It is quick because it is the
 * button the whole session is pointed at, and it goes quiet the moment a
 * verdict lands. Two pure nodes and no model, for the reason *Question* gives
 * at length: a model enumerating the room can misspell a suspect or invent
 * one, and here the list it writes is the list the case is decided from.
 *
 * ⚠ **The question above the options is a literal**, not `$.input.text` and no
 * longer a prompt row. *Question* can take the detective's words because they
 * always have some — the question IS what they typed — and an accusation is a
 * button somebody presses with an empty composer, which `make-choices@1` would
 * answer with no block at all. So the line is written here, in English, until
 * this genre's documents can carry a locale map.
 * @internal
 */
export declare const whodunitAccuseSpec: () => import("@serene-pub/sdk").SpecDocument;
/**
 * What the judge answers with — **the ending's plan, and nothing decided**.
 *
 * The verdict is not here any more (contracts batch 2, 2026-09-17). A junction
 * over `core:task/pair@1`'s document decides it, and the word written into
 * `core:slot/case@1` comes off the branch that fired. What is left is the one
 * thing there is a model for at this moment: how the reveal goes.
 *
 * `beats` is how it reaches the page — the narrator downstream takes this
 * document on its `plan` port and `{{beats}}` is what renders off it
 * (`sceneAnchor`, in the app's prompt layer), so the judge is told who did it
 * and asked to name them in the first beat.
 *
 * ⚠ **No `verdict` property and no `culprit` property**, and both absences are
 * the rule rather than a tidy-up. A model that could write either could
 * disagree with the pick — `solved` over a wrong accusation, or a second name
 * for the culprit — and the ledger would then say one thing while the prose
 * said another, with no way to tell which was the game.
 * @internal
 */
export declare const WHODUNIT_VERDICT_SCHEMA: {
    readonly type: 'object';
    readonly properties: {
        readonly beats: {
            readonly type: 'array';
            readonly items: {
                readonly type: 'string';
            };
        };
    };
    readonly required: readonly ['beats'];
    readonly additionalProperties: false;
};
/**
 * **Verdict**: the one pipeline in this genre that is allowed to know.
 *
 * ## Where the culprit comes from
 *
 * **Derived again, exactly as the case was opened** (contracts batch 2,
 * 2026-09-17): `core:task/cast-choices@1` shapes the room into the same option
 * list, `core:task/pick-by-hash@1` picks over it under the same
 * `$.input.sessionScope` with the same identity rule, and rendezvous hashing
 * reaches the suspect the create run reached — with nothing stored, nothing on
 * screen and nothing for a widget to render. `whodunit.ts`'s module header is
 * the long version of why the answer is a derivation rather than a row.
 *
 * The case's private half is still read here and nowhere else: this is the
 * single spec in the genre that wires `core:query/lorebook-triggers@1` — the
 * node that returns world lore, **character lore** and history through one
 * port — because the ending is written at the moment the game is over, and
 * hiding them then would only stop it being written.
 *
 * ## Who decides, and who is told
 *
 * `core:task/pair@1` puts the accusation and the pick in one document, under
 * `accused` and `culprit`, and the `verdict` junction compares them with
 * `{ path: 'accused', equalsPath: 'culprit' }`. Each branch is a **task**
 * publishing one word — 01 §4 keeps every write off a clause's inside — and
 * `outcome` folds whichever fired into the value the ledger takes.
 *
 * So the outcome of the game is decided by the graph and never by a model, and
 * the judge becomes what it should have been all along: the ending's
 * **planner**, told the verdict and the culprit and asked how the reveal goes.
 *
 * ⚠ **An accusation that never arrived cannot solve the case.** `pair@1` omits
 * an absent side rather than writing null, and `predicateHolds` answers false
 * when either side of an `equalsPath` is absent — so a run whose `accused`
 * published nothing falls through to `failed`, never to `solved`.
 *
 * ⚠ **The two key names ARE the predicate's paths.** `firstKey` and
 * `secondKey` are `quick` parameters, so a config panel renders them: renaming
 * them renames what the branch reads, and the branch then never fires. They are
 * preset values rather than literals because a node declaring a parameters slot
 * has to wire it (`paramsSlotWiring`) — this is the cost of that law, written
 * down because nothing else writes it down.
 *
 * ## Two writes, one outlet
 *
 * The verdict lands on `core:slot/case@1` through `set-state`, which is a Task
 * and not a write-class outlet; the ending is the outlet. And it is **applied,
 * not proposed**: `trustNarrator` governs what the
 * state keeper may do to the fiction's numbers, and this is not a number in the
 * fiction, it is the game's outcome. A verdict parked at a review gate is a
 * case that never closes and an *Accuse* button that never goes quiet.
 * @internal
 */
export declare const whodunitVerdictSpec: () => import("@serene-pub/sdk").SpecDocument;
//# sourceMappingURL=whodunitActions.d.ts.map