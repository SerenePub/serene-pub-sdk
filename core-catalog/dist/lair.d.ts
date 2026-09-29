/**
 * The **Lair** genre's two required pipelines: make a dungeon, and take a turn
 * inside it (plans/genres-and-showcase-plugins §3).
 *
 * ## The one idea
 *
 * Adventure asks *what does the world do to the player*. Lair asks the other
 * one: the person at the keyboard **is** the dungeon, and the party delving
 * into it is the AI. Everything structural follows from that inversion —
 * `personas.max: 0` (the master is not in the scene), `voice: 'narrator'` (the
 * pipeline has a voice of its own: the turn order's null entry, `carryOnEntry`,
 * the Narrate press and the seed line all name it — it does not mean a narrator
 * writes every turn) and, here in the spec, the one thing no shape value says:
 *
 * ## The composer's text is DIRECTION, not a line
 *
 * `$.input.text` reaches the planner as *instructions from whoever is running
 * this place*, never as a participant's turn — the planner's shipped prompt
 * says so in those words, and the seed line is the own voice's (the
 * Castellan's), so nothing the master types is ever continued as dialogue. That is a decision this pipeline
 * makes about prose the shape already declared nobody owns; a fourth shape
 * value for it would restate `personas: { max: 0 }` in a second vocabulary.
 *
 * ## A turn is the Castellan's (R8, owner F2/F4/F6 2026-09-28)
 *
 * The Lair is cast only, and **the person is the narrator**: their lines on
 * `main` are what the dungeon does. Nothing narrates a turn. A turn is one
 * run of the dungeon's steward, the Castellan (the turn order's pre-cast
 * entry, the pipeline's own voice):
 *
 *  1. the **planner** plans the party — who speaks, and why — never a dungeon
 *     event;
 *  2. then **either the knock** — one complete Castellan question on `main`,
 *     and nothing else — **or the play**:
 *     - the **beats row** in the Sanctum, first, whole (a list, nothing to
 *       stream), so the master reads the plan while the party speak;
 *     - the **lead delver's** line, streamed — the run's live row, opened
 *       only now, so nothing streams before it;
 *     - the rest of the party, complete rows in the planner's order;
 *  3. the **keeper** keeps the books: the world's changes filed at the beats
 *     row (`set-state`'s declared `worldRow`), a delver's at their own line.
 *
 * **Narrate** (`core#narrate`, `via: 'narrate'`) is the other thing the
 * Castellan does: one streamed narration on `main`, whichever composer
 * fired it — it is fiction, and the party only ever hear `main`. It is
 * routed first, ahead of the Sanctum and the story.
 *
 * ## One live row per execution path (F7, amended 2026-09-28)
 *
 * Each branch opens the row it fills where it needs it — the Castellan's
 * narration, its Sanctum talk, the picked delver, the knock, the lead
 * delver — and at most one of them runs in any execution. The voices after
 * the lead are ordinary complete writes on its channel, written after the
 * lead's row is finished (the live-row law, W1).
 *
 * ## Pick who speaks (B15, owner D2a 2026-09-27)
 *
 * A turn that names a delver — the `core#pick` turn control — takes the `pick.picked` branch: that delver answers alone, in
 * their own row, streamed, with no planner, no beats and no keeper. The
 * same branch re-voices a delver's row on a regenerate or swipe.
 *
 * ## What folds
 *
 * The beats are the Sanctum row's BODY (the B5 Plan fold is retired, R8);
 * the delvers' rows carry only their lines; a narration keeps its
 * **Thinking**. The planner's and keeper's traces stay on the receipt.
 *
 * ## Sanctum talk steers the story, when the person says so (R13)
 *
 * The genre field `sanctumSteers` (on by default, owner F3/QB 2026-09-28).
 * On, the planner reads the **unplayed talk** — the Sanctum rows since the
 * story's newest generated line, only people's lines and the Castellan's
 * replies to them (`session-history@1` `unplayedOnly`) — and the Castellan's
 * **scratchpad**, each as its own labelled block (`sideTalk`, `scratchpad`).
 * Off, it reads neither. The narration reads the talk while the switch is
 * on, or whenever Narrate was pressed in the Sanctum (`input.channel`).
 * The delvers and the keeper never read either. The Castellan rewrites its
 * scratchpad after each Sanctum reply (see `sanctumBranch`).
 *
 * ## The party knocks
 *
 * When the planner says the party is walking into a room nothing describes,
 * the turn **halts** and the Castellan asks the master to describe it instead
 * of playing a room nobody built. That is the U5d form machinery pointed at a
 * person rather than at a character: a `choices` block addressed to `owner`,
 * carried by the Castellan's question row on `main` (no beats, no voices, no
 * keeper — nothing was played), whose one option, *Describe <room>…*, fires
 * `core:spec/lair-room-answer`.
 *
 * **The knock asks for a description** (R9, owner rulings 2 + 6,
 * 2026-09-28). The option's press opens the collect modal: typed text is the
 * room, saved verbatim with no review (the master's own words); an empty
 * answer is the Castellan's draft, which the master edits at
 * `create-lore-entry`'s review gate before it lands. A draft **rejected** at
 * review re-opens the knock — a core rule in the app's review gate: an answer
 * rejected at review that wrote nothing is no answer. See `lairActions.ts`.
 *
 * Writing a lore entry is a `world` effect (R-15 *The line*) and
 * `worldBlockFunctions` refuses any block that names a `world` action —
 * **unless the block is addressed to the owner** (L1, ruled 2026-09-17),
 * which this one is, because the dungeon's master is the only person a
 * question about the dungeon could be put to.
 *
 * **Already described, no knock** (R7; R9, owner QC 2026-09-28): a room the
 * lorebook answers to, or one the master (or the Castellan) described in
 * prose — in the story on `main`, or formally in the Sanctum — is an open
 * door. The prose check reads both channels (`exitProse`, the union), and
 * the paragraph it found reaches the voices as `{{locationPassage}}`.
 *
 * ## Whether a room is new is the planner's guess, checked
 *
 * `unknownExit` is a field the planner fills; `undescribed-name@1` then
 * checks it against the book and recent prose (R7), so a wrong guess costs
 * nothing when the room is described, and one question when it is not.
 */
/** @internal */
export declare const LAIR_CREATE_SPEC_ID = "core:spec/lair-create";
/** @internal */
export declare const LAIR_CREATE_VERSION = "1.0.0";
/**
 * The genre's required member (24 §3): what happens when a Lair session is
 * created.
 *
 * **The dungeon welcomes nobody, but its steward welcomes its master** (R6,
 * owner F1 2026-09-28). The cards' greetings are off — the party are delvers
 * who have not arrived yet — so `collect` and `seed` still write nothing,
 * as the guide's do. Then the Castellan's declared greeting
 * (`EnvoyDecl.greeting`), read through `core:query/envoy-greeting@1` and
 * interpolated for this session, is written on the Sanctum under its name —
 * only when it has text, which it lacks when the Castellan is not seated.
 *
 * No model call, deliberately: creation is a synchronous action a person is
 * waiting on (see `adventure-create` for the argument at length). The
 * welcome is declared, so it is instant, translatable and reviewable; the
 * Castellan's first *reply* is where it tailors itself to the dungeon.
 * @internal
 */
export declare const lairCreateSpec: () => import("@serene-pub/sdk").SpecDocument;
/** @internal */
export declare const LAIR_RESPOND_SPEC_ID = "core:spec/lair-respond";
/** @internal */
export declare const LAIR_RESPOND_VERSION = "1.0.0";
/**
 * What the planner answers with.
 *
 * Adventure's schema with the sky taken out and the door put in. Every
 * property is required and every one is a string, an array or an object of
 * those, because the llama.cpp family compiles this to a GBNF grammar and
 * refuses anything outside that set rather than loosening it — see
 * `adventure.ts` for the full argument.
 *
 * `unknownExit` and `knockQuestion` are the halt: the first is the predicate
 * the `turn` junction reads, the second is what the master is asked. Both are
 * written on every turn, most of them empty, because a schema this strict has
 * no optional properties to offer.
 * @internal
 */
export declare const LAIR_PLAN_SCHEMA: {
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
         * The name the party is heading for that the dungeon does not hold an
         * entry for. Empty on every ordinary turn — which is most of them.
         */
        readonly unknownExit: {
            readonly type: 'string';
        };
        /** How the Castellan puts that to the dungeon's master. Empty with it. */
        readonly knockQuestion: {
            readonly type: 'string';
        };
        /**
         * Where this happens. One hint rather than Adventure's three: a
         * dungeon has no time of day and no weather, and a genre that asked
         * for them would teach its planner to plan a sky.
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
    readonly required: readonly ['beats', 'speakers', 'unknownExit', 'knockQuestion', 'worldHints'];
    readonly additionalProperties: false;
};
/**
 * What the state-keeper answers with — Adventure's two lists over this genre's
 * vocabulary.
 *
 * ⚠ `direction` and `whisper` are **not** in `TRACKED_SLOTS`, and their
 * absence is the point: they hold what the dungeon's master told the narrator
 * and the cast, and a keeper that could rewrite them would be a model editing
 * its own instructions between two turns.
 * @internal
 */
export declare const LAIR_KEEPER_SCHEMA: {
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
/**
 * What the scratchpad rewrite answers with (R13): the whole scratchpad,
 * rewritten. One required string, for the grammar-compiling families — see
 * `LAIR_PLAN_SCHEMA`.
 * @internal
 */
export declare const LAIR_SCRATCHPAD_SCHEMA: {
    readonly type: 'object';
    readonly properties: {
        readonly scratchpad: {
            readonly type: 'string';
        };
    };
    readonly required: readonly ['scratchpad'];
    readonly additionalProperties: false;
};
/** @internal */
export declare const lairRespondSpec: () => import("@serene-pub/sdk").SpecDocument;
//# sourceMappingURL=lair.d.ts.map