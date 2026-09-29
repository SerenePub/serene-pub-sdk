/**
 * The **Whodunit** genre's two required pipelines: open a case, and take a turn
 * inside one (plans/genres-and-showcase-plugins §4).
 *
 * ## The one idea
 *
 * Adventure gives every member of the cast its own model call. Whodunit asks
 * the question that follows: **what is each of those calls allowed to know?**
 * A suspect who answers out of the whole case file is not a suspect, and every
 * structural decision below is downstream of that one sentence.
 *
 * ## What a voice may know
 *
 * **Each suspect reads their own private lore and nobody else's** (W1, built
 * 2026-09-17). Character-lore visibility is decided by the host at the *lore
 * read* against one subject, and `core:query/character-lore@1` takes that
 * subject on a `speaker` port — so the lane sits INSIDE the voices clause,
 * which is the only place it can sit: a scope is a property of the run and a
 * speaker is a property of the iteration, and there they are one fact. Each
 * voice reads on the reference its own context node resolved
 * (`$.voices.item.context.speaker`), pools it with the world lore, the timeline
 * and the conversation's band, and ranks that pool for itself.
 *
 * ⚠ **The spine still wires no character-lore lane, and must not.** A lane on
 * the gather reads ONCE for the whole run on the narrator's scope — which
 * carries no character, and which the visibility rule reads as omniscient — and
 * every voice in the clause would then be handed the same ranked pool. That is
 * the game over in one wire, so the only character lore in this pipeline is
 * per-speaker and inside the clause.
 *
 * A suspect the cast does not hold — a name the planner invented — resolves to
 * no speaker and reads nobody's private lore, which is the honest answer for
 * somebody who is nobody.
 *
 * The private half of the case in FULL — every suspect's entries at once —
 * still reaches exactly one prompt in the genre, and it is the judge's, at the
 * accusation (`whodunitActions.ts`, `whodunit-verdict`), where the game is over
 * and hiding them would only stop the ending being written.
 *
 * Residual, stated rather than hidden: `{{characters}}` renders every cast card
 * into every prompt, so a secret written into a card's *description* still
 * reaches every voice. A card is the author's public surface; the lorebook is
 * where a secret goes.
 *
 * ## The culprit
 *
 * The solution must be a fact before the first turn, and it must not be a
 * *stored* fact: the only per-session store a spec can reach is the attribute
 * ledger, which the Stats and World State widgets render on screen, so writing
 * the answer there would put it beside the suspicion bars.
 *
 * So it is **derived, by the pipeline, and written down nowhere** (D-4a,
 * 2026-09-17). `core:task/cast-choices@1` turns the room into the option list
 * a question is put with — one entry per live suspect, keyed by participant
 * reference — and `core:task/pick-by-hash@1` picks one of those entries under
 * the session's own scope. Rendezvous hashing, so the create run and every
 * later turn reach the same suspect with nothing stored and nothing on screen,
 * and seating a further suspect mid-case displaces the culprit in about one
 * session in n rather than in all of them.
 *
 * The genre's own copy of that rule is gone with this change: `pickHash32` and
 * `rendezvousPick` (SDK `pick.ts`) are the one implementation the app's
 * binding, this genre and a plugin's picker share, and `whodunit.test.ts` pins
 * that they answer exactly what the genre's copy answered for a fixture
 * session — `session:<id>`, the spelling the binding reads off
 * `$.input.sessionScope`.
 *
 * ⚠ **`whodunit-create` derives the culprit and wires it to nothing**, which
 * is the point rather than an oversight: the derivation IS the record. A
 * create run that published it — on a slot, in the ledger, on the seeded row
 * — would be the answer in the session's own state, one widget away from the
 * player.
 *
 * The one run that needs it asks the same two nodes the same question:
 * `whodunit-verdict` re-derives the pick over the same list and the same scope
 * and compares it with the accusation (`whodunitActions.ts`). Nothing in
 * between carries the answer, which is what "derived rather than stored"
 * buys — and why the pick's two settings must stay identical in both specs.
 *
 * ## The turn
 *
 * Adventure's four agents over this genre's vocabulary: the planner reads the
 * detective's line as the detective's *action* and decides which suspects react
 * and whether the scene turns something up; the narrator writes the moment in
 * the third person with no dialogue in it; one voice call per suspect the
 * planner named; and the state keeper writes down what changed. The voices are
 * joined into ONE reply, exactly as Adventure and Lair join them: the reply is
 * the run's one live row (F7). "One row per suspect" is writable as complete
 * messages inside an `each` (W1), at the cost of streaming and Stop — see
 * `lair.ts`.
 */
/** @internal */
export declare const WHODUNIT_CREATE_SPEC_ID = "core:spec/whodunit-create";
/** @internal */
export declare const WHODUNIT_CREATE_VERSION = "1.0.0";
/**
 * The genre's required member (24 §3): what happens when a Whodunit session is
 * created.
 *
 * Adventure's create pipeline exactly — the cast's greetings, seeded on `main`
 * — because a case opens with a room of people who have already met the
 * detective at the door. No model call, deliberately: creation is a synchronous
 * action a person is waiting on (see `adventure-create` for the argument at
 * length), and the first real beat is a turn or *Search*, which is a button.
 *
 * It does pick the culprit, and still calls no model: `cast-choices` shapes the
 * room and `pick-by-hash` chooses one of it under the session's scope, both
 * pure and both bounded at half a second. The pick lands on no port anybody
 * writes — see the module header — and is **re-derivable** rather than kept:
 * the same two nodes over the same scope reach the same suspect in any later
 * run, which is what a genre asks a hidden fact for.
 *
 * ⚠ **A case with nobody in it fails here.** `pick-by-hash@1` declares no
 * `optional`, so an empty option list halts the create run rather than opening
 * a session whose answer is nobody. The genre requires two characters
 * (`shape.characters.min`), so this is the floor asserting itself.
 * @internal
 */
export declare const whodunitCreateSpec: () => import("@serene-pub/sdk").SpecDocument;
/** @internal */
export declare const WHODUNIT_RESPOND_SPEC_ID = "core:spec/whodunit-respond";
/** @internal */
export declare const WHODUNIT_RESPOND_VERSION = "1.0.0";
/**
 * What the planner answers with.
 *
 * Adventure's schema with the sky taken out and the evidence put in. Every
 * property is required and every one is a string, an array or an object of
 * those, because the llama.cpp family compiles this to a GBNF grammar and
 * refuses anything outside that set rather than loosening it — see
 * `adventure.ts` for the full argument.
 *
 * ⚠ **There is no `culprit` property and there must not be.** The planner's
 * document is wired into the narrator's context AND into every voice's
 * (`build-side-character-context@1` takes `plan`), so anything the planner
 * writes is read by every suspect in the room. `clueSurfaced` is as close as
 * this schema comes to the solution, and it is a fact about the SCENE — what
 * the detective just turned up — not about who did it.
 * @internal
 */
export declare const WHODUNIT_PLAN_SCHEMA: {
    readonly type: 'object';
    readonly properties: {
        readonly beats: {
            readonly type: 'array';
            readonly items: {
                readonly type: 'string';
            };
        };
        readonly speakers: {
            readonly type: 'array';
            readonly items: {
                readonly type: 'object';
                readonly properties: {
                    readonly name: {
                        readonly type: 'string';
                    };
                    readonly intent: {
                        readonly type: 'string';
                    };
                };
                readonly required: readonly ['name', 'intent'];
                readonly additionalProperties: false;
            };
        };
        /**
         * What this turn turned up, in one sentence, or empty — which is most
         * turns. The keeper reads the written scene rather than this field, so
         * a planner that promised a clue the narrator did not deliver raises
         * nothing; this is the planner telling the narrator to put one in.
         */
        readonly clueSurfaced: {
            readonly type: 'string';
        };
        /**
         * Where this happens. One hint rather than Adventure's three: a case is
         * a house and an afternoon, and a genre that asked for weather would
         * teach its narrator to describe a sky instead of a room.
         */
        readonly worldHints: {
            readonly type: 'object';
            readonly properties: {
                readonly location: {
                    readonly type: 'string';
                };
            };
            readonly required: readonly ['location'];
            readonly additionalProperties: false;
        };
    };
    readonly required: readonly ['beats', 'speakers', 'clueSurfaced', 'worldHints'];
    readonly additionalProperties: false;
};
/**
 * What the state-keeper answers with — Adventure's two lists over this genre's
 * vocabulary.
 *
 * `inventory` is kept even though a mystery moves few objects: the resolver
 * takes one shape, and a keeper reporting in a second vocabulary because this
 * genre rarely needs the first would be two ledgers for one table. A letter
 * that changes hands is exactly what it is for.
 * @internal
 */
export declare const WHODUNIT_KEEPER_SCHEMA: {
    readonly type: 'object';
    readonly properties: {
        readonly values: {
            readonly type: 'array';
            readonly items: {
                readonly type: 'object';
                readonly properties: {
                    readonly owner: {
                        readonly type: 'string';
                    };
                    readonly slot: {
                        readonly type: 'string';
                        readonly enum: string[];
                    };
                    readonly value: {
                        readonly type: 'string';
                    };
                };
                readonly required: readonly ['owner', 'slot', 'value'];
                readonly additionalProperties: false;
            };
        };
        readonly inventory: {
            readonly type: 'array';
            readonly items: {
                readonly type: 'object';
                readonly properties: {
                    readonly owner: {
                        readonly type: 'string';
                    };
                    readonly entryId: {
                        readonly type: 'integer';
                    };
                    readonly delta: {
                        readonly type: 'integer';
                    };
                };
                readonly required: readonly ['owner', 'entryId', 'delta'];
                readonly additionalProperties: false;
            };
        };
    };
    readonly required: readonly ['values', 'inventory'];
    readonly additionalProperties: false;
};
/** @internal */
export declare const whodunitRespondSpec: () => import("@serene-pub/sdk").SpecDocument;
//# sourceMappingURL=whodunit.d.ts.map