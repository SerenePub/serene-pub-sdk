/**
 * The flagship genre's two required pipelines: create a world, and take a turn
 * in it (DESIGN-adventure-genre.md).
 *
 * ## The one idea
 *
 * Adventure is chat with a **narrator who plans, a cast who speak for
 * themselves, and a state-keeper who writes the numbers down.** Four agents,
 * one turn, one receipt. Everything the player sees on screen — bars, an
 * inventory, the world strip, the ledger under a reply — is a consequence of
 * the keeper's proposals, never of prose parsing.
 *
 * ## Two of the four are asked a question, not given a turn
 *
 * The planner and the keeper produce documents, and the shape of the REQUEST is
 * what makes that true rather than the wording of the instructions. They pin
 * `core:oracle/generate-json@1`: no speaker, no trailing line to continue, and
 * the answer's schema on the wire wherever the connection can carry one. Their
 * transcript is `core:task/prose-transcript@1` for the same reason, in the one
 * place a rendered prompt cannot be repaired afterwards.
 *
 * The narrator and the voices are turns, and each ends on its own speaker's
 * line. Asked the other way round, every one of these four is a defect a live
 * playtest produced: a planner that wrote the character's next paragraph and
 * appended its JSON, a keeper that answered in the planner's schema because it
 * had just read one in the transcript, a narrator prefilled as a cast member,
 * and two voices seeded with the same person's name.
 *
 * The one-LLM-call rule is Chat's. This pipeline makes three calls plus one per
 * speaking cast member, and that is the point of the genre existing beside the
 * standard chat rather than replacing it.
 *
 * ## Why each agent has its own context node type
 *
 * `build-planner-context@1`, `build-scene-context@1`,
 * `build-side-character-context@1` and `build-keeper-context@1` are four
 * surfaces onto one builder. The reason is not taste: a prompt lives in a pool
 * keyed by (node type, slot) and `defaultPromptFor` resolves **one row per pool
 * per spec**, so four agents sharing one type would ship four agents one set of
 * instructions. Four types is four pools is four shipped prompts, and a person
 * who wants the narrator wordier edits the narrator.
 *
 * Each stage owns its own `connection` and `sampling` slots too, so the whole
 * turn runs on one model or splits across two — a small fast model for the
 * planner and the keeper, a large one for the prose, which is the split this
 * shape exists to make possible.
 *
 * ## What is deliberately NOT here
 *
 *  - **The tool loop under `planWrite.needsLookup`.** The planner still produces
 *    the flag and it lands on the receipt, but no branch consumes it yet. A looping
 *    narrator needs a prompt carrying BOTH the scene context (cards, lore,
 *    budget) and the accumulating tool results, and `core:task/assemble@2` takes
 *    one `templateContext` port — a literal bag like the tool-loop reference's
 *    would drop the character cards the scene is written from, and core has no
 *    node that merges two template contexts. Wiring it is a change to this file
 *    the day one exists.
 *  - **A message-ordering interleave.** `assemble` here is `join-text`: the
 *    narrator's scene, then the voices in the order the planner listed them.
 *    Interleaving beat by beat would need a node that takes an order and a set
 *    of texts, which is a new declaration this lane did not need to make.
 */
export declare const ADVENTURE_CREATE_SPEC_ID = "core:spec/adventure-create";
export declare const ADVENTURE_CREATE_VERSION = "1.0.0";
/**
 * The genre's one required member: what happens when an Adventure session is
 * created.
 *
 * ## Attaching the slots is writing nothing
 *
 * The design says creation "attaches the lorebook's world slots and each cast
 * member's card config". Resolution already does that by READING: `valueOf`
 * walks session → lorebook → card → declaration default, and absence means
 * inherit. So attaching is materialising rows that say what the declaration
 * already says, and the one thing a seed must never do is write a row nobody
 * asked for — a stored 20 would stop tracking a card that later says 40.
 *
 * What makes the slots appear at all is the genre declaring them (`genreSlots`);
 * this pipeline's job is the greetings, exactly as Chat's is.
 *
 * ## No opening narration, deliberately
 *
 * The design asks for the narrator to run once for the opening scene. It is not
 * here, and the reason is what creating a session is: a synchronous action a
 * person is waiting on. A model call inside it makes "New session" as slow as
 * the slowest backend and fails the whole creation when no connection is set —
 * on the one screen where a new user is most likely to have set none. The
 * opening scene is `core:spec/adventure-look` instead, which is a button.
 */
export declare const adventureCreateSpec: () => import("@serene-pub/sdk").SpecDocument;
export declare const ADVENTURE_RESPOND_SPEC_ID = "core:spec/adventure-respond";
export declare const ADVENTURE_RESPOND_VERSION = "1.0.0";
export declare const ADVENTURE_PLAN_SCHEMA: {
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
        readonly worldHints: {
            readonly type: 'object';
            readonly properties: {
                readonly location: {
                    readonly type: 'string';
                };
                readonly timeOfDay: {
                    readonly type: 'string';
                    readonly enum: readonly ['morning', 'day', 'dusk', 'night'];
                };
                readonly weather: {
                    readonly type: 'string';
                    readonly enum: readonly ['clear', 'fog', 'rain', 'storm', 'snow'];
                };
            };
            readonly required: readonly ['location', 'timeOfDay', 'weather'];
            readonly additionalProperties: false;
        };
        readonly needsLookup: {
            readonly type: 'boolean';
        };
    };
    readonly required: readonly ['beats', 'speakers', 'worldHints', 'needsLookup'];
    readonly additionalProperties: false;
};
export declare const ADVENTURE_KEEPER_SCHEMA: {
    readonly type: 'object';
    readonly properties: {
        /** A tracked value the scene changed. Empty is the ordinary turn. */
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
        /**
         * Something changing hands, by the entry id the lore gave it.
         *
         * Its own list rather than a second arm inside `values`, because a
         * schema can only be strict about a list whose items are all one shape.
         * The two are joined again by the `path` parameter naming both.
         */
        readonly possessions: {
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
    readonly required: readonly ['values', 'possessions'];
    readonly additionalProperties: false;
};
export declare const adventureRespondSpec: () => import("@serene-pub/sdk").SpecDocument;
//# sourceMappingURL=adventure.d.ts.map